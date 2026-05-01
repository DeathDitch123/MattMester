const { services, notificationService } = require('./services.js');
const sql = require('./sql/sql_funtions.js');
const { registerPvpHandlers, handlePvpDisconnect } = require('./chess/pvp.js');
const { validateChatRateLimitOrThrow: validateRateLimit, writeChatSecurityAudit } = require('./api/chatUtils.js');

const CHAT_RATE_LIMIT_MAX_MESSAGES = 5;
const CHAT_RATE_LIMIT_WINDOW_MS = 10 * 1000;
const CHAT_MAX_MESSAGE_LENGTH = 1000;
const CHAT_BLACKLIST_POLICY = String(process.env.CHAT_BLACKLIST_POLICY || 'hard_block').trim().toLowerCase();

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

function parsePositiveInteger(value, fallback = null) {
    const parsed = Number(value);
    let result = fallback;
    if (Number.isInteger(parsed) && parsed > 0) {
        result = parsed;
    }

    return result;
}

function getConversationRoomName(conversationId) {
    return `chat-conversation-${conversationId}`;
}

function getSessionProfileImage(session) {
    return safeString(session.profile_image, '/profile_pictures/default.png') || '/profile_pictures/default.png';
}

function getSessionProfileImageStatus(session) {
    return safeString(session.profile_image_status, 'default') || 'default';
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
        profile_image: getSessionProfileImage(session),
        profile_image_status: getSessionProfileImageStatus(session),
        is_email_verified: !!session.is_email_verified,
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
        profile_image: context.profile_image || '/profile_pictures/default.png',
        profile_image_status: context.profile_image_status || 'default',
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
        profile_image: record.profile_image || '/profile_pictures/default.png',
        profile_image_status: record.profile_image_status || 'default',
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
    const chatRateLimitByUserId = new Map();

    function notifyConversationDeleted(conversationId, affectedUserIds = [], reason = 'unavailable') {
        const normalizedConversationId = parsePositiveInteger(conversationId, null);
        if (!normalizedConversationId) {
            return;
        }

        const payload = {
            conversationId: normalizedConversationId,
            reason: String(reason || 'unavailable'),
            deletedAt: new Date().toISOString()
        };

        io.to(getConversationRoomName(normalizedConversationId)).emit('chat:conversation:deleted', payload);

        const uniqueIds = [...new Set((affectedUserIds || []).map((id) => parsePositiveInteger(id, null)).filter(Boolean))];
        uniqueIds.forEach((userId) => {
            io.to(`user-room:${userId}`).emit('chat:conversation:deleted', payload);
            io.to(`user-room:${userId}`).emit('chat:list:refresh', {
                reason: payload.reason,
                conversationId: normalizedConversationId,
                at: payload.deletedAt
            });
        });

        const roomName = getConversationRoomName(normalizedConversationId);
        const room = io.sockets.adapter.rooms.get(roomName);
        if (room) {
            for (const socketId of room) {
                const targetSocket = io.sockets.sockets.get(socketId);
                if (targetSocket) {
                    targetSocket.leave(roomName);
                }
            }
        }
    }

    function createChatErrorPayload(conversationId, error, fallbackMessage) {
        return {
            conversationId,
            message: error?.message || fallbackMessage || 'Chat hiba történt.',
            timestamp: new Date().toISOString()
        };
    }

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
        const profileImage = currentContext.profile_image || '/profile_pictures/default.png';
        const profileImageStatus = currentContext.profile_image_status || 'default';

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
                role: currentContext.role,
                profile_image: profileImage,
                profile_image_status: profileImageStatus
            } : null,
            profile_image: profileImage,
            profile_image_status: profileImageStatus,
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

    function isAdminSocket(socket) {
        const context = socketsById.get(socket.id) || socket.data?.socketContext;
        return Boolean(context && context.role === 'admin');
    }

    function emitAdminAuthError(socket, eventName) {
        socket.emit('admin:error', {
            success: false,
            message: 'Admin jogosultság szükséges ehhez a művelethez.',
            event: eventName || null,
            timestamp: new Date().toISOString()
        });
    }

    function requireAdminSocket(socket, handler) {
        return async (...args) => {
            if (!isAdminSocket(socket)) {
                emitAdminAuthError(socket);
                return;
            }
            await handler(...args);
        };
    }

    async function broadcastChatMessageSideEffects(conversationId, senderUserId) {
        // Új chat üzenet után az összes résztvevőnek (a küldőnek is, mert az ő
        // last_read_message_id-ja is változott) authoritative chat:unread:update
        // eseményt küldünk, illetve chat:list:refresh jelzést, hogy a frontend
        // a beszélgetéslista preview-t és rendezést is aktualizálja.
        try {
            const normalizedConversationId = parsePositiveInteger(conversationId, null);
            if (!normalizedConversationId) {
                throw new Error('Érvénytelen conversation azonosító a side-effecthez.');
            }

            const participantIds = await sql.getPrivateConversationParticipantIds(normalizedConversationId);
            const uniqueParticipants = [...new Set(
                (participantIds || []).map((id) => parsePositiveInteger(id, null)).filter(Boolean)
            )];

            if (!uniqueParticipants.length) {
                // Nem privát vagy már töröltük a résztvevőket: nincs mit broadcastolni.
                return;
            }

            const now = new Date().toISOString();
            const normalizedSenderId = parsePositiveInteger(senderUserId, 0);

            for (const participantUserId of uniqueParticipants) {
                try {
                    const unreadChatTotal = await sql.getUnreadChatMessageTotal(participantUserId);
                    io.to(`user-room:${participantUserId}`).emit('chat:unread:update', {
                        totalUnread: Math.max(0, Number(unreadChatTotal) || 0),
                        conversationId: normalizedConversationId,
                        at: now
                    });

                    // A küldő kivételével küldünk chat:list:refresh-t, mivel a küldő
                    // kliense már helyi állapotban frissül az új üzenet DOM hozzáadásával.
                    // A címzett azonban NEM tagja a conversation roomnak, ha nincs nyitva a chat,
                    // ezért csak így kap trigger-t a beszélgetéslistája frissítésére.
                    if (participantUserId !== normalizedSenderId) {
                        io.to(`user-room:${participantUserId}`).emit('chat:list:refresh', {
                            conversationId: normalizedConversationId,
                            reason: 'new-message',
                            at: now
                        });
                    }
                } catch (perUserError) {
                    console.warn('[sockets] per-user chat refresh hiba:', participantUserId, perUserError.message);
                }
            }
        } catch (error) {
            throw new Error(`Chat üzenet side-effect hiba: ${error.message}`);
        }
    }

    async function emitAuthoritativeStateAfterSync(socket, previousUserId, refreshedContext) {
        // Session-váltás / reconnect után a kliens authoritative állapotot kér:
        //  - reset esemény, ha a userId váltott (korábbi notification-lista elavul)
        //  - aktuális notification badge
        //  - aktuális chat unread total
        try {
            const normalizedPreviousUserId = Number(previousUserId) || 0;
            const currentUserId = Number(refreshedContext?.userId) || 0;
            const userChanged = normalizedPreviousUserId !== currentUserId;

            if (userChanged) {
                // Explicit jelzés a kliensnek: töröld a cache-elt listát / badge-et,
                // mert új vagy nincs session context van.
                socket.emit('notification:reset', {
                    previousUserId: normalizedPreviousUserId || null,
                    currentUserId: currentUserId || null,
                    reason: 'session-change',
                    at: new Date().toISOString()
                });
                socket.emit('chat:unread:reset', {
                    previousUserId: normalizedPreviousUserId || null,
                    currentUserId: currentUserId || null,
                    reason: 'session-change',
                    at: new Date().toISOString()
                });
            }

            if (currentUserId) {
                const unreadNotifications = await sql.getUnreadNotificationCount(
                    currentUserId,
                    refreshedContext?.role || 'player'
                );
                socket.emit('notification:badge:update', {
                    unreadCount: Math.max(0, Number(unreadNotifications) || 0),
                    at: new Date().toISOString()
                });

                const unreadChatTotal = await sql.getUnreadChatMessageTotal(currentUserId);
                socket.emit('chat:unread:update', {
                    totalUnread: Math.max(0, Number(unreadChatTotal) || 0),
                    at: new Date().toISOString()
                });
            } else {
                // Guest / logout: biztosan null a badge.
                socket.emit('notification:badge:update', { unreadCount: 0, at: new Date().toISOString() });
                socket.emit('chat:unread:update', { totalUnread: 0, at: new Date().toISOString() });
            }
        } catch (error) {
            throw new Error(`Authoritative state refresh hiba: ${error.message}`);
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
                // User session changed (login -> logout, user A -> user B, stb.):
                // a régi felhasználó minden privát szobáját el kell hagynunk,
                // különben az új session is a régi user értesítéseit/üzeneteit kapná.
                socket.leave(`user-room:${existingContext.userId}`);
                socket.leave(`${SOCKET_ROOMS.presence}:${existingContext.userId}`);
                socket.leave(`notification-user:${existingContext.userId}`);
            }

            if (existingContext.role === 'admin' && mergedContext.role !== 'admin') {
                socket.leave(SOCKET_ROOMS.admin);
            }

            if (mergedContext.userId) {
                socket.join(`user-room:${mergedContext.userId}`);
                socket.join(`${SOCKET_ROOMS.presence}:${mergedContext.userId}`);
                socket.join(`notification-user:${mergedContext.userId}`);
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
            clientRecord.profile_image = mergedContext.profile_image || '/profile_pictures/default.png';
            clientRecord.profile_image_status = mergedContext.profile_image_status || 'default';
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
        clientRecord.profile_image = context.profile_image || '/profile_pictures/default.png';
        clientRecord.profile_image_status = context.profile_image_status || 'default';
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

        // Automatikus védelem: az 'admin:' előtagú eventeket csak admin role fogadja el.
        socket.use((packet, next) => {
            const eventName = Array.isArray(packet) ? packet[0] : null;
            if (typeof eventName !== 'string' || !eventName.startsWith('admin:')) {
                return next();
            }
            if (isAdminSocket(socket)) {
                return next();
            }
            emitAdminAuthError(socket, eventName);
            const err = new Error('Admin jogosultság szükséges.');
            err.data = { event: eventName };
            return next(err);
        });

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

        // ── PVP sakk handler-ek regisztrálása ──
        registerPvpHandlers(socket, io);

        socket.on('socket:sync', () => {
            let syncSucceeded = false;
            let previousUserId = 0;
            let refreshedContextRef = null;
            try {
                const existingContext = socketsById.get(socket.id) || context;
                previousUserId = Number(existingContext?.userId) || 0;

                const refreshedContext = refreshSocketContextFromSession(socket);
                refreshedContextRef = refreshedContext;
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
                syncSucceeded = true;
            } catch (error) {
                console.error('socket:sync hiba:', error);
                socket.emit('socket:sync:done', {
                    success: false,
                    message: error.message || 'A socket context frissítése sikertelen.',
                    timestamp: new Date().toISOString()
                });
            }

            // Authoritative állapot-visszatöltés a sync után: ha a userId
            // váltott (login / logout / user A -> user B), vagy eleve van
            // bejelentkezett user, mindig elküldjük a friss badge értékeket.
            // Ez oldja meg, hogy a modalban ne maradjanak "kísértet" értesítések
            // és a chat ikon olvasatlan számlálója is reconnect/sync után friss legyen.
            if (syncSucceeded) {
                emitAuthoritativeStateAfterSync(socket, previousUserId, refreshedContextRef)
                    .catch((refreshError) => {
                        console.warn('[sockets] socket:sync utani badge refresh hiba:', refreshError.message);
                    });
            }
        });

        socket.on('presence:subscribe', () => {
            socket.emit('presence:state', getPresenceSnapshot());
        });

        socket.on('chat:join', async (payload = {}) => {
            const conversationId = parsePositiveInteger(payload?.conversationId, null);
            try {
                const currentContext = getCurrentSocketContext(socket);
                if (!currentContext.userId) {
                    throw new Error('Chat csatlakozáshoz bejelentkezés szükséges.');
                }

                if (!conversationId) {
                    throw new Error('Érvénytelen conversation azonosító.');
                }

                try {
                    await sql.assertConversationUsable(currentContext.userId, conversationId);
                } catch (usabilityError) {
                    if (usabilityError?.code === 'CONVERSATION_UNAVAILABLE') {
                        notifyConversationDeleted(
                            usabilityError.conversationId,
                            usabilityError.affectedUserIds || [],
                            usabilityError.reason || 'unavailable'
                        );
                    }
                    throw usabilityError;
                }
                socket.join(getConversationRoomName(conversationId));

                socket.emit('chat:join', {
                    success: true,
                    conversationId,
                    joinedAt: new Date().toISOString()
                });
            } catch (error) {
                socket.emit('chat:error', createChatErrorPayload(conversationId, error, 'Chat csatlakozási hiba.'));
            }
        });

        socket.on('chat:leave', async (payload = {}) => {
            const conversationId = parsePositiveInteger(payload?.conversationId, null);
            try {
                const currentContext = getCurrentSocketContext(socket);
                if (!currentContext.userId) {
                    throw new Error('Chat kilépéshez bejelentkezés szükséges.');
                }

                if (!conversationId) {
                    throw new Error('Érvénytelen conversation azonosító.');
                }

                await sql.assertConversationParticipant(currentContext.userId, conversationId);
                socket.leave(getConversationRoomName(conversationId));

                socket.emit('chat:leave', {
                    success: true,
                    conversationId,
                    leftAt: new Date().toISOString()
                });
            } catch (error) {
                socket.emit('chat:error', createChatErrorPayload(conversationId, error, 'Chat kilépési hiba.'));
            }
        });

        socket.on('chat:message:send', async (payload = {}) => {
            const conversationId = parsePositiveInteger(payload?.conversationId, null);
            try {
                const currentContext = getCurrentSocketContext(socket);
                if (!currentContext.userId) {
                    throw new Error('Üzenetküldéshez bejelentkezés szükséges.');
                }

                if (!conversationId) {
                    throw new Error('Érvénytelen conversation azonosító.');
                }

                const message = safeString(payload?.message, '');
                if (!message) {
                    throw new Error('Az üzenet nem lehet üres.');
                }

                if (message.length > CHAT_MAX_MESSAGE_LENGTH) {
                    throw new Error(`Az üzenet legfeljebb ${CHAT_MAX_MESSAGE_LENGTH} karakter lehet.`);
                }

                try {
                    await sql.assertConversationUsable(currentContext.userId, conversationId);
                } catch (usabilityError) {
                    if (usabilityError?.code === 'CONVERSATION_UNAVAILABLE') {
                        notifyConversationDeleted(
                            usabilityError.conversationId,
                            usabilityError.affectedUserIds || [],
                            usabilityError.reason || 'unavailable'
                        );
                    }
                    throw usabilityError;
                }
                validateRateLimit(chatRateLimitByUserId, currentContext.userId, CHAT_RATE_LIMIT_MAX_MESSAGES, CHAT_RATE_LIMIT_WINDOW_MS);

                const containsBlockedWord = sql.containsBlockedWord(message);
                const policyResult = {
                    blocked: false,
                    isMasked: false,
                    maskedMessage: null
                };

                if (containsBlockedWord) {
                    if (CHAT_BLACKLIST_POLICY === 'soft_mask') {
                        policyResult.isMasked = true;
                        policyResult.maskedMessage = '***';
                    } else {
                        policyResult.blocked = true;
                    }

                    await writeChatSecurityAudit(currentContext.userId, 'chat_blocked_word', conversationId, {
                        success: !policyResult.blocked,
                        severity: policyResult.blocked ? 'warning' : 'info',
                        message: policyResult.blocked
                            ? 'Tiltott szó miatt blokkolt socket chat üzenet.'
                            : 'Tiltott szó miatt maszkolt socket chat üzenet.',
                        metadata: {
                            policy: CHAT_BLACKLIST_POLICY,
                            masked: policyResult.isMasked,
                            blocked: policyResult.blocked
                        },
                        source: 'socket'
                    });
                }

                if (policyResult.blocked) {
                    throw new Error('Az üzenet tiltott kifejezést tartalmaz.');
                }

                const insertedMessage = await sql.insertMessageInConversation(
                    currentContext.userId,
                    conversationId,
                    message,
                    policyResult
                );

                // A pending profilkép nem szivároghat ki a többi résztvevőhöz a
                // socket broadcast-ban: a feladón kívül mindenkinek defaultot küldünk.
                const senderStatusForBroadcast = String(insertedMessage?.senderProfileImageStatus || '').toLowerCase();
                const broadcastInsertedMessage = senderStatusForBroadcast === 'pending'
                    ? {
                        ...insertedMessage,
                        senderProfileImage: '/profile_pictures/default.png',
                        senderProfileImageStatus: 'default'
                    }
                    : insertedMessage;

                const messagePayload = {
                    ...broadcastInsertedMessage,
                    conversationId,
                    socketId: socket.id,
                    clientId: currentContext.clientId,
                    tabId: currentContext.tabId,
                    receivedAt: new Date().toISOString()
                };

                io.to(getConversationRoomName(conversationId)).emit('chat:message:new', messagePayload);

                // Authoritative chat unread + chat list refresh minden résztvevőnek,
                // nem csak akiknek nyitva van a beszélgetés. Enélkül a címzett chat
                // ikonján a badge nem frissül valós időben, amíg újra nem tölt.
                try {
                    await broadcastChatMessageSideEffects(conversationId, currentContext.userId);
                } catch (sideEffectError) {
                    console.warn('[sockets] chat:message:send side-effect hiba:', sideEffectError.message);
                }
            } catch (error) {
                const isRateLimited = String(error?.message || '').toLowerCase().includes('túl sok üzenet');

                if (isRateLimited) {
                    const currentContext = socketsById.get(socket.id);
                    await writeChatSecurityAudit(currentContext?.userId || 0, 'chat_rate_limited', conversationId, {
                        success: false,
                        severity: 'warning',
                        message: 'Socket chat üzenet rate limit miatt blokkolva.',
                        metadata: {
                            limit: CHAT_RATE_LIMIT_MAX_MESSAGES,
                            windowMs: CHAT_RATE_LIMIT_WINDOW_MS
                        },
                        source: 'socket'
                    });
                }

                socket.emit('chat:error', createChatErrorPayload(conversationId, error, 'Üzenetküldési hiba történt.'));
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
                socket.emit('room:error', {
                    success: false,
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

            // ── PVP disconnect kezelés ──
            if (currentContext && currentContext.userId) {
                handlePvpDisconnect(currentContext.userId, io).catch((error) => {
                    console.error('PvP disconnect kezelési hiba:', error);
                });
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
        isAdminSocket,
        requireAdminSocket,
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
        // Általános célú user-emit a `user-room:${userId}` szobába.
        // Akkor használd, amikor egy konkrét felhasználónak kell egy ad-hoc
        // socket eseményt küldeni (pl. admin által módosított profil push).
        emitToUser(targetUserId, eventName, payload) {
            const normalized = parsePositiveInteger(targetUserId, null);
            if (!normalized || !eventName) return false;
            io.to(`user-room:${normalized}`).emit(String(eventName), payload || {});
            return true;
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
        pushNotificationToUsers(targetUserIds, notification) {
            const payload = {
                ...notification,
                sentAt: new Date().toISOString()
            };
            const uniqueIds = [...new Set((targetUserIds || []).map((id) => parsePositiveInteger(id, null)).filter(Boolean))];
            uniqueIds.forEach((userId) => {
                io.to(`notification-user:${userId}`).emit('notification:push', { ...payload, targetUserId: userId });
            });
            return { payload, deliveredTo: uniqueIds };
        },
        pushNotificationGlobal(notification) {
            const payload = {
                ...notification,
                sentAt: new Date().toISOString(),
                targetUserId: null,
                audience: notification?.audience || 'global'
            };
            io.to(SOCKET_ROOMS.notifications).emit('notification:push', payload);
            return payload;
        },
        emitNotificationBadgeUpdate(userId, unreadCount) {
            const normalizedUserId = parsePositiveInteger(userId, null);
            const normalizedCount = Math.max(0, parsePositiveInteger(unreadCount, 0));
            if (normalizedUserId) {
                io.to(`notification-user:${normalizedUserId}`).emit('notification:badge:update', {
                    unreadCount: normalizedCount,
                    at: new Date().toISOString()
                });
            }
        },
        // Multi-tab szinkron: az adott userhez tartozó összes nyitott klienshez
        // (minden tab) eljut, hogy adott értesítést azonnal eltávolítsa a UI-ból.
        emitNotificationDismissed(userId, notificationId) {
            const normalizedUserId = parsePositiveInteger(userId, null);
            const normalizedNotificationId = parsePositiveInteger(notificationId, null);
            if (normalizedUserId && normalizedNotificationId) {
                io.to(`notification-user:${normalizedUserId}`).emit('notification:dismissed', {
                    notificationId: normalizedNotificationId,
                    at: new Date().toISOString()
                });
            }
        },
        // "Mind olvasott" gomb után: minden látható értesítés tűnjön el a
        // user összes tab-jából.
        emitNotificationDismissedAll(userId) {
            const normalizedUserId = parsePositiveInteger(userId, null);
            if (normalizedUserId) {
                io.to(`notification-user:${normalizedUserId}`).emit('notification:dismissed-all', {
                    at: new Date().toISOString()
                });
            }
        },
        // Friend action utáni cleanup: type+sender filter alapján a kliens
        // törli a megfelelő értesítéseket (ID lista helyett szűrő-leírás).
        emitNotificationDismissedBulk(userId, filter) {
            const normalizedUserId = parsePositiveInteger(userId, null);
            if (normalizedUserId && filter && typeof filter === 'object') {
                io.to(`notification-user:${normalizedUserId}`).emit('notification:dismissed-bulk', {
                    filter: {
                        type: typeof filter.type === 'string' ? filter.type : null,
                        senderUserId: parsePositiveInteger(filter.senderUserId, null)
                    },
                    at: new Date().toISOString()
                });
            }
        },
        emitChatUnreadUpdate(userId, totalUnread) {
            const normalizedUserId = parsePositiveInteger(userId, null);
            const normalizedTotal = Math.max(0, parsePositiveInteger(totalUnread, 0));
            if (normalizedUserId) {
                io.to(`user-room:${normalizedUserId}`).emit('chat:unread:update', {
                    totalUnread: normalizedTotal,
                    at: new Date().toISOString()
                });
            }
        },
        emitChatUnreadUpdateForUsers(userIds, totals) {
            const totalsMap = totals && typeof totals === 'object' ? totals : {};
            const uniqueIds = [...new Set((userIds || []).map((id) => parsePositiveInteger(id, null)).filter(Boolean))];
            uniqueIds.forEach((userId) => {
                const totalUnread = Math.max(0, parsePositiveInteger(totalsMap[userId], 0));
                io.to(`user-room:${userId}`).emit('chat:unread:update', {
                    totalUnread,
                    at: new Date().toISOString()
                });
            });
        },
        broadcastChat(roomId, messagePayload) {
            const conversationId = parsePositiveInteger(roomId, null);
            if (conversationId) {
                io.to(getConversationRoomName(conversationId)).emit('chat:message:new', messagePayload);
            }
        },
        // REST endpointok (chat.js POST /messages) is hívhatják, hogy minden
        // résztvevő authoritative chat:unread:update + chat:list:refresh
        // eseményt kapjon, ne csak a conversation room tagjai.
        broadcastChatMessageSideEffects,
        // Kapcsolat megszűnésekor / cleanup után valós idejű értesítés küldése
        // az érintett felhasználóknak. A frontend erre frissíti a chat listát
        // és eltünteti az aktív beszélgetést.
        notifyConversationDeleted,
        async disconnectUser(targetUserId, reason) {
            const normalized = parsePositiveInteger(targetUserId, null);
            if (!normalized) return false;
            const at = new Date().toISOString();
            io.to(`user-room:${normalized}`).emit('user:force-logout', {
                reason: String(reason || 'admin_revoke_sessions'),
                at
            });
            const sockets = await io.in(`user-room:${normalized}`).fetchSockets();
            sockets.forEach((s) => {
                try { s.disconnect(true); } catch (_) { }
            });
            return true;
        }
    };
}

module.exports = {
    createSocketHub,
    SOCKET_FEATURES,
    SOCKET_ROOMS
};
