/**
 * api/admin/auditService.js — extended tests on redactObject + buildDiff.
 */

jest.mock('../sql/adminRepo.js', () => ({
    insertAuditEntry: jest.fn(() => Promise.resolve({ insertId: 99 }))
}));

const { redactObject, buildDiff } = require('../api/admin/auditService.js');
const { ADMIN_PERMISSIONS } = require('../api/admin/constants.js');

describe('redactObject — sensitive field stripping', () => {
    test('password / password_hash levonva', () => {
        const r = redactObject({ id: 1, password: 'secret', password_hash: 'h' });
        expect(r.id).toBe(1);
        expect(r.password).toBeUndefined();
        expect(r.password_hash).toBeUndefined();
    });

    test('email_verification_token_hash levonva', () => {
        const r = redactObject({ id: 1, email_verification_token_hash: 'h' });
        expect(r.email_verification_token_hash).toBeUndefined();
    });

    test('reset_password_token + reset_token_expires levonva', () => {
        const r = redactObject({ reset_password_token: 'h', reset_token_expires: '2025' });
        expect(r.reset_password_token).toBeUndefined();
        expect(r.reset_token_expires).toBeUndefined();
    });

    test('mely struktura: nested object-okben is redact', () => {
        const r = redactObject({ user: { id: 1, password: 'secret' } });
        expect(r.user.id).toBe(1);
        expect(r.user.password).toBeUndefined();
    });

    test('null / undefined input → null', () => {
        expect(redactObject(null)).toBeNull();
        expect(redactObject(undefined)).toBeNull();
    });

    test('array input — minden elem redactolva', () => {
        const r = redactObject([{ password: 'a' }, { password: 'b', id: 1 }]);
        expect(r).toHaveLength(2);
        expect(r[0].password).toBeUndefined();
        expect(r[1].id).toBe(1);
    });

    test('primitiv input visszater valtozatlanul', () => {
        expect(redactObject('string')).toBe('string');
        expect(redactObject(42)).toBe(42);
        expect(redactObject(true)).toBe(true);
    });
});

describe('buildDiff — change detection', () => {
    test('NEM-kritikus akcio: csak a valtozott mezok diff-elve', () => {
        const before = { username: 'old', email: 'a@b.c', is_banned: false };
        const after = { username: 'new', email: 'a@b.c', is_banned: false };
        const r = buildDiff(before, after, ADMIN_PERMISSIONS.USERS_EDIT_PROFILE);
        expect(r.before).toEqual({ username: 'old' });
        expect(r.after).toEqual({ username: 'new' });
    });

    test('NEM-kritikus akcio: nincs valtozas → before/after both null', () => {
        const same = { x: 1 };
        const r = buildDiff(same, same, ADMIN_PERMISSIONS.USERS_EDIT_PROFILE);
        expect(r.before).toBeNull();
        expect(r.after).toBeNull();
    });

    test('KRITIKUS akcio: teljes snapshot (nem diff)', () => {
        const before = { username: 'old' };
        const after = { username: 'new' };
        const r = buildDiff(before, after, ADMIN_PERMISSIONS.USERS_DELETE);
        // Critical akcionak teljes snapshot kell — nem csak a diff
        expect(r.before).toEqual({ username: 'old' });
        expect(r.after).toEqual({ username: 'new' });
    });

    test('redact mind a before mind az after-ben', () => {
        const before = { id: 1, password: 'x' };
        const after = { id: 1, password: 'y' };
        const r = buildDiff(before, after, ADMIN_PERMISSIONS.USERS_EDIT_PROFILE);
        // password mindenkeppen levonva
        expect(r.before?.password).toBeUndefined();
        expect(r.after?.password).toBeUndefined();
    });

    test('null before / null after → atengedi (nem dobja, nem diff-eli)', () => {
        const r = buildDiff(null, { x: 1 }, 'foo');
        expect(r.before).toBeNull();
        expect(r.after).toEqual({ x: 1 });
    });

    test('uj kulcsot is felfedez (added field)', () => {
        const before = { x: 1 };
        const after = { x: 1, y: 2 };
        const r = buildDiff(before, after, 'users.edit');
        expect(r.before).toEqual({ y: null });
        expect(r.after).toEqual({ y: 2 });
    });

    test('eltavolitott kulcsot felfedez (removed field)', () => {
        const before = { x: 1, y: 2 };
        const after = { x: 1 };
        const r = buildDiff(before, after, 'users.edit');
        expect(r.before).toEqual({ y: 2 });
        expect(r.after).toEqual({ y: null });
    });
});
