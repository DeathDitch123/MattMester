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

async function ensureDatabaseExists() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password
        });

        const dbName = dbConfig.database;
        await connection.query(
            `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );
    } catch (err) {
        console.error('Failed to ensure database exists:', err);
        throw err;
    } finally {
        if (connection) {
            try {
                await connection.end();
            } catch (e) {
                console.error('Error closing temporary connection:', e);
            }
        }
    }
}

async function createTables() {
    const queries = [
        `CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) BINARY UNIQUE NOT NULL, 
            password_hash VARCHAR(255) NOT NULL,
            email VARCHAR(100) UNIQUE,
            elo INT DEFAULT 1200,
            role ENUM('player', 'admin') DEFAULT 'player',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`,

        `INSERT IGNORE INTO users (username, password_hash, email, elo, role) 
            VALUES ('admin', '$2b$10$eIBn3ePwTf8.rEh28Vr1O.IsuyQPVIl1g7xAOKQnb3EhsBgdGYK2O', 'admin@mattmester.com', 1500, 'admin');
        `,

        `CREATE TABLE IF NOT EXISTS statistics (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNIQUE NOT NULL,
            wins INT DEFAULT 0,
            losses INT DEFAULT 0,
            abilities_used INT DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `INSERT IGNORE INTO statistics (user_id) 
            SELECT id FROM users WHERE username = 'admin';
        `,

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
            user_init_id INT NOT NULL,
            user_recv_id INT NOT NULL,
            status ENUM('pending', 'accepted', 'blocked') DEFAULT 'pending',
            invite_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_friendship (user_init_id, user_recv_id),
            FOREIGN KEY (user_init_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (user_recv_id) REFERENCES users(id) ON DELETE CASCADE
        )`
    ];

    for (const query of queries) {
        await pool.execute(query);
    }
}

async function initDatabase() {
    try {
        await ensureDatabaseExists();

        pool = mysql.createPool(dbConfig);
        const conn = await pool.getConnection();
        conn.release();

        await createTables();
        console.log('Database initialized successfully.');
    } catch (err) {
        console.error('Failed to initialize database:', err);
        if (pool) {
            try {
                await pool.end();
            } catch (e) {
                console.error('Error closing pool after failed init:', e);
            }
            pool = null;
        }
        throw err;
    }
}

async function closeDatabase() {
    if (pool) {
        try {
            await pool.end();
            pool = null;
            console.log('Database pool closed.');
        } catch (err) {
            console.error('Error closing database pool:', err);
            throw err;
        }
    }
}

async function selectAllTest() {
    const [rows] = await pool.execute('SELECT * FROM testtable');
    return rows;
}

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
    closeDatabase,
    getPool: () => pool,
    selectAllTest,
    insertTestUser
};
