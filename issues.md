# 📋 MattMester – Projekt Átvizsgálás & Teendők

> Projekt-szintű review alapján összegyűjtött javaslatok.
> Prioritás: 🔴 kritikus · 🟠 strukturális · 🟡 kód-szintű · 🟢 funkcionális

> Cél: localhoston futó, érettségi szint feletti, de még jól karbantartható verzió.
> Emiatt a lista a valóban hasznos, arányos lépésekre fókuszál; az erősen "enterprise" jellegű bónuszok csak akkor maradnak, ha tényleg beleférnek.

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
| 47 | **Duplikált frontend helper függvények** – `runSafely`, `runSafelyAsync` háromszor van definiálva (index.js, profile.js, adminPanel.js); `escapeHtml` kétszer + 1 leaderboard-variáns; `fetchSessionInfo` kétszer. Közös `frontend/javascript/_utils.js` (window-globalon) feloldja. | [index.js:13](frontend/javascript/index.js#L13), [profile.js:120](frontend/javascript/profile.js#L120), [adminPanel.js:4](frontend/javascript/adminPanel.js#L4) | ☐ |
| 48 | **Három különböző szám-normalizáló** – `parsePositiveInteger` ([_shared.js](backend/api/routes/_shared.js) + [sockets.js:54](backend/sockets.js#L54)) és `normalizePositiveInt` ([sql_funtions.js:2280](backend/sql/sql_funtions.js#L2280)) ugyanazt csinálják enyhén eltérő szignatúrával. Közös `backend/utils/numbers.js` (#38 kibővítése). | backend | ☐ |
| 49 | **`chess_barold` mappa félrevezető néven** – ez nem "régi" chess, hanem az aktuális játékfelület (`frontend/javascript/index.js:860` ide irányít). Átnevezés `chess`-re; egyetlen JS-referencia + HTML ref + 1 mappa-átnevezés. | [frontend/chess_barold/](frontend/chess_barold/) | ☐ |
| 50 | **`requestController.cancelScheduled` sehol sincs hívva** – a [requestControl.js:41](frontend/javascript/requestControl.js#L41) exportálja, de egyetlen hívó sincs. Vagy bekötni az unmount/logout flow-ba a függő debounce-ok megszakítására, vagy törölni. | [frontend/javascript/requestControl.js](frontend/javascript/requestControl.js) | ☐ |
| 51 | **Notification dismiss visszafelé-kompat aliasok takarítása** – a [sql_funtions.js:3365-3366](backend/sql/sql_funtions.js#L3365-L3366)-ben `markAllNotificationsReadForUser` és `markFriendRequestNotificationsReadForUser` aliasok a friss dismiss-átálláskor maradtak, de minden hívó már a `dismiss…` neveket használja. Aliasok és exportok törölhetők, hogy egyetlen kanonikus név maradjon. | [backend/sql/sql_funtions.js](backend/sql/sql_funtions.js) | ☐ |

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
| 52 | **`requireVerifiedEmail` minden hívásnál DB-hit** – az [funtions.js:28](backend/api/funtions.js#L28) `getUserVerificationStatusById`-t hív minden védett endpoint elején. A `is_email_verified` viszont a session-ben már elérhető login után. Cache-elés a session-ből, fallback DB-re csak ha hiányzik. | [backend/api/funtions.js](backend/api/funtions.js) | ☐ |
| 53 | **`validation.js` (5 sor, 3 regex)** – jelenlegi formájában csak konstans-tár; vagy költöztetés a `_shared.js`-be (és törlés), vagy bekötés egy egységesített validátor middleware-be (#17 részeként). | [backend/api/validation.js](backend/api/validation.js) | ☐ |
| 54 | **`default.png` 894 KB** – default avatar képnek extrém nagy. Optimalizálás (WebP / 100 KB alatti PNG) érzékelhetően gyorsítja a loadot és csökkenti a memória-/cache-nyomást, főleg a leaderboardon ahol egyszerre tucat avatar van. | [backend/profile_pictures/default.png](backend/profile_pictures/default.png) | ☐ |
| 55 | **`console.log` sűrűség** – backend 45 + frontend 37 nem-test hívás vegyesen audit/debug/info célra. #18 (strukturált logger) bevezetéséig: a debug-szintű log-okat `if (process.env.DEBUG)` vagy frontend `if (window.MM_DEBUG)` mögé. Production zaj és véletlen PII-leakage csökkentésére. | backend, frontend | ☐ |
| 56 | **DB törlés futás közben → admin escalation** – ha a 3000-es port aktív és a böngésző nyitott, és közben az adatbázis manuálisan újra-init-elődik (új `users` tábla, első ID = admin), a kliens-oldali session userId="1" most az új admin sorra mutat. Két lehetséges javítás: (a) DB init után az aktív session-eket invalidálja a backend (session-store-t üríti); (b) `requireAuth` middleware fast-check, hogy a session role megegyezik-e a DB-beli role-lal — eltérés esetén 401 + logout. (a) iskolai projektre arányosabb. | [backend/sql/database.js](backend/sql/database.js), [backend/server.js](backend/server.js) | ☐ |

---

## 🟢 Bónusz, ha marad idő

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
- **Notification permanens user-oldali eltávolítás** — `notification_reads.dismissed_at` oszlop, `dismissNotificationForUser` / `dismissAllNotificationsForUser` / `dismissFriendRequestNotificationsForUser` SQL fn-ek, `POST /notifications/:id/dismiss` endpoint, multi-tab szinkron `notification:dismissed` / `dismissed-all` / `dismissed-bulk` socket események. Friend accept/reject/block + X gomb + "Mind olvasott" gomb mind permanens DB-szintű eltávolítást vált ki, session-váltás után sem jönnek vissza. Tesztek: [notificationDismiss.test.js](backend/__tests__/notificationDismiss.test.js).

---

## 🎯 Javasolt Sorrend

1. **Session és cookie hardening** → #1 – #3
2. **DB törlés → admin escalation javítása** → #56 (gyors win, valós bug)
3. **Auth/session rendbetétele** → #36, #38, #39, #52
4. **Holt kód és fölös endpointok takarítása** → #40 – #45, #50, #51
5. **Frontend duplikáció feloldása** → #47, #48
6. **Egyetlen értelmes schema/file-takarítás** → #9, #12, #15, #49, #53, #54
7. **Teszt és minőségjavítás** → #24, #27, #28, #55
8. **Bónusz funkciók csak ha marad idő** → #29 – #35