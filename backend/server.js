//!Module-ok importálása
const express = require('express'); //?npm install express
const session = require('express-session'); //?npm install express-session
const path = require('path');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io'); //?npm install socket.io
const { initDatabase } = require('./sql/database');
const { services, leaderboardService } = require('./services.js');
const sql = require('./sql/sql_funtions');

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

// Belepett felhasznalo ellenorzese vedett oldalakhoz
function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.redirect('/');
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.userId || req.session.role !== 'admin') {
        return res.redirect('/');
    }
    next();
}

// Vedett oldalak: ha nincs session, visszadob az indexre
app.get('/html/profile.html', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/html/profile.html'));
});

app.get('/html/adminPanel.html', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/html/adminPanel.html'));
});

//!Szerver futtatása
app.use(express.static(path.join(__dirname, '../frontend'))); //?frontend mappa tartalmának betöltése az oldal működéséhez
app.use('/profile_pictures', express.static(path.join(__dirname, 'profile_pictures')));

//!Routing
//?Főoldal:
const endpoints = require('./api/api.js');
app.use('/api', endpoints);
const chessEndpoints = require('./api/chess_api.js');
app.use('/api/chess', chessEndpoints);
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/html/index.html'));
});

//Socket.io események
io.on('connection', (socket) => {
    services.handleConnection(socket, io);
    socket.on('heartbeat', () => {
        // services.refreshStats(io); //?Statisztikák frissítése minden kliensnek a heartbeat eseményre
    });

    socket.on('disconnect', () => {
    });
});

function resolveProfileImageFilePath(storedFilename) {
    const normalized = String(storedFilename || '').replace(/\\/g, '/').trim();
    if (!normalized) {
        return null;
    }

    if (normalized.startsWith('/profile_pictures/')) {
        const relativePath = normalized.replace(/^\//, '');
        return path.join(__dirname, relativePath);
    }

    return path.join(__dirname, 'profile_pictures', normalized);
}

//!Cleanup service: Discarded és elutasított profilképek törlése periodikusan
async function cleanupDiscardedProfileImages() {
    try {
        const discardedRecords = await sql.getAndDeleteDiscardedProfileImages();
        
        if (discardedRecords && discardedRecords.length > 0) {
            for (const record of discardedRecords) {
                const filePath = resolveProfileImageFilePath(record.filename);
                let shouldDeleteDbRecord = false;

                if (!filePath) {
                    console.warn(`[Cleanup] Fájlnév hiányzik, DB rekord megtartva: id=${record.id}`);
                    continue;
                }

                try {
                    await fs.promises.unlink(filePath);
                    shouldDeleteDbRecord = true;
                    console.log(`[Cleanup] Fájl törölve: ${record.filename}`);
                } catch (fileErr) {
                    if (fileErr && fileErr.code === 'ENOENT') {
                        shouldDeleteDbRecord = true;
                        console.log(`[Cleanup] Fájl nem létezik (ENOENT): ${record.filename}`);
                    } else {
                        shouldDeleteDbRecord = false;
                        console.error(`[Cleanup] Fájltörlés hiba (újrapróbálható): ${record.filename}`, fileErr.message);
                    }
                }
                
                if (!shouldDeleteDbRecord) {
                    console.log(`[Cleanup] DB rekord megtartva: ${record.id}`);
                    continue;
                }

                try {
                    const deleted = await sql.deleteDiscardedProfileImageRecord(record.id);
                    if (deleted) {
                        console.log(`[Cleanup] DB rekord törölve: ${record.id}`);
                    } else {
                        console.log(`[Cleanup] DB rekord megtartva (nem törölhető állapot): ${record.id}`);
                    }
                } catch (dbErr) {
                    console.error(`[Cleanup] DB törlési hiba: ${record.id}`, dbErr.message);
                }
            }
            console.log(`Cleanup service: ${discardedRecords.length} kép feldolgozva (discarded + rejected)`);
        }
    } catch (err) {
        console.error('Cleanup service hiba:', err.message);
    }
}

// Adatbázis inicializálása, majd szerver indítása
initDatabase()
    .then(() => {
        services.handleHeartbeat(io); //?Heartbeat indítása a statisztikák frissítéséhez
        leaderboardService.handleLeaderBoardCache(); //?Leaderboard cache periodikus frissítése
        
        // Cleanup service: discarded profilképek törlése minden percben
        setInterval(cleanupDiscardedProfileImages, 60000); // 60 másodpercenként futtatás
        console.log('Cleanup service elindítva (percenkénti futás)');
        
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
