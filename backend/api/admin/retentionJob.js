// Audit retention job. ADMIN_PANEL.md F9.
// 18 honapnal regebbi audit + alert torlese, lejart admin tokenek tisztitasa.
// Maga a futas is audit entry (action='audit.retention.run').

const adminRepo = require('../../sql/adminRepo.js');
const auditService = require('./auditService.js');
const { AUDIT_RETENTION_DAYS } = require('./constants.js');

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000; // napi 1x
let retentionTimer = null;
let running = false;

async function runRetentionOnce() {
    if (running) {
        return { skipped: true };
    }
    running = true;
    let result = {
        skipped: false,
        deletedAuditRows: 0,
        deletedAlertRows: 0,
        deletedTokenRows: 0,
        deletedEscalationRows: 0
    };

    try {
        const cutoff = new Date(Date.now() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        result.deletedAuditRows = await adminRepo.deleteAuditEntriesOlderThan(cutoff);
        result.deletedAlertRows = await adminRepo.deleteAlertsOlderThan(cutoff);
        result.deletedTokenRows = await adminRepo.deleteExpiredAdminTokens();
        result.deletedEscalationRows = await adminRepo.deleteExpiredRateEscalations();

        // Audit a futasrol (system actor: id=1, ami az admin seed; ha nincs DB, akkor sem dobunk hibat).
        await auditService.recordAuditEntry({
            actorUserId: 1,
            actorUsername: 'system',
            action: 'audit.retention.run',
            severity: 'info',
            targetType: 'audit_retention',
            targetLabel: `cutoff=${cutoff.toISOString()}`,
            reason: `Napi audit retention futas (${AUDIT_RETENTION_DAYS} nap).`,
            beforeState: null,
            afterState: result,
            success: true,
            ipAddress: '127.0.0.1',
            userAgent: 'retention-job',
            requestId: `RETENTION${Date.now()}`.padEnd(26, '0').slice(0, 26)
        });

        console.log('[admin-retention] futas kesz:', result);
    } catch (error) {
        console.error('[admin-retention] hiba:', error.message);
    } finally {
        running = false;
    }
    return result;
}

function startRetentionScheduler() {
    if (retentionTimer) {
        return;
    }
    // Elso futtatas 30 mp keslelltetessel induloskor (DB init utan), hogy ne torjon a startupra.
    setTimeout(() => {
        runRetentionOnce().catch((error) => {
            console.warn('[admin-retention] startup futas hiba:', error.message);
        });
    }, 30 * 1000);
    retentionTimer = setInterval(() => {
        runRetentionOnce().catch((error) => {
            console.warn('[admin-retention] interval futas hiba:', error.message);
        });
    }, RETENTION_INTERVAL_MS);
    console.log(`[admin-retention] scheduler elindult (${AUDIT_RETENTION_DAYS} nap, 24h-onkent)`);
}

function stopRetentionScheduler() {
    if (retentionTimer) {
        clearInterval(retentionTimer);
        retentionTimer = null;
    }
}

module.exports = {
    runRetentionOnce,
    startRetentionScheduler,
    stopRetentionScheduler
};
