const mysql = require('mysql2/promise');

// Why: env-alapú DB-credek lehetővé teszik, hogy a XAMPP-default (root / üres jelszó / localhost) felüljárható
//      legyen production deployhoz, miközben a meglévő iskolai/lokál setup default-ből változatlan marad.
const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'mattmester',
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
            elo_mattmester INT DEFAULT 800,
            elo_classical INT DEFAULT 800,
            elo_blitz INT DEFAULT 800,
            role ENUM('player', 'admin') DEFAULT 'player',
            is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
            is_banned BOOLEAN DEFAULT FALSE,
            ban_reason VARCHAR(255),
            banned_until TIMESTAMP NULL,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            is_email_verified BOOLEAN DEFAULT FALSE,
            email_verification_token_hash VARCHAR(128) NULL,
            email_verification_token_expires TIMESTAMP NULL,
            email_verification_sent_at TIMESTAMP NULL,
            email_verified_at TIMESTAMP NULL,
            reset_password_token VARCHAR(255),
            reset_token_expires TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_users_email_verification_token_hash (email_verification_token_hash)
        )`,


        `ALTER TABLE users
            ALTER COLUMN profile_image SET DEFAULT '/profile_pictures/default.png'`,

        `UPDATE users
            SET profile_image = '/profile_pictures/default.png'
            WHERE profile_image IS NULL OR TRIM(profile_image) = ''`,

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

        // Képesség seed (idempotens — INSERT IGNORE a UNIQUE name miatt)
        `INSERT IGNORE INTO abilities (name, description, cooldown_turns) VALUES
            ('time_pause', 'Időmegállítás — saját óra rövid szüneteltetése (8mp)', 4),
            ('freeze',     'Bábu befagyasztás — egy ellenséges bábu 1 körig nem mozdulhat', 4),
            ('swap',       'Bábucsere — két saját bábu pozíciójának cseréje (a köröd is)', 5),
            ('board_hide', 'Táblakitakarás — ellenfél 5mp-ig nem tud lépni', 5),
            ('shield',     'Pajzs — saját bábu 1 körre sebezhetetlenné válik', 4),
            ('lefokozas',  'Lefokozás — ellenséges bástya/futó/vezér a következő körében max. 4 mezőt léphet', 4)
        `,

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
            FOREIGN KEY (winner_id) REFERENCES users(id),
            INDEX idx_games_status (status)
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
            FOREIGN KEY (player_id) REFERENCES users(id),
            INDEX idx_moves_game (game_id)
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
            FOREIGN KEY (ability_id) REFERENCES abilities(id),
            INDEX idx_ability_log_game (game_id)
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
            FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_profile_image_uploads_user_status (user_id, status)
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
            UNIQUE KEY unique_participant (conversation_id, user_id),
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

        `CREATE TABLE IF NOT EXISTS notifications (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            type VARCHAR(64) NOT NULL,
            audience ENUM('user', 'multi', 'global', 'role', 'system') NOT NULL DEFAULT 'user',
            target_user_id INT NULL,
            target_role ENUM('player', 'admin') NULL,
            sender_user_id INT NULL,
            title VARCHAR(160) NOT NULL,
            message VARCHAR(500) NOT NULL,
            payload JSON NULL,
            severity ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_notifications_target_user_created (target_user_id, created_at),
            INDEX idx_notifications_audience_created (audience, created_at),
            INDEX idx_notifications_role_created (target_role, created_at),
            INDEX idx_notifications_type (type)
        )`,

        `CREATE TABLE IF NOT EXISTS notification_reads (
            notification_id BIGINT NOT NULL,
            user_id INT NOT NULL,
            read_at TIMESTAMP NULL DEFAULT NULL,
            dismissed_at TIMESTAMP NULL DEFAULT NULL,
            PRIMARY KEY (notification_id, user_id),
            FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_notification_reads_user (user_id),
            INDEX idx_notification_reads_dismissed (user_id, dismissed_at)
        )`,

        `CREATE TABLE IF NOT EXISTS user_logs (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            event_type VARCHAR(100) NOT NULL,
            event_category ENUM('auth', 'game', 'social', 'profile', 'ability', 'security', 'system', 'admin') DEFAULT 'system',
            severity ENUM('info', 'warning', 'error', 'critical') DEFAULT 'info',
            source VARCHAR(50) DEFAULT 'backend',
            success BOOLEAN NULL,
            message VARCHAR(255) NULL,
            ip_address VARCHAR(45) NULL,
            user_agent VARCHAR(255) NULL,
            metadata JSON NULL,
            occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user_logs_user_time (user_id, occurred_at),
            INDEX idx_user_logs_user_event_time (user_id, event_type, occurred_at),
            INDEX idx_user_logs_user_severity_time (user_id, severity, occurred_at),
            INDEX idx_user_logs_ip_time (ip_address, occurred_at)
        )`,

        // Admin panel tablak (ADMIN_PANEL.md §6)
        `CREATE TABLE IF NOT EXISTS admin_tokens (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token_hash CHAR(64) NOT NULL,
            issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_used_at TIMESTAMP NULL,
            expires_at TIMESTAMP NULL DEFAULT NULL,
            revoked_at TIMESTAMP NULL,
            issued_ip VARCHAR(45) NOT NULL,
            issued_user_agent VARCHAR(255) NULL,
            UNIQUE KEY ux_admin_tokens_hash (token_hash),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_admin_tokens_user_active (user_id, revoked_at, expires_at)
        )`,

        `CREATE TABLE IF NOT EXISTS admin_audit_log (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            actor_user_id INT NOT NULL,
            actor_username VARCHAR(50) NOT NULL,
            action VARCHAR(64) NOT NULL,
            severity ENUM('info', 'warning', 'critical') DEFAULT 'info',
            target_type VARCHAR(32) NULL,
            target_id BIGINT NULL,
            target_key VARCHAR(64) NULL,
            target_label VARCHAR(120) NULL,
            reason VARCHAR(1000) NOT NULL,
            before_state JSON NULL,
            after_state JSON NULL,
            success BOOLEAN NOT NULL,
            error_code VARCHAR(64) NULL,
            ip_address VARCHAR(45) NOT NULL,
            user_agent VARCHAR(255) NULL,
            request_id CHAR(26) NOT NULL,
            occurred_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
            FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
            INDEX idx_aal_occurred (occurred_at),
            INDEX idx_aal_actor_time (actor_user_id, occurred_at),
            INDEX idx_aal_action_time (action, occurred_at),
            INDEX idx_aal_target (target_type, target_id, occurred_at),
            INDEX idx_aal_target_key (target_type, target_key, occurred_at),
            INDEX idx_aal_severity_time (severity, occurred_at),
            INDEX idx_aal_request (request_id)
        )`,

        `CREATE TABLE IF NOT EXISTS admin_alert_log (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            kind ENUM('unauthorized', 'rate_escalated', 'token_invalid', 'suspicious_pattern') NOT NULL,
            severity ENUM('warning', 'critical') DEFAULT 'warning',
            user_id INT NULL,
            ip_address VARCHAR(45) NOT NULL,
            endpoint VARCHAR(255) NULL,
            user_agent VARCHAR(255) NULL,
            detail JSON NULL,
            occurred_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_aalert_time (occurred_at),
            INDEX idx_aalert_kind_time (kind, occurred_at),
            INDEX idx_aalert_ip_time (ip_address, occurred_at)
        )`,

        `CREATE TABLE IF NOT EXISTS admin_rate_escalations (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            scope ENUM('ip', 'user') NOT NULL,
            scope_value VARCHAR(64) NOT NULL,
            multiplier DECIMAL(4, 2) NOT NULL DEFAULT 5.00,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP NULL DEFAULT NULL,
            reason VARCHAR(255) NULL,
            UNIQUE KEY ux_rate_esc_scope (scope, scope_value),
            INDEX idx_rate_esc_expires (expires_at)
        )`
    ];

    for (const query of queries) {
        await pool.execute(query);
    }
}

// Forward-compat oszlop-szinkron: ha egy regi DB-ben hianyzik egy uj oszlop,
// itt biztonsagosan, idempotensen hozzaadjuk. Sosem dropol es sosem modositja
// a meglevo adatot. Csak az alkalmazas-szintu sema-evolucio helyettesitesere,
// nem teljes migracio-runner.
async function ensureSchemaColumns() {
    const expectedColumns = [
        {
            table: 'notification_reads',
            column: 'dismissed_at',
            definition: 'TIMESTAMP NULL DEFAULT NULL AFTER read_at',
            indexName: 'idx_notification_reads_dismissed',
            indexColumns: '(user_id, dismissed_at)'
        },
        {
            table: 'notification_reads',
            column: 'read_at',
            definition: 'TIMESTAMP NULL DEFAULT NULL',
            // index nem kell, PK lefedi
            indexName: null,
            indexColumns: null,
            relaxOnly: true // csak akkor modositunk ha a meglevo definicio NOT NULL es default CURRENT_TIMESTAMP
        }
    ];

    for (const spec of expectedColumns) {
        try {
            const [colRows] = await pool.execute(
                `
                    SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE()
                      AND TABLE_NAME = ?
                      AND COLUMN_NAME = ?
                `,
                [spec.table, spec.column]
            );

            if (!colRows.length) {
                await pool.query(`ALTER TABLE \`${spec.table}\` ADD COLUMN \`${spec.column}\` ${spec.definition}`);
                console.log(`[schema] hozzaadva: ${spec.table}.${spec.column}`);
            } else if (spec.relaxOnly) {
                const isNullable = String(colRows[0].IS_NULLABLE || '').toUpperCase() === 'YES';
                if (!isNullable) {
                    await pool.query(`ALTER TABLE \`${spec.table}\` MODIFY COLUMN \`${spec.column}\` ${spec.definition}`);
                    console.log(`[schema] lazitva nullable-re: ${spec.table}.${spec.column}`);
                }
            }

            if (spec.indexName) {
                const [idxRows] = await pool.execute(
                    `
                        SELECT INDEX_NAME
                        FROM INFORMATION_SCHEMA.STATISTICS
                        WHERE TABLE_SCHEMA = DATABASE()
                          AND TABLE_NAME = ?
                          AND INDEX_NAME = ?
                        LIMIT 1
                    `,
                    [spec.table, spec.indexName]
                );
                if (!idxRows.length) {
                    await pool.query(`ALTER TABLE \`${spec.table}\` ADD INDEX \`${spec.indexName}\` ${spec.indexColumns}`);
                    console.log(`[schema] index hozzaadva: ${spec.table}.${spec.indexName}`);
                }
            }
        } catch (err) {
            console.warn(`[schema] ensureSchemaColumns hiba (${spec.table}.${spec.column}):`, err.message);
        }
    }
}

// ────────────────────────────────────────────
// Migrációk régi adatbázisokhoz — minden ALTER hibatűréssel fut.
// Új deployment esetén ezek vagy no-op-ok, vagy gyengén ártatlanok.
// ────────────────────────────────────────────
async function runMigrations() {
    // Régi `elo_MM` oszlop átnevezése `elo_classical`-re (ha létezik még).
    const renames = [
        ['elo_MM',     'elo_classical'],
        ['elo_bullet', 'elo_blitz']
    ];
    for (const [oldName, newName] of renames) {
        try {
            // INFORMATION_SCHEMA check, hogy csak akkor renameljünk, ha tényleg ez van.
            const [rows] = await pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
                [oldName]
            );
            if (rows.length > 0) {
                await pool.execute(`ALTER TABLE users CHANGE \`${oldName}\` \`${newName}\` INT DEFAULT 800`);
                console.log(`[Migration] users.${oldName} → users.${newName} sikeres.`);
            }
        } catch (err) {
            console.warn(`[Migration] users rename ${oldName}→${newName} kihagyva: ${err.message}`);
        }
    }

    // Új oszlopok hozzáadása ha még nem léteznek (régi DB-knél a CREATE TABLE
    // IF NOT EXISTS nem ad új oszlopot, mert a tábla már megvolt).
    const newColumns = [
        ['elo_mattmester',  'INT DEFAULT 800'],
        ['elo_classical',   'INT DEFAULT 800'],
        ['elo_blitz',       'INT DEFAULT 800'],
        ['is_super_admin',  'BOOLEAN NOT NULL DEFAULT FALSE']
    ];
    for (const [colName, colDef] of newColumns) {
        try {
            const [rows] = await pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
                [colName]
            );
            if (rows.length === 0) {
                await pool.execute(`ALTER TABLE users ADD COLUMN \`${colName}\` ${colDef}`);
                // Egyszer-induló UPDATE: a meglévő `elo` érték másolódik az új oszlopba,
                // hogy meglévő user-ek ne 800-on induljanak az új mode-okon.
                await pool.execute(`UPDATE users SET \`${colName}\` = elo WHERE \`${colName}\` = 800 AND elo <> 800`);
                console.log(`[Migration] users.${colName} hozzáadva.`);
            }
        } catch (err) {
            console.warn(`[Migration] users.${colName} hozzáadás kihagyva: ${err.message}`);
        }
    }
}

async function ensureAdminUser() {
    try {
        await pool.execute(
            `INSERT INTO users (username, password_hash, email, elo, elo_mattmester, elo_classical, elo_blitz, role, is_super_admin, is_email_verified, email_verified_at)
            VALUES ('admin', '$2b$10$haOYyFwigR.niAHSKk.F2.yYfWF27v0RyJYofUDWN981AFdNDollq', 'admin@mattmester.com', 1500, 1500, 1500, 1500, 'admin', TRUE, TRUE, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE is_super_admin = TRUE`
        );
        console.log('[DB] Admin user OK.');
    } catch (err) {
        console.warn('[DB] ensureAdminUser hiba (kihagyva):', err.message);
    }
}

async function initDatabase() {
    try {
        await ensureDatabaseExists();

        pool = mysql.createPool(dbConfig);
        const conn = await pool.getConnection();
        conn.release();

        await createTables();
        await runMigrations();
        await ensureSchemaColumns();
        await ensureAdminUser();
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

module.exports = {
    initDatabase,
    closeDatabase,
    getPool: () => pool
};
