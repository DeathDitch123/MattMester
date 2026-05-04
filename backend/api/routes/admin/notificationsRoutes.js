// Eredetileg a backend/api/routes/admin.js egyetlen fajlban volt — szet lett bontva
// rendeltetes szerinti sub-router-ekre. Az index.js mountolja oket /api/admin ala.

const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const sql = require('../../../sql/sql_functions.js');
const adminRepo = require('../../../sql/adminRepo.js');
const { passwordRegex } = require('../../validation.js');

const {
    parseAdminToken,
    requireSuperAdmin,
    requireReasonOnMutate,
    auditContext
} = require('../../admin/middleware.js');
const { auditFlush } = require('../../admin/auditService.js');
const alertingService = require('../../admin/alertingService.js');
const { adminLimiterChain } = require('../../admin/adminRateLimiter.js');
const { ADMIN_PERMISSIONS, ADMIN_ERROR_CODES } = require('../../admin/constants.js');
const { invalidateIpBlockCache } = require('../../middleware/ipBlockGuard.js');
const networkClassifier = require('../../admin/networkClassifier.js');

const router = express.Router();

// =====================================================================
// NOTIFICATION SEND - /notifications/send
// Reason kotelezo. broadcast (audience='global') -> severity critical.
// =====================================================================

function notificationActionResolver(request) {
    const audience = String(request.body?.audience || '').toLowerCase();
    let action = ADMIN_PERMISSIONS.NOTIFICATIONS_SEND;
    if (audience === 'global') {
        action = ADMIN_PERMISSIONS.NOTIFICATIONS_BROADCAST;
    }
    return action;
}

router.post(
    '/notifications/send',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(notificationActionResolver),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba az ertesites kuldese soran.', data: null };
        try {
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            const body = request.body || {};
            const audienceRaw = String(body.audience || '').trim().toLowerCase();
            const allowedAudiences = new Set(['user', 'multi', 'global', 'role']);
            if (!allowedAudiences.has(audienceRaw)) {
                statusCode = 400;
                throw new Error('Ervenytelen audience ertek.');
            }

            const type = String(body.type || '').trim();
            const title = String(body.title || '').trim();
            const message = String(body.message || '').trim();
            if (!type || !title || !message) {
                statusCode = 400;
                throw new Error('A type, title es message mezok kotelezoek.');
            }

            const severity = ['info', 'success', 'warning', 'error'].includes(body.severity) ? body.severity : 'info';
            const userPayload = body.payload && typeof body.payload === 'object' ? body.payload : null;

            const baseNotification = {
                type, title, message, severity,
                payload: userPayload, senderUserId: adminUserId
            };

            let resolvedNotification = null;
            let targetSummary = null;

            if (audienceRaw === 'user') {
                let resolvedUserId = Number(body.targetUserId) || 0;
                if (!resolvedUserId && body.targetUsername) {
                    const found = await sql.findUserByUsernameForAdmin(body.targetUsername);
                    resolvedUserId = found?.id || 0;
                    if (!resolvedUserId) {
                        statusCode = 404;
                        throw new Error('A megadott felhasznalo nem talalhato.');
                    }
                }
                if (!resolvedUserId) {
                    statusCode = 400;
                    throw new Error('user audience eseten targetUserId vagy targetUsername kotelezo.');
                }
                resolvedNotification = { ...baseNotification, audience: 'user', targetUserId: resolvedUserId };
                targetSummary = { type: 'user', id: resolvedUserId };
            } else if (audienceRaw === 'multi') {
                const ids = new Set();
                if (Array.isArray(body.targetUserIds)) {
                    body.targetUserIds.forEach((id) => {
                        const numericId = Number(id) || 0;
                        if (numericId) {
                            ids.add(numericId);
                        }
                    });
                }
                if (Array.isArray(body.targetUsernames)) {
                    for (const username of body.targetUsernames) {
                        const found = await sql.findUserByUsernameForAdmin(username);
                        if (found?.id) {
                            ids.add(found.id);
                        }
                    }
                }
                if (!ids.size) {
                    statusCode = 400;
                    throw new Error('multi audience eseten legalabb egy ervenyes targetUserIds/targetUsernames elem kotelezo.');
                }
                resolvedNotification = { ...baseNotification, audience: 'multi', targetUserIds: [...ids] };
                targetSummary = { type: 'users', count: ids.size };
            } else if (audienceRaw === 'role') {
                const role = String(body.targetRole || '').trim();
                if (!['player', 'admin'].includes(role)) {
                    statusCode = 400;
                    throw new Error('role audience eseten targetRole ertek kotelezo (player|admin).');
                }
                resolvedNotification = { ...baseNotification, audience: 'role', targetRole: role };
                targetSummary = { type: 'role', value: role };
            } else {
                resolvedNotification = { ...baseNotification, audience: 'global' };
                targetSummary = { type: 'global' };
            }

            const socketHub = request.app?.locals?.socketHub;
            const sendResult = await notificationService.send(socketHub, resolvedNotification);
            if (sendResult.errors?.length && !sendResult.deliveredTo.length) {
                statusCode = 500;
                throw new Error(sendResult.errors[0].error || 'Az ertesites kuldese sikertelen.');
            }

            response.locals.adminAudit.action = audienceRaw === 'global'
                ? ADMIN_PERMISSIONS.NOTIFICATIONS_BROADCAST
                : ADMIN_PERMISSIONS.NOTIFICATIONS_SEND;
            response.locals.adminAudit.severity = audienceRaw === 'global' ? 'critical' : 'info';
            response.locals.adminAudit.targetType = 'notification';
            response.locals.adminAudit.targetLabel = title;
            response.locals.adminAudit.afterState = {
                audience: audienceRaw,
                target: targetSummary,
                deliveredTo: sendResult.deliveredTo.length,
                type, title, severity
            };
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: `Ertesites elkuldve ${sendResult.deliveredTo.length} felhasznalonak.`,
                data: {
                    deliveredTo: sendResult.deliveredTo.length,
                    errors: sendResult.errors,
                    notification: sendResult.saved
                }
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message, data: null };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'NOTIFICATION_SEND_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);


module.exports = router;
