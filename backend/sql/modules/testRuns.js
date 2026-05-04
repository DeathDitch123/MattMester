// Tesztfutasok history modul. A testRunnerService irja a recordokat,
// az admin panel olvassa (latest, history, mutex check).

const { getPool } = require('../database.js');

const HISTORY_LIMIT_MAX = 50;
const HISTORY_LIMIT_DEFAULT = 20;

function clampHistoryLimit(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return HISTORY_LIMIT_DEFAULT;
    return Math.min(HISTORY_LIMIT_MAX, Math.max(1, Math.floor(n)));
}

async function recordRunStart(adminUserId) {
    const pool = getPool();
    const [result] = await pool.execute(
        `INSERT INTO test_runs (triggered_by, status) VALUES (?, 'running')`,
        [Number(adminUserId) || null]
    );
    return result.insertId;
}

async function recordRunFinish(runId, summary) {
    const pool = getPool();
    const status = summary.status || 'error';
    const total = Number(summary.total) || 0;
    const passed = Number(summary.passed) || 0;
    const failed = Number(summary.failed) || 0;
    const skipped = Number(summary.skipped) || 0;
    const durationMs = Number(summary.durationMs) || null;
    const rawSummary = summary.rawSummary ? JSON.stringify(summary.rawSummary).slice(0, 4 * 1024 * 1024) : null;
    const stderrTail = summary.stderrTail ? String(summary.stderrTail).slice(-4096) : null;

    await pool.execute(
        `UPDATE test_runs
         SET finished_at = CURRENT_TIMESTAMP,
             status = ?,
             total = ?, passed = ?, failed = ?, skipped = ?,
             duration_ms = ?, raw_summary = ?, stderr_tail = ?
         WHERE id = ?`,
        [status, total, passed, failed, skipped, durationMs, rawSummary, stderrTail, Number(runId)]
    );
}

function rowToRun(row) {
    if (!row) return null;
    let raw = null;
    if (row.raw_summary) {
        try {
            raw = typeof row.raw_summary === 'string' ? JSON.parse(row.raw_summary) : row.raw_summary;
        } catch (_) { raw = null; }
    }
    return {
        id: row.id,
        triggeredBy: row.triggered_by,
        triggeredByUsername: row.triggered_by_username || null,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
        status: row.status,
        total: Number(row.total) || 0,
        passed: Number(row.passed) || 0,
        failed: Number(row.failed) || 0,
        skipped: Number(row.skipped) || 0,
        durationMs: row.duration_ms,
        rawSummary: raw,
        stderrTail: row.stderr_tail
    };
}

async function latestRun() {
    const pool = getPool();
    const [rows] = await pool.execute(
        `SELECT t.*, u.username AS triggered_by_username
         FROM test_runs t
         LEFT JOIN users u ON u.id = t.triggered_by
         ORDER BY t.id DESC
         LIMIT 1`
    );
    return rowToRun(rows[0]);
}

async function recentRuns(limit) {
    const pool = getPool();
    const safeLimit = clampHistoryLimit(limit);
    const [rows] = await pool.execute(
        `SELECT t.id, t.triggered_by, u.username AS triggered_by_username,
                t.started_at, t.finished_at, t.status,
                t.total, t.passed, t.failed, t.skipped, t.duration_ms
         FROM test_runs t
         LEFT JOIN users u ON u.id = t.triggered_by
         ORDER BY t.id DESC
         LIMIT ${safeLimit}`
    );
    return rows.map(rowToRun);
}

async function runningRun() {
    const pool = getPool();
    const [rows] = await pool.execute(
        `SELECT t.*, u.username AS triggered_by_username
         FROM test_runs t
         LEFT JOIN users u ON u.id = t.triggered_by
         WHERE t.status = 'running'
         ORDER BY t.id DESC
         LIMIT 1`
    );
    return rowToRun(rows[0]);
}

// Cleanup: server restart utan az "lengyo" running statuszu sorokat eligazitja
// timeout-ra. Hivni az initDatabase utan.
async function cleanupOrphanedRunning() {
    const pool = getPool();
    try {
        await pool.execute(
            `UPDATE test_runs
             SET status = 'error', finished_at = CURRENT_TIMESTAMP,
                 stderr_tail = 'Szerver ujraindult fuzes kozben — recovery cleanup.'
             WHERE status = 'running'`
        );
    } catch (error) {
        console.warn('testRuns.cleanupOrphanedRunning hiba:', error.message);
    }
}

module.exports = {
    recordRunStart,
    recordRunFinish,
    latestRun,
    recentRuns,
    runningRun,
    cleanupOrphanedRunning
};
