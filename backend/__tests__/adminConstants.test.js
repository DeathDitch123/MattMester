/**
 * api/admin/constants.js — frozen-guard + invariáns ellenőrzések.
 *
 * NEM tesztelünk konkrét értékeket (TTL_MS == 15 * 60 * 1000) — az
 * tautológia a forrással szemben. Csak azt validáljuk, ami logikai hiba lenne:
 *   - REDACTED / PERMISSIONS / ERROR_CODES Object.freeze (kliens nem tudja módosítani)
 *   - REASON_TOO_SHORT és REASON_TOO_LONG különbözők (N3 fix garanciája)
 *   - ADMIN_PERMISSIONS értékek egyediek (nincs duplikát)
 *   - REDACTED_FIELDS tartalmazza a kritikus secret-mezőket
 */

const C = require('../api/admin/constants.js');

describe('admin/constants — Object.freeze guard-ok', () => {
    test('REDACTED_FIELDS frozen', () => {
        expect(Object.isFrozen(C.REDACTED_FIELDS)).toBe(true);
    });

    test('ADMIN_PERMISSIONS frozen', () => {
        expect(Object.isFrozen(C.ADMIN_PERMISSIONS)).toBe(true);
    });

    test('ADMIN_ERROR_CODES frozen', () => {
        expect(Object.isFrozen(C.ADMIN_ERROR_CODES)).toBe(true);
    });
});

describe('admin/constants — invariánsok', () => {
    test('REDACTED tartalmazza a 6 kritikus secret-mezőt', () => {
        for (const f of ['password', 'password_hash', 'email_verification_token_hash',
                         'email_verification_token_expires', 'reset_password_token', 'reset_token_expires']) {
            expect(C.REDACTED_FIELDS.has(f)).toBe(true);
        }
    });

    test('REASON_TOO_SHORT és REASON_TOO_LONG különböző kódok (N3 regression guard)', () => {
        expect(C.ADMIN_ERROR_CODES.REASON_TOO_SHORT).not.toBe(C.ADMIN_ERROR_CODES.REASON_TOO_LONG);
    });

    test('ADMIN_PERMISSIONS értékek egyediek (nincs duplikát kulcs-érték közt)', () => {
        const values = Object.values(C.ADMIN_PERMISSIONS);
        expect(new Set(values).size).toBe(values.length);
    });

    test('SUPER_ONLY_PERMISSIONS részhalmaza az ADMIN_PERMISSIONS-nek', () => {
        const allValues = new Set(Object.values(C.ADMIN_PERMISSIONS));
        for (const v of C.SUPER_ONLY_PERMISSIONS) {
            expect(allValues.has(v)).toBe(true);
        }
    });

    test('CRITICAL_ACTIONS részhalmaza az ADMIN_PERMISSIONS-nek', () => {
        const allValues = new Set(Object.values(C.ADMIN_PERMISSIONS));
        for (const v of C.CRITICAL_ACTIONS) {
            expect(allValues.has(v)).toBe(true);
        }
    });

    test('REASON_MIN <= REASON_MAX (különben senki sem tudna indokolni)', () => {
        expect(C.REASON_MIN_LENGTH_NORMAL).toBeLessThanOrEqual(C.REASON_MAX_LENGTH);
        expect(C.REASON_MIN_LENGTH_CRITICAL).toBeLessThanOrEqual(C.REASON_MAX_LENGTH);
    });
});
