/**
 * api/admin/middleware.js — extended tests (parseAdminToken + requireReasonOnMutate
 * + getRequestIp/UA helpers).
 */

jest.mock('../api/admin/tokenService.js', () => ({
    verifyAndTouchToken: jest.fn()
}));

jest.mock('../sql/adminRepo.js', () => ({
    getUserForAdminAuth: jest.fn(() => Promise.resolve({
        role: 'admin', is_banned: false, is_super_admin: false, username: 'admin'
    })),
    getUserAdminFlags: jest.fn(() => Promise.resolve({ is_admin: true, is_super_admin: false }))
}));

jest.mock('../api/admin/alertingService.js', () => ({
    recordUnauthorized: jest.fn(),
    recordTokenInvalid: jest.fn()
}));

const tokenService = require('../api/admin/tokenService.js');
const mw = require('../api/admin/middleware.js');
const { ADMIN_ERROR_CODES, ADMIN_PERMISSIONS } = require('../api/admin/constants.js');

beforeEach(() => {
    jest.clearAllMocks();
});

function makeReq({ url = '/api/admin/x', method = 'GET', userId = null, role = 'player', auth = '', body = {} } = {}) {
    return {
        method,
        originalUrl: url,
        url,
        headers: { 'user-agent': 'jest', 'x-forwarded-for': '127.0.0.1', authorization: auth },
        socket: { remoteAddress: '127.0.0.1' },
        session: userId ? { userId, role } : null,
        body
    };
}

function makeRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.locals = {};
    return res;
}

describe('getRequestIp', () => {
    test('x-forwarded-for header elsodleges', () => {
        const r = mw.getRequestIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, socket: { remoteAddress: '127.0.0.1' } });
        expect(r).toBe('1.2.3.4');
    });

    test('xff hianyzik → socket.remoteAddress', () => {
        const r = mw.getRequestIp({ headers: {}, socket: { remoteAddress: '1.1.1.1' } });
        expect(r).toBe('1.1.1.1');
    });

    test('semmilyen IP → "ismeretlen"', () => {
        const r = mw.getRequestIp({ headers: {}, socket: null });
        expect(r).toBe('ismeretlen');
    });
});

describe('getRequestUserAgent', () => {
    test('UA header truncate-elve 255 char-ra', () => {
        const long = 'x'.repeat(500);
        const r = mw.getRequestUserAgent({ headers: { 'user-agent': long } });
        expect(r.length).toBe(255);
    });

    test('UA hianyzik → "ismeretlen"', () => {
        const r = mw.getRequestUserAgent({ headers: {} });
        expect(r).toBe('ismeretlen');
    });
});

describe('parseAdminToken', () => {
    test('nincs session → 401 + ADMIN_NO_SESSION', async () => {
        const req = makeReq();
        const res = makeRes();
        const next = jest.fn();
        await mw.parseAdminToken(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: ADMIN_ERROR_CODES.NO_SESSION
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test('nem-admin session → 403', async () => {
        const req = makeReq({ userId: 7, role: 'player' });
        const res = makeRes();
        const next = jest.fn();
        await mw.parseAdminToken(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    test('admin role + nincs token header → 401 TOKEN_MISSING', async () => {
        const req = makeReq({ userId: 1, role: 'admin' });
        const res = makeRes();
        const next = jest.fn();
        await mw.parseAdminToken(req, res, next);
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: ADMIN_ERROR_CODES.TOKEN_MISSING
        }));
    });

    test('admin role + invalid Bearer header format → TOKEN_MISSING', async () => {
        const req = makeReq({ userId: 1, role: 'admin', auth: 'NotBearer xyz' });
        const res = makeRes();
        await mw.parseAdminToken(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
    });

    test('admin role + valid Bearer + invalid token → 401 TOKEN_INVALID', async () => {
        tokenService.verifyAndTouchToken.mockResolvedValueOnce(null);
        const req = makeReq({ userId: 1, role: 'admin', auth: 'Bearer ' + 'a'.repeat(40) });
        const res = makeRes();
        await mw.parseAdminToken(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: expect.stringMatching(/TOKEN_(INVALID|EXPIRED)/)
        }));
    });

    test('admin role + valid Bearer + valid token → next() hivva, request.adminAuth feltoltve', async () => {
        tokenService.verifyAndTouchToken.mockResolvedValueOnce({
            tokenId: 99, userId: 1, expiresAt: new Date(Date.now() + 60_000)
        });
        const req = makeReq({ userId: 1, role: 'admin', auth: 'Bearer ' + 'a'.repeat(40) });
        const res = makeRes();
        const next = jest.fn();
        await mw.parseAdminToken(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.adminAuth).toBeDefined();
    });
});

describe('requireReasonOnMutate', () => {
    test('GET request (nem mutalo) → next() pass-en', () => {
        const middleware = mw.requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_BAN);
        const req = makeReq({ method: 'GET' });
        const res = makeRes();
        const next = jest.fn();
        middleware(req, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('POST + hianyzo reason → 400 REASON_REQUIRED', () => {
        const middleware = mw.requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_BAN);
        const req = makeReq({ method: 'POST', body: {} });
        const res = makeRes();
        middleware(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: ADMIN_ERROR_CODES.REASON_REQUIRED
        }));
    });

    test('POST + tul rovid reason → 400 REASON_TOO_SHORT', () => {
        const middleware = mw.requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_BAN);
        const req = makeReq({ method: 'POST', body: { reason: 'rövid' } }); // 5 char < min 10
        const res = makeRes();
        middleware(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: ADMIN_ERROR_CODES.REASON_TOO_SHORT
        }));
    });

    test('POST + tul hosszu reason → 400 REASON_TOO_LONG', () => {
        const middleware = mw.requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_BAN);
        const req = makeReq({ method: 'POST', body: { reason: 'x'.repeat(2000) } });
        const res = makeRes();
        middleware(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            code: ADMIN_ERROR_CODES.REASON_TOO_LONG
        }));
    });

    test('POST + ervenyes reason → next() + request.adminReason', () => {
        const middleware = mw.requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_BAN);
        const req = makeReq({ method: 'POST', body: { reason: 'Ervenyes hosszu indoklas itt.' } });
        const res = makeRes();
        const next = jest.fn();
        middleware(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(req.adminReason).toBeDefined();
    });

    test('opcionalis reason action: hianyzo reason → pass + auto-message', () => {
        const middleware = mw.requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_DELETE);
        const req = makeReq({ method: 'POST', body: {} });
        const res = makeRes();
        const next = jest.fn();
        middleware(req, res, next);
        // USERS_DELETE az OPTIONAL_REASON_ACTIONS-ben — pass
        expect(next).toHaveBeenCalled();
    });

    test('opcionalis reason action: 1-char reason is pass', () => {
        const middleware = mw.requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_DELETE);
        const req = makeReq({ method: 'POST', body: { reason: 'x' } });
        const res = makeRes();
        const next = jest.fn();
        middleware(req, res, next);
        expect(next).toHaveBeenCalled();
    });
});

describe('sendAdminError', () => {
    test('kuldi a status + code + message-et', () => {
        const res = makeRes();
        mw.sendAdminError(res, 401, 'CODE_X', 'msg');
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ success: false, code: 'CODE_X', message: 'msg' });
    });
});
