// User-vs-user bejelentesek (player report). NEM osszekeverendo a
// chat-uzenet bejelentesekkel (chat.js POST /chat/messages/:id/report).
// Itt egy felhasznalo bejelenthet egy MASIK felhasznalot kategorianak
// megadasaval (cheating, toxicity, spam, harassment, unfair_play, other).
//
// FONTOS: false report eseten NEM bunteti a bejelentot - ellentetben a
// chat-bejelentesekkel, ahol a bejelento 5 oraig nem tud ujabbat tenni
// admin elutasitas eseten. Player-magaviselet utolagosan nehezen
// ellenorizheto, igy a hibas bejelentok visszafogasa elrettentene a valid
// bejelenteseket is.

const express = require('express');
const sql = require('../../sql/sql_funtions.js');
const { isAuthenticated } = require('../funtions.js');
const {
    getAuthenticatedUserIdOrThrow,
    logAuthenticatedAction
} = require('./_shared.js');

const router = express.Router();

router.post('/reports', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: 'Szerverhiba a bejelentes mentese soran.' };
    try {
        const reporterUserId = getAuthenticatedUserIdOrThrow(request);
        const reportedUserId = Number(request.body?.reportedUserId) || 0;
        const category = String(request.body?.category || '').trim().toLowerCase();
        const message = typeof request.body?.message === 'string' ? request.body.message.trim() : '';
        const gameId = Number(request.body?.gameId) || 0;

        if (!reportedUserId) {
            statusCode = 400;
            throw new Error('Hianyzo bejelentett felhasznalo.');
        }
        if (reportedUserId === reporterUserId) {
            statusCode = 400;
            throw new Error('Onmagadat nem jelentheted be.');
        }
        if (!sql.USER_REPORT_CATEGORIES.includes(category)) {
            statusCode = 400;
            throw new Error('Ervenytelen kategoria.');
        }

        const result = await sql.createUserReport({
            reporterUserId,
            reportedUserId,
            category,
            message: message || null,
            gameId: gameId || null
        });

        payload = {
            success: true,
            data: { reportId: result.id, category: result.category, gameId: result.gameId },
            message: 'Bejelentes rogzitve. Az adminisztratorok at fogjak nezni.'
        };

        // Audit-log: ki kit jelentett be, milyen kategoriaban.
        try {
            await logAuthenticatedAction(request, reporterUserId, {
                eventType: 'user_report_submitted',
                eventCategory: 'social',
                severity: 'info',
                source: 'backend',
                success: true,
                message: 'Player bejelentes leadva.',
                metadata: { reportId: result.id, reportedUserId, category, gameId: result.gameId }
            });
        } catch (logErr) {
            console.warn('user_report log hiba:', logErr.message);
        }

        // Real-time push az admin Bejelentesek panelnek.
        try {
            const adminSocketHub = request.app?.locals?.adminSocketHub;
            if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                adminSocketHub.broadcastAdmin('admin:reports:new', {
                    reportId: result.id,
                    reporterUserId,
                    reportedUserId,
                    category: result.category,
                    gameId: result.gameId,
                    at: new Date().toISOString()
                });
            }
        } catch (broadcastErr) {
            console.warn('admin:reports:new broadcast hiba:', broadcastErr.message);
        }
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        const errorMsg = String(error?.message || '').toLowerCase();
        // Rate-limit / dedup esetek 429 / 409.
        if (errorMsg.includes('mar van nyitott') || errorMsg.includes('mar bejelentetted')) {
            statusCode = 409;
        } else if (errorMsg.includes('tul sok bejelentest')) {
            statusCode = 429;
        } else if (errorMsg.includes('nem talalhato')) {
            statusCode = 404;
        }
        payload = { success: false, message: error.message || 'Szerverhiba a bejelentes mentese soran.' };
    }
    return response.status(statusCode).json(payload);
});

module.exports = router;
