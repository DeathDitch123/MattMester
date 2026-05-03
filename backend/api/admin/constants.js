// Admin panel kozos konstansok. ADMIN_PANEL.md alapjan.

// Token TTL: 15 perc sliding (utolso hasznalat ota).
const ADMIN_TOKEN_TTL_MS = 15 * 60 * 1000;

// Plain token byte hossz (32 byte = ~43 char base64url).
const ADMIN_TOKEN_RAW_BYTES = 32;

// Indoklas minimum hossz: minden mutalo muveletnel egysegesen 10 karakter
// (regen kritikus muveleteknel 30 volt — leszedve UX okokbol).
const REASON_MIN_LENGTH_NORMAL = 10;
const REASON_MIN_LENGTH_CRITICAL = 10;
const REASON_MAX_LENGTH = 1000;

// Admin elevate brute-force vedelem: 15 perc / 5 sikertelen.
const ADMIN_ELEVATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_ELEVATE_LIMIT_MAX = 5;

// Rate escalation alapertekek (F5).
const RATE_ESCALATION_DEFAULT_MULTIPLIER = 5.0;
const RATE_ESCALATION_DEFAULT_TTL_SEC = 15 * 60;
const RATE_ESCALATION_TRIGGER_FAILURE_COUNT = 5;
const RATE_ESCALATION_TRIGGER_WINDOW_SEC = 10 * 60;

// Audit retention: 18 honap.
const AUDIT_RETENTION_DAYS = 18 * 30;

// Replay batch limit (F4).
const REPLAY_BATCH_MAX_SIZE = 200;
const REPLAY_MAX_BATCHES_PER_CONNECTION = 5;
const REPLAY_WINDOW_HOURS = 24;

// Redaction allowlist: ezek a mezok SOSEM kerulhetnek be a before/after JSON-be.
const REDACTED_FIELDS = Object.freeze(new Set([
    'password',
    'password_hash',
    'email_verification_token_hash',
    'email_verification_token_expires',
    'reset_password_token',
    'reset_token_expires'
]));

// UI Client Timing Constants (shared with frontend)
const ADMIN_UI_TOKEN_TICK_INTERVAL_MS = 1000;  // Token countdown ticker interval
const ADMIN_UI_TOKEN_REFRESH_THRESHOLD_SEC = 60;  // Refresh token when <= 60 sec left
const ADMIN_UI_FOCUS_RESTORE_DELAY_MS = 250;  // Delay before restoring focus after modal close
const ADMIN_UI_ERROR_TOAST_DURATION_MS = 3000;  // How long error toasts appear

// Scheduler/Background Service Timing (milliseconds)
const ADMIN_SCHEDULER_STARTUP_DELAY_MS = 30 * 1000;  // Delay retention job startup on server boot
const ADMIN_SCHEDULER_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;  // Run cleanup every 24 hours

// Permission konstansok.
const ADMIN_PERMISSIONS = Object.freeze({
    USERS_VIEW: 'users.view',
    USERS_BAN: 'users.ban',
    USERS_UNBAN: 'users.unban',
    USERS_DELETE: 'users.delete',
    USERS_EDIT_PROFILE: 'users.edit',
    USERS_FORCE_LOGOUT: 'users.force_logout',
    USERS_RESET_PASSWORD: 'users.reset_password',
    USERS_EXPORT: 'users.export',

    PROFILE_IMAGE_REVIEW: 'profile_image.review',

    CHAT_VIEW_ANY: 'chat.view_any',
    CHAT_DELETE_MESSAGE: 'chat.delete',

    REPORTS_VIEW: 'reports.view',
    REPORTS_REVIEW: 'reports.review',

    NOTIFICATIONS_SEND: 'notifications.send',
    NOTIFICATIONS_BROADCAST: 'notifications.broadcast',

    AUDIT_VIEW: 'audit.view',
    AUDIT_EXPORT: 'audit.export',

    ADMIN_GRANT: 'admin.grant',
    ADMIN_REVOKE: 'admin.revoke',
    ADMIN_LIST: 'admin.list',

    ALERTS_DISMISS:     'alerts.dismiss',
    ALERTS_DISMISS_ALL: 'alerts.dismiss_all',
    ALERTS_RESTORE:     'alerts.restore',
    IP_BLOCK_CREATE:    'ip_blocks.create',
    IP_BLOCK_REMOVE:    'ip_blocks.remove',
    SECURITY_LOGINS_VIEW:   'security.logins.view',
    SECURITY_LOGINS_EXPORT: 'security.logins.export',

    // Játszmák
    GAMES_VIEW:        'games.view',
    GAMES_FORCE_END:   'games.force_end',

    // Képességek
    ABILITIES_VIEW:    'abilities.view',
    ABILITIES_EDIT:    'abilities.edit',

    // Közösségi kapcsolatok
    SOCIAL_VIEW:       'social.view',
    SOCIAL_UNBLOCK:    'social.unblock',

    // Tesztek
    TESTS_VIEW:        'tests.view',
    TESTS_RUN:         'tests.run',

    // Site settings
    SETTINGS_VIEW:     'settings.view',
    SETTINGS_EDIT:     'settings.edit'
});

const SUPER_ONLY_PERMISSIONS = Object.freeze(new Set([
    ADMIN_PERMISSIONS.ADMIN_GRANT,
    ADMIN_PERMISSIONS.ADMIN_REVOKE,
    ADMIN_PERMISSIONS.ADMIN_LIST
]));

const CRITICAL_ACTIONS = Object.freeze(new Set([
    ADMIN_PERMISSIONS.USERS_DELETE,
    // USERS_BAN: szandekosan NEM kritikus
    // (a ban-form inline hold-to-confirm + jelszo-ellenorzes elegendo vedelem).
    ADMIN_PERMISSIONS.NOTIFICATIONS_BROADCAST,
    ADMIN_PERMISSIONS.ADMIN_GRANT,
    ADMIN_PERMISSIONS.ADMIN_REVOKE,
    ADMIN_PERMISSIONS.IP_BLOCK_CREATE,
    // TESTS_RUN szandekosan NEM kritikus: read-only muvelet a kodbazisra,
    // semmit nem mutal, csak Jest-et futtat. Audit severity: 'info'.
    ADMIN_PERMISSIONS.SETTINGS_EDIT
]));

// Opcionalis reason action-ok: az indoklas mezo kihagyhato, vagy 1-9 char is OK.
// A requireReasonOnMutate middleware ennek megfeleloen lazitja a validaciot.
// Ezek a muveletek vagy mar massik vedelmi reteggel rendelkeznek (pl. password
// jelszo-megerositese a delete-nel), vagy elegge trivialis admin overridek
// amelyekre a 10-char audit log nem feltetlen ad hozzaadott erteket.
const OPTIONAL_REASON_ACTIONS = Object.freeze(new Set([
    ADMIN_PERMISSIONS.USERS_DELETE,        // password kotelezo, reason audit-trail
    ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE, // gyors moderacios akcio
    ADMIN_PERMISSIONS.GAMES_FORCE_END,     // ritkan hasznalt, audit log automata
    ADMIN_PERMISSIONS.ABILITIES_EDIT,      // config change, nem felhasznaloi adat
    ADMIN_PERMISSIONS.SOCIAL_UNBLOCK,      // admin override egy felhasznalo-paron
    ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW // reject akcional opcionalis (approve mar most is az)
]));

// Egyseges hibakodok az admin response-okhoz.
const ADMIN_ERROR_CODES = Object.freeze({
    NO_SESSION: 'ADMIN_NO_SESSION',
    NOT_ADMIN: 'ADMIN_NOT_ADMIN',
    NOT_SUPER: 'ADMIN_NOT_SUPER',
    TOKEN_MISSING: 'ADMIN_TOKEN_MISSING',
    TOKEN_INVALID: 'ADMIN_TOKEN_INVALID',
    TOKEN_EXPIRED: 'ADMIN_TOKEN_EXPIRED',
    REASON_REQUIRED: 'ADMIN_REASON_REQUIRED',
    REASON_TOO_SHORT: 'ADMIN_REASON_TOO_SHORT',
    REASON_TOO_LONG: 'ADMIN_REASON_TOO_LONG',
    PASSWORD_REQUIRED: 'ADMIN_PASSWORD_REQUIRED',
    PASSWORD_INVALID: 'ADMIN_PASSWORD_INVALID',
    LAST_SUPER_LOCK: 'ADMIN_LAST_SUPER_LOCK',
    INTERNAL: 'ADMIN_INTERNAL_ERROR'
});

module.exports = {
    ADMIN_TOKEN_TTL_MS,
    ADMIN_TOKEN_RAW_BYTES,
    REASON_MIN_LENGTH_NORMAL,
    REASON_MIN_LENGTH_CRITICAL,
    REASON_MAX_LENGTH,
    ADMIN_ELEVATE_LIMIT_WINDOW_MS,
    ADMIN_ELEVATE_LIMIT_MAX,
    RATE_ESCALATION_DEFAULT_MULTIPLIER,
    RATE_ESCALATION_DEFAULT_TTL_SEC,
    RATE_ESCALATION_TRIGGER_FAILURE_COUNT,
    RATE_ESCALATION_TRIGGER_WINDOW_SEC,
    AUDIT_RETENTION_DAYS,
    REPLAY_BATCH_MAX_SIZE,
    REPLAY_MAX_BATCHES_PER_CONNECTION,
    REPLAY_WINDOW_HOURS,
    REDACTED_FIELDS,
    ADMIN_PERMISSIONS,
    SUPER_ONLY_PERMISSIONS,
    CRITICAL_ACTIONS,
    OPTIONAL_REASON_ACTIONS,
    ADMIN_ERROR_CODES,
    ADMIN_UI_TOKEN_TICK_INTERVAL_MS,
    ADMIN_UI_TOKEN_REFRESH_THRESHOLD_SEC,
    ADMIN_UI_FOCUS_RESTORE_DELAY_MS,
    ADMIN_UI_ERROR_TOAST_DURATION_MS,
    ADMIN_SCHEDULER_STARTUP_DELAY_MS,
    ADMIN_SCHEDULER_RETENTION_INTERVAL_MS
};
