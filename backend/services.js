// --HearthBeat--
// Ez a fájl a Socket.io kapcsolat szívverés szerű adatküldésére kezelésére szolgál (SSE csak socket-al), hogy a szerver tudja, mely kliensek aktívak és elérhetőek stb...
const { getPool } = require('./sql/database');
const sql = require('./sql/sql_functions.js');

let currentStats = {
    public: {
        onlineUsers: 0,
        onlinePlayers: 0,
        onlineAdmins: 0,
        totalUsers: 0,
        totalGames: 0,
        onlineGames: 0
    },
    admin: {
        onlineUsers: 0,
        onlinePlayers: 0,
        onlineAdmins: 0,
        totalUsers: 0,
        totalGames: 0,
        onlineGames: 0,
        allUsers: [],
        allRooms: [],
        dbStatus: 'unknown',
        cpuUsage: '0%',
        memoryUsage: '0 MB'
    }
};

function computeOnlinePresenceCounts(io) {
    let result = { onlineUsers: 0, onlinePlayers: 0, onlineAdmins: 0 };
    try {
        if (!io || !io.sockets || !io.sockets.adapter || !io.sockets.adapter.rooms) {
            return result;
        }

        const userRoomPrefix = 'user-room:';
        const rooms = io.sockets.adapter.rooms;
        let onlineUsers = 0;
        let onlinePlayers = 0;
        let onlineAdmins = 0;

        for (const [roomName, socketIds] of rooms.entries()) {
            if (!String(roomName).startsWith(userRoomPrefix)) {
                continue;
            }

            if (!socketIds || socketIds.size === 0) {
                continue;
            }

            onlineUsers += 1;
            let role = 'player';
            for (const socketId of socketIds) {
                const socket = io.sockets.sockets.get(socketId);
                const socketRole = String(socket?.data?.socketContext?.role || '').trim().toLowerCase();
                if (socketRole) {
                    role = socketRole;
                    break;
                }
            }

            if (role === 'admin') {
                onlineAdmins += 1;
            } else {
                onlinePlayers += 1;
            }
        }

        result = { onlineUsers, onlinePlayers, onlineAdmins };
    } catch (error) {
        console.warn('Online presence szamitas hiba:', error.message);
    }

    return result;
}

const services = {
    getCurrentStats() {
        return currentStats;
    },

    async refreshStats(io) {
        try {
            // getPool() most dob, ha nincs init pool. Tesztkörnyezetben a mock
            // pool-t (pl. { _closed: false } vagy `null`) ad — a `null`-t saját kezűleg
            // detektaljuk a graceful "DB nem elerheto" agakhoz.
            let pool = null;
            try {
                pool = getPool();
            } catch (_) {
                pool = null;
            }
            if (pool) {
                const presenceCounts = computeOnlinePresenceCounts(io);

                const [totalUsers, totalGames, onlineGames, allUsers, allRooms] = await Promise.all([
                    sql.getTotalUsers(),
                    sql.getTotalGames(),
                    sql.getOnlineGamesCount(),
                    sql.getAllUsers(),
                    sql.getAllRooms()
                ]);
                currentStats.public = {
                    onlineUsers: presenceCounts.onlineUsers,
                    onlinePlayers: presenceCounts.onlinePlayers,
                    onlineAdmins: presenceCounts.onlineAdmins,
                    totalUsers,
                    totalGames,
                    onlineGames
                };
                currentStats.admin = {
                    ...currentStats.public,
                    allUsers,
                    allRooms,
                    dbStatus: pool._closed ? 'closed' : 'open',
                    cpuUsage: (process.cpuUsage().user / 1000000).toFixed(1) + '%',
                    memoryUsage: (process.memoryUsage().rss / (1024 * 1024)).toFixed(2) + ' MB'
                };
                //?Statisztikák frissítése minden kliensnek
                io.to('general-room').emit('stats:public', currentStats.public);
                io.to('admin-room').emit('stats:admin', currentStats.admin);
            }
            else {
                console.error('Nincs elérhető adatbázis kapcsolat a statisztikák frissítéséhez.');
            }
        } catch (error) {
            console.error('Error occurred while refreshing stats:', error);
        }
    },

    handleHeartbeat(io) {
        setInterval(() => {
            this.refreshStats(io);
        }, 5000); //?5 másodpercenként frissítjük a statisztikákat
    }
};

let leaderboardCache = {
    elo: [],
    elo_MM: [],
    elo_bullet: [],
    winRate: [],
    lastUpdated: null
};

const leaderboardService = {
    async updateLeaderboardCache(io = null) {
        try {
            const newEloCache = await sql.getLeaderBoardByElo();
            const newMMCache = await sql.getLeaderBoardByMM();
            const newBulletCache = await sql.getLeaderBoardByBullet();
            const newWinRateCache = await sql.getLeaderBoardByWinRate();
            leaderboardCache = {
                elo: newEloCache,
                elo_MM: newMMCache,
                elo_bullet: newBulletCache,
                winRate: newWinRateCache,
                lastUpdated: new Date()
            };

            if (io) {
                io.to('general-room').emit('leaderboard:update', leaderboardCache);
            }

            // console.log(`[Cache] Ranglista frissítve: ${new Date().toLocaleString()}`);
        } catch (error) {
            console.error('Error occurred while updating leaderboard cache:', error);   
        }
    },
    handleLeaderBoardCache(io = null) {
        this.updateLeaderboardCache(io);
        setInterval(() => {
            this.updateLeaderboardCache(io);
        }, 60000); //?1 percenként frissítjük a ranglista cache-t
    },
    getLeaderBoard() {
        return leaderboardCache;
    }
};

// =====================
// Unified notification service: persists notification in DB + pushes via socket
// + recalculates unread badge for the affected user(s).
// =====================
const notificationService = {
    async send(socketHub, notification) {
        let result = { saved: null, deliveredTo: [], errors: [] };
        try {
            if (!notification || typeof notification !== 'object') {
                throw new Error('Érvénytelen értesítés objektum.');
            }

            const audience = notification.audience || (notification.targetUserId ? 'user' : 'global');
            const baseNotification = { ...notification, audience };

            if (audience === 'user') {
                const targetUserId = Number(notification.targetUserId) || 0;
                if (!targetUserId) {
                    throw new Error('user audience esetén target_user_id kötelező.');
                }
                const saved = await sql.insertNotification(baseNotification);
                if (socketHub?.pushNotification) {
                    socketHub.pushNotification(targetUserId, saved);
                }
                if (socketHub?.emitNotificationBadgeUpdate) {
                    const targetUser = await sql.getUserBasicById(targetUserId);
                    const unread = await sql.getUnreadNotificationCount(targetUserId, targetUser?.role || 'player');
                    socketHub.emitNotificationBadgeUpdate(targetUserId, unread);
                }
                result = { saved, deliveredTo: [targetUserId], errors: [] };
            } else if (audience === 'multi') {
                const targetUserIds = Array.isArray(notification.targetUserIds)
                    ? notification.targetUserIds.map((id) => Number(id) || 0).filter(Boolean)
                    : [];
                if (!targetUserIds.length) {
                    throw new Error('multi audience esetén target_user_ids tömb kötelező.');
                }
                const delivered = [];
                const errors = [];
                for (const targetUserId of targetUserIds) {
                    try {
                        const saved = await sql.insertNotification({
                            ...baseNotification,
                            audience: 'user',
                            targetUserId
                        });
                        if (socketHub?.pushNotification) {
                            socketHub.pushNotification(targetUserId, saved);
                        }
                        if (socketHub?.emitNotificationBadgeUpdate) {
                            const targetUser = await sql.getUserBasicById(targetUserId);
                            const unread = await sql.getUnreadNotificationCount(targetUserId, targetUser?.role || 'player');
                            socketHub.emitNotificationBadgeUpdate(targetUserId, unread);
                        }
                        delivered.push(targetUserId);
                    } catch (perUserError) {
                        errors.push({ targetUserId, error: perUserError.message });
                    }
                }
                result = { saved: null, deliveredTo: delivered, errors };
            } else if (audience === 'role') {
                if (!notification.targetRole) {
                    throw new Error('role audience esetén target_role kötelező.');
                }
                const saved = await sql.insertNotification(baseNotification);
                const userIds = await sql.getUserIdsByRole(notification.targetRole);
                if (socketHub?.pushNotificationToUsers) {
                    socketHub.pushNotificationToUsers(userIds, saved);
                }
                if (socketHub?.emitNotificationBadgeUpdate) {
                    for (const userId of userIds) {
                        const unread = await sql.getUnreadNotificationCount(userId, notification.targetRole);
                        socketHub.emitNotificationBadgeUpdate(userId, unread);
                    }
                }
                result = { saved, deliveredTo: userIds, errors: [] };
            } else if (audience === 'global' || audience === 'system') {
                const saved = await sql.insertNotification(baseNotification);
                if (socketHub?.pushNotificationGlobal) {
                    socketHub.pushNotificationGlobal(saved);
                }
                const userIds = await sql.getAllActiveUserIds();
                if (socketHub?.emitNotificationBadgeUpdate) {
                    for (const userId of userIds) {
                        const targetUser = await sql.getUserBasicById(userId);
                        const unread = await sql.getUnreadNotificationCount(userId, targetUser?.role || 'player');
                        socketHub.emitNotificationBadgeUpdate(userId, unread);
                    }
                }
                result = { saved, deliveredTo: userIds, errors: [] };
            } else {
                throw new Error(`Ismeretlen audience érték: ${audience}`);
            }
        } catch (error) {
            result = { saved: null, deliveredTo: [], errors: [{ error: error.message }] };
            console.error('[notificationService] send hiba:', error.message);
        }
        return result;
    },

    async refreshBadgeForUser(socketHub, userId) {
        let unread = 0;
        try {
            const normalizedUserId = Number(userId) || 0;
            if (normalizedUserId) {
                const targetUser = await sql.getUserBasicById(normalizedUserId);
                unread = await sql.getUnreadNotificationCount(normalizedUserId, targetUser?.role || 'player');
                if (socketHub?.emitNotificationBadgeUpdate) {
                    socketHub.emitNotificationBadgeUpdate(normalizedUserId, unread);
                }
            }
        } catch (error) {
            console.warn('[notificationService] refreshBadgeForUser hiba:', error.message);
        }
        return unread;
    },

    async refreshChatUnreadForUser(socketHub, userId) {
        let total = 0;
        try {
            const normalizedUserId = Number(userId) || 0;
            if (normalizedUserId) {
                total = await sql.getUnreadChatMessageTotal(normalizedUserId);
                if (socketHub?.emitChatUnreadUpdate) {
                    socketHub.emitChatUnreadUpdate(normalizedUserId, total);
                }
            }
        } catch (error) {
            console.warn('[notificationService] refreshChatUnreadForUser hiba:', error.message);
        }
        return total;
    }
};

module.exports = {
    services,
    leaderboardService,
    notificationService
};