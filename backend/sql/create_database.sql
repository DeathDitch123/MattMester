-- 1. Felhasználók tábla
CREATE TABLE
    IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) BINARY UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email VARCHAR(100) UNIQUE,
        profile_image VARCHAR(255) DEFAULT '/profile_pictures/default.png',
        elo INT DEFAULT 800,
        elo_mattmester INT DEFAULT 800,
        elo_classical INT DEFAULT 800,
        elo_blitz INT DEFAULT 800,
        role ENUM ('player', 'admin') DEFAULT 'player',
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
        chat_report_mute_until TIMESTAMP NULL DEFAULT NULL,
        last_login_ip VARCHAR(45) NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_users_email_verification_token_hash (email_verification_token_hash)
    );

-- Admin felhasználó beszúrása (ha még nem létezik) - a jelszó "chu+)2_23iIa6sou&>#o79247r9Xbsibv%" (bcrypt hash: $2b$10$haOYyFwigR.niAHSKk.F2.yYfWF27v0RyJYofUDWN981AFdNDollq)
-- Admin user mindig is_super_admin=TRUE jelöléssel jön létre - ő az egyetlen super-admin a seedben.
-- Contanct email: mattmester.support@gmail.com | jelszó: j?q&u5.OmV0QEa)KBpH.);8C9l)
INSERT INTO
    users (
        username,
        password_hash,
        email,
        elo,
        elo_mattmester,
        elo_classical,
        elo_blitz,
        role,
        is_super_admin,
        is_email_verified,
        email_verified_at
    )
VALUES
    (
        'admin',
        '$2b$10$haOYyFwigR.niAHSKk.F2.yYfWF27v0RyJYofUDWN981AFdNDollq',
        'admin@mattmester.com',
        1500,
        1500,
        1500,
        'admin',
        TRUE,
        TRUE,
        CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY
UPDATE is_super_admin = TRUE;

UPDATE users
SET
    profile_image = '/profile_pictures/default.png'
WHERE
    profile_image IS NULL
    OR TRIM(profile_image) = '';

CREATE TABLE
    IF NOT EXISTS profile_image_uploads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        filename VARCHAR(255) NOT NULL,
        upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status ENUM (
            'pending',
            'approved',
            'rejected',
            'discarded',
            'default'
        ) DEFAULT 'pending',
        review_note TEXT,
        reviewed_by INT,
        review_time TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL,
        INDEX idx_profile_image_uploads_user_status (user_id, status)
    );

-- 3. Statisztikák tábla
CREATE TABLE
    IF NOT EXISTS statistics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNIQUE NOT NULL,
        wins INT DEFAULT 0,
        losses INT DEFAULT 0,
        draws INT DEFAULT 0,
        abilities_used INT DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

-- Admin statisztikai sorának létrehozása
INSERT IGNORE INTO statistics (user_id)
SELECT
    id
FROM
    users
WHERE
    username = 'admin';

-- 4. Képességek tábla
CREATE TABLE
    IF NOT EXISTS abilities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        cooldown_turns INT DEFAULT 0
    );

-- 5. Játékok tábla
CREATE TABLE
    IF NOT EXISTS games (
        id INT AUTO_INCREMENT PRIMARY KEY,
        white_player_id INT NOT NULL,
        black_player_id INT NOT NULL,
        winner_id INT,
        time_control VARCHAR(20) DEFAULT '10+0',
        initial_fen VARCHAR(100) DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        current_fen VARCHAR(100),
        -- Az aktuális állás tárolása. Így oldalfrissítéskor nem kell az összes lépésből kiszámolni a táblát.
        pgn TEXT,
        --  A teljes meccs PGN formátumban való tárolása a meccs végén. Exportáláshoz elengedhetetlen.
        start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP NULL,
        status ENUM ('ongoing', 'finished', 'abandoned', 'draw') DEFAULT 'ongoing',
        FOREIGN KEY (white_player_id) REFERENCES users (id),
        FOREIGN KEY (black_player_id) REFERENCES users (id),
        FOREIGN KEY (winner_id) REFERENCES users (id),
        INDEX idx_games_status (status)
    );

-- 6. Játék alatti chatek
CREATE TABLE
    IF NOT EXISTS game_chats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        game_id INT NOT NULL,
        sender_id INT NOT NULL,
        message TEXT NOT NULL,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
    );

-- 7. Lépések tábla
CREATE TABLE
    IF NOT EXISTS moves (
        id INT AUTO_INCREMENT PRIMARY KEY,
        game_id INT NOT NULL,
        player_id INT NOT NULL,
        ply_number INT NOT NULL,
        -- move_number helyett ply_number (fél-lépés), ez a standard a sakk motoroknál.
        san VARCHAR(10) NOT NULL,
        -- Standard Algebraic Notation (pl. "Nxf3+"). Létfontosságú a felhasználói felülethez és a PGN generáláshoz.
        piece VARCHAR(10),
        from_pos VARCHAR(5),
        to_pos VARCHAR(5),
        fen_after VARCHAR(100) NOT NULL,
        -- Eltároljuk a tábla állapotát a lépés után. Visszajátszáshoz (replay) kötelező!
        is_capture BOOLEAN DEFAULT FALSE,
        is_check BOOLEAN DEFAULT FALSE,
        is_checkmate BOOLEAN DEFAULT FALSE,
        promotion_piece VARCHAR(10),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES users (id),
        INDEX idx_moves_game (game_id)
    );

-- 8. Képességhasználati napló
CREATE TABLE
    IF NOT EXISTS ability_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        game_id INT NOT NULL,
        -- Hozzáadtam a game_id-t a gyorsabb lekérdezésekhez (hogy ne kelljen JOIN-olni a moves táblát, ha egy meccs összes képességére vagyunk kíváncsiak).
        move_id INT,
        -- Lehet NULL, ha egy képességet nem konkrét lépéshez kötve használnak el (pl. passzív pajzs aktiválása a kör elején).
        player_id INT NOT NULL,
        -- Tudnunk kell, ki használta, anélkül is, hogy a move_id-ból fejtenénk vissza.
        ability_id INT NOT NULL,
        used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
        FOREIGN KEY (move_id) REFERENCES moves (id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES users (id),
        FOREIGN KEY (ability_id) REFERENCES abilities (id),
        INDEX idx_ability_log_game (game_id)
    );

-- 9. Barátok tábla
CREATE TABLE
    IF NOT EXISTS friends (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user1_id INT NOT NULL,
        -- user_init_id helyett. Ide MINDIG a kisebb ID kerül.
        user2_id INT NOT NULL,
        -- user_recv_id helyett. Ide MINDIG a nagyobb ID kerül.
        action_user_id INT NOT NULL,
        -- Ő az, aki valójában kezdeményezte a jelölést (hogy tudjuk, kinek kell elfogadnia).
        status ENUM ('pending', 'accepted', 'rejected', 'blocked') DEFAULT 'pending',
        invite_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_friendship (user1_id, user2_id),
        CHECK (user1_id < user2_id),
        -- Ez a zseniális trükk megakadályozza a (1, 2) és (2, 1) duplikációkat adatbázis szinten!
        FOREIGN KEY (user1_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (user2_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (action_user_id) REFERENCES users (id) ON DELETE CASCADE
    );

-- 9/b. Irányfüggő felhasználó blokkolások
CREATE TABLE
    IF NOT EXISTS friend_blocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        blocker_user_id INT NOT NULL,
        blocked_user_id INT NOT NULL,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_friend_block (blocker_user_id, blocked_user_id),
        CHECK (blocker_user_id <> blocked_user_id),
        FOREIGN KEY (blocker_user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (blocked_user_id) REFERENCES users (id) ON DELETE CASCADE
    );

-- 10. Altalanos felhasznaloi naplo (audit + activity).
-- Megjegyzes: a korabbi metric_key/metric_value/metric_delta oszlopok eltavolitva,
-- nem volt egyetlen iro hivo sem. Numerikus metrikat a metadata JSON-be tegyunk.
CREATE TABLE
    IF NOT EXISTS user_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        -- pl: login, logout, game_finished, elo_update, friend_request
        event_category ENUM (
            'auth',
            'game',
            'social',
            'profile',
            'ability',
            'security',
            'system',
            'admin'
        ) DEFAULT 'system',
        severity ENUM ('info', 'warning', 'error', 'critical') DEFAULT 'info',
        source VARCHAR(50) DEFAULT 'backend',
        -- pl: backend, frontend, socket, admin
        success BOOLEAN NULL,
        message VARCHAR(255) NULL,
        ip_address VARCHAR(45) NULL,
        -- login/IP-utkozes ellenorzeshez indexelt IP mezo
        user_agent VARCHAR(255) NULL,
        -- eszkoz azonositashoz (bejelentkezes, kijelentkezes)
        metadata JSON NULL,
        -- rugalmas extra adat (game_id, endpoint, elo_before, elo_after, stb.)
        occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        INDEX idx_user_logs_user_time (user_id, occurred_at),
        INDEX idx_user_logs_user_event_time (user_id, event_type, occurred_at),
        INDEX idx_user_logs_user_severity_time (user_id, severity, occurred_at),
        INDEX idx_user_logs_ip_time (ip_address, occurred_at)
    );

CREATE TABLE
    IF NOT EXISTS chat_conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        type ENUM ('private', 'group') NOT NULL,
        name VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_message_at TIMESTAMP NULL DEFAULT NULL,
        last_message_preview VARCHAR(255) NULL,
        UNIQUE KEY unique_group_name (name),
        INDEX idx_chat_conversations_last_message_at (last_message_at)
    );

CREATE TABLE
    IF NOT EXISTS chat_participants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        user_id INT NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_read_message_id INT NULL,
        UNIQUE KEY unique_participant (conversation_id, user_id),
        INDEX idx_chat_participants_user (user_id),
        INDEX idx_chat_participants_conversation (conversation_id),
        FOREIGN KEY (conversation_id) REFERENCES chat_conversations (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

CREATE TABLE
    IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversation_id INT NOT NULL,
        sender_id INT NOT NULL,
        body TEXT NOT NULL,
        body_masked TEXT NULL,
        is_body_masked BOOLEAN DEFAULT FALSE,
        sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES chat_conversations (id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE,
        INDEX idx_chat_messages_conversation_sent_at (conversation_id, sent_at),
        INDEX idx_chat_messages_sender (sender_id)
    );

CREATE TABLE
    IF NOT EXISTS chat_message_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        message_id INT NOT NULL,
        reporter_user_id INT NOT NULL,
        reason VARCHAR(500) NULL,
        status ENUM ('pending', 'allowed', 'deleted', 'dismissed') NOT NULL DEFAULT 'pending',
        reviewed_by INT NULL,
        reviewed_at TIMESTAMP NULL DEFAULT NULL,
        review_note VARCHAR(1000) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_report_per_user_per_message (message_id, reporter_user_id),
        FOREIGN KEY (message_id) REFERENCES chat_messages (id) ON DELETE CASCADE,
        FOREIGN KEY (reporter_user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL,
        INDEX idx_chat_message_reports_status (status, created_at),
        INDEX idx_chat_message_reports_message (message_id),
        INDEX idx_chat_message_reports_reporter (reporter_user_id)
    );

CREATE TABLE
    IF NOT EXISTS chat_blocked_words_dynamic (
        word VARCHAR(255) NOT NULL PRIMARY KEY,
        added_by_admin_id INT NULL,
        source_message_id INT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (added_by_admin_id) REFERENCES users (id) ON DELETE SET NULL,
        FOREIGN KEY (source_message_id) REFERENCES chat_messages (id) ON DELETE SET NULL,
        INDEX idx_chat_blocked_words_added_at (added_at)
    );

CREATE TABLE
    IF NOT EXISTS chat_profanity_strikes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        message_id INT NULL,
        source ENUM ('auto', 'admin_delete') NOT NULL,
        ban_type ENUM ('temp_1d', 'temp_10d', 'perma', 'none') NOT NULL DEFAULT 'none',
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_message (message_id),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        INDEX idx_chat_profanity_strikes_user (user_id, recorded_at)
    );

CREATE TABLE
    IF NOT EXISTS account_ban_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        ip_address VARCHAR(45) NULL,
        source ENUM ('profanity_strike', 'admin_manual', 'admin_critical', 'other') NOT NULL DEFAULT 'other',
        reason VARCHAR(500) NULL,
        triggered_ip_block BOOLEAN NOT NULL DEFAULT FALSE,
        ip_block_type ENUM ('temp_1d', 'perma', 'none') NOT NULL DEFAULT 'none',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        INDEX idx_account_ban_events_ip (ip_address, created_at),
        INDEX idx_account_ban_events_user (user_id, created_at)
    );

-- User-vs-user bejelentesek (player-actions). NEM osszekeverendo a
-- chat_message_reports-tel: az csak chat-uzenetekre vonatkozik.
-- Itt egy felhasznalo bejelenthet egy masik felhasznalot pl. csalas /
-- toxikussag / spam / zaklatas / fairplay-megsertes / egyeb miatt.
-- game_id: opcionalis - egy konkret meccshez kapcsolt bejelentes (cheating /
-- unfair_play eseten), igy az admin a PGN + lepeslista alapjan tud
-- dontest hozni. ON DELETE SET NULL: ha a meccs torlodne, a report megmarad.
-- FONTOS: false report eseten NEM bunteti a bejelentot (chat-tel ellentetben),
-- mert egy player-magaviselet utolagosan nehezen ellenorizheto.
CREATE TABLE
    IF NOT EXISTS user_reports (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        reporter_user_id INT NOT NULL,
        reported_user_id INT NOT NULL,
        game_id INT NULL,
        category ENUM ('cheating', 'toxicity', 'spam', 'harassment', 'unfair_play', 'other') NOT NULL DEFAULT 'other',
        message VARCHAR(1000) NULL,
        status ENUM ('open', 'under_review', 'closed') NOT NULL DEFAULT 'open',
        resolution ENUM ('none', 'dismissed', 'warned', 'banned') NOT NULL DEFAULT 'none',
        admin_note VARCHAR(1000) NULL,
        reviewed_by_user_id INT NULL,
        reviewed_at TIMESTAMP NULL DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reporter_user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (reported_user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (reviewed_by_user_id) REFERENCES users (id) ON DELETE SET NULL,
        FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE SET NULL,
        INDEX idx_user_reports_status_created (status, created_at),
        INDEX idx_user_reports_reported (reported_user_id, created_at),
        INDEX idx_user_reports_reporter (reporter_user_id, created_at),
        INDEX idx_user_reports_game (game_id)
    );

-- "Recent opponents" tabla - Rocket League stilusu lista a felhasznalo
-- legutobbi ellenfeleirol. Egy par (user_id, opponent_user_id) UNIQUE,
-- utolso meccs idopontjat tartjuk + meccsek szamat. A frontend listaba
-- utolso meccs szerint csokkeno sorrendben rendez, max 25-ot mutat.
CREATE TABLE
    IF NOT EXISTS recent_opponents (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        opponent_user_id INT NOT NULL,
        last_played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        match_count INT NOT NULL DEFAULT 1,
        last_game_id INT NULL,
        UNIQUE KEY ux_recent_opponents_pair (user_id, opponent_user_id),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (opponent_user_id) REFERENCES users (id) ON DELETE CASCADE,
        INDEX idx_recent_opponents_user_time (user_id, last_played_at)
    );

-- Universal notifications table (single source of truth for badge + history)
-- Targeting:
--   target_user_id IS NULL   -> broadcast (audience driven by audience field)
--   target_user_id IS set    -> single user delivery
-- audience values: 'user', 'multi', 'global', 'role', 'system'
-- type values are open (e.g. 'friend_request', 'friend_accepted', 'friend_blocked',
-- 'chat_message', 'admin_message', 'system'). The payload JSON column allows
-- forward-compatible extension without schema changes.
CREATE TABLE
    IF NOT EXISTS notifications (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        type VARCHAR(64) NOT NULL,
        audience ENUM ('user', 'multi', 'global', 'role', 'system') NOT NULL DEFAULT 'user',
        target_user_id INT NULL,
        target_role ENUM ('player', 'admin') NULL,
        sender_user_id INT NULL,
        title VARCHAR(160) NOT NULL,
        message VARCHAR(500) NOT NULL,
        payload JSON NULL,
        severity ENUM ('info', 'success', 'warning', 'error') DEFAULT 'info',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (target_user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (sender_user_id) REFERENCES users (id) ON DELETE SET NULL,
        INDEX idx_notifications_target_user_created (target_user_id, created_at),
        INDEX idx_notifications_audience_created (audience, created_at),
        INDEX idx_notifications_role_created (target_role, created_at),
        INDEX idx_notifications_type (type)
    );

-- Per-user read/dismiss state. Used for both directed notifications and broadcasts.
-- For broadcast notifications we lazily insert a row when the user interacts with
-- the notification; absence of a row means "unread + visible".
-- dismissed_at IS NOT NULL means the user permanently removed the notification
-- from their notification center view (X / action button / mind olvasott).
-- The underlying entity (e.g. friend_request) is NOT deleted, only the
-- notification entry is hidden from this user.
CREATE TABLE
    IF NOT EXISTS notification_reads (
        notification_id BIGINT NOT NULL,
        user_id INT NOT NULL,
        read_at TIMESTAMP NULL DEFAULT NULL,
        dismissed_at TIMESTAMP NULL DEFAULT NULL,
        PRIMARY KEY (notification_id, user_id),
        FOREIGN KEY (notification_id) REFERENCES notifications (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        INDEX idx_notification_reads_user (user_id),
        INDEX idx_notification_reads_dismissed (user_id, dismissed_at)
    );

-- =====================================================================
-- ADMIN PANEL TABLAK (ADMIN_PANEL.md §6)
-- =====================================================================
-- 11. Admin tokenek (step-up auth) - csak SHA-256 hash van eltarolva.
-- Plain token kiadaskor egyszer lathato a kliens fele, utana sehol.
-- TTL: 15 perc sliding (last_used_at-tol szamitva).
CREATE TABLE
    IF NOT EXISTS admin_tokens (
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
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        INDEX idx_admin_tokens_user_active (user_id, revoked_at, expires_at)
    );

-- 12. Admin audit log - append-only. ON DELETE RESTRICT az actor_user_id-n,
-- a retention job tisztit (F9). before_state/after_state JSON, redaction allowlist a service-ben.
CREATE TABLE
    IF NOT EXISTS admin_audit_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        actor_user_id INT NOT NULL,
        actor_username VARCHAR(50) NOT NULL,
        action VARCHAR(64) NOT NULL,
        severity ENUM ('info', 'warning', 'critical') DEFAULT 'info',
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
        FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
        INDEX idx_aal_occurred (occurred_at),
        INDEX idx_aal_actor_time (actor_user_id, occurred_at),
        INDEX idx_aal_action_time (action, occurred_at),
        INDEX idx_aal_target (target_type, target_id, occurred_at),
        INDEX idx_aal_target_key (target_type, target_key, occurred_at),
        INDEX idx_aal_severity_time (severity, occurred_at),
        INDEX idx_aal_request (request_id)
    );

-- 13. Admin alert log - jogosulatlan probalkozas, lejart/hibas token, rate eszkalacio.
CREATE TABLE
    IF NOT EXISTS admin_alert_log (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        kind ENUM (
            'unauthorized',
            'rate_escalated',
            'token_invalid',
            'suspicious_pattern'
        ) NOT NULL,
        severity ENUM ('warning', 'critical') DEFAULT 'warning',
        user_id INT NULL,
        ip_address VARCHAR(45) NOT NULL,
        endpoint VARCHAR(255) NULL,
        user_agent VARCHAR(255) NULL,
        detail JSON NULL,
        occurred_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
        INDEX idx_aalert_time (occurred_at),
        INDEX idx_aalert_kind_time (kind, occurred_at),
        INDEX idx_aalert_ip_time (ip_address, occurred_at)
    );

-- 14. Aktiv rate limit eszkalaciok IP/user-szinten. Az F5 alerting service tolti,
-- a rateLimiter middleware olvassa, lejart sorokat a retention/cleanup tisztitja.
CREATE TABLE
    IF NOT EXISTS admin_rate_escalations (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        scope ENUM ('ip', 'user') NOT NULL,
        scope_value VARCHAR(64) NOT NULL,
        multiplier DECIMAL(4, 2) NOT NULL DEFAULT 5.00,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NULL DEFAULT NULL,
        reason VARCHAR(255) NULL,
        UNIQUE KEY ux_rate_esc_scope (scope, scope_value),
        INDEX idx_rate_esc_expires (expires_at)
    );

-- 20 teszt felhasznalo (jelszo: 123456Ab)
INSERT IGNORE INTO users (
    username,
    password_hash,
    email,
    role,
    is_email_verified,
    email_verified_at
)
VALUES
    (
        'testuser01',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser01@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser02',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser02@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser03',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser03@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser04',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser04@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser05',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser05@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser06',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser06@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser07',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser07@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser08',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser08@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser09',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser09@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser10',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser10@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser11',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser11@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser12',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser12@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser13',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser13@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser14',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser14@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser15',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser15@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser16',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser16@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser17',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser17@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser18',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser18@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser19',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser19@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    ),
    (
        'testuser20',
        '$2b$10$6iknUs/vjxhRFRPc20jIb.zDs/YJbPPwHNd8m6YkLi6sAuNl28dbi',
        'testuser20@mattmester.local',
        'player',
        TRUE,
        CURRENT_TIMESTAMP
    );

-- Teszt userek ELO randomizalas (eletszeru tartomanyok)
UPDATE users AS u
JOIN (
    SELECT
        seeded.id,
        seeded.base_elo,
        GREATEST (
            700,
            LEAST (
                2200,
                seeded.base_elo + FLOOR((RAND () * 241) - 120)
            )
        ) AS new_elo_mm,
        GREATEST (
            650,
            LEAST (
                2300,
                seeded.base_elo + FLOOR((RAND () * 321) - 160)
            )
        ) AS new_elo_bullet
    FROM
        (
            SELECT
                id,
                FLOOR(850 + RAND () * 901) AS base_elo
            FROM
                users
            WHERE
                username REGEXP '^testuser(0[1-9]|1[0-9]|20)$'
        ) AS seeded
) AS random_elo ON random_elo.id = u.id
SET
    u.elo = random_elo.base_elo,
    u.elo_classical = random_elo.new_elo_mm,
    u.elo_blitz = random_elo.new_elo_bullet;