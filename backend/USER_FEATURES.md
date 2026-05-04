# 🎮 MattMester – User/Player Panel Architektúra & Implementációs Dokumentum

> **Cél:** ez a dokumentum a user/player panel teljes terv- és megvalósítási rétegét rögzíti — session management, profil adatok, barátságok, chat, notifikációk, biztonsági kontrollok, fázis-bontás.
>
> **Státusz:** ✅ F1–F10 nagyrészt implementálva. A terven felüli funkciók is elkészültek: chat profanitás-rendszer, játékos-bejelentések, jelszó-visszaállítás, e-mail verifikáció, közelmúltbeli ellenfelek, fiók-törlési folyamat, biztonsági aktivitás-log.
>
> **Utolsó frissítés:** 2026-05-04 — implementáció utáni szinkron.

---

## 📑 Tartalomjegyzék

1. [Vezetői összefoglaló](#-vezetői-összefoglaló)
2. [Eldöntött tervezési pontok](#-eldöntött-tervezési-pontok)
3. [Célarchitektúra](#1-célarchitektúra)
4. [Session management](#2-session-management)
5. [Profil adatkezelés](#3-profil-adatkezelés)
6. [Barátság & blokkolás](#4-barátság--blokkolás)
7. [Játék infrastruktúra](#5-játék-infrastruktúra)
8. [Chat & üzenetek](#6-chat--üzenetek)
9. [Notifikációk](#7-notifikációk)
10. [Real-time (WebSocket) terv](#8-real-time-websocket-terv)
11. [Adatbázis séma](#9-adatbázis-séma)
12. [Biztonsági terv – Top 12 kockázat](#10-biztonsági-terv)
13. [API ellenőrzési pontok](#11-api-és-ws-ellenőrzési-pontok)
14. [Megvalósítási fázisok](#12-megvalósítási-fázisok-f1f10)
15. [Tesztelési terv](#13-tesztelési-terv)
16. [Jövőbeli funkciók](#14-jövőbeli-funkciók)

---

## 🧾 Vezetői összefoglaló

A user/player réteg az alábbi funkcionális területeken van implementálva:

1. **Session management** — login/logout, jelszó-visszaállítás, e-mail verifikáció, force logout (admin által).
2. **Profil rendszer** — user adatok, profilkép feltöltés + admin review, redakció (email titkos más usernek).
3. **Barátság & blokkolás** — friend request, accept/decline, block/unblock, szimmetrikus chat-cleanup.
4. **Játék infrastruktúra** — multi-ELO rendszer (mattmester/classical/blitz), képesség-log, közelmúltbeli ellenfelek.
5. **Chat** — konverzáció-alapú DM, profanitás maszkolás, dinamikus blokklista, üzenet-jelentés, strike-alapú auto-ban.
6. **Notifikációk** — WebSocket real-time + DB fallback, audience-alapú célzás (user/role/global).
7. **Felhasználói bejelentések** — játékos-vs-játékos bejelentések (csalás, toxicitás stb.) admin review-ra.
8. **Fiók-törlés** — önkéntes, tranzakció-biztos: session destroy + egyidejűleg futó meccsek leállítása.
9. **Biztonsági aktivitás-log** — user saját bejelentkezési és biztonsági eseményeit látja.

### Eltérések az eredeti tervtől

| Terv | Tényleges implementáció |
|---|---|
| `blocked_users` tábla | `friend_blocks` tábla (blocker/blocked + active flag) |
| Direkt DM (receiver_user_id) | Konverzáció-alapú chat (`chat_conversations` + `chat_participants`) |
| `user_notifications` tábla | `notifications` + `notification_reads` tábla (audience-alapú célzás) |
| Külön `elo_ratings` tábla | ELO mezők közvetlenül a `users` táblában (4 mód: elo, elo_mattmester, elo_classical, elo_blitz) |
| `user_sessions` tábla | Express session (memória/session store) — nincs külön DB tábla |
| Nincs profanitás-rendszer | Chat profanitás maszkolás + dinamikus blokklista + 3-strike auto-ban |
| Nincs jelszó-reset | Teljes e-mail-alapú jelszó-visszaállítási folyamat implementálva |
| Nincs user-bejelentés | `user_reports` tábla + API végpontok implementálva |

---

## ✅ Eldöntött tervezési pontok

| # | Kérdés | Döntés |
|---|---|---|
| 1 | Auth-stratégia | ✅ **Session-based** — login-kor szerver session, cookie `httpOnly`. |
| 2 | Session TTL | ✅ **7 napok** inaktivitás nélkül. |
| 3 | Force logout | ✅ **Admin dönt.** `POST /api/admin/users/:id/force-logout` → `user:session_revoked` WS esemény. |
| 4 | Profilkép max méret | ✅ **5 MB**, JPEG/PNG, admin review kötelező. |
| 5 | Barátságok | ✅ **Kétirányú.** A blokkolja B-t → chat cleanup, barát-listáról eltávolítás. |
| 6 | Blokkolás aszimmetria | ✅ `friend_blocks` tábla, `active` flag, mindkét irány független. |
| 7 | ELO számítás | ✅ **4 módos ELO.** `elo`, `elo_mattmester`, `elo_classical`, `elo_blitz` a `users` táblában. |
| 8 | Chat rate limit | ✅ **10 msg / 10 sec** normál. |
| 9 | Notifikáció delivery | ✅ **Best-effort** WebSocket + DB fallback (`notifications` tábla). |
| 10 | Offline üzenetek | ✅ `notifications` tábla, olvasatlanság-jelölés. |
| 11 | User log megőrzés | ✅ **90 nap auto-delete** (retention job). |
| 12 | Redakció | ✅ Email más usernek rejtett (`***`), IP soha nem kerül ki. |
| 13 | Profanitás kezelés | ✅ **3-strike rendszer.** Maszkolás → 1. strike temp ban, 2. strike hosszabb ban, 3. strike permanent ban. |
| 14 | Chat konverzáció-modell | ✅ **Konverzáció-alapú** (nem direkt receiver_user_id) — rugalmasabb csoportos chat számára. |
| 15 | Jelszó-visszaállítás | ✅ E-mail token alapú, 1 órás TTL. |
| 16 | Játékos-bejelentés | ✅ `user_reports` tábla, admin review-ra kerül. |

---

## 1. Célarchitektúra

```
┌──────────────────────────────────────────────────────────────────────┐
│  Kliens (Player UI – web)                                            │
└──────────────────────────────────────────────────────────────────────┘
        │ HTTP: Cookie: session=...    │ WS: / (default namespace)
        ▼                              ▼
┌──────────────────────────┐ ┌────────────────────────────────────────┐
│  Player API réteg        │ │  Player WebSocket namespace            │
│  /api/auth/*             │ │  io.of('/')                            │
│  /api/profile/*          │ │                                        │
│  /api/players/*          │ │  szobák:                               │
│  /api/chat/*             │ │   - 'user:{id}' (private)              │
│  /api/friends/*          │ │   - 'game:{id}' (PvP live)             │
│  /api/notifications/*    │ │   - 'room:{name}' (csevegőszoba)       │
│  /api/leaderboard        │ │   - 'matchmaking'                      │
│  /api/reports/*          │ │                                        │
│                          │ │  middleware:                           │
│  middleware lánc:        │ │   1. parseSession (cookie)             │
│   1. ipBlockGuard        │ │   2. requireAuth                       │
│   2. maintenanceGuard    │ │                                        │
│   3. parseSession        │ │                                        │
│   4. requireAuth         │ │                                        │
│   5. rateLimit           │ │                                        │
│   6. csrfGuard           │ │                                        │
└──────────────────────────┘ └────────────────────────────────────────┘
        │                                               │
        ▼                                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  SQL modulok (backend/sql/modules/)                                  │
│  - users.js          (user CRUD, soft-delete, jelszó-reset)          │
│  - friends.js        (friend req, accept, block)                     │
│  - chat.js           (konverzációk, üzenetek, profanitás, strike)    │
│  - notifications.js  (notification CRUD, read-state)                 │
│  - leaderboard.js    (ELO rangsor, módok szerint)                    │
│  - userReports.js    (játékos-bejelentések)                          │
│  - recentOpponents.js (közelmúltbeli ellenfelek)                     │
│  - profileImage.js   (feltöltés, review állapot)                     │
│  - userLogs.js       (aktivitás-log)                                 │
│  - emailVerification.js (token generálás, ellenőrzés)                │
│  - bans.js           (ban/unban, ban esemény, IP track)              │
└──────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  MySQL: users, statistics, profile_image_uploads, user_logs,         │
│         friends, friend_blocks, chat_conversations, chat_participants,│
│         chat_messages, chat_message_reports,                          │
│         chat_blocked_words_dynamic, chat_profanity_strikes,           │
│         notifications, notification_reads,                            │
│         games, game_chats, moves, ability_log, abilities,             │
│         user_reports, recent_opponents                                │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Session Management

### 2.1 Session típusa

- **Express session** (`express-session`) memória store-ral (iskolai szinten OK).
- Session key: opaque token (CSPRNG, express-session generálja).
- Cookie: `httpOnly`, `secure` (HTTPS-en), `sameSite=Strict`, 7 nap max-age.
- Szerver session store-ban: `{ userId, username, role, email }`.

### 2.2 Életciklus

```
┌──────────────┐   login    ┌──────────────┐   activity   ┌──────────────┐
│    Signup    │─────────▶│   Session    │────────────▶│   Session    │
│  + validate  │ password OK│   CREATED   │   (cookie)  │    ACTIVE    │
└──────────────┘           └──────────────┘             └──────────────┘
                                                               │
                                                               ▼
                          ┌──────────────┐   inactivity   ┌──────────────┐
                          │   Session    │────7 nap──────▶│   EXPIRED    │
                          │   STORED     │                └──────────────┘
                          └──────────────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │  REVOKED     │ ◀── logout / force logout (admin)
                          └──────────────┘
```

### 2.3 Auth Endpoints

| Endpoint | Mit csinál |
|---|---|
| `POST /api/auth/register` | Body: `{ username, email, password }`. Validáció, jelszó hash, user létrehozás, e-mail verifikáció küldése. |
| `POST /api/auth/login` | Body: `{ username/email, password }`. User lookup, jelszó verify, session indítás. Soft-deleted user: 403. |
| `POST /api/auth/logout` | Aktuális session destroy. |
| `GET  /api/auth/verify-email` | Query: `{ token }`. E-mail verifikáció token alapján (1 perces TTL). |
| `POST /api/auth/resend-verify` | Új verifikációs e-mail küldése. |
| `POST /api/auth/forgot-password` | E-mail-alapú jelszó-visszaállítás indítása (reset token, 1 h TTL). |
| `GET  /api/auth/verify-reset-token` | Query: `{ token }`. Reset token érvényességének ellenőrzése. |
| `POST /api/auth/reset-password` | Body: `{ token, newPassword }`. Jelszó visszaállítása érvényes reset tokennel. |

### 2.4 Force logout (admin)

Admin végpont: `POST /api/admin/users/:id/force-logout` (lásd ADMIN_PANEL.md `users/:id/edit`).
- User aktív session-jei törlésre kerülnek.
- WebSocket üzenet: `user:session_revoked { reason: "...admin által" }`.
- Kliens automatikusan redirect a login oldalra.

---

## 3. Profil adatkezelés

### 3.1 `users` tábla (aktuális séma)

```sql
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    profile_image VARCHAR(255) DEFAULT 'default_avatar.png',
    elo INT DEFAULT 1200,
    elo_mattmester INT DEFAULT 1200,
    elo_classical INT DEFAULT 1200,
    elo_blitz INT DEFAULT 1200,
    role ENUM('player','admin') DEFAULT 'player',
    is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason VARCHAR(255) NULL,
    banned_until TIMESTAMP NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token_hash CHAR(64) NULL,
    email_verification_token_expires TIMESTAMP NULL,
    reset_password_token VARCHAR(255) NULL,
    reset_token_expires TIMESTAMP NULL,
    last_login_ip VARCHAR(45) NULL,
    deleted_at TIMESTAMP NULL,
    deletion_scheduled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_username (username),
    INDEX idx_users_email (email)
);

CREATE TABLE IF NOT EXISTS statistics (
    user_id INT PRIMARY KEY,
    wins INT DEFAULT 0,
    losses INT DEFAULT 0,
    draws INT DEFAULT 0,
    abilities_used INT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

> **Megjegyzés:** az eredeti tervben külön `user_stats` tábla volt `games_played`, `current_elo`, `peak_elo`, `total_playtime_seconds` mezőkkel. Az implementációban `statistics` tábla van `wins`/`losses`/`draws`/`abilities_used` mezőkkel; az ELO közvetlenül a `users` táblában van (4 módban).

### 3.2 Profil GET (`GET /api/players/:userId`)

Megjelenítendő (public):
- `username`, `profileImage`, `elo`, `elo_mattmester`, `elo_classical`, `elo_blitz`
- `isOnline` (WebSocket jelenlét alapján)
- `statistics` (wins, losses, draws)

Titkos (csak saját user + admin):
- `email`, `emailVerified`, `lastLoginIp`, `createdAt`

Redakció: `email` → `***` más user számára; `lastLoginIp` soha nem kerül ki.

### 3.3 Profil UPDATE (`POST /api/profile/settings`)

Body: `{ username?, email?, currentPassword, newPassword? }`

- `username`: max 50 char, egyedi ellenőrzés.
- `email`: valid e-mail formátum, egyedi ellenőrzés.
- Jelszóváltoztatáshoz `currentPassword` kötelező.

### 3.4 Profilkép workflow

```sql
CREATE TABLE IF NOT EXISTS profile_image_uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    filename VARCHAR(255) NOT NULL,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    reviewed_by INT NULL,
    review_note VARCHAR(255) NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);
```

1. `POST /api/profile/image/upload` — multipart upload → `profile_image_uploads` sor, status='pending'.
2. Admin review panel (ADMIN_PANEL.md §8.1 Profilképek).
3. Admin approve → `users.profile_image` frissítve, status='approved', `user:profile_image_approved` WS.
4. Admin reject → `review_note` set, status='rejected', `user:profile_image_rejected` WS + DB notifikáció.
5. `POST /api/profile/image/remove` — alapértelmezett avatarra visszaáll.

### 3.5 Fiók törlés

`DELETE /api/profile/delete` Body: `{ password }`.
- Tranzakcióban: session destroy + folyamatban lévő meccsek leállítása + `deleted_at = NOW()` + `deletion_scheduled_at = NOW() + 24h`.
- 24 órán belül admin visszaállíthatja: `POST /api/admin/users/:id/restore-deletion`.
- 24 óra után cron job (`softDeletePurgeJob.js`) végzi a hard-delete-et.

### 3.6 Biztonsági aktivitás-log

`GET /api/profile/security` — a user saját bejelentkezési és biztonsági eseményeit látja (IP, user-agent, időbélyeg, esemény típusa).

---

## 4. Barátság & blokkolás

### 4.1 Relationships táblák

```sql
CREATE TABLE IF NOT EXISTS friends (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user1_id INT NOT NULL,
    user2_id INT NOT NULL,
    action_user_id INT NOT NULL,             -- aki az utolsó akciót végezte
    status ENUM('pending','accepted','rejected') DEFAULT 'pending',
    invite_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_friends_pair (user1_id, user2_id),
    FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (action_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_friends_status (status),
    INDEX idx_friends_user1 (user1_id, status),
    INDEX idx_friends_user2 (user2_id, status)
);

CREATE TABLE IF NOT EXISTS friend_blocks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    blocker_user_id INT NOT NULL,
    blocked_user_id INT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_blocked_pair (blocker_user_id, blocked_user_id),
    FOREIGN KEY (blocker_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_blocked_blocker (blocker_user_id)
);
```

> **Megjegyzés:** az eredeti tervben `user_id_a`/`user_id_b` és `blocked_users` tábla volt. Az implementációban `user1_id`/`user2_id` és `friend_blocks` (+ `active` flag az unblock-hoz).

### 4.2 Endpoints

| Endpoint | Mit csinál |
|---|---|
| `POST /api/friends/add` | Body: `{ targetUserId }`. Friend request küldése. |
| `POST /api/friends/:requestId/accept` | Elfogadás → status='accepted', konverzáció létrehozása. |
| `POST /api/friends/:requestId/decline` | Elutasítás → status='rejected'. |
| `POST /api/friends/block` | Body: `{ targetUserId }`. Blokkolás + barátság törlés + chat cleanup. |
| `POST /api/friends/:friendshipId/remove` | Elfogadott barátság törlése + chat cleanup + olvasatlanság-frissítés. |

### 4.3 Blokkolás logika

- A blokkolja B-t → `friend_blocks` sor `active=TRUE`.
- Barátság törlése + chat konverzáció cleanup (ha volt).
- B-nek A üzenetei nem érkeznek (silent discard).
- Unblock: `active=FALSE` (a sor megmarad, de inaktív).
- Blokk aszimmetrikus: B tud üzenni A-nak, ha A nem blokkolta B-t.

---

## 5. Játék infrastruktúra

### 5.1 Game state táblák

```sql
CREATE TABLE IF NOT EXISTS games (
    id INT AUTO_INCREMENT PRIMARY KEY,
    white_player_id INT NOT NULL,
    black_player_id INT NOT NULL,
    winner_id INT NULL,
    time_control VARCHAR(20) NULL,            -- pl. '10+0', 'classical'
    initial_fen VARCHAR(100) NULL,
    current_fen VARCHAR(100) NULL,
    pgn TEXT NULL,
    start_time TIMESTAMP NULL,
    end_time TIMESTAMP NULL,
    status ENUM('pending','active','finished','aborted','timeout') DEFAULT 'pending',
    FOREIGN KEY (white_player_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (black_player_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_games_players (white_player_id, black_player_id),
    INDEX idx_games_status (status)
);

CREATE TABLE IF NOT EXISTS moves (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT NOT NULL,
    player_id INT NOT NULL,
    ply_number INT NOT NULL,
    san VARCHAR(10) NOT NULL,
    piece VARCHAR(10) NULL,
    from_pos VARCHAR(2) NOT NULL,
    to_pos VARCHAR(2) NOT NULL,
    fen_after VARCHAR(100) NULL,
    is_capture BOOLEAN DEFAULT FALSE,
    is_check BOOLEAN DEFAULT FALSE,
    is_checkmate BOOLEAN DEFAULT FALSE,
    promotion_piece VARCHAR(1) NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_moves_game (game_id, ply_number)
);

CREATE TABLE IF NOT EXISTS game_chats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT NOT NULL,
    sender_id INT NOT NULL,
    message VARCHAR(500) NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS abilities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT NULL,
    cooldown_turns INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS ability_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    game_id INT NOT NULL,
    move_id INT NULL,
    player_id INT NOT NULL,
    ability_id INT NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (ability_id) REFERENCES abilities(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recent_opponents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    opponent_user_id INT NOT NULL,
    last_played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    match_count INT DEFAULT 1,
    last_game_id INT NULL,
    UNIQUE KEY ux_recent_opp (user_id, opponent_user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (opponent_user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### 5.2 Elérhető endpoints

| Endpoint | Leírás |
|---|---|
| `GET /api/leaderboard` | ELO rangsor (módok szerint szűrhető). |
| `GET /api/recentOpponents` | Közelmúltbeli ellenfelek listája (Rocket League-stílusú). |
| `GET /api/searchPlayer` | Felhasználók keresése username alapján. |
| `GET /api/players/:userId` | Nyilvános profil megtekintése. |
| `POST /api/reports/user` | Játékos-bejelentés (csalás, toxicitás stb.). |

### 5.3 Live game events (WebSocket)

| Event | Irány | Mikor |
|---|---|---|
| `game:move` | player → server | Lépés küldése |
| `game:move_confirmed` | server → game:{id} | Lépés valid, broadcast |
| `game:finished` | server → game:{id} | Játék vége |
| `game:accept` | player → server | Játék elfogadása |
| `game:decline` | player → server | Játék elutasítása |
| `game:rematch` | player → server | Újrajátszás kérés |

### 5.4 ELO rendszer

- 4 módos ELO: `elo` (általános), `elo_mattmester`, `elo_classical`, `elo_blitz`.
- Szinkron frissítés játék után.
- Admin szerkesztheti az ELO értékeket (`/api/admin/users/:id/edit`).

---

## 6. Chat & üzenetek

### 6.1 Chat táblák

```sql
CREATE TABLE IF NOT EXISTS chat_conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type ENUM('dm','group') DEFAULT 'dm',
    name VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP NULL,
    last_message_preview VARCHAR(100) NULL
);

CREATE TABLE IF NOT EXISTS chat_participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    user_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_read_message_id INT NULL,
    UNIQUE KEY ux_participant (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_id INT NOT NULL,
    body VARCHAR(2000) NOT NULL,
    body_masked VARCHAR(2000) NULL,          -- profanitás-szűrt verzió
    is_body_masked BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_chat_messages_conv (conversation_id, sent_at)
);

CREATE TABLE IF NOT EXISTS chat_message_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    reporter_user_id INT NOT NULL,
    reason VARCHAR(255) NULL,
    status ENUM('pending','reviewed','dismissed') DEFAULT 'pending',
    reviewed_by INT NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS chat_blocked_words_dynamic (
    id INT AUTO_INCREMENT PRIMARY KEY,
    word VARCHAR(100) NOT NULL UNIQUE,
    added_by_admin_id INT NULL,
    source_message_id INT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_profanity_strikes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    message_id INT NULL,
    source ENUM('auto','admin') DEFAULT 'auto',
    ban_type ENUM('temp_short','temp_long','permanent') NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### 6.2 Chat Endpoints

| Endpoint | Mit csinál |
|---|---|
| `GET  /api/chat/conversations` | User konverzáció listája (utolsó üzenet preview, olvasatlan szám). |
| `GET  /api/chat/conversations/:id/messages` | Konverzáció üzenet-előzményei. |
| `POST /api/chat/messages/send` | Üzenet küldése: profanitás-ellenőrzés, maszkolás, rate limit. |
| `POST /api/chat/messages/:messageId/report` | Üzenet bejelentése adminnak. |

### 6.3 Profanitás rendszer

1. Üzenet küldésekor a `chat_blocked_words_dynamic` lista alapján szűrés.
2. Ha tiltott szó: `body_masked` feltöltése, `is_body_masked=TRUE`.
3. Admin látja a maszkolt üzeneteket, dönthet: **allow** (elvetés, riport-mute küldő-nek) vagy **delete** (törlés + strike).
4. 3-strike rendszer:
   - 1. strike → rövid ideiglenes tiltás.
   - 2. strike → hosszabb ideiglenes tiltás.
   - 3. strike → permanent ban.
5. Admin bővítheti a blokklistát: `POST /api/admin/chat/blocklist/add`.

### 6.4 Read tracking

- `chat_participants.last_read_message_id` tárolja az utolsó olvasott üzenetet.
- Barát eltávolításakor / blokkolásakor a konverzáció cleanup fut.

---

## 7. Notifikációk

### 7.1 Notification tábla

```sql
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    audience ENUM('user','role','global') DEFAULT 'user',
    target_user_id INT NULL,                 -- user audience-nél
    target_role ENUM('player','admin') NULL, -- role audience-nél
    sender_user_id INT NULL,
    title VARCHAR(200) NOT NULL,
    message VARCHAR(1000) NOT NULL,
    payload JSON NULL,
    severity ENUM('info','warning','danger') DEFAULT 'info',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notif_target (audience, target_user_id, created_at),
    INDEX idx_notif_role (audience, target_role, created_at)
);

CREATE TABLE IF NOT EXISTS notification_reads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    notification_id INT NOT NULL,
    user_id INT NOT NULL,
    read_at TIMESTAMP NULL,
    dismissed_at TIMESTAMP NULL,
    UNIQUE KEY ux_notif_reader (notification_id, user_id),
    FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notif_reads_user (user_id, read_at)
);
```

> **Megjegyzés:** az eredeti tervben `user_notifications` (csak per-user) volt. Az implementáció `notifications` + `notification_reads` kettős táblával `audience` alapú célzást biztosít (user / role / global).

### 7.2 Notification típusok

| Típus | Trigger | Persistence |
|---|---|---|
| `friend_request` | Friend request érkezett | DB |
| `friend_accepted` | Request elfogadva | WS + DB |
| `profile_image_approved` | Admin jóváhagyta a képet | WS + DB |
| `profile_image_rejected` | Admin elutasította | WS + DB, permanent |
| `user_banned` | Admin tiltás | WS + DB, permanent |
| `user_unbanned` | Admin tiltás feloldása | WS + DB |
| `admin_broadcast` | Admin küldött (global/role) | WS + DB |
| `report_muted` | Hamis bejelentés → 5h mute | WS |

### 7.3 Notification endpoints

| Endpoint | Mit csinál |
|---|---|
| `GET  /api/notifications` | Paginated lista (olvasatlan + utolsó 30 nap). |
| `GET  /api/notifications/unread-count` | Badge szám. |
| `POST /api/notifications/:id/read` | Olvasottnak jelöl. |
| `POST /api/notifications/:id/dismiss` | Elrejt a listából. |

---

## 8. Real-time (WebSocket) terv

### 8.1 Namespace + szobák

- Namespace: `/` (default) — player-level.
- Szobák:
  - `user:{id}` — private (személyes események, DM értesítők).
  - `game:{gameId}` — PvP live.
  - `room:{name}` — publikus csevegőszoba.
  - `matchmaking` — várakozó sor.

### 8.2 Eseménytípusok

| Esemény | Irány | Mikor |
|---|---|---|
| `presence:update` | server → broadcast | User online/offline státusz változás |
| `user:dm_received` | server → user:{id} | Üzenet érkezett |
| `user:friend_request` | server → user:{id} | Friend request érkezett |
| `user:friend_accepted` | server → user:{id} | Friend request elfogadva |
| `user:session_revoked` | server → user:{id} | Force logout (admin) |
| `user:profile:adminEdit` | server → user:{id} | Admin szerkesztette a profilt |
| `user:profile_image_approved` | server → user:{id} | Profilkép jóváhagyva |
| `user:profile_image_rejected` | server → user:{id} | Profilkép elutasítva |
| `user:banned` | server → user:{id} | Tiltás értesítés |
| `user:notification` | server → user:{id} | Általános notifikáció |
| `chat:message` | player → server | Üzenet küldése WS-en |
| `chat:message:deleted` | server → user:{id} | Üzenet törölve admin által |
| `chat:report:muted` | server → user:{id} | Hamis bejelentés → mute |
| `game:move_confirmed` | server → game:{id} | Lépés validálva |
| `game:finished` | server → game:{id} | Játék vége |

### 8.3 Jelenlét (presence) kezelés

- Csatlakozáskor és lecsatlakozáskor `user_logs` bejegyzés.
- Grace period: rövid szünet után nem kerül azonnal offline-ba a user (multi-tab, lap-frissítés tolerancia).
- `socket:sync` eseménnyel szinkronizálja a kliens állapotát (szoba-tagságok, játék státusz).

### 8.4 Heartbeat & reconnect

- Kliens 30 mp-enként ping; szerver pong.
- 60 mp válasz nélkül → kliens reconnect.
- Reconnect után: szerver auto-rejoin korábbi szobákba (`user:{id}`, `game:*`), ha session érvényes.

---

## 9. Adatbázis séma

Az összes tábla definíciója:

| Tábla | Szekció |
|---|---|
| `users` | §3.1 |
| `statistics` | §3.1 |
| `profile_image_uploads` | §3.4 |
| `friends` | §4.1 |
| `friend_blocks` | §4.1 |
| `games` | §5.1 |
| `moves` | §5.1 |
| `game_chats` | §5.1 |
| `abilities` | §5.1 |
| `ability_log` | §5.1 |
| `recent_opponents` | §5.1 |
| `chat_conversations` | §6.1 |
| `chat_participants` | §6.1 |
| `chat_messages` | §6.1 |
| `chat_message_reports` | §6.1 |
| `chat_blocked_words_dynamic` | §6.1 |
| `chat_profanity_strikes` | §6.1 |
| `notifications` | §7.1 |
| `notification_reads` | §7.1 |
| `user_logs` | [backend/sql/modules/userLogs.js](backend/sql/modules/userLogs.js) |
| `user_reports` | [backend/sql/modules/userReports.js](backend/sql/modules/userReports.js) |

---

## 10. Biztonsági terv – Top 12 kockázat

| # | Kockázat | Védelem |
|---|---|---|
| 1 | XSS (chat tartalom) | DOMPurify kliens-oldalon, HTML escape szerver-oldalon. Chat profanitás maszkolás. |
| 2 | Session hijack | httpOnly cookie, secure flag, sameSite=Strict. |
| 3 | CSRF | SameSite cookie + `csrfGuard` middleware POST kérésekre. |
| 4 | Rate limit bypass | Rate limiter factory per-endpoint, admin escalation alert. |
| 5 | DM spam | Per-user rate limit 10/10sec; blokkolás → üzenet silent discard. |
| 6 | Friend req spam | Rate limit + blokkolás-logika. |
| 7 | Profilkép malware | MIME check, fájlméret limit (5MB), admin review kötelező. |
| 8 | IP spoofing | Reverse proxy `X-Forwarded-For` kezelés (konfig alapján). |
| 9 | DDoS (WebSocket) | Rate limit per-socket, connection cap per-user. |
| 10 | Jogosulatlan játékhoz csatlakozás | Játék join validáció: player-e a parti, session check. |
| 11 | Chat törlés megkerülése | Soft-delete + admin audit trail; user nem törölhet véglegesen. |
| 12 | Profanitás bypass (leetspeak stb.) | Admin bővítheti a dinamikus blokklistát, maszkolt üzenetek review-hoz kerülnek. |

---

## 11. API és WS ellenőrzési pontok

### 11.1 API response szerkezet

Siker:
```json
{ "success": true, "data": { } }
```

Hiba:
```json
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "Session lejárt." }
}
```

### 11.2 HTTP status codes

- `200` — OK
- `201` — Created
- `400` — Bad Request (validáció, schema)
- `401` — Unauthorized (session hiányzik/lejárt)
- `403` — Forbidden (tiltott user, blokkolás, soft-deleted fiók)
- `404` — Not Found
- `429` — Too Many Requests
- `500` — Internal Server Error
- `503` — Service Unavailable (karbantartási mód)

### 11.3 WebSocket hibakezelés

- Hiba után 1 sec delay, exponenciális backoff (max 30 sec).
- Max 5 reconnect attempt; utána user notification + redirect login.

---

## 12. Megvalósítási fázisok (F1–F10)

| Fázis | Fő cél | Státusz |
|---|---|---|
| **F1** | Auth + Session | ✅ Login, register, logout, e-mail verifikáció, jelszó-reset |
| **F2** | Profil read/view | ✅ `GET /players/:id`, leaderboard, player search |
| **F3** | Profil update | ✅ `POST /profile/settings` (username, email, jelszó), redaction |
| **F4** | Profilkép upload | ✅ Upload, admin review flow, elutasítás értesítő |
| **F5** | Friends (CRUD) | ✅ Request, accept, decline, remove + chat cleanup |
| **F6** | Block system | ✅ Block/unblock, szűrés, chat cleanup |
| **F7** | Matchmaking queue | ⚠️ Részben — backend DB struktúra kész, live matchmaking UI folyamatban |
| **F8** | Live PvP game | ⚠️ Részben — `game:` WS events, move struktúra, ability log; frontend még fejlesztés alatt |
| **F9** | ELO calculation | ✅ 4 módos ELO a `users` táblában, leaderboard API |
| **F10** | Chat + notif system | ✅ DM konverzáció, profanitás, strikes, notifications, read tracking |
| **F+** | Terven felüli | ✅ Jelszó-reset, e-mail verify, user bejelentések, biztonsági aktivitás-log, fiók-törlés, közelmúltbeli ellenfelek, képesség-rendszer |

---

## 13. Tesztelési terv

### 13.1 Unit tests

- **Auth:** register, login, logout, jelszó-reset token generálás.
- **Profile:** update, validáció, redakció (email rejtve más usernek).
- **Friends:** request, accept, decline, block logika.
- **Chat:** profanitás-szűrés, strike rendszer, rate limit.
- **ELO:** delta számítás, edge case-ek (draw, boundary values).

### 13.2 Integration tests

- **API flow:** register → e-mail verify → login → profil update → friend request → game start.
- **WebSocket:** connect, emit, receive, reconnect (grace period).
- **Blokkolás:** A blokkolja B-t → B üzenete nem érkezik; konverzáció cleanup.
- **Admin force logout:** session visszavonás, WS disconnect.
- **Profanitás:** 3 strike → automatic ban trigger.

### 13.3 E2E tests (frontend kész után)

- **Teljes játék flow:** matchmaking, elfogadás, lépések, befejezés, ELO frissítés.
- **DM flow:** küldés, fogadás, olvasottnak jelölés, notifikáció.
- **Profilkép:** feltöltés, admin reject, user értesítő, újrafeltöltés.
- **Fiók-törlés:** törlés → 24h grace → admin visszaállítás.

---

## 14. Jövőbeli funkciók

- **Spectator mode** — élő meccs nézése WS read-only csatlakozással.
- **Tournamentok** — bracket, leaderboard, csoportos meccsek.
- **Mobil app** — React Native / Flutter.
- **Teljes chat képesség-rendszer** — speciális képességek live játék közben a chat csatornákon.
- **Replay rendszer** — játék-felvétel lejátszása (PGN alapján részben már exportálható).
- **Achievements & badges** — mérföldkő-nyomon követés.
- **Clan rendszer** — csoport, csapat-játék.
- **Szezonális rangsor** — havi reset, szezonális leaderboard.
- **E2E üzenet-titkosítás** — DM konverzációkhoz.

---

## 📌 Módosítás historie

| Dátum | Verzió | Módosítás |
|---|---|---|
| 2026-04-27 | 1.0 | Kezdeti terv. |
| 2026-05-04 | 2.0 | Implementáció utáni szinkron — tényleges séma, elkészült fázisok, terven felüli funkciók dokumentálva. |
