// Admin step-up auth endpointok. ADMIN_PANEL.md §2.3.

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const adminRepo = require('../../sql/adminRepo.js');
const tokenService = require('./tokenService.js');
const alertingService = require('./alertingService.js');
const { parseAdminToken, getRequestIp, getRequestUserAgent } = require('./middleware.js');
const { createRateLimiter, userOrIpKeyGenerator } = require('../middleware/rateLimiter.js');
const {
    ADMIN_ELEVATE_LIMIT_WINDOW_MS,
    ADMIN_ELEVATE_LIMIT_MAX,
    ADMIN_ERROR_CODES
} = require('./constants.js');

// Brute-force vedelem az elevate-en. skipSuccessfulRequests: a jogos admint nem zarjuk ki.
const adminElevateLimiter = createRateLimiter({
    windowMs: ADMIN_ELEVATE_LIMIT_WINDOW_MS,
    max: ADMIN_ELEVATE_LIMIT_MAX,
    skipSuccessfulRequests: true,
    keyGenerator: userOrIpKeyGenerator,
    message: 'Tul sok admin elevate kiserlet. Probald ujra 15 perc mulva.',
    code: 'ADMIN_ELEVATE_RATE_LIMIT'
});

// POST /api/admin/auth/elevate
// Body: { password }
// Voltaire-stilusu allando-idore kozelitett bcrypt: ha nincs is admin, akkor is bcrypt-elunk.
router.post('/elevate', adminElevateLimiter, express.json(), async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: 'Belso hiba az elevate soran.', code: ADMIN_ERROR_CODES.INTERNAL };

    try {
        const sessionUserId = Number(request.session?.userId) || 0;
        const sessionRole = request.session?.role || null;
        const ipAddress = getRequestIp(request);
        const userAgent = getRequestUserAgent(request);
        const password = String(request.body?.password || '');

        if (!sessionUserId) {
            statusCode = 401;
            payload = {
                success: false,
                code: ADMIN_ERROR_CODES.NO_SESSION,
                message: 'Bejelentkezes szukseges az elevate elott.'
            };
        } else if (sessionRole !== 'admin') {
            statusCode = 403;
            payload = {
                success: false,
                code: ADMIN_ERROR_CODES.NOT_ADMIN,
                message: 'Csak admin szerepkorrel hasznalhato.'
            };
            await alertingService.recordUnauthorized({
                ipAddress, userAgent,
                endpoint: 'POST /api/admin/auth/elevate',
                reason: 'not_admin',
                userId: sessionUserId
            });
        } else if (!password) {
            statusCode = 400;
            payload = {
                success: false,
                code: ADMIN_ERROR_CODES.PASSWORD_REQUIRED,
                message: 'A jelszo megadasa kotelezo.'
            };
        } else {
            const dbUser = await adminRepo.getUserForAdminAuth(sessionUserId);
            const dummyHash = '$2b$10$haOYyFwigR.niAHSKk.F2.yYfWF27v0RyJYofUDWN981AFdNDollq';
            const compareHash = dbUser?.password_hash || dummyHash;
            const passwordOk = await bcrypt.compare(password, compareHash);

            if (!dbUser || dbUser.role !== 'admin' || !passwordOk) {
                statusCode = 401;
                payload = {
                    success: false,
                    code: ADMIN_ERROR_CODES.PASSWORD_INVALID,
                    message: 'Hibas jelszo.'
                };
                await alertingService.recordUnauthorized({
                    ipAddress, userAgent,
                    endpoint: 'POST /api/admin/auth/elevate',
                    reason: 'invalid_password',
                    userId: sessionUserId
                });
            } else {
                // Korabbi tokenek invalidalasa: egy admin egyszerre csak 1 ervenyes token-nel rendelkezik.
                await tokenService.revokeAllForUser(sessionUserId);
                const issued = await tokenService.issueAdminToken(sessionUserId, ipAddress, userAgent);
                payload = {
                    success: true,
                    code: 'ADMIN_ELEVATED',
                    message: 'Admin szint aktivalva.',
                    data: {
                        token: issued.plainToken,
                        expiresAt: issued.expiresAt.toISOString(),
                        isSuperAdmin: Boolean(dbUser.is_super_admin)
                    }
                };
            }
        }
    } catch (error) {
        console.error('admin/auth/elevate hiba:', error.message);
        statusCode = 500;
        payload = {
            success: false,
            code: ADMIN_ERROR_CODES.INTERNAL,
            message: 'Belso hiba az elevate soran.'
        };
    }

    return response.status(statusCode).json(payload);
});

// POST /api/admin/auth/refresh
// Header: Authorization: Bearer <token>
// A parseAdminToken middleware mar elvegezte az ellenorzest + sliding TTL frissitest.
router.post('/refresh', parseAdminToken, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: 'Belso hiba a refresh soran.', code: ADMIN_ERROR_CODES.INTERNAL };

    try {
        const expiresAt = request.adminAuth?.expiresAt;
        payload = {
            success: true,
            code: 'ADMIN_TOKEN_REFRESHED',
            message: 'Admin token meghosszabbitva.',
            data: { expiresAt: expiresAt ? expiresAt.toISOString() : null }
        };
    } catch (error) {
        console.error('admin/auth/refresh hiba:', error.message);
        statusCode = 500;
    }

    return response.status(statusCode).json(payload);
});

// POST /api/admin/auth/revoke
// Bevont token; a parseAdminToken miatt ervenyes session+token kell, hogy mas ne hivhassa.
router.post('/revoke', parseAdminToken, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: 'Belso hiba a revoke soran.', code: ADMIN_ERROR_CODES.INTERNAL };

    try {
        const tokenId = Number(request.adminAuth?.tokenId) || 0;
        if (tokenId) {
            await tokenService.revokeTokenById(tokenId);
        }
        payload = {
            success: true,
            code: 'ADMIN_TOKEN_REVOKED',
            message: 'Admin token visszavonva.'
        };
    } catch (error) {
        console.error('admin/auth/revoke hiba:', error.message);
        statusCode = 500;
        payload = {
            success: false,
            code: ADMIN_ERROR_CODES.INTERNAL,
            message: 'Belso hiba a revoke soran.'
        };
    }

    return response.status(statusCode).json(payload);
});

// GET /api/admin/auth/status
// Bool ellenorzes - ervenyes-e a session+token paros.
router.get('/status', parseAdminToken, async (request, response) => {
    let statusCode = 200;
    let payload = {
        success: true,
        data: {
            authenticated: true,
            userId: request.adminAuth?.userId || null,
            username: request.adminAuth?.username || null,
            isSuperAdmin: Boolean(request.adminAuth?.isSuperAdmin),
            expiresAt: request.adminAuth?.expiresAt ? request.adminAuth.expiresAt.toISOString() : null
        }
    };

    return response.status(statusCode).json(payload);
});

module.exports = router;
