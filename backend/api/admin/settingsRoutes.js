// Site-wide beallitasok admin endpointok. /api/admin/settings ala mountolva.
// GET — aktualis settings olvasasa (read-only, audit info severity-vel)
// PUT — patch (kritikus: 30 char reason kotelezo, audit critical)
//
// A maintenance + registration toggle elesben hat a public middleware-ekben.

const express = require('express');
const router = express.Router();

const siteSettings = require('../../sql/modules/siteSettings.js');
const maintenanceScheduler = require('./maintenanceScheduler.js');
const {
    parseAdminToken,
    requireReasonOnMutate,
    auditContext
} = require('./middleware.js');
const { auditFlush } = require('./auditService.js');
const { adminLimiterChain } = require('./adminRateLimiter.js');
const { ADMIN_PERMISSIONS } = require('./constants.js');

// GET /api/admin/settings — aktualis settings
router.get(
    '/',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba a settings olvasasaban.' };
        try {
            const settings = await siteSettings.getSettings();
            payload = { success: true, data: settings };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.SETTINGS_VIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.success = true;
        } catch (error) {
            console.error('admin/settings GET hiba:', error.message);
            statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'SETTINGS_READ_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// PUT /api/admin/settings — patch (kritikus muvelet)
// Body: { reason, siteName?, supportEmail?, defaultLanguage?, timezone?,
//         registrationEnabled?, maintenanceMode? }
router.put(
    '/',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.SETTINGS_EDIT),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba a settings mentesnel.' };
        try {
            const adminAuth = request.adminAuth;
            const body = request.body || {};

            const allowedKeys = [
                'siteName',
                'supportEmail',
                'defaultLanguage',
                'timezone',
                'registrationEnabled',
                'maintenanceMode'
            ];
            const patch = {};
            for (const key of allowedKeys) {
                if (Object.prototype.hasOwnProperty.call(body, key)) {
                    patch[key] = body[key];
                }
            }

            if (Object.keys(patch).length === 0) {
                statusCode = 400;
                throw new Error('Egy mezot meg kell adnod a patch-ben.');
            }

            const { before, after } = await siteSettings.updateSettings(patch, adminAuth.userId);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.SETTINGS_EDIT;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'site_settings';
            response.locals.adminAudit.targetId = 1;
            response.locals.adminAudit.targetLabel = 'site_settings#1';
            response.locals.adminAudit.beforeState = before;
            response.locals.adminAudit.afterState = after;
            response.locals.adminAudit.success = true;

            // WebSocket broadcast a tobbi admin-nak (ha valaki masik tab-on nezi)
            try {
                const hub = request.app?.locals?.adminSocketHub;
                if (hub && typeof hub.broadcastAdmin === 'function') {
                    hub.broadcastAdmin('admin:settings:updated', { settings: after });
                }
            } catch (_) { /* ignore */ }

            // Maintenance toggle hatasanak elindítasa: BE kapcsoláskor scheduler indul,
            // KI kapcsoláskor scheduler torol. EXTRA: ha a toggle isOn === wasOn === true
            // (admin save-elt valami mast, miközben maintenance ON), akkor ujra emit-eljuk
            // az enforce-ot a klienseknek — gyakorlati UX: "ha maintenance be van kapcsolva
            // es save-elek, akkor minden user kiujuljon, akkor is ha mar reg ki kellett volna lenniuk".
            try {
                const wasOn = Boolean(before?.maintenanceMode);
                const isOn = Boolean(after?.maintenanceMode);
                console.log('[maintenance] toggle valtozas: wasOn=%s isOn=%s', wasOn, isOn);
                const socketHub = request.app?.locals?.socketHub;
                if (!socketHub) {
                    console.warn('[maintenance] FIGYELEM: app.locals.socketHub nincs beallitva — broadcast nem mukodik');
                } else {
                    console.log('[maintenance] socketHub elerheto, broadcastSystemEvent =', typeof socketHub.broadcastSystemEvent);
                }
                if (!wasOn && isOn) {
                    const result = maintenanceScheduler.startMaintenanceTransition({ socketHub });
                    console.log('[maintenance] BE kapcsolva mode=%s scheduledEnforceAt=%s', result.mode, result.scheduledEnforceAt?.toISOString());
                } else if (wasOn && !isOn) {
                    maintenanceScheduler.cancelMaintenanceTransition({ socketHub });
                    console.log('[maintenance] KI kapcsolva, scheduler torolve');
                } else if (isOn && wasOn) {
                    // Re-emit: a toggle valtozatlanul ON, de a save tortent — minden online
                    // non-admin user kapjon meg egy frisss enforce-ot (idempotens, redirect-eli
                    // azokat akik valamiert meg a normal oldalon vannak).
                    if (socketHub && typeof socketHub.broadcastSystemEvent === 'function') {
                        socketHub.broadcastSystemEvent('maintenance:enforce', {
                            kind: 'maintenance:enforce',
                            message: 'A karbantartás folyamatban van.',
                            sentAt: new Date().toISOString(),
                            reEmit: true
                        });
                        console.log('[maintenance] re-emit enforce (toggle valtozatlanul ON)');
                    }
                }
            } catch (mErr) {
                console.warn('maintenance toggle scheduler hiba:', mErr.message);
            }

            payload = { success: true, message: 'Beallitasok mentve.', data: after };
        } catch (error) {
            console.error('admin/settings PUT hiba:', error.message);
            if (statusCode === 200) statusCode = error.message?.includes('ervenyt') || error.message?.includes('max') || error.message?.includes('ures') ? 400 : 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'SETTINGS_UPDATE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

module.exports = router;
