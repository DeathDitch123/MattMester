const { getPool } = require('./database.js');

async function insertUser(username, passwordHash, email) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const query = 'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)';
        const [userResult] = await connection.execute(query, [username, passwordHash, email]);
        const insertedUserId = userResult.insertId;

        const statsQuery = 'INSERT INTO statistics (user_id) VALUES (?)';
        await connection.execute(statsQuery, [insertedUserId]);

        await connection.commit();

        return userResult;
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            const message = error.sqlMessage.includes('email')
                ? 'Ez az email cím már foglalt.'
                : 'Ez a felhasználónév már foglalt.';
            throw new Error(message);
        }
        throw new Error('Hiba történt a regisztráció során. Minden módosítás visszavonva.');
    }
    finally {
        connection.release();
    }
}
async function getUserByUsername(username) {
    const pool = getPool();
    const query = 'SELECT * FROM users WHERE username = ?';
    try {
        const [rows] = await pool.execute(query, [username]);
        return rows[0];
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
}
async function getUserByEmail(mailAdress) {
    const pool = getPool();
    const query = 'SELECT * FROM users WHERE email = ?';
    try {
        const [rows] = await pool.execute(query, [mailAdress]);
        return rows[0];
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
}
async function getLeaderBoardByElo() {
    const pool = getPool();
    const query = 'SELECT users.username, users.elo, users.last_active, users.created_at FROM users WHERE users.is_banned = FALSE ORDER BY elo DESC LIMIT 100';
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
}

async function getLeaderBoardByMM() {
    const pool = getPool();
    const query = 'SELECT users.username, users.elo_MM, users.last_active, users.created_at FROM users WHERE users.is_banned = FALSE ORDER BY elo DESC LIMIT 100';
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
}

async function getLeaderBoardByBullet() {
    const pool = getPool();
    const query = 'SELECT users.username, users.elo_bullet, users.last_active, users.created_at FROM users WHERE users.is_banned = FALSE ORDER BY elo DESC LIMIT 100';
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
}

async function getLeaderBoardByWinRate() {
    const pool = getPool();
    const query = `
        SELECT 
            u.username,
            u.elo,
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
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
}

async function getSessionUserById(userId) {
    const pool = getPool();
    const query = `
        SELECT
            u.id,
            u.username,
            u.email,
            u.role,
            u.elo,
            u.elo_MM,
            u.elo_bullet,
            u.is_banned,
            u.ban_reason,
            u.banned_until,
            u.last_active,
            u.is_email_verified,
            u.created_at,
            COALESCE(s.wins, 0) AS wins,
            COALESCE(s.losses, 0) AS losses,
            COALESCE(s.draws, 0) AS draws,
            COALESCE(s.abilities_used, 0) AS abilities_used
        FROM users u
        LEFT JOIN statistics s ON s.user_id = u.id
        WHERE u.id = ?
        LIMIT 1
    `;

    const fallbackQuery = `
        SELECT
            u.id,
            u.username,
            u.email,
            u.role,
            u.elo,
            NULL AS elo_MM,
            NULL AS elo_bullet,
            FALSE AS is_banned,
            NULL AS ban_reason,
            NULL AS banned_until,
            NULL AS last_active,
            FALSE AS is_email_verified,
            u.created_at,
            COALESCE(s.wins, 0) AS wins,
            COALESCE(s.losses, 0) AS losses,
            0 AS draws,
            COALESCE(s.abilities_used, 0) AS abilities_used
        FROM users u
        LEFT JOIN statistics s ON s.user_id = u.id
        WHERE u.id = ?
        LIMIT 1
    `;

    try {
        const [rows] = await pool.execute(query, [userId]);
        return rows[0];
    } catch (error) {
        if (error.code === 'ER_BAD_FIELD_ERROR') {
            const [rows] = await pool.execute(fallbackQuery, [userId]);
            return rows[0];
        }
        throw new Error('Hiba a session felhasznalo lekerdezese soran.');
    }
}

async function getTotalUsers() {
    const pool = getPool();
    const query = 'SELECT COUNT(*) AS total FROM users';
    try {
        const [rows] = await pool.execute(query);
        return rows[0].total;
    } catch (error) {
        throw new Error('Hiba a felhasználók lekérdezése során.');
    }
}
async function getTotalGames() {
    const pool = getPool();
    const query = 'SELECT COUNT(*) AS total FROM games';
    try {
        const [rows] = await pool.execute(query);
        return rows[0].total;
    } catch (error) {
        throw new Error('Hiba a játékok lekérdezése során.');
    }
}
async function getOnlineGamesCount() {
    const pool = getPool();
    const query = 'SELECT COUNT(*) AS total FROM games WHERE status = "ongoing"';
    try {
        const [rows] = await pool.execute(query);
        return rows[0].total;
    } catch (error) {
        throw new Error('Hiba a játékok lekérdezése során.');
    }
}
async function getAllUsers() {
    const pool = getPool();
    const query = `
        SELECT 
            u.id,
            u.username,
            u.email,
            u.role,
            u.elo,
            u.elo_MM,
            u.elo_bullet,
            u.is_banned,
            u.banned_until,
            u.last_active,
            u.created_at,
            COALESCE(s.wins, 0) AS wins,
            COALESCE(s.losses, 0) AS losses,
            COALESCE(s.draws, 0) AS draws,
            COALESCE(s.abilities_used, 0) AS total_abilities,
            IFNULL(ROUND((s.wins / NULLIF(s.wins + s.losses + s.draws, 0)) * 100, 1), 0) AS win_rate_percent,
            (SELECT ip_address FROM login_history WHERE user_id = u.id ORDER BY login_time DESC LIMIT 1) AS last_ip
        FROM 
            users u
        LEFT JOIN 
            statistics s ON u.id = s.user_id
        ORDER BY 
            u.last_active DESC;
        `;
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a felhasználók lekérdezése során.');
    }
}
async function getAllRooms() {
    const pool = getPool();
    const query = `
        SELECT 
            g.id AS game_id,
            w.username AS white_player,
            b.username AS black_player,
            win.username AS winner,
            g.status,
            g.time_control,
            g.start_time,
            g.end_time,
            (SELECT COUNT(*) FROM ability_log al 
             JOIN moves m ON al.move_id = m.id 
             WHERE m.game_id = g.id) AS abilities_used_in_game,
            (SELECT GROUP_CONCAT(CONCAT(sender.username, ': ', gc.message) SEPARATOR ' | ') 
             FROM game_chats gc 
             JOIN users sender ON gc.sender_id = sender.id 
             WHERE gc.game_id = g.id) AS chat_history
        FROM 
            games g
        JOIN users w ON g.white_player_id = w.id
        JOIN users b ON g.black_player_id = b.id
        LEFT JOIN users win ON g.winner_id = win.id
        ORDER BY g.start_time DESC; -- Legfrissebbek elöl
        `;
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a szobák lekérdezése során.');
    }
}
//később ip csaláshoz esetleges szűréshez, vagy csak simán statisztikához, hogy melyik ip címről hány account van stb... bár ez utóbbi lehet, hogy nem annyira fontos, de majd meglátjuk
async function logLoginAttempt(userId, ipAddress, userAgent) {
    const pool = getPool();
    const connection = await pool.getConnection();
    const query = 'INSERT INTO login_history (user_id, ip_address, user_agent) VALUES (?, ?, ?)';
    try {
        await connection.beginTransaction();
        await connection.execute(query, [userId, ipAddress, userAgent]);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        console.error('Hiba a login kísérlet naplózása során:', error);
    }
    finally {
        connection.release();
    }
}
async function ipCollisionCheck(ipAddress) {
    const pool = getPool();
    const query = `SELECT user_id, COUNT(*) AS attempts FROM login_history WHERE ip_address = ? AND login_time > (NOW() - INTERVAL 1 HOUR) GROUP BY user_id HAVING attempts > 5`;
    try {
        const [rows] = await pool.execute(query, [ipAddress]);
        return rows;
    } catch (error) {
        throw new Error('Hiba az IP cím ütközés ellenőrzése során.');
    }
}
async function ipCollisions(){
    const pool = getPool();
    const query = `
        SELECT 
            ip_address, 
            COUNT(DISTINCT user_id) AS user_count, 
            GROUP_CONCAT(DISTINCT u.username SEPARATOR ', ') AS shared_accounts
        FROM 
            login_history lh
        JOIN 
            users u ON lh.user_id = u.id
        GROUP BY 
            ip_address
        HAVING 
            user_count > 1;
        `;
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba az IP cím ütközések lekérdezése során.');
    }
}

module.exports = {
    insertUser,
    getUserByUsername,
    getUserByEmail,
    getLeaderBoardByElo,
    getLeaderBoardByMM,
    getLeaderBoardByBullet,
    getLeaderBoardByWinRate,
    getSessionUserById,
    getTotalUsers,
    getTotalGames,
    getOnlineGamesCount,
    getAllUsers,
    getAllRooms,
    logLoginAttempt,
    ipCollisionCheck,
    ipCollisions
};