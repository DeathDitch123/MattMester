(function initMattMesterChatModal(globalScope) {
    const CHAT_OPEN_EVENT_NAME = 'mattmester:chat:open-conversation';
    const MOBILE_BREAKPOINT_QUERY = '(max-width: 767.98px)';

    const DEFAULTS = {
        conversationsEndpoint: '/api/chat/conversations',
        conversationMessagesEndpoint: (conversationId, beforeCursor, limit) => {
            const params = new URLSearchParams();
            if (beforeCursor) {
                params.set('beforeMessageId', String(beforeCursor));
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
        layout: null,
        searchInput: null,
        conversationList: null,
        conversationEmpty: null,
        conversationLoading: null,
        headerTitle: null,
        headerSubtitle: null,
        headerAvatar: null,
        backButton: null,
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
            #chatModal .chat-modal-dialog {
                max-width: 1000px;
            }
            #chatModal .chat-modal-content {
                height: min(86vh, 900px);
                max-height: min(86vh, 900px);
                overflow: hidden;
                background: #0f172a;
                border: 1px solid #1e293b;
                border-radius: 16px;
                color: #e2e8f0;
            }
            #chatModal .chat-layout {
                height: 100%;
                overflow: hidden;
                display: flex;
                min-height: 0;
            }
            #chatModal .chat-left {
                flex: 0 0 340px;
                max-width: 340px;
                border-right: 1px solid #1e293b;
                background: #111827;
                display: flex;
                flex-direction: column;
                min-width: 0;
                min-height: 0;
                overflow: hidden;
            }
            #chatModal .chat-sidebar-header {
                padding: 14px 16px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                border-bottom: 1px solid #1e293b;
                flex-shrink: 0;
            }
            #chatModal .chat-sidebar-title {
                color: #ffffff;
                font-weight: 700;
                font-size: 18px;
                margin: 0;
            }
            #chatModal .chat-icon-button {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: transparent;
                color: #e2e8f0;
                border: 0;
                font-size: 18px;
                line-height: 1;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: background 0.15s ease;
            }
            #chatModal .chat-icon-button:hover {
                background: #1e293b;
            }
            #chatModal .chat-search-wrap {
                padding: 10px 12px;
                border-bottom: 1px solid #1e293b;
                flex-shrink: 0;
            }
            #chatModal .chat-search-group {
                display: flex;
                align-items: center;
                gap: 8px;
                background: #0b1220;
                border: 1px solid #334155;
                border-radius: 999px;
                padding: 6px 14px;
                transition: border-color 0.15s ease;
            }
            #chatModal .chat-search-group:focus-within {
                border-color: #d4af37;
            }
            #chatModal .chat-search-icon {
                color: #94a3b8;
                font-size: 13px;
                flex-shrink: 0;
            }
            #chatModal .chat-search-input {
                flex: 1;
                background: transparent;
                border: 0;
                color: #e2e8f0;
                outline: none;
                font-size: 14px;
                padding: 4px 0;
                min-width: 0;
            }
            #chatModal .chat-search-input::placeholder {
                color: #64748b;
            }
            #chatModal .chat-conversation-list {
                overflow-y: auto;
                padding: 8px;
                display: flex;
                flex-direction: column;
                gap: 2px;
                min-height: 0;
                min-width: 0;
                flex: 1;
            }
            #chatModal .chat-conversation-item {
                background: transparent;
                border: 0;
                padding: 10px;
                border-radius: 12px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                width: 100%;
                min-width: 0;
                text-align: left;
                color: inherit;
                transition: background 0.15s ease;
            }
            #chatModal .chat-conversation-item:hover {
                background: #1e293b;
            }
            #chatModal .chat-conversation-item.is-active {
                background: #1f2937;
            }
            #chatModal .chat-profile-image {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                border: 1px solid #334155;
                object-fit: cover;
                object-position: center;
                flex-shrink: 0;
                background: #0f172a;
            }
            #chatModal .chat-conversation-body {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            #chatModal .chat-row-top {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                min-width: 0;
            }
            #chatModal .chat-user-name {
                color: #ffffff;
                font-weight: 600;
                font-size: 14px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                min-width: 0;
                flex: 1;
            }
            #chatModal .chat-conversation-date {
                color: #64748b;
                font-size: 11px;
                white-space: nowrap;
                flex-shrink: 0;
            }
            #chatModal .chat-row-bottom {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                min-width: 0;
            }
            #chatModal .chat-conversation-preview {
                color: #94a3b8;
                font-size: 13px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                min-width: 0;
                flex: 1;
            }
            #chatModal .chat-conversation-item.has-unread .chat-conversation-preview,
            #chatModal .chat-conversation-item.has-unread .chat-user-name {
                color: #ffffff;
                font-weight: 700;
            }
            #chatModal .chat-unread-badge {
                min-width: 20px;
                height: 20px;
                border-radius: 999px;
                background: #ef4444;
                color: #ffffff;
                font-size: 11px;
                font-weight: 700;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0 6px;
                flex-shrink: 0;
            }
            #chatModal .chat-right {
                flex: 1 1 auto;
                display: flex;
                flex-direction: column;
                min-width: 0;
                min-height: 0;
                overflow: hidden;
                background: #0b1220;
            }
            #chatModal .chat-header {
                display: flex;
                align-items: center;
                gap: 12px;
                border-bottom: 1px solid #1e293b;
                padding: 10px 16px;
                background: #0f172a;
                min-height: 62px;
                flex-shrink: 0;
            }
            #chatModal .chat-back-button {
                display: none;
            }
            #chatModal .chat-header-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: 1px solid #334155;
                object-fit: cover;
                object-position: center;
                flex-shrink: 0;
                background: #0f172a;
                display: none;
            }
            #chatModal .chat-header-avatar.is-visible {
                display: block;
            }
            #chatModal .chat-header-info {
                min-width: 0;
                flex: 1;
            }
            #chatModal .chat-header-title {
                color: #ffffff;
                font-weight: 600;
                font-size: 15px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #chatModal .chat-header-subtitle {
                color: #94a3b8;
                font-size: 12px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #chatModal .chat-message-list {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 4px;
                background: radial-gradient(circle at top right, rgba(56, 189, 248, 0.06), transparent 45%), #0b1220;
                min-height: 0;
                min-width: 0;
            }
            #chatModal .chat-message {
                max-width: min(78%, 520px);
                padding: 8px 12px;
                border-radius: 18px;
                background: #1e293b;
                color: #e2e8f0;
                min-width: 0;
                overflow-wrap: anywhere;
                word-break: break-word;
                align-self: flex-start;
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            #chatModal .chat-message.is-mine {
                align-self: flex-end;
                background: linear-gradient(135deg, #d4af37 0%, #b8891f 100%);
                color: #111827;
            }
            #chatModal .chat-message.is-mine .chat-message-sender,
            #chatModal .chat-message.is-mine .chat-message-date {
                color: rgba(17, 24, 39, 0.85);
            }
            #chatModal .chat-message-meta {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                min-width: 0;
            }
            #chatModal .chat-message-profile-image {
                width: 22px;
                height: 22px;
                border-radius: 50%;
                border: 1px solid #334155;
                object-fit: cover;
                object-position: center;
                flex-shrink: 0;
                background: #0f172a;
            }
            #chatModal .chat-message-sender {
                color: #cbd5e1;
                font-weight: 600;
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            #chatModal .chat-message-date {
                color: #94a3b8;
                font-size: 10px;
                white-space: nowrap;
                margin-left: auto;
            }
            #chatModal .chat-message-body {
                white-space: pre-wrap;
                overflow-wrap: anywhere;
                word-break: break-word;
                font-size: 14px;
                line-height: 1.4;
            }
            #chatModal .chat-composer {
                border-top: 1px solid #1e293b;
                padding: 10px 12px;
                background: #0f172a;
                display: flex;
                flex-direction: column;
                gap: 6px;
                flex-shrink: 0;
            }
            #chatModal .chat-feedback {
                font-size: 12px;
                color: #ef4444;
                padding: 2px 6px;
            }
            #chatModal .chat-feedback.is-success {
                color: #22c55e;
            }
            #chatModal .chat-input-row {
                display: flex;
                gap: 8px;
                min-width: 0;
                align-items: center;
            }
            #chatModal .chat-input {
                flex: 1;
                border: 1px solid #334155;
                background: #0b1220;
                color: #e2e8f0;
                border-radius: 999px;
                padding: 10px 16px;
                min-width: 0;
                font-size: 14px;
                outline: none;
                transition: border-color 0.15s ease;
            }
            #chatModal .chat-input:focus {
                border-color: #d4af37;
            }
            #chatModal .chat-input::placeholder {
                color: #64748b;
            }
            #chatModal .chat-send-button {
                flex-shrink: 0;
                border: 0;
                background: linear-gradient(135deg, #d4af37 0%, #b8891f 100%);
                color: #111827;
                padding: 10px 20px;
                font-weight: 700;
                border-radius: 999px;
                cursor: pointer;
                font-size: 14px;
                transition: filter 0.15s ease;
            }
            #chatModal .chat-send-button:hover:not(:disabled) {
                filter: brightness(1.08);
            }
            #chatModal .chat-send-button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            #chatModal .chat-placeholder {
                color: #94a3b8;
                font-size: 13px;
                padding: 20px 16px;
                text-align: center;
            }
            #chatModal .chat-right-empty {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: #64748b;
                text-align: center;
                padding: 32px 24px;
                gap: 8px;
            }
            #chatModal .chat-right-empty-title {
                color: #cbd5e1;
                font-weight: 600;
                font-size: 16px;
            }
            #chatModal .chat-right-empty-body {
                color: #94a3b8;
                font-size: 13px;
                max-width: 280px;
            }
            #chatModal .chat-layout:not(.has-active-conversation) .chat-conversation-area {
                display: none;
            }
            #chatModal .chat-layout.has-active-conversation .chat-right-empty {
                display: none;
            }
            #chatModal .chat-conversation-area {
                display: flex;
                flex-direction: column;
                flex: 1;
                min-height: 0;
                min-width: 0;
            }
            @media (max-width: 767.98px) {
                #chatModal .chat-modal-content {
                    height: 100vh;
                    height: 100dvh;
                    max-height: 100vh;
                    max-height: 100dvh;
                    border-radius: 0;
                }
                #chatModal .chat-left {
                    flex: 1 1 100%;
                    max-width: 100%;
                    border-right: 0;
                }
                #chatModal .chat-right {
                    flex: 1 1 100%;
                    max-width: 100%;
                }
                #chatModal .chat-layout.is-conversation-view .chat-left {
                    display: none;
                }
                #chatModal .chat-layout:not(.is-conversation-view) .chat-right {
                    display: none;
                }
                #chatModal .chat-back-button {
                    display: inline-flex;
                }
                #chatModal .chat-sidebar-close-button {
                    display: inline-flex;
                }
            }
            @media (min-width: 768px) {
                #chatModal .chat-sidebar-close-button {
                    display: none;
                }
            }
            `;

            globalScope.document.head.appendChild(style);
        }
    }

    function ensureMarkup() {
        const hasMarkup = Boolean(globalScope.document.getElementById('chatModal'));
        if (hasMarkup) {
            cacheDomReferences();
        } else {
            const wrapper = globalScope.document.createElement('div');
            wrapper.id = 'chatModalRoot';
            wrapper.innerHTML = `
            <div class="modal fade" id="chatModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered modal-xl modal-fullscreen-md-down chat-modal-dialog">
                    <div class="modal-content chat-modal-content">
                        <div id="chatLayout" class="chat-layout">
                            <aside class="chat-left">
                                <div class="chat-sidebar-header">
                                    <h2 class="chat-sidebar-title">Csevegések</h2>
                                    <button type="button" class="chat-icon-button chat-sidebar-close-button" data-bs-dismiss="modal" aria-label="Bezaras">&times;</button>
                                </div>
                                <div class="chat-search-wrap">
                                    <div class="chat-search-group">
                                        <span class="chat-search-icon" aria-hidden="true">&#128269;</span>
                                        <input id="chatConversationSearch" class="chat-search-input" type="text" placeholder="Keresés a partnerek között..." />
                                    </div>
                                </div>
                                <div id="chatConversationLoading" class="chat-placeholder d-none">Beszelgetesek betoltese...</div>
                                <div id="chatConversationEmpty" class="chat-placeholder d-none">Nincs beszelgetes.</div>
                                <div id="chatConversationList" class="chat-conversation-list" role="list"></div>
                            </aside>
                            <section class="chat-right">
                                <div id="chatRightEmpty" class="chat-right-empty">
                                    <div class="chat-right-empty-title">Valassz egy beszelgetest</div>
                                    <div class="chat-right-empty-body">Valassz egy meglevo beszelgetest a bal oldali listabol, vagy keress ra egy jatekosra.</div>
                                </div>
                                <div class="chat-conversation-area">
                                    <header class="chat-header">
                                        <button type="button" id="chatBackButton" class="chat-icon-button chat-back-button" aria-label="Vissza">&#8592;</button>
                                        <img id="chatHeaderAvatar" class="chat-header-avatar" alt="" />
                                        <div class="chat-header-info">
                                            <div id="chatHeaderTitle" class="chat-header-title">Valassz beszelgetest</div>
                                            <div id="chatHeaderSubtitle" class="chat-header-subtitle">Realtime chat</div>
                                        </div>
                                    </header>
                                    <div id="chatMessageLoading" class="chat-placeholder d-none">Uzenetek betoltese...</div>
                                    <div id="chatMessageEmpty" class="chat-placeholder d-none">Nincs megjelenitheto uzenet.</div>
                                    <div id="chatMessageList" class="chat-message-list" role="log" aria-live="polite"></div>
                                    <div class="chat-composer">
                                        <div id="chatFeedback" class="chat-feedback d-none"></div>
                                        <div class="chat-input-row">
                                            <input id="chatMessageInput" class="chat-input" type="text" maxlength="1000" placeholder="Irj uzenetet..." />
                                            <button id="chatSendButton" class="chat-send-button" type="button">Kuldes</button>
                                        </div>
                                    </div>
                                </div>
                            </section>
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
        dom.layout = globalScope.document.getElementById('chatLayout');
        dom.searchInput = globalScope.document.getElementById('chatConversationSearch');
        dom.conversationList = globalScope.document.getElementById('chatConversationList');
        dom.conversationEmpty = globalScope.document.getElementById('chatConversationEmpty');
        dom.conversationLoading = globalScope.document.getElementById('chatConversationLoading');
        dom.headerTitle = globalScope.document.getElementById('chatHeaderTitle');
        dom.headerSubtitle = globalScope.document.getElementById('chatHeaderSubtitle');
        dom.headerAvatar = globalScope.document.getElementById('chatHeaderAvatar');
        dom.backButton = globalScope.document.getElementById('chatBackButton');
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

    function isMobileViewport() {
        if (typeof globalScope.matchMedia === 'function') {
            return globalScope.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
        }
        return false;
    }

    function setMobileView(view) {
        if (dom.layout) {
            if (view === 'conversation') {
                dom.layout.classList.add('is-conversation-view');
            } else {
                dom.layout.classList.remove('is-conversation-view');
            }
        }
    }

    function setHasActiveConversation(hasActive) {
        if (dom.layout) {
            dom.layout.classList.toggle('has-active-conversation', Boolean(hasActive));
        }
    }

    function setFeedback(message, isError) {
        if (dom.feedback) {
            const text = String(message || '').trim();
            dom.feedback.textContent = text;
            dom.feedback.classList.toggle('d-none', !text);
            dom.feedback.classList.toggle('is-success', text.length > 0 && !isError);
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

    function getProfileImageApi() {
        const api = globalScope.MattMesterProfileImage;
        if (!api) {
            throw new Error('MattMesterProfileImage modul nincs betöltve (profileImageUtils.js).');
        }
        return api;
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
                if (unreadCount > 0) {
                    element.classList.add('has-unread');
                }

                const profileImage = globalScope.document.createElement('img');
                profileImage.className = 'chat-profile-image';
                getProfileImageApi().applyProfileImagePresentation(profileImage, {
                    source: conversation?.otherUser,
                    alt: `${getConversationTitle(conversation)} profile image`
                });

                const body = globalScope.document.createElement('div');
                body.className = 'chat-conversation-body';

                const topRow = globalScope.document.createElement('div');
                topRow.className = 'chat-row-top';

                const title = globalScope.document.createElement('span');
                title.className = 'chat-user-name';
                title.textContent = getConversationTitle(conversation);

                const date = globalScope.document.createElement('span');
                date.className = 'chat-conversation-date';
                date.textContent = formatDate(conversation.lastMessageAt);

                topRow.appendChild(title);
                topRow.appendChild(date);

                const bottomRow = globalScope.document.createElement('div');
                bottomRow.className = 'chat-row-bottom';

                const preview = globalScope.document.createElement('span');
                preview.className = 'chat-conversation-preview';
                preview.textContent = String(conversation.lastMessagePreview || 'Nincs uzenet.');
                bottomRow.appendChild(preview);

                if (unreadCount > 0) {
                    const unreadBadge = globalScope.document.createElement('span');
                    unreadBadge.className = 'chat-unread-badge';
                    unreadBadge.textContent = String(Math.min(unreadCount, 99));
                    bottomRow.appendChild(unreadBadge);
                }

                body.appendChild(topRow);
                body.appendChild(bottomRow);

                element.appendChild(profileImage);
                element.appendChild(body);

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

    function renderMessageList(options = {}) {
        const conversationId = Number(state.activeConversationId) || 0;
        const canRenderConversation = Boolean(conversationId && dom.messageList);
        const preserveOffset = Boolean(options?.preserveOffset);
        const previousScrollHeight = canRenderConversation ? Number(dom.messageList.scrollHeight || 0) : 0;
        const previousScrollTop = canRenderConversation ? Number(dom.messageList.scrollTop || 0) : 0;

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

                const messageProfileImage = globalScope.document.createElement('img');
                messageProfileImage.className = 'chat-message-profile-image';
                getProfileImageApi().applyProfileImagePresentation(messageProfileImage, {
                    source: {
                        profile_image: message.senderProfileImage,
                        profile_image_status: message.senderProfileImageStatus,
                        username: message.senderUsername
                    },
                    alt: `${message.senderUsername || 'Jatekos'} profile image`
                });

                const sender = globalScope.document.createElement('span');
                sender.className = 'chat-message-sender';
                sender.textContent = message.senderUsername || 'Jatekos';

                const sentDate = globalScope.document.createElement('span');
                sentDate.className = 'chat-message-date';
                sentDate.textContent = formatDate(message.sentAt);

                meta.appendChild(messageProfileImage);
                meta.appendChild(sender);
                meta.appendChild(sentDate);

                const body = globalScope.document.createElement('div');
                body.className = 'chat-message-body';
                body.textContent = String(message.body || '');

                element.appendChild(meta);
                element.appendChild(body);
                dom.messageList.appendChild(element);
            });

            const hasMessages = messages.length > 0;
            setMessageEmptyState(!hasMessages, hasMessages ? '' : 'Nincs megjelenitheto uzenet.');
            if (preserveOffset) {
                const nextScrollHeight = Number(dom.messageList.scrollHeight || 0);
                const diff = Math.max(0, nextScrollHeight - previousScrollHeight);
                dom.messageList.scrollTop = previousScrollTop + diff;
            } else {
                dom.messageList.scrollTop = dom.messageList.scrollHeight;
            }
        } else {
            if (dom.messageList) {
                dom.messageList.innerHTML = '';
            }
            setMessageEmptyState(true, 'Nincs megjelenitheto uzenet.');
        }
    }

    function updateConversationHeader(conversation) {
        if (conversation) {
            if (dom.headerTitle) {
                dom.headerTitle.textContent = getConversationTitle(conversation);
            }
            if (dom.headerSubtitle) {
                const preview = String(conversation.lastMessagePreview || '').trim();
                dom.headerSubtitle.textContent = preview || 'Beszelgetes';
            }
            if (dom.headerAvatar) {
                getProfileImageApi().applyProfileImagePresentation(dom.headerAvatar, {
                    source: conversation?.otherUser,
                    alt: `${getConversationTitle(conversation)} profile image`
                });
                dom.headerAvatar.classList.add('is-visible');
            }
        } else {
            if (dom.headerTitle) {
                dom.headerTitle.textContent = 'Valassz beszelgetest';
            }
            if (dom.headerSubtitle) {
                dom.headerSubtitle.textContent = 'Realtime chat';
            }
            if (dom.headerAvatar) {
                dom.headerAvatar.classList.remove('is-visible');
                dom.headerAvatar.removeAttribute('src');
            }
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

            const incoming = Array.isArray(payload.data) ? [...payload.data].sort((left, right) => Number(left.id) - Number(right.id)) : [];
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

            state.paginationCursorByConversation.set(normalizedId, payload.beforeMessageId || payload.cursor || null);
            state.hasMoreByConversation.set(normalizedId, Boolean(payload.hasMore));
            renderMessageList({ preserveOffset: isLoadOlder });
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
                state.boundSocket.off('chat:conversation:deleted', onSocketConversationDeleted);
                state.boundSocket.off('chat:list:refresh', onSocketChatListRefresh);
            }

            state.boundSocket = socket;
            socket.on('chat:message:new', onSocketMessageNew);
            socket.on('chat:error', onSocketError);
            socket.on('chat:conversation:deleted', onSocketConversationDeleted);
            socket.on('chat:list:refresh', onSocketChatListRefresh);
        }
    }

    function removeConversationFromState(conversationId) {
        const normalizedId = Number(conversationId) || 0;
        if (!normalizedId) return;
        state.conversationList = state.conversationList.filter((item) => Number(item.conversationId) !== normalizedId);
        state.messagesByConversation.delete(normalizedId);
        state.paginationCursorByConversation.delete(normalizedId);
        state.hasMoreByConversation.delete(normalizedId);
        state.isLoadingByConversation.delete(normalizedId);
    }

    function resolveConversationUnavailableMessage(reason) {
        const normalized = String(reason || '').toLowerCase();
        const mapping = {
            blocked: 'A beszélgetés megszűnt: a másik fél tiltásba került.',
            unfriended: 'A beszélgetés megszűnt: a barát kapcsolat törölve.',
            not_friends: 'A beszélgetés megszűnt: már nem vagytok barátok.',
            user_banned: 'A beszélgetés megszűnt: a másik fél letiltott.',
            user_deleted: 'A beszélgetés megszűnt: a másik fél profilja törölve.'
        };
        return mapping[normalized] || 'A beszélgetés már nem elérhető.';
    }

    function onSocketConversationDeleted(payload = {}) {
        const conversationId = Number(payload?.conversationId) || 0;
        if (!conversationId) return;

        const wasActive = Number(state.activeConversationId) === conversationId;
        removeConversationFromState(conversationId);
        renderConversationList();

        if (wasActive) {
            state.activeConversationId = null;
            setHasActiveConversation(false);
            setMessageEmptyState(true, resolveConversationUnavailableMessage(payload?.reason));
            setFeedback(resolveConversationUnavailableMessage(payload?.reason), true);
            setMobileView('list');
        }
    }

    function onSocketChatListRefresh() {
        // Kapcsolat-változás után szerver felől érkező jelzés: frissítjük
        // a lista-állapotot a legutóbbi canChat-szűrt adatokkal.
        loadConversations().catch((error) => {
            console.warn('[chatModal] chat:list:refresh hiba:', error?.message);
        });
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
        const messageText = String(errorPayload?.message || '').toLowerCase();
        const isUnavailable = messageText.includes('már nem elérhető');

        if (isUnavailable) {
            // A szerver külön chat:conversation:deleted-et is küld, de biztonsági
            // hálóként itt is eltávolítjuk az érintett beszélgetést.
            if (payloadId) {
                onSocketConversationDeleted({ conversationId: payloadId, reason: 'unavailable' });
            }
            return;
        }

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
        }
        updateConversationHeader(conversation);
        setHasActiveConversation(true);
        setFeedback('', false);

        renderConversationList();
        await leaveConversationRoom(previousConversationId);
        await joinConversationRoom(normalizedId);
        await loadConversationMessages(normalizedId, { older: false });

        setMobileView('conversation');

        if (state.modalInstance) {
            state.modalInstance.show();
        }

        if (dom.messageInput && !isMobileViewport()) {
            dom.messageInput.focus();
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
                throw new Error('A chat open esemeny payload hianyos.');
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

            state.globalEventsBound = true;
        }
    }

    function bindEvents() {
        if (!dom.modal) {
            throw new Error('A chat modal DOM elemei nem talalhatok.');
        }

        if (dom.floatingButton) {
            dom.floatingButton.addEventListener('click', async () => {
                try {
                    await openInbox();
                } catch (error) {
                    setFeedback(error.message || 'Nem sikerult megnyitni a chat modalt.', true);
                }
            });
        }

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

        if (dom.backButton) {
            dom.backButton.addEventListener('click', () => {
                setMobileView('list');
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

            dom.modal.setAttribute('aria-hidden', 'false');

            const hasActive = Number(state.activeConversationId) > 0;
            if (!hasActive) {
                setMobileView('list');
            }

            if (dom.messageInput && !isMobileViewport() && hasActive) {
                dom.messageInput.focus();
            }
        });

        dom.modal.addEventListener('hide.bs.modal', () => {
            const activeElement = globalScope.document.activeElement;
            if (activeElement && dom.modal.contains(activeElement) && typeof activeElement.blur === 'function') {
                activeElement.blur();
            }
        });

        dom.modal.addEventListener('hidden.bs.modal', () => {
            dom.modal.setAttribute('aria-hidden', 'true');
            setMobileView('list');
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
            updateConversationHeader(null);
            setHasActiveConversation(false);

            state.initialized = true;
        }
    }

    async function openInbox() {
        await init();
        bindSocketEvents();

        if (!state.conversationList.length) {
            await loadConversations();
        }

        setMobileView('list');

        if (state.modalInstance) {
            state.modalInstance.show();
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
        openInbox,
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
