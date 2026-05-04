// ============================================================
// AUTH MIDDLEWARE — egyetlen forrás-igazság
// ============================================================
// Négy guard, KÖZÖS belső _authenticate() pipeline:
//   - pageGuard:      HTML lap-okhoz (redirect /-ra, ha nincs session)
//   - apiGuard:       JSON endpointokhoz (401 JSON, ha nincs session)
//   - adminGuard:     admin JSON endpointokhoz (403 JSON, ha nincs role==='admin')
//   - pageAdminGuard: admin HTML lap-okhoz (redirect /, ha nincs admin)
//
// Mindegyik guard ugyanazt a session + ban + soft-delete ellenőrzést futtatja,
// csak a válasz-stratégia (redirect string vs JSON payload) különböző.
//
// setSessionFromUser(request, user) — single-source-of-truth a session-mezők
// beállítására (login + register + session-refresh ugyanezt hívja).
// ============================================================

const PROFILE_IMAGE_DEFAULT = '/profile_pictures/default.png';

// Lazy require — az `sql_functions.js` később lesz `sql_functions.js`,
// és a require-cycle elkerülése érdekében runtime-on hívjuk.
function getSql() {
    return require('../../sql/sql_functions.js');
}

/**
 * Beállítja az összes session-mezőt egyforma módon, mind login, mind register után.
 * `user`: a DB-ből visszakapott user-row (login) VAGY a register-flow által
 * összerakott objektum. A hiányzó mezőket sane default-okra esik vissza.
 */
function setSessionFromUser(request, user, options) {
    const opts = options || {};
    request.session.userId = user.id;
    request.session.username = user.username;
    request.session.role = user.role || 'player';
    request.session.elo = typeof user.elo === 'number' ? user.elo : 800;
    request.session.elo_MM = typeof user.elo_MM === 'number' ? user.elo_MM : 800;
    request.session.elo_bullet = typeof user.elo_bullet === 'number' ? user.elo_bullet : 800;
    request.session.profile_image = user.profile_image || PROFILE_IMAGE_DEFAULT;
    request.session.profile_image_status = user.profile_image_status || 'default';
    request.session.is_email_verified = !!user.is_email_verified;
    if (typeof opts.cookieMaxAge !== 'undefined') {
        request.session.cookie.maxAge = opts.cookieMaxAge;
    }
}

/**
 * Megnézi, hogy a userId-höz tartozó fiók időközben be van-e tiltva vagy soft-delete-elve.
 * Ha igen, destroy-olja a session-t és adatot ad vissza arról, hogy MIÉRT állt le.
 * Visszatérés: { evicted, reason, pendingDeletionUntil }
 *   - evicted: true ha a session megsemmisült
 *   - reason: 'banned' | 'pending_deletion' | null
 *   - pendingDeletionUntil: ha pending_deletion, akkor a dátum
 *
 * Fail-open: DB hiba esetén nem blokkoljuk a request-et — egy index-lookup hiba
 * miatt ne essen szét az alkalmazás.
 */
async function checkAccountActiveStatus(request, response) {
    let result = { evicted: false, reason: null, pendingDeletionUntil: null };
    try {
        const sql = getSql();
        const row = await sql.checkUserBanStatus(request.session.userId);
        const isSoftDeleted = row && row.pending_deletion_until && new Date(row.pending_deletion_until) > new Date();
        if (row && (row.is_banned || isSoftDeleted)) {
            await new Promise((resolve) => {
                request.session.destroy((err) => {
                    if (err) console.warn('checkAccountActiveStatus destroy hiba:', err.message);
                    resolve();
                });
            });
            response.clearCookie('connect.sid');
            result = {
                evicted: true,
                reason: isSoftDeleted ? 'pending_deletion' : 'banned',
                pendingDeletionUntil: isSoftDeleted ? row.pending_deletion_until : null
            };
        }
    } catch (error) {
        console.error('checkAccountActiveStatus hiba:', error.message);
    }
    return result;
}

/**
 * BELSŐ segédfüggvény — az összes guard közös pipeline-ja:
 *   1) Session-ellenőrzés (van-e userId)
 *   2) Opcionális role-ellenőrzés (requireRole)
 *   3) Account-aktív státusz (ban / soft-delete) ellenőrzés
 *
 * Visszatérés:
 *   { ok: true }                              — minden rendben, hívható next()
 *   { ok: false, reason: 'no_session' }       — nincs userId
 *   { ok: false, reason: 'forbidden_role' }   — nem felel meg a requireRole-nak
 *   { ok: false, reason: 'banned' }           — fiók tiltva
 *   { ok: false, reason: 'pending_deletion',
 *     pendingDeletionUntil: <Date> }          — fiók törlésre kijelölve
 *
 * A guard-ok ezt a struktúrát fordítják saját válasz-formátumra (redirect / JSON).
 */
async function _authenticate(request, response, options) {
    const opts = options || {};
    if (!request.session || !request.session.userId) {
        return { ok: false, reason: 'no_session' };
    }
    if (opts.requireRole && request.session.role !== opts.requireRole) {
        return { ok: false, reason: 'forbidden_role' };
    }
    const status = await checkAccountActiveStatus(request, response);
    if (status.evicted) {
        return {
            ok: false,
            reason: status.reason, // 'banned' | 'pending_deletion'
            pendingDeletionUntil: status.pendingDeletionUntil
        };
    }
    return { ok: true };
}

/**
 * apiGuard — JSON-os endpoint-okhoz. 401, ha nincs session; 403, ha banned/deleted.
 */
async function apiGuard(request, response, next) {
    const result = await _authenticate(request, response);
    if (result.ok) {
        return next();
    }
    if (result.reason === 'no_session') {
        response.status(401).json({ success: false, message: 'Bejelentkezés szükséges.' });
        return;
    }
    if (result.reason === 'pending_deletion') {
        response.status(403).json({
            success: false,
            code: 'account_pending_deletion',
            message: 'A fiókod admin által törlésre lett kijelölve.',
            pendingDeletionUntil: result.pendingDeletionUntil
        });
        return;
    }
    if (result.reason === 'banned') {
        response.status(403).json({
            success: false,
            code: 'account_banned',
            message: 'A fiók tiltva lett.'
        });
        return;
    }
    // Fallback (nem kéne idáig elérni)
    response.status(403).json({ success: false, message: 'Hozzáférés megtagadva.' });
}

/**
 * pageGuard — HTML lap-okhoz. Ha nincs session → redirect /-ra. Ha banned/deleted →
 * a `/ban.html` vagy `/deleted.html` page-re redirect (a kliens-side natívan kezeli).
 */
async function pageGuard(request, response, next) {
    const result = await _authenticate(request, response);
    if (result.ok) {
        return next();
    }
    if (result.reason === 'no_session') {
        response.redirect('/');
        return;
    }
    if (result.reason === 'pending_deletion') {
        response.redirect('/deleted.html');
        return;
    }
    if (result.reason === 'banned') {
        response.redirect('/ban.html');
        return;
    }
    // Fallback
    response.redirect('/');
}

/**
 * adminGuard — admin JSON route-okhoz. apiGuard + role==='admin' check.
 * NEM helyettesíti a `parseAdminToken` step-up token middleware-t — az külön réteg
 * a kritikus mutáló műveleteken.
 */
async function adminGuard(request, response, next) {
    const result = await _authenticate(request, response, { requireRole: 'admin' });
    if (result.ok) {
        return next();
    }
    if (result.reason === 'no_session') {
        response.status(401).json({ success: false, message: 'Bejelentkezés szükséges.' });
        return;
    }
    if (result.reason === 'forbidden_role') {
        response.status(403).json({ success: false, message: 'Nincs jogosultságod ehhez a művelethez.' });
        return;
    }
    // banned / pending_deletion → egységes 403
    response.status(403).json({ success: false, message: 'A fiók tiltva lett vagy törölve van.' });
}

/**
 * pageAdminGuard — admin HTML lap-okhoz (pl. /html/adminPanel.html).
 * Ugyanaz a logika, mint az adminGuard, de redirect-tel válaszol JSON helyett.
 *   - nincs session  → redirect '/'
 *   - nem admin      → redirect '/'
 *   - banned         → redirect '/ban.html'
 *   - pending_delete → redirect '/deleted.html'
 */
async function pageAdminGuard(request, response, next) {
    const result = await _authenticate(request, response, { requireRole: 'admin' });
    if (result.ok) {
        return next();
    }
    if (result.reason === 'pending_deletion') {
        response.redirect('/deleted.html');
        return;
    }
    if (result.reason === 'banned') {
        response.redirect('/ban.html');
        return;
    }
    // no_session vagy forbidden_role → vissza a főoldalra
    response.redirect('/');
}

module.exports = {
    pageGuard,
    apiGuard,
    adminGuard,
    pageAdminGuard,
    setSessionFromUser,
    checkAccountActiveStatus
};
