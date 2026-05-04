// AlertingService - jogosulatlan probalkozas, lejart token, rate eszkalacio.
// ADMIN_PANEL.md §1, §5.2, §5.3, §7.2.
//
// Felelossegek:
//  - admin_alert_log INSERT
//  - admin:room WS broadcast (admin:alert:*)
//  - rate escalation aktivalasa (admin_rate_escalations) ismetelt jogosulatlan probalkozasnal

const adminRepo = require('../../sql/adminRepo.js');
const {
    RATE_ESCALATION_DEFAULT_MULTIPLIER,
    RATE_ESCALATION_DEFAULT_TTL_SEC,
    RATE_ESCALATION_TRIGGER_FAILURE_COUNT,
    RATE_ESCALATION_TRIGGER_WINDOW_SEC
} = require('./constants.js');

let socketHubRef = null;

function bindSocketHub(socketHub) {
    socketHubRef = socketHub || null;
}

function safeBroadcast(eventName, payload) {
    try {
        if (socketHubRef && typeof socketHubRef.broadcastAdmin === 'function') {
            socketHubRef.broadcastAdmin(eventName, payload);
        }
    } catch (error) {
        console.warn('AlertingService broadcast hiba:', error.message);
    }
}

async function insertAndMaybeEscalate(alert) {
    let result = { alertId: null, escalated: false };
    try {
        const inserted = await adminRepo.insertAlertEntry(alert);
        result.alertId = inserted.insertId;

        // Eszkalacio: ha az adott IP X probalkozason atlepett az ablakon belul, multiplier emeles.
        if (alert.ipAddress && alert.ipAddress !== 'ismeretlen') {
            const failedCount = await adminRepo.countFailedAdminAttemptsByIp(
                alert.ipAddress,
                RATE_ESCALATION_TRIGGER_WINDOW_SEC
            );
            if (failedCount >= RATE_ESCALATION_TRIGGER_FAILURE_COUNT) {
                await adminRepo.upsertRateEscalation(
                    'ip',
                    alert.ipAddress,
                    RATE_ESCALATION_DEFAULT_MULTIPLIER,
                    RATE_ESCALATION_DEFAULT_TTL_SEC,
                    `Tobb mint ${RATE_ESCALATION_TRIGGER_FAILURE_COUNT} sikertelen admin probalkozas ${RATE_ESCALATION_TRIGGER_WINDOW_SEC} mp ablakban.`
                );
                result.escalated = true;

                safeBroadcast('admin:alert:rate_escalated', {
                    alertId: result.alertId,
                    occurredAt: new Date().toISOString(),
                    ip: alert.ipAddress,
                    multiplier: RATE_ESCALATION_DEFAULT_MULTIPLIER,
                    ttlSec: RATE_ESCALATION_DEFAULT_TTL_SEC,
                    failedCount
                });
            }
        }
    } catch (error) {
        console.error('insertAndMaybeEscalate hiba:', error.message);
        // Nem rethrow - az alerting nem akadalyozhatja meg a fo flow-t.
    }
    return result;
}

async function recordUnauthorized({ ipAddress, userAgent, endpoint, reason, userId }) {
    let result = { alertId: null };
    try {
        const inserted = await insertAndMaybeEscalate({
            kind: 'unauthorized',
            severity: 'warning',
            userId: userId || null,
            ipAddress,
            endpoint,
            userAgent,
            detail: { reason: reason || 'unknown' }
        });
        result = inserted;

        safeBroadcast('admin:alert:unauthorized', {
            alertId: inserted.alertId,
            occurredAt: new Date().toISOString(),
            ip: ipAddress,
            userId: userId || null,
            endpoint,
            reason: reason || 'unknown',
            escalated: inserted.escalated || false
        });
    } catch (error) {
        console.error('recordUnauthorized hiba:', error.message);
    }
    return result;
}

async function recordTokenInvalid({ ipAddress, userAgent, endpoint, userId }) {
    let result = { alertId: null };
    try {
        const inserted = await insertAndMaybeEscalate({
            kind: 'token_invalid',
            severity: 'warning',
            userId: userId || null,
            ipAddress,
            endpoint,
            userAgent,
            detail: { reason: 'token_invalid_or_expired' }
        });
        result = inserted;

        safeBroadcast('admin:alert:token_invalid', {
            alertId: inserted.alertId,
            occurredAt: new Date().toISOString(),
            ip: ipAddress,
            userId: userId || null,
            endpoint,
            escalated: inserted.escalated || false
        });
    } catch (error) {
        console.error('recordTokenInvalid hiba:', error.message);
    }
    return result;
}

async function recordSuspiciousPattern({ ipAddress, userAgent, endpoint, userId, detail }) {
    let result = { alertId: null };
    try {
        const inserted = await adminRepo.insertAlertEntry({
            kind: 'suspicious_pattern',
            severity: 'critical',
            userId: userId || null,
            ipAddress,
            endpoint,
            userAgent,
            detail: detail || null
        });
        result.alertId = inserted.insertId;

        safeBroadcast('admin:alert:suspicious_pattern', {
            alertId: result.alertId,
            occurredAt: new Date().toISOString(),
            ip: ipAddress,
            userId: userId || null,
            endpoint,
            detail: detail || null
        });
    } catch (error) {
        console.error('recordSuspiciousPattern hiba:', error.message);
    }
    return result;
}

// Altalanos admin akcio alert: ban/unban/delete utan a target user-rel.
// kind pl. 'user_banned', 'user_unbanned', 'user_deleted'.
async function recordAdminAction({ kind, severity = 'warning', userId, ipAddress, userAgent, endpoint, detail }) {
    let result = { alertId: null };
    try {
        const inserted = await adminRepo.insertAlertEntry({
            kind,
            severity,
            userId: userId || null,
            ipAddress,
            endpoint,
            userAgent,
            detail: detail || null
        });
        result.alertId = inserted.insertId;

        safeBroadcast(`admin:alert:${kind}`, {
            alertId: result.alertId,
            occurredAt: new Date().toISOString(),
            kind,
            severity,
            ip: ipAddress,
            userId: userId || null,
            endpoint,
            detail: detail || null
        });
    } catch (error) {
        console.error(`recordAdminAction (${kind}) hiba:`, error.message);
    }
    return result;
}

module.exports = {
    bindSocketHub,
    recordUnauthorized,
    recordTokenInvalid,
    recordSuspiciousPattern,
    recordAdminAction
};
