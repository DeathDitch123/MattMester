/**
 * Permanens user-oldali ertesites-eltavolitas (dismiss) tesztjei.
 *
 * Lefedi a kovetkezo elvarasokat (per spec):
 *  - X / akcio gombok dismiss-eltetik az ertesitest, igy session-valtas
 *    utan sem jonnek vissza (a listazas filtere kizarja a dismissed sorokat),
 *  - "Mind olvasott" gomb tomeges dismiss-t valt ki ugyanezzel a hatassal,
 *  - multi-tab szinkronhoz a socket hub kibocsatja a notification:dismissed,
 *    notification:dismissed-all es notification:dismissed-bulk esemenyeket.
 *
 * Ezek a tesztek a hub kimeno esemenyeit es a SQL filter intent-et izolaltan
 * fedik le; az SQL reteg konkret query-jet a manuel verifikalt INSERT/UPDATE
 * (idempotens) lefedi (lasd dismissNotificationForUser jsdoc).
 */

jest.mock('../sql/database.js', () => ({
    getPool: () => ({ execute: jest.fn(() => Promise.resolve([[]])) })
}));

jest.mock('../chess/pvp.js', () => ({
    registerPvpHandlers: jest.fn(),
    handlePvpDisconnect: jest.fn(() => Promise.resolve())
}));

jest.mock('../sql/sql_functions.js', () => ({
    getUnreadNotificationCount: jest.fn(() => Promise.resolve(0)),
    getUnreadChatMessageTotal: jest.fn(() => Promise.resolve(0)),
    getPrivateConversationParticipantIds: jest.fn(() => Promise.resolve([])),
    getUserBasicById: jest.fn(() => Promise.resolve({ id: 1, role: 'player' })),
    insertNotification: jest.fn(() => Promise.resolve({})),
    getUserIdsByRole: jest.fn(() => Promise.resolve([])),
    getAllActiveUserIds: jest.fn(() => Promise.resolve([])),
    insertMessageInConversation: jest.fn(() => Promise.resolve({})),
    assertConversationUsable: jest.fn(() => Promise.resolve({})),
    assertConversationParticipant: jest.fn(() => Promise.resolve(true)),
    containsBlockedWord: jest.fn(() => false),
    normalizeTextForModeration: jest.fn((value) => value)
}));

jest.mock('../services.js', () => {
    const noop = () => Promise.resolve();
    return {
        services: {
            getCurrentStats: () => ({ public: {}, admin: {} }),
            refreshStats: jest.fn(() => Promise.resolve()),
            handleHeartbeat: jest.fn()
        },
        notificationService: {
            send: jest.fn(() => Promise.resolve({ saved: null, deliveredTo: [], errors: [] })),
            refreshBadgeForUser: jest.fn(() => Promise.resolve(0)),
            refreshChatUnreadForUser: jest.fn(() => Promise.resolve(0))
        },
        leaderboardService: { handleLeaderBoardCache: noop, getLeaderBoard: () => ({}) }
    };
});

jest.mock('../api/chatUtils.js', () => ({
    CHAT_CONFIG: {
        RATE_LIMIT_MAX_MESSAGES: 5,
        RATE_LIMIT_WINDOW_MS: 10 * 1000,
        MAX_MESSAGE_LENGTH: 1000,
        BLACKLIST_POLICY: 'soft_mask'
    },
    validateChatRateLimitOrThrow: jest.fn(),
    writeChatSecurityAudit: jest.fn(() => Promise.resolve())
}));

const { createSocketHub } = require('../sockets.js');

function createFakeIo() {
    const roomTargets = new Map();
    const io = {
        sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
        engine: { use: jest.fn() },
        on: jest.fn(),
        to: jest.fn((room) => {
            if (!roomTargets.has(room)) {
                roomTargets.set(room, { emit: jest.fn() });
            }
            return roomTargets.get(room);
        })
    };
    io._roomEmits = (room) => {
        const target = roomTargets.get(room);
        return target ? target.emit.mock.calls : [];
    };
    return io;
}

describe('notification dismiss – multi-tab szinkron emit', () => {
    test('emitNotificationDismissed a notification-user szobaba kuld notification:dismissed esemenyt', () => {
        const io = createFakeIo();
        const hub = createSocketHub(io);

        hub.emitNotificationDismissed(42, 777);

        const emitCalls = io._roomEmits('notification-user:42');
        const dismissedEvent = emitCalls.find(([event]) => event === 'notification:dismissed');
        expect(dismissedEvent?.[1]?.notificationId).toBe(777);
    });

    test('emitNotificationDismissed ervenytelen userId vagy notificationId eseten nem emit', () => {
        const io = createFakeIo();
        const hub = createSocketHub(io);

        hub.emitNotificationDismissed(0, 100);
        hub.emitNotificationDismissed(10, 0);
        hub.emitNotificationDismissed(null, null);

        // Egyetlen room target sem keletkezik dismissed esemeny celjabol.
        expect(io.to).not.toHaveBeenCalledWith('notification-user:0');
        expect(io.to).not.toHaveBeenCalledWith('notification-user:10');
    });

    test('emitNotificationDismissedAll notification:dismissed-all esemenyt emit a usernek', () => {
        const io = createFakeIo();
        const hub = createSocketHub(io);

        hub.emitNotificationDismissedAll(42);

        const emitCalls = io._roomEmits('notification-user:42');
        const dismissedAllEvent = emitCalls.find(([event]) => event === 'notification:dismissed-all');
        expect(dismissedAllEvent).toBeDefined();
        expect(typeof dismissedAllEvent?.[1]?.at).toBe('string');
    });

    test('emitNotificationDismissedBulk type+sender filterrel emit notification:dismissed-bulk', () => {
        const io = createFakeIo();
        const hub = createSocketHub(io);

        hub.emitNotificationDismissedBulk(42, { type: 'friend_request', senderUserId: 99 });

        const emitCalls = io._roomEmits('notification-user:42');
        const bulkEvent = emitCalls.find(([event]) => event === 'notification:dismissed-bulk');
        expect(bulkEvent?.[1]?.filter?.type).toBe('friend_request');
        expect(bulkEvent?.[1]?.filter?.senderUserId).toBe(99);
    });

    test('emitNotificationDismissedBulk hianyos filter eseten is biztonsagosan futhat', () => {
        const io = createFakeIo();
        const hub = createSocketHub(io);

        hub.emitNotificationDismissedBulk(42, {});

        const emitCalls = io._roomEmits('notification-user:42');
        const bulkEvent = emitCalls.find(([event]) => event === 'notification:dismissed-bulk');
        expect(bulkEvent?.[1]?.filter?.type).toBeNull();
        expect(bulkEvent?.[1]?.filter?.senderUserId).toBeNull();
    });
});

describe('notification dismiss – SQL filter intent (smoke)', () => {
    test('getNotificationsForUser query tartalmazza a dismissed_at IS NULL feltetelt', () => {
        // A SQL string ellenorzese annyit garantal, hogy a listazas
        // filtere ervenyes; a futtatashoz elo DB kellene.
        const fs = require('fs');
        const path = require('path');
        const source = fs.readFileSync(
            path.join(__dirname, '..', 'sql', 'modules', 'notifications.js'),
            'utf8'
        );
        // Listazas: dismissed_at IS NULL
        expect(source).toMatch(/getNotificationsForUser[\s\S]*?nr\.dismissed_at IS NULL/);
        // Olvasatlan szamolas: read_at IS NULL ES dismissed_at IS NULL
        expect(source).toMatch(/getUnreadNotificationCount[\s\S]*?nr\.read_at IS NULL[\s\S]*?nr\.dismissed_at IS NULL/);
    });

    test('dismissNotificationForUser ON DUPLICATE KEY UPDATE-tal idempotens', () => {
        const fs = require('fs');
        const path = require('path');
        const source = fs.readFileSync(
            path.join(__dirname, '..', 'sql', 'modules', 'notifications.js'),
            'utf8'
        );
        expect(source).toMatch(/dismissNotificationForUser[\s\S]*?ON DUPLICATE KEY UPDATE/);
    });
});
