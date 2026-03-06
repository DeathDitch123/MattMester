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
async function getLeaderBoard() {
    const pool = getPool();
    const query = 'SELECT users.username, users.elo FROM users ORDER BY elo DESC LIMIT 10';
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

module.exports = {
    insertUser,
    getUserByUsername,
    getUserByEmail,
    getLeaderBoard,
    getSessionUserById
};