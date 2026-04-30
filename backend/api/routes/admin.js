// Admin API router - ADMIN_PANEL.md F2-F9.
//
// Middleware lanc minden mutalo endpointon:
//   adminLimiterChain -> parseAdminToken -> [requireSuperAdmin?] ->
//     express.json() -> requireReasonOnMutate(action) -> auditContext ->
//     auditFlush -> handler
//
// Read-only endpointokon a requireReasonOnMutate kihagyhato (a middleware maga is
// kihagyja non-mutating method-okra, de az express.json() sem szukseges).

const express = require('express');
const sql = require('../../sql/sql_funtions.js');
const adminRepo = require('../../sql/adminRepo.js');
const { notificationService } = require('../../services.js');

const authRoutes = require('../admin/authRoutes.js');
const superAdminRoutes = require('../admin/superAdminRoutes.js');
const {
    parseAdminToken,
    requireSuperAdmin,
    requireReasonOnMutate,
    auditContext
} = require('../admin/middleware.js');
const { auditFlush } = require('../admin/auditService.js');
const { adminLimiterChain } = require('../admin/adminRateLimiter.js');
const { ADMIN_PERMISSIONS, ADMIN_ERROR_CODES } = require('../admin/constants.js');

const router = express.Router();

// 1. Auth sub-router (NINCS parseAdminToken a router szintjen, mert az elevate
//    epp ezt kell hogy elkerulje).
router.use('/auth', authRoutes);

// 2. Super-admin sub-router (router-szinten parseAdminToken+requireSuperAdmin).
router.use('/admins', superAdminRoutes);

// 3. Test endpoint (csak fejlesztoi modban).
if (process.env.NODE_ENV !== 'production') {
    router.get('/test', adminLimiterChain, parseAdminToken, (request, response) => {
        return response.status(200).json({
            success: true,
            message: 'Admin teszt vegpont mukodik.',
            data: {
                userId: request.adminAuth?.userId,
                username: request.adminAuth?.username,
                isSuperAdmin: request.adminAuth?.isSuperAdmin
            }
        });
    });
}

// =====================================================================
// CSV EXPORT - /export-users
// Auditolt info-szintu muvelet, reason opcionalis (read-only).
// =====================================================================

function escapeCsvValue(value) {
    const normalized = value === null || value === undefined ? '' : String(value);
    return `"${normalized.replace(/"/g, '""')}"`;
}

router.get(
    '/export-users',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let errorPayload = null;
        let csvBody = null;
        try {
            const users = await sql.getAllUsers();
            const headers = [
                'id', 'username', 'email', 'role', 'profile_image',
                'elo', 'elo_MM', 'elo_bullet',
                'is_banned', 'banned_until', 'last_active', 'created_at',
                'wins', 'losses', 'draws', 'total_abilities', 'win_rate_percent', 'last_ip'
            ];
            const rows = [headers.join(',')];
            for (const user of users || []) {
                rows.push([
                    user.id, user.username, user.email, user.role, user.profile_image,
                    user.elo, user.elo_MM, user.elo_bullet,
                    user.is_banned, user.banned_until, user.last_active, user.created_at,
                    user.wins, user.losses, user.draws,
                    user.total_abilities, user.win_rate_percent, user.last_ip
                ].map(escapeCsvValue).join(','));
            }
            csvBody = `﻿${rows.join('\n')}`;

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_EXPORT;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'users_export';
            response.locals.adminAudit.targetLabel = `${users?.length || 0} sor`;
            response.locals.adminAudit.success = true;
        } catch (error) {
            console.error('Admin export-users hiba:', error.message);
            statusCode = 500;
            errorPayload = { success: false, message: 'Szerverhiba a felhasznalok exportalasa soran.' };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_EXPORT;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'EXPORT_FAILED';
        }

        let result;
        if (errorPayload) {
            result = response.status(statusCode).json(errorPayload);
        } else {
            const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`;
            response.setHeader('Content-Type', 'text/csv; charset=utf-8');
            response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            result = response.status(statusCode).send(csvBody);
        }
        return result;
    }
);

// =====================================================================
// NOTIFICATION SEND - /notifications/send
// Reason kotelezo. broadcast (audience='global') -> severity critical.
// =====================================================================

function notificationActionResolver(request) {
    const audience = String(request.body?.audience || '').toLowerCase();
    let action = ADMIN_PERMISSIONS.NOTIFICATIONS_SEND;
    if (audience === 'global') {
        action = ADMIN_PERMISSIONS.NOTIFICATIONS_BROADCAST;
    }
    return action;
}

router.post(
    '/notifications/send',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(notificationActionResolver),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba az ertesites kuldese soran.', data: null };
        try {
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            const body = request.body || {};
            const audienceRaw = String(body.audience || '').trim().toLowerCase();
            const allowedAudiences = new Set(['user', 'multi', 'global', 'role']);
            if (!allowedAudiences.has(audienceRaw)) {
                statusCode = 400;
                throw new Error('Ervenytelen audience ertek.');
            }

            const type = String(body.type || '').trim();
            const title = String(body.title || '').trim();
            const message = String(body.message || '').trim();
            if (!type || !title || !message) {
                statusCode = 400;
                throw new Error('A type, title es message mezok kotelezoek.');
            }

            const severity = ['info', 'success', 'warning', 'error'].includes(body.severity) ? body.severity : 'info';
            const userPayload = body.payload && typeof body.payload === 'object' ? body.payload : null;

            const baseNotification = {
                type, title, message, severity,
                payload: userPayload, senderUserId: adminUserId
            };

            let resolvedNotification = null;
            let targetSummary = null;

            if (audienceRaw === 'user') {
                let resolvedUserId = Number(body.targetUserId) || 0;
                if (!resolvedUserId && body.targetUsername) {
                    const found = await sql.findUserByUsernameForAdmin(body.targetUsername);
                    resolvedUserId = found?.id || 0;
                    if (!resolvedUserId) {
                        statusCode = 404;
                        throw new Error('A megadott felhasznalo nem talalhato.');
                    }
                }
                if (!resolvedUserId) {
                    statusCode = 400;
                    throw new Error('user audience eseten targetUserId vagy targetUsername kotelezo.');
                }
                resolvedNotification = { ...baseNotification, audience: 'user', targetUserId: resolvedUserId };
                targetSummary = { type: 'user', id: resolvedUserId };
            } else if (audienceRaw === 'multi') {
                const ids = new Set();
                if (Array.isArray(body.targetUserIds)) {
                    body.targetUserIds.forEach((id) => {
                        const numericId = Number(id) || 0;
                        if (numericId) {
                            ids.add(numericId);
                        }
                    });
                }
                if (Array.isArray(body.targetUsernames)) {
                    for (const username of body.targetUsernames) {
                        const found = await sql.findUserByUsernameForAdmin(username);
                        if (found?.id) {
                            ids.add(found.id);
                        }
                    }
                }
                if (!ids.size) {
                    statusCode = 400;
                    throw new Error('multi audience eseten legalabb egy ervenyes targetUserIds/targetUsernames elem kotelezo.');
                }
                resolvedNotification = { ...baseNotification, audience: 'multi', targetUserIds: [...ids] };
                targetSummary = { type: 'users', count: ids.size };
            } else if (audienceRaw === 'role') {
                const role = String(body.targetRole || '').trim();
                if (!['player', 'admin'].includes(role)) {
                    statusCode = 400;
                    throw new Error('role audience eseten targetRole ertek kotelezo (player|admin).');
                }
                resolvedNotification = { ...baseNotification, audience: 'role', targetRole: role };
                targetSummary = { type: 'role', value: role };
            } else {
                resolvedNotification = { ...baseNotification, audience: 'global' };
                targetSummary = { type: 'global' };
            }

            const socketHub = request.app?.locals?.socketHub;
            const sendResult = await notificationService.send(socketHub, resolvedNotification);
            if (sendResult.errors?.length && !sendResult.deliveredTo.length) {
                statusCode = 500;
                throw new Error(sendResult.errors[0].error || 'Az ertesites kuldese sikertelen.');
            }

            response.locals.adminAudit.action = audienceRaw === 'global'
                ? ADMIN_PERMISSIONS.NOTIFICATIONS_BROADCAST
                : ADMIN_PERMISSIONS.NOTIFICATIONS_SEND;
            response.locals.adminAudit.severity = audienceRaw === 'global' ? 'critical' : 'info';
            response.locals.adminAudit.targetType = 'notification';
            response.locals.adminAudit.targetLabel = title;
            response.locals.adminAudit.afterState = {
                audience: audienceRaw,
                target: targetSummary,
                deliveredTo: sendResult.deliveredTo.length,
                type, title, severity
            };
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: `Ertesites elkuldve ${sendResult.deliveredTo.length} felhasznalonak.`,
                data: {
                    deliveredTo: sendResult.deliveredTo.length,
                    errors: sendResult.errors,
                    notification: sendResult.saved
                }
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message, data: null };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'NOTIFICATION_SEND_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// =====================================================================
// PROFILE IMAGE REVIEW
// pending list (read), approve (reason opcionalis), reject (reason kotelezo).
// =====================================================================

router.get(
    '/profile-images/pending',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Szerverhiba a fuggo profilkepek lekerdezese soran.' };
        try {
            const pending = await sql.getPendingProfileImages();
            const data = (pending || []).map((row) => ({
                uploadId: row.id,
                userId: row.user_id,
                username: row.username,
                filename: row.filename,
                currentImage: row.current_image,
                uploadTime: row.upload_time,
                status: row.status
            }));
            payload = {
                success: true,
                data,
                message: data.length ? `${data.length} fuggo profilkep.` : 'Nincs fuggo profilkep.'
            };
            response.locals.adminAudit.skip = true; // read-only listazas, ne logoljuk minden lekerest
        } catch (error) {
            console.error('Admin pending profile images hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

// Approve: reason OPCIONALIS (nem kotelezo a requireReasonOnMutate, ezert kihagyjuk).
// Helyette manualisan, ha jott reason, attesszuk audit reasonra; egyebkent default.
router.post(
    '/profile-images/:uploadId/approve',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a profilkep jovahagyasa soran.' };
        try {
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            const uploadId = Number(request.params?.uploadId) || 0;
            if (!uploadId) {
                statusCode = 400;
                throw new Error('Ervenytelen feltoltes azonosito.');
            }

            // Reason opcionalis approve-nal; manualisan rakjuk az auditra
            request.adminReason = String(request.body?.reason || '').trim().slice(0, 1000) || 'profilkep jovahagyas';

            await sql.approveProfileImage(uploadId, adminUserId);
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'profile_image';
            response.locals.adminAudit.targetId = uploadId;
            response.locals.adminAudit.afterState = { status: 'approved' };
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: 'A profilkep jovahagyva. A kep globalisan lathatova valt.',
                data: { uploadId, status: 'approved' }
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            const messageLower = String(error?.message || '').toLowerCase();
            if (messageLower.includes('nem talalhato') || messageLower.includes('nem található')) {
                statusCode = 404;
            } else if (messageLower.includes('csak fuggo') || messageLower.includes('csak függő')) {
                statusCode = 409;
            }
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'PROFILE_IMAGE_APPROVE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// Reject: reason KOTELEZO (requireReasonOnMutate).
router.post(
    '/profile-images/:uploadId/reject',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a profilkep elutasitasa soran.' };
        try {
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            const uploadId = Number(request.params?.uploadId) || 0;
            if (!uploadId) {
                statusCode = 400;
                throw new Error('Ervenytelen feltoltes azonosito.');
            }

            const reviewNoteRaw = typeof request.body?.reviewNote === 'string' ? request.body.reviewNote.trim() : '';
            const reviewNote = reviewNoteRaw ? reviewNoteRaw.slice(0, 500) : (request.adminReason || null);

            await sql.rejectProfileImage(uploadId, adminUserId, reviewNote);
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'profile_image';
            response.locals.adminAudit.targetId = uploadId;
            response.locals.adminAudit.afterState = { status: 'rejected', reviewNote };
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: 'A profilkep elutasitva. A publikus kep visszaallt az alapertelmezettre.',
                data: { uploadId, status: 'rejected' }
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            const messageLower = String(error?.message || '').toLowerCase();
            if (messageLower.includes('nem található') || messageLower.includes('nem talalhato')) {
                statusCode = 404;
            }
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'PROFILE_IMAGE_REJECT_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// =====================================================================
// F8 READ-ONLY API - audit/search, audit/export, alerts/recent, users/list, stats/snapshot
// =====================================================================

router.get(
    '/audit/search',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Belso hiba az audit kereses soran.' };
        try {
            const filters = {
                actorUserId: Number(request.query.actorUserId) || null,
                action: request.query.action || null,
                severity: request.query.severity || null,
                targetType: request.query.targetType || null,
                targetId: Number(request.query.targetId) || null,
                requestId: request.query.requestId || null,
                fromDate: request.query.fromDate || null,
                toDate: request.query.toDate || null,
                successOnly: request.query.successOnly === 'true',
                failureOnly: request.query.failureOnly === 'true',
                limit: Number(request.query.limit) || 100,
                offset: Number(request.query.offset) || 0
            };
            const rows = await adminRepo.searchAuditEntries(filters);
            payload = {
                success: true,
                message: `${rows.length} bejegyzes.`,
                data: rows.map((row) => ({
                    eventId: row.id,
                    occurredAt: row.occurred_at,
                    actor: { id: row.actor_user_id, username: row.actor_username },
                    action: row.action,
                    severity: row.severity,
                    target: row.target_type ? {
                        type: row.target_type,
                        id: row.target_id,
                        key: row.target_key,
                        label: row.target_label
                    } : null,
                    reason: row.reason,
                    beforeState: row.before_state,
                    afterState: row.after_state,
                    success: Boolean(row.success),
                    errorCode: row.error_code,
                    ip: row.ip_address,
                    requestId: row.request_id
                }))
            };
            response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/audit/search hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

router.get(
    '/audit/export',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let errorPayload = null;
        let csvBody = null;
        try {
            const filters = {
                actorUserId: Number(request.query.actorUserId) || null,
                action: request.query.action || null,
                severity: request.query.severity || null,
                fromDate: request.query.fromDate || null,
                toDate: request.query.toDate || null,
                limit: 500
            };
            const rows = await adminRepo.searchAuditEntries(filters);
            const headers = [
                'eventId', 'occurredAt', 'actorId', 'actorUsername',
                'action', 'severity', 'targetType', 'targetId', 'targetLabel',
                'reason', 'success', 'errorCode', 'ip', 'requestId'
            ];
            const lines = [headers.join(',')];
            for (const row of rows) {
                lines.push([
                    row.id, row.occurred_at, row.actor_user_id, row.actor_username,
                    row.action, row.severity, row.target_type, row.target_id, row.target_label,
                    row.reason, row.success, row.error_code, row.ip_address, row.request_id
                ].map(escapeCsvValue).join(','));
            }
            csvBody = `﻿${lines.join('\n')}`;

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.AUDIT_EXPORT;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'audit_export';
            response.locals.adminAudit.targetLabel = `${rows.length} sor`;
            response.locals.adminAudit.success = true;
        } catch (error) {
            console.error('admin/audit/export hiba:', error.message);
            statusCode = 500;
            errorPayload = { success: false, message: 'Belso hiba az audit export soran.' };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.AUDIT_EXPORT;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'AUDIT_EXPORT_FAILED';
        }

        let result;
        if (errorPayload) {
            result = response.status(statusCode).json(errorPayload);
        } else {
            const filename = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
            response.setHeader('Content-Type', 'text/csv; charset=utf-8');
            response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            result = response.status(statusCode).send(csvBody);
        }
        return result;
    }
);

router.get(
    '/alerts/recent',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Belso hiba a riasztasok lekerdezese soran.' };
        try {
            const limit = Number(request.query.limit) || 50;
            const rows = await adminRepo.getRecentAlerts(limit);
            payload = {
                success: true,
                message: `${rows.length} riasztas.`,
                data: rows.map((row) => ({
                    alertId: row.id,
                    kind: row.kind,
                    severity: row.severity,
                    userId: row.user_id,
                    ip: row.ip_address,
                    endpoint: row.endpoint,
                    detail: row.detail,
                    occurredAt: row.occurred_at
                }))
            };
            response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/alerts/recent hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

// Presence-snapshotbol egy lookup map: userId -> { online, tabCount, socketCount, lastSeenAt, currentPage }
function buildPresenceMap(socketHub) {
    const presenceMap = new Map();
    try {
        const snapshot = socketHub && typeof socketHub.getPresenceSnapshot === 'function'
            ? socketHub.getPresenceSnapshot()
            : null;
        const clients = Array.isArray(snapshot?.clients) ? snapshot.clients : [];
        for (const client of clients) {
            if (client?.userId) {
                const tabs = Array.isArray(client.tabs) ? client.tabs : [];
                const lastSeenTs = tabs.reduce((max, tab) => {
                    const ts = tab?.lastSeenAt ? new Date(tab.lastSeenAt).getTime() : 0;
                    return ts > max ? ts : max;
                }, client.lastSeenAt ? new Date(client.lastSeenAt).getTime() : 0);
                const primaryPage = tabs.length ? String(tabs[0]?.page || '') : '';
                presenceMap.set(Number(client.userId), {
                    online: true,
                    tabCount: tabs.length || Number(client.tabCount || 0),
                    socketCount: Number(client.socketCount || 0),
                    lastSeenAt: lastSeenTs ? new Date(lastSeenTs).toISOString() : (client.lastSeenAt || null),
                    currentPage: primaryPage,
                    pages: tabs.map((tab) => String(tab?.page || '')).filter(Boolean)
                });
            }
        }
    } catch (error) {
        console.warn('buildPresenceMap hiba:', error.message);
    }
    return presenceMap;
}

router.get(
    '/users/list',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Belso hiba a user lista lekerdezese soran.' };
        try {
            const users = await sql.getAllUsers();
            const socketHub = request.app?.locals?.socketHub;
            const presenceMap = buildPresenceMap(socketHub);
            payload = {
                success: true,
                message: `${(users || []).length} felhasznalo.`,
                data: (users || []).map((user) => {
                    const presence = presenceMap.get(Number(user.id)) || null;
                    return {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        emailVerified: Boolean(user.is_email_verified),
                        emailVerifiedAt: user.email_verified_at || null,
                        role: user.role,
                        profileImage: user.profile_image,
                        profileImageStatus: user.profile_image_status || null,
                        isBanned: Boolean(user.is_banned),
                        bannedUntil: user.banned_until,
                        elo: user.elo,
                        eloMM: user.elo_MM,
                        eloBullet: user.elo_bullet,
                        wins: user.wins,
                        losses: user.losses,
                        draws: user.draws,
                        winRate: Number(user.win_rate_percent || 0),
                        totalAbilities: Number(user.total_abilities || 0),
                        lastIp: user.last_ip || null,
                        lastActive: user.last_active,
                        createdAt: user.created_at,
                        online: Boolean(presence?.online),
                        presenceTabCount: presence?.tabCount || 0,
                        presenceSocketCount: presence?.socketCount || 0,
                        presenceLastSeenAt: presence?.lastSeenAt || null,
                        presenceCurrentPage: presence?.currentPage || null
                    };
                })
            };
            response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/users/list hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

// Egy konkret user biztonsagi naploja (a sajat profile oldalon latott /api/security/activity).
router.get(
    '/users/:id/security-activity',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Belso hiba a biztonsagi naplo lekerdezese soran.' };
        try {
            const userId = Number(request.params.id);
            const limit = Math.min(Math.max(Number(request.query.limit) || 150, 1), 500);
            if (!Number.isFinite(userId) || userId <= 0) {
                statusCode = 400;
                payload = { success: false, data: [], message: 'Ervenytelen userId.' };
            } else {
                const items = await sql.getUserSecurityActivity(userId, limit);
                payload = {
                    success: true,
                    message: `${(items || []).length} bejegyzes.`,
                    data: items || []
                };
                response.locals.adminAudit.skip = true;
            }
        } catch (error) {
            console.error('admin/users/:id/security-activity hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

// Egy konkret user reszletes presence-e (online tabok, lapok, last seen).
router.get(
    '/users/:id/presence',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: null, message: 'Belso hiba a presence lekerdezese soran.' };
        try {
            const userId = Number(request.params.id);
            if (!Number.isFinite(userId) || userId <= 0) {
                statusCode = 400;
                payload = { success: false, data: null, message: 'Ervenytelen userId.' };
            } else {
                const socketHub = request.app?.locals?.socketHub;
                const snapshot = socketHub && typeof socketHub.getPresenceSnapshot === 'function'
                    ? socketHub.getPresenceSnapshot()
                    : null;
                const clients = Array.isArray(snapshot?.clients) ? snapshot.clients : [];
                const record = clients.find((c) => Number(c?.userId) === userId) || null;
                payload = {
                    success: true,
                    data: record ? {
                        online: true,
                        userId: record.userId,
                        username: record.username,
                        role: record.role,
                        socketCount: Number(record.socketCount || 0),
                        tabCount: Number(record.tabCount || 0),
                        firstSeenAt: record.firstSeenAt || null,
                        lastSeenAt: record.lastSeenAt || null,
                        tabs: Array.isArray(record.tabs) ? record.tabs.map((tab) => ({
                            tabId: tab.tabId,
                            page: tab.page,
                            connectedAt: tab.connectedAt,
                            lastSeenAt: tab.lastSeenAt
                        })) : []
                    } : { online: false }
                };
                response.locals.adminAudit.skip = true;
            }
        } catch (error) {
            console.error('admin/users/:id/presence hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: null, message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

router.get(
    '/stats/snapshot',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: null, message: 'Belso hiba a stats snapshot soran.' };
        try {
            // Egy forras-igazsag: ugyanaz a payload, amit az admin:stats:tick kuld.
            const statsTickService = require('../admin/statsTickService.js');
            const socketHub = request.app?.locals?.socketHub;
            const tick = await statsTickService.computeTickPayload(socketHub);
            if (tick) {
                payload = { success: true, data: tick };
                response.locals.adminAudit.skip = true;
            } else {
                statusCode = 500;
                payload = { success: false, data: null, message: 'Stats tick nem szamithato.' };
            }
        } catch (error) {
            console.error('admin/stats/snapshot hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: null, message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

// ---------------------------------------------------------------------------
// /stats/activity — 24h ovrenkenti idosor a dashboard chart-jahoz.
// 5 dataset egy kozos, 24-elemu labels tomb mellett (hour bins).
// Egy forras-igazsag: a labels-t es a buckete-eket ugyanaz a hour-key alapjan
// alignaljuk; az SQL-bol jovo Map kulcsot a JS oldalon mappeljuk a labels-re,
// hogy a hianyzo orak 0-val jelenjenek meg (folytonos vonal).
// ---------------------------------------------------------------------------
function _formatBucketKey(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:00:00`;
}

function _buildHourLabels(now, hours) {
    const labels = [];
    const keys = [];
    const start = new Date(now.getTime() - (hours - 1) * 3600 * 1000);
    start.setMinutes(0, 0, 0);
    let cursor = new Date(start);
    let safety = 0;
    while (safety < hours) {
        keys.push(_formatBucketKey(cursor));
        labels.push(`${String(cursor.getHours()).padStart(2, '0')}:00`);
        cursor = new Date(cursor.getTime() + 3600 * 1000);
        safety += 1;
    }
    return { labels, keys };
}

function _alignBucketSeries(buckets, keys) {
    const map = new Map();
    (buckets || []).forEach((row) => {
        if (row && row.hour) {
            map.set(String(row.hour), Number(row.count) || 0);
        }
    });
    return keys.map((key) => map.get(key) || 0);
}

router.get(
    '/stats/activity',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        const HOURS = 24;
        let statusCode = 200;
        let payload = { success: false, data: null, message: 'Belso hiba az activity lekerdezesnel.' };
        try {
            const now = new Date();
            const { labels, keys } = _buildHourLabels(now, HOURS);
            const since = new Date(now.getTime() - HOURS * 3600 * 1000);

            const [logins, registrations, gamesStarted, auditEntries, alerts] = await Promise.all([
                adminRepo.getLoginsHourly(since).catch((err) => { console.warn('activity logins:', err.message); return []; }),
                adminRepo.getRegistrationsHourly(since).catch((err) => { console.warn('activity regs:', err.message); return []; }),
                adminRepo.getGamesStartedHourly(since).catch((err) => { console.warn('activity games:', err.message); return []; }),
                adminRepo.getAuditHourly(since).catch((err) => { console.warn('activity audit:', err.message); return []; }),
                adminRepo.getAlertsHourly(since).catch((err) => { console.warn('activity alerts:', err.message); return []; })
            ]);

            const datasets = {
                logins:        _alignBucketSeries(logins, keys),
                registrations: _alignBucketSeries(registrations, keys),
                gamesStarted:  _alignBucketSeries(gamesStarted, keys),
                auditEntries:  _alignBucketSeries(auditEntries, keys),
                alerts:        _alignBucketSeries(alerts, keys)
            };

            const totalRecords = Object.values(datasets).reduce(
                (acc, arr) => acc + arr.reduce((a, n) => a + n, 0),
                0
            );

            payload = {
                success: true,
                data: {
                    generatedAt: now.toISOString(),
                    hours: HOURS,
                    labels,
                    datasets,
                    totals: {
                        logins:        datasets.logins.reduce((a, n) => a + n, 0),
                        registrations: datasets.registrations.reduce((a, n) => a + n, 0),
                        gamesStarted:  datasets.gamesStarted.reduce((a, n) => a + n, 0),
                        auditEntries:  datasets.auditEntries.reduce((a, n) => a + n, 0),
                        alerts:        datasets.alerts.reduce((a, n) => a + n, 0),
                        records:       totalRecords
                    }
                }
            };
            response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/stats/activity hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: null, message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

module.exports = router;
