const express = require('express');
const sql = require('../../sql/sql_funtions.js');
const { isAuthenticated } = require('../funtions.js');
const { validateChatRateLimitOrThrow: validateRateLimit, writeChatSecurityAudit } = require('../chatUtils.js');
const { parsePositiveInteger, getAuthenticatedUserIdOrThrow } = require('./_shared.js');

const router = express.Router();

const CHAT_RATE_LIMIT_MAX_MESSAGES = 5;
const CHAT_RATE_LIMIT_WINDOW_MS = 10 * 1000;
const CHAT_BLACKLIST_POLICY = String(process.env.CHAT_BLACKLIST_POLICY || 'hard_block').trim().toLowerCase();
const chatRateLimitByUserId = new Map();

function parseChatListLimit(value, fallback = 30, min = 1, max = 50) {
    const parsed = parsePositiveInteger(value, fallback);
    let normalized = fallback;
    if (parsed) {
        normalized = Math.min(Math.max(parsed, min), max);
    }
    return normalized;
}

function initChatRateLimiterCleanup() {
    const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 perc
    const MAX_TIMESTAMPS_PER_USER = 100;

    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [userId, timestamps] of chatRateLimitByUserId.entries()) {
            const freshTimestamps = timestamps.filter(
                ts => now - ts < CHAT_RATE_LIMIT_WINDOW_MS
            );

            if (freshTimestamps.length === 0) {
                chatRateLimitByUserId.delete(userId);
                cleanedCount++;
            } else if (freshTimestamps.length > MAX_TIMESTAMPS_PER_USER) {
                const trimmed = freshTimestamps.slice(-MAX_TIMESTAMPS_PER_USER);
                chatRateLimitByUserId.set(userId, trimmed);
            } else {
                chatRateLimitByUserId.set(userId, freshTimestamps);
            }
        }

        if (cleanedCount > 0 || chatRateLimitByUserId.size > 0) {
            console.log(
                `[Chat Rate Limiter] Cleanup: ${cleanedCount} user(s) cleaned, ` +
                `${chatRateLimitByUserId.size} active user(s) remaining`
            );
        }
    }, CLEANUP_INTERVAL);

    // Graceful shutdown: stop cleanup on process exit
    process.on('exit', () => clearInterval(cleanupInterval));
}

function buildChatModerationPolicyResult(message) {
    const hasBlockedWord = sql.containsBlockedWord(message);
    const normalizedMessage = sql.normalizeTextForModeration(message);

    const policyResult = {
        blocked: false,
        isMasked: false,
        maskedMessage: null,
        containsBlockedWord: hasBlockedWord,
        policy: CHAT_BLACKLIST_POLICY,
        normalizedLength: normalizedMessage.length
    };

    if (hasBlockedWord) {
        if (CHAT_BLACKLIST_POLICY === 'soft_mask') {
            policyResult.isMasked = true;
            policyResult.maskedMessage = '***';
        } else {
            policyResult.blocked = true;
        }
    }

    return policyResult;
}

function resolveStatusCodeByError(error, defaultStatusCode = 500) {
    if (error?.statusCode) return error.statusCode;
    const message = String(error?.message || '').toLowerCase();
    let statusCode = defaultStatusCode;

    if (message.includes('nincs bejelentkezett')) {
        statusCode = 401;
    } else if (message.includes('túl sok üzenet')) {
        statusCode = 429;
    } else if (message.includes('érvénytelen') || message.includes('nem lehet üres') || message.includes('legfeljebb')) {
        statusCode = 400;
    } else if (message.includes('nem résztvevője') || message.includes('nem nyitható meg tiltás miatt')) {
        statusCode = 403;
    } else if (message.includes('nem található')) {
        statusCode = 404;
    }

    return statusCode;
}

router.get('/chat/conversations', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = {
        success: false,
        data: [],
        message: 'Szerverhiba a beszélgetések lekérése során.',
        cursor: null,
        hasMore: false
    };

    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);

        const limit = parseChatListLimit(request.query?.limit, 30, 1, 50);
        const cursor = parsePositiveInteger(request.query?.cursor, null);
        const result = await sql.getUserConversations(currentUserId, limit, cursor);

        payload = {
            success: true,
            data: result.data,
            message: result.data.length
                ? `${result.data.length} beszélgetés betöltve.`
                : 'Nincs beszélgetés.',
            cursor: result.nextCursor,
            hasMore: Boolean(result.hasMore)
        };
    } catch (error) {
        statusCode = resolveStatusCodeByError(error, 500);
        payload.message = error.message || payload.message;
    }

    return response.status(statusCode).json(payload);
});

router.get('/chat/conversations/:conversationId/messages', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = {
        success: false,
        data: [],
        message: 'Szerverhiba a beszélgetés üzeneteinek lekérése során.',
        beforeMessageId: null,
        cursor: null,
        hasMore: false
    };

    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);

        const conversationId = parsePositiveInteger(request.params?.conversationId, null);
        if (!conversationId) {
            throw new Error('Érvénytelen beszélgetés azonosító.');
        }

        const limit = parseChatListLimit(request.query?.limit, 30, 1, 50);
        const beforeMessageId = parsePositiveInteger(request.query?.beforeMessageId ?? request.query?.before, null);

        await sql.assertConversationParticipant(currentUserId, conversationId);
        const result = await sql.getConversationMessages(currentUserId, conversationId, beforeMessageId, limit);

        payload = {
            success: true,
            data: result.data,
            message: result.data.length
                ? `${result.data.length} üzenet betöltve.`
                : 'Nincs megjeleníthető üzenet.',
            beforeMessageId: result.nextCursor,
            cursor: result.nextCursor,
            hasMore: Boolean(result.hasMore)
        };
    } catch (error) {
        statusCode = resolveStatusCodeByError(error, 500);
        payload.message = error.message || payload.message;
    }

    return response.status(statusCode).json(payload);
});

router.post('/chat/conversations/:conversationId/messages', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = {
        success: false,
        data: null,
        message: 'Szerverhiba az üzenet küldése során.'
    };

    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);

        const conversationId = parsePositiveInteger(request.params?.conversationId, null);
        if (!conversationId) {
            throw new Error('Érvénytelen beszélgetés azonosító.');
        }

        const message = String(request.body?.message || '').trim();
        if (!message) {
            throw new Error('Az üzenet nem lehet üres.');
        }

        if (message.length > 1000) {
            throw new Error('Az üzenet legfeljebb 1000 karakter lehet.');
        }

        await sql.assertConversationParticipant(currentUserId, conversationId);
        validateRateLimit(chatRateLimitByUserId, currentUserId, CHAT_RATE_LIMIT_MAX_MESSAGES, CHAT_RATE_LIMIT_WINDOW_MS);

        const policyResult = buildChatModerationPolicyResult(message);

        if (policyResult.containsBlockedWord) {
            await writeChatSecurityAudit(currentUserId, 'chat_blocked_word', conversationId, {
                success: !policyResult.blocked,
                severity: policyResult.blocked ? 'warning' : 'info',
                message: policyResult.blocked
                    ? 'Tiltott szó miatt blokkolt chat üzenet.'
                    : 'Tiltott szó miatt maszkolt chat üzenet.',
                metadata: {
                    policy: policyResult.policy,
                    masked: policyResult.isMasked,
                    blocked: policyResult.blocked
                }
            });
        }

        if (policyResult.blocked) {
            throw new Error('Az üzenet tiltott kifejezést tartalmaz.');
        }

        const data = await sql.insertMessageInConversation(currentUserId, conversationId, message, policyResult);
        payload = {
            success: true,
            data,
            message: 'Üzenet elküldve.'
        };
    } catch (error) {
        const isRateLimited = String(error?.message || '').toLowerCase().includes('túl sok üzenet');

        if (isRateLimited) {
            const conversationId = parsePositiveInteger(request.params?.conversationId, null);
            const currentUserId = parsePositiveInteger(request.session?.userId, 0);
            await writeChatSecurityAudit(currentUserId, 'chat_rate_limited', conversationId, {
                success: false,
                severity: 'warning',
                message: 'Chat üzenetküldés rate limit miatt blokkolva.',
                metadata: {
                    limit: CHAT_RATE_LIMIT_MAX_MESSAGES,
                    windowMs: CHAT_RATE_LIMIT_WINDOW_MS
                }
            });
        }

        statusCode = resolveStatusCodeByError(error, 500);
        payload.message = error.message || payload.message;
    }

    return response.status(statusCode).json(payload);
});

router.post('/chat/conversations/direct', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = {
        success: false,
        data: null,
        message: 'Szerverhiba a privát beszélgetés megnyitása során.'
    };

    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);

        const targetUserId = parsePositiveInteger(request.body?.targetUserId, null);
        if (!targetUserId) {
            throw new Error('Érvénytelen target user ID.');
        }

        if (currentUserId === targetUserId) {
            const selfErr = new Error('Önmagaddal nem nyithatsz privát beszélgetést.');
            selfErr.statusCode = 400;
            throw selfErr;
        }

        const openResult = await sql.createOrGetDirectConversation(currentUserId, targetUserId);
        await sql.assertConversationParticipant(currentUserId, openResult.conversationId);

        payload = {
            success: true,
            data: {
                conversationId: openResult.conversationId,
                created: Boolean(openResult.created)
            },
            message: openResult.created
                ? 'Privát beszélgetés létrehozva.'
                : 'Privát beszélgetés megnyitva.'
        };
    } catch (error) {
        statusCode = resolveStatusCodeByError(error, 500);
        payload.message = error.message || payload.message;
    }

    return response.status(statusCode).json(payload);
});

module.exports = router;
module.exports.initChatRateLimiterCleanup = initChatRateLimiterCleanup;
