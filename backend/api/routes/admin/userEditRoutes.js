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

const router = express.Router();

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
                    // Issue (2026-05) — a regi `services.js` modul torolve lett.
                    // Ezert kozvetlenul a sql.insertNotification-t hivjuk. A live-broadcast
                    // a hivasi helyen (admin notifyHandler / socketHub) tortenik mar.
                    await sql.insertNotification(notifPayload);
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


module.exports = router;
