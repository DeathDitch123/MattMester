-- 1. Felhasználók tábla
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) BINARY UNIQUE NOT NULL, 
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE,
    profile_image VARCHAR(255) DEFAULT '/profile_pictures/default.png',
    elo INT DEFAULT 1200,
    elo_MM INT DEFAULT 1200,
    elo_bullet INT DEFAULT 1200,
    role ENUM('player', 'admin') DEFAULT 'player',
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason VARCHAR(255),
    banned_until TIMESTAMP NULL,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_email_verified BOOLEAN DEFAULT FALSE,
    reset_password_token VARCHAR(255),
    reset_token_expires TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Admin felhasználó beszúrása (ha még nem létezik) - a jelszó "chu+)2_23iIa6sou&>#o79247r9Xbsibv%" (bcrypt hash: $2b$10$haOYyFwigR.niAHSKk.F2.yYfWF27v0RyJYofUDWN981AFdNDollq)
INSERT INTO users (username, password_hash, email, elo, elo_MM, elo_bullet, role) 
VALUES ('admin', '$2b$10$haOYyFwigR.niAHSKk.F2.yYfWF27v0RyJYofUDWN981AFdNDollq', 'admin@mattmester.com', 1500, 1500, 1500, 'admin')
ON DUPLICATE KEY UPDATE id = id;

UPDATE users
SET profile_image = '/profile_pictures/default.png'
WHERE profile_image IS NULL OR TRIM(profile_image) = '';

CREATE TABLE IF NOT EXISTS profile_image_uploads (
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
);

-- 2. Bejelentkezési előzmények
CREATE TABLE IF NOT EXISTS login_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent VARCHAR(255),
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Statisztikák tábla
CREATE TABLE IF NOT EXISTS statistics (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE NOT NULL,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    draws INT DEFAULT 0,
    abilities_used INT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Admin statisztikai sorának létrehozása
INSERT IGNORE INTO statistics (user_id) 
SELECT id FROM users WHERE username = 'admin';

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
    current_fen VARCHAR(100), -- Az aktuális állás tárolása. Így oldalfrissítéskor nem kell az összes lépésből kiszámolni a táblát.
    pgn TEXT, --  A teljes meccs PGN formátumban való tárolása a meccs végén. Exportáláshoz elengedhetetlen.
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP NULL,
    status ENUM('ongoing', 'finished', 'abandoned', 'draw') DEFAULT 'ongoing',
    FOREIGN KEY (white_player_id) REFERENCES users(id),
    FOREIGN KEY (black_player_id) REFERENCES users(id),
    FOREIGN KEY (winner_id) REFERENCES users(id)
);

-- 6. Játék alatti chatek
CREATE TABLE IF NOT EXISTS game_chats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT NOT NULL,
    sender_id INT NOT NULL,
    message TEXT NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 7. Lépések tábla
CREATE TABLE IF NOT EXISTS moves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT NOT NULL,
    player_id INT NOT NULL,
    ply_number INT NOT NULL, -- move_number helyett ply_number (fél-lépés), ez a standard a sakk motoroknál.
    san VARCHAR(10) NOT NULL, -- Standard Algebraic Notation (pl. "Nxf3+"). Létfontosságú a felhasználói felülethez és a PGN generáláshoz.
    piece VARCHAR(10),
    from_pos VARCHAR(5),
    to_pos VARCHAR(5),
    fen_after VARCHAR(100) NOT NULL, -- Eltároljuk a tábla állapotát a lépés után. Visszajátszáshoz (replay) kötelező!
    is_capture BOOLEAN DEFAULT FALSE,
    is_check BOOLEAN DEFAULT FALSE,
    is_checkmate BOOLEAN DEFAULT FALSE,
    promotion_piece VARCHAR(10),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES users(id)
);

-- 8. Képességhasználati napló
CREATE TABLE IF NOT EXISTS ability_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT NOT NULL, -- Hozzáadtam a game_id-t a gyorsabb lekérdezésekhez (hogy ne kelljen JOIN-olni a moves táblát, ha egy meccs összes képességére vagyunk kíváncsiak).
    move_id INT, -- Lehet NULL, ha egy képességet nem konkrét lépéshez kötve használnak el (pl. passzív pajzs aktiválása a kör elején).
    player_id INT NOT NULL, -- Tudnunk kell, ki használta, anélkül is, hogy a move_id-ből fejtenénk vissza.
    ability_id INT NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (move_id) REFERENCES moves(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES users(id),
    FOREIGN KEY (ability_id) REFERENCES abilities(id)
);

-- 9. Barátok tábla
CREATE TABLE IF NOT EXISTS friends (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user1_id INT NOT NULL, -- user_init_id helyett. Ide MINDIG a kisebb ID kerül.
    user2_id INT NOT NULL, -- user_recv_id helyett. Ide MINDIG a nagyobb ID kerül.
    action_user_id INT NOT NULL, -- Ő az, aki valójában kezdeményezte a jelölést (hogy tudjuk, kinek kell elfogadnia).
    status ENUM('pending', 'accepted', 'blocked') DEFAULT 'pending',
    invite_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_friendship (user1_id, user2_id),
    CHECK (user1_id < user2_id), -- Ez a zseniális trükk megakadályozza a (1, 2) és (2, 1) duplikációkat adatbázis szinten!
    FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (action_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 10. Altalanos felhasznaloi naplo (audit + activity)
CREATE TABLE IF NOT EXISTS user_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    event_type VARCHAR(100) NOT NULL, -- pl: login, logout, game_finished, elo_update, friend_request
    event_category ENUM('auth', 'game', 'social', 'profile', 'ability', 'security', 'system', 'admin') DEFAULT 'system',
    severity ENUM('info', 'warning', 'error', 'critical') DEFAULT 'info',
    source VARCHAR(50) DEFAULT 'backend', -- pl: backend, frontend, socket, admin
    success BOOLEAN NULL,
    metric_key VARCHAR(100) NULL, -- pl: elo_mm, win_streak, avg_move_time
    metric_value DECIMAL(14, 4) NULL, -- aktualis meresi ertek
    metric_delta DECIMAL(14, 4) NULL, -- valtozas az elozo allapothoz kepest
    message VARCHAR(255) NULL,
    metadata JSON NULL, -- rugalmas extra adat (game_id, endpoint, elo_before, elo_after, stb.)
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_logs_user_time (user_id, occurred_at),
    INDEX idx_user_logs_user_event_time (user_id, event_type, occurred_at),
    INDEX idx_user_logs_user_metric_time (user_id, metric_key, occurred_at),
    INDEX idx_user_logs_user_severity_time (user_id, severity, occurred_at)
);

-- 11. Életszerű tesztadatok (idempotens: többször futtatható)
-- A cél: minden tábla működését lehessen validálni a projekt valós folyamatai mentén.

-- Teszt felhasználók
INSERT INTO users (username, password_hash, email, profile_image, elo, elo_MM, elo_bullet, role, is_email_verified)
SELECT 'teszt_anna', '$2b$10$haOYyFwigR.niAHSKk.F2.yYfWF27v0RyJYofUDWN981AFdNDollq', 'teszt.anna@mattmester.com', '/profile_pictures/default.png', 1325, 1288, 1402, 'player', TRUE
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'teszt_anna');

INSERT INTO users (username, password_hash, email, profile_image, elo, elo_MM, elo_bullet, role, is_email_verified)
SELECT 'teszt_bela', '$2b$10$haOYyFwigR.niAHSKk.F2.yYfWF27v0RyJYofUDWN981AFdNDollq', 'teszt.bela@mattmester.com', '/profile_pictures/default.png', 1272, 1310, 1250, 'player', TRUE
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'teszt_bela');

INSERT INTO users (username, password_hash, email, profile_image, elo, elo_MM, elo_bullet, role, is_email_verified)
SELECT 'teszt_csilla', '$2b$10$haOYyFwigR.niAHSKk.F2.yYfWF27v0RyJYofUDWN981AFdNDollq', 'teszt.csilla@mattmester.com', '/profile_pictures/default.png', 1198, 1215, 1187, 'player', FALSE
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'teszt_csilla');

-- Statisztikák felhasználónként (a regisztrációs logikát imitálva)
INSERT INTO statistics (user_id, wins, losses, draws, abilities_used)
SELECT u.id, 14, 9, 3, 5
FROM users u
WHERE u.username = 'teszt_anna'
    AND NOT EXISTS (SELECT 1 FROM statistics s WHERE s.user_id = u.id);

INSERT INTO statistics (user_id, wins, losses, draws, abilities_used)
SELECT u.id, 11, 12, 2, 7
FROM users u
WHERE u.username = 'teszt_bela'
    AND NOT EXISTS (SELECT 1 FROM statistics s WHERE s.user_id = u.id);

INSERT INTO statistics (user_id, wins, losses, draws, abilities_used)
SELECT u.id, 6, 8, 4, 2
FROM users u
WHERE u.username = 'teszt_csilla'
    AND NOT EXISTS (SELECT 1 FROM statistics s WHERE s.user_id = u.id);

-- Ability seedek (admin panel/listázás teszthez)
INSERT INTO abilities (name, description, cooldown_turns)
VALUES
        ('VillamCsere', 'A kiválasztott bábu egyszer azonnal újra léphet.', 5),
        ('Pajzs', 'A következő ellenfélütés semlegesítve lesz.', 4),
        ('IdoUgras', 'A saját köridőből 15 mp visszatöltése.', 6)
ON DUPLICATE KEY UPDATE
        description = VALUES(description),
        cooldown_turns = VALUES(cooldown_turns);

-- Profilkép feltöltési előzmények + admin review
INSERT INTO profile_image_uploads (user_id, filename, status, review_note, reviewed_by, review_time)
SELECT u.id, 'teszt_anna_avatar.webp', 'approved', 'Rendben, megfelel a szabályzatnak.', admin_u.id, CURRENT_TIMESTAMP
FROM users u
JOIN users admin_u ON admin_u.username = 'admin'
WHERE u.username = 'teszt_anna'
    AND NOT EXISTS (
            SELECT 1
            FROM profile_image_uploads p
            WHERE p.user_id = u.id AND p.filename = 'teszt_anna_avatar.webp'
    );

INSERT INTO profile_image_uploads (user_id, filename, status, review_note, reviewed_by, review_time)
SELECT u.id, 'teszt_csilla_avatar.png', 'rejected', 'A kép túl kicsi, kérlek tölts fel nagyobb felbontást.', admin_u.id, CURRENT_TIMESTAMP
FROM users u
JOIN users admin_u ON admin_u.username = 'admin'
WHERE u.username = 'teszt_csilla'
    AND NOT EXISTS (
            SELECT 1
            FROM profile_image_uploads p
            WHERE p.user_id = u.id AND p.filename = 'teszt_csilla_avatar.png'
    );

-- Login előzmények
INSERT INTO login_history (user_id, ip_address, user_agent, login_time)
SELECT u.id, '192.168.0.21', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0', DATE_SUB(NOW(), INTERVAL 2 HOUR)
FROM users u
WHERE u.username = 'teszt_anna'
    AND NOT EXISTS (
            SELECT 1 FROM login_history l
            WHERE l.user_id = u.id AND l.ip_address = '192.168.0.21'
    );

INSERT INTO login_history (user_id, ip_address, user_agent, login_time)
SELECT u.id, '203.0.113.44', 'Mozilla/5.0 (Linux; Android 14) Mobile Safari/537.36', DATE_SUB(NOW(), INTERVAL 85 MINUTE)
FROM users u
WHERE u.username = 'teszt_bela'
    AND NOT EXISTS (
            SELECT 1 FROM login_history l
            WHERE l.user_id = u.id AND l.ip_address = '203.0.113.44'
    );

-- Játékok: egy befejezett és egy folyamatban lévő meccs
INSERT INTO games (
        white_player_id,
        black_player_id,
        winner_id,
        time_control,
        initial_fen,
        current_fen,
        pgn,
        start_time,
        end_time,
        status
)
SELECT
        w.id,
        b.id,
        w.id,
        '10+0',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'r1bqkbnr/pppp1ppp/2n5/4pQ2/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 2 3',
        '1. e4 e5 2. Bc4 Nc6 3. Qh5',
        TIMESTAMP('2026-03-30 19:10:00'),
        TIMESTAMP('2026-03-30 19:27:00'),
        'finished'
FROM users w
JOIN users b ON b.username = 'teszt_bela'
WHERE w.username = 'teszt_anna'
    AND NOT EXISTS (
            SELECT 1
            FROM games g
            WHERE g.white_player_id = w.id
                AND g.black_player_id = b.id
                AND g.start_time = TIMESTAMP('2026-03-30 19:10:00')
    );

INSERT INTO games (
        white_player_id,
        black_player_id,
        winner_id,
        time_control,
        initial_fen,
        current_fen,
        pgn,
        start_time,
        end_time,
        status
)
SELECT
        w.id,
        b.id,
        NULL,
        '3+2',
        'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        'rnbqkbnr/ppp2ppp/3pp3/8/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 4',
        NULL,
        TIMESTAMP('2026-03-30 20:05:00'),
        NULL,
        'ongoing'
FROM users w
JOIN users b ON b.username = 'teszt_csilla'
WHERE w.username = 'teszt_bela'
    AND NOT EXISTS (
            SELECT 1
            FROM games g
            WHERE g.white_player_id = w.id
                AND g.black_player_id = b.id
                AND g.start_time = TIMESTAMP('2026-03-30 20:05:00')
    );

-- Lépések a befejezett meccshez
INSERT INTO moves (game_id, player_id, ply_number, san, piece, from_pos, to_pos, fen_after, is_capture, is_check, is_checkmate)
SELECT g.id, w.id, 1, 'e4', 'pawn', 'e2', 'e4', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', FALSE, FALSE, FALSE
FROM games g
JOIN users w ON w.username = 'teszt_anna'
JOIN users b ON b.username = 'teszt_bela'
WHERE g.white_player_id = w.id
    AND g.black_player_id = b.id
    AND g.start_time = TIMESTAMP('2026-03-30 19:10:00')
    AND NOT EXISTS (SELECT 1 FROM moves m WHERE m.game_id = g.id AND m.ply_number = 1);

INSERT INTO moves (game_id, player_id, ply_number, san, piece, from_pos, to_pos, fen_after, is_capture, is_check, is_checkmate)
SELECT g.id, b.id, 2, 'e5', 'pawn', 'e7', 'e5', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', FALSE, FALSE, FALSE
FROM games g
JOIN users w ON w.username = 'teszt_anna'
JOIN users b ON b.username = 'teszt_bela'
WHERE g.white_player_id = w.id
    AND g.black_player_id = b.id
    AND g.start_time = TIMESTAMP('2026-03-30 19:10:00')
    AND NOT EXISTS (SELECT 1 FROM moves m WHERE m.game_id = g.id AND m.ply_number = 2);

INSERT INTO moves (game_id, player_id, ply_number, san, piece, from_pos, to_pos, fen_after, is_capture, is_check, is_checkmate)
SELECT g.id, w.id, 3, 'Bc4', 'bishop', 'f1', 'c4', 'rnbqkbnr/pppp1ppp/8/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2', FALSE, FALSE, FALSE
FROM games g
JOIN users w ON w.username = 'teszt_anna'
JOIN users b ON b.username = 'teszt_bela'
WHERE g.white_player_id = w.id
    AND g.black_player_id = b.id
    AND g.start_time = TIMESTAMP('2026-03-30 19:10:00')
    AND NOT EXISTS (SELECT 1 FROM moves m WHERE m.game_id = g.id AND m.ply_number = 3);

INSERT INTO moves (game_id, player_id, ply_number, san, piece, from_pos, to_pos, fen_after, is_capture, is_check, is_checkmate)
SELECT g.id, b.id, 4, 'Nc6', 'knight', 'b8', 'c6', 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3', FALSE, FALSE, FALSE
FROM games g
JOIN users w ON w.username = 'teszt_anna'
JOIN users b ON b.username = 'teszt_bela'
WHERE g.white_player_id = w.id
    AND g.black_player_id = b.id
    AND g.start_time = TIMESTAMP('2026-03-30 19:10:00')
    AND NOT EXISTS (SELECT 1 FROM moves m WHERE m.game_id = g.id AND m.ply_number = 4);

INSERT INTO moves (game_id, player_id, ply_number, san, piece, from_pos, to_pos, fen_after, is_capture, is_check, is_checkmate)
SELECT g.id, w.id, 5, 'Qh5', 'queen', 'd1', 'h5', 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', FALSE, FALSE, FALSE
FROM games g
JOIN users w ON w.username = 'teszt_anna'
JOIN users b ON b.username = 'teszt_bela'
WHERE g.white_player_id = w.id
    AND g.black_player_id = b.id
    AND g.start_time = TIMESTAMP('2026-03-30 19:10:00')
    AND NOT EXISTS (SELECT 1 FROM moves m WHERE m.game_id = g.id AND m.ply_number = 5);

-- Meccs chat üzenetek
INSERT INTO game_chats (game_id, sender_id, message, sent_at)
SELECT g.id, w.id, 'Sok sikert, legyen jo meccs!', TIMESTAMP('2026-03-30 19:10:04')
FROM games g
JOIN users w ON w.username = 'teszt_anna'
JOIN users b ON b.username = 'teszt_bela'
WHERE g.white_player_id = w.id
    AND g.black_player_id = b.id
    AND g.start_time = TIMESTAMP('2026-03-30 19:10:00')
    AND NOT EXISTS (
            SELECT 1 FROM game_chats gc
            WHERE gc.game_id = g.id AND gc.message = 'Sok sikert, legyen jo meccs!'
    );

INSERT INTO game_chats (game_id, sender_id, message, sent_at)
SELECT g.id, b.id, 'Koszi, jo jatekot!', TIMESTAMP('2026-03-30 19:10:09')
FROM games g
JOIN users w ON w.username = 'teszt_anna'
JOIN users b ON b.username = 'teszt_bela'
WHERE g.white_player_id = w.id
    AND g.black_player_id = b.id
    AND g.start_time = TIMESTAMP('2026-03-30 19:10:00')
    AND NOT EXISTS (
            SELECT 1 FROM game_chats gc
            WHERE gc.game_id = g.id AND gc.message = 'Koszi, jo jatekot!'
    );

-- Képességhasználati napló (ability_log)
INSERT INTO ability_log (game_id, move_id, player_id, ability_id, used_at)
SELECT
        g.id,
        m.id,
        w.id,
        a.id,
        TIMESTAMP('2026-03-30 19:18:10')
FROM games g
JOIN users w ON w.username = 'teszt_anna'
JOIN users b ON b.username = 'teszt_bela'
JOIN moves m ON m.game_id = g.id AND m.ply_number = 3
JOIN abilities a ON a.name = 'IdoUgras'
WHERE g.white_player_id = w.id
    AND g.black_player_id = b.id
    AND g.start_time = TIMESTAMP('2026-03-30 19:10:00')
    AND NOT EXISTS (
            SELECT 1 FROM ability_log al
            WHERE al.game_id = g.id AND al.move_id = m.id AND al.player_id = w.id AND al.ability_id = a.id
    );

INSERT INTO ability_log (game_id, move_id, player_id, ability_id, used_at)
SELECT
        g.id,
        m.id,
        b.id,
        a.id,
        TIMESTAMP('2026-03-30 19:20:45')
FROM games g
JOIN users w ON w.username = 'teszt_anna'
JOIN users b ON b.username = 'teszt_bela'
JOIN moves m ON m.game_id = g.id AND m.ply_number = 4
JOIN abilities a ON a.name = 'Pajzs'
WHERE g.white_player_id = w.id
    AND g.black_player_id = b.id
    AND g.start_time = TIMESTAMP('2026-03-30 19:10:00')
    AND NOT EXISTS (
            SELECT 1 FROM ability_log al
            WHERE al.game_id = g.id AND al.move_id = m.id AND al.player_id = b.id AND al.ability_id = a.id
    );

-- Barátrendszer: elfogadott + függőben lévő kapcsolat
INSERT INTO friends (user1_id, user2_id, action_user_id, status, invite_time)
SELECT
        LEAST(a.id, b.id),
        GREATEST(a.id, b.id),
        a.id,
        'accepted',
        TIMESTAMP('2026-03-29 18:00:00')
FROM users a
JOIN users b ON b.username = 'teszt_bela'
WHERE a.username = 'teszt_anna'
ON DUPLICATE KEY UPDATE
        action_user_id = VALUES(action_user_id),
        status = VALUES(status);

INSERT INTO friends (user1_id, user2_id, action_user_id, status, invite_time)
SELECT
        LEAST(a.id, c.id),
        GREATEST(a.id, c.id),
        c.id,
        'pending',
        TIMESTAMP('2026-03-30 17:45:00')
FROM users a
JOIN users c ON c.username = 'teszt_csilla'
WHERE a.username = 'teszt_anna'
ON DUPLICATE KEY UPDATE
        action_user_id = VALUES(action_user_id),
        status = VALUES(status);

-- Általános napló (audit + activity)
INSERT INTO user_logs (user_id, event_type, event_category, severity, source, success, metric_key, metric_value, metric_delta, message, metadata, occurred_at)
SELECT
        u.id,
        'login',
        'auth',
        'info',
        'backend',
        TRUE,
        NULL,
        NULL,
        NULL,
        'Sikeres bejelentkezes web kliensrol.',
        JSON_OBJECT('ip', '192.168.0.21', 'device', 'desktop'),
        TIMESTAMP('2026-03-30 18:50:00')
FROM users u
WHERE u.username = 'teszt_anna'
    AND NOT EXISTS (
            SELECT 1
            FROM user_logs ul
            WHERE ul.user_id = u.id
                AND ul.event_type = 'login'
                AND ul.message = 'Sikeres bejelentkezes web kliensrol.'
    );

INSERT INTO user_logs (user_id, event_type, event_category, severity, source, success, metric_key, metric_value, metric_delta, message, metadata, occurred_at)
SELECT
        u.id,
        'game_finished',
        'game',
        'info',
        'socket',
        TRUE,
        'elo',
        1325,
        16,
        'Rangsorolt meccs gyozelemmel zart.',
        JSON_OBJECT('time_control', '10+0', 'result', '1-0', 'opponent', 'teszt_bela'),
        TIMESTAMP('2026-03-30 19:27:05')
FROM users u
WHERE u.username = 'teszt_anna'
    AND NOT EXISTS (
            SELECT 1
            FROM user_logs ul
            WHERE ul.user_id = u.id
                AND ul.event_type = 'game_finished'
                AND ul.message = 'Rangsorolt meccs gyozelemmel zart.'
    );

INSERT INTO user_logs (user_id, event_type, event_category, severity, source, success, metric_key, metric_value, metric_delta, message, metadata, occurred_at)
SELECT
        u.id,
        'friend_request',
        'social',
        'info',
        'frontend',
        TRUE,
        NULL,
        NULL,
        NULL,
        'Baratjeloles kuldese teszt_annának.',
        JSON_OBJECT('target_user', 'teszt_anna', 'status', 'pending'),
        TIMESTAMP('2026-03-30 17:45:02')
FROM users u
WHERE u.username = 'teszt_csilla'
    AND NOT EXISTS (
            SELECT 1
            FROM user_logs ul
            WHERE ul.user_id = u.id
                AND ul.event_type = 'friend_request'
                AND ul.message = 'Baratjeloles kuldese teszt_annának.'
    );

