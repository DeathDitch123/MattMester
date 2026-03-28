-- 1. Felhasználók tábla
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) BINARY UNIQUE NOT NULL, 
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE,
    profile_image VARCHAR(255) DEFAULT NULL,
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
INSERT IGNORE INTO users (username, password_hash, email, elo, elo_MM, elo_bullet, role) 
VALUES ('admin', '$2b$10$haOYyFwigR.niAHSKk.F2.yYfWF27v0RyJYofUDWN981AFdNDollq', 'admin@mattmester.com', 1500, 1500, 1500, 'admin');

CREATE TABLE IF NOT EXISTS profile_image_uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
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


/* test felhasználók */
INSERT INTO users (username, password_hash, email, elo, elo_MM, elo_bullet, created_at) VALUES
('SakkKirály', '$2b$10$7R.x/8z9z...', 'kiraly@example.com', 2150, 2100, 2200, '2023-01-15 10:00:00'),
('GyalogGalopp', '$2b$10$7R.x/8z9z...', 'galopp@example.com', 1450, 1400, 1380, '2023-02-20 11:30:00'),
('VezérVágta', '$2b$10$7R.x/8z9z...', 'vezerv@example.com', 1890, 1920, 1850, '2023-03-05 09:15:00'),
('BástyaBox', '$2b$10$7R.x/8z9z...', 'bastya@example.com', 1200, 1250, 1150, '2023-04-12 14:45:00'),
('FutóKaland', '$2b$10$7R.x/8z9z...', 'futo@example.com', 1670, 1600, 1710, '2023-05-22 18:20:00'),
('MattAdó', '$2b$10$7R.x/8z9z...', 'mattado@example.com', 2340, 2300, 2380, '2023-01-10 20:00:00'),
('SáncolóSólyom', '$2b$10$7R.x/8z9z...', 'solyom@example.com', 950, 1000, 920, '2023-06-01 12:00:00'),
('EnPassant', '$2b$10$7R.x/8z9z...', 'passant@example.com', 1520, 1550, 1490, '2023-06-15 15:30:00'),
('GambitGirl', '$2b$10$7R.x/8z9z...', 'gambit@example.com', 1780, 1750, 1800, '2023-02-28 10:10:00'),
('Patthelyzet', '$2b$10$7R.x/8z9z...', 'patt@example.com', 1100, 1050, 1120, '2023-07-04 16:40:00'),
('HuszárUgratás', '$2b$10$7R.x/8z9z...', 'huszar@example.com', 1350, 1380, 1320, '2023-08-11 08:05:00'),
('SötétLó', '$2b$10$7R.x/8z9z...', 'sotetlo@example.com', 1920, 1900, 1950, '2023-03-20 22:15:00'),
('VilágosVezér', '$2b$10$7R.x/8z9z...', 'vilagos@example.com', 1580, 1600, 1550, '2023-09-05 13:25:00'),
('FischerFan', '$2b$10$7R.x/8z9z...', 'fischer@example.com', 2210, 2250, 2180, '2023-01-05 11:50:00'),
('KasparovJr', '$2b$10$7R.x/8z9z...', 'kaspa@example.com', 2050, 2080, 2020, '2023-02-12 19:30:00'),
('MagnusMániás', '$2b$10$7R.x/8z9z...', 'magnus@example.com', 2410, 2450, 2390, '2023-01-01 00:00:00'),
('Időzavar', '$2b$10$7R.x/8z9z...', 'idozavar@example.com', 1280, 1300, 1400, '2023-10-20 17:10:00'),
('VégjátékMester', '$2b$10$7R.x/8z9z...', 'vegjatek@example.com', 1850, 1820, 1880, '2023-04-05 09:40:00'),
('KettősTámadás', '$2b$10$7R.x/8z9z...', 'kettos@example.com', 1420, 1400, 1450, '2023-11-12 14:00:00'),
('SakkMattSanyi', '$2b$10$7R.x/8z9z...', 'sanyi@example.com', 880, 900, 850, '2023-12-24 10:00:00'),
('BlunderBoy', '$2b$10$7R.x/8z9z...', 'blunder@example.com', 750, 800, 720, '2023-12-28 15:20:00'),
('GrandMasterHope', '$2b$10$7R.x/8z9z...', 'gmhope@example.com', 2010, 2000, 2030, '2023-05-15 08:30:00'),
('RapidRóbert', '$2b$10$7R.x/8z9z...', 'rapid@example.com', 1690, 1720, 1650, '2023-06-20 12:45:00'),
('BulletBéla', '$2b$10$7R.x/8z9z...', 'bulletb@example.com', 1320, 1280, 1550, '2023-07-15 21:00:00'),
('ProfiPistike', '$2b$10$7R.x/8z9z...', 'pistike@example.com', 1150, 1100, 1180, '2023-08-30 16:15:00');