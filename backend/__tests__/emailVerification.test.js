/**
 * api/emailVerification.js — exported helper-ek tesztjei.
 */

const ev = require('../api/emailVerification.js');

describe('hashToken', () => {
    test('SHA-256 hex (64 char)', () => {
        expect(ev.hashToken('hello')).toMatch(/^[0-9a-f]{64}$/);
    });

    test('determinisztikus', () => {
        expect(ev.hashToken('a')).toBe(ev.hashToken('a'));
    });

    test('null/undefined/ures string mind ugyanaz a hash', () => {
        const a = ev.hashToken(null);
        const b = ev.hashToken(undefined);
        const c = ev.hashToken('');
        expect(a).toBe(b);
        expect(b).toBe(c);
    });

    test('hosszu input is fix-hosszu hash', () => {
        const long = 'x'.repeat(10000);
        expect(ev.hashToken(long)).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe('generateVerificationToken', () => {
    test('rawToken + tokenHash + expiresAt mind beallitva', () => {
        const t = ev.generateVerificationToken();
        expect(t.rawToken).toMatch(/^[0-9a-f]{64}$/);
        expect(t.tokenHash).toMatch(/^[0-9a-f]{64}$/);
        expect(t.expiresAt).toBeInstanceOf(Date);
    });

    test('expiresAt 24 ora a jovoben', () => {
        const t = ev.generateVerificationToken();
        const diffMs = t.expiresAt.getTime() - Date.now();
        expect(diffMs).toBeGreaterThan(23 * 60 * 60 * 1000);
        expect(diffMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    });

    test('rawToken hash-elve = tokenHash', () => {
        const t = ev.generateVerificationToken();
        expect(ev.hashToken(t.rawToken)).toBe(t.tokenHash);
    });

    test('1000 generalas mind unique', () => {
        const set = new Set();
        for (let i = 0; i < 1000; i++) set.add(ev.generateVerificationToken().rawToken);
        expect(set.size).toBe(1000);
    });
});

describe('generatePasswordResetToken', () => {
    test('expiresAt 1 ora kornyeke', () => {
        const t = ev.generatePasswordResetToken();
        const diffMs = t.expiresAt.getTime() - Date.now();
        expect(diffMs).toBeGreaterThan(59 * 60 * 1000);
        expect(diffMs).toBeLessThanOrEqual(60 * 60 * 1000);
    });

    test('rawToken hash megegyezik', () => {
        const t = ev.generatePasswordResetToken();
        expect(ev.hashToken(t.rawToken)).toBe(t.tokenHash);
    });

    test('TOKEN_TTL_MS != PASSWORD_RESET_TOKEN_TTL_MS', () => {
        expect(ev.TOKEN_TTL_MS).not.toBe(ev.PASSWORD_RESET_TOKEN_TTL_MS);
    });
});

describe('buildVerificationLink', () => {
    test('path tartalmazza a /api/auth/verify-email-t', () => {
        const l = ev.buildVerificationLink('xyz');
        expect(l).toContain('/api/auth/verify-email');
        expect(l).toContain('token=xyz');
    });

    test('special karaktereket URL-encode-eli', () => {
        const l = ev.buildVerificationLink('abc def');
        expect(l).toContain('abc%20def');
    });
});

describe('buildPasswordResetLink', () => {
    test('path tartalmazza a /html/restorePassword.html-t', () => {
        const l = ev.buildPasswordResetLink('xyz');
        expect(l).toContain('/html/restorePassword.html');
        expect(l).toContain('token=xyz');
    });

    test('null token → ures token a query-ben', () => {
        const l = ev.buildPasswordResetLink(null);
        expect(l).toContain('token=');
    });
});

describe('isExpired', () => {
    test('multbeli datum → true', () => {
        expect(ev.isExpired(new Date(Date.now() - 1000))).toBe(true);
    });

    test('jovobeli datum → false', () => {
        expect(ev.isExpired(new Date(Date.now() + 60_000))).toBe(false);
    });

    test('null / undefined → true (nincs ervenyes datum)', () => {
        expect(ev.isExpired(null)).toBe(true);
        expect(ev.isExpired(undefined)).toBe(true);
    });

    test('ervenytelen datum-string → true', () => {
        expect(ev.isExpired('not-a-date')).toBe(true);
    });

    test('ISO-string formatum tamogatott', () => {
        expect(ev.isExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false);
    });
});

describe('TTL konstansok', () => {
    test('TOKEN_TTL_MS pozitiv (24 ora)', () => {
        expect(ev.TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000);
    });

    test('PASSWORD_RESET_TOKEN_TTL_MS pozitiv (1 ora)', () => {
        expect(ev.PASSWORD_RESET_TOKEN_TTL_MS).toBe(60 * 60 * 1000);
    });
});
