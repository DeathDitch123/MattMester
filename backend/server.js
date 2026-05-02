//!Module-ok importálása
const express = require('express'); //?npm install express
const session = require('express-session'); //?npm install express-session
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');
const { Server } = require('socket.io'); //?npm install socket.io
const { initDatabase } = require('./sql/database');
const { services, leaderboardService } = require('./services.js');
const { createSocketHub } = require('./sockets.js');
const sql = require('./sql/sql_funtions');

const envPaths = [
    path.resolve(__dirname, '.env'),
    path.resolve(__dirname, '../.env')
];

envPaths.forEach((envPath) => {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath, override: false, quiet: true });
    }
});

// Why: a NODE_ENV az egész fájl viselkedését eldönti (cookie.secure, sameSite, SESSION_SECRET fallback engedélyezése).
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

//!Beállítások
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const ip = '127.0.0.1';
const port = 3000;

//?Session secret feloldása
// Why: production-ben a hardcoded fallback session-hijack vektor; dev-ben viszont a tesztek és helyi futás ne törjön, ha nincs .env.
function resolveSessionSecret() {
    let secret = process.env.SESSION_SECRET;
    if (!secret) {
        if (IS_PRODUCTION) {
            console.error('[Server] SESSION_SECRET kötelező NODE_ENV=production esetén. Állítsd be az .env-ben (lásd .env.example) és indítsd újra.');
            process.exit(1);
        }
        secret = crypto.randomBytes(32).toString('hex');
        console.warn('[Server] SESSION_SECRET hiányzik — dev fallback random érték generálva. Production-ben kötelező a .env beállítás.');
    }
    return secret;
}

const sessionSecret = resolveSessionSecret();
const sessionMiddleware = session({
    secret: sessionSecret,
    resave: false,
    // Why: GDPR + memória — minden látogatónak ne készüljön session-rekord, csak ha tényleg írunk bele (login után).
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, //1 nap időtartam
        httpOnly: true,
        // Why: secure cookie csak HTTPS mögött működik; dev-ben (http://localhost) ki kell kapcsolni, különben a böngésző eldobja.
        secure: IS_PRODUCTION,
        // Why: production-ben strict — CSRF védelem; dev-ben lax kell, hogy a localhost <-> 127.0.0.1 váltás és OAuth-szerű redirect ne dobja el.
        sameSite: IS_PRODUCTION ? 'strict' : 'lax'
    }
});

//!Session beállítása:
app.use(sessionMiddleware);
io.engine.use(sessionMiddleware); //?Socket.io session kezelés

// ipBlockGuard: hard IP-blokk middleware. A session middleware UTAN, a route-ok ELOTT.
// Az ip_blocks tablat olvasva 60sec cache-szel; blokkolt IP -> 403.
const { ipBlockGuard } = require('./api/middleware/ipBlockGuard.js');
app.use(ipBlockGuard);

//?CORS beállítása production-hez
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim());

const corsOptions = {
    origin: (origin, callback) => {
        // Check if origin is in allowed list, or normalize localhost <-> 127.0.0.1
        const normalizeOrigin = (value) => {
            try {
                const parsed = new URL(String(value || '').trim());
                const hostname = parsed.hostname === '127.0.0.1' ? 'localhost' : parsed.hostname;
                const port = parsed.port ? `:${parsed.port}` : '';
                return `${parsed.protocol}//${hostname}${port}`;
            } catch (_error) {
                return String(value || '').trim();
            }
        };

        let isAllowed = false;
        if (!origin || ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
            isAllowed = true;
        } else {
            // Handle localhost <-> 127.0.0.1 equivalence
            const normalizedOrigin = normalizeOrigin(origin);
            isAllowed = ALLOWED_ORIGINS.some(allowed => {
                return normalizeOrigin(allowed) === normalizedOrigin;
            });
        }
        
        if (isAllowed) {
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

// Why: helmet alap biztonsági headerek (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, stb.) +
//      a meglévő frontend <meta CSP>-vel SZINKRON forrás-engedélyek. A böngésző a HTTP-header és a meta-tag CSP-t
//      metszetként alkalmazza, ezért ugyanazokat a forrásokat kell engedni itt, mint amit a HTML-ek is engednek
//      (cdn.jsdelivr.net Bootstrap/popper/chart.js, Google Fonts), különben a layout szétesik.
//      'unsafe-inline' a meglévő inline script/style miatt; nonce-os szigorítás külön issue.
try {
    const helmet = require('helmet');
    app.use(helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
                // Why: a meglévő frontend HTML-ek bőven használnak inline onclick=/onchange= handlereket.
                //      A helmet useDefaults: true alapból 'none'-ra tenné a script-src-attr-t és blokkolná őket
                //      (gombok, navigáció nem reagálna), ezért szinkronba hozzuk a script-src-rel.
                scriptSrcAttr: ["'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
                // Why: inline style="..." attribútumok is vannak; a meta CSP-vel összhangban engedjük.
                styleSrcAttr: ["'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'blob:'],
                // Why: Socket.IO ws:// / wss:// + cdn.jsdelivr.net a HTML meta CSP-kkel megegyezően.
                connectSrc: ["'self'", 'ws:', 'wss:', 'https://cdn.jsdelivr.net'],
                fontSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net', 'https://fonts.gstatic.com'],
                objectSrc: ["'none'"],
                frameAncestors: ["'self'"]
            }
        },
        // Why: dev-ben (http://) a HSTS csak a böngésző gyorsítótárát piszkítaná. Production-ben a reverse proxy szintjén kapcsoljuk be.
        hsts: IS_PRODUCTION,
        // Why: cross-origin asset-ek (jsdelivr Bootstrap, Google Fonts) miatt nem zárhatjuk le ezeket teljesen.
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' }
    }));
    console.log('[Server] Helmet middleware loaded');
} catch (helmetError) {
    console.warn('[Server] Helmet module not available, skipping security headers:', helmetError.message);
}

app.use(express.json()); //?Middleware JSON
// Why: trust proxy=1 csak akkor helyes, ha a backend egyetlen reverse proxy mögött (pl. Nginx, Cloudflare) fut.
//      Direct expose esetén X-Forwarded-* spoofolható, ezért a rate limiter és session secure-cookie félrevezethető.
//      A `readme.md` "Környezeti változók" szekciója részletezi a feltételeket.
app.set('trust proxy', 1); //?Middleware Proxy

const socketHub = createSocketHub(io);
app.locals.socketHub = socketHub;
app.locals.sessionStore = sessionMiddleware.store;

// Admin panel - /admin socket namespace + service binderek (ADMIN_PANEL.md F4)
const { createAdminNamespace, createAdminBroadcaster, createAdminUserEmitter, createAdminUserDisconnector } = require('./api/admin/socketNamespace.js');
const adminAuditService = require('./api/admin/auditService.js');
const adminAlertingService = require('./api/admin/alertingService.js');
const adminNamespace = createAdminNamespace(io);
const adminSocketHub = {
    broadcastAdmin: createAdminBroadcaster(adminNamespace),
    emitToAdminUser: createAdminUserEmitter(adminNamespace),
    disconnectAllForAdminUser: createAdminUserDisconnector(adminNamespace),
    namespace: adminNamespace
};
app.locals.adminSocketHub = adminSocketHub;
adminAuditService.bindSocketHub(adminSocketHub);
adminAlertingService.bindSocketHub(adminSocketHub);

// Admin dashboard - 5 mp-enkenti stats tick (admin:stats:tick)
const adminStatsTickService = require('./api/admin/statsTickService.js');
adminStatsTickService.start({ adminSocketHub, socketHub });

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

function normalizeProfileImagePath(raw) {
    const s = String(raw || '').replace(/\\/g, '/').trim();
    if (!s) return null;
    const ref = s.startsWith('/profile_pictures/')
        ? s
        : `/profile_pictures/${s.replace(/^\/+/, '')}`;
    return ref.toLowerCase();
}

function resolveProfileImageFilePath(raw) {
    const ref = normalizeProfileImagePath(raw);
    if (!ref) return null;
    return path.join(__dirname, ref.replace(/^\//, ''));
}

async function cleanupOrphanProfileImageFiles() {
    const profilePicturesDir = path.join(__dirname, 'profile_pictures');
    const dbReferences = await sql.getAllProfileImageReferences();
    const normalizedReferences = new Set(
        (dbReferences || [])
            .map((filename) => normalizeProfileImagePath(filename))
            .filter(Boolean)
    );

    normalizedReferences.add('/profile_pictures/default.png');

    let deletedCount = 0;
    const entries = await fs.promises.readdir(profilePicturesDir, { withFileTypes: true });

    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }

        const normalizedEntryPath = normalizeProfileImagePath(`/profile_pictures/${entry.name}`);
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

                if (!filePath) {
                    console.warn(`[Cleanup] Fájlnév hiányzik, DB rekord megtartva: id=${record.id}`);
                    continue;
                }

                try {
                    await fs.promises.unlink(filePath);
                    console.log(`[Cleanup] Fájl törölve: ${record.filename}`);
                } catch (fileErr) {
                    if (!fileErr || fileErr.code !== 'ENOENT') {
                        console.error(`[Cleanup] Fájltörlés hiba (újrapróbálható): ${record.filename}`, fileErr.message);
                        console.log(`[Cleanup] DB rekord megtartva: ${record.id}`);
                        continue;
                    }
                    console.log(`[Cleanup] Fájl nem létezik (ENOENT): ${record.filename}`);
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
        leaderboardService.handleLeaderBoardCache(io); //?Leaderboard cache periodikus frissítése + realtime socket push
        
        // Cleanup service: discarded profilképek törlése minden percben
        setInterval(cleanupDiscardedProfileImages, 60000); // 60 másodpercenként futtatás
        console.log('Cleanup service elindítva (percenkénti futás)');

        // Admin audit retention scheduler (ADMIN_PANEL.md F9)
        const { startRetentionScheduler } = require('./api/admin/retentionJob.js');
        startRetentionScheduler();

        // Soft-delete purge scheduler (admin-trigger 24h grace utan hard-delete).
        const { startSoftDeletePurgeScheduler } = require('./api/admin/softDeletePurgeJob.js');
        startSoftDeletePurgeScheduler();

        // Dinamikus chat-blocklist (admin altal hozzadott szavak) betoltese DB-bol
        // a containsBlockedWord() in-memory cachebe. A cache az admin endpoint-bol
        // (POST /admin/chat/blocklist/add) van bovitve.
        try {
            const sqlFns = require('./sql/sql_funtions.js');
            const loadedCount = await sqlFns.refreshDynamicBlockedWords();
            console.log(`[Server] Dynamic chat blocklist loaded: ${loadedCount} word(s).`);
        } catch (err) {
            console.warn('[Server] Dynamic chat blocklist betoltesi hiba:', err.message);
        }
        
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
