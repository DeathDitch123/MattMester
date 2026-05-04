/**
 * AuditLogService unit tesztek - redaction, diff (normal vs critical).
 * ADMIN_PANEL.md F3 + §10.1.
 */

jest.mock('../sql/database.js', () => ({
    getPool: () => ({ execute: jest.fn(), query: jest.fn() })
}));

jest.mock('../sql/adminRepo.js', () => ({
    insertAuditEntry: jest.fn(() => Promise.resolve({ insertId: 1 }))
}));

const { redactObject, buildDiff } = require('../api/admin/auditService.js');

describe('redactObject', () => {
    test('felso szintu password_hash kihagyasa', () => {
        const result = redactObject({ id: 1, username: 'a', password_hash: 'secret' });
        expect(result).toEqual({ id: 1, username: 'a' });
        expect(result.password_hash).toBeUndefined();
    });

    test('mely strukturaban is kihagyja a tiltott mezoket', () => {
        const result = redactObject({
            user: { id: 1, password_hash: 'secret', email: 'a@b.c' },
            meta: { reset_password_token: 'x', other: 'ok' }
        });
        expect(result.user.password_hash).toBeUndefined();
        expect(result.user.email).toBe('a@b.c');
        expect(result.meta.reset_password_token).toBeUndefined();
        expect(result.meta.other).toBe('ok');
    });

    test('email_verification_token_hash es reset_token_expires is rejtett', () => {
        const result = redactObject({
            email_verification_token_hash: 'x',
            email_verification_token_expires: '2030-01-01',
            reset_password_token: 'y',
            reset_token_expires: '2030-02-01',
            keep_me: true
        });
        expect(Object.keys(result)).toEqual(['keep_me']);
    });

    test('null bemenet null-t ad vissza', () => {
        expect(redactObject(null)).toBeNull();
    });
});

describe('buildDiff', () => {
    test('normal muvelet: csak valtozott mezok', () => {
        const before = { is_banned: false, role: 'player', username: 'x' };
        const after = { is_banned: true, role: 'player', username: 'x' };
        const result = buildDiff(before, after, 'users.unban');
        expect(result.before).toEqual({ is_banned: false });
        expect(result.after).toEqual({ is_banned: true });
        expect(result.before.username).toBeUndefined();
    });

    test('kritikus muvelet: teljes snapshot', () => {
        const before = { id: 1, username: 'x', role: 'player', is_banned: false };
        const after = { id: 1, username: 'x', role: 'admin', is_banned: false };
        const result = buildDiff(before, after, 'admin.grant');
        expect(result.before).toEqual(before);
        expect(result.after).toEqual(after);
    });

    test('redaction critical eseten is mukodik', () => {
        const before = { id: 1, password_hash: 'a', is_banned: false };
        const after = { id: 1, password_hash: 'b', is_banned: true };
        const result = buildDiff(before, after, 'users.ban');
        expect(result.before.password_hash).toBeUndefined();
        expect(result.after.password_hash).toBeUndefined();
        expect(result.before.is_banned).toBe(false);
        expect(result.after.is_banned).toBe(true);
    });

    test('nincs valtozas eseten before/after null', () => {
        const obj = { id: 1, role: 'player' };
        const result = buildDiff(obj, obj, 'users.view');
        expect(result.before).toBeNull();
        expect(result.after).toBeNull();
    });
});
