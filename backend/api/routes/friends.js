const express = require('express');
const sql = require('../../sql/sql_functions.js');
const { isAuthenticated, requireVerifiedEmail } = require('../functions.js');
const { friendActionLimiter } = require('../middleware/rateLimiter.js');
const { logAuthenticatedAction, parsePositiveInteger } = require('./_shared.js');
const { notificationService } = require('../../services.js');

const router = express.Router();

// Kapcsolat megszűnés után: cleanup a chat-en + real-time értesítés.
// Hibát nem dob, a hívó flow már sikeres (friend action megtörtént).
async function performChatCleanupAfterRelationChange(request, currentUserId, targetUserId, reason) {
    let cleanupResult = { deletedConversationIds: [], participantUserIds: [] };
    try {
        const result = await sql.cleanupDirectConversationBetween(currentUserId, targetUserId);
        const socketHub = request.app?.locals?.socketHub;
        if (socketHub?.notifyConversationDeleted && result.deletedConversationIds.length) {
            result.deletedConversationIds.forEach((conversationId) => {
                socketHub.notifyConversationDeleted(conversationId, result.participantUserIds, reason);
            });
        }
        if (socketHub?.emitChatUnreadUpdate) {
            const affected = [...new Set([currentUserId, targetUserId, ...(result.participantUserIds || [])])].filter(Boolean);
            for (const uid of affected) {
                try {
                    await notificationService.refreshChatUnreadForUser(socketHub, uid);
                } catch (chatBadgeError) {
                    console.warn('[friends] chat unread refresh hiba:', chatBadgeError.message);
                }
            }
        }
        cleanupResult = result;
    } catch (cleanupError) {
        console.warn(`[friends] chat cleanup hiba (${reason}):`, cleanupError.message);
    }
    return cleanupResult;
}

async function pushFriendNotification(request, { senderUserId, targetUserId, type, title, message, severity = 'info', extraPayload = {} }) {
    let result = null;
    try {
        const socketHub = request.app?.locals?.socketHub;
        const senderUser = await sql.getUserBasicById(senderUserId);
        const payload = {
            ...extraPayload,
            senderUserId,
            senderUsername: senderUser?.username || null,
            targetUserId
        };
        result = await notificationService.send(socketHub, {
            type,
            audience: 'user',
            targetUserId,
            senderUserId,
            title,
            message,
            severity,
            payload
        });
    } catch (notifyError) {
        console.warn(`[friends] notification push hiba (${type}):`, notifyError.message);
    }
    return result;
}

// Friend action (accept/reject/block) után a kapcsolódó friend_request
// értesítéseket permanensen eltávolítja az aktuális user nézetéből, hogy
// session-váltás / re-login után se jöjjenek vissza, és multi-tab szinkronhoz
// kibocsát egy notification:dismissed-bulk eseményt.
async function dismissRelatedFriendRequestNotification(request, currentUserId, targetUserId) {
    try {
        const result = await sql.dismissFriendRequestNotificationsForUser(currentUserId, targetUserId);
        if (result.changed > 0) {
            const socketHub = request.app?.locals?.socketHub;
            await notificationService.refreshBadgeForUser(socketHub, currentUserId);
            if (socketHub?.emitNotificationDismissedBulk) {
                socketHub.emitNotificationDismissedBulk(currentUserId, {
                    type: 'friend_request',
                    senderUserId: targetUserId
                });
            }
        }
    } catch (error) {
        console.warn('[friends] friend_request dismiss safety-net hiba:', error.message);
    }
}

// ?POST /api/friends/add - barát kérelem küldése
router.post('/friends/add', friendActionLimiter, isAuthenticated, requireVerifiedEmail, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const { targetUserId } = request.body;

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!targetUserId || typeof targetUserId !== 'number') { statusCode = 400; throw new Error('Érvénytelen target user ID.'); }
        if (currentUserId === targetUserId) { statusCode = 400; throw new Error('Nem adhatsz hozzá magadat barátnak.'); }

        const result = await sql.addFriendRequest(currentUserId, targetUserId);
        await logAuthenticatedAction(request, currentUserId, {
            eventType: 'friend_request_sent',
            eventCategory: 'social',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Barát kérelem küldve.',
            metadata: { targetUserId }
        });
        const senderUser = await sql.getUserBasicById(currentUserId);
        await pushFriendNotification(request, {
            senderUserId: currentUserId,
            targetUserId,
            type: 'friend_request',
            title: 'Új barát kérelem',
            message: `${senderUser?.username || 'Egy felhasználó'} barát kérelmet küldött.`,
            severity: 'info',
            extraPayload: { actions: ['profile', 'accept', 'reject', 'block'] }
        });
        payload = { success: true, message: result.message };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a barát kérelem küldése során.' };
    }
    return response.status(statusCode).json(payload);
});

router.get('/friends/list', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const requestedStatus = String(request.query?.status || 'friend').trim().toLowerCase();
        const allowedStatuses = new Set(['all', 'pending', 'friend', 'blocked']);

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!allowedStatuses.has(requestedStatus)) { statusCode = 400; throw new Error('Érvénytelen státusz szűrő.'); }

        const data = await sql.getFriendListForUser(currentUserId, requestedStatus);
        payload = {
            success: true,
            data,
            filter: requestedStatus,
            message: data.length ? `${data.length} találat` : 'Nincs megjeleníthető kapcsolat a kiválasztott szűrőre.'
        };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a barát lista lekérése során.' };
    }
    return response.status(statusCode).json(payload);
});

router.post('/friends/accept', friendActionLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parsePositiveInteger(request.body?.targetUserId, null);

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!targetUserId) { statusCode = 400; throw new Error('Érvénytelen target user ID.'); }

        const result = await sql.acceptFriendRequest(currentUserId, targetUserId);
        await dismissRelatedFriendRequestNotification(request, currentUserId, targetUserId);
        await logAuthenticatedAction(request, currentUserId, {
            eventType: 'friend_request_accepted',
            eventCategory: 'social',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Barát kérelem elfogadva.',
            metadata: { targetUserId }
        });
        const accepter = await sql.getUserBasicById(currentUserId);
        await pushFriendNotification(request, {
            senderUserId: currentUserId,
            targetUserId,
            type: 'friend_accepted',
            title: 'Barát kérelem elfogadva',
            message: `${accepter?.username || 'Egy felhasználó'} elfogadta a barát kérelmedet.`,
            severity: 'success'
        });
        payload = { success: true, message: result.message };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a barát kérelem elfogadása során.' };
    }
    return response.status(statusCode).json(payload);
});

router.post('/friends/reject', friendActionLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parsePositiveInteger(request.body?.targetUserId, null);

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!targetUserId) { statusCode = 400; throw new Error('Érvénytelen target user ID.'); }

        const result = await sql.rejectFriendRequest(currentUserId, targetUserId);
        await dismissRelatedFriendRequestNotification(request, currentUserId, targetUserId);
        await logAuthenticatedAction(request, currentUserId, {
            eventType: 'friend_request_rejected',
            eventCategory: 'social',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Barát kérelem elutasítva.',
            metadata: { targetUserId }
        });
        payload = { success: true, message: result.message };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a barát kérelem elutasítása során.' };
    }
    return response.status(statusCode).json(payload);
});

router.post('/friends/block', friendActionLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parsePositiveInteger(request.body?.targetUserId, null);

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!targetUserId) { statusCode = 400; throw new Error('Érvénytelen target user ID.'); }
        if (currentUserId === targetUserId) { statusCode = 400; throw new Error('Nem tilthatod le saját magadat.'); }

        const result = await sql.blockUserDirectional(currentUserId, targetUserId);
        await dismissRelatedFriendRequestNotification(request, currentUserId, targetUserId);
        await performChatCleanupAfterRelationChange(request, currentUserId, targetUserId, 'blocked');
        const blocker = await sql.getUserBasicById(currentUserId);
        await pushFriendNotification(request, {
            senderUserId: currentUserId,
            targetUserId,
            type: 'friend_blocked',
            title: 'Letiltottak',
            message: `${blocker?.username || 'Egy felhasználó'} letiltott.`,
            severity: 'warning'
        });
        await logAuthenticatedAction(request, currentUserId, {
            eventType: 'friend_blocked',
            eventCategory: 'social',
            severity: 'warning',
            source: 'backend',
            success: true,
            message: 'Felhasználó letiltva.',
            metadata: { targetUserId }
        });
        payload = { success: true, message: result.message };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a tiltás során.' };
    }
    return response.status(statusCode).json(payload);
});

router.delete('/friends/unblock/:targetUserId', friendActionLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parsePositiveInteger(request.params?.targetUserId, null);

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!targetUserId) { statusCode = 400; throw new Error('Érvénytelen target user ID.'); }

        const result = await sql.unblockUserDirectional(currentUserId, targetUserId);
        await logAuthenticatedAction(request, currentUserId, {
            eventType: 'friend_unblocked',
            eventCategory: 'social',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Letiltás feloldva.',
            metadata: { targetUserId }
        });
        payload = { success: true, message: result.message };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a tiltás feloldása során.' };
    }
    return response.status(statusCode).json(payload);
});

router.delete('/friends/:targetUserId', friendActionLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parsePositiveInteger(request.params?.targetUserId, null);

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!targetUserId) { statusCode = 400; throw new Error('Érvénytelen target user ID.'); }

        const result = await sql.deleteFriendConnection(currentUserId, targetUserId);
        await performChatCleanupAfterRelationChange(request, currentUserId, targetUserId, 'unfriended');
        await logAuthenticatedAction(request, currentUserId, {
            eventType: 'friend_removed',
            eventCategory: 'social',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Barát kapcsolat törölve.',
            metadata: { targetUserId }
        });
        payload = { success: true, message: result.message };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a barát kapcsolat törlése során.' };
    }
    return response.status(statusCode).json(payload);
});

module.exports = router;
