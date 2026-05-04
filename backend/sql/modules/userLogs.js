const { getPool } = require('../database.js');

async function insertUserLog(userId, logData) {
    const pool = getPool();
    const metadata = logData.metadata || null;
    const ipAddress = logData.ipAddress || (metadata && metadata.ipAddress) || null;
    const userAgent = logData.userAgent || (metadata && metadata.userAgent) || null;
    const metadataValue = metadata == null ? null : JSON.stringify(metadata);
    let result = { insertId: null };

    const query = `
        INSERT INTO user_logs (
            user_id,
            event_type,
            event_category,
            severity,
            source,
            success,
            message,
            ip_address,
            user_agent,
            metadata,
            occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
        userId,
        logData.eventType || 'profile_update',
        logData.eventCategory || 'profile',
        logData.severity || 'info',
        logData.source || 'backend',
        typeof logData.success === 'boolean' ? logData.success : null,
        logData.message || null,
        ipAddress,
        userAgent,
        metadataValue,
        logData.occurredAt || new Date()
    ];

    try {
        const [insertResult] = await pool.execute(query, params);
        result = { insertId: insertResult.insertId };
    } catch (error) {
        throw new Error('Hiba a felhasznaloi log mentese soran.');
    }
    return result;
}

async function getUserSecurityActivity(userId, limit = 100) {
    const pool = getPool();
    const maxRows = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const query = `
        SELECT id, event_type, event_category, severity, success, message,
               ip_address, user_agent, metadata, occurred_at
        FROM user_logs
        WHERE user_id = ? AND event_category IN ('auth', 'security', 'profile', 'social')
        ORDER BY occurred_at DESC
        LIMIT ?
    `;
    let result = [];

    try {
        const [rows] = await pool.query(query, [userId, maxRows]);
        result = (rows || []).map((row) => {
            let metadata = null;
            if (row.metadata != null) {
                try {
                    metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
                } catch (_error) {
                    metadata = null;
                }
            }
            return {
                id: `log-${row.id}`,
                occurredAt: row.occurred_at,
                eventType: row.event_type,
                eventCategory: row.event_category,
                severity: row.severity,
                success: row.success === null ? null : Boolean(row.success),
                message: row.message,
                ipAddress: row.ip_address || (metadata && metadata.ipAddress) || null,
                userAgent: row.user_agent || (metadata && metadata.userAgent) || null,
                metadata
            };
        });
    } catch (error) {
        throw new Error('Hiba a biztonsági napló lekérdezése során.');
    }
    return result;
}

module.exports = {
    insertUserLog,
    getUserSecurityActivity
};
