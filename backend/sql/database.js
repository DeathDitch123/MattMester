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
            profile_image VARCHAR(255) DEFAULT '/profile_pictures/default.png',
            elo INT DEFAULT 800,
            elo_MM INT DEFAULT 800,
            elo_bullet INT DEFAULT 800,
            role ENUM('player', 'admin') DEFAULT 'player',
            is_banned BOOLEAN DEFAULT FALSE,
            ban_reason VARCHAR(255),
            banned_until TIMESTAMP NULL,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            is_email_verified BOOLEAN DEFAULT FALSE,
            reset_password_token VARCHAR(255),
            reset_token_expires TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,

        `INSERT IGNORE INTO users (username, password_hash, email, elo, elo_MM, elo_bullet, role) 
            VALUES ('admin', '$2b$10$haOYyFwigR.niAHSKk.F2.yYfWF27v0RyJYofUDWN981AFdNDollq', 'admin@mattmester.com', 1500, 1500, 1500, 'admin');
        `,

        `ALTER TABLE users
            ALTER COLUMN profile_image SET DEFAULT '/profile_pictures/default.png'`,

        `UPDATE users
            SET profile_image = '/profile_pictures/default.png'
            WHERE profile_image IS NULL OR TRIM(profile_image) = ''`,

        `CREATE TABLE IF NOT EXISTS login_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            ip_address VARCHAR(45) NOT NULL,
            user_agent VARCHAR(255),
            login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS statistics (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNIQUE NOT NULL,
            wins INT DEFAULT 0,
            losses INT DEFAULT 0,
            draws INT DEFAULT 0,
            abilities_used INT DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `INSERT IGNORE INTO statistics (user_id) 
            SELECT id FROM users WHERE username = 'admin';
        `,

        `CREATE TABLE IF NOT EXISTS abilities (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL UNIQUE,
            description TEXT,
            cooldown_turns INT DEFAULT 0
        )`,

        `CREATE TABLE IF NOT EXISTS games (
            id INT AUTO_INCREMENT PRIMARY KEY,
            white_player_id INT NOT NULL,
            black_player_id INT NOT NULL,
            winner_id INT,
            time_control VARCHAR(20) DEFAULT '10+0',
            initial_fen VARCHAR(100) DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            current_fen VARCHAR(100),
            pgn TEXT,
            start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            end_time TIMESTAMP NULL,
            status ENUM('ongoing', 'finished', 'abandoned', 'draw') DEFAULT 'ongoing',
            FOREIGN KEY (white_player_id) REFERENCES users(id),
            FOREIGN KEY (black_player_id) REFERENCES users(id),
            FOREIGN KEY (winner_id) REFERENCES users(id)
        )`,

        `CREATE TABLE IF NOT EXISTS game_chats (
            id INT AUTO_INCREMENT PRIMARY KEY,
            game_id INT NOT NULL,
            sender_id INT NOT NULL,
            message TEXT NOT NULL,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS moves (
            id INT AUTO_INCREMENT PRIMARY KEY,
            game_id INT NOT NULL,
            player_id INT NOT NULL,
            ply_number INT NOT NULL,
            san VARCHAR(10) NOT NULL,
            piece VARCHAR(10),
            from_pos VARCHAR(5),
            to_pos VARCHAR(5),
            fen_after VARCHAR(100) NOT NULL,
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
            game_id INT NOT NULL,
            move_id INT,
            player_id INT NOT NULL,
            ability_id INT NOT NULL,
            used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
            FOREIGN KEY (move_id) REFERENCES moves(id) ON DELETE CASCADE,
            FOREIGN KEY (player_id) REFERENCES users(id),
            FOREIGN KEY (ability_id) REFERENCES abilities(id)
        )`,

        `CREATE TABLE IF NOT EXISTS friends (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user1_id INT NOT NULL,
            user2_id INT NOT NULL,
            action_user_id INT NOT NULL,
            status ENUM('pending', 'accepted', 'rejected', 'blocked') DEFAULT 'pending',
            invite_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_friendship (user1_id, user2_id),
            CHECK (user1_id < user2_id),
            FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (action_user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS friend_blocks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            blocker_user_id INT NOT NULL,
            blocked_user_id INT NOT NULL,
            active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_friend_block (blocker_user_id, blocked_user_id),
            CHECK (blocker_user_id <> blocked_user_id),
            FOREIGN KEY (blocker_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS profile_image_uploads (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            filename VARCHAR(255) NOT NULL,
            upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            status ENUM('pending', 'approved', 'rejected', 'discarded', 'default') DEFAULT 'pending',
            review_note TEXT,
            reviewed_by INT,
            review_time TIMESTAMP NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
        )`,

        `CREATE TABLE IF NOT EXISTS chat_conversations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            type ENUM('private', 'group') NOT NULL,
            name VARCHAR(255) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_message_at TIMESTAMP NULL DEFAULT NULL,
            last_message_preview VARCHAR(255) NULL,
            UNIQUE KEY unique_group_name (name),
            INDEX idx_chat_conversations_last_message_at (last_message_at)
        )`,

        `CREATE TABLE IF NOT EXISTS chat_participants (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            user_id INT NOT NULL,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_read_message_id INT NULL,
            UNIQUE KEY unique_chat_participant (conversation_id, user_id),
            INDEX idx_chat_participants_user (user_id),
            INDEX idx_chat_participants_conversation (conversation_id),
            FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )`,

        `CREATE TABLE IF NOT EXISTS chat_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            sender_id INT NOT NULL,
            body TEXT NOT NULL,
            body_masked TEXT NULL,
            is_body_masked BOOLEAN DEFAULT FALSE,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_chat_messages_conversation_sent_at (conversation_id, sent_at),
            INDEX idx_chat_messages_sender (sender_id)
        )`,

        `CREATE TABLE IF NOT EXISTS user_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            event_type VARCHAR(100) NOT NULL,
            event_category ENUM('auth', 'game', 'social', 'profile', 'ability', 'security', 'system', 'admin') DEFAULT 'system',
            severity ENUM('info', 'warning', 'error', 'critical') DEFAULT 'info',
            source VARCHAR(50) DEFAULT 'backend',
            success BOOLEAN NULL,
            metric_key VARCHAR(100) NULL, 
            metric_value DECIMAL(14, 4) NULL, 
            metric_delta DECIMAL(14, 4) NULL, 
            message VARCHAR(255) NULL,
            metadata JSON NULL, 
            occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user_logs_user_time (user_id, occurred_at),
            INDEX idx_user_logs_user_event_time (user_id, event_type, occurred_at),
            INDEX idx_user_logs_user_metric_time (user_id, metric_key, occurred_at),
            INDEX idx_user_logs_user_severity_time (user_id, severity, occurred_at)
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
