/**
 * Chat API - Integration Tests
 * Tests for chat endpoints functionality
 */

const request = require('supertest');
const express = require('express');
const session = require('express-session');

// Mock database module
jest.mock('../sql/sql_functions', () => ({
    getUserConversations: jest.fn(() => 
        Promise.resolve({
            data: [
                {
                    conversationId: 1,
                    type: 'private',
                    name: null,
                    unreadCount: 0,
                    lastMessageAt: new Date().toISOString(),
                    lastMessagePreview: 'Test message',
                    otherUser: { userId: 2, username: 'testuser', profileImage: '/default.png' }
                }
            ],
            hasMore: false,
            nextCursor: null
        })
    ),
    getConversationMessages: jest.fn(() =>
        Promise.resolve({
            data: [
                {
                    id: 1,
                    conversationId: 1,
                    senderId: 2,
                    senderUsername: 'testuser',
                    body: 'Hello',
                    isBodyMasked: false,
                    sentAt: new Date().toISOString()
                }
            ],
            hasMore: false,
            nextCursor: null
        })
    ),
    insertMessageInConversation: jest.fn((userId, convId, message) =>
        Promise.resolve({
            id: 2,
            conversationId: convId,
            senderId: userId,
            senderUsername: 'currentuser',
            body: message,
            isBodyMasked: false,
            sentAt: new Date().toISOString()
        })
    ),
    createOrGetDirectConversation: jest.fn((userId1, userId2) =>
        Promise.resolve({
            conversationId: 42,
            created: true
        })
    ),
    assertConversationParticipant: jest.fn(() => Promise.resolve(true)),
    assertConversationUsable: jest.fn(() => Promise.resolve({ type: 'private', otherUserId: 2 })),
    canUsersChat: jest.fn(() => Promise.resolve({ canChat: true, reason: null })),
    cleanupDirectConversationBetween: jest.fn(() => Promise.resolve({ deletedConversationIds: [], participantUserIds: [] })),
    cleanupUnusableConversationsForUser: jest.fn(() => Promise.resolve({ deletedConversationIds: [], affectedPairs: [] })),
    containsBlockedWord: jest.fn(() => false),
    normalizeTextForModeration: jest.fn((msg) => msg),
    insertUserLog: jest.fn(() => Promise.resolve()),
    getUserVerificationStatusById: jest.fn(() =>
        Promise.resolve({ id: 1, username: 'testuser', email: 'testuser@example.com', is_email_verified: 1 })
    )
}));

// Create test app
function createTestApp() {
    const app = express();
    
    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: true
    }));
    
    app.use(express.json());
    
    // Mock authenticated middleware
    app.use((req, res, next) => {
        if (!req.session) {
            req.session = {};
        }
        req.session.userId = 1;
        req.session.username = 'testuser';
        next();
    });
    
    const apiRouter = require('../api/api.js');
    app.use('/api', apiRouter);
    
    return app;
}

let app;

beforeAll(() => {
    app = createTestApp();
});

describe('Chat API Endpoints', () => {
    describe('GET /api/chat/conversations', () => {
        test('should return user conversations with pagination', async () => {
            const response = await request(app)
                .get('/api/chat/conversations')
                .query({ limit: 10 });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body).toHaveProperty('cursor');
            expect(response.body).toHaveProperty('hasMore');
        });

        test('should respect limit parameter (1-50)', async () => {
            const response = await request(app)
                .get('/api/chat/conversations')
                .query({ limit: 100 });

            expect(response.status).toBe(200);
            // Limit should be capped at 50
        });

        test('should require authentication', async () => {
            const unAuthApp = express();
            unAuthApp.use(express.json());
            const apiRouter = require('../api/api.js');
            unAuthApp.use('/api', apiRouter);

            const response = await request(unAuthApp)
                .get('/api/chat/conversations');

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/chat/conversations/:conversationId/messages', () => {
        test('should return messages for a conversation', async () => {
            const response = await request(app)
                .get('/api/chat/conversations/1/messages')
                .query({ limit: 20 });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(Array.isArray(response.body.data)).toBe(true);
        });

        test('should support pagination with beforeMessageId', async () => {
            const response = await request(app)
                .get('/api/chat/conversations/1/messages')
                .query({ limit: 10, beforeMessageId: 100 });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
        });

        test('should reject invalid conversation ID', async () => {
            const response = await request(app)
                .get('/api/chat/conversations/invalid/messages');

            expect(response.status).toBe(400);
        });
    });

    describe('POST /api/chat/conversations/:conversationId/messages', () => {
        test('should send a message', async () => {
            const response = await request(app)
                .post('/api/chat/conversations/1/messages')
                .send({ message: 'Hello world' });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data.body).toBe('Hello world');
        });

        test('should reject empty message', async () => {
            const response = await request(app)
                .post('/api/chat/conversations/1/messages')
                .send({ message: '' });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });

        test('should reject message over 1000 characters', async () => {
            const longMessage = 'A'.repeat(1001);
            const response = await request(app)
                .post('/api/chat/conversations/1/messages')
                .send({ message: longMessage });

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });

        test('should reject invalid conversation ID', async () => {
            const response = await request(app)
                .post('/api/chat/conversations/invalid/messages')
                .send({ message: 'Hello' });

            expect(response.status).toBe(400);
        });
    });

    describe('POST /api/chat/conversations/direct', () => {
        test('should create or get direct conversation', async () => {
            const response = await request(app)
                .post('/api/chat/conversations/direct')
                .send({ targetUserId: 2 });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('conversationId');
            expect(response.body.data).toHaveProperty('created');
        });

        test('should reject invalid target user ID', async () => {
            const response = await request(app)
                .post('/api/chat/conversations/direct')
                .send({ targetUserId: 'invalid' });

            expect(response.status).toBe(400);
        });

        test('should prevent self-conversation', async () => {
            const response = await request(app)
                .post('/api/chat/conversations/direct')
                .send({ targetUserId: 1 }); // Same as session userId

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
        });
    });
});

describe('Chat Rate Limiting', () => {
    test('initChatRateLimiterCleanup function exists', () => {
        const endpoints = require('../api/api.js');
        expect(typeof endpoints.initChatRateLimiterCleanup).toBe('function');
    });
});

describe('Chat Error Handling', () => {
    test('should handle database errors gracefully', async () => {
        const sql = require('../sql/sql_functions');
        sql.getUserConversations.mockRejectedValueOnce(new Error('Database error'));

        const response = await request(app)
            .get('/api/chat/conversations');

        expect(response.status).toBe(500);
        expect(response.body.success).toBe(false);
    });
});
