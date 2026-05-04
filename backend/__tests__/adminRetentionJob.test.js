/**
 * api/admin/retentionJob.js — audit retention scheduler.
 */

jest.mock('../sql/adminRepo.js', () => ({
    deleteAuditEntriesOlderThan: jest.fn(() => Promise.resolve(0)),
    deleteAlertsOlderThan: jest.fn(() => Promise.resolve(0)),
    deleteExpiredAdminTokens: jest.fn(() => Promise.resolve(0)),
    deleteExpiredRateEscalations: jest.fn(() => Promise.resolve(0))
}));

jest.mock('../api/admin/auditService.js', () => ({
    recordAuditEntry: jest.fn(() => Promise.resolve())
}));

const adminRepo = require('../sql/adminRepo.js');
const auditService = require('../api/admin/auditService.js');
const job = require('../api/admin/retentionJob.js');

beforeEach(() => {
    jest.clearAllMocks();
});

afterAll(() => {
    job.stopRetentionScheduler();
});

describe('runRetentionOnce', () => {
    test('mind a 4 cleanup hivva', async () => {
        adminRepo.deleteAuditEntriesOlderThan.mockResolvedValueOnce(10);
        adminRepo.deleteAlertsOlderThan.mockResolvedValueOnce(5);
        adminRepo.deleteExpiredAdminTokens.mockResolvedValueOnce(3);
        adminRepo.deleteExpiredRateEscalations.mockResolvedValueOnce(1);

        const r = await job.runRetentionOnce();
        expect(r.deletedAuditRows).toBe(10);
        expect(r.deletedAlertRows).toBe(5);
        expect(r.deletedTokenRows).toBe(3);
        expect(r.deletedEscalationRows).toBe(1);
    });

    test('audit-entry recordoldva a futasrol', async () => {
        await job.runRetentionOnce();
        expect(auditService.recordAuditEntry).toHaveBeenCalledWith(expect.objectContaining({
            action: 'audit.retention.run',
            actorUsername: 'system'
        }));
    });

    test('cutoff datum ~ 18 honap a multban', async () => {
        await job.runRetentionOnce();
        const cutoffArg = adminRepo.deleteAuditEntriesOlderThan.mock.calls[0][0];
        expect(cutoffArg).toBeInstanceOf(Date);
        const ageDays = (Date.now() - cutoffArg.getTime()) / (24 * 60 * 60 * 1000);
        expect(ageDays).toBeGreaterThan(530); // ~18 honap
        expect(ageDays).toBeLessThan(550);
    });

    test('SQL hiba → silent (nem dob)', async () => {
        adminRepo.deleteAuditEntriesOlderThan.mockRejectedValueOnce(new Error('le'));
        await expect(job.runRetentionOnce()).resolves.toBeDefined();
    });
});
