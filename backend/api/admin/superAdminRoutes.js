// Super-admin specifikus endpointok. ADMIN_PANEL.md §3.3, F6.
// Csak is_super_admin=TRUE userek erhetik el. Last-super-admin lock vedi a "kiur" allapotot.

const express = require('express');
const router = express.Router();

const adminRepo = require('../../sql/adminRepo.js');
const tokenService = require('./tokenService.js');
const {
    parseAdminToken,
    requireSuperAdmin,
    requireReasonOnMutate,
    auditContext
} = require('./middleware.js');
const { auditFlush } = require('./auditService.js');
const { adminLimiterChain } = require('./adminRateLimiter.js');
const { ADMIN_PERMISSIONS, ADMIN_ERROR_CODES } = require('./constants.js');

// GET /api/admin/admins - admin user lista
router.get(
    '/',
    adminLimiterChain,
    parseAdminToken,
    requireSuperAdmin,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Belso hiba az admin lista lekerdezeseben.' };
        try {
            const list = await adminRepo.getAdminUserList();
            payload = {
                success: true,
                data: list.map((user) => ({
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    isSuperAdmin: Boolean(user.is_super_admin),
                    lastActive: user.last_active,
                    createdAt: user.created_at
                })),
                message: `${list.length} admin user.`
            };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.ADMIN_LIST;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.success = true;
        } catch (error) {
            console.error('admin/admins GET hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'ADMIN_LIST_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// POST /api/admin/admins/grant
// Body: { targetUserId, reason, makeSuper? }
router.post(
    '/grant',
    adminLimiterChain,
    parseAdminToken,
    requireSuperAdmin,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.ADMIN_GRANT),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba a grant soran.' };
        try {
            const targetUserId = Number(request.body?.targetUserId) || 0;
            const makeSuper = Boolean(request.body?.makeSuper);
            if (!targetUserId) {
                statusCode = 400;
                throw new Error('A targetUserId mezo kotelezo.');
            }

            const { beforeState, afterState } = await adminRepo.setUserAdminRole(targetUserId, true, makeSuper);
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.ADMIN_GRANT;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'user';
            response.locals.adminAudit.targetId = targetUserId;
            response.locals.adminAudit.targetLabel = afterState?.username || beforeState?.username || null;
            response.locals.adminAudit.beforeState = beforeState;
            response.locals.adminAudit.afterState = afterState;
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: makeSuper ? 'Super-admin jog megadva.' : 'Admin jog megadva.',
                data: {
                    userId: targetUserId,
                    role: afterState?.role,
                    isSuperAdmin: Boolean(afterState?.is_super_admin)
                }
            };
        } catch (error) {
            console.error('admin/admins/grant hiba:', error.message);
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'ADMIN_GRANT_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// POST /api/admin/admins/revoke
// Body: { targetUserId, reason }
// Last-super-admin lock: nem lehet utolsoket levenni.
router.post(
    '/revoke',
    adminLimiterChain,
    parseAdminToken,
    requireSuperAdmin,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.ADMIN_REVOKE),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba a revoke soran.' };
        try {
            const targetUserId = Number(request.body?.targetUserId) || 0;
            const adminAuth = request.adminAuth;

            if (!targetUserId) {
                statusCode = 400;
                throw new Error('A targetUserId mezo kotelezo.');
            }

            // DB szintu beforeState lekerdezese (kell a lockhoz)
            const targetUser = await adminRepo.getUserForAdminAuth(targetUserId);
            if (!targetUser) {
                statusCode = 404;
                throw new Error('A celzott felhasznalo nem talalhato.');
            }

            // Last-super-admin lock: ha targetUser super es ez az utolso super.
            if (targetUser.is_super_admin) {
                const totalSupers = await adminRepo.countSuperAdmins();
                if (totalSupers <= 1) {
                    statusCode = 409;
                    response.locals.adminAudit.errorCode = ADMIN_ERROR_CODES.LAST_SUPER_LOCK;
                    throw new Error('Az utolso super-admin nem fokozhato le. Elobb nevezz ki masik super-admint.');
                }
                // Nem engedjuk, hogy super-admin onmaga supersegget vegye le (csak masik super tudja).
                if (Number(adminAuth.userId) === Number(targetUserId)) {
                    statusCode = 409;
                    response.locals.adminAudit.errorCode = ADMIN_ERROR_CODES.LAST_SUPER_LOCK;
                    throw new Error('A sajat super-admin jogot nem veheted le. Kerd meg masik super-admint.');
                }
            }

            const { beforeState, afterState } = await adminRepo.setUserAdminRole(targetUserId, false, false);

            // Az erintett user osszes admin tokenje is invalidalva.
            await tokenService.revokeAllForUser(targetUserId);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.ADMIN_REVOKE;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'user';
            response.locals.adminAudit.targetId = targetUserId;
            response.locals.adminAudit.targetLabel = beforeState?.username || null;
            response.locals.adminAudit.beforeState = beforeState;
            response.locals.adminAudit.afterState = afterState;
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: 'Admin jog visszavonva.',
                data: {
                    userId: targetUserId,
                    role: afterState?.role,
                    isSuperAdmin: Boolean(afterState?.is_super_admin)
                }
            };
        } catch (error) {
            console.error('admin/admins/revoke hiba:', error.message);
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.success = false;
            if (!response.locals.adminAudit.errorCode) {
                response.locals.adminAudit.errorCode = 'ADMIN_REVOKE_FAILED';
            }
        }
        return response.status(statusCode).json(payload);
    }
);

module.exports = router;
