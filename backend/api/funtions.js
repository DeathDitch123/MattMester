function isAdmin(request, response, next) {
    if(request.session && request.session.role === 'admin') {
        return next();
    }
    return response.status(403).json({ message: 'Nincs jogosultságod ehhez a művelethez.' });
}

async function isAuthenticated(request, response, next) {
    if (!request.session || !request.session.userId) {
        return response.status(401).json({ success: false, message: 'Bejelentkezés szükséges a kereséshez.' });
    }
    // Ban + soft-delete check: ha a user kozben bannolva lett VAGY admin soft-delete-elte,
    // a sessiona elavult — destroy + 403. Mindketto block, csak a code/message mas.
    try {
        const sql = require('../sql/sql_funtions.js');
        const row = await sql.checkUserBanStatus(request.session.userId);
        const isSoftDeleted = row && row.pending_deletion_until && new Date(row.pending_deletion_until) > new Date();
        if (row && (row.is_banned || isSoftDeleted)) {
            await new Promise((resolve) => {
                request.session.destroy((err) => {
                    if (err) console.warn('isAuthenticated: eviction destroy hiba:', err.message);
                    resolve();
                });
            });
            response.clearCookie('connect.sid');
            if (isSoftDeleted) {
                return response.status(403).json({
                    success: false,
                    code: 'account_pending_deletion',
                    message: 'A fiókod admin által törlésre lett kijelölve.',
                    pendingDeletionUntil: row.pending_deletion_until
                });
            }
            return response.status(403).json({
                success: false,
                code: 'account_banned',
                message: 'A fiók tiltva lett.'
            });
        }
    } catch (error) {
        console.error('isAuthenticated ban-check hiba:', error.message);
        // Ha a DB kerdezes hibazik, ne blokkoljuk a kerest — fail-open egy index lookup hibajanal.
    }
    return next();
}

const EMAIL_VERIFICATION_REQUIRED_MESSAGE = 'Ez a funkció csak megerősített email cím után érhető el. Ellenőrizd az email fiókod vagy kérj új verifikációs emailt.';

async function requireVerifiedEmail(request, response, next) {
    let statusCode = 200;
    let body = null;
    let proceed = false;
    try {
        const sql = require('../sql/sql_funtions.js');
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