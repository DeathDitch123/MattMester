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


module.exports = router;
