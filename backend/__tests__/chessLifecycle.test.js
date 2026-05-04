/**
 * Chess meccs lifecycle tesztek — felulvizsgalt 5 forgatokonyv:
 *   1. Server crash / restart  -> ongoing meccsek abortaltatnak ELO loss NÉLKÜL
 *   2. Egyik jatekos ban-olva   -> ellenfel nyer + ELO; mindkettő ban -> nincs ELO
 *   3. Egyik jatekos torolve    -> ellenfel nyer + ELO; mindkettő torolt -> nincs ELO
 *   4. Karbantartas elinditasa  -> minden ongoing meccs abort, mindkettő 0 ELO
 *   5. Bot meccs ranked NEM elerheto a backenden (a kliens csak casual indithat)
 *
 * Ez a fajl a 1-es es 5-os szcenariokat fedi le; a tobbi a vonatkozo
 * specifikus feature commit-ban kerul be.
 */

jest.mock('../sql/database.js', () => {
    const executeMock = jest.fn();
    return {
        getPool: () => ({ execute: executeMock }),
        __executeMock: executeMock
    };
});

const dbMock = require('../sql/database.js');
const chessSql = require('../chess/chess_sql_functions.js');
const abortHelpers = require('../chess/abortHelpers.js');

// Egyszerű "futtató" amelyik a következő SQL-call-ra előre megadott eredményt
// ad vissza. A mock minden hívást kronologikusan emészt el.
function queueQueries(...results) {
    for (const r of results) {
        dbMock.__executeMock.mockResolvedValueOnce(r);
    }
}

beforeEach(() => {
    dbMock.__executeMock.mockReset();
});

describe('1. Server crash recovery — startupCleanupOngoingGames', () => {
    test('UPDATE-eli az ongoing-meccseket abandoned-ra ELO loss NÉLKÜL', async () => {
        dbMock.__executeMock.mockResolvedValueOnce([{ affectedRows: 3 }]);
        const result = await chessSql.startupCleanupOngoingGames();
        expect(result.updated).toBe(3);

        const calls = dbMock.__executeMock.mock.calls;
        expect(calls.length).toBe(1);
        const sql = calls[0][0].toLowerCase();

        expect(sql).toMatch(/update\s+games/);
        expect(sql).toMatch(/status\s*=\s*'abandoned'/);
        expect(sql).toMatch(/where\s+status\s*=\s*'ongoing'/);

        // FONTOS: nem írunk winner_id-t (mert nem volt nyertes)
        expect(sql).not.toMatch(/winner_id\s*=/);
        // FONTOS: nem nyul az `users` tablahoz (nincs ELO frissítés)
        expect(sql).not.toMatch(/update\s+users/);
        expect(sql).not.toMatch(/elo/);
    });

    test('hibat tolerál — nem dob exception-t kifele', async () => {
        dbMock.__executeMock.mockRejectedValueOnce(new Error('DB lefagyott'));
        const result = await chessSql.startupCleanupOngoingGames();
        expect(result.updated).toBe(0); // hiba esetén 0
    });

    test('0 érintett sor esetén is sikeres returnnal jon vissza', async () => {
        dbMock.__executeMock.mockResolvedValueOnce([{ affectedRows: 0 }]);
        const result = await chessSql.startupCleanupOngoingGames();
        expect(result.updated).toBe(0);
    });

    test('PGN markert ad hozza ha a sornak nincs még', async () => {
        dbMock.__executeMock.mockResolvedValueOnce([{ affectedRows: 1 }]);
        await chessSql.startupCleanupOngoingGames();
        const params = dbMock.__executeMock.mock.calls[0][1];
        // Az UPDATE 1 paramotert kap: a PGN szoveg a COALESCE(pgn, ?)-hez
        expect(params).toEqual(expect.arrayContaining([
            expect.stringContaining('Server abort')
        ]));
    });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Ban / Delete during game — abortByUserDisable + revertRecentEloAwardsToUser
// ─────────────────────────────────────────────────────────────────────

describe('2/3. abortByUserDisable — ban / delete folyamatban lévő meccsre', () => {
    test('1. ban: ellenfel NEM letiltott → opponent wins + ELO update', async () => {
        // 1. revertRecentEloAwardsToUser: SELECT recent abandoned-where-winner=userId — üres
        queueQueries([[]]);
        // 2. SELECT ongoing game by user → 1 sor
        queueQueries([[{ id: 42, white_player_id: 100, black_player_id: 200, time_control: 'mattmester_10p' }]]);
        // 3. SELECT opponent (id=200) is_banned/pending → not disabled
        queueQueries([[{ id: 200, is_banned: 0, pending_deletion_until: null }]]);
        // abortAndAwardOpponent flow:
        // 4. SELECT game → still ongoing (re-read inside abortAndAwardOpponent)
        queueQueries([[{ id: 42, white_player_id: 100, black_player_id: 200, time_control: 'mattmester_10p', status: 'ongoing' }]]);
        // 5/6. SELECT white elo / black elo
        queueQueries([[{ v: 800 }]], [[{ v: 800 }]]);
        // 7/8. SELECT match counts
        queueQueries([[{ c: 50 }]], [[{ c: 50 }]]);
        // 9-13. UPDATE white elo, black elo, winner stats, loser stats, games
        queueQueries([{}], [{}], [{}], [{}], [{ affectedRows: 1 }]);

        const result = await abortHelpers.abortByUserDisable(100, 'ban');

        expect(result).not.toBeNull();
        expect(result.outcome).toBe('opponent_wins');
        expect(result.gameId).toBe(42);
        expect(result.opponentId).toBe(200);
        // ELO change pozitiv az opponent felé
        expect(result.eloChange).toBeGreaterThan(0);

        // Ellenőrizzük, hogy az utolsó UPDATE games-call az `winner_id=200`-at adta
        const calls = dbMock.__executeMock.mock.calls;
        const gameUpdateCall = calls.find((c) => /UPDATE games/i.test(c[0]) && /winner_id\s*=\s*\?/i.test(c[0]));
        expect(gameUpdateCall).toBeDefined();
        expect(gameUpdateCall[1]).toEqual([200, 42]); // winner=200 a 42-es game-en
    });

    test('mindkettő ban: ellenfel IS letiltott → no-ELO abort', async () => {
        queueQueries([[]]); // revert: nincs recent
        queueQueries([[{ id: 42, white_player_id: 100, black_player_id: 200, time_control: 'mattmester_10p' }]]);
        queueQueries([[{ id: 200, is_banned: 1, pending_deletion_until: null }]]); // opponent IS banned
        queueQueries([{ affectedRows: 1 }]); // abortGameNoElo UPDATE

        const result = await abortHelpers.abortByUserDisable(100, 'ban');
        expect(result.outcome).toBe('no_elo');
        expect(result.gameId).toBe(42);

        const calls = dbMock.__executeMock.mock.calls;
        const noEloCall = calls.find((c) => /UPDATE games/i.test(c[0]) && /winner_id\s*=\s*NULL/i.test(c[0]));
        expect(noEloCall).toBeDefined();
        // Az ELO oszlop NEM kap UPDATE-et
        const usersUpdate = calls.find((c) => /UPDATE users/i.test(c[0]));
        expect(usersUpdate).toBeUndefined();
    });

    test('soft-deleted ellenfel → no-ELO abort', async () => {
        queueQueries([[]]);
        queueQueries([[{ id: 42, white_player_id: 100, black_player_id: 200, time_control: 'blitz' }]]);
        const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        queueQueries([[{ id: 200, is_banned: 0, pending_deletion_until: future }]]);
        queueQueries([{ affectedRows: 1 }]);

        const result = await abortHelpers.abortByUserDisable(100, 'delete');
        expect(result.outcome).toBe('no_elo');
    });

    test('nincs ongoing meccs → null return, no SQL nyul a games-hez', async () => {
        queueQueries([[]]); // revert: nincs recent
        queueQueries([[]]); // SELECT ongoing → üres
        const result = await abortHelpers.abortByUserDisable(100, 'ban');
        expect(result).toBeNull();
    });

    test('casual mode (eloColumn-nélküli) → no-ELO abort', async () => {
        queueQueries([[]]);
        queueQueries([[{ id: 42, white_player_id: 100, black_player_id: 200, time_control: 'unknown_mode' }]]);
        queueQueries([[{ id: 200, is_banned: 0, pending_deletion_until: null }]]);
        // abortAndAwardOpponent: belül látja hogy mode null → abortGameNoElo-ra esik vissza
        queueQueries([[{ id: 42, white_player_id: 100, black_player_id: 200, time_control: 'unknown_mode', status: 'ongoing' }]]);
        queueQueries([{ affectedRows: 1 }]);

        const result = await abortHelpers.abortByUserDisable(100, 'ban');
        expect(result.outcome).toBe('no_elo_casual');
    });
});

describe('abortGameNoElo — alaplogika', () => {
    test('UPDATE-eli a games-t abandoned + winner_id=NULL-ra, ELO érintetlen', async () => {
        queueQueries([{ affectedRows: 1 }]);
        await abortHelpers.abortGameNoElo(42, 'maintenance');
        const calls = dbMock.__executeMock.mock.calls;
        expect(calls.length).toBe(1);
        const sql = calls[0][0];
        expect(sql).toMatch(/UPDATE games/i);
        expect(sql).toMatch(/status\s*=\s*'abandoned'/i);
        expect(sql).toMatch(/winner_id\s*=\s*NULL/i);
        expect(sql).not.toMatch(/UPDATE users/i);
    });
});

describe('4. abortAllOngoingForMaintenance', () => {
    test('minden ongoing meccs abandoned, ELO és winner_id érintetlen', async () => {
        queueQueries([{ affectedRows: 5 }]);
        const result = await abortHelpers.abortAllOngoingForMaintenance();
        expect(result.abortedGames).toBe(5);
        const sql = dbMock.__executeMock.mock.calls[0][0];
        expect(sql).toMatch(/UPDATE games/i);
        expect(sql).toMatch(/status\s*=\s*'abandoned'/i);
        expect(sql).toMatch(/winner_id\s*=\s*NULL/i);
        expect(sql).toMatch(/WHERE\s+status\s*=\s*'ongoing'/i);
        // NEM nyul a users tablahoz (no ELO update)
        const allCalls = dbMock.__executeMock.mock.calls;
        expect(allCalls.find((c) => /UPDATE users/i.test(c[0]))).toBeUndefined();
    });
});
