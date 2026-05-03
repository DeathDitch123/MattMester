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

    // USERS_BAN szandekosan NEM kritikus (10 char min). USERS_DELETE OPCIONALIS reason
    // (jelszo-ellenorzes elegendo vedelem). A "kritikus path" most csak severity-t
    // befolyasol, a char-minimum mindenutt 10. ADMIN_GRANT-tal teszteljuk a kritikust.
    test('POST + 10 char reason kritikus action -> next, isCritical=true', () => {
        const mw = requireReasonOnMutate(ADMIN_PERMISSIONS.ADMIN_GRANT);
        const req = { method: 'POST', body: { reason: '1234567890' } };
        const res = makeRes();
        let nextCalled = false;
        mw(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
        expect(req.adminIsCritical).toBe(true);
    });

    test('POST + 9 char reason kritikus -> 400 too short', () => {
        const mw = requireReasonOnMutate(ADMIN_PERMISSIONS.ADMIN_GRANT);
        const req = { method: 'POST', body: { reason: 'a'.repeat(9) } };
        const res = makeRes();
        mw(req, res, () => {});
        expect(res.statusCode).toBe(400);
        expect(res.body.code).toBe('ADMIN_REASON_TOO_SHORT');
    });

    // OPTIONAL_REASON_ACTIONS: ures reason is rendben, default placeholder kerul a logba.
    test('POST + ures reason opcionalis action (USERS_DELETE) -> next', () => {
        const mw = requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_DELETE);
        const req = { method: 'POST', body: {} };
        const res = makeRes();
        let nextCalled = false;
        mw(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
        expect(req.adminReason).toContain('opcionalis reason mellozve');
    });

    test('POST + 1 char reason opcionalis action (CHAT_DELETE) -> next', () => {
        const mw = requireReasonOnMutate(ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE);
        const req = { method: 'POST', body: { reason: 'x' } };
        const res = makeRes();
        let nextCalled = false;
        mw(req, res, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
        expect(req.adminReason).toBe('x');
    });

    test('actionResolver fuggveny meghivasa', () => {
        const resolver = jest.fn(() => ADMIN_PERMISSIONS.ADMIN_GRANT);
        const mw = requireReasonOnMutate(resolver);
        const req = { method: 'POST', body: { reason: 'a'.repeat(10) } };
        const res = makeRes();
        mw(req, res, () => {});
        expect(resolver).toHaveBeenCalled();
        expect(req.adminAction).toBe(ADMIN_PERMISSIONS.ADMIN_GRANT);
    });
});
