# 🛡️ MattMester – Admin Panel Architektúra & Implementációs Dokumentum

> **Cél:** ez a dokumentum az admin panel teljes terv- és megvalósítási rétegét rögzíti — token gazdálkodás, audit log, real-time, biztonsági kontrollok, fázis-bontás. Forrás-igazság a folyamatos fejlesztéshez.
>
> **Státusz:** ✅ F1–F9 implementálva. F10 (frontend) kész. Terven túli funkciók is megvalósultak (IP blokkolás, karbantartási mód, játék-felügyelet, chat moderálás, képesség-szerkesztő, felhasználói jelentések, hálózati osztályozó).
>
> **Utolsó frissítés:** 2026-05-04 — implementáció utáni szinkron.

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

A rendszer teljes admin rétege implementálva. Az eredeti tervhez képest az alábbi extra funkciók is elkészültek:

1. **Step-up admin token** a session FÖLÖTT (15 perces sliding, SHA-256 hash, DB-ben tárolt).
2. **`admin_audit_log` tábla** before/after JSON diff-fel — minden mutáló admin művelet naplózva.
3. **Dedikált socket namespace `/admin`** + `admin:room` real-time fan-outhoz.
4. **IP blokkolás** — tartós IP tiltás cache-szel és DB háttérrel.
5. **Karbantartási mód** — site-wide toggle, ütemezési lehetőséggel.
6. **Soft-delete + 24h visszaállítási ablak** — felhasználók törölhetők de 24 órán belül visszaállíthatók, utána cron job végzi a hard-delete-et.
7. **Chat moderálás** — profanitás szűrő (maszkolás), dinamikus blokklista, 3-strike automatikus banning, üzenet-jelentések review-ja.
8. **Játék-felügyelet** — játékok listázása, részletes megtekintés, PGN export, force-end.
9. **Felhasználói jelentések** — csalás/toxicitás bejelentések kezelése, kapcsolódó játék-review.
10. **Hálózati osztályozó** — IP geolokáció, user-agent parseolás, kockázat-pontozás login logoknál.
11. **Képesség-szerkesztő** — sakkképességek adatainak szerkesztése adminon belül.
12. **Site beállítások** — `siteName`, `supportEmail`, `defaultLanguage`, `registrationEnabled`, `maintenanceMode` stb.

### Jelenlegi frontend állapot

A teljes admin panel frontend kész (29 JavaScript modul, [frontend/javascript/adminPanel/](frontend/javascript/adminPanel/)):

| Modul | Funkció |
|---|---|
| `01-helpers.js` | Segédfüggvények |
| `02-state.js` | Admin állapotkezelés |
| `03-userList.js` | Felhasználó táblázat |
| `04-navigation.js` | Oldal navigáció |
| `05-chartStatus.js` | Dashboard diagram |
| `06-sections.js` | Szekció kezelés |
| `07-feedRows.js` | Audit/alert feed |
| `08-sectionSwitch.js` | Tab váltás logika |
| `09-auth.js` | Token elevate flow |
| `10-tokenCountdown.js` | Token TTL + auto-refresh |
| `11-socket.js` | Admin socket kapcsolat |
| `12-liveUpdates.js` | Real-time frissítések |
| `13-criticalActions.js` | Hold-gomb kritikus műveletekhez |
| `14-userTable.js` | Felhasználó lista tábla |
| `15-alerts.js` | Alert kezelés |
| `16-security.js` | Biztonsági/bejelentkezési logok |
| `17-userBan.js` | Felhasználó tiltás UI |
| `18-userDelete.js` | Soft-delete UI |
| `19-userDetail.js` | Felhasználó részlet modal |
| `20-imageEditor.js` | Kép vágás/szerkesztés |
| `21-logout.js` | Kijelentkezés |
| `22-activityChart.js` | Aktivitás vizualizáció |
| `23-moderationProfileImages.js` | Profilkép jóváhagyás |
| `24-moderationChat.js` | Chat üzenet moderálás |
| `25-moderationReports.js` | Játékos-bejelentések review |
| `26-init.js` | Panel inicializáció |
| `27-adminPages.js` | Admin oldalak routing |
| `28-bootstrap.js` | Panel bootstrap |
| `29-userCreate.js` | Felhasználó létrehozás modal |

- A headerben lévő token gomb működik: ha van aktív admin token, frissíti az `expiresAt`-et; ha nincs, az elevate modalt nyitja.
- A token countdown másodpercenként frissül, 60 másodperc alatt automatikus refresh-t próbál, lejáratkor törli a tokent és új elevate-t kér.
- `ADMIN_NO_SESSION` → azonnali token törlés, redirect `/`-ra; `ADMIN_TOKEN_INVALID|EXPIRED|MISSING` → token törlés + elevate modal.

---

## ✅ Eldöntött tervezési pontok

| # | Kérdés | Döntés |
|---|---|---|
| 1 | Auth-stratégia | ✅ **(C) Step-up admin token a session FÖLÖTT.** Session megmarad, admin műveletekhez 15 perces, rotálódó admin token. |
| 2 | `user_logs.metric_*` mezők | ✅ **Eltávolítva.** Holt kód volt (lásd §12). |
| 3 | Super-admin seed | ✅ A meglévő `admin` seed user `is_super_admin = TRUE`-t kapott. |
| 4 | Indoklás min. hossz | ✅ **10 char** normál, **30 char** kritikus művelet. |
| 5 | Admin token TTL | ✅ **15 perc sliding** (utolsó használat óta). |
| 6 | Retention 18 hónap | ✅ **Hard delete.** Iskolai projekt, nincs jogi archiválási kötelezettség. |
| 7 | Audit írás mód | ✅ **Szinkron** (egyszerűbb, iskolai szinten elég). |
| 8 | Live game-beavatkozás | ✅ **NEM** (csak force-end adminon). Nézői mód nem implementált. |
| 9 | Audit before/after részletesség | ✅ **Csak változott mezők** normál, **teljes record snapshot** kritikus. |
| 10 | Audit soft-delete vs append-only | ✅ **Append-only.** Csak a retention job törölhet. |
| 11 | Admin broadcast notif. | ✅ Bármely admin küldheti. |
| 12 | Session revoke (force logout) | ✅ **Implementálva.** Session-store memória; WebSocket `user:session_revoked` esemény. |
| 13 | `target_id` típusa | ✅ `target_id BIGINT NULL` + `target_key VARCHAR(64) NULL`. |
| 14 | Profilkép review reason | ✅ **Csak reject-nél kötelező.** Approve-nál opcionális. |
| 15 | CSV export users audit | ✅ Audit-olt művelet, `info` severity. |
| 16 | Stats tick tartalma | ✅ Online userek, pending képsor, 24h audit/alert, friss banok stb. |
| 17 | Soft-delete grace period | ✅ **24 óra.** Cron job végzi a hard-delete-et, admin UI-ból visszaállítható. |
| 18 | Chat moderálás | ✅ **3-strike rendszer.** 1. → temp ban, 2. → hosszabb temp ban, 3. → permanent ban. |
| 19 | IP blokkolás | ✅ DB + memória cache, opcionális lejárattal, `ipBlockGuard` middleware. |
| 20 | Karbantartási mód | ✅ Site-wide toggle (`maintenanceGuard`), ütemező API. |

---

## 1. Célarchitektúra

```
┌──────────────────────────────────────────────────────────────────────┐
│  Kliens (admin panel UI – 29 modul, kész)                            │
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
│   6. auditContext   │                │                                │
│   7. auditFlush     │                │                                │
└─────────────────────┘                └────────────────────────────────┘
        │                                               │
        ▼                                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Services réteg                                                      │
│  - AuditService (recordAdminAction, before/after diff)               │
│  - AlertingService (recordUnauthorized, escalation)                  │
│  - TokenService (issue, verify+touch, revokeAll)                     │
│  - StatsTickService (dashboard stat összesítés, 5mp)                 │
│  - NetworkClassifier (IP geolokáció, UA parse, kockázat-pontszám)    │
│  - MaintenanceScheduler (ütemezett maintenance window)               │
│  - RetentionJob (napi 1× 18h+ audit sorok törlése)                   │
│  - SoftDeletePurgeJob (napi cron: 24h+ soft-deleted userek törlése)  │
└──────────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────────┐
│  MySQL: admin_audit_log, admin_alert_log, admin_tokens,              │
│         admin_rate_escalations, users(.is_super_admin),              │
│         chat_blocked_words_dynamic, chat_profanity_strikes,          │
│         user_reports, profile_image_uploads, abilities               │
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
                            │ REVOKED  │ ◀── logout / explicit revoke / role change
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

### 2.5 Token kliens-oldali tárolás

- **Memóriában** (modul-szintű állapot, `adminPanel/02-state.js`).
- **Soha nem `localStorage`-ben** (XSS lopás kockázat).
- A token + `expiresAt` érték együtt jár; UI 60 másodperccel lejárat előtt automatikusan `refresh`-eli.
- Lap újratöltés → új `elevate` flow (jelszó újrakérés). Tudatos tradeoff: nincs persistent admin élmény, viszont nincs token replay XSS-en át.

### 2.6 Token rotáció

Ha az admin szerepkör megváltozik (pl. `users/:id/edit` role módosítás), minden meglévő admin token azonnal visszavonásra kerül (`revokeAllForUser`) és WebSocket force-logout kerül kiküldésre az érintett felhasználónak.

### 2.7 Admin auth lifecycle — Frontend / Backend szerződés

- Error kódok (backend → frontend):
  - `ADMIN_NO_SESSION` — session megszűnt/nincs admin jog. Frontend: **azonnali token törlés, redirect `/`-ra**.
  - `ADMIN_TOKEN_INVALID` — token hibás/nem található. Frontend: **token törlés + elevate modal**.
  - `ADMIN_TOKEN_EXPIRED` — token lejárt. Kezelés = `ADMIN_TOKEN_INVALID`.
  - `ADMIN_TOKEN_MISSING` — token hiányzik a kérésből. Kezelés = `ADMIN_TOKEN_INVALID`.
  - Hálózati/5xx hibák: **ne törölje a tokent**; warning toastot jelenítsen meg.

- A `GET /api/public/admin-constants` endpoint visszaadja a token TTL-t, reason min/max hosszokat, UI timing konstansokat és az `ADMIN_ERROR_CODES` mapet.

---

## 3. Jogosultsági modell

### 3.1 Permission lista

```javascript
// backend/api/admin/constants.js
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
```

### 3.2 Kritikus művelet — extra szabályok

- Indoklás **min. 30 char** (normál: 10).
- Bizonyos kritikus műveletek (pl. `users.delete`) admin jelszó megerősítést (`confirmPassword`) igényelnek a body-ban.
- Audit `severity = 'critical'`, **teljes record snapshot** before/after-be.
- Token **rotáció** sikeres admin role-módosítás után.

### 3.3 Csak super-admin

- `POST /api/admin/admins/grant` — user-nek admin/super-admin jog adása.
- `POST /api/admin/admins/revoke-on` — admin jog visszavonása + token revoke + force disconnect.
- `POST /api/admin/admins/revoke-super` — super-admin flag levonása (saját magán nem lehetséges — last-super lock).
- `GET /api/admin/admins` — admin user lista.

---

## 4. Real-time (WebSocket) terv

### 4.1 Namespace + szobák

- Namespace: `/admin` — külön az alap `/`-tól ([backend/api/admin/socketNamespace.js](backend/api/admin/socketNamespace.js)).
- Szoba: `admin:room` — minden online admin csatlakozik.
- Per-admin: `admin:user:<id>` — célzott üzenetek.

### 4.2 Eseménytípusok

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

### 4.3 `admin:stats:tick` payload minta

```json
{
  "tickId": 4421,
  "occurredAt": "2026-05-04T10:20:00.000Z",
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
    request_id CHAR(26) NOT NULL,                -- ULID
    occurred_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_aal_occurred (occurred_at),
    INDEX idx_aal_actor_time (actor_user_id, occurred_at),
    INDEX idx_aal_action_time (action, occurred_at),
    INDEX idx_aal_target (target_type, target_id, occurred_at),
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
    detail JSON NULL,
    dismissed_at TIMESTAMP NULL,
    dismissed_by INT NULL,
    occurred_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_aalert_time (occurred_at),
    INDEX idx_aalert_kind_time (kind, occurred_at),
    INDEX idx_aalert_ip_time (ip_address, occurred_at)
);
```

> **Megjegyzés:** az `admin_alert_log` tábla `dismissed_at` és `dismissed_by` mezőket kapott (nem volt a tervben), hogy az adminok nyugtázhassák az alerteket.

### 5.3 Before/after részletesség

- **Normál** (`severity IN ('info','warning')`): csak a változott mezők.
- **Kritikus** (`severity='critical'`): teljes record snapshot.
- **Redaction allowlist** — sose kerül be: `password_hash`, `email_verification_token_hash`, `email_verification_token_expires`, `reset_password_token`, `reset_token_expires`.

### 5.4 Megőrzés

- **18 hónap, hard delete.** Napi 1× retention job (`retentionJob.js`).
- A retention job futása maga is audit entry: `action='audit.retention.run'`, severity='info'.

### 5.5 Alert dismiss

- `POST /api/admin/alerts/:id/dismiss` — egy alert nyugtázása.
- `POST /api/admin/alerts/dismiss-all` — minden aktív alert nyugtázása.
- `POST /api/admin/alerts/:id/restore` — nyugtázás visszavonása.

---

## 6. Adatbázis séma változások

### 6.1 `users` tábla — aktuális séma (kivonat)

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
    last_login_ip VARCHAR(45) NULL,
    deleted_at TIMESTAMP NULL,               -- soft-delete
    deletion_scheduled_at TIMESTAMP NULL,    -- 24h grace period határa
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 6.2 Új táblák (terven felüli is)

**Tervezett:**
- `admin_tokens` (§2.4)
- `admin_audit_log` (§5.1)
- `admin_alert_log` (§5.2)
- `admin_rate_escalations` (§5.3)

**Terven felüli:**
- `chat_blocked_words_dynamic` — admin által felvett dinamikus profanitás-szólista
- `chat_profanity_strikes` — felhasználónként nyilvántartott strike-ok
- `user_reports` — játékos-bejelentések (csalás/toxicitás)
- `profile_image_uploads` — profilkép feltöltési sor, review állapottal
- `statistics` — user statisztikák (wins, losses, draws, abilities_used)
- `abilities` — sakk-képességek adatbázisa
- `ability_log` — képesség-használat logja játékonként

### 6.3 Seed update

```sql
INSERT INTO users (..., role, is_super_admin) VALUES ('admin', ..., 'admin', TRUE)
    ON DUPLICATE KEY UPDATE is_super_admin = TRUE, role = 'admin';
```

---

## 7. Biztonsági terv

### 7.1 Top 15 kockázat

| # | Kockázat | Védelem |
|---|---|---|
| 1 | Admin token lopás (XSS) | Token memóriában tárolva, soha nem `localStorage`-ben. `Authorization` header. |
| 2 | Token replay más eszközről | `last_used_at` minden használatkor frissül; session+token `user_id` egyezés kötelező. |
| 3 | CSRF admin endpointokon | `Authorization: Bearer` header kötelező → cookie-egyedüli kérés tiltva. |
| 4 | Brute-force admin elevate | Külön `adminElevateLimiter` (5 / 15 perc, IP+user). |
| 5 | Privilege escalation | Csak super-admin írhat `role`/`is_super_admin`-t; `severity='critical'`. |
| 6 | Lejárt session-höz tartozó token | Logout + role-change → `revokeAllForUser`. |
| 7 | Audit log manipuláció | Append-only; nincs törlő UI endpoint; retention job az egyetlen törlő. |
| 8 | Indoklás nélküli művelet | `requireReasonOnMutate` middleware blokkol 400-zal. |
| 9 | TOCTOU race | DB tranzakció `SELECT ... FOR UPDATE`; `request_id` ULID. |
| 10 | Time-based info leak | Egységes 403 "Nincs jogosultságod" minden nem-létezik/nincs-jog esetre. |
| 11 | WS namespace bypass | Admin események CSAK `/admin` namespace-en, `requireAdmin` socket middleware-rel. |
| 12 | Replay storm reconnect után | Batch cap, 24h ablak. |
| 13 | DoS audit írásokon | Szinkron írás iskolai szinten elegendő. |
| 14 | SQL injection | Minden user input prepared statement. JSON path whitelist. |
| 15 | PII szivárogtatás logokba | Redaction allowlist a `before_state`/`after_state`-hez. |

### 7.2 Egyéb kontrollok

- **Last-super-admin lock:** az utolsó `is_super_admin=TRUE` user sem `revoke-super`-rel, sem self-demote-tal nem veszítheti el a jogát.
- **IP blokkolás:** `ipBlockGuard` middleware minden kérést ellenőriz, memória cache-sel.
- **Karbantartási mód:** `maintenanceGuard` middleware blokkolja a nem-admin kéréseket.
- **Rate limit eszkaláció:** 5× 401 10 percen belül → `multiplier=5` + 15 perces ablak.

---

## 8. API és WS ellenőrzési pontok

### 8.1 Implementált admin API endpointok

**Auth:**
- `POST /api/admin/auth/elevate`
- `POST /api/admin/auth/refresh`
- `POST /api/admin/auth/revoke`
- `GET  /api/admin/auth/status`

**Felhasználó-kezelés:**
- `POST /api/admin/users/:id/edit` — username, email, role, emailVerified, elo, total_abilities szerkesztése
- `POST /api/admin/users/:id/delete` — soft-delete (24h grace + cron hard-delete)
- `POST /api/admin/users/:id/restore-deletion` — soft-delete visszaállítás
- `POST /api/admin/users/create` — új felhasználó (ideiglenes jelszóval)
- `GET  /api/admin/export-users` — CSV export

**Ban kezelés:**
- `POST /api/admin/users/:id/ban` — felhasználó kitiltása
- `POST /api/admin/users/:id/unban` — kitiltás feloldása

**Profilképek:**
- `GET  /api/admin/profile-images/pending`
- `POST /api/admin/profile-images/:uploadId/approve`
- `POST /api/admin/profile-images/:uploadId/reject`

**Chat moderálás:**
- `GET  /api/admin/chat/flagged` — maszkolt üzenetek listája
- `POST /api/admin/chat/messages/:messageId/allow` — üzenet jóváhagyása
- `POST /api/admin/chat/messages/:messageId/delete` — üzenet törlése + strike rögzítése
- `POST /api/admin/chat/blocklist/add` — szó hozzáadása dinamikus blokklistához

**Felhasználói bejelentések:**
- `GET  /api/admin/reports` — bejelentések listája (open/under_review/closed)
- `GET  /api/admin/games/:gameId/review` — játék review bejelentéshez (PGN, lépések)

**Értesítések:**
- `POST /api/admin/notifications/send` — user/multi/global/role célzású értesítés

**Audit:**
- `GET  /api/admin/audit/search` — keresés actor/action/severity/target/időtartomány szerint
- `GET  /api/admin/audit/export` — CSV export

**Alertek:**
- `GET  /api/admin/alerts/recent`
- `POST /api/admin/alerts/:id/dismiss`
- `POST /api/admin/alerts/dismiss-all`
- `POST /api/admin/alerts/:id/restore`

**Biztonsági logok:**
- `GET  /api/admin/security/logins` — bejelentkezési logok IP osztályozással, kockázat-pontszámmal

**IP blokkolás:**
- `POST   /api/admin/ip-blocks` — IP tiltás létrehozása/frissítése
- `DELETE /api/admin/ip-blocks/:ip` — IP tiltás eltávolítása

**Játékok:**
- `GET  /api/admin/games` — játékok listája (szűrők: status, player, keresés)
- `GET  /api/admin/games/:id` — részletes játéknézet
- `GET  /api/admin/games/:id/pgn` — PGN letöltés
- `POST /api/admin/games/:id/force-end` — folyamatban lévő játék befejezése
- `GET  /api/admin/games/counts` — játék statisztikák

**Képességek:**
- `GET  /api/admin/abilities` — képességek listája
- `POST /api/admin/abilities/:id/edit` — képesség szerkesztése

**Super-admin:**
- `GET  /api/admin/admins`
- `POST /api/admin/admins/grant`
- `POST /api/admin/admins/revoke-on`
- `POST /api/admin/admins/revoke-super`

**Site beállítások:**
- `GET /api/admin/settings`
- `PUT /api/admin/settings`

**Egyéb:**
- `GET /api/admin/tests` — teszt futtatás (dev mód)

### 8.2 API middleware lánc (sorrendben kötelező)

```
[1] Session érvényes és role='admin'
[2] Authorization Bearer admin_token érvényes és nem lejárt
[3] Token user_id egyezik session.userId-vel
[4] (super-only endpointon) is_super_admin = TRUE
[5] Rate limit nem lépett tovább (escalation-aware)
[6] Mutáló endpointon: reason megvan és >= min hossz (10/30)
[7] Kritikus műveletnél: confirmPassword bcrypt match (ahol alkalmazandó)
[8] Audit context (request_id ULID) inicializálva
[9] Sikertelen ág is megy auditba (success=false, error_code)
```

### 8.3 WS ellenőrzési pontok

```
[1] Handshake-ben session.userId és role='admin'
[2] Handshake auth.adminToken érvényes és user_id egyezik
[3] socket.join('admin:room') CSAK miután [1][2] OK
[4] Minden 'admin:*' bejövő event-en újraellenőrzés
[5] Hibás admin event → audit + disconnect
```

---

## 9. Megvalósítási fázisok F1–F10

| Fázis | Funkciók | Státusz |
|---|---|---|
| **F1. Séma + token alapok** | `users.is_super_admin`, `admin_tokens`, `admin_audit_log`, `admin_alert_log`, `admin_rate_escalations`. `metric_*` kivétele. | ✅ Kész |
| **F2. Step-up auth** | `POST /api/admin/auth/elevate / refresh / revoke / status`. `parseAdminToken` middleware. | ✅ Kész |
| **F3. AuditLogService + middleware lánc** | `requireReasonOnMutate`, `auditContext`, `auditFlush`. Service + redaction allowlist. ULID generátor. | ✅ Kész |
| **F4. Admin socket namespace** | `io.of('/admin')` + handshake auth + `admin:room`. | ✅ Kész |
| **F5. AlertingService + adaptive rate limit** | Jogosulatlan próbálkozás → audit + alert + escalation. Alert dismiss UI. | ✅ Kész |
| **F6. Super-admin műveletek** | `/admin/admins/grant`, `revoke-on`, `revoke-super`, lista. Utolsó super lock. | ✅ Kész |
| **F7. Meglévő endpointok migrálása** | `notifications/send`, `profile-images/*`, `export-users` átállt az új láncra. | ✅ Kész |
| **F8. Read-only API** | `/admin/audit/search`, `/admin/audit/export`, `/admin/alerts/recent`, `/admin/users/list`, stats. | ✅ Kész |
| **F9. Retention job** | Napi 1× törlés 18 hónapnál régebbiről + audit a futásról. Soft-delete purge job (24h). | ✅ Kész |
| **F10. Frontend** | 29 JS modul, teljes admin panel UI. | ✅ Kész |
| **F+. Terven felüli** | IP blokkolás, karbantartási mód, chat moderálás, játék-felügyelet, felhasználói bejelentések, hálózati osztályozó, képesség-szerkesztő, site beállítások. | ✅ Kész |

---

## 10. Tesztelési terv

### 10.1 Unit (Jest)

- `constants.js`: `SUPER_ONLY`/`CRITICAL_ACTIONS` halmaz integritása.
- `auditService.js`: redaction (`password_hash` sose kerül kimenetbe), JSON serialization.
- `parseAdminToken`: hash-elés egyezik DB-ben tárolttal, lejárat számítás.
- `requireReasonOnMutate`: <10 / <30 char esetek elutasítása.

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
- WS `/admin` csatlakozás player session-nel → connect_error.

---

## 11. Most vs később

| Tétel | Állapot |
|---|---|
| `is_super_admin` oszlop | ✅ Implementálva |
| `admin_audit_log` + `admin_alert_log` | ✅ Implementálva |
| Step-up admin token | ✅ Implementálva |
| `metric_*` mezők eltávolítása | ✅ Implementálva |
| `/admin` socket namespace | ✅ Implementálva |
| Reason kötelező + redaction allowlist | ✅ Implementálva |
| Adaptív rate limit eszkaláció | ✅ Implementálva |
| Super-admin grant/revoke | ✅ Implementálva |
| Alert dismiss UI | ✅ Implementálva |
| Soft-delete + 24h grace + restore | ✅ Implementálva |
| IP blokkolás | ✅ Implementálva |
| Karbantartási mód + ütemező | ✅ Implementálva |
| Chat moderálás (3-strike, blocklist) | ✅ Implementálva |
| Játék-felügyelet (review, force-end, PGN) | ✅ Implementálva |
| Felhasználói bejelentések review | ✅ Implementálva |
| Hálózati osztályozó (IP/UA kockázat) | ✅ Implementálva |
| Képesség-szerkesztő | ✅ Implementálva |
| Site beállítások | ✅ Implementálva |
| Teljes admin frontend (29 modul) | ✅ Implementálva |
| Több admin szint / RBAC | ❌ Csak ha jönnek új szerepkörök |
| JWT mindenhol | ❌ Mobil klienshez (jövő) |
| 2FA TOTP | ❌ Production előtt |
| Redis socket adapter | ❌ Több process esetén |
| IP allowlist admin elevate-en | ❌ Production előtt |
| Append-only DB user az auditra | ❌ Production előtt |
| Audit aláírás (HMAC chain) | ❌ Jogi követelmény esetén |
| Async audit queue | ❌ DoS-érzékenységre |
| Live nézői mód | ❌ Jövőbeli feature |

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

A teljes kódbázis-keresés csak az `insertUserLog` írófüggvényben talált találatot. **Egyetlen hívó sem adott át értéket** ezekhez a paraméterekhez. Holt kód volt.

### 12.3 Ha mégis kell numerikus metrika

A `metadata JSON` mezőbe kerül (pl. `{ "elo_before": 1500, "elo_after": 1512, "delta": 12 }`).

---

## 13. Jövőbeli funkciók

- **Nézői mód (spectator):** futó meccshez WS read-only csatlakozás.
- **Async audit queue:** in-memory ring buffer → DB writer worker. DoS-toleranciára.
- **2FA TOTP admin elevate-en.**
- **IP allowlist admin elevate-re.**
- **Redis socket adapter** (több process esetén).
- **JSONL audit archive** 18 hónap után.

---

## 📎 Hivatkozások

- [readme.md](readme.md) — projekt setup és környezet
- [issues.md](issues.md) — projekt-szintű teendők
- [backend/api/admin/](backend/api/admin/) — admin réteg (routes, middleware, services)
- [backend/api/routes/admin.js](backend/api/routes/admin.js) — admin route definíciók
- [backend/api/functions.js](backend/api/functions.js) — `isAdmin`, `pageGuard`, `apiGuard` middleware
- [backend/sockets.js](backend/sockets.js) — socket hub + `/admin` namespace
- [backend/sql/create_database.sql](backend/sql/create_database.sql) — teljes séma
- [frontend/javascript/adminPanel/](frontend/javascript/adminPanel/) — 29 admin panel modul
