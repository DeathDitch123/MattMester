// ============================================================
// CHESS SQL FUNCTIONS — Sakk-specifikus adatbázis műveletek
// ============================================================
// Saját fájl a chess/ mappában, hogy a kolléga sql_funtions.js-ét
// ne kelljen módosítani. A közös pool-t a database.js-ből vesszük.
// ============================================================
// Használt táblák: games, moves, statistics, users
// Tábla struktúra: backend/sql/database.js createTables()-ben definiálva.
// ============================================================

const { getPool } = require('../sql/database.js');

// ────────────────────────────────────────────
// GAMES tábla
// ────────────────────────────────────────────

/**
 * Új játékot ment az adatbázisba.
 * Visszaadja az insertált sor ID-ját (games.id).
 */
async function jatekMentDb(whitePlayerId, blackPlayerId) {
    const pool = getPool();
    const query = `INSERT INTO games (white_player_id, black_player_id, status)
                   VALUES (?, ?, 'ongoing')`;
    const [result] = await pool.execute(query, [whitePlayerId, blackPlayerId]);
    return result.insertId;
}

/**
 * Játék befejezésének rögzítése.
 * @param {number} gameId - games.id
 * @param {number|null} winnerId - users.id (null = döntetlen)
 * @param {string} status - 'finished' | 'abandoned'
 */
async function jatekVegeMentDb(gameId, winnerId, status) {
    const pool = getPool();
    const query = `UPDATE games SET winner_id = ?, status = ?, end_time = NOW()
                   WHERE id = ?`;
    await pool.execute(query, [winnerId, status, gameId]);
}

/**
 * Aktív (ongoing) játék lekérdezése ID alapján.
 */
async function jatekLekerdezDb(gameId) {
    const pool = getPool();
    const query = `SELECT * FROM games WHERE id = ? AND status = 'ongoing'`;
    const [rows] = await pool.execute(query, [gameId]);
    return rows[0] || null;
}

// ────────────────────────────────────────────
// MOVES tábla
// ────────────────────────────────────────────

/**
 * Lépés mentése az adatbázisba.
 * @param {object} params
 * @param {number} params.gameId
 * @param {number} params.playerId
 * @param {number} params.moveNumber
 * @param {string} params.piece - 'pawn', 'rook', stb.
 * @param {string} params.fromPos - 'e2'
 * @param {string} params.toPos - 'e4'
 * @param {boolean} params.isCapture
 * @param {boolean} params.isCheck
 * @param {boolean} params.isCheckmate
 * @param {string|null} params.promotionPiece
 */
async function lepesMentDb(params) {
    const pool = getPool();
    const query = `INSERT INTO moves 
        (game_id, player_id, move_number, piece, from_pos, to_pos, 
         is_capture, is_check, is_checkmate, promotion_piece)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await pool.execute(query, [
        params.gameId,
        params.playerId,
        params.moveNumber,
        params.piece,
        params.fromPos,
        params.toPos,
        params.isCapture || false,
        params.isCheck || false,
        params.isCheckmate || false,
        params.promotionPiece || null
    ]);
    return result.insertId;
}

/**
 * Egy játék összes lépésének lekérdezése sorrendben.
 * (Játék rekonstrukcióhoz szerver restart után.)
 */
async function lepesekLekerdezDb(gameId) {
    const pool = getPool();
    const query = `SELECT * FROM moves WHERE game_id = ? ORDER BY move_number ASC`;
    const [rows] = await pool.execute(query, [gameId]);
    return rows;
}

// ────────────────────────────────────────────
// STATISTICS tábla
// ────────────────────────────────────────────

/**
 * Győzelem rögzítése a statisztikába.
 */
async function gyozelemMentDb(userId) {
    const pool = getPool();
    const query = `UPDATE statistics SET wins = wins + 1 WHERE user_id = ?`;
    await pool.execute(query, [userId]);
}

/**
 * Vereség rögzítése a statisztikába.
 */
async function veresegMentDb(userId) {
    const pool = getPool();
    const query = `UPDATE statistics SET losses = losses + 1 WHERE user_id = ?`;
    await pool.execute(query, [userId]);
}

// ────────────────────────────────────────────
// ELO frissítés
// ────────────────────────────────────────────

/**
 * Játékos ELO értékének frissítése.
 * @param {number} userId
 * @param {number} ujElo - az új ELO érték
 */
async function eloFrissitDb(userId, ujElo) {
    const pool = getPool();
    const query = `UPDATE users SET elo = ? WHERE id = ?`;
    await pool.execute(query, [ujElo, userId]);
}

/**
 * Játékos aktuális ELO-jának lekérdezése.
 */
async function eloLekerdezDb(userId) {
    const pool = getPool();
    const query = `SELECT elo FROM users WHERE id = ?`;
    const [rows] = await pool.execute(query, [userId]);
    return rows[0] ? rows[0].elo : null;
}

module.exports = {
    jatekMentDb,
    jatekVegeMentDb,
    jatekLekerdezDb,
    lepesMentDb,
    lepesekLekerdezDb,
    gyozelemMentDb,
    veresegMentDb,
    eloFrissitDb,
    eloLekerdezDb
};
