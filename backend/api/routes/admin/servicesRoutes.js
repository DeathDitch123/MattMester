// Issue #41 — service iranyitopult endpoint.
//
// Read-only API a hatterszolgaltatasok aktualis allapotarol. Egyetlen GET ad
// vissza minden runtime-info-t: DB pool status, schedulerek, memoria, uptime,
// aktiv meccsek szama, teszt-runner, karbantartas mod, site_settings.
//
// A frontend admin panel /services oldalon 5 mp-kent polleli vagy az
// admin:stats:tick-en piggyback-el.

const express = require('express');
const { parseAdminToken, auditContext } = require('../../admin/middleware.js');
const { auditFlush } = require('../../admin/auditService.js');
const { adminLimiterChain } = require('../../admin/adminRateLimiter.js');

const router = express.Router();

function getDbStatus() {
    let result = { connected: false, status: 'unknown' };
    try {
        const { getPool } = require('../../../sql/database.js');
        const pool = getPool();
        if (!pool) {
            result = { connected: false, status: 'no_pool' };
        } else if (pool._closed) {
            result = { connected: false, status: 'closed' };
        } else {
            result = { connected: true, status: 'open' };
        }
    } catch (error) {
        result = { connected: false, status: 'error', message: error.message };
    }
    return result;
}

function getProcessMetrics() {
    let result = null;
    try {
        const memory = process.memoryUsage();
        result = {
            uptimeSec: Math.floor(process.uptime()),
            pid: process.pid,
            nodeVersion: process.version,
            platform: process.platform,
            memoryRssMb: Math.round((memory.rss / (1024 * 1024)) * 100) / 100,
            memoryHeapUsedMb: Math.round((memory.heapUsed / (1024 * 1024)) * 100) / 100,
            memoryHeapTotalMb: Math.round((memory.heapTotal / (1024 * 1024)) * 100) / 100,
            memoryExternalMb: Math.round((memory.external / (1024 * 1024)) * 100) / 100
        };
    } catch (_) { /* fail-open */ }
    return result;
}

function getMaintenanceState() {
    let result = { maintenanceMode: false, scheduler: null };
    try {
        const siteSettings = require('../../../sql/modules/siteSettings.js');
        const cached = siteSettings.getSettingsCachedSync();
        result.maintenanceMode = !!cached?.maintenanceMode;

        const sched = require('../../admin/maintenanceScheduler.js');
        result.scheduler = sched.getMeta();
    } catch (_) { /* fail-open */ }
    return result;
}

function getTestRunnerState() {
    let result = { running: false, meta: null, productionDisabled: false };
    try {
        const tr = require('../../admin/testRunnerService.js');
        result.running = tr.isRunning();
        result.meta = tr.getCurrentRunMeta();
        result.productionDisabled = tr.isProductionDisabled();
    } catch (_) { /* fail-open */ }
    return result;
}

function getActiveGamesCount() {
    // A jatekok Map nincs exportalva, igy a barmilyen-aktiv-hitelszer
    // becslessel adjuk vissza: 0..N range-ben count-olunk a jatekKeres-szel.
    // Ennel jobb lenne ha a state.js exportalna egy size()-getter-t — TODO.
    let count = 0;
    try {
        const { jatekKeres } = require('../../../sql/database.js') === undefined
            ? require('../../../chess/state.js')
            : require('../../../chess/state.js');
        // Auto-inkrementalt id-k 1..10000 tartomany
        for (let id = 0; id < 10000; id++) {
            const j = jatekKeres(id);
            if (j && !j.vege) count += 1;
        }
    } catch (_) { /* fail-open */ }
    return count;
}

function getSiteSettings() {
    let result = null;
    try {
        const siteSettings = require('../../../sql/modules/siteSettings.js');
        result = siteSettings.getSettingsCachedSync();
    } catch (_) { /* fail-open */ }
    return result;
}

router.get(
    '/services/snapshot',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: null, message: 'Belso hiba a service snapshot soran.' };
        try {
            const data = {
                occurredAt: new Date().toISOString(),
                process: getProcessMetrics(),
                database: getDbStatus(),
                maintenance: getMaintenanceState(),
                testRunner: getTestRunnerState(),
                activeChessGames: getActiveGamesCount(),
                siteSettings: getSiteSettings(),
                schedulers: {
                    // A schedulerek nem exportaljak az "is-running" allapotot —
                    // azt kell tudnunk hogy elindultak-e a server.js-ben. Itt csak
                    // a konstans tervezett intervallumot adjuk vissza, hogy a
                    // frontend megjelenitse "Retention: 24h-onkent fut".
                    retention: { intervalMs: 24 * 60 * 60 * 1000, label: '24 oranta' },
                    softDeletePurge: { intervalMs: 60 * 60 * 1000, label: '1 oranta' },
                    statsTick: { intervalMs: 5 * 1000, label: '5 mp-enkent' }
                }
            };
            payload = { success: true, data };
            // Read-only endpoint: ne logoljon audit-ba minden snapshot-fetcht.
            if (response.locals.adminAudit) response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/services/snapshot hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: null, message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

module.exports = router;
