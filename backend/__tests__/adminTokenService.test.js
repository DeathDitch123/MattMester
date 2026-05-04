/**
 * api/admin/tokenService.js — admin token kiadas/ellenorzes tesztek.
 */

jest.mock('../sql/adminRepo.js', () => ({
    createAdminToken: jest.fn(() => Promise.resolve()),
    findActiveAdminToken: jest.fn(),
    touchAdminToken: jest.fn(() => Promise.resolve()),
    revokeAdminToken: jest.fn(() => Promise.resolve()),
    revokeAllAdminTokensForUser: jest.fn(() => Promise.resolve(0))
}));

const adminRepo = require('../sql/adminRepo.js');
const ts = require('../api/admin/tokenService.js');

beforeEach(() => {
    jest.clearAllMocks();
});

describe('hashToken', () => {
    test('SHA-256 hex output (64 char)', () => {
        const h = ts.hashToken('hello');
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });

    test('determinisztikus (azonos input = azonos hash)', () => {
        expect(ts.hashToken('a')).toBe(ts.hashToken('a'));
    });

    test('kulonbozo input = kulonbozo hash', () => {
        expect(ts.hashToken('a')).not.toBe(ts.hashToken('b'));
    });
});

describe('generatePlainToken', () => {
    test('base64url-szafe karaktereket tartalmaz (no +/=)', () => {
        const t = ts.generatePlainToken();
        expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test('eleg hosszu (>= 40 karakter, 32 byte base64url)', () => {
        const t = ts.generatePlainToken();
        expect(t.length).toBeGreaterThanOrEqual(40);
    });

    test('1000 generalas mind unique', () => {
        const set = new Set();
        for (let i = 0; i < 1000; i++) set.add(ts.generatePlainToken());
        expect(set.size).toBe(1000);
    });
});

describe('issueAdminToken', () => {
    test('plainToken + expiresAt visszateres', async () => {
        const r = await ts.issueAdminToken(7, '127.0.0.1', 'jest');
        expect(r.plainToken).toBeDefined();
        expect(r.expiresAt).toBeInstanceOf(Date);
        expect(r.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    test('hash-elt valtozatot kuldi a DB-be (NEM a plain-t)', async () => {
        const r = await ts.issueAdminToken(7, '127.0.0.1', 'jest');
        const args = adminRepo.createAdminToken.mock.calls[0];
        // args = [userId, tokenHash, expiresAt, ip, ua]
        expect(args[0]).toBe(7);
        expect(args[1]).toMatch(/^[0-9a-f]{64}$/); // hash
        expect(args[1]).not.toBe(r.plainToken); // NEM plain
    });

    test('DB-hiba → wrapper-throw', async () => {
        adminRepo.createAdminToken.mockRejectedValueOnce(new Error('DB le'));
        await expect(ts.issueAdminToken(7, 'ip', 'ua')).rejects.toThrow(/sikertelen/);
    });
});

describe('verifyAndTouchToken', () => {
    test('valid token → visszaadja a row-t + meghosszabbitja', async () => {
        adminRepo.findActiveAdminToken.mockResolvedValueOnce({ id: 99, user_id: 7 });
        const r = await ts.verifyAndTouchToken('sometoken', 7);
        expect(r.tokenId).toBe(99);
        expect(r.userId).toBe(7);
        expect(r.expiresAt).toBeInstanceOf(Date);
        expect(adminRepo.touchAdminToken).toHaveBeenCalledWith(99, expect.any(Number));
    });

    test('invalid token (no row) → null', async () => {
        adminRepo.findActiveAdminToken.mockResolvedValueOnce(null);
        const r = await ts.verifyAndTouchToken('badtoken', 7);
        expect(r).toBeNull();
        expect(adminRepo.touchAdminToken).not.toHaveBeenCalled();
    });

    test('hash-elve keresi a DB-ben (NEM plain)', async () => {
        adminRepo.findActiveAdminToken.mockResolvedValueOnce(null);
        await ts.verifyAndTouchToken('plain-xyz', 7);
        const [hash, userId] = adminRepo.findActiveAdminToken.mock.calls[0];
        expect(hash).toBe(ts.hashToken('plain-xyz'));
        expect(userId).toBe(7);
    });

    test('DB-hiba → wrapper-throw', async () => {
        adminRepo.findActiveAdminToken.mockRejectedValueOnce(new Error('DB le'));
        await expect(ts.verifyAndTouchToken('t', 7)).rejects.toThrow(/ellenorzesi/);
    });
});

describe('revokeTokenById', () => {
    test('hivja a repo.revokeAdminToken-t', async () => {
        await ts.revokeTokenById(99);
        expect(adminRepo.revokeAdminToken).toHaveBeenCalledWith(99);
    });

    test('DB-hiba → wrapper-throw', async () => {
        adminRepo.revokeAdminToken.mockRejectedValueOnce(new Error('le'));
        await expect(ts.revokeTokenById(99)).rejects.toThrow(/visszavon/);
    });
});

describe('revokeAllForUser', () => {
    test('visszaadja az affected count-ot', async () => {
        adminRepo.revokeAllAdminTokensForUser.mockResolvedValueOnce(3);
        const n = await ts.revokeAllForUser(7);
        expect(n).toBe(3);
    });

    test('DB-hiba → throw', async () => {
        adminRepo.revokeAllAdminTokensForUser.mockRejectedValueOnce(new Error('le'));
        await expect(ts.revokeAllForUser(7)).rejects.toThrow();
    });
});

describe('rotateToken', () => {
    test('regi tokent revoke-elja, uj tokent ad ki', async () => {
        const r = await ts.rotateToken(99, 7, '127.0.0.1', 'jest');
        expect(adminRepo.revokeAdminToken).toHaveBeenCalledWith(99);
        expect(r.plainToken).toBeDefined();
    });
});
