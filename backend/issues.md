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
| 5 | **`ipCollisionCheck` bekötése a login flow-ba** – megírva, de nincs használva. | [backend/sql/sql_funtions.js](backend/sql/sql_funtions.js) | ☐ |
| 6 | **`helmet` middleware + CSP** – XSS és clickjacking védelem. | [backend/server.js](backend/server.js) | ☐ |
| 7 | **CSRF védelem** – cookie-alapú session + JSON POST → csrf token vagy `SameSite=strict`. | backend | ☐ |

---

## 🟠 Strukturális / File-szervezés

| # | Teendő | Hely | Státusz |
|---|--------|------|:------:|
| 9 | **`sql_funtions.js` (2415 sor) szétbontása** repo-mintára: `repos/userRepo.js`, `repos/friendRepo.js`, `repos/logRepo.js`, `repos/chessRepo.js`. | [backend/sql/sql_funtions.js](backend/sql/sql_funtions.js) | ☐ |
| 10 | **`profile.js` (3600 sor) modulokra bontása** – `profile/security.js`, `profile/friends.js`, `profile/settings.js`, `profile/stats.js`. | [frontend/javascript/profile.js](frontend/javascript/profile.js) | ☐ |
| 11 | **`profile.css` (2456 sor) komponensekre** + közös design tokenek (`tokens.css`). | [frontend/css/profile.css](frontend/css/profile.css) | ☐ |
| 12 | **Elírások javítása** – `funtions.js` → `functions.js`, `sql_funtions.js` → `sql_functions.js`. | [backend/api/funtions.js](backend/api/funtions.js), [backend/sql/sql_funtions.js](backend/sql/sql_funtions.js) | ☐ |
| 13 | **Repo-gyökér takarítás** – `FIXES_IMPLEMENTED.md`, `issues.txt`, `.txt` jegyzetek `docs/` alá vagy `.gitignore`. | repo root | ☐ |
| 14 | **Üres `gameRoom.css` törlése vagy feltöltése**. | [frontend/css/gameRoom.css](frontend/css/gameRoom.css) | ☐ |
| 15 | **`validation.js` (5 sor)** – vagy valódi validátor-réteg (`zod`/`joi`), vagy összeolvasztás. | [backend/api/validation.js](backend/api/validation.js) | ☐ |
| 36 | **`requireAuth` / `requireAdmin` duplikáció** – a [server.js:96-108](backend/server.js#L96-L108)-ben lévő guardok az [funtions.js](backend/api/funtions.js) `isAuthenticated` / `isAdmin` megfelelői, csak redirect vs. JSON különbséggel. Közös `middleware/auth.js`-be: `pageGuard` (redirect) + `apiGuard` (JSON). | [backend/server.js](backend/server.js), [backend/api/funtions.js](backend/api/funtions.js) | ☐ |
| 37 | **Chat konstansok duplikálva** – `CHAT_RATE_LIMIT_MAX_MESSAGES`, `CHAT_RATE_LIMIT_WINDOW_MS`, `CHAT_BLACKLIST_POLICY`, `CHAT_MAX_MESSAGE_LENGTH` kétszer van definiálva a [chat.js](backend/api/routes/chat.js) és [sockets.js](backend/sockets.js) fájlokban. Tedd át a [chatUtils.js](backend/api/chatUtils.js)-be egy konfig-objektumként. | [backend/api/routes/chat.js](backend/api/routes/chat.js), [backend/sockets.js](backend/sockets.js) | ☐ |
| 38 | **`parsePositiveInteger` duplikáció** – ugyanaz a függvény a [_shared.js](backend/api/routes/_shared.js) és [sockets.js:54](backend/sockets.js#L54) között. Közös `backend/utils/parse.js`. | backend | ☐ |
| 39 | **Session-mező setter helper** – a login és register ugyanazt a 8 mezőt állítja be a session-ben. `setSessionFromUser(request, user)` helper az [auth.js](backend/api/routes/auth.js)-ben. | [backend/api/routes/auth.js](backend/api/routes/auth.js) | ☐ |

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
| 22 | **Socket auth audit** – minden user-specifikus event csekkolje a `socket.request.session.userId`-t. (Admin oldal: az `admin:*` prefixű eventeket a [sockets.js](backend/sockets.js) `socket.use` middleware-e automatikusan védi, plusz `requireAdminSocket` helper is elérhető.) | [backend/sockets.js](backend/sockets.js) | ☐ |
| 23 | **Típusozás** – minimum `// @ts-check` + JSDoc, ideálisan TypeScript migráció. | projekt egész | ☐ |
| 24 | **Tesztlefedettség bővítése** – auth / barát / log endpointok. Jelenleg csak chat + rate-limiter. | [backend/__tests__/](backend/__tests__/) | ☐ |
| 25 | **Frontend bundler** – Vite vagy esbuild, hogy ES modulokká bontható legyen. | frontend | ☐ |
| 26 | **`.env.example`** – új kontribútornak induló sablon. | repo root | ☐ |
| 27 | **`trust proxy: 1` dokumentálása** – csak reverse proxy mögött helyes. | [backend/server.js:90](backend/server.js#L90) | ☐ |
| 28 | **Cleanup service robusztusság** – idempotens + lock, vagy külső scheduler (cron). | [backend/server.js:255](backend/server.js#L255) | ☐ |
| 40 | **Holt kód: `services.handleConnection`** – a [services.js:71-92](backend/services.js#L71-L92) függvényt felváltotta a [sockets.js](backend/sockets.js) `registerSocket`-je, sehol nincs hívva. Törölhető. | [backend/services.js](backend/services.js) | ☐ |
| 41 | **Nem használt chess végpontok** – `POST /api/chess/:id/reset` és `DELETE /api/chess/:id` frontendből nincs hívva. Vagy kösd be őket, vagy törölhetők. | [backend/api/chess_api.js](backend/api/chess_api.js) | ☐ |
| 42 | **Nem használt `/profile/verify-current-password` végpont** – defined but never called. Vagy használd pre-check-ként a settings modalban, vagy töröld. | [backend/api/routes/profile.js:46](backend/api/routes/profile.js#L46) | ☐ |
| 43 | **`/admin/test` smoke-test végpont** – production-ben felesleges, vagy csak `NODE_ENV=development` esetén regisztráld. | [backend/api/routes/admin.js](backend/api/routes/admin.js) | ☐ |
| 44 | **`viewUser` stub az admin panelben** – csak modalt nyit, nincs mögötte API. Vagy implementáld (tipp: `GET /api/admin/users/:id`), vagy távolítsd el a gombot. | [frontend/javascript/adminPanel.js:115](frontend/javascript/adminPanel.js#L115) | ☐ |
| 45 | **Elérhetetlen ellenőrzés a profil settings-ben** – a [profile.js:119](backend/api/routes/profile.js#L119) belső `if (!currentPassword)` sosem fut le, mert a 113. soron már eldob. Törölhető. | [backend/api/routes/profile.js](backend/api/routes/profile.js) | ☐ |
| 46 | **Chess `/user-elo` session-ből olvashat** – a `request.session.elo` már be van állítva login után, felesleges a DB-hit minden hívásnál. Fallback DB-ről, ha a session mező hiányzik. | [backend/api/chess_api.js:44](backend/api/chess_api.js#L44) | ☐ |

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

## ✅ Megoldott (archívum)

- **#8** — `api.js` szétbontása (`routes/auth.js`, `profile.js`, `friends.js`, `security.js`, `players.js`, `chat.js`, `admin.js` + `_shared.js` + aggregátor `api.js`).
- **Admin session auth** — az [admin.js](backend/api/routes/admin.js) router-szintű `isAdmin` middleware-t használ, így minden új admin végpont automatikusan védett.
- **Admin socket auth** — a [sockets.js](backend/sockets.js) `socket.use` middleware-e minden `admin:` prefixű eventet automatikusan blokkol nem-admin kliensek felől, és a `requireAdminSocket(socket, handler)` helper is elérhető manuális kézi csomagoláshoz.
- **#4** — Rate-limit auth endpointokon: univerzális [rateLimiter.js](backend/api/middleware/rateLimiter.js) (`createRateLimiter` factory + `authLoginLimiter`, `authRegisterLimiter`, `verifyPasswordLimiter` presetek). Bekötve a `/login`, `/register`, `/profile/verify-current-password` útvonalakra; új endpointokhoz a factory-val pillanatok alatt készíthető további limiter.

---

## 🎯 Javasolt Sorrend

1. **Security csomag** → #1 – #4 (gyors, nagy hatás)
2. **`ipCollisionCheck` + helmet + CSRF** → #5 – #7
3. **Holt kód kitakarítása** → #40 – #44 (gyors nyereség)
4. **Duplikációk feloldása** → #36 – #39
5. **Migráció-runner** → #21 (schema változtatás előtt)
6. **Enum konstansok + validáció** → #17, #19
7. **Funkcionális: 2FA / email verifikáció** → #29, #30
