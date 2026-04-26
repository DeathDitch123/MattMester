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

A `backend/.env` fájl opcionális — ha hiányzik, a backend észszerű alapértelmezésekkel indul (csak az email küldés vált fallback "json-dev" módba). Példa tartalom:

```env
# CORS — vesszővel elválasztott origin-lista
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# Session secret — production-ben kötelező legyen erős érték
SESSION_SECRET=cseréld-le-egy-erős-random-stringre

# Chat moderáció: 'soft_warn' | 'hard_block'
CHAT_BLACKLIST_POLICY=hard_block

# SMTP — email verifikációhoz / jelszó-visszaállításhoz
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=kuldo@example.com
SMTP_PASS=app-password-vagy-smtp-jelszo
SMTP_SECURE=false
SMTP_FROM=MattMester <kuldo@example.com>
PUBLIC_BASE_URL=http://127.0.0.1:3000
```

| Változó | Kötelező? | Default |
|---|---|---|
| `ALLOWED_ORIGINS` | nem | `http://localhost:3000` |
| `SESSION_SECRET` | nem (de production-ben igen) | hardcoded fallback |
| `CHAT_BLACKLIST_POLICY` | nem | `hard_block` |
| `SMTP_*` | nem | fallback `json-dev` mód (logba) |
| `PUBLIC_BASE_URL` | csak SMTP-hez | `http://127.0.0.1:3000` |

---

## Indítás és parancsok

A backend mappában (`cd backend`):

| Parancs | Mire jó |
|---|---|
| `npm run dev` | Fejlesztői mód: `kill-port 3000` + nodemon (auto-restart fájlváltozásra) |
| `npm run dev:raw` | Csak nodemon, port-felszabadítás nélkül |
| `npm run start` | Egyszerű `node server.js` (nincs auto-restart) |
| `npm test` | Összes Jest teszt futtatása |
| `npm run test:watch` | Tesztek figyelési módban |
| `npm run test:coverage` | Code coverage report |

Ha a 3000-es port lefagyott a háttérben:

```bash
npx kill-port 3000
```

---

## Tesztek

Helye: [backend/__tests__/](backend/__tests__/). A `npm test` jelenleg **7 teszt-fájlt, 71 tesztet** futtat:

| Fájl | Lefedi |
|---|---|
| `chat.test.js` | Chat API endpointok, üzenet validáció |
| `chatLifecycle.test.js` | Konverzáció létrehozás / cleanup / blokkolás |
| `rate-limiter.test.js` | Rate limiter middleware logika |
| `sessionStateRefresh.test.js` | Session-váltás, real-time chat badge |
| `profileImageUtils.test.js` | Profilkép útvonal-normalizálás |
| `profileImageVisibility.test.js` | Profilkép láthatósági szabályok (pending/approved/admin) |
| `notificationDismiss.test.js` | Értesítés permanens user-oldali eltávolítás (multi-tab szinkron + SQL filter) |

A coverage küszöb (`package.json` → `jest.coverageThreshold`) jelenleg 50% minden dimenzióra.

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
│   │   ├── profile.js            # Profil oldal: friends, settings, notifications, chat
│   │   ├── adminPanel.js         # Admin felület
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
