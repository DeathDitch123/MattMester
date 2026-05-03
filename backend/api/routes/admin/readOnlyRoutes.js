// Eredetileg a backend/api/routes/admin.js egyetlen fajlban volt — szet lett bontva
// rendeltetes szerinti sub-router-ekre. Az index.js mountolja oket /api/admin ala.

const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const sql = require('../../../sql/sql_functions.js');
const adminRepo = require('../../../sql/adminRepo.js');
const { passwordRegex } = require('../../validation.js');

const {
    parseAdminToken,
    requireSuperAdmin,
    requireReasonOnMutate,
    auditContext
} = require('../../admin/middleware.js');
const { auditFlush } = require('../../admin/auditService.js');
const alertingService = require('../../admin/alertingService.js');
const { adminLimiterChain } = require('../../admin/adminRateLimiter.js');
const { ADMIN_PERMISSIONS, ADMIN_ERROR_CODES } = require('../../admin/constants.js');
const { invalidateIpBlockCache } = require('../../middleware/ipBlockGuard.js');
const networkClassifier = require('../../admin/networkClassifier.js');
const { escapeCsvValue } = require('./_helpers.js');

const router = express.Router();

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

            // Ongoing PvP meccs lezárása. Ha az ellenfél is letiltott / soft-deleted
            // → no-ELO abort. Egyébként az ellenfél nyer + ELO update. Ezen kívül
            // visszavonjuk a userId KORÁBBI recent abandoned-meccsén kapott ELO-t,
            // ha mindkét fél most már le van tiltva (sorrend-független "egyik se kap ELO-t").
            try {
                const { abortByUserDisable } = require('../../../chess/abortHelpers.js');
                await abortByUserDisable(userId, 'ban');
            } catch (abortErr) {
                console.warn('ban: chess abort hiba:', abortErr.message);
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


module.exports = router;
