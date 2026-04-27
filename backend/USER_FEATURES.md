# 🎮 MattMester – User/Player Panel Architektúra & Tervdokumentum

> **Cél:** ez a dokumentum a user/player panel teljes terv-rétegét rögzíti — session management, profil adatok, barátságok, játékok, chat, notifikációk, biztonsági kontrollok, fázis-bontás. Forrás-igazság a fokozatos implementációhoz.
>
> **Státusz:** terv. F1–F10 fázisok kódolása ezután indul.
>
> **Készült:** 2026-04-27 — első iteráció.

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

A meglévő rendszer szilárd alapot ad (rate limiter, notifications, socket hub, auth middleware). A user-panel fejlesztéshez 5 fő réteg kerül felépítésre:

1. **Session management** — login/logout, session refresh, lejárat kezelés, force logout (admin által).
2. **Profil rendszer** — user adat, profilkép, jogosultságok, redakcióként titkos mezők (email, telefon).
3. **Barátság & blokkolás** — friend request, accept/decline, block/unblock, kimeneti szűrés.
4. **Játék infrastruktúra** — matchmaking, live PvP, observer, chess engine, ELO track.
5. **Chat & notifikációk** — DM, room chat, read-state, audit, banner notificationök.

A user session a `user_logs` tábla denormalizált logging-jaként marad (de gyámolít az admin audit terve). A frontend nélkül is tesztelhető API+Socket szerződéseket szállítunk fázisonként.

---

## ✅ Eldöntött tervezési pontok

| # | Kérdés | Döntés |
|---|---|---|
| 1 | Auth-stratégia | **Session-based** — login-kor szerver session, cookie `httpOnly`. |
| 2 | Session TTL | **7 napok** inaktivitás nélkül (auto-refresh aktív játékban). |
| 3 | Force logout | **Admin dönt.** User-ből NEM lehet forcLog, csak admin által `/api/admin/users/{id}/force-logout`. |
| 4 | Profilkép max méret | **5 MB**, JPEG/PNG, 1024×1024 px-ig. |
| 5 | Barátságok | **Kétirányú, önálló blokkolás.** A blokkolja B-t → B nem látja A-t, A-nak ajánlások, üzenetek nem érkeznek. |
| 6 | Blokkolás asszimetria | A blokkolja B-t ≠ B blokkolja A-t. Mindkettő függetlenül manipulálható. |
| 7 | ELO számítás | **Standard Glicko-2 formula.** Játék után szinkron update, websocket `user:elo_changed`. |
| 8 | Chat per-user rate limit | **10 msg / 10 sec** normál, **25 msg / 10 sec** VIP. |
| 9 | Notifikáció delivery | **Best-effort**, nem garantált (DoS elleni védelem). WebSocket + fallback DB. |
| 10 | Offline user üzenetek | **Tárolt** a `user_notifications` tábla bővítésében, max **500 / user**. |
| 11 | User log megőrzés | **90 nap auto-delete.** Iskolai projekt, nem archiválási kötelezettség. |
| 12 | Redakció | **Teljes**, email/telefon/IP titkos, csak saját user + admin láthatja. |

---

## 1. Célarchitektúra

```
┌──────────────────────────────────────────────────────────────────────┐
│  Kliens (Player UI – web/später mobil)                               │
└──────────────────────────────────────────────────────────────────────┘
        │ HTTP: Cookie: session=...    │ WS: / (default namespace)
        ▼                              ▼
┌──────────────────────────┐ ┌────────────────────────────────────────┐
│  Player API réteg        │ │  Player WebSocket namespace            │
│  /api/players/*          │ │  io.of('/')                            │
│  /api/profile/*          │ │                                        │
│  /api/chat/*             │ │  szobák:                               │
│  /api/friends/*          │ │   - 'user:{id}' (private)              │
│  /api/notifications/*    │ │   - 'game:{id}' (PvP live)             │
│  /api/auth/*             │ │   - 'room:{name}' (chat room)          │
│                          │ │                                        │
│  middleware lánc:        │ │  middleware:                           │
│   1. parseSession        │ │   1. parseSession                      │
│   2. requireAuth         │ │   2. requireAuth                       │
│   3. rateLimit           │ │   3. rateLimit                         │
│   4. auditWrap           │ │   4. auditWrap                         │
│   5. blockingCheck       │ │                                        │
└──────────────────────────┘ └────────────────────────────────────────┘
        │                                               │
        ▼                                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Services réteg                                                      │
│  - ProfileService (profil read/update, redactio)                    │
│  - FriendsService (friend request, accept/block)                    │
│  - GameService (matchmaking, live game, ELO)                        │
│  - ChatService (message send, history, moderation)                  │
│  - NotificationService (batch emit, delivery track)                 │
│  - UserLogService (activity log, audit)                             │
└──────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  MySQL: users, user_sessions, user_profile_images, user_logs,        │
│         friends, blocked_users, chat_messages, user_notifications,   │
│         games, game_moves, elo_ratings                               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Session Management

### 2.1 Session típusa

- **Express session** (`express-session`) Redis-szel vagy memory store-ral (iskolai szinten OK).
- Session key: opaque token (CSPRNG).
- Cookie: `httpOnly`, `secure` (HTTPS), `sameSite=Strict`, 7 nap max-age.
- Szerver session store-ban: `{ userId, username, role, email, loginTime, lastActivityTime, ip, userAgent }`.

### 2.2 Életciklus

```
┌──────────────┐   login    ┌──────────────┐   activity   ┌──────────────┐
│    Signup    │─────────▶│  Session    │────────────▶│  Session     │
│  + validate  │ password OK│   CREATED  │   (auto)    │    ACTIVE    │
└──────────────┘           └──────────────┘             └──────────────┘
                                                               │
                                                               ▼
                          ┌──────────────┐   inactivity   ┌──────────────┐
                          │   Session    │────7 day──────▶│   EXPIRED    │
                          │   STORED     │                └──────────────┘
                          └──────────────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │  REVOKED     │ ◀── logout / force logout
                          └──────────────┘
```

### 2.3 Endpoints

| Endpoint | Mit csinál |
|---|---|
| `POST /api/auth/register` | Body: `{ username, email, password }`. Validáció, jelszó hash, user create, session start. Visszaigazolás emailem. |
| `POST /api/auth/login` | Body: `{ username/email, password }`. User lookup, jelszó verify, session create. |
| `POST /api/auth/logout` | Aktuális session destroy. |
| `POST /api/auth/refresh-session` | Session TTL extension (játék közben auto). |
| `GET /api/auth/session-status` | Bool + user info: érvényes-e a session. |
| `GET /api/auth/verify-email` | Query: `{ token }`. Email verifikáció token alapján. |

### 2.4 Session DB séma

```sql
CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    session_token VARCHAR(255) NOT NULL UNIQUE,     -- opaque, CSPRNG
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent VARCHAR(255) NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_sessions_active (user_id, revoked_at, expires_at),
    INDEX idx_user_sessions_token (session_token)
);
```

### 2.5 Force logout (admin)

Admin végpont: `POST /api/admin/users/{userId}/force-logout`.
- User összes session-je törlésre kerül.
- Aktív user-nek WebSocket üzenet: `user:session_revoked { reason: "... admin által" }`.
- User oldal automatikusan `logout` flow, redirect login page.

---

## 3. Profil adatkezelés

### 3.1 User profile tábla

```sql
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NULL,
    bio VARCHAR(500) NULL,
    profile_image_url VARCHAR(255) NULL,
    profile_image_review_status ENUM('pending','approved','rejected') DEFAULT 'pending',
    profile_image_rejection_reason VARCHAR(255) NULL,
    region VARCHAR(50) NULL,
    is_banned BOOLEAN DEFAULT FALSE,
    ban_reason VARCHAR(255) NULL,
    banned_until TIMESTAMP NULL,
    is_super_admin BOOLEAN DEFAULT FALSE,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token_hash CHAR(64) NULL,
    email_verification_token_expires TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL,
    INDEX idx_users_username (username),
    INDEX idx_users_email (email),
    INDEX idx_users_created (created_at)
);

CREATE TABLE IF NOT EXISTS user_stats (
    user_id INT PRIMARY KEY,
    games_played INT DEFAULT 0,
    games_won INT DEFAULT 0,
    games_lost INT DEFAULT 0,
    current_elo INT DEFAULT 1200,
    elo_peak INT DEFAULT 1200,
    total_playtime_seconds BIGINT DEFAULT 0,
    last_game_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### 3.2 Profil GET (`GET /api/players/{userId}`)

Megjelenítendő (public):
- `username`, `displayName`, `bio`, `profileImageUrl`
- `region`, `stats` (games_played, games_won, currentElo)
- `isOnline` (WebSocket alapján)

Titkos (only self + admin):
- `email`, `lastLoginAt`, `createdAt`, `emailVerified`

Redakció: `email` always `***`, `ip_address` soha.

### 3.3 Profil UPDATE (`POST /api/profile/update`)

Body:
- `displayName`, `bio`, `region` — user által szerkeszthető.
- `profileImage` — opcionális (multipart/form-data).

Validáció:
- `displayName`: max 100 char.
- `bio`: max 500 char.
- `profileImage`: max 5 MB, JPEG/PNG, 1024×1024px-ig resize.

Profilkép workflow:
1. Upload → temp tárolás.
2. Admin review → `pending_profile_images` tábla.
3. Admin approve → live `profile_image_url`, status `approved`.
4. Admin reject → `rejection_reason` set, user kapja `user:profile_image:rejected` notif.

---

## 4. Barátság & blokkolás

### 4.1 Relationships

```sql
CREATE TABLE IF NOT EXISTS friends (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id_a INT NOT NULL,
    user_id_b INT NOT NULL,
    status ENUM('pending','accepted','rejected') DEFAULT 'pending',
    requested_by INT NOT NULL,                  -- aki küldött request-et
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP NULL,
    rejected_at TIMESTAMP NULL,
    blocked_until TIMESTAMP NULL,              -- temp block
    UNIQUE KEY ux_friends_pair (user_id_a, user_id_b),
    FOREIGN KEY (user_id_a) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id_b) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_friends_status (status),
    INDEX idx_friends_user_a (user_id_a, status),
    INDEX idx_friends_user_b (user_id_b, status)
);

CREATE TABLE IF NOT EXISTS blocked_users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    blocker_user_id INT NOT NULL,
    blocked_user_id INT NOT NULL,
    reason VARCHAR(255) NULL,
    blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_blocked_pair (blocker_user_id, blocked_user_id),
    FOREIGN KEY (blocker_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_blocked_blocker (blocker_user_id)
);
```

### 4.2 Endpoints

| Endpoint | Mit csinál |
|---|---|
| `POST /api/friends/request` | Body: `{ targetUserId }`. Friend request, status='pending'. |
| `POST /api/friends/{requestId}/accept` | Accept pending request → status='accepted'. |
| `POST /api/friends/{requestId}/decline` | Decline request → status='rejected'. |
| `POST /api/friends/{friendshipId}/remove` | Accepted friendship remove. |
| `POST /api/friends/block` | Body: `{ targetUserId, reason }`. Block user. |
| `POST /api/friends/unblock` | Body: `{ targetUserId }`. Unblock. |
| `GET /api/friends/list` | My friends list (accepted + online status). |
| `GET /api/friends/blocked` | My blocked list. |
| `GET /api/friends/requests` | Pending requests (in + out). |

### 4.3 Blokkolás logika

- A blokkolja B-t → **B nem látja A-t** az online list, friend req list, profile list-en.
- A blokkolja B-t → **B-nek A üzenetei nem érkeznek** (silent discard).
- B-nek **A nincs a barát listján** (már nem látszik, ha block van).
- Blokk nem szimmetrikus: B továbbra is láthatja A-t, ha A nem blokkolja B-t.

---

## 5. Játék infrastruktúra

### 5.1 Game state

```sql
CREATE TABLE IF NOT EXISTS games (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    player_white_id INT NOT NULL,
    player_black_id INT NOT NULL,
    status ENUM('pending','active','finished','aborted','timeout') DEFAULT 'pending',
    winner_id INT NULL,
    draw BOOLEAN DEFAULT FALSE,
    start_time TIMESTAMP NULL,
    end_time TIMESTAMP NULL,
    duration_seconds INT NULL,
    elo_change_white INT NULL,
    elo_change_black INT NULL,
    FOREIGN KEY (player_white_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (player_black_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_games_players (player_white_id, player_black_id),
    INDEX idx_games_status (status),
    INDEX idx_games_end_time (end_time)
);

CREATE TABLE IF NOT EXISTS game_moves (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    game_id BIGINT NOT NULL,
    move_number INT NOT NULL,
    from_square VARCHAR(2) NOT NULL,
    to_square VARCHAR(2) NOT NULL,
    promotion_piece VARCHAR(1) NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_game_moves_game (game_id, move_number)
);

CREATE TABLE IF NOT EXISTS elo_ratings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    current_elo INT DEFAULT 1200,
    peak_elo INT DEFAULT 1200,
    games_played INT DEFAULT 0,
    rating_deviation DECIMAL(5,2) DEFAULT 350.0,
    volatility DECIMAL(5,4) DEFAULT 0.06,
    last_update TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### 5.2 Matchmaking flow

1. User `POST /api/games/matchmaking/join` → bekerül waiting queue-ba.
2. Szerver 2–5 mp-enként pairing check: 2 closest ELO user.
3. Match found → mindkettőnek `user:game_matched { opponentId, ... }` WS msg.
4. **Accept/decline window: 30 sec.** Ha decline → penalty ELO-ban vagy cooldown.
5. Both accept → `games` row create, status='active', WS room create `game:{gameId}`.

### 5.3 Live game events

| Event | Direction | Mikor |
|---|---|---|
| `game:move` | player → server | Lépés play |
| `game:move_confirmed` | server → game:room | Lépés valid, broadcast |
| `game:timer_tick` | server → game:room | 1 mp-enként (optional optimizáció: csak közel lejár) |
| `game:finished` | server → game:room | Mat, stalemate, időlimit |
| `game:elo_updated` | server → user:both | ELO delta |

### 5.4 ELO számítás

**Glicko-2 formula:**
- `newElo = oldElo + 32 * (result - expectedResult)`
- `result` = 1 (win), 0.5 (draw), 0 (loss)
- `expectedResult = 1 / (1 + 10^((opponentElo - myElo) / 400))`

Szinkron, játék után azonnal frissül.

---

## 6. Chat & üzenetek

### 6.1 Message tables

```sql
CREATE TABLE IF NOT EXISTS chat_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sender_user_id INT NOT NULL,
    message_type ENUM('dm','room','game') DEFAULT 'dm',
    receiver_user_id INT NULL,               -- dm-nél
    room_name VARCHAR(50) NULL,              -- room-nál
    game_id BIGINT NULL,                     -- game-nél
    content VARCHAR(2000) NOT NULL,
    deleted_at TIMESTAMP NULL,               -- soft delete (admin moderation)
    moderation_reason VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (receiver_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    INDEX idx_chat_sender_time (sender_user_id, created_at),
    INDEX idx_chat_receiver_time (receiver_user_id, created_at),
    INDEX idx_chat_room_time (room_name, created_at),
    INDEX idx_chat_game_time (game_id, created_at)
);

CREATE TABLE IF NOT EXISTS chat_message_reads (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id BIGINT NOT NULL,
    reader_user_id INT NOT NULL,
    read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY ux_message_reader (message_id, reader_user_id),
    FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (reader_user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_chat_reads_reader (reader_user_id, read_at)
);
```

### 6.2 DM flow

`POST /api/chat/send-dm` Body: `{ recipientId, content }`.
- Validáció: not blocked, not spam (rate limit), content length.
- Szerkesztés: `chat_messages` row.
- WS emit: receiver-nek `user:dm_received { from, content, ... }`.
- Receiver offline → `user_notifications` fallback.

### 6.3 Room chat

Room: `general`, `off-topic`, `tournaments` stb.
`POST /api/chat/send-room` Body: `{ roomName, content }`.
- Validáció: room exists, user not muted, rate limit.
- WS broadcast: `room:{name}:message_created { user, content, ... }`.
- History: `GET /api/chat/room/{name}/messages?limit=50&before=<timestamp}`.

### 6.4 Read tracking

`POST /api/chat/mark-read` Body: `{ messageIds: [...] }`.
- DM-re manual user action.
- Room-ra auto: kliens 1 sec-nél később.

---

## 7. Notifikációk

### 7.1 Notification types

| Típus | Trigger | Persistence |
|---|---|---|
| `friend_request_received` | User-nek friend req | DB: 1 hét |
| `friend_request_accepted` | Requestee accept | WS: real-time |
| `game_matched` | Matchmaking success | WS: 30 sec acceptance window |
| `game_finished` | Játék vége | WS + DB: 30 nap |
| `elo_changed` | ELO update | WS: real-time |
| `profile_image_rejected` | Admin reject | DB: permanent |
| `user_banned` | Admin action | WS + DB: permanent |
| `message_received_offline` | Offline DM | DB: max 500 per user |
| `broadcast_admin` | Admin szétküld | WS: real-time |

### 7.2 `user_notifications` tábla

```sql
CREATE TABLE IF NOT EXISTS user_notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body VARCHAR(1000) NOT NULL,
    data JSON NULL,                          -- trigger metadata
    read_at TIMESTAMP NULL,
    dismissed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notif_user_read (user_id, read_at),
    INDEX idx_notif_user_created (user_id, created_at)
);
```

### 7.3 Notification endpoints

| Endpoint | Mit csinál |
|---|---|
| `GET /api/notifications` | List (unread + last 30 day). Paging. |
| `POST /api/notifications/{id}/read` | Mark read. |
| `POST /api/notifications/{id}/dismiss` | Mark dismissed. |
| `POST /api/notifications/read-all` | Mark all read. |

### 7.4 Rate limit

- DM: **10 msg / 10 sec** (user).
- Room: **25 msg / 10 sec** (user).
- Notif emit: best-effort (DoS elleni védelem: max 1000/sec globál).

---

## 8. Real-time (WebSocket) terv

### 8.1 Namespace + szobák

- Namespace: `/` (default) — user-level.
- Szobák:
  - `user:{id}` — private (1:1 messaging, personal events).
  - `game:{gameId}` — PvP live.
  - `room:{name}` — public chat.
  - `matchmaking` — queue folks.

### 8.2 Eseménytípusok

Nevezéktan: `user:*`, `game:*`, `notification:*`.

| Esemény | Irány | Mikor |
|---|---|---|
| `user:connect` | client → server | Csatlakozás handshake után |
| `user:online` | server → (broadcast) | User online status |
| `user:offline` | server → (broadcast) | User offline status |
| `user:dm_received` | server → user:{id} | DM beérkezett |
| `user:friend_request` | server → user:{id} | Friend req |
| `user:friend_accepted` | server → user:{id} | Friend req accepted |
| `user:game_matched` | server → user:{id} | Matchmaking success (30sec window) |
| `user:session_revoked` | server → user:{id} | Force logout (admin) |
| `user:profile_image_rejected` | server → user:{id} | Profilkép elutasítva |
| `user:notification` | server → user:{id} | Broadcast notif |
| `user:elo_changed` | server → user:{id} | ELO delta |
| `game:move_confirmed` | server → game:{id} | Lépés valid |
| `game:timer_tick` | server → game:{id} | 1 mp (optional) |
| `game:finished` | server → game:{id} | Játék vége |
| `room:message_created` | server → room:{name} | Chat msg |
| `room:user_joined` | server → room:{name} | User join |
| `room:user_left` | server → room:{name} | User leave |

### 8.3 Payload minták

**`user:dm_received`**
```json
{
  "messageId": 1234,
  "from": { "id": 5, "username": "alice" },
  "content": "Szia! Játszunk?",
  "timestamp": "2026-04-27T14:30:00.000Z"
}
```

**`user:game_matched`**
```json
{
  "gameId": 98765,
  "opponent": { "id": 8, "username": "bob", "elo": 1450 },
  "timePerMove": 600,
  "acceptDeadline": "2026-04-27T14:31:30.000Z"
}
```

**`game:move_confirmed`**
```json
{
  "gameId": 98765,
  "moveNumber": 15,
  "from": "e2",
  "to": "e4",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "timestamp": "2026-04-27T14:35:12.000Z"
}
```

### 8.4 Heartbeat & reconnect

- Kliens 30 mp-enként ping; szerver pong.
- Ha 60 mp nincs válasz → client reconnect.
- Reconnect után: szerver auto-rejoin previous rooms (`user:{id}`, `game:*`), ha session valid.

---

## 9. Adatbázis séma

> Az összes táblát a [3. szakaszban](#3-profil-adatkezelés), [4.](#4-barátság--blokkolás), [5.](#5-játék-infrastruktúra), [6.](#6-chat--üzenetek), [7.](#7-notifikációk) definiáltuk.

Indexelési stratégia:
- **Temporal queries**: `created_at`, `updated_at`, `last_activity_at` indexek.
- **Foreign keys**: `user_id`, `game_id` composite.
- **Search**: `username`, `email` (unique).
- **Status**: `games.status`, `friends.status` enum index.

---

## 10. Biztonsági terv – Top 12 kockázat

| # | Kockázat | Mitigation |
|---|---|---|
| 1 | XSS (chat content) | DOMPurify client-side, HTML escape szerver-side. |
| 2 | Session hijack | httpOnly cookie, secure flag, sameSite=Strict. |
| 3 | CSRF | SameSite cookie, CSRF token opcionális POST-okra. |
| 4 | Rate limit bypass | Redis-backed distributed counter; escalation admin alert-re. |
| 5 | DM spam | Per-user rate limit 10/10sec; sender block → receive block. |
| 6 | Friend req spam | Rate limit + bot detection (pattern analysis). |
| 7 | Profile image malware | MIME check, virus scan (optional), file size limit. |
| 8 | ELO game throw | Timeout detection; inaktivitás = loss. |
| 9 | DDoS (WebSocket) | Rate limit per socket, connection cap per user (2–5). |
| 10 | Unauthorized game join | Join validation: player-e a party, auth token check. |
| 11 | Chat deletion bypass | Soft delete only, admin audit trail. |
| 12 | IP spoofing | Reverse proxy `X-Forwarded-For` trust (konfig alapján). |

---

## 11. API és WS ellenőrzési pontok

### 11.1 API response szerkezet

```json
{
  "success": true,
  "data": { },
  "error": null,
  "requestId": "req_..." 
}
```

Hibák:
```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Session lejárt."
  },
  "requestId": "req_..."
}
```

### 11.2 HTTP status codes

- `200` — OK
- `201` — Created
- `400` — Bad Request (validáció, schema)
- `401` — Unauthorized (session hiányzik/lejárt)
- `403` — Forbidden (permission denied, blocked)
- `404` — Not Found
- `429` — Too Many Requests (rate limit)
- `500` — Internal Server Error

### 11.3 WebSocket error handling

Kliens reconnect stratégia:
- Hiba után 1 sec delay, majd exponential backoff (max 30 sec).
- Max 5 reconnect attempt; utána user notification + redirect login.

---

## 12. Megvalósítási fázisok (F1–F10)

| Fázis | Fő cél | Komponensek |
|---|---|---|
| **F1** | Auth + Session | `POST /login`, `/register`, `/logout`, session middleware. |
| **F2** | Profil read/view | `GET /profile/{id}`, profil view UI. |
| **F3** | Profil update | `POST /profile/update` (displayName, bio), redaction. |
| **F4** | Profile image upload | `POST /profile/image`, admin review flow, rejection UI. |
| **F5** | Friends (CRUD) | `POST /friends/request`, `/accept`, `/decline`, list. |
| **F6** | Block system | `POST /friends/block`, `/unblock`, filtering. |
| **F7** | Matchmaking queue | `POST /games/matchmaking/join`, pairing algorithm. |
| **F8** | Live PvP game | WS `game:` events, move validation, timer. |
| **F9** | ELO calculation | Glicko-2, rank leaderboard. |
| **F10** | Chat + notif system | DM, room chat, read tracking, notification CRUD. |

**Egyéb horizontális:**
- Rate limiter: F1 során.
- Audit logging: F2 során (user_logs insert).
- Admin integration: F1–F10 után (audit read only, ban/unban command).

---

## 13. Tesztelési terv

### 13.1 Unit tests

- **Auth:** register, login, logout, session refresh.
- **Profile:** update, validation, redaction (email hidden).
- **Friends:** request, accept, decline, block logic.
- **ELO:** Glicko-2 formula, edge cases (draw, rating deviation).
- **Chat:** spam detection, rate limit.

### 13.2 Integration tests

- **API flow:** register → login → profile update → friend request → game start.
- **WebSocket:** connect, emit, receive, reconnect.
- **Blocking:** A blocks B → B DM-je nem érkezik.
- **Admin force logout:** user session revoked, WS disconnect.

### 13.3 E2E tests (frontend kész után)

- **Full game:** matchmaking, accept, play, finish, ELO update.
- **DM flow:** send, receive, mark read, notification.
- **Profile image:** upload, admin reject, user notif, try reupload.

---

## 14. Jövőbeli funkciók

- **Spectator mode** — observer game, live streaming UI.
- **Tournaments** — bracket, leaderboard, prize pool.
- **Mobile app** — React Native / Flutter.
- **Chat moderation** — keyword filter, user mute.
- **Replay system** — game recording, playback.
- **Achievements & badges** — milestone tracking.
- **Clan system** — group, team play.
- **Season rankings** — monthly reset, seasonal leaderboard.

---

## 📌 Módosítás historie

| Dátum | Verzió | Szerző | Módosítás |
|---|---|---|---|
| 2026-04-27 | 1.0 | System | Kezdeti terv. |

