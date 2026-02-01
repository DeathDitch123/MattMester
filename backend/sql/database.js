const mysql = require('mysql2/promise');

const dbConfig = {
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'mattmester',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;

/**
 * ❗ JAVÍTÁS:
 * Az adatbázist külön hozzuk létre, mielőtt pool-t csinálunk
 */
async function ensureDatabaseExists() {
    const connection = await mysql.createConnection({
        host: dbConfig.host,
        user: dbConfig.user,
        password: dbConfig.password
    });

    await connection.query('CREATE DATABASE IF NOT EXISTS mattmester');
    await connection.end();
}

/**
 * ❗ JAVÍTÁS:
 * Táblák pontosítása (AUTO_INCREMENT helyes használat)
 */
async function createTables() {
    const queries = [

        // ❗ JAVÍTÁS: id AUTO_INCREMENT, nem szabad kézzel tölteni
        `CREATE TABLE IF NOT EXISTS testtable (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) UNIQUE NOT NULL
        )`,

        `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            email VARCHAR(100) UNIQUE,
            elo INT DEFAULT 1200,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_elo (elo)
        )`,

        `CREATE TABLE IF NOT EXISTS statistics (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNIQUE NOT NULL,
            wins INT DEFAULT 0,
            losses INT DEFAULT 0,
            abilities_used INT DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS abilities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT
        )`,

        `CREATE TABLE IF NOT EXISTS games (
            id INT AUTO_INCREMENT PRIMARY KEY,
            white_player_id INT NOT NULL,
            black_player_id INT NOT NULL,
            winner_id INT,
            start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            end_time TIMESTAMP NULL,
            status ENUM('ongoing', 'finished', 'abandoned') DEFAULT 'ongoing',
            FOREIGN KEY (white_player_id) REFERENCES users(id),
            FOREIGN KEY (black_player_id) REFERENCES users(id),
            FOREIGN KEY (winner_id) REFERENCES users(id)
        )`,

        /**
         * ❗ JAVÍTÁS:
         * sakk-specifikus mezők hozzáadva
         */
        `CREATE TABLE IF NOT EXISTS moves (
            id INT AUTO_INCREMENT PRIMARY KEY,
            game_id INT NOT NULL,
            player_id INT NOT NULL,
            move_number INT NOT NULL,
            piece VARCHAR(10),
            from_pos VARCHAR(5),
            to_pos VARCHAR(5),
            is_capture BOOLEAN DEFAULT FALSE,
            is_check BOOLEAN DEFAULT FALSE,
            is_checkmate BOOLEAN DEFAULT FALSE,
            promotion_piece VARCHAR(10),
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
            FOREIGN KEY (player_id) REFERENCES users(id)
        )`,

        `CREATE TABLE IF NOT EXISTS ability_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            move_id INT NOT NULL,
            ability_id INT NOT NULL,
            FOREIGN KEY (move_id) REFERENCES moves(id) ON DELETE CASCADE,
            FOREIGN KEY (ability_id) REFERENCES abilities(id)
        )`,

        `CREATE TABLE IF NOT EXISTS friends (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user1_id INT NOT NULL,
            user2_id INT NOT NULL,
            status ENUM('pending', 'accepted', 'blocked') DEFAULT 'pending',
            invite_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_friendship (user1_id, user2_id),
            FOREIGN KEY (user1_id) REFERENCES users(id),
            FOREIGN KEY (user2_id) REFERENCES users(id)
        )`
    ];

    for (const query of queries) {
        await pool.execute(query);
    }
}

/**
 * ❗ JAVÍTÁS:
 * pool csak az adatbázis létrehozása után jön létre
 */
async function initDatabase() {
    await ensureDatabaseExists();
    pool = mysql.createPool(dbConfig);
    await createTables();
}

/* ================= SQL QUERIES ================= */

/**
 * ✔ OK
 */
async function selectAllTest() {
    const [rows] = await pool.execute('SELECT * FROM testtable');
    return rows;
}


/**
 * ❗ JAVÍTÁS:
 * AUTO_INCREMENT id-t nem adunk meg
 */
async function insertTestUser(username) {
    const query = 'INSERT INTO testtable (username) VALUES (?)';
    const [result] = await pool.execute(query, [username]);
    return result;
}
async function insertall(id, username) {
    const query = 'INSERT INTO testtable (id, username) VALUES (?, ?)';
    try {
        const [result] = await pool.execute(query, [id, username]);
        return result;
    } catch (error) {
        console.error('Database error:', error);
        throw error;
    }

}

module.exports = {
    initDatabase,
    getPool: () => pool,
    selectAllTest,
    insertTestUser
};
