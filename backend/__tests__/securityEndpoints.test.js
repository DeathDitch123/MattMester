/**
 * backend/api/routes/security.js — endpoint smoke tesztek.
 *
 * Lefedi:
 *   - GET /security/activity — auth + limit clamp [1, 200]
 *   - POST /security/logout-all-devices — auth + sessionStore destroy minden user-session-re
 */

const express = require('express');
const session = require('express-session');
const supertest = require('supertest');

jest.mock('../sql/sql_functions.js', () => ({
    getUserSecurityActivity: jest.fn(),
    insertUserLog: jest.fn(() => Promise.resolve()),
    checkUserBanStatus: jest.fn(() => Promise.resolve(null))
}));

jest.mock('../api/middleware/rateLimiter.js', () => {
    const passthrough = (req, res, next) => next();
    return new Proxy({}, { get: () => passthrough });
});

const sql = require('../sql/sql_functions.js');
const securityRoutes = require('../api/routes/security.js');

const { EventEmitter } = require('events');
class FakeSessionStore extends EventEmitter {
    constructor(sessions = {}) {
        super();
        this.sessions = sessions;
        this.destroyed = [];
    }
    all(cb) { cb(null, this.sessions); }
    destroy(sid, cb) {
        delete this.sessions[sid];
        this.destroyed.push(sid);
        cb && cb();
    }
    get(sid, cb) { cb(null, this.sessions[sid] || null); }
    set(sid, sess, cb) { this.sessions[sid] = sess; cb && cb(); }
    touch(sid, sess, cb) { cb && cb(); }
}

function buildApp({ sessionUserId = null, store = null } = {}) {
    const app = express();
    app.use(express.json());
    const sessStore = store || new FakeSessionStore();
    app.use(session({
        store: sessStore,
        secret: 't',
        resave: false,
        saveUninitialized: false
    }));
    app.use((req, res, next) => {
        if (sessionUserId !== null) req.session.userId = sessionUserId;
        next();
    });
    app.use(securityRoutes);
    app._sessStore = sessStore; // teszt-helper
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('GET /security/activity', () => {
    test('401 nincs session', async () => {
        const res = await supertest(buildApp()).get('/security/activity');
        expect(res.status).toBe(401);
    });

    test('200 + ures lista', async () => {
        sql.getUserSecurityActivity.mockResolvedValueOnce([]);
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/security/activity');
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });

    test('200 + esemenyek', async () => {
        sql.getUserSecurityActivity.mockResolvedValueOnce([
            { id: 1, eventType: 'login', timestamp: '2025-01-01' }
        ]);
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/security/activity');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
    });

    test('limit alapertelmezett: 100', async () => {
        sql.getUserSecurityActivity.mockResolvedValueOnce([]);
        await supertest(buildApp({ sessionUserId: 7 })).get('/security/activity');
        expect(sql.getUserSecurityActivity).toHaveBeenCalledWith(7, 100);
    });

    test('limit clamp felulrol: 200 a max', async () => {
        sql.getUserSecurityActivity.mockResolvedValueOnce([]);
        await supertest(buildApp({ sessionUserId: 7 })).get('/security/activity?limit=999');
        expect(sql.getUserSecurityActivity).toHaveBeenCalledWith(7, 200);
    });

    test('limit clamp alulrol: 1 a min', async () => {
        sql.getUserSecurityActivity.mockResolvedValueOnce([]);
        await supertest(buildApp({ sessionUserId: 7 })).get('/security/activity?limit=0');
        // 0 vagy hianyzik = 100 default; csak 1+ akkor el-clampelo
        expect(sql.getUserSecurityActivity).toHaveBeenCalledWith(7, 100);
    });

    test('500 DB-hiba eseten', async () => {
        sql.getUserSecurityActivity.mockRejectedValueOnce(new Error('DB le'));
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/security/activity');
        expect(res.status).toBe(500);
    });
});

describe('POST /security/logout-all-devices', () => {
    test('401 nincs session', async () => {
        const res = await supertest(buildApp()).post('/security/logout-all-devices');
        expect(res.status).toBe(401);
    });

    test('200 + 0 destroyed ha nincs masik session', async () => {
        const store = new FakeSessionStore({});
        const res = await supertest(buildApp({ sessionUserId: 7, store }))
            .post('/security/logout-all-devices');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.destroyedSessions).toBe(0);
    });

    test('200 + minden mas user-session torolve', async () => {
        const store = new FakeSessionStore({
            'sid-A': { id: 'sid-A', userId: 7 },
            'sid-B': { id: 'sid-B', userId: 7 },
            'sid-C': { id: 'sid-C', userId: 99 }, // masik user
            'sid-D': { id: 'sid-D', userId: 7 }
        });
        const res = await supertest(buildApp({ sessionUserId: 7, store }))
            .post('/security/logout-all-devices');
        expect(res.status).toBe(200);
        expect(res.body.destroyedSessions).toBe(3);
        expect(store.destroyed.sort()).toEqual(['sid-A', 'sid-B', 'sid-D']);
        // a 99-es user session-je megmarad
        expect(store.sessions['sid-C']).toBeDefined();
    });

    test('connect.sid cookie torolve a kliens-oldalrol', async () => {
        const store = new FakeSessionStore({});
        const res = await supertest(buildApp({ sessionUserId: 7, store }))
            .post('/security/logout-all-devices');
        const setCookie = res.headers['set-cookie'] || [];
        // clearCookie hatasara legalabb egy connect.sid expire vagy ures cookie megjelenik
        const hasConnectSidClear = setCookie.some(c => /connect\.sid=;/.test(c) || /connect\.sid=/.test(c));
        expect(hasConnectSidClear).toBe(true);
    });
});
