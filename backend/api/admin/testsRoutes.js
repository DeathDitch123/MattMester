// Tesztfuttatasi admin endpointok. /api/admin/tests ala mountolva.
//
// GET  /latest         — utolso run
// GET  /history        — utolso N run (default 20, max 50)
// GET  /running        — eppen futo run (vagy null)
// POST /run            — uj run inditas (super-admin only, mutex)

const express = require('express');
const router = express.Router();

const testRuns = require('../../sql/modules/testRuns.js');
const testRunnerService = require('./testRunnerService.js');
const {
    parseAdminToken,
    requireSuperAdmin,
    requireReasonOnMutate,
    auditContext
} = require('./middleware.js');
const { auditFlush } = require('./auditService.js');
const { adminLimiterChain } = require('./adminRateLimiter.js');
const { ADMIN_PERMISSIONS } = require('./constants.js');

router.get(
    '/latest',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba.' };
        try {
            const latest = await testRuns.latestRun();
            payload = { success: true, data: latest };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.TESTS_VIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.success = true;
            response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/tests/latest hiba:', error.message);
            statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

router.get(
    '/history',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba.' };
        try {
            const list = await testRuns.recentRuns(request.query.limit);
            payload = { success: true, data: list };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.TESTS_VIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.success = true;
            response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/tests/history hiba:', error.message);
            statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

router.get(
    '/running',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba.' };
        try {
            const meta = testRunnerService.getCurrentRunMeta();
            const dbRunning = await testRuns.runningRun();
            payload = {
                success: true,
                data: {
                    inProcess: Boolean(meta),
                    inProcessMeta: meta,
                    dbRunning
                }
            };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.TESTS_VIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.success = true;
            response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/tests/running hiba:', error.message);
            statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

router.post(
    '/run',
    adminLimiterChain,
    parseAdminToken,
    requireSuperAdmin,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.TESTS_RUN),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba.' };
        try {
            const adminAuth = request.adminAuth;
            const hub = request.app?.locals?.adminSocketHub;
            const emit = hub && typeof hub.broadcastAdmin === 'function'
                ? (event, data) => hub.broadcastAdmin(event, data)
                : null;

            const startResult = await testRunnerService.startRun({
                adminUserId: adminAuth.userId,
                emit
            });

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.TESTS_RUN;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'test_run';
            response.locals.adminAudit.targetId = startResult.id;
            response.locals.adminAudit.targetLabel = `test_run#${startResult.id}`;
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: 'Tesztfuttatas elinditva.',
                data: { runId: startResult.id, startedAt: startResult.startedAt }
            };
        } catch (error) {
            console.error('admin/tests/run hiba:', error.message);
            if (statusCode === 200) {
                if (error.code === 'TESTS_ALREADY_RUNNING') statusCode = 409;
                else if (error.code === 'TESTS_DISABLED_IN_PROD') statusCode = 403;
                else statusCode = 500;
            }
            payload = { success: false, message: error.message || payload.message, code: error.code };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = error.code || 'TESTS_RUN_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

module.exports = router;
