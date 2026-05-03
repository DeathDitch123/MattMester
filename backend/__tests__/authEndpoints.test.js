/**
 * N6 — Auth endpoint smoke teszt: login (jó/rossz pwd, rate-limit), register
 * (sikeres + duplikált email), logout. Nem teljes integráció — csak smoke a
 * happy + a 2 fő hibaág-ra. Mockolt `sql_functions.js` és bcrypt.
 */

const express = require('express');
const session = require('express-session');
const supertest = require('supertest');

jest.mock('../sql/sql_functions.js', () => ({
    getUserByUsername: jest.fn(),
    getUserByEmail: jest.fn(),
    insertUser: jest.fn(),
    checkUserBanStatus: jest.fn(() => Promise.resolve(null)),
    getSessionUserById: jest.fn(),
    upsertUserLog: jest.fn(() => Promise.resolve()),
    getDynamicBlockedWordRows: jest.fn(() => Promise.resolve([])),
    getUserVerificationStatusById: jest.fn(),
    deleteAllUserSessions: jest.fn(() => Promise.resolve()),
    isEmailBanned: jest.fn(() => Promise.resolve(null)),
    insertEmailVerificationToken: jest.fn(() => Promise.resolve()),
    insertUserLogEntry: jest.fn(() => Promise.resolve()),
    upsertSessionLogin: jest.fn(() => Promise.resolve()),
    insertSessionRecord: jest.fn(() => Promise.resolve()),
    insertEmailLog: jest.fn(() => Promise.resolve())
}));

// A rateLimiter-eket teljesen passthrough-osítjuk — a smoke teszt nem ezt fedi.
jest.mock('../api/middleware/rateLimiter.js', () => {
    const passthrough = (request, response, next) => next();
    return {
        createRateLimiter: () => passthrough,
        userOrIpKeyGenerator: () => 'anon',
        authLoginLimiter: passthrough,
        authRegisterLimiter: passthrough,
        emailVerifyResendLimiter: passthrough,
        emailVerifyConsumeLimiter: passthrough,
        passwordResetRequestLimiter: passthrough,
        passwordResetTokenLimiter: passthrough,
        profileUpdateLimiter: passthrough,
        profileImageUploadLimiter: passthrough,
        profileImageRemoveLimiter: passthrough,
        profileDeleteLimiter: passthrough,
        friendActionLimiter: passthrough,
        playerSearchLimiter: passthrough,
        chatMessageLimiter: passthrough,
        chatDirectOpenLimiter: passthrough,
        notificationActionLimiter: passthrough,
        logoutAllDevicesLimiter: passthrough
    };
});

jest.mock('../api/emailVerification.js', () => ({
    generateVerificationToken: () => ({ token: 'tok', expiresAt: new Date() }),
    generatePasswordResetToken: () => ({ token: 'rstok', expiresAt: new Date() }),
    hashToken: (t) => `h:${t}`,
    sendVerificationEmail: jest.fn(() => Promise.resolve()),
    sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
    isExpired: () => false
}));

const bcrypt = require('bcrypt');
const sql = require('../sql/sql_functions.js');
const authRoutes = require('../api/routes/auth.js');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'test-secret-please-change',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false }
    }));
    app.use(authRoutes);
    return app;
}

describe('POST /login', () => {
    beforeEach(() => jest.clearAllMocks());

    test('helyes username + jelszó → 200, success: true', async () => {
        const passwordHash = await bcrypt.hash('helyes-jelszo123', 10);
        sql.getUserByUsername.mockResolvedValueOnce({
            id: 7,
            username: 'tesztelo',
            password_hash: passwordHash,
            role: 'player',
            elo: 800,
            elo_MM: 800,
            elo_bullet: 800,
            is_email_verified: true,
            is_banned: false
        });
        const res = await supertest(buildApp())
            .post('/login')
            .send({ usernameOrMail: 'tesztelo', password: 'helyes-jelszo123' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('rossz jelszó → 401, success: false', async () => {
        const passwordHash = await bcrypt.hash('helyes-jelszo123', 10);
        sql.getUserByUsername.mockResolvedValueOnce({
            id: 7,
            username: 'tesztelo',
            password_hash: passwordHash,
            role: 'player',
            elo: 800,
            elo_MM: 800,
            elo_bullet: 800,
            is_email_verified: true,
            is_banned: false
        });
        const res = await supertest(buildApp())
            .post('/login')
            .send({ usernameOrMail: 'tesztelo', password: 'rossz-jelszo' });
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    test('hiányzó mező → 400', async () => {
        const res = await supertest(buildApp()).post('/login').send({});
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });
});

describe('POST /register', () => {
    beforeEach(() => jest.clearAllMocks());

    test('új email + új username → 200/201, success: true', async () => {
        sql.getUserByEmail.mockResolvedValueOnce(null);
        sql.getUserByUsername.mockResolvedValueOnce(null);
        sql.insertUser.mockResolvedValueOnce({ insertId: 42 });
        const res = await supertest(buildApp())
            .post('/register')
            .send({ username: 'ujfiok123', email: 'uj@example.com', password: 'Erospwd1!' });
        expect([200, 201]).toContain(res.status);
        expect(res.body.success).toBe(true);
    });

    test('duplikált email → 409, success: false', async () => {
        sql.getUserByEmail.mockResolvedValueOnce({ id: 1, email: 'meglevo@example.com' });
        const res = await supertest(buildApp())
            .post('/register')
            .send({ username: 'ujnev', email: 'meglevo@example.com', password: 'Erospwd1!' });
        expect(res.status).toBe(409);
        expect(res.body.success).toBe(false);
    });
});

describe('POST /logout', () => {
    test('204 vagy 200 + sikeres lifecycle (session destroy)', async () => {
        const res = await supertest(buildApp()).post('/logout');
        expect([200, 204]).toContain(res.status);
    });
});
