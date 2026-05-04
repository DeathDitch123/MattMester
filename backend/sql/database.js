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

        // Persistent email-ban tabla: a torolt-de-banned user-ek email cime ide kerul
        // hogy ne lehessen ujraregisztralni a ban idejere. banned_until NULL = vegleges.
        `CREATE TABLE IF NOT EXISTS banned_emails (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(100) NOT NULL UNIQUE,
            banned_until TIMESTAMP NULL DEFAULT NULL,
            ban_reason VARCHAR(255) DEFAULT NULL,
            original_user_id INT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_banned_emails_until (banned_until)
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

        // moves: san es fen_after NULL-able. Eredetileg NOT NULL voltak, de a
        // chess engine-ben jelenleg nem generalunk full FEN-t es minden meccsen
        // a NULL miatt silently elnyelodott az INSERT. Most NULL-able-tel a
        // mentes mar megy, san hianyaban a "Pawn e2-e4" formatumot hasznaljuk
        // szovegesen az admin review-hoz; teljes FEN csak akkor mentodik, ha
        // a hivo at tudja adni.
        `CREATE TABLE IF NOT EXISTS moves (
            id INT AUTO_INCREMENT PRIMARY KEY,
            game_id INT NOT NULL,
            player_id INT NOT NULL,
            ply_number INT NOT NULL,
            san VARCHAR(20) NULL DEFAULT NULL,
            piece VARCHAR(10),
            from_pos VARCHAR(5),
            to_pos VARCHAR(5),
            fen_after VARCHAR(100) NULL DEFAULT NULL,
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

        `CREATE TABLE IF NOT EXISTS chat_message_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            message_id INT NOT NULL,
            reporter_user_id INT NOT NULL,
            reason VARCHAR(500) NULL,
            status ENUM('pending', 'allowed', 'deleted', 'dismissed') NOT NULL DEFAULT 'pending',
            reviewed_by INT NULL,
            reviewed_at TIMESTAMP NULL DEFAULT NULL,
            review_note VARCHAR(1000) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_report_per_user_per_message (message_id, reporter_user_id),
            FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
            FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_chat_message_reports_status (status, created_at),
            INDEX idx_chat_message_reports_message (message_id),
            INDEX idx_chat_message_reports_reporter (reporter_user_id)
        )`,

        `CREATE TABLE IF NOT EXISTS chat_blocked_words_dynamic (
            word VARCHAR(255) NOT NULL PRIMARY KEY,
            added_by_admin_id INT NULL,
            source_message_id INT NULL,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (added_by_admin_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (source_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL,
            INDEX idx_chat_blocked_words_added_at (added_at)
        )`,

        // 3-csapas tragarsag auto-ban rendszer. Egy strike akkor keletkezik:
        //   - 'auto' source: a profanity-filter (soft_mask) maszkolta az uzenetet
        //   - 'admin_delete' source: az admin torolt egy bejelentett uzenetet
        // UNIQUE(message_id) megakadalyozza a duplikalast, ha auto + admin egyazon uzenethez.
        // Strike count alapjan: 1 -> 1 napos ban, 2 -> 10 napos ban, 3+ -> perma ban.
        // FK NINCS chat_messages-re (ha a uzenetet kesobb kitorli a CASCADE, az audit megmarad).
        `CREATE TABLE IF NOT EXISTS chat_profanity_strikes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            message_id INT NULL,
            source ENUM('auto', 'admin_delete') NOT NULL,
            ban_type ENUM('temp_1d', 'temp_10d', 'perma', 'none') NOT NULL DEFAULT 'none',
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_message (message_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_chat_profanity_strikes_user (user_id, recorded_at)
        )`,

        // Account ban események + IP szerinti escalation. Minden account-ban (auto vagy admin)
        // ide naplózódik a banolt user IP-jével együtt; a recordAccountBanEvent fn megnezi:
        // ha ugyanarrol az IP-rol mar mas user is volt banolva, akkor IP-blokkot is kioszt
        // (1 napos első alkalommal, perma ha az IP-nek mar van ip_blocks history-ja).
        `CREATE TABLE IF NOT EXISTS account_ban_events (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            ip_address VARCHAR(45) NULL,
            source ENUM('profanity_strike', 'admin_manual', 'admin_critical', 'other') NOT NULL DEFAULT 'other',
            reason VARCHAR(500) NULL,
            triggered_ip_block BOOLEAN NOT NULL DEFAULT FALSE,
            ip_block_type ENUM('temp_1d', 'perma', 'none') NOT NULL DEFAULT 'none',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_account_ban_events_ip (ip_address, created_at),
            INDEX idx_account_ban_events_user (user_id, created_at)
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
            kind VARCHAR(64) NOT NULL,
            severity ENUM('info', 'warning', 'critical') DEFAULT 'warning',
            user_id INT NULL,
            ip_address VARCHAR(45) NOT NULL,
            endpoint VARCHAR(255) NULL,
            user_agent VARCHAR(255) NULL,
            detail JSON NULL,
            dismissed_at TIMESTAMP NULL DEFAULT NULL,
            dismissed_by_user_id INT NULL DEFAULT NULL,
            occurred_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_aalert_time (occurred_at),
            INDEX idx_aalert_kind_time (kind, occurred_at),
            INDEX idx_aalert_ip_time (ip_address, occurred_at),
            INDEX idx_aalert_dismissed (dismissed_at, occurred_at)
        )`,

        // Hard IP block tabla — a request-szintu ipBlockGuard middleware ezt nezi.
        // Az admin a Riasztasok felulrol tud blokkot felvinni egy alert IP-jere.
        `CREATE TABLE IF NOT EXISTS ip_blocks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ip_address VARCHAR(45) NOT NULL,
            blocked_until TIMESTAMP NULL DEFAULT NULL,
            reason VARCHAR(500) DEFAULT NULL,
            blocked_by_user_id INT NULL DEFAULT NULL,
            blocked_by_username VARCHAR(50) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uk_ip_blocks_ip (ip_address),
            INDEX idx_ip_blocks_until (blocked_until)
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
        )`,

        // User-vs-user bejelentesek (NEM chat-uzenet bejelentesek - azoknak kulon
        // a chat_message_reports tablajuk van). Ide kerulnek a player-actions
        // bejelentesek: cheating, toxicity, spam, fairplay megsertese, stb.
        // Status: 'open' (uj), 'under_review' (admin nezi), 'closed' (lezarva).
        // FONTOS: false report eseten NEM bunteti a bejelentot (chat-tel ellentetben),
        // mert egy player-magaviselet utolagosan nehezen ellenorizheto.
        // game_id: opcionalis - egy konkret meccshez kapcsolt bejelentes (cheating /
        // unfair_play eseten), igy az admin a PGN + lepeslista alapjan tud
        // dontest hozni. ON DELETE SET NULL: ha a meccs torlodne, a report megmarad.
        `CREATE TABLE IF NOT EXISTS user_reports (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            reporter_user_id INT NOT NULL,
            reported_user_id INT NOT NULL,
            game_id INT NULL,
            category ENUM('cheating', 'toxicity', 'spam', 'harassment', 'unfair_play', 'other') NOT NULL DEFAULT 'other',
            message VARCHAR(1000) NULL,
            status ENUM('open', 'under_review', 'closed') NOT NULL DEFAULT 'open',
            resolution ENUM('none', 'dismissed', 'warned', 'banned') NOT NULL DEFAULT 'none',
            admin_note VARCHAR(1000) NULL,
            reviewed_by_user_id INT NULL,
            reviewed_at TIMESTAMP NULL DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL,
            INDEX idx_user_reports_status_created (status, created_at),
            INDEX idx_user_reports_reported (reported_user_id, created_at),
            INDEX idx_user_reports_reporter (reporter_user_id, created_at),
            INDEX idx_user_reports_game (game_id)
        )`,

        // Site-wide settings (single-row pattern: id=1 mindig). Az admin panel
        // Beallitasok oldala ezt olvassa/irja. Maintenance/registration toggle
        // elesben hat — middleware-ek olvassak (cache TTL=30s).
        `CREATE TABLE IF NOT EXISTS site_settings (
            id TINYINT PRIMARY KEY DEFAULT 1,
            site_name VARCHAR(100) NOT NULL DEFAULT 'MattMester',
            support_email VARCHAR(150) NOT NULL DEFAULT 'mattmester.support@gmail.com',
            default_language ENUM('hu', 'en') NOT NULL DEFAULT 'hu',
            timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Budapest',
            registration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            maintenance_mode BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            updated_by INT NULL,
            CHECK (id = 1),
            FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
        )`,

        `INSERT IGNORE INTO site_settings (id) VALUES (1)`,

        // Tesztfutasok elozmenyei (utolso N runt tartjuk meg). Az admin panel
        // Tesztek oldal ezt listazza, a testRunnerService irja a recordokat.
        `CREATE TABLE IF NOT EXISTS test_runs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            triggered_by INT NULL,
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            finished_at TIMESTAMP NULL,
            status ENUM('running', 'passed', 'failed', 'timeout', 'error') NOT NULL DEFAULT 'running',
            total INT DEFAULT 0,
            passed INT DEFAULT 0,
            failed INT DEFAULT 0,
            skipped INT DEFAULT 0,
            duration_ms INT NULL,
            raw_summary JSON NULL,
            stderr_tail TEXT NULL,
            FOREIGN KEY (triggered_by) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_test_runs_started (started_at)
        )`,

        // "Recent opponents" tabla — Rocket League stilusu lista a felhasznalo
        // legutobbi ellenfeleirol. Egy par (user_id, opponent_user_id) UNIQUE,
        // utolso meccs idopontjat tartjuk + meccsek szamat. A frontend listaba
        // utolso meccs szerint csokkeno sorrendben rendez, max 25-ot mutat,
        // alul levag - karbantartas a backendben tortenik a recordRecentOpponent
        // hivasakor (a 25. felett a legregebbi tablaban marad, csak a UI vagja).
        `CREATE TABLE IF NOT EXISTS recent_opponents (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            opponent_user_id INT NOT NULL,
            last_played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            match_count INT NOT NULL DEFAULT 1,
            last_game_id INT NULL,
            UNIQUE KEY ux_recent_opponents_pair (user_id, opponent_user_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (opponent_user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_recent_opponents_user_time (user_id, last_played_at)
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
        ['elo_mattmester',          'INT DEFAULT 800'],
        ['elo_classical',           'INT DEFAULT 800'],
        ['elo_blitz',               'INT DEFAULT 800'],
        ['is_super_admin',          'BOOLEAN NOT NULL DEFAULT FALSE'],
        // Soft-delete grace period (admin-trigger only). Ha kitoltott, a user nem
        // tud belepni, de az adatok meg megvannak. Hourly cron hard-delete-eli ha
        // pending_deletion_until < NOW().
        ['pending_deletion_until',  'TIMESTAMP NULL DEFAULT NULL'],
        ['deleted_by_admin_id',     'INT NULL DEFAULT NULL'],
        ['deleted_reason',          'VARCHAR(500) NULL DEFAULT NULL'],
        // Chat report mute: ha az admin "Engedelyezes" gombra kattint egy bejelenten,
        // a bejelento(k) 5 oraig nem tudnak ujabb chat uzenetet bejelenteni.
        ['chat_report_mute_until',  'TIMESTAMP NULL DEFAULT NULL'],
        // Az utolsó sikeres bejelentkezés IP-je. Az auto IP-ban escalation lekérdezi
        // ezt amikor admin manuálisan banol egy usert (a user nem feltétlenül online).
        ['last_login_ip',           'VARCHAR(45) NULL DEFAULT NULL']
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

    // admin_alert_log: kind ENUM → VARCHAR(64) (régi DB-ken ENUM volt; az új user_banned/
    // user_deleted/user_unbanned kindek elutasítva lennének).
    try {
        const [rows] = await pool.execute(
            `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_alert_log' AND COLUMN_NAME = 'kind'`
        );
        if (rows.length > 0 && String(rows[0].DATA_TYPE).toLowerCase() === 'enum') {
            await pool.execute(`ALTER TABLE admin_alert_log MODIFY COLUMN kind VARCHAR(64) NOT NULL`);
            console.log('[Migration] admin_alert_log.kind ENUM → VARCHAR(64).');
        }
    } catch (err) {
        console.warn(`[Migration] admin_alert_log.kind ENUM modify kihagyva: ${err.message}`);
    }

    // admin_alert_log: severity ENUM bővítés (régi: warning|critical, új: info|warning|critical).
    try {
        const [rows] = await pool.execute(
            `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_alert_log' AND COLUMN_NAME = 'severity'`
        );
        if (rows.length > 0 && !String(rows[0].COLUMN_TYPE || '').includes("'info'")) {
            await pool.execute(`ALTER TABLE admin_alert_log MODIFY COLUMN severity ENUM('info', 'warning', 'critical') DEFAULT 'warning'`);
            console.log('[Migration] admin_alert_log.severity ENUM kibővítve info-val.');
        }
    } catch (err) {
        console.warn(`[Migration] admin_alert_log.severity ENUM bővítés kihagyva: ${err.message}`);
    }

    // admin_alert_log: új oszlopok (dismissed_at, dismissed_by_user_id) régi DB-knél.
    const alertNewColumns = [
        ['dismissed_at',         'TIMESTAMP NULL DEFAULT NULL'],
        ['dismissed_by_user_id', 'INT NULL DEFAULT NULL']
    ];
    for (const [colName, colDef] of alertNewColumns) {
        try {
            const [rows] = await pool.execute(
                `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_alert_log' AND COLUMN_NAME = ?`,
                [colName]
            );
            if (rows.length === 0) {
                await pool.execute(`ALTER TABLE admin_alert_log ADD COLUMN \`${colName}\` ${colDef}`);
                console.log(`[Migration] admin_alert_log.${colName} hozzáadva.`);
            }
        } catch (err) {
            console.warn(`[Migration] admin_alert_log.${colName} hozzáadás kihagyva: ${err.message}`);
        }
    }

    // users: pending_deletion_until index (a hourly cron purge gyors WHERE-jehez).
    try {
        const [idxRows] = await pool.execute(
            `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND INDEX_NAME = 'idx_users_pending_deletion'
             LIMIT 1`
        );
        if (idxRows.length === 0) {
            await pool.execute(`ALTER TABLE users ADD INDEX idx_users_pending_deletion (pending_deletion_until)`);
            console.log('[Migration] users idx_users_pending_deletion hozzáadva.');
        }
    } catch (err) {
        console.warn(`[Migration] users idx_users_pending_deletion kihagyva: ${err.message}`);
    }

    // admin_alert_log: dismissed index (gyors filter undismissed-only listara).
    try {
        const [idxRows] = await pool.execute(
            `SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_alert_log' AND INDEX_NAME = 'idx_aalert_dismissed'
             LIMIT 1`
        );
        if (idxRows.length === 0) {
            await pool.execute(`ALTER TABLE admin_alert_log ADD INDEX idx_aalert_dismissed (dismissed_at, occurred_at)`);
            console.log('[Migration] admin_alert_log idx_aalert_dismissed hozzáadva.');
        }
    } catch (err) {
        console.warn(`[Migration] admin_alert_log idx_aalert_dismissed kihagyva: ${err.message}`);
    }

    // moves: san + fen_after NOT NULL -> NULL-able (forward-compat). A regi
    // sema NOT NULL-tel volt, de a kod sosem adott at SAN-t/FEN-t, igy MINDEN
    // lepes-mentes silently elnyelodott egy try/catch-ben. Most relax-aljuk,
    // hogy a uj kod tudjon menteni akkor is ha SAN/FEN nincs (NULL), es az
    // admin review-hoz egy egyszeru "Pawn e2-e4" formatu leiras is eleg.
    const movesNullableColumns = [
        ['san',       'VARCHAR(20) NULL DEFAULT NULL'],
        ['fen_after', 'VARCHAR(100) NULL DEFAULT NULL']
    ];
    for (const [colName, colDef] of movesNullableColumns) {
        try {
            const [colRows] = await pool.execute(
                `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'moves' AND COLUMN_NAME = ?`,
                [colName]
            );
            if (colRows.length && String(colRows[0].IS_NULLABLE || '').toUpperCase() === 'NO') {
                await pool.execute(`ALTER TABLE moves MODIFY COLUMN \`${colName}\` ${colDef}`);
                console.log(`[Migration] moves.${colName} NOT NULL -> NULL-able.`);
            }
        } catch (err) {
            console.warn(`[Migration] moves.${colName} relax kihagyva: ${err.message}`);
        }
    }

    // user_reports: game_id oszlop (forward-compat). Regi DB-ken nem letezett -
    // ezzel a meglevo bejelentesek meccs nelkul maradnak, az ujak tudnak meccset
    // mellekelni. FK ON DELETE SET NULL: ha torlodne a meccs, a report megmarad.
    try {
        const [rows] = await pool.execute(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_reports' AND COLUMN_NAME = 'game_id'`
        );
        if (rows.length === 0) {
            await pool.execute(`ALTER TABLE user_reports ADD COLUMN game_id INT NULL DEFAULT NULL AFTER reported_user_id`);
            console.log('[Migration] user_reports.game_id hozzáadva.');
            try {
                await pool.execute(`ALTER TABLE user_reports ADD INDEX idx_user_reports_game (game_id)`);
            } catch (idxErr) {
                console.warn(`[Migration] idx_user_reports_game kihagyva: ${idxErr.message}`);
            }
            try {
                await pool.execute(`ALTER TABLE user_reports ADD CONSTRAINT fk_user_reports_game FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE SET NULL`);
            } catch (fkErr) {
                console.warn(`[Migration] fk_user_reports_game kihagyva: ${fkErr.message}`);
            }
        }
    } catch (err) {
        console.warn(`[Migration] user_reports.game_id kihagyva: ${err.message}`);
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
