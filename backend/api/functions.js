// ============================================================
// LEGACY auth helpers — DEPRECATED
// ============================================================
// Az új single-source-of-truth a `backend/api/middleware/auth.js`:
//   - pageGuard, apiGuard, adminGuard, setSessionFromUser
// Az `isAuthenticated` itt visszafelé-kompatibilis re-export — 8 meglévő
// route még a regi nevet importalja, a kovetkezo sprintben atallnak az
// apiGuard-ra es ez a fajl is megszunhet.
// N14 (#73): az `isAdmin` re-export torolve — sehol nem volt mar hivatkozva.
// ============================================================

const { apiGuard } = require('./middleware/auth.js');

const EMAIL_VERIFICATION_REQUIRED_MESSAGE = 'Ez a funkció csak megerősített email cím után érhető el. Ellenőrizd az email fiókod vagy kérj új verifikációs emailt.';

// DEPRECATED — használd az `apiGuard`-ot a `middleware/auth.js`-ből.
const isAuthenticated = apiGuard;

async function requireVerifiedEmail(request, response, next) {
    let statusCode = 200;
    let body = null;
    let proceed = false;
    try {
        const userId = Number(request.session?.userId) || 0;
        if (!userId) {
            statusCode = 401;
            body = { success: false, code: 'NOT_AUTHENTICATED', message: 'Bejelentkezés szükséges.' };
        } else {
            // N14 (#52): session-cache az is_email_verified mezo, mert a setSessionFromUser
            // login + register eseten beallitja. Csak akkor terhelje a DB-t, ha a session
            // mezo hianyzik (regi session migracio elott).
            let isVerified = null;
            if (request.session && typeof request.session.is_email_verified !== 'undefined') {
                isVerified = !!request.session.is_email_verified;
            }
            if (isVerified === null) {
                const sql = require('../sql/sql_functions.js');
                const statusRow = await sql.getUserVerificationStatusById(userId);
                if (!statusRow) {
                    statusCode = 404;
                    body = { success: false, code: 'USER_NOT_FOUND', message: 'A felhasználó nem található.' };
                } else {
                    isVerified = !!statusRow.is_email_verified;
                    // Megnezzuk hogy menjen tovabb a kovetkezo kondicionalison.
                }
            }
            if (statusCode === 200 && isVerified === false) {
                statusCode = 403;
                body = {
                    success: false,
                    code: 'EMAIL_NOT_VERIFIED',
                    message: EMAIL_VERIFICATION_REQUIRED_MESSAGE
                };
                await logVerificationBlock(request, userId);
            } else if (statusCode === 200 && isVerified === true) {
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
    isAuthenticated,
    requireVerifiedEmail,
    EMAIL_VERIFICATION_REQUIRED_MESSAGE
};
