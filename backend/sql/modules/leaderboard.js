const { getPool } = require('../database.js');
const { LEADERBOARD_PROFILE_IMAGE_EXPRESSION } = require('./profileImage.js');

async function getLeaderBoardByElo() {
    const pool = getPool();
    const query = `SELECT u.id, u.username, u.elo, ${LEADERBOARD_PROFILE_IMAGE_EXPRESSION}, u.last_active, u.created_at
                   FROM users u
                   WHERE u.is_banned = FALSE
                   ORDER BY u.elo DESC
                   LIMIT 100`;
    let result = [];
    try {
        const [rows] = await pool.execute(query);
        result = rows;
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
    return result;
}

async function getLeaderBoardByMM() {
    const pool = getPool();
    const query = `SELECT u.id, u.username, u.elo_classical AS elo_MM, ${LEADERBOARD_PROFILE_IMAGE_EXPRESSION}, u.last_active, u.created_at
                   FROM users u
                   WHERE u.is_banned = FALSE
                   ORDER BY u.elo_classical DESC
                   LIMIT 100`;
    let result = [];
    try {
        const [rows] = await pool.execute(query);
        result = rows;
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
    return result;
}

async function getLeaderBoardByBullet() {
    const pool = getPool();
    const query = `SELECT u.id, u.username, u.elo_blitz AS elo_bullet, ${LEADERBOARD_PROFILE_IMAGE_EXPRESSION}, u.last_active, u.created_at
                   FROM users u
                   WHERE u.is_banned = FALSE
                   ORDER BY u.elo_blitz DESC
                   LIMIT 100`;
    let result = [];
    try {
        const [rows] = await pool.execute(query);
        result = rows;
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
    return result;
}

async function getLeaderBoardByWinRate() {
    const pool = getPool();
    const query = `
        SELECT
            u.id,
            u.username,
            u.elo,
            ${LEADERBOARD_PROFILE_IMAGE_EXPRESSION},
            ROUND(
                IFNULL(
                    (s.wins / NULLIF(s.wins + s.losses + s.draws, 0)) * 100,
                    0
                ), 2
            ) AS winrate_percent,
            s.wins,
            s.losses,
            s.draws,
            u.last_active,
            u.created_at AS joined_at
        FROM
            users u
        JOIN
            statistics s ON u.id = s.user_id
        WHERE
            u.is_banned = FALSE
        ORDER BY
            u.elo DESC,
            winrate_percent DESC
        LIMIT 100;
        `;
    let result = [];
    try {
        const [rows] = await pool.execute(query);
        result = rows;
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
    return result;
}

module.exports = {
    getLeaderBoardByElo,
    getLeaderBoardByMM,
    getLeaderBoardByBullet,
    getLeaderBoardByWinRate
};
