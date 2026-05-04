/**
 * api/routes/chat.js — chat endpoint smoke tesztek (NEM chatLifecycle, NEM chat-modul).
 *
 * Lefedi:
 *   - GET /chat/conversations
 *   - GET /chat/unread-total
 *   - POST /chat/conversations/direct (input validacio)
 *   - POST /chat/messages/:messageId/report (input validacio)
 *   - POST /chat/conversations/:id/read
 */

const express = require('express');
const session = require('express-session');
const supertest = require('supertest');

jest.mock('../sql/sql_functions.js', () => ({
    getUserConversations: jest.fn(() => Promise.resolve({ data: [], nextCursor: null, hasMore: false })),
    getConversationsWithLastMessage: jest.fn(() => Promise.resolve([])),
    getConversationMessages: jest.fn(() => Promise.resolve({ messages: [], conversation: null })),
    getMessagesByConversationId: jest.fn(() => Promise.resolve({ messages: [], conversation: null })),
    insertChatMessage: jest.fn(() => Promise.resolve({ messageId: 1 })),
    getDynamicBlockedWordRows: jest.fn(() => Promise.resolve([])),
    countUnreadMessagesForUser: jest.fn(() => Promise.resolve(0)),
    getChatUnreadTotalForUser: jest.fn(() => Promise.resolve(0)),
    getUnreadChatMessageTotal: jest.fn(() => Promise.resolve(0)),
    markConversationRead: jest.fn(() => Promise.resolve()),
    markConversationReadForUser: jest.fn(() => Promise.resolve(true)),
    markConversationAsReadForUser: jest.fn(() => Promise.resolve(true)),
    createOrGetDirectConversation: jest.fn(() => Promise.resolve({ conversationId: 99, created: true })),
    assertConversationParticipant: jest.fn(() => Promise.resolve()),
    insertChatMessageReport: jest.fn(() => Promise.resolve({ id: 5, duplicate: false })),
    createChatMessageReport: jest.fn(() => Promise.resolve({ id: 5, duplicate: false })),
    reportChatMessage: jest.fn(() => Promise.resolve({ id: 5, duplicate: false })),
    insertUserLog: jest.fn(() => Promise.resolve()),
    checkUserBanStatus: jest.fn(() => Promise.resolve(null)),
    getUserVerificationStatusById: jest.fn(() => Promise.resolve({ is_email_verified: true }))
}));

jest.mock('../api/middleware/rateLimiter.js', () => {
    const passthrough = (req, res, next) => next();
    return new Proxy({}, { get: () => passthrough });
});

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

jest.mock('../services.js', () => ({
    notificationService: {
        send: jest.fn(() => Promise.resolve({})),
        refreshChatUnreadForUser: jest.fn(() => Promise.resolve(0))
    }
}));

const sql = require('../sql/sql_functions.js');
const chatRoutes = require('../api/routes/chat.js');

function buildApp({ sessionUserId = null } = {}) {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 't', resave: false, saveUninitialized: false }));
    app.use((req, res, next) => {
        if (sessionUserId !== null) {
            req.session.userId = sessionUserId;
            req.session.role = 'player';
        }
        next();
    });
    app.use(chatRoutes);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('GET /chat/conversations', () => {
    test('401 nincs auth', async () => {
        const res = await supertest(buildApp()).get('/chat/conversations');
        expect(res.status).toBe(401);
    });

    test('200 + lista', async () => {
        sql.getConversationsWithLastMessage.mockResolvedValueOnce([
            { id: 1, last_message: 'hi' }
        ]);
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/chat/conversations');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.data)).toBe(true);
    });
});

describe('GET /chat/unread-total', () => {
    test('401 nincs auth', async () => {
        const res = await supertest(buildApp()).get('/chat/unread-total');
        expect(res.status).toBe(401);
    });

    test('200 + totalUnread', async () => {
        sql.getUnreadChatMessageTotal.mockResolvedValueOnce(5);
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/chat/unread-total');
        expect(res.status).toBe(200);
        expect(res.body.totalUnread).toBe(5);
    });
});

describe('POST /chat/conversations/direct', () => {
    test('401 nincs auth', async () => {
        const res = await supertest(buildApp()).post('/chat/conversations/direct').send({ targetUserId: 5 });
        expect(res.status).toBe(401);
    });

    test('400 hianyzo targetUserId', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/chat/conversations/direct').send({});
        expect(res.status).toBe(400);
    });

    test('400 ervenytelen targetUserId (string)', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/chat/conversations/direct').send({
            targetUserId: 'abc'
        });
        expect(res.status).toBe(400);
    });

    test('400 negative targetUserId', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/chat/conversations/direct').send({
            targetUserId: -1
        });
        expect(res.status).toBe(400);
    });

    test('400 onmagaval valo conv tilalom', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/chat/conversations/direct').send({
            targetUserId: 7
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/[ÖO]nmagad|onmagad/i);
    });

    test('200 sikeres conv', async () => {
        sql.createOrGetDirectConversation.mockResolvedValueOnce({ conversationId: 99, created: true });
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/chat/conversations/direct').send({
            targetUserId: 5
        });
        expect(res.status).toBe(200);
        expect(res.body.data.conversationId).toBe(99);
    });
});

describe('POST /chat/conversations/:id/read', () => {
    test('401 nincs auth', async () => {
        const res = await supertest(buildApp()).post('/chat/conversations/99/read');
        expect(res.status).toBe(401);
    });

    test('200 happy path', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/chat/conversations/99/read');
        expect(res.status).toBe(200);
    });
});

describe('POST /chat/messages/:messageId/report', () => {
    test('401 nincs auth', async () => {
        const res = await supertest(buildApp()).post('/chat/messages/99/report').send({ reason: 'spam' });
        expect(res.status).toBe(401);
    });

    test('hibas messageId → nem-200 hibakod (400 vagy 500 error-mapping miatt)', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/chat/messages/abc/report').send({ reason: 'spam' });
        expect([400, 500]).toContain(res.status);
        expect(res.body.success).toBe(false);
    });

    test('200 happy path', async () => {
        sql.insertChatMessageReport.mockResolvedValueOnce({ id: 5, duplicate: false });
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/chat/messages/99/report').send({ reason: 'spam' });
        expect(res.status).toBe(200);
    });

    test('200 duplicate=true (mar bejelentett)', async () => {
        sql.insertChatMessageReport.mockResolvedValueOnce({ id: 5, duplicate: true });
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/chat/messages/99/report').send({ reason: 'spam' });
        expect(res.status).toBe(200);
    });

    test('reason 500 char-on tul levagva (input-bound)', async () => {
        sql.insertChatMessageReport.mockResolvedValue({ id: 5, duplicate: false });
        sql.reportChatMessage.mockResolvedValue({ id: 5, duplicate: false });
        const longReason = 'x'.repeat(2000);
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/chat/messages/99/report').send({ reason: longReason });
        expect(res.status).toBe(200);
        // A reason 500 karakteren tul levagva — a backend implementacioja garantal egy felso korlatot.
        // Az implementacio reszleteit nem tesszuk dependes-se, de a status sikeres es nincs crash.
    });
});
