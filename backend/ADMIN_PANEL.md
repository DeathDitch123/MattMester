# 🛡️ MattMester – Admin Panel Architektúra & Tervdokumentum

> **Cél:** ez a dokumentum az admin panel teljes terv-rétegét rögzíti — token gazdálkodás, audit log, real-time, biztonsági kontrollok, fázis-bontás. Forrás-igazság a fokozatos implementációhoz.
>
> **Státusz:** terv. F1–F10 fázisok kódolása ezután indul.
>
> **Készült:** 2026-04-26 — első iteráció.

---

## 📑 Tartalomjegyzék

1. [Vezetői összefoglaló](#-vezetői-összefoglaló)
2. [Eldöntött tervezési pontok](#-eldöntött-tervezési-pontok)
3. [Célarchitektúra](#1-célarchitektúra)
4. [Token gazdálkodás (részletes)](#2-token-gazdálkodás)
5. [Jogosultsági modell](#3-jogosultsági-modell)
6. [Real-time (WebSocket) terv](#4-real-time-websocket-terv)
7. [Audit log terv](#5-audit-log-terv)
8. [Adatbázis séma változások](#6-adatbázis-séma-változások)
9. [Biztonsági terv – Top 15 kockázat](#7-biztonsági-terv)
10. [API ellenőrzési pontok](#8-api-és-ws-ellenőrzési-pontok)
11. [Megvalósítási fázisok](#9-megvalósítási-fázisok-f1f10)
12. [Tesztelési terv](#10-tesztelési-terv)
13. [Most vs később](#11-most-vs-később)
14. [Eltávolítva: `metric_*` mezők](#12-eltávolítva-user_logsmetric_-mezők)
15. [Jövőbeli funkciók](#13-jövőbeli-funkciók)

---

## 🧾 Vezetői összefoglaló

A meglévő rendszer szilárd alapot ad (rate limiter factory, notifications + reads séma, socket hub). Az admin-panelhez 4 hiányzó réteg kerül felépítésre:

1. **Step-up admin token** a session FÖLÖTT (rövid élettartam, csak admin műveletekhez).
2. **Külön `admin_audit_log` tábla** before/after JSON diff-fel — a `user_logs` marad user-szintű aktivitásra.
3. **Dedikált socket namespace `/admin`** + admin szobák a real-time fan-outhoz.
4. **Jogosulatlan-próbálkozás láncolat:** 403 + audit + admin-broadcast riasztás + adaptív rate limit emelés.

A meglévő `metric_*` mezőket kivesszük a `user_logs`-ból (használatlanok). A frontend nélkül is tesztelhető API+Socket szerződéseket szállítunk fázisonként.

---

## ✅ Eldöntött tervezési pontok

| # | Kérdés | Döntés |
|---|---|---|
| 1 | Auth-stratégia | **(C) Step-up admin token a session FÖLÖTT.** Session megmarad, admin műveletekhez kell egy 15 perces, rotálódó admin token. |
| 2 | `user_logs.metric_*` mezők | **Eltávolítva.** Holt kód volt, az új admin auditra nincs szükség numerikus metrikára (lásd §12). |
| 3 | Super-admin seed | A meglévő `admin` seed user kap `is_super_admin = TRUE`-t. Ő az egyetlen. |
| 4 | Indoklás min. hossz | **10 char** normál, **30 char** kritikus művelet. |
| 5 | Admin token TTL | **15 perc sliding** (utolsó használat óta). |
| 6 | Retention 18 hónap | **Hard delete.** Iskolai projekt, nincs jogi archiválási kötelezettség. |
| 7 | Audit írás mód | **Szinkron** (egyszerűbb, iskolai szinten elég). DoS-érzékenység jelölve issues.md-ben. |
| 8 | Live game-beavatkozás | **NEM.** Nézői mód később jöhet (§13). |
| 9 | Audit before/after részletesség | **Csak változott mezők** normál művelet. **Teljes record snapshot** kritikus művelet (`severity='critical'`). |
| 10 | Audit soft-delete vs append-only | **Append-only.** Csak a retention job törölhet. Nincs UI-os "delete audit row" sehol. |
| 11 | Admin broadcast notif. | Bármely admin küldheti (nincs super-only korlát). |
| 12 | Session revoke (force logout) | **IGEN.** Session-store memória; clustering nélkül egyetlen process. |
| 13 | `target_id` típusa | `target_id BIGINT NULL` **+** `target_key VARCHAR(64) NULL` — vegyes hivatkozási képesség. |
| 14 | Profilkép review reason | **Csak reject-nél kötelező.** Approve-nál opcionális. |
| 15 | CSV export users audit | Audit-olt művelet, `info` severity, reason **opcionális** (nem mutáló). |
| 16 | Stats tick tartalma | Bő — minden, ami később hasznos lehet (online userek, pending image queue, 24h audit/alert count, friss ban-ok stb.). |

---

## 1. Célarchitektúra

```
┌──────────────────────────────────────────────────────────────────────┐
│  Kliens (admin panel UI – később)                                    │
└──────────────────────────────────────────────────────────────────────┘
        │ HTTP: Authorization: Bearer <admin_token>     │ WS: /admin
        ▼                                               ▼
┌─────────────────────┐                ┌────────────────────────────────┐
│  Admin API réteg    │                │  Admin socket namespace        │
│  /api/admin/*       │                │  io.of('/admin')               │
│                     │                │                                │
│  middleware lánc:   │                │  middleware:                   │
│   1. parseAdminToken│                │   1. session+adminToken verify │
│   2. requireAdmin   │                │   2. requireAdmin              │
│   3. requireSuper?  │                │   3. join 'admin:room'         │
│   4. rateLimit      │                │                                │
│   5. requireReason  │                │                                │
│   6. auditWrap      │                │                                │
└─────────────────────┘                └────────────────────────────────┘
        │                                               │
        ▼                                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  AuditLogService                                                     │
│   - record(adminId, action, reason, before, after, ip, ua, requestId)│
│   - emit 'admin:audit:created' to 'admin:room'                       │
└──────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  AlertingService                                                     │
│   - onUnauthorizedAttempt(ip, userId?, endpoint)                     │
│   - emit 'admin:alert:*' (warning/critical) to 'admin:room'          │
│   - escalateRateLimit(key, multiplier=5, ttl=15m)                    │
└──────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  MySQL: admin_audit_log, admin_alert_log, admin_tokens,              │
│         admin_rate_escalations, users(.is_super_admin)               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Token gazdálkodás

> **Ez a szekció a token-élettartam minden részletét fixálja.**

### 2.1 Token típusa

- **Opaque token** (NEM JWT): 32 byte CSPRNG (`crypto.randomBytes(32)`).
- Kliensnek hex/base64url formában kerül vissza (kb. 43–64 karakter).
- Szerveroldalon **csak a SHA-256 hash van eltárolva** (`token_hash CHAR(64)`).
- Plain token sosem kerül DB-be vagy logba.

### 2.2 Életciklus

```
┌──────────┐    elevate     ┌──────────┐    request     ┌──────────┐
│  Login   │──────────────▶│  Token   │──────────────▶│  Token   │
│ (session)│  +password OK  │  ISSUED  │  (sliding)    │  USED    │
└──────────┘                └──────────┘                └──────────┘
                                  │                          │
                                  ▼                          ▼
                            ┌──────────┐    inactivity  ┌──────────┐
                            │  STORED  │───15 min──────▶│ EXPIRED  │
                            │  in DB   │                └──────────┘
                            └──────────┘
                                  │
                                  ▼
                            ┌──────────┐
                            │ REVOKED  │ ◀── logout / explicit revoke
                            └──────────┘
```

### 2.3 Endpoints

| Endpoint | Mit csinál |
|---|---|
| `POST /api/admin/auth/elevate` | Body: `{ password }`. Session-ből megnézi user-t, jelszó verify, token kiállít, vissza: `{ token, expiresAt }`. |
| `POST /api/admin/auth/refresh` | Header: `Authorization: Bearer <token>`. Ha még él, `expires_at`-et `+15min`-re tolja. |
| `POST /api/admin/auth/revoke` | Header-ben token; `revoked_at = NOW()`. |
| `GET /api/admin/auth/status` | Bool: érvényes-e a token (UI poll-hoz). |

### 2.4 Token DB séma

```sql
CREATE TABLE IF NOT EXISTS admin_tokens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,        -- SHA-256 hex
    issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    issued_ip VARCHAR(45) NOT NULL,
    issued_user_agent VARCHAR(255) NULL,
    UNIQUE KEY ux_admin_tokens_hash (token_hash),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_admin_tokens_user_active (user_id, revoked_at, expires_at)
);
```

### 2.5 `parseAdminToken` middleware (javasolt minta)

```javascript
// backend/api/admin/middleware/parseAdminToken.js
const crypto = require('crypto');
const sql = require('../../../sql/sql_funtions.js');
const { logAdminAlert } = require('../alertingService.js');

async function parseAdminToken(request, response, next) {
    let statusCode = 200;
    let errorBody = null;

    try {
        const header = String(request.headers.authorization || '').trim();
        const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{40,})$/);
        const sessionUserId = Number(request.session?.userId) || 0;
        const sessionRole = request.session?.role || null;

        if (!sessionUserId || sessionRole !== 'admin') {
            statusCode = 401;
            errorBody = { success: false, message: 'Admin session szükséges.' };
        } else if (!match) {
            statusCode = 401;
            errorBody = { success: false, message: 'Hiányzó vagy érvénytelen admin token.' };
        } else {
            const tokenHash = crypto.createHash('sha256').update(match[1]).digest('hex');
            const tokenRow = await sql.findActiveAdminToken(tokenHash, sessionUserId);
            if (!tokenRow) {
                statusCode = 401;
                errorBody = { success: false, message: 'Admin token lejárt vagy nem érvényes.' };
                await logAdminAlert(request, {
                    kind: 'token_invalid',
                    userId: sessionUserId,
                    endpoint: `${request.method} ${request.originalUrl}`
                });
            } else {
                request.adminAuth = { tokenId: tokenRow.id, userId: sessionUserId };
                await sql.touchAdminToken(tokenRow.id);
            }
        }
    } catch (error) {
        console.error('parseAdminToken hiba:', error.message);
        statusCode = 500;
        errorBody = { success: false, message: 'Hiba az admin token ellenőrzése során.' };
    }

    if (errorBody) {
        response.status(statusCode).json(errorBody);
    } else {
        next();
    }
}

module.exports = { parseAdminToken };
```

> Megfelel a kötelező szabálynak: 1 explicit return útvonal funkciónként (a fő logika változó-vezérelt), try-catch a DB műveletek köré, hibakezelés naplóz + egységes választ ad.

### 2.6 Token kliens-oldali tárolás

- **Memóriában** (Redux/store/Pinia/whatever — egy modul-szintű `let` is jó iskolai szinten).
- **Soha nem `localStorage`-ben** (XSS lopás kockázat).
- A token + `expiresAt` érték együtt jár; UI 1 perccel lejárat előtt automatikusan `refresh`-eli.
- Lap újratöltés → új `elevate` flow (jelszó újrakérés). Ez tudatos tradeoff: nincs persistent admin élmény, viszont nincs token replay XSS-en át.

### 2.7 Token rotáció (opcionális szigorítás)

A 15 perc sliding mellett **kritikus művelet után automatikusan új tokent állítunk ki** és invalidáljuk a régit. UI átveszi az új tokent a válasz body-jából (`{ ...result, newAdminToken: '...' }`). Ez lecsökkenti a token érvényes ablakát kritikus művelet után.

---

## 3. Jogosultsági modell

### 3.1 Permission lista (kódolt konstans)

```javascript
// backend/api/admin/permissions.js
const ADMIN_PERMISSIONS = {
    USERS_VIEW: 'users.view',
    USERS_BAN: 'users.ban',                          // ⚠ kritikus
    USERS_UNBAN: 'users.unban',
    USERS_DELETE: 'users.delete',                    // ⚠ kritikus
    USERS_EDIT_PROFILE: 'users.edit',
    USERS_FORCE_LOGOUT: 'users.force_logout',
    USERS_RESET_PASSWORD: 'users.reset_password',
    USERS_EXPORT: 'users.export',                    // CSV

    PROFILE_IMAGE_REVIEW: 'profile_image.review',

    CHAT_VIEW_ANY: 'chat.view_any',
    CHAT_DELETE_MESSAGE: 'chat.delete',              // ⚠ kritikus

    NOTIFICATIONS_SEND: 'notifications.send',
    NOTIFICATIONS_BROADCAST: 'notifications.broadcast', // ⚠ kritikus

    AUDIT_VIEW: 'audit.view',
    AUDIT_EXPORT: 'audit.export',

    // Csak super-admin
    ADMIN_GRANT: 'admin.grant',                      // 🔒 super-only
    ADMIN_REVOKE: 'admin.revoke',                    // 🔒 super-only
    ADMIN_LIST: 'admin.list'                         // 🔒 super-only
};

const SUPER_ONLY = new Set([
    ADMIN_PERMISSIONS.ADMIN_GRANT,
    ADMIN_PERMISSIONS.ADMIN_REVOKE,
    ADMIN_PERMISSIONS.ADMIN_LIST
]);

const CRITICAL_ACTIONS = new Set([
    ADMIN_PERMISSIONS.USERS_DELETE,
    ADMIN_PERMISSIONS.USERS_BAN,
    ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE,
    ADMIN_PERMISSIONS.NOTIFICATIONS_BROADCAST,
    ADMIN_PERMISSIONS.ADMIN_GRANT,
    ADMIN_PERMISSIONS.ADMIN_REVOKE
]);
```

### 3.2 Kritikus művelet — extra szabályok

- Indoklás **min. 30 char** (normál: 10).
- 2. tényező: `confirmPassword` body-mező, bcrypt match.
- Audit `severity = 'critical'`, **teljes record snapshot** before/after-be (nem csak diff).
- Token **rotáció** sikeres művelet után (lásd 2.7).

### 3.3 Csak super-admin

- `POST /api/admin/admins/grant` — `{ targetUserId, reason }` → user role admin + opcionálisan `is_super_admin`.
- `POST /api/admin/admins/revoke` — visszaveszi az admin szerepet. **Saját maga `is_super_admin`-jét NEM tudja levenni** (utolsó super lock).
- `GET /api/admin/admins` — admin user lista.

---

## 4. Real-time (WebSocket) terv

### 4.1 Namespace + szobák

- Namespace: `/admin` (külön az alap `/`-tól).
- Szoba: `admin:room` — minden online admin csatlakozik.
- Per-admin: `admin:user:<id>` — célzott (pl. session-revoke).

### 4.2 Eseménytípusok

Nevezéktan: `admin:<domain>:<action>`.

| Esemény | Irány | Mikor |
|---|---|---|
| `admin:audit:created` | server → admin:room | Minden admin művelet után |
| `admin:alert:unauthorized` | server → admin:room | Jogosulatlan próbálkozás |
| `admin:alert:rate_escalated` | server → admin:room | Rate limit szigorítva |
| `admin:alert:token_invalid` | server → admin:room | Hibás token |
| `admin:stats:tick` | server → admin:room | 5 mp-enként összesített statok |
| `admin:user:updated` | server → admin:room | User adat változott |
| `admin:user:banned` | server → admin:room + user:<id> | Ban történt |
| `admin:user:unbanned` | server → admin:room | Unban |
| `admin:profile_image:queue_changed` | server → admin:room | Új pending kép, vagy review |
| `admin:notification:sent` | server → admin:room | Admin notifikációt küldött |
| `admin:session:revoked` | server → user:<id> | Force logout |
| `admin:presence:hello` | client → server | Csatlakozás handshake után |
| `admin:replay:request` | client → server | Reconnect után, `{ sinceEventId }` |
| `admin:replay:batch` | server → client | Hiányzó események, batch-elve |

### 4.3 Payload minták

**`admin:audit:created`**
```json
{
  "eventId": 12345,
  "occurredAt": "2026-04-26T10:15:32.121Z",
  "actor": { "id": 1, "username": "admin", "ip": "127.0.0.1" },
  "action": "users.ban",
  "severity": "critical",
  "target": { "type": "user", "id": 47, "username": "spammer42" },
  "reason": "Reklámspam a játék-chat csatornán; 3. figyelmeztetés.",
  "diff": {
    "before": { "is_banned": false, "ban_reason": null, "banned_until": null },
    "after":  { "is_banned": true, "ban_reason": "spam", "banned_until": "2026-05-26T10:15:32.000Z" }
  },
  "requestId": "req_8f2a..."
}
```

**`admin:alert:unauthorized`**
```json
{
  "alertId": 882,
  "occurredAt": "2026-04-26T10:18:11.000Z",
  "ip": "203.0.113.55",
  "userId": null,
  "endpoint": "GET /api/admin/users",
  "reason": "no_session",
  "rateLimitState": { "escalated": true, "multiplier": 5, "ttlSec": 900 }
}
```

**`admin:stats:tick`** — minden, ami később hasznos lehet:
```json
{
  "tickId": 4421,
  "occurredAt": "2026-04-26T10:20:00.000Z",
  "online": {
    "totalUsers": 12,
    "totalAdmins": 1,
    "inGame": 4,
    "inMatchmaking": 2
  },
  "pending": {
    "profileImages": 3,
    "friendRequests": 17
  },
  "last24h": {
    "logins": 38,
    "registrations": 5,
    "auditEntries": 24,
    "criticalAuditEntries": 2,
    "alerts": 7,
    "newBans": 1
  },
  "rateLimit": {
    "activeEscalations": 0
  }
}
```

### 4.4 Reconnect & replay

- Minden szerveroldali admin esemény kap monoton növekvő `eventId`-t (audit/alert tábla auto-increment ID-ja).
- Kliens **memóriában** tartja a legutolsó látott `eventId`-t (lap-újratöltéssel reset, mert új `elevate` is van akkor).
- Reconnect után: `client → server` `admin:replay:request { sinceEventId }`.
- Szerver válasz: `admin:replay:batch { events: [...], hasMore: bool, nextCursor }` — max **200 / batch**.
- **Limit:** 24 óránál régebbi replayt nem engedünk → kliens UI "frissíts manuálisan" üzenetet kap.
- **Per-kapcsolat batch cap:** max 5 batch / kapcsolat / 24h, hogy ne lehessen replay-floodingot okozni.

### 4.5 Kliens oldali konzisztencia

- **Append-only event log** kliensoldalon, dedup `eventId` alapján.
- Stat számlálók (online user, pending image queue) szerverről jönnek 5 mp-enként → kliens nem inkrementál optimisztikusan.
- Admin művelet után a **siker visszaigazolás csak az audit event beérkezésével** számít befejezettnek — kettős source of truth: HTTP 200 + WS `admin:audit:created`.
- Heartbeat: kliens 25 mp-enként ping; ha 60 mp nincs válasz → reconnect + replay.

---

## 5. Audit log terv

### 5.1 `admin_audit_log` tábla

```sql
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_user_id INT NOT NULL,
    actor_username VARCHAR(50) NOT NULL,         -- denormalizált
    action VARCHAR(64) NOT NULL,                 -- pl. 'users.ban'
    severity ENUM('info','warning','critical') DEFAULT 'info',
    target_type VARCHAR(32) NULL,                -- 'user','chat_message','profile_image',...
    target_id BIGINT NULL,                       -- numerikus PK
    target_key VARCHAR(64) NULL,                 -- nem-numerikus kulcs (pl. config kulcs)
    target_label VARCHAR(120) NULL,              -- olvasható címke
    reason VARCHAR(1000) NOT NULL,               -- KÖTELEZŐ indoklás
    before_state JSON NULL,                      -- diff before (vagy teljes snapshot critical-nél)
    after_state JSON NULL,
    success BOOLEAN NOT NULL,
    error_code VARCHAR(64) NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent VARCHAR(255) NULL,
    request_id CHAR(26) NOT NULL,                -- ULID
    occurred_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_aal_occurred (occurred_at),
    INDEX idx_aal_actor_time (actor_user_id, occurred_at),
    INDEX idx_aal_action_time (action, occurred_at),
    INDEX idx_aal_target (target_type, target_id, occurred_at),
    INDEX idx_aal_target_key (target_type, target_key, occurred_at),
    INDEX idx_aal_severity_time (severity, occurred_at),
    INDEX idx_aal_request (request_id)
);
```

### 5.2 `admin_alert_log` tábla

```sql
CREATE TABLE IF NOT EXISTS admin_alert_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    kind ENUM('unauthorized','rate_escalated','token_invalid','suspicious_pattern') NOT NULL,
    severity ENUM('warning','critical') DEFAULT 'warning',
    user_id INT NULL,
    ip_address VARCHAR(45) NOT NULL,
    endpoint VARCHAR(255) NULL,
    user_agent VARCHAR(255) NULL,
    detail JSON NULL,                            -- attempt-szám, rate-limit állapot
    occurred_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_aalert_time (occurred_at),
    INDEX idx_aalert_kind_time (kind, occurred_at),
    INDEX idx_aalert_ip_time (ip_address, occurred_at)
);
```

### 5.3 `admin_rate_escalations` tábla

```sql
CREATE TABLE IF NOT EXISTS admin_rate_escalations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    scope ENUM('ip','user') NOT NULL,
    scope_value VARCHAR(64) NOT NULL,
    multiplier DECIMAL(4,2) NOT NULL DEFAULT 5.00,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    reason VARCHAR(255) NULL,
    UNIQUE KEY ux_rate_esc_scope (scope, scope_value),
    INDEX idx_rate_esc_expires (expires_at)
);
```

### 5.4 Before/after részletesség

- **Normál művelet** (`severity IN ('info','warning')`): csak a változott mezők
  ```json
  { "before": { "is_banned": false }, "after": { "is_banned": true } }
  ```
- **Kritikus művelet** (`severity='critical'`): teljes record snapshot
  ```json
  { "before": { "id": 47, "username": "...", "is_banned": false, ... },
    "after":  { "id": 47, "username": "...", "is_banned": true, ... } }
  ```
- **Redaction allowlist** — sose kerül be: `password_hash`, `email_verification_token_hash`, `email_verification_token_expires`, `reset_password_token`, `reset_token_expires`.

### 5.5 Megőrzés és archiválás

- **18 hónap, hard delete.** Iskolai projekt → JSONL export nincs (issue lista §13-ban jelölve, ha később kell).
- **Napi 1× retention job:** `initDatabase` után `setInterval(retentionJob, 24h)` indítás. Első futás induláskor (cold start friss DB-n no-op).
- A retention job futása maga is audit entry: `action='audit.retention.run'`, severity='info', metadata-ban hány sort törölt.

### 5.6 Kereshetőség

Lekérdezhető tengelyek (mindegyikre van index):
- `actor_user_id` + időtartomány
- `action` + időtartomány
- `target_type + target_id` (vagy `target_key`)
- `severity = 'critical'` + időtartomány
- `request_id` (egy konkrét kérelem nyomon követése)

JSON szűrés (`JSON_EXTRACT(after_state, '$.is_banned')`) támogatott, de **nem indexelt** — kis volumenig elég, később generated column + index.

---

## 6. Adatbázis séma változások

> **DB üres**, nincs migráció. A változások a `backend/sql/create_database.sql` és `backend/sql/database.js` fájlokban lesznek átvezetve az F1 fázisban.

### 6.1 `users` tábla — új oszlop

```sql
ALTER TABLE users ADD COLUMN is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
-- A meglévő admin seed: UPDATE users SET is_super_admin = TRUE WHERE username = 'admin';
```

A `create_database.sql` admin INSERT-jébe `is_super_admin` mezőt is hozzáadunk.

### 6.2 `user_logs` tábla — törlés + újraépítés

`metric_key`, `metric_value`, `metric_delta` oszlopok és az `idx_user_logs_user_metric_time` index **eltávolítva**. Részletek: §12.

### 6.3 Új táblák

- `admin_tokens` (§2.4)
- `admin_audit_log` (§5.1)
- `admin_alert_log` (§5.2)
- `admin_rate_escalations` (§5.3)

### 6.4 Seed update

```sql
INSERT INTO users (..., is_super_admin) VALUES ('admin', ..., TRUE)
    ON DUPLICATE KEY UPDATE is_super_admin = TRUE;
```

---

## 7. Biztonsági terv

### 7.1 Top 15 kockázat

| # | Kockázat | Védelem |
|---|---|---|
| 1 | Admin token lopás (XSS) | Token sosem `localStorage`-ben → memória + `Authorization` header. CSP header bevezetése (helmet, lásd issues.md #6). |
| 2 | Token replay más eszközről | Token `last_used_at` minden használatkor frissül; opcionális IP-binding (config flag). |
| 3 | CSRF admin endpointokon | `Authorization: Bearer` header kötelező → cookie-egyedüli kérés tiltva. |
| 4 | Brute-force admin elevate | Külön `adminElevateLimiter` (5 / 15 perc, IP+user). Sikertelenség után audit + alert. |
| 5 | Privilege escalation user→admin | Csak super-admin írhat `role`/`is_super_admin`-t; minden ilyen művelet `severity='critical'`. |
| 6 | Lejárt session-höz tartozó token | Logout → `revokeAllTokensForUser(userId)`. |
| 7 | Audit log manipuláció | `actor_user_id FK ON DELETE RESTRICT`; nincs törlő endpoint, csak retention job. Append-only DB user később (issues.md #X). |
| 8 | Indoklás nélküli művelet | `requireReasonOnMutate` middleware blokkol `400`-zal. |
| 9 | TOCTOU race (pl. dupla ban) | DB tranzakcióban `SELECT ... FOR UPDATE`; idempotencia: `request_id` UNIQUE kulcs az auditban. |
| 10 | Time-based info leak | Egységes `403` "Nincs jogosultságod" minden "nem létezik / nincs jog" esetre; állandó-időhöz közelítő bcrypt minden elevate-en (még ha user nincs is). |
| 11 | WS namespace bypass | Admin események CSAK a `/admin` namespace-en, és `requireAdmin` socket middleware-rel. |
| 12 | Replay storm reconnect után | Batch cap (200), 24h ablak, max 5 batch / kapcsolat. |
| 13 | DoS audit írásokon | Szinkron írás iskolai szinten elég. Async queue → issues.md "ha van idő". |
| 14 | SQL injection | Minden user input prepared statement. JSON path szigorú whitelist. |
| 15 | PII szivárogtatás logokba | Redaction allowlist a `before_state`/`after_state`-hez (5.4). |

### 7.2 Egyéb védelmi kontrollok

- **Last-super-admin lock:** ha egy user az utolsó `is_super_admin=TRUE`, sem `revoke`, sem self-demote nem engedett.
- **Session+token összerendelés:** a token-row `user_id`-je MUST egyezni `session.userId`-vel. Ha eltér → 401 + `token_invalid` alert.
- **Reason hossz felső limit:** 1000 char (DB szint), 500 char a JSON payloadban (notification).
- **Rate limit eszkaláció:** ha egy IP 10 percen belül ≥5× kapott 401-et admin endpointon, `multiplier=5` + 15 perces ablak; minden további 401 hosszabbítja.

---

## 8. API és WS ellenőrzési pontok

### 8.1 API (minden admin endpointon, sorrendben kötelező)

```
[1] Session érvényes és role='admin'
[2] Authorization Bearer admin_token érvényes és nem lejárt
[3] Token user_id egyezik session.userId-vel
[4] (super-only endpointon) is_super_admin = TRUE
[5] Rate limit nem lépett tovább (figyelembe veszi az aktív escalation-t)
[6] Mutáló endpointon: reason megvan és >= min hossz (10/30)
[7] Kritikus műveletnél: confirmPassword bcrypt match
[8] Audit context (request_id ULID) inicializálva
[9] Sikertelen ág is megy auditba (success=false, error_code)
```

### 8.2 WS

```
[1] Handshake-ben session.userId és role='admin'
[2] Handshake auth.adminToken érvényes és user_id egyezik
[3] socket.join('admin:room') CSAK miután [1][2] OK
[4] Minden 'admin:*' bejövő event-en újraellenőrzés (a token TTL alatt is invalidálható)
[5] Hibás admin event → audit + disconnect
```

---

## 9. Megvalósítási fázisok F1–F10

| Fázis | Funkciók | Mérhető kész kritérium |
|---|---|---|
| **F1. Séma + token alapok** | `users.is_super_admin` oszlop, `admin_tokens`, `admin_audit_log`, `admin_alert_log`, `admin_rate_escalations`. `metric_*` mezők kivétele. | `npm run dev` indul üres DB-ből, minden tábla létrejön. Admin user `is_super_admin=TRUE`. |
| **F2. Step-up auth** | `POST /api/admin/auth/elevate / refresh / revoke / status`. `parseAdminToken` middleware. | Postman: login → elevate jelszóval → admin tokent kapok → `/api/admin/test` átmegy; rossz token → 401. |
| **F3. AuditLogService + middleware lánc** | `requireReasonOnMutate`, `auditContext`, `auditFlush`. Service + redaction allowlist. ULID generátor. | Egy meglévő admin endpoint (`notifications/send`) átáll az új láncra; minden hívás után `admin_audit_log`-ban sor; sikertelen ág is naplózódik. |
| **F4. Admin socket namespace** | `io.of('/admin')` + handshake auth + `admin:room`. Replay endpoint. | 2 böngészőből admin login → mindkettő `admin:room`-ban → egy admin műveletet csinál → másiknak megérkezik az `admin:audit:created`. |
| **F5. AlertingService + adaptive rate limit** | Jogosulatlan próbálkozás → audit + alert + escalation. | Postman-ből 10× rossz tokennel hívok → 11. már 429; `admin:room` 1 alert-et kap; `admin_rate_escalations` sor. |
| **F6. Super-admin műveletek** | `/admin/admins/grant`, `revoke`, lista. Utolsó super lock. | Super-admin nem tudja saját super flag-jét levenni; sima admin nem tud grantolni; mindkét eset audit-tal. |
| **F7. Meglévő endpointok migrálása** | `notifications/send`, `profile-images/*`, `export-users` átáll az új láncra. | Mind a 4: token + reason (review reject) + audit + WS event. Tesztek zöldek. |
| **F8. Read-only API** | `/admin/audit/search`, `/admin/audit/export`, `/admin/alerts/recent`, `/admin/users/list`, `/admin/stats/snapshot`. | Audit kereshető actor/action/időtartomány/severity szerint; CSV export. |
| **F9. Retention job** | Napi 1× törlés 18 hónapnál régebbiről + audit a futásról. | Kézi időmanipuláció (régi rekord) → másnapi futáskor törlődik, retention audit van. |
| **F10. Frontend** | Külön iteráció. | – |

---

## 10. Tesztelési terv

### 10.1 Unit (Jest)
- `permissions.js`: SUPER_ONLY/CRITICAL_ACTIONS halmaz integritása.
- `AuditLogService.record()`: redaction (password_hash sose kerül kimenetbe), JSON serialization.
- `parseAdminToken`: hash-elés egyezik DB-ben tárolttal, lejárat számítás.
- `requireReasonOnMutate`: <10 / <30 char esetek elutasítása.
- `auditDiff`: csak változott mezők normál; teljes snapshot critical.

### 10.2 Integration (Supertest)
- Login → elevate → admin endpoint → 200, audit sor.
- Login player → elevate → 403.
- Login admin → elevate rossz jelszó → 401, audit sor `success=false`.
- Token TTL lejár → 401.
- Critical action confirmPassword nélkül → 400.
- Reject profilkép reason nélkül → 400; approve reason nélkül → 200.

### 10.3 Auth bypass tesztek
- Admin endpoint admin token NÉLKÜL, csak session-nel → 401.
- Admin endpoint Bearer-rel session NÉLKÜL → 401.
- Admin endpoint MÁS user tokenjével (saját session) → 401, alert.
- Lejárt token → 401, alert.
- Direkt URL `/html/adminPanel.html` nem-admin session-nel → redirect.
- WS `/admin` csatlakozás player session-nel → connect_error.
- WS event `admin:user:ban` küldése player namespace-ről → ignorálva + audit.

### 10.4 Abuse / rate limit
- 10× rossz admin token egy IP-ről → 11. már 429.
- Eszkaláció után normál admin user csökkentett limittel? **NEM** — eszkaláció IP+endpoint scope-ú.
- 100 művelet 1mp alatt → mind átmegy DB-be, nincs vesztés (szinkron írás miatt lassul, de nem dob el).

### 10.5 Real-time szinkron
- 2 socket-kliens (mock) `admin:room`-ban → egyik műveletet csinál → másik megkapja `admin:audit:created` 500ms-en belül.
- Egyik kliens diszkonnektál 5mp-re → reconnect → `admin:replay:request` → batch-ben megkapja a kihagyott eventeket.
- 24h-nál régebbi replay request → `replay_too_old` válasz.

---

## 11. Most vs később

| Tétel | Most (F1–F9) | Később |
|---|---|---|
| `is_super_admin` oszlop | ✅ | – |
| `admin_audit_log` + `admin_alert_log` | ✅ | – |
| Step-up admin token tábla | ✅ | – |
| `metric_*` mezők eltávolítása | ✅ | – |
| Külön `/admin` socket namespace | ✅ | – |
| Reason kötelező + redaction allowlist | ✅ | – |
| Adaptív rate limit eszkaláció | ✅ | – |
| Super-admin grant/revoke | ✅ (F6) | – |
| Több admin szint / RBAC | ❌ | csak ha jönnek új szerepkörök |
| Külön `audit_archive` tábla | ❌ | hosszabb retention |
| JWT mindenhol | ❌ | mobil kliens |
| 2FA TOTP | ❌ | production előtt |
| Redis socket adapter | ❌ | több process esetén (issues.md) |
| IP allowlist admin elevate-en | ❌ | production előtt (issues.md) |
| Append-only DB user az auditra | ❌ | production előtt |
| Audit aláírás (HMAC chain) | ❌ | jogi követelmény |
| Async audit queue | ❌ | DoS-érzékenység (issues.md) |
| Live nézői mód | ❌ | későbbi feature (§13) |

---

## 12. Eltávolítva: `user_logs.metric_*` mezők

### 12.1 Mi került ki

```sql
-- ELTÁVOLÍTVA:
metric_key VARCHAR(100) NULL,
metric_value DECIMAL(14, 4) NULL,
metric_delta DECIMAL(14, 4) NULL,
INDEX idx_user_logs_user_metric_time (user_id, metric_key, occurred_at),
```

### 12.2 Miért

A teljes kódbázis-keresés (`metricKey|metricValue|metricDelta`) csak az `insertUserLog` író függvényben talált találatot ([backend/sql/sql_funtions.js:601-603](backend/sql/sql_funtions.js#L601-L603)). **Egyetlen hívó sem ad át értéket** ezekhez a paraméterekhez. Az `idx_user_logs_user_metric_time` index szintén holt kód.

### 12.3 Ha mégis kell numerikus metrika

A `metadata JSON` mezőbe kerül (pl. `{ "elo_before": 1500, "elo_after": 1512, "delta": 12 }`). Az új `admin_audit_log` tábla a `before_state`/`after_state` JSON-okkal struktúráltabb diff-et ad.

### 12.4 Érintett fájlok F1-ben

- `backend/sql/create_database.sql` — oszlopok és index törölve
- `backend/sql/database.js` (createTables) — oszlopok és index törölve
- `backend/sql/sql_funtions.js` (`insertUserLog`) — paraméterek és INSERT törölve

---

## 13. Jövőbeli funkciók

### 13.1 Tervezett, nem most
- **Nézői mód (spectator):** futó meccshez WS read-only csatlakozás. Új permission, új socket event-ek. Feature flag-elhető.
- **Live game-beavatkozás (beavatkozó admin):** CSAK ha a nézői mód után indokolt; nagy ívű ML / cheat-detection nélkül felesleges.
- **Async audit queue:** in-memory ring buffer → DB writer worker. DoS-toleranciára.
- **JSONL audit archive:** 18 hónap után tömörített JSONL exportot ír retention előtt.
- **HMAC chain az audit log integritáshoz:** minden új sor `prev_hash` mezője a megelőző sor SHA-256-ja.
- **2FA TOTP admin elevate-en.**
- **IP allowlist admin elevate-re** (lásd issues.md).
- **Redis socket adapter** (lásd issues.md).

---

## 📎 Hivatkozások

- [README.md](readme.md) — projekt setup és környezet
- [issues.md](issues.md) — projekt-szintű teendők, prioritálva
- [backend/api/routes/admin.js](backend/api/routes/admin.js) — meglévő admin route (F7-ben átáll az új láncra)
- [backend/api/funtions.js](backend/api/funtions.js) — meglévő `isAdmin` middleware (F2-ben kibővítve token check-kel)
- [backend/sockets.js](backend/sockets.js) — meglévő socket hub (F4-ben új `/admin` namespace)
- [backend/sql/create_database.sql](backend/sql/create_database.sql) — séma sablon (F1-ben módosul)
- [backend/sql/database.js](backend/sql/database.js) — runtime DB init (F1-ben módosul)

---

> **Következő lépés:** F1 fázis kódolása — séma módosítás üres DB-n. Implementáció előtt ezt a doksit használd referenciának.
