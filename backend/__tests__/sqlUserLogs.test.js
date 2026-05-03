/**
 * sql/modules/userLogs.js — user_logs DB-layer tesztek (mockolt pool).
 */

jest.mock('../sql/database.js', () => ({
    getPool: jest.fn()
}));

const dbMock = require('../sql/database.js');

let executeMock, queryMock;
beforeEach(() => {
    executeMock = jest.fn();
    queryMock = jest.fn();
    dbMock.getPool.mockReturnValue({ execute: executeMock, query: queryMock });
});

const ul = require('../sql/modules/userLogs.js');

describe('insertUserLog', () => {
    test('insertId visszateresben', async () => {
        executeMock.mockResolvedValueOnce([{ insertId: 99 }]);
        const r = await ul.insertUserLog(7, { eventType: 'login' });
        expect(r.insertId).toBe(99);
    });

    test('default ertekek (eventType, severity, source)', async () => {
        executeMock.mockResolvedValueOnce([{ insertId: 1 }]);
        await ul.insertUserLog(7, {});
        const params = executeMock.mock.calls[0][1];
        expect(params[1]).toBe('profile_update'); // eventType default
        expect(params[2]).toBe('profile'); // category default
        expect(params[3]).toBe('info'); // severity default
        expect(params[4]).toBe('backend'); // source default
    });

    test('metadata JSON-na serializealva', async () => {
        executeMock.mockResolvedValueOnce([{ insertId: 1 }]);
        await ul.insertUserLog(7, { metadata: { foo: 'bar' } });
        const params = executeMock.mock.calls[0][1];
        const metaIdx = 9; // 0-indexed metadata position
        expect(typeof params[metaIdx]).toBe('string');
        expect(JSON.parse(params[metaIdx])).toEqual({ foo: 'bar' });
    });

    test('metadata null-rol null marad', async () => {
        executeMock.mockResolvedValueOnce([{ insertId: 1 }]);
        await ul.insertUserLog(7, {});
        const params = executeMock.mock.calls[0][1];
        expect(params[9]).toBeNull();
    });

    test('ipAddress / userAgent metadata-bol fallback', async () => {
        executeMock.mockResolvedValueOnce([{ insertId: 1 }]);
        await ul.insertUserLog(7, {
            metadata: { ipAddress: '127.0.0.1', userAgent: 'jest' }
        });
        const params = executeMock.mock.calls[0][1];
        expect(params[7]).toBe('127.0.0.1');
        expect(params[8]).toBe('jest');
    });

    test('explicit ipAddress override-eli a metadatat', async () => {
        executeMock.mockResolvedValueOnce([{ insertId: 1 }]);
        await ul.insertUserLog(7, {
            ipAddress: 'placeholder',
            metadata: { ipAddress: '127.0.0.1' }
        });
        expect(executeMock.mock.calls[0][1][7]).toBe('placeholder');
    });

    test('DB-hiba → throw', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        await expect(ul.insertUserLog(7, {})).rejects.toThrow();
    });
});

describe('getUserSecurityActivity', () => {
    test('default limit 100, max 500', async () => {
        queryMock.mockResolvedValueOnce([[]]);
        await ul.getUserSecurityActivity(7);
        const [, params] = queryMock.mock.calls[0];
        expect(params[1]).toBe(100);
    });

    test('limit > 500 → clamp to 500', async () => {
        queryMock.mockResolvedValueOnce([[]]);
        await ul.getUserSecurityActivity(7, 9999);
        expect(queryMock.mock.calls[0][1][1]).toBe(500);
    });

    test('limit = 0 (falsy) → fallback default 100', async () => {
        queryMock.mockResolvedValueOnce([[]]);
        await ul.getUserSecurityActivity(7, 0);
        expect(queryMock.mock.calls[0][1][1]).toBe(100);
    });

    test('limit = 1 → ervenyes (min)', async () => {
        queryMock.mockResolvedValueOnce([[]]);
        await ul.getUserSecurityActivity(7, 1);
        expect(queryMock.mock.calls[0][1][1]).toBe(1);
    });

    test('rows mappelese: id-prefix "log-"', async () => {
        queryMock.mockResolvedValueOnce([[
            { id: 5, event_type: 'login', event_category: 'auth', severity: 'info', success: 1, message: 'ok',
              ip_address: '1.1.1.1', user_agent: 'jest', metadata: null, occurred_at: '2025-01-01' }
        ]]);
        const r = await ul.getUserSecurityActivity(7);
        expect(r[0].id).toBe('log-5');
        expect(r[0].eventType).toBe('login');
        expect(r[0].success).toBe(true);
    });

    test('metadata string → parse JSON', async () => {
        queryMock.mockResolvedValueOnce([[
            { id: 1, event_type: 'login', event_category: 'auth', severity: 'info', success: 1, message: '',
              ip_address: null, user_agent: null, metadata: '{"foo":"bar"}', occurred_at: null }
        ]]);
        const r = await ul.getUserSecurityActivity(7);
        expect(r[0].metadata).toEqual({ foo: 'bar' });
    });

    test('metadata sertett JSON → null', async () => {
        queryMock.mockResolvedValueOnce([[
            { id: 1, event_type: 'login', event_category: 'auth', severity: 'info', success: 1,
              message: '', ip_address: null, user_agent: null, metadata: '{not-valid}', occurred_at: null }
        ]]);
        const r = await ul.getUserSecurityActivity(7);
        expect(r[0].metadata).toBeNull();
    });

    test('success null → null marad (nem coerce-elt)', async () => {
        queryMock.mockResolvedValueOnce([[
            { id: 1, event_type: 'x', event_category: 'auth', severity: 'info', success: null,
              message: '', ip_address: null, user_agent: null, metadata: null, occurred_at: null }
        ]]);
        const r = await ul.getUserSecurityActivity(7);
        expect(r[0].success).toBeNull();
    });

    test('DB hiba → throw', async () => {
        queryMock.mockRejectedValueOnce(new Error('le'));
        await expect(ul.getUserSecurityActivity(7)).rejects.toThrow();
    });
});
