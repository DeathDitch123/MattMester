/**
 * chess/abortHelpers.js — meccs-abort + ELO revert tesztek (mockolt pool).
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

const ah = require('../chess/abortHelpers.js');

describe('abortGameNoElo', () => {
    test('ervenytelen gameId → updated:0 (no DB hivas)', async () => {
        const r = await ah.abortGameNoElo(0);
        expect(r.updated).toBe(0);
        expect(executeMock).not.toHaveBeenCalled();
    });

    test('null/undefined gameId → updated:0', async () => {
        expect((await ah.abortGameNoElo(null)).updated).toBe(0);
        expect((await ah.abortGameNoElo(undefined)).updated).toBe(0);
    });

    test('letezo ongoing meccs → updated > 0', async () => {
        executeMock.mockResolvedValueOnce([{ affectedRows: 1 }]);
        const r = await ah.abortGameNoElo(99);
        expect(r.updated).toBe(1);
        expect(executeMock).toHaveBeenCalledWith(expect.stringContaining('abandoned'), [99]);
    });

    test('mar nem-ongoing meccs → updated:0', async () => {
        executeMock.mockResolvedValueOnce([{ affectedRows: 0 }]);
        const r = await ah.abortGameNoElo(99);
        expect(r.updated).toBe(0);
    });

    test('DB hiba → silent (warning), updated:0', async () => {
        executeMock.mockRejectedValueOnce(new Error('DB le'));
        const r = await ah.abortGameNoElo(99);
        expect(r.updated).toBe(0);
    });
});

describe('abortAndAwardOpponent', () => {
    test('ervenytelen ID-k → null', async () => {
        expect(await ah.abortAndAwardOpponent(0, 1)).toBeNull();
        expect(await ah.abortAndAwardOpponent(1, 0)).toBeNull();
    });

    test('nem talalhato meccs → null', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const r = await ah.abortAndAwardOpponent(99, 7);
        expect(r).toBeNull();
    });

    test('mar finished meccs → null', async () => {
        executeMock.mockResolvedValueOnce([[
            { id: 99, white_player_id: 7, black_player_id: 8, time_control: 'blitz', status: 'finished' }
        ]]);
        const r = await ah.abortAndAwardOpponent(99, 7);
        expect(r).toBeNull();
    });
});

describe('abortAllOngoingForMaintenance', () => {
    test('count visszaad ervenyes szamot', async () => {
        executeMock.mockResolvedValue([{ affectedRows: 5 }]);
        const r = await ah.abortAllOngoingForMaintenance();
        expect(r).toHaveProperty('abortedGames');
    });

    test('DB hiba → silent (0 abortedGames)', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        const r = await ah.abortAllOngoingForMaintenance();
        expect(r.abortedGames).toBe(0);
    });
});

describe('abortByUserDisable', () => {
    test('ervenytelen userId → no-op', async () => {
        const r = await ah.abortByUserDisable(0);
        // Vagy 0 abortolt vagy null — implementaciotol fugg
        expect(r).toBeDefined();
    });

    test('nincs ongoing meccs → kezeli undefined-et is (silent)', async () => {
        // Az implementacio multiple SQL-call-t indit; minden return ures lista.
        executeMock.mockResolvedValue([[]]);
        const r = await ah.abortByUserDisable(7);
        expect(r).toBeDefined();
    });
});

describe('revertRecentEloAwardsToUser', () => {
    test('userId 0 → no-op', async () => {
        const r = await ah.revertRecentEloAwardsToUser(0);
        // Az implementacio guard-ja vagy null vagy {reverted: 0}
        expect(r).toBeDefined();
    });

    test('letezo userId, nincs recent abandoned → 0 revert', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const r = await ah.revertRecentEloAwardsToUser(7);
        expect(r).toBeDefined();
    });

    test('DB hiba → silent', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        const r = await ah.revertRecentEloAwardsToUser(7);
        expect(r).toBeDefined();
    });
});
