const { services } = require('./services.js');

const SOCKET_ROOMS = Object.freeze({
    general: 'general-room',
    admin: 'admin-room',
    presence: 'presence-room',
    notifications: 'notifications-room'
});

const SOCKET_FEATURES = Object.freeze([
    {
        key: 'presence',
        label: 'Jelenlét',
        description: 'Online állapot, aktív tabok és felhasználói jelenlét követése.'
    },
    {
        key: 'chat',
        label: 'Chat',
        description: 'Szobaszintű üzenetküldés és élő beszélgetés.'
    },
    {
        key: 'roomState',
        label: 'Játékszoba állapot',
        description: 'Parti- és lobbyállapot szinkronizálása socketen keresztül.'
    },
    {
        key: 'notifications',
        label: 'Valós idejű értesítések',
        description: 'Azonnali rendszer- és játéktesemény jelzések.'
    },
    {
        key: 'multiTabReconnect',
        label: 'Több tab / reconnect kezelés',
        description: 'Több böngészőfül és megszakított kapcsolat újraszinkronizálása.'
    }
]);

function safeString(value, fallback = '') {
    if (typeof value !== 'string') {
        return fallback;
    }

    return value.trim();
}

function createContextFromSocket(socket) {
    const session = socket.request?.session || {};
    const auth = socket.handshake?.auth || {};

    return {
        socketId: socket.id,
        clientId: safeString(auth.clientId, socket.id),
        tabId: safeString(auth.tabId, socket.id),
        page: safeString(auth.page, null),
        sessionId: socket.request?.sessionID || null,
        userId: session.userId || null,
        username: session.username || 'Vendég',
        role: session.role || 'guest',
        connectedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
    };
}

function createEmptyPresenceRecord(context) {
    return {
        userId: context.userId,
        username: context.username,
        role: context.role,
        clientId: context.clientId,
        tabs: new Map(),
        socketIds: new Set(),
        firstSeenAt: context.connectedAt,
        lastSeenAt: context.lastSeenAt
    };
}

function snapshotPresenceRecord(record) {
    return {
        userId: record.userId,
        username: record.username,
        role: record.role,
        clientId: record.clientId,
        socketCount: record.socketIds.size,
        tabCount: record.tabs.size,
        firstSeenAt: record.firstSeenAt,
        lastSeenAt: record.lastSeenAt,
        tabs: [...record.tabs.values()].map((tab) => ({
            socketId: tab.socketId,
            tabId: tab.tabId,
            page: tab.page,
            connectedAt: tab.connectedAt,
            lastSeenAt: tab.lastSeenAt
        }))
    };
}

function createSocketHub(io) {
    if (!io || typeof io.on !== 'function') {
        throw new Error('A Socket.io példány nem elérhető a hub inicializálásához.');
    }

    const socketsById = new Map();
    const clientsById = new Map();
    const roomStateById = new Map();

    function getPresenceSnapshot() {
        return {
            onlineUsers: clientsById.size,
            onlineTabs: [...clientsById.values()].reduce((count, record) => count + record.tabs.size, 0),
            onlineSockets: socketsById.size,
            clients: [...clientsById.values()].map(snapshotPresenceRecord),
            generatedAt: new Date().toISOString()
        };
    }

    function getSocketSnapshot(socket, context = null) {
        const currentContext = context || socketsById.get(socket.id) || createContextFromSocket(socket);
        const clientRecord = clientsById.get(currentContext.clientId);

        return {
            socketId: socket.id,
            clientId: currentContext.clientId,
            tabId: currentContext.tabId,
            page: currentContext.page,
            connected: socket.connected,
            recovered: Boolean(socket.recovered),
            sessionBound: Boolean(currentContext.userId),
            user: currentContext.userId ? {
                id: currentContext.userId,
                username: currentContext.username,
                role: currentContext.role
            } : null,
            roomCount: socket.rooms.size,
            rooms: [...socket.rooms],
            clientSocketCount: clientRecord ? clientRecord.socketIds.size : 0,
            clientTabCount: clientRecord ? clientRecord.tabs.size : 0,
            connectedAt: currentContext.connectedAt,
            lastSeenAt: currentContext.lastSeenAt,
            features: SOCKET_FEATURES,
            reconnect: {
                supported: true,
                multiTab: true
            }
        };
    }

    function syncPresence() {
        const snapshot = getPresenceSnapshot();
        io.to(SOCKET_ROOMS.general).emit('presence:state', snapshot);
        io.to(SOCKET_ROOMS.admin).emit('presence:state', snapshot);
        return snapshot;
    }

    function syncSocketState(socket) {
        const context = socketsById.get(socket.id);
        if (!context) {
            return null;
        }

        const payload = {
            ...getSocketSnapshot(socket, context),
            presence: getPresenceSnapshot(),
            roomState: [...roomStateById.entries()].map(([roomId, value]) => ({
                roomId,
                state: value.state,
                updatedAt: value.updatedAt,
                updatedBy: value.updatedBy
            }))
        };

        socket.emit('socket:capabilities', {
            features: SOCKET_FEATURES,
            generatedAt: new Date().toISOString()
        });
        socket.emit('socket:state', payload);
        return payload;
    }

    function getCurrentSocketContext(socket) {
        try {
            const context = socketsById.get(socket.id) || socket.data?.socketContext;
            if (!context) {
                throw new Error('A socket context nem található.');
            }

            return context;
        } catch (error) {
            throw new Error(`Socket context lekérdezési hiba: ${error.message}`);
        }
    }

    function refreshSocketContextFromSession(socket) {
        try {
            const existingContext = getCurrentSocketContext(socket);
            const refreshedContext = createContextFromSocket(socket);
            const mergedContext = {
                ...refreshedContext,
                connectedAt: existingContext.connectedAt || refreshedContext.connectedAt,
                lastSeenAt: new Date().toISOString()
            };

            if (existingContext.userId && existingContext.userId !== mergedContext.userId) {
                socket.leave(`user-room:${existingContext.userId}`);
                socket.leave(`${SOCKET_ROOMS.presence}:${existingContext.userId}`);
            }

            if (existingContext.role === 'admin' && mergedContext.role !== 'admin') {
                socket.leave(SOCKET_ROOMS.admin);
            }

            if (mergedContext.userId) {
                socket.join(`user-room:${mergedContext.userId}`);
                socket.join(`${SOCKET_ROOMS.presence}:${mergedContext.userId}`);
            }

            if (mergedContext.role === 'admin') {
                socket.join(SOCKET_ROOMS.admin);
            }

            if (existingContext.clientId !== mergedContext.clientId) {
                const previousClientRecord = clientsById.get(existingContext.clientId);
                if (previousClientRecord) {
                    previousClientRecord.socketIds.delete(socket.id);
                    previousClientRecord.tabs.delete(existingContext.tabId);
                    previousClientRecord.lastSeenAt = mergedContext.lastSeenAt;

                    if (previousClientRecord.socketIds.size === 0) {
                        clientsById.delete(existingContext.clientId);
                    }
                }
            }

            if (!clientsById.has(mergedContext.clientId)) {
                clientsById.set(mergedContext.clientId, createEmptyPresenceRecord(mergedContext));
            }

            const clientRecord = clientsById.get(mergedContext.clientId);
            clientRecord.userId = mergedContext.userId;
            clientRecord.username = mergedContext.username;
            clientRecord.role = mergedContext.role;
            clientRecord.lastSeenAt = mergedContext.lastSeenAt;
            clientRecord.socketIds.add(socket.id);

            if (existingContext.tabId !== mergedContext.tabId) {
                clientRecord.tabs.delete(existingContext.tabId);
            }

            clientRecord.tabs.set(mergedContext.tabId, {
                socketId: socket.id,
                tabId: mergedContext.tabId,
                page: mergedContext.page,
                connectedAt: mergedContext.connectedAt,
                lastSeenAt: mergedContext.lastSeenAt
            });

            socketsById.set(socket.id, mergedContext);
            socket.data.socketContext = mergedContext;
            return mergedContext;
        } catch (error) {
            throw new Error(`Socket context frissítési hiba: ${error.message}`);
        }
    }

    function registerSocket(socket) {
        const context = createContextFromSocket(socket);
        socketsById.set(socket.id, context);

        if (!clientsById.has(context.clientId)) {
            clientsById.set(context.clientId, createEmptyPresenceRecord(context));
        }

        const clientRecord = clientsById.get(context.clientId);
        clientRecord.username = context.username;
        clientRecord.role = context.role;
        clientRecord.lastSeenAt = context.lastSeenAt;
        clientRecord.socketIds.add(socket.id);
        clientRecord.tabs.set(context.tabId, {
            socketId: socket.id,
            tabId: context.tabId,
            page: context.page,
            connectedAt: context.connectedAt,
            lastSeenAt: context.lastSeenAt
        });

        socket.data.socketContext = context;
        socket.join(SOCKET_ROOMS.general);
        socket.join(SOCKET_ROOMS.notifications);

        if (context.userId) {
            socket.join(`user-room:${context.userId}`);
            socket.join(`${SOCKET_ROOMS.presence}:${context.userId}`);
        }

        if (context.role === 'admin') {
            socket.join(SOCKET_ROOMS.admin);
        }

        const currentStats = services.getCurrentStats();
        socket.emit('connected', {
            success: true,
            message: 'Sikeresen csatlakoztál a szerverhez.',
            socket: getSocketSnapshot(socket, context),
            stats: currentStats.public
        });

        socket.emit('stats:public', currentStats.public);
        if (context.role === 'admin') {
            socket.emit('stats:admin', currentStats.admin);
        }

        socket.on('socket:sync', () => {
            try {
                const refreshedContext = refreshSocketContextFromSession(socket);
                const socketState = syncSocketState(socket);
                const presenceState = syncPresence();

                socket.emit('socket:sync:done', {
                    success: true,
                    message: 'A socket context frissítése sikeres.',
                    context: {
                        userId: refreshedContext.userId,
                        username: refreshedContext.username,
                        role: refreshedContext.role
                    },
                    socket: socketState,
                    presence: presenceState,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('socket:sync hiba:', error);
                socket.emit('socket:sync:done', {
                    success: false,
                    message: error.message || 'A socket context frissítése sikertelen.',
                    timestamp: new Date().toISOString()
                });
            }
        });

        socket.on('presence:subscribe', () => {
            socket.emit('presence:state', getPresenceSnapshot());
        });

        socket.on('chat:join', (payload = {}) => {
            const roomId = safeString(payload.roomId, 'general-chat');
            socket.join(`chat-room:${roomId}`);
            socket.emit('chat:joined', {
                roomId,
                joinedAt: new Date().toISOString()
            });
        });

        socket.on('chat:message', (payload = {}) => {
            try {
                const currentContext = getCurrentSocketContext(socket);
                const roomId = safeString(payload.roomId, 'general-chat');
                const message = safeString(payload.message, '');

                if (!message) {
                    socket.emit('chat:error', {
                        roomId,
                        message: 'Az üzenet nem lehet üres.'
                    });
                    return;
                }

                const chatPayload = {
                    roomId,
                    message,
                    author: currentContext.userId ? {
                        id: currentContext.userId,
                        username: currentContext.username,
                        role: currentContext.role
                    } : {
                        id: null,
                        username: 'Vendég',
                        role: 'guest'
                    },
                    socketId: socket.id,
                    clientId: currentContext.clientId,
                    tabId: currentContext.tabId,
                    sentAt: new Date().toISOString()
                };

                io.to(`chat-room:${roomId}`).emit('chat:message', chatPayload);
            } catch (error) {
                console.error('chat:message hiba:', error);
                socket.emit('chat:error', {
                    roomId: safeString(payload.roomId, 'general-chat'),
                    message: error.message || 'Üzenetküldési hiba történt.'
                });
            }
        });

        socket.on('room:subscribe', (payload = {}) => {
            const roomId = safeString(payload.roomId, 'general-room');
            socket.join(`room-state:${roomId}`);
            socket.emit('room:state', {
                roomId,
                state: roomStateById.get(roomId)?.state || null,
                updatedAt: roomStateById.get(roomId)?.updatedAt || null,
                updatedBy: roomStateById.get(roomId)?.updatedBy || null
            });
        });

        socket.on('room:state:update', (payload = {}) => {
            try {
                const currentContext = getCurrentSocketContext(socket);
                const roomId = safeString(payload.roomId, 'general-room');
                const state = payload.state ?? null;

                roomStateById.set(roomId, {
                    state,
                    updatedAt: new Date().toISOString(),
                    updatedBy: currentContext.userId ? currentContext.username : 'system'
                });

                io.to(`room-state:${roomId}`).emit('room:state', {
                    roomId,
                    state,
                    updatedAt: roomStateById.get(roomId).updatedAt,
                    updatedBy: roomStateById.get(roomId).updatedBy
                });
            } catch (error) {
                console.error('room:state:update hiba:', error);
                socket.emit('room:state:error', {
                    roomId: safeString(payload.roomId, 'general-room'),
                    message: error.message || 'Szobaállapot frissítési hiba történt.'
                });
            }
        });

        socket.on('notification:subscribe', () => {
            try {
                const currentContext = getCurrentSocketContext(socket);
                if (currentContext.userId) {
                    socket.join(`notification-user:${currentContext.userId}`);
                }
                socket.emit('notification:state', {
                    subscribed: true,
                    userId: currentContext.userId,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('notification:subscribe hiba:', error);
                socket.emit('notification:error', {
                    message: error.message || 'Értesítés feliratkozási hiba történt.',
                    timestamp: new Date().toISOString()
                });
            }
        });

        socket.on('disconnect', (reason) => {
            const currentContext = socketsById.get(socket.id);
            socketsById.delete(socket.id);

            if (currentContext) {
                const clientRecord = clientsById.get(currentContext.clientId);
                if (clientRecord) {
                    clientRecord.socketIds.delete(socket.id);
                    clientRecord.tabs.delete(currentContext.tabId);
                    clientRecord.lastSeenAt = new Date().toISOString();

                    if (clientRecord.socketIds.size === 0) {
                        clientsById.delete(currentContext.clientId);
                    }
                }
            }

            syncPresence();
            services.refreshStats(io).catch((error) => {
                console.error('Socket disconnect utáni statisztika frissítési hiba:', error);
            });

            console.log('Socket.io kapcsolat megszakadt:', socket.id, reason || 'ismeretlen ok');
        });

        socket.emit('notification:state', {
            subscribed: true,
            userId: context.userId,
            timestamp: new Date().toISOString()
        });

        syncPresence();
        syncSocketState(socket);

        services.refreshStats(io).catch((error) => {
            console.error('Socket connection utáni statisztika frissítési hiba:', error);
        });

        console.log('Új Socket.io kapcsolat létrejött:', socket.id, {
            clientId: context.clientId,
            tabId: context.tabId,
            userId: context.userId,
            role: context.role
        });
    }

    io.on('connection', registerSocket);

    return {
        getPresenceSnapshot,
        getSocketSnapshot,
        syncPresence,
        syncSocketState,
        updateRoomState(roomId, state, updatedBy = 'system') {
            const normalizedRoomId = safeString(roomId, 'general-room');
            roomStateById.set(normalizedRoomId, {
                state,
                updatedAt: new Date().toISOString(),
                updatedBy
            });

            io.to(`room-state:${normalizedRoomId}`).emit('room:state', {
                roomId: normalizedRoomId,
                state,
                updatedAt: roomStateById.get(normalizedRoomId).updatedAt,
                updatedBy
            });
        },
        pushNotification(targetUserId, notification) {
            const payload = {
                ...notification,
                sentAt: new Date().toISOString(),
                targetUserId
            };

            if (targetUserId) {
                io.to(`notification-user:${targetUserId}`).emit('notification:push', payload);
            } else {
                io.to(SOCKET_ROOMS.notifications).emit('notification:push', payload);
            }

            return payload;
        },
        broadcastChat(roomId, messagePayload) {
            const normalizedRoomId = safeString(roomId, 'general-chat');
            io.to(`chat-room:${normalizedRoomId}`).emit('chat:message', messagePayload);
        }
    };
}

module.exports = {
    createSocketHub,
    SOCKET_FEATURES,
    SOCKET_ROOMS
};
