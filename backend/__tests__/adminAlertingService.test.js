/**
 * api/admin/alertingService.js — alerting tesztek.
 */

jest.mock('../sql/adminRepo.js', () => ({
    insertAlertEntry: jest.fn(() => Promise.resolve({ insertId: 42 })),
    countFailedAdminAttemptsByIp: jest.fn(() => Promise.resolve(0)),
    upsertRateEscalation: jest.fn(() => Promise.resolve())
}));

const adminRepo = require('../sql/adminRepo.js');
const alertingService = require('../api/admin/alertingService.js');

beforeEach(() => {
    jest.clearAllMocks();
    adminRepo.insertAlertEntry.mockResolvedValue({ insertId: 42 });
    adminRepo.countFailedAdminAttemptsByIp.mockResolvedValue(0);
});

describe('recordUnauthorized', () => {
    test('insert + nem-eszkalalva ha kevesebb mint 5 fail', async () => {
        const r = await alertingService.recordUnauthorized({
            ipAddress: '1.2.3.4',
            userAgent: 'jest',
            endpoint: '/api/admin/x',
            reason: 'no_token'
        });
        expect(adminRepo.insertAlertEntry).toHaveBeenCalled();
        expect(adminRepo.upsertRateEscalation).not.toHaveBeenCalled();
    });

    test('eszkalalas: 5+ fail ugyanarrol az IP-rol', async () => {
        adminRepo.countFailedAdminAttemptsByIp.mockResolvedValueOnce(5);
        await alertingService.recordUnauthorized({
            ipAddress: '1.2.3.4',
            endpoint: '/api/admin/x',
            reason: 'no_token'
        });
        expect(adminRepo.upsertRateEscalation).toHaveBeenCalled();
    });

    test('NEM eszkalal "ismeretlen" IP-re', async () => {
        adminRepo.countFailedAdminAttemptsByIp.mockResolvedValueOnce(99);
        await alertingService.recordUnauthorized({
            ipAddress: 'ismeretlen',
            endpoint: '/api/admin/x'
        });
        expect(adminRepo.countFailedAdminAttemptsByIp).not.toHaveBeenCalled();
        expect(adminRepo.upsertRateEscalation).not.toHaveBeenCalled();
    });

    test('DB-hiba NEM rethrow-ol (a fo flow nem szakad)', async () => {
        adminRepo.insertAlertEntry.mockRejectedValueOnce(new Error('DB le'));
        await expect(alertingService.recordUnauthorized({
            ipAddress: '1.2.3.4',
            endpoint: '/api/admin/x'
        })).resolves.toBeDefined();
    });
});

describe('recordTokenInvalid', () => {
    test('insertAlertEntry hivva token_invalid kind-del', async () => {
        await alertingService.recordTokenInvalid({
            ipAddress: '1.2.3.4',
            endpoint: '/api/admin/x'
        });
        const args = adminRepo.insertAlertEntry.mock.calls[0][0];
        expect(args.kind).toBe('token_invalid');
        expect(args.severity).toBe('warning');
    });
});

describe('recordSuspiciousPattern', () => {
    test('severity = critical', async () => {
        await alertingService.recordSuspiciousPattern({
            ipAddress: '1.2.3.4',
            endpoint: '/api/admin/x',
            detail: { pattern: 'token_brute_force' }
        });
        const args = adminRepo.insertAlertEntry.mock.calls[0][0];
        expect(args.severity).toBe('critical');
        expect(args.kind).toBe('suspicious_pattern');
    });

    test('detail mezo atadva', async () => {
        await alertingService.recordSuspiciousPattern({
            ipAddress: '1.2.3.4',
            endpoint: '/x',
            detail: { foo: 'bar' }
        });
        const args = adminRepo.insertAlertEntry.mock.calls[0][0];
        expect(args.detail).toEqual({ foo: 'bar' });
    });
});

describe('recordAdminAction', () => {
    test('default severity = warning', async () => {
        await alertingService.recordAdminAction({
            kind: 'user_banned',
            userId: 7,
            ipAddress: '1.2.3.4',
            endpoint: '/api/admin/users/7/ban'
        });
        const args = adminRepo.insertAlertEntry.mock.calls[0][0];
        expect(args.severity).toBe('warning');
        expect(args.kind).toBe('user_banned');
        expect(args.userId).toBe(7);
    });

    test('explicit severity override', async () => {
        await alertingService.recordAdminAction({
            kind: 'user_deleted',
            severity: 'critical',
            userId: 7
        });
        const args = adminRepo.insertAlertEntry.mock.calls[0][0];
        expect(args.severity).toBe('critical');
    });
});

describe('bindSocketHub — broadcast integration', () => {
    test('hub-tal broadcast hivasok', async () => {
        const hub = { broadcastAdmin: jest.fn() };
        alertingService.bindSocketHub(hub);
        await alertingService.recordTokenInvalid({ ipAddress: '1.2.3.4', endpoint: '/x' });
        expect(hub.broadcastAdmin).toHaveBeenCalledWith('admin:alert:token_invalid', expect.any(Object));
    });

    test('hub nelkul broadcast nem dob', async () => {
        alertingService.bindSocketHub(null);
        await expect(alertingService.recordTokenInvalid({ ipAddress: '1.2.3.4', endpoint: '/x' })).resolves.toBeDefined();
    });

    test('broadcastAdmin hibat dob → silent (warn console)', async () => {
        const hub = { broadcastAdmin: jest.fn(() => { throw new Error('hub down'); }) };
        alertingService.bindSocketHub(hub);
        await expect(alertingService.recordTokenInvalid({ ipAddress: '1.2.3.4', endpoint: '/x' })).resolves.toBeDefined();
    });
});
