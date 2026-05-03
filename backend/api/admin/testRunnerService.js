// Test runner service. Az admin panel "Tesztek" oldal indithatja super-admin
// jogkorrel. Mutex biztositja, hogy csak egy futas legyen egyszerre.
//
// Biztonsag:
//   - Csak super-admin futtathat (a route-on requireSuperAdmin allit le)
//   - Production-ban alapertelmezetten kikapcsolva (process.env.ALLOW_ADMIN_TESTS
//     === 'true' szukseges)
//   - 10 perces hard timeout, kill-cleanup
//   - Mutex: in-process flag + DB-ben "running" status check (race vedelem)
//
// Streamel: minden 5 mp-ben heartbeat (admin:tests:progress event), befejezes-
// kor admin:tests:finished event a teljes summary-vel.

const { spawn } = require('child_process');
const path = require('path');
const testRuns = require('../../sql/modules/testRuns.js');

const TEST_RUN_TIMEOUT_MS = 10 * 60 * 1000; // 10 perc
const HEARTBEAT_INTERVAL_MS = 5 * 1000;     // 5 mp

let currentRun = null; // { id, startedAt, child, heartbeatTimerId, killTimerId }

function isProductionDisabled() {
    const env = String(process.env.NODE_ENV || '').toLowerCase();
    if (env !== 'production') return false;
    return String(process.env.ALLOW_ADMIN_TESTS || '').toLowerCase() !== 'true';
}

function isRunning() {
    return currentRun !== null;
}

function getCurrentRunMeta() {
    if (!currentRun) return null;
    return {
        id: currentRun.id,
        startedAt: currentRun.startedAt,
        durationMs: Date.now() - currentRun.startedAtMs
    };
}

function clearTimers(run) {
    if (run.heartbeatTimerId) {
        clearInterval(run.heartbeatTimerId);
        run.heartbeatTimerId = null;
    }
    if (run.killTimerId) {
        clearTimeout(run.killTimerId);
        run.killTimerId = null;
    }
}

// Jest --json kimenet parsing. Egy JSON objektumot adunk vissza vagy null-t.
function tryParseJestJson(text) {
    if (!text) return null;
    // Jest --json alapertelmezetten egy JSON-t ir a stdout-ra. Neha extra logok
    // is jonnek, de a JSON az utolso valid blokk. Megpróbáljuk megtalálni a
    // legutolsó { ... } parolt JSON-t a stringben.
    const trimmed = text.trim();
    try {
        return JSON.parse(trimmed);
    } catch (_) { /* ignore */ }
    // Fallback: keresunk a stringben utolso `{` -tol megfelelo `}` -ig.
    let depth = 0;
    let start = -1;
    let lastJson = null;
    for (let i = 0; i < trimmed.length; i++) {
        const c = trimmed[i];
        if (c === '{') {
            if (depth === 0) start = i;
            depth += 1;
        } else if (c === '}') {
            depth -= 1;
            if (depth === 0 && start !== -1) {
                try {
                    const candidate = trimmed.slice(start, i + 1);
                    const obj = JSON.parse(candidate);
                    if (obj && typeof obj === 'object') lastJson = obj;
                } catch (_) { /* skip */ }
                start = -1;
            }
        }
    }
    return lastJson;
}

function summarizeJestResult(jestResult) {
    if (!jestResult || typeof jestResult !== 'object') {
        return { total: 0, passed: 0, failed: 0, skipped: 0 };
    }
    return {
        total: Number(jestResult.numTotalTests) || 0,
        passed: Number(jestResult.numPassedTests) || 0,
        failed: Number(jestResult.numFailedTests) || 0,
        skipped: Number(jestResult.numPendingTests || 0) + Number(jestResult.numTodoTests || 0)
    };
}

// emit: io.of('/admin').emit fuggveny — opcionalis, lehet null is.
async function startRun({ adminUserId, emit }) {
    if (isProductionDisabled()) {
        const err = new Error('A tesztfuttato production-ban alapertelmezetten kikapcsolva. ALLOW_ADMIN_TESTS=true env szukseges.');
        err.code = 'TESTS_DISABLED_IN_PROD';
        throw err;
    }
    if (currentRun) {
        const err = new Error('Mar fut egy tesztfuttatas. Varj amig befejezodik.');
        err.code = 'TESTS_ALREADY_RUNNING';
        throw err;
    }

    const runId = await testRuns.recordRunStart(adminUserId);
    const startedAtMs = Date.now();
    const run = {
        id: runId,
        startedAt: new Date(startedAtMs).toISOString(),
        startedAtMs,
        child: null,
        heartbeatTimerId: null,
        killTimerId: null,
        stdoutChunks: [],
        stderrChunks: []
    };
    currentRun = run;

    const cwd = path.resolve(__dirname, '..', '..');
    const isWin = process.platform === 'win32';
    // Windows: shell:true szukseges a .cmd batch fileok (npx.cmd, npm.cmd)
    // futtatasahoz Node 20+ alatt — kulonben spawn EINVAL.
    // Linux/Mac: shell:false eleg, de a shell:true is mukodik (escape-elve adjuk at az argokat).
    // --json: egy JSON objektum a stdout-ra a vegen
    // --silent: tesztek console.log-jait nem nyomja a stdout-ra (igy a JSON tisztabb)
    // --ci: nem kerdez interactiv promptot
    const cmd = isWin ? 'npx.cmd' : 'npx';
    // --config jest.config.js: explicit konfig — a backend/package.json-ban is van
    // egy `jest` kulcs, igy implicit feloldas "Multiple configurations found" hibat dobna.
    const args = ['jest', '--config', 'jest.config.js', '--json', '--silent', '--ci'];

    try {
        run.child = spawn(cmd, args, {
            cwd,
            env: { ...process.env, CI: 'true' },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
            shell: isWin
        });
    } catch (spawnErr) {
        currentRun = null;
        await testRuns.recordRunFinish(runId, {
            status: 'error',
            stderrTail: `spawn hiba: ${spawnErr.message}`
        }).catch(() => {});
        throw spawnErr;
    }

    if (typeof emit === 'function') {
        try {
            emit('admin:tests:started', {
                runId: run.id,
                startedAt: run.startedAt,
                triggeredBy: adminUserId
            });
        } catch (_) { /* ignore */ }
    }

    run.child.stdout.on('data', (chunk) => {
        run.stdoutChunks.push(chunk);
    });
    run.child.stderr.on('data', (chunk) => {
        run.stderrChunks.push(chunk);
    });

    // Heartbeat
    run.heartbeatTimerId = setInterval(() => {
        if (typeof emit === 'function') {
            try {
                emit('admin:tests:progress', {
                    runId: run.id,
                    elapsedMs: Date.now() - run.startedAtMs
                });
            } catch (_) { /* ignore */ }
        }
    }, HEARTBEAT_INTERVAL_MS);

    // Hard timeout
    run.killTimerId = setTimeout(() => {
        try {
            if (run.child && !run.child.killed) {
                run.child.kill('SIGKILL');
            }
        } catch (_) { /* ignore */ }
    }, TEST_RUN_TIMEOUT_MS);

    // Process complete handler
    const onComplete = async (exitCode, signal) => {
        clearTimers(run);
        if (currentRun && currentRun.id !== run.id) return; // mas run-hoz tartozik (shouldn't happen)

        const stdout = Buffer.concat(run.stdoutChunks).toString('utf8');
        const stderr = Buffer.concat(run.stderrChunks).toString('utf8');
        const durationMs = Date.now() - run.startedAtMs;
        const wasKilled = signal === 'SIGKILL' || signal === 'SIGTERM';
        const timedOut = wasKilled && durationMs >= TEST_RUN_TIMEOUT_MS - 500;

        let status;
        if (timedOut) status = 'timeout';
        else if (wasKilled) status = 'error';
        else if (exitCode === 0) status = 'passed';
        else if (exitCode === 1) status = 'failed';
        else status = 'error';

        const jestResult = tryParseJestJson(stdout);
        const counts = summarizeJestResult(jestResult);

        const summary = {
            status,
            total: counts.total,
            passed: counts.passed,
            failed: counts.failed,
            skipped: counts.skipped,
            durationMs,
            rawSummary: jestResult ? (() => {
                const suites = Array.isArray(jestResult.testResults) ? jestResult.testResults : [];
                // Jest CLI --json kimenete a testResults[i] szinten NEM ad numPassingTests
                // mezot — csak assertionResults arrayt + status (passed/failed). Manualisan
                // szamoljuk meg, hogy a frontend tudjon ertelmes szamokat mutatni.
                const mapped = suites.slice(0, 100).map((tr) => {
                    const assertions = Array.isArray(tr.assertionResults) ? tr.assertionResults : [];
                    let passing = 0, failing = 0, pending = 0, todo = 0;
                    for (const a of assertions) {
                        switch (a.status) {
                            case 'passed':  passing += 1; break;
                            case 'failed':  failing += 1; break;
                            case 'pending':
                            case 'skipped':
                            case 'disabled': pending += 1; break;
                            case 'todo':    todo += 1; break;
                            default: break;
                        }
                    }
                    // Jest tenyleges suite-szintu ideje (ms) — (endTime - startTime).
                    const suiteDurationMs = (Number.isFinite(tr.endTime) && Number.isFinite(tr.startTime))
                        ? Math.max(0, tr.endTime - tr.startTime)
                        : null;
                    return {
                        name: tr.name || tr.testFilePath,
                        status: tr.status || (failing > 0 ? 'failed' : 'passed'),
                        numFailingTests: failing,
                        numPassingTests: passing,
                        numPendingTests: pending,
                        numTodoTests: todo,
                        durationMs: suiteDurationMs,
                        message: tr.message ? String(tr.message).slice(0, 4000) : null
                    };
                });

                // Jest tenyleges futasi ideje (a cli "Time:" az egesz process-szet meri,
                // ami includes npx + jest startup + test execution + cleanup). A tesztek
                // tenyleges futasa: max(endTime) - jestResult.startTime.
                let jestRunMs = null;
                if (Number.isFinite(jestResult.startTime) && suites.length > 0) {
                    let lastEnd = jestResult.startTime;
                    for (const tr of suites) {
                        if (Number.isFinite(tr.endTime) && tr.endTime > lastEnd) lastEnd = tr.endTime;
                    }
                    jestRunMs = Math.max(0, lastEnd - jestResult.startTime);
                }

                return {
                    numTotalTestSuites: jestResult.numTotalTestSuites,
                    numPassedTestSuites: jestResult.numPassedTestSuites,
                    numFailedTestSuites: jestResult.numFailedTestSuites,
                    numTotalTests: jestResult.numTotalTests,
                    numPassedTests: jestResult.numPassedTests,
                    numFailedTests: jestResult.numFailedTests,
                    numPendingTests: jestResult.numPendingTests,
                    numTodoTests: jestResult.numTodoTests,
                    startTime: jestResult.startTime,
                    success: jestResult.success,
                    jestRunMs,
                    testResults: mapped
                };
            })() : null,
            stderrTail: stderr ? String(stderr).slice(-4096) : (timedOut ? 'TIMEOUT — a futas elerte a 10 perces hatart, megszakitva.' : null)
        };

        try {
            await testRuns.recordRunFinish(run.id, summary);
        } catch (dbErr) {
            console.warn('testRunnerService.recordRunFinish hiba:', dbErr.message);
        }

        currentRun = null;

        if (typeof emit === 'function') {
            try {
                emit('admin:tests:finished', {
                    runId: run.id,
                    status: summary.status,
                    total: summary.total,
                    passed: summary.passed,
                    failed: summary.failed,
                    skipped: summary.skipped,
                    durationMs: summary.durationMs
                });
            } catch (_) { /* ignore */ }
        }
    };

    run.child.on('close', (code, signal) => {
        onComplete(code, signal).catch((e) => console.warn('onComplete hiba:', e.message));
    });
    run.child.on('error', (err) => {
        run.stderrChunks.push(Buffer.from(`\nspawn error: ${err.message}\n`));
    });

    return { id: run.id, startedAt: run.startedAt };
}

module.exports = {
    startRun,
    isRunning,
    getCurrentRunMeta,
    isProductionDisabled
};
