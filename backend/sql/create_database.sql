-- 1. Felhasználók tábla
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) BINARY UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE,
    profile_image VARCHAR(255) DEFAULT '/profile_pictures/default.png',
    elo INT DEFAULT 800,
    elo_MM INT DEFAULT 800,
    elo_bullet INT DEFAULT 800,
    role ENUM ('player', 'admin') DEFAULT 'player',
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
);
-- Admin felhasználó beszúrása (ha még nem létezik) - a jelszó "chu+)2_23iIa6sou&>#o79247r9Xbsibv%" (bcrypt hash: $2b$10$haOYyFwigR.niAHSKk.F2.yYfWF27v0RyJYofUDWN981AFdNDollq)
INSERT INTO users (
        username,
        password_hash,
        email,
        elo,
        elo_MM,
        elo_bullet,
        role,
        is_email_verified,
        email_verified_at
    )
VALUES (
        'admin',
        '$2b$10$haOYyFwigR.niAHSKk.F2.yYfWF27v0RyJYofUDWN981AFdNDollq',
        'admin@mattmester.com',
        1500,
        1500,
        1500,
        'admin',
        TRUE,
        CURRENT_TIMESTAMP
    ) ON DUPLICATE KEY
UPDATE id = id;
UPDATE users
SET profile_image = '/profile_pictures/default.png'
WHERE profile_image IS NULL
    OR TRIM(profile_image) = '';
CREATE TABLE IF NOT EXISTS profile_image_uploads (
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
    FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE
    SET NULL,
    INDEX idx_profile_image_uploads_user_status (user_id, status)
);
-- 3. Statisztikák tábla
CREATE TABLE IF NOT EXISTS statistics (
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
SELECT id
FROM users
WHERE username = 'admin';
-- 4. Képességek tábla
CREATE TABLE IF NOT EXISTS abilities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    cooldown_turns INT DEFAULT 0
);
-- 5. Játékok tábla
CREATE TABLE IF NOT EXISTS games (
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
CREATE TABLE IF NOT EXISTS game_chats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT NOT NULL,
    sender_id INT NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
);
-- 7. Lépések tábla
CREATE TABLE IF NOT EXISTS moves (
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
CREATE TABLE IF NOT EXISTS ability_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT NOT NULL,
    -- Hozzáadtam a game_id-t a gyorsabb lekérdezésekhez (hogy ne kelljen JOIN-olni a moves táblát, ha egy meccs összes képességére vagyunk kíváncsiak).
    move_id INT,
    -- Lehet NULL, ha egy képességet nem konkrét lépéshez kötve használnak el (pl. passzív pajzs aktiválása a kör elején).
    player_id INT NOT NULL,
    -- Tudnunk kell, ki használta, anélkül is, hogy a move_id-ből fejtenénk vissza.
    ability_id INT NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE,
    FOREIGN KEY (move_id) REFERENCES moves (id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES users (id),
    FOREIGN KEY (ability_id) REFERENCES abilities (id),
    INDEX idx_ability_log_game (game_id)
);
-- 9. Barátok tábla
CREATE TABLE IF NOT EXISTS friends (
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
CREATE TABLE IF NOT EXISTS friend_blocks (
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
-- 10. Altalanos felhasznaloi naplo (audit + activity)
CREATE TABLE IF NOT EXISTS user_logs (
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
    metric_key VARCHAR(100) NULL,
    -- pl: elo_mm, win_streak, avg_move_time
    metric_value DECIMAL(14, 4) NULL,
    -- aktualis meresi ertek
    metric_delta DECIMAL(14, 4) NULL,
    -- valtozas az elozo allapothoz kepest
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
    INDEX idx_user_logs_user_metric_time (user_id, metric_key, occurred_at),
    INDEX idx_user_logs_user_severity_time (user_id, severity, occurred_at),
    INDEX idx_user_logs_ip_time (ip_address, occurred_at)
);
CREATE TABLE IF NOT EXISTS chat_conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM ('private', 'group') NOT NULL,
    name VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP NULL DEFAULT NULL,
    last_message_preview VARCHAR(255) NULL,
    UNIQUE KEY unique_group_name (name),
    INDEX idx_chat_conversations_last_message_at (last_message_at)
);
CREATE TABLE IF NOT EXISTS chat_participants (
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
CREATE TABLE IF NOT EXISTS chat_messages (
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
-- 20 teszt felhasznalo (jelszo: 123456Ab)
INSERT IGNORE INTO users (username, password_hash, email, role, is_email_verified, email_verified_at)
VALUES (
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
