//!Module-ok importálása
const express = require('express'); //?npm install express
const session = require('express-session'); //?npm install express-session
const path = require('path');
const http = require('http');
const fs = require('fs');
const { Server } = require('socket.io'); //?npm install socket.io
const { initDatabase } = require('./sql/database');
const { services, leaderboardService } = require('./services.js');
const { createSocketHub } = require('./sockets.js');
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

//?CORS beállítása production-hez
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim());

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Rejected origin: ${origin}`);
            callback(new Error(`CORS policy: origin ${origin} not allowed`));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // 1 nap
};

try {
    const cors = require('cors');
    app.use(cors(corsOptions));
    console.log('[Server] CORS middleware loaded');
} catch (corsError) {
    console.warn('[Server] CORS module not available, skipping CORS middleware');
}

app.use(express.json()); //?Middleware JSON
app.set('trust proxy', 1); //?Middleware Proxy

const socketHub = createSocketHub(io);
app.locals.socketHub = socketHub;

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

// ?Chat Rate Limiter cleanup inicializálása
if (typeof endpoints.initChatRateLimiterCleanup === 'function') {
    endpoints.initChatRateLimiterCleanup();
    console.log('[Server] Chat Rate Limiter cleanup initialized');
}

app.use('/api', endpoints);
const chessEndpoints = require('./api/chess_api.js');
app.use('/api/chess', chessEndpoints);
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/html/index.html'));
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

function normalizeProfileImageReference(storedFilename) {
    const normalized = String(storedFilename || '').replace(/\\/g, '/').trim();
    if (!normalized) {
        return null;
    }

    if (normalized.startsWith('/profile_pictures/')) {
        return normalized.toLowerCase();
    }

    return `/profile_pictures/${normalized.replace(/^\/+/, '')}`.toLowerCase();
}

async function cleanupOrphanProfileImageFiles() {
    const profilePicturesDir = path.join(__dirname, 'profile_pictures');
    const dbReferences = await sql.getAllProfileImageReferences();
    const normalizedReferences = new Set(
        (dbReferences || [])
            .map((filename) => normalizeProfileImageReference(filename))
            .filter(Boolean)
    );

    normalizedReferences.add('/profile_pictures/default.png');

    let deletedCount = 0;
    const entries = await fs.promises.readdir(profilePicturesDir, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }

        const normalizedEntryPath = normalizeProfileImageReference(`/profile_pictures/${entry.name}`);
        if (!normalizedEntryPath || normalizedReferences.has(normalizedEntryPath)) {
            continue;
        }

        try {
            await fs.promises.unlink(path.join(profilePicturesDir, entry.name));
            deletedCount += 1;
            console.log(`[Cleanup] Árva fájl törölve: ${entry.name}`);
        } catch (error) {
            if (error && error.code === 'ENOENT') {
                continue;
            }
            console.error(`[Cleanup] Árva fájl törlési hiba: ${entry.name}`, error.message);
        }
    }

    if (deletedCount > 0) {
        console.log(`[Cleanup] Árva profilkép fájlok törölve: ${deletedCount}`);
    }
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

        const deletedOrphanUploadRows = await sql.deleteOrphanProfileImageUploadRecords();
        if (deletedOrphanUploadRows > 0) {
            console.log(`[Cleanup] Árva profile_image_uploads rekordok törölve: ${deletedOrphanUploadRows}`);
        }

        await cleanupOrphanProfileImageFiles();
    } catch (err) {
        console.error('Cleanup service hiba:', err.message);
    }
}

// Adatbázis inicializálása, majd szerver indítása
initDatabase()
    .then(async () => {
        await services.refreshStats(io);
        services.handleHeartbeat(io); //?Heartbeat indítása a statisztikák frissítéséhez
        leaderboardService.handleLeaderBoardCache(); //?Leaderboard cache periodikus frissítése
        
        // Cleanup service: discarded profilképek törlése minden percben
        setInterval(cleanupDiscardedProfileImages, 60000); // 60 másodpercenként futtatás
        console.log('Cleanup service elindítva (percenkénti futás)');
        
        server.on('error', (error) => {
            if (error && error.code === 'EADDRINUSE') {
                console.error(`A ${ip}:${port} port már használatban van. Zárd be a régi backend folyamatot, vagy használd az \"npm run dev\" scriptet, ami indulás előtt felszabadítja a portot.`);
                process.exit(1);
                return;
            }

            console.error('Szerver indítási hiba:', error);
            process.exit(1);
        });

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
