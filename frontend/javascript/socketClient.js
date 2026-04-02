(function attachMattMesterSocket(globalScope) {
    const SOCKET_SYNC_TIMEOUT_MS = 2500;
    const SOCKET_CONNECT_TIMEOUT_MS = 3000;
    const SESSION_CONTEXT_REFRESH_DEFAULT_THROTTLE_MS = 1200;

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
        try {
            const existingValue = storage.getItem(key);
            if (existingValue) {
                return existingValue;
            }

            const createdValue = (globalScope.crypto && typeof globalScope.crypto.randomUUID === 'function')
                ? globalScope.crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
            storage.setItem(key, createdValue);
            return createdValue;
        } catch (error) {
            return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        }
    }

    function createSocketState() {
        const clientId = ensureIdentifier(globalScope.localStorage, 'mattmester.clientId');
        const tabId = ensureIdentifier(globalScope.sessionStorage, 'mattmester.tabId');

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
        if (state.connected) {
            return state.sessionBound ? 'Kapcsolódva, sessionnel' : 'Kapcsolódva, vendégként';
        }

        if (state.lastDisconnectReason === 'io server disconnect') {
            return 'Szerver bontotta a kapcsolatot';
        }

        if (state.lastDisconnectReason === 'transport close') {
            return 'Szállítási kapcsolat megszakadt';
        }

        return 'Kapcsolódásra vár';
    }

    function updateText(selector, value) {
        const element = globalScope.document.querySelector(selector);
        if (element) {
            element.textContent = value;
        }
    }

    function updateSocketInfoPanel(state) {
        updateText('[data-socket-bind="status"]', getSocketStatusLabel(state));
        updateText('[data-socket-bind="socketId"]', state.socketId || '-');
        updateText('[data-socket-bind="clientId"]', state.clientId || '-');
        updateText('[data-socket-bind="tabId"]', state.tabId || '-');
        updateText('[data-socket-bind="reconnectAttempts"]', String(state.reconnectAttempts || 0));
        updateText('[data-socket-bind="presence"]', `${state.presence.onlineUsers || 0} online felhasználó`);
        updateText('[data-socket-bind="rooms"]', String(state.roomCount || 0));

        const featureList = globalScope.document.querySelector('[data-socket-bind="features"]');
        if (featureList) {
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
        try {
            globalScope.dispatchEvent(new CustomEvent(eventName, {
                detail: detail || null
            }));
        } catch (error) {
            throw new Error(`Socket kliens esemény dispatch hiba (${eventName}): ${error.message}`);
        }
    }

    function normalizeOwnContext(input = {}) {
        try {
            const userId = Number(input.userId || input.id) || null;
            const username = typeof input.username === 'string' ? input.username.trim() : '';
            const role = typeof input.role === 'string' ? input.role.trim() : '';
            return {
                userId,
                username,
                role
            };
        } catch (error) {
            throw new Error(`Saját context normalizálási hiba: ${error.message}`);
        }
    }

    function hasOwnContextChanged(previousContext = null, nextContext = null) {
        try {
            if (!previousContext && !nextContext) {
                return false;
            }

            if (!previousContext || !nextContext) {
                return true;
            }

            return previousContext.userId !== nextContext.userId
                || previousContext.username !== nextContext.username
                || previousContext.role !== nextContext.role;
        } catch (error) {
            throw new Error(`Context változás ellenőrzési hiba: ${error.message}`);
        }
    }

    function extractOwnContextFromPresence(presencePayload, clientId) {
        try {
            const clients = Array.isArray(presencePayload?.clients) ? presencePayload.clients : [];
            const ownClient = clients.find((client) => String(client?.clientId || '') === String(clientId || ''));
            if (!ownClient) {
                return null;
            }

            return normalizeOwnContext({
                userId: ownClient.userId,
                username: ownClient.username,
                role: ownClient.role
            });
        } catch (error) {
            throw new Error(`Presence alapú saját context kinyerési hiba: ${error.message}`);
        }
    }

    function createSessionContextObserverStore() {
        return {
            nextId: 1,
            handlers: new Map(),
            lastOwnContext: null
        };
    }

    async function runObserverHandler(entry, payload) {
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
                        return;
                    }

                    await runObserverHandler(entry, payload);
                } catch (error) {
                    console.error('Session context observer végrehajtási hiba:', error);
                }
            };

            if (elapsed >= throttleMs) {
                void execute();
                return;
            }

            entry.timer = setTimeout(() => {
                entry.timer = null;
                void execute();
            }, Math.max(0, throttleMs - elapsed));
        } catch (error) {
            throw new Error(`Observer ütemezési hiba: ${error.message}`);
        }
    }

    function notifySessionContextObservers(observerStore, trigger, payload) {
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
        try {
            if (!socketInstance) {
                throw new Error('A socket objektum nem elérhető.');
            }

            if (socketInstance.connected) {
                return;
            }

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
        } catch (error) {
            throw new Error(`Socket kapcsolódási hiba: ${error.message}`);
        }
    }

    async function emitSocketSyncAndWait(socketInstance, reason = 'session-mutation', timeoutMs = SOCKET_SYNC_TIMEOUT_MS) {
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
                        return;
                    }
                    resolve(payload);
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
            socketState.connected = true;
            socketState.socketId = socket.id;
            socketState.lastConnectedAt = new Date().toISOString();
            socketState.lastDisconnectReason = null;
            socketState.reconnectAttempts = socket.io?.reconnectAttempts || socketState.reconnectAttempts;
            emitClientReady(socket, socketState);
            updateSocketInfoPanel(socketState);
        });

        socket.on('disconnect', (reason) => {
            socketState.connected = false;
            socketState.lastDisconnectedAt = new Date().toISOString();
            socketState.lastDisconnectReason = reason || null;
            updateSocketInfoPanel(socketState);
        });

        socket.on('connect_error', (error) => {
            socketState.lastDisconnectReason = error?.message || 'connect_error';
            updateSocketInfoPanel(socketState);
        });

        socket.on('socket:capabilities', (payload = {}) => {
            if (Array.isArray(payload.features) && payload.features.length > 0) {
                socketState.features = payload.features;
            }
            updateSocketInfoPanel(socketState);
        });

        socket.on('socket:state', (payload = {}) => {
            try {
                const previousOwnContext = sessionContextObserverStore.lastOwnContext;
                socketState.socketId = payload.socketId || socketState.socketId;
                socketState.clientId = payload.clientId || socketState.clientId;
                socketState.tabId = payload.tabId || socketState.tabId;
                socketState.page = payload.page || socketState.page;
                socketState.sessionBound = Boolean(payload.sessionBound);
                socketState.user = payload.user || null;
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
                    role: socketState.user?.role
                });

                if (hasOwnContextChanged(previousOwnContext, nextOwnContext)) {
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
            socketState.notificationSubscribed = Boolean(payload.subscribed);
            updateSocketInfoPanel(socketState);
        });

        socket.on('stats:public', (stats) => {
            socketState.statsPublic = stats || null;
            globalScope.dispatchEvent(new CustomEvent('mattmester:stats:public', {
                detail: stats || null
            }));
        });

        socket.on('stats:admin', (stats) => {
            socketState.statsAdmin = stats || null;
            globalScope.dispatchEvent(new CustomEvent('mattmester:stats:admin', {
                detail: stats || null
            }));
        });

        socket.io.on('reconnect_attempt', (attemptNumber) => {
            socketState.reconnectAttempts = attemptNumber || 0;
            updateSocketInfoPanel(socketState);
        });

        socket.io.on('reconnect', (attemptNumber) => {
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
        getSnapshot: () => ({
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
        globalScope.document.addEventListener('DOMContentLoaded', () => updateSocketInfoPanel(socketState), { once: true });
    } else {
        updateSocketInfoPanel(socketState);
    }
})(window);
