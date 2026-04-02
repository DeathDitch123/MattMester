(function attachMattMesterSocket(globalScope) {
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

    const socketState = createSocketState();
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
        });

        socket.on('presence:state', (payload = {}) => {
            socketState.presence = payload;
            updateSocketInfoPanel(socketState);
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
