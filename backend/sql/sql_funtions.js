async function insertUser(username, passwordHash, email) {
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
module.exports = {
    getPool: () => pool,
    insertUser
};