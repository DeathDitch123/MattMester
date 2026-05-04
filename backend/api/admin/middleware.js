// Admin API middleware lanc. ADMIN_PANEL.md §1.c, §8.1.
//
// Sorrend:
//   1. parseAdminToken  - session+token ellenorzes, request.adminAuth feltoltes
//   2. requireSuperAdmin (opcionalis) - csak super-admin enged tovabb
//   3. adminAuditRateLimiter - F5 escalation-aware rate limit
//   4. requireReasonOnMutate - mutalo endpointoknal kotelezo indoklas
//   5. auditContext - request_id ULID generalas, res.locals init
//   6. handler
//   7. auditFlush - res.on('finish') a sikeres+sikertelen agat is naplozza

const tokenService = require('./tokenService.js');
const adminRepo = require('../../sql/adminRepo.js');
const alertingService = require('./alertingService.js');
const { generateUlid } = require('./ulid.js');
const {
    ADMIN_ERROR_CODES,
    REASON_MIN_LENGTH_NORMAL,
    REASON_MIN_LENGTH_CRITICAL,
    REASON_MAX_LENGTH,
    CRITICAL_ACTIONS,
    OPTIONAL_REASON_ACTIONS
} = require('./constants.js');

function getRequestIp(request) {
    const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const remote = request.socket ? request.socket.remoteAddress : null;
    return forwarded || remote || 'ismeretlen';
}

function getRequestUserAgent(request) {
    return String(request.headers['user-agent'] || 'ismeretlen').slice(0, 255);
}

function sendAdminError(response, statusCode, code, message) {
    response.status(statusCode).json({ success: false, code, message });
}

async function parseAdminToken(request, response, next) {
    let proceed = false;
    let errorPayload = null;

    try {
        const sessionUserId = Number(request.session?.userId) || 0;
        const sessionRole = request.session?.role || null;
        const ipAddress = getRequestIp(request);
        const userAgent = getRequestUserAgent(request);
        const endpoint = `${request.method} ${request.originalUrl || request.url}`;

        if (!sessionUserId) {
            errorPayload = {
                statusCode: 401,
                code: ADMIN_ERROR_CODES.NO_SESSION,
                message: 'Bejelentkezes szukseges az admin API-hoz.'
            };
            await alertingService.recordUnauthorized({
                ipAddress, userAgent, endpoint, reason: 'no_session', userId: null
            });
        } else if (sessionRole !== 'admin') {
            errorPayload = {
                statusCode: 403,
                code: ADMIN_ERROR_CODES.NOT_ADMIN,
                message: 'Nincs jogosultsagod ehhez a muvelethez.'
            };
            await alertingService.recordUnauthorized({
                ipAddress, userAgent, endpoint, reason: 'not_admin', userId: sessionUserId
            });
        } else {
            const headerValue = String(request.headers.authorization || '').trim();
            const match = headerValue.match(/^Bearer\s+([A-Za-z0-9_-]{20,})$/);
            if (!match) {
                errorPayload = {
                    statusCode: 401,
                    code: ADMIN_ERROR_CODES.TOKEN_MISSING,
                    message: 'Hianyzo vagy ervenytelen admin token. Lepj be ujra (elevate).'
                };
                await alertingService.recordUnauthorized({
                    ipAddress, userAgent, endpoint, reason: 'token_missing', userId: sessionUserId
                });
            } else {
                const verified = await tokenService.verifyAndTouchToken(match[1], sessionUserId);
                if (!verified) {
                    errorPayload = {
                        statusCode: 401,
                        code: ADMIN_ERROR_CODES.TOKEN_INVALID,
                        message: 'Az admin token lejart vagy nem ervenyes.'
                    };
                    await alertingService.recordTokenInvalid({
                        ipAddress, userAgent, endpoint, userId: sessionUserId
                    });
                } else {
                    // Folytonos jogosultsag-ellenorzes: DB-bol nezzuk az aktualis role-t es a ban
                    // statust. A session.role cache lehet, hogy mar nem aktualis (egy masik admin
                    // levehette idozben). Ha a DB szerint mar nem admin / be van tiltva,
                    // azonnal invalidaljuk az osszes admin tokenjet es kiraktjuk.
                    const dbUser = await adminRepo.getUserForAdminAuth(sessionUserId);
                    const dbRole = String(dbUser?.role || '').toLowerCase();
                    const isBanned = Boolean(dbUser?.is_banned);

                    if (!dbUser || dbRole !== 'admin' || isBanned) {
                        try {
                            await tokenService.revokeAllForUser(sessionUserId);
                        } catch (revokeErr) {
                            console.warn('parseAdminToken: tokenrevoke hiba:', revokeErr.message);
                        }
                        // Session role kierositese is, hogy a kovetkezo elevate-rol is elbukjon.
                        try {
                            if (request.session) {
                                request.session.role = dbRole || 'player';
                            }
                        } catch (_) {}

                        errorPayload = {
                            statusCode: 403,
                            code: ADMIN_ERROR_CODES.NOT_ADMIN,
                            message: isBanned
                                ? 'A fiokod tiltas alatt all — admin muveletek nem engedelyezettek.'
                                : 'Mar nincs admin jogosultsagod. Lepj be ujra.'
                        };
                        await alertingService.recordUnauthorized({
                            ipAddress, userAgent, endpoint,
                            reason: isBanned ? 'banned' : 'not_admin_in_db',
                            userId: sessionUserId
                        });
                    } else {
                        request.adminAuth = {
                            tokenId: verified.tokenId,
                            userId: sessionUserId,
                            username: dbUser?.username || request.session?.username || '',
                            isSuperAdmin: Boolean(dbUser.is_super_admin),
                            expiresAt: verified.expiresAt,
                            ipAddress,
                            userAgent
                        };
                        proceed = true;
                    }
                }
            }
        }
    } catch (error) {
        console.error('parseAdminToken hiba:', error.message);
        errorPayload = {
            statusCode: 500,
            code: ADMIN_ERROR_CODES.INTERNAL,
            message: 'Belso hiba az admin token ellenorzese soran.'
        };
    }

    if (proceed) {
        next();
    } else {
        sendAdminError(response, errorPayload.statusCode, errorPayload.code, errorPayload.message);
    }
}

function requireSuperAdmin(request, response, next) {
    let proceed = false;
    try {
        const adminAuth = request.adminAuth || null;
        if (adminAuth && adminAuth.isSuperAdmin === true) {
            proceed = true;
        }
    } catch (error) {
        console.error('requireSuperAdmin hiba:', error.message);
    }

    if (proceed) {
        next();
    } else {
        sendAdminError(
            response,
            403,
            ADMIN_ERROR_CODES.NOT_SUPER,
            'Ez a muvelet csak super-admin szamara engedelyezett.'
        );
    }
}

function requireReasonOnMutate(actionResolver) {
    return function reasonMiddleware(request, response, next) {
        const method = String(request.method || '').toUpperCase();
        const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
        let proceed = false;
        let errorPayload = null;

        try {
            if (!isMutating) {
                proceed = true;
            } else {
                const action = typeof actionResolver === 'function'
                    ? actionResolver(request)
                    : String(actionResolver || '');
                const isCritical = CRITICAL_ACTIONS.has(action);
                const isOptional = OPTIONAL_REASON_ACTIONS.has(action);
                const minLength = isCritical ? REASON_MIN_LENGTH_CRITICAL : REASON_MIN_LENGTH_NORMAL;
                const reason = String(request.body?.reason || '').trim();

                if (isOptional && !reason) {
                    // Opcionalis reason: nem kotelezo. Default placeholder a naplozashoz.
                    request.adminReason = `${action} — opcionalis reason mellozve`;
                    request.adminAction = action;
                    request.adminIsCritical = isCritical;
                    proceed = true;
                } else if (isOptional && reason.length > REASON_MAX_LENGTH) {
                    errorPayload = {
                        statusCode: 400,
                        code: ADMIN_ERROR_CODES.REASON_TOO_SHORT,
                        message: `Az indoklas legfeljebb ${REASON_MAX_LENGTH} karakter lehet.`
                    };
                } else if (isOptional) {
                    // Opcionalis reason megadva: nincs minimum karaktererkövetelmény (akar 1 char is OK).
                    request.adminReason = reason;
                    request.adminAction = action;
                    request.adminIsCritical = isCritical;
                    proceed = true;
                } else if (!reason) {
                    errorPayload = {
                        statusCode: 400,
                        code: ADMIN_ERROR_CODES.REASON_REQUIRED,
                        message: 'Az indoklas (reason) kotelezo minden admin muveletnel.'
                    };
                } else if (reason.length < minLength) {
                    errorPayload = {
                        statusCode: 400,
                        code: ADMIN_ERROR_CODES.REASON_TOO_SHORT,
                        message: `Az indoklas legalabb ${minLength} karakter kell legyen.`
                    };
                } else if (reason.length > REASON_MAX_LENGTH) {
                    errorPayload = {
                        statusCode: 400,
                        code: ADMIN_ERROR_CODES.REASON_TOO_LONG,
                        message: `Az indoklas legfeljebb ${REASON_MAX_LENGTH} karakter lehet.`
                    };
                } else {
                    request.adminReason = reason;
                    request.adminAction = action;
                    request.adminIsCritical = isCritical;
                    proceed = true;
                }
            }
        } catch (error) {
            console.error('requireReasonOnMutate hiba:', error.message);
            errorPayload = {
                statusCode: 500,
                code: ADMIN_ERROR_CODES.INTERNAL,
                message: 'Belso hiba az indoklas ellenorzese soran.'
            };
        }

        if (proceed) {
            next();
        } else {
            sendAdminError(response, errorPayload.statusCode, errorPayload.code, errorPayload.message);
        }
    };
}

function auditContext(request, response, next) {
    try {
        const requestId = generateUlid();
        request.adminRequestId = requestId;
        response.locals.adminAudit = {
            requestId,
            action: request.adminAction || null,
            isCritical: request.adminIsCritical || false,
            beforeState: null,
            afterState: null,
            targetType: null,
            targetId: null,
            targetKey: null,
            targetLabel: null,
            severity: null,
            errorCode: null,
            success: null,
            skip: false
        };
    } catch (error) {
        console.error('auditContext hiba:', error.message);
    }
    next();
}

module.exports = {
    parseAdminToken,
    requireSuperAdmin,
    requireReasonOnMutate,
    auditContext,
    getRequestIp,
    getRequestUserAgent,
    sendAdminError
};
