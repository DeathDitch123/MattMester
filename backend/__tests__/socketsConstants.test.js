/**
 * sockets.js — exportalt SOCKET_ROOMS / SOCKET_FEATURES tesztek.
 */

jest.mock('../services.js', () => ({
    services: {},
    notificationService: {}
}));
jest.mock('../sql/sql_functions.js', () => ({}));
jest.mock('../chess/pvp.js', () => ({
    registerPvpHandlers: jest.fn(),
    handlePvpDisconnect: jest.fn()
}));
jest.mock('../api/chatUtils.js', () => ({
    CHAT_CONFIG: {
        RATE_LIMIT_MAX_MESSAGES: 5,
        RATE_LIMIT_WINDOW_MS: 10000,
        MAX_MESSAGE_LENGTH: 1000,
        BLACKLIST_POLICY: 'soft_mask'
    },
    validateChatRateLimitOrThrow: jest.fn(),
    writeChatSecurityAudit: jest.fn(() => Promise.resolve())
}));
jest.mock('../utils/parse.js', () => ({
    parsePositiveInteger: jest.fn(v => Number(v) || null)
}));

const { SOCKET_ROOMS, SOCKET_FEATURES, createSocketHub } = require('../sockets.js');

describe('SOCKET_ROOMS — frozen room names', () => {
    test('Object.frozen', () => {
        expect(Object.isFrozen(SOCKET_ROOMS)).toBe(true);
    });

    test('a 4 szoba neve', () => {
        expect(SOCKET_ROOMS.general).toBe('general-room');
        expect(SOCKET_ROOMS.admin).toBe('admin-room');
        expect(SOCKET_ROOMS.presence).toBe('presence-room');
        expect(SOCKET_ROOMS.notifications).toBe('notifications-room');
    });
});

describe('SOCKET_FEATURES — feature lista', () => {
    test('frozen', () => {
        expect(Object.isFrozen(SOCKET_FEATURES)).toBe(true);
    });

    test('mindegyikben legyen key + label + description', () => {
        for (const f of SOCKET_FEATURES) {
            expect(typeof f.key).toBe('string');
            expect(typeof f.label).toBe('string');
            expect(typeof f.description).toBe('string');
            expect(f.key.length).toBeGreaterThan(0);
        }
    });

    test('legalabb 5 feature listazva', () => {
        expect(SOCKET_FEATURES.length).toBeGreaterThanOrEqual(5);
    });

    test('egyedi key-ek (nincs duplikat)', () => {
        const keys = SOCKET_FEATURES.map(f => f.key);
        expect(new Set(keys).size).toBe(keys.length);
    });

    test('a kanonikus 5 feature mind szerepel', () => {
        const keys = SOCKET_FEATURES.map(f => f.key);
        expect(keys).toContain('presence');
        expect(keys).toContain('chat');
        expect(keys).toContain('roomState');
        expect(keys).toContain('notifications');
        expect(keys).toContain('multiTabReconnect');
    });
});

describe('createSocketHub — guard', () => {
    test('null io → throw', () => {
        expect(() => createSocketHub(null)).toThrow(/Socket\.io/);
    });

    test('io.on hianyzik → throw', () => {
        expect(() => createSocketHub({})).toThrow(/Socket\.io/);
    });

    test('valid io → returns hub object', () => {
        const fakeIo = {
            on: jest.fn(),
            of: jest.fn(() => ({ on: jest.fn(), use: jest.fn(), sockets: new Map() })),
            sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
            to: jest.fn(() => ({ emit: jest.fn() })),
            engine: { clientsCount: 0 }
        };
        const hub = createSocketHub(fakeIo);
        expect(hub).toBeDefined();
        expect(typeof hub).toBe('object');
    });
});
