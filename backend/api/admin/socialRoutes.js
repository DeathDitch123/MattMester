// Kozossegi kapcsolatok admin endpointok. /api/admin/social ala mountolva.
//
// GET  /requests       — pending baratkereses lista
// GET  /blocks         — aktiv blokkok
// GET  /counts         — stats szamlalok (osszes baratsag / pending / blokk)
// POST /blocks/:blockerId/:blockedId/unblock — kritikus muvelet (admin felold)

const express = require('express');
const router = express.Router();

const socialAdmin = require('../../sql/modules/socialAdmin.js');
const {
    parseAdminToken,
    requireReasonOnMutate,
    auditContext
} = require('./middleware.js');
const { auditFlush } = require('./auditService.js');
const { adminLimiterChain } = require('./adminRateLimiter.js');
const { ADMIN_PERMISSIONS } = require('./constants.js');

router.get(
    '/counts',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba.' };
        try {
            const counts = await socialAdmin.getSocialCounts();
            payload = { success: true, data: counts };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.SOCIAL_VIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.success = true;
            response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/social/counts GET hiba:', error.message);
            statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.success = false;
        }
        return response.status(statusCode).json(payload);
    }
);

router.get(
    '/requests',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Belso hiba.' };
        try {
            const list = await socialAdmin.listFriendRequests({
                status: request.query.status || 'pending',
                limit: request.query.limit,
                offset: request.query.offset
            });
            payload = { success: true, data: list };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.SOCIAL_VIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.success = true;
            response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/social/requests GET hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
            response.locals.adminAudit.success = false;
        }
        return response.status(statusCode).json(payload);
    }
);

router.get(
    '/blocks',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Belso hiba.' };
        try {
            const list = await socialAdmin.listFriendBlocks({
                activeOnly: String(request.query.includeInactive || '') !== 'true',
                limit: request.query.limit,
                offset: request.query.offset
            });
            payload = { success: true, data: list };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.SOCIAL_VIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.success = true;
            response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/social/blocks GET hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
            response.locals.adminAudit.success = false;
        }
        return response.status(statusCode).json(payload);
    }
);

router.post(
    '/blocks/:blockerId/:blockedId/unblock',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.SOCIAL_UNBLOCK),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba.' };
        try {
            const blockerId = Number(request.params.blockerId) || 0;
            const blockedId = Number(request.params.blockedId) || 0;
            if (!blockerId || !blockedId) {
                statusCode = 400;
                throw new Error('Ervenytelen blocker/blocked id.');
            }
            const { before, after } = await socialAdmin.forceUnblock(blockerId, blockedId);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.SOCIAL_UNBLOCK;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'friend_block';
            response.locals.adminAudit.targetId = before.id;
            response.locals.adminAudit.targetLabel = `block#${before.id}`;
            response.locals.adminAudit.beforeState = before;
            response.locals.adminAudit.afterState = after;
            response.locals.adminAudit.success = true;

            try {
                const hub = request.app?.locals?.adminSocketHub;
                if (hub && typeof hub.broadcastAdmin === 'function') {
                    hub.broadcastAdmin('admin:social:block_changed', {
                        type: 'unblocked',
                        blockerId, blockedId
                    });
                }
            } catch (_) { /* ignore */ }

            payload = { success: true, message: 'A blokk feloldva.' };
        } catch (error) {
            console.error('admin/social unblock hiba:', error.message);
            if (statusCode === 200) {
                if (error.code === 'BLOCK_NOT_FOUND') statusCode = 404;
                else if (error.code === 'BLOCK_INACTIVE') statusCode = 409;
                else statusCode = 500;
            }
            payload = { success: false, message: error.message || payload.message, code: error.code };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = error.code || 'SOCIAL_UNBLOCK_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

module.exports = router;
