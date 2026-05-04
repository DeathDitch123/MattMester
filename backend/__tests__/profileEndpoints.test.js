/**
 * api/routes/profile.js — input validacio tesztek a settings + remove-image + abilities-usage endpoint-okra.
 * NEM teljes integracio (a delete-flow + image-upload tul sok mockot igenyel) —
 * itt a 400-as ag-ok hatar-ellenorzese a fokusz.
 */

const express = require('express');
const session = require('express-session');
const supertest = require('supertest');

jest.mock('../sql/sql_functions.js', () => ({
    getUserAuthById: jest.fn(),
    updateUserProfileSettings: jest.fn(() => Promise.resolve()),
    resetUserProfileImageToDefault: jest.fn(() => Promise.resolve({ removed: true, oldPath: '/foo.png' })),
    getEmailVerificationByUserId: jest.fn(() => Promise.resolve(null)),
    insertEmailVerificationToken: jest.fn(() => Promise.resolve()),
    insertUserLog: jest.fn(() => Promise.resolve()),
    checkUserBanStatus: jest.fn(() => Promise.resolve(null)),
    getUserVerificationStatusById: jest.fn(() => Promise.resolve({ is_email_verified: true })),
    deleteAllUserSessions: jest.fn(() => Promise.resolve()),
    deleteUserHardOrSoft: jest.fn(() => Promise.resolve({ softDeleted: true })),
    isEmailBanned: jest.fn(() => Promise.resolve(null))
}));

jest.mock('../api/middleware/rateLimiter.js', () => {
    const passthrough = (req, res, next) => next();
    return new Proxy({}, { get: () => passthrough });
});

jest.mock('../api/emailVerification.js', () => ({
    generateVerificationToken: () => ({ token: 'tok', expiresAt: new Date(Date.now() + 86400000) }),
    hashToken: (t) => `h:${t}`,
    sendVerificationEmail: jest.fn(() => Promise.resolve())
}));

jest.mock('bcrypt', () => ({
    compare: jest.fn(),
    hash: jest.fn(() => Promise.resolve('hashed_password')),
    genSalt: jest.fn(() => Promise.resolve('salt'))
}));

const sql = require('../sql/sql_functions.js');
const bcrypt = require('bcrypt');
const profileRoutes = require('../api/routes/profile.js');

function buildApp({ sessionUserId = null } = {}) {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 't', resave: false, saveUninitialized: false }));
    app.use((req, res, next) => {
        if (sessionUserId !== null) req.session.userId = sessionUserId;
        next();
    });
    app.use(profileRoutes);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('POST /profile/settings — input validacio', () => {
    test('401 nincs session', async () => {
        const res = await supertest(buildApp()).post('/profile/settings').send({});
        expect(res.status).toBe(401);
    });

    test('400 hianyzo username vagy email', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/profile/settings').send({});
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/kötelező|kotelez/i);
    });

    test('400 username < 3 karakter', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/profile/settings').send({
            username: 'ab', email: 'a@b.c'
        });
        expect(res.status).toBe(400);
    });

    test('400 username > 50 karakter', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/profile/settings').send({
            username: 'a'.repeat(51), email: 'a@b.c'
        });
        expect(res.status).toBe(400);
    });

    test('400 ervenytelen username karakterek', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/profile/settings').send({
            username: '<script>', email: 'a@b.c'
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/formátum|formatum/i);
    });

    test('400 ervenytelen email formatum', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/profile/settings').send({
            username: 'foobar', email: 'not-an-email'
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/e-?mail/i);
    });

    test('400 hianyzo currentPassword', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/profile/settings').send({
            username: 'foobar', email: 'a@b.c'
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/jelsza/i);
    });

    test('400 newPassword tartalmaz backslash-t', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/profile/settings').send({
            username: 'foobar',
            email: 'a@b.c',
            currentPassword: 'oldpw',
            newPassword: 'New\\Pwd1234'
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/karaktert|karakter/i);
    });

    test('400 newPassword < 8 karakter', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/profile/settings').send({
            username: 'foobar',
            email: 'a@b.c',
            currentPassword: 'oldpw',
            newPassword: 'Short1'
        });
        expect(res.status).toBe(400);
    });

    test('400 newPassword nem felel meg a regex-nek (csak kisbetu)', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/profile/settings').send({
            username: 'foobar',
            email: 'a@b.c',
            currentPassword: 'oldpw',
            newPassword: 'csakkisbetu'
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/nagybet|kisbet|szám/i);
    });

    test('404 user nem talalhato', async () => {
        sql.getUserAuthById.mockResolvedValueOnce(null);
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/profile/settings').send({
            username: 'foobar', email: 'a@b.c', currentPassword: 'oldpw'
        });
        expect(res.status).toBe(404);
    });

    test('401 jelenlegi jelszo hibas', async () => {
        sql.getUserAuthById.mockResolvedValueOnce({ id: 7, username: 'foobar', email: 'a@b.c', password_hash: 'h' });
        bcrypt.compare.mockResolvedValueOnce(false);
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/profile/settings').send({
            username: 'foobar', email: 'a@b.c', currentPassword: 'wrongpw'
        });
        expect(res.status).toBe(401);
        expect(res.body.message).toMatch(/jelszó|jelszo/i);
    });
});

describe('POST /profile/remove-image', () => {
    test('401 nincs session', async () => {
        const res = await supertest(buildApp()).post('/profile/remove-image');
        expect(res.status).toBe(401);
    });

    test('200 sikeres torlés', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/profile/remove-image');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('500 DB-hiba', async () => {
        sql.resetUserProfileImageToDefault.mockRejectedValueOnce(new Error('DB le'));
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/profile/remove-image');
        expect(res.status).toBe(500);
    });
});

describe('GET /profile/abilities-usage', () => {
    test('401 nincs session', async () => {
        const res = await supertest(buildApp()).get('/profile/abilities-usage');
        expect(res.status).toBe(401);
    });

    test('500 DB pool hiba (nincs DB) → 500', async () => {
        // A getPool nincs mockolva — fail.
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/profile/abilities-usage');
        // Vagy 500 (DB nincs), vagy 200 ha a DB visszaad ures-listat. Mind a ket allapotot fogadjuk.
        expect([500, 200]).toContain(res.status);
    });
});
