Admin auth coherence - változásjegyzék

Dátum: 2026-04-29

Leírás
- A repositoryban bevezetésre került egy központi, DI-friendly frontend modul a step-up admin auth kezelésére: `frontend/javascript/shared/adminAuthFlow.js`.
- A `frontend/javascript/adminPanel.js` most ezt a forrást használja lazán példányosítva (`getAdminAuthFlow()`), így minden token- és refresh logika egy helyen van.
- Létrehoztuk a részletes frontend unit teszteket: `frontend/__tests__/adminTokenFlow.test.js` (9 teszt). A tesztek lefedik a következő kulcs-szcenáriókat:
  - sikeres refresh frissíti az expiresAt-et;
  - 401 + `ADMIN_NO_SESSION` -> token törlése + redirect (nem elevate);
  - 500 vagy hálózati hiba -> token megmarad, success=false, warning toast.
- A `backend/jest.config.js` frissítve, hogy a frontend tesztek is futtathatók a repo gyökérről.

Miért történt
- A frontend és a backend között korábban eltérés volt az admin auth hibák kezelésében: a front-end hálózati hibákat auth-hibaként keverte, ami felesleges logoutokat és rossz UX-et eredményezett.
- Egy forrás-igazság (shared module) bevezetésével csökkenthető a drift és javítható a tesztelhetőség.

Mit kell következőleg csinálni
1. ✅ WS eseménynevek szinkronizálva (`admin:alert:suspicious_pattern` mindkét oldalon).
2. ✅ `/api/public/admin-constants` endpoint elérhető — TTL-ek, reason hosszok, UI timing, hibakódok egy forrásból.
3. ☐ Frontend bekötése a `/api/public/admin-constants` válaszra (jelenleg hardcoded értékek + `constants.js` duplikáció).
4. Kövesd a javasolt fejlesztési workflowot: minden új admin mutáló műveletet auditolj és broadcastolj (HTTP 200 + WS `admin:audit:created`); 1 függvény = max 1 return; minden async művelet try-catchben.

Fájlok
- Hozzáadott: `frontend/javascript/shared/adminAuthFlow.js`, `frontend/__tests__/adminTokenFlow.test.js`, `backend/api/routes/public.js`
- Módosított: `frontend/javascript/adminPanel.js`, `frontend/html/adminPanel.html` (script tag), `backend/jest.config.js`, `backend/ADMIN_PANEL.md` (auth lifecycle rész), `backend/api/admin/alertingService.js` (WS event-name fix), `backend/api/api.js` (publicRoutes mount)

Teszt és ellenőrzés
- Frontend syntax: `node --check frontend/javascript/adminPanel.js` és `node --check frontend/javascript/shared/adminAuthFlow.js`
- Tesztek: `npx jest --config backend/jest.config.js --runInBand` → jelenleg 11 suite, 104 teszt — mind passed lokalisan.

Megjegyzés
- A `backend/api/funtions.js` `isAdmin` exportja szándékosan nem lett eltávolítva (deprecation + külön PR javasolt).
- Dokumentáció-frissítések az `ADMIN_PANEL.md`-ben megtörténtek; kérlek nézd át és jelezd, ha további részleteket szeretnél beépíteni.
