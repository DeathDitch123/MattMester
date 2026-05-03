/**
 * api/admin/constants.js — admin panel konstansok integritasa.
 */

const C = require('../api/admin/constants.js');

describe('admin/constants', () => {
    test('TTL+TOKEN konstansok pozitiv', () => {
        expect(C.ADMIN_TOKEN_TTL_MS).toBeGreaterThan(0);
        expect(C.ADMIN_TOKEN_RAW_BYTES).toBeGreaterThan(0);
        expect(C.ADMIN_TOKEN_TTL_MS).toBe(15 * 60 * 1000);
        expect(C.ADMIN_TOKEN_RAW_BYTES).toBe(32);
    });

    test('REASON hosszak: min<=max', () => {
        expect(C.REASON_MIN_LENGTH_NORMAL).toBeLessThanOrEqual(C.REASON_MAX_LENGTH);
        expect(C.REASON_MIN_LENGTH_CRITICAL).toBeLessThanOrEqual(C.REASON_MAX_LENGTH);
        expect(C.REASON_MAX_LENGTH).toBeGreaterThan(0);
    });

    test('AUDIT_RETENTION_DAYS = 18 honap (540 nap)', () => {
        expect(C.AUDIT_RETENTION_DAYS).toBe(18 * 30);
    });

    test('REDACTED_FIELDS frozen + tartalmazza a kritikus mezoket', () => {
        expect(Object.isFrozen(C.REDACTED_FIELDS)).toBe(true);
        expect(C.REDACTED_FIELDS.has('password')).toBe(true);
        expect(C.REDACTED_FIELDS.has('password_hash')).toBe(true);
        expect(C.REDACTED_FIELDS.has('reset_password_token')).toBe(true);
    });

    test('ADMIN_PERMISSIONS frozen', () => {
        expect(Object.isFrozen(C.ADMIN_PERMISSIONS)).toBe(true);
    });

    test('SUPER_ONLY: ADMIN_GRANT/REVOKE/LIST', () => {
        expect(C.SUPER_ONLY_PERMISSIONS.has(C.ADMIN_PERMISSIONS.ADMIN_GRANT)).toBe(true);
        expect(C.SUPER_ONLY_PERMISSIONS.has(C.ADMIN_PERMISSIONS.ADMIN_REVOKE)).toBe(true);
        expect(C.SUPER_ONLY_PERMISSIONS.has(C.ADMIN_PERMISSIONS.ADMIN_LIST)).toBe(true);
    });

    test('CRITICAL_ACTIONS: USERS_DELETE igen, USERS_BAN NEM', () => {
        expect(C.CRITICAL_ACTIONS.has(C.ADMIN_PERMISSIONS.USERS_DELETE)).toBe(true);
        expect(C.CRITICAL_ACTIONS.has(C.ADMIN_PERMISSIONS.USERS_BAN)).toBe(false);
    });

    test('OPTIONAL_REASON: USERS_DELETE benne van (password helyettesiti)', () => {
        expect(C.OPTIONAL_REASON_ACTIONS.has(C.ADMIN_PERMISSIONS.USERS_DELETE)).toBe(true);
    });

    test('ADMIN_ERROR_CODES frozen + minden kulcs ADMIN_ prefix-szel', () => {
        expect(Object.isFrozen(C.ADMIN_ERROR_CODES)).toBe(true);
        for (const k in C.ADMIN_ERROR_CODES) {
            expect(C.ADMIN_ERROR_CODES[k]).toMatch(/^ADMIN_/);
        }
    });

    test('REASON_TOO_SHORT es REASON_TOO_LONG kulonbozo (N3 fix)', () => {
        expect(C.ADMIN_ERROR_CODES.REASON_TOO_SHORT).not.toBe(C.ADMIN_ERROR_CODES.REASON_TOO_LONG);
    });

    test('UI timing konstansok pozitiv', () => {
        expect(C.ADMIN_UI_TOKEN_TICK_INTERVAL_MS).toBeGreaterThan(0);
        expect(C.ADMIN_UI_TOKEN_REFRESH_THRESHOLD_SEC).toBeGreaterThan(0);
        expect(C.ADMIN_UI_FOCUS_RESTORE_DELAY_MS).toBeGreaterThan(0);
        expect(C.ADMIN_UI_ERROR_TOAST_DURATION_MS).toBeGreaterThan(0);
    });

    test('SCHEDULER timing konstansok pozitiv', () => {
        expect(C.ADMIN_SCHEDULER_STARTUP_DELAY_MS).toBeGreaterThan(0);
        expect(C.ADMIN_SCHEDULER_RETENTION_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
    });

    test('REPLAY konstansok ervenyes erteket', () => {
        expect(C.REPLAY_BATCH_MAX_SIZE).toBeGreaterThan(0);
        expect(C.REPLAY_MAX_BATCHES_PER_CONNECTION).toBeGreaterThan(0);
        expect(C.REPLAY_WINDOW_HOURS).toBeGreaterThan(0);
    });

    test('rate-escalation konstansok mind pozitiv', () => {
        expect(C.RATE_ESCALATION_DEFAULT_MULTIPLIER).toBeGreaterThan(1);
        expect(C.RATE_ESCALATION_DEFAULT_TTL_SEC).toBeGreaterThan(0);
        expect(C.RATE_ESCALATION_TRIGGER_FAILURE_COUNT).toBeGreaterThan(0);
        expect(C.RATE_ESCALATION_TRIGGER_WINDOW_SEC).toBeGreaterThan(0);
    });

    test('ADMIN_PERMISSIONS — minden kulcs string ertekkel', () => {
        for (const k in C.ADMIN_PERMISSIONS) {
            expect(typeof C.ADMIN_PERMISSIONS[k]).toBe('string');
            expect(C.ADMIN_PERMISSIONS[k].length).toBeGreaterThan(0);
        }
    });

    test('ADMIN_PERMISSIONS — egyedi ertekek (nincs duplikat)', () => {
        const values = Object.values(C.ADMIN_PERMISSIONS);
        expect(new Set(values).size).toBe(values.length);
    });
});
