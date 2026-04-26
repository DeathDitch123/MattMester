// Admin panel SQL repo - admin_tokens, admin_audit_log, admin_alert_log, admin_rate_escalations.
// ADMIN_PANEL.md §6 alapjan. Kotelezo szabalyok: 1 return / fn, try-catch DB muveletkor.

const { getPool } = require('./database.js');

// =====================================================================
// admin_tokens
// =====================================================================

async function createAdminToken(userId, tokenHash, expiresAt, issuedIp, issuedUserAgent) {
    let result = { insertId: null };
    try {
        const pool = getPool();
        const [insertResult] = await pool.execute(
            `INSERT INTO admin_tokens (user_id, token_hash, expires_at, issued_ip, issued_user_agent)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, tokenHash, expiresAt, issuedIp || 'ismeretlen', issuedUserAgent || null]
        );
        result = { insertId: insertResult.insertId };
    } catch (error) {
        console.error('createAdminToken hiba:', error.message);
        throw new Error('Admin token mentese sikertelen.');
    }
    return result;
}

async function findActiveAdminToken(tokenHash, userId) {
    let result = null;
    try {
        const pool = getPool();
        const [rows] = await pool.execute(
            `SELECT id, user_id, issued_at, last_used_at, expires_at, revoked_at
             FROM admin_tokens
             WHERE token_hash = ?
               AND user_id = ?
               AND revoked_at IS NULL
               AND expires_at > NOW()
             LIMIT 1`,
            [tokenHash, userId]
        );
        if (rows && rows.length) {
            result = rows[0];
        }
    } catch (error) {
        console.error('findActiveAdminToken hiba:', error.message);
        throw new Error('Admin token lekerdezesi hiba.');
    }
    return result;
}

async function touchAdminToken(tokenId, slidingTtlMs) {
    try {
        const pool = getPool();
        const ttlSeconds = Math.max(1, Math.floor(Number(slidingTtlMs) / 1000) || 900);
        await pool.execute(
            `UPDATE admin_tokens
             SET last_used_at = NOW(),
                 expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND)
             WHERE id = ?`,
            [ttlSeconds, tokenId]
        );
    } catch (error) {
        console.error('touchAdminToken hiba:', error.message);
        throw new Error('Admin token frissitesi hiba.');
    }
}

async function revokeAdminToken(tokenId) {
    try {
        const pool = getPool();
        await pool.execute(
            `UPDATE admin_tokens SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL`,
            [tokenId]
        );
    } catch (error) {
        console.error('revokeAdminToken hiba:', error.message);
        throw new Error('Admin token visszavonasi hiba.');
    }
}

async function revokeAllAdminTokensForUser(userId) {
    let affected = 0;
    try {
        const pool = getPool();
        const [updateResult] = await pool.execute(
            `UPDATE admin_tokens
             SET revoked_at = NOW()
             WHERE user_id = ? AND revoked_at IS NULL`,
            [userId]
        );
        affected = updateResult.affectedRows || 0;
    } catch (error) {
        console.error('revokeAllAdminTokensForUser hiba:', error.message);
        throw new Error('Admin tokenek visszavonasi hiba.');
    }
    return affected;
}

async function deleteExpiredAdminTokens(graceSeconds = 86400) {
    let affected = 0;
    try {
        const pool = getPool();
        const [deleteResult] = await pool.execute(
            `DELETE FROM admin_tokens
             WHERE (revoked_at IS NOT NULL AND revoked_at < DATE_SUB(NOW(), INTERVAL ? SECOND))
                OR expires_at < DATE_SUB(NOW(), INTERVAL ? SECOND)`,
            [graceSeconds, graceSeconds]
        );
        affected = deleteResult.affectedRows || 0;
    } catch (error) {
        console.error('deleteExpiredAdminTokens hiba:', error.message);
        throw new Error('Lejart admin tokenek torlesi hiba.');
    }
    return affected;
}

// =====================================================================
// admin_audit_log
// =====================================================================

async function insertAuditEntry(entry) {
    let result = { insertId: null };
    try {
        const pool = getPool();
        const [insertResult] = await pool.execute(
            `INSERT INTO admin_audit_log (
                actor_user_id, actor_username, action, severity,
                target_type, target_id, target_key, target_label,
                reason, before_state, after_state,
                success, error_code, ip_address, user_agent, request_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                entry.actorUserId,
                entry.actorUsername || '',
                entry.action,
                entry.severity || 'info',
                entry.targetType || null,
                entry.targetId || null,
                entry.targetKey || null,
                entry.targetLabel || null,
                String(entry.reason || ''),
                entry.beforeState == null ? null : JSON.stringify(entry.beforeState),
                entry.afterState == null ? null : JSON.stringify(entry.afterState),
                Boolean(entry.success),
                entry.errorCode || null,
                entry.ipAddress || 'ismeretlen',
                entry.userAgent || null,
                entry.requestId
            ]
        );
        result = { insertId: insertResult.insertId };
    } catch (error) {
        console.error('insertAuditEntry hiba:', error.message);
        throw new Error('Audit bejegyzes mentesi hiba.');
    }
    return result;
}

async function searchAuditEntries(filters = {}) {
    let result = [];
    try {
        const pool = getPool();
        const conditions = [];
        const params = [];

        if (filters.actorUserId) {
            conditions.push('actor_user_id = ?');
            params.push(Number(filters.actorUserId));
        }
        if (filters.action) {
            conditions.push('action = ?');
            params.push(String(filters.action));
        }
        if (filters.severity) {
            conditions.push('severity = ?');
            params.push(String(filters.severity));
        }
        if (filters.targetType) {
            conditions.push('target_type = ?');
            params.push(String(filters.targetType));
        }
        if (filters.targetId) {
            conditions.push('target_id = ?');
            params.push(Number(filters.targetId));
        }
        if (filters.requestId) {
            conditions.push('request_id = ?');
            params.push(String(filters.requestId));
        }
        if (filters.fromDate) {
            conditions.push('occurred_at >= ?');
            params.push(filters.fromDate);
        }
        if (filters.toDate) {
            conditions.push('occurred_at <= ?');
            params.push(filters.toDate);
        }
        if (filters.successOnly === true) {
            conditions.push('success = TRUE');
        } else if (filters.failureOnly === true) {
            conditions.push('success = FALSE');
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 500);
        const offset = Math.max(Number(filters.offset) || 0, 0);

        const [rows] = await pool.query(
            `SELECT id, actor_user_id, actor_username, action, severity,
                    target_type, target_id, target_key, target_label,
                    reason, before_state, after_state,
                    success, error_code, ip_address, user_agent, request_id, occurred_at
             FROM admin_audit_log
             ${whereClause}
             ORDER BY occurred_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        result = rows || [];
    } catch (error) {
        console.error('searchAuditEntries hiba:', error.message);
        throw new Error('Audit kereses hiba.');
    }
    return result;
}

async function getAuditEntriesSinceId(sinceEventId, maxBatch = 200) {
    let result = [];
    try {
        const pool = getPool();
        const safeBatch = Math.min(Math.max(Number(maxBatch) || 200, 1), 500);
        const safeSince = Number(sinceEventId) || 0;
        const [rows] = await pool.query(
            `SELECT id, actor_user_id, actor_username, action, severity,
                    target_type, target_id, target_key, target_label,
                    reason, before_state, after_state,
                    success, error_code, ip_address, user_agent, request_id, occurred_at
             FROM admin_audit_log
             WHERE id > ? AND occurred_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
             ORDER BY id ASC
             LIMIT ?`,
            [safeSince, safeBatch]
        );
        result = rows || [];
    } catch (error) {
        console.error('getAuditEntriesSinceId hiba:', error.message);
        throw new Error('Audit replay lekerdezesi hiba.');
    }
    return result;
}

async function deleteAuditEntriesOlderThan(cutoffDate) {
    let affected = 0;
    try {
        const pool = getPool();
        const [deleteResult] = await pool.execute(
            `DELETE FROM admin_audit_log WHERE occurred_at < ?`,
            [cutoffDate]
        );
        affected = deleteResult.affectedRows || 0;
    } catch (error) {
        console.error('deleteAuditEntriesOlderThan hiba:', error.message);
        throw new Error('Audit retention torlesi hiba.');
    }
    return affected;
}

// =====================================================================
// admin_alert_log
// =====================================================================

async function insertAlertEntry(entry) {
    let result = { insertId: null };
    try {
        const pool = getPool();
        const [insertResult] = await pool.execute(
            `INSERT INTO admin_alert_log (
                kind, severity, user_id, ip_address, endpoint, user_agent, detail
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                entry.kind,
                entry.severity || 'warning',
                entry.userId || null,
                entry.ipAddress || 'ismeretlen',
                entry.endpoint || null,
                entry.userAgent || null,
                entry.detail == null ? null : JSON.stringify(entry.detail)
            ]
        );
        result = { insertId: insertResult.insertId };
    } catch (error) {
        console.error('insertAlertEntry hiba:', error.message);
        throw new Error('Alert bejegyzes mentesi hiba.');
    }
    return result;
}

async function getRecentAlerts(limit = 50) {
    let result = [];
    try {
        const pool = getPool();
        const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 500);
        const [rows] = await pool.query(
            `SELECT id, kind, severity, user_id, ip_address, endpoint, user_agent, detail, occurred_at
             FROM admin_alert_log
             ORDER BY occurred_at DESC
             LIMIT ?`,
            [safeLimit]
        );
        result = rows || [];
    } catch (error) {
        console.error('getRecentAlerts hiba:', error.message);
        throw new Error('Alert lekerdezesi hiba.');
    }
    return result;
}

async function deleteAlertsOlderThan(cutoffDate) {
    let affected = 0;
    try {
        const pool = getPool();
        const [deleteResult] = await pool.execute(
            `DELETE FROM admin_alert_log WHERE occurred_at < ?`,
            [cutoffDate]
        );
        affected = deleteResult.affectedRows || 0;
    } catch (error) {
        console.error('deleteAlertsOlderThan hiba:', error.message);
        throw new Error('Alert retention torlesi hiba.');
    }
    return affected;
}

async function countAlertsSince(sinceDate) {
    let result = 0;
    try {
        const pool = getPool();
        const [rows] = await pool.execute(
            `SELECT COUNT(*) AS cnt FROM admin_alert_log WHERE occurred_at >= ?`,
            [sinceDate]
        );
        result = (rows && rows[0] && Number(rows[0].cnt)) || 0;
    } catch (error) {
        console.error('countAlertsSince hiba:', error.message);
        throw new Error('Alert szamolasi hiba.');
    }
    return result;
}

async function countFailedAdminAttemptsByIp(ipAddress, windowSeconds) {
    let result = 0;
    try {
        const pool = getPool();
        const safeWindow = Math.max(60, Number(windowSeconds) || 600);
        const [rows] = await pool.execute(
            `SELECT COUNT(*) AS cnt
             FROM admin_alert_log
             WHERE ip_address = ?
               AND kind IN ('unauthorized', 'token_invalid')
               AND occurred_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)`,
            [ipAddress, safeWindow]
        );
        result = (rows && rows[0] && Number(rows[0].cnt)) || 0;
    } catch (error) {
        console.error('countFailedAdminAttemptsByIp hiba:', error.message);
        throw new Error('Failed admin attempt szamolasi hiba.');
    }
    return result;
}

// =====================================================================
// admin_rate_escalations
// =====================================================================

async function upsertRateEscalation(scope, scopeValue, multiplier, ttlSeconds, reason) {
    try {
        const pool = getPool();
        const safeMultiplier = Math.max(1.0, Number(multiplier) || 5.0);
        const safeTtl = Math.max(60, Number(ttlSeconds) || 900);
        await pool.execute(
            `INSERT INTO admin_rate_escalations (scope, scope_value, multiplier, expires_at, reason)
             VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?)
             ON DUPLICATE KEY UPDATE
                multiplier = GREATEST(multiplier, VALUES(multiplier)),
                expires_at = GREATEST(expires_at, VALUES(expires_at)),
                reason = VALUES(reason)`,
            [scope, String(scopeValue), safeMultiplier, safeTtl, reason || null]
        );
    } catch (error) {
        console.error('upsertRateEscalation hiba:', error.message);
        throw new Error('Rate escalation mentesi hiba.');
    }
}

async function getActiveRateEscalation(scope, scopeValue) {
    let result = null;
    try {
        const pool = getPool();
        const [rows] = await pool.execute(
            `SELECT id, scope, scope_value, multiplier, started_at, expires_at, reason
             FROM admin_rate_escalations
             WHERE scope = ? AND scope_value = ? AND expires_at > NOW()
             LIMIT 1`,
            [scope, String(scopeValue)]
        );
        if (rows && rows.length) {
            result = rows[0];
        }
    } catch (error) {
        console.error('getActiveRateEscalation hiba:', error.message);
        throw new Error('Rate escalation lekerdezesi hiba.');
    }
    return result;
}

async function deleteExpiredRateEscalations() {
    let affected = 0;
    try {
        const pool = getPool();
        const [deleteResult] = await pool.execute(
            `DELETE FROM admin_rate_escalations WHERE expires_at < NOW()`
        );
        affected = deleteResult.affectedRows || 0;
    } catch (error) {
        console.error('deleteExpiredRateEscalations hiba:', error.message);
        throw new Error('Lejart escalations torlesi hiba.');
    }
    return affected;
}

async function countActiveRateEscalations() {
    let result = 0;
    try {
        const pool = getPool();
        const [rows] = await pool.execute(
            `SELECT COUNT(*) AS cnt FROM admin_rate_escalations WHERE expires_at > NOW()`
        );
        result = (rows && rows[0] && Number(rows[0].cnt)) || 0;
    } catch (error) {
        console.error('countActiveRateEscalations hiba:', error.message);
        throw new Error('Active escalations szamolasi hiba.');
    }
    return result;
}

// =====================================================================
// users (admin-specifikus segedfunkciok)
// =====================================================================

async function getUserForAdminAuth(userId) {
    let result = null;
    try {
        const pool = getPool();
        const [rows] = await pool.execute(
            `SELECT id, username, password_hash, role, is_super_admin
             FROM users
             WHERE id = ?
             LIMIT 1`,
            [userId]
        );
        if (rows && rows.length) {
            result = rows[0];
        }
    } catch (error) {
        console.error('getUserForAdminAuth hiba:', error.message);
        throw new Error('Admin user lekerdezesi hiba.');
    }
    return result;
}

async function countSuperAdmins() {
    let result = 0;
    try {
        const pool = getPool();
        const [rows] = await pool.execute(
            `SELECT COUNT(*) AS cnt FROM users WHERE is_super_admin = TRUE`
        );
        result = (rows && rows[0] && Number(rows[0].cnt)) || 0;
    } catch (error) {
        console.error('countSuperAdmins hiba:', error.message);
        throw new Error('Super admin szamolasi hiba.');
    }
    return result;
}

async function getAdminUserList() {
    let result = [];
    try {
        const pool = getPool();
        const [rows] = await pool.execute(
            `SELECT id, username, email, role, is_super_admin, last_active, created_at
             FROM users
             WHERE role = 'admin'
             ORDER BY is_super_admin DESC, username ASC`
        );
        result = rows || [];
    } catch (error) {
        console.error('getAdminUserList hiba:', error.message);
        throw new Error('Admin lista lekerdezesi hiba.');
    }
    return result;
}

async function setUserAdminRole(userId, makeAdmin, makeSuperAdmin) {
    let beforeState = null;
    let afterState = null;
    try {
        const pool = getPool();
        const [beforeRows] = await pool.execute(
            `SELECT id, username, role, is_super_admin FROM users WHERE id = ? LIMIT 1`,
            [userId]
        );
        if (!beforeRows.length) {
            throw new Error('A felhasznalo nem talalhato.');
        }
        beforeState = beforeRows[0];

        const newRole = makeAdmin ? 'admin' : 'player';
        const newSuper = makeAdmin && makeSuperAdmin ? 1 : 0;
        await pool.execute(
            `UPDATE users SET role = ?, is_super_admin = ? WHERE id = ?`,
            [newRole, newSuper, userId]
        );

        const [afterRows] = await pool.execute(
            `SELECT id, username, role, is_super_admin FROM users WHERE id = ? LIMIT 1`,
            [userId]
        );
        afterState = afterRows[0] || null;
    } catch (error) {
        console.error('setUserAdminRole hiba:', error.message);
        throw error;
    }
    return { beforeState, afterState };
}

module.exports = {
    // tokens
    createAdminToken,
    findActiveAdminToken,
    touchAdminToken,
    revokeAdminToken,
    revokeAllAdminTokensForUser,
    deleteExpiredAdminTokens,
    // audit
    insertAuditEntry,
    searchAuditEntries,
    getAuditEntriesSinceId,
    deleteAuditEntriesOlderThan,
    // alerts
    insertAlertEntry,
    getRecentAlerts,
    deleteAlertsOlderThan,
    countAlertsSince,
    countFailedAdminAttemptsByIp,
    // escalations
    upsertRateEscalation,
    getActiveRateEscalation,
    deleteExpiredRateEscalations,
    countActiveRateEscalations,
    // users (admin)
    getUserForAdminAuth,
    countSuperAdmins,
    getAdminUserList,
    setUserAdminRole
};
