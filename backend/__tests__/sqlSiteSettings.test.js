/**
 * sql/modules/siteSettings.js — site-wide beallitasok cache + DB-load.
 */

jest.mock('../sql/database.js', () => ({
    getPool: jest.fn()
}));

const dbMock = require('../sql/database.js');
const ss = require('../sql/modules/siteSettings.js');

let executeMock;
beforeEach(() => {
    executeMock = jest.fn();
    dbMock.getPool.mockReturnValue({ execute: executeMock });
    ss.invalidateCache();
});

describe('siteSettings', () => {
    test('default beallitasok ha pool null', async () => {
        dbMock.getPool.mockReturnValueOnce(null);
        const r = await ss.getSettings();
        expect(r.siteName).toBe('MattMester');
        expect(r.maintenanceMode).toBe(false);
        expect(r.registrationEnabled).toBe(true);
    });

    test('DB-load row → normalizalva', async () => {
        executeMock.mockResolvedValueOnce([[{
            site_name: 'TestMester',
            support_email: 'x@y.com',
            default_language: 'hu',
            timezone: 'Europe/Budapest',
            registration_enabled: 0,
            maintenance_mode: 1,
            updated_at: null,
            updated_by: 7
        }]]);
        const r = await ss.getSettings();
        expect(r.siteName).toBe('TestMester');
        expect(r.maintenanceMode).toBe(true); // 1 → true
        expect(r.registrationEnabled).toBe(false); // 0 → false
    });

    test('ures DB → defaultSettings', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const r = await ss.getSettings();
        expect(r.siteName).toBe('MattMester');
    });

    test('DB hiba → fallback default', async () => {
        executeMock.mockRejectedValueOnce(new Error('DB le'));
        const r = await ss.getSettings();
        expect(r.siteName).toBe('MattMester');
    });

    test('getSettingsCachedSync alap: nincs cache → default', () => {
        const r = ss.getSettingsCachedSync();
        expect(r.siteName).toBe('MattMester');
        expect(r.maintenanceMode).toBe(false);
    });

    test('cache TTL — masodszori getSettings DB nelkul', async () => {
        executeMock.mockResolvedValueOnce([[{
            site_name: 'A', support_email: 'x', default_language: 'hu',
            timezone: 'tz', registration_enabled: 1, maintenance_mode: 0,
            updated_at: null, updated_by: null
        }]]);
        await ss.getSettings();
        const callsBefore = executeMock.mock.calls.length;
        await ss.getSettings(); // cache hit
        const callsAfter = executeMock.mock.calls.length;
        expect(callsAfter).toBe(callsBefore);
    });

    test('invalidateCache → kovetkezo getSettings DB-t hiv', async () => {
        executeMock.mockResolvedValue([[{
            site_name: 'X', support_email: 'x', default_language: 'hu',
            timezone: 'tz', registration_enabled: 1, maintenance_mode: 0,
            updated_at: null, updated_by: null
        }]]);
        await ss.getSettings();
        const callsBefore = executeMock.mock.calls.length;
        ss.invalidateCache();
        await ss.getSettings();
        expect(executeMock.mock.calls.length).toBeGreaterThan(callsBefore);
    });
});
