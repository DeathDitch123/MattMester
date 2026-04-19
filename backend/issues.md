# 📋 MattMester – Projekt Átvizsgálás & Teendők

> Projekt-szintű review alapján összegyűjtött javaslatok.
> Prioritás: 🔴 kritikus · 🟠 strukturális · 🟡 kód-szintű · 🟢 funkcionális

---

## 🔴 Kritikus / Biztonsági

| # | Teendő | Hely | Státusz |
|---|--------|------|:------:|
| 1 | **Hardcoded session secret eltávolítása** – fallback secret kódban van, production-ben dobjon hibát ha hiányzik a `SESSION_SECRET` env. | [backend/server.js:22](backend/server.js#L22) | ☐ |
| 2 | **`saveUninitialized: true` → `false`** – minden látogatónak session-t gyárt (GDPR + memória). | [backend/server.js:26](backend/server.js#L26) | ☐ |
| 3 | **`cookie.secure` + `sameSite`** – production-ben `secure: true` és `sameSite: 'strict'` env alapján. | [backend/server.js:29](backend/server.js#L29) | ☐ |
| 4 | **Rate-limit auth endpointokon** – `express-rate-limit` a `/login`, `/register`, `/profile/verify-current-password` útvonalakra (brute-force védelem). | [backend/api/api.js](backend/api/api.js) | ☐ |
| 5 | **`ipCollisionCheck` bekötése a login flow-ba** – megírva, de nincs használva. | [backend/sql/sql_funtions.js](backend/sql/sql_funtions.js) | ☐ |
| 6 | **`helmet` middleware + CSP** – XSS és clickjacking védelem. | [backend/server.js](backend/server.js) | ☐ |
| 7 | **CSRF védelem** – cookie-alapú session + JSON POST → csrf token vagy `SameSite=strict`. | backend | ☐ |

---

## 🟠 Strukturális / File-szervezés

| # | Teendő | Hely | Státusz |
|---|--------|------|:------:|
| 8 | **`api.js` (1381 sor) szétbontása** feature szerint: `routes/auth.js`, `routes/profile.js`, `routes/friends.js`, `routes/security.js`, `routes/admin.js` + aggregátor. | [backend/api/api.js](backend/api/api.js) | ☐ |
| 9 | **`sql_funtions.js` (2415 sor) szétbontása** repo-mintára: `repos/userRepo.js`, `repos/friendRepo.js`, `repos/logRepo.js`, `repos/chessRepo.js`. | [backend/sql/sql_funtions.js](backend/sql/sql_funtions.js) | ☐ |
| 10 | **`profile.js` (3600 sor) modulokra bontása** – `profile/security.js`, `profile/friends.js`, `profile/settings.js`, `profile/stats.js`. | [frontend/javascript/profile.js](frontend/javascript/profile.js) | ☐ |
| 11 | **`profile.css` (2456 sor) komponensekre** + közös design tokenek (`tokens.css`). | [frontend/css/profile.css](frontend/css/profile.css) | ☐ |
| 12 | **Elírások javítása** – `funtions.js` → `functions.js`, `sql_funtions.js` → `sql_functions.js`. | [backend/api/funtions.js](backend/api/funtions.js), [backend/sql/sql_funtions.js](backend/sql/sql_funtions.js) | ☐ |
| 13 | **Repo-gyökér takarítás** – `FIXES_IMPLEMENTED.md`, `issues.txt`, `.txt` jegyzetek `docs/` alá vagy `.gitignore`. | repo root | ☐ |
| 14 | **Üres `gameRoom.css` törlése vagy feltöltése**. | [frontend/css/gameRoom.css](frontend/css/gameRoom.css) | ☐ |
| 15 | **`validation.js` (5 sor)** – vagy valódi validátor-réteg (`zod`/`joi`), vagy összeolvasztás. | [backend/api/validation.js](backend/api/validation.js) | ☐ |

---

## 🟡 Kód-szintű

| # | Teendő | Hely | Státusz |
|---|--------|------|:------:|
| 16 | **Központi error-handler middleware** + `asyncHandler` wrapper → ismétlődő try/catch-ek eltüntetése. | [backend/server.js](backend/server.js), [backend/api/api.js](backend/api/api.js) | ☐ |
| 17 | **Input validáció egységesítése** – `zod`/`joi` séma per endpoint, `validate(schema)` middleware. | backend/api | ☐ |
| 18 | **Strukturált logger** – `pino` vagy `winston` + log szintek + request-id a `console.log/warn/error` helyett. | backend | ☐ |
| 19 | **Magic string enumok** – `eventType`, `eventCategory` konstansok egy `logEvents.js`-ben (a `friends` vs `social` bug emlékére). | backend | ☐ |
| 20 | **SQL prepared statement audit** – minden query használjon `?` paramétert. | [backend/sql/sql_funtions.js](backend/sql/sql_funtions.js) | ☐ |
| 21 | **Migráció-runner bevezetése** – `backend/sql/migrations/` létezik, de futtató nincs (pl. `umzug`, `node-pg-migrate` MySQL verzió). | [backend/sql/migrations/](backend/sql/migrations/) | ☐ |
| 22 | **Socket auth audit** – minden event csekkolja a `socket.request.session.userId`-t. | [backend/sockets.js](backend/sockets.js) | ☐ |
| 23 | **Típusozás** – minimum `// @ts-check` + JSDoc, ideálisan TypeScript migráció. | projekt egész | ☐ |
| 24 | **Tesztlefedettség bővítése** – auth / barát / log endpointok. Jelenleg csak chat + rate-limiter. | [backend/__tests__/](backend/__tests__/) | ☐ |
| 25 | **Frontend bundler** – Vite vagy esbuild, hogy ES modulokká bontható legyen. | frontend | ☐ |
| 26 | **`.env.example`** – új kontribútornak induló sablon. | repo root | ☐ |
| 27 | **`trust proxy: 1` dokumentálása** – csak reverse proxy mögött helyes. | [backend/server.js:90](backend/server.js#L90) | ☐ |
| 28 | **Cleanup service robusztusság** – idempotens + lock, vagy külső scheduler (cron). | [backend/server.js:255](backend/server.js#L255) | ☐ |

---

## 🟢 Funkcionális Fejlesztések

| # | Teendő | Státusz |
|---|--------|:------:|
| 29 | **2FA (TOTP)** – jól illeszkedik a security szekcióba. | ☐ |
| 30 | **Email verifikáció + jelszó-visszaállítás** – jelenleg hiányzik. | ☐ |
| 31 | **Aktív session-ök listája + egyedi visszavonás** – most csak „logout all devices" van. | ☐ |
| 32 | **Új eszköz / IP értesítés** – a begyűjtött IP+UA adatok értelmes hasznosítása. | ☐ |
| 33 | **Admin audit log** – `admin` event_category jelenleg üres. | ☐ |
| 34 | **User log retenció** – régi rekordok archiválása/törlése. | ☐ |
| 35 | **API verziózás** – `/api/v1/…` későbbi mobil kliens miatt. | ☐ |

---

## 🎯 Javasolt Sorrend

1. **Security csomag** → #1 – #4 (gyors, nagy hatás)
2. **`ipCollisionCheck` + helmet + CSRF** → #5 – #7
3. **`api.js` szétbontása** → #8 (minden további refaktor alapja)
4. **Migráció-runner** → #21 (schema változtatás előtt)
5. **Enum konstansok + validáció** → #17, #19
6. **Funkcionális: 2FA / email verifikáció** → #29, #30
