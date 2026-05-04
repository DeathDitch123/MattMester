/**
 * sql/modules/_shared.js — kozos helper-ek tesztjei.
 */

const { ALLOWED_NOTIFICATION_TARGET_ROLES, normalizePositiveInt, normalizeListLimit } = require('../sql/modules/_shared.js');

describe('ALLOWED_NOTIFICATION_TARGET_ROLES', () => {
    test('Set, tartalmaz player es admin szerepet', () => {
        expect(ALLOWED_NOTIFICATION_TARGET_ROLES instanceof Set).toBe(true);
        expect(ALLOWED_NOTIFICATION_TARGET_ROLES.has('player')).toBe(true);
        expect(ALLOWED_NOTIFICATION_TARGET_ROLES.has('admin')).toBe(true);
    });

    test('NEM tartalmaz invalid szerepet', () => {
        expect(ALLOWED_NOTIFICATION_TARGET_ROLES.has('superadmin')).toBe(false);
        expect(ALLOWED_NOTIFICATION_TARGET_ROLES.has('')).toBe(false);
        expect(ALLOWED_NOTIFICATION_TARGET_ROLES.has(null)).toBe(false);
    });
});

describe('normalizePositiveInt', () => {
    test('valid number', () => {
        expect(normalizePositiveInt(5)).toBe(5);
    });

    test('string-szam parse-elve', () => {
        expect(normalizePositiveInt('42')).toBe(42);
    });

    test('0 → fallback', () => {
        expect(normalizePositiveInt(0)).toBe(0);
        expect(normalizePositiveInt(0, 99)).toBe(99);
    });

    test('negativ → fallback', () => {
        expect(normalizePositiveInt(-1, 10)).toBe(10);
    });

    test('null/undefined → fallback', () => {
        expect(normalizePositiveInt(null, 5)).toBe(5);
        expect(normalizePositiveInt(undefined, 5)).toBe(5);
    });

    test('float → fallback (csak integer)', () => {
        expect(normalizePositiveInt(1.5, 99)).toBe(99);
    });

    test('NaN → fallback', () => {
        expect(normalizePositiveInt('abc', 99)).toBe(99);
    });

    test('default fallback = 0', () => {
        expect(normalizePositiveInt('abc')).toBe(0);
    });
});

describe('normalizeListLimit', () => {
    test('range-on-belul → ervenyes', () => {
        expect(normalizeListLimit(20, 30, 50)).toBe(20);
    });

    test('felulrol clamp → max', () => {
        expect(normalizeListLimit(999, 30, 50)).toBe(50);
    });

    test('alulrol clamp → 1', () => {
        expect(normalizeListLimit(0, 30, 50)).toBe(30); // 0 → fallback 30 → 1..50 clamp
        expect(normalizeListLimit(-5, 30, 50)).toBe(30);
    });

    test('default max = 50', () => {
        expect(normalizeListLimit(1000)).toBe(50);
    });

    test('default fallback = 20', () => {
        expect(normalizeListLimit('abc')).toBe(20);
    });

    test('1 a min', () => {
        expect(normalizeListLimit(1)).toBe(1);
    });
});
