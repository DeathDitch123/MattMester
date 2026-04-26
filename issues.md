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

## 🛡️ Admin panel (külön track) — F1–F9 fázisok

> A teljes architektúra: [ADMIN_PANEL.md](ADMIN_PANEL.md). Ezek a teendők a doksit bontják lépésekre.

| # | Teendő | Hely | Státusz |
|---|--------|------|:------:|
| 60 | **F1. Séma + token alapok** – `users.is_super_admin` oszlop, `admin_tokens`, `admin_audit_log`, `admin_alert_log`, `admin_rate_escalations` táblák. `metric_key/metric_value/metric_delta` mezők és `idx_user_logs_user_metric_time` index eltávolítása a `user_logs`-ból (jelenleg holt kód, nincs hívó). Admin seed `is_super_admin=TRUE`-val. **DB üres → nincs migráció, csak séma sablont kell átírni.** | [backend/sql/create_database.sql](backend/sql/create_database.sql), [backend/sql/database.js](backend/sql/database.js), [backend/sql/sql_funtions.js](backend/sql/sql_funtions.js) | ☐ |
| 61 | **F2. Step-up admin token** – `POST /api/admin/auth/elevate / refresh / revoke / status` endpointok. `parseAdminToken` middleware (Authorization Bearer header + DB hash check). 15 perc sliding TTL. Token hash SHA-256-tal tárolva, plain token sosem DB-ben/logban. Külön `adminElevateLimiter` (5 / 15 perc). | [backend/api/routes/admin.js](backend/api/routes/admin.js), [backend/api/funtions.js](backend/api/funtions.js) | ☐ |
| 62 | **F3. AuditLogService + middleware lánc** – `requireReasonOnMutate` (10/30 char min), `auditContext` (ULID requestId), `auditFlush` (sikeres + sikertelen ág is naplóz). Redaction allowlist: `password_hash`, `email_verification_token_hash`, `reset_password_token` SOSEM kerülnek be. Diff-only normál, full snapshot critical-nél. | backend/api/admin/* (új mappa) | ☐ |
| 63 | **F4. Admin socket namespace `/admin`** – `io.of('/admin')` + handshake auth (session + admin token kettős check). `admin:room` szoba. `admin:replay:request/batch` reconnect után, max 200/batch, 24h ablak, max 5 batch/kapcsolat. Eseménynevezéktan: `admin:<domain>:<action>`. | [backend/sockets.js](backend/sockets.js) | ☐ |
| 64 | **F5. AlertingService + adaptive rate limit** – jogosulatlan próbálkozás → audit + `admin:alert:unauthorized` broadcast + escalation (`multiplier=5`, 15 perc, IP-scope). `admin_rate_escalations` tábla a meglévő `rateLimiter.js`-be bekötve. | [backend/api/middleware/rateLimiter.js](backend/api/middleware/rateLimiter.js) | ☐ |
| 65 | **F6. Super-admin műveletek** – `POST /api/admin/admins/grant`, `POST /api/admin/admins/revoke`, `GET /api/admin/admins`. Utolsó super-admin lock (saját `is_super_admin` nem vehető le, ha utolsó). Mind `severity='critical'`. | backend/api/routes/admin.js | ☐ |
| 66 | **F7. Meglévő admin endpointok migrálása** – `notifications/send`, `profile-images/{approve,reject}`, `export-users` átáll az új middleware-láncra. Approve-nál reason **opcionális**, reject-nél **kötelező**. CSV export `info` severity, reason opcionális. | [backend/api/routes/admin.js](backend/api/routes/admin.js) | ☐ |
| 67 | **F8. Read-only admin API** – `/admin/audit/search` (actor/action/időtartomány/severity/target szűrőkkel), `/admin/audit/export` (CSV), `/admin/alerts/recent`, `/admin/users/list`, `/admin/stats/snapshot`. | backend/api/routes/admin.js | ☐ |
| 68 | **F9. Audit retention job (18 hónap, hard delete)** – napi 1× `setInterval` az `initDatabase` után. Saját audit entry minden futáshoz (`action='audit.retention.run'`, törölt sorok száma metadata-ban). Iskolai projekthez hard delete elég; JSONL archive opció a `🟢 Bónusz`-ban. | [backend/server.js](backend/server.js) | ☐ |
| 69 | **F10. Admin frontend** – külön iteráció, akkor indul, ha az API + WS oldalon F1–F9 zöld. | [frontend/javascript/adminPanel.js](frontend/javascript/adminPanel.js) | ☐ |
| 70 | **`#43` ütközés:** az F2 fázisban a `/admin/test` endpoint az új middleware-láncot kapja meg, és csak `NODE_ENV=development` esetén regisztráljuk. | [backend/api/routes/admin.js](backend/api/routes/admin.js) | ☐ |
| 71 | **`#33` és `#34` redundancia:** ezeket az új admin track (F3, F9) lefedi, a Bónusz-szekcióban már nem szükséges külön nyilvántartani. | – | ☐ |

---

## 🟢 Bónusz, ha marad idő

| # | Teendő | Státusz |
|---|--------|:------:|
| 29 | **2FA (TOTP)** – jól illeszkedik a security szekcióba. Production előtt mindenképp; admin elevate-re érdemes először. | ☐ |
| 30 | **Email verifikáció + jelszó-visszaállítás** – jelenleg hiányzik. | ☐ |
| 31 | **Aktív session-ök listája + egyedi visszavonás** – most csak „logout all devices" van. | ☐ |
| 32 | **Új eszköz / IP értesítés** – a begyűjtött IP+UA adatok értelmes hasznosítása. | ☐ |
| 33 | ~~**Admin audit log**~~ → lefedi F3 (#62). | ✅ áthelyezve |
| 34 | ~~**User log retenció**~~ → admin track lefedi F9 (#68); user_logs-ra külön nem tervezünk retention-t most. | ✅ áthelyezve |
| 35 | **API verziózás** – `/api/v1/…` későbbi mobil kliens miatt. | ☐ |
| 80 | **Redis socket adapter (Socket.IO `@socket.io/redis-adapter`)** – jelenleg a backend egyetlen Node.js processben fut localhoston, így a `/admin` namespace fan-outja in-memory megoldja. **Miért kerülne fel később:** ha valaha 2+ process / horizontális skálázás kell (cluster mode, PM2 fork, Docker replica), az `admin:room` üzeneteket csak az a process küldi, amelyikhez a kliens csatlakozott. Redis pub/sub adapterrel az összes process megkapja. | [backend/sockets.js](backend/sockets.js), [backend/server.js](backend/server.js) | ☐ |
| 81 | **IP allowlist admin elevate-re** – jelenleg bárhonnan elérhető a `/api/admin/auth/elevate` (login után). **Miért kerülne fel később:** production előtt érdemes lehet egy `ADMIN_IP_ALLOWLIST` env változót bevezetni (vesszővel elválasztott CIDR lista), és az elevate endpoint csak onnan engedjen. Iskolai projektben localhost = 127.0.0.1 fix, ezért most felesleges. | [backend/api/routes/admin.js](backend/api/routes/admin.js) | ☐ |
| 82 | **Async audit queue** – jelenleg az `AuditLogService.record()` szinkron DB-be ír. **Miért kerülne fel később:** ha az admin műveletek száma magasra nő (több admin egyszerre, automatizált batch műveletek), a fő tranzakció DB-re vár. In-memory ring buffer + dedikált async writer worker megoldja. Iskolai projektben még nincs ilyen volumen. | backend/api/admin/auditService.js | ☐ |
| 83 | **JSONL audit archive 18 hónap után** – a hard delete helyett gz-tömörített `audit_archive/YYYY-MM.jsonl.gz` export majd delete. Production-ben jogi/audit célból hasznos. | backend/server.js (retention job) | ☐ |
| 84 | **HMAC chain az audit log integritáshoz** – minden új audit sor `prev_hash` mezője a megelőző sor SHA-256-ja. Tampering detektálható. Production és audit-érzékeny környezethez. | backend/api/admin/auditService.js | ☐ |
| 85 | **Append-only DB user az audit táblákra** – külön MySQL user, akinek csak `INSERT` joga van a `admin_audit_log`-ra, `UPDATE`/`DELETE` nincs. A retention job külön privilegizált user-rel fut. Production hardening. | [backend/sql/database.js](backend/sql/database.js) | ☐ |
| 86 | **Live nézői mód (spectator)** – futó meccshez read-only WS csatlakozás (nem admin-specifikus, hanem új feature). Külön permission és socket eseménynév-tér. | [backend/sockets.js](backend/sockets.js) | ☐ |

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
4. **Admin panel track (F1 → F9)** → #60 – #69 (ütemezett, lépésenként; séma a [ADMIN_PANEL.md](ADMIN_PANEL.md) alapján)
5. **Holt kód és fölös endpointok takarítása** → #40 – #45, #50, #51, #70
6. **Frontend duplikáció feloldása** → #47, #48
7. **Egyetlen értelmes schema/file-takarítás** → #9, #12, #15, #49, #53, #54
8. **Teszt és minőségjavítás** → #24, #27, #28, #55
9. **Bónusz funkciók csak ha marad idő** → #29 – #32, #35, #80 – #86