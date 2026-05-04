// CSRF védelem — Origin/Referer header alapú dupla védelem.
//
// A session-cookie már `sameSite: strict` (production) / `lax` (dev) — ez maga
// is alapszintű CSRF védelem. EZ A MIDDLEWARE egy második védelmi réteg:
// minden state-changing request-en (POST/PUT/DELETE/PATCH) megnézi az `Origin`
// (vagy fallback: `Referer`) header-t, és ha az nem matchel a saját app-origin-jébe,
// 403-at ad.
//
// Miért dupla védelem:
//   - SameSite cookie-t körbe lehet járni régi böngészőkkel (IE11 nem támogatja)
//   - XSS támadás megkerüli a SameSite-ot (ugyanazon origin-ből érkezik a request)
//   - Az Origin/Referer header-t a böngésző AUTOMATIKUSAN beállítja, és XHR/fetch
//     hívásnál a hívó kód NEM tudja override-olni — ezért a cross-origin támadó
//     nem tudja meghamisítani.
//
// Bypass: GET/HEAD/OPTIONS request-ek (read-only / preflight) átengedve.
// Bypass: ha sem Origin sem Referer nincs (nagyon régi kliens / curl) — log + átenged.

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// A backend ALLOWED_ORIGINS env-bol jon (server.js is innen olvas), itt is ugyanazt
// tukrozzuk hogy egyetlen forras-igazsag legyen.
function getAllowedOrigins() {
    const raw = String(process.env.ALLOWED_ORIGINS || 'http://localhost:3000');
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// localhost <-> 127.0.0.1 ekvivalencia (dev-ben gyakori).
function normalizeOrigin(value) {
    let normalized = String(value || '').trim();
    try {
        const parsed = new URL(normalized);
        const hostname = parsed.hostname === '127.0.0.1' ? 'localhost' : parsed.hostname;
        const port = parsed.port ? `:${parsed.port}` : '';
        normalized = `${parsed.protocol}//${hostname}${port}`;
    } catch (_) { /* if not a URL, return raw */ }
    return normalized;
}

function isOriginAllowed(originHeader) {
    let allowed = false;
    if (!originHeader) {
        return false;
    }
    const allowedList = getAllowedOrigins().map(normalizeOrigin);
    const normalized = normalizeOrigin(originHeader);
    if (allowedList.includes('*')) {
        allowed = true;
    } else if (allowedList.includes(normalized)) {
        allowed = true;
    }
    return allowed;
}

// Az Origin header az elsodleges signal (CORS alapveto). A Referer csak fallback,
// es csak az URL origin-jet (protocol+host+port) hasznaljuk belole — a path nem
// erdekes.
function csrfGuard(request, response, next) {
    let proceed = true;
    let blockReason = null;

    try {
        const method = String(request.method || 'GET').toUpperCase();
        if (!STATE_CHANGING_METHODS.has(method)) {
            // GET/HEAD/OPTIONS — read-only, atengedjuk.
            return next();
        }

        const origin = request.headers.origin || null;
        const referer = request.headers.referer || null;

        if (!origin && !referer) {
            // Sem Origin sem Referer — regi kliens vagy curl. Log + atengedjuk.
            // (A SameSite cookie meg vedheti az ilyet.)
            console.warn('[csrfGuard] sem Origin sem Referer header — request:', method, request.originalUrl || request.url);
            return next();
        }

        // Origin elsodleges. Ha van Origin, az dont. (Referer meg van, de csak akkor
        // hasznaljuk, ha az Origin hianyzik.)
        const headerToCheck = origin || referer;
        if (!isOriginAllowed(headerToCheck)) {
            proceed = false;
            blockReason = `origin "${headerToCheck}" nem szerepel az ALLOWED_ORIGINS-ben`;
        }
    } catch (error) {
        console.error('[csrfGuard] hiba:', error.message);
        // Fail-open: hiba eseten ne szakadjon meg az egesz alkalmazas. A SameSite
        // cookie meg vedhet a CSRF ellen.
        return next();
    }

    if (proceed) {
        next();
    } else {
        console.warn('[csrfGuard] blokkolva:', blockReason);
        response.status(403).json({
            success: false,
            code: 'CSRF_FORBIDDEN',
            message: 'Cross-site request elutasitva. Kerlek frissitsd az oldalt es probald ujra.'
        });
    }
}

module.exports = {
    csrfGuard,
    isOriginAllowed,
    normalizeOrigin
};
