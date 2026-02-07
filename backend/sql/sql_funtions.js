const { getPool } = require('./database.js');

async function insertUser(username, passwordHash, email) {
    const pool = getPool();
    const query = 'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)';
    try {
        const [result] = await pool.execute(query, [username, passwordHash, email]);
        return result;
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            const message = error.sqlMessage.includes('email')
                ? 'Ez az email cím már foglalt.'
                : 'Ez a felhasználónév már foglalt.';
            throw new Error(message);
        }
        throw new Error(message);
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
module.exports = {
    insertUser,
    getUserByUsername,
    getUserByEmail
};