//!Module-ok importálása
const express = require('express'); //?npm install express
const session = require('express-session'); //?npm install express-session
const path = require('path');
const { initDatabase } = require('./sql/database');

//!Beállítások
const app = express();
const router = express.Router();

const ip = '127.0.0.1';
const port = 3000;

app.use(express.json()); //?Middleware JSON
app.set('trust proxy', 1); //?Middleware Proxy

//!Session beállítása:
app.use(
    session({
        secret: 'chu+)2_23iIa6souo79247r9Xbsibv%', //?Ezt generálni kell a későbbiekben
        resave: false,
        saveUninitialized: true,
        cookie: {
            // Időtartam: 1000ms * 60s * 60p * 24ó = 1 nap
            maxAge: 1000 * 60 * 60 * 24, 
            
            // Biztonság: a kliens oldali JS (document.cookie) nem férhet hozzá
            httpOnly: true, 
            
            // HTTPS: ha true, csak titkosított kapcsolaton megy a süti
            // Fejlesztéskor (localhost) legyen false, élesben true!
            secure: false, 
            
            // CSRF védelem: korlátozza a süti küldését más oldalakról
            sameSite: 'lax' 
        }
    })
);

//!Routing
//?Főoldal:
router.get('/', (request, response) => {
    response.sendFile(path.join(__dirname, '../frontend/html/index.html'));
});

//!API endpoints
app.use('/', router);
const endpoints = require('./api/api.js');
app.use('/api', endpoints);


//!Szerver futtatása
app.use(express.static(path.join(__dirname, '../frontend'))); //?frontend mappa tartalmának betöltése az oldal működéséhez

// Adatbázis inicializálása, majd szerver indítása
initDatabase()
    .then(() => {
        app.listen(port, ip, () => {
            console.log(`Szerver elérhetősége: http://${ip}:${port}`);
        });
    })
    .catch((err) => {
        console.error('Adatbázis inicializálási hiba:', err);
        process.exit(1);
    });

//?Szerver futtatása terminalból: npm run dev
//?Szerver leállítása (MacBook és Windows): Control + C
//?Terminal ablak tartalmának törlése (MacBook): Command + K
