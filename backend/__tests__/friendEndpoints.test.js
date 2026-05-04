/**
 * N6 — Friend endpoint smoke teszt: add / accept / reject / list happy path.
 * Mockolt sql + session-injection middleware (a teszt-app a route bemount előtt
 * beállítja a session.userId-t).
 */

const express = require('express');
const session = require('express-session');
const supertest = require('supertest');

jest.mock('../sql/sql_functions.js', () => ({
    addFriendRequest: jest.fn(() => Promise.resolve({ message: 'Barát kérelem elküldve.' })),
    acceptFriendRequest: jest.fn(() => Promise.resolve({ message: 'Barát kérelem elfogadva.' })),
    rejectFriendRequest: jest.fn(() => Promise.resolve({ message: 'Barát kérelem elutasítva.' })),
    blockUser: jest.fn(() => Promise.resolve({ message: 'Felhasználó blokkolva.' })),
    getFriendListForUser: jest.fn(() => Promise.resolve([])),
    getUserBasicById: jest.fn(() => Promise.resolve({ id: 1, username: 'sender' })),
    insertNotification: jest.fn(() => Promise.resolve({ insertId: 1 })),
    getUserVerificationStatusById: jest.fn(() => Promise.resolve({ is_email_verified: true })),
    upsertUserLog: jest.fn(() => Promise.resolve()),
    insertUserLogEntry: jest.fn(() => Promise.resolve()),
    checkUserBanStatus: jest.fn(() => Promise.resolve(null)),
    dismissNotificationsByContext: jest.fn(() => Promise.resolve())
}));

jest.mock('../api/middleware/rateLimiter.js', () => {
    const passthrough = (request, response, next) => next();
    return {
        createRateLimiter: () => passthrough,
        userOrIpKeyGenerator: () => 'anon',
        friendActionLimiter: passthrough,
        playerSearchLimiter: passthrough,
        notificationActionLimiter: passthrough,
        chatMessageLimiter: passthrough,
        chatDirectOpenLimiter: passthrough
    };
});

const sql = require('../sql/sql_functions.js');
const friendsRoutes = require('../api/routes/friends.js');

function buildApp(loggedInUserId) {
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false }
    }));
    app.use((request, response, next) => {
        if (loggedInUserId) {
            request.session.userId = loggedInUserId;
            request.session.role = 'player';
            request.session.is_email_verified = true;
        }
        next();
    });
    app.use(friendsRoutes);
    return app;
}

describe('POST /friends/add', () => {
    beforeEach(() => jest.clearAllMocks());

    test('happy path: targetUserId megadva → 200, success: true', async () => {
        const res = await supertest(buildApp(1)).post('/friends/add').send({ targetUserId: 2 });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(sql.addFriendRequest).toHaveBeenCalledWith(1, 2);
    });

    test('saját magát nem adhatja hozzá → 400', async () => {
        const res = await supertest(buildApp(1)).post('/friends/add').send({ targetUserId: 1 });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('hiányzó session → 401', async () => {
        const res = await supertest(buildApp(null)).post('/friends/add').send({ targetUserId: 2 });
        expect(res.status).toBe(401);
    });
});

describe('POST /friends/accept', () => {
    beforeEach(() => jest.clearAllMocks());

    test('happy path → 200, success: true', async () => {
        const res = await supertest(buildApp(1)).post('/friends/accept').send({ targetUserId: 2 });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(sql.acceptFriendRequest).toHaveBeenCalledWith(1, 2);
    });
});

describe('POST /friends/reject', () => {
    beforeEach(() => jest.clearAllMocks());

    test('happy path → 200, success: true', async () => {
        const res = await supertest(buildApp(1)).post('/friends/reject').send({ targetUserId: 2 });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});

describe('GET /friends/list', () => {
    beforeEach(() => jest.clearAllMocks());

    test('happy path: visszaad lista + filter mezőt', async () => {
        const res = await supertest(buildApp(1)).get('/friends/list?status=friend');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.filter).toBe('friend');
    });
});
