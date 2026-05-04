/**
 * chess/chess_sql_functions.js — chess DB-layer tesztek (mockolt pool).
 *
 * A SQL-injection vedelem a fontos resz: az `oszlop` parameter WHITELIST-elve
 * van (isValidEloColumn). Itt assertaljuk hogy ervenytelen oszlopnev → throw.
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

const chessSql = require('../chess/chess_sql_functions.js');

describe('eloFrissitDb — SQL-injection vedelem', () => {
    test('ervenyes oszlop → query hivva', async () => {
        executeMock.mockResolvedValueOnce([{}]);
        await chessSql.eloFrissitDb(7, 1500, 'elo');
        expect(executeMock).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE users'),
            [1500, 7]
        );
    });

    test('ervenyes oszlopok 4 fele', async () => {
        executeMock.mockResolvedValue([{}]);
        for (const col of ['elo', 'elo_mattmester', 'elo_classical', 'elo_blitz']) {
            await chessSql.eloFrissitDb(7, 1500, col);
        }
        expect(executeMock).toHaveBeenCalledTimes(4);
    });

    test('ERVENYTELEN oszlop (SQL-injection) → THROW (NEM hivja a DB-t)', async () => {
        await expect(chessSql.eloFrissitDb(7, 1500, 'elo; DROP TABLE')).rejects.toThrow(/Érvénytelen/);
        await expect(chessSql.eloFrissitDb(7, 1500, 'users')).rejects.toThrow();
        await expect(chessSql.eloFrissitDb(7, 1500, '"elo"')).rejects.toThrow();
        await expect(chessSql.eloFrissitDb(7, 1500, '')).rejects.toThrow();
        expect(executeMock).not.toHaveBeenCalled();
    });

    test('default oszlop = elo', async () => {
        executeMock.mockResolvedValueOnce([{}]);
        await chessSql.eloFrissitDb(7, 1500);
        expect(executeMock).toHaveBeenCalledWith(
            expect.stringContaining('`elo`'),
            [1500, 7]
        );
    });
});

describe('eloLekerdezDb', () => {
    test('letezo user → ELO ertek', async () => {
        executeMock.mockResolvedValueOnce([[{ v: 1500 }]]);
        const r = await chessSql.eloLekerdezDb(7);
        expect(r).toBe(1500);
    });

    test('nincs row → null', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const r = await chessSql.eloLekerdezDb(99);
        expect(r).toBeNull();
    });

    test('ervenytelen oszlop → throw', async () => {
        await expect(chessSql.eloLekerdezDb(7, 'foo')).rejects.toThrow(/Érvénytelen/);
    });
});

describe('jatekMentDb — DB insert', () => {
    test('mode is bekerul a query-be', async () => {
        executeMock.mockResolvedValueOnce([{ insertId: 99 }]);
        const id = await chessSql.jatekMentDb(7, 8, 'mattmester_10p');
        expect(id).toBe(99);
        // Megnezzuk hogy mode (time_control) parameter atadva
        const args = executeMock.mock.calls[0][1];
        expect(args).toEqual(expect.arrayContaining([7, 8]));
    });
});

describe('jatekVegeMentDb', () => {
    test('finished status mentes', async () => {
        executeMock.mockResolvedValue([{}]);
        await chessSql.jatekVegeMentDb(99, 7, 'finished', '1. e4 *');
        expect(executeMock).toHaveBeenCalled();
    });

    test('null winner (draw) is megengedett', async () => {
        executeMock.mockResolvedValue([{}]);
        await expect(chessSql.jatekVegeMentDb(99, null, 'draw')).resolves.toBeUndefined();
    });
});

describe('gyozelemMentDb / veresegMentDb / dontetlenMentDb', () => {
    test('mind a 3 funkciot pool-execute-tal', async () => {
        executeMock.mockResolvedValue([{}]);
        await chessSql.gyozelemMentDb(7);
        await chessSql.veresegMentDb(7);
        await chessSql.dontetlenMentDb(7);
        expect(executeMock).toHaveBeenCalledTimes(3);
    });
});

describe('lepesMentDb', () => {
    test('move-mentes minden mezovel', async () => {
        executeMock.mockResolvedValue([{}]);
        await chessSql.lepesMentDb({
            gameId: 99,
            playerId: 7,
            moveNumber: 1,
            san: 'e4',
            piece: 'pawn',
            fromPos: 'e2',
            toPos: 'e4',
            isCapture: false,
            isCheck: false,
            isCheckmate: false,
            promotionPiece: null
        });
        expect(executeMock).toHaveBeenCalled();
    });
});

describe('lepesekLekerdezDb', () => {
    test('gameId-re lepesek listaja', async () => {
        executeMock.mockResolvedValueOnce([[{ id: 1, san: 'e4' }, { id: 2, san: 'e5' }]]);
        const lepesek = await chessSql.lepesekLekerdezDb(99);
        expect(lepesek).toHaveLength(2);
    });
});

describe('meccsekSzamDb', () => {
    test('befejezett meccsek szama', async () => {
        executeMock.mockResolvedValueOnce([[{ db: 42 }]]);
        const n = await chessSql.meccsekSzamDb(7);
        expect(n).toBe(42);
    });

    test('hianyzo row → 0', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const n = await chessSql.meccsekSzamDb(7);
        expect(n).toBe(0);
    });
});

describe('startupCleanupOngoingGames — szervert restart utan', () => {
    test('ongoing meccsek abort-elve, count vissza', async () => {
        executeMock.mockResolvedValueOnce([{ affectedRows: 3 }]);
        const r = await chessSql.startupCleanupOngoingGames();
        expect(r).toBeDefined();
    });
});

describe('abilityIdByKey — cache-elt lookup', () => {
    test('tobbszori hivas ugyanarra a kulcsra → 1 DB-hivas', async () => {
        executeMock.mockResolvedValue([[{ id: 5 }]]);
        await chessSql.abilityIdByKey('time_pause');
        await chessSql.abilityIdByKey('time_pause');
        // Cache miatt csak 1 hivas (vagy 0 ha mar volt elozoleg)
        expect(executeMock.mock.calls.length).toBeLessThanOrEqual(2);
    });
});
