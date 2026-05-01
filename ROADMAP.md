# MattMester — Végrehajtási roadmap (localhost-arányos)

> **Cél**: a projekt egy karbantartható, stabil localhost-szintű állapotba húzása. Minden szekció egy Opus 4.7 (thinking + high) session keretében végrehajtható.
> **Kontextus**: iskolai projekt, egyetlen Node-process, single user/host, manuális DB-resetek. Enterprise-réteg (zod/joi, pino/winston, Vite, TypeScript big-bang, Redis socket adapter, migration runner) **nem cél**.
> **Kódolási keretek minden szekcióban**: koherens elnevezés (azonos fogalom = azonos név), funkciónként **legfeljebb 1 return**, minden async / IO / DB műveletnél **try-catch**, csak "miért"-kommentek (a "mit"-et a kód mondja meg).

---

## Jelenlegi állapot rövid összefoglaló

- **Kész**: api.js szétbontva (`routes/`), rate-limiter (auth endpointokon), notification dismiss permanens, admin F1 séma + token, F2 elevate/refresh/revoke/status, F3 audit middleware-lánc, F10 frontend admin auth flow (`shared/adminAuthFlow.js`), WS event-name szinkron (`admin:alert:suspicious_pattern`), `GET /api/public/admin-constants` endpoint, **S1 session/cookie/helmet hardening + `.env.example` + DB-credek env-alapon (2026-04-29)**.
- **Részben (vázfájlok léteznek, lezárás nyitva)**: F4 `socketNamespace.js`, F5 `alertingService.js` + `adminRateLimiter.js`, F6 `superAdminRoutes.js`, F9 `retentionJob.js`. Bekötés és viselkedés-validálás hiányzik.
- **Nyitott**: koherens auth-/util-réteg, F7 endpoint-migráció, F8 read-only admin API, F10 admin UI MVP, halott kód, nagy fájlok bontása, minőség (asyncHandler, prepared statement audit, tesztek).

## Kihagyott (és miért)

| Tétel | Miért nem most |
|---|---|
| `#5` ipCollisionCheck bekötés | Localhoston minden kapcsolat 127.0.0.1 → vagy minden loginnál tűz, vagy bypass-szal értelmetlen. Halott kódként **S5**-ben törölni. |
| `#7` CSRF token | `cookie.sameSite='strict'` + JSON-only POST elég ezen a szinten. |
| `#17` zod/joi | Endpoint-átírás enterprise-overhead; kézi check elég. |
| `#18` pino/winston | `#55` DEBUG-flag (S23) megoldja iskolai szinten. |
| `#21` migráció-runner | DB üres induláskor, nincs schema-történelem. |
| `#23` TypeScript migráció | Túl drasztikus; `// @ts-check` fokozatosan opcionálisan jöhet később. |
| `#25` Vite/esbuild | Nincs build-pipeline kényszer. |
| `#80–#86` (összes bónusz) | Production-targetek, iskolai localhostra aránytalan. |

---

## Iteráció 1 — Biztonsági alap

### S1. Session, cookie és security headers hardening ✅ (2026-04-29)

**Cél**: env-alapú, production-ready session és HTTP-header beállítások; új kontribútor sablonja.

**Tartalom (issues.md)**: `#1` ✅, `#2` ✅, `#3` ✅, `#6` ✅, `#26` ✅, `#27` ✅.

**Eredmény**:
- [backend/server.js](backend/server.js) `resolveSessionSecret()`: production-ben hiány → `process.exit(1)`; dev-ben `crypto.randomBytes(32)` + warning.
- `saveUninitialized: false`; `cookie.secure` és `cookie.sameSite` az `IS_PRODUCTION` flagre kötve (production → `secure: true`, `sameSite: 'strict'`).
- `helmet()` minimális saját-asset CSP-vel: `default-src 'self'`, script/style `'self' + 'unsafe-inline'` (későbbi nonce-os szigorítás külön issue), `connect-src 'self' ws: wss:` Socket.IO-hoz, `frame-ancestors 'self'`. HSTS csak production-ben.
- [backend/sql/database.js](backend/sql/database.js): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` env-alapon, XAMPP-default fallbackkel.
- [.env.example](.env.example): `NODE_ENV`, `SESSION_SECRET`, `ALLOWED_ORIGINS`, DB-credek, `DEBUG`, `CHAT_BLACKLIST_POLICY`, SMTP-csoport.
- [readme.md](readme.md): új env-tábla minden változóra + "trust proxy: 1 használata" alszekció (helyes / helytelen deploymintákkal).
- `helmet ^8.1.0` hozzáadva a `backend/package.json` dependencies-hez.
- Validálás: `jest --runInBand` 11/11 suite, 104/104 teszt zöld; `node -e "require('./backend/server.js')"` betölt (csak EADDRINUSE-en lép ki).

**Érintett fájlok**: `backend/server.js`, új `.env.example` (repo root), `readme.md` (rövid kiegészítés a trust-proxy + env változókról).

**Kockázatcsökkentés**: session-hijack vektor zárása, GDPR/memória nyomás csökkentése, XSS / clickjacking alapvédelem, félrekonfigurált deploy buktatóinak megelőzése.

**Sikerkritérium**:
- `SESSION_SECRET` hiányában production-ben azonnali fail; dev-ben warning + véletlen érték.
- `saveUninitialized: false`.
- `cookie.secure` és `cookie.sameSite` env-függő (`production` → `secure: true`, `sameSite: 'strict'`).
- `helmet()` + minimális saját CSP a static assetekre.
- `.env.example` tartalmazza: `SESSION_SECRET`, `ALLOWED_ORIGINS`, `NODE_ENV`, DB-credek, `DEBUG` flag.
- `trust proxy: 1` mellé komment, hogy csak reverse proxy mögött helyes.
- A meglévő tesztek (`npx jest --config backend/jest.config.js --runInBand`) zöldek.

**Koherencia-fókusz**: minden új beállítás env-változóból olvasva, ugyanazokkal a nevekkel, mint amik az `.env.example`-ben szerepelnek.

#### Prompt (S1)

```
Hajtsd végre az S1 szekció tervét a `MattMester/ROADMAP.md` szerint:
- backend/server.js: SESSION_SECRET hiányában production-ben azonnali kilépés (dev-ben random fallback + warning), saveUninitialized=false, cookie.secure és cookie.sameSite env-alapú, helmet() + minimális saját-asset-CSP.
- Új `.env.example` a repo gyökerében a kötelező változókkal (SESSION_SECRET, ALLOWED_ORIGINS, NODE_ENV, DB-credek, DEBUG).
- readme.md kiegészítése a trust proxy: 1 helyes használatával.
- Issue-jelölések frissítése (issues.md) #1, #2, #3, #6, #26, #27 → ✅ ahol teljesül.

Kötelező keretek:
- Kerüld a koherenciahibákat: minden új env-változó pontosan ugyanazon a néven szerepel a kódban, az .env.example-ben és a doksiban.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld + `node -e "require('./backend/server.js')"` nem dob (vagy port-ütközésen kívül).
```

---

### S2. DB-reinit → admin escalation védelem

**Cél**: ha a DB manuálisan újra-init-elődik futás közben, a már nyitott session-ök ne öröklődjenek az új user-sorokra.

**Tartalom**: `#56`.

**Érintett fájlok**: `backend/sql/database.js`, `backend/server.js` (session-store referencia), esetleg új `backend/auth/sessionStore.js`, ha a store különálló modulra kerül.

**Kockázatcsökkentés**: privilege-escalation ablak megszűnése iskolai DB-reset workflow-nál.

**Sikerkritérium**:
- Az `initDatabase()` (vagy a séma-újraépítő ágat hívó kód) sikeres újra-init után az aktív session-store kiürül (memória- vagy MySQL-store mindkét esetben).
- A flow auditban is megjelenik (audit-action: `db.reinit.session_purge`), ha az admin auditService elérhető; ha nem, console-warn elég.
- Új teszt: `backend/__tests__/sessionPurgeOnReinit.test.js` — mockolt store, init után üres.

**Koherencia-fókusz**: a session-purge ugyanazon a néven jelenjen meg az auditban és a doksiban (pl. `db.reinit.session_purge`).

#### Prompt (S2)

```
Hajtsd végre az S2 szekció tervét a `MattMester/ROADMAP.md` szerint:
- backend/sql/database.js: az újra-init után signaling (event vagy callback) a server.js felé.
- backend/server.js: a signal hatására a session-store kiürítése (express-session store .clear() vagy ekvivalens).
- Audit-bejegyzés a `db.reinit.session_purge` action-nel, ha az adminAuditService elérhető (require try-catchben, soft-fallback console-warn).
- Új teszt `backend/__tests__/sessionPurgeOnReinit.test.js`: mockolt store, init után .clear() meghívva.
- issues.md #56 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: egységes action-név (`db.reinit.session_purge`) a kódban, auditban, doksiban.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch (a require-ek és a store-műveletek is).
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld.
```

---

## Iteráció 2 — Backend koherencia és duplikációk

### S3. Auth middleware konszolidáció

**Cél**: egyetlen forrás-igazság az authentikációs guardokra; a session-mező-set és az email-verifikáció ellenőrzés is egyhelyt.

**Tartalom**: `#36`, `#39`, `#52`.

**Érintett fájlok**: új `backend/api/middleware/auth.js`, `backend/server.js`, `backend/api/funtions.js`, `backend/api/routes/auth.js` (login + register), minden `isAuthenticated`/`isAdmin`/`requireVerifiedEmail` hívó.

**Kockázatcsökkentés**: redirect/JSON viselkedés divergáló 401-ek megszűnése, új session-mezők elfelejtett beállításának megelőzése, felesleges DB-hit per-request.

**Sikerkritérium**:
- `pageGuard` (HTML-redirect), `apiGuard` (JSON 401), `adminGuard` egyetlen modulban; minden hívó ezekre vált.
- `setSessionFromUser(request, user)` helper, login és register ugyanezt hívja.
- `requireVerifiedEmail` először a session `is_email_verified` mezőt nézi, csak hiányában megy DB-re.
- Tesztek (legalább a meglévők) zöldek; lehetőleg egy gyors új teszt arra, hogy `setSessionFromUser` ugyanazokat a kulcsokat állítja be mindkét belépési ponton.

**Koherencia-fókusz**: a guard-nevek (`pageGuard`, `apiGuard`, `adminGuard`) végig egységesek; a régi `isAuthenticated`/`isAdmin` exportok deprecated-state-be kerülnek (törlés `S5`-ben).

#### Prompt (S3)

```
Hajtsd végre az S3 szekció tervét a `MattMester/ROADMAP.md` szerint:
- Új backend/api/middleware/auth.js: pageGuard (redirect /login-ra), apiGuard (JSON 401), adminGuard.
- backend/server.js és minden route hívó (auth.js, profile.js, security.js, players.js, friends.js, chat.js, notifications.js): isAuthenticated/isAdmin használat helyett pageGuard/apiGuard/adminGuard.
- backend/api/routes/auth.js: setSessionFromUser(request, user) helper, login + register ugyanezt hívja.
- backend/api/funtions.js requireVerifiedEmail: session-cache-first, DB-fallback ha hiányzik.
- A régi isAuthenticated/isAdmin exportok maradnak deprecated-jelölve (törlés S5-ben).
- Új teszt: setSessionFromUser ugyanazon kulcsokat állítja be login és register után.
- issues.md #36, #39, #52 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: egységesen pageGuard/apiGuard/adminGuard, sehol nem keveredjen a régi névvel.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld.
```

---

### S4. Backend utility-konszolidáció

**Cél**: a számparszolók, chat-konstansok és audit eventType-ok egyetlen helyről kerülnek elő.

**Tartalom**: `#37`, `#38`, `#48`, `#19`.

**Érintett fájlok**: új `backend/utils/numbers.js`, új `backend/api/logEvents.js`, `backend/api/chatUtils.js`, `backend/api/routes/chat.js`, `backend/sockets.js`, `backend/api/routes/_shared.js`, `backend/sql/sql_funtions.js` (ahol `normalizePositiveInt` van).

**Kockázatcsökkentés**: rate-limit-érték HTTP/WS oldali divergencia, eltérő szám-validáció eltérő hívási helyeken, magic string event-elgépelés.

**Sikerkritérium**:
- `backend/utils/numbers.js` exportál egy egységes `parsePositiveInteger` függvényt (egy szignatúrával); minden korábbi hívó ide vált.
- `backend/api/chatUtils.js` tartalmazza `CHAT_RATE_LIMIT_MAX_MESSAGES`, `CHAT_RATE_LIMIT_WINDOW_MS`, `CHAT_BLACKLIST_POLICY`, `CHAT_MAX_MESSAGE_LENGTH` egy konfig-objektumban; chat.js és sockets.js innen importál.
- `backend/api/logEvents.js` tartalmaz `EVENT_TYPES` és `EVENT_CATEGORIES` enumokat (Object.freeze); a `friends`/`social` típusú elgépelések fixed konstansra cserélve.
- A meglévő tesztek zöldek.

**Koherencia-fókusz**: minden szám-, konstans- és event-érték a saját single-source-of-truth modulból jön; nincs lokális duplikátum.

#### Prompt (S4)

```
Hajtsd végre az S4 szekció tervét a `MattMester/ROADMAP.md` szerint:
- Új backend/utils/numbers.js: parsePositiveInteger(value, options) — Object.freeze konfigurálható min/max/default.
- Hívók átállítása: backend/api/routes/_shared.js, backend/sockets.js, backend/sql/sql_funtions.js (a normalizePositiveInt is ezt használja, vagy átnevezve egységessé).
- backend/api/chatUtils.js: CHAT_CONFIG (Object.freeze) — MAX_MESSAGES, WINDOW_MS, BLACKLIST_POLICY, MAX_MESSAGE_LENGTH; chat.js és sockets.js innen importál (lokális duplikátumok törlése).
- Új backend/api/logEvents.js: EVENT_TYPES és EVENT_CATEGORIES (Object.freeze). Minden eventType/eventCategory string ide cserélve.
- issues.md #19, #37, #38, #48 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: minden konstans és parser egy forrásból jön; nincs lokális redefiníció.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld; `grep -rn "CHAT_RATE_LIMIT_" backend` után már csak chatUtils-ban van definíció.
```

---

### S5. Halott kód, halott exportok és alias-takarítás

**Cél**: minden nem hívott kód és deprecated alias eltávolítása; egyetlen kanonikus név megmarad.

**Tartalom**: `#5` (mint dead code), `#40`, `#41`, `#42`, `#43`, `#44`, `#45`, `#46`, `#50`, `#51`, `#73`.

**Érintett fájlok**: `backend/services.js`, `backend/api/chess_api.js`, `backend/api/routes/profile.js`, `backend/api/routes/admin.js`, `backend/api/funtions.js`, `backend/sql/sql_funtions.js`, `frontend/javascript/adminPanel.js`, `frontend/javascript/requestControl.js`.

**Kockázatcsökkentés**: kódbázis-zaj csökkentése, koherenciahiba-megelőzés (régi név-aliasok használatának kiiktatása).

**Sikerkritérium**:
- Törölve: `services.handleConnection` (`#40`), `ipCollisionCheck` (`#5`-ből: "vagy törölni"-ágat választjuk), nem hívott chess endpointok (`#41`), `/profile/verify-current-password` (`#42`), `viewUser` stub gomb az admin panelben vagy back-end nélkül egyértelmű placeholder (`#44`), elérhetetlen `if (!currentPassword)` (`#45`), notification dismiss aliasok (`#51`), `isAdmin` halott export (`#73`).
- Gate-elve: `/admin/test` csak `NODE_ENV !== 'production'` esetén regisztrálódik (`#43`) — ha már megvan, akkor csak megerősítjük.
- Átalakítva: chess `/user-elo` session-from-first DB-fallback (`#46`); `requestController.cancelScheduled` vagy bekötve logout-flow-ba, vagy törölve (`#50`).
- Minden hívó frissítve, tesztek zöldek.

**Koherencia-fókusz**: a deprecated nevekre tett hívók kihalnak; csak az új kanonikus név létezik.

#### Prompt (S5)

```
Hajtsd végre az S5 szekció tervét a `MattMester/ROADMAP.md` szerint:
- Töröld vagy gate-eld: services.handleConnection (#40), ipCollisionCheck dead code (#5), chess /reset és DELETE (#41), profile/verify-current-password (#42), profile.js elérhetetlen if (#45), notification dismiss aliasok (#51 — markAll/markFriendRequest aliasok és exportok), funtions.js isAdmin export (#73), viewUser stub gomb az admin panelben (#44).
- Gate-eld: /admin/test csak NODE_ENV !== 'production' (#43, ellenőrzés).
- Alakítsd át: chess /user-elo session.elo-first, DB-fallback ha hiányzik (#46); requestController.cancelScheduled vagy bekötve logout-flow-ba, vagy törölve (#50) — döntsd el a kontextus alapján és indokold a változás-leírásban.
- issues.md #5 (dead-code-ágon), #40-46, #50, #51, #73 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: a régi alias-nevek hívási oldalon is el kell tűnjenek; egyetlen kanonikus név marad.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld; minden módosított útvonalon `grep` igazolja, hogy a régi név sehol nem maradt.
```

---

## Iteráció 3 — Frontend koherencia

### S6. Frontend helper-konszolidáció

**Cél**: `runSafely`, `runSafelyAsync`, `escapeHtml`, `fetchSessionInfo` egyetlen forrásból.

**Tartalom**: `#47`.

**Érintett fájlok**: új `frontend/javascript/_utils.js` (window-globalon publikálva), `frontend/javascript/index.js`, `frontend/javascript/profile.js`, `frontend/javascript/adminPanel.js`, esetleg `frontend/html/*.html` (script tag).

**Kockázatcsökkentés**: divergáló `escapeHtml` implementációk → XSS-rés zárása; `runSafely` viselkedési eltérés iktatása.

**Sikerkritérium**:
- `frontend/javascript/_utils.js` tartalmazza a négy helpert; window-globalon `MattMesterUtils` névtér alatt érhetők el.
- A három fő fájl (`index.js`, `profile.js`, `adminPanel.js`) lokális implementációi törölve, `MattMesterUtils.*` hívásra cserélve.
- HTML-ben a `_utils.js` script-tag a többi script ELŐTT töltődik (ahol releváns).
- A meglévő frontend tesztek (`adminTokenFlow.test.js`) zöldek; ha módosulnak helperek, a Jest mock-ok is frissülnek.

**Koherencia-fókusz**: egyetlen `escapeHtml` és `runSafely` viselkedés a teljes frontenden; a `MattMesterUtils` névtér ne ütközzön semmi mással.

#### Prompt (S6)

```
Hajtsd végre az S6 szekció tervét a `MattMester/ROADMAP.md` szerint:
- Új frontend/javascript/_utils.js: runSafely, runSafelyAsync, escapeHtml, fetchSessionInfo. Window-globalon `window.MattMesterUtils` névtéren publikálva. Module-friendly module.exports a Node-tesztekhez.
- index.js, profile.js, adminPanel.js: lokális implementációk törlése, MattMesterUtils.* használat.
- HTML script-tag sorrend: _utils.js az érintett HTML-ekben legkorábbi user-script.
- issues.md #47 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: csak egy escapeHtml és egy runSafely viselkedés; a leaderboard-variánst is egységesítsd vagy expliciten paraméterezd.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld; `node --check frontend/javascript/_utils.js` és a három módosított fájl zöld; manuális smoke (index, profile, admin betöltődik a böngészőben).
```

---

## Iteráció 4 — Admin panel F4–F6

### S7. F4 — `/admin` WS namespace lezárása

**Cél**: az admin események valós idejű, izolált csatornán futnak; replay reconnect után működik.

**Tartalom**: `#63`.

**Érintett fájlok**: `backend/api/admin/socketNamespace.js` (váz létezik), `backend/sockets.js`, `frontend/javascript/adminPanel.js` (WS connect blokk).

**Kockázatcsökkentés**: nem-admin kliens namespace-belépésének teljes blokkolása, hiányzó audit/alert események utólagos lekérése.

**Sikerkritérium**:
- `io.of('/admin')` handshake: session + `parseAdminToken` (DB-hash check), nem-admin → disconnect with reason.
- `admin:room` minden hitelesített admin csatlakozás után automatikusan join.
- `admin:replay:request` event: `since` timestamp/eventId; max 200 / batch, 24 h ablak, max 5 batch / kapcsolat.
- Az ADMIN_PANEL.md F4 elfogadási kritériumai (két admin kliens ugyanazt látja; reconnect után replay; nem-admin nem lép be) teljesülnek.
- Új unit teszt minimum a handshake-rejection-re.

**Koherencia-fókusz**: az F4 és F5 broadcast-API ugyanazt a `socketHub.broadcastAdmin(eventName, payload)` szignatúrát használja; eseménynevek `admin:<domain>:<action>` mintára.

#### Prompt (S7)

```
Hajtsd végre az S7 szekció tervét a `MattMester/ROADMAP.md` szerint, az ADMIN_PANEL.md §4 alapján:
- backend/api/admin/socketNamespace.js: handshake auth (session + parseAdminToken DB-hash check), `admin:room` auto-join, replay handler (`admin:replay:request`).
- Replay limitek: max 200 event / batch, 24h ablak, max 5 batch / kapcsolat (constants.js-ből: REPLAY_BATCH_MAX_SIZE, REPLAY_WINDOW_HOURS, REPLAY_MAX_BATCHES_PER_CONNECTION).
- backend/sockets.js: a `/admin` namespace getterét bekötve, a normál namespace-en az admin: prefixű eventek továbbra is automatikusan védve.
- frontend/javascript/adminPanel.js: WS connect a `/admin` namespace-re, replay-request reconnect után az utolsó eventId-vel.
- Új teszt backend/__tests__/adminNamespaceHandshake.test.js: nem-admin kliens disconnect.
- issues.md #63 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: egységes `admin:<domain>:<action>` névséma; minden broadcaster `socketHub.broadcastAdmin(eventName, payload)` szignatúrát hív.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch (handshake, replay-fetch, db-call).
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld; két admin kliens manuális smoke-teszt.
```

---

### S8. F5 — AlertingService + adaptív rate limit

**Cél**: jogosulatlan / gyanús admin próbálkozások automatikus jelzése + IP-szintű ideiglenes szigorítás.

**Tartalom**: `#64`.

**Érintett fájlok**: `backend/api/admin/alertingService.js`, `backend/api/admin/adminRateLimiter.js`, `backend/api/middleware/rateLimiter.js`, `backend/sql/adminRepo.js` (escalation upsert + lookup), tesztek.

**Kockázatcsökkentés**: brute-force admin-elevate elleni adaptív védelem, alert-zaj egyetlen csatornán.

**Sikerkritérium**:
- Hibás token / session-nélküli admin hívás → `recordUnauthorized` és `recordTokenInvalid` az alertingService-ből; alert DB-ben + WS broadcast (`admin:alert:unauthorized`, `admin:alert:token_invalid`).
- IP-scope eszkaláció: ha adott ablakban (`RATE_ESCALATION_TRIGGER_WINDOW_SEC`) átlépi a küszöböt (`RATE_ESCALATION_TRIGGER_FAILURE_COUNT`), `admin_rate_escalations` upsert + `admin:alert:rate_escalated` broadcast.
- `rateLimiter.js`: az adott IP-re a következő `RATE_ESCALATION_DEFAULT_TTL_SEC` ideig `RATE_ESCALATION_DEFAULT_MULTIPLIER`-szeres szigorítás aktív.
- ADMIN_PANEL.md F5 elfogadási kritériumok teljesülnek.

**Koherencia-fókusz**: minden eseménynév és konstans a már létező `constants.js`-ből (S4 után onnan is kapott kulcsokkal); új konstanst csak ott deklarálunk.

#### Prompt (S8)

```
Hajtsd végre az S8 szekció tervét a `MattMester/ROADMAP.md` szerint, az ADMIN_PANEL.md §5 alapján:
- backend/api/admin/alertingService.js: ellenőrizd, hogy a recordUnauthorized + recordTokenInvalid + recordSuspiciousPattern bekötve van-e a parseAdminToken middleware hibaágaiba; pótold a hiányzókat.
- backend/api/admin/adminRateLimiter.js + backend/api/middleware/rateLimiter.js: olvassa be az `admin_rate_escalations` tábla aktív sorait IP-szintű multiplier alkalmazásához.
- backend/sql/adminRepo.js: countFailedAdminAttemptsByIp + upsertRateEscalation már léteznek; ha hiányoznak, pótold.
- Új teszt backend/__tests__/adminAlerting.test.js: hibás token → alert + escalation, multiplier alkalmazódik.
- issues.md #64 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: minden eseménynév és TTL/limit a constants.js-ből; nincs hardcoded szám.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch (és az alerting nem ronthatja le a fő flow-t — legfeljebb console.warn).
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld; manuális 6× rossz token a 10 percen belül → `admin:alert:rate_escalated` látható.
```

---

### S9. F6 — Super-admin grant / revoke / list

**Cél**: a legmagasabb szintű jogosultságok elkülönített, kritikus auditált műveleteken keresztül.

**Tartalom**: `#65`.

**Érintett fájlok**: `backend/api/admin/superAdminRoutes.js` (váz létezik), `backend/sql/adminRepo.js` (super-flag lekérdezések), tesztek.

**Kockázatcsökkentés**: privilégium-elvesztés (utolsó super-admin), illetéktelen super-grant.

**Sikerkritérium**:
- `POST /api/admin/admins/grant`, `POST /api/admin/admins/revoke`, `GET /api/admin/admins`.
- Sima admin nem hívhatja (router-szinten `requireSuperAdmin`).
- Last-super-admin lock: ha a `revoke` az utolsó super-admin-flag-et venné le, 409 Conflict + `ADMIN_LAST_SUPER_LOCK`.
- Mindhárom mutáló action `severity='critical'` audittal (30 char min reason).
- Új teszt: grant → list-ben szerepel, revoke utolsó super → 409, sima admin → 403.

**Koherencia-fókusz**: az error-kódok mind a `constants.js`-beli `ADMIN_ERROR_CODES`-ból; a `severity='critical'` minden kritikus actionnál egységes.

#### Prompt (S9)

```
Hajtsd végre az S9 szekció tervét a `MattMester/ROADMAP.md` szerint, az ADMIN_PANEL.md §6 alapján:
- backend/api/admin/superAdminRoutes.js: POST /grant, POST /revoke, GET / endpointok (mind requireSuperAdmin + requireReasonOnMutate('critical') + audit).
- Last-super-admin lock: revoke előtt count, ha 1 → 409 + ADMIN_LAST_SUPER_LOCK.
- backend/sql/adminRepo.js: countSuperAdmins, setUserSuperAdminFlag, listAdmins (vagy bővítés a meglévő repo-ban).
- Új teszt backend/__tests__/adminSuperOps.test.js: grant/revoke/list, last-super lock, sima admin → 403.
- issues.md #65 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: error-kódok kizárólag az ADMIN_ERROR_CODES-ból; severity='critical' egységesen.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld.
```

---

## Iteráció 5 — Admin panel F7–F9

### S10. F7 — Meglévő admin endpointok migrálása az új láncra

**Cél**: a régi admin actionök is `parseAdminToken → requireReasonOnMutate → audit` láncon mennek át.

**Tartalom**: `#66`.

**Érintett fájlok**: `backend/api/routes/admin.js` (`notifications/send`, `profile-images/{approve,reject}`, `export-users`), tesztek.

**Kockázatcsökkentés**: vegyes módú admin endpointok → audit-rés.

**Sikerkritérium**:
- `notifications/send` és `profile-images/reject` → `requireReasonOnMutate('normal')` (10 char min); `severity='warning'` (vagy `info` send-nél, kontextus szerint).
- `profile-images/approve` és `export-users` → reason **opcionális**, `severity='info'`.
- `export-users` audit metadata: `rowCount` és `filterParams`.
- Tesztek: minden migrált endpointra audit-bejegyzés keletkezik (mockolt auditService).

**Koherencia-fókusz**: severity szintek (info / warning / critical) konzisztens értelmezése; reason kötelezőség az ADMIN_PANEL.md §7-tel egyezzen.

#### Prompt (S10)

```
Hajtsd végre az S10 szekció tervét a `MattMester/ROADMAP.md` szerint, az ADMIN_PANEL.md §7 alapján:
- backend/api/routes/admin.js endpointok middleware-láncának kibővítése:
  - notifications/send: parseAdminToken + requireReasonOnMutate('normal') + auditContext + auditFlush.
  - profile-images/approve: reason opcionális, severity='info'.
  - profile-images/reject: reason kötelező (10 char min), severity='warning'.
  - export-users: reason opcionális, severity='info', audit metadata { rowCount, filterParams }.
- Tesztek (új backend/__tests__/adminEndpointMigration.test.js): mindenhol audit-bejegyzés keletkezik a megfelelő severity-vel és reason-policy-val.
- issues.md #66 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: severity-szintek és reason-policy az ADMIN_PANEL.md §7-tel megegyezően.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld.
```

---

### S11. F8 — Read-only admin API

**Cél**: az admin dashboard adatforrásai stabil, szűrhető, exportálható API-n keresztül.

**Tartalom**: `#67`.

**Érintett fájlok**: `backend/api/routes/admin.js`, `backend/sql/adminRepo.js` (search/aggregation), tesztek.

**Kockázatcsökkentés**: a frontend MVP (S13) különben mock-adatokon kötne ki.

**Sikerkritérium**:
- `GET /api/admin/audit/search` szűrőkkel: actor, action, severity, dateFrom/To, targetId, targetKey, requestId.
- `GET /api/admin/audit/export` (CSV, ugyanazok a szűrők).
- `GET /api/admin/alerts/recent` (limit, sinceTs).
- `GET /api/admin/users/list` (page, pageSize, sort).
- `GET /api/admin/stats/snapshot` (active sessions, recent logins, failed elevates 24h, alerts 24h).
- Mindegyik audit-context-csel (read-only audit, nincs reason); paginált válaszok egységes `{ items, total, page, pageSize }` formával.
- Tesztek minden endpointra (smoke + 1 szűrő-kombináció).

**Koherencia-fókusz**: lapozás-séma egységes (`{items,total,page,pageSize}`); a CSV-export szűrői megegyeznek a search szűrőivel.

#### Prompt (S11)

```
Hajtsd végre az S11 szekció tervét a `MattMester/ROADMAP.md` szerint, az ADMIN_PANEL.md §8 alapján:
- backend/api/routes/admin.js read-only endpointok:
  - GET /audit/search (actor, action, severity, dateFrom, dateTo, targetId, targetKey, requestId; pagináció)
  - GET /audit/export (CSV, ugyanazok a szűrők)
  - GET /alerts/recent (limit, sinceTs)
  - GET /users/list (page, pageSize, sort)
  - GET /stats/snapshot (active sessions, recent logins, failed elevates 24h, alerts 24h)
- backend/sql/adminRepo.js: search/aggregation függvények pótlása.
- Egységes válasz-séma: { items, total, page, pageSize } a paginált végpontokra.
- Új teszt backend/__tests__/adminReadOnlyApi.test.js: smoke + 1-1 szűrő kombináció.
- issues.md #67 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: a CSV-export és a search szűrői ugyanazok; pagináció-séma egységes.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld.
```

---

### S12. F9 — Audit retention job

**Cél**: napi 1× futó hard-delete job 18 hónapos retentionnel; a futás maga is auditált.

**Tartalom**: `#68`.

**Érintett fájlok**: `backend/api/admin/retentionJob.js` (váz létezik), `backend/server.js` (startup wiring).

**Kockázatcsökkentés**: korlátlan táblanövekedés; iskolai környezetben hard delete elég (JSONL archive bónusz).

**Sikerkritérium**:
- `setInterval`-alapú napi futás `ADMIN_SCHEDULER_RETENTION_INTERVAL_MS` szerint, induláskor `ADMIN_SCHEDULER_STARTUP_DELAY_MS` késleltetéssel az `initDatabase` után.
- `AUDIT_RETENTION_DAYS` (18 × 30) napnál régebbi `admin_audit_log` és `admin_alert_log` sorok hard delete.
- Saját audit entry minden futás után: action='audit.retention.run', metadata: { deletedAuditCount, deletedAlertCount, durationMs }.
- Idempotens (egyetlen futás akkor is, ha a server közben több részben indul újra; lock vagy időbélyeg-check).
- Új teszt: mockolt clock-kal retentionDelete hív, audit-entry keletkezik.

**Koherencia-fókusz**: a `audit.retention.run` action-név megegyezik a doksiban és a kódban; konstansok mind a `constants.js`-ből.

#### Prompt (S12)

```
Hajtsd végre az S12 szekció tervét a `MattMester/ROADMAP.md` szerint, az ADMIN_PANEL.md §9 alapján:
- backend/api/admin/retentionJob.js: startRetentionScheduler(deps) — setInterval + startup-késleltetés a constants.js-beli ADMIN_SCHEDULER_* alapján.
- Hard delete: admin_audit_log és admin_alert_log AUDIT_RETENTION_DAYS-nél régebbi soraira; futás után saját audit (action='audit.retention.run', metadata { deletedAuditCount, deletedAlertCount, durationMs }).
- Idempotencia: utolsó futás időbélyege egy in-memory vagy DB-flag mezőben.
- backend/server.js: az initDatabase() után startRetentionScheduler() hívás.
- Új teszt backend/__tests__/adminRetention.test.js: mockolt clock + repo, audit-entry keletkezik.
- issues.md #68 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: 'audit.retention.run' action-név egységesen; minden időkonstans constants.js-ből.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch (a job soha ne dobjon a hívó felé — legrosszabb esetben console.error + audit-skipped).
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld.
```

---

## Iteráció 6 — Admin frontend MVP

### S13. F10 — Admin frontend MVP + `/api/public/admin-constants` bekötése

**Cél**: első használható admin UI: users tábla, audit viewer szűrőkkel, moderation queue, elevate modal, valós WS frissülés; a frontend a publikus konstansokat egy forrásból olvassa.

**Tartalom**: `#69` + a már létező `/api/public/admin-constants` bekötése.

**Érintett fájlok**: `frontend/javascript/adminPanel.js`, `frontend/html/adminPanel.html`, új `frontend/javascript/shared/adminConstants.js` (vagy hasonló).

**Kockázatcsökkentés**: backend admin képességek kézi-vizuális ellenőrizhetősége; TTL- és hibakód-koherencia végleges lezárása frontenden.

**Sikerkritérium**:
- `frontend/javascript/shared/adminConstants.js`: app-init időben lekér `GET /api/public/admin-constants`-ot; cache-elt eredmény, fallback hardcoded értékre csak ha 5 mp alatt nincs válasz.
- `adminAuthFlow.js` és minden token-időzítő ezt a forrást használja, nem a build-time hardcoded értéket.
- Users táblázat (`/admin/users/list`-ből, lapozás), row-detail modal (read-only).
- Audit viewer: szűrő-űrlap → `/admin/audit/search`, eredmények táblában; CSV export gomb (`/admin/audit/export`).
- Moderation queue: profile-image queue (approve / reject reason-modal).
- Elevate modal: a meglévő flow-val, just real backend.
- Live updates: az `admin:audit:created` és `admin:alert:*` események új sorokat tolnak be a megfelelő nézetekbe.
- Új frontend teszt: `adminConstants.js` cache + fallback működik.

**Koherencia-fókusz**: a frontend-oldali konstansok és error-kódok kizárólag a `/api/public/admin-constants` válaszából táplálkoznak; a backend `ADMIN_ERROR_CODES` map értékeit a frontend ugyanazon kulcsokkal ismeri.

#### Prompt (S13)

```
Hajtsd végre az S13 szekció tervét a `MattMester/ROADMAP.md` szerint, az ADMIN_PANEL.md §10 alapján:
- Új frontend/javascript/shared/adminConstants.js: GET /api/public/admin-constants, cache + 5 mp fallback hardcoded defaultra; window.MattMesterAdminConstants névtér.
- adminAuthFlow.js + adminPanel.js: minden TTL és error-kód innen jön.
- Users tábla, row-detail modal, audit viewer szűrővel + CSV export, moderation queue (profile-image approve/reject reason-modal), elevate modal valós flow.
- Live updates: admin:audit:created, admin:alert:* eseményekre DOM-frissítés.
- Új teszt frontend/__tests__/adminConstantsFlow.test.js: fetch-mock, cache + fallback.
- issues.md #69 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: minden frontend-oldali konstans és error-kód egyedül az endpoint válaszából vagy a backend constants-ból; nincs duplikált hardcoded érték.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch (fetch-ek mind).
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld; manuális smoke a böngészőben (login → elevate → users tábla, audit search, approve/reject).
```

---

## Iteráció 7 — Strukturális tisztítás (rename + apró file-műveletek)

### S14. Repo-gyökér + `chess_barold` + üres `gameRoom.css` + `funtions` → `functions` átnevezés

**Cél**: nevek és file-elhelyezkedés tisztítása a nagy bontás (S16–S19) ELŐTT, hogy a refactor ne keveredjen rename-mel.

**Tartalom**: `#12`, `#13`, `#14`, `#49`.

**Érintett fájlok**: `backend/api/funtions.js` → `functions.js`, `backend/sql/sql_funtions.js` → `sql_functions.js`, `frontend/chess_barold/` → `frontend/chess/`, `frontend/css/gameRoom.css`, repo-gyökér `.txt`-k → `docs/notes/` vagy `.gitignore`, minden import-frissítés.

**Kockázatcsökkentés**: a következő iteráció (S16) már a helyes néven dolgozik; nincs „dupla átnevezés".

**Sikerkritérium**:
- `funtions.js` → `functions.js` átnevezve, minden hívó frissítve (`grep -rn "funtions" backend frontend` üres).
- `sql_funtions.js` → `sql_functions.js` ugyanígy.
- `chess_barold` mappa → `chess`; `frontend/javascript/index.js:860` hivatkozás javítva; HTML-ben is.
- `frontend/css/gameRoom.css`: ha üres, törlés; a HTML link is el.
- Repo gyökér `.txt` jegyzetek `docs/notes/` alá vagy `.gitignore`-ba (a `MAttmester funkciói.txt`, `Mattmester_AB_leiras.txt`, `socket_mukodes_reszletes_jegyzet.txt` az iskolai dokumentációhoz tartozik — `docs/notes/` az arányos célmappa).
- Tesztek zöldek; manuális smoke: kezdőlap, chess, profile betöltődik.

**Koherencia-fókusz**: minden fájlnévre vonatkozó hivatkozás (kód, HTML, doksi) ugyanazt az új nevet használja.

#### Prompt (S14)

```
Hajtsd végre az S14 szekció tervét a `MattMester/ROADMAP.md` szerint:
- Átnevezés (és minden import frissítése):
  - backend/api/funtions.js → functions.js
  - backend/sql/sql_funtions.js → sql_functions.js
  - frontend/chess_barold/ → frontend/chess/ (HTML és JS-hivatkozások javítva)
- frontend/css/gameRoom.css: ha üres, törlés + HTML link el.
- Repo gyökér .txt jegyzetek → docs/notes/ mappa.
- issues.md #12, #13, #14, #49 → ✅; doksi-frissítés (issues.md, ADMIN_PANEL.md, readme.md) ahol a régi nevet említi.

Kötelező keretek:
- Kerüld a koherenciahibákat: minden hivatkozás (kód, HTML, MD) az új névre mutat.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `grep -rn "funtions" backend frontend` üres; `grep -rn "chess_barold" frontend` üres; `npx jest --config backend/jest.config.js --runInBand` zöld; manuális smoke (chess, profile, leaderboard).
```

---

### S15. `validation.js` sors + `default.png` optimalizálás

**Cél**: két apró, izolált tisztítás.

**Tartalom**: `#15`, `#53`, `#54`.

**Érintett fájlok**: `backend/api/validation.js`, `backend/api/routes/_shared.js`, `backend/profile_pictures/default.png`, hívók.

**Sikerkritérium**:
- `validation.js` 5-soros tartalma `_shared.js`-be kerül; a `validation.js` törölve; minden hívó importja frissül (`#15`, `#53` egyszerre).
- `default.png` < 100 KB (újrakódolás), vagy WebP-re cseréltve a kompatibilitás megőrzésével.
- Frontend smoke: a leaderboard avatar default-ja megjelenik.

**Koherencia-fókusz**: validációs regex egyetlen helyen, a `_shared.js`-ben.

#### Prompt (S15)

```
Hajtsd végre az S15 szekció tervét a `MattMester/ROADMAP.md` szerint:
- backend/api/validation.js tartalma → backend/api/routes/_shared.js (regex konstansok az export listában). validation.js törölve, minden import frissítve.
- backend/profile_pictures/default.png: optimalizálás <100 KB-ra (PNG újrakódolás vagy WebP-re csere a kód megfelelő frissítésével).
- issues.md #15, #53, #54 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: regex csak _shared.js-ben; nincs duplikált export.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld; manuális smoke (default avatar leaderboardon).
```

---

## Iteráció 8 — Nagy fájlok bontása

> **Megjegyzés**: az S16–S17 az `sql_functions.js`-re (S14 után már ezen a néven) épít; az S18 a `profile.js`-re. Mindegyik egy session, fókuszálva.

### S16. `sql_functions.js` bontása — 1. fél: `userRepo` + `friendRepo`

**Cél**: a 2415 soros aggregátor első két domainje külön repo-fájlba.

**Tartalom**: `#9` (1/2).

**Érintett fájlok**: új `backend/sql/repos/userRepo.js`, új `backend/sql/repos/friendRepo.js`, `backend/sql/sql_functions.js` (re-export aggregátor szerepre váltás), minden hívó.

**Sikerkritérium**:
- A user-domain (auth, user mgmt, IP-lookup, verification, settings) `userRepo.js`-ben.
- A friend-domain `friendRepo.js`-ben.
- `sql_functions.js` aggregátor: csak re-exportál; a fennmaradó (log, chess, notification) functions egyelőre itt maradnak.
- Tesztek zöldek; nincs körkörös import.

**Koherencia-fókusz**: a re-export aggregátor egyetlen forrás; nincs olyan hívó, ami közvetlenül kerülő fájlból (privát repóból) húz funkciót.

#### Prompt (S16)

```
Hajtsd végre az S16 szekció tervét a `MattMester/ROADMAP.md` szerint:
- Új backend/sql/repos/userRepo.js: user/auth/ip/verification/settings-domain összes függvénye a sql_functions.js-ből.
- Új backend/sql/repos/friendRepo.js: friend-domain összes függvénye.
- backend/sql/sql_functions.js: aggregátor szerepben, re-exportálja a userRepo és friendRepo összes függvényét; a chess/log/notification rész egyelőre itt marad.
- Hívók NEM változnak (továbbra is sql_functions-ből húznak); az aggregátor biztosítja a kompatibilitást.
- issues.md #9 → részben ✅ (1/2).

Kötelező keretek:
- Kerüld a koherenciahibákat: nincs körkörös import; nincs duplikált függvény-definíció userRepo + sql_functions között.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld; nincs körkörös import warning.
```

---

### S17. `sql_functions.js` bontása — 2. fél: `logRepo` + `chessRepo` + aggregátor véglegesítés

**Cél**: a maradék két domain külön repóba; a `sql_functions.js` tisztán aggregátor lesz.

**Tartalom**: `#9` (2/2).

**Érintett fájlok**: új `backend/sql/repos/logRepo.js`, új `backend/sql/repos/chessRepo.js`, esetleg `backend/sql/repos/notificationRepo.js`, `backend/sql/sql_functions.js`.

**Sikerkritérium**:
- A log/chess/(notification) functions kiemelve a megfelelő repo-fájlokba.
- `sql_functions.js` legfeljebb néhány tucat sor, csak re-export.
- Új hívókat lehet írni közvetlenül a repo-fájlokra is (preferált), vagy az aggregátoron át (kompatibilitás).
- Tesztek zöldek.

**Koherencia-fókusz**: az aggregátorra többé nem kerül új function; az új repository-k a single source of truth.

#### Prompt (S17)

```
Hajtsd végre az S17 szekció tervét a `MattMester/ROADMAP.md` szerint:
- Új backend/sql/repos/logRepo.js, chessRepo.js (és ha indokolt, notificationRepo.js): a megfelelő domain functionsei.
- backend/sql/sql_functions.js: tiszta re-export aggregátor (max néhány tucat sor).
- issues.md #9 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: minden új hívó a repo-fájlra hivatkozhat; az aggregátor csak kompatibilitásért van.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld.
```

---

### S18. `profile.js` (frontend) modularizáció

**Cél**: a 3600 soros frontend modul felbontása négy doménre.

**Tartalom**: `#10`.

**Érintett fájlok**: `frontend/javascript/profile.js` → `frontend/javascript/profile/{security,friends,settings,stats}.js`, HTML-script tagok, `frontend/__tests__/*` (ha van profile-lefedettség).

**Sikerkritérium**:
- A négy modul-fájl mindegyike < 1500 sor; a `profile.js` belépési pont (init + a négy modul orchestrate-je).
- Megosztott `state` egyetlen helyen, modulok argumentumként kapják.
- HTML script-tag sorrend deterministic; a meglévő funkcionalitás (security, friends, settings, stats) változatlanul működik.
- Manuális smoke: minden szekció elérhető és működik a böngészőben.

**Koherencia-fókusz**: a `state` egyetlen forrás; nem készül modulonkénti másolat.

#### Prompt (S18)

```
Hajtsd végre az S18 szekció tervét a `MattMester/ROADMAP.md` szerint:
- frontend/javascript/profile.js → bontás:
  - frontend/javascript/profile/security.js (jelszó, session-ök, IP-history)
  - frontend/javascript/profile/friends.js
  - frontend/javascript/profile/settings.js (avatar, profil-mezők, notification-prefs)
  - frontend/javascript/profile/stats.js (elo, wins/losses, leaderboard-blokkok)
  - frontend/javascript/profile.js: init + 4-modul orchestrate + megosztott state.
- frontend/html/profile.html: script-tag sorrend.
- issues.md #10 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: egyetlen state-objektum; modulok argumentumként kapják.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch (fetch-ek mind).
- Csak "miért"-kommentek.

Validálás: `node --check frontend/javascript/profile.js` és a 4 új modul zöld; manuális smoke (mind a 4 szekció működik).
```

---

### S19. `profile.css` → `tokens.css` + komponens-CSS-ek

**Cél**: design-tokenek kiemelése + komponens-szintű CSS-ek.

**Tartalom**: `#11`.

**Érintett fájlok**: `frontend/css/profile.css` → `frontend/css/tokens.css` + `frontend/css/profile/*.css`, HTML link-tagok.

**Sikerkritérium**:
- `tokens.css`: szín-, spacing-, font-, radius-tokenek (CSS custom properties).
- `profile/security.css`, `profile/friends.css`, `profile/settings.css`, `profile/stats.css` — domén szerint.
- A vizuális megjelenés azonos marad (manuális smoke).
- A komponens-fájlok kizárólag a `tokens.css`-beli változókra hivatkoznak (egységes design-érték).

**Koherencia-fókusz**: minden szín és méret a `tokens.css`-ből; nincs hardcoded hex/px érték a komponens-CSS-ekben.

#### Prompt (S19)

```
Hajtsd végre az S19 szekció tervét a `MattMester/ROADMAP.md` szerint:
- frontend/css/profile.css → bontás:
  - frontend/css/tokens.css (CSS custom properties: --color-*, --space-*, --font-*, --radius-*)
  - frontend/css/profile/{security,friends,settings,stats}.css
- frontend/html/profile.html: link-tag sorrend (tokens.css előbb).
- A komponens-fájlok hardcoded hex/px értékei → tokens.css változókra cserélve.
- issues.md #11 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: minden szín és méret kizárólag a tokens.css változóiból.
- (CSS-ben nincs return / try-catch — a JS-keretek itt nem alkalmazandók.)

Validálás: manuális smoke (a profil oldal vizuálisan azonos).
```

---

## Iteráció 9 — Minőség és tesztek

### S20. `asyncHandler` + központi error-handler middleware

**Cél**: ismétlődő try/catch eltüntetése route-handlerekből, konzisztens hibaválasz.

**Tartalom**: `#16`.

**Érintett fájlok**: új `backend/api/middleware/asyncHandler.js`, új `backend/api/middleware/errorHandler.js`, `backend/server.js` (utolsó middleware-ként a errorHandler), minden route a routes/-ban.

**Sikerkritérium**:
- `asyncHandler(fn)` → `(req, res, next) => Promise.resolve(fn(req,res,next)).catch(next)`.
- `errorHandler(err, req, res, next)`: egységes JSON `{ success:false, code, message, requestId }`; ismert error-kódok az `ADMIN_ERROR_CODES`-ból, ismeretlen → 500 + `INTERNAL`.
- Minden route-handler `asyncHandler(...)` wrapperben; a kézi `try/catch + res.status().json()` blokkok megszűnnek (kivéve, ahol direkt aud-flush vagy specifikus mellékhatás kell).
- Tesztek: létező tesztek zöldek; új teszt az error-handler kimenetére.

**Koherencia-fókusz**: hibaválasz-séma minden endpointon ugyanaz; ne legyen ad-hoc `res.status(400).send('hiba')`.

#### Prompt (S20)

```
Hajtsd végre az S20 szekció tervét a `MattMester/ROADMAP.md` szerint:
- Új backend/api/middleware/asyncHandler.js: asyncHandler(fn) Promise-rejection-t next-re továbbít.
- Új backend/api/middleware/errorHandler.js: { success:false, code, message, requestId } séma; known/unknown branchelés.
- backend/server.js: errorHandler legutolsó middleware-ként.
- Minden routes/* fájl: handler wrapper asyncHandler-rel; a felesleges try/catch blokkok eltűnnek.
- Új teszt backend/__tests__/errorHandler.test.js: ismert + ismeretlen error → helyes válasz-séma.
- issues.md #16 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: minden hibaválasz ugyanazt a sémát követi.
- Funkciónként legfeljebb 1 return (a handler-eken belül; a thrown error a kontroll-flow).
- Minden async/IO/DB műveletnél try-catch CSAK ott, ahol mellékhatás-kezelés kell (audit-flush, lock release); a sima error-propagation a asyncHandler-re bízva.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld.
```

---

### S21. SQL prepared statement audit + socket auth audit

**Cél**: két átfogó audit, hogy biztosan minden DB-query paraméteres és minden user-specifikus WS-event ellenőrzi a `session.userId`-t.

**Tartalom**: `#20`, `#22`.

**Érintett fájlok**: `backend/sql/repos/*` (az S17 utáni állapot), `backend/sockets.js`, esetleg `backend/services.js`.

**Sikerkritérium**:
- Minden SQL-query `?` paraméteres; nincs string-konkat user-input körül.
- Minden user-specifikus socket event (chat-üzenet, friend-action, profile-update) első lépésben ellenőrzi a `socket.request.session.userId`-t; mismatch esetén `socket.disconnect()` + audit-warn.
- Új teszt: WS-event mismatch userId-vel → disconnect.

**Koherencia-fókusz**: az `requireUserSocket(socket, handler)` (vagy ekvivalens) helper egy helyen van, minden user-event ezt használja.

#### Prompt (S21)

```
Hajtsd végre az S21 szekció tervét a `MattMester/ROADMAP.md` szerint:
- Audit minden backend/sql/repos/*.js fájlon: a query string-konkat user-input körül → cserélni ?-paraméterre.
- backend/sockets.js: bevezetni requireUserSocket(socket, handler) helpert (a meglévő requireAdminSocket mintájára); minden user-specifikus eventet ezzel kell csomagolni.
- Új teszt backend/__tests__/socketUserAuth.test.js: WS-event mismatch userId-vel → disconnect.
- issues.md #20, #22 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: helper-használat egységesen minden user-specifikus eventen.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld; `grep -rn "\\${.*}" backend/sql/repos` user-input-ot nem talál query string-ben.
```

---

### S22. Cleanup service idempotencia

**Cél**: a `setInterval`-alapú cleanup ne fusson dupla / overlap-elve, idempotens legyen.

**Tartalom**: `#28`.

**Érintett fájlok**: `backend/server.js` (cleanup wiring), `backend/services.js` (cleanup function).

**Sikerkritérium**:
- A cleanup a következő futás előtt megvárja az előzőt (lock-flag vagy `running` boolean).
- Hibás futás (throw) sem akasztja meg a következő ciklust.
- Új teszt: dupla-trigger → csak egy ténylegesen futó cleanup.

**Koherencia-fókusz**: ha más háttér-service is van (pl. retention job S12 után), ugyanezen a mintán fut.

#### Prompt (S22)

```
Hajtsd végre az S22 szekció tervét a `MattMester/ROADMAP.md` szerint:
- backend/services.js cleanup: running-flag (in-process) → ha még fut, az új tick skip + console.warn.
- Hibás cleanup (throw) → flag elenged finally-ben; a következő ciklust nem akadályozza.
- Új teszt backend/__tests__/cleanupIdempotency.test.js: dupla-trigger → csak egy futás.
- issues.md #28 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: a running-flag minta megegyezik a S12 retention job lock-mintájával.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch (és finally a flag-elengedéshez).
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld.
```

---

### S23. `console.log` → DEBUG flag mögé

**Cél**: zaj és véletlen PII-leakage csökkentése; tényleges hibák/audit-info marad explicit `console.error/warn`.

**Tartalom**: `#55`.

**Érintett fájlok**: backend (45 hívás) és frontend (37 hívás) — minden nem-test, nem-audit, nem-explicit-error `console.log`.

**Sikerkritérium**:
- Backend debug-log-ok: `if (process.env.DEBUG) console.log(...)` (vagy egy egysoros `debug` helper).
- Frontend debug-log-ok: `if (window.MM_DEBUG) console.log(...)`.
- A `console.error` és `console.warn` változatlan (ezek éles üzemben is kellenek).
- `.env.example` (S1-ből) tartalmazza a `DEBUG=` változót.
- Tesztek zöldek.

**Koherencia-fókusz**: ugyanaz a flag-név (`DEBUG` env / `MM_DEBUG` window) végig; nincs ad-hoc `if (true)` blokk.

#### Prompt (S23)

```
Hajtsd végre az S23 szekció tervét a `MattMester/ROADMAP.md` szerint:
- Backend: új backend/utils/debug.js: debug(...args) → if (process.env.DEBUG) console.log(...args). Minden nem-explicit-error console.log átállítva debug()-re. console.error/warn érintetlen.
- Frontend: új frontend/javascript/_debug.js: window.MM_DEBUG flag, window.MattMesterDebug.log helper. Minden nem-explicit-error console.log átállítva.
- .env.example-be DEBUG= bejegyzés.
- issues.md #55 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: DEBUG (backend env) és MM_DEBUG (frontend window) kanonikus flag-nevek.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld; `grep -rn "console.log" backend frontend | grep -v "__tests__\\|debug\\|\\.example"` üres vagy csak indokolt explicit eset.
```

---

### S24. Tesztlefedettség: auth, friend, log

**Cél**: a fő endpointoknak smoke + happy-path lefedettség.

**Tartalom**: `#24`.

**Érintett fájlok**: új `backend/__tests__/authEndpoints.test.js`, `friendEndpoints.test.js`, `logEndpoints.test.js`.

**Sikerkritérium**:
- Auth: login (helyes/hibás jelszó, rate-limit), register (sikeres + duplikált email), logout.
- Friend: send / accept / reject / block — happy path + permission-edge.
- Log: `user_logs` insert, query.
- Minden új teszt zöld; meglévők is zöldek.

**Koherencia-fókusz**: a tesztek ugyanazt a session-mock + repo-mock mintát használják, mint a meglévő `__tests__` fájlok.

#### Prompt (S24)

```
Hajtsd végre az S24 szekció tervét a `MattMester/ROADMAP.md` szerint:
- Új backend/__tests__/authEndpoints.test.js: login (jó/rossz jelszó, rate-limit), register (sikeres + duplikált email), logout.
- Új backend/__tests__/friendEndpoints.test.js: send/accept/reject/block happy path + permission-edge.
- Új backend/__tests__/logEndpoints.test.js: user_logs insert + query smoke.
- A meglévő mock-mintákat (lásd: adminAuthRoutes.test.js, chatLifecycle.test.js) követjük.
- issues.md #24 → ✅.

Kötelező keretek:
- Kerüld a koherenciahibákat: a tesztek ugyanazt a session-mock + repo-mock mintát követik, mint a meglévők.
- Funkciónként legfeljebb 1 return.
- Minden async/IO/DB műveletnél try-catch.
- Csak "miért"-kommentek.

Validálás: `npx jest --config backend/jest.config.js --runInBand` zöld; lefedettség nőtt.
```

---

## Roadmap-összegzés

| Iteráció | Szekciók | Súlypont |
|---|---|---|
| **1. Biztonsági alap** | S1, S2 | Session/cookie hardening, DB-reinit védelem. |
| **2. Backend koherencia** | S3, S4, S5 | Auth + util konszolidáció, halott kód. |
| **3. Frontend koherencia** | S6 | Helper single-source-of-truth. |
| **4. Admin F4–F6** | S7, S8, S9 | WS namespace, alerting, super-admin ops. |
| **5. Admin F7–F9** | S10, S11, S12 | Endpoint-migration, read-only API, retention. |
| **6. Admin frontend** | S13 | F10 MVP + public-constants bekötés. |
| **7. Strukturális rename** | S14, S15 | Néva-tisztítás a nagy bontás előtt, validation + asset. |
| **8. Nagy fájlok bontása** | S16, S17, S18, S19 | sql_functions repos, profile.js modulok, profile.css tokenek. |
| **9. Minőség és tesztek** | S20, S21, S22, S23, S24 | asyncHandler/errorHandler, SQL/socket audit, idempotencia, debug-flag, tesztlefedettség. |

A sorrend kötött: **az 1.–3. iteráció megelőzi a 4.–6.-ot**, mert az új admin-track a tisztított közös rétegre épül; **a 7. előzi a 8.-at**, hogy a bontás már a végleges fájlneveken fusson; a **9. iteráció záró minőség-réteg**, amit a stabilizált kódbázisra teszünk rá.
