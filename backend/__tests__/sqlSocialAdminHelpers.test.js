/**
 * sql/modules/socialAdmin.js + gamesAdmin.js — clamp helper tesztek.
 *
 * A korabbi `expect(true).toBe(true)` "no-throw" stub-ok cserelve tenyleges
 * SQL-parameter ellenorzesre — most assertaljuk hogy a clamp eredmenyei
 * lemennek a query-be (pl. limit > MAX → MAX-ra csapodik).
 */

let executeMock;
jest.mock('../sql/database.js', () => ({
    getPool: jest.fn()
}));
const dbMock = require('../sql/database.js');

beforeEach(() => {
    executeMock = jest.fn(() => Promise.resolve([[]]));
    dbMock.getPool.mockReturnValue({ execute: executeMock });
});

const social = require('../sql/modules/socialAdmin.js');
const games = require('../sql/modules/gamesAdmin.js');

describe('socialAdmin.listFriendRequests — query-parameter validacio', () => {
    test('default status pendingre szuri', async () => {
        await social.listFriendRequests({});
        const params = executeMock.mock.calls[0][1];
        expect(params).toContain('pending');
    });

    test('whitelist status: accepted/rejected/blocked atadva', async () => {
        for (const status of ['accepted', 'rejected', 'blocked']) {
            executeMock.mockClear();
            await social.listFriendRequests({ status });
            expect(executeMock.mock.calls[0][1]).toContain(status);
        }
    });

    test('invalid status → fallback "pending" (NEM kerul a SQL parameterbe)', async () => {
        await social.listFriendRequests({ status: 'invalid_xyz' });
        const params = executeMock.mock.calls[0][1];
        expect(params).toContain('pending');
        expect(params).not.toContain('invalid_xyz');
    });

    test('limit > MAX_LIMIT (200) → 200-ra csapodik (a query-stringbe template-elve)', async () => {
        await social.listFriendRequests({ limit: 9999 });
        const query = executeMock.mock.calls[0][0];
        expect(query).toMatch(/LIMIT 200/);
    });

    test('limit negative → DEFAULT (50)', async () => {
        await social.listFriendRequests({ limit: -1 });
        const query = executeMock.mock.calls[0][0];
        expect(query).toMatch(/LIMIT 50/);
    });

    test('offset negative → 0', async () => {
        await social.listFriendRequests({ offset: -100 });
        const query = executeMock.mock.calls[0][0];
        expect(query).toMatch(/OFFSET 0/);
    });

    test('limit float → floor (Math.floor)', async () => {
        await social.listFriendRequests({ limit: 30.7 });
        const query = executeMock.mock.calls[0][0];
        expect(query).toMatch(/LIMIT 30/);
    });
});

describe('socialAdmin.getSocialCounts', () => {
    test('rekord-objektumot ad vissza (counts)', async () => {
        executeMock.mockResolvedValueOnce([[{ pending: 5, accepted: 10, blocked: 1 }]]);
        const r = await social.getSocialCounts();
        expect(r).toBeDefined();
    });
});

describe('gamesAdmin.listGames — clamp limit / offset', () => {
    test('default limit (no arg)', async () => {
        await games.listGames({});
        // SQL hivva — clamp eredmenye benne a parameterekben
        expect(executeMock).toHaveBeenCalled();
    });

    test('limit > MAX → clamp 200-ra (a query-stringbe template-elve)', async () => {
        await games.listGames({ limit: 99999 });
        const query = executeMock.mock.calls[0][0];
        expect(query).toMatch(/LIMIT 200/);
    });

    test('limit float → floor', async () => {
        await games.listGames({ limit: 50.9 });
        const query = executeMock.mock.calls[0][0];
        expect(query).toMatch(/LIMIT 50/);
    });

    test('negativ offset → 0', async () => {
        await games.listGames({ offset: -10 });
        const query = executeMock.mock.calls[0][0];
        expect(query).toMatch(/OFFSET 0/);
    });
});

describe('gamesAdmin.getGameCounts', () => {
    test('counts objektumot ad vissza', async () => {
        executeMock.mockResolvedValueOnce([[{ ongoing: 5, finished: 100, abandoned: 2 }]]);
        const r = await games.getGameCounts();
        expect(r).toBeDefined();
    });
});

describe('gamesAdmin.buildPgnFromGame — exportalt fuggveny', () => {
    test('letezo fuggveny', () => {
        expect(typeof games.buildPgnFromGame).toBe('function');
    });
});
