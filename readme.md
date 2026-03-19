<h1 align="center">NodeJS - Template project</h1>

---

## 📖 Projekt részletes leírása<br>

Ez a projekt egy **Node.js alapú webalkalmazás sablon (template)**, amely tartalmaz egy teljes értékű **backendet** és egy egyszerű **frontendet**. Célja, hogy kiindulási alapként szolgáljon újabb webalkalmazások fejlesztésekor.

---

## 🗂️ Projekt mappaszerkezete<br>

```
MattMester/
├── backend/                  ← Szerver oldali kód (Node.js / Express)
│   ├── api/
│   │   └── api.js            ← API végpontok (route-ok) definíciója
│   ├── sql/
│   │   └── database.js       ← MySQL adatbázis kapcsolat és lekérdezések
│   ├── nodemon.json          ← Nodemon konfigurációs fájl (fejlesztői auto-restart)
│   ├── package.json          ← Projekt függőségek és npm scriptek
│   └── server.js             ← A szerver belépési pontja (Express app)
├── frontend/                 ← Kliens oldali kód (böngészőben fut)
│   ├── bootstrap/            ← Bootstrap CSS framework fájlok (offline)
│   │   ├── css/
│   │   │   └── bootstrap.min.css
│   │   └── js/
│   │       ├── bootstrap.min.js
│   │       └── popper.min.js
│   ├── css/
│   │   └── index.css         ← Saját stíluslap (jelenleg üres, bővíthető)
│   ├── html/
│   │   └── index.html        ← Főoldal HTML fájl
│   ├── javascript/
│   │   └── index.js          ← Saját frontend JavaScript (jelenleg üres, bővíthető)
│   └── favicon.ico           ← Böngésző tab ikonja
├── referenciak/              ← Referencia képek (pl. chess.com UI minták)
├── .gitignore                ← Git által figyelmen kívül hagyott fájlok
├── .prettierrc               ← Kódformázó (Prettier) beállítások
└── readme.md                 ← Projekt dokumentáció
```

---

## ⚙️ BACKEND – Részletes leírás<br>

A backend a **Node.js** futtatókörnyezetre épül, és az **Express** keretrendszert használja. A backend feladata az összes szerver oldali logika kezelése: HTTP kérések fogadása, adatbázis-műveletek elvégzése, fájlok kezelése és a frontend kiszolgálása.

---

### 📄 `backend/server.js` – A szerver belépési pontja<br>

Ez a fájl indítja el az egész alkalmazást. Feladatai:

| Feladat | Leírás |
|---|---|
| **Express app létrehozása** | `const app = express()` — ez a fő alkalmazásobjektum |
| **JSON middleware** | `app.use(express.json())` — lehetővé teszi, hogy a szerver megértse a JSON formátumú kéréseket |
| **Proxy beállítás** | `app.set('trust proxy', 1)` — proxyn (pl. Nginx) keresztüli futás esetén szükséges |
| **Session kezelés** | `express-session` segítségével beállít egy munkamenet-kezelőt. A `secret` kulccsal titkosítja a session adatokat. A `resave: false` nem írja felül a sessiont, ha nem változott. A `saveUninitialized: true` minden látogatónak létrehoz egy sessiont. |
| **Főoldal route** | `GET /` — visszaküldi a `frontend/html/index.html` fájlt |
| **API route regisztráció** | Az `/api` prefix alá rendeli az `api.js` fájlban definiált összes végpontot |
| **Statikus fájlok kiszolgálása** | A `frontend/` mappa tartalmát (HTML, CSS, JS, Bootstrap) közvetlenül elérhető statikus fájlként szolgálja ki a böngésző számára |
| **Szerver indítása** | A szerver a `127.0.0.1` (localhost) IP-n és a `3000`-es porton figyel |

```js
// Szerver elérhetősége: http://127.0.0.1:3000
app.listen(port, ip, () => {
    console.log(`Szerver elérhetősége: http://${ip}:${port}`);
});
```

---

### 📄 `backend/api/api.js` – API végpontok<br>

Ez a fájl tartalmaz minden `/api/...` útvonalú HTTP végpontot. Az Express `Router` objektumot használja a route-ok szétválasztására.

#### Jelenlegi végpontok:

**`GET /api/test`**
- Egyszerű teszt végpont.
- Ha elérhető, 200-as HTTP státuszkóddal visszaad egy JSON üzenetet.
- Használat: ellenőrizhető, hogy a szerver fut-e és az API elérhető-e.

```http
GET http://localhost:3000/api/test
→ { "message": "Ez a végpont működik." }
```

**`GET /api/testsql`**
- Adatbázis teszt végpont.
- Meghívja a `database.js`-ben definiált `selectall()` függvényt, amely az `exampletable` táblából lekérdez minden sort.
- Sikeres lekérdezés esetén 200-as státusszal visszaküldi az eredményt.
- Hiba esetén 500-as státusszal hibaüzenetet küld vissza.

```http
GET http://localhost:3000/api/testsql
→ { "message": "Ez a végpont működik.", "results": [...] }
```

#### Fájlfeltöltés (Multer konfiguráció):

A fájl tartalmaz egy **Multer** konfigurációt is, amely fájlfeltöltések kezelésére szolgál:

- A feltöltött fájlok a `backend/uploads/` mappába kerülnek (ezt a mappát kézzel kell létrehozni, ha nem létezik).
- Minden feltöltött fájl egyedi nevet kap: `[timestamp]-[eredeti fájlnév]` formátumban (pl. `1700000000000-kepem.jpg`), hogy elkerüljük a névütközéseket.
- A konfigurált `upload` objektumot middleware-ként lehet használni bármely route-ban, ahol fájlokat fogad a szerver.

---

### 📄 `backend/sql/database.js` – Adatbázis kapcsolat és lekérdezések<br>

Ez a fájl kezeli a **MySQL** adatbázissal való kapcsolatot a `mysql2` csomag segítségével.

#### Kapcsolat beállítása (Connection Pool):

```js
const pool = mysql.createPool({
    host: '127.0.0.1',   // Az adatbázis szerver IP-je
    user: 'root',         // MySQL felhasználónév
    password: '',         // MySQL jelszó (fejlesztéshez üres)
    database: 'exampledb' // Az adatbázis neve
});
```

A `createPool` metódus egy **kapcsolatgyűjtőt (pool)** hoz létre:
- `connectionLimit: 10` — egyszerre legfeljebb 10 aktív kapcsolat lehet
- `waitForConnections: true` — ha nincs szabad kapcsolat, várakozzon
- `queueLimit: 0` — korlátlan várakozási sor

#### Definiált SQL függvények:

| Függvény | SQL | Leírás |
|---|---|---|
| `selectall()` | `SELECT * FROM exampletable;` | Az `exampletable` tábla összes sorát visszaadja |

A függvény `async/await` szintaxist használ, és a lekérdezett adatokat visszaadja a hívónak (pl. az API végpontnak). A fájl végén a `module.exports` segítségével exportálja a függvényt, így más fájlokból is elérhető.

---

### 📄 `backend/nodemon.json` – Fejlesztői automatikus újraindítás<br>

A `nodemon` eszköz figyeli a fájlváltozásokat, és szükség esetén automatikusan újraindítja a szervert. Ez a fájl szabályozza a viselkedését:

| Beállítás | Érték | Magyarázat |
|---|---|---|
| `watch` | `["."]` | A teljes backend mappát figyeli |
| `ext` | `"js"` | Csak `.js` kiterjesztésű fájlok változásakor indul újra |
| `exec` | `"node server.js"` | Ezt a parancsot futtatja indításkor és újraindításkor |
| `legacyWatch` | `true` | Lassabb, de stabilabb fájlfigyelési módot engedélyez |
| `usePolling` | `true` | Rendszeres időközönként ellenőrzi a fájlváltozásokat |
| `interval` | `1000` | Az ellenőrzés 1000 milliszekundonként (1 másodpercenként) történik |

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

---

### 📄 `backend/package.json` – Projekt metaadatok és függőségek<br>

| Mező | Érték |
|---|---|
| `name` | `nodejs-template-2025` |
| `version` | `1.0.0` |
| `main` | `server.js` (belépési pont) |
| `author` | Kardos Krisztián |

#### NPM scriptek:

| Parancs | Mit csinál |
|---|---|
| `npm run start` | Elindítja a szervert (`node server.js`) — éles módban, nincs auto-restart |
| `npm run dev` | Elindítja a szervert `nodemon`-nal — fejlesztői módban, auto-restart van |

#### Függőségek:

| Csomag | Verzió | Mire való |
|---|---|---|
| `express` | `^5.1.0` | HTTP szerver és routing keretrendszer |
| `express-session` | `^1.18.2` | Session (munkamenet) kezelés |
| `multer` | `^2.0.2` | Fájlfeltöltések kezelése (multipart/form-data) |
| `mysql2` | `^3.15.2` | MySQL adatbázis kapcsolat (Promise API-val) |
| `nodemon` _(dev)_ | `^3.1.10` | Fejlesztői auto-restart eszköz |

---

## 🖥️ FRONTEND – Részletes leírás<br>

A frontend a böngészőben futó, felhasználó által látható rész. Jelenleg egy egyszerű, bővíthető alaplap, amelyet a szerver statikusan kiszolgál.

---

### 📄 `frontend/html/index.html` – Főoldal<br>

Ez az egyetlen HTML oldal, amelyet a szerver a `GET /` kérésre visszaküld. Felépítése:

**`<head>` rész (metaadatok és erőforrások betöltése):**
- `charset="UTF-8"` — magyar ékezeteket is helyesen jeleníti meg
- `viewport` meta tag — reszponzív megjelenítés mobilon is
- `<title>Főoldal</title>` — a böngésző füle ezt a nevet mutatja
- **Bootstrap CSS** betöltése — a Bootstrap előre elkészített stílusait teszi elérhetővé
- **Popper.js** — a Bootstrap interaktív komponenseihez (dropdown, tooltip, popover) szükséges JavaScript könyvtár
- **Bootstrap JS** — a Bootstrap JavaScript funkcionalitása (modal, collapse, stb.)
- **Saját CSS** — `frontend/css/index.css` (jelenleg üres, ide kerülnek az egyedi stílusok)
- **Saját JavaScript** — `frontend/javascript/index.js` (jelenleg üres, ide kerül az egyedi frontend logika)

**`<body>` rész (megjelenített tartalom):**
```html
<div class="container-fluid">
    <div class="row text-center">
        <h1 class="display-1">A szerver fut.</h1>
    </div>
</div>
```
- `container-fluid` — Bootstrap osztály: teljes szélességű konténer
- `row text-center` — Bootstrap rácsos sor, középre igazított tartalommal
- `display-1` — Bootstrap nagy betűméretű fejléc stílus
- A szöveg "A szerver fut." — egyszerű visszajelzés, hogy az alkalmazás elindult

---

### 📄 `frontend/css/index.css` – Saját stíluslap<br>

Jelenleg **üres** fájl. Ide lehet hozzáadni az egyedi CSS stílusokat, amelyek felülírják vagy kiegészítik a Bootstrap alapbeállításait.

---

### 📄 `frontend/javascript/index.js` – Saját frontend JavaScript<br>

Jelenleg **üres** fájl. Ide kerülhet bármilyen kliens oldali JavaScript logika, például:
- API hívások a backend felé (`fetch`)
- Dinamikus DOM manipuláció
- Eseménykezelők (gombok, űrlapok)
- Adatok megjelenítése

---

### 📁 `frontend/bootstrap/` – Offline Bootstrap<br>

A Bootstrap CSS keretrendszer fájljai **lokálisan** (offline) vannak tárolva, nem CDN-ről töltődnek be. Ez azt jelenti, hogy internet kapcsolat nélkül is működik a stílusozás.

| Fájl | Leírás |
|---|---|
| `bootstrap/css/bootstrap.min.css` | Minifikált Bootstrap CSS — rácsos rendszer, komponensek, utility osztályok |
| `bootstrap/js/bootstrap.min.js` | Minifikált Bootstrap JavaScript — interaktív komponensek (modal, dropdown, stb.) |
| `bootstrap/js/popper.min.js` | Popper.js — pozicionáláshoz szükséges segédkönyvtár (Bootstrap JS függősége) |

---

## 🔗 Hogyan kommunikál a frontend és a backend?<br>

```
Böngésző (Frontend)
        │
        │  HTTP GET /              → Szerver visszaküldi az index.html-t
        │  HTTP GET /css/...       → Statikus CSS fájlok
        │  HTTP GET /javascript/.. → Statikus JS fájlok
        │
        │  HTTP GET /api/test      → JSON válasz: { "message": "..." }
        │  HTTP GET /api/testsql   → JSON válasz: adatbázis adatok
        │
        ▼
   Express Szerver (Backend, port 3000)
        │
        ▼
   MySQL Adatbázis (exampledb)
```

1. A böngésző megnyitja a `http://localhost:3000` oldalt.
2. Az Express szerver visszaküldi az `index.html` fájlt.
3. A böngésző letölti a szükséges CSS és JavaScript fájlokat (Bootstrap + saját).
4. A frontend JavaScript (ha szükséges) HTTP kéréseket küld az `/api/...` végpontokra.
5. A backend végpontok lekérik az adatokat a MySQL adatbázisból, és JSON formátumban visszaküldik.

---

## 🚀 Gyors indítási útmutató<br>

1. Töltsd le a projektet és csomagold ki.<br>

2. Lépj be a backend mappába:<br>
   `cd backend`<br>

3. Telepítsd a függőségeket:<br>
   `npm install`<br>

4. **Fejlesztői módban** (auto-restart fájlváltozáskor):<br>
   `npm run dev`<br>

5. **Éles módban** (nincs auto-restart):<br>
   `npm run start`<br>

6. Nyisd meg a böngészőben: **http://localhost:3000**<br>

---

## 🛠️ NPM hiba esetén<br>

Amennyiben a `npm run start` nem működik a következő hiba miatt:<br>

```
Cannot be loaded because running scripts is disabled on this system.
```

Át kell állítani a PowerShell végrehajtási házirendjét. Ezt rendszergazdai jogosultságokkal futó PowerShell-ben tudod megtenni:<br>

1. Nyisd meg a PowerShell-t.<br>

2. Állítsd be az Execution Policy-t:<br>

```
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

3. Nyomj enter-t.

4. Zárd be és nyisd újra a VS Code-ot.

---

## 🎨 Kódformázás (.prettierrc)<br>

A projekt a **Prettier** kódformázót használja egységes kódstílus biztosításához.

| Beállítás | Érték | Magyarázat |
|---|---|---|
| `singleQuote` | `true` | Szimpla idézőjeleket használ (`'`) a dupla helyett (`"`) |
| `bracketSpacing` | `true` | Szóközök az objektum kapcsos zárójelei között: `{ key: value }` |
| `printWidth` | `100` | Egy sor maximum 100 karakter hosszú lehet |
| `tabWidth` | `4` | Egy tabulátor 4 szóköznek felel meg |
| `trailingComma` | `"none"` | Az utolsó elem után nincs felesleges vessző |

```json
{
    "singleQuote": true,
    "bracketSpacing": true,
    "printWidth": 100,
    "tabWidth": 4,
    "trailingComma": "none"
}
```

**Prettier telepítése VS Code-ban:**

1. Extensions fülben telepítsd: `Prettier - Code formatter`<br>
2. Settings → `editor.defaultFormatter` → Prettier<br>
3. Settings → Format → `Editor: Format On Save` → bekapcsolva<br>
4. Kézzel formáz: `CMD + P` / `CTRL + P`<br>
5. Sor ignorálása formázáskor: `// prettier-ignore`<br>

---

## 🔧 Egyéb hasznos parancsok<br>

### readme.md előnézet megnyitása VS Code-ban:<br>

`Ctrl + Shift + V`<br>

### Port felszabadítása, ha a szerver háttérben fut:<br>

```bash
npx kill-port 3000
```

### package.json létrehozása (ha nem létezik):<br>

```bash
npm init
```

Kövesd a lépéseket: projekt neve → verzió (Enter) → leírás → belépési pont (Enter) → ... → Enter az összes többi mezőnél.
