/**
 * sql/modules/admin.js — admin stats query tesztek (mockolt pool).
 *
 * SQL-string-tartalom-asserciok minimalizalva — csak ami valos invarians
 * (pl. 0-osztas elleni NULLIF, vagy a "ongoing" status filter regresszio-vedelme).
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

const adminSql = require('../sql/modules/admin.js');

describe('count-ok (getTotalUsers / getTotalGames)', () => {
    test('count szam kerul vissza', async () => {
        executeMock.mockResolvedValueOnce([[{ total: 100 }]]);
        expect(await adminSql.getTotalUsers()).toBe(100);
        executeMock.mockResolvedValueOnce([[{ total: 50 }]]);
        expect(await adminSql.getTotalGames()).toBe(50);
    });

    test('DB hiba → throw mindketto', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        await expect(adminSql.getTotalUsers()).rejects.toThrow();
        executeMock.mockRejectedValueOnce(new Error('le'));
        await expect(adminSql.getTotalGames()).rejects.toThrow();
    });
});

describe('getOnlineGamesCount', () => {
    test('csak ongoing meccseket szamlalja (regression-guard a "finished" / "abandoned" beszuresere)', async () => {
        executeMock.mockResolvedValueOnce([[{ total: 5 }]]);
        const r = await adminSql.getOnlineGamesCount();
        expect(r).toBe(5);
        // Ha valaki kiveszi a status filter-t, a finished + abandoned is benne lenne →
        // a query INVARIANSA, hogy "ongoing"-ot tartalmazzon.
        const [query] = executeMock.mock.calls[0];
        expect(query.toLowerCase()).toMatch(/ongoing/);
    });
});

describe('getAllUsers', () => {
    test('rows visszaadva', async () => {
        executeMock.mockResolvedValueOnce([[
            { id: 1, username: 'a' },
            { id: 2, username: 'b' }
        ]]);
        const r = await adminSql.getAllUsers();
        expect(r).toHaveLength(2);
    });

    test('NULLIF guard a winrate kalkulacio elott (regression-guard 0/0 ellen)', async () => {
        // 0-meccses user-nel kiveszett NULLIF-fel "division by zero"-t dobna a DB.
        executeMock.mockResolvedValueOnce([[]]);
        await adminSql.getAllUsers();
        const [query] = executeMock.mock.calls[0];
        expect(query).toMatch(/NULLIF/);
    });

    test('throw on DB error', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        await expect(adminSql.getAllUsers()).rejects.toThrow();
    });
});

describe('getAllRooms', () => {
    test('rows visszaadva', async () => {
        executeMock.mockResolvedValueOnce([[{ game_id: 1, white_player: 'a', black_player: 'b' }]]);
        const r = await adminSql.getAllRooms();
        expect(r).toHaveLength(1);
    });

    test('throw on DB error', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        await expect(adminSql.getAllRooms()).rejects.toThrow();
    });
});
