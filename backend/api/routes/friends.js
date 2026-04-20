const express = require('express');
const sql = require('../../sql/sql_funtions.js');
const { isAuthenticated } = require('../funtions.js');
const { friendActionLimiter } = require('../middleware/rateLimiter.js');
const { logAuthenticatedAction, parsePositiveInteger } = require('./_shared.js');

const router = express.Router();

// ?POST /api/friends/add - barát kérelem küldése
router.post('/friends/add', friendActionLimiter, isAuthenticated, async (request, response) => {
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
        await logAuthenticatedAction(request, currentUserId, {
            eventType: 'friend_request_accepted',
            eventCategory: 'social',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Barát kérelem elfogadva.',
            metadata: { targetUserId }
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
