//!Module-ok importálása
const express = require('express'); //?npm install express
const session = require('express-session'); //?npm install express-session
const path = require('path');
const http = require('http');
const { Server } = require('socket.io'); //?npm install socket.io
const { initDatabase } = require('./sql/database');
const services = require('./services.js');

//!Beállítások
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ip = '127.0.0.1';
const port = 3000;

//?Session beállítása
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

//!Szerver futtatása
app.use(express.static(path.join(__dirname, '../frontend'))); //?frontend mappa tartalmának betöltése az oldal működéséhez

//!Routing
//?Főoldal:
const endpoints = require('./api/api.js');
app.use('/api', endpoints);
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/html/index.html'));
});

//Socket.io események
services.startHeartbeat(io); //?Heartbeat indítása a statisztikák frissítéséhez
io.on('connection', (socket) => {
    console.log('Új Socket.io kapcsolat létrejött:', socket.id);
    services.handleConnection(socket, io);

    socket.on('heartbeat', () => {
        // services.refreshStats(io); //?Statisztikák frissítése minden kliensnek a heartbeat eseményre
    });

    socket.on('disconnect', () => {
        console.log('Socket.io kapcsolat megszakadt:', socket.id);
    });
});

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
