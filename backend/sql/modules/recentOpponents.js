// Rocket League stilusu "legutobbi ellenfelek" lista. Minden user-nek vezetjuk
// a legutobb meccselt ellenfelei listajat. UPSERT-tel kezeljuk: ha mar volt
// meccs az adott parral, csak frissitjuk a last_played_at + match_count
// ertekeket; egyebkent uj sor.
//
// A frontend listaba utolso meccs szerint csokkeno sorrendben rendezve max 25-ot
// mutat. A taroloban tobb is lehet, csak a UI vagja - igy ha tortenetesen
// torlodne az aktualis 25 valamelyike, a kovetkezo "csuszik fel" ujra lathatova.

const { getPool } = require('../database.js');
const { normalizePositiveInt, normalizeListLimit } = require('./_shared.js');

const RECENT_OPPONENTS_DEFAULT_LIMIT = 25;
const RECENT_OPPONENTS_MAX_LIMIT = 50;

// Ket iranyban regisztralja: a ket user kolcsonosen ellenfele egymasnak.
// gameId opcionalis - audit celokra tarolja az utolso jatszma azonositot.
async function recordRecentOpponentPair(userIdA, userIdB, gameId = null) {
    const pool = getPool();
    const a = normalizePositiveInt(userIdA, 0);
    const b = normalizePositiveInt(userIdB, 0);
    if (!a || !b || a === b) return false;

    const game = normalizePositiveInt(gameId, null);

    // ON DUPLICATE KEY UPDATE: ha mar van par, csak last_played_at + counter +
    // last_game_id frissul. A UNIQUE(user_id, opponent_user_id) miatt a par
    // egyszer szerepel csak.
    try {
        await pool.execute(
            `INSERT INTO recent_opponents (user_id, opponent_user_id, last_played_at, match_count, last_game_id)
             VALUES (?, ?, NOW(), 1, ?)
             ON DUPLICATE KEY UPDATE
                last_played_at = NOW(),
                match_count = match_count + 1,
                last_game_id = VALUES(last_game_id)`,
            [a, b, game]
        );
        await pool.execute(
            `INSERT INTO recent_opponents (user_id, opponent_user_id, last_played_at, match_count, last_game_id)
             VALUES (?, ?, NOW(), 1, ?)
             ON DUPLICATE KEY UPDATE
                last_played_at = NOW(),
                match_count = match_count + 1,
                last_game_id = VALUES(last_game_id)`,
            [b, a, game]
        );
        return true;
    } catch (error) {
        console.warn('recordRecentOpponentPair hiba:', error.message);
        return false;
    }
}

// User legutobbi ellenfeleinek lekerese. Default 25, max 50. Az ellenfelek
// alap user-adataikkal jonnek (id, username, profile_image, online status,
// elo, friend_status). A friend_status csak akkor szamolt, ha a hivo
// includeFriendStatus: true (a profile.html lapon kell, a header search-en nem).
async function getRecentOpponentsForUser(userId, options = {}) {
    const pool = getPool();
    const id = normalizePositiveInt(userId, 0);
    if (!id) return [];

    const limit = normalizeListLimit(options.limit, RECENT_OPPONENTS_DEFAULT_LIMIT, RECENT_OPPONENTS_MAX_LIMIT);

    // FONTOS: a `profile_image_status` NEM `users` oszlop — a `profile_image_uploads`
    // tablabol jon a legutobbi feltoltes status-aval (lasd users.js mas query-i).
    // Subquery-vel hozzuk be hasonlo modon, hogy a frontend ugyanaz a struktura.
    const [rows] = await pool.execute(
        `SELECT ro.opponent_user_id AS opponent_id,
                ro.last_played_at,
                ro.match_count,
                ro.last_game_id,
                u.username AS opponent_username,
                u.profile_image AS opponent_profile_image,
                (
                    SELECT piu.status
                    FROM profile_image_uploads piu
                    WHERE piu.user_id = u.id
                    ORDER BY piu.upload_time DESC, piu.id DESC
                    LIMIT 1
                ) AS opponent_profile_image_status,
                u.elo AS opponent_elo,
                u.elo_mattmester AS opponent_elo_mm,
                u.elo_blitz AS opponent_elo_bullet,
                u.last_active AS opponent_last_active
         FROM recent_opponents ro
         JOIN users u ON u.id = ro.opponent_user_id
         WHERE ro.user_id = ?
           AND u.pending_deletion_until IS NULL
         ORDER BY ro.last_played_at DESC, ro.id DESC
         LIMIT ?`,
        [id, limit]
    );

    return (rows || []).map((row) => ({
        opponentUserId: row.opponent_id,
        username: row.opponent_username,
        profileImage: row.opponent_profile_image,
        profileImageStatus: row.opponent_profile_image_status,
        elo: row.opponent_elo,
        eloMM: row.opponent_elo_mm,
        eloBullet: row.opponent_elo_bullet,
        lastActiveAt: row.opponent_last_active,
        lastPlayedAt: row.last_played_at,
        matchCount: row.match_count,
        lastGameId: row.last_game_id
    }));
}

module.exports = {
    RECENT_OPPONENTS_DEFAULT_LIMIT,
    RECENT_OPPONENTS_MAX_LIMIT,
    recordRecentOpponentPair,
    getRecentOpponentsForUser
};
