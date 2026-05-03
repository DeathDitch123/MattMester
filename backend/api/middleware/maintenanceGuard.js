// Maintenance mode middleware. Ha a site_settings.maintenance_mode = TRUE,
// minden NEM-admin user 503-at kap. Az adminok (Bearer token) tovabb tudnak
// dolgozni, kulonben az admin sem tudna kikapcsolni.
//
// Mentesseget elvezo utvonalak (mindig elerhetoek):
//   /api/admin/*               — admin API (azert hogy be tudjon lepni / off-toggle)
//   /api/auth/admin-elevation/* — admin elevate flow
//   /api/login, /api/logout    — bejelentkezes (admin tud bejelentkezni)
//   /api/admin/auth/*          — admin auth sub-router (elevate, refresh)
//   /api/auth/me, /api/me      — session check (admin panel handshake)
//   /api/health                — health-check (load balancer)
//   /html/maintenance.html     — maintenance landing page (nem letezik meg, frontend
//                                ezt kapja vissza JSON-ben es kezeli kliensen)

const siteSettings = require('../../sql/modules/siteSettings.js');

// Path prefix-ek amelyek mindig elerhetoek maintenance modban.
const ALWAYS_ALLOWED_PREFIXES = [
    '/api/admin/',
    '/api/health',
    '/api/login',
    '/api/logout'
];

// Read-only tipusu utvonalak amelyek szinten elerhetoek (kizarolag az auth-check
// ezen az ablakon keresztul mehet at — a maintenance.html ezt poll-olja).
// FONTOS: a `/api/me` szandekosan NINCS itt. A non-admin user 503-at kap, igy
// a maintenance.html `retryConnection()` helyesen detektalja a karbantartast.
// Az admin user egyebkent is atmegy az isAdminRequest() vagdal session-rolen.
const ALWAYS_ALLOWED_PATHS = new Set([
    '/api/auth/check'
]);

function isPathAllowed(urlPath) {
    if (!urlPath) return false;
    if (ALWAYS_ALLOWED_PATHS.has(urlPath)) return true;
    return ALWAYS_ALLOWED_PREFIXES.some((prefix) => urlPath.startsWith(prefix));
}

function isAdminRequest(request) {
    // Admin Bearer token jelenlete (parseAdminToken majd fogja validalni az
    // ervenyesseget; itt csak signal hogy "admin probal eljarni").
    const authHeader = String(request.headers?.authorization || '').trim();
    if (/^Bearer\s+[A-Za-z0-9_-]{20,}$/.test(authHeader)) return true;
    // Session role admin
    if (request.session?.role === 'admin') return true;
    return false;
}

// Express middleware factory.
function maintenanceGuard() {
    // Eager warmup: az elso request elott betoltjuk a settings-t a cache-be,
    // hogy ne legyen race a cold-start alatt.
    siteSettings.getSettings().catch(() => {});

    return function maintenanceGuardMiddleware(request, response, next) {
        let proceed = true;
        try {
            const settings = siteSettings.getSettingsCachedSync();
            if (settings?.maintenanceMode) {
                const url = String(request.originalUrl || request.url || '').split('?')[0];
                if (!isPathAllowed(url) && !isAdminRequest(request)) {
                    proceed = false;
                }
            }
        } catch (error) {
            console.warn('maintenanceGuard hiba (atengedjuk a kerest):', error.message);
        }

        if (proceed) {
            // Hatterben friss cache-t hozunk, ha lejart a TTL — ne blokkoljuk a requestet.
            siteSettings.getSettings().catch(() => {});
            return next();
        }

        const settings = siteSettings.getSettingsCachedSync();
        // HTML request (browser navigation) -> redirect a teljes maintenance landing
        // page-re. Az api request-ek (XHR / fetch) JSON 503-at kapnak.
        const acceptsHtml = String(request.headers?.accept || '').includes('text/html');
        if (acceptsHtml) {
            response.redirect(302, '/html/maintenance.html');
            return;
        }

        response.status(503).json({
            success: false,
            maintenance: true,
            code: 'MAINTENANCE_MODE',
            message: 'Az oldal karbantartas alatt all. Kerlek probalkozz keson ujra.',
            supportEmail: settings?.supportEmail || null
        });
    };
}

// Root-level middleware: HTML lap-keresekre redirect-el a /html/maintenance.html-re,
// ha a site karbantartas alatt all es a kero NEM admin. Static asset-eket (css/js/img/font)
// es magat a maintenance/ban/deleted oldalt szandekosan atengedi, hogy a maintenance.html
// betoltese helyesen mukodjon.
const HTML_PAGE_BYPASS_PREFIXES = [
    '/javascript/', '/css/', '/profile_pictures/',
    '/socket.io/', '/favicon', '/img/', '/images/', '/fonts/'
];
const HTML_PAGE_BYPASS_PATHS = new Set([
    '/html/maintenance.html',
    '/html/ban.html',
    '/html/deleted.html',
    '/html/mailVerified.html'
]);
const HTML_PAGE_BYPASS_EXTENSIONS = new Set([
    '.css', '.js', '.map', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg',
    '.ico', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.pgn'
]);

function isStaticAsset(urlPath) {
    if (!urlPath) return false;
    for (const prefix of HTML_PAGE_BYPASS_PREFIXES) {
        if (urlPath.startsWith(prefix)) return true;
    }
    const lastDot = urlPath.lastIndexOf('.');
    if (lastDot > -1) {
        const ext = urlPath.slice(lastDot).toLowerCase();
        if (HTML_PAGE_BYPASS_EXTENSIONS.has(ext)) return true;
    }
    return false;
}

function maintenanceHtmlGuard() {
    siteSettings.getSettings().catch(() => {});

    return function maintenanceHtmlGuardMiddleware(request, response, next) {
        try {
            // Csak GET kereseknel ertelmes (POST formok stb. mar API-utvonalon mennek).
            if (request.method !== 'GET') return next();

            const settings = siteSettings.getSettingsCachedSync();
            if (!settings?.maintenanceMode) return next();

            const url = String(request.originalUrl || request.url || '').split('?')[0];

            // /api/* utvonalakat hagyjuk a /api/-en belul lévő maintenanceGuard-nak (JSON 503).
            if (url.startsWith('/api/')) return next();

            // Bypass: maintenance/ban/deleted/mailVerified oldal + static asset-ek.
            if (HTML_PAGE_BYPASS_PATHS.has(url)) return next();
            if (isStaticAsset(url)) return next();

            // Admin atengedese (Bearer token vagy session role).
            if (isAdminRequest(request)) return next();

            // HTML page request — redirect a maintenance landing-re.
            const acceptsHtml = String(request.headers?.accept || '').includes('text/html');
            if (acceptsHtml || url === '/' || url.endsWith('.html')) {
                return response.redirect(302, '/html/maintenance.html');
            }
            // Egyebkent (pl. egyeb ismeretlen mime-tipusu request) hagyjuk.
            return next();
        } catch (error) {
            console.warn('maintenanceHtmlGuard hiba:', error.message);
            return next();
        }
    };
}

module.exports = { maintenanceGuard, maintenanceHtmlGuard };
