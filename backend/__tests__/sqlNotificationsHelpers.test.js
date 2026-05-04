/**
 * sql/modules/notifications.js — normalizeNotificationInput helper tesztek.
 */

jest.mock('../sql/database.js', () => ({
    getPool: jest.fn()
}));

const notifications = require('../sql/modules/notifications.js');
const { normalizeNotificationInput, ALLOWED_NOTIFICATION_AUDIENCES, ALLOWED_NOTIFICATION_SEVERITIES } = notifications;

describe('ALLOWED_NOTIFICATION_AUDIENCES', () => {
    test('Set 5 audience-zal', () => {
        expect(ALLOWED_NOTIFICATION_AUDIENCES.has('user')).toBe(true);
        expect(ALLOWED_NOTIFICATION_AUDIENCES.has('multi')).toBe(true);
        expect(ALLOWED_NOTIFICATION_AUDIENCES.has('global')).toBe(true);
        expect(ALLOWED_NOTIFICATION_AUDIENCES.has('role')).toBe(true);
        expect(ALLOWED_NOTIFICATION_AUDIENCES.has('system')).toBe(true);
    });

    test('NEM tartalmaz invalid audience-t', () => {
        expect(ALLOWED_NOTIFICATION_AUDIENCES.has('admin-only')).toBe(false);
        expect(ALLOWED_NOTIFICATION_AUDIENCES.has('')).toBe(false);
    });
});

describe('ALLOWED_NOTIFICATION_SEVERITIES', () => {
    test('Set 4 severity-vel', () => {
        for (const s of ['info', 'success', 'warning', 'error']) {
            expect(ALLOWED_NOTIFICATION_SEVERITIES.has(s)).toBe(true);
        }
    });

    test('NEM tartalmaz "critical"-t (csak admin alert)', () => {
        expect(ALLOWED_NOTIFICATION_SEVERITIES.has('critical')).toBe(false);
    });
});

describe('normalizeNotificationInput', () => {
    test('teljes input → mind a mezo elerheto', () => {
        const r = normalizeNotificationInput({
            type: 'friend_request',
            audience: 'user',
            severity: 'info',
            targetUserId: 7,
            senderUserId: 3,
            title: 'foo',
            message: 'bar'
        });
        expect(r.type).toBe('friend_request');
        expect(r.audience).toBe('user');
        expect(r.severity).toBe('info');
        expect(r.targetUserId).toBe(7);
        expect(r.senderUserId).toBe(3);
    });

    test('invalid audience → "user" default', () => {
        const r = normalizeNotificationInput({ audience: 'unknown' });
        expect(r.audience).toBe('user');
    });

    test('invalid severity → "info" default', () => {
        const r = normalizeNotificationInput({ severity: 'critical' });
        expect(r.severity).toBe('info');
    });

    test('targetUserId = 0 → null', () => {
        const r = normalizeNotificationInput({ targetUserId: 0 });
        expect(r.targetUserId).toBeNull();
    });

    test('title trim + max 160 char', () => {
        const r = normalizeNotificationInput({ title: '  ' + 'x'.repeat(200) + '  ' });
        expect(r.title.length).toBe(160);
    });

    test('message max 500 char', () => {
        const r = normalizeNotificationInput({ message: 'y'.repeat(1000) });
        expect(r.message.length).toBe(500);
    });

    test('payload object → payloadJson string', () => {
        const r = normalizeNotificationInput({ payload: { foo: 'bar', n: 42 } });
        expect(typeof r.payloadJson).toBe('string');
        expect(JSON.parse(r.payloadJson)).toEqual({ foo: 'bar', n: 42 });
    });

    test('payload nem-object → payloadJson null', () => {
        const r = normalizeNotificationInput({ payload: 'string' });
        expect(r.payloadJson).toBeNull();
    });

    test('cycle reference payload → null (silent)', () => {
        const cyclic = {};
        cyclic.self = cyclic;
        const r = normalizeNotificationInput({ payload: cyclic });
        expect(r.payloadJson).toBeNull();
    });

    test('null/undefined input → defaults', () => {
        const r = normalizeNotificationInput(null);
        expect(r.audience).toBe('user');
        expect(r.severity).toBe('info');
        expect(r.title).toBe('');
    });

    test('targetRole nem-allowed → null', () => {
        const r = normalizeNotificationInput({ targetRole: 'superadmin' });
        expect(r.targetRole).toBeNull();
    });

    test('targetRole ervenyes ("admin") → atengedi', () => {
        const r = normalizeNotificationInput({ targetRole: 'admin' });
        expect(r.targetRole).toBe('admin');
    });

    test('type max 64 char', () => {
        const r = normalizeNotificationInput({ type: 'a'.repeat(100) });
        expect(r.type.length).toBe(64);
    });
});
