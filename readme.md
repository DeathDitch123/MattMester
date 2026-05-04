<h1 align="center">MattMester</h1>

<p align="center">Online sakk-portál Node.js + Express + MySQL + Socket.IO alapokon.<br>Iskolai projekt — fejlesztés és futtatás localhoston.</p>

---

## Tartalomjegyzék

- [Előfeltételek](#előfeltételek)
- [Beüzemelés (gyors)](#beüzemelés-gyors)
- [Függőségek (npm)](#függőségek-npm)
- [Adatbázis](#adatbázis)
- [Környezeti változók (.env)](#környezeti-változók-env)
- [Indítás és parancsok](#indítás-és-parancsok)
- [Tesztek](#tesztek)
- [Email verifikáció (SMTP)](#email-verifikáció-smtp)
- [Rate limiterek](#rate-limiterek)
- [Hibakeresés](#hibakeresés)
- [Nyelvválasztás (i18n)](#nyelvválasztás-i18n)
- [Projekt struktúra](#projekt-struktúra)
- [Konfigurációs sablonok](#konfigurációs-sablonok)

---

## Előfeltételek

| Eszköz | Verzió | Megjegyzés |
|---|---|---|
| Node.js | 18.x vagy újabb | LTS ajánlott |
| npm | 9.x vagy újabb | Node-dal érkezik |
| MySQL | 8.0 vagy MariaDB 10.5+ | XAMPP is jó: `127.0.0.1:3306`, root user, üres jelszó |
| Modern böngésző | — | Bootstrap 5 + ES2020+ |

A backend alapból a `127.0.0.1:3306` MySQL szerverhez csatlakozik, root userrel, üres jelszóval (lásd `backend/sql/database.js`). Ha másképp van konfigurálva a saját MySQL-ed, az értékeket ott kell átírni.

---

## Beüzemelés (gyors)

```bash
# 1. Repo klónozás
git clone <repo-url> MattMester
cd MattMester

# 2. Backend függőségek telepítése
cd backend
npm install

# 3. MySQL elindítása (XAMPP / MySQL service)
#    A 'mattmester' adatbázist a backend automatikusan létrehozza induláskor.

# 4. .env fájl (opcionális, csak SMTP-hez kötelező — lásd lejjebb)

# 5. Indítás
npm run dev
```

Ezután nyisd meg böngészőben: **http://localhost:3000**

---

## Függőségek (npm)

A `cd backend && npm install` parancs az összes alábbit telepíti a `package.json` alapján. Itt csak referenciaként látható, hogy mi mire kell.

### Production

| Csomag | Cél |
|---|---|
| `express` | Web framework (HTTP route-ok) |
| `express-session` | Session tárolás (cookie + memória) |
| `express-rate-limit` | Brute-force / abuse védelem az endpointokon |
| `mysql2` | MySQL kliens (promise API) |
| `bcrypt` | Jelszó hash-elés (password_hash) |
| `multer` | Fájl-feltöltés (profilkép) |
| `socket.io` | Real-time kommunikáció (chat, presence, notification, sakk) |
| `cors` | Cross-origin engedélyezés |
| `dotenv` | `.env` fájl betöltése |
| `nodemailer` | SMTP email küldés (verifikáció, jelszó-visszaállítás) |
| `vary` | HTTP `Vary` header helper |

### Development

| Csomag | Cél |
|---|---|
| `nodemon` | Auto-restart fájlváltozásra (`npm run dev`) |
| `kill-port` | Port felszabadítása induláskor (3000) |
| `jest` | Teszt framework |
| `supertest` | HTTP integrációs tesztek |

### Manuális telepítés (ha valamiért külön kell)

```bash
cd backend
npm install express express-session express-rate-limit mysql2 bcrypt multer socket.io cors dotenv nodemailer vary
npm install --save-dev nodemon kill-port jest supertest
```

> Note: A `bcrypt` natív modult fordít install közben. Windowson Visual Studio Build Tools (vagy Python 3 + windows-build-tools) szükséges hozzá. Ha problémás, alternatívaként `bcryptjs` (tisztán JS) használható, de a `package.json` jelenleg `bcrypt`-et köt.

---

## Adatbázis

A backend első indításkor automatikusan:

1. Létrehozza a `mattmester` adatbázist, ha nem létezik (`CREATE DATABASE IF NOT EXISTS`)
2. Felhúzza az összes táblát (`users`, `friend_relations`, `chat_conversations`, `chat_messages`, `notifications`, `notification_reads`, `user_logs`, stb.)
3. Lefuttat egy idempotens `ensureSchemaColumns` lépést, ami régi DB-be is hozzáadja a hiányzó oszlopokat (pl. új `notification_reads.dismissed_at`)

A séma forrása: [backend/sql/create_database.sql](backend/sql/create_database.sql) (referencia) és [backend/sql/database.js](backend/sql/database.js) (futási idejű init).

A `create_database.sql` 20 teszt-felhasználót is létrehoz seed-ként (`testuser01` … `testuser20`, jelszó: `123456Ab`). Ezek csak akkor kerülnek be, ha kézzel futtatod le az SQL fájlt phpMyAdmin/MySQL CLI-ben — a futási idejű init nem hozza létre őket.

### Csatlakozási adatok átírása

Ha a saját MySQL-ed nem `root` / üres jelszó / `127.0.0.1`:

```javascript
// backend/sql/database.js
const dbConfig = {
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'mattmester',
    ...
};
```

---

## Környezeti változók (.env)

A repo gyökerében található [.env.example](.env.example) sablont másold át `.env` néven (akár a repo gyökerébe, akár `backend/` alá — a backend mindkét helyet betölti, a `backend/.env` előbbre van rangsorolva). A fejlesztői környezet észszerű alapértelmezésekkel indul akkor is, ha hiányzik (`SESSION_SECRET` esetén dev-ben warning + véletlen érték; production-ben azonnali fail).

| Változó | Kötelező? | Default | Megjegyzés |
|---|---|---|---|
| `NODE_ENV` | nem | `development` | `production` esetén `cookie.secure=true`, `sameSite=strict` és kötelező `SESSION_SECRET`. |
| `SESSION_SECRET` | **production-ben igen** | dev-ben véletlen érték (warning) | Production-ben hiánya azonnali kilépést okoz. |
| `ALLOWED_ORIGINS` | nem | `http://localhost:3000` | Vesszővel elválasztott CORS origin lista. |
| `DB_HOST` | nem | `127.0.0.1` | MySQL host. |
| `DB_PORT` | nem | `3306` | MySQL port. |
| `DB_USER` | nem | `root` | MySQL user. |
| `DB_PASSWORD` | nem | (üres) | MySQL jelszó. |
| `DB_NAME` | nem | `mattmester` | MySQL DB név (létrehozás auto). |
| `DEBUG` | nem | (üres) | Debug-szintű log kapcsoló (lásd issues.md #55). |
| `CHAT_BLACKLIST_POLICY` | nem | `hard_block` | `soft_warn` \| `hard_block`. |
| `SMTP_*` | nem | fallback `json-dev` mód | Üresen hagyva a levelek a logba kerülnek. |
| `PUBLIC_BASE_URL` | csak SMTP-hez | `http://127.0.0.1:3000` | Verifikációs / reset link base URL-je. |

> **Koherencia**: minden változó pontosan ezen a néven szerepel a kódban és a [.env.example](.env.example) fájlban is. Új változót hozzáadáskor mindkét helyen frissíteni kell.

### `trust proxy: 1` használata

A backend [backend/server.js](backend/server.js) `app.set('trust proxy', 1)` beállítása arra utasítja az Express-t, hogy **pontosan egy** előtte álló reverse proxy `X-Forwarded-*` headerét megbízhatónak tekintse (pl. ezekből olvas IP-t és protokollt a rate limiter és a `cookie.secure`).

- ✅ **Production** Nginx / Cloudflare / Apache reverse proxy mögött (egyetlen hop): helyes — a kliens valódi IP-jét megkapjuk.
- ❌ **Direct expose** (proxy nélkül publikus port): hibás — bárki spoofolhat `X-Forwarded-For`-t, ezzel megkerülve a rate limitert vagy hamis IP-t auditolva.
- ❌ **Több proxy láncolat** (pl. CDN → load balancer → app): a `1` kevés, állítsd a tényleges hop-számra vagy whitelist-re.
- ⚠️ **Lokál fejlesztés**: localhoston a beállítás közömbös; HTTPS terminátor nélkül a `cookie.secure` (production módban) eldobja a süti-t — ezért dev-ben automatikusan `secure: false`.

---

## Indítás és parancsok

A backend mappában (`cd backend`):

| Parancs | Cwd | Mire jó |
|---|---|---|
| `npm run dev` | `backend/` | Fejlesztői mód: `kill-port 3000` + nodemon (auto-restart fájlváltozásra) |
| `npm run dev:raw` | `backend/` | Csak nodemon, port-felszabadítás nélkül |
| `npm run start` | `backend/` | Egyszerű `node server.js` (nincs auto-restart) |
| `npm test` | `backend/` | Összes Jest teszt futtatása (backend + frontend, a frissített `jest.config.js` alapján) |
| `npm run test:watch` | `backend/` | Tesztek figyelési módban |
| `npm run test:coverage` | `backend/` | Code coverage report |

Ha a 3000-es port lefagyott a háttérben:

```bash
cd backend
npx kill-port 3000
```

---

## Admin panel

> A teljes architekturális terv: [ADMIN_PANEL.md](ADMIN_PANEL.md).

### Jelenlegi állapot (2026-04-29)

Az admin panel auth és token kezelése az **F1–F3 fázison** át van vezetve:
- ✅ **F1**: Séma (`users.is_super_admin`, `admin_tokens`, `admin_audit_log`, `admin_alert_log`, `admin_rate_escalations`). Meglévő `metric_*` mezők `user_logs`-ból eltávolítva.
- ✅ **F2**: Step-up admin token (`POST /api/admin/auth/elevate/refresh/revoke/status`). `parseAdminToken` middleware. 15 perc sliding TTL, SHA-256 hash.
- ✅ **F3**: `AuditLogService` + middleware lánc (`requireReasonOnMutate`, `auditContext`, `auditFlush`). Redaction, before/after diff.
- 🟡 **F4–F9**: WebSocket `/admin` namespace, AlertingService, super-admin ops, read-only API-k, retention job — tervezve, de implementáció awaiting.
- 🔵 **Frontend**: Az új `frontend/javascript/shared/adminAuthFlow.js` DI factory kentralizálja az auth hibakezelést és token refresht. Frontend tesztek: `adminTokenFlow.test.js` (9 teszt).

### Ismert nyitott kérdések

- ✅ **WS event-name eltérés**: backend most `admin:alert:suspicious_pattern` néven broadcastol (sync a frontenddel). [backend/api/admin/alertingService.js:143](backend/api/admin/alertingService.js#L143)
- ✅ **Backend konstansok expozíciója**: `GET /api/public/admin-constants` endpoint elérhető — TTL-ek, reason hosszok, UI timing, és `ADMIN_ERROR_CODES` egy forrásból. [backend/api/routes/public.js](backend/api/routes/public.js)
- **Dead backend exports**: `isAdmin` helper már nem használt (helyette `parseAdminToken` middleware). Deprecate + külön PR eltávolítás.

### Következő lépések

1. Végigmenni az F4–F9 fázisokon (WebSocket, AlertingService, super-admin ops).
2. Frontend bekötése a `/api/public/admin-constants` válaszára (jelenleg még hardcoded értékekből táplálkozik).
3. Dead exportok takarítása.
4. Frontend admin operációk (ban, unban, profile image review, stb.) — ezek az F4–F9 mögé kerülnek.

További részletekért nézd meg az [ADMIN_PANEL.md](ADMIN_PANEL.md) és [ADMIN_AUTH_CHANGES.md](ADMIN_AUTH_CHANGES.md) fájlokat.

---

## Tesztek

Helye: [backend/__tests__/](backend/__tests__/) és [frontend/__tests__/](frontend/__tests__/). A `npm test` (repo gyökérből, a frissített `jest.config.js`-sel) jelenleg **11 teszt-suite-ot, 104 tesztet** futtat:

### Backend tesztek

| Fájl | Lefedi |
|---|---|
| `chat.test.js` | Chat API endpointok, üzenet validáció |
| `chatLifecycle.test.js` | Konverzáció létrehozás / cleanup / blokkolás |
| `rate-limiter.test.js` | Rate limiter middleware logika |
| `sessionStateRefresh.test.js` | Session-váltás, real-time chat badge |
| `profileImageUtils.test.js` | Profilkép útvonal-normalizálás |
| `profileImageVisibility.test.js` | Profilkép láthatósági szabályok (pending/approved/admin) |
| `notificationDismiss.test.js` | Értesítés permanens user-oldali eltávolítás (multi-tab szinkron + SQL filter) |
| `adminAuthRoutes.test.js` | Admin step-up token (elevate/refresh/revoke/status endpointok) |
| `adminMiddleware.test.js` | Admin auth middleware (`parseAdminToken`, error codes) |
| `adminAuditService.test.js` | Audit log recording, diff, redaction |

### Frontend tesztek (ÚJ — 2026-04-29)

| Fájl | Lefedi |
|---|---|
| `adminTokenFlow.test.js` | Shared `adminAuthFlow.js` factory (9 teszt: sikeres refresh, auth errors, hálózati hibák) |

A coverage küszöb (`package.json` → `jest.coverageThreshold`) jelenleg 50% minden dimenzióra.

### Tesztek futtatása

```bash
# Backend tesztek (backend/ mappában)
cd backend
npm test

# Frontend tesztek (backend/ mappában, jest.config.js konfig miatt)
cd backend
npx jest ../frontend/__tests__/adminTokenFlow.test.js --runInBand

# Összes teszt (backend/ mappában)
npx jest --config jest.config.js --runInBand
```

---

## Email verifikáció (SMTP)

Az email verifikáció és jelszó-visszaállítás működéséhez érvényes SMTP adatok kellenek. Ha hiányoznak, a backend automatikusan `json-dev` fallback módba vált és a levél tartalmát logba írja — fejlesztéshez ez bőven elég.

### Gmail gyors beállítás teszthez

1. Kapcsold be a 2FA-t a Google fiókban
2. Generálj App Password-öt
3. Tedd be `SMTP_PASS`-ként a `.env`-be

### Diagnosztika

Backend logban keresd:

- `Transporter init sikeres: kind=smtp` → SMTP konfig betöltve
- `SMTP kapcsolat ellenőrzés rendben (verify)` → kapcsolódás OK
- `Küldés sikeres` + `messageId` → sikeres küldés
- `SMTP fallback aktiv: kind=json-dev` → nincs érvényes SMTP, csak logba ír

Gyakori hibák: rossz SMTP host/port, hibás user/pass (auth hiba), provider tiltja a `SMTP_FROM` címet, spam/promóciók mappa, lokális tűzfal blokkolás.

---

## Rate limiterek

Minden user-érzékeny endpoint a [backend/api/middleware/rateLimiter.js](backend/api/middleware/rateLimiter.js) közös factory-jával van védve. A kulcs alapértelmezetten user-id (ha be van jelentkezve), különben IP.

Aktuális preset-ek (csak nagyságrend, pontos értékért lásd a forrást):

| Limiter | Ablak | Max | Védelem |
|---|---|---|---|
| `authLoginLimiter` | 15 perc | 10 sikertelen | Brute-force login |
| `authRegisterLimiter` | 60 perc | 5 | Bot regisztráció |
| `verifyPasswordLimiter` | 15 perc | 10 sikertelen | Settings password check |
| `profileUpdateLimiter` | 15 perc | 10 | Bcrypt-intenzív profilmódosítás |
| `profileImageUploadLimiter` | 15 perc | 8 | Disk-spam |
| `profileImageRemoveLimiter` | 15 perc | 15 | Toggle-spam |
| `profileDeleteLimiter` | 60 perc | 5 | Destruktív |
| `friendActionLimiter` | 1 perc | 20 | Social graph flood |
| `playerSearchLimiter` | 1 perc | 30 | Username enumeráció |
| `chatMessageLimiter` | 10 mp | 10 | Burst chat-spam |
| `chatDirectOpenLimiter` | 1 perc | 15 | Conversation-spam |
| `logoutAllDevicesLimiter` | 15 perc | 5 | O(n) session-store DoS |
| `emailVerifyResendLimiter` | 15 perc | 5 | Email-spam |
| `emailVerifyConsumeLimiter` | 15 perc | 30 | Token enumeráció |
| `passwordResetRequestLimiter` | 60 perc | 3 | Reset-email spam |
| `passwordResetTokenLimiter` | 15 perc | 20 | Reset token brute-force |
| `notificationActionLimiter` | 1 perc | 60 | Notification dismiss/read spam-click |

Limit átlépésnél a válasz `429 Too Many Requests`, JSON-formátum: `{ success: false, message, code? }`. A `code` csak egyes limitereknél van (pl. `EMAIL_RESEND_RATE_LIMIT`); kliens-oldalon érdemes mind a `code`-ot, mind a `message`-et kezelni.

Új endpoint védése factory-val:

```javascript
const { createRateLimiter } = require('./api/middleware/rateLimiter.js');

const myLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: 'Túl sok kérés, próbáld újra később.'
});

router.post('/my-endpoint', myLimiter, handler);
```

---

## Hibakeresés

### `npm run start` blokkolva PowerShell-ben

```
... cannot be loaded because running scripts is disabled on this system.
```

Megoldás (admin PowerShell):

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Majd zárd be és nyisd újra a VS Code-ot.

### Port 3000 foglalt

```bash
npx kill-port 3000
```

(A `npm run dev` ezt automatikusan megteszi.)

### `bcrypt` install fail Windowson

A natív C++ build tools hiányzik. Telepíts Visual Studio Build Tools-t, vagy használj `bcryptjs`-t (drop-in JS replacement).

### `Unknown column 'nr.dismissed_at'`

Régi DB-d van új kódbázissal. Indítsd újra a backendet — az `ensureSchemaColumns` automatikusan hozzáadja a hiányzó oszlopot.

### Admin token lifecycle

Browser DevTools (Network tab):
- `POST /api/admin/auth/elevate` → `{ token, expiresAt, isSuperAdmin }`
- `POST /api/admin/auth/refresh` → `{ success: true }` + token extension
- `Authorization: Bearer <token>` header minden admin fetch-en
- `401 + { code: 'ADMIN_NO_SESSION'|'ADMIN_TOKEN_INVALID'|… }` → frontend handle (redirect / elevate modal)

Browser Console:
- `window.MattMesterAdminAuthFlow.adminAuthHeaders()` → aktuális Bearer header
- `window.createRequestController()` → pending request track + cancel-capable

### WebSocket admin namespace

Browser Console (socket.io debug):
```javascript
window.io('/admin').on('connect', () => console.log('✓ /admin connected'));
window.io('/admin').on('admin:audit:created', (payload) => console.log('📋 audit:', payload));
```

---

## Nyelvválasztás (i18n)

Az oldal **magyar (alapértelmezett)** és **angol** nyelven is használható. A nyelvváltó a felső navbar jobb oldalán található **HU / EN** gombpárral azonnal vált — newer a teljes oldal, beleértve a dinamikusan injektált tartalmakat (toastok, validation üzenetek, leaderboard sorok, admin táblázatok, sakk-játszma feliratok, modal-ok stb.) is frissül.

### Architektúra

| Réteg | Fájl | Felelősség |
|---|---|---|
| Központ | `frontend/javascript/shared/i18n.js` | DICT (HU+EN), `tx()`, `set()`, `get()`, `applyAll()`, `onLangChange()`, `formatDate()`, `formatDateTime()` |
| Static HTML | `data-i18n="kulcs"`, `data-i18n-attr="placeholder:kulcs"`, `data-i18n-html="kulcs"` | A `MutationObserver` automatikusan újrafordítja a beszúrt DOM-ot is |
| Toggle UI | `[data-i18n-toggle="hu"|"en"|"cycle"]` | Nyelvváltó gombok bárhol az oldalon |
| Dinamikus JS-tartalom | `MattMesterI18n.tx('Magyar', 'English')` | Inline kapcsoló — nem kell DICT-be írni az egyszer használt stringeket |
| Re-render lang-changekor | `MattMesterI18n.onLangChange(fn)` | Nézet újra-renderelés (leaderboard, friends list, security log stb.) |
| Lokalizált dátum | `MattMesterI18n.formatDate(value)` / `formatDateTime(value)` | `hu-HU` / `en-GB` automatikusan |

### Példa — kódból új nyelvi szöveg

```js
// Inline (nem kell DICT-bővítés):
showToast(MattMesterI18n.tx('Sikeres mentés.', 'Saved successfully.'));

// Statikus HTML (DICT-be tedd a kulcsot):
<span data-i18n="profile.title">Profil</span>

// Re-render lang-váltáskor:
MattMesterI18n.onLangChange(() => {
    renderFriendsList();
    renderRecentGames();
});
```

### Tárolás

A választott nyelv `localStorage`-ben perzisztál (`mattmester.lang` kulcs alatt). Server-side render nincs — minden fordítás kliens-oldali, így a backend nyelv-agnosztikus marad.

### Új nyelv hozzáadása

1. `i18n.js` `SUPPORTED` tömbjébe vedd fel a kódot (pl. `'de'`).
2. `DICT.de = { ... }` — másold a meglévő `hu` blokkot, fordítsd le.
3. Adj hozzá egy `[data-i18n-toggle="de"]` gombot a navbar-hoz (`frontend/css/shared/topNavbar.css` + `frontend/html/*.html`).
4. A `tx()` kapcsoló **csak HU↔EN-t támogat** jelenleg; ha 3+ nyelv kell, írd át `tx()`-et `t(key)`-re és tedd a stringeket DICT-be.

---

## Projekt struktúra

```
MattMester/
├── backend/
│   ├── server.js                 # Express + Socket.IO entry point
│   ├── sockets.js                # Socket.IO event handlerek + hub
│   ├── services.js               # Stats, leaderboard, notification service
│   ├── api/
│   │   ├── api.js                # Aggregátor router
│   │   ├── chess_api.js          # /api/chess/* (PvP, ELO)
│   │   ├── funtions.js           # isAuthenticated, isAdmin, requireVerifiedEmail
│   │   ├── chatUtils.js          # Chat rate limit + audit
│   │   ├── emailVerification.js  # SMTP transport + token kezelés
│   │   ├── validation.js         # Username/email/password regex-ek
│   │   ├── middleware/
│   │   │   └── rateLimiter.js    # Univerzális rate limiter factory + presetek
│   │   └── routes/
│   │       ├── _shared.js        # Közös helper-ek (parsePositiveInteger, logAuthenticatedAction)
│   │       ├── auth.js           # /login /register /logout
│   │       ├── profile.js        # /profile/*
│   │       ├── friends.js        # /friends/*
│   │       ├── chat.js           # /chat/*
│   │       ├── notifications.js  # /notifications/*
│   │       ├── players.js        # /players/* (keresés, leaderboard)
│   │       ├── security.js       # /security/* (logout-all-devices)
│   │       └── admin.js          # /admin/*
│   ├── sql/
│   │   ├── database.js           # MySQL pool + tábla init + ensureSchemaColumns
│   │   ├── sql_funtions.js       # Összes DB lekérdezés
│   │   └── create_database.sql   # Referencia séma + 20 teszt-user seed
│   ├── chess/
│   │   └── pvp.js                # Real-time PvP sakk logika
│   ├── profile_pictures/         # Feltöltött avatar-ok (default.png is itt)
│   ├── __tests__/                # Jest tesztek
│   └── package.json
├── frontend/
│   ├── html/                     # index, profile, adminPanel, gameRoom, mailVerified, restorePassword
│   ├── javascript/
│   │   ├── index.js              # Főoldal: login/register, leaderboard, chess launcher
│   │   ├── profile/              # Profil oldal modulok (01–21, sidebar, security log, friends…)
│   │   ├── adminPanel/           # Admin felület modulok (01–29, sections, moderation, audit log…)
│   │   ├── shared/
│   │   │   ├── i18n.js           # HU/EN nyelv-rendszer (DICT, tx, onLangChange, formatDate)
│   │   │   ├── topNavbar.js      # Felső navbar dinamikus elemek
│   │   │   ├── confirmModal.js   # Custom HTML alert/confirm (natív alert helyett)
│   │   │   ├── houseRules.js     # Játékszabályzat modal
│   │   │   ├── maintenanceClient.js # Karbantartás-mód kliens
│   │   │   ├── adminAuthFlow.js  # Admin step-up token + Bearer header
│   │   │   └── validationRules.js # Username/email/password regex + üzenetek
│   │   ├── socketClient.js       # Socket.IO kliens-oldali wrapper + event bus
│   │   ├── chatModal.js          # Chat modal logika
│   │   ├── gameRoom.js           # Sakk szoba
│   │   ├── profileImageUtils.js  # Avatar normalizálás + pending blur
│   │   ├── requestControl.js     # Debounce + AbortController helper
│   │   ├── mailVerified.js       # Email verify landing
│   │   └── restorePassword.js    # Jelszó-visszaállítás landing
│   ├── css/                      # Stíluslapok
│   ├── chess_barold/             # Sakk játékfelület (HTML+JS+CSS+sounds)
│   └── bootstrap/                # Lokális Bootstrap 5
├── readme.md
└── backend/issues.md             # Karbantartási teendők, prioritizálva
```

---

## Konfigurációs sablonok

### `nodemon.json` (létezik a backend mappában)

```json
{
    "watch": ["."],
    "ext": "js",
    "exec": "node server.js",
    "legacyWatch": true,
    "watchOptions": {
        "usePolling": true,
        "interval": 1000
    }
}
```

| Mező | Mire jó |
|---|---|
| `watch` | Figyelt mappa(k) |
| `ext` | Mely kiterjesztések triggereljék az újraindítást |
| `exec` | Indító parancs |
| `legacyWatch` + `usePolling` | Stabilabb fájlfigyelés (Windows / VM esetén ajánlott) |

### `.prettierrc` (opcionális)

```json
{
    "singleQuote": true,
    "bracketSpacing": true,
    "printWidth": 100,
    "tabWidth": 4,
    "trailingComma": "none"
}
```

VS Code-ban:

1. Telepítsd a Prettier extension-t
2. `Settings → Editor: Default Formatter → Prettier`
3. `Settings → Editor: Format On Save → enabled`

Egy soros prettier-kihagyás: a sor elé `// prettier-ignore`.
