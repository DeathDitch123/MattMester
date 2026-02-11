const { getPool } = require('./database.js');

async function insertUser(username, passwordHash, email) {
    const pool = getPool();
    const query = 'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)';

    const existingUser = await getUserByUsername(username);
    const existingEmail = await getUserByEmail(email);

    if (existingUser) {
        throw new Error('Ez a felhasználónév már foglalt.');
    } else {
        if (existingEmail) {
            throw new Error('Ez az email cím már foglalt.');
        }
        else {
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
                throw new Error('Adatbázis hiba a beszúrás során.');
            }
        }
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

module.exports = {
    insertUser,
    getUserByUsername,
    getUserByEmail,
    getLeaderBoard
};