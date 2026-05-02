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
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const sql = require('../../sql/sql_funtions.js');
const adminRepo = require('../../sql/adminRepo.js');
const { passwordRegex } = require('../validation.js');

const authRoutes = require('../admin/authRoutes.js');
const superAdminRoutes = require('../admin/superAdminRoutes.js');
const {
    parseAdminToken,
    requireSuperAdmin,
    requireReasonOnMutate,
    auditContext
} = require('../admin/middleware.js');
const { auditFlush } = require('../admin/auditService.js');
const alertingService = require('../admin/alertingService.js');
const { adminLimiterChain } = require('../admin/adminRateLimiter.js');
const { ADMIN_PERMISSIONS, ADMIN_ERROR_CODES } = require('../admin/constants.js');
const { invalidateIpBlockCache } = require('../middleware/ipBlockGuard.js');
const networkClassifier = require('../admin/networkClassifier.js');

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

            const approveResult = await sql.approveProfileImage(uploadId, adminUserId);
            const ownerUserId = Number(approveResult?.userId) || 0;
            const ownerFilename = approveResult?.filename || null;
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'profile_image';
            response.locals.adminAudit.targetId = uploadId;
            response.locals.adminAudit.afterState = { status: 'approved' };
            response.locals.adminAudit.success = true;

            // Live broadcast a tobbi admin tabnak: a fuggo profilkep lista + dashboard tick frissuljon.
            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:profile-image:reviewed', {
                        uploadId,
                        status: 'approved',
                        reviewedByUserId: adminUserId,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('profile-image approve: broadcast hiba:', broadcastErr.message);
            }

            // Real-time push az erintett felhasznalo nyitott tabjaira: a profil oldal
            // image status pill + avatar azonnal frissuljon (fetchSessionInfo re-fetch).
            try {
                const socketHub = request.app?.locals?.socketHub;
                if (ownerUserId && socketHub && typeof socketHub.emitToUser === 'function') {
                    socketHub.emitToUser(ownerUserId, 'user:profile:imageReviewed', {
                        uploadId,
                        status: 'approved',
                        filename: ownerFilename,
                        at: new Date().toISOString()
                    });
                }
            } catch (pushErr) {
                console.warn('profile-image approve: user push hiba:', pushErr.message);
            }

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

            const rejectResult = await sql.rejectProfileImage(uploadId, adminUserId, reviewNote);
            const ownerUserId = Number(rejectResult?.userId) || 0;
            const ownerFilename = rejectResult?.filename || null;
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'profile_image';
            response.locals.adminAudit.targetId = uploadId;
            response.locals.adminAudit.afterState = { status: 'rejected', reviewNote };
            response.locals.adminAudit.success = true;

            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:profile-image:reviewed', {
                        uploadId,
                        status: 'rejected',
                        reviewedByUserId: adminUserId,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('profile-image reject: broadcast hiba:', broadcastErr.message);
            }

            try {
                const socketHub = request.app?.locals?.socketHub;
                if (ownerUserId && socketHub && typeof socketHub.emitToUser === 'function') {
                    socketHub.emitToUser(ownerUserId, 'user:profile:imageReviewed', {
                        uploadId,
                        status: 'rejected',
                        filename: ownerFilename,
                        reviewNote,
                        at: new Date().toISOString()
                    });
                }
            } catch (pushErr) {
                console.warn('profile-image reject: user push hiba:', pushErr.message);
            }

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
// CHAT MODERATION
// flagged list = is_body_masked TRUE uzenetek; allow = unmask, delete = fizikai torles.
// =====================================================================

router.get(
    '/chat/flagged',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Szerverhiba a chat moderacios lista lekerdezese soran.' };
        try {
            const limit = Math.min(Math.max(Number(request.query?.limit) || 50, 1), 200);
            const messages = await sql.getFlaggedChatMessages(limit);
            payload = {
                success: true,
                data: messages,
                message: messages.length ? `${messages.length} jelolt uzenet.` : 'Nincs jelolt uzenet.'
            };
            response.locals.adminAudit.skip = true; // read-only listazas, ne logoljuk minden lekerest
        } catch (error) {
            console.error('Admin flagged chat lista hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

// Allow: a fuggo felhasznaloi bejelenteseket lezarja 'allowed' statusszal.
// FONTOS: ez NEM veszi le a maszkolast (is_body_masked) — a profanity-filter blocklist
// hard rule, az admin sem birálhatja felul. Ha egy uzenet csak auto-flagged es nincs
// pending bejelentes rajta, a hivas 409-cel hibazik.
// Reason kotelezo (chat.view_any normal action, min 10 char).
router.post(
    '/chat/messages/:messageId/allow',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.CHAT_VIEW_ANY),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a bejelentes lezarasa soran.' };
        try {
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            const messageId = Number(request.params?.messageId) || 0;
            if (!messageId) {
                statusCode = 400;
                throw new Error('Ervenytelen uzenet azonosito.');
            }

            const result = await sql.dismissReportsForMessage(messageId, adminUserId, request.adminReason);

            // Spam-protection: a bejelentoke(t) 5 oraig kitiltjuk az ujabb bejelentesektol.
            // (Ha az admin "Engedelyezes"-t hasznalt = a bejelentes nem volt valid.)
            let muteResult = { affected: 0, until: null };
            if (Array.isArray(result.reporterUserIds) && result.reporterUserIds.length) {
                try {
                    muteResult = await sql.setChatReportMuteForUsers(result.reporterUserIds, sql.CHAT_REPORT_MUTE_HOURS);
                } catch (muteErr) {
                    console.warn('chat allow: report mute set hiba:', muteErr.message);
                }
            }

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.CHAT_VIEW_ANY;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'chat_message';
            response.locals.adminAudit.targetId = messageId;
            response.locals.adminAudit.afterState = {
                reportsDismissed: result.dismissedReports,
                mutedReporterCount: muteResult.affected,
                muteUntil: muteResult.until
            };
            response.locals.adminAudit.success = true;

            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:chat:reviewed', {
                        messageId,
                        action: 'allowed',
                        reviewedByUserId: adminUserId,
                        mutedReporterCount: muteResult.affected,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('chat allow: admin broadcast hiba:', broadcastErr.message);
            }

            // Az erintett bejelentoknek elkuldjuk a notification-szeru push-t is, hogy
            // ha eppen nyitva van a chat, kapjanak feedbacket.
            try {
                const socketHub = request.app?.locals?.socketHub;
                if (socketHub && typeof socketHub.emitToUser === 'function' && Array.isArray(result.reporterUserIds)) {
                    for (const uid of result.reporterUserIds) {
                        socketHub.emitToUser(uid, 'chat:report:muted', {
                            messageId,
                            muteUntil: muteResult.until,
                            hours: sql.CHAT_REPORT_MUTE_HOURS
                        });
                    }
                }
            } catch (pushErr) {
                console.warn('chat allow: reporter push hiba:', pushErr.message);
            }

            payload = {
                success: true,
                message: `${result.dismissedReports} bejelentes lezarva (allowed). A maszkolas (ha van) erintetlen marad. ${muteResult.affected} bejelento ${sql.CHAT_REPORT_MUTE_HOURS} oras report-mute-ot kapott.`,
                data: {
                    messageId,
                    action: 'allowed',
                    dismissedReports: result.dismissedReports,
                    mutedReporterCount: muteResult.affected,
                    muteUntil: muteResult.until
                }
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            const messageLower = String(error?.message || '').toLowerCase();
            if (messageLower.includes('nem talalhato') || messageLower.includes('nem található')) {
                statusCode = 404;
            } else if (messageLower.includes('nincs feldolgozhato')) {
                statusCode = 409;
            }
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.CHAT_VIEW_ANY;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'CHAT_ALLOW_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// Delete: reason kotelezo (chat.delete kritikus action, min 30 char).
router.post(
    '/chat/messages/:messageId/delete',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba az uzenet torlese soran.' };
        try {
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            const messageId = Number(request.params?.messageId) || 0;
            if (!messageId) {
                statusCode = 400;
                throw new Error('Ervenytelen uzenet azonosito.');
            }

            const result = await sql.deleteChatMessageById(messageId, adminUserId, request.adminReason);

            // 3-csapas auto-ban: az admin altal torolt uzenet kuldoje strike-ot kap.
            // UNIQUE(message_id) miatt ha mar volt strike (auto-mask), nem duplikalja.
            // A torles erdeklodo eset: a uzenet NEM volt auto-flagged, de admin tragarnak
            // talalta es torolte → strike + esetleges ban.
            let strikeOutcome = null;
            let ipEscalationOutcome = null;
            try {
                if (result?.senderId) {
                    strikeOutcome = await sql.recordProfanityStrikeAndMaybeBan(
                        result.senderId,
                        messageId,
                        'admin_delete'
                    );
                    if (strikeOutcome?.banApplied) {
                        // Account-ban event + esetleges IP-ban escalation. A user IP-jet
                        // a users.last_login_ip-bol vesszuk (offline user-t is bantudunk).
                        try {
                            const senderIp = await sql.getUserLastLoginIp(result.senderId);
                            ipEscalationOutcome = await sql.recordAccountBanEvent({
                                userId: result.senderId,
                                ipAddress: senderIp,
                                source: 'profanity_strike',
                                reason: strikeOutcome.banReason
                            });
                        } catch (escErr) {
                            console.warn('chat delete: account-ban event hiba:', escErr.message);
                        }

                        const adminSocketHub = request.app?.locals?.adminSocketHub;
                        if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                            adminSocketHub.broadcastAdmin('admin:chat:auto-ban', {
                                userId: result.senderId,
                                strikeCount: strikeOutcome.strikeCount,
                                banType: strikeOutcome.banType,
                                bannedUntil: strikeOutcome.bannedUntil,
                                reason: strikeOutcome.banReason,
                                source: 'admin_delete',
                                triggeredByAdminId: adminUserId,
                                ipBlock: ipEscalationOutcome && ipEscalationOutcome.triggeredIpBlock ? {
                                    ipAddress: ipEscalationOutcome.ipAddress,
                                    blockType: ipEscalationOutcome.blockType,
                                    blockedUntil: ipEscalationOutcome.blockedUntil
                                } : null,
                                at: new Date().toISOString()
                            });
                        }
                        const socketHub = request.app?.locals?.socketHub;
                        if (socketHub && typeof socketHub.disconnectUser === 'function') {
                            await socketHub.disconnectUser(result.senderId, 'profanity_strike_ban');
                        }
                    }
                }
            } catch (strikeErr) {
                console.warn('chat delete: profanity strike hiba:', strikeErr.message);
            }

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'chat_message';
            response.locals.adminAudit.targetId = messageId;
            response.locals.adminAudit.afterState = { deleted: true };
            response.locals.adminAudit.success = true;

            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:chat:reviewed', {
                        messageId,
                        action: 'deleted',
                        reviewedByUserId: adminUserId,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('chat delete: admin broadcast hiba:', broadcastErr.message);
            }

            try {
                const socketHub = request.app?.locals?.socketHub;
                if (socketHub && typeof socketHub.emitToUser === 'function' && Array.isArray(result.participantUserIds)) {
                    for (const uid of result.participantUserIds) {
                        socketHub.emitToUser(uid, 'chat:message:deleted', {
                            messageId,
                            conversationId: result.conversationId
                        });
                    }
                }
            } catch (pushErr) {
                console.warn('chat delete: user push hiba:', pushErr.message);
            }

            const strikeMsgPart = strikeOutcome?.banApplied
                ? ` Auto-ban alkalmazva: ${strikeOutcome.strikeCount}. csapas (${strikeOutcome.banType}).`
                : (strikeOutcome?.strikeRecorded
                    ? ` Strike rogzitve: ${strikeOutcome.strikeCount}. csapas.`
                    : '');
            payload = {
                success: true,
                message: `Az uzenet veglegesen torolve.${strikeMsgPart}`,
                data: { messageId, action: 'deleted', strike: strikeOutcome || null }
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            const messageLower = String(error?.message || '').toLowerCase();
            if (messageLower.includes('nem talalhato') || messageLower.includes('nem található')) {
                statusCode = 404;
            }
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'CHAT_DELETE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// Admin: szavakat hozzaad a dinamikus chat blocklist-hoz. A request body egy `words`
// tomb (vagy egyetlen szo) — opcionalisan egy `sourceMessageId` (a forras-uzenet id-je).
// reason kotelezo (chat.delete kritikus action min. 30 char).
router.post(
    '/chat/blocklist/add',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a blocklist bovites soran.' };
        try {
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            const wordsInput = request.body?.words;
            const sourceMessageId = Number(request.body?.sourceMessageId) || null;

            const wordsArray = Array.isArray(wordsInput)
                ? wordsInput
                : (typeof wordsInput === 'string' ? [wordsInput] : []);

            if (!wordsArray.length) {
                statusCode = 400;
                throw new Error('Legalabb egy szot meg kell adni.');
            }

            const result = await sql.addDynamicBlockedWords(wordsArray, adminUserId, sourceMessageId);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'chat_blocklist';
            response.locals.adminAudit.targetId = sourceMessageId;
            response.locals.adminAudit.afterState = { added: result.added, words: result.words };
            response.locals.adminAudit.success = true;

            // Live broadcast a tobbi admin tabnak — ha nyitva van a chat moderalas
            // panel, jelezhetjuk hogy a blocklist bovult.
            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:chat:blocklist-updated', {
                        added: result.added,
                        skipped: result.skipped,
                        addedByUserId: adminUserId,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('chat blocklist add: broadcast hiba:', broadcastErr.message);
            }

            payload = {
                success: true,
                message: `${result.added} szo hozzaadva (${result.skipped} mar letezett vagy kihagyva).`,
                data: result
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'CHAT_BLOCKLIST_ADD_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// Admin profil kép kezelés (feltöltés és eltávolítás - azonnal approved)
const ADMIN_PROFILE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_ADMIN_PROFILE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const adminProfileImageStorage = multer.diskStorage({
    destination: (request, file, callback) => {
        callback(null, path.join(__dirname, '../../profile_pictures'));
    },
    filename: (request, file, callback) => {
        const sanitizedName = String(file.originalname || 'profile-image')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .toLowerCase();
        callback(null, Date.now() + '-' + sanitizedName);
    }
});

const adminProfileImageUpload = multer({
    storage: adminProfileImageStorage,
    limits: { fileSize: ADMIN_PROFILE_IMAGE_MAX_BYTES },
    fileFilter: (request, file, callback) => {
        if (!ALLOWED_ADMIN_PROFILE_IMAGE_MIME_TYPES.has(file.mimetype)) {
            callback(new Error('Nem támogatott képformátum. Csak JPG, PNG és WEBP engedélyezett.'));
        } else {
            callback(null, true);
        }
    }
});

// POST /admin/users/:id/profile-image - admin képfeltöltés (azonnal approved)
router.post(
    '/users/:id/profile-image',
    adminLimiterChain,
    parseAdminToken,
    // Multer-t a reason-check ELŐTT futtatjuk, kulonben req.body meg ures
    // (multipart/form-data eseten a body-t multer parse-olja).
    (request, response, next) => {
        adminProfileImageUpload.single('image')(request, response, (uploadError) => {
            if (uploadError) {
                return response.status(400).json({ success: false, message: uploadError.message || 'Képfeltöltés sikertelen.' });
            }
            next();
        });
    },
    requireReasonOnMutate(ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a profilkép feltöltése során.' };
        let uploadedPath = null;
        try {
            const userId = Number(request.params?.id) || 0;
            if (!userId) {
                statusCode = 400;
                throw new Error('Érvénytelen felhasználó azonosító.');
            }

            if (!request.file) {
                statusCode = 400;
                throw new Error('A kép kiválasztása kötelező.');
            }

            if (request.file.size > ADMIN_PROFILE_IMAGE_MAX_BYTES) {
                statusCode = 400;
                throw new Error('A kép mérete legfeljebb 3 MB lehet.');
            }

            uploadedPath = `/profile_pictures/${request.file.filename}`;
            
            // Globális context az adminUserId-hez az SQL függvényen belül
            global._currentAdminUserId = request.adminAuth?.userId || 0;
            const uploadResult = await sql.uploadProfileImageAdminApproved(userId, uploadedPath);
            delete global._currentAdminUserId;

            // Értesítés küldése az usernek
            try {
                await sql.insertNotification({
                    type: 'profile_image_updated',
                    audience: 'user',
                    targetUserId: userId,
                    title: 'Profilkép frissítve',
                    message: 'Az adminisztrátor frissítette a profilképedet.',
                    severity: 'info'
                });
            } catch (notifyErr) {
                console.warn('Értesítés küldése sikertelen:', notifyErr.message);
            }

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'profile_image';
            response.locals.adminAudit.targetId = uploadResult.uploadId;
            response.locals.adminAudit.afterState = { status: 'approved', profileImage: uploadedPath };
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: 'Profilkép sikeresen feltöltve és jóváhagyva.',
                data: {
                    uploadId: uploadResult.uploadId,
                    profileImage: uploadResult.profileImage,
                    profileImageStatus: uploadResult.status
                }
            };
        } catch (error) {
            if (uploadedPath) {
                try {
                    const relativeUploadedPath = uploadedPath.replace(/^\//, '');
                    await fs.unlink(path.join(__dirname, '../..', relativeUploadedPath));
                } catch (deleteError) {
                    console.warn('Feltöltött kép törlése nem sikerült:', deleteError.message);
                }
            }
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || 'Szerverhiba a képfeltöltés közben.' };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'ADMIN_IMAGE_UPLOAD_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// POST /admin/users/:id/profile-image/remove - admin képeltávolítás
router.post(
    '/users/:id/profile-image/remove',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a profilkép eltávolítása során.' };
        try {
            const userId = Number(request.params?.id) || 0;
            if (!userId) {
                statusCode = 400;
                throw new Error('Érvénytelen felhasználó azonosító.');
            }

            const removeResult = await sql.resetUserProfileImageToDefault(userId);

            // Értesítés küldése az usernek
            try {
                await sql.insertNotification({
                    type: 'profile_image_removed',
                    audience: 'user',
                    targetUserId: userId,
                    title: 'Profilkép eltávolítva',
                    message: 'Az adminisztrátor eltávolította a profilképedet.',
                    severity: 'info'
                });
            } catch (notifyErr) {
                console.warn('Értesítés küldése sikertelen:', notifyErr.message);
            }

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'profile_image';
            response.locals.adminAudit.targetId = userId;
            response.locals.adminAudit.afterState = { status: 'default', profileImage: '/profile_pictures/default.png' };
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: 'Profilkép eltávolítva.',
                data: {
                    profileImage: removeResult.profileImage,
                    profileImageStatus: removeResult.profileImageStatus
                }
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            const messageLower = String(error?.message || '').toLowerCase();
            if (messageLower.includes('nem található') || messageLower.includes('nem talalhato')) {
                statusCode = 404;
            }
            payload = { success: false, message: error.message || 'Szerverhiba a profilkép eltávolítása közben.' };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'ADMIN_IMAGE_REMOVE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// =====================================================================
// USER CORE EDIT - /users/:id/edit
// Az "Adatok és szerkesztés" panel mentésvégpontja. Mindent egy
// tranzakcióban módosít, audit log + user-notification automatikusan.
// reason kötelező (requireReasonOnMutate).
// =====================================================================

const ADMIN_USER_EDIT_FIELD_LABELS = Object.freeze({
    username: 'Felhasználónév',
    email: 'E-mail',
    role: 'Szerepkör',
    emailVerified: 'Email megerősítve',
    elo: 'ELO (klasszikus)',
    eloMM: 'ELO (MattMester)',
    eloBullet: 'ELO (bullet)',
    wins: 'Győzelmek',
    losses: 'Vereségek',
    draws: 'Döntetlenek',
    totalAbilities: 'Képességek'
});

function formatAdminEditValue(key, value) {
    if (value === null || value === undefined) return '—';
    if (key === 'emailVerified') return value ? 'igen' : 'nem';
    return String(value);
}

router.post(
    '/users/:id/edit',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_EDIT_PROFILE),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a felhasználó módosítása során.' };
        try {
            const userId = Number(request.params?.id) || 0;
            if (!userId) {
                statusCode = 400;
                throw new Error('Érvénytelen felhasználó azonosító.');
            }

            const adminUserId = Number(request.adminAuth?.userId) || 0;
            if (userId === adminUserId && (request.body?.role && request.body.role !== 'admin')) {
                // Saját role-t ne tudja önmagának visszavonni az admin felületen.
                statusCode = 400;
                throw new Error('A saját admin szerepköröd a felületen nem vonható vissza.');
            }

            const body = request.body || {};
            const changes = {
                username:        typeof body.username === 'string' ? body.username : undefined,
                email:           typeof body.email === 'string' ? body.email : undefined,
                role:            typeof body.role === 'string' ? body.role : undefined,
                emailVerified:   typeof body.emailVerified === 'boolean' ? body.emailVerified : undefined,
                elo:             body.elo !== undefined ? body.elo : undefined,
                eloMM:           body.eloMM !== undefined ? body.eloMM : undefined,
                eloBullet:       body.eloBullet !== undefined ? body.eloBullet : undefined,
                wins:            body.wins !== undefined ? body.wins : undefined,
                losses:          body.losses !== undefined ? body.losses : undefined,
                draws:           body.draws !== undefined ? body.draws : undefined,
                totalAbilities:  body.totalAbilities !== undefined ? body.totalAbilities : undefined
            };

            const result = await sql.adminUpdateUserCore(userId, changes);

            // Ha a szerkesztes tetelesen levette az admin szerepkort (admin → player),
            // ugyanaz a kemeny kileptetes fut le, mint a /admins/revoke-on:
            // tokenek revoke + WS force-logout, hogy a celzott admin azonnal essen ki.
            const demotedFromAdmin = result.changedKeys.includes('role')
                && String(result.before?.role || '').toLowerCase() === 'admin'
                && String(result.after?.role || '').toLowerCase() !== 'admin';
            if (demotedFromAdmin) {
                try {
                    const tokenService = require('../admin/tokenService.js');
                    await tokenService.revokeAllForUser(userId);
                } catch (revokeErr) {
                    console.warn('users/edit: tokenrevoke hiba:', revokeErr.message);
                }
                try {
                    const adminSocketHub = request.app?.locals?.adminSocketHub;
                    if (adminSocketHub && typeof adminSocketHub.disconnectAllForAdminUser === 'function') {
                        await adminSocketHub.disconnectAllForAdminUser(userId, 'admin_role_revoked');
                    }
                } catch (kickErr) {
                    console.warn('users/edit: admin disconnect hiba:', kickErr.message);
                }
            }

            // Ha a szerkesztes egyben be is tiltotta a userT, ugyanaz a kemeny
            // levalasztas fut: token revoke + admin WS bontas (ha az adott user
            // amugy admin volt, akkor a beforeState.role === 'admin' alapjan).
            if (changes.banned === true || (typeof body.isBanned === 'boolean' && body.isBanned)) {
                try {
                    const tokenService = require('../admin/tokenService.js');
                    await tokenService.revokeAllForUser(userId);
                } catch (_) {}
            }

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_EDIT_PROFILE;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'user';
            response.locals.adminAudit.targetId = userId;
            response.locals.adminAudit.targetLabel = result.after?.username || result.before?.username || `#${userId}`;
            response.locals.adminAudit.beforeState = result.before;
            response.locals.adminAudit.afterState = result.after;
            response.locals.adminAudit.success = true;

            // User notification + user_logs (security activity) — csak ha tényleg változott valami.
            if (result.changed && result.changedKeys.length) {
                const summaryLines = result.changedKeys.map((key) => {
                    const label = ADMIN_USER_EDIT_FIELD_LABELS[key] || key;
                    return `• ${label}: ${formatAdminEditValue(key, result.before[key])} → ${formatAdminEditValue(key, result.after[key])}`;
                });
                const summaryShort = result.changedKeys
                    .map((key) => ADMIN_USER_EDIT_FIELD_LABELS[key] || key)
                    .join(', ');

                // 1) Notifikáció (in-app + WS push a `notificationService`-en keresztül)
                try {
                    const socketHub = request.app?.locals?.socketHub;
                    const notifPayload = {
                        type: 'admin_profile_edit',
                        audience: 'user',
                        targetUserId: userId,
                        title: 'Profilod módosult',
                        message: `Az adminisztrátor módosította a profilodat:\n${summaryLines.join('\n')}\n\nIndok: ${request.adminReason}`.slice(0, 1000),
                        severity: 'info',
                        senderUserId: adminUserId || null,
                        payload: {
                            changedKeys: result.changedKeys,
                            before: result.before,
                            after: result.after,
                            reason: request.adminReason
                        }
                    };
                    const notificationService = require('../../services.js').notificationService;
                    if (notificationService && typeof notificationService.send === 'function') {
                        await notificationService.send(socketHub, notifPayload);
                    } else {
                        await sql.insertNotification(notifPayload);
                    }
                } catch (notifyErr) {
                    console.warn('Admin user-edit értesítés küldése sikertelen:', notifyErr.message);
                }

                // 2) user_logs — Security & Activity History entry a célfelhasználónak
                try {
                    await sql.insertUserLog(userId, {
                        eventType: 'profile_edited_by_admin',
                        eventCategory: 'profile',
                        severity: 'info',
                        source: 'admin',
                        success: true,
                        message: `Profil módosult admin által (${summaryShort}).`,
                        ipAddress: request.adminAuth?.ipAddress || null,
                        userAgent: request.adminAuth?.userAgent || null,
                        metadata: {
                            actorAdminId: adminUserId || null,
                            actorAdminUsername: request.adminAuth?.username || null,
                            changedKeys: result.changedKeys,
                            before: result.before,
                            after: result.after,
                            reason: request.adminReason
                        }
                    });
                } catch (logErr) {
                    console.warn('Admin user-edit user_logs bejegyzés hiba:', logErr.message);
                }

                // 3) Real-time push a célfelhasználó nyitott tabjaira: a Security & Activity History
                //    azonnal újrahúzhatja magát egy lightweight event alapján.
                try {
                    const socketHub = request.app?.locals?.socketHub;
                    if (socketHub && typeof socketHub.emitToUser === 'function') {
                        socketHub.emitToUser(userId, 'user:profile:adminEdit', {
                            changedKeys: result.changedKeys,
                            after: result.after,
                            reason: request.adminReason,
                            at: new Date().toISOString()
                        });
                    }
                } catch (pushErr) {
                    console.warn('Admin user-edit user push hiba:', pushErr.message);
                }
            }

            payload = {
                success: true,
                message: result.changed
                    ? `Mentve — ${result.changedKeys.length} mező módosult.`
                    : 'Nincs változás a kiválasztott felhasználón.',
                data: {
                    userId,
                    changed: result.changed,
                    changedKeys: result.changedKeys,
                    before: result.before,
                    after: result.after
                }
            };
        } catch (error) {
            const message = error?.message || 'Szerverhiba a felhasználó módosítása során.';
            const lower = message.toLowerCase();
            if (error?.code === 'USER_NOT_FOUND' || lower.includes('nem talalhato') || lower.includes('nem található')) {
                statusCode = 404;
            } else if (lower.includes('foglalt') || lower.includes('érvénytelen') || lower.includes('ervenytelen') || lower.includes('vissza')) {
                statusCode = statusCode === 200 ? 400 : statusCode;
            } else if (statusCode === 200) {
                statusCode = 500;
            }
            payload = { success: false, message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_EDIT_PROFILE;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'USER_EDIT_FAILED';
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

// Megj.: a regi /alerts/recent endpoint torolve — duplikatum volt, az alabbi
// (Riasztasok admin oldal) `GET /admin/alerts/recent` szuro+dismissal-tudo verzio
// vegezi a feladatot. A regi verzio `alertId` mezot kuldott, ami inkonzisztens
// volt a frontend `a.id` lekeresevel — emiatt az Elutasit gomb null-t kapott.

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
                        pendingDeletionUntil: user.pending_deletion_until || null,
                        deletedReason: user.deleted_reason || null,
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

// POST /admin/users/:id/revoke-sessions
// Az összes aktív munkamenet és bejelentkezett eszköz megszüntetése (kijelentkeztetés)
router.post(
    '/users/:id/revoke-sessions',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_EDIT_PROFILE), // Mivel ez egy módosító művelet, használjuk a jogosultságot
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a munkamenetek megszüntetése során.' };
        try {
            const userId = Number(request.params?.id) || 0;
            if (!userId) {
                statusCode = 400;
                throw new Error('Érvénytelen felhasználó azonosító.');
            }

            // 1. Tokenek visszavonása (tokenService segítségével, mint az edit/demote résznél)
            try {
                const tokenService = require('../admin/tokenService.js');
                await tokenService.revokeAllForUser(userId);
            } catch (revokeErr) {
                console.warn('revoke-sessions: token revoke hiba:', revokeErr.message);
            }

            // 2. HTTP session(ök) megsemmisítése a session store-ból
            try {
                const sessionStore = request.app?.locals?.sessionStore;
                if (sessionStore && typeof sessionStore.all === 'function') {
                    await new Promise((resolve) => {
                        sessionStore.all((err, sessions) => {
                            if (err || !sessions) { resolve(); return; }
                            // sessions: { [sid]: sessionObj, ... }
                            const destroyPromises = Object.entries(sessions)
                                .filter(([, s]) => Number(s?.userId) === userId)
                                .map(([sid]) => new Promise((res) => {
                                    sessionStore.destroy(sid, () => res());
                                }));
                            Promise.all(destroyPromises).then(resolve);
                        });
                    });
                }
            } catch (sessionErr) {
                console.warn('revoke-sessions: session destroy hiba:', sessionErr.message);
            }

            // 3. WebSocket kapcsolatok lezárása (Socket.io)
            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.disconnectAllForAdminUser === 'function') {
                    await adminSocketHub.disconnectAllForAdminUser(userId, 'admin_revoke_sessions');
                }
                const socketHub = request.app?.locals?.socketHub;
                if (socketHub && typeof socketHub.disconnectUser === 'function') {
                    await socketHub.disconnectUser(userId, 'admin_revoke_sessions');
                }
            } catch (kickErr) {
                console.warn('revoke-sessions: socket disconnect hiba:', kickErr.message);
            }

            // 3. Audit log bejegyzés
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_EDIT_PROFILE;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'user';
            response.locals.adminAudit.targetId = userId;
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: 'A felhasználó összes munkamenete sikeresen megszüntetve.'
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || 'Szerverhiba a művelet során.' };
            
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_EDIT_PROFILE;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'REVOKE_SESSIONS_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// POST /admin/users/:id/ban
router.post(
    '/users/:id/ban',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_BAN),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a tiltás alkalmazása során.' };
        try {
            const userId = Number(request.params?.id) || 0;
            if (!userId) {
                statusCode = 400;
                throw new Error('Érvénytelen felhasználó azonosító.');
            }
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            if (userId === adminUserId) {
                statusCode = 400;
                throw new Error('Saját magadat nem tilthatod ki.');
            }

            const body = request.body || {};
            const banType = String(body.banType || 'Ideiglenes').trim();
            const durationHours = Math.max(1, Number(body.durationHours) || 24);
            const reason = String(body.reason || request.adminReason || '').trim();
            const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
            if (reason.length < 10) {
                statusCode = 400;
                throw new Error('Az indoknak legalább 10 karakter hosszúnak kell lennie.');
            }

            // Admin sajat jelszavanak ellenorzese — a delete-flow mintajara, hogy a hold-button
            // ne legyen elegendo egyetlen vedelem. (Nem a target user jelszava!)
            if (!currentPassword) {
                statusCode = 400;
                throw new Error('A jelenlegi admin jelszó megadása kötelező.');
            }
            if (currentPassword.includes('\\')) {
                statusCode = 400;
                throw new Error('A jelszó nem megengedett karaktert tartalmaz.');
            }
            if (currentPassword.length < 8) {
                statusCode = 400;
                throw new Error('A jelszónak legalább 8 karakter hosszú kell legyen.');
            }
            if (!passwordRegex.test(currentPassword)) {
                statusCode = 400;
                throw new Error('A jelszónak tartalmaznia kell nagybetűt, kisbetűt és számot.');
            }
            const adminAuthUser = await sql.getUserAuthById(adminUserId);
            if (!adminAuthUser) {
                statusCode = 404;
                throw new Error('Az admin felhasználó nem található.');
            }
            const isPasswordValid = await bcrypt.compare(currentPassword, adminAuthUser.password_hash);
            if (!isPasswordValid) {
                statusCode = 401;
                throw new Error('A jelenlegi jelszó hibás.');
            }

            let bannedUntil = null;
            if (banType !== 'Végleges') {
                const until = new Date();
                until.setHours(until.getHours() + durationHours);
                bannedUntil = until;
            }

            await sql.banUser(userId, reason, bannedUntil);

            // Account-ban event + esetleges IP-ban escalation. Ha a banolt user IP-jén
            // mar volt korabbi banolt user, ez automatikusan IP-blokkot is alkalmaz
            // (1 napos elsore, perma ha az IP-nek mar van blokk-tortenete).
            let ipEscalationOutcome = null;
            try {
                const targetIp = await sql.getUserLastLoginIp(userId);
                ipEscalationOutcome = await sql.recordAccountBanEvent({
                    userId,
                    ipAddress: targetIp,
                    source: banType === 'Végleges' ? 'admin_critical' : 'admin_manual',
                    reason
                });
            } catch (escErr) {
                console.warn('ban: account-ban event hiba:', escErr.message);
            }

            // HTTP session(ok) megsemmisitese a session store-bol — kulonben a banned
            // user a meglevo cookie-javal tovabb tudna hasznalni az oldalt
            // (isAuthenticated middleware csak session.userId-t nez, nem a DB is_banned-et).
            try {
                const sessionStore = request.app?.locals?.sessionStore;
                if (sessionStore && typeof sessionStore.all === 'function') {
                    await new Promise((resolve) => {
                        sessionStore.all((err, sessions) => {
                            if (err || !sessions) { resolve(); return; }
                            const destroyPromises = Object.entries(sessions)
                                .filter(([, s]) => Number(s?.userId) === userId)
                                .map(([sid]) => new Promise((res) => {
                                    sessionStore.destroy(sid, () => res());
                                }));
                            Promise.all(destroyPromises).then(resolve);
                        });
                    });
                }
            } catch (sessionErr) {
                console.warn('ban: session destroy hiba:', sessionErr.message);
            }

            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.disconnectAllForAdminUser === 'function') {
                    await adminSocketHub.disconnectAllForAdminUser(userId, 'banned');
                }
                const socketHub = request.app?.locals?.socketHub;
                if (socketHub && typeof socketHub.banUser === 'function') {
                    await socketHub.banUser(userId, reason);
                }
            } catch (kickErr) {
                console.warn('ban: socket disconnect hiba:', kickErr.message);
            }

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_BAN;
            response.locals.adminAudit.severity = 'warning';
            response.locals.adminAudit.targetType = 'user';
            response.locals.adminAudit.targetId = userId;
            response.locals.adminAudit.success = true;

            // Riasztas log + live broadcast: a kritikus admin akciok megjelennek a
            // Vezerlopult "24h riasztas" szamlaloban, a Riasztasok listaban, es real-time
            // push-olnak a tobbi admin browser tab-ra.
            await alertingService.recordAdminAction({
                kind: 'user_banned',
                severity: 'warning',
                userId,
                ipAddress: request.adminAuth?.ipAddress || request.ip,
                userAgent: request.adminAuth?.userAgent || request.headers['user-agent'],
                endpoint: '/admin/users/:id/ban',
                detail: {
                    actorUserId: adminUserId,
                    actorUsername: request.adminAuth?.username,
                    banType,
                    durationHours: banType === 'Végleges' ? null : durationHours,
                    bannedUntil: bannedUntil ? bannedUntil.toISOString() : null,
                    reason
                }
            });

            // Target user sajat user_logs naplojaba is bekerul — igy a "Biztonsagi naplo"
            // tab-ban (admin user-details modal + sajat profile) latszik a tiltas tortenete.
            try {
                await sql.insertUserLog(userId, {
                    eventType: 'banned',
                    eventCategory: 'security',
                    severity: 'warning',
                    source: 'admin',
                    success: true,
                    message: `Admin tiltás (${banType})${reason ? ' — ' + reason : ''}`,
                    ipAddress: request.adminAuth?.ipAddress || request.ip,
                    userAgent: request.adminAuth?.userAgent || request.headers['user-agent'],
                    metadata: {
                        actorAdminId: adminUserId,
                        actorAdminUsername: request.adminAuth?.username,
                        banType,
                        durationHours: banType === 'Végleges' ? null : durationHours,
                        bannedUntil: bannedUntil ? bannedUntil.toISOString() : null,
                        reason
                    }
                });
            } catch (logErr) {
                console.warn('ban: target user_logs insert hiba:', logErr.message);
            }

            const ipBlockMsgPart = ipEscalationOutcome && ipEscalationOutcome.triggeredIpBlock
                ? ` Az IP címen (${ipEscalationOutcome.ipAddress}) korábbi ban-history miatt automatikus IP-blokk is alkalmazva (${ipEscalationOutcome.blockType === 'perma' ? 'végleges' : '1 napos'}).`
                : '';
            payload = {
                success: true,
                message: `A felhasználó sikeresen tiltva lett.${ipBlockMsgPart}`,
                ipEscalation: ipEscalationOutcome && ipEscalationOutcome.triggeredIpBlock ? {
                    ipAddress: ipEscalationOutcome.ipAddress,
                    blockType: ipEscalationOutcome.blockType,
                    blockedUntil: ipEscalationOutcome.blockedUntil
                } : null
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || 'Szerverhiba.' };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_BAN;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'BAN_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// POST /admin/users/:id/unban
router.post(
    '/users/:id/unban',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_UNBAN),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a tiltás feloldása során.' };
        try {
            const userId = Number(request.params?.id) || 0;
            if (!userId) {
                statusCode = 400;
                throw new Error('Érvénytelen felhasználó azonosító.');
            }

            await sql.unbanUser(userId);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_UNBAN;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'user';
            response.locals.adminAudit.targetId = userId;
            response.locals.adminAudit.success = true;

            await alertingService.recordAdminAction({
                kind: 'user_unbanned',
                severity: 'info',
                userId,
                ipAddress: request.adminAuth?.ipAddress || request.ip,
                userAgent: request.adminAuth?.userAgent || request.headers['user-agent'],
                endpoint: '/admin/users/:id/unban',
                detail: {
                    actorUserId: Number(request.adminAuth?.userId) || null,
                    actorUsername: request.adminAuth?.username,
                    reason: request.adminReason || null
                }
            });

            // Target user user_logs naplo bejegyzes (Biztonsagi naplo tab-on lattszik).
            try {
                await sql.insertUserLog(userId, {
                    eventType: 'unbanned',
                    eventCategory: 'security',
                    severity: 'info',
                    source: 'admin',
                    success: true,
                    message: `Admin feloldotta a tiltást${request.adminReason ? ' — ' + request.adminReason : ''}`,
                    ipAddress: request.adminAuth?.ipAddress || request.ip,
                    userAgent: request.adminAuth?.userAgent || request.headers['user-agent'],
                    metadata: {
                        actorAdminId: Number(request.adminAuth?.userId) || null,
                        actorAdminUsername: request.adminAuth?.username,
                        reason: request.adminReason || null
                    }
                });
            } catch (logErr) {
                console.warn('unban: target user_logs insert hiba:', logErr.message);
            }

            payload = { success: true, message: 'A tiltás sikeresen feloldva.' };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || 'Szerverhiba.' };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_UNBAN;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'UNBAN_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// =====================================================================
// POST /admin/users/:id/delete
// Hard delete egy felhasznalo profiljat. A self-delete (POST /profile/delete)
// flow-t hivja meg admin neveben (deleteUserProfileWithTransaction).
// Vedelem: admin sajat jelszojanak ujra-megerositese kotelezo. Indok opcionalis.
// =====================================================================
router.post(
    '/users/:id/delete',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a felhasznalo torlese soran.' };
        const adminUserId = Number(request.adminAuth?.userId) || 0;
        let targetUserId = 0;

        try {
            targetUserId = Number(request.params?.id) || 0;
            if (!targetUserId) {
                statusCode = 400;
                throw new Error('Ervenytelen felhasznalo azonosito.');
            }

            if (targetUserId === adminUserId) {
                statusCode = 400;
                throw new Error('Sajat accountot nem tudsz admin-kent torolni.');
            }

            const body = request.body || {};
            const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
            const rawReason = typeof body.reason === 'string' ? body.reason.trim() : '';
            const reason = rawReason.length > 0 ? rawReason.slice(0, 1000) : null;

            if (!currentPassword) {
                statusCode = 400;
                throw new Error('A jelenlegi jelszo kotelezo.');
            }
            if (currentPassword.includes('\\')) {
                statusCode = 400;
                throw new Error('A jelszo nem megengedett karaktert tartalmaz.');
            }
            if (currentPassword.length < 8) {
                statusCode = 400;
                throw new Error('A jelszonak legalabb 8 karakter hosszu kell legyen.');
            }
            if (!passwordRegex.test(currentPassword)) {
                statusCode = 400;
                throw new Error('A jelszonak tartalmaznia kell nagybetut, kisbetut es szamot.');
            }

            // Admin sajat jelszavanak ellenorzese (NEM a target user-e!)
            const adminAuthUser = await sql.getUserAuthById(adminUserId);
            if (!adminAuthUser) {
                statusCode = 404;
                throw new Error('Az admin felhasznalo nem talalhato.');
            }
            const isPasswordValid = await bcrypt.compare(currentPassword, adminAuthUser.password_hash);
            if (!isPasswordValid) {
                statusCode = 401;
                throw new Error('A jelenlegi jelszo hibas.');
            }

            // Audit kontextus elo-feltoltese (delete elott, hogy hiba eseten is megmaradjon).
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_DELETE;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'user';
            response.locals.adminAudit.targetId = targetUserId;
            if (reason) {
                response.locals.adminAudit.reason = reason;
            }

            // SOFT delete admin-trigger esetén: a user 24 óráig a `pending_deletion_until`-lel
            // jelölve marad, hard-delete csak a hourly cron-on keresztül történik. A self-delete
            // marad hard (privacy intent + abuse-prevenció).
            // A softDeleteUserByAdmin dob: 'A felhasznalo nem talalhato.' / 'Admin profil nem torolheto.'
            const deleteResult = await sql.softDeleteUserByAdmin(targetUserId, adminUserId, reason);

            // Sockets / sessions takaritasa: a usert kijelentkeztetjuk + deleted.html-re iranyitjuk.
            // (Ha az admin restore-olja a 24 oran belul, ujra be tud lepni.)
            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.disconnectAllForAdminUser === 'function') {
                    await adminSocketHub.disconnectAllForAdminUser(targetUserId, 'deleted');
                }
                const socketHub = request.app?.locals?.socketHub;
                if (socketHub && typeof socketHub.notifyUserDeleted === 'function') {
                    await socketHub.notifyUserDeleted(targetUserId);
                }
            } catch (kickErr) {
                console.warn('user delete: socket disconnect hiba:', kickErr.message);
            }

            // Sessions destroy a session store-ból (mintha banned lenne).
            try {
                const sessionStore = request.app?.locals?.sessionStore;
                if (sessionStore && typeof sessionStore.all === 'function') {
                    await new Promise((resolve) => {
                        sessionStore.all((err, sessions) => {
                            if (err || !sessions) { resolve(); return; }
                            const destroyPromises = Object.entries(sessions)
                                .filter(([, s]) => Number(s?.userId) === targetUserId)
                                .map(([sid]) => new Promise((res) => sessionStore.destroy(sid, () => res())));
                            Promise.all(destroyPromises).then(resolve);
                        });
                    });
                }
            } catch (sessionErr) {
                console.warn('soft-delete: session destroy hiba:', sessionErr.message);
            }

            response.locals.adminAudit.targetLabel = deleteResult.username || null;
            response.locals.adminAudit.success = true;
            response.locals.adminAudit.afterState = {
                pendingDeletionUntil: deleteResult.pendingDeletionUntil
            };

            try {
                await alertingService.recordAdminAction({
                    kind: 'user_deleted',
                    severity: 'critical',
                    userId: targetUserId,
                    ipAddress: request.adminAuth?.ipAddress || request.ip,
                    userAgent: request.adminAuth?.userAgent || request.headers['user-agent'],
                    endpoint: '/admin/users/:id/delete',
                    detail: {
                        actorUserId: adminUserId,
                        actorUsername: request.adminAuth?.username,
                        deletedUsername: deleteResult.username,
                        soft: true,
                        pendingDeletionUntil: deleteResult.pendingDeletionUntil,
                        reason
                    }
                });
            } catch (alertErr) {
                console.warn('user delete: alert log hiba:', alertErr.message);
            }

            // Target user_logs entry — Biztonsagi naploba bekerul.
            try {
                await sql.insertUserLog(targetUserId, {
                    eventType: 'pending_deletion',
                    eventCategory: 'security',
                    severity: 'critical',
                    source: 'admin',
                    success: true,
                    message: `Admin törlésre jelölte a fiókodat (${new Date(deleteResult.pendingDeletionUntil).toLocaleString('hu-HU')} után véglegesen törlődik)${reason ? ' — ' + reason : ''}`,
                    ipAddress: request.adminAuth?.ipAddress || request.ip,
                    userAgent: request.adminAuth?.userAgent || request.headers['user-agent'],
                    metadata: {
                        actorAdminId: adminUserId,
                        actorAdminUsername: request.adminAuth?.username,
                        pendingDeletionUntil: deleteResult.pendingDeletionUntil,
                        reason
                    }
                });
            } catch (logErr) {
                console.warn('soft-delete: target user_logs insert hiba:', logErr.message);
            }

            payload = {
                success: true,
                soft: true,
                message: `${deleteResult.username} törlésre kijelölve. 24 órán belül visszaállítható.`,
                deletedUserId: deleteResult.userId,
                deletedUsername: deleteResult.username,
                pendingDeletionUntil: deleteResult.pendingDeletionUntil
            };
        } catch (error) {
            if (statusCode === 200) {
                statusCode = 500;
                if (error.message === 'A felhasznalo nem talalhato.') statusCode = 404;
                else if (error.message === 'Admin profil nem torolheto.') statusCode = 403;
                else if (error.message === 'A jelenlegi jelszo hibas.') statusCode = 401;
                else if (error.message === 'A felhasznalo mar torlesre van kijelolve.') statusCode = 409;
            }
            payload = { success: false, message: error.message || 'Szerverhiba.' };

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_DELETE;
            response.locals.adminAudit.targetType = 'user';
            response.locals.adminAudit.targetId = targetUserId || null;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = statusCode === 401 ? 'AUTH_FAILED'
                : statusCode === 403 ? 'FORBIDDEN'
                : statusCode === 404 ? 'NOT_FOUND'
                : 'DELETE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// =====================================================================
// ALERT MANAGEMENT (Riasztasok admin oldal)
// =====================================================================

// GET /admin/alerts/recent — flexibilis lekerdezes szurokkel.
router.get(
    '/alerts/recent',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Belso hiba az alert lekerdezeskor.' };
        try {
            const q = request.query || {};
            const options = {
                limit: Math.min(Math.max(Number(q.limit) || 100, 1), 500),
                includeDismissed: String(q.includeDismissed || '').toLowerCase() === 'true',
                kind: q.kind ? String(q.kind).slice(0, 64) : null,
                severity: q.severity ? String(q.severity) : null,
                sinceDate: q.since ? new Date(q.since) : null,
                untilDate: q.until ? new Date(q.until) : null,
                ipAddress: q.ip ? String(q.ip).slice(0, 45) : null,
                userId: q.userId ? Number(q.userId) : null
            };
            const rows = await adminRepo.listAlertsForAdmin(options);
            payload = {
                success: true,
                data: rows.map((row) => ({
                    id: row.id,
                    kind: row.kind,
                    severity: row.severity,
                    userId: row.user_id,
                    ip: row.ip_address,
                    endpoint: row.endpoint,
                    userAgent: row.user_agent,
                    detail: row.detail,
                    dismissedAt: row.dismissed_at,
                    dismissedByUserId: row.dismissed_by_user_id,
                    occurredAt: row.occurred_at
                }))
            };
            response.locals.adminAudit.skip = true;
        } catch (error) {
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

// POST /admin/alerts/:id/dismiss — egyetlen alert elrejtese (sor megmarad, dismissed_at kitoltodik).
router.post(
    '/alerts/:id/dismiss',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba az elrejteskor.' };
        const adminUserId = Number(request.adminAuth?.userId) || 0;
        const alertId = Number(request.params?.id) || 0;
        try {
            if (!alertId) {
                statusCode = 400;
                throw new Error('Ervenytelen alert azonosito.');
            }
            const affected = await adminRepo.markAlertDismissed(alertId, adminUserId);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.ALERTS_DISMISS;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'alert';
            response.locals.adminAudit.targetId = alertId;
            response.locals.adminAudit.success = true;

            // Live broadcast a tobbi admin tabnak.
            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:alert:dismissed', {
                        alertId,
                        dismissedByUserId: adminUserId,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('alert dismiss: broadcast hiba:', broadcastErr.message);
            }

            payload = { success: true, message: affected > 0 ? 'Riasztás elrejtve.' : 'A riasztás már el volt rejtve.', affected };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.ALERTS_DISMISS;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'DISMISS_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// POST /admin/alerts/dismiss-all — osszes nem-elrejtett riasztas elrejtese (tomeges).
router.post(
    '/alerts/dismiss-all',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba.' };
        const adminUserId = Number(request.adminAuth?.userId) || 0;
        try {
            const affected = await adminRepo.markAllAlertsDismissed(adminUserId);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.ALERTS_DISMISS_ALL;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'alerts';
            response.locals.adminAudit.success = true;

            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:alert:dismissed-all', {
                        dismissedByUserId: adminUserId,
                        count: affected,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('alert dismiss-all: broadcast hiba:', broadcastErr.message);
            }

            payload = { success: true, message: `${affected} riasztás elrejtve.`, affected };
        } catch (error) {
            statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.ALERTS_DISMISS_ALL;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'DISMISS_ALL_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// POST /admin/alerts/:id/restore — egy elrejtett riasztas visszaallitasa (dismissed_at -> NULL).
router.post(
    '/alerts/:id/restore',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba a visszaallitaskor.' };
        const adminUserId = Number(request.adminAuth?.userId) || 0;
        const alertId = Number(request.params?.id) || 0;
        try {
            if (!alertId) {
                statusCode = 400;
                throw new Error('Ervenytelen alert azonosito.');
            }
            const affected = await adminRepo.restoreAlert(alertId);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.ALERTS_RESTORE;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'alert';
            response.locals.adminAudit.targetId = alertId;
            response.locals.adminAudit.success = true;

            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:alert:restored', {
                        alertId,
                        restoredByUserId: adminUserId,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('alert restore: broadcast hiba:', broadcastErr.message);
            }

            payload = { success: true, message: affected > 0 ? 'Riasztás visszaállítva.' : 'A riasztás már aktív volt.', affected };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.ALERTS_RESTORE;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'RESTORE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// =====================================================================
// IP BLOCK MANAGEMENT
// =====================================================================

// POST /admin/ip-blocks — uj/frissitett blokk az ip_blocks tablaba.
// body: { ipAddress, blockedUntil?, reason }
router.post(
    '/ip-blocks',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba az IP blokk soran.' };
        const adminUserId = Number(request.adminAuth?.userId) || 0;
        const adminUsername = request.adminAuth?.username || null;
        try {
            const body = request.body || {};
            const ipAddress = String(body.ipAddress || '').trim();
            const blockedUntilRaw = body.blockedUntil || null;
            const reason = body.reason ? String(body.reason).trim() : null;

            if (!ipAddress || ipAddress.length > 45) {
                statusCode = 400;
                throw new Error('Ervenytelen IP cim.');
            }
            // Egyszeru sanity check IPv4/IPv6 formara
            if (!/^[0-9a-fA-F:.]+$/.test(ipAddress)) {
                statusCode = 400;
                throw new Error('Ervenytelen IP cim formatum.');
            }
            // Loopback (127.0.0.1, ::1, localhost) blokkolasat tiltjuk — az admin nem
            // tudna magat kizarni dev kornyezetbol amugy is (whitelist a guard-ban),
            // szoval a sor csak felrevezeto lenne ("blokkolva van de meg mukodik?").
            const loopbackPatterns = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
            if (loopbackPatterns.includes(ipAddress.toLowerCase()) || ipAddress.startsWith('127.')) {
                statusCode = 400;
                throw new Error('Loopback IP cimet (localhost) nem lehet blokkolni.');
            }

            let blockedUntil = null;
            if (blockedUntilRaw) {
                const parsed = new Date(blockedUntilRaw);
                if (Number.isNaN(parsed.getTime())) {
                    statusCode = 400;
                    throw new Error('Ervenytelen lejarati datum.');
                }
                blockedUntil = parsed;
            }

            await adminRepo.upsertIpBlock(ipAddress, blockedUntil, reason, adminUserId, adminUsername);
            invalidateIpBlockCache(ipAddress);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.IP_BLOCK_CREATE;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'ip';
            response.locals.adminAudit.targetKey = ipAddress;
            response.locals.adminAudit.targetLabel = ipAddress;
            response.locals.adminAudit.reason = reason;
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: `IP ${ipAddress} blokkolva.`,
                ipAddress,
                blockedUntil: blockedUntil ? blockedUntil.toISOString() : null
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.IP_BLOCK_CREATE;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'IP_BLOCK_CREATE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// DELETE /admin/ip-blocks/:ip — blokk feloldasa.
router.delete(
    '/ip-blocks/:ip',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba az IP blokk feloldasa soran.' };
        try {
            const ipAddress = String(request.params?.ip || '').trim();
            if (!ipAddress) {
                statusCode = 400;
                throw new Error('Ervenytelen IP cim.');
            }
            const affected = await adminRepo.removeIpBlock(ipAddress);
            invalidateIpBlockCache(ipAddress);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.IP_BLOCK_REMOVE;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'ip';
            response.locals.adminAudit.targetKey = ipAddress;
            response.locals.adminAudit.targetLabel = ipAddress;
            response.locals.adminAudit.success = true;

            payload = { success: true, message: `IP ${ipAddress} feloldva.`, affected };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.IP_BLOCK_REMOVE;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'IP_BLOCK_REMOVE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// POST /admin/users/:id/restore-deletion — soft-deleted user visszaallitasa.
// Idempotens: ha a user nincs soft-delete allapotban, 0 affectedRows + figyelmezteto uzenet.
router.post(
    '/users/:id/restore-deletion',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba a visszaallitaskor.' };
        const adminUserId = Number(request.adminAuth?.userId) || 0;
        const targetUserId = Number(request.params?.id) || 0;
        try {
            if (!targetUserId) {
                statusCode = 400;
                throw new Error('Ervenytelen felhasznalo azonosito.');
            }
            const affected = await sql.restoreUserFromSoftDelete(targetUserId);

            response.locals.adminAudit.action = 'users.restore_deletion';
            response.locals.adminAudit.severity = 'warning';
            response.locals.adminAudit.targetType = 'user';
            response.locals.adminAudit.targetId = targetUserId;
            response.locals.adminAudit.success = true;

            if (affected > 0) {
                // Audit log a target user_logs-ba.
                try {
                    await sql.insertUserLog(targetUserId, {
                        eventType: 'restored_from_deletion',
                        eventCategory: 'security',
                        severity: 'info',
                        source: 'admin',
                        success: true,
                        message: 'Admin visszavonta a fiók törlését.',
                        ipAddress: request.adminAuth?.ipAddress || request.ip,
                        userAgent: request.adminAuth?.userAgent || request.headers['user-agent'],
                        metadata: {
                            actorAdminId: adminUserId,
                            actorAdminUsername: request.adminAuth?.username
                        }
                    });
                } catch (logErr) {
                    console.warn('restore-deletion: target user_logs insert hiba:', logErr.message);
                }

                // Live broadcast az admin tabokra (a delete-tablan eltunjon a sor).
                try {
                    const adminSocketHub = request.app?.locals?.adminSocketHub;
                    if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                        adminSocketHub.broadcastAdmin('admin:user:deletion-restored', {
                            userId: targetUserId,
                            restoredByUserId: adminUserId,
                            at: new Date().toISOString()
                        });
                    }
                } catch (broadcastErr) {
                    console.warn('restore-deletion: broadcast hiba:', broadcastErr.message);
                }
            }

            payload = {
                success: true,
                message: affected > 0 ? 'Felhasználó visszaállítva.' : 'A felhasználó nem volt törlésre kijelölve.',
                affected
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = 'users.restore_deletion';
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'RESTORE_DELETION_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// =====================================================================
// SECURITY — Bejelentkezesek admin oldal
// =====================================================================

// Kozos enrichment: row-bol kliens-szafe alak (network kategoria + UA parser + risk).
function enrichLoginRow(row) {
    const location = networkClassifier.classifyIp(row.ip_address);
    const device = networkClassifier.parseUserAgent(row.user_agent);
    const risk = networkClassifier.classifyRisk(row);
    return {
        id: row.id,
        userId: row.user_id,
        username: row.username,
        eventType: row.event_type,
        success: row.success === null ? null : Boolean(row.success),
        ip: row.ip_address,
        userAgent: row.user_agent,
        device,
        location,
        risk,
        message: row.message,
        metadata: row.metadata,
        occurredAt: row.occurred_at
    };
}

// Orszag-szuro: csak a megadott ISO orszagkodu sorok. A lokalis (loopback/private/docker)
// IP-ket egyutt szuri ki — ha az admin orszag-filter aktiv, csak public+country>matching matradnak.
function applyCountryFilter(rows, country) {
    if (!country) return rows;
    const upper = String(country).toUpperCase();
    return rows.filter((r) => String(r.location?.country || '').toUpperCase() === upper);
}

// GET /admin/security/logins — szurheto bejelentkezesi feed.
router.get(
    '/security/logins',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Belso hiba a bejelentkezesi naplo lekerdezesekor.' };
        try {
            const q = request.query || {};
            const options = {
                limit: Math.min(Math.max(Number(q.limit) || 200, 1), 500),
                sinceDate: q.since ? new Date(q.since) : null,
                untilDate: q.until ? new Date(q.until) : null,
                ipAddress: q.ip ? String(q.ip).slice(0, 45) : null,
                username: q.username ? String(q.username).slice(0, 50) : null,
                status: q.status === 'success' || q.status === 'failed' ? q.status : 'all'
            };
            const rows = await adminRepo.listAdminLoginHistory(options);
            const enriched = rows.map(enrichLoginRow);
            const filtered = applyCountryFilter(enriched, q.country || null);
            payload = { success: true, data: filtered };
            response.locals.adminAudit.skip = true;
        } catch (error) {
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

// GET /admin/security/logins.csv — ugyanaz a szurokkel, CSV download.
router.get(
    '/security/logins.csv',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        try {
            const q = request.query || {};
            const options = {
                limit: Math.min(Math.max(Number(q.limit) || 500, 1), 500),
                sinceDate: q.since ? new Date(q.since) : null,
                untilDate: q.until ? new Date(q.until) : null,
                ipAddress: q.ip ? String(q.ip).slice(0, 45) : null,
                username: q.username ? String(q.username).slice(0, 50) : null,
                status: q.status === 'success' || q.status === 'failed' ? q.status : 'all'
            };
            const rows = await adminRepo.listAdminLoginHistory(options);
            const enriched = rows.map(enrichLoginRow);
            const filtered = applyCountryFilter(enriched, q.country || null);

            const headers = ['id', 'occurred_at', 'username', 'event_type', 'success', 'ip', 'location', 'browser', 'os', 'risk', 'user_agent', 'message'];
            const lines = [headers.map(escapeCsvValue).join(',')];
            for (const r of filtered) {
                lines.push([
                    r.id,
                    r.occurredAt ? new Date(r.occurredAt).toISOString() : '',
                    r.username || '',
                    r.eventType || '',
                    r.success === null ? '' : (r.success ? 'true' : 'false'),
                    r.ip || '',
                    r.location?.label || '',
                    r.device?.browser || '',
                    r.device?.os || '',
                    r.risk || '',
                    r.userAgent || '',
                    r.message || ''
                ].map(escapeCsvValue).join(','));
            }
            const csvBody = lines.join('\n') + '\n';

            const filename = `bejelentkezesek-${new Date().toISOString().slice(0, 10)}.csv`;
            response.setHeader('Content-Type', 'text/csv; charset=utf-8');
            response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.SECURITY_LOGINS_EXPORT;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'security';
            response.locals.adminAudit.targetLabel = `bejelentkezes-export (${filtered.length} sor)`;
            response.locals.adminAudit.success = true;

            return response.status(statusCode).send(csvBody);
        } catch (error) {
            console.error('admin/security/logins.csv hiba:', error.message);
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.SECURITY_LOGINS_EXPORT;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'CSV_EXPORT_FAILED';
            return response.status(500).json({ success: false, message: error.message || 'CSV export hiba.' });
        }
    }
);

module.exports = router;
