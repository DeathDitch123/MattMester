const express = require('express');
const session = require('express-session');
const request = require('supertest');

jest.mock('../sql/adminRepo.js', () => ({
    getUserForAdminAuth: jest.fn(),
    findActiveAdminToken: jest.fn(),
    touchAdminToken: jest.fn(),
    createAdminToken: jest.fn(),
    revokeAdminToken: jest.fn(),
    revokeAllAdminTokensForUser: jest.fn()
}));

jest.mock('../api/admin/alertingService.js', () => ({
    recordUnauthorized: jest.fn(() => Promise.resolve({ alertId: 1 })),
    recordTokenInvalid: jest.fn(() => Promise.resolve({ alertId: 2 })),
    recordSuspiciousPattern: jest.fn(() => Promise.resolve({ alertId: 3 })),
    bindSocketHub: jest.fn()
}));

const adminRepo = require('../sql/adminRepo.js');
const tokenService = require('../api/admin/tokenService.js');
const authRoutes = require('../api/admin/authRoutes.js');

function buildApp(sessionUser) {
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }
    }));

    app.use((request, response, next) => {
        if (sessionUser) {
            Object.assign(request.session, sessionUser);
        }
        next();
    });

    app.use('/api/admin/auth', authRoutes);
    return app;
}

describe('admin auth refresh edge cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('NO_SESSION -> 401 és no_session code', async () => {
        const app = buildApp(null);
        const response = await request(app)
            .post('/api/admin/auth/refresh')
            .set('Authorization', 'Bearer dummy-token-1234567890');

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('ADMIN_NO_SESSION');
    });

    test('TOKEN_INVALID -> 401 és token_invalid code', async () => {
        adminRepo.findActiveAdminToken.mockResolvedValueOnce(null);
        const app = buildApp({ userId: 12, role: 'admin', username: 'admin' });

        const response = await request(app)
            .post('/api/admin/auth/refresh')
            .set('Authorization', 'Bearer invalid-token-1234567890');

        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
        expect(response.body.code).toBe('ADMIN_TOKEN_INVALID');
        expect(adminRepo.getUserForAdminAuth).not.toHaveBeenCalled();
    });

    test('sikeres refresh -> 200 és friss expiresAt', async () => {
        const expiresAt = new Date('2026-04-29T10:15:00.000Z');
        adminRepo.findActiveAdminToken.mockResolvedValueOnce({
            id: 99,
            user_id: 12
        });
        adminRepo.touchAdminToken.mockResolvedValueOnce({ affectedRows: 1 });
        adminRepo.getUserForAdminAuth.mockResolvedValueOnce({
            id: 12,
            username: 'admin',
            role: 'admin',
            is_super_admin: 1,
            is_banned: 0
        });

        const app = buildApp({ userId: 12, role: 'admin', username: 'admin' });

        const response = await request(app)
            .post('/api/admin/auth/refresh')
            .set('Authorization', 'Bearer valid-token-1234567890');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.code).toBe('ADMIN_TOKEN_REFRESHED');
        expect(typeof response.body.data.expiresAt).toBe('string');
        expect(adminRepo.getUserForAdminAuth).toHaveBeenCalledWith(12);
        expect(adminRepo.touchAdminToken).toHaveBeenCalledWith(99, expect.any(Number));
    });
});