/**
 * Session váltás + valós idejű chat badge viselkedés unit tesztjei.
 *
 * Ezek a tesztek a socket hub magját fedik le, amit a user reportolt hibák
 * érintenek:
 *  - munkamenetváltáskor (login / logout / user A -> user B) az értesítési és
 *    chat unread állapot konzisztensen frissüljön,
 *  - új chat üzenetnél a címzett chat ikonja valós időben kapjon frissítést
 *    akkor is, ha nincs megnyitva a beszélgetés.
 *
 * A socket.io példányt és az SQL réteget mockoljuk, hogy a hub logikáját
 * izoláltan tudjuk vizsgálni.
 */

jest.mock('../sql/database.js', () => ({
    getPool: () => ({ execute: jest.fn(() => Promise.resolve([[]])) })
}));

jest.mock('../chess/pvp.js', () => ({
    registerPvpHandlers: jest.fn(),
    handlePvpDisconnect: jest.fn(() => Promise.resolve())
}));

jest.mock('../sql/sql_funtions.js', () => ({
    getUnreadNotificationCount: jest.fn(() => Promise.resolve(0)),
    getUnreadChatMessageTotal: jest.fn(() => Promise.resolve(0)),
    getPrivateConversationParticipantIds: jest.fn(() => Promise.resolve([])),
    insertMessageInConversation: jest.fn(() => Promise.resolve({})),
    assertConversationUsable: jest.fn(() => Promise.resolve({})),
    assertConversationParticipant: jest.fn(() => Promise.resolve(true)),
    containsBlockedWord: jest.fn(() => false),
    normalizeTextForModeration: jest.fn((value) => value),
    getUserBasicById: jest.fn(() => Promise.resolve({ id: 1, role: 'player' })),
    insertNotification: jest.fn(() => Promise.resolve({})),
    getUserIdsByRole: jest.fn(() => Promise.resolve([])),
    getAllActiveUserIds: jest.fn(() => Promise.resolve([]))
}));

jest.mock('../services.js', () => {
    const noop = () => Promise.resolve();
    return {
        services: {
            getCurrentStats: () => ({ public: {}, admin: {} }),
            refreshStats: jest.fn(() => Promise.resolve()),
            handleHeartbeat: jest.fn(),
            handleConnection: jest.fn()
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
    validateChatRateLimitOrThrow: jest.fn(),
    writeChatSecurityAudit: jest.fn(() => Promise.resolve())
}));

const { createSocketHub, SOCKET_ROOMS } = require('../sockets.js');
const sql = require('../sql/sql_funtions.js');

// ─── Mock Socket.IO helpers ────────────────────────────────────────────────
function createFakeSocket({ clientId = 'c1', tabId = 't1', userId = 0, role = 'player' } = {}) {
    const handlers = new Map();
    const emitted = [];
    const rooms = new Set();
    const socket = {
        id: `sock-${Math.random().toString(36).slice(2, 8)}`,
        connected: true,
        rooms,
        data: {},
        handshake: { auth: { clientId, tabId, page: '/' } },
        request: {
            session: userId
                ? {
                      userId,
                      username: `user${userId}`,
                      role,
                      profile_image: '/profile_pictures/default.png',
                      profile_image_status: 'default'
                  }
                : {},
            sessionID: `sid-${userId || 'guest'}`
        },
        emit: jest.fn((event, payload) => emitted.push({ event, payload })),
        on: jest.fn((event, handler) => handlers.set(event, handler)),
        off: jest.fn(),
        join: jest.fn((room) => rooms.add(room)),
        leave: jest.fn((room) => rooms.delete(room)),
        use: jest.fn(),
        disconnect: jest.fn()
    };
    socket._handlers = handlers;
    socket._emitted = emitted;
    return socket;
}

function createFakeIo() {
    const roomTargets = new Map();
    let connectionHandler = null;
    const io = {
        sockets: { sockets: new Map(), adapter: { rooms: new Map() } },
        engine: { use: jest.fn() },
        on: jest.fn((event, handler) => {
            if (event === 'connection') {
                connectionHandler = handler;
            }
        }),
        to: jest.fn((room) => {
            if (!roomTargets.has(room)) {
                roomTargets.set(room, { emit: jest.fn() });
            }
            return roomTargets.get(room);
        })
    };
    io._connect = (socket) => {
        io.sockets.sockets.set(socket.id, socket);
        if (connectionHandler) {
            connectionHandler(socket);
        }
    };
    io._roomTargets = roomTargets;
    io._roomEmits = (room) => {
        const target = roomTargets.get(room);
        return target ? target.emit.mock.calls : [];
    };
    return io;
}

// ─── Tests ─────────────────────────────────────────────────────────────────
describe('socket hub – session váltás és realtime chat badge', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('socket:sync user váltásnál elhagyja a régi notification-user szobát és belép az újba', async () => {
        const io = createFakeIo();
        createSocketHub(io);

        // Első kapcsolat: userA (id=10)
        const socket = createFakeSocket({ userId: 10, clientId: 'browser-1', tabId: 'tab-1' });
        io._connect(socket);

        expect(socket.join).toHaveBeenCalledWith('user-room:10');
        expect(socket.join).toHaveBeenCalledWith(`${SOCKET_ROOMS.presence}:10`);

        // Imitáljuk a session váltást: ugyanezen a socketen most user B (id=20) van
        socket.request.session = {
            userId: 20,
            username: 'user20',
            role: 'player',
            profile_image: '/profile_pictures/default.png',
            profile_image_status: 'default'
        };
        socket.request.sessionID = 'sid-20';

        const syncHandler = socket._handlers.get('socket:sync');
        expect(typeof syncHandler).toBe('function');
        await syncHandler();
        // A side-effect async, adjunk egy tick-et a promise chain-nek.
        await new Promise((resolve) => setImmediate(resolve));

        expect(socket.leave).toHaveBeenCalledWith('user-room:10');
        expect(socket.leave).toHaveBeenCalledWith('notification-user:10');
        expect(socket.join).toHaveBeenCalledWith('user-room:20');
        expect(socket.join).toHaveBeenCalledWith('notification-user:20');
    });

    test('socket:sync user váltás után notification:reset + chat:unread:reset eseményt emit', async () => {
        const io = createFakeIo();
        createSocketHub(io);

        const socket = createFakeSocket({ userId: 10 });
        io._connect(socket);

        // Új user a session-ben
        socket.request.session = { userId: 20, username: 'user20', role: 'player' };
        const syncHandler = socket._handlers.get('socket:sync');
        await syncHandler();
        await new Promise((resolve) => setImmediate(resolve));

        const events = socket._emitted.map((entry) => entry.event);
        expect(events).toContain('notification:reset');
        expect(events).toContain('chat:unread:reset');
        expect(events).toContain('notification:badge:update');
        expect(events).toContain('chat:unread:update');
    });

    test('socket:sync logout esetén (userId -> 0) a kliens nullázó badge-et kap', async () => {
        const io = createFakeIo();
        createSocketHub(io);

        const socket = createFakeSocket({ userId: 10 });
        io._connect(socket);

        // Logout: session userId törölve
        socket.request.session = {};
        const syncHandler = socket._handlers.get('socket:sync');
        await syncHandler();
        await new Promise((resolve) => setImmediate(resolve));

        const badgeEmit = socket._emitted.find((entry) => entry.event === 'notification:badge:update');
        const chatEmit = socket._emitted.find((entry) => entry.event === 'chat:unread:update');
        expect(badgeEmit?.payload?.unreadCount).toBe(0);
        expect(chatEmit?.payload?.totalUnread).toBe(0);
        expect(socket.leave).toHaveBeenCalledWith('notification-user:10');
    });

    test('broadcastChatMessageSideEffects minden résztvevőnek chat:unread:update-et küld, a nem-küldőnek chat:list:refresh-t is', async () => {
        const io = createFakeIo();
        const hub = createSocketHub(io);

        sql.getPrivateConversationParticipantIds.mockResolvedValueOnce([11, 22]);
        sql.getUnreadChatMessageTotal
            .mockResolvedValueOnce(0) // küldő (user 11): most üzent, saját szála 0
            .mockResolvedValueOnce(3); // címzett (user 22): 3 olvasatlan

        await hub.broadcastChatMessageSideEffects(99, 11);

        const senderUnread = io._roomEmits('user-room:11').find(([event]) => event === 'chat:unread:update');
        const receiverUnread = io._roomEmits('user-room:22').find(([event]) => event === 'chat:unread:update');
        const senderListRefresh = io._roomEmits('user-room:11').find(([event]) => event === 'chat:list:refresh');
        const receiverListRefresh = io._roomEmits('user-room:22').find(([event]) => event === 'chat:list:refresh');

        expect(senderUnread?.[1]?.totalUnread).toBe(0);
        expect(receiverUnread?.[1]?.totalUnread).toBe(3);
        // A küldő kliense már lokálisan frissül, így NEM kap chat:list:refresh-t.
        expect(senderListRefresh).toBeUndefined();
        expect(receiverListRefresh?.[1]?.conversationId).toBe(99);
        expect(receiverListRefresh?.[1]?.reason).toBe('new-message');
    });

    test('emitChatUnreadUpdate a bejelentkezett user szobájába küld', () => {
        const io = createFakeIo();
        const hub = createSocketHub(io);

        hub.emitChatUnreadUpdate(42, 7);

        const emitCalls = io._roomEmits('user-room:42');
        const chatEvent = emitCalls.find(([event]) => event === 'chat:unread:update');
        expect(chatEvent?.[1]?.totalUnread).toBe(7);
    });

    test('emitNotificationBadgeUpdate a notification-user szobába küld', () => {
        const io = createFakeIo();
        const hub = createSocketHub(io);

        hub.emitNotificationBadgeUpdate(42, 5);

        const emitCalls = io._roomEmits('notification-user:42');
        const badgeEvent = emitCalls.find(([event]) => event === 'notification:badge:update');
        expect(badgeEvent?.[1]?.unreadCount).toBe(5);
    });
});
