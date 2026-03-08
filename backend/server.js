//!Module-ok importálása
const express = require('express'); //?npm install express
const session = require('express-session'); //?npm install express-session
const path = require('path');
const http = require('http');
const { Server } = require('socket.io'); //?npm install socket.io
const { initDatabase } = require('./sql/database');

//!Beállítások
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const router = express.Router();

const ip = '127.0.0.1';
const port = 3000;

const sessionSecret = process.env.SESSION_SECRET || 'chu+)2_23iIa6sou&>#o79247r9Xbsibv%';

const sessionMiddleware = session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, //1 nap időtartam
        httpOnly: true, secure: false, sameSite: 'lax'
    }
});

//!Session beállítása:
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware); //?Socket.io session kezelés

app.use(express.json()); //?Middleware JSON
app.set('trust proxy', 1); //?Middleware Proxy

//!Routing
//?Főoldal:
router.get('/', (request, response) => {
    response.sendFile(path.join(__dirname, '../frontend/html/index.html'));
});

router.get('/register', (request, response) => {
    response.sendFile(path.join(__dirname, '../frontend/html/register.html'));
});

router.get('/login', (request, response) => {
    response.sendFile(path.join(__dirname, '../frontend/html/login.html'));
});
//!API endpoints
app.use('/', router);
const endpoints = require('./api/api.js');
app.use('/api', endpoints);


//!Szerver futtatása
app.use(express.static(path.join(__dirname, '../frontend'))); //?frontend mappa tartalmának betöltése az oldal működéséhez

//?Socket.io heartbeat kezelése
const services = require('./services.js');

// Adatbázis inicializálása, majd szerver indítása
initDatabase()
    .then(() => {
        server.listen(port, ip, () => {
            console.log(`Szerver és Socket elérhetősége: http://${ip}:${port}`);
        });
    })
    .catch((err) => {
        console.error('Adatbázis inicializálási hiba:', err);
        process.exit(1);
    });

//?Szerver futtatása terminalból: npm run dev
//?Szerver leállítása (MacBook és Windows): Control + C
//?Terminal ablak tartalmának törlése (MacBook): Command + K
