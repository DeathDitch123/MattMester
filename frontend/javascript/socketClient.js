(function attachMattMesterSocket(globalScope) {
    // Socket műveletek timeoutjai: connect és context-sync műveletekhez.
    const SOCKET_SYNC_TIMEOUT_MS = 2500;
    const SOCKET_CONNECT_TIMEOUT_MS = 3000;
    // Session context observer throttling alapérték (ms).
    const SESSION_CONTEXT_REFRESH_DEFAULT_THROTTLE_MS = 1200;
    const CHAT_OPEN_EVENT_NAME = 'mattmester:chat:open-conversation';
    const NOTIFICATION_PUSH_EVENT_NAME = 'mattmester:notification:push';
    const NOTIFICATION_CLICK_EVENT_NAME = 'mattmester:notification:click';

    // UI fallback feature lista: akkor is van mit megjeleníteni, ha a szerver még
    // nem küldött capabilities payloadot.
    const DEFAULT_FEATURES = [
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
    ];

    function ensureIdentifier(storage, key) {
        // Stabil azonosító biztosítása adott storage-ban (local/session).
        // Ha már létezik, visszaadjuk; ha nem, létrehozzuk és eltároljuk.
        let identifier = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        try {
            const existingValue = storage.getItem(key);
            if (existingValue) {
                identifier = existingValue;
            } else {
                identifier = (globalScope.crypto && typeof globalScope.crypto.randomUUID === 'function')
                    ? globalScope.crypto.randomUUID()
                    : identifier;
                storage.setItem(key, identifier);
            }
        } catch (error) {
            // Fallback az előre létrehozott időbélyeges azonosítóra.
        }

        return identifier;
    }

    function createSocketState() {
        // clientId: böngésző-szintű (localStorage), tabId: fül-szintű (sessionStorage).
        // Ezzel a szerver külön tudja kezelni ugyanazon user több tabját.
        const clientId = ensureIdentifier(globalScope.localStorage, 'mattmester.clientId');
        const tabId = ensureIdentifier(globalScope.sessionStorage, 'mattmester.tabId');

        // Kliens oldali egyetlen forrás-állapot minden sockethez kapcsolódó adatra.
        return {
            connected: false,
            socketId: null,
            clientId,
            tabId,
            page: globalScope.location.pathname,
            reconnectAttempts: 0,
            lastConnectedAt: null,
            lastDisconnectedAt: null,
            lastDisconnectReason: null,
            roomCount: 0,
            rooms: [],
            sessionBound: false,
            user: null,
            profile_image: globalScope.MattMesterProfileImage?.DEFAULT_PROFILE_IMAGE_SRC || '/profile_pictures/default.png',
            profile_image_status: 'default',
            features: [...DEFAULT_FEATURES],
            presence: {
                onlineUsers: 0,
                onlineTabs: 0,
                onlineSockets: 0,
                clients: [],
                generatedAt: null
            },
            roomState: [],
            notificationSubscribed: false,
            statsPublic: null,
            statsAdmin: null
        };
    }

    function getSocketStatusLabel(state) {
        // Emberi olvasható státusz címke az info panelhez.
        let statusLabel = 'Kapcsolódásra vár';

        if (state.connected) {
            statusLabel = state.sessionBound ? 'Kapcsolódva, sessionnel' : 'Kapcsolódva, vendégként';
        } else if (state.lastDisconnectReason === 'io server disconnect') {
            statusLabel = 'Szerver bontotta a kapcsolatot';
        } else if (state.lastDisconnectReason === 'transport close') {
            statusLabel = 'Szállítási kapcsolat megszakadt';
        }

        return statusLabel;
    }

    function updateText(selector, value) {
        // Központi segédfüggvény: biztonságos textContent frissítés.
        const element = globalScope.document.querySelector(selector);
        if (element) {
            element.textContent = value;
        }
    }

    function updateSocketInfoPanel(state) {
        // A socket állapot vizuális leképezése data-socket-bind célpontokra.
        updateText('[data-socket-bind="status"]', getSocketStatusLabel(state));
        updateText('[data-socket-bind="socketId"]', state.socketId || '-');
        updateText('[data-socket-bind="clientId"]', state.clientId || '-');
        updateText('[data-socket-bind="tabId"]', state.tabId || '-');
        updateText('[data-socket-bind="reconnectAttempts"]', String(state.reconnectAttempts || 0));
        updateText('[data-socket-bind="presence"]', `${state.presence.onlineUsers || 0} online felhasználó`);
        updateText('[data-socket-bind="rooms"]', String(state.roomCount || 0));

        const featureList = globalScope.document.querySelector('[data-socket-bind="features"]');
        if (featureList) {
            // Feature kártyák kirenderelése: online/offline állapot szerint eltérő class.
            featureList.innerHTML = state.features.map((feature) => {
                const activeClass = state.connected ? 'socket-feature-card--active' : 'socket-feature-card--idle';
                return `
                    <article class="socket-feature-card ${activeClass}">
                        <div class="socket-feature-card-header">
                            <span class="socket-feature-dot"></span>
                            <h3>${feature.label}</h3>
                        </div>
                        <p>${feature.description}</p>
                    </article>
                `;
            }).join('');
        }

        const roomStateList = globalScope.document.querySelector('[data-socket-bind="roomState"]');
        if (roomStateList) {
            // Ha nincs roomState, adunk egy fallback sort a panelen.
            const roomStateItems = state.roomState.length > 0
                ? state.roomState
                : [{ roomId: 'general-room', state: 'Nincs aktív játékszoba állapot.' }];

            roomStateList.innerHTML = roomStateItems.map((entry) => `
                <div class="socket-meta-item">
                    <span>${entry.roomId}</span>
                    <strong>${typeof entry.state === 'string' ? entry.state : 'Szinkronban'}</strong>
                </div>
            `).join('');
        }

        const clientList = globalScope.document.querySelector('[data-socket-bind="clientCount"]');
        if (clientList) {
            clientList.textContent = `${state.presence.onlineTabs || 0} aktív tab`;
        }
    }

    function emitClientReady(socket, state) {
        // Első connect után kliens-szinkron + feliratkozások elindítása.
        socket.emit('socket:sync', {
            clientId: state.clientId,
            tabId: state.tabId,
            page: state.page,
            title: globalScope.document?.title || null
        });
        socket.emit('presence:subscribe');
        socket.emit('notification:subscribe');
    }

    function dispatchSocketClientEvent(eventName, detail) {
        // Egy helyen történjen a CustomEvent dispatch (egységes hibakezeléssel).
        try {
            globalScope.dispatchEvent(new CustomEvent(eventName, {
                detail: detail || null
            }));
        } catch (error) {
            throw new Error(`Socket kliens esemény dispatch hiba (${eventName}): ${error.message}`);
        }
    }

    function normalizeNotificationPayload(payloadInput = {}) {
        const payload = payloadInput && typeof payloadInput === 'object' ? payloadInput : {};
        const type = String(payload.type || '').trim().toLowerCase();
        const conversationId = Number(payload.conversationId) || 0;
        const fromUserId = Number(payload.fromUserId || payload.targetUserId || payload.senderUserId || payload.userId) || 0;

        return {
            ...payload,
            type,
            conversationId,
            fromUserId
        };
    }

    function dispatchChatOpenFromNotification(payloadInput = {}, source = 'notification-click') {
        const normalizedPayload = normalizeNotificationPayload(payloadInput);
        const isChatMessage = normalizedPayload.type === 'chat_message';
        const hasConversationTarget = normalizedPayload.conversationId > 0;
        const hasUserTarget = normalizedPayload.fromUserId > 0;

        if (isChatMessage && (hasConversationTarget || hasUserTarget)) {
            const openDetail = hasConversationTarget
                ? { conversationId: normalizedPayload.conversationId }
                : { fromUserId: normalizedPayload.fromUserId };

            dispatchSocketClientEvent(CHAT_OPEN_EVENT_NAME, {
                ...openDetail,
                source,
                notificationType: normalizedPayload.type
            });
        }
    }

    function parseNotificationPayloadText(payloadText = '') {
        const rawText = String(payloadText || '').trim();
        let parsedPayload = {};

        if (rawText) {
            try {
                parsedPayload = JSON.parse(rawText);
            } catch (error) {
                parsedPayload = {};
            }
        }

        return parsedPayload;
    }

    function extractNotificationPayloadFromElement(element) {
        const parsedPayload = parseNotificationPayloadText(element?.dataset?.notificationPayload || '');
        const datasetPayload = {
            type: element?.dataset?.notificationType || element?.dataset?.type,
            conversationId: element?.dataset?.conversationId,
            fromUserId: element?.dataset?.fromUserId || element?.dataset?.senderUserId || element?.dataset?.targetUserId || element?.dataset?.userId
        };

        return {
            ...parsedPayload,
            ...datasetPayload
        };
    }

    function normalizeOwnContext(input = {}) {
        // Saját user context normalizálása összehasonlítható formára.
        try {
            const userId = Number(input.userId || input.id) || null;
            const username = typeof input.username === 'string' ? input.username.trim() : '';
            const role = typeof input.role === 'string' ? input.role.trim() : '';
            const profileImageApi = globalScope.MattMesterProfileImage;
            const profile_image = profileImageApi
                ? profileImageApi.normalizeProfileImageSource(input.profile_image)
                : (typeof input.profile_image === 'string' && input.profile_image.trim()
                    ? input.profile_image.trim()
                    : '/profile_pictures/default.png');
            const profile_image_status = typeof input.profile_image_status === 'string' && input.profile_image_status.trim()
                ? input.profile_image_status.trim().toLowerCase()
                : 'default';
            return {
                userId,
                username,
                role,
                profile_image,
                profile_image_status
            };
        } catch (error) {
            throw new Error(`Saját context normalizálási hiba: ${error.message}`);
        }
    }

    function hasOwnContextChanged(previousContext = null, nextContext = null) {
        // Csak valódi változásnál jelezzünk (id/username/role mezők alapján).
        try {
            let hasChanged = false;

            if (!previousContext && !nextContext) {
                hasChanged = false;
            } else if (!previousContext || !nextContext) {
                hasChanged = true;
            } else {
                hasChanged = previousContext.userId !== nextContext.userId
                    || previousContext.username !== nextContext.username
                    || previousContext.role !== nextContext.role
                    || previousContext.profile_image !== nextContext.profile_image
                    || previousContext.profile_image_status !== nextContext.profile_image_status;
            }

            return hasChanged;
        } catch (error) {
            throw new Error(`Context változás ellenőrzési hiba: ${error.message}`);
        }
    }

    function extractOwnContextFromPresence(presencePayload, clientId) {
        // Presence payloadból a saját kliens sorának kinyerése clientId szerint.
        try {
            const clients = Array.isArray(presencePayload?.clients) ? presencePayload.clients : [];
            const ownClient = clients.find((client) => String(client?.clientId || '') === String(clientId || ''));
            let ownContext = null;

            if (ownClient) {
                ownContext = normalizeOwnContext({
                    userId: ownClient.userId,
                    username: ownClient.username,
                    role: ownClient.role,
                    profile_image: ownClient.profile_image,
                    profile_image_status: ownClient.profile_image_status
                });
            }

            return ownContext;
        } catch (error) {
            throw new Error(`Presence alapú saját context kinyerési hiba: ${error.message}`);
        }
    }

    function createSessionContextObserverStore() {
        // Egyszerű in-memory observer regiszter.
        return {
            nextId: 1,
            handlers: new Map(),
            lastOwnContext: null
        };
    }

    async function runObserverHandler(entry, payload) {
        // Egy observer futtatása inFlight jelöléssel, hogy ne induljon párhuzamosan kétszer.
        try {
            entry.inFlight = true;
            entry.lastRunAt = Date.now();
            await entry.handler(payload);
        } catch (error) {
            throw new Error(`Session context observer futási hiba: ${error.message}`);
        } finally {
            entry.inFlight = false;
        }
    }

    function scheduleObserverExecution(entry, payload) {
        // Observer futtatás throttlinggal és ütközésvédelemmel.
        // Ha a handler már fut, későbbre ütemezzük.
        try {
            const now = Date.now();
            const throttleMs = Math.max(0, Number(entry.throttleMs) || 0);
            const elapsed = now - entry.lastRunAt;

            if (entry.timer) {
                clearTimeout(entry.timer);
                entry.timer = null;
            }

            const execute = async () => {
                try {
                    if (entry.inFlight) {
                        entry.timer = setTimeout(execute, throttleMs || 250);
                    } else {
                        await runObserverHandler(entry, payload);
                    }
                } catch (error) {
                    console.error('Session context observer végrehajtási hiba:', error);
                }
            };

            if (elapsed >= throttleMs) {
                void execute();
            } else {
                entry.timer = setTimeout(() => {
                    entry.timer = null;
                    void execute();
                }, Math.max(0, throttleMs - elapsed));
            }
        } catch (error) {
            throw new Error(`Observer ütemezési hiba: ${error.message}`);
        }
    }

    function notifySessionContextObservers(observerStore, trigger, payload) {
        // 1) Globális esemény dispatch 2) Regisztrált handlerek értesítése.
        try {
            const details = {
                trigger,
                payload,
                emittedAt: new Date().toISOString()
            };

            dispatchSocketClientEvent('mattmester:session-context:changed', details);

            observerStore.handlers.forEach((entry) => {
                try {
                    scheduleObserverExecution(entry, details);
                } catch (error) {
                    console.error('Session context observer értesítési hiba:', error);
                }
            });
        } catch (error) {
            throw new Error(`Session context observer értesítési hiba: ${error.message}`);
        }
    }

    function subscribeSessionContextChanges(observerStore, handler, options = {}) {
        // Feliratkozás session context változásra, visszatérési érték: unsubscribe függvény.
        try {
            if (typeof handler !== 'function') {
                throw new Error('A handler kötelező és függvény kell legyen.');
            }

            const id = observerStore.nextId;
            observerStore.nextId += 1;

            observerStore.handlers.set(id, {
                id,
                handler,
                throttleMs: options.throttleMs ?? SESSION_CONTEXT_REFRESH_DEFAULT_THROTTLE_MS,
                inFlight: false,
                timer: null,
                lastRunAt: 0
            });

            return () => {
                try {
                    const entry = observerStore.handlers.get(id);
                    if (entry?.timer) {
                        clearTimeout(entry.timer);
                    }
                    observerStore.handlers.delete(id);
                } catch (error) {
                    throw new Error(`Session context observer leiratkozási hiba: ${error.message}`);
                }
            };
        } catch (error) {
            throw new Error(`Session context observer feliratkozási hiba: ${error.message}`);
        }
    }

    async function ensureSocketConnected(socketInstance, timeoutMs = SOCKET_CONNECT_TIMEOUT_MS) {
        // Garantálja, hogy van élő socket kapcsolat; timeout és connect_error kezelésével.
        try {
            if (!socketInstance) {
                throw new Error('A socket objektum nem elérhető.');
            }

            if (!socketInstance.connected) {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        cleanup();
                        reject(new Error('Socket kapcsolódási timeout.'));
                    }, Math.max(500, Number(timeoutMs) || SOCKET_CONNECT_TIMEOUT_MS));

                    const onConnect = () => {
                        cleanup();
                        resolve();
                    };

                    const onConnectError = (error) => {
                        cleanup();
                        reject(new Error(error?.message || 'Socket connect_error.'));
                    };

                    const cleanup = () => {
                        clearTimeout(timeout);
                        socketInstance.off('connect', onConnect);
                        socketInstance.off('connect_error', onConnectError);
                    };

                    socketInstance.on('connect', onConnect);
                    socketInstance.on('connect_error', onConnectError);

                    try {
                        socketInstance.connect();
                    } catch (error) {
                        cleanup();
                        reject(new Error(error?.message || 'A socket.connect hívás sikertelen.'));
                    }
                });
            }
        } catch (error) {
            throw new Error(`Socket kapcsolódási hiba: ${error.message}`);
        }
    }

    async function emitSocketSyncAndWait(socketInstance, reason = 'session-mutation', timeoutMs = SOCKET_SYNC_TIMEOUT_MS) {
        // socket:sync emit + socket:sync:done válasz megvárása timeouttal.
        try {
            if (!socketInstance) {
                throw new Error('A socket objektum nem elérhető.');
            }

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    cleanup();
                    reject(new Error('Socket context frissítési timeout.'));
                }, Math.max(500, Number(timeoutMs) || SOCKET_SYNC_TIMEOUT_MS));

                const onSyncDone = (payload = {}) => {
                    cleanup();
                    if (!payload.success) {
                        reject(new Error(payload.message || 'A socket context frissítése sikertelen.'));
                    } else {
                        resolve(payload);
                    }
                };

                const cleanup = () => {
                    clearTimeout(timeout);
                    socketInstance.off('socket:sync:done', onSyncDone);
                };

                socketInstance.on('socket:sync:done', onSyncDone);

                try {
                    socketInstance.emit('socket:sync', {
                        reason,
                        emittedAt: new Date().toISOString()
                    });
                } catch (error) {
                    cleanup();
                    reject(new Error(error?.message || 'A socket:sync emit sikertelen.'));
                }
            });
        } catch (error) {
            throw new Error(`Socket context sync hiba: ${error.message}`);
        }
    }

    async function syncSocketContextOrReconnect(socketInstance, reason = 'session-mutation', options = {}) {
        // Első körben normál sync; hiba esetén fallback: disconnect -> reconnect -> új sync.
        try {
            const connectTimeoutMs = options.connectTimeoutMs ?? SOCKET_CONNECT_TIMEOUT_MS;
            const syncTimeoutMs = options.syncTimeoutMs ?? SOCKET_SYNC_TIMEOUT_MS;

            await ensureSocketConnected(socketInstance, connectTimeoutMs);
            await emitSocketSyncAndWait(socketInstance, reason, syncTimeoutMs);
        } catch (initialError) {
            try {
                if (!socketInstance) {
                    throw new Error('A socket objektum nem elérhető fallback reconnecthez.');
                }

                socketInstance.disconnect();
                await ensureSocketConnected(socketInstance, options.connectTimeoutMs ?? SOCKET_CONNECT_TIMEOUT_MS);
                await emitSocketSyncAndWait(
                    socketInstance,
                    `${reason}:fallback-reconnect`,
                    options.syncTimeoutMs ?? SOCKET_SYNC_TIMEOUT_MS
                );
            } catch (fallbackError) {
                throw new Error(`Socket context frissítés és fallback reconnect is sikertelen: ${fallbackError.message || initialError.message}`);
            }
        }
    }

    const socketState = createSocketState();
    const sessionContextObserverStore = createSessionContextObserverStore();
    // Socket.IO kliens inicializálása auth metadattal (client/tab/page).
    const socket = typeof globalScope.io === 'function'
        ? globalScope.io({
            auth: {
                clientId: socketState.clientId,
                tabId: socketState.tabId,
                page: socketState.page
            },
            transports: ['websocket', 'polling']
        })
        : null;

    if (socket) {
        socket.on('connect', () => {
            // Sikeres kapcsolat: kliens állapot beállítás, ready emit, UI frissítés.
            socketState.connected = true;
            socketState.socketId = socket.id;
            socketState.lastConnectedAt = new Date().toISOString();
            socketState.lastDisconnectReason = null;
            socketState.reconnectAttempts = socket.io?.reconnectAttempts || socketState.reconnectAttempts;
            emitClientReady(socket, socketState);
            updateSocketInfoPanel(socketState);
        });

        socket.on('disconnect', (reason) => {
            // Kapcsolat bontva: ok mentése és panel frissítés.
            socketState.connected = false;
            socketState.lastDisconnectedAt = new Date().toISOString();
            socketState.lastDisconnectReason = reason || null;
            updateSocketInfoPanel(socketState);
        });

        socket.on('connect_error', (error) => {
            // Csatlakozási hiba visszajelzése a state-ben és UI-n.
            socketState.lastDisconnectReason = error?.message || 'connect_error';
            updateSocketInfoPanel(socketState);
        });

        socket.on('socket:capabilities', (payload = {}) => {
            // Szerver oldali képességlista frissíti a feature kártyákat.
            if (Array.isArray(payload.features) && payload.features.length > 0) {
                socketState.features = payload.features;
            }
            updateSocketInfoPanel(socketState);
        });

        socket.on('socket:state', (payload = {}) => {
            // Teljes socket/session állapotfrissítés a szervertől.
            try {
                const previousOwnContext = sessionContextObserverStore.lastOwnContext;
                socketState.socketId = payload.socketId || socketState.socketId;
                socketState.clientId = payload.clientId || socketState.clientId;
                socketState.tabId = payload.tabId || socketState.tabId;
                socketState.page = payload.page || socketState.page;
                socketState.sessionBound = Boolean(payload.sessionBound);
                socketState.user = payload.user || null;
                const profileImageApi = globalScope.MattMesterProfileImage;
                const defaultProfileImage = profileImageApi?.DEFAULT_PROFILE_IMAGE_SRC || '/profile_pictures/default.png';
                socketState.profile_image = payload.profile_image || payload.user?.profile_image || socketState.profile_image || defaultProfileImage;
                socketState.profile_image_status = payload.profile_image_status || payload.user?.profile_image_status || socketState.profile_image_status || 'default';
                socketState.roomCount = payload.roomCount || 0;
                socketState.rooms = Array.isArray(payload.rooms) ? payload.rooms : [];
                socketState.presence = payload.presence || socketState.presence;
                socketState.roomState = Array.isArray(payload.roomState) ? payload.roomState : [];
                updateSocketInfoPanel(socketState);

                dispatchSocketClientEvent('mattmester:socket:state', {
                    ...payload,
                    receivedAt: new Date().toISOString()
                });

                const nextOwnContext = normalizeOwnContext({
                    userId: socketState.user?.id,
                    username: socketState.user?.username,
                    role: socketState.user?.role,
                    profile_image: socketState.user?.profile_image,
                    profile_image_status: socketState.user?.profile_image_status
                });

                if (hasOwnContextChanged(previousOwnContext, nextOwnContext)) {
                    // Saját user context váltásról observer értesítés.
                    sessionContextObserverStore.lastOwnContext = nextOwnContext;
                    notifySessionContextObservers(sessionContextObserverStore, 'socket:state', {
                        previousOwnContext,
                        nextOwnContext,
                        socketState: {
                            connected: socketState.connected,
                            socketId: socketState.socketId,
                            clientId: socketState.clientId,
                            tabId: socketState.tabId
                        }
                    });
                }
            } catch (error) {
                console.error('socket:state feldolgozási hiba:', error);
            }
        });

        socket.on('presence:state', (payload = {}) => {
            // Presence állapotfrissítés (online user/tab/socket adatok).
            try {
                const previousOwnContext = sessionContextObserverStore.lastOwnContext;
                socketState.presence = payload;
                updateSocketInfoPanel(socketState);

                dispatchSocketClientEvent('mattmester:presence:state', {
                    ...payload,
                    receivedAt: new Date().toISOString()
                });

                const ownPresenceContext = extractOwnContextFromPresence(payload, socketState.clientId);
                if (hasOwnContextChanged(previousOwnContext, ownPresenceContext)) {
                    // Presence-ből számolt saját context változásról observer értesítés.
                    sessionContextObserverStore.lastOwnContext = ownPresenceContext;
                    notifySessionContextObservers(sessionContextObserverStore, 'presence:state', {
                        previousOwnContext,
                        nextOwnContext: ownPresenceContext,
                        clientId: socketState.clientId
                    });
                }
            } catch (error) {
                console.error('presence:state feldolgozási hiba:', error);
            }
        });

        socket.on('notification:state', (payload = {}) => {
            // Notification feliratkozottság állapotának frissítése.
            socketState.notificationSubscribed = Boolean(payload.subscribed);
            updateSocketInfoPanel(socketState);
        });

        socket.on('notification:reset', (payload = {}) => {
            // Session váltás (login / logout / user A -> user B) után érkezik:
            // a kliens törölje a cache-elt értesítés listát és badge-et.
            try {
                globalScope.dispatchEvent(new CustomEvent('mattmester:notification:reset', {
                    detail: {
                        previousUserId: payload?.previousUserId || null,
                        currentUserId: payload?.currentUserId || null,
                        reason: payload?.reason || 'session-change',
                        at: payload?.at || new Date().toISOString()
                    }
                }));
            } catch (resetError) {
                console.warn('[socketClient] notification:reset hiba:', resetError.message);
            }
        });

        socket.on('chat:unread:reset', (payload = {}) => {
            // Session váltás után a chat unread totalt is nullázzuk.
            try {
                globalScope.dispatchEvent(new CustomEvent('mattmester:chat:unread:reset', {
                    detail: {
                        previousUserId: payload?.previousUserId || null,
                        currentUserId: payload?.currentUserId || null,
                        reason: payload?.reason || 'session-change',
                        at: payload?.at || new Date().toISOString()
                    }
                }));
            } catch (resetError) {
                console.warn('[socketClient] chat:unread:reset hiba:', resetError.message);
            }
        });

        socket.on('notification:push', (payload = {}) => {
            // Notification payload továbbítása globális eseményként a közös moduloknak.
            const normalizedPayload = normalizeNotificationPayload(payload);
            dispatchSocketClientEvent(NOTIFICATION_PUSH_EVENT_NAME, {
                ...normalizedPayload,
                receivedAt: new Date().toISOString()
            });
        });

        socket.on('notification:badge:update', (payload = {}) => {
            // Authoritative badge frissítés a szerverről (DB alapú olvasatlan szám).
            try {
                const unreadCount = Number(payload?.unreadCount) || 0;
                globalScope.dispatchEvent(new CustomEvent('mattmester:notification:badge', {
                    detail: { unreadCount, at: payload?.at || new Date().toISOString() }
                }));
            } catch (badgeError) {
                console.warn('[socketClient] notification:badge:update hiba:', badgeError.message);
            }
        });

        // Multi-tab szinkron: ha az adott user másik tabján egy értesítést
        // dismiss-elt, vagy a backend dismiss-elt egy kapcsolódó értesítést
        // (pl. friend action), itt érkezik be a parancs.
        socket.on('notification:dismissed', (payload = {}) => {
            try {
                const notificationId = Number(payload?.notificationId) || 0;
                if (notificationId > 0) {
                    globalScope.dispatchEvent(new CustomEvent('mattmester:notification:dismissed', {
                        detail: { notificationId, at: payload?.at || new Date().toISOString() }
                    }));
                }
            } catch (dismissError) {
                console.warn('[socketClient] notification:dismissed hiba:', dismissError.message);
            }
        });

        socket.on('notification:dismissed-all', (payload = {}) => {
            try {
                globalScope.dispatchEvent(new CustomEvent('mattmester:notification:dismissed-all', {
                    detail: { at: payload?.at || new Date().toISOString() }
                }));
            } catch (dismissAllError) {
                console.warn('[socketClient] notification:dismissed-all hiba:', dismissAllError.message);
            }
        });

        socket.on('notification:dismissed-bulk', (payload = {}) => {
            try {
                const filter = payload?.filter && typeof payload.filter === 'object' ? payload.filter : {};
                globalScope.dispatchEvent(new CustomEvent('mattmester:notification:dismissed-bulk', {
                    detail: {
                        filter: {
                            type: typeof filter.type === 'string' ? filter.type : null,
                            senderUserId: Number(filter.senderUserId) || null
                        },
                        at: payload?.at || new Date().toISOString()
                    }
                }));
            } catch (dismissBulkError) {
                console.warn('[socketClient] notification:dismissed-bulk hiba:', dismissBulkError.message);
            }
        });

        socket.on('chat:unread:update', (payload = {}) => {
            // Authoritative chat unread összesen frissítés (pl. mark-read után).
            try {
                const totalUnread = Number(payload?.totalUnread) || 0;
                globalScope.dispatchEvent(new CustomEvent('mattmester:chat:unread-total', {
                    detail: { totalUnread, at: payload?.at || new Date().toISOString() }
                }));
            } catch (chatBadgeError) {
                console.warn('[socketClient] chat:unread:update hiba:', chatBadgeError.message);
            }
        });

        globalScope.addEventListener(NOTIFICATION_CLICK_EVENT_NAME, (event) => {
            const detail = event?.detail || {};
            dispatchChatOpenFromNotification(detail, 'notification-click-event');
        });

        globalScope.document.addEventListener('click', (event) => {
            const isElementTarget = Boolean(globalScope.Element && event?.target instanceof globalScope.Element);
            const clickableNotification = isElementTarget
                ? event.target.closest('[data-notification-click]')
                : null;

            if (clickableNotification) {
                const payload = extractNotificationPayloadFromElement(clickableNotification);
                dispatchSocketClientEvent(NOTIFICATION_CLICK_EVENT_NAME, {
                    ...payload,
                    source: 'notification-dom-click'
                });
            }
        });

        socket.on('stats:public', (stats) => {
            // Publikus statisztika mentése + custom event továbbítás.
            socketState.statsPublic = stats || null;
            globalScope.dispatchEvent(new CustomEvent('mattmester:stats:public', {
                detail: stats || null
            }));
        });

        socket.on('stats:admin', (stats) => {
            // Admin statisztika mentése + custom event továbbítás.
            socketState.statsAdmin = stats || null;
            globalScope.dispatchEvent(new CustomEvent('mattmester:stats:admin', {
                detail: stats || null
            }));
        });

        socket.io.on('reconnect_attempt', (attemptNumber) => {
            // Reconnect próbálkozások számlálása UI célra.
            socketState.reconnectAttempts = attemptNumber || 0;
            updateSocketInfoPanel(socketState);
        });

        socket.io.on('reconnect', (attemptNumber) => {
            // Sikeres reconnect után számláló/státusz frissítése.
            socketState.reconnectAttempts = attemptNumber || socketState.reconnectAttempts;
            updateSocketInfoPanel(socketState);
        });

        globalScope.addEventListener('beforeunload', () => {
            try {
                socketState.lastDisconnectReason = 'page-unload';
                updateSocketInfoPanel(socketState);
            } catch (error) {
                // Nincs teendő, az ablak már záródik.
            }
        });
    }

    globalScope.MattMesterSocket = {
        // Publikus API a többi frontend modul számára.
        socket,
        info: socketState,
        refresh: () => updateSocketInfoPanel(socketState),
        ensureSocketConnected: async (timeoutMs = SOCKET_CONNECT_TIMEOUT_MS) => {
            try {
                await ensureSocketConnected(socket, timeoutMs);
            } catch (error) {
                throw new Error(error.message || 'Socket kapcsolat ellenőrzési hiba.');
            }
        },
        emitSocketSyncAndWait: async (reason = 'session-mutation', timeoutMs = SOCKET_SYNC_TIMEOUT_MS) => {
            try {
                await emitSocketSyncAndWait(socket, reason, timeoutMs);
            } catch (error) {
                throw new Error(error.message || 'Socket sync esemény hiba.');
            }
        },
        syncSocketContextOrReconnect: async (reason = 'session-mutation', options = {}) => {
            try {
                await syncSocketContextOrReconnect(socket, reason, options);
            } catch (error) {
                throw new Error(error.message || 'Socket context szinkronizálási hiba.');
            }
        },
        subscribeSessionContextChanges: (handler, options = {}) => {
            try {
                return subscribeSessionContextChanges(sessionContextObserverStore, handler, options);
            } catch (error) {
                throw new Error(error.message || 'Session context observer regisztrációs hiba.');
            }
        },
        handleNotificationClick: (payload = {}) => {
            try {
                dispatchSocketClientEvent(NOTIFICATION_CLICK_EVENT_NAME, {
                    ...(payload || {}),
                    source: 'notification-api'
                });
            } catch (error) {
                throw new Error(error.message || 'Notification kattintas esemeny hiba.');
            }
        },
        getSnapshot: () => ({
            // Védett másolat: kívülről ne lehessen közvetlenül mutálni a belső state-et.
            ...socketState,
            features: [...socketState.features],
            rooms: [...socketState.rooms],
            presence: {
                ...socketState.presence,
                clients: Array.isArray(socketState.presence.clients) ? [...socketState.presence.clients] : []
            },
            roomState: Array.isArray(socketState.roomState) ? [...socketState.roomState] : [],
            statsPublic: socketState.statsPublic ? { ...socketState.statsPublic } : null,
            statsAdmin: socketState.statsAdmin ? { ...socketState.statsAdmin } : null
        })
    };

    if (globalScope.document.readyState === 'loading') {
        // DOM készenlét után inicial panel frissítés.
        globalScope.document.addEventListener('DOMContentLoaded', () => updateSocketInfoPanel(socketState), { once: true });
    } else {
        // Ha a DOM már kész, azonnal frissítünk.
        updateSocketInfoPanel(socketState);
    }
})(window);
