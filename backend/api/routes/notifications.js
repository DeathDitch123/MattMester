const express = require('express');
const sql = require('../../sql/sql_functions.js');
const { isAuthenticated } = require('../functions.js');
const { notificationService } = require('../../services.js');
const { parsePositiveInteger, getAuthenticatedUserIdOrThrow } = require('./_shared.js');
const { notificationActionLimiter } = require('../middleware/rateLimiter.js');

const router = express.Router();

router.get('/notifications', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = {
        success: false,
        data: [],
        cursor: null,
        hasMore: false,
        unreadCount: 0,
        message: 'Szerverhiba az értesítések lekérése során.'
    };
    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);
        const userRole = String(request.session?.role || 'player');

        const limit = parsePositiveInteger(request.query?.limit, 30) || 30;
        const cursor = parsePositiveInteger(request.query?.cursor, null);

        const result = await sql.getNotificationsForUser(currentUserId, userRole, limit, cursor);
        const unreadCount = await sql.getUnreadNotificationCount(currentUserId, userRole);

        payload = {
            success: true,
            data: result.data,
            cursor: result.nextCursor,
            hasMore: result.hasMore,
            unreadCount,
            message: result.data.length ? `${result.data.length} értesítés betöltve.` : 'Nincs értesítés.'
        };
    } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('nincs bejelentkezett')) {
            statusCode = 401;
        } else if (statusCode === 200) {
            statusCode = 500;
        }
        payload.message = error.message || payload.message;
    }
    return response.status(statusCode).json(payload);
});

router.get('/notifications/unread-count', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, unreadCount: 0, message: 'Szerverhiba az olvasatlan értesítések lekérése során.' };
    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);
        const userRole = String(request.session?.role || 'player');
        const unreadCount = await sql.getUnreadNotificationCount(currentUserId, userRole);
        payload = { success: true, unreadCount, message: 'OK' };
    } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('nincs bejelentkezett')) {
            statusCode = 401;
        } else if (statusCode === 200) {
            statusCode = 500;
        }
        payload.message = error.message || payload.message;
    }
    return response.status(statusCode).json(payload);
});

router.post('/notifications/:notificationId/read', notificationActionLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, unreadCount: 0, changed: false, message: 'Szerverhiba az értesítés olvasottá jelölése során.' };
    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);
        const userRole = String(request.session?.role || 'player');
        const notificationId = parsePositiveInteger(request.params?.notificationId, null);
        if (!notificationId) {
            statusCode = 400;
            throw new Error('Érvénytelen értesítés azonosító.');
        }

        const markResult = await sql.markNotificationRead(currentUserId, notificationId);
        if (!markResult.changed) {
            console.warn('[notifications] read endpoint: valtozas nelkul futott', {
                userId: currentUserId,
                notificationId
            });
        }
        const socketHub = request.app?.locals?.socketHub;
        const unreadCount = await notificationService.refreshBadgeForUser(socketHub, currentUserId);
        payload = {
            success: true,
            unreadCount,
            changed: Boolean(markResult.changed),
            message: 'Értesítés olvasottnak jelölve.'
        };
    } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('nincs bejelentkezett')) {
            statusCode = 401;
        } else if (statusCode === 200) {
            statusCode = 500;
        }
        console.warn('[notifications] read endpoint hiba:', error.message);
        payload.message = error.message || payload.message;
    }
    return response.status(statusCode).json(payload);
});

// "Mind olvasott" UI gomb backend-je: per-spec ez minden látható értesítést
// permanensen eltávolít a user nézetéből (read+dismiss együtt).
router.post('/notifications/read-all', notificationActionLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, unreadCount: 0, changed: 0, message: 'Szerverhiba az értesítések tömeges eltávolítása során.' };
    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);
        const userRole = String(request.session?.role || 'player');
        const result = await sql.dismissAllNotificationsForUser(currentUserId, userRole);
        const socketHub = request.app?.locals?.socketHub;
        const unreadCount = await notificationService.refreshBadgeForUser(socketHub, currentUserId);
        if (socketHub?.emitNotificationDismissedAll) {
            socketHub.emitNotificationDismissedAll(currentUserId);
        }
        payload = { success: true, unreadCount, changed: result.changed, message: `${result.changed} értesítés eltávolítva.` };
    } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('nincs bejelentkezett')) {
            statusCode = 401;
        } else if (statusCode === 200) {
            statusCode = 500;
        }
        payload.message = error.message || payload.message;
    }
    return response.status(statusCode).json(payload);
});

// Egy értesítés permanens user-oldali eltávolítása (X gomb + akció gombok).
// Idempotens: már dismiss-elt értesítés újra-hívása nem hibázik.
router.post('/notifications/:notificationId/dismiss', notificationActionLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, unreadCount: 0, changed: false, message: 'Szerverhiba az értesítés eltávolítása során.' };
    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);
        const notificationId = parsePositiveInteger(request.params?.notificationId, null);
        if (!notificationId) {
            statusCode = 400;
            throw new Error('Érvénytelen értesítés azonosító.');
        }

        const dismissResult = await sql.dismissNotificationForUser(currentUserId, notificationId);
        const socketHub = request.app?.locals?.socketHub;
        const unreadCount = await notificationService.refreshBadgeForUser(socketHub, currentUserId);
        if (dismissResult.accessible && socketHub?.emitNotificationDismissed) {
            socketHub.emitNotificationDismissed(currentUserId, notificationId);
        }

        payload = {
            success: true,
            unreadCount,
            changed: Boolean(dismissResult.changed),
            alreadyDismissed: Boolean(dismissResult.alreadyDismissed),
            message: dismissResult.changed ? 'Értesítés eltávolítva.' : 'Az értesítés már el volt távolítva.'
        };
    } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        if (message.includes('nincs bejelentkezett')) {
            statusCode = 401;
        } else if (statusCode === 200) {
            statusCode = 500;
        }
        console.warn('[notifications] dismiss endpoint hiba:', error.message);
        payload.message = error.message || payload.message;
    }
    return response.status(statusCode).json(payload);
});

module.exports = router;
