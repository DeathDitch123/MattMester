// Jatszmak admin endpointok. /api/admin/games ala mountolva.
//
// GET  /                — lista (status / playerId / search / pagination)
// GET  /counts          — stats (folyamatban / befejezett / megszakitott / dontetlen)
// GET  /:id             — egy meccs reszletes view (lepesek + meta)
// GET  /:id/pgn         — PGN file (Content-Disposition: attachment)
// POST /:id/force-end   — admin force-end (kritikus muvelet, 30 char reason)

const express = require('express');
const router = express.Router();

const gamesAdmin = require('../../sql/modules/gamesAdmin.js');
const {
    parseAdminToken,
    requireReasonOnMutate,
    auditContext
} = require('./middleware.js');
const { auditFlush } = require('./auditService.js');
const { adminLimiterChain } = require('./adminRateLimiter.js');
const { ADMIN_PERMISSIONS } = require('./constants.js');

router.get(
    '/counts',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba.' };
        try {
            const counts = await gamesAdmin.getGameCounts();
            payload = { success: true, data: counts };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.GAMES_VIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.success = true;
            response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/games/counts hiba:', error.message);
            statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.success = false;
        }
        return response.status(statusCode).json(payload);
    }
);

router.get(
    '/',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Belso hiba.' };
        try {
            const list = await gamesAdmin.listGames({
                status: request.query.status,
                playerId: request.query.playerId,
                search: request.query.search,
                limit: request.query.limit,
                offset: request.query.offset
            });
            payload = { success: true, data: list };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.GAMES_VIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.success = true;
            response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/games GET hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
            response.locals.adminAudit.success = false;
        }
        return response.status(statusCode).json(payload);
    }
);

router.get(
    '/:id',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba.' };
        try {
            const id = Number(request.params.id) || 0;
            if (!id) {
                statusCode = 400;
                throw new Error('Ervenytelen meccs id.');
            }
            const game = await gamesAdmin.getGameById(id);
            if (!game) {
                statusCode = 404;
                throw new Error('A meccs nem talalhato.');
            }
            payload = { success: true, data: game };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.GAMES_VIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.success = true;
            response.locals.adminAudit.skip = true;
        } catch (error) {
            console.error('admin/games/:id hiba:', error.message);
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.success = false;
        }
        return response.status(statusCode).json(payload);
    }
);

router.get(
    '/:id/pgn',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        try {
            const id = Number(request.params.id) || 0;
            if (!id) {
                response.locals.adminAudit.action = ADMIN_PERMISSIONS.GAMES_VIEW;
                response.locals.adminAudit.severity = 'warning';
                response.locals.adminAudit.success = false;
                return response.status(400).json({ success: false, message: 'Ervenytelen meccs id.' });
            }
            const game = await gamesAdmin.getGameById(id);
            if (!game) {
                response.locals.adminAudit.action = ADMIN_PERMISSIONS.GAMES_VIEW;
                response.locals.adminAudit.severity = 'warning';
                response.locals.adminAudit.success = false;
                return response.status(404).json({ success: false, message: 'A meccs nem talalhato.' });
            }
            const pgnText = gamesAdmin.buildPgnFromGame(game);
            const filename = `mattmester-game-${id}.pgn`;
            response.setHeader('Content-Type', 'application/x-chess-pgn; charset=utf-8');
            response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.GAMES_VIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'game';
            response.locals.adminAudit.targetId = id;
            response.locals.adminAudit.targetLabel = `game#${id}`;
            response.locals.adminAudit.success = true;
            return response.status(200).send(pgnText);
        } catch (error) {
            console.error('admin/games/:id/pgn hiba:', error.message);
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.GAMES_VIEW;
            response.locals.adminAudit.success = false;
            return response.status(500).json({ success: false, message: error.message });
        }
    }
);

router.post(
    '/:id/force-end',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.GAMES_FORCE_END),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba.' };
        try {
            const id = Number(request.params.id) || 0;
            if (!id) {
                statusCode = 400;
                throw new Error('Ervenytelen meccs id.');
            }
            const adminAuth = request.adminAuth;
            const { before, after } = await gamesAdmin.forceEndGame(id, adminAuth.userId);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.GAMES_FORCE_END;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'game';
            response.locals.adminAudit.targetId = id;
            response.locals.adminAudit.targetLabel = `game#${id}`;
            response.locals.adminAudit.beforeState = { status: before.status };
            response.locals.adminAudit.afterState = { status: after.status, endTime: after.endTime };
            response.locals.adminAudit.success = true;

            try {
                const hub = request.app?.locals?.adminSocketHub;
                if (hub && typeof hub.broadcastAdmin === 'function') {
                    hub.broadcastAdmin('admin:games:ended', {
                        gameId: id,
                        status: after.status,
                        forced: true
                    });
                    // Spectator-szoba is megkapja
                    if (hub.namespace && typeof hub.namespace.to === 'function') {
                        hub.namespace.to(`game:${id}:spectator`).emit('admin:games:force_end', {
                            gameId: id, status: after.status
                        });
                    }
                }
            } catch (_) { /* ignore */ }

            payload = { success: true, message: 'A meccs eroszakosan befejezve.', data: after };
        } catch (error) {
            console.error('admin/games/force-end hiba:', error.message);
            if (statusCode === 200) {
                if (error.code === 'GAME_NOT_FOUND') statusCode = 404;
                else if (error.code === 'GAME_NOT_ONGOING') statusCode = 409;
                else statusCode = 500;
            }
            payload = { success: false, message: error.message || payload.message, code: error.code };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = error.code || 'GAME_FORCE_END_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

module.exports = router;
