// AuditLogService - admin_audit_log INSERT + WS broadcast.
// ADMIN_PANEL.md §5, §1.

const adminRepo = require('../../sql/adminRepo.js');
const { REDACTED_FIELDS, CRITICAL_ACTIONS } = require('./constants.js');

let socketHubRef = null;

function bindSocketHub(socketHub) {
    socketHubRef = socketHub || null;
}

// Csak a redactalt mezok nelkuli klont adjuk vissza. Csak felso szint - mely strukturanal
// nem mukodne minden esetben helyesen, ezert minden mely objektumon vegigmegyunk.
function redactObject(input) {
    let result = null;
    try {
        if (input == null) {
            result = null;
        } else if (Array.isArray(input)) {
            result = input.map((item) => redactObject(item));
        } else if (typeof input === 'object') {
            const cleaned = {};
            for (const [key, value] of Object.entries(input)) {
                if (REDACTED_FIELDS.has(key)) {
                    continue;
                }
                if (value && typeof value === 'object') {
                    cleaned[key] = redactObject(value);
                } else {
                    cleaned[key] = value;
                }
            }
            result = cleaned;
        } else {
            result = input;
        }
    } catch (error) {
        console.warn('redactObject hiba:', error.message);
        result = null;
    }
    return result;
}

// Diff: csak a valtozott mezok normal muveletnel; teljes snapshot kritikusnal.
// Visszater: { before, after } redactalva.
function buildDiff(beforeRaw, afterRaw, action) {
    let result = { before: null, after: null };
    try {
        const isCritical = CRITICAL_ACTIONS.has(action);
        const before = redactObject(beforeRaw);
        const after = redactObject(afterRaw);

        if (isCritical) {
            result = { before, after };
        } else if (before && after && typeof before === 'object' && typeof after === 'object'
                   && !Array.isArray(before) && !Array.isArray(after)) {
            const beforeDiff = {};
            const afterDiff = {};
            const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
            for (const key of allKeys) {
                const beforeVal = before[key];
                const afterVal = after[key];
                if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
                    beforeDiff[key] = beforeVal === undefined ? null : beforeVal;
                    afterDiff[key] = afterVal === undefined ? null : afterVal;
                }
            }
            const hasDiff = Object.keys(beforeDiff).length > 0 || Object.keys(afterDiff).length > 0;
            result = hasDiff ? { before: beforeDiff, after: afterDiff } : { before: null, after: null };
        } else {
            result = { before, after };
        }
    } catch (error) {
        console.warn('buildDiff hiba:', error.message);
    }
    return result;
}

function safeBroadcast(eventName, payload) {
    try {
        if (socketHubRef && typeof socketHubRef.broadcastAdmin === 'function') {
            socketHubRef.broadcastAdmin(eventName, payload);
        }
    } catch (error) {
        console.warn('AuditService broadcast hiba:', error.message);
    }
}

// Egysegesitett audit iras + WS broadcast. Sosem dob hibat, hogy a fo flow ne torjon meg.
async function recordAuditEntry(entry) {
    let result = { eventId: null };
    try {
        const action = String(entry.action || '');
        const isCritical = CRITICAL_ACTIONS.has(action);
        const severity = entry.severity || (isCritical ? 'critical' : 'info');
        const diff = buildDiff(entry.beforeState, entry.afterState, action);

        const inserted = await adminRepo.insertAuditEntry({
            actorUserId: entry.actorUserId,
            actorUsername: entry.actorUsername,
            action,
            severity,
            targetType: entry.targetType || null,
            targetId: entry.targetId || null,
            targetKey: entry.targetKey || null,
            targetLabel: entry.targetLabel || null,
            reason: entry.reason || '',
            beforeState: diff.before,
            afterState: diff.after,
            success: Boolean(entry.success),
            errorCode: entry.errorCode || null,
            ipAddress: entry.ipAddress,
            userAgent: entry.userAgent,
            requestId: entry.requestId
        });
        result.eventId = inserted.insertId;

        const broadcastPayload = {
            eventId: inserted.insertId,
            occurredAt: new Date().toISOString(),
            actor: {
                id: entry.actorUserId,
                username: entry.actorUsername,
                ip: entry.ipAddress
            },
            action,
            severity,
            target: entry.targetType ? {
                type: entry.targetType,
                id: entry.targetId || null,
                key: entry.targetKey || null,
                label: entry.targetLabel || null
            } : null,
            reason: entry.reason || '',
            diff,
            success: Boolean(entry.success),
            errorCode: entry.errorCode || null,
            requestId: entry.requestId
        };
        safeBroadcast('admin:audit:created', broadcastPayload);
    } catch (error) {
        console.error('recordAuditEntry hiba:', error.message);
    }
    return result;
}

// Express middleware: a response.on('finish') eventben rogziti az audit bejegyzest.
// A handler a res.locals.adminAudit-ba rakja a beforeState/afterState/target/* mezoket.
function auditFlush(request, response, next) {
    response.on('finish', () => {
        try {
            const ctx = response.locals?.adminAudit;
            if (!ctx || ctx.skip) {
                return;
            }
            const adminAuth = request.adminAuth;
            if (!adminAuth) {
                return;
            }

            const action = ctx.action || request.adminAction || `${request.method} ${request.originalUrl}`;
            const success = ctx.success != null ? Boolean(ctx.success) : (response.statusCode >= 200 && response.statusCode < 400);
            const severity = ctx.severity || (CRITICAL_ACTIONS.has(action) ? 'critical' : 'info');

            // Async firing-and-forgetting; a recordAuditEntry maga mar nyel hibat.
            recordAuditEntry({
                actorUserId: adminAuth.userId,
                actorUsername: adminAuth.username || '',
                action,
                severity,
                targetType: ctx.targetType,
                targetId: ctx.targetId,
                targetKey: ctx.targetKey,
                targetLabel: ctx.targetLabel,
                reason: request.adminReason || ctx.reason || 'n/a',
                beforeState: ctx.beforeState,
                afterState: ctx.afterState,
                success,
                errorCode: success ? null : (ctx.errorCode || `HTTP_${response.statusCode}`),
                ipAddress: adminAuth.ipAddress,
                userAgent: adminAuth.userAgent,
                requestId: request.adminRequestId || ctx.requestId
            }).catch((error) => {
                console.warn('auditFlush async hiba:', error.message);
            });
        } catch (error) {
            console.warn('auditFlush sync hiba:', error.message);
        }
    });
    next();
}

module.exports = {
    bindSocketHub,
    recordAuditEntry,
    auditFlush,
    redactObject,
    buildDiff
};
