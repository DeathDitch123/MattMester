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

            // Ongoing PvP meccs lezárása. Ha az ellenfél is letiltott / soft-deleted
            // → no-ELO abort. Egyébként az ellenfél nyer + ELO update. Ezen kívül
            // visszavonjuk a userId KORÁBBI recent abandoned-meccsén kapott ELO-t,
            // ha mindkét fél most már le van tiltva — ezzel sorrend-független lesz.
            try {
                const { abortByUserDisable } = require('../../../chess/abortHelpers.js');
                await abortByUserDisable(targetUserId, 'soft_delete');
            } catch (abortErr) {
                console.warn('soft-delete: chess abort hiba:', abortErr.message);
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


module.exports = router;
