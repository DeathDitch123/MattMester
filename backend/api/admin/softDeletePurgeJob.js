// Soft-delete purge job. A pending_deletion_until-on lejart user-eket fizikailag torli.
// Orankent fut, hogy a 24h grace utan max ~1 ora mulva tenyleg eltunjenek a fiokok.
// A `deleteUserProfileWithTransaction` ugyanazt a hard-delete folyamatot vegzi mint
// kor reg a self-delete vagy az admin-delete (banned_emails snapshot, FK NULL, stb.).

const sql = require('../../sql/sql_functions.js');
const auditService = require('./auditService.js');

const PURGE_INTERVAL_MS = 60 * 60 * 1000; // 1 ora
const STARTUP_DELAY_MS = 60 * 1000; // 1 perc serv-startup utan
let purgeTimer = null;
let running = false;

async function runPurgeOnce() {
    if (running) return { skipped: true };
    running = true;

    let result = {
        skipped: false,
        candidates: 0,
        purged: 0,
        failed: 0,
        userIds: []
    };

    try {
        const expiredIds = await sql.listExpiredSoftDeletedUserIds();
        result.candidates = expiredIds.length;

        for (const userId of expiredIds) {
            try {
                const r = await sql.deleteUserProfileWithTransaction(userId);
                if (r && r.deleted) {
                    result.purged += 1;
                    result.userIds.push(r.userId || userId);
                }
            } catch (err) {
                result.failed += 1;
                console.warn(`[soft-delete-purge] user ${userId} hard-delete hiba:`, err.message);
            }
        }

        if (result.candidates > 0) {
            await auditService.recordAuditEntry({
                actorUserId: 1,
                actorUsername: 'system',
                action: 'users.soft_delete_purge',
                severity: 'info',
                targetType: 'users',
                targetLabel: `purge ${result.purged}/${result.candidates} (failed=${result.failed})`,
                reason: 'Soft-delete grace lejart -> hard-delete.',
                beforeState: null,
                afterState: result,
                success: true,
                ipAddress: '127.0.0.1',
                userAgent: 'soft-delete-purge-job',
                requestId: `SDPURGE${Date.now()}`.padEnd(26, '0').slice(0, 26)
            }).catch((auditErr) => {
                console.warn('[soft-delete-purge] audit log hiba:', auditErr.message);
            });

            console.log(`[soft-delete-purge] hard-delete eredmeny: ${result.purged}/${result.candidates} (failed=${result.failed})`);
        }
    } catch (error) {
        console.error('[soft-delete-purge] hiba:', error.message);
    } finally {
        running = false;
    }

    return result;
}

function startSoftDeletePurgeScheduler() {
    if (purgeTimer) return;
    setTimeout(() => {
        runPurgeOnce().catch((err) => console.warn('[soft-delete-purge] startup hiba:', err.message));
    }, STARTUP_DELAY_MS);
    purgeTimer = setInterval(() => {
        runPurgeOnce().catch((err) => console.warn('[soft-delete-purge] interval hiba:', err.message));
    }, PURGE_INTERVAL_MS);
    console.log('[soft-delete-purge] scheduler elindult (orankenti futtatas)');
}

function stopSoftDeletePurgeScheduler() {
    if (purgeTimer) {
        clearInterval(purgeTimer);
        purgeTimer = null;
    }
}

module.exports = {
    runPurgeOnce,
    startSoftDeletePurgeScheduler,
    stopSoftDeletePurgeScheduler
};
