/**
 * services.js — leaderboardService + notificationService + services tesztek.
 */

jest.mock('../sql/database.js', () => ({
    getPool: jest.fn(() => ({ _closed: false }))
}));

jest.mock('../sql/sql_functions.js', () => ({
    getTotalUsers: jest.fn(() => Promise.resolve(100)),
    getTotalGames: jest.fn(() => Promise.resolve(50)),
    getOnlineGamesCount: jest.fn(() => Promise.resolve(5)),
    getAllUsers: jest.fn(() => Promise.resolve([])),
    getAllRooms: jest.fn(() => Promise.resolve([])),
    getLeaderBoardByElo: jest.fn(() => Promise.resolve([{ id: 1, elo: 2000 }])),
    getLeaderBoardByMM: jest.fn(() => Promise.resolve([])),
    getLeaderBoardByBullet: jest.fn(() => Promise.resolve([])),
    getLeaderBoardByWinRate: jest.fn(() => Promise.resolve([])),
    insertNotification: jest.fn(() => Promise.resolve({ id: 99 })),
    getUserBasicById: jest.fn(() => Promise.resolve({ id: 1, role: 'player' })),
    getUnreadNotificationCount: jest.fn(() => Promise.resolve(3)),
    getUserIdsByRole: jest.fn(() => Promise.resolve([1, 2, 3])),
    getAllActiveUserIds: jest.fn(() => Promise.resolve([1, 2])),
    getUnreadChatMessageTotal: jest.fn(() => Promise.resolve(5))
}));

const { services, leaderboardService, notificationService } = require('../services.js');
const sql = require('../sql/sql_functions.js');

beforeEach(() => {
    jest.clearAllMocks();
});

describe('services.getCurrentStats', () => {
    test('public + admin alapertekek elerhetoek', () => {
        const s = services.getCurrentStats();
        expect(s.public).toBeDefined();
        expect(s.admin).toBeDefined();
        expect(typeof s.public.totalUsers).toBe('number');
    });
});

describe('services.refreshStats', () => {
    test('SQL parallel-call + io emit', async () => {
        const fakeIo = {
            sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
            to: jest.fn(() => ({ emit: jest.fn() }))
        };
        await services.refreshStats(fakeIo);
        expect(sql.getTotalUsers).toHaveBeenCalled();
        expect(sql.getTotalGames).toHaveBeenCalled();
        expect(fakeIo.to).toHaveBeenCalledWith('general-room');
        expect(fakeIo.to).toHaveBeenCalledWith('admin-room');
    });

    test('DB pool null → console error, nem dob', async () => {
        const dbMock = require('../sql/database.js');
        dbMock.getPool.mockReturnValueOnce(null);
        const fakeIo = { to: jest.fn(() => ({ emit: jest.fn() })) };
        await expect(services.refreshStats(fakeIo)).resolves.toBeUndefined();
    });

    test('SQL hiba → silent', async () => {
        sql.getTotalUsers.mockRejectedValueOnce(new Error('DB le'));
        const fakeIo = {
            sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
            to: jest.fn(() => ({ emit: jest.fn() }))
        };
        await expect(services.refreshStats(fakeIo)).resolves.toBeUndefined();
    });
});

describe('leaderboardService', () => {
    test('getLeaderBoard ures cache eredetileg', () => {
        const lb = leaderboardService.getLeaderBoard();
        expect(lb).toBeDefined();
        expect(lb.elo).toBeDefined();
    });

    test('updateLeaderboardCache 4 SQL-call-t hiv', async () => {
        await leaderboardService.updateLeaderboardCache(null);
        expect(sql.getLeaderBoardByElo).toHaveBeenCalled();
        expect(sql.getLeaderBoardByMM).toHaveBeenCalled();
        expect(sql.getLeaderBoardByBullet).toHaveBeenCalled();
        expect(sql.getLeaderBoardByWinRate).toHaveBeenCalled();
    });

    test('updateLeaderboardCache io.emit-tel ha io adott', async () => {
        const fakeIo = { to: jest.fn(() => ({ emit: jest.fn() })) };
        await leaderboardService.updateLeaderboardCache(fakeIo);
        expect(fakeIo.to).toHaveBeenCalledWith('general-room');
    });

    test('SQL hiba silent', async () => {
        sql.getLeaderBoardByElo.mockRejectedValueOnce(new Error('le'));
        await expect(leaderboardService.updateLeaderboardCache(null)).resolves.toBeUndefined();
    });
});

describe('notificationService.send — audience-ek', () => {
    test('user audience + targetUserId hivatkozott push', async () => {
        const hub = {
            pushNotification: jest.fn(),
            emitNotificationBadgeUpdate: jest.fn()
        };
        const r = await notificationService.send(hub, {
            targetUserId: 7,
            title: 'foo',
            body: 'bar'
        });
        expect(r.deliveredTo).toEqual([7]);
        expect(hub.pushNotification).toHaveBeenCalledWith(7, expect.any(Object));
    });

    test('user audience hianyzo targetUserId → error', async () => {
        const r = await notificationService.send({}, { audience: 'user' });
        expect(r.errors.length).toBeGreaterThan(0);
    });

    test('multi audience tobb userId-re', async () => {
        const hub = {
            pushNotification: jest.fn(),
            emitNotificationBadgeUpdate: jest.fn()
        };
        const r = await notificationService.send(hub, {
            audience: 'multi',
            targetUserIds: [1, 2, 3]
        });
        expect(r.deliveredTo.length).toBe(3);
    });

    test('multi audience hianyzo / ures targetUserIds → error', async () => {
        const r = await notificationService.send({}, { audience: 'multi' });
        expect(r.errors.length).toBeGreaterThan(0);
    });

    test('role audience hianyzo targetRole → error', async () => {
        const r = await notificationService.send({}, { audience: 'role' });
        expect(r.errors.length).toBeGreaterThan(0);
    });

    test('role audience push minden user-nek', async () => {
        const hub = {
            pushNotificationToUsers: jest.fn(),
            emitNotificationBadgeUpdate: jest.fn()
        };
        const r = await notificationService.send(hub, {
            audience: 'role',
            targetRole: 'admin'
        });
        expect(r.deliveredTo).toEqual([1, 2, 3]);
        expect(hub.pushNotificationToUsers).toHaveBeenCalledWith([1, 2, 3], expect.any(Object));
    });

    test('global audience push mindenkinek', async () => {
        const hub = {
            pushNotificationGlobal: jest.fn(),
            emitNotificationBadgeUpdate: jest.fn()
        };
        const r = await notificationService.send(hub, { audience: 'global' });
        expect(hub.pushNotificationGlobal).toHaveBeenCalled();
        expect(r.deliveredTo.length).toBeGreaterThan(0);
    });

    test('ismeretlen audience → error', async () => {
        const r = await notificationService.send({}, { audience: 'invalid_xyz' });
        expect(r.errors.length).toBeGreaterThan(0);
    });

    test('null notification → error', async () => {
        const r = await notificationService.send({}, null);
        expect(r.errors.length).toBeGreaterThan(0);
    });
});

describe('notificationService.refreshBadgeForUser', () => {
    test('userId 0 → 0 unread (no SQL)', async () => {
        const hub = { emitNotificationBadgeUpdate: jest.fn() };
        const r = await notificationService.refreshBadgeForUser(hub, 0);
        expect(r).toBe(0);
        expect(sql.getUnreadNotificationCount).not.toHaveBeenCalled();
    });

    test('valid userId + emit', async () => {
        const hub = { emitNotificationBadgeUpdate: jest.fn() };
        const r = await notificationService.refreshBadgeForUser(hub, 7);
        expect(r).toBe(3);
        expect(hub.emitNotificationBadgeUpdate).toHaveBeenCalledWith(7, 3);
    });

    test('SQL-hiba → silent (warn)', async () => {
        sql.getUnreadNotificationCount.mockRejectedValueOnce(new Error('le'));
        const r = await notificationService.refreshBadgeForUser(null, 7);
        expect(r).toBe(0);
    });
});

describe('notificationService.refreshChatUnreadForUser', () => {
    test('valid userId + emit', async () => {
        const hub = { emitChatUnreadUpdate: jest.fn() };
        const r = await notificationService.refreshChatUnreadForUser(hub, 7);
        expect(r).toBe(5);
        expect(hub.emitChatUnreadUpdate).toHaveBeenCalledWith(7, 5);
    });

    test('userId 0 → 0', async () => {
        const r = await notificationService.refreshChatUnreadForUser({}, 0);
        expect(r).toBe(0);
    });

    test('SQL-hiba silent', async () => {
        sql.getUnreadChatMessageTotal.mockRejectedValueOnce(new Error('le'));
        const r = await notificationService.refreshChatUnreadForUser(null, 7);
        expect(r).toBe(0);
    });
});
