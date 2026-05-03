async function parseJson(response) {
    try {
        return await response.json();
    } catch (error) {
        return {};
    }
}

function getNotificationCenterElements() {
    return {
        modal: document.getElementById('notificationsModal'),
        list: document.getElementById('notificationsList'),
        empty: document.getElementById('notificationsEmpty'),
        counter: document.getElementById('notificationsUnreadCounter'),
        markAllBtn: document.getElementById('markAllNotificationsReadBtn')
    };
}

function getBadgeElements(target) {
    return Array.from(document.querySelectorAll(`[data-badge-target="${target}"]`));
}

function formatBadgeCount(count) {
    const safe = Math.max(0, Number.isFinite(count) ? Math.trunc(count) : 0);
    let text = '0';
    if (safe > NOTIFICATION_BADGE_CAP) {
        text = `${NOTIFICATION_BADGE_CAP}+`;
    } else {
        text = String(safe);
    }
    return { count: safe, text };
}

function applyBadgeState(target, count) {
    const { count: safeCount, text } = formatBadgeCount(count);
    const elements = getBadgeElements(target);
    elements.forEach((element) => {
        element.textContent = text;
        if (safeCount > 0) {
            element.removeAttribute('hidden');
            element.classList.add('is-pulse');
            setTimeout(() => element.classList.remove('is-pulse'), 600);
        } else {
            element.setAttribute('hidden', 'hidden');
            element.classList.remove('is-pulse');
        }
    });
}

function setNotificationBadge(count) {
    notificationCenterState.unreadCount = Math.max(0, Number(count) || 0);
    applyBadgeState('notifications', notificationCenterState.unreadCount);
    const { counter } = getNotificationCenterElements();
    if (counter) {
        const { count: safeCount, text } = formatBadgeCount(notificationCenterState.unreadCount);
        counter.textContent = text;
        if (safeCount > 0) {
            counter.removeAttribute('hidden');
        } else {
            counter.setAttribute('hidden', 'hidden');
        }
    }
}

function setChatBadge(totalUnread) {
    chatBadgeState.totalUnread = Math.max(0, Number(totalUnread) || 0);
    applyBadgeState('chat', chatBadgeState.totalUnread);
}

function formatNotificationTime(value) {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('hu-HU');
}

function escapeHtml(value) {
    const text = String(value == null ? '' : value);
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeNotificationItem(payloadInput = {}) {
    const payload = payloadInput && typeof payloadInput === 'object' ? payloadInput : {};
    const type = String(payload.type || '').trim().toLowerCase();
    const id = Number(payload.id) || 0;
    const conversationId = Number(payload.conversationId || payload.payload?.conversationId) || 0;
    const innerPayload = payload.payload && typeof payload.payload === 'object' ? payload.payload : {};
    const fromUserId = Number(
        payload.senderUserId
        || innerPayload.senderUserId
        || payload.fromUserId
        || innerPayload.fromUserId
        || payload.userId
    ) || 0;
    const fromUsername = String(payload.senderUsername || innerPayload.senderUsername || '').trim();
    const title = String(payload.title || '').trim() || 'Értesítés';
    const message = String(payload.message || payload.text || '').trim() || 'Új esemény érkezett.';
    const receivedAt = payload.createdAt || payload.receivedAt || payload.sentAt || new Date().toISOString();
    const severity = ['info', 'success', 'warning', 'error'].includes(payload.severity) ? payload.severity : 'info';
    const isRead = Boolean(payload.isRead);

    return {
        ...payload,
        id,
        type,
        conversationId,
        fromUserId,
        fromUsername,
        title,
        message,
        receivedAt,
        severity,
        isRead,
        payload: innerPayload
    };
}

// Extensible action renderer: notification type -> array of action descriptors
function getNotificationActionsForItem(item) {
    const actions = [];
    if (item.type === 'friend_request' && item.fromUserId) {
        actions.push({ key: 'profile', label: 'Profil', icon: 'user', variant: 'btn-outline-light' });
        actions.push({ key: 'accept', label: 'Elfogad', icon: 'check', variant: 'btn-success' });
        actions.push({ key: 'reject', label: 'Elutasít', icon: 'x', variant: 'btn-outline-danger' });
        actions.push({ key: 'block', label: 'Letilt', icon: 'shield-off', variant: 'btn-danger' });
    }
    if (item.type === 'chat_message' && (item.conversationId || item.fromUserId)) {
        actions.push({ key: 'open_chat', label: 'Megnyitás', icon: 'message-circle', variant: 'btn-outline-primary' });
    }
    actions.push({ key: 'remove', label: 'Bezár', icon: 'trash-2', variant: 'btn-outline-secondary' });
    return actions;
}

function renderNotificationCenterList() {
    const { list, empty } = getNotificationCenterElements();
    if (list && empty) {
        list.innerHTML = '';
        const hasItems = notificationCenterState.items.length > 0;
        empty.classList.toggle('d-none', hasItems);

        if (hasItems) {
            notificationCenterState.items.forEach((item) => {
                const wrapper = document.createElement('div');
                wrapper.className = `notification-item p-2 mb-2 rounded ${item.isRead ? 'is-read' : 'is-unread'}`;
                wrapper.setAttribute('role', 'listitem');
                wrapper.dataset.notificationId = String(item.id || '');
                wrapper.dataset.notificationType = item.type;
                wrapper.dataset.conversationId = String(item.conversationId || '');
                wrapper.dataset.fromUserId = String(item.fromUserId || '');

                const actions = getNotificationActionsForItem(item);
                const actionsHtml = actions.map((action) => `
                    <button type="button" class="btn btn-sm ${action.variant} d-inline-flex align-items-center gap-1"
                        data-notification-action="${action.key}" aria-label="${escapeHtml(action.label)}">
                        <i data-lucide="${action.icon}" style="width: 14px; height: 14px;"></i>
                        <span class="d-none d-sm-inline">${escapeHtml(action.label)}</span>
                    </button>
                `).join('');

                wrapper.innerHTML = `
                    <div class="d-flex justify-content-between align-items-start gap-2">
                        <div class="flex-grow-1">
                            <strong class="text-light d-block">${escapeHtml(item.title)}</strong>
                            <div class="small text-secondary mt-1">${escapeHtml(item.message)}</div>
                        </div>
                        <small class="text-secondary text-nowrap">${escapeHtml(formatNotificationTime(item.receivedAt))}</small>
                    </div>
                    <div class="notification-actions d-flex flex-wrap gap-2 mt-2">${actionsHtml}</div>
                `;

                list.appendChild(wrapper);
            });

            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
        }
    }
}

async function openChatInboxFromLauncher() {
    if (!window.MattMesterChatModal) {
        throw new Error('A chat modal API nem érhető el.');
    }
    await window.MattMesterChatModal.openInbox();
}

function bindGlobalChatLaunchers() {
    document.addEventListener('click', (event) => {
        const trigger = event.target.closest('[data-open-chat="inbox"]');
        if (trigger) {
            runSafelyAsync('openChatInboxLauncherClick', async () => {
                await openChatInboxFromLauncher();
            });
        }
    });
}

async function fetchNotificationsFromServer() {
    let success = false;
    try {
        const response = await fetch('/api/notifications?limit=50', { credentials: 'same-origin' });
        if (response.ok) {
            const json = await response.json();
            if (json?.success) {
                notificationCenterState.items = (json.data || []).map(normalizeNotificationItem);
                setNotificationBadge(Number(json.unreadCount) || 0);
                renderNotificationCenterList();
                success = true;
            }
        }
    } catch (error) {
        console.warn('[notifications] initial fetch hiba:', error.message);
    }
    return success;
}

async function fetchChatUnreadTotal() {
    let total = 0;
    try {
        const response = await fetch('/api/chat/unread-total', { credentials: 'same-origin' });
        if (response.ok) {
            const json = await response.json();
            if (json?.success) {
                total = Number(json.totalUnread) || 0;
            }
        }
    } catch (error) {
        console.warn('[chat] unread-total fetch hiba:', error.message);
    }
    setChatBadge(total);
    return total;
}

async function markNotificationReadOnServer(notificationId) {
    let success = false;
    try {
        const normalizedNotificationId = Number(notificationId);
        if (!Number.isInteger(normalizedNotificationId) || normalizedNotificationId <= 0) {
            console.error('[notifications] mark read kihagyva: ervenytelen notificationId:', notificationId);
            return false;
        }

        const response = await fetch(`/api/notifications/${normalizedNotificationId}/read`, {
            method: 'POST',
            credentials: 'same-origin'
        });
        const json = await response.json().catch(() => ({}));
        success = response.ok && Boolean(json?.success);

        if (!success) {
            console.error('[notifications] mark read sikertelen:', {
                notificationId: normalizedNotificationId,
                status: response.status,
                message: String(json?.message || 'ismeretlen hiba')
            });
        }
    } catch (error) {
        console.error('[notifications] mark read hiba:', error.message);
    }
    return success;
}

async function markAllNotificationsReadOnServer() {
    let success = false;
    try {
        const response = await fetch('/api/notifications/read-all', {
            method: 'POST',
            credentials: 'same-origin'
        });
        const json = await response.json().catch(() => ({}));
        success = response.ok && Boolean(json?.success);
        if (!success) {
            console.error('[notifications] mark-all-read sikertelen:', {
                status: response.status,
                message: String(json?.message || 'ismeretlen hiba')
            });
        }
    } catch (error) {
        console.error('[notifications] mark-all-read hiba:', error.message);
    }
    return success;
}

// Per-spec: az X / akció gombok permanens user-oldali eltávolítást váltanak ki.
// A backend a notification_reads.dismissed_at-be ír, így re-loginnal sem
// jönnek vissza. Idempotens: ismételt hívás 200-at ad vissza.
async function dismissNotificationOnServer(notificationId) {
    let success = false;
    try {
        const normalizedNotificationId = Number(notificationId);
        if (!Number.isInteger(normalizedNotificationId) || normalizedNotificationId <= 0) {
            console.error('[notifications] dismiss kihagyva: ervenytelen notificationId:', notificationId);
            return false;
        }

        const response = await fetch(`/api/notifications/${normalizedNotificationId}/dismiss`, {
            method: 'POST',
            credentials: 'same-origin'
        });
        const json = await response.json().catch(() => ({}));
        success = response.ok && Boolean(json?.success);

        if (!success) {
            console.error('[notifications] dismiss sikertelen:', {
                notificationId: normalizedNotificationId,
                status: response.status,
                message: String(json?.message || 'ismeretlen hiba')
            });
        }
    } catch (error) {
        console.error('[notifications] dismiss hiba:', error.message);
    }
    return success;
}

async function performFriendActionFromNotification(action, fromUserId) {
    let outcome = { success: false, message: '' };
    try {
        let url = null;
        let method = 'POST';
        let body = null;
        if (action === 'accept') {
            url = '/api/friends/accept';
            body = JSON.stringify({ targetUserId: fromUserId });
        } else if (action === 'reject') {
            url = '/api/friends/reject';
            body = JSON.stringify({ targetUserId: fromUserId });
        } else if (action === 'block') {
            url = '/api/friends/block';
            body = JSON.stringify({ targetUserId: fromUserId });
        }
        if (url) {
            const response = await fetch(url, {
                method,
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body
            });
            const json = await response.json().catch(() => ({}));
            outcome = {
                success: Boolean(json?.success),
                message: String(json?.message || (response.ok ? 'OK' : 'Hiba a művelet során.'))
            };
        }
    } catch (error) {
        outcome = { success: false, message: error.message || 'Hiba a friend művelet során.' };
    }
    return outcome;
}

function resetNotificationCenterState(reason = 'session-change') {
    // Teljes cache torles: session valtas / logout / user A -> user B eseten
    // a modalban ne maradjanak a regi user ertesitesei.
    try {
        console.log('[notifications] reset:', reason);
        notificationCenterState.items = [];
        notificationCenterState.unreadCount = 0;
        setNotificationBadge(0);
        renderNotificationCenterList();
    } catch (error) {
        console.warn('[notifications] reset hiba:', error.message);
    }
}

function resetChatBadgeState(reason = 'session-change') {
    try {
        console.log('[chat badge] reset:', reason);
        chatBadgeState.totalUnread = 0;
        setChatBadge(0);
    } catch (error) {
        console.warn('[chat badge] reset hiba:', error.message);
    }
}

async function refreshNotificationAndChatStateForCurrentSession(reason = 'session-refresh') {
    // Authoritative lekerdezes a szerverrol: a UI pontosan azt mutassa,
    // amit a DB tarol a belepett userre. Ha nincs user, mindent nullazunk.
    try {
        console.log('[notifications+chat] refresh:', reason);
        const sessionInfo = await fetchSessionInfo();
        const loggedIn = Boolean(sessionInfo?.user?.id);
        if (loggedIn) {
            notificationCenterState.lastKnownUserId = Number(sessionInfo.user.id) || 0;
            chatBadgeState.lastKnownUserId = Number(sessionInfo.user.id) || 0;
            await fetchNotificationsFromServer();
            await fetchChatUnreadTotal();
        } else {
            notificationCenterState.lastKnownUserId = 0;
            chatBadgeState.lastKnownUserId = 0;
            resetNotificationCenterState(reason);
            resetChatBadgeState(reason);
        }
    } catch (error) {
        console.warn('[notifications+chat] refresh hiba:', error.message);
    }
}

