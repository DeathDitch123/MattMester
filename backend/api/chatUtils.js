const sql = require('../sql/sql_functions.js');

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

module.exports = { validateChatRateLimitOrThrow, writeChatSecurityAudit };
