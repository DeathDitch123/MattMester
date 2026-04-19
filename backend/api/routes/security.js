const express = require('express');
const sql = require('../../sql/sql_funtions.js');
const { isAuthenticated } = require('../funtions.js');
const { logAuthenticatedAction } = require('./_shared.js');

const router = express.Router();

router.get('/security/activity', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, data: [], message: '' };
    try {
        const userId = Number(request.session?.userId) || 0;
        const rawLimit = Number(request.query?.limit) || 100;
        const limit = Math.min(Math.max(rawLimit, 1), 200);
        const data = await sql.getUserSecurityActivity(userId, limit);
        payload = {
            success: true,
            data,
            message: data.length ? `${data.length} esemény betöltve.` : 'Nincs megjeleníthető biztonsági esemény.'
        };
    } catch (error) {
        console.error('Security activity hiba:', error);
        statusCode = 500;
        payload = { success: false, data: [], message: error.message || 'Szerverhiba a biztonsági napló lekérése során.' };
    }
    return response.status(statusCode).json(payload);
});

router.post('/security/logout-all-devices', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const userId = request.session.userId;
        const store = request.sessionStore;

        if (!store || typeof store.all !== 'function' || typeof store.destroy !== 'function') {
            statusCode = 500;
            throw new Error('A munkamenet tároló nem támogatja az összes eszközről való kijelentkezést.');
        }

        const allSessions = await new Promise((resolve, reject) => {
            store.all((err, sessions) => {
                if (err) return reject(err);
                resolve(sessions || {});
            });
        });

        const entries = Array.isArray(allSessions)
            ? allSessions.map((sess) => [sess && sess.id, sess])
            : Object.entries(allSessions);

        let destroyedCount = 0;
        for (const [sid, sess] of entries) {
            if (!sid || !sess) continue;
            const sessUserId = sess.userId || sess.session?.userId;
            if (sessUserId === userId) {
                await new Promise((resolve) => {
                    store.destroy(sid, () => resolve());
                });
                destroyedCount += 1;
            }
        }

        await logAuthenticatedAction(request, userId, {
            eventType: 'logout_all_devices',
            eventCategory: 'security',
            severity: 'warning',
            source: 'backend',
            success: true,
            message: `Kijelentkezés minden eszközről (${destroyedCount} munkamenet).`,
            metadata: { destroyedSessions: destroyedCount }
        });

        response.clearCookie('connect.sid');

        payload = {
            success: true,
            destroyedSessions: destroyedCount,
            message: `Minden eszközről sikeresen kijelentkeztünk (${destroyedCount} munkamenet).`
        };
    } catch (error) {
        console.error('Logout all devices hiba:', error);
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba az összes eszközről való kijelentkezés során.' };
    }
    return response.status(statusCode).json(payload);
});

module.exports = router;
