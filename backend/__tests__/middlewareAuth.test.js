/**
 * backend/api/middleware/auth.js — egyseg-tesztek a 3 guard-ra +
 * setSessionFromUser + checkAccountActiveStatus.
 *
 * Lefedi:
 *   - apiGuard: 401 no-session, 403 banned, 403 pending_deletion, next ok session
 *   - pageGuard: 302/redirect, /ban.html, /deleted.html, next ok session
 *   - adminGuard: 401 no-session, 403 nem admin, 403 banned admin, next ok admin
 *   - setSessionFromUser: pontos session-mezo set
 *   - checkAccountActiveStatus: ban-row es soft-delete row felismerese
 */

jest.mock('../sql/sql_functions.js', () => ({
    checkUserBanStatus: jest.fn()
}));

const sql = require('../sql/sql_functions.js');
const {
    pageGuard,
    apiGuard,
    adminGuard,
    setSessionFromUser,
    checkAccountActiveStatus
} = require('../api/middleware/auth.js');

beforeEach(() => {
    jest.clearAllMocks();
    sql.checkUserBanStatus.mockResolvedValue(null);
});

function makeReq({ userId = null, role = 'player' } = {}) {
    return {
        session: userId ? {
            userId,
            role,
            destroy: jest.fn((cb) => cb && cb()),
            cookie: { maxAge: 0 }
        } : null
    };
}

function makeRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.redirect = jest.fn();
    res.clearCookie = jest.fn();
    return res;
}

describe('apiGuard — JSON-os endpoint-ok', () => {
    test('nincs session → 401 + JSON {success:false}', async () => {
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();
        await apiGuard(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
        expect(next).not.toHaveBeenCalled();
    });

    test('aktiv user → next() hivva', async () => {
        const req = makeReq({ userId: 7 });
        const res = makeRes();
        const next = jest.fn();
        await apiGuard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('banned user → 403 + code:account_banned + session destroy', async () => {
        sql.checkUserBanStatus.mockResolvedValueOnce({ is_banned: true, pending_deletion_until: null });
        const req = makeReq({ userId: 7 });
        const res = makeRes();
        const next = jest.fn();
        await apiGuard(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            code: 'account_banned'
        }));
        expect(next).not.toHaveBeenCalled();
        expect(req.session.destroy).toHaveBeenCalled();
    });

    test('pending_deletion user → 403 + code:account_pending_deletion + datum', async () => {
        const future = new Date(Date.now() + 86400_000); // holnap
        sql.checkUserBanStatus.mockResolvedValueOnce({
            is_banned: false,
            pending_deletion_until: future
        });
        const req = makeReq({ userId: 7 });
        const res = makeRes();
        const next = jest.fn();
        await apiGuard(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: 'account_pending_deletion',
            pendingDeletionUntil: future
        }));
    });

    test('lejart pending_deletion (multbeli datum) → next (mar nem aktiv torles)', async () => {
        const past = new Date(Date.now() - 86400_000); // tegnap
        sql.checkUserBanStatus.mockResolvedValueOnce({
            is_banned: false,
            pending_deletion_until: past
        });
        const req = makeReq({ userId: 7 });
        const res = makeRes();
        const next = jest.fn();
        await apiGuard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('DB-hiba → fail-open (next hivva, nem 500)', async () => {
        sql.checkUserBanStatus.mockRejectedValueOnce(new Error('DB le'));
        const req = makeReq({ userId: 7 });
        const res = makeRes();
        const next = jest.fn();
        await apiGuard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});

describe('pageGuard — HTML lap-ok', () => {
    test('nincs session → redirect /', async () => {
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();
        await pageGuard(req, res, next);
        expect(res.redirect).toHaveBeenCalledWith('/');
        expect(next).not.toHaveBeenCalled();
    });

    test('aktiv user → next() hivva', async () => {
        const req = makeReq({ userId: 7 });
        const res = makeRes();
        const next = jest.fn();
        await pageGuard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('banned user → redirect /ban.html', async () => {
        sql.checkUserBanStatus.mockResolvedValueOnce({ is_banned: true });
        const req = makeReq({ userId: 7 });
        const res = makeRes();
        await pageGuard(req, res, jest.fn());
        expect(res.redirect).toHaveBeenCalledWith('/ban.html');
    });

    test('pending_deletion user → redirect /deleted.html', async () => {
        sql.checkUserBanStatus.mockResolvedValueOnce({
            is_banned: false,
            pending_deletion_until: new Date(Date.now() + 86400_000)
        });
        const req = makeReq({ userId: 7 });
        const res = makeRes();
        await pageGuard(req, res, jest.fn());
        expect(res.redirect).toHaveBeenCalledWith('/deleted.html');
    });
});

describe('adminGuard — admin endpoint-ok', () => {
    test('nincs session → 401', async () => {
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();
        await adminGuard(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });

    test('player session → 403 (nem admin)', async () => {
        const req = makeReq({ userId: 7, role: 'player' });
        const res = makeRes();
        const next = jest.fn();
        await adminGuard(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            message: expect.stringMatching(/jogosultság/i)
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test('admin session → next() hivva', async () => {
        const req = makeReq({ userId: 1, role: 'admin' });
        const res = makeRes();
        const next = jest.fn();
        await adminGuard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('banned admin → 403', async () => {
        sql.checkUserBanStatus.mockResolvedValueOnce({ is_banned: true });
        const req = makeReq({ userId: 1, role: 'admin' });
        const res = makeRes();
        const next = jest.fn();
        await adminGuard(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('setSessionFromUser — single source of truth', () => {
    test('teljes user-row beallit minden mezot', () => {
        const req = { session: { cookie: { maxAge: 0 } } };
        const user = {
            id: 7,
            username: 'testuser',
            role: 'player',
            elo: 1500,
            elo_MM: 1600,
            elo_bullet: 1400,
            profile_image: '/foo.png',
            profile_image_status: 'pending',
            is_email_verified: true
        };
        setSessionFromUser(req, user);
        expect(req.session.userId).toBe(7);
        expect(req.session.username).toBe('testuser');
        expect(req.session.role).toBe('player');
        expect(req.session.elo).toBe(1500);
        expect(req.session.elo_MM).toBe(1600);
        expect(req.session.elo_bullet).toBe(1400);
        expect(req.session.profile_image).toBe('/foo.png');
        expect(req.session.profile_image_status).toBe('pending');
        expect(req.session.is_email_verified).toBe(true);
    });

    test('hianyzo mezok default-okra esnek', () => {
        const req = { session: { cookie: { maxAge: 0 } } };
        setSessionFromUser(req, { id: 7, username: 'x' });
        expect(req.session.role).toBe('player');
        expect(req.session.elo).toBe(800);
        expect(req.session.elo_MM).toBe(800);
        expect(req.session.elo_bullet).toBe(800);
        expect(req.session.profile_image).toBe('/profile_pictures/default.png');
        expect(req.session.profile_image_status).toBe('default');
        expect(req.session.is_email_verified).toBe(false);
    });

    test('opts.cookieMaxAge beallitja a cookie-t', () => {
        const req = { session: { cookie: { maxAge: 0 } } };
        setSessionFromUser(req, { id: 7 }, { cookieMaxAge: 60_000 });
        expect(req.session.cookie.maxAge).toBe(60_000);
    });

    test('falsy is_email_verified false-ra normalizal', () => {
        const req = { session: { cookie: { maxAge: 0 } } };
        setSessionFromUser(req, { id: 7, is_email_verified: 0 });
        expect(req.session.is_email_verified).toBe(false);
        setSessionFromUser(req, { id: 7, is_email_verified: 1 });
        expect(req.session.is_email_verified).toBe(true);
    });
});

describe('checkAccountActiveStatus — direct unit teszt', () => {
    test('nincs row → not evicted', async () => {
        sql.checkUserBanStatus.mockResolvedValueOnce(null);
        const req = makeReq({ userId: 7 });
        const res = makeRes();
        const result = await checkAccountActiveStatus(req, res);
        expect(result.evicted).toBe(false);
        expect(result.reason).toBeNull();
    });

    test('banned row → evicted: reason=banned', async () => {
        sql.checkUserBanStatus.mockResolvedValueOnce({ is_banned: true });
        const req = makeReq({ userId: 7 });
        const res = makeRes();
        const result = await checkAccountActiveStatus(req, res);
        expect(result.evicted).toBe(true);
        expect(result.reason).toBe('banned');
        expect(req.session.destroy).toHaveBeenCalled();
        expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
    });

    test('aktiv pending_deletion row → evicted: reason=pending_deletion + datum', async () => {
        const future = new Date(Date.now() + 86400_000);
        sql.checkUserBanStatus.mockResolvedValueOnce({
            is_banned: false,
            pending_deletion_until: future
        });
        const req = makeReq({ userId: 7 });
        const res = makeRes();
        const result = await checkAccountActiveStatus(req, res);
        expect(result.evicted).toBe(true);
        expect(result.reason).toBe('pending_deletion');
        expect(result.pendingDeletionUntil).toBe(future);
    });

    test('lejart pending_deletion → not evicted', async () => {
        sql.checkUserBanStatus.mockResolvedValueOnce({
            is_banned: false,
            pending_deletion_until: new Date(Date.now() - 86400_000)
        });
        const req = makeReq({ userId: 7 });
        const res = makeRes();
        const result = await checkAccountActiveStatus(req, res);
        expect(result.evicted).toBe(false);
    });

    test('DB-hiba → fail-open (not evicted)', async () => {
        sql.checkUserBanStatus.mockRejectedValueOnce(new Error('DB le'));
        const req = makeReq({ userId: 7 });
        const res = makeRes();
        const result = await checkAccountActiveStatus(req, res);
        expect(result.evicted).toBe(false);
    });
});
