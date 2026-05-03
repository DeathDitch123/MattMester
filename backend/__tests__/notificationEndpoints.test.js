/**
 * N6 — Notification endpoint smoke teszt: GET list, dismiss happy path.
 */

const express = require('express');
const session = require('express-session');
const supertest = require('supertest');

jest.mock('../sql/sql_functions.js', () => ({
    getNotificationsForUser: jest.fn(() => Promise.resolve({
        data: [
            { id: 1, title: 'Teszt értesítés', message: '...', is_read: false, dismissed_at: null }
        ],
        nextCursor: null,
        hasMore: false
    })),
    getUnreadNotificationCount: jest.fn(() => Promise.resolve(1)),
    markNotificationRead: jest.fn(() => Promise.resolve({ success: true })),
    markAllNotificationsRead: jest.fn(() => Promise.resolve({ markedCount: 1 })),
    dismissNotificationForUser: jest.fn(() => Promise.resolve({ accessible: true, changed: true, alreadyDismissed: false })),
    checkUserBanStatus: jest.fn(() => Promise.resolve(null))
}));

jest.mock('../api/middleware/rateLimiter.js', () => {
    const passthrough = (request, response, next) => next();
    return {
        createRateLimiter: () => passthrough,
        userOrIpKeyGenerator: () => 'anon',
        notificationActionLimiter: passthrough
    };
});

jest.mock('../services.js', () => ({
    notificationService: {
        broadcastUpdate: jest.fn(() => Promise.resolve()),
        refreshBadgeForUser: jest.fn(() => Promise.resolve(0))
    }
}));

const sql = require('../sql/sql_functions.js');
const notificationsRoutes = require('../api/routes/notifications.js');

function buildApp(userId) {
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false }
    }));
    app.use((request, response, next) => {
        if (userId) {
            request.session.userId = userId;
            request.session.role = 'player';
        }
        next();
    });
    app.use(notificationsRoutes);
    return app;
}

describe('GET /notifications', () => {
    beforeEach(() => jest.clearAllMocks());

    test('happy path → 200, data + unreadCount', async () => {
        const res = await supertest(buildApp(1)).get('/notifications');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.unreadCount).toBe(1);
        expect(sql.getNotificationsForUser).toHaveBeenCalled();
    });

    test('hiányzó session → 401', async () => {
        const res = await supertest(buildApp(null)).get('/notifications');
        expect(res.status).toBe(401);
    });
});

describe('GET /notifications/unread-count', () => {
    beforeEach(() => jest.clearAllMocks());

    test('happy path → 200, unreadCount', async () => {
        const res = await supertest(buildApp(1)).get('/notifications/unread-count');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(typeof res.body.unreadCount).toBe('number');
    });
});

describe('POST /notifications/:id/dismiss', () => {
    beforeEach(() => jest.clearAllMocks());

    test('happy path → 200, success: true', async () => {
        const res = await supertest(buildApp(1)).post('/notifications/1/dismiss');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(sql.dismissNotificationForUser).toHaveBeenCalled();
    });
});
