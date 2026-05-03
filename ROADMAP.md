# MattMester — Záró sprint roadmap (2 nap)

> **Cél**: a projekt egy karbantartható, stabil, **localhost-szintű** záróállapotba húzása **2 napon belül**.
> **Kontextus**: iskolai projekt, egyetlen Node-process, single user/host, manuális DB-resetek. Enterprise-réteg (zod/joi, pino/winston, Vite, TypeScript, Redis, migration runner, IP-szintű geo-block) **nem cél**.
> **Kódolási keretek minden új kódra**: koherens elnevezés, függvényenként **legfeljebb 1 return**, minden async / IO / DB műveletnél **try-catch**, csak "miért"-kommentek. User-facing dialog **mindig custom HTML modal** — soha nem `alert/confirm/prompt`.

---

## Jelenlegi állapot (snapshot, 2026-05-03 — Sprint 2 vége)

### ✅ Kész — Sprint 2 (N9–N14, 2026-05-03)
- **N9**: Sakk lépéslista panel — algebrai notáció (`1. e4 c5 …`), backend `lepesTortenet` minden entry-be `san`/`check`/`mate` flag, slim kliens-output, jobb oldali scrollos lista.
- **N10**: Sakk Beállítások modal — 4 tábla-téma (gold/green/brown/blue), hang ki/be, koordináták ki/be, animáció ki/be, auto-flip ki/be. localStorage perszisztencia, custom HTML modal.
- **N11**: Tábla forgatás — manual flip-toggle (⇅) + auto-flip black PvP játékosnak.
- **N12**: Smooth piece animation — meglévő `lepesAnimacio` slide + új `.just-moved` CSS pulzus a célmezőn.
- **N13**: Revans gomb — PvP játék vége után offer/accept/decline handshake, 30s timeout, disconnect cancel. Új `chess:rematch:*` socket események + 12 új teszt.
- **N14**: Funkcionális takarítás — `services.handleConnection` (#40), notifications mark*ReadForUser aliasok (#51), `isAdmin` deprecated re-export (#73), unused chess endpointok (#41), üres `gameRoom.css` (#14), chat constants → `CHAT_CONFIG` (#37), `parsePositiveInteger` → `backend/utils/parse.js` (#38), session-cache `/user-elo` + `requireVerifiedEmail` (#46, #52). 9 új projectIntegrity guard.
- **Tesztek**: 261 zöld 19 suite-ban (Sprint 1 végén 249 / 17 → +12 N13 teszt + 9 új N14 guard).

### ✅ Kész — Sprint 1 (N1–N8, 2026-05-03)
- **S1**: env-alapú session/cookie/helmet hardening, `.env.example`, DB-credek envből.
- **Admin track F1–F9**: `backend/api/admin/` mind valós impl-lel — `socketNamespace.js`, `alertingService.js`, `adminRateLimiter.js`, `superAdminRoutes.js`, `auditService.js`, `tokenService.js`, `retentionJob.js`, `maintenanceScheduler.js`, `softDeletePurgeJob.js`, `statsTickService.js`, `testRunnerService.js`. Read-only API (`backend/api/routes/admin/readOnlyRoutes.js`), audit retention scheduler (18 hónap), live admin WS namespace.
- **Frontend split**: `frontend/javascript/profile/` 20 modulra (S18 ~100%), `frontend/javascript/adminPanel/` 25 modulra. Domain-szintű elkülönítés.
- **Backend routes split**: `backend/api/routes/admin/` 12 fájl (alerts, chat moderation, export users, IP blocks, notifications, profile images, security logins, user delete/edit, user reports, read-only).
- **Új user-facing flow-k**: `chessModeChooser` modal (frontpage Játék gomb + profile Quick Play FAB egyaránt — közös `chessModeChooser.js` + `css/shared/chessModeChooser.css`), dev-login modal, chess invite global, account deletion / ban / degrade flow, profile image moderation, IP block guard, dynamic chat blocklist + auto-ban, player reports + recent opponents + PGN, leaderboard cache realtime push.
- **Tesztek**: `backend/__tests__/` 12 suite, **92 zöld** (project integrity, chess lifecycle, chat, rate-limiter, admin auth/middleware/audit, notification dismiss, profile image utils + visibility, session refresh).

### ⚠️ Részben (a sprint scope-ja)
- `backend/api/routes/profile.js:57` — `/profile/verify-current-password` halott route.
- `backend/sql/modules/admin.js:317` — `ipCollisionCheck` halott függvény (localhoston értelmetlen).
- `backend/api/funtions.js`, `backend/sql/sql_funtions.js` — *funtions* elgépelés végig.
- `backend/api/admin/middleware.js:231` — reason validation hibás `REASON_TOO_SHORT` code túl-hosszú reasonre.
- Chess PvP: queue stale entry disconnect után, pending invite timeout dead-socket emit, disconnect timer double-fire surrender mellett.
- Auth middleware: `isAuthenticated`/`isAdmin` még `funtions.js`-ben szétszórva — single source-of-truth (`pageGuard`/`apiGuard`/`adminGuard`) hiányzik.
- Frontend `escapeHtml` / `runSafely` / `fetchSessionInfo` 4 helyen duplikálva (`index.js`, `profile/01-helpers.js`, `adminPanel/01-helpers.js`, `chessModeChooser.js`).

### 🗄️ Backlog (NEM része ennek a sprintnek)
- S16–S17: `sql_funtions.js` (2415 sor) bontása `backend/sql/repos/{userRepo,friendRepo,logRepo,chessRepo}.js`-re.
- S19: `profile.css` → `tokens.css` + `frontend/css/profile/{security,friends,settings,stats}.css`.
- S20: `asyncHandler` + központi `errorHandler` middleware bevezetése.
- S23: `console.log` → `DEBUG` flag mögé tömegesen (45 backend + 37 frontend hívás).
- `chess_barold/` mappa rename `chess/`-re (túl sok hivatkozás).
- B7, B8, B10, B11, B12 bug-ok — lásd `## Backlog` szekció.

---

## 2 napos záró sprint — 8 szekció

> A 8 szekció ~6–7 órányi tényleges munka. Sorrend kötött (N1 előbb, mint N2…). Ha szűk a 2 nap, **N7 + N8 feláldozható** az N1–N6 javára.

### NAP 1 — Critical fixes + 4 quick win

---

### N1. Chess PvP queue + invite stale-state takarítás *(45 perc)*

**Cél**: queue / invite edge case-ek megszüntetése, hogy disconnect / dead-socket / double-fire ne lyukassza ki az állapotot.

**Tartalom**:
- `handlePvpDisconnect`: a sikertelen `opponentSocket` lookup-nál a queue-ból + `userQueueIndex`-ből explicit törlés. Jelenleg csak az aktív játék-szál van takarítva.
- Pending invite timeout callback: emit előtt `socket.connected` check; halott socketre nem emit-elünk.
- `disconnectTimer` callback eleje: `if (jatek.vege || !jatek.pvpAktiv) return` — surrender mellett ne futtassa a forfeitet újra.
- `pendingInvites` cleanup: 5s grace után, ha az inviter ÉS az invitee is offline.

**Érintett fájlok**: `backend/chess/pvp.js`, új `backend/__tests__/chessQueueStale.test.js`.

**Sikerkritérium**: a fenti 4 edge-case-re unit teszt; meglévő tesztek zöldek; manuális 2-tab-os disconnect smoke nem hagy hátra stale entry-t.

#### Prompt (N1)

```
Hajtsd végre az N1 szekció tervét a ROADMAP.md szerint:
- backend/chess/pvp.js handlePvpDisconnect: a queue + userQueueIndex stale entry takarítás (jelenleg csak aktív meccs van kezelve).
- Pending-invite timeout callback: emit ELŐTT socket.connected check; halott socketre ne emit.
- disconnectTimer callback elején: if (jatek.vege || !jatek.pvpAktiv) return.
- 5s grace pendingInvites cleanup mindkét félre, ha mindketten offline.

Új teszt backend/__tests__/chessQueueStale.test.js:
- disconnect után queue.length === 0 és userQueueIndex.has(uid) === false
- pending invite timeout halott socketre nem dob

Kötelező keretek: funkciónként max 1 return, async/IO/DB mind try-catch-ben, csak miért-kommentek.
Validálás: npx jest --config backend/jest.config.js --runInBand zöld.
```

---

### N2. Maintenance enforce — minden oldal felfogja *(20 perc)*

**Cél**: amikor az admin maintenance-be tolja a rendszert, MINDEN megnyitott tab (frontpage, profile, chess, adminPanel) custom HTML modalt mutat és redirect-el — soha nem natív `alert`.

**Tartalom**:
- `frontend/javascript/shared/maintenanceClient.js` minden HTML page-ből betöltődik-e? (`index.html`, `profile.html`, `chess_barold/html/chess.html`, `adminPanel.html`)
- A modal custom HTML legyen, nem `alert()`.
- `projectIntegrity.test.js` guard: minden user-facing HTML page-en ott legyen a script tag.

**Érintett fájlok**: ellenőrizni `frontend/html/*.html` és `frontend/chess_barold/html/*.html`, frissíteni ha hiányzik a script tag; `backend/__tests__/projectIntegrity.test.js`.

**Sikerkritérium**: integrity teszt minden HTML-ben kéri a maintenanceClient.js-t; manuális smoke (admin maintenance ON → mindenhol modal felugrik).

#### Prompt (N2)

```
N2: ellenőrizd hogy frontend/javascript/shared/maintenanceClient.js minden user-facing oldalon (frontend/html/index.html, profile.html, adminPanel.html és frontend/chess_barold/html/chess.html) be van töltve script tag-gel. Ha hiányzik, pótold. Ellenőrizd hogy a modal CUSTOM HTML (nem natív alert) — javítsd, ha alert.

Új projectIntegrity teszt-eset: minden HTML page tartalmazzon `<script src=".../maintenanceClient.js"`.

Kötelező keretek: csak miért-kommentek, custom modal mint user-facing dialog.
Validálás: jest zöld + manuális smoke (admin → maintenance ON → modal felugrik MINDEN tabon).
```

---

### N3. Halott kód takarítás + admin reason error code *(30 perc)*

**Cél**: az S5-ből maradt halott kód törlése + 1 trivi admin error-code fix.

**Tartalom**:
- Töröld: `backend/sql/modules/admin.js:317` `ipCollisionCheck` + `backend/sql/sql_funtions.js:70` re-export.
- Töröld: `backend/api/routes/profile.js:57` `POST /profile/verify-current-password` route + `verifyPasswordLimiter`, ha sehol nem hivatkozott.
- Töröld: `backend/api/funtions.js` halott `isAdmin` export, ha tényleg sehol sem hívott.
- Fix: `backend/api/admin/middleware.js:231` — `REASON_TOO_LONG` code a túl-hosszú reasonre (jelenleg `REASON_TOO_SHORT`).
- `projectIntegrity.test.js` guard: a fenti string-ek ne térjenek vissza.

**Érintett fájlok**: lásd fent.

**Sikerkritérium**: jest zöld; `grep -rn "ipCollisionCheck\|verify-current-password" backend` üres; a régi `funtions.js isAdmin` hívók (ha vannak) az S3 / N4 új middleware-re mutatnak.

#### Prompt (N3)

```
N3: Töröld
- backend/sql/modules/admin.js ipCollisionCheck function + backend/sql/sql_funtions.js re-export
- backend/api/routes/profile.js POST /profile/verify-current-password route + verifyPasswordLimiter ha más nem használja
- backend/api/funtions.js isAdmin export ha halott (grep ellenőrzés)

Fix: backend/api/admin/middleware.js:231 — túl-hosszú reason esetén REASON_TOO_LONG code (jelenleg tévesen REASON_TOO_SHORT mindkét ágon).

Új projectIntegrity test-eset: az "ipCollisionCheck" és "verify-current-password" stringek ne forduljanak elő a backend-ben.

Kötelező keretek: max 1 return, async try-catch, csak miért-kommentek.
Validálás: jest zöld + grep üres.
```

---

### N4. Auth middleware konszolidáció (S3) *(60 perc)*

**Cél**: egyetlen forrás-igazság az auth-guardokra. `pageGuard` HTML 302-vel a /-ra, `apiGuard` JSON 401-gyel, `adminGuard` JSON 403-mal.

**Tartalom**:
- Új `backend/api/middleware/auth.js` — `pageGuard`, `apiGuard`, `adminGuard`, `setSessionFromUser(req, user)`.
- `backend/api/funtions.js` `isAuthenticated` / `isAdmin` → deprecated re-export az új modulra (1 körre meghagyjuk a kompatibilitásért).
- `backend/api/routes/auth.js`: login + register + verify mind `setSessionFromUser`-t hívja.
- A 12 admin route-fájl (`backend/api/routes/admin/*`) átáll a meglévő `parseAdminToken` chain mellé az új `apiGuard`-ra is, ahol kell.

**Érintett fájlok**: új `backend/api/middleware/auth.js`, `backend/api/funtions.js`, `backend/api/routes/{auth,profile,friends,chat,notifications,players}.js`, esetleg `backend/api/routes/admin/*.js` ha még a régi `isAdmin`-t hívja.

**Sikerkritérium**: jest zöld; új teszt: `setSessionFromUser` ugyanazokat a session-kulcsokat állítja be login + register után.

#### Prompt (N4)

```
N4: Új backend/api/middleware/auth.js — 3 guard:
- pageGuard: !req.session.userId → 302 / (HTML lap-okhoz)
- apiGuard: !req.session.userId → 401 JSON {success:false, code:'UNAUTHORIZED'}
- adminGuard: !req.session.userId || !req.session.isAdmin → 403 JSON
- setSessionFromUser(req, user): minden session-mező egy helyen (userId, username, isAdmin, is_email_verified, elo, ...)

Frissítsd backend/api/routes/{auth,profile,friends,chat,notifications,players}.js + szükség szerint backend/api/routes/admin/*.js a 3 új guardra.

backend/api/funtions.js: isAuthenticated / isAdmin → deprecated re-export az új middleware-re (1 körre meghagyjuk a kompatibilitásért, a következő sprintben törölhető).

backend/api/routes/auth.js login + register + register-verify: setSessionFromUser-t hívja.

Új teszt backend/__tests__/setSessionFromUser.test.js: login és register után IDENTIKUS session-kulcsok.

Kötelező keretek: max 1 return, async try-catch, csak miért-kommentek.
Validálás: jest zöld; minden meglévő teszt zöld marad.
```

---

### NAP 2 — Konszolidáció + tesztek + docs

---

### N5. Frontend `_utils.js` + duplikált `escapeHtml` egységesítés (S6) *(45 perc)*

**Cél**: 4 helyen duplikált helper egy modulba.

**Tartalom**:
- Új `frontend/javascript/_utils.js` → `window.MattMesterUtils.{runSafely, runSafelyAsync, escapeHtml, fetchSessionInfo}`.
- Cseréld le: `index.js`, `profile/01-helpers.js`, `adminPanel/01-helpers.js`, `chessModeChooser.js` lokális escapeHtml-jét a globálisra.
- HTML script-tag sorrend: `_utils.js` LEGKORÁBBAN (a többi user-script ELŐTT) `index.html`, `profile.html`, `adminPanel.html`, `chess.html`-ben.
- `projectIntegrity` guard: a fenti 4 fájlban már nincs lokális `function escapeHtml` definíció.

**Érintett fájlok**: új `frontend/javascript/_utils.js`, `frontend/javascript/{index.js, profile/01-helpers.js, adminPanel/01-helpers.js, chessModeChooser.js}`, `frontend/html/{index,profile,adminPanel}.html`, `frontend/chess_barold/html/chess.html`, `backend/__tests__/projectIntegrity.test.js`.

**Sikerkritérium**: jest zöld; node --check zöld; manuális smoke (frontpage, profile, admin, chess: nincs JS hiba a console-on).

#### Prompt (N5)

```
N5: Új frontend/javascript/_utils.js:
- runSafely(fn, fallback) szinkron try-catch
- runSafelyAsync(fn, fallback) async try-catch
- escapeHtml(s) — egyetlen kanonikus implementáció
- fetchSessionInfo() — GET /api/session-info, cache-elt
- Publikálás: window.MattMesterUtils

Cseréld lokális escapeHtml/runSafely-t a következőkben:
- frontend/javascript/index.js
- frontend/javascript/profile/01-helpers.js
- frontend/javascript/adminPanel/01-helpers.js
- frontend/javascript/chessModeChooser.js (saját inline escapeHtml-je van)

HTML-ekben: _utils.js script tag a legkorábbi user-script (index.html, profile.html, adminPanel.html, chess_barold/html/chess.html).

Új projectIntegrity teszt-eset: a fenti 4 JS-fájlban nincs `function escapeHtml` lokális definíció; window.MattMesterUtils kulcs-set ellenőrzés.

Kötelező keretek: max 1 return, async try-catch, csak miért-kommentek.
Validálás: jest zöld + node --check minden módosított JS-en + manuális browser smoke.
```

---

### N6. Auth / Friend / Notification endpoint smoke tesztek (S24 light) *(60 perc)*

**Cél**: a 3 fő user-flow happy-path coverage.

**Tartalom**: 3 új teszt-fájl, az `adminAuthRoutes.test.js` mintáját követve (mockolt sql repo + session).
- `__tests__/authEndpoints.test.js`: login (jó/rossz pwd, rate-limit), register (sikeres + duplikált email), logout.
- `__tests__/friendEndpoints.test.js`: send / accept / reject — happy path.
- `__tests__/notificationEndpoints.test.js`: list + dismiss alap.

**Érintett fájlok**: csak új teszt-fájlok.

**Sikerkritérium**: 3 új suite zöld; nem rontja el a meglévőket.

#### Prompt (N6)

```
N6: 3 új teszt-fájl, az adminAuthRoutes.test.js + chatLifecycle.test.js mintáját követve, mockolt sql repo + session.

backend/__tests__/authEndpoints.test.js:
- POST /auth/login: helyes pwd → 200 + session userId beállítva
- POST /auth/login: rossz pwd → 401
- POST /auth/login: rate-limit (6× rossz pwd) → 429
- POST /auth/register: új email → 201
- POST /auth/register: duplikált email → 409
- POST /auth/logout → 204 + session törölve

backend/__tests__/friendEndpoints.test.js:
- POST /friends/send → 201 + pending state
- POST /friends/accept → 200 + friend state
- POST /friends/reject → 200 + nincs barát-record

backend/__tests__/notificationEndpoints.test.js:
- GET /notifications → lista
- POST /notifications/:id/dismiss → 200 + következő GET-en már nincs ott

Kötelező keretek: max 1 return, async try-catch, csak miért-kommentek.
Validálás: jest zöld; lefedettség nőtt.
```

---

### N7. Docs konszisztencia: `issues.md` + `## Hivatkozások` *(30 perc)*

**Cél**: az `issues.md` és a ROADMAP egyazon valóságot tükrözze; a referencia-doksik (`referenciak/`) be vannak linkelve a ROADMAP végén.

**Tartalom**:
- `issues.md` frissítés: F1–F9 ✅, S1 ✅, profile + adminPanel split ✅, N1–N6 új sprint-tételek belistázva.
- ROADMAP végére `## Hivatkozások` szekció: `backend/ADMIN_PANEL.md`, `backend/USER_FEATURES.md`, `readme.md`.
- A 3 elavult `.txt` jegyzet (`MAttmester funkciói.txt`, `Mattmester_AB_leiras.txt`, `socket_mukodes_reszletes_jegyzet.txt`) jelölve elavultként az `issues.md`-ben (fizikai mozgatás N8 része ha belefér).

**Érintett fájlok**: `ROADMAP.md`, `issues.md`.

**Sikerkritérium**: a `issues.md` 1. sora egy "Utolsó frissítés: 2026-05-…" dátum; a ROADMAP `## Hivatkozások` szekciója 3 valid linket tartalmaz.

#### Prompt (N7)

```
N7: issues.md frissítés
- F1-F9 admin track → ✅
- S1 (env/helmet/session) → ✅
- S18 profile split (20 modul) → ✅
- adminPanel split (25 modul) → új ✅ tétel
- N1-N6 sprint-tételek belistázva mint "Záró sprint" szekció
- 3 elavult .txt jegyzet jelölve (MAttmester funkciói.txt, Mattmester_AB_leiras.txt, socket_mukodes_reszletes_jegyzet.txt)

ROADMAP.md végére `## Hivatkozások` szekció:
- backend/ADMIN_PANEL.md (admin track design doc)
- backend/USER_FEATURES.md (user-facing feature spec)
- readme.md (setup + env-tábla)

Kötelező keretek: csak miért-kommentek a kódban (ez doksi, így minimális).
Validálás: a fenti 3 link érvényes (a fájlok léteznek).
```

---

### N8. Rename: `funtions.js` → `functions.js` *(60 perc — opcionális, csak ha N1–N7 belefér)*

**Cél**: az 1 betűs elgépelés kijavítása a 2 backend fájlon. **A `chess_barold/` mappa rename-jét NEM csináljuk** — túl nagy migrációs felület, kockázatos a 2-napos sprintben.

**Tartalom**:
- `git mv backend/api/funtions.js backend/api/functions.js`
- `git mv backend/sql/sql_funtions.js backend/sql/sql_functions.js`
- Minden `require('./funtions')` / `require('../sql/sql_funtions')` frissítve.
- `projectIntegrity.test.js` guard: a `"funtions"` string sehol sem fordulhat elő.

**Érintett fájlok**: a 2 átnevezett fájl + kb. 30 hívó (grep alapján).

**Sikerkritérium**: jest zöld; `grep -rn "funtions" backend frontend` üres; node smoke (server.js betölt, csak EADDRINUSE-en lép ki).

#### Prompt (N8)

```
N8 (opcionális): rename
- backend/api/funtions.js → backend/api/functions.js
- backend/sql/sql_funtions.js → backend/sql/sql_functions.js

Frissíts MINDEN require-t (grep -rn "funtions" backend frontend → 0 találat).
Update package.json + jest config ha hivatkozik a régi névre.
NEM mozgatjuk a chess_barold mappát ebben a sprintben.

Új projectIntegrity guard: a "funtions" string sehol nem fordulhat elő.

Kötelező keretek: max 1 return, async try-catch, csak miért-kommentek.
Validálás: jest zöld; grep üres; node -e "require('./backend/server.js')" csak EADDRINUSE-on lép ki.
```

---

## Bug-lista (Explore agent + saját audit)

| # | Probléma | Fájl | Severity | Becslés | Sprint? |
|---|---|---|---|---|---|
| **B1** | Queue stale entry disconnect után | `backend/chess/pvp.js:563-585` | Medium | 10p | **N1 része** |
| **B2** | Disconnect timer + surrender double-fire | `backend/chess/pvp.js:955` | Medium | 15p | **N1 része** |
| **B3** | Pending invite timeout: emit dead socketre | `backend/chess/pvp.js:359-365` | Medium | 10p | **N1 része** |
| **B4** | Maintenance enforce: kliens minden oldalon felfogja-e | `maintenanceScheduler.js`, `maintenanceClient.js` | Medium | 15p | **N2 része** |
| **B5** | `ipCollisionCheck` halott kód | `backend/sql/modules/admin.js:317` | Low | 5p | **N3 része** |
| **B6** | `/profile/verify-current-password` halott route | `backend/api/routes/profile.js:57` | Low | 5p | **N3 része** |
| **B7** | ELO column query — paraméter helyett template string | `backend/chess/abortHelpers.js:100,123,225` | Low | 25p | **Backlog** (whitelist a `getMode()`-ból, csak elvi probléma) |
| **B8** | ELO revert match-count közelítés | `backend/chess/abortHelpers.js:219-220` | Low | 30p | **Backlog** (csak abort esetén pici pontatlanság) |
| **B9** | Reason error code tévesen `REASON_TOO_SHORT` mindkét hibára | `backend/api/admin/middleware.js:231` | Low | 2p | **N3 része** |
| **B10** | Admin token revoke közben race | `backend/api/admin/middleware.js:81-124` | Low | 20p | **Backlog** (iskolai project, nagy hatás nélkül) |
| **B11** | Admin WS reconnect token refresh | `backend/api/admin/socketNamespace.js` | Medium | 30p | **Backlog** (manuális refresh megoldja) |
| **B12** | Chat blocklist — offline user nem értesül új blockword-ről | `backend/server.js:407-416` | Low | 10p | **Backlog** (offline = nem üzen, edge case) |

**Sprint target**: B1–B6, B9 → mind belefér N1–N3-ba.

---

## Lezárt szekciók — archívum

A korábbi (1009 soros) ROADMAP S1–S24 szekcióiból az alábbiak már megvalósultak; külön részletezést nem igényelnek, csak referenciaként:

- **S1** — Session/cookie/helmet hardening (2026-04-29). `.env.example`, helmet CSP, env-alapú DB-credek.
- **S7 (F4)** — Admin WS namespace `/admin` handshake auth, replay-request.
- **S8 (F5)** — AlertingService + adaptív rate limit (admin escalation).
- **S9 (F6)** — Super-admin grant / revoke / list, last-super lock.
- **S10 (F7)** — Admin endpoint migráció a `parseAdminToken → requireReasonOnMutate → audit` láncra.
- **S11 (F8)** — Read-only admin API (`/audit/search`, `/audit/export`, `/alerts/recent`, `/users/list`, `/stats/snapshot`).
- **S12 (F9)** — Audit retention scheduler (18 hónap, napi 1× futás, idempotens).
- **S18** — `frontend/javascript/profile.js` 20-modulra bontva (`profile/01-…20-`).
- **(Roadmap-en kívüli)** — `adminPanel.js` 25-modulra bontva, admin routes 12 fájlra split, chess invite global, dev-login modal, soft-delete purge, maintenance scheduler, IP block guard, dynamic chat blocklist + auto-ban, player reports, recent opponents, PGN, leaderboard cache realtime push, chessModeChooser modal (frontpage + profile Quick Play közös).

---

## Backlog (sprint UTÁN, prioritás szerint)

> Mindegyik tételhez egy 1 sentence prompt. Lefuttathatók egyenként, később.

### Strukturális

- **B-S16 — `sql_funtions.js` bontása userRepo + friendRepo-ra**: `Hozz létre backend/sql/repos/{userRepo,friendRepo}.js-t a sql_funtions.js user/auth/friend domain-jével; a sql_funtions.js re-export aggregátorrá válik; körkörös import nincs; jest zöld.`
- **B-S17 — logRepo + chessRepo + aggregátor véglegesítés**: `Bontsd a maradék log + chess functionöket backend/sql/repos/{logRepo,chessRepo}.js-re; a sql_funtions.js < 50 sor re-export.`
- **B-S19 — CSS tokens + komponens-CSS**: `frontend/css/profile.css → tokens.css + frontend/css/profile/{security,friends,settings,stats}.css; minden hardcoded hex/px → token-változóra.`
- **B-S20 — asyncHandler + errorHandler**: `Új backend/api/middleware/{asyncHandler,errorHandler}.js; minden route-handler asyncHandler-be wrap-elve; egységes JSON {success,code,message,requestId} hibaséma.`
- **B-S23 — DEBUG flag**: `Új backend/utils/debug.js + frontend/javascript/_debug.js; minden nem-explicit-error console.log átállítva debug() / window.MattMesterDebug.log-ra.`
- **B-S14b — chess_barold mappa rename**: `frontend/chess_barold/ → frontend/chess/; minden HTML + JS hivatkozás javítva; grep -rn "chess_barold" üres.`

### Bug-ok (lásd lentebb a táblázatot is)

- **B7 — ELO column SQL prepared**: `backend/chess/abortHelpers.js: a SELECT ${eloColumn} template string helyett MySQL CASE statement vagy whitelisted column constant; query parametrized.`
- **B8 — ELO revert match-count exakt**: `backend/chess/abortHelpers.js: a meccs-induláskor mentett játékos-meccs-szám alapján revert-eljünk, ne a current count - 1 közelítéssel.`
- **B10 — Admin token revoke race**: `backend/api/admin/middleware.js parseAdminToken: a verifyAndTouchToken után, az adminflag DB-recheck atomikusan, hogy a request-flow közben revokeolt token ne kapjon admin-jogot.`
- **B11 — Admin WS reconnect**: `backend/api/admin/socketNamespace.js: reconnect handler, ami az újra-kapcsolódó admin socket-en is futtatja a parseAdminToken handshake-et és visszaállítja az adminAuth context-et.`
- **B12 — Chat blocklist live broadcast**: `backend/server.js refreshDynamicBlockedWords: admin változás után io.emit('chat:blocklist:updated') broadcast a kliens-side cache-frissítéshez.`

---

## Hivatkozások

- **Admin track design doc**: [backend/ADMIN_PANEL.md](backend/ADMIN_PANEL.md)
- **User-facing feature spec**: [backend/USER_FEATURES.md](backend/USER_FEATURES.md)
- **Setup + env-tábla**: [readme.md](readme.md)
- **Tételes issue-lista**: [issues.md](issues.md)
- **Vizuális referencia (chess.com mintaképek)**: `referenciak/`
