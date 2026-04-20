<h1 align="center">NodeJS - Template project</h1>

## readme.md preview megnyitása:<br>

`Ctrl + Shift + V`<br>

## package.json fájl létrehozása, amennyiben nem létezik:<br>

1. Terminal megnyitása.<br>

2. npm init<br>

3. **Package name:** A projekt neve<br>

4. **Version:** Elég egy entert nyomni<br>

5. **Description:** Leírása a projektnek _(valamilyen stringet megadunk, majd enter)_<br>

6. **Entry point:** elég egy entert nyomnunk<br>

7. **Test command:** elég egy entert nyomnunk<br>

8. **Git repository:** elég egy entert nyomnunk<br>

9. **Keywords:** elég egy entert nyomnunk<br>

10. **Author:** beírhatjuk a saját nevünket<br>

11. **License:** elég egy entert nyomnunk<br>

12. Ezután megjelenik az, hogy ez a fájl, amit szeretnénk-e létrehozni, majd egy enter megadásával létrehozhatjuk a **package.json** fájlt.<br>

## NodeJS - Template project használata:<br>

1. Töltsd le a Template project-et és csomagold ki.<br>

2. Lépj be a backend mappába:<br>
   `cd backend`<br>

3. Telepítsd a függőségeket a backend mappába a következő parancs segítségével, amennyiben nincs node_modules mappa a backend mappában:<br>
   `npm install`<br>

4. Backend indítása fejlesztés alatt: _(Fájlok szerkesztésének az esetén újraindul a szerver.)_<br>
   `npm run dev`<br>
   _(Automatikusan indul: CORS middleware + Chat Rate Limiter cleanup)_<br>

5. Backend indítása élesben: _(Fájlok szerkesztésének az esetén nem indul újra a szerver.)_<br>
   `npm run start`<br>

6. Tesztek futtatása:<br>
   `npm test` - Összes teszt futtatása<br>
   `npm run test:watch` - Tesztek figyelési módban<br>
   `npm run test:coverage` - Code coverage report<br>

## Email verifikáció beállítása (SMTP):<br>

Az email verifikáció működéséhez valós SMTP adatok szükségesek. Ha ez nincs beállítva, a rendszer fejlesztői `json-dev` fallback módba vált, és a levél csak logba kerül.<br>

1. Lépj be a backend mappába:<br>
   `cd backend`<br>

2. Készíts `.env` fájlt a backend mappában (például a `.env.example` alapján).<br>

3. Töltsd ki legalább ezeket a mezőket:<br>

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<kuldo-email-cim>
SMTP_PASS=<smtp-jelszo-vagy-app-password>
SMTP_SECURE=false
SMTP_FROM=MattMester <kuldo-email-cim>
PUBLIC_BASE_URL=http://127.0.0.1:3000
```

4. Indítsd újra a backendet:<br>
   `npm run dev`<br>

5. Profil oldalon, az Account Status szekcióban kérj új verifikációs emailt.<br>

### Gmail gyors beállítás (teszthez):<br>

1. Kapcsold be a kétlépcsős azonosítást a Google fiókban.<br>
2. Készíts App Password-öt.<br>
3. Az App Password értékét használd `SMTP_PASS` mezőként.<br>

### Diagnosztika: miért nem érkezik meg az email?<br>

Gyakori okok:<br>
- Rossz SMTP host vagy port<br>
- Hibás SMTP user/pass (auth hiba)<br>
- Hibás `SMTP_FROM` vagy a provider tiltja<br>
- Provider sandbox mód<br>
- Spam/Promóciók mappa<br>
- Lokális tűzfal / hálózati tiltás<br>

Backend logban ezeket nézd:<br>
- `Transporter init sikeres: kind=smtp`<br>
- `SMTP kapcsolat ellenőrzés rendben (verify).`<br>
- `Küldés sikeres` + `messageId`<br>

Ha ezt látod, hogy `SMTP fallback aktiv: kind=json-dev`, akkor nincs érvényes SMTP beállítás betöltve a környezetből.<br>

## NPM hiba esetén<br>

Amennyiben a npm run start nem működik a következő hiba miatt:<br>

```
Cannot be loaded because running scripts is disabled on this system.
```

#### Megoldás:<br>

Át kell állítani a PowerShell végrehajtási házirendjét. Ezt rendszergazdai jogosultságokkal futó PowerShell-ben tudod megtenni:<br>

1. Nyisd meg a PowerShell-t.<br>

2. Állítsd be az Execution Policy-t a következő parancs segítségével:<br>

```
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

3. Nyomj enter-t.

4. Zárd be és nyisd újra a VS Code-ot.

## Használat:<br>

Nyisd meg a böngésződben a **http://localhost:3000** címet.

## Felhasznált npm package-ek backend-en:<br>

### Production Dependencies:<br>
`express` - Web framework<br>
`express-session` - Session management<br>
`mysql2` - MySQL database driver<br>
`bcrypt` - Password hashing<br>
`multer` - File upload handling<br>
`socket.io` - Real-time communication<br>
`cors` - Cross-Origin Resource Sharing<br>
`express-rate-limit` - Brute-force védelem az auth endpointokon<br>
`dotenv` - Környezeti változók betöltése `.env` fájlból<br>

### Development Dependencies:<br>
`nodemon` - Auto-restart on file changes<br>
`jest` - Testing framework<br>
`supertest` - HTTP assertion library<br>

## nodemon.json felépítése:<br>

1. **"watch": ["."]:** megadja, hogy a teljes projektmappát figyelje a nodemon.<br>

2. **"ext": "js":** Ha bármely .js fájl változik → Nodemon újraindítja a szervert.<br>

3. **"exec": "node server.js":** Ezt a parancsot futtatja a nodemon minden újraindításkor.<br>

4. **"legacyWatch": true:** Engedélyezi a lassabb, de stabilabb fájlfigyelési módot.<br>

5. **"usePolling": true:** Rendszeresen ellenőrzi, változott-e a fájl.<br>

6. **"interval": 1000:** Meghatározza, hogy a polling milyen időközönként történjen az ellenőrzés.<br>

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

## .prettierrc fájl felépítése:<br>

1. Létrehozunk a projektünkben a következő néven egy fájlt: .prettierrc<br>

2. A fájlban nyitunk kapcsos zárójeleket, amelyek közé definiálhatjuk, hogy miket formázzon automatikusan a prettier<br>

3. Beállítása annak, hogy minden idézőjel szimpla idézőjel legyen: ”singleQuote”: true (false értékkel minden szimpla rendes idézőjel lesz).<br>

4. Annak beállítása, hogy legyen-e szóköz az objektum kapcsos zárójelei között: "bracketSpacing": true<br>

5. Annak meghatározása, hogy maximum hány karakter hosszú lehet egy sor: "printWidth": 100<br>

6. Beállítása annak, hogy a tabulátor hány szóközt érjen: "tabWidth": 4<br>

7. Annak meghatározása, hogy egy objektum esetén az utolsó sor után ne szerepeljen vessző: "trailingComma": "none"<br>

```
{
    "singleQuote": true,
    "bracketSpacing": true,
    "printWidth": 100,
    "tabWidth": 4,
    "trailingComma": "none"
}
```

## .prettierrc használata:<br>

1. Az Extensions fülben telepítsd a prettier-t.<br>

2. Keresd meg a VS Code beállításokban az editor.defaultFormatter opciót és válasszuk ki a Prettiert, mint formázót.<br>

3. Settings => Rákeresés a következőre: Format => Editor: Format On Save _(Ez legyen bekapcsolva)_<br>

4. Keyboard shortcuts => Format document => CMD + P / CTRL + P<br>

5. Egyéb: Prettier ignorálás: (sor elé) // prettier-ignore<br>

## Amennyiben egy port-on továbbra is futna a szerver, viszont a terminal-t már bezártuk, így onnan nem tudjuk leállítani:<br>

`npx kill-port port`<br>

`npx kill-port 3000`<br>

## Chat System - Konfigurációs Beállítások<br>

### CORS Beállítás (Production-hez):


 Létrehozz egy `.env` fájlt a backend mappában:

```
ALLOWED_ORIGINS=http://localhost:3000,https://mattmester.com,https://www.mattmester.com
SESSION_SECRET=<kriptográfiailag biztonságos string>
CHAT_BLACKLIST_POLICY=hard_block
NODE_ENV=production
```

### Chat Rate Limiter Beállítások:

Az alábbi konstansok módosítható az `api.js`-ben:

```javascript
const CHAT_RATE_LIMIT_MAX_MESSAGES = 5;    // Üzenetek szám / időablakon
const CHAT_RATE_LIMIT_WINDOW_MS = 10 * 1000; // 10 másodperces ablak
```

**Rate Limiter Cleanup:** Automatikusan fut 5 percenként, feldolgozza a memóriát és megtisztítja a régi adatokat.<br>

### Auth Rate Limiter (brute-force védelem):

Az auth-végpontokat (`/login`, `/register`, `/profile/verify-current-password`) a [backend/api/middleware/rateLimiter.js](backend/api/middleware/rateLimiter.js) középső réteg védi. A modul egy univerzális factory-t (`createRateLimiter`) és három előre konfigurált limitert exportál:

| Limiter | Ablak | Max kérés | Megjegyzés |
|---------|------|-----------|------------|
| `authLoginLimiter` | 15 perc | 10 | Csak sikertelen loginokat számol (`skipSuccessfulRequests`) |
| `authRegisterLimiter` | 60 perc | 5 | Regisztráció / bot spam védelem |
| `verifyPasswordLimiter` | 15 perc | 10 | Settings modal aktuális jelszó ellenőrzés, csak sikertelen kísérlet számít |

Új endpointra saját limiter így köthető be:

```javascript
const { createRateLimiter } = require('./api/middleware/rateLimiter.js');

const myLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: 'Túl sok kérés, próbáld újra később.'
});

router.post('/my-endpoint', myLimiter, handler);
```

Limit átlépésnél a válasz `429 Too Many Requests` státuszú JSON: `{ success: false, message }`.<br>

Egyes limitek opcionális `code` mezőt is visszaadhatnak (példa: `EMAIL_RESEND_RATE_LIMIT`), ezért kliens oldalon érdemes `code` és `message` mezőt is kezelni.<br>

### Jest Testing<br>

A projekt Jest tesztsuite-tal rendelkezik. A tesztek a következő területeket fedik le:

- **Chat API Endpoints** - Konverzáció listázása, üzenetkezelés, privát chat<br>
- **Rate Limiting** - Rate limit logika validációja<br>
- **Error Handling** - Hibakezelés és validáció<br>

Tesztek futtatása:

```bash
# Összes teszt futtatása
npm test

# Tesztek figyelési módban (auto-reload)
npm run test:watch

# Code coverage report
npm run test:coverage
```

Tesztek helye: `backend/__tests__/`<br>
