const USERNAME_REGEX = /^[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ0-9._-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const socket = window.MattMesterSocket?.socket || io();
lucide.createIcons();

const PROFILE_SETTINGS_CONFIRM_SECONDS = 10;
const PROFILE_DELETE_CONFIRM_SECONDS = 5;
const PROFILE_IMAGE_MAX_SIZE_BYTES = 3 * 1024 * 1024;
const PROFILE_IMAGE_ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PLAYER_SEARCH_DEBOUNCE_MS = 300;
const PROFILE_CROSS_TAB_REFRESH_THROTTLE_MS = 1200;
const FRIEND_FILTER_DEFAULT = 'all';
const FRIEND_FILTER_VALUES = new Set(['all', 'pending', 'friend', 'blocked']);
const EMAIL_VERIFICATION_REQUIRED_CODE = 'EMAIL_NOT_VERIFIED';
const EMAIL_RESEND_RATE_LIMIT_CODE = 'EMAIL_RESEND_RATE_LIMIT';
const EMAIL_SEND_FAILED_CODE = 'EMAIL_SEND_FAILED';

const profileSettingsState = {
    bound: false,
    initial: null,
    pendingPayload: null,
    countdownTimer: null,
    countdownLeft: PROFILE_SETTINGS_CONFIRM_SECONDS,
    countdownFinished: false,
    requiresPasswordCheck: false,
    passwordVerified: false
};
const profileDeleteState = {
    bound: false,
    countdownTimer: null,
    countdownLeft: PROFILE_DELETE_CONFIRM_SECONDS,
    countdownFinished: false,
    submitting: false
};
const profileImageEditorState = {
    bound: false,
    image: null,
    objectUrl: null,
    scale: 1,
    rotationDeg: 0,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
    uploading: false,
    bufferCanvas: document.createElement('canvas')
};
const playerSearchState = {
    topbar: {
        debounceTimer: null,
        abortController: null,
        requestToken: 0
    },
    modal: {
        debounceTimer: null,
        abortController: null,
        requestToken: 0
    }
};
const profileRealtimeSyncState = {
    bound: false,
    unsubscribe: null
};
const logoutState = {
    bound: false,
    submitting: false
};
const SECURITY_FILTER_DEFAULT = 'all';
const SECURITY_FILTER_VALUES = new Set(['all', 'auth', 'security', 'profile', 'social']);
const securityActivityState = {
    bound: false,
    loading: false,
    activeFilter: SECURITY_FILTER_DEFAULT,
    items: []
};
const logoutAllDevicesState = {
    bound: false,
    submitting: false
};
const friendsState = {
    bound: false,
    loading: false,
    activeFilter: FRIEND_FILTER_DEFAULT,
    items: []
};
const notificationCenterState = {
    bound: false,
    initialized: false,
    items: [],
    unreadCount: 0,
    maxItems: 50,
    lastKnownUserId: 0,
    // In-flight dismiss / akcio-folyamatok per notificationId. A click handler
    // ezzel akadalyozza meg, hogy ugyanazt a gombot tobbszor is meg lehessen
    // nyomni, mig egy futo POST be nem fejezodik (vagy vissza nem allitjuk).
    pendingActionIds: new Set(),
    // "Mind olvasott" gombhoz kulon, mert tobb gomb lehet (multi-tab),
    // de ugyanazon a tab-on egyszerre csak egy futhasson.
    markAllInFlight: false
};
const chatBadgeState = {
    bound: false,
    initialized: false,
    totalUnread: 0,
    lastKnownUserId: 0
};
const NOTIFICATION_BADGE_CAP = 99;
const accountStatusState = {
    bound: false,
    sending: false,
    highlightTimer: null
};

async function syncSocketContextForStartup(reason = 'profile-startup') {
    try {
        if (window.MattMesterSocket?.syncSocketContextOrReconnect) {
            await window.MattMesterSocket.syncSocketContextOrReconnect(reason);
        }
    } catch (error) {
        console.warn('Profile startup socket context sync hiba:', error.message || error);
    }
}

function runSafely(label, handler) {
    try {
        return handler();
    } catch (error) {
        console.error(`${label} hiba:`, error);
        return undefined;
    }
}

async function runSafelyAsync(label, handler) {
    try {
        return await handler();
    } catch (error) {
        console.error(`${label} hiba:`, error);
        return undefined;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    runSafely('profileDOMContentLoadedBindings', () => {
        window.MattMesterChatModal?.init();
        bindGlobalChatLaunchers();
        bindNotificationCenterEvents();
        bindLogoutButton();
        bindTopBarPlayerSearchValidation();
        bindModalPlayerSearchValidation();
        bindSearchResultsModalEvents();
        bindFriendsSectionEvents();
        bindProfileDeleteModalEvents();
        bindProfileImageUploadEvents();
        bindRemoveAvatarEvents();
        bindCrossTabProfileRefreshEvents();
        bindSecurityActivityEvents();
        bindLogoutAllDevicesButton();
        bindAccountStatusEvents();
    });

    runSafelyAsync('profileInitialLoadSequence', async () => {
        await syncSocketContextForStartup('profile-initial-load');
        await refreshAuthUi('profile-initial-load');
        await refreshFriendsList(FRIEND_FILTER_DEFAULT);
        await refreshSecurityActivity();
        await loadAbilitiesUsage();
        await loadEloByMode();
    });
});

async function loadEloByMode() {
    const grid = document.getElementById('elo-by-mode-grid');
    if (!grid) return;
    try {
        const res = await fetch('/api/profile/elo-by-mode');
        const data = await res.json();
        if (!res.ok || !data.success) {
            grid.innerHTML = '<div class="col-12 text-secondary text-center py-3">Nem sikerült betölteni az ELO értékeket.</div>';
            return;
        }
        const e = data.elo || {};
        const modes = [
            { key: 'mattmester', name: 'Mattmester',  icon: 'sparkles' },
            { key: 'classical',  name: 'Klasszikus',  icon: 'crown' },
            { key: 'blitz',      name: 'Blitz',       icon: 'zap' }
        ];
        grid.innerHTML = modes.map(m => `
            <div class="col-md-4">
                <div class="ability-card d-flex align-items-center gap-3">
                    <div class="ability-icon">
                        <i data-lucide="${escapeHtmlAttr(m.icon)}"></i>
                    </div>
                    <div>
                        <h6 class="mb-1 text-white">${escapeHtml(m.name)}</h6>
                        <small class="text-secondary">ELO: <strong>${Number(e[m.key]) || 800}</strong></small>
                    </div>
                </div>
            </div>
        `).join('');
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    } catch (err) {
        console.error('[profile] elo-by-mode hiba:', err);
        grid.innerHTML = '<div class="col-12 text-secondary text-center py-3">Hiba a betöltés közben.</div>';
    }
}

async function loadAbilitiesUsage() {
    const grid = document.getElementById('abilities-usage-grid');
    if (!grid) return;
    try {
        const res = await fetch('/api/profile/abilities-usage');
        const data = await res.json();
        if (!res.ok || !data.success) {
            grid.innerHTML = '<div class="col-12 text-secondary text-center py-3">Nem sikerült betölteni a képesség statisztikát.</div>';
            return;
        }
        const items = data.abilities || [];
        if (items.length === 0) {
            grid.innerHTML = '<div class="col-12 text-secondary text-center py-3">Nincs még képesség.</div>';
            return;
        }
        grid.innerHTML = items.map(a => `
            <div class="col-md-6">
                <div class="ability-card d-flex align-items-center gap-3">
                    <div class="ability-icon">
                        <i data-lucide="${escapeHtmlAttr(a.icon || 'zap')}"></i>
                    </div>
                    <div>
                        <h6 class="mb-1 text-white">${escapeHtml(a.name)}</h6>
                        <small class="text-secondary">Használva ${a.count}-szer</small>
                    </div>
                </div>
            </div>
        `).join('');
        // Lucide ikonok újra-renderelése a frissen beillesztett DOM-on
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    } catch (err) {
        console.error('[profile] abilities-usage hiba:', err);
        grid.innerHTML = '<div class="col-12 text-secondary text-center py-3">Hiba a betöltés közben.</div>';
    }
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}
function escapeHtmlAttr(s) {
    return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '');
}
// Ez parsol
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

function bindNotificationCenterEvents() {
    if (!notificationCenterState.bound) {
        const { list, modal, markAllBtn } = getNotificationCenterElements();

        // Admin által módosult profil — friss adatok lehúzása, hogy a felület
        // (Security & Activity History, ELO/wins/losses, e-mail, stb.) azonnal
        // tükrözze az új állapotot, ne csak az értesítés.
        window.addEventListener('mattmester:user:profile:adminEdit', () => {
            runSafelyAsync('userProfileAdminEditRefresh', async () => {
                try { await refreshSecurityActivity(); } catch (_) {}
                try { await refreshAuthUi('admin-profile-edit'); } catch (_) {}
            });
        });

        window.addEventListener('mattmester:notification:push', (event) => {
            runSafely('notificationPushCollect', () => {
                const notification = normalizeNotificationItem(event?.detail || {});
                const existingIndex = notification.id
                    ? notificationCenterState.items.findIndex((entry) => entry.id === notification.id)
                    : -1;
                if (existingIndex >= 0) {
                    notificationCenterState.items.splice(existingIndex, 1);
                }
                notificationCenterState.items.unshift(notification);
                if (notificationCenterState.items.length > notificationCenterState.maxItems) {
                    notificationCenterState.items.length = notificationCenterState.maxItems;
                }
                if (!notification.isRead) {
                    setNotificationBadge(notificationCenterState.unreadCount + 1);
                }
                renderNotificationCenterList();
            });
        });

        window.addEventListener('mattmester:notification:badge', (event) => {
            runSafely('notificationBadgeUpdate', () => {
                const count = Number(event?.detail?.unreadCount) || 0;
                setNotificationBadge(count);
            });
        });

        window.addEventListener('mattmester:chat:unread-total', (event) => {
            runSafely('chatUnreadTotalUpdate', () => {
                const total = Number(event?.detail?.totalUnread) || 0;
                setChatBadge(total);
            });
        });

        window.addEventListener('mattmester:notification:reset', (event) => {
            runSafely('notificationResetFromServer', () => {
                const reason = String(event?.detail?.reason || 'session-change');
                resetNotificationCenterState(reason);
            });
        });

        // Multi-tab szinkron: ha az adott user masik tabjan / a backend
        // dismiss-elte az ertesitest, ezen a tabon is azonnal tunjon el.
        window.addEventListener('mattmester:notification:dismissed', (event) => {
            runSafely('notificationDismissedFromServer', () => {
                const notificationId = Number(event?.detail?.notificationId) || 0;
                if (notificationId > 0) {
                    const idx = notificationCenterState.items.findIndex((entry) => entry.id === notificationId);
                    if (idx >= 0) {
                        const wasUnread = !notificationCenterState.items[idx].isRead;
                        notificationCenterState.items.splice(idx, 1);
                        if (wasUnread) {
                            setNotificationBadge(Math.max(0, notificationCenterState.unreadCount - 1));
                        }
                        renderNotificationCenterList();
                    }
                }
            });
        });

        window.addEventListener('mattmester:notification:dismissed-all', () => {
            runSafely('notificationDismissedAllFromServer', () => {
                notificationCenterState.items = [];
                setNotificationBadge(0);
                renderNotificationCenterList();
            });
        });

        window.addEventListener('mattmester:notification:dismissed-bulk', (event) => {
            runSafely('notificationDismissedBulkFromServer', () => {
                const filter = event?.detail?.filter || {};
                const filterType = typeof filter.type === 'string' ? filter.type : null;
                const filterSenderUserId = Number(filter.senderUserId) || null;
                if (!filterType && !filterSenderUserId) {
                    return;
                }
                let unreadDelta = 0;
                notificationCenterState.items = notificationCenterState.items.filter((entry) => {
                    const matchesType = !filterType || entry.type === filterType;
                    const matchesSender = !filterSenderUserId || Number(entry.fromUserId) === filterSenderUserId;
                    const shouldRemove = matchesType && matchesSender;
                    if (shouldRemove && !entry.isRead) {
                        unreadDelta += 1;
                    }
                    return !shouldRemove;
                });
                if (unreadDelta > 0) {
                    setNotificationBadge(Math.max(0, notificationCenterState.unreadCount - unreadDelta));
                }
                renderNotificationCenterList();
            });
        });

        window.addEventListener('mattmester:chat:unread:reset', (event) => {
            runSafely('chatUnreadResetFromServer', () => {
                const reason = String(event?.detail?.reason || 'session-change');
                resetChatBadgeState(reason);
            });
        });

        window.addEventListener('mattmester:session-context:changed', (event) => {
            // Amikor a socket:state / presence:state observer session valtast jelez,
            // authoritative refresh-t inditunk a backend fele, hogy a frontend
            // allapot mindig a DB-vel legyen szinkronban.
            runSafelyAsync('notificationSessionContextRefresh', async () => {
                const reason = `session-context:${event?.detail?.trigger || 'change'}`;
                await refreshNotificationAndChatStateForCurrentSession(reason);
            });
        });

        if (list) {
            list.addEventListener('click', (event) => {
                runSafelyAsync('notificationListAction', async () => {
                    const button = event.target.closest('[data-notification-action]');
                    if (!button) {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    const wrapper = button.closest('[data-notification-id]');
                    const notificationId = Number(wrapper?.dataset.notificationId) || 0;
                    const fromUserId = Number(wrapper?.dataset.fromUserId) || 0;
                    const conversationId = Number(wrapper?.dataset.conversationId) || 0;
                    const action = button.dataset.notificationAction;

                    // Profil = view-only, ratelimit / spam vedelem nem ertelmezett.
                    if (action === 'profile' && fromUserId) {
                        await openPlayerProfileModalByUserId(fromUserId);
                        return;
                    }

                    // open_chat = read + modal close, nem optimistic remove.
                    if (action === 'open_chat' && (conversationId || fromUserId)) {
                        const isReadSaved = await markNotificationReadOnServer(notificationId);
                        if (!isReadSaved) {
                            console.error('[notifications] chat megnyitas mellett read mentes sikertelen:', notificationId);
                        }
                        window.dispatchEvent(new CustomEvent('mattmester:chat:open-conversation', {
                            detail: { conversationId, targetUserId: fromUserId }
                        }));
                        if (modal) {
                            bootstrap.Modal.getOrCreateInstance(modal).hide();
                        }
                        return;
                    }

                    // Innen lefele: minden ag dismiss-elendo, ami optimistic
                    // local-removal-t es per-notif in-flight guardot ervenyesit.
                    const isResolvingAction = (
                        action === 'remove'
                        || ((action === 'accept' || action === 'reject' || action === 'block') && fromUserId)
                    );
                    if (!isResolvingAction || !notificationId) {
                        return;
                    }

                    // 1. lepes — abuse / double-click vedelem: ha mar fut egy
                    //    POST erre az ertesitesre, a kovetkezo klikkek no-op-ok.
                    if (notificationCenterState.pendingActionIds.has(notificationId)) {
                        return;
                    }
                    notificationCenterState.pendingActionIds.add(notificationId);

                    // 2. lepes — minden akcio-gombot disable-elunk a kartyan,
                    //    hogy egy lassu valtas alatt se lehessen tovabbi POST-okat
                    //    ramai meg. Mar nem latszik, ha eltunt, de safety-net.
                    const cardButtons = wrapper
                        ? Array.from(wrapper.querySelectorAll('[data-notification-action]'))
                        : [button];
                    cardButtons.forEach((btn) => { btn.disabled = true; });

                    // 3. lepes — optimistic UI: local state-bol kivesszuk, mielott
                    //    a halozati hivas befejezodne. Ha hibazik, visszaallitjuk.
                    const idx = notificationCenterState.items.findIndex((entry) => entry.id === notificationId);
                    let removedItem = null;
                    let removedIndex = -1;
                    if (idx >= 0) {
                        removedIndex = idx;
                        removedItem = notificationCenterState.items[idx];
                        notificationCenterState.items.splice(idx, 1);
                        if (removedItem && !removedItem.isRead) {
                            setNotificationBadge(Math.max(0, notificationCenterState.unreadCount - 1));
                        }
                        renderNotificationCenterList();
                    }

                    const restoreOnFailure = (feedbackMessage) => {
                        if (removedItem && removedIndex >= 0) {
                            const insertAt = Math.min(removedIndex, notificationCenterState.items.length);
                            notificationCenterState.items.splice(insertAt, 0, removedItem);
                            if (!removedItem.isRead) {
                                setNotificationBadge(notificationCenterState.unreadCount + 1);
                            }
                            renderNotificationCenterList();
                        }
                        if (feedbackMessage && typeof setFriendsFeedback === 'function') {
                            setFriendsFeedback(feedbackMessage, 'warning');
                        }
                    };

                    try {
                        if (action === 'remove') {
                            const isDismissSaved = await dismissNotificationOnServer(notificationId);
                            if (!isDismissSaved) {
                                restoreOnFailure('Az ertesites eltavolitasa nem sikerult.');
                            }
                        } else {
                            // accept / reject / block: friend action elobb, dismiss utana.
                            const result = await performFriendActionFromNotification(action, fromUserId);
                            if (result.success) {
                                const isDismissSaved = await dismissNotificationOnServer(notificationId);
                                if (!isDismissSaved && typeof setFriendsFeedback === 'function') {
                                    setFriendsFeedback('A muvelet sikerult, de az ertesites eltavolitasa nem sikerult. Frissitsd az oldalt.', 'warning');
                                }
                                if (typeof setFriendsFeedback === 'function') {
                                    setFriendsFeedback(result.message, 'success');
                                }
                                if (typeof refreshFriendsList === 'function') {
                                    await refreshFriendsList(friendsState?.activeFilter || 'friend');
                                }
                            } else {
                                restoreOnFailure(null);
                                if (typeof setFriendsFeedback === 'function') {
                                    setFriendsFeedback(result.message || 'Hiba a muvelet soran.', 'error');
                                }
                            }
                        }
                    } finally {
                        notificationCenterState.pendingActionIds.delete(notificationId);
                        // Ha a kartya meg latszik (hiba miatt visszaallt), engedelyezzuk
                        // ujra a gombokat. Ha eltunt, a felhasznalo soha nem latja
                        // oket, de a guard tisztitas igy is fontos a memoria miatt.
                        cardButtons.forEach((btn) => { btn.disabled = false; });
                    }
                });
            });
        }

        if (markAllBtn) {
            markAllBtn.addEventListener('click', () => {
                runSafelyAsync('markAllNotificationsRead', async () => {
                    // Per spec: a "Mind olvasott" gomb feliratot megtartjuk, de
                    // a viselkedese permanens user-oldali eltavolitas mindenre.
                    if (notificationCenterState.markAllInFlight) {
                        return;
                    }
                    notificationCenterState.markAllInFlight = true;
                    markAllBtn.disabled = true;

                    // Optimistic: azonnal kiuritjuk a UI-t, hibara visszaallitjuk.
                    const previousItems = notificationCenterState.items.slice();
                    const previousUnread = notificationCenterState.unreadCount;
                    notificationCenterState.items = [];
                    setNotificationBadge(0);
                    renderNotificationCenterList();

                    try {
                        const success = await markAllNotificationsReadOnServer();
                        if (!success) {
                            notificationCenterState.items = previousItems;
                            setNotificationBadge(previousUnread);
                            renderNotificationCenterList();
                            if (typeof setFriendsFeedback === 'function') {
                                setFriendsFeedback('Az ertesitesek tomeges eltavolitasa nem sikerult.', 'warning');
                            }
                        }
                    } finally {
                        notificationCenterState.markAllInFlight = false;
                        markAllBtn.disabled = false;
                    }
                });
            });
        }

        if (modal) {
            modal.addEventListener('shown.bs.modal', () => {
                runSafelyAsync('notificationModalShown', async () => {
                    await fetchNotificationsFromServer();
                });
            });
        }

        notificationCenterState.bound = true;
    }

    if (!notificationCenterState.initialized) {
        runSafelyAsync('notificationsInitialFetch', async () => {
            await fetchNotificationsFromServer();
        });
        notificationCenterState.initialized = true;
    }

    if (!chatBadgeState.initialized) {
        runSafelyAsync('chatUnreadInitialFetch', async () => {
            await fetchChatUnreadTotal();
        });
        chatBadgeState.initialized = true;
    }
}
//sessionInfo
async function fetchSessionInfo() {
    let result = { success: false, loggedIn: false };
    try {
        const response = await fetch('/api/sessionInfo');
        const data = await parseJson(response);
        if (response.ok) {
            result = data;
        }
    } catch (error) {
        console.error('Hiba a session informacio lekerdezese soran:', error);
    }
    return result;
}

async function logSessionAndSocketInfo(sessionInfoInput = null, contextLabel = 'auth-refresh') {
    try {
        const debugEnabled = String(window.localStorage?.getItem('mattmester.debugAuthLogs') || 'false').toLowerCase() === 'true';
        
        if (debugEnabled) {
            const sessionInfo = sessionInfoInput || await fetchSessionInfo();

            console.log('--- Auth Status Report ---');
            console.log('Context:', contextLabel);
            console.log('Session info:', sessionInfo);

            if (socket) {
                console.log('SocketInfo:', window.MattMesterSocket?.getSnapshot ? window.MattMesterSocket.getSnapshot() : {
                    socketId: socket.id,
                    connected: socket.connected,
                    sessionBound: socket.connected ? 'Active' : 'Disconnected/Pending'
                });
            } else {
                console.warn('SocketInfo: A socket objektum nem található vagy még nem lett inicializálva.');
            }

            console.log('--------------------------');
        }
    } catch (error) {
        console.error('Hiba a session/socket informacio naplozasakor:', error);
    }
}

async function refreshAuthUi(contextLabel = 'auth-refresh') {
    try {
        const sessionInfo = await fetchSessionInfo();
        showStats(sessionInfo);
        handleProfileSettings(sessionInfo);
        renderAccountStatus(sessionInfo);
        logSessionAndSocketInfo(sessionInfo, contextLabel);
    } catch (error) {
        console.error('refreshAuthUi hiba:', error);
    }
}

function getAccountStatusElements() {
    return {
        emailBadge: document.getElementById('accountStatusEmailBadge'),
        roleBadge: document.getElementById('accountStatusRoleBadge'),
        activeBadge: document.getElementById('accountStatusActiveBadge'),
        emailIconWrap: document.getElementById('accountStatusEmailIconWrap'),
        emailIcon: document.getElementById('accountStatusEmailIcon'),
        emailTitle: document.getElementById('accountStatusEmailTitle'),
        emailHint: document.getElementById('accountStatusEmailHint'),
        memberSince: document.getElementById('accountStatusMemberSince'),
        resendButton: document.getElementById('resendVerificationButton'),
        resendHint: document.getElementById('resendVerificationHint'),
        feedback: document.getElementById('accountStatusFeedback'),
        section: document.getElementById('accountStatus')
    };
}

function setAccountStatusFeedback(type, message) {
    const { feedback } = getAccountStatusElements();
    if (feedback) {
        feedback.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-warning', 'alert-info');
        if (message) {
            feedback.textContent = message;
            feedback.classList.add(`alert-${type || 'info'}`);
        } else {
            feedback.textContent = '';
            feedback.classList.add('d-none');
        }
    }
}

function scrollToAccountStatusAndHighlightResend() {
    const { section, resendButton } = getAccountStatusElements();
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (resendButton) {
        resendButton.classList.add('account-status-resend-highlight');
        if (accountStatusState.highlightTimer) {
            clearTimeout(accountStatusState.highlightTimer);
        }

        accountStatusState.highlightTimer = setTimeout(() => {
            resendButton.classList.remove('account-status-resend-highlight');
            accountStatusState.highlightTimer = null;
        }, 2400);
    }
}

function handleEmailNotVerifiedCta(payload) {
    const code = String(payload?.code || '').trim();
    let handled = false;
    if (code === EMAIL_VERIFICATION_REQUIRED_CODE) {
        handled = true;
        setAccountStatusFeedback('warning', 'A funkció használatához előbb erősítsd meg az email címed. Nyisd meg az Account Status szekciót és küldd újra a verifikációs emailt.');
        scrollToAccountStatusAndHighlightResend();
    }
    return handled;
}

function renderAccountStatus(sessionInfo) {
    try {
        const elements = getAccountStatusElements();
        const user = sessionInfo?.user || sessionInfo?.data?.user || null;
        if (!user) {
            throw new Error('Nincs felhasználó az account status megjelenítéséhez.');
        }

        const isVerified = Boolean(user.is_email_verified);
        const role = String(user.role || 'player').toLowerCase();
        const roleLabel = role === 'admin' ? 'Administrator' : 'Player';
        const memberDate = user.created_at ? new Date(user.created_at) : null;
        const memberSinceText = memberDate && !Number.isNaN(memberDate.getTime())
            ? memberDate.toLocaleDateString('hu-HU')
            : 'Ismeretlen';

        if (elements.emailBadge) {
            elements.emailBadge.className = `badge ${isVerified ? 'bg-success' : 'bg-warning text-dark'}`;
            elements.emailBadge.textContent = isVerified ? 'Verified' : 'Not Verified';
        }

        if (elements.roleBadge) {
            elements.roleBadge.className = `badge ${role === 'admin' ? 'badge-admin' : 'badge-player'}`;
            elements.roleBadge.textContent = roleLabel;
        }

        if (elements.activeBadge) {
            elements.activeBadge.className = `badge ${user.is_banned ? 'bg-danger' : 'bg-success'}`;
            elements.activeBadge.textContent = user.is_banned ? 'Banned' : 'Active';
        }

        if (elements.emailIconWrap) {
            elements.emailIconWrap.style.color = isVerified ? 'var(--accent-green)' : 'var(--accent-red)';
            elements.emailIconWrap.style.backgroundColor = isVerified ? 'rgba(16, 185, 129, 0.1)' : 'rgba(233, 69, 96, 0.12)';
        }

        if (elements.emailIcon) {
            elements.emailIcon.setAttribute('data-lucide', isVerified ? 'mail-check' : 'mail-warning');
            if (window.lucide?.createIcons) {
                window.lucide.createIcons();
            }
        }

        if (elements.emailTitle) {
            elements.emailTitle.textContent = isVerified ? 'Email megerősítve' : 'Email megerősítés szükséges';
        }

        if (elements.emailHint) {
            elements.emailHint.textContent = isVerified
                ? 'A fiókod email szempontból védett.'
                : 'A fiókod még nincs megerősítve. Kérj új verifikációs emailt, ha nem kaptad meg a levelet.';
        }

        if (elements.resendHint) {
            elements.resendHint.textContent = isVerified
                ? 'Az email címed már megerősítve, nincs további teendő.'
                : 'Ha nem érkezik email, ellenőrizd a spam/promóciók mappát is.';
        }

        if (elements.resendButton) {
            elements.resendButton.disabled = isVerified || accountStatusState.sending;
            elements.resendButton.classList.toggle('opacity-75', isVerified);
            elements.resendButton.title = isVerified
                ? 'Az email címed már megerősítve.'
                : 'Kattints új verifikációs email küldéséhez.';

            if (!accountStatusState.sending) {
                elements.resendButton.innerHTML = '<i data-lucide="send" style="width: 16px; height: 16px;"></i> Verifikációs email újraküldése';
            }
        }

        if (elements.memberSince) {
            elements.memberSince.textContent = memberSinceText;
        }
    } catch (error) {
        console.error('renderAccountStatus hiba:', error);
    }
}

function mapResendVerificationErrorMessage(payload, statusCode) {
    const responseCode = String(payload?.code || '').trim();
    let message = 'Email küldés sikertelen, ellenőrizd az SMTP beállításokat vagy próbáld újra később.';

    if (responseCode === EMAIL_RESEND_RATE_LIMIT_CODE || Number(statusCode) === 429) {
        message = payload?.message || 'Túl sok újraküldési kérés érkezett. Próbáld újra 15 perc múlva.';
    } else if (responseCode === EMAIL_SEND_FAILED_CODE) {
        message = payload?.message || 'Email küldés sikertelen, ellenőrizd az SMTP beállításokat vagy próbáld újra később.';
    } else if (responseCode === EMAIL_VERIFICATION_REQUIRED_CODE) {
        message = payload?.message || 'A fiókod még nincs megerősítve. Küldj új verifikációs emailt az Account Status részből.';
    } else if (payload?.message) {
        message = payload.message;
    }

    return message;
}

async function resendVerificationEmailFromAccountStatus() {
    try {
        const elements = getAccountStatusElements();
        if (!elements.resendButton) {
            throw new Error('Hiányzik a verifikációs újraküldés gomb.');
        }

        accountStatusState.sending = true;
        elements.resendButton.disabled = true;
        elements.resendButton.innerHTML = '<i data-lucide="loader-circle" style="width: 16px; height: 16px;"></i> Küldés folyamatban...';
        if (window.lucide?.createIcons) {
            window.lucide.createIcons();
        }

        const response = await fetch('/api/auth/resend-verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await parseJson(response);

        if (!response.ok || !result.success) {
            handleEmailNotVerifiedCta(result);
            throw new Error(mapResendVerificationErrorMessage(result, response.status));
        }

        setAccountStatusFeedback('success', result.message || 'Új verifikációs email elküldve. Ellenőrizd a postaládád és a spam mappát is.');
        await refreshAuthUi('profile-account-status-resend-success');
    } catch (error) {
        setAccountStatusFeedback('danger', error.message || 'Email küldés sikertelen, ellenőrizd az SMTP beállításokat vagy próbáld újra később.');
    } finally {
        accountStatusState.sending = false;
        try {
            const sessionInfo = await fetchSessionInfo();
            renderAccountStatus(sessionInfo);
        } catch (refreshError) {
            console.error('Account Status frissítési hiba újraküldés után:', refreshError);
        }
    }
}

function bindAccountStatusEvents() {
    try {
        if (!accountStatusState.bound) {
            const { resendButton } = getAccountStatusElements();
            if (!resendButton) {
                throw new Error('Az Account Status újraküldés gomb nem található.');
            }

            resendButton.addEventListener('click', async () => {
                await runSafelyAsync('accountStatusResendVerificationClick', async () => {
                    await resendVerificationEmailFromAccountStatus();
                });
            });

            accountStatusState.bound = true;
        }
    } catch (error) {
        console.error('bindAccountStatusEvents hiba:', error);
    }
}

async function syncSocketContextOrReconnect(reason = 'session-mutation') {
    try {
        if (!window.MattMesterSocket?.syncSocketContextOrReconnect) {
            throw new Error('A közös socket sync API nem érhető el.');
        }

        await window.MattMesterSocket.syncSocketContextOrReconnect(reason);
    } catch (error) {
        throw new Error(`Socket context szinkronizálási hiba: ${error.message}`);
    }
}

function bindCrossTabProfileRefreshEvents() {
    try {
        if (!profileRealtimeSyncState.bound) {
            if (!window.MattMesterSocket?.subscribeSessionContextChanges) {
                throw new Error('A közös session context observer API nem érhető el.');
            }

            const unsubscribe = window.MattMesterSocket.subscribeSessionContextChanges(async (eventPayload = {}) => {
                try {
                    await refreshAuthUi();
                    // Session valtas eseten az ertesites es chat unread allapotot
                    // is authoritative modon be kell tolteni, kulonben a modalban
                    // es a chat ikonon a regi user adatai maradnak.
                    await refreshNotificationAndChatStateForCurrentSession(
                        `cross-tab:${eventPayload?.trigger || 'change'}`
                    );
                } catch (error) {
                    throw new Error(`Cross-tab profil frissítési hiba: ${error.message}`);
                }
            }, {
                throttleMs: PROFILE_CROSS_TAB_REFRESH_THROTTLE_MS
            });

            if (typeof unsubscribe !== 'function') {
                throw new Error('A session context observer leiratkozó függvény nem érkezett meg.');
            }

            profileRealtimeSyncState.unsubscribe = unsubscribe;
            profileRealtimeSyncState.bound = true;

            window.addEventListener('beforeunload', () => {
                runSafely('profileRealtimeSyncUnsubscribe', () => {
                    try {
                        if (typeof profileRealtimeSyncState.unsubscribe === 'function') {
                            profileRealtimeSyncState.unsubscribe();
                        }
                        profileRealtimeSyncState.unsubscribe = null;
                        profileRealtimeSyncState.bound = false;
                    } catch (error) {
                        throw new Error(`Cross-tab observer leiratkozási hiba: ${error.message}`);
                    }
                });
            }, { once: true });
        }
    } catch (error) {
        throw new Error(`Cross-tab profil refresh eseménykötési hiba: ${error.message}`);
    }
}

function getPlayerSearchRuntime(source = 'topbar') {
    return source === 'modal' ? playerSearchState.modal : playerSearchState.topbar;
}

function cancelPlayerSearch(source = 'topbar', abortInFlight = true) {
    const runtime = getPlayerSearchRuntime(source);
    if (runtime.debounceTimer) {
        clearTimeout(runtime.debounceTimer);
        runtime.debounceTimer = null;
    }

    if (abortInFlight && runtime.abortController) {
        runtime.abortController.abort();
        runtime.abortController = null;
    }
}

function schedulePlayerSearch(source = 'topbar', delayMs = PLAYER_SEARCH_DEBOUNCE_MS) {
    const runtime = getPlayerSearchRuntime(source);
    if (runtime.debounceTimer) {
        clearTimeout(runtime.debounceTimer);
        runtime.debounceTimer = null;
    }

    runtime.debounceTimer = setTimeout(() => {
        runtime.debounceTimer = null;
        searchPlayer(source).catch((error) => {
            if (error?.name === 'AbortError' || error?.name === 'SearchStaleError') {
                console.debug('Keresés megszakítva vagy elavult:', error.message);
            } else {
                console.error('Keresés hiba:', error);
            }
        });
    }, Math.max(0, Number(delayMs) || 0));
}

async function searchPlayer(source = 'topbar'){
    const runtime = getPlayerSearchRuntime(source);
    const requestToken = runtime.requestToken + 1;
    runtime.requestToken = requestToken;

    try {
        const elements = source === 'modal'
            ? getModalPlayerSearchElements()
            : getTopBarPlayerSearchElements();
        const { input, button, feedback } = elements;
        if (!input || !button || !feedback) {
            throw new Error('A kereső elemek nem találhatók a DOM-ban.');
        }

        const username = (input.value || '').trim();
        if (!username || username.length < 3 || username.length > 50 || !USERNAME_REGEX.test(username)) {
            throw new Error('Érvénytelen felhasználónév a kereséshez.');
        }
        const searchText = username;

        feedback.classList.remove('text-danger', 'text-success');
        feedback.classList.add('text-secondary');
        feedback.textContent = 'Keresés folyamatban...';
        button.disabled = true;

        if (runtime.abortController) {
            runtime.abortController.abort();
        }
        runtime.abortController = new AbortController();

        const response = await fetch(`/api/searchPlayer?username=${encodeURIComponent(username)}`, {
            signal: runtime.abortController.signal
        });

        if (runtime.requestToken !== requestToken) {
            const staleError = new Error('A keresés elavulttá vált.');
            staleError.name = 'SearchStaleError';
            throw staleError;
        }

        const result = await parseJson(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Sikertelen keresés.');
        }

        feedback.classList.remove('text-secondary', 'text-danger');
        feedback.classList.add('text-success');
        feedback.textContent = `A keresés eredményes: ${result.data.length} találat.`;

        openSearchResultsModal(Array.isArray(result.data) ? result.data : [], searchText);
        clearPlayerSearchInputs();
    } catch (error) {
        if (error?.name === 'AbortError' || error?.name === 'SearchStaleError') {
            throw error;
        }

        const { feedback } = source === 'modal'
            ? getModalPlayerSearchElements()
            : getTopBarPlayerSearchElements();
        if (feedback) {
            feedback.classList.remove('text-secondary', 'text-success');
            feedback.classList.add('text-danger');
            feedback.textContent = error.message || 'Hiba történt a játékos keresése során.';
        }
        clearPlayerSearchInputs();
        console.error('Hiba a jatekos kereses soran:', error);
    } finally {
        if (runtime.requestToken === requestToken) {
            runtime.abortController = null;
        }

        if (source === 'modal') {
            validatePlayerSearchElements(getModalPlayerSearchElements());
        } else {
            validatePlayerSearchElements(getTopBarPlayerSearchElements());
        }
    }
}

function getSearchResultsModalElements() {
    return {
        modal: document.getElementById('searchResultsModal'),
        titleText: document.getElementById('searchResultsModalTitleText'),
        list: document.getElementById('searchResultsList'),
        summary: document.getElementById('searchResultsSummary'),
        empty: document.getElementById('searchResultsEmpty')
    };
}

function getPlayerProfileModalElements() {
    return {
        modal: document.getElementById('playerProfileModal'),
        titleText: document.getElementById('playerProfileModalTitleText'),
        feedback: document.getElementById('playerProfileModalFeedback'),
        avatar: document.getElementById('playerProfileAvatar'),
        username: document.getElementById('playerProfileUsername'),
        role: document.getElementById('playerProfileRole'),
        joinedAt: document.getElementById('playerProfileJoinedAt'),
        lastActiveAt: document.getElementById('playerProfileLastActiveAt'),
        eloClassic: document.getElementById('playerProfileEloClassic'),
        eloClassicRank: document.getElementById('playerProfileEloClassicRank'),
        eloMM: document.getElementById('playerProfileEloMM'),
        eloMMRank: document.getElementById('playerProfileEloMMRank'),
        eloBullet: document.getElementById('playerProfileEloBullet'),
        eloBulletRank: document.getElementById('playerProfileEloBulletRank'),
        wins: document.getElementById('playerProfileWins'),
        losses: document.getElementById('playerProfileLosses'),
        draws: document.getElementById('playerProfileDraws'),
        winRate: document.getElementById('playerProfileWinRate')
    };
}

function toNumberSafe(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumberHu(value) {
    return toNumberSafe(value).toLocaleString('hu-HU');
}

function getRankForEloValue(eloValue) {
    const elo = toNumberSafe(eloValue);
    if (elo < 1100) {
        return { label: 'Beginner', className: 'rank-beginner' };
    }
    if (elo < 1400) {
        return { label: 'Intermediate', className: 'rank-intermediate' };
    }
    if (elo < 1700) {
        return { label: 'Advanced', className: 'rank-advanced' };
    }
    if (elo < 2000) {
        return { label: 'Expert', className: 'rank-expert' };
    }
    if (elo < 2300) {
        return { label: 'Master', className: 'rank-master' };
    }

    return { label: 'Grandmaster', className: 'rank-grandmaster' };
}

function applyRankBadge(rankElement, eloValue) {
    if (!rankElement) {
        return;
    }

    const rank = getRankForEloValue(eloValue);
    rankElement.classList.remove('rank-beginner', 'rank-intermediate', 'rank-advanced', 'rank-expert', 'rank-master', 'rank-grandmaster');
    rankElement.classList.add(rank.className);
    rankElement.textContent = rank.label;
}

function formatDateTimeHuman(value) {
    if (!value) {
        return 'Nincs adat';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Nincs adat';
    }

    return date.toLocaleString('hu-HU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function setPlayerProfileModalFeedback(message = '', type = 'neutral') {
    const { feedback } = getPlayerProfileModalElements();
    if (!feedback) {
        return;
    }

    feedback.classList.remove('d-none', 'is-success', 'is-error');
    feedback.textContent = message || '';

    if (!message) {
        feedback.classList.add('d-none');
        return;
    }

    if (type === 'success') {
        feedback.classList.add('is-success');
    } else if (type === 'error') {
        feedback.classList.add('is-error');
    }
}

function fillPlayerProfileModal(player) {
    const elements = getPlayerProfileModalElements();
    if (!elements.modal) {
        throw new Error('A játékos profil modal elemei nem találhatók a DOM-ban.');
    }

    if (elements.titleText) {
        elements.titleText.textContent = `${player.username || 'Játékos'} profilja`;
    }

    if (elements.avatar) {
        window.MattMesterProfileImage.applyProfileImagePresentation(elements.avatar, {
            source: player,
            alt: `${player.username || 'Játékos'} profilképe`
        });
    }

    if (elements.username) {
        elements.username.textContent = player.username || 'Ismeretlen játékos';
    }

    if (elements.role) {
        const roleValue = String(player.role || 'player').toLowerCase();
        elements.role.textContent = roleValue === 'admin' ? 'Admin' : 'Player';
        elements.role.classList.remove('admin');
        if (roleValue === 'admin') {
            elements.role.classList.add('admin');
        }
    }

    if (elements.joinedAt) {
        elements.joinedAt.textContent = formatDateTimeHuman(player.joinedAt);
    }

    if (elements.lastActiveAt) {
        elements.lastActiveAt.textContent = formatDateTimeHuman(player.lastActiveAt);
    }

    const eloClassic = toNumberSafe(player.elo);
    const eloMM = toNumberSafe(player.eloMM);
    const eloBullet = toNumberSafe(player.eloBullet);

    if (elements.eloClassic) {
        elements.eloClassic.textContent = formatNumberHu(eloClassic);
    }
    if (elements.eloMM) {
        elements.eloMM.textContent = formatNumberHu(eloMM);
    }
    if (elements.eloBullet) {
        elements.eloBullet.textContent = formatNumberHu(eloBullet);
    }

    applyRankBadge(elements.eloClassicRank, eloClassic);
    applyRankBadge(elements.eloMMRank, eloMM);
    applyRankBadge(elements.eloBulletRank, eloBullet);

    if (elements.wins) {
        elements.wins.textContent = formatNumberHu(player.wins);
    }
    if (elements.losses) {
        elements.losses.textContent = formatNumberHu(player.losses);
    }
    if (elements.draws) {
        elements.draws.textContent = formatNumberHu(player.draws);
    }
    if (elements.winRate) {
        elements.winRate.textContent = `${toNumberSafe(player.winRate).toFixed(2)}%`;
    }
}

async function fetchPlayerPublicProfile(userId) {
    const response = await fetch(`/api/players/${encodeURIComponent(userId)}/profile`);
    const result = await parseJson(response);

    if (!response.ok || !result.success) {
        throw new Error(result.message || 'Nem sikerült a játékos profil betöltése.');
    }

    return result.data || null;
}

async function openPlayerProfileModalByUserId(userId) {
    const elements = getPlayerProfileModalElements();
    if (!elements.modal) {
        throw new Error('A játékos profil modal nem található.');
    }

    const modalInstance = bootstrap.Modal.getOrCreateInstance(elements.modal);
    setPlayerProfileModalFeedback('Játékos adatok betöltése...', 'success');
    modalInstance.show();

    try {
        const playerData = await fetchPlayerPublicProfile(userId);
        fillPlayerProfileModal(playerData || {});
        setPlayerProfileModalFeedback('Profil adatok betöltve.', 'success');
        lucide.createIcons();
    } catch (error) {
        setPlayerProfileModalFeedback(error.message || 'Nem sikerült a játékos profil betöltése.', 'error');
        throw error;
    }
}

function clearPlayerSearchInputs() {
    const { input: topInput } = getTopBarPlayerSearchElements();
    const { input: modalInput } = getModalPlayerSearchElements();

    if (topInput) {
        topInput.value = '';
    }

    if (modalInput) {
        modalInput.value = '';
    }

    validatePlayerSearchElements(getTopBarPlayerSearchElements());
    validatePlayerSearchElements(getModalPlayerSearchElements());
}

function getModalPlayerSearchElements() {
    return {
        input: document.getElementById('modalPlayerSearchInput'),
        button: document.getElementById('modalPlayerSearchButton'),
        feedback: document.getElementById('modalPlayerSearchFeedback')
    };
}

function createSearchResultListItem(player) {
    const item = document.createElement('div');
    item.className = 'search-results-item';
    item.setAttribute('role', 'listitem');
    item.dataset.userId = String(player.userId || player.id || '');
    item.dataset.username = String(player.username || '');
    item.dataset.friendStatus = String(player.friendStatus || 'none');
    item.dataset.conversationId = String(player.conversationId || '');

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'position-relative flex-shrink-0';

    const avatar = document.createElement('img');
    avatar.className = 'friend-avatar rounded-circle';
    window.MattMesterProfileImage.applyProfileImagePresentation(avatar, {
        source: player,
        alt: `${player.username || 'Jatekos'} profilkepe`,
        size: 40
    });
    avatarWrap.appendChild(avatar);

    const info = document.createElement('div');
    info.className = 'flex-grow-1 min-width-0';

    const name = document.createElement('h6');
    name.className = 'mb-0 text-white text-truncate';
    name.style.fontSize = '0.9rem';
    name.textContent = player.username || 'Ismeretlen jatekos';
    info.appendChild(name);

    const actions = document.createElement('div');
    actions.className = 'search-results-actions';

    const friendStatus = String(player.friendStatus || 'none');
    let actionButton, chatButton;

    // Friend gomb az eredeti Friend Add helyett
    if (friendStatus === 'none' || friendStatus === 'rejected') {
        actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.className = 'btn btn-sm btn-outline-gold py-1 px-2';
        actionButton.title = 'Barát hozzáadása';
        actionButton.dataset.action = 'add-friend';
        actionButton.dataset.userId = String(player.userId || player.id || '');
        actionButton.dataset.username = String(player.username || '');
        actionButton.innerHTML = '<i data-lucide="user-plus" style="width: 16px; height: 16px;"></i>';
        actions.appendChild(actionButton);
    } else if (friendStatus === 'pending') {
        actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.className = 'btn btn-sm btn-outline-warning py-1 px-2';
        actionButton.title = 'Barát kérelem: függőben';
        actionButton.dataset.action = 'pending-friend';
        actionButton.dataset.userId = String(player.userId || player.id || '');
        actionButton.innerHTML = '<i data-lucide="arrow-up-right" style="width: 16px; height: 16px;"></i>';
        actions.appendChild(actionButton);
    } else if (friendStatus === 'accepted') {
        actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.className = 'btn btn-sm btn-outline-success py-1 px-2';
        actionButton.title = 'Barát: elfogadva';
        actionButton.dataset.action = 'accepted-friend';
        actionButton.dataset.userId = String(player.userId || player.id || '');
        actionButton.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px;"></i>';
        actions.appendChild(actionButton);

        chatButton = document.createElement('button');
        chatButton.type = 'button';
        chatButton.className = 'btn btn-sm btn-outline-gold py-1 px-2';
        chatButton.title = 'Üzenet küldése';
        chatButton.dataset.action = 'chat';
        chatButton.dataset.userId = String(player.userId || player.id || '');
        chatButton.dataset.username = String(player.username || '');
        chatButton.dataset.conversationId = String(player.conversationId || '');
        chatButton.innerHTML = '<i data-lucide="message-circle" style="width: 16px; height: 16px;"></i>';
        actions.appendChild(chatButton);
    } else if (friendStatus === 'blocked') {
        actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.className = 'btn btn-sm btn-outline-danger py-1 px-2';
        actionButton.title = 'Felhasználó: letiltva';
        actionButton.dataset.action = 'blocked-friend';
        actionButton.dataset.userId = String(player.userId || player.id || '');
        actionButton.disabled = true;
        actionButton.innerHTML = '<i data-lucide="slash-circle" style="width: 16px; height: 16px;"></i>';
        actions.appendChild(actionButton);
    }

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'btn btn-sm btn-outline-gold py-1 px-2';
    viewButton.title = 'Megtekintés';
    viewButton.dataset.action = 'view-profile';
    viewButton.dataset.userId = String(player.userId || player.id || '');
    viewButton.dataset.username = String(player.username || '');
    viewButton.innerHTML = '<i data-lucide="eye" style="width: 16px; height: 16px;"></i>';
    actions.appendChild(viewButton);

    item.appendChild(avatarWrap);
    item.appendChild(info);
    item.appendChild(actions);

    return item;
}

function openSearchResultsModal(players, searchText = '') {
    const { modal, titleText, list, summary, empty } = getSearchResultsModalElements();
    if (!modal || !list || !summary || !empty) {
        throw new Error('A keresési találatok modal elemei nem találhatók a DOM-ban.');
    }

    if (titleText) {
        const normalizedSearchText = String(searchText || '').trim();
        titleText.textContent = normalizedSearchText
            ? `Keresési találatok: "${normalizedSearchText}"`
            : 'Keresési találatok';
    }

    list.innerHTML = '';
    const normalizedPlayers = Array.isArray(players) ? players : [];

    if (!normalizedPlayers.length) {
        summary.textContent = 'A keresés nem adott találatot.';
        empty.classList.remove('d-none');
        list.classList.add('d-none');
    } else {
        summary.textContent = `${normalizedPlayers.length} találat a keresésre.`;
        empty.classList.add('d-none');
        list.classList.remove('d-none');
        normalizedPlayers.forEach((player) => {
            list.appendChild(createSearchResultListItem(player));
        });
    }

    const modalInstance = bootstrap.Modal.getOrCreateInstance(modal);
    modalInstance.show();
    validatePlayerSearchElements(getModalPlayerSearchElements());
    lucide.createIcons();
}

function bindSearchResultsModalEvents() {
    const { modal, list } = getSearchResultsModalElements();
    const { input: modalInput } = getModalPlayerSearchElements();
    if (!modal || !modalInput || !list) {
        throw new Error('A keresési modal eseménykezelő elemei nem találhatók.');
    }

    modal.addEventListener('shown.bs.modal', () => {
        modalInput.focus();
        modalInput.select();
    });

    modal.addEventListener('hide.bs.modal', () => {
        const activeElement = document.activeElement;
        if (activeElement && modal.contains(activeElement) && typeof activeElement.blur === 'function') {
            activeElement.blur();
        }
    });

    modal.addEventListener('hidden.bs.modal', () => {
        const { input: topInput, button: topButton } = getTopBarPlayerSearchElements();
        let focusTarget = null;

        if (topInput && !topInput.disabled) {
            focusTarget = topInput;
        } else if (topButton && !topButton.disabled) {
            focusTarget = topButton;
        } else if (document.body && typeof document.body.focus === 'function') {
            focusTarget = document.body;
        }

        if (focusTarget && typeof focusTarget.focus === 'function') {
            focusTarget.focus();
        }
    });

    list.addEventListener('click', (event) => {
        try {
            const actionButton = event.target.closest('button[data-action]');
            if (!actionButton) {
                return;
            }

            const userId = Number(actionButton.dataset.userId);
            const conversationId = Number(actionButton.dataset.conversationId || 0);
            const username = String(actionButton.dataset.username || '').trim();
            const action = actionButton.dataset.action;

            if (!userId && action !== 'pending-friend' && action !== 'accepted-friend' && action !== 'blocked-friend') {
                if (action === 'add-friend' || action === 'view-profile' || action === 'chat') {
                    throw new Error('Hiányzó userId a keresési találat akciónál.');
                }
            }

            if (action === 'add-friend') {
                runSafelyAsync('searchResultAddFriend', async () => {
                    try {
                        const response = await fetch('/api/friends/add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ targetUserId: userId })
                        });

                        const result = await parseJson(response);
                        if (!response.ok || !result.success) {
                            throw new Error(result.message || 'Nem sikerült a barát kérelem küldése.');
                        }

                        // Gomb frissítése pending státuszra
                        actionButton.dataset.action = 'pending-friend';
                        actionButton.className = 'btn btn-sm btn-outline-warning py-1 px-2';
                        actionButton.title = 'Barát kérelem: elküldve';
                        actionButton.innerHTML = '<i data-lucide="arrow-up-right" style="width: 16px; height: 16px;"></i>';
                        lucide.createIcons();

                        console.log('Barát kérelem elküldve:', { userId, username });
                    } catch (error) {
                        console.error('Barát kérelem hiba:', error);
                        throw error;
                    }
                });
            } else if (action === 'view-profile') {
                runSafelyAsync('searchResultViewProfile', async () => {
                    await openPlayerProfileModalByUserId(userId);
                });
            } else if (action === 'chat') {
                runSafelyAsync('searchResultOpenDirectChat', async () => {
                    try {
                        await openChatConversationFlow({
                            conversationId,
                            targetUserId: userId,
                            source: 'search-results',
                            username
                        });
                    } catch (error) {
                        setProfileChatFeedbackBySource('search-results', error.message || 'A chat megnyitása sikertelen.', 'error');
                        throw error;
                    }
                });
            } else if (action === 'pending-friend' || action === 'accepted-friend' || action === 'blocked-friend') {
                // Ezek az akciók nem interaktívak, vagy később implementálandók
            }
        } catch (error) {
            console.error('Keresési találat akció hiba:', error);
        }
    });
}

function setProfileChatFeedbackBySource(source, message, type = 'neutral') {
    const text = String(message || '').trim();
    const isSearchSource = source === 'search-results';
    const isFriendsSource = source === 'friends-list';

    if (isSearchSource) {
        const { feedback } = getModalPlayerSearchElements();
        if (feedback) {
            feedback.classList.remove('text-danger', 'text-success', 'text-secondary');
            feedback.textContent = text;

            if (text) {
                feedback.classList.add(type === 'error' ? 'text-danger' : (type === 'success' ? 'text-success' : 'text-secondary'));
            }
        }
    }

    if (isFriendsSource) {
        setFriendsFeedback(text, type === 'error' ? 'error' : (type === 'success' ? 'success' : 'neutral'));
    }
}

async function openChatConversationFlow({ conversationId = 0, targetUserId = 0, source = 'friends-list', username = '' } = {}) {
    if (!window.MattMesterChatModal) {
        throw new Error('A chat modal API nem érhető el.');
    }

    await window.MattMesterChatModal.init();

    const normalizedConversationId = Number(conversationId) || 0;
    const normalizedTargetUserId = Number(targetUserId) || 0;
    let successMessage = 'Beszélgetés megnyitva.';

    if (normalizedConversationId) {
        await window.MattMesterChatModal.openConversation(normalizedConversationId);
    } else if (!normalizedTargetUserId) {
        throw new Error('Hiányzik a cél felhasználó azonosító a chat nyitáshoz.');
    } else {
        await window.MattMesterChatModal.openDirectByUserId(normalizedTargetUserId);
        successMessage = username ? `Beszélgetés megnyitva: ${username}` : 'Beszélgetés megnyitva.';
    }

    setProfileChatFeedbackBySource(source, successMessage, 'success');
}

function getFriendsSectionElements() {
    return {
        list: document.getElementById('friendsList'),
        refreshButton: document.getElementById('refreshFriendsButton'),
        filterButtons: document.querySelectorAll('[data-friends-filter]'),
        feedback: document.getElementById('friendsFeedback')
    };
}

function setFriendsFeedback(message = '', type = 'neutral') {
    const { feedback } = getFriendsSectionElements();
    if (feedback) {
        const hasMessage = Boolean(message);
        feedback.classList.remove('d-none', 'is-success', 'is-error');
        feedback.textContent = message || '';

        if (!hasMessage) {
            feedback.classList.add('d-none');
        } else if (type === 'success') {
            feedback.classList.add('is-success');
        } else if (type === 'error') {
            feedback.classList.add('is-error');
        }
    }
}

function normalizeFriendFilter(filterValue) {
    const normalized = String(filterValue || FRIEND_FILTER_DEFAULT).trim().toLowerCase();
    return FRIEND_FILTER_VALUES.has(normalized) ? normalized : FRIEND_FILTER_DEFAULT;
}

function getRelationMeta(relationStatusInput) {
    const relationStatus = String(relationStatusInput || '').trim().toLowerCase();

    if (relationStatus === 'incoming_pending') {
        return {
            relationStatus,
            listStatus: 'pending',
            statusLabel: 'Függő kérés',
            statusClass: 'text-warning'
        };
    }

    if (relationStatus === 'blocked_by_me') {
        return {
            relationStatus,
            listStatus: 'blocked',
            statusLabel: 'Tiltott',
            statusClass: 'text-danger'
        };
    }

    if (relationStatus === 'blocked_by_them') {
        return {
            relationStatus,
            listStatus: 'blocked',
            statusLabel: 'Engem tiltott',
            statusClass: 'text-danger'
        };
    }

    if (relationStatus === 'blocked_mutual') {
        return {
            relationStatus,
            listStatus: 'blocked',
            statusLabel: 'Kölcsönös tiltás',
            statusClass: 'text-danger'
        };
    }

    return {
        relationStatus: 'friends',
        listStatus: 'friend',
        statusLabel: 'Már barát',
        statusClass: 'text-success'
    };
}

function createFriendActionButton(actionName, title, iconName, variantClass = 'btn-outline-gold') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-sm ${variantClass} py-1 px-2`;
    if (actionName === 'delete-friend') {
        button.classList.add('friend-action-delete');
    }
    button.dataset.friendAction = actionName;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = `<i data-lucide="${iconName}" style="width: 16px; height: 16px;"></i>`;
    return button;
}

function createFriendDropdownAction(actionName, label, iconName, variantClass = '') {
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = `dropdown-item d-flex align-items-center gap-2 ${variantClass}`.trim();
    actionButton.dataset.friendAction = actionName;
    actionButton.innerHTML = `<i data-lucide="${iconName}" style="width: 16px; height: 16px;"></i><span>${label}</span>`;
    return actionButton;
}

function getFriendActionConfigs(friend) {
    const actions = [];

    if (friend.canChat) {
        actions.push({ action: 'chat', title: 'Üzenet küldése', label: 'Üzenet küldése', icon: 'message-square', buttonClass: 'btn-outline-gold' });
    }

    if (friend.canDeleteFriend) {
        actions.push({ action: 'delete-friend', title: 'Barát törlése', label: 'Barát törlése', icon: 'user-x', buttonClass: 'btn-outline-danger', dropdownClass: 'text-danger' });
    }

    if (friend.canAccept) {
        actions.push({ action: 'accept', title: 'Barát kérelem elfogadása', label: 'Elfogadás', icon: 'check', buttonClass: 'btn-outline-success', dropdownClass: 'text-success' });
    }

    if (friend.canReject) {
        actions.push({ action: 'reject', title: 'Barát kérelem elutasítása', label: 'Elutasítás', icon: 'x', buttonClass: 'btn-outline-danger', dropdownClass: 'text-danger' });
    }

    if (friend.canBlock) {
        actions.push({ action: 'block', title: 'Felhasználó tiltása', label: 'Tiltás', icon: 'ban', buttonClass: 'btn-outline-danger', dropdownClass: 'text-danger' });
    }

    if (friend.canUnblock) {
        actions.push({ action: 'unblock', title: 'Tiltás visszavonása', label: 'Tiltás visszavonása', icon: 'shield-check', buttonClass: 'btn-outline-warning', dropdownClass: 'text-warning' });
    }

    if (friend.canView) {
        actions.push({ action: 'view', title: 'Profil megtekintése', label: 'Profil megtekintése', icon: 'eye', buttonClass: 'btn-outline-gold' });
    }

    return actions;
}

function createFriendListItem(friend) {
    const relationMeta = getRelationMeta(friend.relationStatus);
    const item = document.createElement('div');
    item.className = 'friend-item';
    item.setAttribute('role', 'listitem');
    item.dataset.userId = String(friend.userId || '');
    item.dataset.username = String(friend.username || '');
    item.dataset.conversationId = String(friend.conversationId || '');
    item.dataset.relationStatus = relationMeta.relationStatus;
    item.dataset.listStatus = relationMeta.listStatus;

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'position-relative flex-shrink-0';

    const avatar = document.createElement('img');
    avatar.className = 'friend-avatar rounded-circle';
    window.MattMesterProfileImage.applyProfileImagePresentation(avatar, {
        source: friend,
        alt: `${friend.username || 'Jatekos'} profilkepe`,
        size: 40
    });

    const statusDot = document.createElement('span');
    statusDot.className = 'friend-status offline';
    avatarWrap.appendChild(avatar);
    avatarWrap.appendChild(statusDot);

    const info = document.createElement('div');
    info.className = 'flex-grow-1 min-width-0';

    const username = document.createElement('h6');
    username.className = 'mb-0 text-white text-truncate';
    username.style.fontSize = '0.9rem';
    username.textContent = friend.username || 'Ismeretlen jatekos';

    const relation = document.createElement('small');
    relation.className = `${relationMeta.statusClass} d-block text-truncate`;
    relation.textContent = relationMeta.statusLabel;

    if (friend.isBlockedContext || friend.ownBlockActive || friend.oppositeBlockActive) {
        relation.dataset.blockState = friend.ownBlockActive && friend.oppositeBlockActive
            ? 'mutual'
            : friend.ownBlockActive
                ? 'own'
                : 'incoming';
    }

    info.appendChild(username);
    info.appendChild(relation);

    const actionConfigs = getFriendActionConfigs(friend);
    const actions = document.createElement('div');
    actions.className = 'friend-actions d-flex align-items-center gap-2 flex-shrink-0';

    const inlineActions = document.createElement('div');
    inlineActions.className = 'd-none d-md-flex flex-wrap justify-content-end gap-2';
    actionConfigs.forEach((actionConfig) => {
        inlineActions.appendChild(
            createFriendActionButton(
                actionConfig.action,
                actionConfig.title,
                actionConfig.icon,
                actionConfig.buttonClass
            )
        );
    });

    const dropdownWrapper = document.createElement('div');
    dropdownWrapper.className = 'dropdown d-md-none';

    const dropdownToggle = document.createElement('button');
    dropdownToggle.type = 'button';
    dropdownToggle.className = 'btn btn-sm btn-outline-gold dropdown-toggle';
    dropdownToggle.dataset.bsToggle = 'dropdown';
    dropdownToggle.setAttribute('aria-expanded', 'false');
    dropdownToggle.innerHTML = '<i data-lucide="ellipsis-vertical" style="width: 16px; height: 16px;"></i><span class="ms-1">Műveletek</span>';

    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'dropdown-menu dropdown-menu-end friend-actions-menu';
    actionConfigs.forEach((actionConfig) => {
        dropdownMenu.appendChild(
            createFriendDropdownAction(
                actionConfig.action,
                actionConfig.label,
                actionConfig.icon,
                actionConfig.dropdownClass
            )
        );
    });

    dropdownWrapper.appendChild(dropdownToggle);
    dropdownWrapper.appendChild(dropdownMenu);

    actions.appendChild(inlineActions);
    actions.appendChild(dropdownWrapper);

    item.appendChild(avatarWrap);
    item.appendChild(info);
    item.appendChild(actions);

    return item;
}

function setFriendListLoading(isLoading, label = 'Betöltés folyamatban...') {
    const { list, refreshButton, filterButtons } = getFriendsSectionElements();
    if (list) {
        friendsState.loading = Boolean(isLoading);
        if (refreshButton) {
            refreshButton.disabled = friendsState.loading;
        }

        filterButtons.forEach((button) => {
            button.disabled = friendsState.loading;
        });

        if (friendsState.loading) {
            list.innerHTML = `<div class="friend-list-empty">${label}</div>`;
        }
    }
}

function setFriendFilterButtonsState(activeFilter) {
    const { filterButtons } = getFriendsSectionElements();
    filterButtons.forEach((button) => {
        const isActive = button.dataset.friendsFilter === activeFilter;
        button.classList.toggle('is-active', isActive);
    });
}

function renderFriendsList(items = []) {
    const { list } = getFriendsSectionElements();
    if (list) {
        const hasItems = Array.isArray(items) && items.length > 0;
        list.innerHTML = '';

        if (!hasItems) {
            list.innerHTML = '<div class="friend-list-empty">Nincs megjeleníthető kapcsolat ebben a nézetben.</div>';
        } else {
            items.forEach((friend) => {
                list.appendChild(createFriendListItem(friend));
            });

            lucide.createIcons();
        }
    }
}

async function refreshFriendsList(filterValue = friendsState.activeFilter) {
    const { list } = getFriendsSectionElements();
    if (list) {
        const normalizedFilter = normalizeFriendFilter(filterValue);
        friendsState.activeFilter = normalizedFilter;
        setFriendFilterButtonsState(normalizedFilter);
        setFriendListLoading(true, 'Barátok frissítése...');

        try {
            const response = await fetch(`/api/friends/list?status=${encodeURIComponent(normalizedFilter)}`);
            const result = await parseJson(response);

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Nem sikerült a barát lista lekérése.');
            }

            friendsState.items = Array.isArray(result.data) ? result.data : [];
            renderFriendsList(friendsState.items);
            setFriendsFeedback(result.message || 'Barátok frissítve.', 'success');
        } catch (error) {
            friendsState.items = [];
            list.innerHTML = `<div class="friend-list-empty text-danger">${error.message || 'Sikertelen barát lista frissítés.'}</div>`;
            setFriendsFeedback(error.message || 'Sikertelen barát lista frissítés.', 'error');
        } finally {
            friendsState.loading = false;
            const { refreshButton, filterButtons } = getFriendsSectionElements();
            if (refreshButton) {
                refreshButton.disabled = false;
            }
            filterButtons.forEach((button) => {
                button.disabled = false;
            });
            setFriendFilterButtonsState(friendsState.activeFilter);
        }
    }
}

async function executeFriendAction(actionName, targetUserId) {
    if (!targetUserId) {
        throw new Error('Hiányzó cél felhasználó azonosító.');
    }

    if (actionName === 'accept') {
        return fetch('/api/friends/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId })
        });
    }

    if (actionName === 'reject') {
        return fetch('/api/friends/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId })
        });
    }

    if (actionName === 'block') {
        return fetch('/api/friends/block', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId })
        });
    }

    if (actionName === 'unblock') {
        return fetch(`/api/friends/unblock/${encodeURIComponent(targetUserId)}`, {
            method: 'DELETE'
        });
    }

    if (actionName === 'delete-friend') {
        return fetch(`/api/friends/${encodeURIComponent(targetUserId)}`, {
            method: 'DELETE'
        });
    }

    throw new Error('Ismeretlen friend akció.');
}

function bindFriendsSectionEvents() {
    const { list, refreshButton, filterButtons } = getFriendsSectionElements();
    if (list && refreshButton && filterButtons.length && !friendsState.bound) {
        filterButtons.forEach((button) => {
            button.addEventListener('click', () => {
                runSafelyAsync('friendsFilterClick', async () => {
                    const nextFilter = normalizeFriendFilter(button.dataset.friendsFilter);
                    await refreshFriendsList(nextFilter);
                });
            });
        });

        refreshButton.addEventListener('click', () => {
            runSafelyAsync('friendsRefreshClick', async () => {
                await refreshFriendsList(friendsState.activeFilter);
            });
        });

        list.addEventListener('click', (event) => {
            runSafelyAsync('friendsListActionClick', async () => {
                const actionButton = event.target.closest('button[data-friend-action]');
                if (actionButton && !friendsState.loading) {
                    const item = actionButton.closest('.friend-item');
                    const targetUserId = Number(item?.dataset.userId || 0);
                    const conversationId = Number(item?.dataset.conversationId || 0);
                    const username = String(item?.dataset.username || '');
                    const actionName = String(actionButton.dataset.friendAction || '').trim().toLowerCase();

                    if (!actionName || !targetUserId) {
                        throw new Error('Érvénytelen barát lista művelet.');
                    }

                    let actionHandled = false;
                    if (actionName === 'view') {
                        await openPlayerProfileModalByUserId(targetUserId);
                        actionHandled = true;
                    }

                    if (actionName === 'chat') {
                        try {
                            await openChatConversationFlow({
                                conversationId,
                                targetUserId,
                                source: 'friends-list',
                                username
                            });
                        } catch (error) {
                            setProfileChatFeedbackBySource('friends-list', error.message || 'A chat megnyitása sikertelen.', 'error');
                            throw error;
                        }
                        actionHandled = true;
                    }

                    if (!actionHandled) {
                        actionButton.disabled = true;
                        const response = await executeFriendAction(actionName, targetUserId);
                        const result = await parseJson(response);
                        if (!response.ok || !result.success) {
                            throw new Error(result.message || 'A friend művelet nem sikerült.');
                        }

                        setFriendsFeedback(result.message || 'A művelet sikeres volt.', 'success');
                        await refreshFriendsList(friendsState.activeFilter);
                        setFriendsFeedback(result.message || 'A művelet sikeres volt.', 'success');
                    }
                }
            });
        });

        setFriendFilterButtonsState(friendsState.activeFilter);
        friendsState.bound = true;
    }
}

async function handleLogout() {
    if (!logoutState.submitting) {
        const { confirmButton } = getLogoutElements();
        logoutState.submitting = true;
        if (confirmButton) {
            confirmButton.disabled = true;
            confirmButton.textContent = 'Kijelentkezés...';
        }

        try {
            const response = await fetch('/api/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await parseJson(response);

            if (!response.ok) {
                throw new Error(result.message || 'Sikertelen kijelentkezes.');
            }

            if (socket) {
                socket.disconnect();
                socket.connect();
            }

            window.location.reload();
        } catch (error) {
            console.error('Hiba a kijelentkezes soran:', error);
            logoutState.submitting = false;
            if (confirmButton) {
                confirmButton.disabled = false;
                confirmButton.textContent = 'Kijelentkezés';
            }
        }
    }
}

function getLogoutElements() {
    return {
        modal: document.getElementById('logoutModal'),
        confirmButton: document.getElementById('confirmLogoutButton')
    };
}

function bindLogoutButton() {
    const { modal, confirmButton } = getLogoutElements();
    if (!logoutState.bound && modal && confirmButton) {
        confirmButton.addEventListener('click', () => {
            runSafelyAsync('logoutConfirmClick', async () => {
                await handleLogout();
            });
        });

        modal.addEventListener('show.bs.modal', () => {
            runSafely('logoutModalShow', () => {
                logoutState.submitting = false;
                confirmButton.disabled = false;
                confirmButton.textContent = 'Kijelentkezés';
            });
        });

        modal.addEventListener('hidden.bs.modal', () => {
            runSafely('logoutModalHidden', () => {
                logoutState.submitting = false;
                confirmButton.disabled = false;
                confirmButton.textContent = 'Kijelentkezés';
            });
        });

        logoutState.bound = true;
    }
}

function getSecurityActivityElements() {
    return {
        tbody: document.getElementById('securityHistoryTableBody'),
        refreshButton: document.getElementById('refreshSecurityActivityButton'),
        filterButtons: Array.from(document.querySelectorAll('[data-security-filter]')),
        feedback: document.getElementById('securityActivityFeedback')
    };
}

function getLogoutAllDevicesElements() {
    return {
        modal: document.getElementById('logoutAllDevicesModal'),
        confirmButton: document.getElementById('confirmLogoutAllDevicesButton'),
        message: document.getElementById('logoutAllDevicesMessage')
    };
}

function setSecurityActivityFeedback(text, variant = 'info') {
    const { feedback } = getSecurityActivityElements();
    if (feedback) {
        feedback.classList.remove('d-none', 'is-success', 'is-error', 'is-info');
        if (text) {
            feedback.textContent = text;
            feedback.classList.add(`is-${variant}`);
        } else {
            feedback.textContent = '';
            feedback.classList.add('d-none');
        }
    }
}

function formatSecurityEventDate(value) {
    const date = new Date(value);
    let formatted = { relative: '-', absolute: '' };
    if (!Number.isNaN(date.getTime())) {
        const diffMs = Date.now() - date.getTime();
        const diffMinutes = Math.round(diffMs / 60000);
        const diffHours = Math.round(diffMs / 3600000);
        const diffDays = Math.round(diffMs / 86400000);

        let relative;
        if (diffMs < 45 * 1000) {
            relative = 'Épp most';
        } else if (diffMinutes < 60) {
            relative = `${diffMinutes} perce`;
        } else if (diffHours < 24) {
            relative = `${diffHours} órája`;
        } else if (diffDays < 7) {
            relative = `${diffDays} napja`;
        } else {
            relative = date.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' });
        }

        const absolute = date.toLocaleString('hu-HU', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });

        formatted = { relative, absolute };
    }
    return formatted;
}

const SECURITY_EVENT_LABELS = {
    login: { label: 'Bejelentkezés', icon: 'log-in', category: 'auth' },
    logout: { label: 'Kijelentkezés', icon: 'log-out', category: 'auth' },
    register: { label: 'Regisztráció', icon: 'user-plus', category: 'auth' },
    logout_all_devices: { label: 'Kijelentkezés minden eszközről', icon: 'shield-off', category: 'security' },
    profile_settings_update: { label: 'Profil beállítások módosítva', icon: 'user-cog', category: 'profile' },
    password_change: { label: 'Jelszó módosítva', icon: 'key-round', category: 'security' },
    profile_image_upload: { label: 'Profilkép feltöltve', icon: 'image-up', category: 'profile' },
    profile_image_remove: { label: 'Profilkép eltávolítva', icon: 'image-minus', category: 'profile' },
    profile_delete: { label: 'Profil törölve', icon: 'user-x', category: 'security' },
    login_failed: { label: 'Sikertelen bejelentkezés', icon: 'shield-alert', category: 'security' },
    current_password_verify_failed: { label: 'Hibás jelszó ellenőrzés', icon: 'shield-alert', category: 'security' },
    friend_request_sent: { label: 'Barát kérelem küldve', icon: 'user-plus', category: 'social' },
    friend_request_accepted: { label: 'Barát kérelem elfogadva', icon: 'user-check', category: 'social' },
    friend_request_rejected: { label: 'Barát kérelem elutasítva', icon: 'user-minus', category: 'social' },
    friend_blocked: { label: 'Felhasználó letiltva', icon: 'user-x', category: 'social' },
    friend_unblocked: { label: 'Letiltás feloldva', icon: 'user-check', category: 'social' },
    friend_removed: { label: 'Barát eltávolítva', icon: 'user-minus', category: 'social' }
};

function getSecurityEventDescriptor(item) {
    const descriptor = SECURITY_EVENT_LABELS[item.eventType] || {
        label: (item.message || item.eventType || 'Ismeretlen esemény'),
        icon: 'activity',
        category: item.eventCategory || 'security'
    };
    return descriptor;
}

function getSecurityStatusBadge(item) {
    const severity = String(item.severity || 'info').toLowerCase();
    let badge = { text: 'Info', className: 'security-badge security-badge-info' };

    if (item.success === false || severity === 'error' || severity === 'critical') {
        badge = { text: 'Sikertelen', className: 'security-badge security-badge-error' };
    } else if (severity === 'warning') {
        badge = { text: 'Figyelmeztetés', className: 'security-badge security-badge-warning' };
    } else if (item.eventType === 'login') {
        badge = { text: 'Sikeres', className: 'security-badge security-badge-success' };
    }
    return badge;
}

function shortenUserAgent(userAgent) {
    let result = 'Ismeretlen';
    if (userAgent) {
        const ua = String(userAgent);
        const browserMatches = [
            { regex: /Edg\//i, name: 'Edge' },
            { regex: /OPR\//i, name: 'Opera' },
            { regex: /Chrome\//i, name: 'Chrome' },
            { regex: /Firefox\//i, name: 'Firefox' },
            { regex: /Safari\//i, name: 'Safari' }
        ];
        let browser = 'Böngésző';
        for (const entry of browserMatches) {
            if (entry.regex.test(ua)) { browser = entry.name; break; }
        }
        let os = 'Ismeretlen OS';
        if (/Windows/i.test(ua)) os = 'Windows';
        else if (/Android/i.test(ua)) os = 'Android';
        else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS';
        else if (/Mac OS X/i.test(ua)) os = 'macOS';
        else if (/Linux/i.test(ua)) os = 'Linux';
        result = `${browser} · ${os}`;
    }
    return result;
}

function escapeSecurityHtml(value) {
    const safe = String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
    return safe;
}

function renderSecurityActivityTable() {
    const { tbody } = getSecurityActivityElements();
    if (tbody) {
        const filter = securityActivityState.activeFilter;
        const items = securityActivityState.items.filter((item) => {
            const descriptor = getSecurityEventDescriptor(item);
            return filter === 'all' || (item.eventCategory || descriptor.category) === filter;
        });

        if (!items.length) {
            tbody.innerHTML = `
                <tr class="security-empty-row">
                    <td colspan="5" class="text-center text-secondary py-4">Nincs megjeleníthető esemény a kiválasztott szűrőre.</td>
                </tr>
            `;
        } else {
            const rows = items.map((item) => {
                const descriptor = getSecurityEventDescriptor(item);
                const badge = getSecurityStatusBadge(item);
                const { relative, absolute } = formatSecurityEventDate(item.occurredAt);
                const ip = item.ipAddress || '—';
                const uaShort = shortenUserAgent(item.userAgent);
                const description = item.message ? escapeSecurityHtml(item.message) : '';

                return `
                    <tr class="security-row" data-event-type="${escapeSecurityHtml(item.eventType)}" data-category="${escapeSecurityHtml(item.eventCategory || descriptor.category)}">
                        <td>
                            <div class="security-date-cell">
                                <strong class="security-date-relative">${escapeSecurityHtml(relative)}</strong>
                                <small class="security-date-absolute">${escapeSecurityHtml(absolute)}</small>
                            </div>
                        </td>
                        <td>
                            <div class="security-event-cell">
                                <span class="security-event-icon"><i data-lucide="${escapeSecurityHtml(descriptor.icon)}"></i></span>
                                <div class="security-event-text">
                                    <strong>${escapeSecurityHtml(descriptor.label)}</strong>
                                    ${description ? `<small class="text-secondary d-block">${description}</small>` : ''}
                                </div>
                            </div>
                        </td>
                        <td class="security-ip-cell">${escapeSecurityHtml(ip)}</td>
                        <td class="security-ua-cell" title="${escapeSecurityHtml(item.userAgent || '')}">${escapeSecurityHtml(uaShort)}</td>
                        <td><span class="${badge.className}">${escapeSecurityHtml(badge.text)}</span></td>
                    </tr>
                `;
            }).join('');

            tbody.innerHTML = rows;
            if (window.lucide?.createIcons) {
                runSafely('securityLucideIcons', () => window.lucide.createIcons());
            }
        }
    }
}

function setSecurityFilterButtonsState(activeFilter) {
    const { filterButtons } = getSecurityActivityElements();
    filterButtons.forEach((btn) => {
        const filter = btn.dataset.securityFilter;
        btn.classList.toggle('is-active', filter === activeFilter);
    });
}

async function refreshSecurityActivity() {
    if (!securityActivityState.loading) {
        securityActivityState.loading = true;
        const { tbody, refreshButton } = getSecurityActivityElements();
        if (refreshButton) refreshButton.disabled = true;
        if (tbody && !securityActivityState.items.length) {
            tbody.innerHTML = `
                <tr class="security-empty-row">
                    <td colspan="5" class="text-center text-secondary py-4">Biztonsági napló betöltése...</td>
                </tr>
            `;
        }

        try {
            const response = await fetch('/api/security/activity?limit=150', {
                headers: { 'Accept': 'application/json' }
            });
            const result = await parseJson(response);
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Sikertelen biztonsági napló lekérés.');
            }
            securityActivityState.items = Array.isArray(result.data) ? result.data : [];
            renderSecurityActivityTable();
            setSecurityActivityFeedback('', 'info');
        } catch (error) {
            console.error('Security activity betöltési hiba:', error);
            if (tbody) {
                tbody.innerHTML = `
                    <tr class="security-empty-row">
                        <td colspan="5" class="text-center text-danger py-4">${escapeSecurityHtml(error.message || 'Hiba a biztonsági napló betöltésekor.')}</td>
                    </tr>
                `;
            }
            setSecurityActivityFeedback(error.message || 'Hiba a biztonsági napló betöltésekor.', 'error');
        } finally {
            securityActivityState.loading = false;
            if (refreshButton) refreshButton.disabled = false;
        }
    }
}

function bindSecurityActivityEvents() {
    if (!securityActivityState.bound) {
        const { refreshButton, filterButtons } = getSecurityActivityElements();

        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                runSafelyAsync('refreshSecurityActivityClick', async () => {
                    await refreshSecurityActivity();
                });
            });
        }

        filterButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                runSafely('securityFilterClick', () => {
                    const filter = btn.dataset.securityFilter;
                    if (SECURITY_FILTER_VALUES.has(filter) && filter !== securityActivityState.activeFilter) {
                        securityActivityState.activeFilter = filter;
                        setSecurityFilterButtonsState(filter);
                        renderSecurityActivityTable();
                    }
                });
            });
        });

        setSecurityFilterButtonsState(securityActivityState.activeFilter);
        securityActivityState.bound = true;
    }
}

function setLogoutAllDevicesMessage(text, variant = 'danger') {
    const { message } = getLogoutAllDevicesElements();
    if (message) {
        message.classList.remove('d-none', 'alert-danger', 'alert-success', 'alert-warning', 'alert-info');
        if (text) {
            message.textContent = text;
            message.classList.add(`alert-${variant}`);
        } else {
            message.textContent = '';
            message.classList.add('d-none');
        }
    }
}

async function handleLogoutAllDevices() {
    if (!logoutAllDevicesState.submitting) {
        const { confirmButton } = getLogoutAllDevicesElements();
        logoutAllDevicesState.submitting = true;
        if (confirmButton) {
            confirmButton.disabled = true;
            confirmButton.textContent = 'Kijelentkezés...';
        }
        setLogoutAllDevicesMessage('', 'info');

        try {
            const response = await fetch('/api/security/logout-all-devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await parseJson(response);
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Nem sikerült kijelentkeztetni minden eszközről.');
            }

            if (socket) {
                socket.disconnect();
            }

            setLogoutAllDevicesMessage(result.message || 'Sikeres kijelentkezés minden eszközről.', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 800);
        } catch (error) {
            console.error('Logout all devices hiba:', error);
            setLogoutAllDevicesMessage(error.message || 'Hiba a kijelentkezés során.', 'danger');
            logoutAllDevicesState.submitting = false;
            if (confirmButton) {
                confirmButton.disabled = false;
                confirmButton.textContent = 'Kijelentkezés minden eszközről';
            }
        }
    }
}

function bindLogoutAllDevicesButton() {
    const { modal, confirmButton } = getLogoutAllDevicesElements();
    if (!logoutAllDevicesState.bound && modal && confirmButton) {
        confirmButton.addEventListener('click', () => {
            runSafelyAsync('logoutAllDevicesConfirmClick', async () => {
                await handleLogoutAllDevices();
            });
        });

        modal.addEventListener('show.bs.modal', () => {
            runSafely('logoutAllDevicesModalShow', () => {
                logoutAllDevicesState.submitting = false;
                confirmButton.disabled = false;
                confirmButton.textContent = 'Kijelentkezés minden eszközről';
                setLogoutAllDevicesMessage('', 'info');
            });
        });

        logoutAllDevicesState.bound = true;
    }
}

function getTopBarPlayerSearchElements() {
    return {
        input: document.getElementById('playerSearchInput'),
        button: document.getElementById('playerSearchButton'),
        feedback: document.getElementById('playerSearchFeedback')
    };
}

function validatePlayerSearchElements(elements) {
    const { input, button, feedback } = elements || {};
    if (!input || !button || !feedback) {
        return false;
    }

    const value = (input.value || '').trim();
    const hasValue = value.length > 0;
    let errorMessage = '';

    if (hasValue && (value.length < 3 || value.length > 50)) {
        errorMessage = 'A keresett felhasználónévnek 3 és 50 karakter között kell lennie.';
    } else if (hasValue && !USERNAME_REGEX.test(value)) {
        errorMessage = 'A keresett felhasználónév formátuma érvénytelen.';
    }

    const isValid = hasValue && !errorMessage;
    button.disabled = !isValid;

    input.classList.remove('is-valid', 'is-invalid');
    feedback.classList.remove('text-danger', 'text-success');
    if (!hasValue) {
        input.removeAttribute('aria-invalid');
        feedback.textContent = '';
        input.title = 'Adj meg legalább 3 karakteres felhasználónevet a kereséshez.';
        button.title = 'Adj meg felhasználónevet a kereséshez.';
    } else if (errorMessage) {
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
        feedback.classList.add('text-danger');
        feedback.textContent = errorMessage;
        input.title = errorMessage;
        button.title = errorMessage;
    } else {
        input.classList.add('is-valid');
        input.removeAttribute('aria-invalid');
        feedback.classList.add('text-success');
        feedback.textContent = 'A felhasználónév formátuma megfelelő.';
        input.title = 'A formátum megfelelő, indítható a keresés.';
        button.title = 'Keresés';
    }

    return isValid;
}

function bindPlayerSearchValidation(source, getElements) {
    const elements = getElements();
    const { input, button } = elements;
    if (!input || !button) {
        throw new Error(`Hianyzik a kereso input vagy gomb (${source}).`);
    }

    const validate = () => {
        return validatePlayerSearchElements(elements);
    };

    input.addEventListener('input', () => {
        runSafely('playerSearchInput', () => {
            validate();
        });
    });
    input.addEventListener('blur', () => {
        runSafely('playerSearchBlur', () => {
            validate();
        });
    });

    button.addEventListener('click', () => {
        runSafely('playerSearchClick', () => {
            if (!button.disabled) {
                schedulePlayerSearch(source, 0);
            }
        });
    });

    input.addEventListener('keydown', (event) => {
        runSafely('playerSearchKeydown', () => {
            if (event.key === 'Enter') {
                event.preventDefault();
            }
        });
    });

    runSafely('playerSearchInitialValidate', () => {
        validate();
    });
}

function bindTopBarPlayerSearchValidation() {
    bindPlayerSearchValidation('topbar', getTopBarPlayerSearchElements);
}

function bindModalPlayerSearchValidation() {
    bindPlayerSearchValidation('modal', getModalPlayerSearchElements);
}

function getProfileImageStatusMeta(statusInput) {
    const normalizedStatus = String(statusInput || '').trim().toLowerCase() || 'approved';
    let meta = {
        normalizedStatus: 'approved',
        textClass: 'text-success',
        label: 'Jóváhagyott',
        helpText: ''
    };

    if (normalizedStatus === 'pending') {
        meta = {
            normalizedStatus,
            textClass: 'text-warning',
            label: 'Függő (elbírálásra vár)',
            helpText: 'Csak te látod ezt a képet. Mások az alapértelmezett képet látják jóváhagyásig.'
        };
    } else if (normalizedStatus === 'rejected') {
        meta = {
            normalizedStatus,
            textClass: 'text-danger',
            label: 'Elutasított',
            helpText: 'A kép elutasításra került, a publikus profilkép visszaállt az alapértelmezettre.'
        };
    } else if (normalizedStatus === 'default') {
        meta = {
            normalizedStatus,
            textClass: 'text-info',
            label: 'Alapértelmezett',
            helpText: ''
        };
    }

    return meta;
}

function applyProfileImagePresentation(user) {
    const username = user?.username || 'Felhasznalo';
    const statusMeta = getProfileImageStatusMeta(user?.profile_image_status);

    const avatars = [
        document.getElementById('profileAvatarDashboard'),
        document.getElementById('profileAvatarSettings')
    ].filter(Boolean);

    let viewModel = null;
    avatars.forEach((avatarElement) => {
        const applied = window.MattMesterProfileImage.applyProfileImagePresentation(avatarElement, {
            source: user,
            alt: `${username} profilkepe`
        });
        if (applied) {
            viewModel = applied;
        }
    });

    if (!viewModel) {
        viewModel = window.MattMesterProfileImage.buildProfileImageViewModel(user);
    }

    const statusElements = [
        document.getElementById('profileImageHeaderStatus'),
        document.getElementById('profileImageSettingsStatus')
    ].filter(Boolean);

    statusElements.forEach((statusElement) => {
        statusElement.classList.remove('text-secondary', 'text-success', 'text-warning', 'text-danger', 'text-info');
        statusElement.classList.add(statusMeta.textClass);
        const baseText = `Profilkép státusz: ${statusMeta.label}`;
        statusElement.textContent = statusMeta.helpText
            ? `${baseText} — ${statusMeta.helpText}`
            : baseText;
    });

    const removeButton = document.getElementById('removeAvatarButton');
    if (removeButton) {
        removeButton.disabled = viewModel.isDefault;
        removeButton.title = viewModel.isDefault ? 'Nem lehet eltávolítani az alapértelmezett képet' : 'Profilkép eltávolítása';
    }
}

function showStats(sessionInfo) {
    try {
        const user = sessionInfo?.user || sessionInfo?.data?.user || null;
        if (!user) {
            throw new Error('Nincs bejelentkezett felhasznalo a statok megjelenitesehez.');
        }

        const stats = user.stats || sessionInfo?.stats || {
            wins: user.wins,
            losses: user.losses,
            draws: user.draws
        };
        const username = user.username || 'Ismeretlen jatekos';
        const email = user.email || '';
        const role = user.role || 'player';
        const roleText = role.charAt(0).toUpperCase() + role.slice(1);

        const toNumber = (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };

        const wins = toNumber(stats.wins);
        const losses = toNumber(stats.losses);
        const draws = toNumber(stats.draws);
        const gamesPlayed = wins + losses + draws;
        const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

        const formatNumber = (value) => toNumber(value).toLocaleString('hu-HU');
        const rankClasses = ['rank-beginner', 'rank-intermediate', 'rank-advanced', 'rank-expert', 'rank-master', 'rank-grandmaster'];
        const roleBadgeClasses = ['admin', 'badge-custom', 'badge-admin', 'badge-player'];
        const statBadgeClasses = ['badge-custom', 'badge-win', 'badge-loss', 'badge-draw', 'badge-ongoing'];

        const profileName = document.querySelector('.profile-header h1.h3');
        if (profileName) {
            profileName.textContent = username;
        }

        const profileEmail = document.querySelector('.profile-header p.text-secondary');
        if (profileEmail) {
            profileEmail.textContent = email;
        }

        const roleBadge = document.querySelector('.profile-header .role-badge');
        if (roleBadge) {
            roleBadge.textContent = roleText;
            roleBadge.classList.remove(...roleBadgeClasses);
            if (role === 'admin') {
                roleBadge.classList.add('admin', 'badge-custom', 'badge-admin');
            } else {
                roleBadge.classList.add('badge-custom', 'badge-player');
            }
        }

        applyProfileImagePresentation(user);

        const eloNumbers = document.querySelectorAll('.elo-display .elo-number');
        const eloRanks = document.querySelectorAll('.elo-display .elo-rank');
        const eloValues = [user.elo, user.elo_MM, user.elo_bullet];

        if (eloNumbers[0]) {
            eloNumbers[0].textContent = formatNumber(user.elo);
        }
        if (eloNumbers[1]) {
            eloNumbers[1].textContent = formatNumber(user.elo_MM);
        }
        if (eloNumbers[2]) {
            eloNumbers[2].textContent = formatNumber(user.elo_bullet);
        }

        eloValues.forEach((eloValue, index) => {
            const rankElement = eloRanks[index];
            if (rankElement) {
                const rank = getRankForEloValue(toNumber(eloValue));
                rankElement.classList.remove(...rankClasses);
                rankElement.classList.add(rank.className);
                rankElement.textContent = rank.label;
            }
        });

        const statValues = document.querySelectorAll('.stat-card .stat-value');
        const statLabels = document.querySelectorAll('.stat-card .stat-label');
        if (statValues[0]) {
            statValues[0].textContent = formatNumber(wins);
        }
        if (statValues[1]) {
            statValues[1].textContent = formatNumber(losses);
        }
        if (statValues[2]) {
            statValues[2].textContent = formatNumber(draws);
        }
        if (statValues[3]) {
            statValues[3].textContent = `${winRate}%`;
        }

        if (statLabels[0]) {
            statLabels[0].classList.remove(...statBadgeClasses);
            statLabels[0].classList.add('badge-custom', 'badge-win');
        }
        if (statLabels[1]) {
            statLabels[1].classList.remove(...statBadgeClasses);
            statLabels[1].classList.add('badge-custom', 'badge-loss');
        }
        if (statLabels[2]) {
            statLabels[2].classList.remove(...statBadgeClasses);
            statLabels[2].classList.add('badge-custom', 'badge-draw');
        }
        if (statLabels[3]) {
            statLabels[3].classList.remove(...statBadgeClasses);
            statLabels[3].classList.add('badge-custom', 'badge-ongoing');
        }
    } catch (error) {
        throw new Error(`showStats hiba: ${error.message}`);
    }
}

function handleProfileSettings(sessionInfo) {
    try {
        const user = sessionInfo?.user || sessionInfo?.data?.user || null;
        if (!user) {
            throw new Error('Nincs bejelentkezett felhasznalo a statok megjelenitesehez.');
        }
        const settingsUsername = document.getElementById('settingsUsername');
        const settingsEmail = document.getElementById('settingsEmail');
        const settingsNewPassword = document.getElementById('settingsNewPassword');
        const settingsConfirmPassword = document.getElementById('settingsConfirmPassword');
        applyProfileImagePresentation(user);

        if (settingsUsername) {
            settingsUsername.value = user.username;
        }
        if (settingsEmail) {
            settingsEmail.value = user.email;
        }
        if (settingsNewPassword) {
            settingsNewPassword.value = '';
        }
        if (settingsConfirmPassword) {
            settingsConfirmPassword.value = '';
        }

        profileSettingsState.initial = {
            username: (user.username || '').trim(),
            email: (user.email || '').trim()
        };

        if (!profileSettingsState.bound) {
            bindProfileSettingsEvents();
            profileSettingsState.bound = true;
        }

        validateProfileSettingsForm();
    } catch (error) {
        console.error('Hiba a profil beállítások kezelésekor:', error);
    }
}

function bindProfileSettingsEvents() {
    try {
        const elements = getProfileSettingsElements();
        if (!elements.form) {
            throw new Error('Hianyzik a profile settings form.');
        }

        const onInputChange = () => {
            runSafely('profileSettingsOnInputChange', () => {
                validateProfileSettingsForm();
            });
        };

        [elements.usernameInput, elements.emailInput, elements.newPasswordInput, elements.confirmPasswordInput]
            .filter(Boolean)
            .forEach((element) => {
                element.addEventListener('input', onInputChange);
                element.addEventListener('blur', onInputChange);
            });

        elements.form.addEventListener('submit', (event) => {
            runSafely('profileSettingsSubmit', () => {
                event.preventDefault();

                const validation = validateProfileSettingsForm();
                if (!validation.isValid) {
                    throw new Error('Ervenytelen profile settings form.');
                }

                profileSettingsState.pendingPayload = validation.payload;
                openProfileSettingsConfirmModal(validation.changedFieldLabels);
            });
        });

        if (elements.confirmSaveButton) {
            elements.confirmSaveButton.addEventListener('click', async () => {
                await runSafelyAsync('profileSettingsConfirmSave', async () => {
                    await submitProfileSettingsChanges();
                });
            });
        }

        if (elements.modalCurrentPasswordInput) {
            elements.modalCurrentPasswordInput.addEventListener('input', () => {
                runSafely('profileSettingsModalPasswordInput', () => {
                    verifyModalCurrentPassword();
                });
            });

            elements.modalCurrentPasswordInput.addEventListener('blur', () => {
                runSafely('profileSettingsModalPasswordBlur', () => {
                    verifyModalCurrentPassword();
                });
            });
        }

        if (elements.confirmModal) {
            elements.confirmModal.addEventListener('hidden.bs.modal', () => {
                runSafely('profileSettingsModalHidden', () => {
                    profileSettingsState.pendingPayload = null;
                    profileSettingsState.passwordVerified = false;
                    profileSettingsState.requiresPasswordCheck = false;
                    resetProfileSettingsConfirmState();
                });
            });
        }
    } catch (error) {
        console.error('bindProfileSettingsEvents hiba:', error);
    }
}

function getProfileSettingsElements() {
    return {
        form: document.getElementById('profileSettingsForm'),
        usernameInput: document.getElementById('settingsUsername'),
        emailInput: document.getElementById('settingsEmail'),
        newPasswordInput: document.getElementById('settingsNewPassword'),
        confirmPasswordInput: document.getElementById('settingsConfirmPassword'),
        usernameFeedback: document.getElementById('settingsUsernameFeedback'),
        emailFeedback: document.getElementById('settingsEmailFeedback'),
        newPasswordFeedback: document.getElementById('settingsNewPasswordFeedback'),
        confirmPasswordFeedback: document.getElementById('settingsConfirmPasswordFeedback'),
        formMessage: document.getElementById('profileSettingsMessage'),
        saveButton: document.getElementById('profileSettingsSaveButton'),
        confirmModal: document.getElementById('confirmProfileSettingsModal'),
        confirmSaveButton: document.getElementById('profileSettingsConfirmSaveButton'),
        confirmHint: document.getElementById('profileSettingsConfirmHint'),
        changesList: document.getElementById('profileSettingsChangesList'),
        modalMessage: document.getElementById('profileSettingsModalMessage'),
        modalPasswordBlock: document.getElementById('profileSettingsModalPasswordBlock'),
        modalCurrentPasswordInput: document.getElementById('modalCurrentPassword'),
        modalCurrentPasswordFeedback: document.getElementById('modalCurrentPasswordFeedback')
    };
}

function applyInputFeedback(inputElement, feedbackElement, state, message) {
    if (!inputElement || !feedbackElement) {
        return;
    }

    inputElement.classList.remove('is-valid', 'is-invalid');
    feedbackElement.classList.remove('text-secondary', 'text-success', 'text-danger');
    feedbackElement.textContent = message;

    if (state === 'error') {
        inputElement.classList.add('is-invalid');
        feedbackElement.classList.add('text-danger');
    } else if (state === 'success') {
        inputElement.classList.add('is-valid');
        feedbackElement.classList.add('text-success');
    } else {
        feedbackElement.classList.add('text-secondary');
    }
}

function validatePasswordByPolicy(passwordInput, {
    required = true,
    minLength = 8,
    enforceComplexity = true,
    allowBackslash = false
} = {}) {
    const password = String(passwordInput || '');
    let error = '';

    if (!password) {
        if (required) {
            error = 'A jelenlegi jelszó kötelező.';
        }
    } else if (!allowBackslash && password.includes('\\')) {
        error = 'A jelszó nem megengedett karaktert tartalmaz.';
    } else if (password.length < minLength) {
        error = `A jelszónak legalább ${minLength} karakter hosszú kell legyen.`;
    } else if (enforceComplexity && !PASSWORD_REGEX.test(password)) {
        error = 'A jelszónak tartalmaznia kell nagybetűt, kisbetűt és számot.';
    }

    return {
        isValid: !error,
        error
    };
}

function setProfileSettingsMessage(type, message) {
    const { formMessage, modalMessage } = getProfileSettingsElements();
    const messageTargets = [formMessage, modalMessage].filter(Boolean);
    if (!messageTargets.length) {
        return;
    }

    if (!message) {
        messageTargets.forEach((target) => {
            target.className = 'alert d-none mb-0';
            target.textContent = '';
        });
        return;
    }

    messageTargets.forEach((target) => {
        target.className = `alert alert-${type} mb-0`;
        target.textContent = message;
    });
}

function validateProfileSettingsForm() {
    const elements = getProfileSettingsElements();
    if (!elements.form || !profileSettingsState.initial) {
        return { isValid: false, payload: null, changedFieldLabels: [] };
    }

    const values = {
        username: (elements.usernameInput?.value || '').trim(),
        email: (elements.emailInput?.value || '').trim(),
        newPassword: elements.newPasswordInput?.value || '',
        confirmPassword: elements.confirmPasswordInput?.value || ''
    };

    const fieldErrors = {
        username: '',
        email: '',
        newPassword: '',
        confirmPassword: ''
    };

    const hasUsernameChanged = values.username !== profileSettingsState.initial.username;
    const hasEmailChanged = values.email !== profileSettingsState.initial.email;
    if (!values.username) {
        fieldErrors.username = 'A felhasználónév kötelező.';
    } else if (values.username.length < 3 || values.username.length > 50) {
        fieldErrors.username = 'A felhasználónévnek 3 és 50 karakter között kell lennie.';
    } else if (!USERNAME_REGEX.test(values.username)) {
        fieldErrors.username = 'A felhasználónév formátuma érvénytelen.';
    }

    if (!values.email) {
        fieldErrors.email = 'Az e-mail cím kötelező.';
    } else if (!EMAIL_REGEX.test(values.email)) {
        fieldErrors.email = 'Érvénytelen e-mail formátum.';
    }

    if (values.confirmPassword && !values.newPassword) {
        fieldErrors.newPassword = 'Adj meg új jelszót is.';
    }

    if (values.newPassword) {
        const passwordValidation = validatePasswordByPolicy(values.newPassword, {
            required: false,
            minLength: 8,
            enforceComplexity: true,
            allowBackslash: false
        });
        fieldErrors.newPassword = passwordValidation.error;
    }

    if (values.newPassword || values.confirmPassword) {
        if (!values.confirmPassword) {
            fieldErrors.confirmPassword = 'Erősítsd meg az új jelszót.';
        } else if (values.newPassword !== values.confirmPassword) {
            fieldErrors.confirmPassword = 'A két jelszó nem egyezik.';
        }
    }

    const hasFieldError = Object.values(fieldErrors).some(Boolean);
    const hasAnyChange = hasUsernameChanged || hasEmailChanged || values.newPassword.length > 0;
    const isValid = !hasFieldError && hasAnyChange;

    applyInputFeedback(
        elements.usernameInput,
        elements.usernameFeedback,
        fieldErrors.username ? 'error' : (hasUsernameChanged ? 'success' : 'neutral'),
        fieldErrors.username || (hasUsernameChanged ? 'A felhasználónév módosításra kerül.' : 'Nincs változás.')
    );

    applyInputFeedback(
        elements.emailInput,
        elements.emailFeedback,
        fieldErrors.email ? 'error' : (hasEmailChanged ? 'success' : 'neutral'),
        fieldErrors.email || (hasEmailChanged ? 'Az e-mail cím módosításra kerül.' : 'Nincs változás.')
    );

    applyInputFeedback(
        elements.newPasswordInput,
        elements.newPasswordFeedback,
        fieldErrors.newPassword ? 'error' : (values.newPassword ? 'success' : 'neutral'),
        fieldErrors.newPassword || (values.newPassword ? 'Az új jelszó formátuma megfelelő.' : 'A jelszó nem változik.')
    );

    applyInputFeedback(
        elements.confirmPasswordInput,
        elements.confirmPasswordFeedback,
        fieldErrors.confirmPassword ? 'error' : (values.confirmPassword ? 'success' : 'neutral'),
        fieldErrors.confirmPassword || (values.confirmPassword ? 'A jelszó megerősítése rendben.' : 'Megerősítés nem szükséges.')
    );

    if (elements.saveButton) {
        elements.saveButton.disabled = !isValid;
    }

    if (hasFieldError) {
        const firstError = Object.values(fieldErrors).find(Boolean);
        setProfileSettingsMessage('danger', firstError || 'Ellenőrizd a mezőket.');
    } else if (!hasAnyChange) {
        setProfileSettingsMessage('warning', 'Nincs változás. Módosíts legalább egy mezőt a mentéshez.');
    } else {
        setProfileSettingsMessage('success', 'Minden rendben, mentésre kész.');
    }

    const changedFieldLabels = [];
    if (hasUsernameChanged) {
        changedFieldLabels.push(`Felhasználónév: ${profileSettingsState.initial.username} -> ${values.username}`);
    }
    if (hasEmailChanged) {
        changedFieldLabels.push(`Email: ${profileSettingsState.initial.email} -> ${values.email}`);
    }
    if (values.newPassword) {
        changedFieldLabels.push('Jelszó frissítésre kerül.');
    }

    const payload = isValid ? {
        username: values.username,
        email: values.email,
        newPassword: values.newPassword
    } : null;

    return { isValid, payload, changedFieldLabels };
}

function resetProfileSettingsConfirmState() {
    const elements = getProfileSettingsElements();
    if (profileSettingsState.countdownTimer) {
        clearInterval(profileSettingsState.countdownTimer);
        profileSettingsState.countdownTimer = null;
    }

    profileSettingsState.countdownLeft = PROFILE_SETTINGS_CONFIRM_SECONDS;
    profileSettingsState.countdownFinished = false;

    if (elements.confirmSaveButton) {
        elements.confirmSaveButton.disabled = true;
        elements.confirmSaveButton.textContent = `Mentes (${PROFILE_SETTINGS_CONFIRM_SECONDS}s)`;
    }

    if (elements.confirmHint) {
        elements.confirmHint.textContent = `A mentés gomb ${PROFILE_SETTINGS_CONFIRM_SECONDS} másodperc múlva lesz aktív.`;
    }

    if (elements.modalCurrentPasswordInput) {
        elements.modalCurrentPasswordInput.value = '';
    }

    setModalCurrentPasswordFeedback('neutral', '');

}

function openProfileSettingsConfirmModal(changedFieldLabels) {
    const elements = getProfileSettingsElements();
    if (elements.confirmModal && elements.changesList) {
        profileSettingsState.requiresPasswordCheck = true;
        profileSettingsState.passwordVerified = !profileSettingsState.requiresPasswordCheck;

        elements.changesList.innerHTML = '';
        changedFieldLabels.forEach((label) => {
            const item = document.createElement('li');
            item.className = 'text-light mb-1';
            item.textContent = label;
            elements.changesList.appendChild(item);
        });

        resetProfileSettingsConfirmState();

        if (elements.modalPasswordBlock) {
            elements.modalPasswordBlock.classList.remove('d-none');
        }

        if (profileSettingsState.requiresPasswordCheck) {
            setModalCurrentPasswordFeedback('neutral', 'A mentéshez add meg a jelenlegi jelszavad.');
        }

        const modal = bootstrap.Modal.getOrCreateInstance(elements.confirmModal);
        modal.show();

        profileSettingsState.countdownTimer = setInterval(() => {
            profileSettingsState.countdownLeft -= 1;

            if (elements.confirmSaveButton) {
                if (profileSettingsState.countdownLeft > 0) {
                    elements.confirmSaveButton.textContent = `Mentes (${profileSettingsState.countdownLeft}s)`;
                } else {
                    profileSettingsState.countdownFinished = true;
                    elements.confirmSaveButton.textContent = 'Mentes';
                    updateModalSaveButtonState();
                }
            }

            if (elements.confirmHint) {
                elements.confirmHint.textContent = profileSettingsState.countdownLeft > 0
                    ? `A mentés gomb ${profileSettingsState.countdownLeft} másodperc múlva lesz aktív.`
                    : 'A mentés gomb most már aktív.';
            }

            if (profileSettingsState.countdownLeft <= 0) {
                clearInterval(profileSettingsState.countdownTimer);
                profileSettingsState.countdownTimer = null;
            }
        }, 1000);
    }
}

function setModalCurrentPasswordFeedback(state, message) {
    const { modalCurrentPasswordInput, modalCurrentPasswordFeedback } = getProfileSettingsElements();
    if (modalCurrentPasswordInput && modalCurrentPasswordFeedback) {
        modalCurrentPasswordInput.classList.remove('is-valid', 'is-invalid');
        modalCurrentPasswordFeedback.classList.remove('text-secondary', 'text-success', 'text-danger');
        modalCurrentPasswordFeedback.textContent = message;

        if (state === 'success') {
            modalCurrentPasswordInput.classList.add('is-valid');
            modalCurrentPasswordFeedback.classList.add('text-success');
        } else if (state === 'error') {
            modalCurrentPasswordInput.classList.add('is-invalid');
            modalCurrentPasswordFeedback.classList.add('text-danger');
        } else {
            modalCurrentPasswordFeedback.classList.add('text-secondary');
        }
    }
}

function updateModalSaveButtonState() {
    const { confirmSaveButton } = getProfileSettingsElements();
    if (confirmSaveButton) {
        const readyByPassword = profileSettingsState.requiresPasswordCheck ? profileSettingsState.passwordVerified : true;
        confirmSaveButton.disabled = !(profileSettingsState.countdownFinished && readyByPassword);
    }
}

function verifyModalCurrentPassword() {
    const elements = getProfileSettingsElements();
    if (profileSettingsState.requiresPasswordCheck && elements.modalCurrentPasswordInput) {
        const currentPassword = elements.modalCurrentPasswordInput.value;
        const passwordValidation = validatePasswordByPolicy(currentPassword, {
            required: true,
            minLength: 8,
            enforceComplexity: true,
            allowBackslash: false
        });

        if (!passwordValidation.isValid) {
            profileSettingsState.passwordVerified = false;
            setModalCurrentPasswordFeedback('error', passwordValidation.error);
        } else {
            profileSettingsState.passwordVerified = true;
            setModalCurrentPasswordFeedback('success', 'A jelszó formátuma megfelelő.');
        }

        updateModalSaveButtonState();
    }
}

async function submitProfileSettingsChanges() {
    const elements = getProfileSettingsElements();
    if (profileSettingsState.pendingPayload && elements.confirmSaveButton) {
        elements.confirmSaveButton.disabled = true;
        elements.confirmSaveButton.textContent = 'Mentés folyamatban...';

        try {
            const response = await fetch('/api/profile/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...profileSettingsState.pendingPayload,
                    currentPassword: elements.modalCurrentPasswordInput?.value || ''
                })
            });

            const result = await parseJson(response);
            if (!response.ok || !result.success) {
                handleEmailNotVerifiedCta(result);
                throw new Error(result.message || 'Nem sikerült menteni a profil beállításokat.');
            }

            setProfileSettingsMessage('success', result.message || 'A profil beállítások sikeresen frissültek.');
            if (result?.emailVerification?.required) {
                if (result?.emailVerification?.sent) {
                    setAccountStatusFeedback('warning', 'Az email címed megváltozott és most újra nem verifikált állapotban van. A megerősítő emailt elküldtük, kérjük erősítsd meg a címet.');
                } else {
                    setAccountStatusFeedback('danger', 'Az email címed megváltozott, de a verifikációs email küldése sikertelen volt. Kattints az újraküldés gombra az Account Status szekcióban.');
                    scrollToAccountStatusAndHighlightResend();
                }
            }
            profileSettingsState.pendingPayload = null;

            if (elements.newPasswordInput) {
                elements.newPasswordInput.value = '';
            }
            if (elements.confirmPasswordInput) {
                elements.confirmPasswordInput.value = '';
            }
            if (elements.confirmModal) {
                const modal = bootstrap.Modal.getOrCreateInstance(elements.confirmModal);
                modal.hide();
            }

            await syncSocketContextOrReconnect('profile-settings-save');
            await refreshAuthUi('profile-settings-save-success');
        } catch (error) {
            setProfileSettingsMessage('danger', error.message || 'Hiba történt a mentés során.');
            elements.confirmSaveButton.textContent = 'Mentes';
            updateModalSaveButtonState();
            throw new Error(error.message || 'Profil beállítás mentési hiba.');
        }
    }
}

function getProfileDeleteElements() {
    return {
        modal: document.getElementById('deleteProfileModal'),
        passwordInput: document.getElementById('deleteProfileConfirmInput'),
        passwordFeedback: document.getElementById('deleteProfileConfirmFeedback'),
        acknowledgeCheckbox: document.getElementById('deleteProfileAcknowledge'),
        confirmButton: document.getElementById('confirmDeleteProfileBtn'),
        timer: document.getElementById('deleteTimer'),
        message: document.getElementById('deleteProfileMessage')
    };
}

function setDeleteProfileMessage(type, message) {
    const { message: messageElement } = getProfileDeleteElements();
    if (messageElement) {
        if (!message) {
            messageElement.className = 'alert d-none mt-3 mb-0';
            messageElement.textContent = '';
        } else {
            messageElement.className = `alert alert-${type} mt-3 mb-0`;
            messageElement.textContent = message;
        }
    }
}

function setDeleteProfilePasswordFeedback(state, message) {
    const { passwordInput, passwordFeedback } = getProfileDeleteElements();
    if (passwordInput && passwordFeedback) {
        passwordInput.classList.remove('is-valid', 'is-invalid');
        passwordFeedback.classList.remove('text-secondary', 'text-success', 'text-danger');
        passwordFeedback.textContent = message;

        if (state === 'error') {
            passwordInput.classList.add('is-invalid');
            passwordFeedback.classList.add('text-danger');
        } else if (state === 'success') {
            passwordInput.classList.add('is-valid');
            passwordFeedback.classList.add('text-success');
        } else {
            passwordFeedback.classList.add('text-secondary');
        }
    }
}

function validateDeleteProfilePassword(password) {
    const passwordValidation = validatePasswordByPolicy(password, {
        required: true,
        minLength: 8,
        enforceComplexity: true,
        allowBackslash: false
    });

    return passwordValidation.error;
}

function updateDeleteProfileConfirmButtonState() {
    const elements = getProfileDeleteElements();
    if (elements.confirmButton && elements.passwordInput && elements.acknowledgeCheckbox) {
        const password = elements.passwordInput.value || '';
        const passwordError = validateDeleteProfilePassword(password);
        const acknowledged = elements.acknowledgeCheckbox.checked;

        if (!password) {
            setDeleteProfilePasswordFeedback('neutral', 'A törléshez add meg a jelenlegi jelszavad.');
        } else if (passwordError) {
            setDeleteProfilePasswordFeedback('error', passwordError);
        } else {
            setDeleteProfilePasswordFeedback('success', 'A jelszó formátuma megfelelő.');
        }

        const canSubmit = profileDeleteState.countdownFinished
            && !profileDeleteState.submitting
            && acknowledged
            && password.length > 0
            && !passwordError;

        elements.confirmButton.disabled = !canSubmit;
    }
}

function resetDeleteProfileModalState() {
    const elements = getProfileDeleteElements();

    if (profileDeleteState.countdownTimer) {
        clearInterval(profileDeleteState.countdownTimer);
        profileDeleteState.countdownTimer = null;
    }

    profileDeleteState.countdownLeft = PROFILE_DELETE_CONFIRM_SECONDS;
    profileDeleteState.countdownFinished = false;
    profileDeleteState.submitting = false;

    if (elements.passwordInput) {
        elements.passwordInput.value = '';
    }

    if (elements.acknowledgeCheckbox) {
        elements.acknowledgeCheckbox.checked = false;
    }

    if (elements.confirmButton) {
        elements.confirmButton.innerHTML = `Törlés (<span id="deleteTimer">${PROFILE_DELETE_CONFIRM_SECONDS}</span>s)`;
        elements.confirmButton.disabled = true;
    }

    setDeleteProfileMessage('danger', '');
    setDeleteProfilePasswordFeedback('neutral', 'A törléshez add meg a jelenlegi jelszavad.');
}

function startDeleteProfileCountdown() {
    const elements = getProfileDeleteElements();
    if (elements.confirmButton) {
        if (profileDeleteState.countdownTimer) {
            clearInterval(profileDeleteState.countdownTimer);
        }

        profileDeleteState.countdownTimer = setInterval(() => {
            profileDeleteState.countdownLeft -= 1;

            const { timer } = getProfileDeleteElements();
            if (timer) {
                timer.textContent = String(Math.max(profileDeleteState.countdownLeft, 0));
            }

            if (profileDeleteState.countdownLeft <= 0) {
                profileDeleteState.countdownFinished = true;
                clearInterval(profileDeleteState.countdownTimer);
                profileDeleteState.countdownTimer = null;
                elements.confirmButton.textContent = 'Törlés';
            }

            updateDeleteProfileConfirmButtonState();
        }, 1000);
    }
}

async function submitDeleteProfile() {
    const elements = getProfileDeleteElements();
    if (elements.passwordInput && elements.acknowledgeCheckbox && elements.confirmButton) {
        const currentPassword = elements.passwordInput.value || '';
        const passwordError = validateDeleteProfilePassword(currentPassword);
        const missingAcknowledge = !elements.acknowledgeCheckbox.checked;

        if (passwordError) {
            setDeleteProfilePasswordFeedback('error', passwordError);
            updateDeleteProfileConfirmButtonState();
        } else if (missingAcknowledge) {
            setDeleteProfileMessage('danger', 'Fogadd el, hogy a törlés nem visszavonható.');
            updateDeleteProfileConfirmButtonState();
        } else {
            profileDeleteState.submitting = true;
            elements.confirmButton.disabled = true;
            elements.confirmButton.textContent = 'Törlés folyamatban...';
            setDeleteProfileMessage('danger', '');

            try {
                const response = await fetch('/api/profile/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentPassword })
                });

                const result = await parseJson(response);
                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'A profil törlése nem sikerült.');
                }

                if (elements.modal) {
                    const modal = bootstrap.Modal.getOrCreateInstance(elements.modal);
                    modal.hide();
                }

                if (socket) {
                    socket.disconnect();
                }

                await refreshAuthUi('profile-delete-success');
                window.location.href = '/';
            } catch (error) {
                profileDeleteState.submitting = false;
                setDeleteProfileMessage('danger', error.message || 'Hiba történt a profil törlése közben.');
                updateDeleteProfileConfirmButtonState();
                throw new Error(error.message || 'Profil törlési hiba.');
            }
        }
    }
}

function bindProfileDeleteModalEvents() {
    try {
        const elements = getProfileDeleteElements();
        if (!elements.modal) {
            throw new Error('Hianyzik a delete profile modal.');
        }

        if (profileDeleteState.bound) {
            throw new Error('A delete profile esemenyek mar be vannak kotve.');
        }

        profileDeleteState.bound = true;

        if (elements.passwordInput) {
            elements.passwordInput.addEventListener('input', () => {
                runSafely('deleteProfilePasswordInput', () => {
                    setDeleteProfileMessage('danger', '');
                    updateDeleteProfileConfirmButtonState();
                });
            });

            elements.passwordInput.addEventListener('blur', () => {
                runSafely('deleteProfilePasswordBlur', () => {
                    updateDeleteProfileConfirmButtonState();
                });
            });
        }

        if (elements.acknowledgeCheckbox) {
            elements.acknowledgeCheckbox.addEventListener('change', () => {
                runSafely('deleteProfileAcknowledgeChange', () => {
                    setDeleteProfileMessage('danger', '');
                    updateDeleteProfileConfirmButtonState();
                });
            });
        }

        if (elements.confirmButton) {
            elements.confirmButton.addEventListener('click', async () => {
                await runSafelyAsync('deleteProfileConfirmClick', async () => {
                    await submitDeleteProfile();
                });
            });
        }

        elements.modal.addEventListener('show.bs.modal', () => {
            runSafely('deleteProfileModalShow', () => {
                resetDeleteProfileModalState();
                startDeleteProfileCountdown();
            });
        });

        elements.modal.addEventListener('hidden.bs.modal', () => {
            runSafely('deleteProfileModalHidden', () => {
                resetDeleteProfileModalState();
            });
        });
    } catch (error) {
        console.error('bindProfileDeleteModalEvents hiba:', error);
    }
}

function getProfileImageEditorElements() {
    return {
        uploadInput: document.getElementById('avatarUpload'),
        modal: document.getElementById('profileImageEditorModal'),
        canvas: document.getElementById('profileImageEditorCanvas'),
        previewCanvas: document.getElementById('profileImageEditorPreview'),
        zoomInput: document.getElementById('profileImageZoom'),
        rotateInput: document.getElementById('profileImageRotate'),
        resetButton: document.getElementById('resetProfileImageEditor'),
        saveButton: document.getElementById('saveProfileImageButton'),
        message: document.getElementById('profileImageEditorMessage')
    };
}

function setProfileImageEditorMessage(type, message) {
    const { message: messageElement } = getProfileImageEditorElements();
    if (messageElement) {
        if (!message) {
            messageElement.className = 'alert d-none mt-3 mb-0';
            messageElement.textContent = '';
        } else {
            messageElement.className = `alert alert-${type} mt-3 mb-0`;
            messageElement.textContent = message;
        }
    }
}

function resetProfileImageEditorState() {
    const elements = getProfileImageEditorElements();
    profileImageEditorState.scale = 1;
    profileImageEditorState.rotationDeg = 0;
    profileImageEditorState.offsetX = 0;
    profileImageEditorState.offsetY = 0;
    profileImageEditorState.dragging = false;
    profileImageEditorState.lastPointerX = 0;
    profileImageEditorState.lastPointerY = 0;
    profileImageEditorState.uploading = false;

    if (elements.zoomInput) {
        elements.zoomInput.value = '1';
    }

    if (elements.rotateInput) {
        elements.rotateInput.value = '0';
    }

    if (elements.saveButton) {
        elements.saveButton.disabled = !profileImageEditorState.image;
        elements.saveButton.textContent = 'Mentés';
    }

    setProfileImageEditorMessage('danger', '');
}

function revokeProfileImageObjectUrl() {
    if (profileImageEditorState.objectUrl) {
        URL.revokeObjectURL(profileImageEditorState.objectUrl);
        profileImageEditorState.objectUrl = null;
    }
}

function clearProfileImageEditorImage() {
    profileImageEditorState.image = null;
    revokeProfileImageObjectUrl();
    resetProfileImageEditorState();
    renderProfileImageEditor();
}

function getEditorCropRadius(canvas) {
    return Math.min(canvas.width, canvas.height) * 0.32;
}

function drawTransformedImage(ctx, image, canvasWidth, canvasHeight) {
    ctx.save();
    ctx.translate(canvasWidth / 2 + profileImageEditorState.offsetX, canvasHeight / 2 + profileImageEditorState.offsetY);
    ctx.rotate((profileImageEditorState.rotationDeg * Math.PI) / 180);
    ctx.scale(profileImageEditorState.scale, profileImageEditorState.scale);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
}

function renderProfileImageEditor() {
    const elements = getProfileImageEditorElements();
    if (!elements.canvas || !elements.previewCanvas) {
        return;
    }

    const canvas = elements.canvas;
    const previewCanvas = elements.previewCanvas;
    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(320, Math.round(rect.width || 640));
    const nextHeight = Math.max(260, Math.round(rect.height || 340));

    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const image = profileImageEditorState.image;
    if (!image) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.font = '15px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Válassz egy képet a szerkesztéshez.', canvas.width / 2, canvas.height / 2);
        return;
    }

    const cropRadius = getEditorCropRadius(canvas);
    drawTransformedImage(ctx, image, canvas.width, canvas.height);

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, cropRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, cropRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const bufferCanvas = profileImageEditorState.bufferCanvas;
    bufferCanvas.width = canvas.width;
    bufferCanvas.height = canvas.height;
    const bufferCtx = bufferCanvas.getContext('2d');
    if (!bufferCtx) {
        return;
    }
    bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
    drawTransformedImage(bufferCtx, image, bufferCanvas.width, bufferCanvas.height);

    const previewCtx = previewCanvas.getContext('2d');
    if (!previewCtx) {
        return;
    }

    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.save();
    previewCtx.beginPath();
    previewCtx.arc(previewCanvas.width / 2, previewCanvas.height / 2, previewCanvas.width / 2, 0, Math.PI * 2);
    previewCtx.clip();
    previewCtx.drawImage(
        bufferCanvas,
        canvas.width / 2 - cropRadius,
        canvas.height / 2 - cropRadius,
        cropRadius * 2,
        cropRadius * 2,
        0,
        0,
        previewCanvas.width,
        previewCanvas.height
    );
    previewCtx.restore();
}

function bindProfileImageEditorCanvasEvents() {
    const { canvas } = getProfileImageEditorElements();
    if (!canvas) {
        return;
    }

    canvas.addEventListener('pointerdown', (event) => {
        if (!profileImageEditorState.image || profileImageEditorState.uploading) {
            return;
        }

        profileImageEditorState.dragging = true;
        profileImageEditorState.lastPointerX = event.clientX;
        profileImageEditorState.lastPointerY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
        if (!profileImageEditorState.dragging || !profileImageEditorState.image || profileImageEditorState.uploading) {
            return;
        }

        const deltaX = event.clientX - profileImageEditorState.lastPointerX;
        const deltaY = event.clientY - profileImageEditorState.lastPointerY;

        profileImageEditorState.lastPointerX = event.clientX;
        profileImageEditorState.lastPointerY = event.clientY;
        profileImageEditorState.offsetX += deltaX;
        profileImageEditorState.offsetY += deltaY;
        renderProfileImageEditor();
    });

    const stopDragging = (event) => {
        if (profileImageEditorState.dragging) {
            profileImageEditorState.dragging = false;
            if (typeof event.pointerId === 'number') {
                canvas.releasePointerCapture(event.pointerId);
            }
        }
    };

    canvas.addEventListener('pointerup', stopDragging);
    canvas.addEventListener('pointercancel', stopDragging);
    canvas.addEventListener('pointerleave', stopDragging);
}

function validateProfileImageFile(file) {
    if (!file) {
        return 'A kép kiválasztása kötelező.';
    }

    if (!PROFILE_IMAGE_ALLOWED_MIME_TYPES.has(file.type)) {
        return 'Nem támogatott képformátum. Csak JPG, PNG és WEBP engedélyezett.';
    }

    if (file.size > PROFILE_IMAGE_MAX_SIZE_BYTES) {
        return 'A kép mérete legfeljebb 3 MB lehet.';
    }

    return '';
}

async function openProfileImageEditorFromFile(file) {
    const elements = getProfileImageEditorElements();
    if (!elements.modal) {
        return;
    }

    revokeProfileImageObjectUrl();
    profileImageEditorState.objectUrl = URL.createObjectURL(file);

    const image = new Image();
    image.src = profileImageEditorState.objectUrl;

    await new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('A kép betöltése sikertelen.'));
    });

    profileImageEditorState.image = image;
    resetProfileImageEditorState();

    const modal = bootstrap.Modal.getOrCreateInstance(elements.modal);
    modal.show();
    setTimeout(() => renderProfileImageEditor(), 0);
}

function getCroppedProfileImageBlob() {
    const { canvas } = getProfileImageEditorElements();
    const image = profileImageEditorState.image;
    if (!canvas || !image) {
        return Promise.reject(new Error('Nincs szerkesztésre kiválasztott kép.'));
    }

    const cropRadius = getEditorCropRadius(canvas);
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = 512;
    outputCanvas.height = 512;
    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) {
        return Promise.reject(new Error('Nem sikerült előkészíteni a kép mentését.'));
    }

    outputCtx.drawImage(
        profileImageEditorState.bufferCanvas,
        canvas.width / 2 - cropRadius,
        canvas.height / 2 - cropRadius,
        cropRadius * 2,
        cropRadius * 2,
        0,
        0,
        outputCanvas.width,
        outputCanvas.height
    );

    return new Promise((resolve, reject) => {
        outputCanvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('A kép mentése sikertelen.'));
                return;
            }

            resolve(blob);
        }, 'image/png');
    });
}

async function submitProfileImageUpload() {
    const elements = getProfileImageEditorElements();
    if (!elements.saveButton || profileImageEditorState.uploading) {
        return;
    }

    if (!profileImageEditorState.image) {
        setProfileImageEditorMessage('danger', 'Nincs szerkesztésre kiválasztott kép.');
        return;
    }

    profileImageEditorState.uploading = true;
    elements.saveButton.disabled = true;
    elements.saveButton.textContent = 'Feltöltés...';
    setProfileImageEditorMessage('danger', '');

    try {
        const imageBlob = await getCroppedProfileImageBlob();
        const formData = new FormData();
        formData.append('image', imageBlob, 'profile-image.png');

        const response = await fetch('/api/profile/upload-image', {
            method: 'POST',
            body: formData
        });

        const result = await parseJson(response);
        if (!response.ok || !result.success) {
            handleEmailNotVerifiedCta(result);
            throw new Error(result.message || 'A képfeltöltés nem sikerült.');
        }

        setProfileSettingsMessage('success', result.message || 'A profilkép feltöltve, függő státuszba került.');

        if (elements.modal) {
            const modal = bootstrap.Modal.getOrCreateInstance(elements.modal);
            modal.hide();
        }

        if (elements.uploadInput) {
            elements.uploadInput.value = '';
        }

        await syncSocketContextOrReconnect('profile-image-upload');
        await refreshAuthUi('profile-image-upload-success');
    } catch (error) {
        setProfileImageEditorMessage('danger', error.message || 'Hiba történt a képfeltöltés közben.');
        throw new Error(error.message || 'Profilkép feltöltési hiba.');
    } finally {
        profileImageEditorState.uploading = false;
        if (elements.saveButton) {
            elements.saveButton.disabled = !profileImageEditorState.image;
            elements.saveButton.textContent = 'Mentés';
        }
    }
}

function bindProfileImageUploadEvents() {
    try {
        const elements = getProfileImageEditorElements();
        if (!elements.uploadInput || !elements.modal) {
            throw new Error('Hianyzik a profile image upload input vagy modal.');
        }

        if (profileImageEditorState.bound) {
            throw new Error('A profile image upload esemenyek mar be vannak kotve.');
        }

        profileImageEditorState.bound = true;

        elements.uploadInput.addEventListener('change', async (event) => {
            await runSafelyAsync('profileImageUploadChange', async () => {
                try {
                    const file = event.target.files?.[0] || null;
                    const fileError = validateProfileImageFile(file);

                    if (fileError) {
                        throw new Error(fileError);
                    }

                    await openProfileImageEditorFromFile(file);
                } catch (error) {
                    setProfileSettingsMessage('danger', error.message || 'A kiválasztott kép nem nyitható meg.');
                    elements.uploadInput.value = '';
                    throw error;
                }
            });
        });

        if (elements.zoomInput) {
            elements.zoomInput.addEventListener('input', () => {
                runSafely('profileImageZoomInput', () => {
                    profileImageEditorState.scale = Number(elements.zoomInput.value) || 1;
                    renderProfileImageEditor();
                });
            });
        }

        if (elements.rotateInput) {
            elements.rotateInput.addEventListener('input', () => {
                runSafely('profileImageRotateInput', () => {
                    profileImageEditorState.rotationDeg = Number(elements.rotateInput.value) || 0;
                    renderProfileImageEditor();
                });
            });
        }

        if (elements.resetButton) {
            elements.resetButton.addEventListener('click', () => {
                runSafely('profileImageResetClick', () => {
                    resetProfileImageEditorState();
                    renderProfileImageEditor();
                });
            });
        }

        if (elements.saveButton) {
            elements.saveButton.addEventListener('click', async () => {
                await runSafelyAsync('profileImageSaveClick', async () => {
                    await submitProfileImageUpload();
                });
            });
        }

        bindProfileImageEditorCanvasEvents();

        elements.modal.addEventListener('shown.bs.modal', () => {
            runSafely('profileImageModalShown', () => {
                renderProfileImageEditor();
            });
        });

        elements.modal.addEventListener('hidden.bs.modal', () => {
            runSafely('profileImageModalHidden', () => {
                clearProfileImageEditorImage();
                if (elements.uploadInput) {
                    elements.uploadInput.value = '';
                }
            });
        });

        window.addEventListener('resize', () => {
            runSafely('profileImageWindowResize', () => {
                if (profileImageEditorState.image) {
                    renderProfileImageEditor();
                }
            });
        });
    } catch (error) {
        console.error('bindProfileImageUploadEvents hiba:', error);
    }
}

function getRemoveAvatarElements() {
    return {
        modal: document.getElementById('removeAvatarModal'),
        confirmButton: document.getElementById('confirmRemoveAvatarButton'),
        message: document.getElementById('removeAvatarMessage')
    };
}

function setRemoveAvatarMessage(type, message) {
    const { message: messageElement } = getRemoveAvatarElements();
    if (!messageElement) {
        return;
    }

    if (!message) {
        messageElement.className = 'alert d-none mb-0';
        messageElement.textContent = '';
        return;
    }

    messageElement.className = `alert alert-${type} mb-0`;
    messageElement.textContent = message;
}

async function submitRemoveAvatar() {
    const elements = getRemoveAvatarElements();
    if (!elements.confirmButton) {
        return;
    }

    elements.confirmButton.disabled = true;
    elements.confirmButton.textContent = 'Eltávolítás...';
    setRemoveAvatarMessage('danger', '');

    try {
        const response = await fetch('/api/profile/remove-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await parseJson(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'A profilkép eltávolítása nem sikerült.');
        }

        setProfileSettingsMessage('success', result.message || 'A profilkép visszaállítva az alapértelmezett képre.');

        if (elements.modal) {
            const modal = bootstrap.Modal.getOrCreateInstance(elements.modal);
            modal.hide();
        }

        await syncSocketContextOrReconnect('profile-image-remove');
        await refreshAuthUi('profile-image-remove-success');
    } catch (error) {
        setRemoveAvatarMessage('danger', error.message || 'Hiba történt a profilkép eltávolítása közben.');
        throw new Error(error.message || 'Profilkép eltávolítási hiba.');
    } finally {
        elements.confirmButton.disabled = false;
        elements.confirmButton.textContent = 'Eltávolítás';
    }
}

function bindRemoveAvatarEvents() {
    try {
        const elements = getRemoveAvatarElements();
        if (!elements.modal || !elements.confirmButton) {
            throw new Error('Hianyzik a remove avatar modal vagy confirm gomb.');
        }

        elements.confirmButton.addEventListener('click', async () => {
            await runSafelyAsync('removeAvatarConfirmClick', async () => {
                await submitRemoveAvatar();
            });
        });

        elements.modal.addEventListener('show.bs.modal', () => {
            runSafely('removeAvatarModalShow', () => {
                setRemoveAvatarMessage('danger', '');
            });
        });

        elements.modal.addEventListener('hidden.bs.modal', () => {
            runSafely('removeAvatarModalHidden', () => {
                setRemoveAvatarMessage('danger', '');
            });
        });
    } catch (error) {
        console.error('bindRemoveAvatarEvents hiba:', error);
    }
}

// Sidebar toggle: admin-stilus, minden meretben mukodik.
// - Desktop (>=992px): a 'collapsed' kapcsolja a sidebart, a main-content 'expanded'
//   modon kiveszi a margin-left-et, igy a sidebar a teljes vegehez csuszik be/ki.
// - Mobile (<992px): a 'show' kapcsolja az overlay-vel egyutt a sidebart, ahogy eddig.
const SIDEBAR_DESKTOP_BREAKPOINT_PX = 992;
const SIDEBAR_LOCAL_STORAGE_KEY = 'mattmester.profile.sidebarCollapsed';

function isDesktopViewportForSidebar() {
    return Boolean(window.matchMedia && window.matchMedia(`(min-width: ${SIDEBAR_DESKTOP_BREAKPOINT_PX}px)`).matches);
}

function getSidebarToggleButton() {
    return document.querySelector('.sidebar-toggle-btn');
}

function applySidebarCollapsedState(collapsed) {
    try {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.querySelector('.main-content');
        const toggleBtn = getSidebarToggleButton();
        if (sidebar) {
            sidebar.classList.toggle('collapsed', Boolean(collapsed));
        }
        if (mainContent) {
            mainContent.classList.toggle('expanded', Boolean(collapsed));
        }
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }
    } catch (error) {
        console.warn('applySidebarCollapsedState hiba:', error.message || error);
    }
}

function persistSidebarCollapsedState(collapsed) {
    try {
        window.localStorage?.setItem(SIDEBAR_LOCAL_STORAGE_KEY, collapsed ? '1' : '0');
    } catch (error) {
        // Privat mod / quota hiba: nem fatalis, csak nem perzisztal a preference.
    }
}

function readPersistedSidebarCollapsedState() {
    let collapsed = false;
    try {
        collapsed = window.localStorage?.getItem(SIDEBAR_LOCAL_STORAGE_KEY) === '1';
    } catch (error) {
        collapsed = false;
    }
    return collapsed;
}

function toggleSidebar() {
    try {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobileOverlay');
        if (!sidebar) {
            return;
        }

        if (isDesktopViewportForSidebar()) {
            const willBeCollapsed = !sidebar.classList.contains('collapsed');
            applySidebarCollapsedState(willBeCollapsed);
            persistSidebarCollapsedState(willBeCollapsed);
        } else {
            sidebar.classList.toggle('show');
            if (overlay) {
                overlay.classList.toggle('show');
            }
            const isShown = sidebar.classList.contains('show');
            const toggleBtn = getSidebarToggleButton();
            if (toggleBtn) {
                toggleBtn.setAttribute('aria-expanded', isShown ? 'true' : 'false');
            }
        }
    } catch (error) {
        console.error('toggleSidebar hiba:', error);
    }
}

function initSidebarCollapseFromPreference() {
    try {
        if (isDesktopViewportForSidebar()) {
            applySidebarCollapsedState(readPersistedSidebarCollapsedState());
        } else {
            // Mobile / tablet: alapallapot zarva, a 'show' osztaly hianya jelenti ezt.
            applySidebarCollapsedState(false);
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('mobileOverlay');
            if (sidebar) sidebar.classList.remove('show');
            if (overlay) overlay.classList.remove('show');
        }
    } catch (error) {
        console.warn('initSidebarCollapseFromPreference hiba:', error.message || error);
    }
}

// Reszponzivitas: ha a felhasznalo atmeretezi az ablakot, valtsuk a megfelelo
// megjelenitest, hogy ne maradjon ott egy desktop-stilusu collapsed state mobil
// nezetben (overlay vs margin-trigger eltero modon mukodik).
function bindSidebarResponsiveSync() {
    try {
        if (typeof window.matchMedia !== 'function') {
            return;
        }
        const mql = window.matchMedia(`(min-width: ${SIDEBAR_DESKTOP_BREAKPOINT_PX}px)`);
        const handler = () => {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('mobileOverlay');
            if (!sidebar) {
                return;
            }
            if (mql.matches) {
                // Desktopra valtas: zarjuk az overlay-t, allitsuk be a perzisztalt collapse-et.
                sidebar.classList.remove('show');
                if (overlay) overlay.classList.remove('show');
                applySidebarCollapsedState(readPersistedSidebarCollapsedState());
            } else {
                // Mobilra valtas: collapsed osztalyt nem hasznaljuk, alapertelmezett zart sidebar.
                applySidebarCollapsedState(false);
                sidebar.classList.remove('show');
                if (overlay) overlay.classList.remove('show');
            }
        };
        if (typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', handler);
        } else if (typeof mql.addListener === 'function') {
            mql.addListener(handler);
        }
    } catch (error) {
        console.warn('bindSidebarResponsiveSync hiba:', error.message || error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initSidebarCollapseFromPreference();
        bindSidebarResponsiveSync();
    }, { once: true });
} else {
    initSidebarCollapseFromPreference();
    bindSidebarResponsiveSync();
}

// Active state handling for navigation
const navLinks = document.querySelectorAll('.nav-link');
navLinks.forEach(link => {
    link.addEventListener('click', function () {
        navLinks.forEach(l => l.classList.remove('active'));
        this.classList.add('active');

        // Close sidebar on mobile after clicking
        if (window.innerWidth < 992) {
            toggleSidebar();
        }
    });
});

// Smooth scroll for nav links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// Intersection Observer for scroll animations
const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('.card, .stat-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
});

