// Admin socket namespace - io.of('/admin') + handshake auth + replay.
// ADMIN_PANEL.md §4.

const tokenService = require('./tokenService.js');
const adminRepo = require('../../sql/adminRepo.js');
const {
    REPLAY_BATCH_MAX_SIZE,
    REPLAY_MAX_BATCHES_PER_CONNECTION,
    REPLAY_WINDOW_HOURS
} = require('./constants.js');

const ADMIN_ROOM = 'admin:room';

function adminUserRoom(userId) {
    return `admin:user:${userId}`;
}

function safeNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function getHandshakeIp(socket) {
    const forwarded = String(socket.handshake?.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const remote = socket.handshake?.address || null;
    return forwarded || remote || 'ismeretlen';
}

// Handshake middleware: session + adminToken + role + token user_id egyezes.
async function adminHandshake(socket, next) {
    try {
        const session = socket.request?.session || {};
        const sessionUserId = safeNumber(session.userId, 0);
        const sessionRole = session.role || null;

        if (!sessionUserId || sessionRole !== 'admin') {
            return next(new Error('Admin session szukseges.'));
        }

        const auth = socket.handshake?.auth || {};
        const plainToken = String(auth.adminToken || '').trim();
        if (!plainToken) {
            return next(new Error('Admin token hianyzik.'));
        }

        const verified = await tokenService.verifyAndTouchToken(plainToken, sessionUserId);
        if (!verified) {
            return next(new Error('Admin token lejart vagy ervenytelen.'));
        }

        // Folytonos jogosultsag-ellenorzes: DB szerint admin-e meg + nincs ban.
        const dbUser = await adminRepo.getUserForAdminAuth(sessionUserId);
        const dbRole = String(dbUser?.role || '').toLowerCase();
        if (!dbUser || dbRole !== 'admin' || dbUser.is_banned) {
            try { await tokenService.revokeAllForUser(sessionUserId); } catch (_) {}
            return next(new Error(dbUser?.is_banned
                ? 'A fiokod tiltas alatt all.'
                : 'Mar nincs admin jogosultsagod.'));
        }

        socket.data.adminAuth = {
            userId: sessionUserId,
            username: dbUser?.username || session.username || '',
            isSuperAdmin: Boolean(dbUser?.is_super_admin),
            tokenId: verified.tokenId,
            ipAddress: getHandshakeIp(socket)
        };
        return next();
    } catch (error) {
        console.error('adminHandshake hiba:', error.message);
        return next(new Error('Belso hiba az admin handshake soran.'));
    }
}

function createAdminNamespace(io) {
    let nsp = null;
    try {
        nsp = io.of('/admin');
        nsp.use(adminHandshake);

        nsp.on('connection', (socket) => {
            const auth = socket.data.adminAuth || {};
            const userId = auth.userId;
            const replayCounter = { batchesUsed: 0 };

            socket.join(ADMIN_ROOM);
            if (userId) {
                socket.join(adminUserRoom(userId));
            }

            socket.emit('admin:presence:welcome', {
                connectedAt: new Date().toISOString(),
                userId: userId || null,
                username: auth.username || null,
                isSuperAdmin: Boolean(auth.isSuperAdmin)
            });

            socket.on('admin:presence:hello', () => {
                socket.emit('admin:presence:state', {
                    online: nsp.sockets.size,
                    at: new Date().toISOString()
                });
            });

            socket.on('admin:replay:request', async (payload = {}) => {
                try {
                    if (replayCounter.batchesUsed >= REPLAY_MAX_BATCHES_PER_CONNECTION) {
                        socket.emit('admin:replay:error', {
                            code: 'REPLAY_LIMIT',
                            message: `Maximum ${REPLAY_MAX_BATCHES_PER_CONNECTION} replay batch / kapcsolat.`
                        });
                        return;
                    }

                    const sinceEventId = safeNumber(payload?.sinceEventId, 0);
                    const events = await adminRepo.getAuditEntriesSinceId(sinceEventId, REPLAY_BATCH_MAX_SIZE);
                    const tooOld = events.length === 0 && sinceEventId > 0;

                    replayCounter.batchesUsed += 1;
                    const lastId = events.length ? events[events.length - 1].id : sinceEventId;
                    const hasMore = events.length === REPLAY_BATCH_MAX_SIZE;

                    socket.emit('admin:replay:batch', {
                        events: events.map((row) => ({
                            eventId: row.id,
                            occurredAt: row.occurred_at,
                            actor: { id: row.actor_user_id, username: row.actor_username },
                            action: row.action,
                            severity: row.severity,
                            target: row.target_type ? {
                                type: row.target_type,
                                id: row.target_id,
                                key: row.target_key,
                                label: row.target_label
                            } : null,
                            reason: row.reason,
                            success: Boolean(row.success),
                            requestId: row.request_id
                        })),
                        nextCursor: lastId,
                        hasMore,
                        windowHours: REPLAY_WINDOW_HOURS,
                        tooOld
                    });
                } catch (error) {
                    console.error('admin:replay:request hiba:', error.message);
                    socket.emit('admin:replay:error', {
                        code: 'REPLAY_ERROR',
                        message: 'Replay lekerdezesi hiba.'
                    });
                }
            });

            // Jatszma spectator (kibic) handlerek — admin egyszer csatlakozik egy
            // konkret meccs spectator szobajaba, onnantol minden lepest megkap.
            const spectatedGameIds = new Set();

            socket.on('admin:games:spectate:join', (payload = {}) => {
                try {
                    const gameId = safeNumber(payload?.gameId, 0);
                    if (!gameId) return;
                    const room = `game:${gameId}:spectator`;
                    socket.join(room);
                    spectatedGameIds.add(gameId);
                    socket.emit('admin:games:spectate:joined', { gameId });
                } catch (error) {
                    console.warn('admin:games:spectate:join hiba:', error.message);
                }
            });

            socket.on('admin:games:spectate:leave', (payload = {}) => {
                try {
                    const gameId = safeNumber(payload?.gameId, 0);
                    if (!gameId) return;
                    const room = `game:${gameId}:spectator`;
                    socket.leave(room);
                    spectatedGameIds.delete(gameId);
                    socket.emit('admin:games:spectate:left', { gameId });
                } catch (error) {
                    console.warn('admin:games:spectate:leave hiba:', error.message);
                }
            });

            socket.on('disconnect', (reason) => {
                spectatedGameIds.clear();
                console.log(`[admin-ns] disconnect user=${userId} reason=${reason}`);
            });
        });
    } catch (error) {
        console.error('createAdminNamespace hiba:', error.message);
        throw error;
    }
    return nsp;
}

function createAdminBroadcaster(adminNamespace) {
    return function broadcastAdmin(eventName, payload) {
        try {
            if (!adminNamespace) {
                return;
            }
            adminNamespace.to(ADMIN_ROOM).emit(eventName, payload);
        } catch (error) {
            console.warn('broadcastAdmin hiba:', error.message);
        }
    };
}

// Egy konkret jatszma spectator-szobajaba kuld eseményt. A pvp.js move handlere
// hivja minden lepes utan, hogy az admin spectator-ok elo-elo lassak a meccset.
function createSpectatorBroadcaster(adminNamespace) {
    return function broadcastSpectator(gameId, eventName, payload) {
        try {
            if (!adminNamespace || !gameId) {
                return;
            }
            adminNamespace.to(`game:${gameId}:spectator`).emit(eventName, payload);
        } catch (error) {
            console.warn('broadcastSpectator hiba:', error.message);
        }
    };
}

function createAdminUserEmitter(adminNamespace) {
    return function emitToAdminUser(userId, eventName, payload) {
        try {
            if (!adminNamespace || !userId) {
                return;
            }
            adminNamespace.to(adminUserRoom(userId)).emit(eventName, payload);
        } catch (error) {
            console.warn('emitToAdminUser hiba:', error.message);
        }
    };
}

// Egy konkret felhasznalo MINDEN admin namespace socketjet erőből szakítja le.
// Hasznalat: admin jog elvonas / ban utan, hogy a tovabbi WS aktivitas se folytatodjon.
// Lebontas elott emit egy `admin:force-logout` eventet is, hogy a frontend
// tisztan tisztitsa a tokent es navigaljon el.
function createAdminUserDisconnector(adminNamespace) {
    return async function disconnectAllForAdminUser(userId, reason = 'role_revoked') {
        let disconnected = 0;
        try {
            if (!adminNamespace || !userId) return 0;
            const room = adminUserRoom(userId);
            const sockets = await adminNamespace.in(room).fetchSockets();
            for (const s of sockets) {
                try {
                    s.emit('admin:force-logout', { reason, at: new Date().toISOString() });
                } catch (_) {}
                try {
                    s.disconnect(true);
                    disconnected += 1;
                } catch (_) {}
            }
        } catch (error) {
            console.warn('disconnectAllForAdminUser hiba:', error.message);
        }
        return disconnected;
    };
}

module.exports = {
    createAdminNamespace,
    createAdminBroadcaster,
    createAdminUserEmitter,
    createAdminUserDisconnector,
    createSpectatorBroadcaster,
    ADMIN_ROOM
};
