// Kepessegek admin CRUD endpointok. /api/admin/abilities ala mountolva.
//
// GET    /              — lista (read-only)
// POST   /              — uj (kritikus, 30 char reason)
// PATCH  /:id           — modositas (kritikus)
// DELETE /:id           — torles (kritikus, FK-guard: ha hasznalt -> 409)

const express = require('express');
const router = express.Router();

const abilities = require('../../sql/modules/abilities.js');
const {
    parseAdminToken,
    requireReasonOnMutate,
    auditContext
} = require('./middleware.js');
const { auditFlush } = require('./auditService.js');
const { adminLimiterChain } = require('./adminRateLimiter.js');
const { ADMIN_PERMISSIONS } = require('./constants.js');

router.get(
    '/',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Belso hiba.' };
        try {
            const list = await abilities.listAbilities();
            payload = { success: true, data: list };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.ABILITIES_VIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.success = true;
            response.locals.adminAudit.skip = true; // read-only mass list, ne logoljuk minden refreshenel
        } catch (error) {
            console.error('admin/abilities GET hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
            response.locals.adminAudit.success = false;
        }
        return response.status(statusCode).json(payload);
    }
);

router.post(
    '/',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.ABILITIES_EDIT),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba.' };
        try {
            const body = request.body || {};
            const created = await abilities.createAbility({
                name: body.name,
                description: body.description,
                cooldownTurns: body.cooldownTurns
            });

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.ABILITIES_EDIT;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'ability';
            response.locals.adminAudit.targetId = created.id;
            response.locals.adminAudit.targetLabel = created.name;
            response.locals.adminAudit.beforeState = null;
            response.locals.adminAudit.afterState = created;
            response.locals.adminAudit.success = true;

            try {
                const hub = request.app?.locals?.adminSocketHub;
                if (hub && typeof hub.broadcastAdmin === 'function') {
                    hub.broadcastAdmin('admin:abilities:changed', { type: 'created', ability: created });
                }
            } catch (_) { /* ignore */ }

            payload = { success: true, message: 'Kepesseg letrehozva.', data: created };
        } catch (error) {
            console.error('admin/abilities POST hiba:', error.message);
            if (statusCode === 200) statusCode = error.message?.includes('mar letezik') ? 409 : 400;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'ABILITY_CREATE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

router.patch(
    '/:id',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.ABILITIES_EDIT),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba.' };
        try {
            const id = Number(request.params.id) || 0;
            if (!id) {
                statusCode = 400;
                throw new Error('Ervenytelen id.');
            }
            const body = request.body || {};
            const patch = {};
            if (Object.prototype.hasOwnProperty.call(body, 'name')) patch.name = body.name;
            if (Object.prototype.hasOwnProperty.call(body, 'description')) patch.description = body.description;
            if (Object.prototype.hasOwnProperty.call(body, 'cooldownTurns')) patch.cooldownTurns = body.cooldownTurns;

            const { before, after } = await abilities.updateAbility(id, patch);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.ABILITIES_EDIT;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'ability';
            response.locals.adminAudit.targetId = id;
            response.locals.adminAudit.targetLabel = after.name;
            response.locals.adminAudit.beforeState = before;
            response.locals.adminAudit.afterState = after;
            response.locals.adminAudit.success = true;

            try {
                const hub = request.app?.locals?.adminSocketHub;
                if (hub && typeof hub.broadcastAdmin === 'function') {
                    hub.broadcastAdmin('admin:abilities:changed', { type: 'updated', ability: after });
                }
            } catch (_) { /* ignore */ }

            payload = { success: true, message: 'Kepesseg mentve.', data: after };
        } catch (error) {
            console.error('admin/abilities PATCH hiba:', error.message);
            if (statusCode === 200) {
                if (error.message?.includes('nem talalhato')) statusCode = 404;
                else if (error.message?.includes('mar letezik')) statusCode = 409;
                else statusCode = 400;
            }
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'ABILITY_UPDATE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

router.delete(
    '/:id',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.ABILITIES_EDIT),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba.' };
        try {
            const id = Number(request.params.id) || 0;
            if (!id) {
                statusCode = 400;
                throw new Error('Ervenytelen id.');
            }
            const { before } = await abilities.deleteAbility(id);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.ABILITIES_EDIT;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'ability';
            response.locals.adminAudit.targetId = id;
            response.locals.adminAudit.targetLabel = before.name;
            response.locals.adminAudit.beforeState = before;
            response.locals.adminAudit.afterState = null;
            response.locals.adminAudit.success = true;

            try {
                const hub = request.app?.locals?.adminSocketHub;
                if (hub && typeof hub.broadcastAdmin === 'function') {
                    hub.broadcastAdmin('admin:abilities:changed', { type: 'deleted', abilityId: id });
                }
            } catch (_) { /* ignore */ }

            payload = { success: true, message: 'Kepesseg torolve.' };
        } catch (error) {
            console.error('admin/abilities DELETE hiba:', error.message);
            if (statusCode === 200) {
                if (error.code === 'ABILITY_IN_USE') statusCode = 409;
                else if (error.message?.includes('nem talalhato')) statusCode = 404;
                else statusCode = 500;
            }
            payload = { success: false, message: error.message || payload.message, code: error.code };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = error.code || 'ABILITY_DELETE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

module.exports = router;
