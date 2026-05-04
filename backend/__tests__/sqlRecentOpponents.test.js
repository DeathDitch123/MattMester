/**
 * sql/modules/recentOpponents.js — DB-layer tesztek.
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

const ro = require('../sql/modules/recentOpponents.js');

describe('konstansok', () => {
    test('DEFAULT_LIMIT = 25', () => {
        expect(ro.RECENT_OPPONENTS_DEFAULT_LIMIT).toBe(25);
    });

    test('MAX_LIMIT = 50', () => {
        expect(ro.RECENT_OPPONENTS_MAX_LIMIT).toBe(50);
    });
});

describe('recordRecentOpponentPair', () => {
    test('ervenyes parr → 2 INSERT (mindket iranyban)', async () => {
        executeMock.mockResolvedValue([{}]);
        const r = await ro.recordRecentOpponentPair(1, 2, 99);
        expect(r).toBe(true);
        expect(executeMock).toHaveBeenCalledTimes(2);
    });

    test('null user → false (no INSERT)', async () => {
        const r = await ro.recordRecentOpponentPair(null, 2);
        expect(r).toBe(false);
        expect(executeMock).not.toHaveBeenCalled();
    });

    test('0 user → false', async () => {
        const r = await ro.recordRecentOpponentPair(0, 2);
        expect(r).toBe(false);
    });

    test('a === b (sajat magaval) → false', async () => {
        const r = await ro.recordRecentOpponentPair(7, 7);
        expect(r).toBe(false);
        expect(executeMock).not.toHaveBeenCalled();
    });

    test('opcionalis gameId hianyzik → null parameterkent', async () => {
        executeMock.mockResolvedValue([{}]);
        await ro.recordRecentOpponentPair(1, 2);
        const params = executeMock.mock.calls[0][1];
        expect(params[2]).toBeNull();
    });

    test('SQL hiba → silent (false return)', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        const r = await ro.recordRecentOpponentPair(1, 2);
        expect(r).toBe(false);
    });
});

describe('getRecentOpponentsForUser', () => {
    test('userId 0 → []', async () => {
        const r = await ro.getRecentOpponentsForUser(0);
        expect(r).toEqual([]);
        expect(executeMock).not.toHaveBeenCalled();
    });

    test('null user → []', async () => {
        const r = await ro.getRecentOpponentsForUser(null);
        expect(r).toEqual([]);
    });

    test('letezo user → mappelt rowok', async () => {
        executeMock.mockResolvedValueOnce([[{
            opponent_id: 5, opponent_username: 'rival',
            opponent_profile_image: '/foo.png',
            opponent_profile_image_status: 'approved',
            opponent_elo: 1500, opponent_elo_mm: 1600, opponent_elo_bullet: 1400,
            opponent_last_active: null, last_played_at: null,
            match_count: 3, last_game_id: 12
        }]]);
        const r = await ro.getRecentOpponentsForUser(7);
        expect(r).toHaveLength(1);
        expect(r[0].opponentUserId).toBe(5);
        expect(r[0].username).toBe('rival');
        expect(r[0].matchCount).toBe(3);
    });

    test('default limit = 25', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        await ro.getRecentOpponentsForUser(7);
        const params = executeMock.mock.calls[0][1];
        expect(params[1]).toBe(25);
    });

    test('limit clamp [1, 50]', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        await ro.getRecentOpponentsForUser(7, { limit: 999 });
        expect(executeMock.mock.calls[0][1][1]).toBe(50);
    });
});
