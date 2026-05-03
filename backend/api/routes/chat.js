const express = require('express');
const sql = require('../../sql/sql_functions.js');
const { isAuthenticated, requireVerifiedEmail } = require('../functions.js');
const { chatMessageLimiter, chatDirectOpenLimiter } = require('../middleware/rateLimiter.js');
const { validateChatRateLimitOrThrow: validateRateLimit, writeChatSecurityAudit } = require('../chatUtils.js');
const { parsePositiveInteger, getAuthenticatedUserIdOrThrow } = require('./_shared.js');
const { notificationService } = require('../../services.js');

const router = express.Router();

const CHAT_RATE_LIMIT_MAX_MESSAGES = 5;
const CHAT_RATE_LIMIT_WINDOW_MS = 10 * 1000;
// Default 'soft_mask' — l. backend/sockets.js azonos kommentet. Az admin moderalas
// panelnek latnia kell a tartalmilag szabalysertő üzeneteket, hogy bannolhatóak legyenek.
const CHAT_BLACKLIST_POLICY = String(process.env.CHAT_BLACKLIST_POLICY || 'soft_mask').trim().toLowerCase();
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
    } else if (message.includes('már nem elérhető')) {
        statusCode = 410;
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

router.post('/chat/conversations/:conversationId/messages', chatMessageLimiter, isAuthenticated, async (request, response) => {
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

        try {
            await sql.assertConversationUsable(currentUserId, conversationId);
        } catch (usabilityError) {
            if (usabilityError?.code === 'CONVERSATION_UNAVAILABLE') {
                const socketHub = request.app?.locals?.socketHub;
                if (socketHub?.notifyConversationDeleted) {
                    socketHub.notifyConversationDeleted(
                        usabilityError.conversationId,
                        usabilityError.affectedUserIds || [],
                        usabilityError.reason || 'unavailable'
                    );
                }
            }
            throw usabilityError;
        }
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

        // Broadcast-szintű maszkolás: a sender saját pending képe nem szivároghat
        // ki a többi résztvevőhöz. A REST válaszban (alább) a feladó saját nézete
        // marad meg; a socket payload-ot defaultra cseréljük, ha a feltöltés még
        // pending. (Az approved kép globálisan látható.)
        const broadcastSafeData = (() => {
            const isPending = String(data?.senderProfileImageStatus || '').toLowerCase() === 'pending';
            if (!isPending) {
                return data;
            }
            return {
                ...data,
                senderProfileImage: '/profile_pictures/default.png',
                senderProfileImageStatus: 'default'
            };
        })();

        // Authoritative real-time broadcast: a resztvevok (kuldovel egyutt) kapjanak
        // chat:message:new + chat:unread:update + chat:list:refresh eventeket,
        // hogy a chat ikon badge-e valos idoben frissuljon, meg akkor is, ha a
        // cimzettnek nincs megnyitva a beszelgetes.
        const socketHub = request.app?.locals?.socketHub;
        if (socketHub?.broadcastChat) {
            try {
                socketHub.broadcastChat(conversationId, {
                    ...broadcastSafeData,
                    conversationId,
                    receivedAt: new Date().toISOString()
                });
            } catch (broadcastError) {
                console.warn('[chat REST] broadcastChat hiba:', broadcastError.message);
            }
        }
        if (socketHub?.broadcastChatMessageSideEffects) {
            try {
                await socketHub.broadcastChatMessageSideEffects(conversationId, currentUserId);
            } catch (sideEffectError) {
                console.warn('[chat REST] side-effect hiba:', sideEffectError.message);
            }
        }

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

router.get('/chat/unread-total', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, totalUnread: 0, message: 'Szerverhiba az olvasatlan üzenetek lekérése során.' };
    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);
        const totalUnread = await sql.getUnreadChatMessageTotal(currentUserId);
        payload = { success: true, totalUnread, message: 'OK' };
    } catch (error) {
        statusCode = resolveStatusCodeByError(error, 500);
        payload.message = error.message || payload.message;
    }
    return response.status(statusCode).json(payload);
});

router.post('/chat/conversations/:conversationId/read', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, totalUnread: 0, message: 'Szerverhiba a beszélgetés olvasottá jelölése során.' };
    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);
        const conversationId = parsePositiveInteger(request.params?.conversationId, null);
        if (!conversationId) {
            throw new Error('Érvénytelen beszélgetés azonosító.');
        }
        await sql.assertConversationParticipant(currentUserId, conversationId);
        await sql.markConversationReadForUser(currentUserId, conversationId);
        const socketHub = request.app?.locals?.socketHub;
        const totalUnread = await notificationService.refreshChatUnreadForUser(socketHub, currentUserId);
        payload = { success: true, totalUnread, message: 'Beszélgetés olvasottnak jelölve.' };
    } catch (error) {
        statusCode = resolveStatusCodeByError(error, 500);
        payload.message = error.message || payload.message;
    }
    return response.status(statusCode).json(payload);
});

router.post('/chat/conversations/direct', chatDirectOpenLimiter, isAuthenticated, requireVerifiedEmail, async (request, response) => {
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

// Felhasznaloi bejelentes egy chat uzenetrol — a chat moderalas listajaba ker.
// Egy felhasznalo egy uzenetet csak egyszer jelenthet (UNIQUE constraint), de a duplikatum
// nem hibakent jonn vissza, hanem 200-szal "duplicate=true" jelzessel, hogy a UI elegansan
// kezelhesse ("mar bejelentetted").
router.post('/chat/messages/:messageId/report', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: 'Szerverhiba a bejelentes mentese soran.' };
    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);
        const messageId = parsePositiveInteger(request.params?.messageId, null);
        if (!messageId) {
            throw new Error('Ervenytelen uzenet azonosito.');
        }

        const rawReason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
        const reason = rawReason ? rawReason.slice(0, 500) : null;

        const result = await sql.reportChatMessage(messageId, currentUserId, reason);

        if (result.duplicate) {
            payload = {
                success: true,
                duplicate: true,
                message: 'Mar korabban bejelentetted ezt az uzenetet.'
            };
        } else {
            payload = {
                success: true,
                duplicate: false,
                message: 'Bejelentes rogzitve. Az adminisztratorok at fogjak nezni.'
            };

            // Real-time push az admin moderalas listajara: uj bejelentes erkezett.
            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:chat:flagged', {
                        messageId,
                        reportId: result.reportId,
                        reporterUserId: currentUserId,
                        kind: 'report',
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('chat report admin broadcast hiba:', broadcastErr.message);
            }
        }
    } catch (error) {
        statusCode = resolveStatusCodeByError(error, 500);
        const messageLower = String(error?.message || '').toLowerCase();
        if (error?.code === 'CHAT_REPORT_MUTED') {
            statusCode = 403;
            payload = {
                success: false,
                code: 'CHAT_REPORT_MUTED',
                muteUntil: error.muteUntil || null,
                message: error.message
            };
            return response.status(statusCode).json(payload);
        }
        if (messageLower.includes('nem talalhato') || messageLower.includes('nem található')) {
            statusCode = 404;
        } else if (messageLower.includes('sajat uzenet') || messageLower.includes('saját üzenet')) {
            statusCode = 400;
        } else if (messageLower.includes('resztvevoje') || messageLower.includes('résztvevője')) {
            statusCode = 403;
        }
        payload.message = error.message || payload.message;
    }
    return response.status(statusCode).json(payload);
});

module.exports = router;
module.exports.initChatRateLimiterCleanup = initChatRateLimiterCleanup;
