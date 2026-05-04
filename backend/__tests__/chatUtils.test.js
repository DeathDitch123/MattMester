/**
 * backend/api/chatUtils.js — egyseg-tesztek.
 *
 * Lefedi:
 *   - CHAT_CONFIG mezok (#37 N14 sprint sorrend)
 *   - validateChatRateLimitOrThrow: limit alatt OK, limit folott throw, ablak utan reset
 *   - writeChatSecurityAudit: mockolt sql.insertUserLog meghivasa, hibafogyas
 */

// JEST mock — a writeChatSecurityAudit hivja az sql.insertUserLog-ot, kell a stub.
jest.mock('../sql/sql_functions.js', () => ({
    insertUserLog: jest.fn(() => Promise.resolve())
}));

const sql = require('../sql/sql_functions.js');
const {
    CHAT_CONFIG,
    validateChatRateLimitOrThrow,
    writeChatSecurityAudit
} = require('../api/chatUtils.js');

beforeEach(() => {
    jest.clearAllMocks();
});

describe('chatUtils/CHAT_CONFIG — single source of truth', () => {
    test('Object.freeze — kliens-modositas elutasitva', () => {
        expect(Object.isFrozen(CHAT_CONFIG)).toBe(true);
    });

    test('a 4 mezo elerheto', () => {
        expect(CHAT_CONFIG.RATE_LIMIT_MAX_MESSAGES).toBe(5);
        expect(CHAT_CONFIG.RATE_LIMIT_WINDOW_MS).toBe(10 * 1000);
        expect(CHAT_CONFIG.MAX_MESSAGE_LENGTH).toBe(1000);
        expect(typeof CHAT_CONFIG.BLACKLIST_POLICY).toBe('string');
    });

    test('BLACKLIST_POLICY default soft_mask (NODE_ENV=test → no env)', () => {
        // A modul-load idokpontjaban olvasta env-t. Test-suite nem allitja, ezert default.
        expect(['soft_mask', 'hard_block']).toContain(CHAT_CONFIG.BLACKLIST_POLICY);
    });
});

describe('chatUtils/validateChatRateLimitOrThrow — rate-limit ablak', () => {
    test('elso uzenet pass-elt', () => {
        const store = new Map();
        expect(() => validateChatRateLimitOrThrow(store, 1, 5, 10000)).not.toThrow();
    });

    test('a max-edig pass-el', () => {
        const store = new Map();
        for (let i = 0; i < 5; i++) {
            expect(() => validateChatRateLimitOrThrow(store, 1, 5, 10000)).not.toThrow();
        }
    });

    test('a max+1.-edik throw-ol', () => {
        const store = new Map();
        for (let i = 0; i < 5; i++) {
            validateChatRateLimitOrThrow(store, 1, 5, 10000);
        }
        expect(() => validateChatRateLimitOrThrow(store, 1, 5, 10000)).toThrow(/Túl sok üzenet/);
    });

    test('ervenytelen userId throw-ol "Érvénytelen" hibaval', () => {
        const store = new Map();
        expect(() => validateChatRateLimitOrThrow(store, 0, 5, 10000)).toThrow(/Érvénytelen/);
        expect(() => validateChatRateLimitOrThrow(store, null, 5, 10000)).toThrow(/Érvénytelen/);
        expect(() => validateChatRateLimitOrThrow(store, -1, 5, 10000)).toThrow(/Érvénytelen/);
        expect(() => validateChatRateLimitOrThrow(store, 'abc', 5, 10000)).toThrow(/Érvénytelen/);
    });

    test('kulonbozo user-ek elkulonitett kvota', () => {
        const store = new Map();
        for (let i = 0; i < 5; i++) {
            validateChatRateLimitOrThrow(store, 1, 5, 10000);
            validateChatRateLimitOrThrow(store, 2, 5, 10000);
        }
        // Mindketto a saját limitjen — egy harmadik user pass-el
        expect(() => validateChatRateLimitOrThrow(store, 3, 5, 10000)).not.toThrow();
        // De a meglevo user (1) tovabb-ra is blokkolt
        expect(() => validateChatRateLimitOrThrow(store, 1, 5, 10000)).toThrow();
    });

    test('expirat ablak utan reset-elt szamlalo', async () => {
        const store = new Map();
        // 5 uzenet 50ms ablakkal — gyors limit
        for (let i = 0; i < 5; i++) {
            validateChatRateLimitOrThrow(store, 1, 5, 50);
        }
        expect(() => validateChatRateLimitOrThrow(store, 1, 5, 50)).toThrow();
        // Varjunk amig az ablak lejar
        await new Promise(r => setTimeout(r, 80));
        // Mostmar pass-el
        expect(() => validateChatRateLimitOrThrow(store, 1, 5, 50)).not.toThrow();
    });

    test('userId stringkent is mukodik (parse pozitiv integer)', () => {
        const store = new Map();
        expect(() => validateChatRateLimitOrThrow(store, '7', 5, 10000)).not.toThrow();
        expect(store.has(7)).toBe(true); // normalizalt szamkent kerul a store-ba
    });
});

describe('chatUtils/writeChatSecurityAudit — sql logging', () => {
    test('sikeres hivas: insertUserLog meghivva a megfelelo mezokkel', async () => {
        await writeChatSecurityAudit(1, 'chat:flood', 99, {
            success: false,
            severity: 'warning',
            message: 'Tul sok uzenet'
        });
        expect(sql.insertUserLog).toHaveBeenCalledTimes(1);
        const [userId, log] = sql.insertUserLog.mock.calls[0];
        expect(userId).toBe(1);
        expect(log.eventType).toBe('chat:flood');
        expect(log.eventCategory).toBe('security');
        expect(log.severity).toBe('warning');
        expect(log.success).toBe(false);
        expect(log.metadata.conversationId).toBe(99);
    });

    test('ervenytelen userId eseten NEM hiv insertUserLog-ot (silent skip)', async () => {
        await writeChatSecurityAudit(0, 'chat:flood', 99);
        await writeChatSecurityAudit(null, 'chat:flood', 99);
        await writeChatSecurityAudit('abc', 'chat:flood', 99);
        expect(sql.insertUserLog).not.toHaveBeenCalled();
    });

    test('insertUserLog hibat dob → silent (warn console), de NEM throw', async () => {
        sql.insertUserLog.mockRejectedValueOnce(new Error('DB le'));
        // A fuggveny try-catch-ben kezeli a hibat, nem dobja tovabb.
        await expect(writeChatSecurityAudit(1, 'chat:flood', 99)).resolves.toBeUndefined();
    });

    test('default mezok kitoltesere (severity=warning, source=backend)', async () => {
        await writeChatSecurityAudit(1, 'chat:other', 99);
        const [, log] = sql.insertUserLog.mock.calls[0];
        expect(log.severity).toBe('warning');
        expect(log.source).toBe('backend');
        expect(log.success).toBe(false);
    });

    test('extra metadata egyesitese a conversationId-vel', async () => {
        await writeChatSecurityAudit(1, 'chat:flag', 99, {
            metadata: { word: 'banned', length: 100 }
        });
        const [, log] = sql.insertUserLog.mock.calls[0];
        expect(log.metadata).toEqual(expect.objectContaining({
            conversationId: 99,
            word: 'banned',
            length: 100
        }));
    });
});
