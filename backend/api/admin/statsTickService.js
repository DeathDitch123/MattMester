// Admin dashboard live stats tick (ADMIN_PANEL.md §F4 / events table).
// Periodically computes a rich payload (presence + 24h audit/alerts + rate-limit)
// and emits `admin:stats:tick` to the admin namespace's admin:room.

const adminRepo = require('../../sql/adminRepo.js');

const TICK_INTERVAL_MS = 5000;

let intervalHandle = null;
let cachedDeps = null;

function safeNumber(value, fallback = 0) {
    const parsed = Number(value);
    let result = fallback;
    if (Number.isFinite(parsed)) {
        result = parsed;
    }
    return result;
}

function buildOnlineSection(presence, ongoingGameCount) {
    const clients = Array.isArray(presence?.clients) ? presence.clients : [];
    let totalAdmins = 0;
    let inMatchmaking = 0;
    for (const client of clients) {
        if (client?.role === 'admin') {
            totalAdmins += 1;
        }
        const tabs = Array.isArray(client?.tabs) ? client.tabs : [];
        for (const tab of tabs) {
            const page = String(tab?.page || '').toLowerCase();
            if (page.includes('matchmaking') || page.includes('lobby')) {
                inMatchmaking += 1;
            }
        }
    }
    return {
        totalUsers: safeNumber(presence?.onlineUsers, 0),
        totalSockets: safeNumber(presence?.onlineSockets, 0),
        totalTabs: safeNumber(presence?.onlineTabs, 0),
        activeTabs: safeNumber(presence?.onlineTabs, 0),
        totalAdmins,
        // inGame: db-bol, ongoing jatszmak (ez a tenyleges igazsag).
        inGame: safeNumber(ongoingGameCount, 0),
        inMatchmaking
    };
}

async function safeCount(label, fn) {
    let result = 0;
    try {
        result = await fn();
    } catch (error) {
        console.warn(`admin statsTick ${label} hiba:`, error.message);
        result = 0;
    }
    return result;
}

async function computeTickPayload(socketHub) {
    let payload = null;
    try {
        const presence = socketHub?.getPresenceSnapshot ? socketHub.getPresenceSnapshot() : null;
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Parhuzamosan vegzett, izolalt try-catch-ekkel: egy darab DB hiba
        // nem dontheti meg az egesz tick-et (a tobbi szam meg jelenjen meg).
        const [
            auditEntries,
            alertCount,
            escalationCount,
            pendingProfileImages,
            pendingFriendRequests,
            ongoingGames,
            loginCount,
            registrationCount
        ] = await Promise.all([
            safeCount('searchAuditEntries', () => adminRepo.searchAuditEntries({ fromDate: since, limit: 500 })),
            safeCount('countAlertsSince', () => adminRepo.countAlertsSince(since)),
            safeCount('countActiveRateEscalations', () => adminRepo.countActiveRateEscalations()),
            safeCount('countPendingProfileImages', () => adminRepo.countPendingProfileImages()),
            safeCount('countPendingFriendRequests', () => adminRepo.countPendingFriendRequests()),
            safeCount('countOngoingGames', () => adminRepo.countOngoingGames()),
            safeCount('countLoginsSince', () => adminRepo.countLoginsSince(since)),
            safeCount('countRegistrationsSince', () => adminRepo.countRegistrationsSince(since))
        ]);

        const auditList = Array.isArray(auditEntries) ? auditEntries : [];
        const criticalCount = auditList.filter((row) => row.severity === 'critical').length;
        const newBans = auditList.filter((row) => row.action === 'users.ban').length;

        payload = {
            occurredAt: new Date().toISOString(),
            online: buildOnlineSection(presence, ongoingGames),
            pending: {
                profileImages: safeNumber(pendingProfileImages, 0),
                friendRequests: safeNumber(pendingFriendRequests, 0)
            },
            last24h: {
                auditEntries: auditList.length,
                criticalAuditEntries: criticalCount,
                alerts: safeNumber(alertCount, 0),
                newBans,
                logins: safeNumber(loginCount, 0),
                registrations: safeNumber(registrationCount, 0)
            },
            rateLimit: {
                activeEscalations: safeNumber(escalationCount, 0)
            }
        };
    } catch (error) {
        console.warn('admin statsTick computeTickPayload hiba:', error.message);
        payload = null;
    }
    return payload;
}

async function emitTickToRoom(deps) {
    try {
        const namespace = deps?.adminSocketHub?.namespace;
        const hasSockets = Boolean(namespace) && namespace.sockets.size > 0;
        if (hasSockets) {
            const payload = await computeTickPayload(deps.socketHub);
            if (payload) {
                deps.adminSocketHub.broadcastAdmin('admin:stats:tick', payload);
            }
        }
    } catch (error) {
        console.warn('admin statsTick emitTickToRoom hiba:', error.message);
    }
}

async function emitTickToSocket(socket) {
    try {
        if (cachedDeps && socket) {
            const payload = await computeTickPayload(cachedDeps.socketHub);
            if (payload) {
                socket.emit('admin:stats:tick', payload);
            }
        }
    } catch (error) {
        console.warn('admin statsTick emitTickToSocket hiba:', error.message);
    }
}

function start(deps) {
    let started = false;
    try {
        const alreadyRunning = Boolean(intervalHandle);
        const hasNamespace = Boolean(deps?.adminSocketHub?.namespace);
        if (!alreadyRunning && !hasNamespace) {
            console.warn('admin statsTick start: adminSocketHub.namespace hianyzik.');
        } else if (!alreadyRunning) {
            cachedDeps = deps;
            const namespace = deps.adminSocketHub.namespace;
            namespace.on('connection', (socket) => {
                socket.on('admin:stats:request', () => {
                    emitTickToSocket(socket);
                });
                // Friss tick a connection-koz kotve, hogy a kliens azonnal frissuljon.
                setTimeout(() => emitTickToSocket(socket), 250);
            });
            intervalHandle = setInterval(() => {
                emitTickToRoom(deps);
            }, TICK_INTERVAL_MS);
            if (typeof intervalHandle.unref === 'function') {
                intervalHandle.unref();
            }
            started = true;
        }
    } catch (error) {
        console.error('admin statsTick start hiba:', error.message);
    }
    return started;
}

function stop() {
    let stopped = false;
    try {
        if (intervalHandle) {
            clearInterval(intervalHandle);
            intervalHandle = null;
        }
        cachedDeps = null;
        stopped = true;
    } catch (error) {
        console.error('admin statsTick stop hiba:', error.message);
    }
    return stopped;
}

module.exports = {
    start,
    stop,
    computeTickPayload,
    TICK_INTERVAL_MS
};
