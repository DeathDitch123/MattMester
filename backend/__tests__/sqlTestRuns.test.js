/**
 * sql/modules/testRuns.js — admin teszt-futasok tabla layer.
 */

jest.mock('../sql/database.js', () => ({
    getPool: jest.fn()
}));

const dbMock = require('../sql/database.js');

let executeMock;
beforeEach(() => {
    executeMock = jest.fn();
    dbMock.getPool.mockReturnValue({ execute: executeMock });
});

const tr = require('../sql/modules/testRuns.js');

describe('recordRunStart', () => {
    test('insertId visszaad', async () => {
        executeMock.mockResolvedValueOnce([{ insertId: 99 }]);
        const id = await tr.recordRunStart(7);
        expect(id).toBe(99);
    });

    test('null adminUserId is megengedett', async () => {
        executeMock.mockResolvedValueOnce([{ insertId: 100 }]);
        await tr.recordRunStart(null);
        expect(executeMock.mock.calls[0][1][0]).toBeNull();
    });
});

describe('recordRunFinish', () => {
    test('rawSummary JSON-na', async () => {
        executeMock.mockResolvedValueOnce([{}]);
        await tr.recordRunFinish(99, {
            status: 'passed',
            total: 100,
            passed: 95,
            failed: 5,
            skipped: 0,
            durationMs: 1500,
            rawSummary: { foo: 'bar' }
        });
        const params = executeMock.mock.calls[0][1];
        expect(params[0]).toBe('passed');
        expect(params[1]).toBe(100);
        expect(params[2]).toBe(95);
        expect(JSON.parse(params[6])).toEqual({ foo: 'bar' });
    });

    test('default status = error', async () => {
        executeMock.mockResolvedValueOnce([{}]);
        await tr.recordRunFinish(99, {});
        const params = executeMock.mock.calls[0][1];
        expect(params[0]).toBe('error');
    });

    test('stderrTail max 4096 chars', async () => {
        executeMock.mockResolvedValueOnce([{}]);
        await tr.recordRunFinish(99, { stderrTail: 'x'.repeat(10000) });
        const params = executeMock.mock.calls[0][1];
        expect(params[7].length).toBe(4096);
    });

    test('rawSummary 4MB cap', async () => {
        executeMock.mockResolvedValueOnce([{}]);
        const huge = { data: 'x'.repeat(5 * 1024 * 1024) };
        await tr.recordRunFinish(99, { rawSummary: huge });
        const params = executeMock.mock.calls[0][1];
        expect(params[6].length).toBeLessThanOrEqual(4 * 1024 * 1024);
    });

    test('null rawSummary → param null', async () => {
        executeMock.mockResolvedValueOnce([{}]);
        await tr.recordRunFinish(99, {});
        expect(executeMock.mock.calls[0][1][6]).toBeNull();
    });
});

describe('latestRun', () => {
    test('uta lso run mappelva', async () => {
        executeMock.mockResolvedValueOnce([[{
            id: 1, triggered_by: 7, triggered_by_username: 'admin',
            started_at: null, finished_at: null, status: 'passed',
            total: 100, passed: 100, failed: 0, skipped: 0,
            duration_ms: 1500, raw_summary: null, stderr_tail: null
        }]]);
        const r = await tr.latestRun();
        expect(r.id).toBe(1);
        expect(r.status).toBe('passed');
        expect(r.triggeredByUsername).toBe('admin');
    });

    test('ures DB → null', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const r = await tr.latestRun();
        expect(r).toBeNull();
    });

    test('rawSummary string-bol parse', async () => {
        executeMock.mockResolvedValueOnce([[{
            id: 1, triggered_by: 7, raw_summary: '{"x":1}'
        }]]);
        const r = await tr.latestRun();
        expect(r.rawSummary).toEqual({ x: 1 });
    });

    test('rawSummary sertett JSON → null', async () => {
        executeMock.mockResolvedValueOnce([[{ id: 1, raw_summary: '{not-valid}' }]]);
        const r = await tr.latestRun();
        expect(r.rawSummary).toBeNull();
    });
});

describe('recentRuns', () => {
    test('default limit (no arg)', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        await tr.recentRuns();
        const [query] = executeMock.mock.calls[0];
        expect(query).toMatch(/LIMIT 20/);
    });

    test('limit max 50', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        await tr.recentRuns(9999);
        expect(executeMock.mock.calls[0][0]).toMatch(/LIMIT 50/);
    });

    test('rows mappelve', async () => {
        executeMock.mockResolvedValueOnce([[
            { id: 1, status: 'passed', total: 10, passed: 10, failed: 0, skipped: 0 },
            { id: 2, status: 'failed', total: 10, passed: 8, failed: 2, skipped: 0 }
        ]]);
        const rows = await tr.recentRuns();
        expect(rows).toHaveLength(2);
        expect(rows[0].id).toBe(1);
    });
});

describe('runningRun', () => {
    test('aktiv running run → mappelt visszaad', async () => {
        executeMock.mockResolvedValueOnce([[{ id: 5, status: 'running' }]]);
        const r = await tr.runningRun();
        expect(r.id).toBe(5);
        expect(r.status).toBe('running');
    });

    test('nincs running → null', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const r = await tr.runningRun();
        expect(r).toBeNull();
    });
});

describe('cleanupOrphanedRunning', () => {
    test('UPDATE-tel zarja le a hagyott running sorokat', async () => {
        executeMock.mockResolvedValueOnce([{}]);
        await tr.cleanupOrphanedRunning();
        const [query] = executeMock.mock.calls[0];
        expect(query).toMatch(/UPDATE test_runs/);
        expect(query).toMatch(/status = 'error'/);
    });

    test('DB hiba silent', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        await expect(tr.cleanupOrphanedRunning()).resolves.toBeUndefined();
    });
});
