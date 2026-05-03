// ============================================================
// LEGACY auth helpers — DEPRECATED
// ============================================================
// Az új single-source-of-truth a `backend/api/middleware/auth.js`:
//   - pageGuard, apiGuard, adminGuard, setSessionFromUser
// A `isAuthenticated` és `isAdmin` itt visszafelé-kompatibilis re-export
// — a meglévő route-ok futnak tovább, az új route-ok már a middleware/auth.js-t
// importálják közvetlenül. Ezt egy következő sprintben (külön ütemben) cserélhetjük.
// ============================================================

const { apiGuard, adminGuard } = require('./middleware/auth.js');

const EMAIL_VERIFICATION_REQUIRED_MESSAGE = 'Ez a funkció csak megerősített email cím után érhető el. Ellenőrizd az email fiókod vagy kérj új verifikációs emailt.';

// DEPRECATED — használd az `apiGuard`-ot a `middleware/auth.js`-ből.
// Ugyanaz a viselkedés (401 + ban/soft-delete check), a régi név csak
// re-export, hogy a meglévő route-ok ne törjenek.
const isAuthenticated = apiGuard;

// DEPRECATED — használd az `adminGuard`-ot a `middleware/auth.js`-ből.
const isAdmin = adminGuard;

async function requireVerifiedEmail(request, response, next) {
    let statusCode = 200;
    let body = null;
    let proceed = false;
    try {
        const sql = require('../sql/sql_functions.js');
        const userId = Number(request.session?.userId) || 0;
        if (!userId) {
            statusCode = 401;
            body = { success: false, code: 'NOT_AUTHENTICATED', message: 'Bejelentkezés szükséges.' };
        } else {
            const statusRow = await sql.getUserVerificationStatusById(userId);
            if (!statusRow) {
                statusCode = 404;
                body = { success: false, code: 'USER_NOT_FOUND', message: 'A felhasználó nem található.' };
            } else if (!statusRow.is_email_verified) {
                statusCode = 403;
                body = {
                    success: false,
                    code: 'EMAIL_NOT_VERIFIED',
                    message: EMAIL_VERIFICATION_REQUIRED_MESSAGE
                };
                await logVerificationBlock(request, userId);
            } else {
                proceed = true;
            }
        }
    } catch (error) {
        console.error('requireVerifiedEmail hiba:', error.message);
        statusCode = 500;
        body = { success: false, code: 'VERIFICATION_CHECK_FAILED', message: 'Szerverhiba a verifikációs állapot ellenőrzése során.' };
    }

    if (proceed) {
        next();
    } else {
        response.status(statusCode).json(body);
    }
}

async function logVerificationBlock(request, userId) {
    try {
        const { logAuthenticatedAction } = require('./routes/_shared.js');
        const endpoint = request.originalUrl || request.url || 'unknown';
        const method = request.method || 'GET';
        await logAuthenticatedAction(request, userId, {
            eventType: 'email_verification_required_block',
            eventCategory: 'security',
            severity: 'warning',
            source: 'backend',
            success: false,
            message: 'Email verifikáció hiányzik — funkció blokkolva.',
            metadata: { endpoint, method }
        });
    } catch (error) {
        console.warn('logVerificationBlock hiba:', error.message);
    }
}

module.exports = {
    isAdmin,
    isAuthenticated,
    requireVerifiedEmail,
    EMAIL_VERIFICATION_REQUIRED_MESSAGE
};
