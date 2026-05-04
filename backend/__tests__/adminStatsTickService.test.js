/**
 * api/admin/statsTickService.js — admin live stats tick.
 */

jest.mock('../sql/adminRepo.js', () => ({
    searchAuditEntries: jest.fn(() => Promise.resolve([])),
    countAlertsSince: jest.fn(() => Promise.resolve(0)),
    countActiveRateEscalations: jest.fn(() => Promise.resolve(0)),
    countPendingProfileImages: jest.fn(() => Promise.resolve(0)),
    countPendingFriendRequests: jest.fn(() => Promise.resolve(0)),
    countOngoingGames: jest.fn(() => Promise.resolve(0)),
    countLoginsSince: jest.fn(() => Promise.resolve(0)),
    countRegistrationsSince: jest.fn(() => Promise.resolve(0))
}));

const adminRepo = require('../sql/adminRepo.js');
const { computeTickPayload, TICK_INTERVAL_MS, start, stop } = require('../api/admin/statsTickService.js');

beforeEach(() => {
    jest.clearAllMocks();
});

afterAll(() => {
    stop();
});

describe('TICK_INTERVAL_MS konstans', () => {
    test('5000 ms', () => {
        expect(TICK_INTERVAL_MS).toBe(5000);
    });
});

describe('computeTickPayload', () => {
    test('alapertekkel ures payload struktura', async () => {
        const r = await computeTickPayload(null);
        expect(r).toBeDefined();
        expect(r.online).toBeDefined();
        expect(r.pending).toBeDefined();
        expect(r.last24h).toBeDefined();
        expect(r.rateLimit).toBeDefined();
    });

    test('online szekcio default ertekek', async () => {
        const r = await computeTickPayload(null);
        expect(r.online.totalUsers).toBe(0);
        expect(r.online.totalAdmins).toBe(0);
        expect(r.online.inGame).toBe(0);
    });

    test('presence-snapshot adatok beolvasasa', async () => {
        const socketHub = {
            getPresenceSnapshot: () => ({
                onlineUsers: 5,
                onlineSockets: 10,
                onlineTabs: 12,
                clients: [
                    { role: 'admin', tabs: [] },
                    { role: 'player', tabs: [{ page: '/lobby' }] }
                ]
            })
        };
        const r = await computeTickPayload(socketHub);
        expect(r.online.totalUsers).toBe(5);
        expect(r.online.totalAdmins).toBe(1);
        expect(r.online.inMatchmaking).toBe(1);
    });

    test('SQL adatok beolvasasa', async () => {
        adminRepo.countOngoingGames.mockResolvedValueOnce(7);
        adminRepo.countAlertsSince.mockResolvedValueOnce(3);
        adminRepo.countPendingProfileImages.mockResolvedValueOnce(2);
        const r = await computeTickPayload(null);
        expect(r.online.inGame).toBe(7);
        expect(r.last24h.alerts).toBe(3);
        expect(r.pending.profileImages).toBe(2);
    });

    test('audit entries critical-szamla mukodik', async () => {
        adminRepo.searchAuditEntries.mockResolvedValueOnce([
            { severity: 'info', action: 'foo' },
            { severity: 'critical', action: 'bar' },
            { severity: 'critical', action: 'users.ban' },
            { severity: 'warning', action: 'users.ban' }
        ]);
        const r = await computeTickPayload(null);
        expect(r.last24h.auditEntries).toBe(4);
        expect(r.last24h.criticalAuditEntries).toBe(2);
        expect(r.last24h.newBans).toBe(2);
    });

    test('SQL hiba egy ag-ban → silent (a tobbi tovabb mukodik)', async () => {
        adminRepo.countOngoingGames.mockRejectedValueOnce(new Error('le'));
        const r = await computeTickPayload(null);
        expect(r).toBeDefined();
        expect(r.online.inGame).toBe(0);
    });
});

describe('start / stop scheduler', () => {
    test('hianyzo namespace → false', () => {
        const r = start({ adminSocketHub: {} });
        expect(r).toBe(false);
    });

    test('start tobbszor egymasutan idempotens', () => {
        const fakeSocketHub = {
            namespace: { on: jest.fn(), sockets: new Map() },
            broadcastAdmin: jest.fn()
        };
        const a = start({ adminSocketHub: fakeSocketHub });
        const b = start({ adminSocketHub: fakeSocketHub });
        expect(a).toBe(true);
        // Masodszor mar nem indul el
        expect(b).toBe(false);
        stop();
    });

    test('stop sikeres mindenhonnan', () => {
        expect(stop()).toBe(true);
    });
});
