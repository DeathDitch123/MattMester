// Meccs abortálás-helpers — admin műveletek (ban, delete, maintenance)
// hatására futó meccs-lezárásokat összefoglaló modul.
//
// Funkciók:
//   * abortGameNoElo(gameId, reason)         — status='abandoned', winner_id=NULL, ELO érintetlen
//   * abortAndAwardOpponent(gameId, losingUserId) — opponent nyer + ELO frissül
//   * revertRecentEloAwardsToUser(userId)    — visszavonja a recent abandoned meccsek ELO-ját
//                                              ahol ez a userId volt a kapott "winner"
//                                              (mindkettő ban edge case)
//   * abortByUserDisable(userId, reason, options) — entry: a userId ongoing meccsét
//                                                    aborte el (no-ELO ha ellenfél is letiltva,
//                                                    egyébként opponent wins + ELO)
//   * abortAllOngoingForMaintenance(reason)  — minden ongoing meccs no-ELO abort
//
// FONTOS: ezek a függvények CSAK DB-szinten dolgoznak. A memóriában lévő
// pvp.js `jatek` objektumok lezárása (force-end emit + cleanup) a hívó
// felelőssége — pl. a pvp module exportált helper-ével.

const { getPool } = require('../sql/database.js');
const { eloMeccsEredmeny } = require('./elo.js');
const { getMode } = require('./modes.js');

// Ennyi időn belül történt abandoned meccs ELO-ja revertálható, ha kiderül
// hogy a kedvezményezett is letiltott. Ennél hosszabb idő után már "be van
// véve" az ELO (a játékos esetleg újabb meccset is játszott vele).
const RECENT_ELO_AWARD_WINDOW_MS = 5 * 60 * 1000; // 5 perc

/**
 * Meccs aborte-elése ELO frissítés NÉLKÜL. Idempotens: ha már nem `ongoing`,
 * no-op-ot ad vissza.
 */
async function abortGameNoElo(gameId, reason = 'aborted') {
    const pool = getPool();
    const id = Number(gameId) || 0;
    if (!id) return { updated: 0 };
    try {
        const [result] = await pool.execute(
            `UPDATE games
             SET status = 'abandoned',
                 winner_id = NULL,
                 end_time = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'ongoing'`,
            [id]
        );
        const updated = Number(result?.affectedRows) || 0;
        if (updated > 0) {
            console.log(`[chess abort] game #${id} -> abandoned (no ELO), reason=${reason}`);
        }
        return { updated };
    } catch (err) {
        console.warn('abortGameNoElo hiba:', err.message);
        return { updated: 0 };
    }
}

/**
 * Meccs aborte-elése úgy, hogy az "opponent" (a `losingUserId`-vel ELLENTÉTES
 * játékos) nyer + ELO update. A `loser` is megkapja a normál vereség ELO-ját.
 *
 * @returns {Promise<{ winnerId, loserId, eloColumn, winnerEloChange, loserEloChange } | null>}
 *   null = nem lehetett aborte-elni (nincs ongoing meccs vagy mode nélkül).
 */
async function abortAndAwardOpponent(gameId, losingUserId, reason = 'aborted') {
    const pool = getPool();
    const id = Number(gameId) || 0;
    const loser = Number(losingUserId) || 0;
    if (!id || !loser) return null;

    // 1. lekérjük a meccset
    const [gameRows] = await pool.execute(
        `SELECT id, white_player_id, black_player_id, time_control, status
         FROM games WHERE id = ? LIMIT 1`,
        [id]
    );
    const game = gameRows?.[0];
    if (!game || game.status !== 'ongoing') return null;

    const whiteId = Number(game.white_player_id) || 0;
    const blackId = Number(game.black_player_id) || 0;
    if (loser !== whiteId && loser !== blackId) return null;
    const winner = loser === whiteId ? blackId : whiteId;
    if (!winner) {
        // Edge case: az ellenfél userId-je nem értelmes (pl. már törölve és
        // foreign key SET NULL történt) — no-ELO abort.
        await abortGameNoElo(id, `${reason}/opponent-missing`);
        return null;
    }

    // 2. ELO oszlop azonosítása mode-ból
    const mode = getMode(game.time_control);
    if (!mode || !mode.eloColumn) {
        // Casual / ELO nélküli mode → no-ELO abort
        await abortGameNoElo(id, `${reason}/casual`);
        return null;
    }
    const eloColumn = mode.eloColumn;

    // 3. ELO értékek + meccsszámok
    const [whiteEloRow] = await pool.execute(
        `SELECT \`${eloColumn}\` AS v FROM users WHERE id = ?`, [whiteId]
    );
    const [blackEloRow] = await pool.execute(
        `SELECT \`${eloColumn}\` AS v FROM users WHERE id = ?`, [blackId]
    );
    const whiteElo = Number(whiteEloRow?.[0]?.v) || 800;
    const blackElo = Number(blackEloRow?.[0]?.v) || 800;

    const [whiteCount] = await pool.execute(
        `SELECT COALESCE(wins,0)+COALESCE(losses,0)+COALESCE(draws,0) AS c
         FROM statistics WHERE user_id = ?`, [whiteId]
    );
    const [blackCount] = await pool.execute(
        `SELECT COALESCE(wins,0)+COALESCE(losses,0)+COALESCE(draws,0) AS c
         FROM statistics WHERE user_id = ?`, [blackId]
    );
    const whiteMatches = Number(whiteCount?.[0]?.c) || 0;
    const blackMatches = Number(blackCount?.[0]?.c) || 0;

    const eredmeny = winner === whiteId ? 'white' : 'black';
    const elo = eloMeccsEredmeny(whiteElo, blackElo, eredmeny, whiteMatches, blackMatches);

    // 4. ELO + stats + games update — egy "tranzakcióban" (egy connection-en)
    try {
        await pool.execute(
            `UPDATE users SET \`${eloColumn}\` = ? WHERE id = ?`,
            [elo.feher.ujElo, whiteId]
        );
        await pool.execute(
            `UPDATE users SET \`${eloColumn}\` = ? WHERE id = ?`,
            [elo.fekete.ujElo, blackId]
        );
        await pool.execute(
            `UPDATE statistics SET wins = wins + 1 WHERE user_id = ?`,
            [winner]
        );
        await pool.execute(
            `UPDATE statistics SET losses = losses + 1 WHERE user_id = ?`,
            [loser]
        );
        await pool.execute(
            `UPDATE games
             SET status = 'abandoned',
                 winner_id = ?,
                 end_time = CURRENT_TIMESTAMP
             WHERE id = ? AND status = 'ongoing'`,
            [winner, id]
        );
        console.log(`[chess abort] game #${id} -> abandoned, winner=#${winner} (loser=#${loser} disabled, reason=${reason}), eloCol=${eloColumn}`);
        return {
            winnerId: winner,
            loserId: loser,
            eloColumn,
            winnerEloChange: winner === whiteId ? elo.feher.valtozas : elo.fekete.valtozas,
            loserEloChange: loser === whiteId ? elo.feher.valtozas : elo.fekete.valtozas,
            winnerNewElo: winner === whiteId ? elo.feher.ujElo : elo.fekete.ujElo,
            loserNewElo: loser === whiteId ? elo.feher.ujElo : elo.fekete.ujElo
        };
    } catch (err) {
        console.warn('abortAndAwardOpponent ELO/stats hiba:', err.message);
        return null;
    }
}

/**
 * Visszavonja az utóbbi pár percben (RECENT_ELO_AWARD_WINDOW_MS) abortáltt
 * meccsek ELO-effektusát, AHOL a paraméterként kapott userId volt a `winner_id`.
 *
 * Cél: "mindkettő ban" edge case. Ha A-t bannolják először, B nyer + ELO+.
 * Aztán B-t is bannolják → ezt a függvényt hívva B-re: B és A korábbi meccsén
 * az ELO update visszavonódik, és a meccs `winner_id=NULL`-ra módosul.
 *
 * @returns {Promise<{ revertedGames: number }>}
 */
async function revertRecentEloAwardsToUser(userId) {
    const pool = getPool();
    const id = Number(userId) || 0;
    if (!id) return { revertedGames: 0 };

    let revertedGames = 0;
    try {
        const [rows] = await pool.execute(
            `SELECT id, white_player_id, black_player_id, time_control, end_time
             FROM games
             WHERE status = 'abandoned'
               AND winner_id = ?
               AND end_time IS NOT NULL
               AND end_time >= (NOW() - INTERVAL ? SECOND)`,
            [id, Math.round(RECENT_ELO_AWARD_WINDOW_MS / 1000)]
        );

        for (const row of rows || []) {
            const winnerId = Number(row.winner_id) || id;
            const whiteId = Number(row.white_player_id) || 0;
            const blackId = Number(row.black_player_id) || 0;
            const loser = winnerId === whiteId ? blackId : whiteId;
            const mode = getMode(row.time_control);
            if (!mode || !mode.eloColumn) {
                // Casual mode — nem volt ELO update, csak a winner_id-t nullázzuk
                await pool.execute(
                    `UPDATE games SET winner_id = NULL WHERE id = ?`,
                    [row.id]
                );
                revertedGames++;
                continue;
            }
            const eloColumn = mode.eloColumn;

            // Reverse compute: meccsszámokat lekérjük (figyelmeztetés: a
            // meccs lezárása óta már +1 wins/+1 losses van, így a "valós"
            // current ELO-ból kell visszaszámolnunk.)
            const [whiteCountRow] = await pool.execute(
                `SELECT COALESCE(wins,0)+COALESCE(losses,0)+COALESCE(draws,0) AS c FROM statistics WHERE user_id = ?`,
                [whiteId]
            );
            const [blackCountRow] = await pool.execute(
                `SELECT COALESCE(wins,0)+COALESCE(losses,0)+COALESCE(draws,0) AS c FROM statistics WHERE user_id = ?`,
                [blackId]
            );
            const whiteMatches = Math.max(0, (Number(whiteCountRow?.[0]?.c) || 0) - 1);
            const blackMatches = Math.max(0, (Number(blackCountRow?.[0]?.c) || 0) - 1);

            const [whiteEloRow] = await pool.execute(
                `SELECT \`${eloColumn}\` AS v FROM users WHERE id = ?`, [whiteId]
            );
            const [blackEloRow] = await pool.execute(
                `SELECT \`${eloColumn}\` AS v FROM users WHERE id = ?`, [blackId]
            );
            const whiteElo = Number(whiteEloRow?.[0]?.v) || 800;
            const blackElo = Number(blackEloRow?.[0]?.v) || 800;

            // Eredeti ELO-eredmény visszaszámolása (a játékos "akkori" ELO-jából
            // a most aktuális közötti különbség = a kapott ELO-változás)
            const eredmeny = winnerId === whiteId ? 'white' : 'black';
            const beforeWhiteElo = whiteElo - (eredmeny === 'white' ? 0 : 0); // current
            const beforeBlackElo = blackElo - (eredmeny === 'black' ? 0 : 0); // current
            // Az aktuális ELO-bol vissza-számoljuk az "elotte" ELO-t úgy, hogy
            // ujra-szamoljuk a meccs eredményét: ha a current ELO + valtozas
            // adta a current-et, akkor "valtozas" visszafejthető a meccsszám
            // és a párosított ELO-ból. Egyszerűbb megközelítés: ujra-szamítjuk
            // úgy mintha még nem lett volna kiosztva, és összevetjük.
            //
            // Minden meccs ELO-ja a két játékos akkori ELO-jától + meccsszámától
            // függ. Mivel a meccs óta NEM játszottak újabb ranked meccset (mert
            // most banoljuk őket), a current ELO == post-match ELO. Az előtte:
            // current - valtozas. Tehát csak vissza kell vonni a tárolt valtozas-t.
            //
            // A `valtozas`-t újra-számolhatjuk: a "before" ELO-t a current-ből
            // levonjuk a meccs valtozas-aval — de hogyan tudjuk a valtozas-t?
            // Megoldás: futtatjuk eloMeccsEredmeny-t a current ELO-val, mivel
            // azonos meccsszám-pre-states (most -1 mindkettőre)-okkal.
            const recompute = eloMeccsEredmeny(whiteElo, blackElo, eredmeny, whiteMatches, blackMatches);
            const winnerOldElo = winnerId === whiteId ? whiteElo - recompute.feher.valtozas : blackElo - recompute.fekete.valtozas;
            const loserOldElo  = loser   === whiteId ? whiteElo - recompute.feher.valtozas : blackElo - recompute.fekete.valtozas;

            await pool.execute(
                `UPDATE users SET \`${eloColumn}\` = ? WHERE id = ?`,
                [winnerOldElo, winnerId]
            );
            await pool.execute(
                `UPDATE users SET \`${eloColumn}\` = ? WHERE id = ?`,
                [loserOldElo, loser]
            );
            // statistics revert: -1 wins, -1 losses
            await pool.execute(
                `UPDATE statistics SET wins = GREATEST(0, wins - 1) WHERE user_id = ?`,
                [winnerId]
            );
            await pool.execute(
                `UPDATE statistics SET losses = GREATEST(0, losses - 1) WHERE user_id = ?`,
                [loser]
            );
            // games: winner_id-t NULL-ra (továbbra is abandoned, no winner)
            await pool.execute(
                `UPDATE games SET winner_id = NULL WHERE id = ?`,
                [row.id]
            );

            revertedGames++;
            console.log(`[chess revert] game #${row.id} ELO undo: winner=#${winnerId} ${winnerOldElo + recompute.feher.valtozas}->${winnerOldElo}, loser=#${loser} reverted (mindkét fél letiltva)`);
        }
    } catch (err) {
        console.warn('revertRecentEloAwardsToUser hiba:', err.message);
    }

    return { revertedGames };
}

/**
 * Entry: a userId-nek (most letiltott / törölt user) lezárja az ongoing
 * PvP meccsét. Az ellenfél státuszát ellenőrzi:
 *   * ha az ellenfél is `is_banned=true` VAGY `pending_deletion_until` > NOW()
 *     → no-ELO abort
 *   * egyébként → opponent wins + ELO update
 *
 * Plusz: a `revertRecentEloAwardsToUser(userId)` segít kezelni a "másodikra
 * tiltott / törölt" edge case-t — a userId KORÁBBAN nyert ELO-ját revertál
 * a recent abandoned meccsén, ha mindkét fél most már disabled.
 *
 * @returns {Promise<{ outcome, gameId, opponentId, eloChange? } | null>}
 */
async function abortByUserDisable(userId, reason = 'user_disabled') {
    const pool = getPool();
    const id = Number(userId) || 0;
    if (!id) return null;

    // Először revertáljuk a recent ELO-awards-okat (ha van ilyen — mindkettő
    // ban edge case). Ez a userId előző `abandoned`-meccseit érinti.
    await revertRecentEloAwardsToUser(id);

    // Most az aktuális ongoing meccsét lezárjuk
    const [rows] = await pool.execute(
        `SELECT id, white_player_id, black_player_id, time_control
         FROM games
         WHERE status = 'ongoing'
           AND (white_player_id = ? OR black_player_id = ?)
         LIMIT 1`,
        [id, id]
    );
    const game = rows?.[0];
    if (!game) return null;

    const opponentId = (Number(game.white_player_id) === id)
        ? Number(game.black_player_id)
        : Number(game.white_player_id);

    if (!opponentId) {
        await abortGameNoElo(game.id, `${reason}/opponent-missing`);
        return { outcome: 'no_elo', gameId: game.id, opponentId: null };
    }

    // Ellenőrizzük az ellenfél státuszát
    const [oppRows] = await pool.execute(
        `SELECT id, is_banned, pending_deletion_until FROM users WHERE id = ? LIMIT 1`,
        [opponentId]
    );
    const opp = oppRows?.[0];
    const opponentDisabled = opp && (
        Boolean(opp.is_banned) ||
        (opp.pending_deletion_until && new Date(opp.pending_deletion_until) > new Date())
    );

    if (opponentDisabled) {
        await abortGameNoElo(game.id, `${reason}/both-disabled`);
        return { outcome: 'no_elo', gameId: game.id, opponentId };
    }

    const result = await abortAndAwardOpponent(game.id, id, reason);
    if (!result) {
        // Casual mode vagy ELO nélküli — abortGameNoElo már lefutott
        return { outcome: 'no_elo_casual', gameId: game.id, opponentId };
    }
    return {
        outcome: 'opponent_wins',
        gameId: game.id,
        opponentId,
        eloChange: result.winnerEloChange
    };
}

/**
 * Karbantartás-induláskor minden ongoing meccs no-ELO abortálása.
 */
async function abortAllOngoingForMaintenance(reason = 'maintenance') {
    const pool = getPool();
    let abortedGames = 0;
    try {
        const [result] = await pool.execute(
            `UPDATE games
             SET status = 'abandoned',
                 winner_id = NULL,
                 end_time = CURRENT_TIMESTAMP
             WHERE status = 'ongoing'`
        );
        abortedGames = Number(result?.affectedRows) || 0;
        if (abortedGames > 0) {
            console.log(`[chess abort] ${abortedGames} ongoing meccs aborte-elve karbantartas miatt (no ELO).`);
        }
    } catch (err) {
        console.warn('abortAllOngoingForMaintenance hiba:', err.message);
    }
    return { abortedGames };
}

module.exports = {
    abortGameNoElo,
    abortAndAwardOpponent,
    revertRecentEloAwardsToUser,
    abortByUserDisable,
    abortAllOngoingForMaintenance,
    RECENT_ELO_AWARD_WINDOW_MS
};
