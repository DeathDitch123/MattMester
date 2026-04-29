// MINDEN API AMI ITT MEG VAN HÍVVA ISADMIN() VALIDÁLÁSSAL KELL TÖRTÉNJEN A BACKENDEN,
// HOGY CSAK ADMINOK FÉRHESSENEK HOZZÁJUK
const requestController = window.createRequestController(300);

/* =============================================================
   1) Apró segédek
   ============================================================= */
function runSafely(label, fn) {
    try { return fn(); }
    catch (err) { console.error(`${label} hiba:`, err); }
}
async function runSafelyAsync(label, fn) {
    try { return await fn(); }
    catch (err) { console.error(`${label} hiba:`, err); }
}

const escapeHtml = (value) => {
    const div = document.createElement('div');
    div.textContent = String(value === null || value === undefined ? '' : value);
    return div.innerHTML;
};

const formatJSON = (obj) => {
    if (obj === null || obj === undefined) return '<span class="text-secondary">—</span>';
    return `<pre class="json-block">${escapeHtml(JSON.stringify(obj, null, 2))}</pre>`;
};

const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
};

const formatHM = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

// Egyseges relativ ido formazo - egy forras-igazsag a "Most / X mp / X perce" feliratokhoz
const formatRelative = (date) => {
    let result = '—';
    try {
        if (date) {
            const d = date instanceof Date ? date : new Date(date);
            const diffSec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
            if (diffSec < 5)         result = 'Épp most';
            else if (diffSec < 60)   result = `${diffSec} mp-e`;
            else if (diffSec < 3600) result = `${Math.floor(diffSec / 60)} perce`;
            else if (diffSec < 86400) result = `${Math.floor(diffSec / 3600)} órája`;
            else                     result = `${Math.floor(diffSec / 86400)} napja`;
        }
    } catch (err) {
        console.warn('formatRelative hiba:', err);
        result = '—';
    }
    return result;
};

// setText + value-flash: ha a szam valtozott, rovid villantast kap (zold no, sarga csokken)
const setTextWithFlash = (id, value) => {
    try {
        const el = document.getElementById(id);
        if (el) {
            const prevText = el.textContent;
            const nextText = String(value);
            if (prevText !== nextText) {
                const prevNum = Number(prevText);
                const nextNum = Number(nextText);
                el.textContent = nextText;
                el.classList.remove('value-flash-up', 'value-flash-down', 'value-flash-eq');
                if (Number.isFinite(prevNum) && Number.isFinite(nextNum)) {
                    if (nextNum > prevNum) el.classList.add('value-flash-up');
                    else if (nextNum < prevNum) el.classList.add('value-flash-down');
                    else el.classList.add('value-flash-eq');
                } else {
                    el.classList.add('value-flash-eq');
                }
                setTimeout(() => {
                    el.classList.remove('value-flash-up', 'value-flash-down', 'value-flash-eq');
                }, 850);
            }
        }
    } catch (err) {
        console.warn('setTextWithFlash hiba:', err);
    }
};

/* =============================================================
   2) HTML render helperek (h.*)
   ============================================================= */
const h = {
    header: ({ icon, title, subtitle, actions = [] }) => `
        <header class="section-header">
            <div class="section-header-text">
                <h2 class="section-title"><i class="bi ${icon} me-2 text-gold"></i>${title}</h2>
                ${subtitle ? `<p class="section-subtitle">${subtitle}</p>` : ''}
            </div>
            ${actions.length ? `<div class="section-header-actions">${actions.map(h.btn).join('')}</div>` : ''}
        </header>
    `,

    stats: (items) => {
        const xlCol = { 1: 12, 2: 6, 3: 4, 4: 3 }[items.length] || 3;
        const mdCol = items.length === 1 ? 12 : 6;
        const renderCard = (it) => {
            const tag = it.interactive ? 'button' : 'div';
            const interactiveAttrs = it.interactive
                ? ` type="button" onclick="showSection('${it.interactive}', event)" aria-label="${it.label} — ugrás a ${it.interactive} szekcióra"`
                : '';
            const stateClasses = [
                'stat-card',
                it.interactive ? 'stat-card-clickable' : '',
                it.empty ? 'stat-card-empty' : '',
                it.emblem === 'chess' ? 'stat-card-chess' : '',
                it.cardId ? '' : ''
            ].filter(Boolean).join(' ');
            const idAttr = it.cardId ? ` id="${it.cardId}"` : '';
            return `
                <div class="col-md-${mdCol} col-xl-${xlCol}">
                    <${tag} class="${stateClasses}"${idAttr}${interactiveAttrs}>
                        ${it.emblem === 'chess' ? '<span class="stat-card-chess-bg" aria-hidden="true"></span>' : ''}
                        <div class="stat-icon bg-${it.color || 'primary'}-soft"><i class="bi ${it.icon}"></i></div>
                        <div class="stat-value"${it.valueId ? ` id="${it.valueId}"` : ''}>${it.value}</div>
                        <div class="stat-label">${it.label}</div>
                        ${it.hint ? `<small class="stat-hint ${it.hintClass || 'text-muted'}">${it.hint}</small>` : ''}
                    </${tag}>
                </div>
            `;
        };
        return `<div class="row g-3 mb-4">${items.map(renderCard).join('')}</div>`;
    },

    card: ({ title, icon, headerExtra = '', body, classes = '', noBodyPadding = false }) => `
        <div class="content-card ${classes}">
            ${title ? `
                <div class="card-header">
                    <h5 class="card-title">${icon ? `<i class="bi ${icon} me-2 text-gold"></i>` : ''}${title}</h5>
                    ${headerExtra ? `<div class="card-header-extra">${headerExtra}</div>` : ''}
                </div>
            ` : ''}
            <div class="${noBodyPadding ? 'card-body p-0' : 'card-body'}">${body}</div>
        </div>
    `,

    table: ({ title, icon, headerExtra = '', headers, rows, footer = '', classes = '' }) => `
        <div class="content-card ${classes}">
            ${title || headerExtra ? `
                <div class="card-header">
                    ${title ? `<h5 class="card-title">${icon ? `<i class="bi ${icon} me-2 text-gold"></i>` : ''}${title}</h5>` : '<span></span>'}
                    ${headerExtra ? `<div class="card-header-extra">${headerExtra}</div>` : ''}
                </div>
            ` : ''}
            <div class="table-responsive">
                <table class="table">
                    <thead><tr>${headers.map(c => `<th>${c}</th>`).join('')}</tr></thead>
                    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
                </table>
            </div>
            ${footer}
        </div>
    `,

    btn: ({ label, icon, variant = 'outline-gold', size = '', onclick = '', attrs = '', classes = '' } = {}) => `
        <button type="button" class="btn btn-${variant}${size ? ` btn-${size}` : ''}${classes ? ` ${classes}` : ''}"
            ${onclick ? `onclick="${onclick}"` : ''} ${attrs}>
            ${icon ? `<i class="bi ${icon}${label ? ' me-1' : ''}"></i>` : ''}${label || ''}
        </button>
    `,

    iconBtn: ({ icon, variant = 'gold', title = '', onclick = '' }) => `
        <button type="button" class="btn btn-sm btn-outline-${variant} btn-icon"
            ${onclick ? `onclick="${onclick}"` : ''} ${title ? `title="${title}" aria-label="${title}"` : ''}>
            <i class="bi ${icon}"></i>
        </button>
    `,

    badge: (text, variant = 'secondary') => {
        const dark = ['warning', 'info'].includes(variant);
        return `<span class="badge bg-${variant}${dark ? ' text-dark' : ''}">${text}</span>`;
    },

    avatar: (userObj, size = 32) => {
        const viewModel = window.MattMesterProfileImage?.buildProfileImageViewModel?.(userObj) || {
            src: '/profile_pictures/default.png',
            username: typeof userObj === 'string' ? userObj : (userObj?.username || 'Felhasználó'),
            alt: 'Profilkép'
        };
        return `
            <img src="${viewModel.src}"
                class="rounded-circle" width="${size}" height="${size}" alt="${viewModel.alt}"
                data-profile-image-status="${viewModel.status || 'approved'}" style="object-fit:cover;">
        `;
    },

    user: ({ name, email, struck = false, profile_image = null, username = null } = {}) => `
        <div class="d-flex align-items-center gap-2">
            ${h.avatar({ username: username || name, profile_image }, 32)}
            <div class="lh-sm">
                <div class="fw-semibold text-white${struck ? ' text-decoration-line-through opacity-75' : ''}">${name}</div>
                ${email ? `<small class="text-secondary">${email}</small>` : ''}
            </div>
        </div>
    `,

    actions: (items) => `<div class="d-inline-flex gap-1">${items.map(h.iconBtn).join('')}</div>`,

    activity: ({ color = 'primary', icon, title, subtitle, time }) => `
        <div class="activity-item">
            <div class="activity-icon bg-${color} ${color === 'warning' ? 'text-dark' : 'text-white'}"><i class="bi ${icon}"></i></div>
            <div class="activity-body">
                <div class="fw-semibold text-white">${title}</div>
                ${subtitle ? `<small class="text-secondary d-block">${subtitle}</small>` : ''}
                ${time ? `<small class="text-muted">${time}</small>` : ''}
            </div>
        </div>
    `,

    field: ({ type = 'text', id, label, value = '', placeholder = '', options, col = 6, rows = 3 }) => {
        if (type === 'switch') {
            return `
                <div class="col-md-${col}">
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" id="${id}" ${value ? 'checked' : ''}>
                        <label class="form-check-label text-light" for="${id}">${label}</label>
                    </div>
                </div>
            `;
        }
        const labelHtml = `<label for="${id}" class="form-label">${label}</label>`;
        let input;
        if (type === 'select') {
            input = `<select id="${id}" class="form-select">${options.map(o => {
                const opt = typeof o === 'string' ? { value: o, label: o } : o;
                return `<option value="${escapeHtml(opt.value)}" ${opt.selected ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`;
            }).join('')}</select>`;
        } else if (type === 'textarea') {
            input = `<textarea id="${id}" class="form-control" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`;
        } else {
            input = `<input id="${id}" type="${type}" class="form-control" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">`;
        }
        return `<div class="col-md-${col}">${labelHtml}${input}</div>`;
    },

    form: ({ fields, submit = { label: 'Mentés', icon: 'bi-check2', variant: 'gold' }, cancel, extraButtons = [] }) => `
        <form class="row g-3" onsubmit="event.preventDefault();">
            ${fields.map(h.field).join('')}
            <div class="col-12 d-flex justify-content-end gap-2 mt-2">
                ${cancel ? h.btn({ label: cancel.label || 'Mégse', variant: 'outline-light' }) : ''}
                ${extraButtons.map(h.btn).join('')}
                ${h.btn(submit)}
            </div>
        </form>
    `,

    kv: (label, value, valueClass = 'text-white') => `
        <div class="col-md-6">
            <div class="kv">
                <span class="kv-label">${label}</span>
                <span class="kv-value ${valueClass}">${value}</span>
            </div>
        </div>
    `,

    tickChip: ({ icon, label, value, valueId, color = 'gold', nav = null, hint = '' }) => {
        const tag = nav ? 'button' : 'div';
        const interactiveAttrs = nav
            ? ` type="button" onclick="showSection('${nav}', event)" aria-label="${label} — ugrás a ${nav} szekcióra" title="${hint || `Részletek: ${label}`}"`
            : '';
        const cls = nav ? 'tick-chip tick-chip-clickable' : 'tick-chip';
        return `
            <${tag} class="${cls}"${interactiveAttrs}>
                <i class="bi ${icon} text-${color}"></i>
                <span class="tick-chip-label">${label}</span>
                <strong class="tick-chip-value"${valueId ? ` id="${valueId}"` : ''}>${value}</strong>
                ${nav ? '<i class="bi bi-arrow-right-short tick-chip-arrow" aria-hidden="true"></i>' : ''}
            </${tag}>
        `;
    }
};

/* =============================================================
   3) Severity / alert helperek
   ============================================================= */
const SEVERITY = {
    info:     { label: 'Info',     icon: 'bi-info-circle-fill',          cls: 'sev-info' },
    warning:  { label: 'Warning',  icon: 'bi-exclamation-triangle-fill', cls: 'sev-warning' },
    critical: { label: 'Critical', icon: 'bi-exclamation-octagon-fill',  cls: 'sev-critical' }
};
const ALERT_KIND = {
    unauthorized:       { label: 'Jogosulatlan próba',    icon: 'bi-shield-fill-x' },
    rate_escalated:     { label: 'Rate limit szigorítás', icon: 'bi-speedometer2' },
    token_invalid:      { label: 'Token hiba',            icon: 'bi-key-fill' },
    suspicious_pattern: { label: 'Gyanús minta',          icon: 'bi-bug-fill' }
};
const severityPill = (key) => {
    const s = SEVERITY[key] || SEVERITY.info;
    return `<span class="severity-pill ${s.cls}"><i class="bi ${s.icon}"></i>${s.label}</span>`;
};
const alertKindLabel = (key) => {
    const k = ALERT_KIND[key] || { label: key, icon: 'bi-question-circle' };
    return `<span class="alert-kind"><i class="bi ${k.icon}"></i>${k.label}</span>`;
};

const STATUS_BADGE = {
    active:   { label: 'Aktív',       cls: 'badge-status-active' },
    banned:   { label: 'Tiltott',     cls: 'badge-status-banned' },
    pending:  { label: 'Függő',       cls: 'badge-status-pending' },
    live:     { label: 'Folyamatban', cls: 'bg-success' },
    finished: { label: 'Befejezett',  cls: 'bg-secondary' }
};
const ROLE_BADGE = {
    admin:  { label: 'Admin',   cls: 'badge-role-admin' },
    player: { label: 'Játékos', cls: 'badge-role-player' }
};
const RISK_BADGE = {
    low:    { label: 'Alacsony', cls: 'bg-success' },
    medium: { label: 'Közepes',  cls: 'bg-warning text-dark' },
    high:   { label: 'Magas',    cls: 'bg-danger' }
};
const statusPill = (key) => `<span class="badge ${STATUS_BADGE[key].cls}">${STATUS_BADGE[key].label}</span>`;
const rolePill   = (key) => `<span class="badge ${ROLE_BADGE[key].cls}">${ROLE_BADGE[key].label}</span>`;
const riskPill   = (key) => `<span class="badge ${RISK_BADGE[key].cls}">${RISK_BADGE[key].label}</span>`;

/* =============================================================
   3.5) WS allapot - egy forras-igazsag a fejlec pill, feed badge,
        tick-band, kezi frissites gomb szamara.
   ============================================================= */
const WS_STATUS = Object.freeze({
    no_token:     { key: 'no_token',     label: 'Nincs admin token',         short: 'Nincs token',  variant: 'secondary', icon: 'bi-shield-slash',         dotClass: 'ws-dot-idle',       spin: false },
    connecting:   { key: 'connecting',   label: 'Csatlakozás…',              short: 'Csatlakozás…', variant: 'warning',   icon: 'bi-arrow-repeat',         dotClass: 'ws-dot-connecting', spin: true  },
    connected:    { key: 'connected',    label: 'Élő — WS /admin',           short: 'Élő',          variant: 'success',   icon: 'bi-broadcast-pin',        dotClass: 'ws-dot-live',       spin: false },
    disconnected: { key: 'disconnected', label: 'Megszakadt — újrapróbálom', short: 'Offline',      variant: 'danger',    icon: 'bi-plug',                 dotClass: 'ws-dot-down',       spin: false }
});
const WS_STATUS_VARIANTS = ['success', 'warning', 'danger', 'secondary'];

/* =============================================================
   4) Globális modul state (ADMIN_PANEL.md §2.6 — memóriában)
   ============================================================= */
const state = {
    // Auth
    currentUser: null,            // /api/sessionInfo eredménye
    adminToken: null,             // step-up admin token (memóriában, NEM localStorage)
    adminTokenExpiresAt: null,    // Date
    isSuperAdmin: false,
    elevated: false,              // sikeres elevate után true

    // WebSocket /admin namespace
    adminSocket: null,
    adminSocketConnected: false,
    wsStatus: 'no_token',         // WS_STATUS kulcs - egy forras-igazsag
    wsStaleTimerId: null,         // setTimeout id a stale figyeleshez
    wsStale: false,               // true ha 15 mp-nel regebbi a tick
    manualRefreshLockUntil: 0,    // kezi frissites debounce timestamp

    // Real-time data buffers (WS-ből töltődnek)
    liveStats: null,              // admin:stats:tick legutolsó payload
    liveStatsAt: null,            // utolsó tick időpontja
    liveAudit: [],                // admin:audit:created események (legújabb elöl)
    liveAlerts: [],               // admin:alert:* események (legújabb elöl)

    // Section navigation
    currentSectionId: null
};

const MAX_LIVE_BUFFER = 50;

/* =============================================================
   5) Demo adatok (fallback amíg WS nem küld semmit)
   ============================================================= */
const SAMPLE = {
    users: [
        { username: 'MagnusCarlsen',  name: 'Magnus Carlsen',  email: 'magnus@chess.hu', elo: 2847, role: 'admin',  status: 'active', last: '2 perce', joined: '2024-01-15', profile_image: '/profile_pictures/default.png' },
        { username: 'HikaruNakamura', name: 'Hikaru Nakamura', email: 'hikaru@chess.hu', elo: 2768, role: 'player', status: 'active', last: '5 órája', joined: '2024-02-20', profile_image: '/profile_pictures/default.png' },
        { username: 'AnishGiri',      name: 'Anish Giri',      email: 'anish@chess.hu',  elo: 0,    role: 'player', status: 'banned', last: '—',        joined: '2024-03-10', struck: true, profile_image: '/profile_pictures/default.png' }
    ],
    games: [
        { id: '#4932', white: 'Carlsen (2847)',  black: 'Nakamura (2768)', status: 'live',     winner: '—',          moves: 24, time: '10+0' },
        { id: '#4931', white: 'Firouzja (2785)', black: 'Ding (2812)',     status: 'finished', winner: 'Ding Liren', moves: 67, time: '3+2' },
        { id: '#4930', white: 'SakkMester99',    black: 'RookRider',       status: 'live',     winner: '—',          moves: 8,  time: '5+0' }
    ],
    logins: [
        { user: 'Magnus Carlsen',  ip: '192.168.1.10',   location: 'Budapest, HU', device: 'Chrome / Windows', deviceIcon: 'bi-browser-chrome', time: 'Most',     risk: 'low' },
        { user: 'Hikaru Nakamura', ip: '127.0.0.1',      location: 'localhost',    device: 'Firefox / Linux',  deviceIcon: 'bi-browser-firefox',time: '5 perce',  risk: 'low' },
        { user: 'SakkMester99',    ip: '192.168.1.42',   location: 'Budapest, HU', device: 'Safari / macOS',   deviceIcon: 'bi-browser-safari', time: '12 perce', risk: 'medium' }
    ]
};

const SAMPLE_AUDIT = [
    { eventId: 12345, occurredAt: new Date(Date.now() - 60000).toISOString(),
      actor: { username: 'admin' }, action: 'users.ban', severity: 'critical',
      target: { type: 'user', id: 47, label: 'spammer42' },
      reason: 'Reklámspam a játék-chat csatornán; harmadik figyelmeztetés.',
      diff: { before: { is_banned: false }, after: { is_banned: true } } },
    { eventId: 12344, occurredAt: new Date(Date.now() - 180000).toISOString(),
      actor: { username: 'admin' }, action: 'users.edit_profile', severity: 'info',
      target: { type: 'user', id: 12, label: 'SakkMester99' },
      reason: 'ELO korrekció helytelen pontozás miatt.',
      diff: { before: { elo: 1500 }, after: { elo: 1450 } } },
    { eventId: 12343, occurredAt: new Date(Date.now() - 360000).toISOString(),
      actor: { username: 'modBéla' }, action: 'profile_image.review', severity: 'info',
      target: { type: 'profile_image', id: 88, label: 'RookRider' },
      reason: 'Megfelelő profilkép, jóváhagyva.',
      diff: { before: { status: 'pending' }, after: { status: 'approved' } } }
];

const SAMPLE_ALERTS = [
    { alertId: 882, occurredAt: new Date(Date.now() - 90000).toISOString(),
      kind: 'unauthorized', severity: 'warning',
      ip: '203.0.113.55', userId: null, endpoint: 'GET /api/admin/users',
      detail: { reason: 'no_session' } },
    { alertId: 881, occurredAt: new Date(Date.now() - 240000).toISOString(),
      kind: 'token_invalid', severity: 'warning',
      ip: '127.0.0.1', userId: 12, endpoint: 'POST /api/admin/users/ban',
      detail: { reason: 'token_expired' } }
];

const SAMPLE_ADMINS = [
    { id: 1, name: 'Nagymester Admin', email: 'admin@mattmester.hu', isSuper: true,  joined: '2024-01-01', lastSeen: 'Most' },
    { id: 8, name: 'ModeratorBéla',    email: 'bela@mattmester.hu',  isSuper: false, joined: '2024-08-12', lastSeen: '15 perce' }
];

/* =============================================================
   6) Live data hozzáférési helperek
   ============================================================= */
function liveStatsOrFallback() {
    return state.liveStats || {
        online:    { totalUsers: 0, totalAdmins: 0, inGame: 0, inMatchmaking: 0, activeTabs: 0, totalTabs: 0, totalSockets: 0 },
        pending:   { profileImages: 0, friendRequests: 0 },
        last24h:   { logins: 0, registrations: 0, auditEntries: 0, criticalAuditEntries: 0, alerts: 0, newBans: 0 },
        rateLimit: { activeEscalations: 0 }
    };
}

const auditList  = () => (state.liveAudit.length  ? state.liveAudit  : SAMPLE_AUDIT);
const alertsList = () => (state.liveAlerts.length ? state.liveAlerts : SAMPLE_ALERTS);

// Egy forras-igazsag: a feed-ekhez visszaadjuk az adatokat ÉS a forrast (live / demo / empty).
// Igy a renderelo egyertelmuen tudja vizualisan elkuloniteni a mockot az elotol.
function liveDataSource(kind) {
    let result = { items: [], isLive: false, isEmpty: true, kind };
    try {
        const buffer = kind === 'audit' ? state.liveAudit : (kind === 'alert' ? state.liveAlerts : []);
        const sample = kind === 'audit' ? SAMPLE_AUDIT : (kind === 'alert' ? SAMPLE_ALERTS : []);
        if (buffer && buffer.length) {
            result = { items: buffer, isLive: true, isEmpty: false, kind };
        } else if (state.adminSocketConnected) {
            // Csatlakozva vagyunk, de meg nem erkezett esemeny -> ures allapot (NEM mock).
            result = { items: [], isLive: true, isEmpty: true, kind };
        } else {
            // Nincs WS - demo / fallback adat, vizualisan elkulonitve.
            result = { items: sample, isLive: false, isEmpty: false, kind };
        }
    } catch (err) {
        console.warn('liveDataSource hiba:', err);
        result = { items: [], isLive: false, isEmpty: true, kind };
    }
    return result;
}

const formatAuditTime = (iso) => {
    try { return formatHM(iso); } catch (_) { return iso || '—'; }
};

/* =============================================================
   7) Navigációs fa
   ============================================================= */
const NAV_TREE = [
    { id: 'dashboard', label: 'Vezérlőpult', icon: 'bi-grid-1x2-fill', leaf: true },

    {
        id: 'group-users', label: 'Felhasználók', icon: 'bi-people-fill', open: true,
        items: [
            { id: 'users',      label: 'Lista',                    icon: 'bi-list-ul' },
            { id: 'userDetail', label: 'Részletek és szerkesztés', icon: 'bi-person-vcard' },
            { id: 'userBan',    label: 'Tiltások',                 icon: 'bi-slash-circle' }
        ]
    },

    {
        id: 'group-moderation', label: 'Moderáció', icon: 'bi-shield-exclamation',
        items: [
            { id: 'chats',              label: 'Chat moderálás', icon: 'bi-chat-dots-fill' },
            { id: 'profileImageReview', label: 'Profilképek',    icon: 'bi-image' },
            { id: 'moderationReports',  label: 'Bejelentések',   icon: 'bi-flag-fill' }
        ]
    },

    {
        id: 'group-gameplay', label: 'Játékok', icon: 'bi-knight-fill',
        items: [
            { id: 'games',     label: 'Játszmák',   icon: 'bi-list-task' },
            { id: 'abilities', label: 'Képességek', icon: 'bi-magic' }
        ]
    },

    {
        id: 'group-logs', label: 'Naplók', icon: 'bi-journal-text',
        items: [
            { id: 'security', label: 'Bejelentkezések', icon: 'bi-shield-check' },
            { id: 'auditLog', label: 'Audit napló',     icon: 'bi-journal-check' },
            { id: 'alerts',   label: 'Riasztások',      icon: 'bi-exclamation-octagon-fill' }
        ]
    },

    { id: 'superAdmin', label: 'Super admin',           icon: 'bi-stars',         leaf: true },
    { id: 'friends',    label: 'Közösségi kapcsolatok', icon: 'bi-people',        leaf: true },
    { id: 'tests',      label: 'Tesztek',               icon: 'bi-clipboard2-check', leaf: true },
    { id: 'settings',   label: 'Beállítások',           icon: 'bi-gear-fill',     leaf: true }
];

const DEFAULT_SECTION = 'dashboard';

/* =============================================================
   8) Sidebar render
   ============================================================= */
function renderSidebar() {
    const target = document.getElementById('sidebarMenu');
    if (!target) return;

    const renderLeaf = (item, isTopLevel = false) => `
        <a href="#" class="nav-link${isTopLevel ? ' nav-link-top' : ''}" data-section="${item.id}"
            onclick="showSection('${item.id}', event); return false;">
            <i class="bi ${item.icon}"></i>
            <span>${item.label}</span>
            ${item.badge ? `<span class="badge bg-${item.badge.variant}${item.badge.variant === 'warning' ? ' text-dark' : ''} menu-badge">${item.badge.text}</span>` : ''}
        </a>
    `;

    const renderGroup = (group) => `
        <div class="menu-group">
            <button class="menu-group-toggle" type="button"
                data-bs-toggle="collapse" data-bs-target="#${group.id}"
                aria-expanded="${group.open ? 'true' : 'false'}" aria-controls="${group.id}">
                <i class="bi ${group.icon}"></i>
                <span>${group.label}</span>
                ${group.badge ? `<span class="badge bg-${group.badge.variant}${group.badge.variant === 'warning' ? ' text-dark' : ''} menu-badge">${group.badge.text}</span>` : ''}
                <i class="bi bi-chevron-down chevron"></i>
            </button>
            <div id="${group.id}" class="collapse${group.open ? ' show' : ''}">
                <div class="submenu">${group.items.map(it => renderLeaf(it, false)).join('')}</div>
            </div>
        </div>
    `;

    target.innerHTML =
        NAV_TREE.map(entry => entry.leaf ? renderLeaf(entry, true) : renderGroup(entry)).join('') +
        `<div class="menu-separator" aria-hidden="true"></div>` +
        `<a href="#" class="nav-link nav-link-top logout-link" onclick="logout(); return false;">
            <i class="bi bi-box-arrow-right"></i>
            <span>Kijelentkezés</span>
        </a>`;
}

/* =============================================================
   9) Szekció renderek
   ============================================================= */
const SECTIONS = {

    /* ---------- Vezérlőpult ---------- */
    dashboard: () => {
        const stats = liveStatsOrFallback();
        const last24 = stats.last24h || {};
        const auditSrc = liveDataSource('audit');
        const alertSrc = liveDataSource('alert');
        const auditItems = auditSrc.items.slice(0, 4);
        const alertItems = alertSrc.items.slice(0, 2);
        const wsStatus = WS_STATUS[state.wsStatus] || WS_STATUS.no_token;
        const inGameValue = stats.online?.inGame ?? 0;
        const inGameEmpty = inGameValue <= 0;
        const feedHasContent = auditItems.length > 0 || alertItems.length > 0;
        const feedIsLive = auditSrc.isLive && alertSrc.isLive;
        const feedDemoBadge = (!auditSrc.isLive && auditSrc.items.length) || (!alertSrc.isLive && alertSrc.items.length)
            ? `<span class="data-source-badge data-source-demo" title="Statikus minta — nincs élő WS adat"><i class="bi bi-flask"></i>Demo</span>`
            : `<span class="data-source-badge data-source-live" title="Élő WS forrás"><i class="bi bi-broadcast"></i>Élő</span>`;
        return `
            ${h.header({
                icon: 'bi-grid-1x2-fill', title: 'Vezérlőpult',
                subtitle: 'A projekt fő mutatói egy pillantásra',
                actions: [
                    {
                        label: `<span class="ws-pill-content">
                                    <span class="ws-pill-dot ${wsStatus.dotClass}" aria-hidden="true"></span>
                                    <span class="ws-pill-label" id="wsStatusLabel">${wsStatus.label}</span>
                                    <span class="ws-pill-time" id="wsStatusTime">${state.liveStatsAt ? 'tick: ' + formatRelative(state.liveStatsAt) : 'nincs tick'}</span>
                                </span>`,
                        variant: `outline-${wsStatus.variant}`,
                        size: 'sm',
                        attrs: `id="wsStatusBtn" data-ws-status="${wsStatus.key}" title="WS /admin kapcsolat állapota — kattintásra újracsatlakozás" aria-label="WebSocket kapcsolat állapota: ${wsStatus.label}"`,
                        icon: wsStatus.icon,
                        classes: `ws-status-pill ws-status-${wsStatus.key}${wsStatus.spin ? ' ws-status-spin' : ''}`,
                        onclick: 'reconnectAdminSocket()'
                    },
                    { label: 'Kézi frissítés', icon: 'bi-arrow-clockwise', size: 'sm',
                      attrs: 'id="manualRefreshBtn"', onclick: 'requestStatsTick()' }
                ]
            })}

            ${h.stats([
                { icon: 'bi-people-fill',  value: stats.online?.totalUsers ?? 0, valueId: 'mainOnlineTotal',
                  label: 'Online felhasználó', color: 'primary',
                  hint: `<span id="mainOnlineHint">${stats.online?.totalAdmins ?? 0} admin · ${stats.online?.activeTabs ?? stats.online?.totalTabs ?? 0} aktív tab</span>`,
                  hintClass: 'text-success', interactive: 'users', cardId: 'mainOnlineCard' },
                { icon: 'bi-trophy-fill',  value: inGameValue, valueId: 'mainInGame',
                  label: 'Aktív játszma', color: inGameEmpty ? 'secondary' : 'success',
                  hint: inGameEmpty
                        ? '<span class="text-muted"><i class="bi bi-pause-circle me-1"></i>Nincs élő játszma — kattints a játszmák listájához</span>'
                        : '<span class="live-indicator text-success"><span class="live-dot"></span>Élőben most</span>',
                  hintClass: inGameEmpty ? 'text-muted' : 'text-success',
                  interactive: 'games',
                  cardId: 'mainInGameCard',
                  emblem: 'chess', empty: inGameEmpty },
                { icon: 'bi-journal-check',value: last24.auditEntries ?? 0, valueId: 'mainAuditCount',
                  label: '24h audit bejegyzés', color: 'warning',
                  hint: `<span id="mainAuditCriticalHint">${last24.criticalAuditEntries ?? 0} kritikus művelet</span>`,
                  hintClass: 'text-warning', interactive: 'auditLog', cardId: 'mainAuditCard' },
                { icon: 'bi-exclamation-octagon-fill', value: last24.alerts ?? 0, valueId: 'mainAlertCount',
                  label: '24h riasztás', color: 'danger',
                  hint: `<span id="mainNewBansHint">${last24.newBans ?? 0} új tiltás</span>`,
                  hintClass: 'text-danger', interactive: 'alerts', cardId: 'mainAlertCard' }
            ])}

            <div class="tick-band mb-4" id="tickBand" data-ws-status="${wsStatus.key}">
                <div class="tick-band-header">
                    <span class="live-indicator ${state.adminSocketConnected ? 'text-success' : 'text-muted'}" id="tickBandIndicator">
                        <span class="live-dot"></span>Élő tick
                    </span>
                    <span class="tick-band-time">Frissítve: <span id="tickBandTime">${state.liveStatsAt ? formatRelative(state.liveStatsAt) : '—'}</span></span>
                </div>
                <div class="tick-band-body">
                    ${h.tickChip({ icon: 'bi-wifi',          label: 'Online',         valueId: 'tickOnline',         value: stats.online?.totalUsers ?? 0,    color: 'success', nav: 'users',              hint: 'Online felhasználók — ugrás a felhasználói listára' })}
                    ${h.tickChip({ icon: 'bi-window-stack',  label: 'Aktív tabok',    valueId: 'tickActiveTabs',     value: stats.online?.activeTabs ?? stats.online?.totalTabs ?? 0, color: 'primary', nav: 'users', hint: 'Nyitva tartott böngészőfülek — felhasználói lista' })}
                    ${h.tickChip({ icon: 'bi-shield-fill',   label: 'Adminok',        valueId: 'tickAdmins',         value: stats.online?.totalAdmins ?? 0,   color: 'gold',    nav: 'superAdmin',         hint: 'Online admin felhasználók — super admin nézet' })}
                    ${h.tickChip({ icon: 'bi-trophy-fill',   label: 'Játékban',       valueId: 'tickInGame',         value: stats.online?.inGame ?? 0,        color: inGameEmpty ? 'secondary' : 'success', nav: 'games', hint: 'Folyamatban lévő játszmák' })}
                    ${h.tickChip({ icon: 'bi-search',        label: 'Matchmakingben', valueId: 'tickMatchmaking',    value: stats.online?.inMatchmaking ?? 0, color: 'primary', nav: 'games',              hint: 'Matchmakingben várakozó játékosok' })}
                    ${h.tickChip({ icon: 'bi-image',         label: 'Pending kép',    valueId: 'tickPendingImages',  value: stats.pending?.profileImages ?? 0, color: 'warning', nav: 'profileImageReview', hint: 'Jóváhagyásra váró profilképek' })}
                    ${h.tickChip({ icon: 'bi-person-plus',   label: 'Pending barát',  valueId: 'tickPendingFriends', value: stats.pending?.friendRequests ?? 0, color: 'primary', nav: 'friends',            hint: 'Függőben lévő barátkérelmek' })}
                    ${h.tickChip({ icon: 'bi-speedometer2',  label: 'Aktív rate esc.',valueId: 'tickRateEsc',        value: stats.rateLimit?.activeEscalations ?? 0, color: 'secondary', nav: 'alerts',        hint: 'Rate limit szigorítások — riasztások' })}
                </div>
            </div>

            <div class="row g-4">
                <div class="col-xl-7">
                    ${h.card({
                        title: 'Aktivitás — utolsó 24 óra',
                        icon: 'bi-activity',
                        headerExtra: `<span class="card-subtle-hint">Összesített trend (5 perces bin)</span>` +
                                     h.btn({ label: 'Riport', size: 'sm', attrs: 'disabled title="Hamarosan elérhető"', classes: 'btn-soon' }),
                        body: '<div style="position:relative;height:300px;"><canvas id="activityChart"></canvas></div>',
                        classes: 'h-100 dashboard-equal-card'
                    })}
                </div>
                <div class="col-xl-5">
                    <div class="content-card h-100 live-feed-card dashboard-equal-card">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="bi bi-broadcast me-2 text-gold"></i>Élő admin tevékenység
                                <span class="card-subtle-hint d-block">Élő események — utolsó 25 db</span>
                            </h5>
                            <span class="ws-feed-badge ws-feed-${wsStatus.key}" id="wsStatusBadge" title="${wsStatus.label}">
                                <span class="ws-pill-dot ${wsStatus.dotClass}" aria-hidden="true"></span>
                                <span id="wsStatusBadgeLabel">${wsStatus.short}</span>
                            </span>
                        </div>
                        <div class="card-body p-0">
                            <div class="live-feed-meta">
                                ${feedDemoBadge}
                                <span class="live-feed-meta-count" id="liveFeedCount">${feedHasContent ? auditItems.length + alertItems.length : 0} esemény</span>
                            </div>
                            <ul class="live-feed-list ${!feedIsLive && feedHasContent ? 'live-feed-demo' : ''}" id="dashboardLiveFeed" data-feed-state="${feedHasContent ? (feedIsLive ? 'live' : 'demo') : (state.adminSocketConnected ? 'live-empty' : 'offline-empty')}">
                                ${feedHasContent
                                    ? auditItems.map(a => liveFeedRow('audit', a)).join('') + alertItems.map(a => liveFeedRow('alert', a)).join('')
                                    : `<li class="live-feed-empty">
                                          <i class="bi ${state.adminSocketConnected ? 'bi-inbox' : 'bi-plug'}"></i>
                                          <div class="live-feed-empty-title">${state.adminSocketConnected ? 'Még nem érkezett esemény' : 'Nincs élő WS kapcsolat'}</div>
                                          <div class="live-feed-empty-sub">${state.adminSocketConnected ? 'Az új audit/alert sorok automatikusan ide kerülnek.' : 'A demo adatok elrejtve — csatlakozz az élő nézethez.'}</div>
                                      </li>`}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row g-3 mt-2">
                ${[
                    { id: 'mini24Logins',         icon: 'bi-box-arrow-in-right', label: '24h bejelentkezés',    value: last24.logins ?? 0,          color: 'primary',  nav: 'security' },
                    { id: 'mini24Registrations',  icon: 'bi-person-plus-fill',   label: '24h regisztráció',     value: last24.registrations ?? 0,   color: 'success',  nav: 'users' },
                    { id: 'mini24Audit',          icon: 'bi-journal-text',       label: '24h audit',            value: last24.auditEntries ?? 0,    color: 'warning',  nav: 'auditLog' },
                    { id: 'mini24Critical',       icon: 'bi-exclamation-octagon',label: '24h kritikus',         value: last24.criticalAuditEntries ?? 0, color: 'danger', nav: 'auditLog' },
                    { id: 'mini24Alerts',         icon: 'bi-shield-fill-x',      label: '24h riasztás',         value: last24.alerts ?? 0,          color: 'warning',  nav: 'alerts' },
                    { id: 'mini24Bans',           icon: 'bi-ban',                label: '24h új tiltás',        value: last24.newBans ?? 0,         color: 'danger',   nav: 'userBan' }
                ].map(item => `
                    <div class="col-6 col-md-4 col-xl-2">
                        <button type="button" class="mini-stat mini-stat-clickable" onclick="showSection('${item.nav}', event)" aria-label="${item.label} — ugrás a ${item.nav} szekcióra">
                            <i class="bi ${item.icon} text-${item.color}"></i>
                            <div class="mini-stat-value" id="${item.id}">${item.value}</div>
                            <div class="mini-stat-label">${item.label}</div>
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    },

    /* ---------- Felhasználók > Lista ---------- */
    users: () => `
        ${h.header({
            icon: 'bi-people-fill', title: 'Felhasználói lista',
            subtitle: 'Az összes regisztrált játékos kezelése',
            actions: [
                { label: 'Exportálás', icon: 'bi-download', onclick: 'exportUsers()' },
                { label: 'Új felhasználó', icon: 'bi-plus-lg', variant: 'gold',
                  attrs: 'data-bs-toggle="modal" data-bs-target="#addUserModal"' }
            ]
        })}
        ${h.table({
            headerExtra: `
                <div class="filter-bar">
                    <input id="adminUserSearchInput" name="adminUserSearchInput" type="text"
                        class="form-control form-control-sm" placeholder="Keresés...">
                    <select id="adminRoleFilter" name="adminRoleFilter" class="form-select form-select-sm">
                        <option value="">Minden szerepkör</option>
                        <option value="player">Játékos</option>
                        <option value="admin">Admin</option>
                    </select>
                    <select id="adminStatusFilter" name="adminStatusFilter" class="form-select form-select-sm">
                        <option value="">Minden állapot</option>
                        <option value="active">Aktív</option>
                        <option value="banned">Tiltott</option>
                    </select>
                    <select id="adminOrderBy" name="adminOrderBy" class="form-select form-select-sm">
                        <option value="">Rendezés</option>
                        <option value="username">Név</option>
                        <option value="elo">ELO</option>
                    </select>
                </div>
            `,
            headers: ['Felhasználó', 'ELO', 'Szerepkör', 'Állapot', 'Utolsó aktivitás', 'Csatlakozott', ''],
            rows: SAMPLE.users.map((u, idx) => [
                h.user({ name: u.name, email: u.email, struck: u.struck }),
                `<span class="fw-semibold ${u.elo > 0 ? 'text-gold' : 'text-secondary'}">${u.elo}</span>`,
                rolePill(u.role), statusPill(u.status),
                `<span class="text-secondary">${u.last}</span>`,
                `<span class="text-secondary">${u.joined}</span>`,
                h.actions(u.status === 'banned'
                    ? [
                        { icon: 'bi-eye',          variant: 'light',   title: 'Megtekintés', onclick: `viewUser(${idx + 1})` },
                        { icon: 'bi-check-circle', variant: 'success', title: 'Tiltás feloldása' }
                    ]
                    : [
                        { icon: 'bi-eye',    variant: 'light',  title: 'Megtekintés', onclick: `viewUser(${idx + 1})` },
                        { icon: 'bi-pencil', variant: 'gold',   title: 'Szerkesztés', onclick: "showSection('userDetail')" },
                        { icon: 'bi-ban',    variant: 'danger', title: 'Tiltás (kritikus)', onclick: `openCriticalAction('users.ban', '${u.name}')` }
                    ])
            ])
        })}
    `,

    /* ---------- Felhasználók > Részletek és szerkesztés ---------- */
    userDetail: () => `
        ${h.header({
            icon: 'bi-person-vcard', title: 'Részletek és szerkesztés',
            subtitle: 'Egy kiválasztott profil teljes munkaablakja',
            actions: [{ label: 'Vissza a listához', icon: 'bi-arrow-left', size: 'sm', onclick: "showSection('users')" }]
        })}

        <div class="content-card user-picker mb-4">
            <div class="d-flex flex-wrap align-items-center gap-3 p-3">
                <i class="bi bi-search text-secondary"></i>
                <input type="text" class="form-control form-control-sm" style="max-width:320px;"
                    placeholder="Felhasználó kiválasztása név vagy e-mail alapján...">
                <span class="text-secondary small ms-auto">Aktív profil:
                    <strong class="text-white">Magnus Carlsen</strong>
                </span>
            </div>
        </div>

        <div class="row g-4">
            <div class="col-lg-4">
                ${h.card({
                    classes: 'profile-summary',
                    body: `
                        <div class="text-center">
                            <img id="userDetailProfileImage"
                                class="rounded-circle border border-3 border-gold mb-3" alt="Profil" style="width:120px;height:120px;object-fit:cover;" data-fallback="true">
                            <h4 class="text-white mb-1">Magnus Carlsen</h4>
                            <small class="text-secondary d-block mb-3">magnus@chess.hu</small>
                            ${rolePill('admin')}
                            <hr class="border-secondary">
                            <div class="text-gold display-5 fw-bold lh-1">2847</div>
                            <small class="text-secondary">ELO értékelés</small>
                        </div>
                    `
                })}
                <div class="content-card mt-4">
                    <div class="card-header"><h5 class="card-title"><i class="bi bi-bar-chart-fill me-2 text-gold"></i>Statisztika</h5></div>
                    <div class="card-body">
                        <div class="row g-3 text-center">
                            <div class="col-4"><div class="h4 text-success mb-0">142</div><small class="text-secondary">Győzelem</small></div>
                            <div class="col-4"><div class="h4 text-danger mb-0">38</div><small class="text-secondary">Vereség</small></div>
                            <div class="col-4"><div class="h4 text-warning mb-0">7</div><small class="text-secondary">Döntetlen</small></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-lg-8">
                ${h.card({
                    title: 'Alapadatok szerkesztése', icon: 'bi-pencil-square',
                    body: h.form({
                        fields: [
                            { id: 'editUsername',    label: 'Felhasználónév', value: 'MagnusCarlsen' },
                            { id: 'editEmail',       label: 'E-mail',         value: 'magnus@chess.hu', type: 'email' },
                            { id: 'editDisplayName', label: 'Megjelenített név', value: 'Magnus Carlsen' },
                            { id: 'editRole',        label: 'Szerepkör', type: 'select',
                              options: [{ value: 'player', label: 'Játékos' }, { value: 'admin', label: 'Admin', selected: true }] },
                            { id: 'editReason',      label: 'Indok (kötelező — min. 10 char)', col: 12, type: 'textarea',
                              placeholder: 'Miért módosítod ezeket az adatokat? Naplózásra kerül.' }
                        ],
                        cancel: { label: 'Mégse' },
                        submit: { label: 'Mentés', icon: 'bi-check2', variant: 'gold' }
                    })
                })}
                <div class="content-card mt-4 danger-zone">
                    <div class="card-header">
                        <h5 class="card-title text-danger"><i class="bi bi-exclamation-octagon-fill me-2"></i>Veszélyes műveletek</h5>
                    </div>
                    <div class="card-body">
                        <div class="danger-action">
                            <div>
                                <div class="fw-semibold text-white">Jelszó visszaállítás</div>
                                <small class="text-secondary">A felhasználó e-mailjére küldünk egy egyszer használatos linket.</small>
                            </div>
                            ${h.btn({ label: 'Link küldése', icon: 'bi-send-fill', variant: 'outline-warning', size: 'sm' })}
                        </div>
                        <div class="danger-action">
                            <div>
                                <div class="fw-semibold text-white">ELO manuális módosítása</div>
                                <small class="text-secondary">Csak indokolt esetben — minden módosítás naplózódik.</small>
                            </div>
                            <div class="d-flex gap-2 align-items-center">
                                <input type="number" class="form-control form-control-sm" value="2847" style="width:100px;">
                                ${h.btn({ label: 'Mentés', size: 'sm' })}
                            </div>
                        </div>
                        <div class="danger-action">
                            <div>
                                <div class="fw-semibold text-white">Felhasználó tiltása <span class="badge bg-danger ms-1">kritikus</span></div>
                                <small class="text-secondary">30 char indok + jelszó megerősítés szükséges.</small>
                            </div>
                            ${h.btn({ label: 'Tiltás kezelése', icon: 'bi-ban', variant: 'outline-danger', size: 'sm', onclick: "openCriticalAction('users.ban', 'Magnus Carlsen')" })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `,

    /* ---------- Felhasználók > Tiltások ---------- */
    userBan: () => `
        ${h.header({
            icon: 'bi-slash-circle', title: 'Tiltások',
            subtitle: 'Új tiltás létrehozása és aktív tiltások kezelése'
        })}
        <div class="row g-4 mb-4">
            <div class="col-lg-5">
                ${h.card({
                    title: 'Új tiltás', icon: 'bi-plus-circle',
                    headerExtra: h.badge('kritikus művelet', 'danger'),
                    body: `
                        <div class="alert alert-warning bg-warning bg-opacity-10 border-warning small mb-3">
                            <i class="bi bi-info-circle-fill me-1"></i>
                            A tiltás kritikus művelet — min. <strong>30 karakter indok</strong> és <strong>jelszó megerősítés</strong> szükséges.
                        </div>
                        ${h.form({
                            fields: [
                                { id: 'banUserSelect', label: 'Felhasználó', col: 12, type: 'select',
                                    options: ['SakkMester99', 'ChatSpammer', 'RookRider'] },
                                { id: 'banType', label: 'Típus', col: 6, type: 'select',
                                    options: ['Ideiglenes', 'Végleges', 'Csak chat'] },
                                { id: 'banDuration', label: 'Időtartam (óra)', col: 6, type: 'number', value: '24' },
                                { id: 'banReason', label: 'Indok (min. 30 char)', col: 12, type: 'textarea',
                                    placeholder: 'Részletes indok — naplózásra kerül.' }
                            ],
                            submit: { label: 'Tiltás alkalmazása', icon: 'bi-shield-fill-check', variant: 'danger',
                                      onclick: "openCriticalAction('users.ban', 'kiválasztott felhasználó')" }
                        })}
                    `
                })}
            </div>
            <div class="col-lg-7">
                ${h.card({
                    title: 'Aktív tiltások', icon: 'bi-list-check', noBodyPadding: true,
                    body: `
                        <table class="table mb-0">
                            <thead><tr><th>Felhasználó</th><th>Típus</th><th>Lejár</th><th class="text-end">Művelet</th></tr></thead>
                            <tbody>
                                ${[
                                    { name: 'Anish Giri',  type: ['Végleges',  'danger'],  expires: 'Soha', expClass: 'text-danger' },
                                    { name: 'ChatSpammer', type: ['Ideiglenes','warning'], expires: '2026-05-04 14:32' }
                                ].map(b => `
                                    <tr>
                                        <td>${h.user({ name: b.name })}</td>
                                        <td>${h.badge(b.type[0], b.type[1])}</td>
                                        <td><span class="${b.expClass || ''}">${b.expires}</span></td>
                                        <td class="text-end">${h.iconBtn({ icon: 'bi-check-circle', variant: 'success', title: 'Feloldás' })}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `
                })}
            </div>
        </div>
    `,

    /* ---------- Moderáció > Chat ---------- */
    chats: () => {
        const messages = [
            { priority: ['Magas', 'danger'], game: '#4921', user: 'AgresszívJatekos99',
              text: '„Te aztán teljes kezdő vagy, töröld ki a játékot!!!"', time: '2 perce' },
            { priority: ['Közepes', 'warning'], game: '#4918', user: 'ChatSpammer',
              text: '[Ismétlődő üzenet: „siess" × 15]', time: '15 perce' }
        ];
        return `
            ${h.header({
                icon: 'bi-chat-dots-fill', title: 'Chat moderálás',
                subtitle: 'Megjelölt és bejelentett üzenetek áttekintése'
            })}
            ${h.card({
                title: `Megjelölt üzenetek (${messages.length})`, icon: 'bi-exclamation-triangle-fill',
                noBodyPadding: true,
                body: `<div class="moderation-list">
                    ${messages.map(m => `
                        <article class="moderation-item">
                            <header class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                                <div class="d-flex align-items-center gap-2">
                                    ${h.badge(m.priority[0], m.priority[1])}
                                    <small class="text-secondary">${m.game} játszma</small>
                                </div>
                                <small class="text-muted">${m.time}</small>
                            </header>
                            <div class="d-flex align-items-center gap-2 mb-2">
                                ${h.avatar(m.user, 24)}<strong class="text-white">${m.user}</strong>
                            </div>
                            <blockquote class="moderation-quote">${m.text}</blockquote>
                            <div class="d-flex justify-content-end gap-2">
                                ${h.btn({ label: 'Engedélyezés', variant: 'outline-success', size: 'sm' })}
                                ${h.btn({ label: 'Némítás',      variant: 'outline-warning', size: 'sm' })}
                                ${h.btn({ label: 'Törlés', variant: 'outline-danger', size: 'sm',
                                          onclick: "openCriticalAction('chat.delete', '" + m.user + "')" })}
                            </div>
                        </article>
                    `).join('')}
                </div>`
            })}
        `;
    },

    /* ---------- Moderáció > Profilképek ---------- */
    profileImageReview: () => `
        ${h.header({
            icon: 'bi-image', title: 'Függő profilképek',
            subtitle: 'Új profilképek jóváhagyása vagy elutasítása',
            actions: [{ label: 'Frissítés', icon: 'bi-arrow-clockwise', size: 'sm',
                attrs: 'id="profileImageReviewRefresh"' }]
        })}
        ${h.card({
            body: `
                <p class="text-secondary mb-3">A függő profilképeket csak a feltöltő látja. Jóváhagyás után globálisan láthatóvá válnak; elutasítás esetén a publikus kép visszaáll az alapértelmezettre.</p>
                <div id="profileImageReviewMessage" class="alert d-none" role="alert"></div>
                <div class="table-responsive">
                    <table class="table align-middle mb-0">
                        <thead>
                            <tr>
                                <th>Felhasználó</th>
                                <th>Feltöltött kép</th>
                                <th>Feltöltés ideje</th>
                                <th class="text-end">Műveletek</th>
                            </tr>
                        </thead>
                        <tbody id="profileImageReviewTableBody">
                            <tr><td colspan="4" class="text-center text-secondary py-4">Töltés...</td></tr>
                        </tbody>
                    </table>
                </div>
            `
        })}
    `,

    /* ---------- Moderáció > Bejelentések ---------- */
    moderationReports: () => `
        ${h.header({
            icon: 'bi-flag-fill', title: 'Bejelentések',
            subtitle: 'Felhasználók által beküldött visszajelzések',
            actions: [
                { label: 'Összes',  variant: 'outline-secondary', size: 'sm', classes: 'active' },
                { label: 'Nyitott', variant: 'outline-secondary', size: 'sm' },
                { label: 'Lezárt',  variant: 'outline-secondary', size: 'sm' }
            ]
        })}
        ${h.table({
            headers: ['Bejelentő', 'Bejelentett', 'Kategória', 'Üzenet', 'Állapot', ''],
            rows: [
                { reporter: 'FairPlayer',   target: 'AgresszívJatekos99', cat: ['Toxikusság', 'danger'],     msg: 'Sértegető megjegyzések a chat-ben.', status: ['Nyitott', 'warning'] },
                { reporter: 'SakkMester99', target: 'CheaterX',           cat: ['Csalás gyanú', 'danger'],   msg: 'Engine használat gyanúja.',          status: ['Vizsgálat alatt', 'warning'] },
                { reporter: 'RookRider',    target: 'SpamKing',           cat: ['Spam', 'warning'],          msg: 'Reklám linkek küldése privátban.',  status: ['Lezárva', 'success'] }
            ].map(r => [
                `<span class="text-white">${r.reporter}</span>`,
                `<span class="text-white">${r.target}</span>`,
                h.badge(r.cat[0], r.cat[1]),
                `<span class="text-secondary">${r.msg}</span>`,
                h.badge(r.status[0], r.status[1]),
                `<div class="text-end">${h.btn({ label: 'Megnyitás', size: 'sm' })}</div>`
            ])
        })}
    `,

    /* ---------- Játékok > Játszmák ---------- */
    games: () => `
        ${h.header({ icon: 'bi-knight-fill', title: 'Játszmák',
            subtitle: 'Lefutott és folyamatban lévő játszmák' })}
        ${h.stats([
            { icon: 'bi-play-circle-fill', value: SAMPLE.games.filter(g => g.status === 'live').length,     label: 'Folyamatban',  color: 'success' },
            { icon: 'bi-trophy-fill',      value: SAMPLE.games.filter(g => g.status === 'finished').length, label: 'Befejezett',   color: 'warning' },
            { icon: 'bi-x-circle-fill',    value: '2',                                                      label: 'Megszakított', color: 'danger' }
        ])}
        ${h.table({
            title: 'Játszmák listája',
            headerExtra: `<div class="btn-group btn-group-sm">
                <button type="button" class="btn btn-outline-secondary active">Összes</button>
                <button type="button" class="btn btn-outline-secondary">Élő</button>
                <button type="button" class="btn btn-outline-secondary">Befejezett</button>
            </div>`,
            headers: ['Azonosító', 'Világos', 'Sötét', 'Állapot', 'Győztes', 'Lépések', 'Időkontroll', ''],
            rows: SAMPLE.games.map(g => [
                `<span class="font-monospace text-gold">${g.id}</span>`,
                `<div class="d-flex align-items-center gap-2"><i class="bi bi-circle text-light"></i><span>${g.white}</span></div>`,
                `<div class="d-flex align-items-center gap-2"><i class="bi bi-circle-fill text-dark border rounded-circle"></i><span>${g.black}</span></div>`,
                statusPill(g.status),
                g.winner === '—' ? '<span class="text-secondary">—</span>' : `<span class="text-success">${g.winner}</span>`,
                g.moves, g.time,
                h.actions(g.status === 'live'
                    ? [{ icon: 'bi-eye', variant: 'gold', title: 'Nézés' }, { icon: 'bi-stop-circle', variant: 'danger', title: 'Leállítás' }]
                    : [{ icon: 'bi-eye', variant: 'gold', title: 'Nézés' }, { icon: 'bi-download', variant: 'secondary', title: 'PGN letöltés' }])
            ])
        })}
    `,

    /* ---------- Játékok > Képességek ---------- */
    abilities: () => `
        ${h.header({ icon: 'bi-magic', title: 'Képességek / Erősítők',
            subtitle: 'Speciális játékos képességek kezelése',
            actions: [{ label: 'Új képesség', icon: 'bi-plus-lg', variant: 'gold' }] })}
        <div class="row g-4">
            ${[
                { name: 'Időutazás',         desc: '+30 másodperc hozzáadása az óra idejéhez játszmánként egyszer.', uses: '1 234' },
                { name: 'Gyalogválasztás',   desc: 'Egy gyalog azonnali előléptetése bármilyen figurára.',           uses: '892' },
                { name: 'Csere visszavonás', desc: 'Az utolsó lépés visszavonása az ellenfél jóváhagyásával.',       uses: '445' }
            ].map(a => `
                <div class="col-md-6 col-lg-4">
                    ${h.card({
                        title: a.name,
                        headerExtra: h.badge('Aktív', 'success'),
                        classes: 'h-100',
                        body: `
                            <p class="text-secondary mb-3">${a.desc}</p>
                            <div class="d-flex justify-content-between align-items-center">
                                <small class="text-muted">${a.uses} használat</small>
                                <div class="btn-group">
                                    ${h.iconBtn({ icon: 'bi-pencil', variant: 'gold', title: 'Szerkesztés' })}
                                    ${h.iconBtn({ icon: 'bi-trash',  variant: 'danger', title: 'Törlés' })}
                                </div>
                            </div>
                        `
                    })}
                </div>
            `).join('')}
        </div>
    `,

    /* ---------- Naplók > Bejelentkezések ---------- */
    security: () => `
        ${h.header({ icon: 'bi-shield-check', title: 'Bejelentkezési előzmények',
            subtitle: 'Sikeres és sikertelen bejelentkezési kísérletek',
            actions: [{ label: 'Napló export', icon: 'bi-download', size: 'sm' }] })}
        ${h.table({
            headers: ['Felhasználó', 'IP cím', 'Helyszín', 'Eszköz / böngésző', 'Idő', 'Kockázat'],
            rows: SAMPLE.logins.map(l => [
                `<span class="fw-semibold text-white">${l.user}</span>`,
                `<span class="font-monospace ${l.risk === 'high' ? 'text-danger' : 'text-gold'}">${l.ip}</span>`,
                `<span class="text-secondary"><i class="bi bi-geo-alt me-1"></i>${l.location}</span>`,
                `<span class="text-secondary"><i class="bi ${l.deviceIcon} me-1"></i>${l.device}</span>`,
                `<span class="text-secondary">${l.time}</span>`,
                riskPill(l.risk)
            ])
        })}
    `,

    /* ---------- Naplók > Audit napló ---------- */
    auditLog: () => {
        const list = auditList();
        const counts = {
            info: list.filter(a => a.severity === 'info').length,
            warning: list.filter(a => a.severity === 'warning').length,
            critical: list.filter(a => a.severity === 'critical').length
        };
        return `
            ${h.header({ icon: 'bi-journal-check', title: 'Audit napló',
                subtitle: 'Admin műveletek append-only nyomvonala — kötelező indok, before/after diff',
                actions: [{ label: 'Audit export', icon: 'bi-download', size: 'sm' }] })}

            <div class="row g-3 mb-4">
                ${[
                    { icon: 'bi-info-circle-fill',          label: 'Info',     value: counts.info,     color: 'primary' },
                    { icon: 'bi-exclamation-triangle-fill', label: 'Warning',  value: counts.warning,  color: 'warning' },
                    { icon: 'bi-exclamation-octagon-fill',  label: 'Critical', value: counts.critical, color: 'danger' },
                    { icon: 'bi-clock-history',             label: 'Listázott', value: list.length,    color: 'success' }
                ].map(item => `
                    <div class="col-6 col-md-3">
                        <div class="mini-stat">
                            <i class="bi ${item.icon} text-${item.color}"></i>
                            <div class="mini-stat-value">${item.value}</div>
                            <div class="mini-stat-label">${item.label}</div>
                        </div>
                    </div>
                `).join('')}
            </div>

            ${h.card({
                classes: 'audit-log-card',
                headerExtra: `
                    <div class="filter-bar">
                        <input type="text" class="form-control form-control-sm" placeholder="Action / target / actor keresés...">
                        <select class="form-select form-select-sm">
                            <option value="">Minden severity</option>
                            <option value="info">Info</option>
                            <option value="warning">Warning</option>
                            <option value="critical">Critical</option>
                        </select>
                    </div>
                `,
                body: `<div class="audit-log-list">${list.map(renderAuditRow).join('')}</div>`
            })}
        `;
    },

    /* ---------- Naplók > Riasztások ---------- */
    alerts: () => {
        const list = alertsList();
        const byKind = {};
        Object.keys(ALERT_KIND).forEach(k => byKind[k] = list.filter(a => a.kind === k).length);
        return `
            ${h.header({ icon: 'bi-exclamation-octagon-fill', title: 'Riasztások',
                subtitle: 'Jogosulatlan próbák, rate limit szigorítások, gyanús minták',
                actions: [{ label: 'Mind elolvasva', icon: 'bi-check-all', size: 'sm' }] })}

            <div class="row g-3 mb-4">
                ${[
                    { icon: 'bi-shield-fill-x', label: 'Unauthorized',       value: byKind.unauthorized || 0,       color: 'warning' },
                    { icon: 'bi-key-fill',      label: 'Token hiba',         value: byKind.token_invalid || 0,      color: 'warning' },
                    { icon: 'bi-speedometer2',  label: 'Rate escalated',     value: byKind.rate_escalated || 0,     color: 'warning' },
                    { icon: 'bi-bug-fill',      label: 'Suspicious pattern', value: byKind.suspicious_pattern || 0, color: 'danger'  }
                ].map(item => `
                    <div class="col-6 col-md-3">
                        <div class="mini-stat">
                            <i class="bi ${item.icon} text-${item.color}"></i>
                            <div class="mini-stat-value">${item.value}</div>
                            <div class="mini-stat-label">${item.label}</div>
                        </div>
                    </div>
                `).join('')}
            </div>

            ${h.card({
                body: `<div class="alert-list">${list.map(renderAlertRow).join('')}</div>`,
                noBodyPadding: true
            })}
        `;
    },

    /* ---------- Super admin ---------- */
    superAdmin: () => `
        ${h.header({ icon: 'bi-stars', title: 'Super admin',
            subtitle: 'Admin szerepkörök kiosztása és visszavonása',
            actions: [{ label: 'Admin grant', icon: 'bi-plus-lg', variant: 'gold',
                onclick: "openCriticalAction('admin.grant', 'új admin')" }] })}

        <div class="alert alert-warning bg-warning bg-opacity-10 border-warning d-flex align-items-start gap-2">
            <i class="bi bi-info-circle-fill text-warning mt-1"></i>
            <div class="flex-grow-1">
                <strong>Last-super-admin lock</strong> aktív — egy super-admin saját
                <code>is_super_admin</code> flag-jét nem tudja levenni, ha ő az utolsó.
                Minden admin grant/revoke <strong>kritikus művelet</strong>: 30 char indok + jelszó megerősítés.
            </div>
        </div>

        ${h.table({
            title: 'Admin felhasználók', icon: 'bi-shield-fill',
            headers: ['Admin', 'Szint', 'Csatlakozott', 'Utoljára aktív', 'Műveletek'],
            rows: SAMPLE_ADMINS.map(a => [
                h.user({ name: a.name, email: a.email }),
                a.isSuper
                    ? `<span class="super-pill"><i class="bi bi-stars"></i>Super admin</span>`
                    : rolePill('admin'),
                `<span class="text-secondary">${a.joined}</span>`,
                `<span class="text-secondary">${a.lastSeen}</span>`,
                `<div class="d-inline-flex gap-2">
                    ${h.btn({ label: 'Részletek', icon: 'bi-eye', variant: 'outline-light', size: 'sm' })}
                    ${a.isSuper
                        ? h.btn({ label: 'Saját super lock', icon: 'bi-lock-fill', variant: 'outline-secondary', size: 'sm', attrs: 'disabled' })
                        : h.btn({ label: 'Revoke', icon: 'bi-shield-fill-x', variant: 'outline-danger', size: 'sm',
                                  onclick: `openCriticalAction('admin.revoke', '${a.name}')` })
                    }
                </div>`
            ])
        })}
    `,

    /* ---------- Közösségi ---------- */
    friends: () => `
        ${h.header({ icon: 'bi-people', title: 'Közösségi kapcsolatok',
            subtitle: 'Barátkérelmek, kapcsolatok és blokkolások egy helyen' })}
        ${h.stats([
            { icon: 'bi-diagram-3-fill', value: '142', label: 'Összes barátság', color: 'primary' },
            { icon: 'bi-person-plus',    value: '8',   label: 'Függő kérelem',   color: 'warning' },
            { icon: 'bi-person-x-fill',  value: '5',   label: 'Aktív blokkolás', color: 'danger' }
        ])}
        <div class="row g-4">
            <div class="col-lg-7">
                ${h.card({
                    title: 'Függő barátkérelmek', icon: 'bi-person-plus-fill', noBodyPadding: true,
                    body: `<table class="table mb-0"><thead><tr><th>Küldő</th><th>Címzett</th><th>Küldve</th><th class="text-end"></th></tr></thead><tbody>
                        ${[
                            { from: 'SakkMester99',   to: 'RookRider',       when: '2 órája' },
                            { from: 'FairPlayer',     to: 'Magnus Carlsen',  when: '1 napja' }
                        ].map(r => `<tr><td><span class="text-white">${r.from}</span></td><td><span class="text-white">${r.to}</span></td><td><span class="text-secondary">${r.when}</span></td><td class="text-end">${h.btn({ label: 'Részletek', size: 'sm' })}</td></tr>`).join('')}
                    </tbody></table>`
                })}
            </div>
            <div class="col-lg-5">
                ${h.card({
                    title: 'Aktív blokkolások', icon: 'bi-person-x-fill', noBodyPadding: true,
                    body: `<table class="table mb-0"><thead><tr><th>Blokkoló</th><th>Blokkolt</th><th class="text-end"></th></tr></thead><tbody>
                        ${[
                            { who: 'FairPlayer',   whom: 'ToxikusZoli' },
                            { who: 'SakkMester99', whom: 'SpamKing' }
                        ].map(b => `<tr><td><span class="text-white">${b.who}</span></td><td><span class="text-white">${b.whom}</span></td><td class="text-end">${h.btn({ label: 'Feloldás', variant: 'outline-success', size: 'sm' })}</td></tr>`).join('')}
                    </tbody></table>`
                })}
            </div>
        </div>
    `,

    /* ---------- Tesztek (formaterv — placeholder) ---------- */
    tests: () => `
        ${h.header({
            icon: 'bi-clipboard2-check', title: 'Tesztek',
            subtitle: 'Frontend és backend tesztek áttekintése — eredmények és lefedettség',
            actions: [
                { label: 'Összes futtatása', icon: 'bi-play-fill', variant: 'gold', size: 'sm', attrs: 'disabled' },
                { label: 'Frissítés',        icon: 'bi-arrow-clockwise', size: 'sm', attrs: 'disabled' }
            ]
        })}

        <div class="alert alert-info bg-info bg-opacity-10 border-info small mb-4">
            <i class="bi bi-info-circle-fill me-1"></i>
            Ez a szekció <strong>formaterv</strong> — a tesztfuttatás integráció (Jest + Supertest) még nincs bekötve.
            A vázlat azt mutatja, hogyan fognak megjelenni az eredmények.
        </div>

        ${h.stats([
            { icon: 'bi-check-circle-fill', value: '<span class="text-secondary">—</span>', label: 'Sikeres', color: 'success' },
            { icon: 'bi-x-circle-fill',     value: '<span class="text-secondary">—</span>', label: 'Sikertelen', color: 'danger' },
            { icon: 'bi-skip-forward-fill', value: '<span class="text-secondary">—</span>', label: 'Kihagyott', color: 'warning' },
            { icon: 'bi-stopwatch',         value: '<span class="text-secondary">—</span>', label: 'Futási idő', color: 'primary' }
        ])}

        <div class="row g-4">
            <div class="col-lg-7">
                ${h.card({
                    title: 'Tesztek listája', icon: 'bi-list-check',
                    headerExtra: `
                        <div class="filter-bar">
                            <select class="form-select form-select-sm" disabled>
                                <option>Minden suite</option>
                                <option>Unit (Jest)</option>
                                <option>Integration (Supertest)</option>
                                <option>Auth bypass</option>
                                <option>Rate limit</option>
                                <option>Real-time</option>
                            </select>
                            <select class="form-select form-select-sm" disabled>
                                <option>Minden státusz</option>
                                <option>Pass</option>
                                <option>Fail</option>
                                <option>Skip</option>
                            </select>
                        </div>
                    `,
                    noBodyPadding: true,
                    body: `<div class="test-list">
                        ${[
                            { suite: 'Unit',        name: 'permissions.js — SUPER_ONLY halmaz integritása',     status: 'pending' },
                            { suite: 'Unit',        name: 'AuditLogService.record — redaction allowlist',     status: 'pending' },
                            { suite: 'Unit',        name: 'parseAdminToken — hash egyeztetés + lejárat',      status: 'pending' },
                            { suite: 'Unit',        name: 'requireReasonOnMutate — char limitek',              status: 'pending' },
                            { suite: 'Integration', name: 'Login → elevate → admin endpoint → 200',           status: 'pending' },
                            { suite: 'Integration', name: 'Player elevate → 403',                              status: 'pending' },
                            { suite: 'Integration', name: 'Critical action confirmPassword nélkül → 400',     status: 'pending' },
                            { suite: 'Auth bypass', name: 'Admin endpoint admin token nélkül → 401',           status: 'pending' },
                            { suite: 'Auth bypass', name: 'WS /admin player session-nel → connect_error',     status: 'pending' },
                            { suite: 'Rate limit',  name: '10× rossz token egy IP-ről → 11. már 429',         status: 'pending' },
                            { suite: 'Real-time',   name: '2 socket-kliens → audit:created 500ms-en belül',   status: 'pending' }
                        ].map(t => `
                            <div class="test-row test-${t.status}">
                                <div class="test-status-dot"></div>
                                <span class="test-suite">${t.suite}</span>
                                <span class="test-name">${t.name}</span>
                                <span class="test-status-label">${
                                    t.status === 'pass' ? 'PASS' :
                                    t.status === 'fail' ? 'FAIL' :
                                    t.status === 'skip' ? 'SKIP' : 'függő'
                                }</span>
                                <span class="test-duration">—</span>
                            </div>
                        `).join('')}
                    </div>`
                })}
            </div>
            <div class="col-lg-5">
                ${h.card({
                    title: 'Eredmények log', icon: 'bi-terminal-fill',
                    body: `
                        <pre class="json-block" style="max-height:280px;overflow:auto;">$ npm test
[ ... ide kerül a tesztek kimenete élőben streamelve ... ]

A teszt-runner integráció a következő iterációban
kerül bekötésre. Helyettesítő nézet: lista bal oldalt.</pre>
                    `
                })}

                ${h.card({
                    title: 'Lefedettség', icon: 'bi-pie-chart-fill', classes: 'mt-4',
                    body: `
                        <div class="coverage-row">
                            <span class="coverage-label">Statements</span>
                            <div class="progress flex-grow-1" role="progressbar" style="height:8px;">
                                <div class="progress-bar bg-secondary" style="width:0%"></div>
                            </div>
                            <span class="coverage-value">—</span>
                        </div>
                        <div class="coverage-row">
                            <span class="coverage-label">Branches</span>
                            <div class="progress flex-grow-1" role="progressbar" style="height:8px;">
                                <div class="progress-bar bg-secondary" style="width:0%"></div>
                            </div>
                            <span class="coverage-value">—</span>
                        </div>
                        <div class="coverage-row">
                            <span class="coverage-label">Functions</span>
                            <div class="progress flex-grow-1" role="progressbar" style="height:8px;">
                                <div class="progress-bar bg-secondary" style="width:0%"></div>
                            </div>
                            <span class="coverage-value">—</span>
                        </div>
                        <div class="coverage-row">
                            <span class="coverage-label">Lines</span>
                            <div class="progress flex-grow-1" role="progressbar" style="height:8px;">
                                <div class="progress-bar bg-secondary" style="width:0%"></div>
                            </div>
                            <span class="coverage-value">—</span>
                        </div>
                    `
                })}
            </div>
        </div>
    `,

    /* ---------- Beállítások ---------- */
    settings: () => `
        ${h.header({ icon: 'bi-gear-fill', title: 'Beállítások',
            subtitle: 'Általános platform paraméterek' })}
        ${h.card({
            body: h.form({
                fields: [
                    { id: 'settingsSiteName',     label: 'Oldal neve',         value: 'MattMester' },
                    { id: 'settingsSupportEmail', label: 'Support e-mail',     value: 'support@mattmester.hu', type: 'email' },
                    { id: 'settingsLanguage',     label: 'Alapértelmezett nyelv', type: 'select',
                        options: [{ value: 'hu', label: 'Magyar', selected: true }, { value: 'en', label: 'English' }] },
                    { id: 'settingsTimezone',     label: 'Időzóna', type: 'select',
                        options: [{ value: 'Europe/Budapest', label: 'Europe/Budapest', selected: true }, 'UTC'] },
                    { id: 'settingsRegistration', label: 'Regisztráció engedélyezve', type: 'switch', value: true },
                    { id: 'settingsMaintenance',  label: 'Karbantartási mód',         type: 'switch', value: false }
                ],
                submit: { label: 'Beállítások mentése', icon: 'bi-check2', variant: 'gold' }
            })
        })}
    `
};

/* =============================================================
   10) Audit / alert / live-feed row renderelők
   ============================================================= */
function renderAuditRow(a, idx = 0) {
    const sev = a.severity || 'info';
    const time = formatAuditTime(a.occurredAt);
    const actor = a.actor?.username || 'rendszer';
    const targetLabel = a.target?.label
        ? `<span class="audit-row-target"><i class="bi bi-bullseye me-1"></i>${escapeHtml(a.target.label)}</span>` : '';
    const detailId = `auditDetail-${a.eventId || idx}-${Math.random().toString(36).slice(2, 7)}`;
    return `
        <article class="audit-row sev-${sev}" data-audit-id="${a.eventId || ''}">
            <div class="audit-row-head">
                <span class="audit-row-time font-monospace">${time}</span>
                <span class="audit-row-actor"><i class="bi bi-person-circle me-1"></i>${escapeHtml(actor)}</span>
                <span class="audit-row-arrow"><i class="bi bi-arrow-right"></i></span>
                <span class="audit-row-action font-monospace">${escapeHtml(a.action || '')}</span>
                ${targetLabel}
                <div class="audit-row-spacer"></div>
                ${severityPill(sev)}
                <button type="button" class="btn btn-sm btn-outline-gold btn-icon ms-2 audit-row-toggle"
                    onclick="document.getElementById('${detailId}').classList.toggle('d-none'); this.classList.toggle('open');"
                    aria-label="Részletek">
                    <i class="bi bi-chevron-down"></i>
                </button>
            </div>
            <div class="audit-row-reason"><i class="bi bi-quote me-1"></i>${escapeHtml(a.reason || '')}</div>
            <div id="${detailId}" class="audit-row-detail d-none">
                <div class="row g-3">
                    <div class="col-md-6">
                        <div class="audit-diff-label">before</div>
                        ${formatJSON(a.diff?.before)}
                    </div>
                    <div class="col-md-6">
                        <div class="audit-diff-label">after</div>
                        ${formatJSON(a.diff?.after)}
                    </div>
                </div>
                <div class="audit-meta mt-3">
                    <span><strong>event_id:</strong> <span class="font-monospace text-gold">${a.eventId || '—'}</span></span>
                    <span><strong>severity:</strong> ${sev}</span>
                    ${a.target ? `<span><strong>target:</strong> ${escapeHtml(a.target.type || '')}#${a.target.id || ''}</span>` : ''}
                </div>
            </div>
        </article>
    `;
}

function renderAlertRow(a) {
    const kind = a.kind || 'unauthorized';
    const sev = a.severity || 'warning';
    const time = formatAuditTime(a.occurredAt);
    const userLabel = a.userId ? `#${a.userId}` : (a.user || '—');
    return `
        <article class="alert-row sev-${sev}">
            <div class="alert-row-icon"><i class="bi ${ALERT_KIND[kind]?.icon || 'bi-question'}"></i></div>
            <div class="alert-row-body">
                <div class="alert-row-head">
                    ${alertKindLabel(kind)}
                    ${severityPill(sev)}
                    <span class="alert-row-time font-monospace ms-auto">${time}</span>
                </div>
                <div class="alert-row-meta">
                    <span><strong>IP:</strong> <span class="font-monospace text-gold">${escapeHtml(a.ip || '—')}</span></span>
                    <span><strong>User:</strong> ${escapeHtml(String(userLabel))}</span>
                    <span><strong>Endpoint:</strong> <span class="font-monospace">${escapeHtml(a.endpoint || '*')}</span></span>
                </div>
                <div class="alert-row-detail">${formatJSON(a.detail)}</div>
                <div class="alert-row-actions">
                    ${h.btn({ label: 'IP tiltás',     icon: 'bi-ban',          variant: 'outline-danger',  size: 'sm' })}
                    ${h.btn({ label: 'Audit nyitás',  icon: 'bi-journal-text', variant: 'outline-gold',    size: 'sm', onclick: "showSection('auditLog')" })}
                    ${h.btn({ label: 'Elutasít',      icon: 'bi-x-circle',     variant: 'outline-secondary', size: 'sm' })}
                </div>
            </div>
        </article>
    `;
}

function liveFeedRow(kind, ev) {
    const sev = ev.severity || (kind === 'alert' ? 'warning' : 'info');
    const time = formatAuditTime(ev.occurredAt);
    const action = kind === 'alert' ? (ev.kind || 'alert') : (ev.action || '');
    const target = kind === 'alert' ? (ev.ip || '') : (ev.target?.label || '—');
    return `
        <li class="live-feed-row sev-${sev}${kind === 'alert' ? ' live-feed-alert' : ''}">
            <span class="live-feed-time">${time}</span>
            <span class="live-feed-action">${escapeHtml(action)}</span>
            <span class="live-feed-target ${kind === 'alert' ? 'font-monospace text-secondary' : ''}">${escapeHtml(target)}</span>
            ${severityPill(sev)}
        </li>
    `;
}

/* =============================================================
   11) Szekció váltás
   ============================================================= */
function showSection(sectionId, event, options = {}) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    const silent = options.silent === true;

    const renderer = SECTIONS[sectionId] || SECTIONS[DEFAULT_SECTION];
    const target = document.getElementById('adminSections');
    if (!target) return;

    state.currentSectionId = sectionId;

    target.innerHTML = `<div class="section-content${silent ? '' : ' animate-slide-in'}">${renderer()}</div>`;

    document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.menu-group-toggle').forEach(t => t.classList.remove('has-active'));

    const link = document.querySelector(`.sidebar .nav-link[data-section="${sectionId}"]`);
    if (link) {
        link.classList.add('active');
        const collapse = link.closest('.collapse');
        if (collapse) {
            const toggle = document.querySelector(`.menu-group-toggle[data-bs-target="#${collapse.id}"]`);
            if (toggle) toggle.classList.add('has-active');
            if (window.bootstrap?.Collapse) {
                window.bootstrap.Collapse.getOrCreateInstance(collapse, { toggle: false }).show();
            } else {
                collapse.classList.add('show');
            }
        }
    }

    if (sectionId === 'dashboard') {
        initChart();
        applyWsStatusToDashboard();
        startWsRelativeTicker();
        if (state.liveStatsAt) {
            setText('tickBandTime', formatRelative(state.liveStatsAt));
            rescheduleStaleWatchdog();
        }
    }
    if (sectionId === 'profileImageReview') {
        window.MattMesterAdminProfileImages?.refresh?.();
    }

    if (window.innerWidth < 992) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobileOverlay');
        sidebar?.classList.remove('show');
        sidebar?.classList.add('collapsed');
        overlay?.classList.remove('show');
    }

    if (!silent) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const overlay = document.getElementById('mobileOverlay');
    if (window.innerWidth < 992) {
        const open = sidebar.classList.toggle('show');
        sidebar.classList.toggle('collapsed', !open);
        overlay?.classList.toggle('show', open);
    } else {
        sidebar.classList.toggle('collapsed');
        mainContent.classList.toggle('expanded');
    }
}

/* =============================================================
   12) AUTH bootstrap — session ellenőrzés + step-up elevate
   ============================================================= */
async function bootstrapAdminAuth() {
    try {
        const r = await fetch('/api/sessionInfo', { credentials: 'same-origin' });
        const data = await r.json().catch(() => ({}));

        if (!data?.loggedIn || data.user?.role !== 'admin') {
            window.location.replace('/');
            return false;
        } else {
            state.currentUser = data.user;
            populateHeaderFromUser(data.user);
        }
    } catch (error) {
        console.error('bootstrapAdminAuth sessionInfo hiba:', error);
        window.location.replace('/');
        return false;
    }

    showElevateModal();

    showSection(state.currentSectionId || DEFAULT_SECTION, null, { silent: true });

    return true;
}

function populateHeaderFromUser(user) {
    const username = user?.username || 'Admin';
    setText('headerUsername', username);
    setText('headerRole', user?.role === 'admin' ? 'Admin' : (user?.role || ''));
    const avatar = document.getElementById('headerAvatar');
    if (avatar && window.MattMesterProfileImage) {
        window.MattMesterProfileImage.applyProfileImagePresentation(avatar, {
            source: user,
            size: 40
        });
    }
}

function showElevateModal() {
    const modalEl = document.getElementById('adminElevateModal');
    if (!modalEl || !window.bootstrap?.Modal) return;
    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl, {
        backdrop: 'static',
        keyboard: false
    });
    document.getElementById('elevateError')?.classList.add('d-none');
    const pwField = document.getElementById('elevatePassword');
    if (pwField) {
        pwField.value = '';
        // Enter -> submit
        pwField.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); performElevate(); }
        };
    }
    modal.show();
    setTimeout(() => pwField?.focus(), 250);
}

async function performElevate() {
    const pwField = document.getElementById('elevatePassword');
    const errBox = document.getElementById('elevateError');
    const submitBtn = document.getElementById('elevateSubmit');
    const password = pwField?.value || '';
    const elevateState = { success: false };

    if (errBox) errBox.classList.add('d-none');

    try {
        if (!password) {
            if (errBox) {
                errBox.textContent = 'A jelszó megadása kötelező.';
                errBox.classList.remove('d-none');
            }
        } else {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Aktiválás...';
            }

            const res = await fetch('/api/admin/auth/elevate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ password })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data?.success) {
                const msg = data?.message || 'Sikertelen elevate. Ellenőrizd a jelszót.';
                if (errBox) {
                    errBox.textContent = msg;
                    errBox.classList.remove('d-none');
                }
            } else {
                const tokenData = data.data || {};
                setAdminToken(tokenData.token, tokenData.expiresAt, Boolean(tokenData.isSuperAdmin));
                setText('headerRole', state.isSuperAdmin ? 'Super admin' : 'Admin');

                const modalEl = document.getElementById('adminElevateModal');
                if (modalEl) window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();

                showToast('Admin szint aktiválva — token kiállítva (15 perc).', 'success', 'bi-shield-fill-check');
                startTokenCountdown();
                connectAdminSocket();
                showSection(state.currentSectionId || DEFAULT_SECTION, null, { silent: true });
                elevateState.success = true;
            }
        }
    } catch (error) {
        console.error('performElevate hiba:', error);
        if (errBox) {
            errBox.textContent = 'Hálózati hiba az elevate során.';
            errBox.classList.remove('d-none');
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-shield-fill-check me-1"></i>Aktiválás (15 perc)';
        }
    }

    return elevateState.success;
}

function setAdminToken(token, expiresAtIso, isSuper) {
    state.adminToken = token || null;
    state.adminTokenExpiresAt = expiresAtIso ? new Date(expiresAtIso) : null;
    state.isSuperAdmin = Boolean(isSuper);
    state.elevated = Boolean(token);
}

function clearAdminToken() {
    state.adminToken = null;
    state.adminTokenExpiresAt = null;
    state.elevated = false;
    requestController.cancelAll?.();
    if (state.adminSocket) {
        try { state.adminSocket.disconnect(); } catch (_) {}
        state.adminSocket = null;
        state.adminSocketConnected = false;
        applyWsStatusToDashboard();
    }
}

function getRemainingTokenSeconds() {
    if (!state.adminTokenExpiresAt) return 0;
    return Math.max(0, Math.floor((state.adminTokenExpiresAt - new Date()) / 1000));
}

// Auth flow forras-igazsag: shared/adminAuthFlow.js (browser + Node-tesztelheto).
// A factory-t lazyn instanciaaljuk, hogy a fuggvenyhivatkozasok hoist-olt deklaraciokra
// mutathassanak (clearAdminToken / updateTokenPill / showElevateModal / showToast).
let _adminAuthFlow = null;
function getAdminAuthFlow() {
    if (_adminAuthFlow) {
        return _adminAuthFlow;
    }
    const factory = window.MattMesterAdminAuthFlow && window.MattMesterAdminAuthFlow.createAdminAuthFlow;
    if (typeof factory !== 'function') {
        throw new Error('MattMesterAdminAuthFlow nincs betoltve (shared/adminAuthFlow.js).');
    }
    _adminAuthFlow = factory({
        state,
        fetchFn: (input, init) => fetch(input, init),
        clearAdminToken,
        updateTokenPill,
        showElevateModal,
        showToast,
        redirect: (url) => window.location.replace(url),
        flashPill: () => {
            const pill = document.getElementById('adminTokenPill');
            pill?.classList.add('refresh-flash');
            setTimeout(() => pill?.classList.remove('refresh-flash'), 600);
        }
    });
    return _adminAuthFlow;
}

function handleAdminAuthError(code) {
    return getAdminAuthFlow().handleAdminAuthError(code);
}

function adminAuthHeaders(extra) {
    return getAdminAuthFlow().adminAuthHeaders(extra);
}

/* =============================================================
   13) Token countdown — VALÓS (server expiresAt alapján)
   ============================================================= */
let tokenIntervalId = null;
let autoRefreshing = false;

function startTokenCountdown() {
    if (tokenIntervalId) clearInterval(tokenIntervalId);
    updateTokenPill();
    tokenIntervalId = setInterval(async () => {
        const left = getRemainingTokenSeconds();

        // Auto-refresh: ha 60s alatti, kérünk egy refresh-t (sliding TTL)
        if (state.adminToken && left > 0 && left <= 60 && !autoRefreshing) {
            autoRefreshing = true;
            try {
                await callRefresh();
            } catch (error) {
                // Auth hiba -> handleAdminAuthError elintezi; halozat/5xx -> token marad, kovetkezo tick ujraprobalja.
                handleAdminAuthError(error?.code || '');
            }
            finally { autoRefreshing = false; }
        }

        // Lejárat -> új elevate kérése
        if (state.adminToken && left === 0) {
            clearAdminToken();
            updateTokenPill();
            showToast('Az admin token lejárt — újra elevate.', 'warning', 'bi-shield-fill-x');
            showElevateModal();
            return;
        }

        updateTokenPill();
    }, 1000);
}

// callRefresh / refreshAdminToken kozos forras: shared/adminAuthFlow.js.
async function callRefresh() {
    return getAdminAuthFlow().callRefresh();
}

async function refreshAdminToken() {
    return getAdminAuthFlow().refreshAdminToken();
}

function updateTokenPill() {
    const pill = document.getElementById('adminTokenPill');
    const countdown = document.getElementById('tokenCountdown');
    if (!pill || !countdown) return;

    const left = state.adminToken ? getRemainingTokenSeconds() : 0;
    const m = Math.floor(left / 60);
    const s = left % 60;
    countdown.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    pill.classList.remove('healthy', 'warning', 'expiring', 'expired');
    if (!state.adminToken)            pill.classList.add('expired');
    else if (left === 0)              pill.classList.add('expired');
    else if (left <= 60)              pill.classList.add('expiring');
    else if (left <= 300)             pill.classList.add('warning');
    else                              pill.classList.add('healthy');

    const totalCap = 15 * 60;
    const pct = (left / totalCap) * 100;
    pill.style.setProperty('--token-progress', `${pct}%`);
}

/* =============================================================
   14) Admin socket namespace (/admin) - real-time data feed
   ============================================================= */
function connectAdminSocket() {
    let socketReady = false;
    try {
        if (typeof window.io !== 'function') {
            console.warn('Socket.IO kliens nem érhető el — admin WS skip.');
            setWsStatus('disconnected');
        } else if (!state.adminToken) {
            console.warn('Admin token nélkül nem indítható socket kapcsolat.');
            setWsStatus('no_token');
        } else {
            if (state.adminSocket) {
                try { state.adminSocket.disconnect(); } catch (_) {}
                state.adminSocket = null;
            }

            setWsStatus('connecting');

            const sock = window.io('/admin', {
                auth: { adminToken: state.adminToken },
                transports: ['websocket', 'polling'],
                forceNew: true
            });

            sock.on('connect', () => {
                state.adminSocketConnected = true;
                setWsStatus('connected');
                try { sock.emit('admin:presence:hello'); } catch (_) {}
            });

            sock.on('disconnect', () => {
                state.adminSocketConnected = false;
                setWsStatus(state.adminToken ? 'disconnected' : 'no_token');
            });

            sock.on('connect_error', (err) => {
                console.warn('admin socket connect_error:', err?.message || err);
                state.adminSocketConnected = false;
                setWsStatus(state.adminToken ? 'disconnected' : 'no_token');
            });

            sock.on('admin:presence:welcome', (payload = {}) => {
                console.log('[admin-ws] welcome:', payload);
            });

            sock.on('admin:audit:created', (payload) => {
                if (payload) {
                    state.liveAudit.unshift(payload);
                    if (state.liveAudit.length > MAX_LIVE_BUFFER) state.liveAudit.length = MAX_LIVE_BUFFER;
                    onLiveAuditUpdate(payload);
                }
            });

            ['admin:alert:unauthorized', 'admin:alert:rate_escalated', 'admin:alert:token_invalid', 'admin:alert:suspicious_pattern'].forEach((eventName) => {
                sock.on(eventName, (payload = {}) => {
                    const kind = eventName.replace('admin:alert:', '');
                    const enriched = { ...payload, kind, severity: payload.severity || (kind === 'suspicious_pattern' ? 'critical' : 'warning') };
                    state.liveAlerts.unshift(enriched);
                    if (state.liveAlerts.length > MAX_LIVE_BUFFER) state.liveAlerts.length = MAX_LIVE_BUFFER;
                    onLiveAlertUpdate(enriched);
                });
            });

            sock.on('admin:stats:tick', (payload) => {
                state.liveStats = payload;
                state.liveStatsAt = new Date();
                onLiveStatsUpdate();
            });

            state.adminSocket = sock;
            socketReady = true;
        }
    } catch (error) {
        console.error('connectAdminSocket hiba:', error);
    }

    return socketReady;
}

/* =============================================================
   15) Live update handlerek - targeted DOM frissítés
   Re-render csak akkor, ha a chart NEM aktív (nem dashboard).
   ============================================================= */
function onLiveStatsUpdate() {
    if (state.currentSectionId === 'dashboard') {
        applyDashboardLiveStats();
    }
    // egyéb szekciók: amikor a user oda navigál, friss adat lesz
}

function onLiveAuditUpdate(audit) {
    if (state.currentSectionId === 'dashboard') {
        prependLiveFeedRow(liveFeedRow('audit', audit));
    } else if (state.currentSectionId === 'auditLog') {
        showSection('auditLog', null, { silent: true });
    }
}

function onLiveAlertUpdate(alert) {
    if (state.currentSectionId === 'dashboard') {
        prependLiveFeedRow(liveFeedRow('alert', alert));
    } else if (state.currentSectionId === 'alerts') {
        showSection('alerts', null, { silent: true });
    }
}

function applyDashboardLiveStats() {
    try {
        const stats = liveStatsOrFallback();
        const last24 = stats.last24h || {};
        const inGameValue = stats.online?.inGame ?? 0;

        setTextWithFlash('tickOnline',         stats.online?.totalUsers     ?? 0);
        setTextWithFlash('tickActiveTabs',     stats.online?.activeTabs ?? stats.online?.totalTabs ?? 0);
        setTextWithFlash('tickAdmins',         stats.online?.totalAdmins    ?? 0);
        setTextWithFlash('tickInGame',         inGameValue);
        setTextWithFlash('tickMatchmaking',    stats.online?.inMatchmaking  ?? 0);
        setTextWithFlash('tickPendingImages',  stats.pending?.profileImages ?? 0);
        setTextWithFlash('tickPendingFriends', stats.pending?.friendRequests ?? 0);
        setTextWithFlash('tickRateEsc',        stats.rateLimit?.activeEscalations ?? 0);

        setTextWithFlash('mainOnlineTotal',  stats.online?.totalUsers ?? 0);
        setTextWithFlash('mainInGame',       inGameValue);
        setTextWithFlash('mainAuditCount',   last24.auditEntries ?? 0);
        setTextWithFlash('mainAlertCount',   last24.alerts ?? 0);

        const onlineHint = document.getElementById('mainOnlineHint');
        if (onlineHint) {
            onlineHint.textContent = `${stats.online?.totalAdmins ?? 0} admin · ${stats.online?.activeTabs ?? stats.online?.totalTabs ?? 0} aktív tab`;
        }
        const critHint = document.getElementById('mainAuditCriticalHint');
        if (critHint) critHint.textContent = `${last24.criticalAuditEntries ?? 0} kritikus művelet`;
        const bansHint = document.getElementById('mainNewBansHint');
        if (bansHint) bansHint.textContent = `${last24.newBans ?? 0} új tiltás`;

        // Aktiv jatszma kartya allapot frissites (ures vs eles)
        const inGameCard = document.getElementById('mainInGameCard');
        if (inGameCard) {
            inGameCard.classList.toggle('stat-card-empty', inGameValue <= 0);
        }

        setTextWithFlash('mini24Logins',        last24.logins ?? 0);
        setTextWithFlash('mini24Registrations', last24.registrations ?? 0);
        setTextWithFlash('mini24Audit',         last24.auditEntries ?? 0);
        setTextWithFlash('mini24Critical',      last24.criticalAuditEntries ?? 0);
        setTextWithFlash('mini24Alerts',        last24.alerts ?? 0);
        setTextWithFlash('mini24Bans',          last24.newBans ?? 0);

        // Tick band relatv ido + flash
        const tickBand = document.getElementById('tickBand');
        if (tickBand) {
            tickBand.classList.add('tick-band-flash');
            setTimeout(() => tickBand.classList.remove('tick-band-flash'), 600);
        }
        setText('tickBandTime', state.liveStatsAt ? formatRelative(state.liveStatsAt) : '—');

        // Stale watchdog ujrainditasa
        rescheduleStaleWatchdog();
    } catch (err) {
        console.error('applyDashboardLiveStats hiba:', err);
    }
}

function prependLiveFeedRow(html) {
    try {
        const feed = document.getElementById('dashboardLiveFeed');
        if (feed) {
            // Ha eppen az "ures allapot" sor van benne, toroljuk
            const empty = feed.querySelector('.live-feed-empty');
            if (empty) empty.remove();
            // Ha demo modban voltunk, valts elesre
            feed.classList.remove('live-feed-demo');
            feed.dataset.feedState = 'live';

            feed.insertAdjacentHTML('afterbegin', html);
            while (feed.children.length > 25) feed.lastElementChild.remove();
            const newRow = feed.firstElementChild;
            if (newRow) {
                newRow.classList.add('live-feed-flash');
                setTimeout(() => newRow.classList.remove('live-feed-flash'), 1200);
            }
            const counter = document.getElementById('liveFeedCount');
            if (counter) counter.textContent = `${feed.querySelectorAll('.live-feed-row').length} esemény`;
            // Demo badge -> Live badge
            const meta = feed.parentElement?.querySelector('.live-feed-meta');
            const badge = meta?.querySelector('.data-source-badge');
            if (badge) {
                badge.classList.remove('data-source-demo');
                badge.classList.add('data-source-live');
                badge.title = 'Élő WS forrás';
                badge.innerHTML = '<i class="bi bi-broadcast"></i>Élő';
            }
        }
    } catch (err) {
        console.warn('prependLiveFeedRow hiba:', err);
    }
}

// =============================================================
// WS allapot - egy forras-igazsag setter, minden DOM-update innen
// =============================================================
function setWsStatus(nextKey) {
    try {
        const next = WS_STATUS[nextKey] ? nextKey : 'disconnected';
        state.wsStatus = next;
        applyWsStatusToDashboard();
    } catch (err) {
        console.error('setWsStatus hiba:', err);
    }
}

function applyWsStatusToDashboard() {
    try {
        const status = WS_STATUS[state.wsStatus] || WS_STATUS.disconnected;
        const btn = document.getElementById('wsStatusBtn');
        const labelEl = document.getElementById('wsStatusLabel');
        const timeEl = document.getElementById('wsStatusTime');
        const badge = document.getElementById('wsStatusBadge');
        const badgeLabel = document.getElementById('wsStatusBadgeLabel');
        const tickBand = document.getElementById('tickBand');
        const tickIndicator = document.getElementById('tickBandIndicator');

        if (btn) {
            // outline-* variansok cserje
            WS_STATUS_VARIANTS.forEach((v) => btn.classList.remove(`btn-outline-${v}`));
            btn.classList.add(`btn-outline-${status.variant}`);
            // status data-attribute (CSS hooks)
            btn.dataset.wsStatus = status.key;
            // spin osztaly
            btn.classList.toggle('ws-status-spin', Boolean(status.spin));
            // pill state classes
            ['no_token', 'connecting', 'connected', 'disconnected'].forEach((k) => btn.classList.remove(`ws-status-${k}`));
            btn.classList.add(`ws-status-${status.key}`);
            // disabled state ha nincs token (nincs mit reconnectalni)
            btn.disabled = status.key === 'no_token';
            btn.title = status.label;
            // ikon szinkronizalas
            const icon = btn.querySelector('i.bi');
            if (icon) {
                ['bi-broadcast-pin', 'bi-arrow-repeat', 'bi-plug', 'bi-shield-slash', 'bi-broadcast'].forEach((c) => icon.classList.remove(c));
                icon.classList.add(status.icon);
            }
        }
        if (labelEl) labelEl.textContent = status.label;
        if (timeEl)  timeEl.textContent = state.liveStatsAt ? `tick: ${formatRelative(state.liveStatsAt)}` : 'nincs tick';

        if (badge) {
            ['no_token', 'connecting', 'connected', 'disconnected'].forEach((k) => badge.classList.remove(`ws-feed-${k}`));
            badge.classList.add(`ws-feed-${status.key}`);
            badge.title = status.label;
            // dot osztaly cserje
            const dot = badge.querySelector('.ws-pill-dot');
            if (dot) {
                ['ws-dot-idle', 'ws-dot-connecting', 'ws-dot-live', 'ws-dot-down'].forEach((c) => dot.classList.remove(c));
                dot.classList.add(status.dotClass);
            }
        }
        if (badgeLabel) badgeLabel.textContent = status.short;

        if (tickBand) {
            tickBand.dataset.wsStatus = status.key;
        }
        if (tickIndicator) {
            tickIndicator.classList.toggle('text-success', status.key === 'connected');
            tickIndicator.classList.toggle('text-muted',   status.key !== 'connected');
        }

        // Manualis frissites gomb disabled-e ha nincs WS
        const refreshBtn = document.getElementById('manualRefreshBtn');
        if (refreshBtn && !state.manualRefreshLockUntil) {
            refreshBtn.disabled = status.key !== 'connected';
        }
    } catch (err) {
        console.error('applyWsStatusToDashboard hiba:', err);
    }
}

function rescheduleStaleWatchdog() {
    try {
        if (state.wsStaleTimerId) {
            clearTimeout(state.wsStaleTimerId);
            state.wsStaleTimerId = null;
        }
        state.wsStale = false;
        const tickBand = document.getElementById('tickBand');
        if (tickBand) tickBand.classList.remove('tick-band-stale');
        state.wsStaleTimerId = setTimeout(() => {
            state.wsStale = true;
            const band = document.getElementById('tickBand');
            if (band) band.classList.add('tick-band-stale');
            const timeEl = document.getElementById('wsStatusTime');
            if (timeEl && state.liveStatsAt) timeEl.textContent = `⚠ elavult (${formatRelative(state.liveStatsAt)})`;
        }, 15000);
    } catch (err) {
        console.warn('rescheduleStaleWatchdog hiba:', err);
    }
}

// Periodikus relativ ido frissites a fejlec pill-en es a tick-band-en (1 mp)
let __wsRelativeIntervalId = null;
function startWsRelativeTicker() {
    try {
        if (__wsRelativeIntervalId) clearInterval(__wsRelativeIntervalId);
        __wsRelativeIntervalId = setInterval(() => {
            const timeEl = document.getElementById('wsStatusTime');
            if (timeEl && state.liveStatsAt && !state.wsStale) {
                timeEl.textContent = `tick: ${formatRelative(state.liveStatsAt)}`;
            }
            const tickTime = document.getElementById('tickBandTime');
            if (tickTime && state.liveStatsAt) {
                tickTime.textContent = formatRelative(state.liveStatsAt);
            }
        }, 1000);
    } catch (err) {
        console.warn('startWsRelativeTicker hiba:', err);
    }
}

function reconnectAdminSocket() {
    try {
        if (!state.adminToken) {
            showToast('Nincs admin token — kérlek aktiváld újra.', 'warning', 'bi-shield-slash');
        } else {
            setWsStatus('connecting');
            connectAdminSocket();
            showToast('Újracsatlakozás folyamatban…', 'info', 'bi-arrow-repeat');
        }
    } catch (err) {
        console.error('reconnectAdminSocket hiba:', err);
    }
}

function requestStatsTick() {
    try {
        const sock = state.adminSocket;
        const refreshBtn = document.getElementById('manualRefreshBtn');
        if (!sock || !state.adminSocketConnected) {
            showToast('Nincs élő WS kapcsolat — a tick frissítés nem küldhető.', 'warning', 'bi-exclamation-triangle');
        } else if (Date.now() < state.manualRefreshLockUntil) {
            showToast('Túl gyors — várj egy pillanatot.', 'info', 'bi-hourglass-split');
        } else {
            sock.emit('admin:stats:request');
            // Loading state: 2 mp-ig disabled + spin ikon
            state.manualRefreshLockUntil = Date.now() + 2000;
            if (refreshBtn) {
                refreshBtn.disabled = true;
                refreshBtn.classList.add('btn-loading');
                const icon = refreshBtn.querySelector('i.bi');
                if (icon) icon.classList.add('spin');
                setTimeout(() => {
                    refreshBtn.disabled = state.wsStatus !== 'connected';
                    refreshBtn.classList.remove('btn-loading');
                    if (icon) icon.classList.remove('spin');
                    state.manualRefreshLockUntil = 0;
                }, 2000);
            }
        }
    } catch (error) {
        console.error('requestStatsTick hiba:', error);
        showToast('Tick frissítés hiba: ' + (error?.message || 'ismeretlen'), 'danger', 'bi-x-circle');
    }
}

/* =============================================================
   16) Toast + kritikus művelet modal helperek
   ============================================================= */
function showToast(message, variant = 'success', icon = 'bi-check-circle-fill') {
    let container = document.getElementById('adminToastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'adminToastContainer';
        container.className = 'admin-toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `admin-toast admin-toast-${variant}`;
    toast.innerHTML = `<i class="bi ${icon}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function openCriticalAction(action, targetLabel) {
    try {
        const modalEl = document.getElementById('criticalActionModal');
        if (modalEl && window.bootstrap?.Modal) {
            const titleMap = {
                'users.ban':              'Felhasználó tiltása',
                'users.delete':           'Felhasználó törlése',
                'chat.delete':            'Chat üzenet törlése',
                'notifications.broadcast':'Globális értesítés küldése',
                'admin.grant':            'Admin szerep kiosztása',
                'admin.revoke':           'Admin szerep visszavonása'
            };
            setText('criticalActionTitle', titleMap[action] || action);
            const desc = document.getElementById('criticalActionDescription');
            if (desc) {
                desc.innerHTML = `
                    <strong class="text-white">Művelet:</strong> <code class="text-gold">${escapeHtml(action)}</code><br>
                    <strong class="text-white">Cél:</strong> ${escapeHtml(targetLabel)}
                `;
            }
            const reasonField = document.getElementById('criticalReason');
            const counter = document.getElementById('criticalReasonCount');
            if (reasonField && counter) {
                reasonField.value = '';
                counter.textContent = '0';
                counter.parentElement.classList.remove('valid');
                reasonField.oninput = () => {
                    const len = reasonField.value.length;
                    counter.textContent = String(len);
                    counter.parentElement.classList.toggle('valid', len >= 30);
                };
            }
            const passwordField = document.getElementById('criticalPassword');
            if (passwordField) {
                passwordField.value = '';
            }
            new window.bootstrap.Modal(modalEl).show();
        } else {
            showToast(`A(z) ${action} még csak shell elem.`, 'info', 'bi-cone-striped');
        }
    } catch (error) {
        console.error('openCriticalAction hiba:', error);
        showToast('A kritikus művelet nézet még nem kész.', 'danger', 'bi-exclamation-triangle-fill');
    }
}

function executeCriticalAction() {
    try {
        const modalEl = document.getElementById('criticalActionModal');
        if (modalEl && window.bootstrap?.Modal) {
            window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
        }
        showToast('A kritikus művelet még nincs bekötve, ez csak shell.', 'info', 'bi-cone-striped');
    } catch (error) {
        console.error('executeCriticalAction hiba:', error);
        showToast('A kritikus művelet futtatása nem elérhető.', 'danger', 'bi-exclamation-triangle-fill');
    }
}

/* =============================================================
   17) Háttér műveletek (logout, export, modal)
   ============================================================= */
function exportUsers() {
    try {
        showToast('Az export még nincs bekötve, ez csak shell gomb.', 'info', 'bi-cone-striped');
    } catch (error) {
        console.error('exportUsers hiba:', error);
    }
}

function viewUser(userId) {
    let shown = false;
    try {
        const modalEl = document.getElementById('userModal');
        if (modalEl && window.bootstrap?.Modal) {
            new window.bootstrap.Modal(modalEl).show();
            shown = true;
        } else {
            showToast(`A felhasználó nézet még csak shell (id: ${userId}).`, 'info', 'bi-cone-striped');
        }
    } catch (error) {
        console.error('viewUser hiba:', error);
        showToast('A felhasználó nézet nem elérhető.', 'danger', 'bi-exclamation-triangle-fill');
    }

    return shown;
}

function logout() {
    let redirected = false;
    try {
        if (confirm('Biztosan ki szeretnél lépni?')) {
            requestController.cancelAll?.();
            clearAdminToken();
            window.location.href = '/';
            redirected = true;
        }
    } catch (error) {
        console.error('Logout hiba:', error);
    }

    return redirected;
}

/* =============================================================
   18) Activity chart
   ============================================================= */
function initChart() {
    const canvas = document.getElementById('activityChart');
    if (!canvas || typeof Chart === 'undefined') return;

    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(212, 175, 55, 0.4)');
    gradient.addColorStop(1, 'rgba(212, 175, 55, 0.0)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', 'Most'],
            datasets: [
                {
                    label: 'Online játékosok',
                    data: [2, 1, 4, 8, 12, 18, 14],
                    borderColor: '#d4af37', backgroundColor: gradient,
                    borderWidth: 3, fill: true, tension: 0.4,
                    pointBackgroundColor: '#d4af37', pointBorderColor: '#fff',
                    pointBorderWidth: 2, pointRadius: 4
                },
                {
                    label: 'Indított játszmák',
                    data: [1, 0, 2, 4, 6, 9, 7],
                    borderColor: '#3b82f6', backgroundColor: 'transparent',
                    borderWidth: 2, borderDash: [5, 5], tension: 0.4, pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8', font: { family: 'Inter' } } } },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(51, 65, 85, 0.5)' }, ticks: { color: '#94a3b8', font: { family: 'Inter' }, precision: 0 } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { family: 'Inter' } } }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
}

/* =============================================================
   19) Profilkép moderáció - admin tokennel
   ============================================================= */
window.MattMesterAdminProfileImages = (function initAdminProfileImages() {
    const STATE = { loading: false, bound: false };

    function setMessage(type, message) {
        const el = document.getElementById('profileImageReviewMessage');
        if (!el) return;
        if (!message) {
            el.className = 'alert d-none';
            el.textContent = '';
        } else {
            el.className = `alert alert-${type}`;
            el.textContent = message;
        }
    }

    function renderRows(rows) {
        const tbody = document.getElementById('profileImageReviewTableBody');
        if (!tbody) return;
        if (!rows || !rows.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-secondary py-4">Nincs függő profilkép.</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map((row) => {
            const safeUsername = escapeHtml(row.username || '');
            const safeFilename = escapeHtml(row.filename || '/profile_pictures/default.png');
            const safeUploadTime = escapeHtml(row.uploadTime || '');
            const safeUploadId = Number(row.uploadId) || 0;
            return `
                <tr data-upload-id="${safeUploadId}">
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            <strong>${safeUsername}</strong>
                            <span class="text-secondary small">#${escapeHtml(row.userId)}</span>
                        </div>
                    </td>
                    <td>
                        <a href="${safeFilename}" target="_blank" rel="noopener noreferrer">
                            <img src="${safeFilename}" alt="Pending profilkép" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.1);">
                        </a>
                    </td>
                    <td><span class="text-secondary small">${safeUploadTime}</span></td>
                    <td class="text-end">
                        <button type="button" class="btn btn-success btn-sm me-2" data-action="approve" data-upload-id="${safeUploadId}">
                            <i class="bi bi-check-circle me-1"></i>Jóváhagy
                        </button>
                        <button type="button" class="btn btn-outline-danger btn-sm" data-action="reject" data-upload-id="${safeUploadId}">
                            <i class="bi bi-x-circle me-1"></i>Elutasít
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function refresh() {
        let refreshed = false;
        try {
            if (!STATE.loading) {
                STATE.loading = true;
                setMessage(null, '');

                const response = await fetch('/api/admin/profile-images/pending', {
                    headers: adminAuthHeaders(),
                    credentials: 'same-origin'
                });
                const result = await response.json().catch(() => ({}));
                const authHandled = response.status === 401 && handleAdminAuthError(result?.code || '');
                if (authHandled) {
                    renderRows([]);
                } else if (!response.ok || !result?.success) {
                    throw new Error(result?.message || 'Hiba a függő profilképek lekérdezése során.');
                } else {
                    renderRows(result.data || []);
                    refreshed = true;
                }
            }
        } catch (error) {
            console.error('admin profile-images pending fetch hiba:', error);
            setMessage('danger', error.message || 'Hiba a lekérdezés során.');
            renderRows([]);
        } finally {
            STATE.loading = false;
        }

        return refreshed;
    }

    async function approve(uploadId) {
        let approved = false;
        try {
            setMessage('success', 'A profilkép jóváhagyás nézetben van, de a backend művelet még nincs bekötve.');
            approved = true;
            await refresh();
        } catch (error) {
            console.error('admin profile-image approve hiba:', error);
            setMessage('danger', error.message || 'A jóváhagyás sikertelen.');
        }

        return approved;
    }

    async function reject(uploadId) {
        const reviewNoteRaw = window.prompt('Add meg az elutasítás indokát (opcionális, max 500 karakter):', '') || '';
        const reviewNote = reviewNoteRaw.trim().slice(0, 500);
        let rejected = false;
        try {
            setMessage('success', reviewNote ? `Elutasítási indok rögzítve: ${reviewNote}` : 'Az elutasítás nézetben van, de a backend művelet még nincs bekötve.');
            rejected = true;
            await refresh();
        } catch (error) {
            console.error('admin profile-image reject hiba:', error);
            setMessage('danger', error.message || 'Az elutasítás sikertelen.');
        }

        return rejected;
    }

    function bind() {
        if (STATE.bound) return;
        STATE.bound = true;

        document.addEventListener('click', (event) => {
            if (event.target.closest('#profileImageReviewRefresh')) {
                event.preventDefault();
                refresh();
                return;
            }
            const btn = event.target.closest('button[data-action][data-upload-id]');
            if (btn && btn.closest('#profileImageReviewTableBody')) {
                const uploadId = Number(btn.dataset.uploadId) || 0;
                if (!uploadId) return;
                const action = btn.dataset.action;
                if (action === 'approve') approve(uploadId);
                else if (action === 'reject') reject(uploadId);
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => runSafely('admin profile-image bind', bind));
    return { refresh, approve, reject };
})();

/* =============================================================
   20) Init
   ============================================================= */
function initResponsiveSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const apply = () => {
        if (window.innerWidth < 992) {
            sidebar?.classList.add('collapsed');
            mainContent?.classList.add('expanded');
        }
    };
    apply();
    window.addEventListener('resize', apply);
}

document.addEventListener('DOMContentLoaded', () => {
    runSafely('adminDOMContentLoaded', () => {
        renderSidebar();
        showSection(DEFAULT_SECTION);
        initResponsiveSidebar();
        updateTokenPill();          // initial: 00:00 expired pill
        window.MattMesterChatModal?.init();
        // Auth bootstrap: session check + elevate modal
        bootstrapAdminAuth();
    });
});
