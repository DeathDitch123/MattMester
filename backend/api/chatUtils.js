const sql = require('../sql/sql_functions.js');

// N14 (#37) — Egyetlen forrás-igazság a chat-konfigra. A chat.js es a sockets.js
// is innen olvas, igy a window/limit/policy egyazon helyrol jon.
const CHAT_CONFIG = Object.freeze({
    RATE_LIMIT_MAX_MESSAGES: 5,
    RATE_LIMIT_WINDOW_MS: 10 * 1000,
    MAX_MESSAGE_LENGTH: 1000,
    // Env-felulir-hato: ha nincs setting, soft_mask az alap.
    BLACKLIST_POLICY: String(process.env.CHAT_BLACKLIST_POLICY || 'soft_mask').trim().toLowerCase()
});

function _parsePositiveInt(value) {
    const n = Number(value);
    return (Number.isInteger(n) && n > 0) ? n : 0;
}

function validateChatRateLimitOrThrow(store, userId, maxMessages, windowMs) {
    const now = Date.now();
    const normalizedUserId = _parsePositiveInt(userId);
    if (!normalizedUserId) {
        throw new Error('Érvénytelen felhasználó azonosító a rate limithez.');
    }

    const existing = store.get(normalizedUserId) || [];
    const fresh = existing.filter(ts => ts > now - windowMs);

    if (fresh.length >= maxMessages) {
        store.set(normalizedUserId, fresh);
        throw new Error('Túl sok üzenet rövid időn belül. Próbáld újra pár másodperc múlva.');
    }

    fresh.push(now);
    store.set(normalizedUserId, fresh);
}

async function writeChatSecurityAudit(userId, eventType, conversationId, {
    success = false,
    severity = 'warning',
    message = '',
    metadata = {},
    source = 'backend'
} = {}) {
    try {
        const normalizedUserId = _parsePositiveInt(userId);
        if (!normalizedUserId) return;

        await sql.insertUserLog(normalizedUserId, {
            eventType,
            eventCategory: 'security',
            severity,
            source,
            success,
            message: message || null,
            metadata: { conversationId, ...metadata },
            occurredAt: new Date()
        });
    } catch (logError) {
        console.warn(`Chat security audit log hiba (${eventType}):`, logError.message);
    }
}

module.exports = { CHAT_CONFIG, validateChatRateLimitOrThrow, writeChatSecurityAudit };
