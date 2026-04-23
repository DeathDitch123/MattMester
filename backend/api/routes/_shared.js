const sql = require('../../sql/sql_funtions.js');

function getRequestIpAddress(request) {
    const forwarded = request.headers['x-forwarded-for'];
    const remote = request.socket ? request.socket.remoteAddress : null;
    return forwarded || remote || 'ismeretlen';
}

async function logAuthenticatedAction(request, userId, logFields) {
    try {
        const ipAddress = getRequestIpAddress(request);
        const userAgent = request.headers['user-agent'] || 'Ismeretlen';
        const baseMetadata = logFields.metadata && typeof logFields.metadata === 'object' ? logFields.metadata : {};
        await sql.insertUserLog(userId, {
            ...logFields,
            ipAddress,
            userAgent,
            metadata: { ...baseMetadata, ipAddress, userAgent }
        });
    } catch (logError) {
        console.warn(`User log hiba (${logFields.eventType || 'ismeretlen'}):`, logError.message);
    }
}

function saveSessionAsync(request, errorMessage) {
    return new Promise((resolve, reject) => {
        request.session.save((err) => {
            if (err) {
                console.error('Session mentési hiba:', err);
                reject(new Error(errorMessage));
            } else {
                resolve();
            }
        });
    });
}

function destroySessionAsync(request, errorMessage) {
    return new Promise((resolve, reject) => {
        request.session.destroy((err) => {
            if (err) {
                console.error('Session destroy hiba:', err);
                reject(new Error(errorMessage));
            } else {
                resolve();
            }
        });
    });
}

function parsePositiveInteger(value, fallback = null) {
    const parsed = Number(value);
    let result = fallback;
    if (Number.isInteger(parsed) && parsed > 0) {
        result = parsed;
    }
    return result;
}

function getAuthenticatedUserIdOrThrow(request) {
    const currentUserId = Number(request.session?.userId) || 0;
    if (!currentUserId) {
        throw new Error('Nincs bejelentkezett felhasználó.');
    }
    return currentUserId;
}

module.exports = {
    getRequestIpAddress,
    logAuthenticatedAction,
    saveSessionAsync,
    destroySessionAsync,
    parsePositiveInteger,
    getAuthenticatedUserIdOrThrow
};
