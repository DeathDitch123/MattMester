const express = require('express');
const sql = require('../../sql/sql_funtions.js');
const { isAdmin } = require('../funtions.js');
const { notificationService } = require('../../services.js');

const router = express.Router();

// Router-szintű védelem: minden admin route automatikusan isAdmin-ellenőrzésen megy át.
router.use(isAdmin);

function escapeCsvValue(value) {
    const normalized = value === null || value === undefined ? '' : String(value);
    return `"${normalized.replace(/"/g, '""')}"`;
}

router.get('/test', (request, response) => {
    return response.status(200).json({ message: 'Ez a végpont működik.' });
});

router.get('/export-users', async (request, response) => {
    let statusCode = 200;
    let errorMessage = null;
    let csvBody = null;

    try {
        const users = await sql.getAllUsers();
        const headers = [
            'id',
            'username',
            'email',
            'role',
            'profile_image',
            'elo',
            'elo_MM',
            'elo_bullet',
            'is_banned',
            'banned_until',
            'last_active',
            'created_at',
            'wins',
            'losses',
            'draws',
            'total_abilities',
            'win_rate_percent',
            'last_ip'
        ];

        const rows = [headers.join(',')];
        for (const user of users || []) {
            rows.push([
                user.id,
                user.username,
                user.email,
                user.role,
                user.profile_image,
                user.elo,
                user.elo_MM,
                user.elo_bullet,
                user.is_banned,
                user.banned_until,
                user.last_active,
                user.created_at,
                user.wins,
                user.losses,
                user.draws,
                user.total_abilities,
                user.win_rate_percent,
                user.last_ip
            ].map(escapeCsvValue).join(','));
        }

        csvBody = `\uFEFF${rows.join('\n')}`;
    } catch (error) {
        console.error('Admin export-users hiba:', error);
        statusCode = 500;
        errorMessage = 'Szerverhiba a felhasználók exportálása során.';
    }

    let result;
    if (errorMessage) {
        result = response.status(statusCode).json({ message: errorMessage });
    } else {
        const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`;
        response.setHeader('Content-Type', 'text/csv; charset=utf-8');
        response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        result = response.status(statusCode).send(csvBody);
    }
    return result;
});

// POST /api/admin/notifications/send
// Body: { audience: 'user'|'multi'|'global'|'role',
//         targetUserId?: number, targetUsername?: string,
//         targetUserIds?: number[], targetUsernames?: string[],
//         targetRole?: 'player'|'admin',
//         type: string, title: string, message: string,
//         severity?: 'info'|'success'|'warning'|'error',
//         payload?: object }
router.post('/notifications/send', express.json(), async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: 'Szerverhiba az értesítés küldése során.', data: null };
    try {
        const adminUserId = Number(request.session?.userId) || 0;
        const body = request.body || {};
        const audienceRaw = String(body.audience || '').trim().toLowerCase();
        const allowedAudiences = new Set(['user', 'multi', 'global', 'role']);
        if (!allowedAudiences.has(audienceRaw)) {
            statusCode = 400;
            throw new Error('Érvénytelen audience érték.');
        }

        const type = String(body.type || '').trim();
        const title = String(body.title || '').trim();
        const message = String(body.message || '').trim();
        if (!type || !title || !message) {
            statusCode = 400;
            throw new Error('A type, title és message mezők kötelezőek.');
        }

        const severity = ['info', 'success', 'warning', 'error'].includes(body.severity) ? body.severity : 'info';
        const userPayload = body.payload && typeof body.payload === 'object' ? body.payload : null;

        const baseNotification = {
            type,
            title,
            message,
            severity,
            payload: userPayload,
            senderUserId: adminUserId
        };

        let resolvedNotification = null;
        if (audienceRaw === 'user') {
            let resolvedUserId = Number(body.targetUserId) || 0;
            if (!resolvedUserId && body.targetUsername) {
                const found = await sql.findUserByUsernameForAdmin(body.targetUsername);
                resolvedUserId = found?.id || 0;
                if (!resolvedUserId) {
                    statusCode = 404;
                    throw new Error('A megadott felhasználó nem található.');
                }
            }
            if (!resolvedUserId) {
                statusCode = 400;
                throw new Error('user audience esetén targetUserId vagy targetUsername kötelező.');
            }
            resolvedNotification = { ...baseNotification, audience: 'user', targetUserId: resolvedUserId };
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
                throw new Error('multi audience esetén legalább egy érvényes targetUserIds/targetUsernames elem kötelező.');
            }
            resolvedNotification = { ...baseNotification, audience: 'multi', targetUserIds: [...ids] };
        } else if (audienceRaw === 'role') {
            const role = String(body.targetRole || '').trim();
            if (!['player', 'admin'].includes(role)) {
                statusCode = 400;
                throw new Error('role audience esetén targetRole érték kötelező (player|admin).');
            }
            resolvedNotification = { ...baseNotification, audience: 'role', targetRole: role };
        } else {
            resolvedNotification = { ...baseNotification, audience: 'global' };
        }

        const socketHub = request.app?.locals?.socketHub;
        const sendResult = await notificationService.send(socketHub, resolvedNotification);
        if (sendResult.errors?.length && !sendResult.deliveredTo.length) {
            statusCode = 500;
            throw new Error(sendResult.errors[0].error || 'Az értesítés küldése sikertelen.');
        }

        payload = {
            success: true,
            message: `Értesítés elküldve ${sendResult.deliveredTo.length} felhasználónak.`,
            data: {
                deliveredTo: sendResult.deliveredTo.length,
                errors: sendResult.errors,
                notification: sendResult.saved
            }
        };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || payload.message, data: null };
    }
    return response.status(statusCode).json(payload);
});

router.get('/profile-images/pending', async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, data: [], message: 'Szerverhiba a függő profilképek lekérdezése során.' };
    try {
        const pending = await sql.getPendingProfileImages();
        const data = (pending || []).map((row) => ({
            uploadId: row.id,
            userId: row.user_id,
            username: row.username,
            filename: row.filename,
            currentImage: row.current_image,
            uploadTime: row.upload_time,
            status: row.status
        }));
        payload = {
            success: true,
            data,
            message: data.length ? `${data.length} függő profilkép.` : 'Nincs függő profilkép.'
        };
    } catch (error) {
        console.error('Admin pending profile images hiba:', error);
        statusCode = 500;
        payload = { success: false, data: [], message: error.message || payload.message };
    }
    return response.status(statusCode).json(payload);
});

router.post('/profile-images/:uploadId/approve', express.json(), async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: 'Szerverhiba a profilkép jóváhagyása során.' };
    try {
        const adminUserId = Number(request.session?.userId) || 0;
        const uploadId = Number(request.params?.uploadId) || 0;
        if (!uploadId) {
            statusCode = 400;
            throw new Error('Érvénytelen feltöltés azonosító.');
        }

        await sql.approveProfileImage(uploadId, adminUserId);
        payload = {
            success: true,
            message: 'A profilkép jóváhagyva. A kép globálisan láthatóvá vált.',
            data: { uploadId, status: 'approved' }
        };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        const messageLower = String(error?.message || '').toLowerCase();
        if (messageLower.includes('nem talalhato') || messageLower.includes('nem található')) {
            statusCode = 404;
        } else if (messageLower.includes('csak fuggo') || messageLower.includes('csak függő')) {
            statusCode = 409;
        }
        payload = { success: false, message: error.message || payload.message };
    }
    return response.status(statusCode).json(payload);
});

router.post('/profile-images/:uploadId/reject', express.json(), async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: 'Szerverhiba a profilkép elutasítása során.' };
    try {
        const adminUserId = Number(request.session?.userId) || 0;
        const uploadId = Number(request.params?.uploadId) || 0;
        if (!uploadId) {
            statusCode = 400;
            throw new Error('Érvénytelen feltöltés azonosító.');
        }

        const reviewNoteRaw = typeof request.body?.reviewNote === 'string' ? request.body.reviewNote.trim() : '';
        const reviewNote = reviewNoteRaw ? reviewNoteRaw.slice(0, 500) : null;

        await sql.rejectProfileImage(uploadId, adminUserId, reviewNote);
        payload = {
            success: true,
            message: 'A profilkép elutasítva. A publikus kép visszaállt az alapértelmezettre.',
            data: { uploadId, status: 'rejected' }
        };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        const messageLower = String(error?.message || '').toLowerCase();
        if (messageLower.includes('nem található') || messageLower.includes('nem talalhato')) {
            statusCode = 404;
        }
        payload = { success: false, message: error.message || payload.message };
    }
    return response.status(statusCode).json(payload);
});

module.exports = router;
