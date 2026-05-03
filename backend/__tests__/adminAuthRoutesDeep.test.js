/**
 * api/admin/authRoutes.js — admin auth endpoint tesztek (elevate / refresh / revoke / status).
 */

jest.mock('../sql/adminRepo.js', () => ({
    getUserForAdminAuth: jest.fn(),
    createAdminToken: jest.fn(() => Promise.resolve()),
    findActiveAdminToken: jest.fn(),
    touchAdminToken: jest.fn(() => Promise.resolve()),
    revokeAdminToken: jest.fn(() => Promise.resolve()),
    revokeAllAdminTokensForUser: jest.fn(() => Promise.resolve(0))
}));

jest.mock('../api/admin/alertingService.js', () => ({
    recordUnauthorized: jest.fn(),
    recordTokenInvalid: jest.fn()
}));

jest.mock('../api/middleware/rateLimiter.js', () => {
    const passthrough = (req, res, next) => next();
    return {
        createRateLimiter: () => passthrough,
        userOrIpKeyGenerator: () => 'placeholder'
    };
});

jest.mock('bcrypt', () => ({
    compare: jest.fn()
}));

const express = require('express');
const session = require('express-session');
const supertest = require('supertest');

const adminRepo = require('../sql/adminRepo.js');
const bcrypt = require('bcrypt');
const authRoutes = require('../api/admin/authRoutes.js');

function buildApp({ sessionUserId = null, sessionRole = 'player' } = {}) {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 't', resave: false, saveUninitialized: false }));
    app.use((req, res, next) => {
        if (sessionUserId !== null) {
            req.session.userId = sessionUserId;
            req.session.role = sessionRole;
        }
        next();
    });
    app.use(authRoutes);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('POST /elevate', () => {
    test('401 nincs session', async () => {
        const res = await supertest(buildApp()).post('/elevate').send({ password: 'x' });
        expect(res.status).toBe(401);
        expect(res.body.code).toMatch(/NO_SESSION/);
    });

    test('403 nem-admin role', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7, sessionRole: 'player' }))
            .post('/elevate').send({ password: 'x' });
        expect(res.status).toBe(403);
        expect(res.body.code).toMatch(/NOT_ADMIN/);
    });

    test('400 hianyzo password', async () => {
        const res = await supertest(buildApp({ sessionUserId: 1, sessionRole: 'admin' }))
            .post('/elevate').send({});
        expect(res.status).toBe(400);
        expect(res.body.code).toMatch(/PASSWORD_REQUIRED/);
    });

    test('401 hibas password', async () => {
        adminRepo.getUserForAdminAuth.mockResolvedValueOnce({
            id: 1, role: 'admin', password_hash: 'h'
        });
        bcrypt.compare.mockResolvedValueOnce(false);
        const res = await supertest(buildApp({ sessionUserId: 1, sessionRole: 'admin' }))
            .post('/elevate').send({ password: 'wrong' });
        expect(res.status).toBe(401);
        expect(res.body.code).toMatch(/PASSWORD_INVALID/);
    });

    test('401 user.role != admin DB-ben (timing-attack-mentes)', async () => {
        adminRepo.getUserForAdminAuth.mockResolvedValueOnce({
            id: 1, role: 'player', password_hash: 'h'
        });
        bcrypt.compare.mockResolvedValueOnce(true);
        const res = await supertest(buildApp({ sessionUserId: 1, sessionRole: 'admin' }))
            .post('/elevate').send({ password: 'right' });
        expect(res.status).toBe(401);
    });

    test('200 sikeres elevate → token kuldve', async () => {
        adminRepo.getUserForAdminAuth.mockResolvedValueOnce({
            id: 1, role: 'admin', password_hash: 'h', is_super_admin: false
        });
        bcrypt.compare.mockResolvedValueOnce(true);
        const res = await supertest(buildApp({ sessionUserId: 1, sessionRole: 'admin' }))
            .post('/elevate').send({ password: 'right' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.token).toBeDefined();
        expect(res.body.data.expiresAt).toBeDefined();
    });

    test('user nem letezik DB-ben → bcrypt-meg-hivva (timing-attack vedelem)', async () => {
        adminRepo.getUserForAdminAuth.mockResolvedValueOnce(null);
        bcrypt.compare.mockResolvedValueOnce(false);
        const res = await supertest(buildApp({ sessionUserId: 999, sessionRole: 'admin' }))
            .post('/elevate').send({ password: 'x' });
        expect(res.status).toBe(401);
        expect(bcrypt.compare).toHaveBeenCalled();
    });
});

describe('POST /refresh — parseAdminToken altal vedett', () => {
    test('401 nincs session', async () => {
        const res = await supertest(buildApp()).post('/refresh');
        expect(res.status).toBe(401);
    });
});

describe('POST /revoke', () => {
    test('401 nincs session', async () => {
        const res = await supertest(buildApp()).post('/revoke');
        expect(res.status).toBe(401);
    });
});

describe('GET /status', () => {
    test('401 nincs session', async () => {
        const res = await supertest(buildApp()).get('/status');
        expect(res.status).toBe(401);
    });
});
