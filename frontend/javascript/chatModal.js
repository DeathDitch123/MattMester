(function initMattMesterChatModal(globalScope) {
    const CHAT_OPEN_EVENT_NAME = 'mattmester:chat:open-conversation';

    const DEFAULTS = {
        conversationsEndpoint: '/api/chat/conversations',
        conversationMessagesEndpoint: (conversationId, beforeCursor, limit) => {
            const params = new URLSearchParams();
            if (beforeCursor) {
                params.set('before', String(beforeCursor));
            }
            params.set('limit', String(limit || 30));
            return `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`;
        },
        sendMessageEndpoint: (conversationId) => `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
        openDirectEndpoint: '/api/chat/conversations/direct',
        pageLimit: 30
    };

    const state = {
        initialized: false,
        globalEventsBound: false,
        options: { ...DEFAULTS },
        activeConversationId: null,
        conversationList: [],
        messagesByConversation: new Map(),
        paginationCursorByConversation: new Map(),
        hasMoreByConversation: new Map(),
        isLoadingByConversation: new Map(),
        isSendingMessage: false,
        searchText: '',
        modalInstance: null,
        boundSocket: null
    };

    const dom = {
        root: null,
        floatingButton: null,
        modal: null,
        searchInput: null,
        conversationList: null,
        conversationEmpty: null,
        conversationLoading: null,
        headerTitle: null,
        headerSubtitle: null,
        messageList: null,
        messageEmpty: null,
        messageLoading: null,
        messageInput: null,
        sendButton: null,
        feedback: null
    };

    function ensureStyles() {
        const existingStyle = globalScope.document.getElementById('chatModalStyles');
        if (!existingStyle) {
            const style = globalScope.document.createElement('style');
            style.id = 'chatModalStyles';
            style.textContent = `
            .chat-floating-button {
                position: fixed;
                right: 20px;
                bottom: 20px;
                width: 56px;
                height: 56px;
                border-radius: 999px;
                border: none;
                background: linear-gradient(135deg, #d4af37, #f4d67a);
                color: #111827;
                box-shadow: 0 10px 30px rgba(212, 175, 55, 0.35);
                z-index: 1080;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                font-weight: 700;
            }
            .chat-modal-dialog {
                max-width: 1100px;
            }
            .chat-modal-content {
                height: min(80vh, 860px);
                background: #0f172a;
                border: 1px solid #1e293b;
                color: #e2e8f0;
            }
            .chat-layout {
                height: 100%;
            }
            .chat-left {
                border-right: 1px solid #1e293b;
                background: #111827;
                display: flex;
                flex-direction: column;
                min-height: 0;
            }
            .chat-search-wrap {
                padding: 12px;
                border-bottom: 1px solid #1e293b;
            }
            .chat-search-input {
                width: 100%;
                background: #0b1220;
                border: 1px solid #334155;
                color: #e2e8f0;
                border-radius: 10px;
                padding: 10px 12px;
            }
            .chat-conversation-list {
                overflow-y: auto;
                padding: 10px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                min-height: 0;
            }
            .chat-conversation-item {
                background: #0b1220;
                border: 1px solid #233041;
                border-radius: 10px;
                padding: 10px;
                cursor: pointer;
            }
            .chat-conversation-item.is-active {
                border-color: #d4af37;
                box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.35) inset;
            }
            .chat-row-top {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
            }
            .chat-unread-badge {
                min-width: 18px;
                height: 18px;
                border-radius: 999px;
                background: #ef4444;
                color: #fff;
                font-size: 11px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0 6px;
            }
            .chat-right {
                display: flex;
                flex-direction: column;
                min-width: 0;
                min-height: 0;
            }
            .chat-header {
                border-bottom: 1px solid #1e293b;
                padding: 14px 16px;
                background: #0f172a;
            }
            .chat-message-list {
                flex: 1;
                overflow-y: auto;
                padding: 14px 16px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                background: radial-gradient(circle at top right, rgba(56, 189, 248, 0.08), transparent 45%), #0b1220;
                min-height: 0;
            }
            .chat-message {
                max-width: 80%;
                padding: 10px 12px;
                border-radius: 12px;
                border: 1px solid #2b3d50;
                background: #0f172a;
            }
            .chat-message.is-mine {
                margin-left: auto;
                border-color: #d4af37;
                background: #1f2937;
            }
            .chat-message-meta {
                font-size: 11px;
                opacity: 0.8;
                margin-bottom: 4px;
            }
            .chat-composer {
                border-top: 1px solid #1e293b;
                padding: 12px;
                background: #0f172a;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .chat-input-row {
                display: flex;
                gap: 8px;
            }
            .chat-input {
                flex: 1;
                border: 1px solid #334155;
                background: #0b1220;
                color: #e2e8f0;
                border-radius: 10px;
                padding: 10px 12px;
            }
            .chat-placeholder {
                color: #94a3b8;
                font-size: 13px;
                padding: 12px;
                text-align: center;
            }
            @media (max-width: 991.98px) {
                .chat-modal-content {
                    height: 100vh;
                    border-radius: 0;
                }
                .chat-left {
                    border-right: 0;
                    border-bottom: 1px solid #1e293b;
                    max-height: 36vh;
                }
                .chat-floating-button {
                    right: 14px;
                    bottom: 14px;
                }
            }
            `;

            globalScope.document.head.appendChild(style);
        }
    }

    function ensureMarkup() {
        const hasMarkup = Boolean(globalScope.document.getElementById('chatFloatingButton'));
        if (hasMarkup) {
            cacheDomReferences();
        } else {
            const wrapper = globalScope.document.createElement('div');
            wrapper.id = 'chatModalRoot';
            wrapper.innerHTML = `
            <button id="chatFloatingButton" class="chat-floating-button" type="button" aria-label="Chat" title="Chat">💬</button>
            <div class="modal fade" id="chatModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered modal-xl modal-fullscreen-lg-down chat-modal-dialog">
                    <div class="modal-content chat-modal-content">
                        <div class="chat-layout container-fluid h-100 p-0">
                            <div class="row g-0 h-100">
                            <aside class="chat-left col-12 col-lg-4">
                                <div class="chat-search-wrap">
                                    <div class="input-group input-group-sm">
                                        <span class="input-group-text bg-dark text-secondary border-secondary">🔎</span>
                                        <input id="chatConversationSearch" class="chat-search-input form-control border-secondary" type="text" placeholder="Kereses beszelgetesben..." />
                                    </div>
                                </div>
                                <div id="chatConversationLoading" class="chat-placeholder d-none">Beszelgetesek betoltese...</div>
                                <div id="chatConversationEmpty" class="chat-placeholder d-none">Nincs beszelgetes.</div>
                                <div id="chatConversationList" class="chat-conversation-list" role="list"></div>
                            </aside>
                            <section class="chat-right col-12 col-lg-8">
                                <header class="chat-header">
                                    <div id="chatHeaderTitle" class="fw-semibold">Valassz beszelgetest</div>
                                    <div id="chatHeaderSubtitle" class="small text-secondary">Realtime chat</div>
                                </header>
                                <div id="chatMessageLoading" class="chat-placeholder d-none">Uzenetek betoltese...</div>
                                <div id="chatMessageEmpty" class="chat-placeholder">Nincs megjelenitheto uzenet.</div>
                                <div id="chatMessageList" class="chat-message-list" role="log" aria-live="polite"></div>
                                <div class="chat-composer">
                                    <div id="chatFeedback" class="small text-danger d-none"></div>
                                    <div class="chat-input-row">
                                        <input id="chatMessageInput" class="chat-input form-control border-secondary" type="text" maxlength="1000" placeholder="Irj uzenetet..." />
                                        <button id="chatSendButton" class="btn btn-warning flex-shrink-0" type="button">Kuldes</button>
                                    </div>
                                </div>
                            </section>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            `;

            globalScope.document.body.appendChild(wrapper);
            cacheDomReferences();
        }
    }

    function cacheDomReferences() {
        dom.root = globalScope.document.getElementById('chatModalRoot');
        dom.floatingButton = globalScope.document.getElementById('chatFloatingButton');
        dom.modal = globalScope.document.getElementById('chatModal');
        dom.searchInput = globalScope.document.getElementById('chatConversationSearch');
        dom.conversationList = globalScope.document.getElementById('chatConversationList');
        dom.conversationEmpty = globalScope.document.getElementById('chatConversationEmpty');
        dom.conversationLoading = globalScope.document.getElementById('chatConversationLoading');
        dom.headerTitle = globalScope.document.getElementById('chatHeaderTitle');
        dom.headerSubtitle = globalScope.document.getElementById('chatHeaderSubtitle');
        dom.messageList = globalScope.document.getElementById('chatMessageList');
        dom.messageEmpty = globalScope.document.getElementById('chatMessageEmpty');
        dom.messageLoading = globalScope.document.getElementById('chatMessageLoading');
        dom.messageInput = globalScope.document.getElementById('chatMessageInput');
        dom.sendButton = globalScope.document.getElementById('chatSendButton');
        dom.feedback = globalScope.document.getElementById('chatFeedback');
    }

    function mergeOptions(options) {
        state.options = {
            ...DEFAULTS,
            ...(options || {})
        };
    }

    function setFeedback(message, isError) {
        if (dom.feedback) {
            const text = String(message || '').trim();
            dom.feedback.textContent = text;
            dom.feedback.classList.toggle('d-none', !text);
            dom.feedback.classList.toggle('text-danger', Boolean(isError));
            dom.feedback.classList.toggle('text-success', text.length > 0 && !isError);
        }
    }

    async function requestJson(url, options) {
        const response = await fetch(url, options || {});
        let payload = {};
        try {
            payload = await response.json();
        } catch (error) {
            payload = {};
        }

        if (!response.ok || payload.success === false) {
            const message = payload.message || 'Sikertelen API muvelet.';
            throw new Error(message);
        }

        return payload;
    }

    function formatDate(value) {
        const date = new Date(value);
        let formatted = '';
        if (!Number.isNaN(date.getTime())) {
            formatted = date.toLocaleString('hu-HU', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        return formatted;
    }

    function getConversationTitle(conversation) {
        return conversation?.otherUser?.username
            || conversation?.name
            || `Beszelgetes #${conversation?.conversationId || '?'}`;
    }

    function findConversation(conversationId) {
        const normalizedId = Number(conversationId) || 0;
        return state.conversationList.find((item) => Number(item.conversationId) === normalizedId) || null;
    }

    function updateConversationEmptyState() {
        if (dom.conversationEmpty && dom.conversationList) {
            const hasVisibleItem = dom.conversationList.children.length > 0;
            dom.conversationEmpty.classList.toggle('d-none', hasVisibleItem);
        }
    }

    function renderConversationList() {
        if (dom.conversationList) {
            const needle = String(state.searchText || '').trim().toLowerCase();
            const items = needle
                ? state.conversationList.filter((conversation) => {
                    const title = getConversationTitle(conversation).toLowerCase();
                    const preview = String(conversation.lastMessagePreview || '').toLowerCase();
                    return title.includes(needle) || preview.includes(needle);
                })
                : state.conversationList;

            dom.conversationList.innerHTML = '';

            items.forEach((conversation) => {
                const element = globalScope.document.createElement('button');
                element.type = 'button';
                element.className = 'chat-conversation-item';
                element.dataset.conversationId = String(conversation.conversationId);
                if (Number(state.activeConversationId) === Number(conversation.conversationId)) {
                    element.classList.add('is-active');
                }

                const unreadCount = Number(conversation.unreadCount || 0);
                const unreadBadge = unreadCount > 0 ? `<span class="chat-unread-badge">${Math.min(unreadCount, 99)}</span>` : '';
                element.innerHTML = `
                <div class="chat-row-top">
                    <strong class="text-truncate">${getConversationTitle(conversation)}</strong>
                    ${unreadBadge}
                </div>
                <div class="small text-secondary text-truncate mt-1">${String(conversation.lastMessagePreview || 'Nincs uzenet.')}</div>
                <div class="small text-secondary mt-1">${formatDate(conversation.lastMessageAt)}</div>
            `;

                element.addEventListener('click', () => {
                    openConversation(conversation.conversationId).catch((error) => {
                        setFeedback(error.message || 'Nem sikerult megnyitni a beszelgetest.', true);
                    });
                });

                dom.conversationList.appendChild(element);
            });

            updateConversationEmptyState();
        }
    }

    function setConversationLoading(isLoading) {
        if (dom.conversationLoading) {
            dom.conversationLoading.classList.toggle('d-none', !isLoading);
        }
    }

    function setMessageLoading(isLoading) {
        if (dom.messageLoading) {
            dom.messageLoading.classList.toggle('d-none', !isLoading);
        }
    }

    function setMessageEmptyState(isEmpty, text) {
        if (dom.messageEmpty) {
            if (text) {
                dom.messageEmpty.textContent = text;
            }
            dom.messageEmpty.classList.toggle('d-none', !isEmpty);
        }
    }

    function getMessagesForConversation(conversationId) {
        const key = Number(conversationId) || 0;
        if (!state.messagesByConversation.has(key)) {
            state.messagesByConversation.set(key, []);
        }
        return state.messagesByConversation.get(key);
    }

    function pushOrUpdateMessage(conversationId, message) {
        const key = Number(conversationId) || 0;
        const messages = getMessagesForConversation(key);
        const existingIndex = messages.findIndex((item) => Number(item.id) === Number(message.id));
        if (existingIndex >= 0) {
            messages[existingIndex] = message;
        } else {
            messages.push(message);
            messages.sort((left, right) => Number(left.id) - Number(right.id));
        }
        state.messagesByConversation.set(key, messages);
    }

    function renderMessageList() {
        const conversationId = Number(state.activeConversationId) || 0;
        const canRenderConversation = Boolean(conversationId && dom.messageList);

        if (canRenderConversation) {
            const messages = getMessagesForConversation(conversationId);
            dom.messageList.innerHTML = '';

            messages.forEach((message) => {
                const element = globalScope.document.createElement('div');
                element.className = 'chat-message';

                const ownUserId = Number(globalScope.MattMesterSocket?.info?.user?.id || globalScope.MattMesterSocket?.getSnapshot?.()?.user?.id || 0);
                if (ownUserId && Number(message.senderId) === ownUserId) {
                    element.classList.add('is-mine');
                }

                const meta = globalScope.document.createElement('div');
                meta.className = 'chat-message-meta';
                meta.textContent = `${message.senderUsername || 'Jatekos'} · ${formatDate(message.sentAt)}`;

                const body = globalScope.document.createElement('div');
                body.className = 'chat-message-body';
                body.textContent = String(message.body || '');

                element.appendChild(meta);
                element.appendChild(body);
                dom.messageList.appendChild(element);
            });

            const hasMessages = messages.length > 0;
            setMessageEmptyState(!hasMessages, hasMessages ? '' : 'Nincs megjelenitheto uzenet.');
            dom.messageList.scrollTop = dom.messageList.scrollHeight;
        } else {
            if (dom.messageList) {
                dom.messageList.innerHTML = '';
            }
            setMessageEmptyState(true, 'Nincs megjelenitheto uzenet.');
        }
    }

    function markConversationUnread(conversationId) {
        const conversation = findConversation(conversationId);
        if (conversation && Number(state.activeConversationId) !== Number(conversationId)) {
            conversation.unreadCount = Number(conversation.unreadCount || 0) + 1;
        }
    }

    function moveConversationToTop(conversationId) {
        const normalizedId = Number(conversationId) || 0;
        const index = state.conversationList.findIndex((item) => Number(item.conversationId) === normalizedId);
        if (index > 0) {
            const [conversation] = state.conversationList.splice(index, 1);
            state.conversationList.unshift(conversation);
        }
    }

    async function loadConversations() {
        setConversationLoading(true);
        try {
            const payload = await requestJson(`${state.options.conversationsEndpoint}?limit=${state.options.pageLimit}`);
            state.conversationList = Array.isArray(payload.data) ? payload.data : [];
            renderConversationList();
        } finally {
            setConversationLoading(false);
        }
    }

    async function loadConversationMessages(conversationId, options) {
        const normalizedId = Number(conversationId) || 0;
        if (!normalizedId) {
            throw new Error('Ervenytelen beszelgetes azonosito.');
        }

        const isLoadOlder = Boolean(options?.older);
        if (state.isLoadingByConversation.get(normalizedId)) {
            return undefined;
        }

        state.isLoadingByConversation.set(normalizedId, true);
        setMessageLoading(true);

        try {
            const cursor = isLoadOlder ? state.paginationCursorByConversation.get(normalizedId) : null;
            const endpoint = state.options.conversationMessagesEndpoint(normalizedId, cursor, state.options.pageLimit);
            const payload = await requestJson(endpoint);

            const incoming = Array.isArray(payload.data) ? payload.data : [];
            const current = getMessagesForConversation(normalizedId);

            if (isLoadOlder) {
                const merged = [...incoming, ...current];
                const deduped = [];
                const seen = new Set();
                merged.forEach((item) => {
                    const key = Number(item.id) || 0;
                    if (!seen.has(key)) {
                        seen.add(key);
                        deduped.push(item);
                    }
                });
                deduped.sort((left, right) => Number(left.id) - Number(right.id));
                state.messagesByConversation.set(normalizedId, deduped);
            } else {
                state.messagesByConversation.set(normalizedId, incoming);
            }

            state.paginationCursorByConversation.set(normalizedId, payload.cursor || null);
            state.hasMoreByConversation.set(normalizedId, Boolean(payload.hasMore));
            renderMessageList();
        } finally {
            state.isLoadingByConversation.set(normalizedId, false);
            setMessageLoading(false);
        }
    }

    function getSocket() {
        return globalScope.MattMesterSocket?.socket || null;
    }

    function bindSocketEvents() {
        const socket = getSocket();
        if (socket && state.boundSocket !== socket) {
            if (state.boundSocket) {
                state.boundSocket.off('chat:message:new', onSocketMessageNew);
                state.boundSocket.off('chat:error', onSocketError);
            }

            state.boundSocket = socket;
            socket.on('chat:message:new', onSocketMessageNew);
            socket.on('chat:error', onSocketError);
        }
    }

    function onSocketMessageNew(messagePayload) {
        const conversationId = Number(messagePayload?.conversationId) || 0;
        if (conversationId) {
            pushOrUpdateMessage(conversationId, messagePayload);
            const conversation = findConversation(conversationId);
            if (conversation) {
                conversation.lastMessageAt = messagePayload.sentAt || new Date().toISOString();
                conversation.lastMessagePreview = String(messagePayload.body || '').slice(0, 120);
            }

            markConversationUnread(conversationId);
            moveConversationToTop(conversationId);
            renderConversationList();

            if (Number(state.activeConversationId) === conversationId) {
                const activeConversation = findConversation(conversationId);
                if (activeConversation) {
                    activeConversation.unreadCount = 0;
                }
                renderConversationList();
                renderMessageList();
            }
        }
    }

    function onSocketError(errorPayload) {
        const activeId = Number(state.activeConversationId) || 0;
        const payloadId = Number(errorPayload?.conversationId) || 0;
        if (!activeId || payloadId === 0 || activeId === payloadId) {
            setFeedback(errorPayload?.message || 'Chat hiba tortent.', true);
        }
    }

    async function joinConversationRoom(conversationId) {
        const socket = getSocket();
        if (socket) {
            socket.emit('chat:join', {
                conversationId: Number(conversationId)
            });
        }
    }

    async function leaveConversationRoom(conversationId) {
        const socket = getSocket();
        if (socket && conversationId) {
            socket.emit('chat:leave', {
                conversationId: Number(conversationId)
            });
        }
    }

    async function sendMessageFallbackRest(conversationId, messageText) {
        const endpoint = state.options.sendMessageEndpoint(conversationId);
        const payload = await requestJson(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message: messageText })
        });

        if (payload.data) {
            pushOrUpdateMessage(conversationId, payload.data);
            const conversation = findConversation(conversationId);
            if (conversation) {
                conversation.lastMessageAt = payload.data.sentAt || new Date().toISOString();
                conversation.lastMessagePreview = String(payload.data.body || '').slice(0, 120);
                conversation.unreadCount = 0;
            }
            moveConversationToTop(conversationId);
            renderConversationList();
            renderMessageList();
        }
    }

    async function handleSendMessage() {
        const canProceed = !state.isSendingMessage;
        if (canProceed) {
            const activeId = Number(state.activeConversationId) || 0;
            const messageText = String(dom.messageInput?.value || '').trim();

            if (!activeId) {
                setFeedback('Valassz beszelgetest a kuldeshez.', true);
            } else if (!messageText) {
                setFeedback('Az uzenet nem lehet ures.', true);
            } else {
                state.isSendingMessage = true;
                setFeedback('', false);
                if (dom.sendButton) {
                    dom.sendButton.disabled = true;
                }

                try {
                    const socket = getSocket();
                    if (socket && socket.connected) {
                        socket.emit('chat:message:send', {
                            conversationId: activeId,
                            message: messageText
                        });
                    } else {
                        await sendMessageFallbackRest(activeId, messageText);
                    }

                    if (dom.messageInput) {
                        dom.messageInput.value = '';
                    }
                } catch (error) {
                    setFeedback(error.message || 'Nem sikerult az uzenet kuldese.', true);
                } finally {
                    state.isSendingMessage = false;
                    if (dom.sendButton) {
                        dom.sendButton.disabled = false;
                    }
                }
            }
        }
    }

    async function openConversation(conversationId) {
        const normalizedId = Number(conversationId) || 0;
        if (!normalizedId) {
            throw new Error('Ervenytelen beszelgetes azonosito.');
        }

        if (!state.initialized) {
            await init();
        }

        if (!state.conversationList.length) {
            await loadConversations();
        }

        const previousConversationId = state.activeConversationId;
        state.activeConversationId = normalizedId;

        const conversation = findConversation(normalizedId);
        if (conversation) {
            conversation.unreadCount = 0;
            if (dom.headerTitle) {
                dom.headerTitle.textContent = getConversationTitle(conversation);
            }
            if (dom.headerSubtitle) {
                dom.headerSubtitle.textContent = conversation.lastMessagePreview || 'Beszelgetes';
            }
        }

        renderConversationList();
        await leaveConversationRoom(previousConversationId);
        await joinConversationRoom(normalizedId);
        await loadConversationMessages(normalizedId, { older: false });

        if (state.modalInstance) {
            state.modalInstance.show();
        }
    }

    async function openDirectByUserId(targetUserId) {
        const normalizedTargetUserId = Number(targetUserId) || 0;
        if (!normalizedTargetUserId) {
            throw new Error('Ervenytelen cel felhasznalo azonosito.');
        }

        if (!state.initialized) {
            await init();
        }

        const payload = await requestJson(state.options.openDirectEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ targetUserId: normalizedTargetUserId })
        });

        const conversationId = Number(payload?.data?.conversationId) || 0;
        if (!conversationId) {
            throw new Error('Nem erkezett ervenyes conversation azonosito.');
        }

        await loadConversations();
        await openConversation(conversationId);
    }

    async function handleGlobalChatOpenEvent(customEvent) {
        const detail = customEvent?.detail || {};
        const conversationId = Number(detail.conversationId) || 0;
        const fromUserId = Number(detail.fromUserId || detail.targetUserId || detail.userId) || 0;

        try {
            if (conversationId) {
                await openConversation(conversationId);
            } else if (fromUserId) {
                await openDirectByUserId(fromUserId);
            } else {
                throw new Error('A chat open esemény payload hiányos.');
            }
        } catch (error) {
            setFeedback(error.message || 'Nem sikerult megnyitni a chat beszelgetest.', true);
        }
    }

    function bindGlobalEvents() {
        if (!state.globalEventsBound) {
            globalScope.addEventListener(CHAT_OPEN_EVENT_NAME, (event) => {
                handleGlobalChatOpenEvent(event).catch((error) => {
                    setFeedback(error.message || 'Globalis chat nyitasi hiba.', true);
                });
            });

            globalScope.addEventListener('mattmester:notification:push', (event) => {
                const detail = event?.detail || {};
                const conversationId = Number(detail.conversationId) || 0;
                const fromUserId = Number(detail.fromUserId || detail.targetUserId || detail.senderUserId) || 0;

                if (conversationId || fromUserId) {
                    globalScope.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT_NAME, {
                        detail: conversationId
                            ? { conversationId }
                            : { fromUserId }
                    }));
                }
            });

            state.globalEventsBound = true;
        }
    }

    function bindEvents() {
        if (!dom.floatingButton || !dom.modal) {
            throw new Error('A chat modal DOM elemei nem talalhatok.');
        }

        dom.floatingButton.addEventListener('click', async () => {
            try {
                bindSocketEvents();
                if (!state.conversationList.length) {
                    await loadConversations();
                }

                if (state.modalInstance) {
                    state.modalInstance.show();
                }
            } catch (error) {
                setFeedback(error.message || 'Nem sikerult megnyitni a chat modalt.', true);
            }
        });

        if (dom.searchInput) {
            dom.searchInput.addEventListener('input', () => {
                state.searchText = String(dom.searchInput.value || '');
                renderConversationList();
            });
        }

        if (dom.sendButton) {
            dom.sendButton.addEventListener('click', () => {
                handleSendMessage().catch((error) => {
                    setFeedback(error.message || 'Kuldesi hiba.', true);
                });
            });
        }

        if (dom.messageInput) {
            dom.messageInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSendMessage().catch((error) => {
                        setFeedback(error.message || 'Kuldesi hiba.', true);
                    });
                }
            });
        }

        if (dom.messageList) {
            dom.messageList.addEventListener('scroll', () => {
                const activeId = Number(state.activeConversationId) || 0;
                if (activeId) {
                    const hasMore = Boolean(state.hasMoreByConversation.get(activeId));
                    const isLoading = Boolean(state.isLoadingByConversation.get(activeId));
                    if (dom.messageList.scrollTop <= 16 && hasMore && !isLoading) {
                        loadConversationMessages(activeId, { older: true }).catch((error) => {
                            setFeedback(error.message || 'Nem sikerult regebbi uzeneteket betolteni.', true);
                        });
                    }
                }
            });
        }

        dom.modal.addEventListener('shown.bs.modal', () => {
            if (!state.conversationList.length) {
                loadConversations().catch((error) => {
                    setFeedback(error.message || 'Nem sikerult betolteni a beszelgeteseket.', true);
                });
            }
            if (dom.messageInput) {
                dom.messageInput.focus();
            }
        });
    }

    async function init(options) {
        mergeOptions(options);

        if (state.initialized) {
            bindSocketEvents();
        } else {
            ensureStyles();
            ensureMarkup();

            if (!globalScope.bootstrap?.Modal) {
                throw new Error('A Bootstrap modal API nem erheto el.');
            }

            state.modalInstance = globalScope.bootstrap.Modal.getOrCreateInstance(dom.modal);
            bindEvents();
            bindSocketEvents();
            bindGlobalEvents();

            state.initialized = true;
        }
    }

    function autoInitOnDomReady() {
        const start = () => {
            init().catch((error) => {
                console.error('Chat modal auto init hiba:', error);
            });
        };

        if (globalScope.document.readyState === 'loading') {
            globalScope.document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    }

    globalScope.MattMesterChatModal = {
        CHAT_OPEN_EVENT_NAME,
        init,
        openConversation,
        openDirectByUserId,
        openByEventPayload: async (payload) => {
            await handleGlobalChatOpenEvent({ detail: payload || {} });
        },
        dispatchOpenConversation: (payload) => {
            globalScope.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT_NAME, {
                detail: payload || {}
            }));
        },
        getState: () => ({
            activeConversationId: state.activeConversationId,
            conversationList: [...state.conversationList],
            messagesByConversation: new Map(state.messagesByConversation),
            paginationCursorByConversation: new Map(state.paginationCursorByConversation),
            isLoadingByConversation: new Map(state.isLoadingByConversation)
        })
    };

    autoInitOnDomReady();
})(window);
