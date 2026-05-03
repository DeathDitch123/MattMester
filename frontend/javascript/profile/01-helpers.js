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
