/**
 * sql/modules/leaderboard.js — leaderboard query teszt (mockolt pool).
 *
 * NEM tesztelunk SQL-string-tartalmat (LIMIT 100, ORDER BY DESC) — az csak
 * stringet validalna, nem viselkedest. Csak a tenyleges DB-call-ok
 * meglete + a 0-osztas vedelmi NULLIF guard erdemi.
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

const lb = require('../sql/modules/leaderboard.js');

describe('getLeaderBoardByElo', () => {
    test('rows-ot ad vissza', async () => {
        executeMock.mockResolvedValueOnce([[{ id: 1, username: 'a', elo: 2000 }]]);
        const r = await lb.getLeaderBoardByElo();
        expect(r).toHaveLength(1);
    });

    test('DB hiba → throw (a hivot nem lock-ol-ki silent-eredmeny)', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        await expect(lb.getLeaderBoardByElo()).rejects.toThrow();
    });
});

describe('getLeaderBoardByMM / getLeaderBoardByBullet', () => {
    test('mind a 2 lekerdezes futtathato', async () => {
        executeMock.mockResolvedValue([[]]);
        await lb.getLeaderBoardByMM();
        await lb.getLeaderBoardByBullet();
        expect(executeMock).toHaveBeenCalledTimes(2);
    });
});

describe('getLeaderBoardByWinRate', () => {
    test('NULLIF a 0-osztas elleni vedelem (regression guard)', async () => {
        // EZ ervenyes invarians: ha valaki kiveszi a NULLIF-et a winrate query-bol,
        // a 0 meccses user "Division by zero" exception-t dob. Ezert a query-ben
        // a NULLIF MEG legyen.
        executeMock.mockResolvedValueOnce([[]]);
        await lb.getLeaderBoardByWinRate();
        const [query] = executeMock.mock.calls[0];
        expect(query).toMatch(/NULLIF/);
    });

    test('rows-ot ad vissza', async () => {
        executeMock.mockResolvedValueOnce([[
            { id: 1, username: 'a', winrate_percent: 75 }
        ]]);
        const r = await lb.getLeaderBoardByWinRate();
        expect(r).toHaveLength(1);
    });
});
