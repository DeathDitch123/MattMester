/**
 * api/admin/softDeletePurgeJob.js — soft-delete grace lejarat utan hard-delete.
 */

jest.mock('../sql/sql_functions.js', () => ({
    listExpiredSoftDeletedUserIds: jest.fn(() => Promise.resolve([])),
    deleteUserProfileWithTransaction: jest.fn()
}));

jest.mock('../api/admin/auditService.js', () => ({
    recordAuditEntry: jest.fn(() => Promise.resolve())
}));

const sql = require('../sql/sql_functions.js');
const auditService = require('../api/admin/auditService.js');
const job = require('../api/admin/softDeletePurgeJob.js');

beforeEach(() => {
    jest.clearAllMocks();
});

afterAll(() => {
    job.stopSoftDeletePurgeScheduler();
});

describe('runPurgeOnce', () => {
    test('nincs lejart user → candidates:0, purged:0', async () => {
        sql.listExpiredSoftDeletedUserIds.mockResolvedValueOnce([]);
        const r = await job.runPurgeOnce();
        expect(r.candidates).toBe(0);
        expect(r.purged).toBe(0);
        expect(auditService.recordAuditEntry).not.toHaveBeenCalled();
    });

    test('1 lejart + sikeres hard-delete → purged:1', async () => {
        sql.listExpiredSoftDeletedUserIds.mockResolvedValueOnce([7]);
        sql.deleteUserProfileWithTransaction.mockResolvedValueOnce({ deleted: true, userId: 7 });
        const r = await job.runPurgeOnce();
        expect(r.candidates).toBe(1);
        expect(r.purged).toBe(1);
        expect(r.failed).toBe(0);
        expect(r.userIds).toContain(7);
    });

    test('hibas hard-delete → failed:1, purged:0', async () => {
        sql.listExpiredSoftDeletedUserIds.mockResolvedValueOnce([7]);
        sql.deleteUserProfileWithTransaction.mockRejectedValueOnce(new Error('FK constraint'));
        const r = await job.runPurgeOnce();
        expect(r.candidates).toBe(1);
        expect(r.purged).toBe(0);
        expect(r.failed).toBe(1);
    });

    test('vegyes batch (3 user, 2 ok 1 fail)', async () => {
        sql.listExpiredSoftDeletedUserIds.mockResolvedValueOnce([1, 2, 3]);
        sql.deleteUserProfileWithTransaction
            .mockResolvedValueOnce({ deleted: true, userId: 1 })
            .mockRejectedValueOnce(new Error('le'))
            .mockResolvedValueOnce({ deleted: true, userId: 3 });
        const r = await job.runPurgeOnce();
        expect(r.candidates).toBe(3);
        expect(r.purged).toBe(2);
        expect(r.failed).toBe(1);
    });

    test('candidates > 0 → auditService.recordAuditEntry hivva', async () => {
        sql.listExpiredSoftDeletedUserIds.mockResolvedValueOnce([7]);
        sql.deleteUserProfileWithTransaction.mockResolvedValueOnce({ deleted: true, userId: 7 });
        await job.runPurgeOnce();
        expect(auditService.recordAuditEntry).toHaveBeenCalled();
    });

    test('audit-log hiba NEM dob (silent)', async () => {
        sql.listExpiredSoftDeletedUserIds.mockResolvedValueOnce([7]);
        sql.deleteUserProfileWithTransaction.mockResolvedValueOnce({ deleted: true, userId: 7 });
        auditService.recordAuditEntry.mockRejectedValueOnce(new Error('audit hiba'));
        await expect(job.runPurgeOnce()).resolves.toBeDefined();
    });

    test('SQL list hiba → silent', async () => {
        sql.listExpiredSoftDeletedUserIds.mockRejectedValueOnce(new Error('le'));
        const r = await job.runPurgeOnce();
        expect(r).toBeDefined();
    });
});
