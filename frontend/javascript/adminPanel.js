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
            if (diffSec < 5) result = 'Épp most';
            else if (diffSec < 60) result = `${diffSec} mp-e`;
            else if (diffSec < 3600) result = `${Math.floor(diffSec / 60)} perce`;
            else if (diffSec < 86400) result = `${Math.floor(diffSec / 3600)} órája`;
            else result = `${Math.floor(diffSec / 86400)} napja`;
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
    header: ({ icon, title, subtitle, actions = [], liveStatus = true }) => {
        const liveActions = liveStatus ? buildWsLiveActions() : [];
        const allActions = [...liveActions, ...actions];
        return `
        <header class="section-header">
            <div class="section-header-text">
                <h2 class="section-title"><i class="bi ${icon} me-2 text-gold"></i>${title}</h2>
                ${subtitle ? `<p class="section-subtitle">${subtitle}</p>` : ''}
            </div>
            ${allActions.length ? `<div class="section-header-actions">${allActions.map(h.btn).join('')}</div>` : ''}
        </header>
    `;
    },

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
    info: { label: 'Info', icon: 'bi-info-circle-fill', cls: 'sev-info' },
    warning: { label: 'Warning', icon: 'bi-exclamation-triangle-fill', cls: 'sev-warning' },
    critical: { label: 'Critical', icon: 'bi-exclamation-octagon-fill', cls: 'sev-critical' }
};
const ALERT_KIND = {
    unauthorized: { label: 'Jogosulatlan próba', icon: 'bi-shield-fill-x' },
    rate_escalated: { label: 'Rate limit szigorítás', icon: 'bi-speedometer2' },
    token_invalid: { label: 'Token hiba', icon: 'bi-key-fill' },
    suspicious_pattern: { label: 'Gyanús minta', icon: 'bi-bug-fill' }
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
    active: { label: 'Aktív', cls: 'badge-status-active' },
    banned: { label: 'Tiltott', cls: 'badge-status-banned' },
    pending: { label: 'Függő', cls: 'badge-status-pending' },
    live: { label: 'Folyamatban', cls: 'bg-success' },
    finished: { label: 'Befejezett', cls: 'bg-secondary' }
};
const ROLE_BADGE = {
    admin: { label: 'Admin', cls: 'badge-role-admin' },
    player: { label: 'Játékos', cls: 'badge-role-player' }
};
const RISK_BADGE = {
    low: { label: 'Alacsony', cls: 'bg-success' },
    medium: { label: 'Közepes', cls: 'bg-warning text-dark' },
    high: { label: 'Magas', cls: 'bg-danger' }
};
const statusPill = (key) => `<span class="badge ${STATUS_BADGE[key].cls}">${STATUS_BADGE[key].label}</span>`;
const rolePill = (key) => `<span class="badge ${ROLE_BADGE[key].cls}">${ROLE_BADGE[key].label}</span>`;
const riskPill = (key) => `<span class="badge ${RISK_BADGE[key].cls}">${RISK_BADGE[key].label}</span>`;

/* =============================================================
   3.5) WS allapot - egy forras-igazsag a fejlec pill, feed badge,
        tick-band, kezi frissites gomb szamara.
   ============================================================= */
const WS_STATUS = Object.freeze({
    no_token: { key: 'no_token', label: 'Nincs admin token', short: 'Nincs token', variant: 'secondary', icon: 'bi-shield-slash', dotClass: 'ws-dot-idle', spin: false },
    connecting: { key: 'connecting', label: 'Csatlakozás…', short: 'Csatlakozás…', variant: 'warning', icon: 'bi-arrow-repeat', dotClass: 'ws-dot-connecting', spin: true },
    connected: { key: 'connected', label: 'Élő — WS /admin', short: 'Élő', variant: 'success', icon: 'bi-broadcast-pin', dotClass: 'ws-dot-live', spin: false },
    disconnected: { key: 'disconnected', label: 'Megszakadt — újrapróbálom', short: 'Offline', variant: 'danger', icon: 'bi-plug', dotClass: 'ws-dot-down', spin: false }
});
const WS_STATUS_VARIANTS = ['success', 'warning', 'danger', 'secondary'];

// Az Élő-WS/admin pill + kézi frissítés gomb két "action" item-je. Minden
// section-header automatikusan kapja (h.header), így bárhol látható és
// funkcionális, ahogyan a Vezérlőpulton is.
function buildWsLiveActions() {
    const wsStatus = WS_STATUS[state.wsStatus] || WS_STATUS.no_token;
    const tickText = state.liveStatsAt ? `tick: ${formatRelative(state.liveStatsAt)}` : 'nincs tick';
    return [
        {
            label: `<span class="ws-pill-content">
                        <span class="ws-pill-dot ${wsStatus.dotClass}" aria-hidden="true"></span>
                        <span class="ws-pill-label" id="wsStatusLabel">${wsStatus.label}</span>
                        <span class="ws-pill-time" id="wsStatusTime">${tickText}</span>
                    </span>`,
            variant: `outline-${wsStatus.variant}`,
            size: 'sm',
            attrs: `id="wsStatusBtn" data-ws-status="${wsStatus.key}" title="WS /admin kapcsolat állapota — kattintásra újracsatlakozás" aria-label="WebSocket kapcsolat állapota: ${wsStatus.label}"`,
            icon: wsStatus.icon,
            classes: `ws-status-pill ws-status-${wsStatus.key}${wsStatus.spin ? ' ws-status-spin' : ''}`,
            onclick: 'reconnectAdminSocket()'
        },
        {
            label: 'Kézi frissítés',
            icon: 'bi-arrow-clockwise',
            size: 'sm',
            attrs: 'id="manualRefreshBtn"',
            onclick: 'requestStatsTick()'
        }
    ];
}

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

    // 24h activity chart state (REST fetch /api/admin/stats/activity)
    activityChart: {
        status: 'idle',           // idle | loading | loaded | empty | error
        loadedAt: null,           // Date — utolso sikeres fetch
        labels: null,
        datasets: null,
        totals: null,
        error: null,
        chartInstance: null
    },
    activityRefreshIntervalId: null,

    // Real-time data buffers (WS-ből töltődnek)
    liveStats: null,              // admin:stats:tick legutolsó payload
    liveStatsAt: null,            // utolsó tick időpontja
    liveAudit: [],                // admin:audit:created események (legújabb elöl)
    liveAlerts: [],               // admin:alert:* események (legújabb elöl)

    // Felhasználók szekció (Lista) - REST + szűrés + lazy loading
    users: {
        list: [],                 // teljes user lista (REST /api/admin/users/list)
        loadedAt: null,           // utolsó sikeres fetch ideje
        loading: false,           // épp folyik egy fetch?
        error: null,              // hibatext, ha a legutóbbi fetch elhasalt
        filters: {
            search: '',           // szöveg keresés (név/email)
            role: '',             // '', 'player', 'admin'
            status: '',           // '', 'active', 'banned'
            orderBy: 'lastActive' // 'lastActive', 'username', 'elo', 'createdAt'
        },
        visibleCount: 50,         // hány sor van renderelve a listából (lazy load)
        observer: null,           // IntersectionObserver
        searchDebounceId: null,   // debounce setTimeout id
        rowSignatures: new Map()  // userId -> signature string (diff-flashhez)
    },

    // Kiválasztott user — szerkesztés / tiltás prefillhez
    selectedUserId: null,
    selectedUser: null,

    // User-megtekintés modal állapota
    userView: {
        userId: null,
        activeTab: 'target',      // 'target' | 'actor' | 'security'
        refreshTimerId: null,     // egysegesitett 5 mp-es modal-frissito timer
        target: { items: [], loading: false, error: null, loadedAt: null },
        actor: { items: [], loading: false, error: null, loadedAt: null },
        security: { items: [], loading: false, error: null, loadedAt: null, filter: 'all' },
        presence: { online: false, tabs: [], loadedAt: null, refreshTimerId: null }
    },

    // Section navigation
    currentSectionId: null
};

const MAX_LIVE_BUFFER = 50;

/* =============================================================
   5) Demo adatok (fallback amíg WS nem küld semmit)
   ============================================================= */
const SAMPLE = {
    users: [
        { username: 'MagnusCarlsen', name: 'Magnus Carlsen', email: 'magnus@chess.hu', elo: 2847, role: 'admin', status: 'active', last: '2 perce', joined: '2024-01-15', profile_image: '/profile_pictures/default.png' },
        { username: 'HikaruNakamura', name: 'Hikaru Nakamura', email: 'hikaru@chess.hu', elo: 2768, role: 'player', status: 'active', last: '5 órája', joined: '2024-02-20', profile_image: '/profile_pictures/default.png' },
        { username: 'AnishGiri', name: 'Anish Giri', email: 'anish@chess.hu', elo: 0, role: 'player', status: 'banned', last: '—', joined: '2024-03-10', struck: true, profile_image: '/profile_pictures/default.png' }
    ],
    games: [
        { id: '#4932', white: 'Carlsen (2847)', black: 'Nakamura (2768)', status: 'live', winner: '—', moves: 24, time: '10+0' },
        { id: '#4931', white: 'Firouzja (2785)', black: 'Ding (2812)', status: 'finished', winner: 'Ding Liren', moves: 67, time: '3+2' },
        { id: '#4930', white: 'SakkMester99', black: 'RookRider', status: 'live', winner: '—', moves: 8, time: '5+0' }
    ],
    logins: [
        { user: 'Magnus Carlsen', ip: '192.168.1.10', location: 'Budapest, HU', device: 'Chrome / Windows', deviceIcon: 'bi-browser-chrome', time: 'Most', risk: 'low' },
        { user: 'Hikaru Nakamura', ip: '127.0.0.1', location: 'localhost', device: 'Firefox / Linux', deviceIcon: 'bi-browser-firefox', time: '5 perce', risk: 'low' },
        { user: 'SakkMester99', ip: '192.168.1.42', location: 'Budapest, HU', device: 'Safari / macOS', deviceIcon: 'bi-browser-safari', time: '12 perce', risk: 'medium' }
    ]
};

const SAMPLE_AUDIT = [
    {
        eventId: 12345, occurredAt: new Date(Date.now() - 60000).toISOString(),
        actor: { username: 'admin' }, action: 'users.ban', severity: 'critical',
        target: { type: 'user', id: 47, label: 'spammer42' },
        reason: 'Reklámspam a játék-chat csatornán; harmadik figyelmeztetés.',
        diff: { before: { is_banned: false }, after: { is_banned: true } }
    },
    {
        eventId: 12344, occurredAt: new Date(Date.now() - 180000).toISOString(),
        actor: { username: 'admin' }, action: 'users.edit_profile', severity: 'info',
        target: { type: 'user', id: 12, label: 'SakkMester99' },
        reason: 'ELO korrekció helytelen pontozás miatt.',
        diff: { before: { elo: 1500 }, after: { elo: 1450 } }
    },
    {
        eventId: 12343, occurredAt: new Date(Date.now() - 360000).toISOString(),
        actor: { username: 'modBéla' }, action: 'profile_image.review', severity: 'info',
        target: { type: 'profile_image', id: 88, label: 'RookRider' },
        reason: 'Megfelelő profilkép, jóváhagyva.',
        diff: { before: { status: 'pending' }, after: { status: 'approved' } }
    }
];

const SAMPLE_ALERTS = [
    {
        alertId: 882, occurredAt: new Date(Date.now() - 90000).toISOString(),
        kind: 'unauthorized', severity: 'warning',
        ip: '203.0.113.55', userId: null, endpoint: 'GET /api/admin/users',
        detail: { reason: 'no_session' }
    },
    {
        alertId: 881, occurredAt: new Date(Date.now() - 240000).toISOString(),
        kind: 'token_invalid', severity: 'warning',
        ip: '127.0.0.1', userId: 12, endpoint: 'POST /api/admin/users/ban',
        detail: { reason: 'token_expired' }
    }
];

const SAMPLE_ADMINS = [
    { id: 1, name: 'Nagymester Admin', email: 'admin@mattmester.hu', isSuper: true, joined: '2024-01-01', lastSeen: 'Most' },
    { id: 8, name: 'ModeratorBéla', email: 'bela@mattmester.hu', isSuper: false, joined: '2024-08-12', lastSeen: '15 perce' }
];

/* =============================================================
   6) Live data hozzáférési helperek
   ============================================================= */
function liveStatsOrFallback() {
    return state.liveStats || {
        online: { totalUsers: 0, totalAdmins: 0, inGame: 0, inMatchmaking: 0, activeTabs: 0, totalTabs: 0, totalSockets: 0 },
        pending: { profileImages: 0, friendRequests: 0 },
        last24h: { logins: 0, registrations: 0, auditEntries: 0, criticalAuditEntries: 0, alerts: 0, newBans: 0 },
        rateLimit: { activeEscalations: 0 }
    };
}

const auditList = () => (state.liveAudit.length ? state.liveAudit : SAMPLE_AUDIT);
const alertsList = () => (state.liveAlerts.length ? state.liveAlerts : SAMPLE_ALERTS);

// Egy forras-igazsag a dashboard live-feed-jehez: csak a valos WS bufferbol
// veszunk adatot. Demo / SAMPLE adat NEM jelenik meg — ha nincs esemeny,
// az ures allapot szovege egyertelmuen megmondja, miert nincs.
function liveDataSource(kind) {
    let result = { items: [], reason: 'no_data', kind };
    try {
        const buffer = kind === 'audit' ? state.liveAudit : (kind === 'alert' ? state.liveAlerts : []);
        if (buffer && buffer.length) {
            result = { items: buffer, reason: 'live', kind };
        } else if (!state.adminToken) {
            result = { items: [], reason: 'no_token', kind };
        } else if (!state.adminSocketConnected) {
            result = { items: [], reason: 'offline', kind };
        } else {
            result = { items: [], reason: 'empty', kind };
        }
    } catch (err) {
        console.warn('liveDataSource hiba:', err);
        result = { items: [], reason: 'error', kind };
    }
    return result;
}

// Legutolso esemeny idopontja az audit + alert listakbol (a meta sav "Utolso: X" feliratahoz).
function latestEventTime(auditItems, alertItems) {
    let result = null;
    try {
        const candidates = [];
        (auditItems || []).forEach((a) => { if (a?.occurredAt) candidates.push(new Date(a.occurredAt).getTime()); });
        (alertItems || []).forEach((a) => { if (a?.occurredAt) candidates.push(new Date(a.occurredAt).getTime()); });
        const valid = candidates.filter((n) => Number.isFinite(n));
        if (valid.length) {
            result = new Date(Math.max(...valid));
        }
    } catch (err) {
        console.warn('latestEventTime hiba:', err);
        result = null;
    }
    return result;
}

// Reason -> emberi szoveg + ikon, a feed ures allapota es hibajelzes szamara.
function feedEmptyMessage(reason) {
    let result = { icon: 'bi-inbox', title: 'Nincs adat', sub: '' };
    if (reason === 'no_token') {
        result = {
            icon: 'bi-shield-slash', title: 'Nincs admin token',
            sub: 'A bejövő események betöltéséhez aktív admin step-up token szükséges.'
        };
    } else if (reason === 'offline') {
        result = {
            icon: 'bi-plug', title: 'WS /admin offline',
            sub: 'A WebSocket kapcsolat megszakadt — kattints a fejléc pill-jén az újracsatlakozáshoz.'
        };
    } else if (reason === 'empty') {
        result = {
            icon: 'bi-inbox', title: 'Még nem érkezett esemény',
            sub: 'Az új audit / riasztás sorok automatikusan ide kerülnek, amint történik valami.'
        };
    } else if (reason === 'error') {
        result = {
            icon: 'bi-exclamation-triangle', title: 'Hiba a feed betöltésénél',
            sub: 'Ellenőrizd a böngésző konzolt a részletekért.'
        };
    }
    return result;
}

const formatAuditTime = (iso) => {
    try { return formatHM(iso); } catch (_) { return iso || '—'; }
};

const formatDateOnly = (iso) => {
    let out = '—';
    try {
        if (iso) {
            const d = iso instanceof Date ? iso : new Date(iso);
            if (!Number.isNaN(d.getTime())) {
                out = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}.`;
            }
        }
    } catch (err) {
        console.warn('formatDateOnly hiba:', err);
    }
    return out;
};

/* =============================================================
   6.5) Felhasználói lista — szűrés + lazy loading + REST
   ============================================================= */
const ADMIN_USERS_PAGE_SIZE = 50;
const ADMIN_USER_DETAIL_IMAGE_MAX_SIZE_BYTES = 3 * 1024 * 1024;
const ADMIN_USER_DETAIL_IMAGE_ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ADMIN_USER_ROLE_OPTIONS = ['player', 'admin'];

// Egy felhasználó "signature"-je: rövid string ami akkor változik, ha vmi
// vizuálisan releváns mezője módosult. Diff-flash-hoz használjuk.
function buildUserSignature(user) {
    let signature = '';
    try {
        if (user) {
            signature = [
                user.username, user.email, user.role,
                user.elo, user.eloMM, user.eloBullet,
                user.wins, user.losses, user.draws,
                user.isBanned ? '1' : '0',
                user.bannedUntil || '',
                user.lastActive || '',
                user.profileImage || '',
                user.online ? '1' : '0',
                user.presenceTabCount || 0,
                user.presenceCurrentPage || ''
            ].join('|');
        }
    } catch (err) {
        console.warn('buildUserSignature hiba:', err);
    }
    return signature;
}

// Egy user "Állapot" cellaja: online/offline + tiltott jelzes.
function renderUserStatusCell(user) {
    let html = '';
    try {
        const banned = Boolean(user?.isBanned);
        const online = Boolean(user?.online);
        const tabCount = Number(user?.presenceTabCount || 0);
        const onlineHtml = online
            ? `<span class="user-presence user-presence-online" title="Online · ${tabCount} aktív tab">
                  <span class="user-presence-dot"></span>Online${tabCount > 1 ? ` <span class="user-presence-tabs">${tabCount}</span>` : ''}
               </span>`
            : `<span class="user-presence user-presence-offline" title="Offline"><span class="user-presence-dot"></span>Offline</span>`;
        const bannedHtml = banned ? `<span class="badge badge-status-banned ms-1">Tiltott</span>` : '';
        html = `<div class="user-status-cell">${onlineHtml}${bannedHtml}</div>`;
    } catch (err) {
        console.warn('renderUserStatusCell hiba:', err);
        html = '—';
    }
    return html;
}

// Email verifikalt / nem verifikalt jelolo - kis pill, ikonnal + tooltip-pel.
function renderEmailVerifiedBadge(user) {
    let html = '';
    try {
        const verified = Boolean(user?.emailVerified);
        const verifiedAt = user?.emailVerifiedAt ? new Date(user.emailVerifiedAt) : null;
        const tooltip = verified
            ? (verifiedAt && !Number.isNaN(verifiedAt.getTime())
                ? `Email megerősítve: ${verifiedAt.toLocaleString('hu-HU')}`
                : 'Email megerősítve')
            : 'Az email cím nincs megerősítve.';
        if (verified) {
            html = `<span id="adminUserViewEmailVerified" class="email-verified-badge is-verified" title="${escapeHtml(tooltip)}">
                        <i class="bi bi-patch-check-fill"></i>Megerősítve
                    </span>`;
        } else {
            html = `<span id="adminUserViewEmailVerified" class="email-verified-badge is-unverified" title="${escapeHtml(tooltip)}">
                        <i class="bi bi-exclamation-circle-fill"></i>Nem megerősítve
                    </span>`;
        }
    } catch (err) {
        console.warn('renderEmailVerifiedBadge hiba:', err);
        html = '<span id="adminUserViewEmailVerified" class="email-verified-badge"></span>';
    }
    return html;
}

// Profilkep statusz pill (approved / pending / rejected / default / null).
function renderProfileImageStatusBadge(user) {
    let html = '';
    try {
        const status = String(user?.profileImageStatus || '').toLowerCase();
        const labels = {
            approved: { icon: 'bi-image-fill', label: 'Profilkép: jóváhagyott', cls: 'is-approved' },
            pending: { icon: 'bi-hourglass-split', label: 'Profilkép: jóváhagyásra vár', cls: 'is-pending' },
            rejected: { icon: 'bi-image-alt', label: 'Profilkép: elutasítva', cls: 'is-rejected' },
            default: { icon: 'bi-person-circle', label: 'Profilkép: alapértelmezett', cls: 'is-default' }
        };
        const meta = labels[status] || labels.default;
        const noUpload = !status;
        const finalMeta = noUpload ? labels.default : meta;
        html = `<span id="adminUserViewImageStatus" class="profile-image-status-badge ${finalMeta.cls}" title="${escapeHtml(finalMeta.label)}">
                    <i class="bi ${finalMeta.icon}"></i>${escapeHtml(finalMeta.label.replace('Profilkép: ', ''))}
                </span>`;
    } catch (err) {
        console.warn('renderProfileImageStatusBadge hiba:', err);
        html = '<span id="adminUserViewImageStatus" class="profile-image-status-badge"></span>';
    }
    return html;
}

// 3 ELO ertek tomor "trio" megjelenitese (Klasszikus / MattMester / Bullet).
function renderEloTrio(user) {
    let html = '';
    try {
        const elo = Number(user?.elo || 0);
        const eloMM = Number(user?.eloMM || 0);
        const eloBullet = Number(user?.eloBullet || 0);
        html = `
            <div class="elo-trio" title="Klasszikus / MattMester / Bullet">
                <span class="elo-trio-item" data-kind="classic"   title="Klasszikus">${elo}</span>
                <span class="elo-trio-sep">/</span>
                <span class="elo-trio-item is-primary" data-kind="mm" title="MattMester">${eloMM}</span>
                <span class="elo-trio-sep">/</span>
                <span class="elo-trio-item" data-kind="bullet"    title="Bullet">${eloBullet}</span>
            </div>
        `;
    } catch (err) {
        console.warn('renderEloTrio hiba:', err);
        html = '—';
    }
    return html;
}

function renderEmailVerifiedBadgeInline(user) {
    let html = '';
    try {
        const verified = Boolean(user?.emailVerified);
        const verifiedAt = user?.emailVerifiedAt ? new Date(user.emailVerifiedAt) : null;
        const tooltip = verified
            ? (verifiedAt && !Number.isNaN(verifiedAt.getTime())
                ? `Email megerősítve: ${verifiedAt.toLocaleString('hu-HU')}`
                : 'Email megerősítve')
            : 'Az email cím nincs megerősítve.';
        if (verified) {
            html = `<span class="email-verified-badge is-verified" title="${escapeHtml(tooltip)}">
                        <i class="bi bi-patch-check-fill"></i>Megerősítve
                    </span>`;
        } else {
            html = `<span class="email-verified-badge is-unverified" title="${escapeHtml(tooltip)}">
                        <i class="bi bi-exclamation-circle-fill"></i>Nem megerősítve
                    </span>`;
        }
    } catch (err) {
        console.warn('renderEmailVerifiedBadgeInline hiba:', err);
        html = '<span class="email-verified-badge is-unverified"><i class="bi bi-exclamation-circle-fill"></i>Nem megerősítve</span>';
    }
    return html;
}

function renderProfileImageStatusBadgeInline(user) {
    let html = '';
    try {
        const status = String(user?.profileImageStatus || '').toLowerCase();
        const labels = {
            approved: { icon: 'bi-image-fill', label: 'Jóváhagyott', cls: 'is-approved', tip: 'Profilkép: jóváhagyott' },
            pending: { icon: 'bi-hourglass-split', label: 'Függő', cls: 'is-pending', tip: 'Profilkép: jóváhagyásra vár' },
            rejected: { icon: 'bi-image-alt', label: 'Elutasított', cls: 'is-rejected', tip: 'Profilkép: elutasítva' },
            default: { icon: 'bi-person-circle', label: 'Alapértelmezett', cls: 'is-default', tip: 'Profilkép: alapértelmezett' }
        };
        const meta = labels[status] || labels.default;
        html = `<span class="profile-image-status-badge ${meta.cls}" title="${escapeHtml(meta.tip)}">
                    <i class="bi ${meta.icon}"></i>${escapeHtml(meta.label)}
                </span>`;
    } catch (err) {
        console.warn('renderProfileImageStatusBadgeInline hiba:', err);
        html = '<span class="profile-image-status-badge is-default"><i class="bi bi-person-circle"></i>Alapértelmezett</span>';
    }
    return html;
}

function renderPresenceStatusBadgeInline(user) {
    const isOnline = Boolean(user?.online);
    return isOnline
        ? '<span class="badge badge-status-active"><i class="bi bi-circle-fill me-1"></i>Online</span>'
        : '<span class="badge badge-status-pending"><i class="bi bi-circle me-1"></i>Offline</span>';
}

function getAdminRoleOptions(user) {
    const knownRoles = new Set(ADMIN_USER_ROLE_OPTIONS);
    const userRole = String(user?.role || '').trim();
    if (userRole) knownRoles.add(userRole);
    const roles = Array.from(knownRoles);
    return roles.map((role) => ({
        value: role,
        label: role === 'admin' ? 'Adminisztrátor' : (role === 'player' ? 'Játékos' : role.charAt(0).toUpperCase() + role.slice(1)),
        selected: String(userRole || 'player') === role
    }));
}

// Aktuális szűrt + rendezett user lista (a teljes state.users.list-ből).
function getFilteredAdminUsers() {
    let result = [];
    try {
        const filters = state.users.filters;
        const search = (filters.search || '').trim().toLowerCase();
        const role = filters.role || '';
        const status = filters.status || '';
        const orderBy = filters.orderBy || 'lastActive';
        const list = Array.isArray(state.users.list) ? state.users.list : [];

        const filtered = list.filter((u) => {
            const matchesSearch = !search
                || (u.username && u.username.toLowerCase().includes(search))
                || (u.email && u.email.toLowerCase().includes(search));
            const matchesRole = !role || u.role === role;
            const matchesStatus = !status
                || (status === 'active' && !u.isBanned)
                || (status === 'banned' && u.isBanned)
                || (status === 'online' && u.online)
                || (status === 'offline' && !u.online);
            return matchesSearch && matchesRole && matchesStatus;
        });

        const sorted = filtered.slice().sort((a, b) => {
            let cmp = 0;
            if (orderBy === 'username') {
                cmp = String(a.username || '').localeCompare(String(b.username || ''), 'hu');
            } else if (orderBy === 'elo') {
                cmp = Number(b.elo || 0) - Number(a.elo || 0);
            } else if (orderBy === 'createdAt') {
                cmp = new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
            } else {
                // 'lastActive' (default)
                cmp = new Date(b.lastActive || 0).getTime() - new Date(a.lastActive || 0).getTime();
            }
            return cmp;
        });

        result = sorted;
    } catch (err) {
        console.error('getFilteredAdminUsers hiba:', err);
        result = [];
    }
    return result;
}

// REST fetch — try-catch wrap. silent=true esetén nem mutat loading állapotot
// (pl. periodikus refresh stats:tick-re).
async function loadAdminUsersList(options = {}) {
    const silent = options.silent === true;
    let success = false;
    try {
        if (!state.adminToken) {
            state.users.error = 'Nincs admin token — a felhasználói lista nem tölthető be.';
            state.users.loading = false;
            renderAdminUsersTable({ reason: 'no_token' });
        } else {
            if (!silent) {
                state.users.loading = true;
                renderAdminUsersTable({ reason: 'loading' });
            }
            const headers = adminAuthHeaders({ Accept: 'application/json' });
            const response = await fetch('/api/admin/users/list', {
                method: 'GET',
                credentials: 'same-origin',
                headers
            });

            if (!response.ok) {
                let bodyMessage = `HTTP ${response.status}`;
                try {
                    const body = await response.json();
                    if (body?.message) bodyMessage = body.message;
                } catch (_) { /* nem JSON */ }
                if (response.status === 401 || response.status === 403) {
                    handleAdminAuthError('admin_token_required');
                }
                state.users.error = bodyMessage;
                state.users.loading = false;
                renderAdminUsersTable({ reason: 'error' });
            } else {
                const json = await response.json();
                if (!json?.success || !Array.isArray(json.data)) {
                    state.users.error = json?.message || 'Ismeretlen válasz a szervertől.';
                    state.users.loading = false;
                    renderAdminUsersTable({ reason: 'error' });
                } else {
                    state.users.list = json.data;
                    if (state.selectedUserId !== null) {
                        const selectedId = Number(state.selectedUserId);
                        const selected = json.data.find((u) => Number(u.id) === selectedId) || null;
                        state.selectedUser = selected;
                        if (!selected) state.selectedUserId = null;
                    }
                    state.users.loadedAt = new Date();
                    state.users.error = null;
                    state.users.loading = false;
                    renderAdminUsersTable({ reason: silent ? 'refresh' : 'loaded' });
                    success = true;
                }
            }
        }
    } catch (err) {
        console.error('loadAdminUsersList hiba:', err);
        state.users.error = err?.message || 'Hálózati hiba.';
        state.users.loading = false;
        renderAdminUsersTable({ reason: 'error' });
    }
    return success;
}

/* =============================================================
   7) Navigációs fa
   ============================================================= */
const NAV_TREE = [
    { id: 'dashboard', label: 'Vezérlőpult', icon: 'bi-grid-1x2-fill', leaf: true },

    {
        id: 'group-users', label: 'Felhasználók', icon: 'bi-people-fill', open: true,
        items: [
            { id: 'users', label: 'Lista', icon: 'bi-list-ul' },
            { id: 'userDetail', label: 'Részletek és szerkesztés', icon: 'bi-person-vcard' },
            { id: 'userBan', label: 'Tiltások', icon: 'bi-slash-circle' }
        ]
    },

    {
        id: 'group-moderation', label: 'Moderáció', icon: 'bi-shield-exclamation',
        items: [
            { id: 'chats', label: 'Chat moderálás', icon: 'bi-chat-dots-fill' },
            { id: 'profileImageReview', label: 'Profilképek', icon: 'bi-image' },
            { id: 'moderationReports', label: 'Bejelentések', icon: 'bi-flag-fill' }
        ]
    },

    {
        id: 'group-gameplay', label: 'Játékok', icon: 'bi-knight-fill',
        items: [
            { id: 'games', label: 'Játszmák', icon: 'bi-list-task' },
            { id: 'abilities', label: 'Képességek', icon: 'bi-magic' }
        ]
    },

    {
        id: 'group-logs', label: 'Naplók', icon: 'bi-journal-text',
        items: [
            { id: 'security', label: 'Bejelentkezések', icon: 'bi-shield-check' },
            { id: 'auditLog', label: 'Audit napló', icon: 'bi-journal-check' },
            { id: 'alerts', label: 'Riasztások', icon: 'bi-exclamation-octagon-fill' }
        ]
    },

    { id: 'superAdmin', label: 'Super admin', icon: 'bi-stars', leaf: true },
    { id: 'friends', label: 'Közösségi kapcsolatok', icon: 'bi-people', leaf: true },
    { id: 'tests', label: 'Tesztek', icon: 'bi-clipboard2-check', leaf: true },
    { id: 'settings', label: 'Beállítások', icon: 'bi-gear-fill', leaf: true }
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
   8.5) Activity chart status helperek (UI render — egy forras-igazsag)
   ============================================================= */
const ACTIVITY_STATUS = Object.freeze({
    idle: { label: 'Inicializálás…', variant: 'secondary', icon: 'bi-hourglass', dotClass: 'ws-dot-idle', spin: false },
    loading: { label: 'Adatok betöltése…', variant: 'warning', icon: 'bi-arrow-repeat', dotClass: 'ws-dot-connecting', spin: true },
    loaded: { label: 'Élő', variant: 'success', icon: 'bi-broadcast-pin', dotClass: 'ws-dot-live', spin: false },
    empty: { label: 'Nincs 24h adat', variant: 'secondary', icon: 'bi-pause-circle', dotClass: 'ws-dot-idle', spin: false },
    error: { label: 'Hiba', variant: 'danger', icon: 'bi-exclamation-triangle', dotClass: 'ws-dot-down', spin: false }
});

function chartStatusPill(chartState) {
    const status = ACTIVITY_STATUS[chartState?.status] || ACTIVITY_STATUS.idle;
    const time = chartState?.loadedAt ? `frissítve: ${formatRelative(chartState.loadedAt)}` : '';
    const recordCount = (chartState?.totals?.records ?? 0);
    const detail = chartState?.status === 'loaded'
        ? `${recordCount} rekord${time ? ' · ' + time : ''}`
        : (chartState?.status === 'error' ? (chartState?.error || 'Ismeretlen hiba') : '');
    return `
        <span class="chart-status-pill chart-status-${chartState?.status || 'idle'}" id="chartStatusPill" title="${status.label}">
            <span class="ws-pill-dot ${status.dotClass}${status.spin ? ' ws-dot-spin' : ''}" aria-hidden="true"></span>
            <span class="chart-status-label" id="chartStatusLabel">${status.label}</span>
            ${detail ? `<span class="chart-status-detail" id="chartStatusDetail">· ${escapeHtml(detail)}</span>` : '<span class="chart-status-detail" id="chartStatusDetail"></span>'}
        </span>
    `;
}

function activityChartOverlay(chartState) {
    let result = '';
    const status = chartState?.status || 'idle';
    if (status === 'loading' || status === 'idle') {
        result = `
            <div class="activity-chart-loading">
                <i class="bi bi-arrow-repeat spin"></i>
                <div>Aktivitási adatok betöltése…</div>
            </div>
        `;
    } else if (status === 'empty') {
        result = `
            <div class="activity-chart-message">
                <i class="bi bi-pause-circle"></i>
                <div class="activity-chart-message-title">Nincs 24 órás aktivitási adat</div>
                <div class="activity-chart-message-sub">Az utóbbi 24 órában nem rögzítettünk eseményt — amint történik valami, automatikusan megjelenik.</div>
            </div>
        `;
    } else if (status === 'error') {
        result = `
            <div class="activity-chart-message activity-chart-message-error">
                <i class="bi bi-exclamation-triangle"></i>
                <div class="activity-chart-message-title">Hiba a 24h aktivitás betöltésénél</div>
                <div class="activity-chart-message-sub">${escapeHtml(chartState?.error || 'Ismeretlen hiba')}</div>
            </div>
        `;
    }
    return result;
}

const ACTIVITY_DATASET_META = Object.freeze([
    { key: 'logins', label: 'Login', color: '#d4af37', icon: 'bi-box-arrow-in-right' },
    { key: 'registrations', label: 'Regisztráció', color: '#10b981', icon: 'bi-person-plus-fill' },
    { key: 'gamesStarted', label: 'Új játszma', color: '#3b82f6', icon: 'bi-trophy-fill' },
    { key: 'auditEntries', label: 'Audit', color: '#8b5cf6', icon: 'bi-journal-text' },
    { key: 'alerts', label: 'Riasztás', color: '#ef4444', icon: 'bi-exclamation-octagon-fill' }
]);

function renderChartTotals(totals) {
    return ACTIVITY_DATASET_META.map((meta) => `
        <span class="chart-total-chip" style="--chip-color: ${meta.color};">
            <i class="bi ${meta.icon}"></i>
            <span class="chart-total-label">${meta.label}</span>
            <strong class="chart-total-value">${Number(totals?.[meta.key] || 0)}</strong>
        </span>
    `).join('');
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
        // A feed ures allapota a "rosszabbik" reason-bol jon (no_token > offline > empty)
        const feedReason = auditSrc.reason === 'no_token' || alertSrc.reason === 'no_token' ? 'no_token'
            : auditSrc.reason === 'offline' || alertSrc.reason === 'offline' ? 'offline'
                : (feedHasContent ? 'live' : 'empty');
        const feedEmpty = feedHasContent ? null : feedEmptyMessage(feedReason);
        const chartStatus = state.activityChart || { status: 'idle' };
        return `
            ${h.header({
            icon: 'bi-grid-1x2-fill', title: 'Vezérlőpult',
            subtitle: 'A projekt fő mutatói egy pillantásra'
        })}

            ${h.stats([
            {
                icon: 'bi-people-fill', value: stats.online?.totalUsers ?? 0, valueId: 'mainOnlineTotal',
                label: 'Online felhasználó', color: 'primary',
                hint: `<span id="mainOnlineHint">${stats.online?.totalAdmins ?? 0} admin · ${stats.online?.activeTabs ?? stats.online?.totalTabs ?? 0} aktív tab</span>`,
                hintClass: 'text-success', interactive: 'users', cardId: 'mainOnlineCard'
            },
            {
                icon: 'bi-trophy-fill', value: inGameValue, valueId: 'mainInGame',
                label: 'Aktív játszma', color: inGameEmpty ? 'secondary' : 'success',
                hint: inGameEmpty
                    ? '<span class="text-muted"><i class="bi bi-pause-circle me-1"></i>Nincs élő játszma — kattints a játszmák listájához</span>'
                    : '<span class="live-indicator text-success"><span class="live-dot"></span>Élőben most</span>',
                hintClass: inGameEmpty ? 'text-muted' : 'text-success',
                interactive: 'games',
                cardId: 'mainInGameCard',
                emblem: 'chess', empty: inGameEmpty
            },
            {
                icon: 'bi-journal-check', value: last24.auditEntries ?? 0, valueId: 'mainAuditCount',
                label: '24h audit bejegyzés', color: 'warning',
                hint: `<span id="mainAuditCriticalHint">${last24.criticalAuditEntries ?? 0} kritikus művelet</span>`,
                hintClass: 'text-warning', interactive: 'auditLog', cardId: 'mainAuditCard'
            },
            {
                icon: 'bi-exclamation-octagon-fill', value: last24.alerts ?? 0, valueId: 'mainAlertCount',
                label: '24h riasztás', color: 'danger',
                hint: `<span id="mainNewBansHint">${last24.newBans ?? 0} új tiltás</span>`,
                hintClass: 'text-danger', interactive: 'alerts', cardId: 'mainAlertCard'
            }
        ])}

            <div class="tick-band mb-4" id="tickBand" data-ws-status="${wsStatus.key}">
                <div class="tick-band-header">
                    <span class="live-indicator ${state.adminSocketConnected ? 'text-success' : 'text-muted'}" id="tickBandIndicator">
                        <span class="live-dot"></span>Élő tick
                    </span>
                    <span class="tick-band-time">Frissítve: <span id="tickBandTime">${state.liveStatsAt ? formatRelative(state.liveStatsAt) : '—'}</span></span>
                </div>
                <div class="tick-band-body">
                    ${h.tickChip({ icon: 'bi-wifi', label: 'Online', valueId: 'tickOnline', value: stats.online?.totalUsers ?? 0, color: 'success', nav: 'users', hint: 'Online felhasználók — ugrás a felhasználói listára' })}
                    ${h.tickChip({ icon: 'bi-window-stack', label: 'Aktív tabok', valueId: 'tickActiveTabs', value: stats.online?.activeTabs ?? stats.online?.totalTabs ?? 0, color: 'primary', nav: 'users', hint: 'Nyitva tartott böngészőfülek — felhasználói lista' })}
                    ${h.tickChip({ icon: 'bi-shield-fill', label: 'Adminok', valueId: 'tickAdmins', value: stats.online?.totalAdmins ?? 0, color: 'gold', nav: 'superAdmin', hint: 'Online admin felhasználók — super admin nézet' })}
                    ${h.tickChip({ icon: 'bi-trophy-fill', label: 'Játékban', valueId: 'tickInGame', value: stats.online?.inGame ?? 0, color: inGameEmpty ? 'secondary' : 'success', nav: 'games', hint: 'Folyamatban lévő játszmák' })}
                    ${h.tickChip({ icon: 'bi-search', label: 'Matchmakingben', valueId: 'tickMatchmaking', value: stats.online?.inMatchmaking ?? 0, color: 'primary', nav: 'games', hint: 'Matchmakingben várakozó játékosok' })}
                    ${h.tickChip({ icon: 'bi-image', label: 'Pending kép', valueId: 'tickPendingImages', value: stats.pending?.profileImages ?? 0, color: 'warning', nav: 'profileImageReview', hint: 'Jóváhagyásra váró profilképek' })}
                    ${h.tickChip({ icon: 'bi-person-plus', label: 'Pending barát', valueId: 'tickPendingFriends', value: stats.pending?.friendRequests ?? 0, color: 'primary', nav: 'friends', hint: 'Függőben lévő barátkérelmek' })}
                    ${h.tickChip({ icon: 'bi-speedometer2', label: 'Aktív rate esc.', valueId: 'tickRateEsc', value: stats.rateLimit?.activeEscalations ?? 0, color: 'secondary', nav: 'alerts', hint: 'Rate limit szigorítások — riasztások' })}
                </div>
            </div>

            <div class="row g-4">
                <div class="col-xl-7">
                    <div class="content-card h-100 dashboard-equal-card activity-chart-card">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="bi bi-activity me-2 text-gold"></i>Aktivitás — utolsó 24 óra
                                <span class="card-subtle-hint d-block">Óránkénti bontás · login, regisztráció, új játszma, audit, riasztás</span>
                            </h5>
                            ${chartStatusPill(chartStatus)}
                        </div>
                        <div class="card-body activity-chart-body">
                            <div class="activity-chart-wrap" id="activityChartWrap">
                                <canvas id="activityChart"></canvas>
                                <div class="activity-chart-overlay${chartStatus.status === 'loaded' ? ' d-none' : ''}" id="activityChartOverlay">
                                    ${activityChartOverlay(chartStatus)}
                                </div>
                            </div>
                            <div class="activity-chart-totals" id="activityChartTotals">
                                ${chartStatus.totals ? renderChartTotals(chartStatus.totals) : '<span class="text-secondary small">A 24h összegzések a chart betöltése után jelennek meg.</span>'}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-xl-5">
                    <div class="content-card h-100 live-feed-card dashboard-equal-card">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="bi bi-broadcast me-2 text-gold"></i>Élő admin tevékenység
                                <span class="card-subtle-hint d-block">Élő WS események — utolsó 25 db</span>
                            </h5>
                            <span class="ws-feed-badge ws-feed-${wsStatus.key}" id="wsStatusBadge" title="${wsStatus.label}">
                                <span class="ws-pill-dot ${wsStatus.dotClass}" aria-hidden="true"></span>
                                <span id="wsStatusBadgeLabel">${wsStatus.short}</span>
                            </span>
                        </div>
                        <div class="card-body p-0">
                            <div class="live-feed-meta">
                                <span class="live-feed-meta-count" id="liveFeedCount"><i class="bi bi-list-ul me-1"></i>${feedHasContent ? (auditItems.length + alertItems.length) : 0} esemény</span>
                                <span class="live-feed-meta-time" id="liveFeedLastTime">
                                    ${feedHasContent
                ? `Utolsó: ${formatRelative(latestEventTime(auditItems, alertItems))}`
                : (feedReason === 'live' || feedReason === 'empty' ? 'Még nincs esemény' : feedEmptyMessage(feedReason).title)}
                                </span>
                            </div>
                            <ul class="live-feed-list" id="dashboardLiveFeed" data-feed-state="${feedHasContent ? 'live' : feedReason}">
                                ${feedHasContent
                ? auditItems.map(a => liveFeedRow('audit', a)).join('') + alertItems.map(a => liveFeedRow('alert', a)).join('')
                : `<li class="live-feed-empty">
                                          <i class="bi ${feedEmpty.icon}"></i>
                                          <div class="live-feed-empty-title">${feedEmpty.title}</div>
                                          <div class="live-feed-empty-sub">${feedEmpty.sub}</div>
                                      </li>`}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <div class="row g-3 mt-2">
                ${[
                { id: 'mini24Logins', icon: 'bi-box-arrow-in-right', label: '24h bejelentkezés', value: last24.logins ?? 0, color: 'primary', nav: 'security' },
                { id: 'mini24Registrations', icon: 'bi-person-plus-fill', label: '24h regisztráció', value: last24.registrations ?? 0, color: 'success', nav: 'users' },
                { id: 'mini24Audit', icon: 'bi-journal-text', label: '24h audit', value: last24.auditEntries ?? 0, color: 'warning', nav: 'auditLog' },
                { id: 'mini24Critical', icon: 'bi-exclamation-octagon', label: '24h kritikus', value: last24.criticalAuditEntries ?? 0, color: 'danger', nav: 'auditLog' },
                { id: 'mini24Alerts', icon: 'bi-shield-fill-x', label: '24h riasztás', value: last24.alerts ?? 0, color: 'warning', nav: 'alerts' },
                { id: 'mini24Bans', icon: 'bi-ban', label: '24h új tiltás', value: last24.newBans ?? 0, color: 'danger', nav: 'userBan' }
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
    users: () => {
        const f = state.users.filters;
        return `
        ${h.header({
            icon: 'bi-people-fill', title: 'Felhasználói lista',
            subtitle: 'Élő lista — szűrés, keresés és gyors műveletek'
        })}

        <div class="content-card admin-users-card">
            <div class="card-header admin-users-card-header">
                <div class="admin-users-card-headline">
                    <h5 class="card-title mb-0">
                        <i class="bi bi-people-fill me-2 text-gold"></i>Felhasználók
                        <span class="admin-users-meta" id="adminUsersMeta">
                            <span class="admin-users-meta-count" id="adminUsersCount">0</span>
                            <span class="admin-users-meta-sep">·</span>
                            <span class="admin-users-meta-time" id="adminUsersUpdatedAt">betöltés…</span>
                        </span>
                    </h5>
                    <div class="admin-users-card-actions">
                        ${h.btn({
            label: 'Új felhasználó', icon: 'bi-plus-lg', variant: 'gold', size: 'sm',
            attrs: 'data-bs-toggle="modal" data-bs-target="#addUserModal"'
        })}
                    </div>
                </div>
                <div class="admin-users-filter-bar">
                    <div class="admin-users-search">
                        <i class="bi bi-search"></i>
                        <label for="adminUserSearchInput" class="visually-hidden">Felhasználó keresése</label>
                        <input id="adminUserSearchInput" name="adminUserSearchInput" type="search"
                            class="form-control form-control-sm" placeholder="Keresés név vagy e-mail alapján…"
                            value="${escapeHtml(f.search)}" autocomplete="off"
                            oninput="onAdminUsersFilterInput(event)">
                        <button type="button" class="admin-users-search-clear ${f.search ? '' : 'd-none'}"
                            id="adminUsersSearchClear" onclick="clearAdminUsersSearch()" aria-label="Keresés törlése">
                            <i class="bi bi-x-circle-fill"></i>
                        </button>
                    </div>
                    <select id="adminRoleFilter" name="adminRoleFilter" class="form-select form-select-sm"
                        onchange="onAdminUsersFilterChange()">
                        <option value="" ${f.role === '' ? 'selected' : ''}>Minden szerepkör</option>
                        <option value="player" ${f.role === 'player' ? 'selected' : ''}>Játékos</option>
                        <option value="admin"  ${f.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                    <select id="adminStatusFilter" name="adminStatusFilter" class="form-select form-select-sm"
                        onchange="onAdminUsersFilterChange()">
                        <option value=""        ${f.status === '' ? 'selected' : ''}>Minden állapot</option>
                        <option value="online"  ${f.status === 'online' ? 'selected' : ''}>● Online</option>
                        <option value="offline" ${f.status === 'offline' ? 'selected' : ''}>○ Offline</option>
                        <option value="active"  ${f.status === 'active' ? 'selected' : ''}>Nem tiltott</option>
                        <option value="banned"  ${f.status === 'banned' ? 'selected' : ''}>Tiltott</option>
                    </select>
                    <select id="adminOrderBy" name="adminOrderBy" class="form-select form-select-sm"
                        onchange="onAdminUsersFilterChange()">
                        <option value="lastActive" ${f.orderBy === 'lastActive' ? 'selected' : ''}>Utolsó aktivitás</option>
                        <option value="username"   ${f.orderBy === 'username' ? 'selected' : ''}>Név (A–Z)</option>
                        <option value="elo"        ${f.orderBy === 'elo' ? 'selected' : ''}>ELO (csökkenő)</option>
                        <option value="createdAt"  ${f.orderBy === 'createdAt' ? 'selected' : ''}>Csatlakozás (legújabb)</option>
                    </select>
                    ${h.btn({
            label: '', icon: 'bi-arrow-clockwise', variant: 'outline-light', size: 'sm',
            attrs: 'id="adminUsersRefreshBtn" title="Lista frissítése" aria-label="Felhasználói lista frissítése"',
            onclick: 'refreshAdminUsersList()'
        })}
                </div>
            </div>
            <div class="admin-users-table-wrap" id="adminUsersTableWrap">
                <table class="table admin-users-table" id="adminUsersTable">
                    <thead>
                        <tr>
                            <th class="col-user">Felhasználó</th>
                            <th class="col-elo">ELO (K / MM / B)</th>
                            <th class="col-role">Szerepkör</th>
                            <th class="col-status">Állapot</th>
                            <th class="col-active">Utolsó aktivitás</th>
                            <th class="col-joined">Csatlakozott</th>
                            <th class="col-actions text-end">Műveletek</th>
                        </tr>
                    </thead>
                    <tbody id="adminUsersTbody" aria-live="polite">
                        <tr class="admin-users-empty-row">
                            <td colspan="7" class="text-center text-secondary py-4">Felhasználói lista betöltése…</td>
                        </tr>
                    </tbody>
                </table>
                <div class="admin-users-sentinel" id="adminUsersSentinel" aria-hidden="true"></div>
            </div>
            <div class="admin-users-footer" id="adminUsersFooter">
                <span id="adminUsersFooterText" class="text-secondary small">—</span>
            </div>
        </div>
    `;
    },

    /* ---------- Felhasználók > Részletek és szerkesztés ---------- */
    userDetail: () => {
        const u = state.selectedUser;
        const hasUser = Boolean(u);
        const username = hasUser ? (u.username || '—') : '—';
        const email = hasUser ? (u.email || '—') : '—';
        const eloClassic = hasUser ? Number(u.elo || 0) : 0;
        const eloMM = hasUser ? Number(u.eloMM || 0) : 0;
        const eloBullet = hasUser ? Number(u.eloBullet || 0) : 0;
        const role = hasUser && u.role === 'admin' ? 'admin' : 'player';
        const wins = hasUser ? Number(u.wins || 0) : 0;
        const losses = hasUser ? Number(u.losses || 0) : 0;
        const draws = hasUser ? Number(u.draws || 0) : 0;
        const abilitiesUsed = hasUser ? Number(u.totalAbilities || 0) : 0;
        const totalGames = wins + losses + draws;
        const winRate = totalGames > 0 ? ((wins / totalGames) * 100) : 0;
        const emailBadge = hasUser ? renderEmailVerifiedBadgeInline(u) : '';
        const imageBadge = hasUser ? renderProfileImageStatusBadgeInline(u) : '';
        const presenceBadge = hasUser ? renderPresenceStatusBadgeInline(u) : '';
        const isCurrentUser = hasUser && Number(state.currentUser?.id || 0) === Number(u.id || 0);
        const uploadHint = isCurrentUser
            ? 'A saját profilodnál a feltöltés backend oldalon is működik.'
            : 'Admin feltöltésnél a kép státusza azonnal jóváhagyottként jelenik meg a felületen.';
        return `
        ${h.header({
            icon: 'bi-person-vcard', title: 'Részletek és szerkesztés',
            subtitle: hasUser ? `${username} — kiválasztott profil` : 'Egy kiválasztott profil teljes munkaablakja',
            actions: [
                hasUser
                    ? { label: '', icon: 'bi-eye', variant: 'outline-light', size: 'sm', attrs: 'title="Profil megtekintése" aria-label="Profil megtekintése"', onclick: 'openSelectedUserProfileView()' }
                    : null,
                { label: 'Vissza a listához', icon: 'bi-arrow-left', size: 'sm', onclick: "showSection('users')" }
            ].filter(Boolean)
        })}

        ${hasUser ? '' : `
            <div class="content-card admin-empty-pick mb-4">
                <div class="card-body text-center py-5">
                    <i class="bi bi-person-bounding-box admin-empty-pick-icon"></i>
                    <h5 class="text-white mt-3">Nincs kiválasztott felhasználó</h5>
                    <p class="text-secondary mb-3">A szerkesztéshez válassz egy felhasználót a listából.</p>
                    ${h.btn({ label: 'Felhasználói lista', icon: 'bi-list-ul', variant: 'gold', onclick: "showSection('users')" })}
                </div>
            </div>
        `}

        ${hasUser ? `
        <div class="admin-user-detail-shell">

            <!-- 1) HERO STRIP — full-width vizuális összegző (szándékosan ismétel az alábbi szekciókkal) -->
            <div class="content-card admin-user-detail-banner mb-4">
                <div class="admin-user-detail-banner-body">
                    <div class="admin-user-detail-banner-identity">
                        <img id="userDetailProfileImage"
                            class="admin-user-detail-banner-avatar" alt="Profil"
                            data-fallback="true"
                            data-username="${escapeHtml(u.username || '')}"
                            data-profile-image="${escapeHtml(u.profileImage || '')}">
                        <div class="admin-user-detail-banner-text">
                            <h3 class="text-white mb-1 text-break">${escapeHtml(username)}</h3>
                            <div class="text-secondary text-break mb-2">
                                <i class="bi bi-envelope me-1"></i>${escapeHtml(email)}
                            </div>
                            <div class="admin-user-detail-status-cloud">
                                ${rolePill(role)}
                                ${presenceBadge}
                                ${u.isBanned ? statusPill('banned') : ''}
                                ${emailBadge}
                                ${imageBadge}
                            </div>
                        </div>
                    </div>
                    <div class="admin-user-detail-banner-elo">
                        <div class="admin-user-detail-elo-box"><div class="admin-user-detail-elo-value">${eloClassic}</div><small>Klasszikus</small></div>
                        <div class="admin-user-detail-elo-box is-primary"><div class="admin-user-detail-elo-value">${eloMM}</div><small>MattMester</small></div>
                        <div class="admin-user-detail-elo-box"><div class="admin-user-detail-elo-value">${eloBullet}</div><small>Bullet</small></div>
                    </div>
                    <div class="admin-user-detail-banner-stats">
                        <div class="admin-user-detail-stat-pill"><span class="text-success fw-bold">${wins}</span><small>Győzelem</small></div>
                        <div class="admin-user-detail-stat-pill"><span class="text-danger fw-bold">${losses}</span><small>Vereség</small></div>
                        <div class="admin-user-detail-stat-pill"><span class="text-warning fw-bold">${draws}</span><small>Döntetlen</small></div>
                        <div class="admin-user-detail-stat-pill is-rate">
                            <span class="text-gold fw-bold">${winRate.toFixed(1)}%</span><small>Győzelmi arány</small>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 2) Két oszlopos főtartalom -->
            <form id="adminUserDetailForm" class="admin-user-detail-form" onsubmit="event.preventDefault(); saveAdminUserDetailChanges();">
                <div class="row g-4 align-items-stretch">

                    <!-- BAL OSZLOP -->
                    <div class="col-12 col-lg-6 d-flex flex-column gap-4">

                        <!-- Profilkép kártya -->
                        <div class="content-card admin-user-detail-card-image">
                            <div class="card-header">
                                <h5 class="card-title"><i class="bi bi-image me-2 text-gold"></i>Profilkép</h5>
                            </div>
                            <div class="card-body text-center">
                                <img id="userDetailProfileImageLarge"
                                    class="admin-user-detail-large-avatar mb-3" alt="Profil"
                                    data-fallback="true"
                                    data-username="${escapeHtml(u.username || '')}"
                                    data-profile-image="${escapeHtml(u.profileImage || '')}">
                                <div class="admin-user-detail-image-tools">
                                    <div class="d-flex flex-wrap justify-content-center gap-2">
                                        <label for="adminUserDetailImageUpload" class="btn btn-gold btn-sm mb-0" title="Profilkép feltöltése (azonnal jóváhagyott)">
                                            <i class="bi bi-cloud-upload me-1"></i>Új kép
                                        </label>
                                        <input id="adminUserDetailImageUpload" type="file" class="d-none" accept="image/jpeg,image/png,image/webp"
                                            onchange="handleAdminUserDetailImageInputChange(event)">
                                        <button type="button" class="btn btn-outline-danger btn-sm" onclick="handleAdminUserDetailImageRemove()">
                                            <i class="bi bi-trash3 me-1"></i>Eltávolítás
                                        </button>
                                    </div>
                                    <div class="text-secondary mt-2 small">${escapeHtml(uploadHint)}</div>
                                    <div class="admin-user-detail-image-status mt-2">
                                        <span class="text-secondary small">Profilkép státusz:</span>
                                        ${imageBadge || `<span class="badge bg-dark border border-secondary">${escapeHtml(String(u.profileImageStatus || 'default'))}</span>`}
                                    </div>
                                    <div id="adminUserDetailImageMessage" class="alert d-none mt-2 mb-0 py-2 px-3"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Identitás kártya -->
                        <div class="content-card">
                            <div class="card-header">
                                <h5 class="card-title"><i class="bi bi-person-badge me-2 text-gold"></i>Identitás</h5>
                            </div>
                            <div class="card-body">
                                <div class="row g-3">
                                    <div class="col-12">
                                        <label for="editUsername" class="form-label">Felhasználónév</label>
                                        <input id="editUsername" name="editUsername" type="text" class="form-control" value="${escapeHtml(u.username || '')}" autocomplete="off">
                                        <div id="editUsernameFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-12">
                                        <label for="editEmail" class="form-label">E-mail</label>
                                        <input id="editEmail" name="editEmail" type="email" class="form-control" value="${escapeHtml(u.email || '')}" autocomplete="off">
                                        <div id="editEmailFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-12 col-sm-6">
                                        <label for="editRole" class="form-label">Szerepkör</label>
                                        <select id="editRole" name="editRole" class="form-select">
                                            ${getAdminRoleOptions(u).map((opt) => `<option value="${escapeHtml(opt.value)}" ${opt.selected ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}
                                        </select>
                                        <div id="editRoleFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-12 col-sm-6 d-flex align-items-end">
                                        <div class="admin-user-detail-switch-card w-100">
                                            <div class="me-2">
                                                <div class="fw-semibold text-white small">Email megerősítettség</div>
                                                <small class="text-secondary" id="editEmailVerifiedFeedback">Közvetlenül átállítható.</small>
                                            </div>
                                            <div class="form-check form-switch m-0 ms-auto">
                                                <input class="form-check-input" type="checkbox" role="switch" id="editEmailVerified" ${u.emailVerified ? 'checked' : ''}>
                                                <label class="form-check-label text-light visually-hidden" for="editEmailVerified">Megerősített</label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- JOBB OSZLOP -->
                    <div class="col-12 col-lg-6 d-flex flex-column gap-4">

                        <!-- ELO kártya -->
                        <div class="content-card">
                            <div class="card-header">
                                <h5 class="card-title"><i class="bi bi-trophy me-2 text-gold"></i>ELO pontok</h5>
                            </div>
                            <div class="card-body">
                                <div class="row g-3">
                                    <div class="col-12 col-md-4">
                                        <label for="editEloClassic" class="form-label">Klasszikus</label>
                                        <input id="editEloClassic" type="number" min="0" max="9999" class="form-control" value="${escapeHtml(String(eloClassic))}">
                                        <div id="editEloClassicFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-12 col-md-4">
                                        <label for="editEloMM" class="form-label">MattMester</label>
                                        <input id="editEloMM" type="number" min="0" max="9999" class="form-control" value="${escapeHtml(String(eloMM))}">
                                        <div id="editEloMMFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-12 col-md-4">
                                        <label for="editEloBullet" class="form-label">Bullet</label>
                                        <input id="editEloBullet" type="number" min="0" max="9999" class="form-control" value="${escapeHtml(String(eloBullet))}">
                                        <div id="editEloBulletFeedback" class="form-text text-secondary"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Statisztika kártya -->
                        <div class="content-card">
                            <div class="card-header d-flex flex-wrap justify-content-between align-items-center gap-2">
                                <h5 class="card-title mb-0"><i class="bi bi-graph-up-arrow me-2 text-gold"></i>Mérkőzés statisztika</h5>
                                <span class="badge bg-dark border border-secondary fw-normal">Győzelmi arány: ${winRate.toFixed(1)}%</span>
                            </div>
                            <div class="card-body">
                                <div class="row g-3">
                                    <div class="col-6 col-md-3">
                                        <label for="editWins" class="form-label">Győzelmek</label>
                                        <input id="editWins" type="number" min="0" class="form-control" value="${escapeHtml(String(wins))}">
                                        <div id="editWinsFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-6 col-md-3">
                                        <label for="editLosses" class="form-label">Vereségek</label>
                                        <input id="editLosses" type="number" min="0" class="form-control" value="${escapeHtml(String(losses))}">
                                        <div id="editLossesFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-6 col-md-3">
                                        <label for="editDraws" class="form-label">Döntetlenek</label>
                                        <input id="editDraws" type="number" min="0" class="form-control" value="${escapeHtml(String(draws))}">
                                        <div id="editDrawsFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-6 col-md-3">
                                        <label for="editAbilitiesUsed" class="form-label">Képességek</label>
                                        <input id="editAbilitiesUsed" type="number" min="0" class="form-control" value="${escapeHtml(String(abilitiesUsed))}">
                                        <div id="editAbilitiesUsedFeedback" class="form-text text-secondary"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Metaadatok kártya -->
                        <div class="content-card">
                            <div class="card-header">
                                <h5 class="card-title"><i class="bi bi-info-circle me-2 text-gold"></i>Metaadatok</h5>
                            </div>
                            <div class="card-body">
                                <div class="row g-3">
                                    ${h.kv('Email állapot', `${Boolean(u.emailVerified) ? 'Megerősített' : 'Nem megerősített'}`)}
                                    ${h.kv('Email megerősítve', u.emailVerifiedAt ? formatDateOnly(u.emailVerifiedAt) : '—')}
                                    ${h.kv('Profilkép állapot', String(u.profileImageStatus || 'default'))}
                                    ${h.kv('Utolsó aktivitás', u.lastActive ? formatRelative(u.lastActive) : '—')}
                                    ${h.kv('Utolsó IP', u.lastIp || '—')}
                                    ${h.kv('Csatlakozott', formatDateOnly(u.createdAt))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3) Változtatási csomag — full width -->
                <div class="content-card user-detail-save-pack admin-user-detail-save-card mt-4">
                    <div class="card-header">
                        <h5 class="card-title"><i class="bi bi-box-arrow-down-right me-2 text-gold"></i>Változtatási csomag</h5>
                    </div>
                    <div class="card-body">
                        <div class="row g-3 align-items-stretch">
                            <div class="col-12 col-lg-7">
                                <label for="editReason" class="form-label">Módosítás indoka</label>
                                <textarea id="editReason" class="form-control" rows="3" placeholder="Miért változtatod ezeket az adatokat? (audit log)"></textarea>
                                <div id="editReasonFeedback" class="form-text text-secondary">Legalább 10 karakter szükséges.</div>
                            </div>
                            <div class="col-12 col-lg-5 d-flex flex-column">
                                <div class="admin-user-detail-changes-summary mb-2 flex-grow-1">
                                    <div class="text-secondary small mb-1"><i class="bi bi-list-check me-1"></i>Változások</div>
                                    <ul id="adminUserDetailChangesList" class="admin-user-detail-changes-list">
                                        <li class="text-secondary small">Még nincs változás.</li>
                                    </ul>
                                </div>
                                <button type="submit" id="adminUserDetailSaveBtn" class="btn btn-gold btn-lg" disabled>
                                    <i class="bi bi-check2-circle me-1"></i>Mentés
                                </button>
                                <small class="text-secondary text-center mt-1">Egy csomag · egy audit bejegyzés.</small>
                            </div>
                            <div class="col-12">
                                <div id="adminSavePackMessage" class="alert alert-dark border-secondary mb-0 py-2 px-3 small" role="alert">
                                    Nincs változás. Módosíts legalább egy mezőt a mentéshez.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </form>

            <!-- 4) Veszélyes műveletek -->
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
                            ${!u.emailVerified
                    ? `<button type="button" class="btn btn-outline-warning btn-sm" disabled title="Email cím nincs megerősítve"><i class="bi bi-send-fill me-1"></i>Link küldése</button>`
                    : h.btn({ label: 'Link küldése', icon: 'bi-send-fill', variant: 'outline-warning', size: 'sm', onclick: `adminSendPasswordReset(${u.id})` })
                }
                        </div>
                        <div class="danger-action">
                            <div>
                                <div class="fw-semibold text-white">Felhasználó tiltása <span class="badge bg-danger ms-1">kritikus</span></div>
                                <small class="text-secondary">30 char indok + jelszó megerősítés szükséges.</small>
                            </div>
                            ${h.btn({
                    label: 'Tiltás kezelése', icon: 'bi-ban', variant: 'outline-danger', size: 'sm',
                    onclick: `banAdminUser(${u.id})`
                })}
                        </div>
                        <div class="danger-action">
                            <div>
                                <div class="fw-semibold text-white">Munkamenetek megszakítása</div>
                                <small class="text-secondary">Kijelentkezteti a felhasználót az összes eszközéről és érvényteleníti a tokenjeit.</small>
                            </div>
                            ${h.btn({ label: 'Kijelentkeztetés', icon: 'bi-box-arrow-right', variant: 'outline-warning', size: 'sm', onclick: `adminRevokeUserSessions(${u.id}, event)` })}
                        </div>
                    </div>
                </div>

        </div>
        ` : ''}
    `;
    },

    /* ---------- Felhasználók > Tiltások ---------- */
    userBan: () => {
        const u = state.selectedUser;
        const hasUser = Boolean(u);
        const targetLabel = hasUser ? (u.username || `#${u.id}`) : 'kiválasztott felhasználó';
        const allUsers = Array.isArray(state.users.list) ? state.users.list : [];
        const banList = allUsers.filter((x) => x.isBanned);

        return `
        ${h.header({
            icon: 'bi-slash-circle', title: 'Tiltások',
            subtitle: hasUser
                ? `${targetLabel} — előre kiválasztva tiltáshoz`
                : 'Új tiltás létrehozása és aktív tiltások kezelése',
            actions: hasUser
                ? [{ label: 'Vissza a listához', icon: 'bi-arrow-left', size: 'sm', onclick: "showSection('users')" }]
                : []
        })}
        <div class="row g-4 mb-4">
            <div class="col-lg-5">
                ${h.card({
            title: hasUser ? `Új tiltás — ${escapeHtml(targetLabel)}` : 'Új tiltás',
            icon: 'bi-plus-circle',
            headerExtra: h.badge('kritikus művelet', 'danger'),
            body: `
                        <div class="alert alert-warning bg-warning bg-opacity-10 border-warning small mb-3">
                            <i class="bi bi-info-circle-fill me-1"></i>
                            A tiltás kritikus művelet — min. <strong>30 karakter indok</strong> és <strong>jelszó megerősítés</strong> szükséges.
                        </div>
                        ${hasUser ? `
                            <div class="ban-target-card mb-3">
                                ${h.user({ name: u.username, email: u.email, profile_image: u.profileImage, username: u.username })}
                                <div class="ban-target-meta">
                                    ${rolePill(u.role === 'admin' ? 'admin' : 'player')}
                                    ${u.isBanned ? statusPill('banned') : renderPresenceStatusBadgeInline(u)}
                                </div>
                            </div>
                        ` : `
                            <div class="alert alert-info bg-info bg-opacity-10 border-info small mb-3">
                                <i class="bi bi-info-circle me-1"></i>
                                Nincs kiválasztott felhasználó — válassz egyet a
                                <a href="#" class="text-gold" onclick="showSection('users', event)">listából</a>.
                            </div>
                        `}
                        ${h.form({
                fields: [
                    {
                        id: 'banType', label: 'Típus', col: 6, type: 'select',
                        options: ['Ideiglenes', 'Végleges', 'Csak chat']
                    },
                    { id: 'banDuration', label: 'Időtartam (óra)', col: 6, type: 'number', value: '24' },
                    {
                        id: 'banReason', label: 'Indok (min. 30 char)', col: 12, type: 'textarea',
                        placeholder: 'Részletes indok — naplózásra kerül.'
                    }
                ],
                submit: {
                    label: 'Tiltás alkalmazása', icon: 'bi-shield-fill-check', variant: 'danger',
                    onclick: `openCriticalAction('users.ban', '${escapeHtml(targetLabel).replace(/'/g, "\\'")}')`
                }
            })}
                    `
        })}
            </div>
            <div class="col-lg-7">
                ${h.card({
            title: 'Aktív tiltások', icon: 'bi-list-check', noBodyPadding: true,
            headerExtra: `<span class="text-secondary small">${banList.length} bejegyzés</span>`,
            body: `
                        <table class="table mb-0">
                            <thead><tr><th>Felhasználó</th><th>Lejár</th><th class="text-end">Művelet</th></tr></thead>
                            <tbody>
                                ${banList.length === 0
                    ? `<tr><td colspan="3" class="text-center text-secondary py-4">Nincs aktív tiltás.</td></tr>`
                    : banList.map(b => `
                                        <tr>
                                            <td>${h.user({ name: b.username, email: b.email, profile_image: b.profileImage, username: b.username, struck: true })}</td>
                                            <td><span class="${b.bannedUntil ? '' : 'text-danger'}">${b.bannedUntil ? escapeHtml(new Date(b.bannedUntil).toLocaleString('hu-HU')) : 'Soha'}</span></td>
                                            <td class="text-end">
                                                ${h.iconBtn({ icon: 'bi-eye', variant: 'light', title: 'Megtekintés', onclick: `openAdminUserView(${b.id})` })}
                                                ${h.iconBtn({ icon: 'bi-check-circle', variant: 'success', title: 'Feloldás (kritikus)', onclick: `openCriticalAction('users.unban', '${escapeHtml(b.username || '').replace(/'/g, "\\\\'")}')` })}
                                            </td>
                                        </tr>
                                    `).join('')}
                            </tbody>
                        </table>
                    `
        })}
            </div>
        </div>
    `;
    },

    /* ---------- Moderáció > Chat ---------- */
    chats: () => {
        const messages = [
            {
                priority: ['Magas', 'danger'], game: '#4921', user: 'AgresszívJatekos99',
                text: '„Te aztán teljes kezdő vagy, töröld ki a játékot!!!"', time: '2 perce'
            },
            {
                priority: ['Közepes', 'warning'], game: '#4918', user: 'ChatSpammer',
                text: '[Ismétlődő üzenet: „siess" × 15]', time: '15 perce'
            }
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
                                ${h.btn({ label: 'Némítás', variant: 'outline-warning', size: 'sm' })}
                                ${h.btn({
                label: 'Törlés', variant: 'outline-danger', size: 'sm',
                onclick: "openCriticalAction('chat.delete', '" + m.user + "')"
            })}
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
        actions: [{
            label: 'Frissítés', icon: 'bi-arrow-clockwise', size: 'sm',
            attrs: 'id="profileImageReviewRefresh"'
        }]
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
            { label: 'Összes', variant: 'outline-secondary', size: 'sm', classes: 'active' },
            { label: 'Nyitott', variant: 'outline-secondary', size: 'sm' },
            { label: 'Lezárt', variant: 'outline-secondary', size: 'sm' }
        ]
    })}
        ${h.table({
        headers: ['Bejelentő', 'Bejelentett', 'Kategória', 'Üzenet', 'Állapot', ''],
        rows: [
            { reporter: 'FairPlayer', target: 'AgresszívJatekos99', cat: ['Toxikusság', 'danger'], msg: 'Sértegető megjegyzések a chat-ben.', status: ['Nyitott', 'warning'] },
            { reporter: 'SakkMester99', target: 'CheaterX', cat: ['Csalás gyanú', 'danger'], msg: 'Engine használat gyanúja.', status: ['Vizsgálat alatt', 'warning'] },
            { reporter: 'RookRider', target: 'SpamKing', cat: ['Spam', 'warning'], msg: 'Reklám linkek küldése privátban.', status: ['Lezárva', 'success'] }
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
        ${h.header({
        icon: 'bi-knight-fill', title: 'Játszmák',
        subtitle: 'Lefutott és folyamatban lévő játszmák'
    })}
        ${h.stats([
        { icon: 'bi-play-circle-fill', value: SAMPLE.games.filter(g => g.status === 'live').length, label: 'Folyamatban', color: 'success' },
        { icon: 'bi-trophy-fill', value: SAMPLE.games.filter(g => g.status === 'finished').length, label: 'Befejezett', color: 'warning' },
        { icon: 'bi-x-circle-fill', value: '2', label: 'Megszakított', color: 'danger' }
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
        ${h.header({
        icon: 'bi-magic', title: 'Képességek / Erősítők',
        subtitle: 'Speciális játékos képességek kezelése',
        actions: [{ label: 'Új képesség', icon: 'bi-plus-lg', variant: 'gold' }]
    })}
        <div class="row g-4">
            ${[
            { name: 'Időutazás', desc: '+30 másodperc hozzáadása az óra idejéhez játszmánként egyszer.', uses: '1 234' },
            { name: 'Gyalogválasztás', desc: 'Egy gyalog azonnali előléptetése bármilyen figurára.', uses: '892' },
            { name: 'Csere visszavonás', desc: 'Az utolsó lépés visszavonása az ellenfél jóváhagyásával.', uses: '445' }
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
                                    ${h.iconBtn({ icon: 'bi-trash', variant: 'danger', title: 'Törlés' })}
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
        ${h.header({
        icon: 'bi-shield-check', title: 'Bejelentkezési előzmények',
        subtitle: 'Sikeres és sikertelen bejelentkezési kísérletek',
        actions: [{ label: 'Napló export', icon: 'bi-download', size: 'sm' }]
    })}
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
            ${h.header({
            icon: 'bi-journal-check', title: 'Audit napló',
            subtitle: 'Admin műveletek append-only nyomvonala — kötelező indok, before/after diff',
            actions: [{ label: 'Audit export', icon: 'bi-download', size: 'sm' }]
        })}

            <div class="row g-3 mb-4">
                ${[
                { icon: 'bi-info-circle-fill', label: 'Info', value: counts.info, color: 'primary' },
                { icon: 'bi-exclamation-triangle-fill', label: 'Warning', value: counts.warning, color: 'warning' },
                { icon: 'bi-exclamation-octagon-fill', label: 'Critical', value: counts.critical, color: 'danger' },
                { icon: 'bi-clock-history', label: 'Listázott', value: list.length, color: 'success' }
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
            ${h.header({
            icon: 'bi-exclamation-octagon-fill', title: 'Riasztások',
            subtitle: 'Jogosulatlan próbák, rate limit szigorítások, gyanús minták',
            actions: [{ label: 'Mind elolvasva', icon: 'bi-check-all', size: 'sm' }]
        })}

            <div class="row g-3 mb-4">
                ${[
                { icon: 'bi-shield-fill-x', label: 'Unauthorized', value: byKind.unauthorized || 0, color: 'warning' },
                { icon: 'bi-key-fill', label: 'Token hiba', value: byKind.token_invalid || 0, color: 'warning' },
                { icon: 'bi-speedometer2', label: 'Rate escalated', value: byKind.rate_escalated || 0, color: 'warning' },
                { icon: 'bi-bug-fill', label: 'Suspicious pattern', value: byKind.suspicious_pattern || 0, color: 'danger' }
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
        ${h.header({
        icon: 'bi-stars', title: 'Super admin',
        subtitle: 'Admin szerepkörök kiosztása és visszavonása',
        actions: [{
            label: 'Admin grant', icon: 'bi-plus-lg', variant: 'gold',
            onclick: "openCriticalAction('admin.grant', 'új admin')"
        }]
    })}

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
                : h.btn({
                    label: 'Revoke', icon: 'bi-shield-fill-x', variant: 'outline-danger', size: 'sm',
                    onclick: `openCriticalAction('admin.revoke', '${a.name}')`
                })
            }
                </div>`
        ])
    })}
    `,

    /* ---------- Közösségi ---------- */
    friends: () => `
        ${h.header({
        icon: 'bi-people', title: 'Közösségi kapcsolatok',
        subtitle: 'Barátkérelmek, kapcsolatok és blokkolások egy helyen'
    })}
        ${h.stats([
        { icon: 'bi-diagram-3-fill', value: '142', label: 'Összes barátság', color: 'primary' },
        { icon: 'bi-person-plus', value: '8', label: 'Függő kérelem', color: 'warning' },
        { icon: 'bi-person-x-fill', value: '5', label: 'Aktív blokkolás', color: 'danger' }
    ])}
        <div class="row g-4">
            <div class="col-lg-7">
                ${h.card({
        title: 'Függő barátkérelmek', icon: 'bi-person-plus-fill', noBodyPadding: true,
        body: `<table class="table mb-0"><thead><tr><th>Küldő</th><th>Címzett</th><th>Küldve</th><th class="text-end"></th></tr></thead><tbody>
                        ${[
                { from: 'SakkMester99', to: 'RookRider', when: '2 órája' },
                { from: 'FairPlayer', to: 'Magnus Carlsen', when: '1 napja' }
            ].map(r => `<tr><td><span class="text-white">${r.from}</span></td><td><span class="text-white">${r.to}</span></td><td><span class="text-secondary">${r.when}</span></td><td class="text-end">${h.btn({ label: 'Részletek', size: 'sm' })}</td></tr>`).join('')}
                    </tbody></table>`
    })}
            </div>
            <div class="col-lg-5">
                ${h.card({
        title: 'Aktív blokkolások', icon: 'bi-person-x-fill', noBodyPadding: true,
        body: `<table class="table mb-0"><thead><tr><th>Blokkoló</th><th>Blokkolt</th><th class="text-end"></th></tr></thead><tbody>
                        ${[
                { who: 'FairPlayer', whom: 'ToxikusZoli' },
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
            { label: 'Frissítés', icon: 'bi-arrow-clockwise', size: 'sm', attrs: 'disabled' }
        ]
    })}

        <div class="alert alert-info bg-info bg-opacity-10 border-info small mb-4">
            <i class="bi bi-info-circle-fill me-1"></i>
            Ez a szekció <strong>formaterv</strong> — a tesztfuttatás integráció (Jest + Supertest) még nincs bekötve.
            A vázlat azt mutatja, hogyan fognak megjelenni az eredmények.
        </div>

        ${h.stats([
        { icon: 'bi-check-circle-fill', value: '<span class="text-secondary">—</span>', label: 'Sikeres', color: 'success' },
        { icon: 'bi-x-circle-fill', value: '<span class="text-secondary">—</span>', label: 'Sikertelen', color: 'danger' },
        { icon: 'bi-skip-forward-fill', value: '<span class="text-secondary">—</span>', label: 'Kihagyott', color: 'warning' },
        { icon: 'bi-stopwatch', value: '<span class="text-secondary">—</span>', label: 'Futási idő', color: 'primary' }
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
                { suite: 'Unit', name: 'permissions.js — SUPER_ONLY halmaz integritása', status: 'pending' },
                { suite: 'Unit', name: 'AuditLogService.record — redaction allowlist', status: 'pending' },
                { suite: 'Unit', name: 'parseAdminToken — hash egyeztetés + lejárat', status: 'pending' },
                { suite: 'Unit', name: 'requireReasonOnMutate — char limitek', status: 'pending' },
                { suite: 'Integration', name: 'Login → elevate → admin endpoint → 200', status: 'pending' },
                { suite: 'Integration', name: 'Player elevate → 403', status: 'pending' },
                { suite: 'Integration', name: 'Critical action confirmPassword nélkül → 400', status: 'pending' },
                { suite: 'Auth bypass', name: 'Admin endpoint admin token nélkül → 401', status: 'pending' },
                { suite: 'Auth bypass', name: 'WS /admin player session-nel → connect_error', status: 'pending' },
                { suite: 'Rate limit', name: '10× rossz token egy IP-ről → 11. már 429', status: 'pending' },
                { suite: 'Real-time', name: '2 socket-kliens → audit:created 500ms-en belül', status: 'pending' }
            ].map(t => `
                            <div class="test-row test-${t.status}">
                                <div class="test-status-dot"></div>
                                <span class="test-suite">${t.suite}</span>
                                <span class="test-name">${t.name}</span>
                                <span class="test-status-label">${t.status === 'pass' ? 'PASS' :
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
        ${h.header({
        icon: 'bi-gear-fill', title: 'Beállítások',
        subtitle: 'Általános platform paraméterek'
    })}
        ${h.card({
        body: h.form({
            fields: [
                { id: 'settingsSiteName', label: 'Oldal neve', value: 'MattMester' },
                { id: 'settingsSupportEmail', label: 'Support e-mail', value: 'support@mattmester.hu', type: 'email' },
                {
                    id: 'settingsLanguage', label: 'Alapértelmezett nyelv', type: 'select',
                    options: [{ value: 'hu', label: 'Magyar', selected: true }, { value: 'en', label: 'English' }]
                },
                {
                    id: 'settingsTimezone', label: 'Időzóna', type: 'select',
                    options: [{ value: 'Europe/Budapest', label: 'Europe/Budapest', selected: true }, 'UTC']
                },
                { id: 'settingsRegistration', label: 'Regisztráció engedélyezve', type: 'switch', value: true },
                { id: 'settingsMaintenance', label: 'Karbantartási mód', type: 'switch', value: false }
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
                    ${h.btn({ label: 'IP tiltás', icon: 'bi-ban', variant: 'outline-danger', size: 'sm' })}
                    ${h.btn({ label: 'Audit nyitás', icon: 'bi-journal-text', variant: 'outline-gold', size: 'sm', onclick: "showSection('auditLog')" })}
                    ${h.btn({ label: 'Elutasít', icon: 'bi-x-circle', variant: 'outline-secondary', size: 'sm' })}
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

    // A WS pill + kézi frissítés gomb minden szekció fejlécében jelen van,
    // ezért a status sync + ticker minden section render után fut.
    applyWsStatusToDashboard();
    startWsRelativeTicker();
    if (state.liveStatsAt) {
        rescheduleStaleWatchdog();
    }

    if (sectionId === 'dashboard') {
        // 24h aktivitas chart: ha mar van adat, azonnal kirajzoljuk; ha nincs,
        // toltjuk REST-en. Az auto-refresh a dashboard nyitvatartas alatt fut.
        if (state.activityChart.status === 'loaded' || state.activityChart.status === 'empty') {
            applyActivityChartStatus(state.activityChart);
        } else {
            applyActivityChartStatus({ status: state.adminToken ? 'loading' : 'error', error: state.adminToken ? null : 'Nincs admin token.' });
            if (state.adminToken) loadActivityChart();
        }
        startActivityRefreshTimer();
        if (state.liveStatsAt) {
            setText('tickBandTime', formatRelative(state.liveStatsAt));
        }
    }
    if (sectionId === 'profileImageReview') {
        window.MattMesterAdminProfileImages?.refresh?.();
    }
    if (sectionId === 'users') {
        // Reset visibleCount csak akkor, ha üres a lista — különben a user
        // által addig lazy-loadolt mennyiséget visszaállítjuk minimumra.
        if (!Array.isArray(state.users.list) || state.users.list.length === 0) {
            state.users.visibleCount = ADMIN_USERS_PAGE_SIZE;
            renderAdminUsersTable({ reason: 'loading' });
            loadAdminUsersList({ silent: false });
        } else {
            // Cache-elt adat — azonnal renderelünk, majd csendben frissítünk.
            renderAdminUsersTable({ reason: 'loaded' });
            loadAdminUsersList({ silent: true });
        }
    }
    if (sectionId === 'userDetail' && state.selectedUser) {
        applyUserDetailAvatar();
        bindAdminUserDetailValidation();
        bindAdminImageEditorEvents();
    }
    if (sectionId === 'userBan') {
        if (!Array.isArray(state.users.list) || state.users.list.length === 0) {
            loadAdminUsersList({ silent: true });
        }
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
        try { state.adminSocket.disconnect(); } catch (_) { }
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
    if (!state.adminToken) pill.classList.add('expired');
    else if (left === 0) pill.classList.add('expired');
    else if (left <= 60) pill.classList.add('expiring');
    else if (left <= 300) pill.classList.add('warning');
    else pill.classList.add('healthy');

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
                try { state.adminSocket.disconnect(); } catch (_) { }
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
                try { sock.emit('admin:presence:hello'); } catch (_) { }
                // Replay: friss kapcsolódás után le kell húzni a 24h-os audit naplóból
                // az eddig történt eseményeket, hogy az "Élő admin tevékenység" panel
                // ne maradjon üresen, csak mert nem ez az admin volt online a
                // korábbi mutáló kéréseknél.
                try {
                    const sinceEventId = state.liveAudit.length
                        ? Number(state.liveAudit[0]?.eventId) || 0
                        : 0;
                    sock.emit('admin:replay:request', { sinceEventId });
                } catch (_) { }
            });

            sock.on('admin:replay:batch', (payload = {}) => {
                try {
                    const events = Array.isArray(payload.events) ? payload.events : [];
                    if (!events.length) return;
                    // A backend ascending ID-ben küld; a state.liveAudit "legújabb elöl" konvenciójú,
                    // ezért fordított sorrendben push-oljuk a végére, majd vágunk MAX_LIVE_BUFFER-re.
                    const known = new Set(state.liveAudit.map((e) => e.eventId).filter((x) => x));
                    for (const ev of events) {
                        if (!ev || known.has(ev.eventId)) continue;
                        state.liveAudit.unshift(ev);
                    }
                    if (state.liveAudit.length > MAX_LIVE_BUFFER) {
                        state.liveAudit.length = MAX_LIVE_BUFFER;
                    }
                    // Szinkronban van — ha a dashboard nyitva van, frissítjük a feed-et
                    if (state.currentSectionId === 'dashboard') {
                        // re-render a szekciót, hogy a feed és a chip-ek is frissüljenek
                        showSection('dashboard', null, { silent: true });
                    } else if (state.currentSectionId === 'auditLog') {
                        showSection('auditLog', null, { silent: true });
                    }
                } catch (err) {
                    console.warn('admin:replay:batch hiba:', err);
                }
            });

            sock.on('admin:replay:error', (payload = {}) => {
                console.warn('admin:replay:error:', payload?.message || payload?.code);
            });

            // Server-oldali kemeny kileptetes: revoke / ban / role-down miatt
            // a backend a sajat oldalan mar levalasztott. Tisztitsuk ki a klienst is.
            sock.on('admin:force-logout', (payload = {}) => {
                try {
                    const reason = String(payload?.reason || 'admin_session_terminated');
                    console.warn('[admin-ws] force-logout:', reason);
                    // Helyi token tisztitas + token pill nullazas
                    if (typeof clearAdminToken === 'function') clearAdminToken();
                    if (typeof updateTokenPill === 'function') updateTokenPill();
                    // WS bontas (a backend ugyis disconnect-tel folytatja, de redundans biztositas)
                    try { sock.disconnect(); } catch (_) { }
                    state.adminSocket = null;
                    state.adminSocketConnected = false;
                    setWsStatus('no_token');
                    if (typeof showToast === 'function') {
                        const msg = reason === 'admin_role_revoked'
                            ? 'Az admin jogosultságod visszavonásra került.'
                            : 'Az admin munkamenet lezárult.';
                        showToast(msg, 'danger', 'bi-shield-fill-x');
                    }
                    setTimeout(() => { window.location.href = '/'; }, 800);
                } catch (err) {
                    console.warn('admin:force-logout handler hiba:', err);
                }
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
    } else if (state.currentSectionId === 'users') {
        // A users szekció a stats:tick ütemére csendben újratölti a listát.
        maybeRefreshAdminUsersOnTick();
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

        setTextWithFlash('tickOnline', stats.online?.totalUsers ?? 0);
        setTextWithFlash('tickActiveTabs', stats.online?.activeTabs ?? stats.online?.totalTabs ?? 0);
        setTextWithFlash('tickAdmins', stats.online?.totalAdmins ?? 0);
        setTextWithFlash('tickInGame', inGameValue);
        setTextWithFlash('tickMatchmaking', stats.online?.inMatchmaking ?? 0);
        setTextWithFlash('tickPendingImages', stats.pending?.profileImages ?? 0);
        setTextWithFlash('tickPendingFriends', stats.pending?.friendRequests ?? 0);
        setTextWithFlash('tickRateEsc', stats.rateLimit?.activeEscalations ?? 0);

        setTextWithFlash('mainOnlineTotal', stats.online?.totalUsers ?? 0);
        setTextWithFlash('mainInGame', inGameValue);
        setTextWithFlash('mainAuditCount', last24.auditEntries ?? 0);
        setTextWithFlash('mainAlertCount', last24.alerts ?? 0);

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

        setTextWithFlash('mini24Logins', last24.logins ?? 0);
        setTextWithFlash('mini24Registrations', last24.registrations ?? 0);
        setTextWithFlash('mini24Audit', last24.auditEntries ?? 0);
        setTextWithFlash('mini24Critical', last24.criticalAuditEntries ?? 0);
        setTextWithFlash('mini24Alerts', last24.alerts ?? 0);
        setTextWithFlash('mini24Bans', last24.newBans ?? 0);

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
            feed.dataset.feedState = 'live';

            feed.insertAdjacentHTML('afterbegin', html);
            while (feed.children.length > 25) feed.lastElementChild.remove();
            const newRow = feed.firstElementChild;
            if (newRow) {
                newRow.classList.add('live-feed-flash');
                setTimeout(() => newRow.classList.remove('live-feed-flash'), 1200);
            }
            const rowCount = feed.querySelectorAll('.live-feed-row').length;
            const counter = document.getElementById('liveFeedCount');
            if (counter) counter.innerHTML = `<i class="bi bi-list-ul me-1"></i>${rowCount} esemény`;
            const lastTime = document.getElementById('liveFeedLastTime');
            if (lastTime) lastTime.textContent = 'Utolsó: épp most';
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
        if (timeEl) timeEl.textContent = state.liveStatsAt ? `tick: ${formatRelative(state.liveStatsAt)}` : 'nincs tick';

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
            tickIndicator.classList.toggle('text-muted', status.key !== 'connected');
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
            // Live-feed: utolso esemeny relativ ideje
            const lastTime = document.getElementById('liveFeedLastTime');
            if (lastTime) {
                const last = latestEventTime(state.liveAudit, state.liveAlerts);
                if (last) lastTime.textContent = `Utolsó: ${formatRelative(last)}`;
            }
            // Activity chart pill detail (loaded allapotban frissul az ido)
            if (state.activityChart.status === 'loaded') {
                const detailEl = document.getElementById('chartStatusDetail');
                if (detailEl && state.activityChart.loadedAt) {
                    const recordCount = state.activityChart.totals?.records ?? 0;
                    detailEl.textContent = `· ${recordCount} rekord · frissítve: ${formatRelative(state.activityChart.loadedAt)}`;
                }
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
            // A 24h chart-ot is frissitjuk (REST), hogy a kezi gomb teljes egeszet jelentsen.
            loadActivityChart({ silent: true });
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
                'users.ban': 'Felhasználó tiltása',
                'users.delete': 'Felhasználó törlése',
                'chat.delete': 'Chat üzenet törlése',
                'notifications.broadcast': 'Globális értesítés küldése',
                'admin.grant': 'Admin szerep kiosztása',
                'admin.revoke': 'Admin szerep visszavonása'
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
   16.5) Admin Felhasználók — szűrés, lazy loading, render, modal
   ============================================================= */

// Egy user row HTML-je. signature alapján a renderelő villantja, ha változott.
function renderAdminUserRow(user) {
    let html = '';
    try {
        if (user) {
            const signature = buildUserSignature(user);
            const banned = Boolean(user.isBanned);
            const display = h.user({
                name: user.username || '—',
                email: user.email || '',
                username: user.username,
                profile_image: user.profileImage,
                struck: banned
            });
            const eloCell = renderEloTrio(user);
            const roleCell = rolePill(user.role === 'admin' ? 'admin' : 'player');
            const statusCell = renderUserStatusCell(user);
            const lastActiveSource = user.online ? (user.presenceLastSeenAt || user.lastActive) : user.lastActive;
            const lastActiveCell = lastActiveSource
                ? `<span class="${user.online ? 'text-success fw-semibold' : 'text-secondary'}" title="${escapeHtml(new Date(lastActiveSource).toLocaleString('hu-HU'))}">${escapeHtml(user.online ? 'Most' : formatRelative(lastActiveSource))}</span>`
                : '<span class="text-muted">—</span>';
            const joinedCell = `<span class="text-secondary">${escapeHtml(formatDateOnly(user.createdAt))}</span>`;

            const actionItems = banned
                ? [
                    { icon: 'bi-eye', variant: 'light', title: 'Megtekintés', onclick: `openAdminUserView(${user.id})` },
                    { icon: 'bi-pencil', variant: 'gold', title: 'Szerkesztés', onclick: `editAdminUser(${user.id})` },
                    { icon: 'bi-check-circle', variant: 'success', title: 'Tiltás kezelése', onclick: `banAdminUser(${user.id})` }
                ]
                : [
                    { icon: 'bi-eye', variant: 'light', title: 'Megtekintés', onclick: `openAdminUserView(${user.id})` },
                    { icon: 'bi-pencil', variant: 'gold', title: 'Szerkesztés', onclick: `editAdminUser(${user.id})` },
                    { icon: 'bi-ban', variant: 'danger', title: 'Tiltás (kritikus)', onclick: `banAdminUser(${user.id})` }
                ];

            html = `
                <tr class="admin-user-row${user.online ? ' is-online' : ''}" data-user-id="${user.id}" data-signature="${escapeHtml(signature)}">
                    <td>${display}</td>
                    <td>${eloCell}</td>
                    <td>${roleCell}</td>
                    <td>${statusCell}</td>
                    <td>${lastActiveCell}</td>
                    <td>${joinedCell}</td>
                    <td class="text-end">${h.actions(actionItems)}</td>
                </tr>
            `;
        }
    } catch (err) {
        console.error('renderAdminUserRow hiba:', err);
        html = '';
    }
    return html;
}

// Üres állapot HTML — reason alapján más szöveg.
function renderAdminUsersEmptyRow(reason) {
    let html = '';
    try {
        const messages = {
            no_token: { icon: 'bi-shield-slash', title: 'Nincs admin token', sub: 'A lista betöltéséhez aktív admin step-up token szükséges.' },
            loading: { icon: 'bi-arrow-repeat', title: 'Felhasználói lista betöltése…', sub: '' },
            error: { icon: 'bi-exclamation-triangle', title: 'Hiba a lista betöltésénél', sub: state.users.error || 'Ismeretlen hiba.' },
            empty: { icon: 'bi-inbox', title: 'Nincs találat', sub: 'Próbáld törölni vagy módosítani a szűrőket.' }
        };
        const m = messages[reason] || messages.empty;
        html = `
            <tr class="admin-users-empty-row admin-users-empty-${reason || 'empty'}">
                <td colspan="7" class="text-center py-5">
                    <i class="bi ${m.icon} admin-users-empty-icon ${reason === 'loading' ? 'spin' : ''}"></i>
                    <div class="admin-users-empty-title">${escapeHtml(m.title)}</div>
                    ${m.sub ? `<div class="admin-users-empty-sub">${escapeHtml(m.sub)}</div>` : ''}
                </td>
            </tr>
        `;
    } catch (err) {
        console.error('renderAdminUsersEmptyRow hiba:', err);
        html = '<tr><td colspan="7" class="text-center py-4">Hiba.</td></tr>';
    }
    return html;
}

// Fő render: scroll-poz megőrzés + diff-flash + lazy load. reason: 'loaded',
// 'refresh', 'loading', 'error', 'no_token', 'filter', 'lazy'.
function renderAdminUsersTable(options = {}) {
    let rendered = false;
    try {
        const tbody = document.getElementById('adminUsersTbody');
        const wrap = document.getElementById('adminUsersTableWrap');
        if (!tbody) {
            // Nem aktív section, csak state-et frissítünk.
            rendered = false;
        } else {
            const reason = options.reason || 'refresh';
            const list = getFilteredAdminUsers();
            const total = list.length;
            const visibleCount = Math.min(state.users.visibleCount, total);
            const visible = list.slice(0, visibleCount);

            // Meta + footer frissítés
            updateAdminUsersMeta(total, visibleCount);

            // Hibajelzés / üres állapot
            const noToken = !state.adminToken || reason === 'no_token';
            const errored = reason === 'error';
            const loading = reason === 'loading' && state.users.list.length === 0;

            if (noToken) {
                tbody.innerHTML = renderAdminUsersEmptyRow('no_token');
            } else if (errored && state.users.list.length === 0) {
                tbody.innerHTML = renderAdminUsersEmptyRow('error');
            } else if (loading) {
                tbody.innerHTML = renderAdminUsersEmptyRow('loading');
            } else if (total === 0) {
                tbody.innerHTML = renderAdminUsersEmptyRow('empty');
            } else {
                // Diff-render: a saját scroll-konténer (wrap) scrollTop-jat őrizzük meg.
                const wrapScrollTop = wrap ? wrap.scrollTop : 0;
                const pageScrollY = window.scrollY;

                // Meglévő sorok index userId -> tr
                const existingRows = new Map();
                tbody.querySelectorAll('tr.admin-user-row').forEach((tr) => {
                    const id = tr.getAttribute('data-user-id');
                    if (id) existingRows.set(String(id), tr);
                });

                // Új sorrend felépítése — meglévő sort csak akkor cseréljük,
                // ha a signature változott (akkor flash).
                const fragment = document.createDocumentFragment();
                const newSignatures = new Map();
                visible.forEach((user) => {
                    const idStr = String(user.id);
                    const newSig = buildUserSignature(user);
                    newSignatures.set(idStr, newSig);
                    const existing = existingRows.get(idStr);
                    const prevSig = existing?.getAttribute('data-signature');
                    if (existing && prevSig === newSig) {
                        // Változatlan — visszahelyezzük az új pozícióba.
                        fragment.appendChild(existing);
                    } else {
                        const wrapper = document.createElement('tbody');
                        wrapper.innerHTML = renderAdminUserRow(user);
                        const newTr = wrapper.querySelector('tr');
                        if (newTr) {
                            if (existing && prevSig !== newSig) {
                                newTr.classList.add('admin-user-row-flash');
                                setTimeout(() => newTr.classList.remove('admin-user-row-flash'), 1100);
                            } else if (!existing && reason === 'refresh') {
                                newTr.classList.add('admin-user-row-flash-new');
                                setTimeout(() => newTr.classList.remove('admin-user-row-flash-new'), 1400);
                            }
                            fragment.appendChild(newTr);
                        }
                    }
                });

                tbody.replaceChildren(fragment);
                state.users.rowSignatures = newSignatures;

                // scroll poz visszaállítás — wrap scrollTop ÉS window scroll külön
                if (wrap && Math.abs(wrap.scrollTop - wrapScrollTop) > 1) {
                    wrap.scrollTop = wrapScrollTop;
                }
                if (Math.abs(window.scrollY - pageScrollY) > 1) {
                    window.scrollTo({ top: pageScrollY, behavior: 'instant' });
                }
            }

            // IntersectionObserver setup (csak egyszer, az aktív tbody-ra)
            ensureAdminUsersObserver();

            // wrap-en data-state, CSS hookhoz
            if (wrap) {
                wrap.dataset.state = noToken ? 'no_token' : (errored ? 'error' : (total === 0 ? 'empty' : 'loaded'));
            }
            rendered = true;
        }
    } catch (err) {
        console.error('renderAdminUsersTable hiba:', err);
        rendered = false;
    }
    return rendered;
}

function updateAdminUsersMeta(total, visibleCount) {
    try {
        const countEl = document.getElementById('adminUsersCount');
        const timeEl = document.getElementById('adminUsersUpdatedAt');
        const footerEl = document.getElementById('adminUsersFooterText');
        if (countEl) countEl.textContent = `${total} felhasználó`;
        if (timeEl) {
            if (state.users.loading) {
                timeEl.textContent = 'frissítés…';
            } else if (state.users.error) {
                timeEl.textContent = 'hiba';
            } else if (state.users.loadedAt) {
                timeEl.textContent = `frissítve: ${formatRelative(state.users.loadedAt)}`;
            } else {
                timeEl.textContent = '—';
            }
        }
        if (footerEl) {
            if (total === 0) {
                footerEl.textContent = '—';
            } else if (visibleCount >= total) {
                footerEl.textContent = `Mind a ${total} felhasználó megjelenítve.`;
            } else {
                footerEl.textContent = `${visibleCount} / ${total} felhasználó megjelenítve — görgess lefelé a továbbiakhoz.`;
            }
        }
    } catch (err) {
        console.warn('updateAdminUsersMeta hiba:', err);
    }
}

// IntersectionObserver — a sentinel láthatóvá válásakor +50 sor renderelve.
// A scroll-konténer a .admin-users-table-wrap (saját max-height + overflow), így
// az observer root-ja is ez kell legyen.
function ensureAdminUsersObserver() {
    try {
        const sentinel = document.getElementById('adminUsersSentinel');
        const root = document.getElementById('adminUsersTableWrap');
        if (!sentinel || !root) {
            // Nem aktív section
        } else if (state.users.observer && state.users.observer.__sentinel === sentinel && state.users.observer.__root === root) {
            // Már be van kötve ehhez a sentinelhez
        } else {
            if (state.users.observer) {
                try { state.users.observer.disconnect(); } catch (_) { }
            }
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const total = getFilteredAdminUsers().length;
                        if (state.users.visibleCount < total) {
                            state.users.visibleCount = Math.min(total, state.users.visibleCount + ADMIN_USERS_PAGE_SIZE);
                            renderAdminUsersTable({ reason: 'lazy' });
                        }
                    }
                });
            }, { root, rootMargin: '300px 0px' });
            observer.observe(sentinel);
            observer.__sentinel = sentinel;
            observer.__root = root;
            state.users.observer = observer;
        }
    } catch (err) {
        console.warn('ensureAdminUsersObserver hiba:', err);
    }
}

// Search input — debounce, hogy gyors gépelés esetén ne reszeljen minden chart.
function onAdminUsersFilterInput(event) {
    try {
        const value = event?.target?.value ?? '';
        state.users.filters.search = value;
        const clearBtn = document.getElementById('adminUsersSearchClear');
        if (clearBtn) clearBtn.classList.toggle('d-none', !value);
        if (state.users.searchDebounceId) clearTimeout(state.users.searchDebounceId);
        state.users.searchDebounceId = setTimeout(() => {
            state.users.visibleCount = ADMIN_USERS_PAGE_SIZE;
            renderAdminUsersTable({ reason: 'filter' });
        }, 180);
    } catch (err) {
        console.warn('onAdminUsersFilterInput hiba:', err);
    }
}

function clearAdminUsersSearch() {
    try {
        const input = document.getElementById('adminUserSearchInput');
        if (input) input.value = '';
        state.users.filters.search = '';
        const clearBtn = document.getElementById('adminUsersSearchClear');
        if (clearBtn) clearBtn.classList.add('d-none');
        state.users.visibleCount = ADMIN_USERS_PAGE_SIZE;
        renderAdminUsersTable({ reason: 'filter' });
    } catch (err) {
        console.warn('clearAdminUsersSearch hiba:', err);
    }
}

// Role / Status / OrderBy select változás — azonnal újrarenderel.
function onAdminUsersFilterChange() {
    try {
        const role = document.getElementById('adminRoleFilter')?.value ?? '';
        const status = document.getElementById('adminStatusFilter')?.value ?? '';
        const orderBy = document.getElementById('adminOrderBy')?.value ?? 'lastActive';
        state.users.filters.role = role;
        state.users.filters.status = status;
        state.users.filters.orderBy = orderBy;
        state.users.visibleCount = ADMIN_USERS_PAGE_SIZE;
        renderAdminUsersTable({ reason: 'filter' });
    } catch (err) {
        console.warn('onAdminUsersFilterChange hiba:', err);
    }
}

// Kézi frissítés gomb
function refreshAdminUsersList() {
    try {
        const btn = document.getElementById('adminUsersRefreshBtn');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('btn-loading');
            const icon = btn.querySelector('i.bi');
            if (icon) icon.classList.add('spin');
            setTimeout(() => {
                btn.disabled = false;
                btn.classList.remove('btn-loading');
                if (icon) icon.classList.remove('spin');
            }, 1200);
        }
        loadAdminUsersList({ silent: true });
    } catch (err) {
        console.warn('refreshAdminUsersList hiba:', err);
    }
}

// stats:tick triggerelt csendes refresh — csak ha a users section aktív
function maybeRefreshAdminUsersOnTick() {
    try {
        if (state.currentSectionId === 'users' && state.adminToken && !state.users.loading) {
            loadAdminUsersList({ silent: true });
        }
    } catch (err) {
        console.warn('maybeRefreshAdminUsersOnTick hiba:', err);
    }
}

// Egy user keresése a state.users.list-ből
function findAdminUserById(userId) {
    let result = null;
    try {
        const numericId = Number(userId);
        if (Number.isFinite(numericId)) {
            const list = Array.isArray(state.users.list) ? state.users.list : [];
            result = list.find((u) => Number(u.id) === numericId) || null;
        }
    } catch (err) {
        console.warn('findAdminUserById hiba:', err);
        result = null;
    }
    return result;
}

// Kiválaszt egy usert szerkesztés / tiltás céljára. nav: cél section.
function selectAdminUser(userId, nav) {
    let ok = false;
    try {
        const user = findAdminUserById(userId);
        if (user) {
            state.selectedUserId = user.id;
            state.selectedUser = user;
            if (nav) showSection(nav);
            ok = true;
        } else {
            showToast('A felhasználó nem található a betöltött listában.', 'warning', 'bi-exclamation-triangle');
        }
    } catch (err) {
        console.error('selectAdminUser hiba:', err);
    }
    return ok;
}

function editAdminUser(userId) {
    return selectAdminUser(userId, 'userDetail');
}

function banAdminUser(userId) {
    return selectAdminUser(userId, 'userBan');
}

function applyUserDetailAvatar() {
    try {
        const u = state.selectedUser;
        if (!u || !window.MattMesterProfileImage) return;
        const targets = [
            { el: document.getElementById('userDetailProfileImage'), size: 96 },
            { el: document.getElementById('userDetailProfileImageLarge'), size: 160 }
        ];
        for (const t of targets) {
            if (t.el) {
                window.MattMesterProfileImage.applyProfileImagePresentation(t.el, {
                    source: { username: u.username, profile_image: u.profileImage },
                    size: t.size
                });
            }
        }
    } catch (err) {
        console.warn('applyUserDetailAvatar hiba:', err);
    }
}

function setAdminUserDetailImageMessage(type, message) {
    try {
        const el = document.getElementById('adminUserDetailImageMessage');
        if (!el) return;
        if (!message) {
            el.className = 'alert d-none mt-2 mb-0 py-2 px-3';
            el.textContent = '';
            return;
        }
        el.className = `alert alert-${type} mt-2 mb-0 py-2 px-3`;
        el.textContent = message;
    } catch (err) {
        console.warn('setAdminUserDetailImageMessage hiba:', err);
    }
}

function collectAdminUserDetailFormValues() {
    const getValue = (id) => document.getElementById(id)?.value ?? '';
    const getNumber = (id, fallback = 0) => {
        const parsed = Number(getValue(id));
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    return {
        username: String(getValue('editUsername')).trim(),
        email: String(getValue('editEmail')).trim(),
        role: String(getValue('editRole')).trim(),
        emailVerified: Boolean(document.getElementById('editEmailVerified')?.checked),
        elo: getNumber('editEloClassic', 0),
        eloMM: getNumber('editEloMM', 0),
        eloBullet: getNumber('editEloBullet', 0),
        wins: getNumber('editWins', 0),
        losses: getNumber('editLosses', 0),
        draws: getNumber('editDraws', 0),
        abilitiesUsed: getNumber('editAbilitiesUsed', 0),
        reason: String(document.getElementById('editReason')?.value || '').trim()
    };
}

function applyAdminUserDetailFormValues(values) {
    const selectedUser = state.selectedUser;
    if (!selectedUser) return null;

    const updated = {
        ...selectedUser,
        username: values.username || selectedUser.username,
        email: values.email || selectedUser.email,
        role: values.role || selectedUser.role,
        emailVerified: Boolean(values.emailVerified),
        elo: values.elo,
        eloMM: values.eloMM,
        eloBullet: values.eloBullet,
        wins: values.wins,
        losses: values.losses,
        draws: values.draws,
        totalAbilities: values.abilitiesUsed,
        profileImageStatus: selectedUser.profileImageStatus || 'default'
    };

    state.selectedUser = updated;
    if (Array.isArray(state.users.list)) {
        state.users.list = state.users.list.map((item) => Number(item.id) === Number(updated.id) ? { ...item, ...updated } : item);
    }
    return updated;
}

async function saveAdminUserDetailChanges() {
    const saveBtn = document.getElementById('adminUserDetailSaveBtn');
    const originalLabel = saveBtn ? saveBtn.innerHTML : '';
    try {
        const user = state.selectedUser;
        if (!user) {
            showToast('Nincs kiválasztott felhasználó.', 'warning', 'bi-exclamation-triangle');
            return false;
        }

        const validation = validateAdminUserDetailForm();
        if (!validation.canSave) {
            if (!validation.anyChange) {
                showToast('Nincs változás a mentéshez.', 'warning', 'bi-exclamation-circle');
            } else if (validation.hasErrors) {
                showToast('Javítsd ki a piros mezőket a mentés előtt.', 'warning', 'bi-exclamation-circle');
            } else {
                showToast('Az indok legalább 10 karakter legyen.', 'warning', 'bi-exclamation-circle');
            }
            return false;
        }

        const values = collectAdminUserDetailFormValues();
        const initial = adminUserDetailFormState.initial || {};

        // Csak a tényleg megváltozott mezőket küldjük el — kisebb felület + tisztább audit log.
        const payload = { reason: values.reason };
        const fieldMap = [
            ['username', 'username'],
            ['email', 'email'],
            ['role', 'role'],
            ['emailVerified', 'emailVerified'],
            ['elo', 'eloClassic'],
            ['eloMM', 'eloMM'],
            ['eloBullet', 'eloBullet'],
            ['wins', 'wins'],
            ['losses', 'losses'],
            ['draws', 'draws'],
            ['totalAbilities', 'abilitiesUsed']
        ];
        for (const [apiKey, formKey] of fieldMap) {
            const next = formKey === 'abilitiesUsed' ? values.abilitiesUsed : values[formKey === 'eloClassic' ? 'elo' : formKey];
            const initialKey = ({
                username: 'username', email: 'email', role: 'role', emailVerified: 'emailVerified',
                eloClassic: 'eloClassic', eloMM: 'eloMM', eloBullet: 'eloBullet',
                wins: 'wins', losses: 'losses', draws: 'draws', abilitiesUsed: 'abilitiesUsed'
            })[formKey];
            if (next !== initial[initialKey]) payload[apiKey] = next;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Mentés...';
        }

        const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/edit`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.success) {
            const code = result?.code || '';
            if (code && getAdminAuthFlow().handleAdminAuthError(code)) {
                return false;
            }
            throw new Error(result?.message || 'A mentés sikertelen.');
        }

        // Backend válasz alapján szinkronizáljuk a globális state-et és minden felületet.
        const after = result.data?.after || {};
        applyAdminUserPartialUpdate(user.id, {
            username: after.username,
            email: after.email,
            role: after.role,
            emailVerified: after.emailVerified,
            elo: after.elo,
            eloMM: after.eloMM,
            eloBullet: after.eloBullet,
            wins: after.wins,
            losses: after.losses,
            draws: after.draws,
            totalAbilities: after.totalAbilities,
            // Email csere esetén a verified flag is változhatott (admin által)
            emailVerifiedAt: after.emailVerified ? (state.selectedUser?.emailVerifiedAt || new Date().toISOString()) : null
        });

        // Friss user lista + audit lista letöltése — minden admin felület naprakész
        try { loadAdminUsersList({ silent: true }); } catch (_) { }
        // Ha a "Részletek megtekintése" modal éppen ezen a useren van nyitva,
        // frissítsük a benne lévő audit + security tabok tartalmát is
        try {
            if (state.userView?.userId && Number(state.userView.userId) === Number(user.id)) {
                if (typeof loadAdminUserAuditTab === 'function') {
                    loadAdminUserAuditTab('target');
                    loadAdminUserAuditTab('actor');
                }
                if (typeof loadAdminUserSecurityActivity === 'function') {
                    loadAdminUserSecurityActivity();
                }
            }
        } catch (_) { }

        showToast(result.message || 'Mentés sikeres.', 'success', 'bi-check2-circle');
        return true;
    } catch (err) {
        console.warn('saveAdminUserDetailChanges hiba:', err);
        showToast(err?.message || 'A mentés sikertelen.', 'danger', 'bi-x-circle');
        return false;
    } finally {
        if (saveBtn) {
            saveBtn.innerHTML = originalLabel || '<i class="bi bi-check2-circle me-1"></i>Mentés';
            // a disabled állapotot a következő validateAdminUserDetailForm() helyreteszi
            try { validateAdminUserDetailForm(); } catch (_) { }
        }
    }
}

function adminSendPasswordReset(userId) {
    try {
        const user = state.selectedUser && Number(state.selectedUser.id) === Number(userId) ? state.selectedUser : (Array.isArray(state.users.list) ? state.users.list.find((x) => Number(x.id) === Number(userId)) : null);
        if (!user || !user.email) {
            showToast('Nincs kiválasztva felhasználó vagy email cím hiányzik.', 'danger', 'bi-x-circle');
            return;
        }

        const btn = event.target.closest('button');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; }

        fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email })
        }).then((res) => res.json().catch(() => ({}))).then((result) => {
            if (result && result.success) {
                showToast('Jelszó-visszaállító email elküldve.', 'success', 'bi-check2-circle');
            } else {
                showToast(result.message || 'Nem sikerült elküldeni a visszaállító emailt.', 'danger', 'bi-x-circle');
            }
        }).catch((err) => {
            showToast('Hálózati hiba történt a küldés során.', 'danger', 'bi-x-circle');
        }).finally(() => { if (btn) { btn.disabled = false; btn.innerHTML = originalText; } });
    } catch (e) {
        console.error('adminSendPasswordReset hiba:', e);
        showToast('Hiba történt a jelszó-visszaállítás során.', 'danger', 'bi-x-circle');
    }
}

async function adminRevokeUserSessions(userId, event) {
    try {
        const user = findAdminUserById(userId) || state.selectedUser;
        if (!user) {
            showToast('A felhasználó nem található.', 'danger', 'bi-x-circle');
            return;
        }

        // Biztonsági megerősítés kérése
        if (!confirm(`Biztosan meg akarod szakítani ${user.username || 'a felhasználó'} összes aktív munkamenetét (kijelentkeztetés minden eszközről)?`)) {
            return;
        }

        const btn = event ? event.target.closest('button') : null;
        const originalText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Folyamatban...';
        }

        const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ reason: 'admin_revoke_all_sessions' })
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok && result?.success) {
            showToast(result.message || 'Munkamenetek sikeresen megszakítva.', 'success', 'bi-check2-circle');

            // Ha épp nyitva van a részletek modal, csendben frissítjük a jelenléti állapotot (offline-ra fog ugrani)
            if (state.userView?.userId && Number(state.userView.userId) === Number(userId)) {
                loadAdminUserPresence();
            }
        } else {
            const code = result?.code || '';
            // Ellenőrizzük, hogy nem auth hiba-e (pl. lejárt az admin tokenünk közben)
            if (!getAdminAuthFlow().handleAdminAuthError(code)) {
                showToast(result?.message || 'Hiba történt a munkamenetek megszakításakor.', 'danger', 'bi-x-circle');
            }
        }

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    } catch (e) {
        console.error('adminRevokeUserSessions hiba:', e);
        showToast('Hálózati hiba történt a művelet során.', 'danger', 'bi-x-circle');
    }
}

function validateAdminUserDetailImageFile(file) {
    if (!file) return 'Nincs kiválasztott fájl.';
    if (!ADMIN_USER_DETAIL_IMAGE_ALLOWED_MIME_TYPES.has(file.type)) {
        return 'Csak JPG, PNG vagy WEBP fájl tölthető fel.';
    }
    if (file.size <= 0) return 'Üres fájl nem tölthető fel.';
    if (file.size > ADMIN_USER_DETAIL_IMAGE_MAX_SIZE_BYTES) {
        return 'A fájl túl nagy. Maximum 3 MB engedélyezett.';
    }
    return '';
}

function applyAdminUserPartialUpdate(userId, partial = {}) {
    let updated = null;
    try {
        const numericId = Number(userId);
        if (!Number.isFinite(numericId)) return null;

        if (Array.isArray(state.users.list)) {
            state.users.list = state.users.list.map((entry) => {
                if (Number(entry.id) === numericId) {
                    updated = { ...entry, ...partial };
                    return updated;
                }
                return entry;
            });
        }

        if (state.selectedUser && Number(state.selectedUser.id) === numericId) {
            state.selectedUser = { ...state.selectedUser, ...partial };
            updated = state.selectedUser;
        }

        if (state.currentSectionId === 'users') {
            renderAdminUsersTable({ reason: 'refresh' });
        }
        if (state.currentSectionId === 'userDetail') {
            showSection('userDetail', null, { silent: true });
        }
        if (state.userView?.userId && Number(state.userView.userId) === numericId && updated) {
            renderAdminUserViewModal(updated);
        }
    } catch (err) {
        console.warn('applyAdminUserPartialUpdate hiba:', err);
    }
    return updated;
}

function openSelectedUserProfileView() {
    try {
        const selectedId = Number(state.selectedUser?.id || 0);
        if (!selectedId) {
            showToast('Nincs kiválasztott felhasználó.', 'warning', 'bi-exclamation-triangle');
            return false;
        }
        return openAdminUserView(selectedId);
    } catch (err) {
        console.warn('openSelectedUserProfileView hiba:', err);
        showToast('A profil megtekintés most nem elérhető.', 'danger', 'bi-x-circle');
        return false;
    }
}

/* =============================================================
   Admin user detail — change tracking + format validation.
   A profil oldal validateProfileSettingsForm() mintáját követi:
   - snapshot az eredeti értékekről render-kor
   - minden inputon diff-et számolunk vs. baseline
   - per-mező visszajelzés: VÁLTOZOTT+érvényes → zöld, formátumhiba → piros,
     változatlan → semleges
   - mentés gomb csak akkor enabled, ha legalább 1 valós változás van,
     nincs formátumhiba, és az indok ≥ 10 karakter
   ============================================================= */
const ADMIN_USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,20}$/;
const ADMIN_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const adminUserDetailFormState = {
    initial: null
};

function setAdminEditFieldFeedback(inputId, feedbackId, state, message) {
    const input = document.getElementById(inputId);
    const feedback = document.getElementById(feedbackId);
    if (!input) return;

    input.classList.remove('is-valid', 'is-invalid');
    if (feedback) feedback.classList.remove('text-valid', 'text-invalid', 'text-secondary');

    if (state === 'valid') {
        input.classList.add('is-valid');
        if (feedback) {
            feedback.classList.add('text-valid');
            feedback.textContent = message || '';
        }
    } else if (state === 'invalid') {
        input.classList.add('is-invalid');
        if (feedback) {
            feedback.classList.add('text-invalid');
            feedback.textContent = message || '';
        }
    } else if (feedback) {
        feedback.classList.add('text-secondary');
        feedback.textContent = message || '';
    }
}

function snapshotAdminUserDetailInitial(u) {
    return {
        username: String(u.username || ''),
        email: String(u.email || ''),
        role: u.role === 'admin' ? 'admin' : 'player',
        emailVerified: Boolean(u.emailVerified),
        eloClassic: Number(u.elo || 0),
        eloMM: Number(u.eloMM || 0),
        eloBullet: Number(u.eloBullet || 0),
        wins: Number(u.wins || 0),
        losses: Number(u.losses || 0),
        draws: Number(u.draws || 0),
        abilitiesUsed: Number(u.totalAbilities || 0)
    };
}

function readAdminUserDetailValues() {
    const v = (id) => (document.getElementById(id)?.value ?? '').trim();
    const n = (id) => {
        const raw = v(id);
        if (raw === '') return NaN;
        const num = Number(raw);
        return Number.isFinite(num) ? num : NaN;
    };
    return {
        username: v('editUsername'),
        email: v('editEmail'),
        role: v('editRole'),
        emailVerified: Boolean(document.getElementById('editEmailVerified')?.checked),
        eloClassic: n('editEloClassic'),
        eloMM: n('editEloMM'),
        eloBullet: n('editEloBullet'),
        wins: n('editWins'),
        losses: n('editLosses'),
        draws: n('editDraws'),
        abilitiesUsed: n('editAbilitiesUsed'),
        reason: v('editReason')
    };
}

function validateAdminUserDetailForm() {
    const initial = adminUserDetailFormState.initial;
    if (!initial) return { canSave: false, anyChange: false, hasErrors: true };

    const v = readAdminUserDetailValues();
    const errors = {};

    if (!v.username) errors.username = 'Kötelező mező.';
    else if (!ADMIN_USERNAME_REGEX.test(v.username)) errors.username = '3–20 karakter, betű/szám/_.-';

    if (!v.email) errors.email = 'Kötelező mező.';
    else if (!ADMIN_EMAIL_REGEX.test(v.email)) errors.email = 'Érvénytelen e-mail formátum.';

    const eloFields = ['eloClassic', 'eloMM', 'eloBullet'];
    for (const k of eloFields) {
        if (!Number.isFinite(v[k])) errors[k] = 'Számot kell megadni.';
        else if (v[k] < 0 || v[k] > 9999) errors[k] = '0 – 9999 között.';
        else if (!Number.isInteger(v[k])) errors[k] = 'Egész szám.';
    }
    const statFields = ['wins', 'losses', 'draws', 'abilitiesUsed'];
    for (const k of statFields) {
        if (!Number.isFinite(v[k])) errors[k] = 'Számot kell megadni.';
        else if (v[k] < 0 || !Number.isInteger(v[k])) errors[k] = 'Nem-negatív egész szám.';
    }

    const changed = {};
    for (const k of Object.keys(initial)) {
        changed[k] = v[k] !== initial[k];
    }
    const anyChange = Object.values(changed).some(Boolean);
    const hasErrors = Object.keys(errors).length > 0;
    const reasonValid = v.reason.length >= 10 && v.reason.length <= 1000;
    const canSave = anyChange && !hasErrors && reasonValid;

    // Per-mező visszajelzés
    const fb = (input, fbId, key, formatOk) => {
        if (errors[key]) {
            setAdminEditFieldFeedback(input, fbId, 'invalid', errors[key]);
        } else if (changed[key]) {
            const fromTo = `${initial[key]} → ${v[key]}`;
            setAdminEditFieldFeedback(input, fbId, 'valid', `Módosul (${fromTo}).`);
        } else {
            setAdminEditFieldFeedback(input, fbId, 'neutral', formatOk || 'Nincs változás.');
        }
    };

    fb('editUsername', 'editUsernameFeedback', 'username', 'Nincs változás.');
    fb('editEmail', 'editEmailFeedback', 'email', 'Nincs változás.');
    setAdminEditFieldFeedback('editRole', 'editRoleFeedback',
        changed.role ? 'valid' : 'neutral',
        changed.role ? `Új szerepkör: ${v.role}` : 'Nincs változás.');
    fb('editEloClassic', 'editEloClassicFeedback', 'eloClassic');
    fb('editEloMM', 'editEloMMFeedback', 'eloMM');
    fb('editEloBullet', 'editEloBulletFeedback', 'eloBullet');
    fb('editWins', 'editWinsFeedback', 'wins');
    fb('editLosses', 'editLossesFeedback', 'losses');
    fb('editDraws', 'editDrawsFeedback', 'draws');
    fb('editAbilitiesUsed', 'editAbilitiesUsedFeedback', 'abilitiesUsed');

    // Email verified switch — szöveges jelzés a kapcsoló mellett
    const verifiedFb = document.getElementById('editEmailVerifiedFeedback');
    if (verifiedFb) {
        if (changed.emailVerified) {
            verifiedFb.className = 'small text-valid';
            verifiedFb.textContent = `Módosul: ${v.emailVerified ? 'megerősített' : 'nem megerősített'}`;
        } else {
            verifiedFb.className = 'text-secondary';
            verifiedFb.textContent = 'Közvetlenül átállítható.';
        }
    }

    // Reason
    if (!anyChange) {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'neutral', 'Először módosíts legalább egy mezőt.');
    } else if (v.reason.length === 0) {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'invalid', 'Az indok kötelező, ha van változás.');
    } else if (v.reason.length < 10) {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'invalid', `Még ${10 - v.reason.length} karakter szükséges.`);
    } else if (v.reason.length > 1000) {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'invalid', 'Maximum 1000 karakter.');
    } else {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'valid', 'Megfelelő indok.');
    }

    // Változások listája + összegző alert
    const labelsMap = {
        username: 'Felhasználónév',
        email: 'E-mail',
        role: 'Szerepkör',
        emailVerified: 'Email megerősítve',
        eloClassic: 'ELO klasszikus',
        eloMM: 'ELO MattMester',
        eloBullet: 'ELO bullet',
        wins: 'Győzelmek',
        losses: 'Vereségek',
        draws: 'Döntetlenek',
        abilitiesUsed: 'Képességek'
    };
    const fmt = (key, val) => {
        if (key === 'emailVerified') return val ? 'igen' : 'nem';
        return String(val);
    };
    const changesList = document.getElementById('adminUserDetailChangesList');
    if (changesList) {
        const items = Object.keys(labelsMap)
            .filter((k) => changed[k])
            .map((k) => `<li><strong>${labelsMap[k]}</strong>: <span class="text-secondary">${escapeHtml(fmt(k, initial[k]))}</span> → <span class="text-gold">${escapeHtml(fmt(k, v[k]))}</span></li>`);
        changesList.innerHTML = items.length
            ? items.join('')
            : '<li class="text-secondary small">Még nincs változás.</li>';
    }

    const summary = document.getElementById('adminSavePackMessage');
    if (summary) {
        summary.classList.remove('alert-dark', 'alert-warning', 'alert-danger', 'alert-success');
        if (hasErrors) {
            summary.classList.add('alert-danger');
            summary.textContent = 'Egy vagy több mezőben formátumhiba van. Javítsd ki őket a mentéshez.';
        } else if (!anyChange) {
            summary.classList.add('alert-dark');
            summary.textContent = 'Nincs változás. Módosíts legalább egy mezőt a mentéshez.';
        } else if (!reasonValid) {
            summary.classList.add('alert-warning');
            summary.textContent = 'Add meg az indokot (10–1000 karakter) a mentéshez.';
        } else {
            const count = Object.values(changed).filter(Boolean).length;
            summary.classList.add('alert-success');
            summary.textContent = `${count} mező módosul — mentésre kész.`;
        }
    }

    const saveBtn = document.getElementById('adminUserDetailSaveBtn');
    if (saveBtn) saveBtn.disabled = !canSave;

    return { canSave, anyChange, hasErrors };
}

function bindAdminUserDetailValidation() {
    try {
        const u = state.selectedUser;
        if (u) adminUserDetailFormState.initial = snapshotAdminUserDetailInitial(u);

        const ids = [
            'editUsername', 'editEmail', 'editRole', 'editEmailVerified',
            'editEloClassic', 'editEloMM', 'editEloBullet',
            'editWins', 'editLosses', 'editDraws', 'editAbilitiesUsed',
            'editReason'
        ];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (!el || el.dataset.adminValidationBound === '1') continue;
            el.dataset.adminValidationBound = '1';
            const handler = () => validateAdminUserDetailForm();
            el.addEventListener('input', handler);
            el.addEventListener('change', handler);
        }
        // Inicializáló futtatás — felépíti a "nincs változás" állapotot
        validateAdminUserDetailForm();
    } catch (err) {
        console.warn('bindAdminUserDetailValidation hiba:', err);
    }
}

/* =============================================================
   Admin profilkép szerkesztő — a profile.js editor admin párja.
   Ugyanaz a kanvas-alapú crop UX, csak az admin végpontra POST-ol
   (azonnali jóváhagyással). Modal: #adminProfileImageEditorModal.
   ============================================================= */
const adminImageEditorState = {
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
    bound: false,
    targetUserId: null,
    bufferCanvas: typeof document !== 'undefined' ? document.createElement('canvas') : null
};

function getAdminImageEditorElements() {
    return {
        modal: document.getElementById('adminProfileImageEditorModal'),
        canvas: document.getElementById('adminProfileImageEditorCanvas'),
        previewCanvas: document.getElementById('adminProfileImageEditorPreview'),
        zoomInput: document.getElementById('adminProfileImageZoom'),
        rotateInput: document.getElementById('adminProfileImageRotate'),
        resetButton: document.getElementById('adminResetProfileImageEditor'),
        saveButton: document.getElementById('adminSaveProfileImageButton'),
        message: document.getElementById('adminProfileImageEditorMessage')
    };
}

function setAdminImageEditorMessage(type, message) {
    const { message: el } = getAdminImageEditorElements();
    if (!el) return;
    if (!message) {
        el.className = 'alert d-none mt-3 mb-0';
        el.textContent = '';
    } else {
        el.className = `alert alert-${type} mt-3 mb-0`;
        el.textContent = message;
    }
}

function resetAdminImageEditorState() {
    const els = getAdminImageEditorElements();
    adminImageEditorState.scale = 1;
    adminImageEditorState.rotationDeg = 0;
    adminImageEditorState.offsetX = 0;
    adminImageEditorState.offsetY = 0;
    adminImageEditorState.dragging = false;
    adminImageEditorState.uploading = false;
    if (els.zoomInput) els.zoomInput.value = '1';
    if (els.rotateInput) els.rotateInput.value = '0';
    if (els.saveButton) {
        els.saveButton.disabled = !adminImageEditorState.image;
        els.saveButton.textContent = 'Mentés és jóváhagyás';
    }
    setAdminImageEditorMessage('danger', '');
}

function revokeAdminImageObjectUrl() {
    if (adminImageEditorState.objectUrl) {
        try { URL.revokeObjectURL(adminImageEditorState.objectUrl); } catch (_) { }
        adminImageEditorState.objectUrl = null;
    }
}

function getAdminEditorCropRadius(canvas) {
    return Math.min(canvas.width, canvas.height) * 0.32;
}

function drawAdminTransformedImage(ctx, image, w, h) {
    ctx.save();
    ctx.translate(w / 2 + adminImageEditorState.offsetX, h / 2 + adminImageEditorState.offsetY);
    ctx.rotate((adminImageEditorState.rotationDeg * Math.PI) / 180);
    ctx.scale(adminImageEditorState.scale, adminImageEditorState.scale);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
}

function renderAdminImageEditor() {
    const els = getAdminImageEditorElements();
    if (!els.canvas || !els.previewCanvas) return;

    const canvas = els.canvas;
    const previewCanvas = els.previewCanvas;
    const rect = canvas.getBoundingClientRect();
    const nextW = Math.max(320, Math.round(rect.width || 640));
    const nextH = Math.max(260, Math.round(rect.height || 340));
    if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const image = adminImageEditorState.image;
    if (!image) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.font = '15px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Válassz egy képet a szerkesztéshez.', canvas.width / 2, canvas.height / 2);
        return;
    }

    const cropRadius = getAdminEditorCropRadius(canvas);
    drawAdminTransformedImage(ctx, image, canvas.width, canvas.height);

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

    const buf = adminImageEditorState.bufferCanvas;
    buf.width = canvas.width;
    buf.height = canvas.height;
    const bufCtx = buf.getContext('2d');
    if (!bufCtx) return;
    bufCtx.clearRect(0, 0, buf.width, buf.height);
    drawAdminTransformedImage(bufCtx, image, buf.width, buf.height);

    const previewCtx = previewCanvas.getContext('2d');
    if (!previewCtx) return;
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.save();
    previewCtx.beginPath();
    previewCtx.arc(previewCanvas.width / 2, previewCanvas.height / 2, previewCanvas.width / 2, 0, Math.PI * 2);
    previewCtx.clip();
    previewCtx.drawImage(
        buf,
        canvas.width / 2 - cropRadius, canvas.height / 2 - cropRadius,
        cropRadius * 2, cropRadius * 2,
        0, 0,
        previewCanvas.width, previewCanvas.height
    );
    previewCtx.restore();
}

function getAdminCroppedImageBlob() {
    const { canvas } = getAdminImageEditorElements();
    const image = adminImageEditorState.image;
    if (!canvas || !image) return Promise.reject(new Error('Nincs szerkesztésre kiválasztott kép.'));

    const cropRadius = getAdminEditorCropRadius(canvas);
    const out = document.createElement('canvas');
    out.width = 512;
    out.height = 512;
    const outCtx = out.getContext('2d');
    if (!outCtx) return Promise.reject(new Error('Nem sikerült előkészíteni a mentést.'));

    outCtx.drawImage(
        adminImageEditorState.bufferCanvas,
        canvas.width / 2 - cropRadius, canvas.height / 2 - cropRadius,
        cropRadius * 2, cropRadius * 2,
        0, 0, out.width, out.height
    );

    return new Promise((resolve, reject) => {
        out.toBlob((blob) => {
            if (!blob) reject(new Error('A kép mentése sikertelen.'));
            else resolve(blob);
        }, 'image/png');
    });
}

async function openAdminImageEditorFromFile(file, userId) {
    const els = getAdminImageEditorElements();
    if (!els.modal) throw new Error('Az admin képszerkesztő modal nem elérhető.');

    revokeAdminImageObjectUrl();
    adminImageEditorState.objectUrl = URL.createObjectURL(file);
    adminImageEditorState.targetUserId = userId;

    const image = new Image();
    image.src = adminImageEditorState.objectUrl;
    await new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('A kép betöltése sikertelen.'));
    });

    adminImageEditorState.image = image;
    resetAdminImageEditorState();

    const modal = bootstrap.Modal.getOrCreateInstance(els.modal);
    modal.show();
    setTimeout(() => renderAdminImageEditor(), 0);
}

async function submitAdminImageUpload() {
    const els = getAdminImageEditorElements();
    if (!els.saveButton || adminImageEditorState.uploading) return;
    if (!adminImageEditorState.image) {
        setAdminImageEditorMessage('danger', 'Nincs szerkesztésre kiválasztott kép.');
        return;
    }
    const userId = Number(adminImageEditorState.targetUserId) || 0;
    if (!userId) {
        setAdminImageEditorMessage('danger', 'Nincs kiválasztott felhasználó a feltöltéshez.');
        return;
    }

    adminImageEditorState.uploading = true;
    els.saveButton.disabled = true;
    els.saveButton.textContent = 'Feltöltés...';
    setAdminImageEditorMessage('info', 'Feltöltés folyamatban — azonnali jóváhagyással.');

    try {
        const blob = await getAdminCroppedImageBlob();
        const formData = new FormData();
        formData.append('image', blob, 'admin-profile-image.png');
        formData.append('reason', 'admin_profile_image_replace');

        const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/profile-image`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: adminAuthHeaders(),
            body: formData
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.success) {
            throw new Error(result?.message || 'A képfeltöltés nem sikerült.');
        }

        applyAdminUserPartialUpdate(userId, {
            profileImage: result?.data?.profileImage || `/profile_pictures/?t=${Date.now()}`,
            profileImageStatus: result?.data?.profileImageStatus || 'approved'
        });

        setAdminUserDetailImageMessage('success', result?.message || 'Profilkép feltöltve és jóváhagyva.');
        showToast('Profilkép feltöltve (jóváhagyott).', 'success', 'bi-check2-circle');

        const modal = bootstrap.Modal.getOrCreateInstance(els.modal);
        modal.hide();
    } catch (error) {
        setAdminImageEditorMessage('danger', error?.message || 'Hiba történt a képfeltöltés közben.');
    } finally {
        adminImageEditorState.uploading = false;
        if (els.saveButton) {
            els.saveButton.disabled = !adminImageEditorState.image;
            els.saveButton.textContent = 'Mentés és jóváhagyás';
        }
    }
}

function bindAdminImageEditorEvents() {
    if (adminImageEditorState.bound) return;
    const els = getAdminImageEditorElements();
    if (!els.modal || !els.canvas) return;
    adminImageEditorState.bound = true;

    if (els.zoomInput) {
        els.zoomInput.addEventListener('input', () => {
            adminImageEditorState.scale = Number(els.zoomInput.value) || 1;
            renderAdminImageEditor();
        });
    }
    if (els.rotateInput) {
        els.rotateInput.addEventListener('input', () => {
            adminImageEditorState.rotationDeg = Number(els.rotateInput.value) || 0;
            renderAdminImageEditor();
        });
    }
    if (els.resetButton) {
        els.resetButton.addEventListener('click', () => {
            resetAdminImageEditorState();
            renderAdminImageEditor();
        });
    }
    if (els.saveButton) {
        els.saveButton.addEventListener('click', () => { submitAdminImageUpload(); });
    }

    const canvas = els.canvas;
    canvas.addEventListener('pointerdown', (event) => {
        if (!adminImageEditorState.image || adminImageEditorState.uploading) return;
        adminImageEditorState.dragging = true;
        adminImageEditorState.lastPointerX = event.clientX;
        adminImageEditorState.lastPointerY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
        if (!adminImageEditorState.dragging || !adminImageEditorState.image) return;
        const dx = event.clientX - adminImageEditorState.lastPointerX;
        const dy = event.clientY - adminImageEditorState.lastPointerY;
        adminImageEditorState.lastPointerX = event.clientX;
        adminImageEditorState.lastPointerY = event.clientY;
        adminImageEditorState.offsetX += dx;
        adminImageEditorState.offsetY += dy;
        renderAdminImageEditor();
    });
    const stopDrag = (event) => {
        if (adminImageEditorState.dragging) {
            adminImageEditorState.dragging = false;
            if (typeof event.pointerId === 'number') {
                try { canvas.releasePointerCapture(event.pointerId); } catch (_) { }
            }
        }
    };
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
    canvas.addEventListener('pointerleave', stopDrag);

    els.modal.addEventListener('shown.bs.modal', () => renderAdminImageEditor());
    els.modal.addEventListener('hidden.bs.modal', () => {
        adminImageEditorState.image = null;
        adminImageEditorState.targetUserId = null;
        revokeAdminImageObjectUrl();
        resetAdminImageEditorState();
        const input = document.getElementById('adminUserDetailImageUpload');
        if (input) input.value = '';
    });

    window.addEventListener('resize', () => {
        if (adminImageEditorState.image) renderAdminImageEditor();
    });
}

async function handleAdminUserDetailImageInputChange(event) {
    const input = event?.target || document.getElementById('adminUserDetailImageUpload');
    try {
        const selectedUser = state.selectedUser;
        if (!selectedUser || !selectedUser.id) throw new Error('Nincs kiválasztott felhasználó.');

        const file = input?.files?.[0] || null;
        const validationError = validateAdminUserDetailImageFile(file);
        if (validationError) throw new Error(validationError);

        bindAdminImageEditorEvents();
        await openAdminImageEditorFromFile(file, selectedUser.id);
        setAdminUserDetailImageMessage('info', 'Kép szerkesztése folyamatban...');
    } catch (err) {
        setAdminUserDetailImageMessage('danger', err?.message || 'A kiválasztott kép nem nyitható meg.');
    } finally {
        if (input) input.value = '';
    }
}

async function handleAdminUserDetailImageRemove() {
    try {
        const selectedUser = state.selectedUser;
        if (!selectedUser || !selectedUser.id) {
            throw new Error('Nincs kiválasztott felhasználó.');
        }

        setAdminUserDetailImageMessage('info', 'Profilkép eltávolítása...');

        let backendSuccess = false;
        try {
            const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/profile-image/remove`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ reason: 'admin_remove_profile_image' })
            });
            const result = await response.json().catch(() => ({}));
            if (response.ok && result?.success) {
                backendSuccess = true;
                applyAdminUserPartialUpdate(selectedUser.id, {
                    profileImage: '/profile_pictures/default.png',
                    profileImageStatus: 'default'
                });
                setAdminUserDetailImageMessage('success', result?.message || 'Profilkép eltávolítva.');
            }
        } catch (_) {
            backendSuccess = false;
        }

        if (!backendSuccess) {
            const previous = String(selectedUser.profileImage || '');
            if (previous.startsWith('blob:')) {
                try { URL.revokeObjectURL(previous); } catch (_) { }
            }
            applyAdminUserPartialUpdate(selectedUser.id, {
                profileImage: '/profile_pictures/default.png',
                profileImageStatus: 'default'
            });
            setAdminUserDetailImageMessage('warning', 'Frontend állapot frissítve. A végleges mentéshez backend endpoint szükséges.');
        }
    } catch (err) {
        setAdminUserDetailImageMessage('danger', err?.message || 'A profilkép eltávolítása sikertelen.');
    }
}

/* ---------- Admin User View Modal (két-tabos audit log) ---------- */

function openAdminUserView(userId) {
    let opened = false;
    try {
        const user = findAdminUserById(userId);
        const modalEl = document.getElementById('adminUserViewModal');
        if (!user) {
            showToast('A felhasználó nem található.', 'warning', 'bi-exclamation-triangle');
        } else if (!modalEl || !window.bootstrap?.Modal) {
            showToast('A megtekintés modal nem elérhető.', 'danger', 'bi-x-circle');
        } else {
            stopAdminUserViewRefresh();
            state.userView.userId = user.id;
            state.userView.activeTab = 'target';
            state.userView.target = { items: [], loading: false, error: null, loadedAt: null };
            state.userView.actor = { items: [], loading: false, error: null, loadedAt: null };
            state.userView.security = { items: [], loading: false, error: null, loadedAt: null, filter: 'all' };
            state.userView.presence = { online: false, tabs: [], loadedAt: null, refreshTimerId: null };
            renderAdminUserViewModal(user);
            updateAdminUserViewTabsHint('target');
            const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
            loadAdminUserAuditTab('target');
            loadAdminUserPresence();
            startAdminUserViewRefresh();
            modalEl.addEventListener('hidden.bs.modal', stopAdminUserViewRefresh, { once: true });
            opened = true;
        }
    } catch (err) {
        console.error('openAdminUserView hiba:', err);
        showToast('Hiba a megtekintés megnyitásakor.', 'danger', 'bi-x-circle');
    }
    return opened;
}

function renderAdminUserViewModal(user) {
    try {
        if (user) {
            const avatarEl = document.getElementById('adminUserViewAvatar');
            if (avatarEl && window.MattMesterProfileImage) {
                window.MattMesterProfileImage.applyProfileImagePresentation(avatarEl, {
                    source: { username: user.username, profile_image: user.profileImage },
                    size: 96
                });
            }
            setText('adminUserViewName', user.username || '—');
            setText('adminUserViewEmail', user.email || '—');
            setText('adminUserViewEloClassic', String(Number(user.elo || 0)));
            setText('adminUserViewEloMM', String(Number(user.eloMM || 0)));
            setText('adminUserViewEloBullet', String(Number(user.eloBullet || 0)));
            setText('adminUserViewWins', String(Number(user.wins || 0)));
            setText('adminUserViewLosses', String(Number(user.losses || 0)));
            setText('adminUserViewDraws', String(Number(user.draws || 0)));
            setText('adminUserViewWinRate', `${Number(user.winRate || 0).toFixed(1)}%`);
            setText('adminUserViewLastActive', user.lastActive ? formatRelative(user.lastActive) : '—');
            setText('adminUserViewJoined', formatDateOnly(user.createdAt));
            setText('adminUserViewLastIp', user.lastIp || '—');
            setText('adminUserViewId', `#${user.id}`);

            const roleBadge = document.getElementById('adminUserViewRole');
            if (roleBadge) roleBadge.outerHTML = `<span id="adminUserViewRole">${rolePill(user.role === 'admin' ? 'admin' : 'player')}</span>`;
            const statusBadge = document.getElementById('adminUserViewStatus');
            if (statusBadge) statusBadge.outerHTML = `<span id="adminUserViewStatus">${user.isBanned ? statusPill('banned') : renderPresenceStatusBadgeInline(user)}</span>`;

            const emailVerifiedEl = document.getElementById('adminUserViewEmailVerified');
            if (emailVerifiedEl) emailVerifiedEl.outerHTML = renderEmailVerifiedBadge(user);
            const imageStatusEl = document.getElementById('adminUserViewImageStatus');
            if (imageStatusEl) imageStatusEl.outerHTML = renderProfileImageStatusBadge(user);

            // Tab gombok edit/ban onclick — modal-ba menjen
            const editBtn = document.getElementById('adminUserViewEditBtn');
            if (editBtn) editBtn.onclick = () => { closeAdminUserViewModal(); editAdminUser(user.id); };
            const banBtn = document.getElementById('adminUserViewBanBtn');
            if (banBtn) banBtn.onclick = () => { closeAdminUserViewModal(); banAdminUser(user.id); };
        }
    } catch (err) {
        console.error('renderAdminUserViewModal hiba:', err);
    }
}

function closeAdminUserViewModal() {
    try {
        const modalEl = document.getElementById('adminUserViewModal');
        if (modalEl && window.bootstrap?.Modal) {
            window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
        }
    } catch (err) {
        console.warn('closeAdminUserViewModal hiba:', err);
    }
}

// Tab váltás
function switchAdminUserViewTab(tabKey) {
    try {
        if (tabKey === 'target' || tabKey === 'actor' || tabKey === 'security') {
            state.userView.activeTab = tabKey;
            document.querySelectorAll('.admin-user-view-tab').forEach((btn) => {
                const isActive = btn.dataset.tab === tabKey;
                btn.classList.toggle('is-active', isActive);
            });
            document.querySelectorAll('.admin-user-view-tab-pane').forEach((pane) => {
                const isActive = pane.dataset.tab === tabKey;
                pane.classList.toggle('d-none', !isActive);
            });
            updateAdminUserViewTabsHint(tabKey);
            // Lazy load: ha még nincs adat ezen a tabon, betöltjük.
            const slot = state.userView[tabKey];
            if (slot && !slot.loadedAt && !slot.loading) {
                if (tabKey === 'security') {
                    loadAdminUserSecurityActivity();
                } else {
                    loadAdminUserAuditTab(tabKey);
                }
            } else if (tabKey === 'security') {
                // Már be volt töltve — de a filter alapján újrarenderelünk a legutóbbi fülre váltáskor.
                renderAdminUserViewSecurityList();
            }
        }
    } catch (err) {
        console.warn('switchAdminUserViewTab hiba:', err);
    }
}

// /api/admin/audit/search lekérés a megfelelő szűréssel
async function loadAdminUserAuditTab(tabKey) {
    let success = false;
    try {
        const userId = state.userView.userId;
        const slot = state.userView[tabKey];
        if (!userId || !slot) {
            // nincs mit
        } else if (!state.adminToken) {
            slot.error = 'Nincs admin token.';
            renderAdminUserViewAuditList(tabKey);
        } else {
            slot.loading = true;
            slot.error = null;
            renderAdminUserViewAuditList(tabKey);

            const params = new URLSearchParams();
            params.set('limit', '100');
            if (tabKey === 'target') {
                params.set('targetType', 'user');
                params.set('targetId', String(userId));
            } else {
                params.set('actorUserId', String(userId));
            }
            const headers = adminAuthHeaders({ Accept: 'application/json' });
            const response = await fetch(`/api/admin/audit/search?${params.toString()}`, {
                method: 'GET',
                credentials: 'same-origin',
                headers
            });
            if (!response.ok) {
                let bodyMessage = `HTTP ${response.status}`;
                try {
                    const body = await response.json();
                    if (body?.message) bodyMessage = body.message;
                } catch (_) { }
                if (response.status === 401 || response.status === 403) {
                    handleAdminAuthError('admin_token_required');
                }
                slot.error = bodyMessage;
                slot.loading = false;
                renderAdminUserViewAuditList(tabKey);
            } else {
                const json = await response.json();
                const items = Array.isArray(json?.data) ? json.data : (Array.isArray(json?.data?.items) ? json.data.items : []);
                slot.items = items;
                slot.loadedAt = new Date();
                slot.loading = false;
                renderAdminUserViewAuditList(tabKey);
                success = true;
            }
        }
    } catch (err) {
        console.error('loadAdminUserAuditTab hiba:', err);
        const slot = state.userView[tabKey];
        if (slot) {
            slot.error = err?.message || 'Hálózati hiba.';
            slot.loading = false;
            renderAdminUserViewAuditList(tabKey);
        }
    }
    return success;
}

function renderAdminUserViewAuditList(tabKey) {
    try {
        const container = document.querySelector(`.admin-user-view-tab-pane[data-tab="${tabKey}"] .admin-user-view-audit-list`);
        if (container) {
            const slot = state.userView[tabKey];
            if (slot.loading) {
                container.innerHTML = `<li class="admin-user-view-empty"><i class="bi bi-arrow-repeat spin"></i><div>Naplóbejegyzések betöltése…</div></li>`;
            } else if (slot.error) {
                container.innerHTML = `<li class="admin-user-view-empty admin-user-view-empty-error"><i class="bi bi-exclamation-triangle"></i><div>${escapeHtml(slot.error)}</div></li>`;
            } else if (!slot.items.length) {
                const emptyMsg = tabKey === 'target'
                    ? 'Még nincs naplóbejegyzés erről a felhasználóról.'
                    : 'Ez a felhasználó még nem hajtott végre admin műveletet.';
                container.innerHTML = `<li class="admin-user-view-empty"><i class="bi bi-inbox"></i><div>${emptyMsg}</div></li>`;
            } else {
                container.innerHTML = slot.items.map(renderAdminUserAuditEntry).join('');
            }
        }
    } catch (err) {
        console.warn('renderAdminUserViewAuditList hiba:', err);
    }
}

function renderAdminUserAuditEntry(entry) {
    let html = '';
    try {
        if (entry) {
            const sev = entry.severity || 'info';
            const time = formatAuditTime(entry.occurredAt);
            const action = entry.action || '—';
            const actor = entry.actor?.username || entry.actor?.id || '—';
            const target = entry.target?.label || entry.target?.id || '—';
            const reason = entry.reason ? escapeHtml(entry.reason) : '';
            html = `
                <li class="admin-user-view-audit-row sev-${sev}">
                    <div class="admin-user-view-audit-meta">
                        <span class="admin-user-view-audit-time">${escapeHtml(time)}</span>
                        ${severityPill(sev)}
                    </div>
                    <div class="admin-user-view-audit-body">
                        <div class="admin-user-view-audit-action">${escapeHtml(action)}</div>
                        <div class="admin-user-view-audit-targets">
                            <span class="text-muted">actor:</span> <span class="text-white">${escapeHtml(actor)}</span>
                            <span class="text-muted ms-2">target:</span> <span class="text-white">${escapeHtml(target)}</span>
                        </div>
                        ${reason ? `<div class="admin-user-view-audit-reason"><i class="bi bi-chat-left-quote"></i>${reason}</div>` : ''}
                    </div>
                </li>
            `;
        }
    } catch (err) {
        console.warn('renderAdminUserAuditEntry hiba:', err);
        html = '';
    }
    return html;
}

// Tab fejléc hint szövegének frissítése (jobb felső kis info)
function updateAdminUserViewTabsHint(tabKey) {
    let updated = false;
    try {
        const hintEl = document.getElementById('adminUserViewTabsHint');
        if (hintEl) {
            const messages = {
                target: '<i class="bi bi-info-circle me-1"></i>Audit napló — utolsó 100',
                actor: '<i class="bi bi-info-circle me-1"></i>Admin műveletek — utolsó 100',
                security: '<i class="bi bi-shield-lock me-1"></i>A felhasználó saját biztonsági naplója (max 150)'
            };
            hintEl.innerHTML = messages[tabKey] || messages.target;
            updated = true;
        }
    } catch (err) {
        console.warn('updateAdminUserViewTabsHint hiba:', err);
    }
    return updated;
}

/* ---------- Security activity (a user által saját profilján is látható log) ---------- */

const ADMIN_USER_VIEW_SECURITY_FILTERS = new Set(['all', 'auth', 'security', 'profile', 'social']);

async function loadAdminUserSecurityActivity() {
    let success = false;
    try {
        const userId = state.userView.userId;
        const slot = state.userView.security;
        if (!userId || !slot) {
            // nincs mit
        } else if (!state.adminToken) {
            slot.error = 'Nincs admin token.';
            renderAdminUserViewSecurityList();
        } else {
            slot.loading = true;
            slot.error = null;
            renderAdminUserViewSecurityList();
            const headers = adminAuthHeaders({ Accept: 'application/json' });
            const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/security-activity?limit=150`, {
                method: 'GET',
                credentials: 'same-origin',
                headers
            });
            if (!response.ok) {
                let bodyMessage = `HTTP ${response.status}`;
                try {
                    const body = await response.json();
                    if (body?.message) bodyMessage = body.message;
                } catch (_) { }
                if (response.status === 401 || response.status === 403) {
                    handleAdminAuthError('admin_token_required');
                }
                slot.error = bodyMessage;
                slot.loading = false;
                renderAdminUserViewSecurityList();
            } else {
                const json = await response.json();
                slot.items = Array.isArray(json?.data) ? json.data : [];
                slot.loadedAt = new Date();
                slot.loading = false;
                renderAdminUserViewSecurityList();
                success = true;
            }
        }
    } catch (err) {
        console.error('loadAdminUserSecurityActivity hiba:', err);
        const slot = state.userView.security;
        if (slot) {
            slot.error = err?.message || 'Hálózati hiba.';
            slot.loading = false;
            renderAdminUserViewSecurityList();
        }
    }
    return success;
}

function setAdminUserViewSecurityFilter(filter) {
    let applied = false;
    try {
        if (ADMIN_USER_VIEW_SECURITY_FILTERS.has(filter)) {
            state.userView.security.filter = filter;
            document.querySelectorAll('.admin-user-view-sec-filter').forEach((btn) => {
                btn.classList.toggle('is-active', btn.dataset.secFilter === filter);
            });
            renderAdminUserViewSecurityList();
            applied = true;
        }
    } catch (err) {
        console.warn('setAdminUserViewSecurityFilter hiba:', err);
    }
    return applied;
}

function renderAdminUserViewSecurityList() {
    let rendered = false;
    try {
        const container = document.querySelector('.admin-user-view-tab-pane[data-tab="security"] .admin-user-view-security-list');
        if (container) {
            const slot = state.userView.security;
            if (slot.loading) {
                container.innerHTML = `<li class="admin-user-view-empty"><i class="bi bi-arrow-repeat spin"></i><div>Biztonsági napló betöltése…</div></li>`;
            } else if (slot.error) {
                container.innerHTML = `<li class="admin-user-view-empty admin-user-view-empty-error"><i class="bi bi-exclamation-triangle"></i><div>${escapeHtml(slot.error)}</div></li>`;
            } else {
                const filter = slot.filter || 'all';
                const items = filter === 'all'
                    ? slot.items
                    : slot.items.filter((item) => String(item?.eventCategory || '').toLowerCase() === filter);
                if (!items.length) {
                    container.innerHTML = `<li class="admin-user-view-empty"><i class="bi bi-inbox"></i><div>Nincs találat ehhez a szűrőhöz.</div></li>`;
                } else {
                    container.innerHTML = items.map(renderAdminUserSecurityEntry).join('');
                }
            }
            rendered = true;
        }
    } catch (err) {
        console.warn('renderAdminUserViewSecurityList hiba:', err);
    }
    return rendered;
}

function renderAdminUserSecurityEntry(entry) {
    let html = '';
    try {
        if (entry) {
            const sev = entry.severity || 'info';
            const time = entry.occurredAt
                ? `${formatDateOnly(entry.occurredAt)} ${formatAuditTime(entry.occurredAt)}`
                : '—';
            const ok = entry.success === false ? 'fail' : (entry.success === true ? 'ok' : 'na');
            const okIcon = ok === 'ok' ? 'bi-check-circle-fill text-success'
                : ok === 'fail' ? 'bi-x-circle-fill text-danger'
                    : 'bi-dash-circle text-muted';
            const eventLabel = entry.eventType || entry.message || '—';
            const category = entry.eventCategory || 'all';
            const ip = entry.ipAddress || '—';
            const ua = entry.userAgent ? entry.userAgent.split(')')[0].split('(').pop() : '';
            html = `
                <li class="admin-user-view-security-row sev-${sev}">
                    <div class="admin-user-view-security-meta">
                        <span class="admin-user-view-security-time">${escapeHtml(time)}</span>
                        <span class="admin-user-view-security-cat" data-cat="${escapeHtml(category)}">${escapeHtml(category)}</span>
                    </div>
                    <div class="admin-user-view-security-body">
                        <div class="admin-user-view-security-event">
                            <i class="bi ${okIcon} me-1"></i>${escapeHtml(eventLabel)}
                        </div>
                        ${entry.message && entry.message !== eventLabel ? `<div class="admin-user-view-security-msg text-secondary small">${escapeHtml(entry.message)}</div>` : ''}
                        <div class="admin-user-view-security-tech text-secondary small">
                            <span><i class="bi bi-globe me-1"></i><span class="font-monospace">${escapeHtml(ip)}</span></span>
                            ${ua ? `<span class="ms-2"><i class="bi bi-browser-chrome me-1"></i>${escapeHtml(ua)}</span>` : ''}
                        </div>
                    </div>
                </li>
            `;
        }
    } catch (err) {
        console.warn('renderAdminUserSecurityEntry hiba:', err);
        html = '';
    }
    return html;
}

/* ---------- Presence panel ---------- */

async function loadAdminUserPresence() {
    let success = false;
    try {
        const userId = state.userView.userId;
        if (!userId) {
            // nincs mit
        } else if (!state.adminToken) {
            renderAdminUserViewPresence({ online: false, tabs: [] });
        } else {
            const headers = adminAuthHeaders({ Accept: 'application/json' });
            const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/presence`, {
                method: 'GET',
                credentials: 'same-origin',
                headers
            });
            if (response.ok) {
                const json = await response.json();
                const data = json?.data || { online: false };
                state.userView.presence.online = Boolean(data.online);
                state.userView.presence.tabs = Array.isArray(data.tabs) ? data.tabs : [];
                state.userView.presence.loadedAt = new Date();
                renderAdminUserViewPresence(data);
                success = true;
            } else {
                renderAdminUserViewPresence({ online: false, tabs: [] });
            }
        }
    } catch (err) {
        console.warn('loadAdminUserPresence hiba:', err);
        renderAdminUserViewPresence({ online: false, tabs: [] });
    }
    return success;
}

function renderAdminUserViewPresence(data) {
    let rendered = false;
    try {
        const panel = document.getElementById('adminUserViewPresence');
        const badge = document.getElementById('adminUserViewPresenceBadge');
        const label = document.getElementById('adminUserViewPresenceLabel');
        const meta = document.getElementById('adminUserViewPresenceMeta');
        const tabsList = document.getElementById('adminUserViewPresenceTabs');
        if (panel && badge && label && meta && tabsList) {
            const online = Boolean(data?.online);
            panel.dataset.state = online ? 'online' : 'offline';
            badge.classList.toggle('user-presence-online', online);
            badge.classList.toggle('user-presence-offline', !online);
            if (online) {
                label.textContent = 'Online';
                const tabCount = Number(data.tabCount || data.tabs?.length || 0);
                const sockets = Number(data.socketCount || 0);
                meta.textContent = `${tabCount} tab · ${sockets} socket${data.lastSeenAt ? ` · utolsó: ${formatRelative(data.lastSeenAt)}` : ''}`;
                const tabs = Array.isArray(data.tabs) ? data.tabs : [];
                tabsList.innerHTML = tabs.length === 0
                    ? `<li class="admin-user-view-presence-empty">Nincs aktív tab.</li>`
                    : tabs.map((tab) => `
                        <li class="admin-user-view-presence-tab">
                            <i class="bi bi-window"></i>
                            <span class="admin-user-view-presence-page">${escapeHtml(tab.page || '/')}</span>
                            <span class="admin-user-view-presence-time text-secondary">${escapeHtml(tab.lastSeenAt ? formatRelative(tab.lastSeenAt) : '—')}</span>
                        </li>
                    `).join('');
            } else {
                label.textContent = 'Offline';
                meta.textContent = '—';
                tabsList.innerHTML = '';
            }
            rendered = true;
        }
    } catch (err) {
        console.warn('renderAdminUserViewPresence hiba:', err);
    }
    return rendered;
}

// Egysegesitett 5 mp-es modal-frissito: presence + felhasznaloi alapadatok
// (REST users/list silent refresh + re-render) + az aktiv audit/security tab.
// Egy timer az egesz modalra; modal bezarasakor leall.
const ADMIN_USER_VIEW_REFRESH_MS = 5000;

async function refreshAdminUserViewModal() {
    let refreshed = false;
    try {
        const userId = state.userView.userId;
        const modalEl = document.getElementById('adminUserViewModal');
        const modalOpen = Boolean(modalEl?.classList.contains('show'));
        if (userId && modalOpen) {
            // 1) presence
            loadAdminUserPresence();
            // 2) Az aktiv tab adatai (csendben, hogy ne villantsa a "loading"-ot)
            const tab = state.userView.activeTab;
            if (tab === 'security') {
                refreshAdminUserSecurityActivitySilent();
            } else if (tab === 'target' || tab === 'actor') {
                refreshAdminUserAuditTabSilent(tab);
            }
            // 3) User alapadatok — REST users/list silent refresh, majd re-render
            await loadAdminUsersList({ silent: true });
            const updated = findAdminUserById(userId);
            if (updated) {
                renderAdminUserViewModal(updated);
            }
            refreshed = true;
        }
    } catch (err) {
        console.warn('refreshAdminUserViewModal hiba:', err);
    }
    return refreshed;
}

// Csendes audit refresh — nem mutat "betoltodes" allapotot, csak frissiti az
// items-et es egyetlen alkalommal renderelni, ha a felhasznalo meg ezt a tabot nezi.
async function refreshAdminUserAuditTabSilent(tabKey) {
    let success = false;
    try {
        const userId = state.userView.userId;
        const slot = state.userView[tabKey];
        if (!userId || !slot || !state.adminToken) {
            // semmi
        } else {
            const params = new URLSearchParams();
            params.set('limit', '100');
            if (tabKey === 'target') {
                params.set('targetType', 'user');
                params.set('targetId', String(userId));
            } else {
                params.set('actorUserId', String(userId));
            }
            const headers = adminAuthHeaders({ Accept: 'application/json' });
            const response = await fetch(`/api/admin/audit/search?${params.toString()}`, {
                method: 'GET', credentials: 'same-origin', headers
            });
            if (response.ok) {
                const json = await response.json();
                const items = Array.isArray(json?.data) ? json.data : (Array.isArray(json?.data?.items) ? json.data.items : []);
                slot.items = items;
                slot.loadedAt = new Date();
                if (state.userView.activeTab === tabKey) {
                    renderAdminUserViewAuditList(tabKey);
                }
                success = true;
            }
        }
    } catch (err) {
        console.warn('refreshAdminUserAuditTabSilent hiba:', err);
    }
    return success;
}

async function refreshAdminUserSecurityActivitySilent() {
    let success = false;
    try {
        const userId = state.userView.userId;
        const slot = state.userView.security;
        if (!userId || !slot || !state.adminToken) {
            // semmi
        } else {
            const headers = adminAuthHeaders({ Accept: 'application/json' });
            const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/security-activity?limit=150`, {
                method: 'GET', credentials: 'same-origin', headers
            });
            if (response.ok) {
                const json = await response.json();
                slot.items = Array.isArray(json?.data) ? json.data : [];
                slot.loadedAt = new Date();
                if (state.userView.activeTab === 'security') {
                    renderAdminUserViewSecurityList();
                }
                success = true;
            }
        }
    } catch (err) {
        console.warn('refreshAdminUserSecurityActivitySilent hiba:', err);
    }
    return success;
}

function startAdminUserViewRefresh() {
    let started = false;
    try {
        stopAdminUserViewRefresh();
        state.userView.refreshTimerId = setInterval(refreshAdminUserViewModal, ADMIN_USER_VIEW_REFRESH_MS);
        started = true;
    } catch (err) {
        console.warn('startAdminUserViewRefresh hiba:', err);
    }
    return started;
}

function stopAdminUserViewRefresh() {
    let stopped = false;
    try {
        if (state.userView.refreshTimerId) {
            clearInterval(state.userView.refreshTimerId);
            state.userView.refreshTimerId = null;
        }
        if (state.userView.presence && state.userView.presence.refreshTimerId) {
            clearInterval(state.userView.presence.refreshTimerId);
            state.userView.presence.refreshTimerId = null;
        }
        stopped = true;
    } catch (err) {
        console.warn('stopAdminUserViewRefresh hiba:', err);
    }
    return stopped;
}

/* =============================================================
   17) Háttér műveletek (logout, modal)
   ============================================================= */

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
// initChart: csak a Chart.js peldanyt epiti fel a meglevo state alapjan
// (loadActivityChart hivja amikor adat jott). Mock data NINCS — ha nincs adat,
// az overlay magyarazza el miert.
function initChart() {
    try {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js nem elerheto.');
        } else {
            const canvas = document.getElementById('activityChart');
            if (canvas) {
                const existing = Chart.getChart(canvas);
                if (existing) existing.destroy();
                state.activityChart.chartInstance = null;

                const labels = Array.isArray(state.activityChart.labels) ? state.activityChart.labels : [];
                const datasetSource = state.activityChart.datasets || {};
                const ctx = canvas.getContext('2d');

                const datasets = ACTIVITY_DATASET_META.map((meta, idx) => {
                    const data = Array.isArray(datasetSource[meta.key]) ? datasetSource[meta.key] : [];
                    const dashed = idx >= 3; // audit es alerts vonal szaggatott (admin esemenyek)
                    return {
                        label: meta.label,
                        data,
                        borderColor: meta.color,
                        backgroundColor: idx === 0 ? buildLineGradient(ctx, meta.color) : 'transparent',
                        borderWidth: idx === 0 ? 2.5 : 2,
                        borderDash: dashed ? [6, 4] : [],
                        fill: idx === 0,
                        tension: 0.35,
                        pointBackgroundColor: meta.color,
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 1,
                        pointRadius: 2.5,
                        pointHoverRadius: 5
                    };
                });

                state.activityChart.chartInstance = new Chart(ctx, {
                    type: 'line',
                    data: { labels, datasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                labels: {
                                    color: '#cbd5e1',
                                    font: { family: 'Inter', size: 11 },
                                    boxWidth: 14,
                                    padding: 12,
                                    usePointStyle: true
                                }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                titleColor: '#d4af37',
                                bodyColor: '#e2e8f0',
                                borderColor: 'rgba(212, 175, 55, 0.35)',
                                borderWidth: 1,
                                padding: 10,
                                mode: 'index',
                                intersect: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(51, 65, 85, 0.5)' },
                                ticks: { color: '#94a3b8', font: { family: 'Inter' }, precision: 0 }
                            },
                            x: {
                                grid: { display: false },
                                ticks: {
                                    color: '#94a3b8',
                                    font: { family: 'Inter' },
                                    maxRotation: 0,
                                    autoSkip: true,
                                    autoSkipPadding: 12
                                }
                            }
                        },
                        interaction: { intersect: false, mode: 'index' }
                    }
                });
            }
        }
    } catch (err) {
        console.error('initChart hiba:', err);
    }
}

function buildLineGradient(ctx, hex) {
    let result = 'transparent';
    try {
        const grad = ctx.createLinearGradient(0, 0, 0, 280);
        grad.addColorStop(0, hex + '55');
        grad.addColorStop(1, hex + '00');
        result = grad;
    } catch (err) {
        console.warn('buildLineGradient hiba:', err);
        result = 'transparent';
    }
    return result;
}

async function loadActivityChart(options = {}) {
    const silent = options.silent === true;
    try {
        if (!state.adminToken) {
            applyActivityChartStatus({ status: 'error', error: 'Nincs admin token — a 24h aktivitás nem tölthető be.' });
        } else {
            if (!silent) applyActivityChartStatus({ status: 'loading' });
            const headers = adminAuthHeaders({ Accept: 'application/json' });
            const response = await fetch('/api/admin/stats/activity', {
                method: 'GET',
                credentials: 'same-origin',
                headers
            });
            if (!response.ok) {
                let bodyMessage = `HTTP ${response.status}`;
                try {
                    const body = await response.json();
                    if (body?.message) bodyMessage = body.message;
                } catch (_) { /* nem JSON */ }
                if (response.status === 401 || response.status === 403) {
                    handleAdminAuthError('admin_token_required');
                }
                applyActivityChartStatus({ status: 'error', error: bodyMessage });
            } else {
                const json = await response.json();
                if (!json?.success || !json?.data) {
                    applyActivityChartStatus({ status: 'error', error: json?.message || 'Ismeretlen válasz.' });
                } else {
                    const totals = json.data.totals || {};
                    const records = Number(totals.records || 0);
                    state.activityChart.labels = json.data.labels || [];
                    state.activityChart.datasets = json.data.datasets || {};
                    state.activityChart.totals = totals;
                    state.activityChart.loadedAt = new Date();
                    state.activityChart.error = null;
                    state.activityChart.status = records > 0 ? 'loaded' : 'empty';
                    applyActivityChartStatus(state.activityChart);
                }
            }
        }
    } catch (err) {
        console.error('loadActivityChart hiba:', err);
        applyActivityChartStatus({ status: 'error', error: err?.message || 'Hálózati hiba.' });
    }
}

function applyActivityChartStatus(next) {
    try {
        if (next && next !== state.activityChart) {
            state.activityChart.status = next.status || state.activityChart.status;
            if (next.error !== undefined) state.activityChart.error = next.error;
            if (next.loadedAt) state.activityChart.loadedAt = next.loadedAt;
        }
        const status = state.activityChart.status;

        const pill = document.getElementById('chartStatusPill');
        const labelEl = document.getElementById('chartStatusLabel');
        const detailEl = document.getElementById('chartStatusDetail');
        const overlay = document.getElementById('activityChartOverlay');
        const totalsEl = document.getElementById('activityChartTotals');

        const meta = ACTIVITY_STATUS[status] || ACTIVITY_STATUS.idle;
        if (pill) {
            ['idle', 'loading', 'loaded', 'empty', 'error'].forEach((s) => pill.classList.remove(`chart-status-${s}`));
            pill.classList.add(`chart-status-${status}`);
            pill.title = meta.label;
            const dot = pill.querySelector('.ws-pill-dot');
            if (dot) {
                ['ws-dot-idle', 'ws-dot-connecting', 'ws-dot-live', 'ws-dot-down'].forEach((c) => dot.classList.remove(c));
                dot.classList.add(meta.dotClass);
                dot.classList.toggle('ws-dot-spin', Boolean(meta.spin));
            }
        }
        if (labelEl) labelEl.textContent = meta.label;
        if (detailEl) {
            const recordCount = state.activityChart.totals?.records ?? 0;
            const time = state.activityChart.loadedAt ? `frissítve: ${formatRelative(state.activityChart.loadedAt)}` : '';
            if (status === 'loaded') {
                detailEl.textContent = `· ${recordCount} rekord${time ? ' · ' + time : ''}`;
            } else if (status === 'error') {
                detailEl.textContent = `· ${state.activityChart.error || ''}`;
            } else if (status === 'empty') {
                detailEl.textContent = time ? `· ${time}` : '';
            } else {
                detailEl.textContent = '';
            }
        }

        if (overlay) {
            if (status === 'loaded') {
                overlay.classList.add('d-none');
                overlay.innerHTML = '';
            } else {
                overlay.classList.remove('d-none');
                overlay.innerHTML = activityChartOverlay(state.activityChart);
            }
        }

        if (totalsEl) {
            if (state.activityChart.totals && status !== 'idle' && status !== 'loading') {
                totalsEl.innerHTML = renderChartTotals(state.activityChart.totals);
            } else if (status === 'idle' || status === 'loading') {
                totalsEl.innerHTML = '<span class="text-secondary small">A 24h összegzések a chart betöltése után jelennek meg.</span>';
            } else if (status === 'error') {
                totalsEl.innerHTML = `<span class="text-danger small"><i class="bi bi-exclamation-triangle me-1"></i>${escapeHtml(state.activityChart.error || 'Hiba a betöltésnél.')}</span>`;
            }
        }

        if (status === 'loaded' || status === 'empty') {
            initChart();
        }
    } catch (err) {
        console.error('applyActivityChartStatus hiba:', err);
    }
}

function startActivityRefreshTimer() {
    try {
        if (state.activityRefreshIntervalId) {
            clearInterval(state.activityRefreshIntervalId);
            state.activityRefreshIntervalId = null;
        }
        // 60 mp-enkent ujratoltjuk amig a dashboard nyitva van
        state.activityRefreshIntervalId = setInterval(() => {
            if (state.currentSectionId === 'dashboard' && state.adminToken) {
                loadActivityChart({ silent: true });
            }
        }, 60000);
    } catch (err) {
        console.warn('startActivityRefreshTimer hiba:', err);
    }
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
