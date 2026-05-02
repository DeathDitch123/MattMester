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

// Read-only tipusu utvonalak amelyek szinten elerhetoek (statikus contentbol
// kell hogy mukodjon a maintenance landing). Mas /html/* viszont blockolva.
const ALWAYS_ALLOWED_PATHS = new Set([
    '/api/me',
    '/api/auth/me',
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
        const acceptsHtml = String(request.headers?.accept || '').includes('text/html');
        if (acceptsHtml) {
            response.status(503).send(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>Karbantartas</title></head><body style="font-family:system-ui,sans-serif;background:#0e1117;color:#e6e6e6;min-height:100vh;display:flex;align-items:center;justify-content:center;margin:0;"><div style="text-align:center;max-width:520px;padding:32px;"><h1 style="font-size:1.6rem;margin-bottom:12px;">Karbantartas folyamatban</h1><p style="opacity:.8;margin-bottom:8px;">A MattMester jelenleg karbantartas alatt all, kerlek probalkozz keson ujra.</p><p style="opacity:.6;font-size:.9rem;">Kerdes eseten: <a href="mailto:${settings?.supportEmail || 'mattmester.support@gmail.com'}" style="color:#f0c97a;">${settings?.supportEmail || 'mattmester.support@gmail.com'}</a></p></div></body></html>`);
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

module.exports = { maintenanceGuard };
