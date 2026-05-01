/**
 * Admin middleware: requireReasonOnMutate + ULID + tokenService.hashToken.
 * ADMIN_PANEL.md F2/F3 + §10.1.
 */

jest.mock('../sql/database.js', () => ({
    getPool: () => ({ execute: jest.fn(), query: jest.fn() })
}));

jest.mock('../sql/adminRepo.js', () => ({
    findActiveAdminToken: jest.fn(),
    touchAdminToken: jest.fn(),
    createAdminToken: jest.fn(() => Promise.resolve({ insertId: 1 })),
    revokeAdminToken: jest.fn(),
    revokeAllAdminTokensForUser: jest.fn(() => Promise.resolve(0))
}));

const { generateUlid } = require('../api/admin/ulid.js');
const { hashToken, generatePlainToken } = require('../api/admin/tokenService.js');
const { requireReasonOnMutate } = require('../api/admin/middleware.js');
const { ADMIN_PERMISSIONS } = require('../api/admin/constants.js');

function makeRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; }
    };
    return res;
}

describe('generateUlid', () => {
    test('26 karakter hosszu', () => {
        const id = generateUlid();
        expect(id.length).toBe(26);
    });

    test('kulonbozo hivasok eltero ID-t adnak', () => {
        const a = generateUlid();
        const b = generateUlid();
        expect(a).not.toBe(b);
    });

    test('csak Crockford base32 karaktereket tartalmaz', () => {
        const id = generateUlid();
        expect(/^[0-9A-HJKMNP-TV-Z]+$/.test(id)).toBe(true);
    });
});

describe('tokenService hash + generate', () => {
    test('hashToken determinisztikus es 64 hex char', () => {
        const a = hashToken('abc123');
        const b = hashToken('abc123');
        expect(a).toBe(b);
        expect(a).toMatch(/^[a-f0-9]{64}$/);
    });

    test('eltero input eltero hash', () => {
        expect(hashToken('a')).not.toBe(hashToken('b'));
    });

    test('generatePlainToken legalabb 40 char base64url', () => {
        const t = generatePlainToken();
        expect(t.length).toBeGreaterThanOrEqual(40);
        expect(/^[A-Za-z0-9_-]+$/.test(t)).toBe(true);
    });
});

describe('requireReasonOnMutate', () => {
    test('GET keres atengedi ha nincs reason', () => {
        const mw = requireReasonOnMutate('users.view');
        const req = { method: 'GET', body: {} };
        const res = makeRes();
        let nextCalled = false;
        mw(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
    });

    test('POST + ures reason -> 400 REASON_REQUIRED', () => {
        const mw = requireReasonOnMutate(ADMIN_PERMISSIONS.NOTIFICATIONS_SEND);
        const req = { method: 'POST', body: {} };
        const res = makeRes();
        mw(req, res, () => {});
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('ADMIN_REASON_REQUIRED');
    });

    test('POST + 9 char reason normal -> 400 too short', () => {
        const mw = requireReasonOnMutate(ADMIN_PERMISSIONS.NOTIFICATIONS_SEND);
        const req = { method: 'POST', body: { reason: '123456789' } };
        const res = makeRes();
        mw(req, res, () => {});
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('ADMIN_REASON_TOO_SHORT');
    });

    test('POST + 10 char reason normal -> next', () => {
        const mw = requireReasonOnMutate(ADMIN_PERMISSIONS.NOTIFICATIONS_SEND);
        const req = { method: 'POST', body: { reason: '1234567890' } };
        const res = makeRes();
        let nextCalled = false;
        mw(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
        expect(req.adminReason).toBe('1234567890');
    });

    test('POST + 29 char reason kritikus -> 400 too short', () => {
        const mw = requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_BAN);
        const req = { method: 'POST', body: { reason: 'a'.repeat(29) } };
        const res = makeRes();
        mw(req, res, () => {});
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('ADMIN_REASON_TOO_SHORT');
    });

    test('POST + 30 char reason kritikus -> next', () => {
        const mw = requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_BAN);
        const req = { method: 'POST', body: { reason: 'a'.repeat(30) } };
        const res = makeRes();
        let nextCalled = false;
        mw(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
        expect(req.adminIsCritical).toBe(true);
    });

    test('actionResolver fuggveny meghivasa', () => {
        const resolver = jest.fn(() => ADMIN_PERMISSIONS.USERS_DELETE);
        const mw = requireReasonOnMutate(resolver);
        const req = { method: 'POST', body: { reason: 'a'.repeat(30) } };
        const res = makeRes();
        mw(req, res, () => {});
        expect(resolver).toHaveBeenCalled();
        expect(req.adminAction).toBe(ADMIN_PERMISSIONS.USERS_DELETE);
    });
});
