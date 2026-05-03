// ============================================================
// AUTH MIDDLEWARE — egyetlen forrás-igazság
// ============================================================
// Három guard:
//   - pageGuard:  HTML lap-okhoz (redirect /-ra, ha nincs session)
//   - apiGuard:   JSON endpointokhoz (401 JSON, ha nincs session)
//   - adminGuard: admin endpointokhoz (403 JSON, ha nincs session.role==='admin')
//
// Mindkét apiGuard / pageGuard checkeli a ban / soft-delete state-et és
// destroy-olja a session-t, ha a fiók időközben tiltva lett.
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
 * apiGuard — JSON-os endpoint-okhoz. 401, ha nincs session; 403, ha banned/deleted.
 */
async function apiGuard(request, response, next) {
    if (!request.session || !request.session.userId) {
        response.status(401).json({ success: false, message: 'Bejelentkezés szükséges.' });
        return;
    }
    const status = await checkAccountActiveStatus(request, response);
    if (status.evicted) {
        if (status.reason === 'pending_deletion') {
            response.status(403).json({
                success: false,
                code: 'account_pending_deletion',
                message: 'A fiókod admin által törlésre lett kijelölve.',
                pendingDeletionUntil: status.pendingDeletionUntil
            });
        } else {
            response.status(403).json({
                success: false,
                code: 'account_banned',
                message: 'A fiók tiltva lett.'
            });
        }
        return;
    }
    next();
}

/**
 * pageGuard — HTML lap-okhoz. Ha nincs session → redirect /-ra. Ha banned/deleted →
 * a `/ban.html` vagy `/deleted.html` page-re redirect (a kliens-side natívan kezeli).
 */
async function pageGuard(request, response, next) {
    if (!request.session || !request.session.userId) {
        response.redirect('/');
        return;
    }
    const status = await checkAccountActiveStatus(request, response);
    if (status.evicted) {
        const target = status.reason === 'pending_deletion' ? '/deleted.html' : '/ban.html';
        response.redirect(target);
        return;
    }
    next();
}

/**
 * adminGuard — admin route-okhoz. apiGuard + role==='admin' check.
 * NEM helyettesíti a `parseAdminToken` step-up token middleware-t — az külön réteg
 * a kritikus mutáló műveleteken.
 */
async function adminGuard(request, response, next) {
    if (!request.session || !request.session.userId) {
        response.status(401).json({ success: false, message: 'Bejelentkezés szükséges.' });
        return;
    }
    if (request.session.role !== 'admin') {
        response.status(403).json({ success: false, message: 'Nincs jogosultságod ehhez a művelethez.' });
        return;
    }
    const status = await checkAccountActiveStatus(request, response);
    if (status.evicted) {
        response.status(403).json({ success: false, message: 'A fiók tiltva lett vagy törölve van.' });
        return;
    }
    next();
}

module.exports = {
    pageGuard,
    apiGuard,
    adminGuard,
    setSessionFromUser,
    checkAccountActiveStatus
};
