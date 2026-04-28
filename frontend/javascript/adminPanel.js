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
        return `
            <div class="row g-3 mb-4">
                ${items.map(it => `
                    <div class="col-md-${mdCol} col-xl-${xlCol}">
                        <div class="stat-card">
                            <div class="stat-icon bg-${it.color || 'primary'}-soft"><i class="bi ${it.icon}"></i></div>
                            <div class="stat-value">${it.value}</div>
                            <div class="stat-label">${it.label}</div>
                            ${it.hint ? `<small class="stat-hint ${it.hintClass || 'text-muted'}">${it.hint}</small>` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
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

    avatar: (name, size = 32) => `
        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random"
            class="rounded-circle" width="${size}" height="${size}" alt="">
    `,

    user: ({ name, email, struck = false }) => `
        <div class="d-flex align-items-center gap-2">
            ${h.avatar(name)}
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

    // Tick chip — egyetlen mini stat horizontális csíkba (admin:stats:tick adatokhoz)
    tickChip: ({ icon, label, value, color = 'gold' }) => `
        <div class="tick-chip">
            <i class="bi ${icon} text-${color}"></i>
            <span class="tick-chip-label">${label}</span>
            <strong class="tick-chip-value">${value}</strong>
        </div>
    `
};

/* =============================================================
   3) Severity / alert helperek (ADMIN_PANEL.md §5.1, §5.2)
   ============================================================= */
const SEVERITY = {
    info:     { label: 'Info',     icon: 'bi-info-circle-fill',          cls: 'sev-info' },
    warning:  { label: 'Warning',  icon: 'bi-exclamation-triangle-fill', cls: 'sev-warning' },
    critical: { label: 'Critical', icon: 'bi-exclamation-octagon-fill',  cls: 'sev-critical' }
};
const ALERT_KIND = {
    unauthorized:       { label: 'Jogosulatlan próba',  icon: 'bi-shield-fill-x' },
    rate_escalated:     { label: 'Rate limit szigorítás', icon: 'bi-speedometer2' },
    token_invalid:      { label: 'Token hiba',          icon: 'bi-key-fill' },
    suspicious_pattern: { label: 'Gyanús minta',        icon: 'bi-bug-fill' }
};

const severityPill = (key) => {
    const s = SEVERITY[key] || SEVERITY.info;
    return `<span class="severity-pill ${s.cls}"><i class="bi ${s.icon}"></i>${s.label}</span>`;
};
const alertKindLabel = (key) => {
    const k = ALERT_KIND[key] || { label: key, icon: 'bi-question-circle' };
    return `<span class="alert-kind"><i class="bi ${k.icon}"></i>${k.label}</span>`;
};

/* =============================================================
   4) Demo adatok és pill helperek
   ============================================================= */
const SAMPLE = {
    users: [
        { name: 'Magnus Carlsen',  email: 'magnus@chess.hu', elo: 2847, role: 'admin',  status: 'active', last: '2 perce',  joined: '2024-01-15' },
        { name: 'Hikaru Nakamura', email: 'hikaru@chess.hu', elo: 2768, role: 'player', status: 'active', last: '5 órája',  joined: '2024-02-20' },
        { name: 'Anish Giri',      email: 'anish@chess.hu',  elo: 0,    role: 'player', status: 'banned', last: '—',         joined: '2024-03-10', struck: true }
    ],
    games: [
        { id: '#4932', white: 'Carlsen (2847)',  black: 'Nakamura (2768)', status: 'live',     winner: '—',          moves: 24, time: '10+0' },
        { id: '#4931', white: 'Firouzja (2785)', black: 'Ding (2812)',     status: 'finished', winner: 'Ding Liren', moves: 67, time: '3+2' },
        { id: '#4930', white: 'SakkMester99',    black: 'RookRider',       status: 'live',     winner: '—',          moves: 8,  time: '5+0' },
        { id: '#4929', white: 'Carlsen (2847)',  black: 'KirályKezelő',    status: 'finished', winner: 'Carlsen',    moves: 41, time: '10+0' }
    ],
    logins: [
        { user: 'Magnus Carlsen',  ip: '192.168.1.10',   location: 'Budapest, HU',  device: 'Chrome / Windows', deviceIcon: 'bi-browser-chrome', time: 'Most',     risk: 'low' },
        { user: 'Hikaru Nakamura', ip: '127.0.0.1',      location: 'localhost',     device: 'Firefox / Linux',  deviceIcon: 'bi-browser-firefox',time: '5 perce',  risk: 'low' },
        { user: 'SakkMester99',    ip: '192.168.1.42',   location: 'Budapest, HU',  device: 'Safari / macOS',   deviceIcon: 'bi-browser-safari', time: '12 perce', risk: 'medium' }
    ]
};

const SAMPLE_AUDIT = [
    { id: 12345, time: '14:32:01', actor: 'admin',     action: 'users.ban',              severity: 'critical',
      target: { type: 'user', id: 47, label: 'spammer42' },
      reason: 'Reklámspam a játék-chat csatornán; harmadik figyelmeztetés.',
      diff: { before: { is_banned: false, ban_reason: null }, after: { is_banned: true, ban_reason: 'spam' } } },
    { id: 12344, time: '14:30:45', actor: 'admin',     action: 'users.edit_profile',     severity: 'info',
      target: { type: 'user', id: 12, label: 'SakkMester99' },
      reason: 'ELO korrekció helytelen pontozás miatt.',
      diff: { before: { elo: 1500 }, after: { elo: 1450 } } },
    { id: 12343, time: '14:28:12', actor: 'modBéla',   action: 'profile_image.review',   severity: 'info',
      target: { type: 'profile_image', id: 88, label: 'RookRider' },
      reason: 'Megfelelő profilkép, jóváhagyva.',
      diff: { before: { status: 'pending' }, after: { status: 'approved' } } },
    { id: 12342, time: '14:25:00', actor: 'admin',     action: 'notifications.broadcast', severity: 'critical',
      target: null,
      reason: 'Új szezon indul 2026-05-01-én — minden online felhasználó értesítése.',
      diff: null },
    { id: 12341, time: '13:48:33', actor: 'admin',     action: 'users.unban',            severity: 'warning',
      target: { type: 'user', id: 33, label: 'PiacGyilkos' },
      reason: 'Fellebbezés elfogadva — első esetben jogos panasz.',
      diff: { before: { is_banned: true }, after: { is_banned: false } } }
];

const SAMPLE_ALERTS = [
    { id: 882, time: '14:18:11', kind: 'unauthorized',       severity: 'warning',
      ip: '203.0.113.55',  user: '—',         endpoint: 'GET /api/admin/users',
      detail: { reason: 'no_session', rateLimitState: { escalated: true, multiplier: 5, ttlSec: 900 } } },
    { id: 881, time: '14:16:40', kind: 'token_invalid',      severity: 'warning',
      ip: '127.0.0.1',     user: 'SakkMester99', endpoint: 'POST /api/admin/users/ban',
      detail: { reason: 'token_expired' } },
    { id: 880, time: '13:55:02', kind: 'rate_escalated',     severity: 'warning',
      ip: '203.0.113.55',  user: '—',         endpoint: '*',
      detail: { multiplier: 5, ttlSec: 900, trigger: '5 unauthorized in 10min' } },
    { id: 879, time: '12:30:15', kind: 'suspicious_pattern', severity: 'critical',
      ip: '185.220.101.42', user: '—',        endpoint: 'POST /api/admin/auth/elevate',
      detail: { pattern: 'tor_exit_node + 10x failed elevate' } }
];

const SAMPLE_ADMINS = [
    { id: 1, name: 'Nagymester Admin', email: 'admin@mattmester.hu', isSuper: true,  joined: '2024-01-01', lastSeen: 'Most' },
    { id: 8, name: 'ModeratorBéla',    email: 'bela@mattmester.hu',  isSuper: false, joined: '2024-08-12', lastSeen: '15 perce' }
];

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
   5) Navigációs fa - ADMIN_PANEL.md alapján bővítve
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
        badge: { text: '12', variant: 'danger' },
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
            { id: 'security', label: 'Bejelentkezések',  icon: 'bi-shield-check' },
            { id: 'auditLog', label: 'Audit napló',      icon: 'bi-journal-check' },
            { id: 'alerts',   label: 'Riasztások',       icon: 'bi-exclamation-octagon-fill', badge: { text: '4', variant: 'warning' } }
        ]
    },

    { id: 'superAdmin', label: 'Super admin',            icon: 'bi-stars',     leaf: true },
    { id: 'friends',    label: 'Közösségi kapcsolatok', icon: 'bi-people',    leaf: true },
    { id: 'settings',   label: 'Beállítások',           icon: 'bi-gear-fill', leaf: true }
];

const DEFAULT_SECTION = 'dashboard';

/* =============================================================
   6) Sidebar render
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
   7) Szekció renderek
   ============================================================= */
const SECTIONS = {

    /* ---------- Vezérlőpult — admin:stats:tick mintára gazdag dashboard ---------- */
    dashboard: () => `
        ${h.header({
            icon: 'bi-grid-1x2-fill', title: 'Vezérlőpult',
            subtitle: 'A projekt fő mutatói egy pillantásra',
            actions: [
                { label: 'Auto-frissítés 5mp', variant: 'outline-success', size: 'sm',
                  attrs: 'disabled', icon: 'bi-broadcast' },
                { label: 'Frissítés', icon: 'bi-arrow-clockwise', size: 'sm' }
            ]
        })}

        ${h.stats([
            { icon: 'bi-people-fill',  value: '24',     label: 'Regisztrált játékos', color: 'primary',
              hint: '+3 ezen a héten', hintClass: 'text-success' },
            { icon: 'bi-king',         value: '4',      label: 'Aktív játszma',       color: 'success',
              hint: '<span class="live-indicator"><span class="live-dot"></span>Élőben most</span>', hintClass: 'text-success' },
            { icon: 'bi-journal-check',value: '24',     label: '24h audit bejegyzés', color: 'warning',
              hint: '2 kritikus művelet', hintClass: 'text-warning' },
            { icon: 'bi-exclamation-octagon-fill', value: '4', label: 'Nyitott riasztás', color: 'danger',
              hint: '1 kritikus', hintClass: 'text-danger' }
        ])}

        <!-- admin:stats:tick band — kompakt élő mutatók -->
        <div class="tick-band mb-4">
            <div class="tick-band-header">
                <span class="live-indicator text-success"><span class="live-dot"></span>Élő tick</span>
                <span class="tick-band-time">Frissítve: <span id="tickBandTime">most</span></span>
            </div>
            <div class="tick-band-body">
                ${h.tickChip({ icon: 'bi-wifi',          label: 'Online',         value: '12', color: 'success' })}
                ${h.tickChip({ icon: 'bi-shield-fill',   label: 'Adminok',        value: '1',  color: 'gold' })}
                ${h.tickChip({ icon: 'bi-controller',    label: 'Játékban',       value: '4',  color: 'primary' })}
                ${h.tickChip({ icon: 'bi-search',        label: 'Matchmakingben', value: '2',  color: 'primary' })}
                ${h.tickChip({ icon: 'bi-image',         label: 'Pending kép',    value: '3',  color: 'warning' })}
                ${h.tickChip({ icon: 'bi-person-plus',   label: 'Pending barát',  value: '17', color: 'primary' })}
                ${h.tickChip({ icon: 'bi-speedometer2',  label: 'Aktív rate esc.',value: '0',  color: 'secondary' })}
            </div>
        </div>

        <div class="row g-4">
            <div class="col-xl-7">
                ${h.card({
                    title: 'Aktivitás (utolsó 24 óra)', icon: 'bi-activity',
                    headerExtra: h.btn({ label: 'Riport', size: 'sm' }),
                    body: '<div style="position:relative;height:300px;"><canvas id="activityChart"></canvas></div>',
                    classes: 'h-100'
                })}
            </div>
            <div class="col-xl-5">
                <div class="content-card h-100 live-feed-card">
                    <div class="card-header">
                        <h5 class="card-title"><i class="bi bi-broadcast me-2 text-gold"></i>Élő admin tevékenység</h5>
                        <span class="live-indicator text-success small"><span class="live-dot"></span>WS /admin</span>
                    </div>
                    <div class="card-body p-0">
                        <ul class="live-feed-list" id="dashboardLiveFeed">
                            ${SAMPLE_AUDIT.slice(0, 4).map(a => `
                                <li class="live-feed-row sev-${a.severity}">
                                    <span class="live-feed-time">${a.time}</span>
                                    <span class="live-feed-action">${a.action}</span>
                                    ${a.target ? `<span class="live-feed-target">${a.target.label}</span>` : '<span class="live-feed-target text-muted">—</span>'}
                                    ${severityPill(a.severity)}
                                </li>
                            `).join('')}
                            ${SAMPLE_ALERTS.slice(0, 2).map(al => `
                                <li class="live-feed-row sev-${al.severity} live-feed-alert">
                                    <span class="live-feed-time">${al.time}</span>
                                    <span class="live-feed-action">${al.kind}</span>
                                    <span class="live-feed-target font-monospace text-secondary">${al.ip}</span>
                                    ${severityPill(al.severity)}
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        <!-- last24h mini cards (admin:stats:tick.last24h) -->
        <div class="row g-3 mt-2">
            ${[
                { icon: 'bi-box-arrow-in-right', label: '24h bejelentkezés',     value: '38', color: 'primary' },
                { icon: 'bi-person-plus-fill',   label: '24h regisztráció',      value: '5',  color: 'success' },
                { icon: 'bi-journal-text',       label: '24h audit',             value: '24', color: 'warning' },
                { icon: 'bi-exclamation-octagon',label: '24h kritikus művelet',  value: '2',  color: 'danger' },
                { icon: 'bi-shield-fill-x',      label: '24h riasztás',          value: '7',  color: 'warning' },
                { icon: 'bi-ban',                label: '24h új tiltás',         value: '1',  color: 'danger' }
            ].map(item => `
                <div class="col-6 col-md-4 col-xl-2">
                    <div class="mini-stat">
                        <i class="bi ${item.icon} text-${item.color}"></i>
                        <div class="mini-stat-value">${item.value}</div>
                        <div class="mini-stat-label">${item.label}</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `,

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
                        <option value="memberSince">Regisztráció</option>
                    </select>
                </div>
            `,
            headers: ['Felhasználó', 'ELO', 'Szerepkör', 'Állapot', 'Utolsó aktivitás', 'Csatlakozott', ''],
            rows: SAMPLE.users.map((u, idx) => [
                h.user({ name: u.name, email: u.email, struck: u.struck }),
                `<span class="fw-semibold ${u.elo > 0 ? 'text-gold' : 'text-secondary'}">${u.elo}</span>`,
                rolePill(u.role),
                statusPill(u.status),
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
                        { icon: 'bi-ban',    variant: 'danger', title: 'Tiltás (kritikus művelet)', onclick: `openCriticalAction('users.ban', '${u.name}')` }
                    ])
            ]),
            footer: `
                <div class="card-footer d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <small class="text-secondary">24 felhasználóból 1–3. megjelenítve</small>
                    <nav aria-label="Lapozás"><ul class="pagination pagination-sm mb-0">
                        <li class="page-item disabled"><a class="page-link" href="#">Előző</a></li>
                        <li class="page-item active"><a class="page-link" href="#">1</a></li>
                        <li class="page-item"><a class="page-link" href="#">2</a></li>
                        <li class="page-item"><a class="page-link" href="#">Köv.</a></li>
                    </ul></nav>
                </div>
            `
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
                            <img src="https://ui-avatars.com/api/?name=Magnus+Carlsen&size=128&background=d4af37&color=000"
                                class="rounded-circle border border-3 border-gold mb-3" alt="" style="width:120px;height:120px;">
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
                              placeholder: 'Miért módosítod ezeket az adatokat? Naplózásra kerül.' },
                            { id: 'editBio',         label: 'Bio', col: 12, type: 'textarea',
                              value: 'Sakk nagymester és világbajnok.' }
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
                                    { name: 'Anish Giri',  type: ['Végleges',  'danger'],  expires: 'Soha',             expClass: 'text-danger' },
                                    { name: 'ChatSpammer', type: ['Ideiglenes','warning'], expires: '2026-05-04 14:32' },
                                    { name: 'ToxikusZoli', type: ['Csak chat', 'info'],    expires: '2026-04-29 09:00' }
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
                <p class="text-secondary mb-3">A függő profilképeket csak a feltöltő látja. Jóváhagyás után globálisan láthatóvá válnak; elutasítás esetén a publikus kép visszaáll az alapértelmezettre. <span class="text-warning">Elutasítás esetén indok kötelező</span>, jóváhagyásnál opcionális.</p>
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
                { reporter: 'FairPlayer',   target: 'AgresszívJatekos99', cat: ['Toxikusság', 'danger'],     msg: 'Sértegető megjegyzések a chat-ben.',         status: ['Nyitott', 'warning'] },
                { reporter: 'SakkMester99', target: 'CheaterX',           cat: ['Csalás gyanú', 'danger'],   msg: 'Engine használat gyanúja.',                  status: ['Vizsgálat alatt', 'warning'] },
                { reporter: 'RookRider',    target: 'SpamKing',           cat: ['Spam', 'warning'],          msg: 'Reklám linkek küldése privátban.',           status: ['Lezárva', 'success'] }
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
            { icon: 'bi-play-circle-fill', value: SAMPLE.games.filter(g => g.status === 'live').length,     label: 'Folyamatban', color: 'success' },
            { icon: 'bi-trophy-fill',      value: SAMPLE.games.filter(g => g.status === 'finished').length, label: 'Befejezett',  color: 'warning' },
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
        ${h.header({
            icon: 'bi-magic', title: 'Képességek / Erősítők',
            subtitle: 'Speciális játékos képességek kezelése',
            actions: [{ label: 'Új képesség', icon: 'bi-plus-lg', variant: 'gold' }]
        })}
        <div class="row g-4">
            ${[
                { name: 'Időutazás',       desc: '+30 másodperc hozzáadása az óra idejéhez játszmánként egyszer.', uses: '1 234' },
                { name: 'Gyalogválasztás', desc: 'Egy gyalog azonnali előléptetése bármilyen figurára (a király kivételével).', uses: '892' },
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
                                    ${h.iconBtn({ icon: 'bi-trash',  variant: 'danger', title: 'Törlés' })}
                                </div>
                            </div>
                        `
                    })}
                </div>
            `).join('')}
            <div class="col-md-6 col-lg-4">
                <button type="button" class="content-card add-card w-100 h-100 border-0">
                    <div class="card-body d-flex flex-column align-items-center justify-content-center text-center p-5">
                        <i class="bi bi-plus-circle display-4 text-gold mb-3"></i>
                        <h5 class="text-white">Új képesség</h5>
                        <p class="text-secondary small mb-0">Hozz létre egy új erősítőt a játékélmény fokozásához</p>
                    </div>
                </button>
            </div>
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

    /* ---------- Naplók > Audit napló (severity-rich + diff) ---------- */
    auditLog: () => `
        ${h.header({
            icon: 'bi-journal-check', title: 'Audit napló',
            subtitle: 'Admin műveletek append-only nyomvonala — kötelező indok, before/after diff',
            actions: [{ label: 'Audit export', icon: 'bi-download', size: 'sm' }]
        })}

        <!-- Statisztika sáv -->
        <div class="row g-3 mb-4">
            ${[
                { icon: 'bi-info-circle-fill',          label: 'Info',     value: '18', color: 'primary' },
                { icon: 'bi-exclamation-triangle-fill', label: 'Warning',  value: '4',  color: 'warning' },
                { icon: 'bi-exclamation-octagon-fill',  label: 'Critical', value: '2',  color: 'danger' },
                { icon: 'bi-clock-history',             label: '24h-ban',  value: '24', color: 'success' }
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
                    <select class="form-select form-select-sm">
                        <option value="">Minden actor</option>
                        <option value="admin">admin</option>
                        <option value="modBéla">modBéla</option>
                    </select>
                </div>
            `,
            body: `
                <div class="audit-log-list">
                    ${SAMPLE_AUDIT.map((a, idx) => `
                        <article class="audit-row sev-${a.severity}" data-audit-id="${a.id}">
                            <div class="audit-row-head">
                                <span class="audit-row-time font-monospace">${a.time}</span>
                                <span class="audit-row-actor"><i class="bi bi-person-circle me-1"></i>${a.actor}</span>
                                <span class="audit-row-arrow"><i class="bi bi-arrow-right"></i></span>
                                <span class="audit-row-action font-monospace">${a.action}</span>
                                ${a.target ? `<span class="audit-row-target"><i class="bi bi-bullseye me-1"></i>${a.target.label}</span>` : ''}
                                <div class="audit-row-spacer"></div>
                                ${severityPill(a.severity)}
                                <button type="button" class="btn btn-sm btn-outline-gold btn-icon ms-2 audit-row-toggle"
                                    onclick="document.getElementById('auditDetail-${idx}').classList.toggle('d-none'); this.classList.toggle('open');"
                                    aria-label="Részletek">
                                    <i class="bi bi-chevron-down"></i>
                                </button>
                            </div>
                            <div class="audit-row-reason"><i class="bi bi-quote me-1"></i>${a.reason}</div>
                            <div id="auditDetail-${idx}" class="audit-row-detail d-none">
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
                                    <span><strong>event_id:</strong> <span class="font-monospace text-gold">${a.id}</span></span>
                                    <span><strong>severity:</strong> ${a.severity}</span>
                                    ${a.target ? `<span><strong>target:</strong> ${a.target.type}#${a.target.id}</span>` : ''}
                                </div>
                            </div>
                        </article>
                    `).join('')}
                </div>
            `
        })}
    `,

    /* ---------- Naplók > Riasztások ---------- */
    alerts: () => `
        ${h.header({
            icon: 'bi-exclamation-octagon-fill', title: 'Riasztások',
            subtitle: 'Jogosulatlan próbák, rate limit szigorítások, gyanús minták',
            actions: [{ label: 'Mind elolvasva', icon: 'bi-check-all', size: 'sm' }]
        })}

        <div class="row g-3 mb-4">
            ${[
                { icon: 'bi-shield-fill-x', label: 'Unauthorized',       value: '1', color: 'warning' },
                { icon: 'bi-key-fill',      label: 'Token hiba',         value: '1', color: 'warning' },
                { icon: 'bi-speedometer2',  label: 'Rate escalated',     value: '1', color: 'warning' },
                { icon: 'bi-bug-fill',      label: 'Suspicious pattern', value: '1', color: 'danger'  }
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
            headerExtra: `
                <div class="filter-bar">
                    <select class="form-select form-select-sm">
                        <option>Minden típus</option>
                        <option>unauthorized</option><option>token_invalid</option>
                        <option>rate_escalated</option><option>suspicious_pattern</option>
                    </select>
                    <select class="form-select form-select-sm">
                        <option>Minden severity</option><option>warning</option><option>critical</option>
                    </select>
                </div>
            `,
            body: `
                <div class="alert-list">
                    ${SAMPLE_ALERTS.map((a, idx) => `
                        <article class="alert-row sev-${a.severity}">
                            <div class="alert-row-icon"><i class="bi ${ALERT_KIND[a.kind]?.icon || 'bi-question'}"></i></div>
                            <div class="alert-row-body">
                                <div class="alert-row-head">
                                    ${alertKindLabel(a.kind)}
                                    ${severityPill(a.severity)}
                                    <span class="alert-row-time font-monospace ms-auto">${a.time}</span>
                                </div>
                                <div class="alert-row-meta">
                                    <span><strong>IP:</strong> <span class="font-monospace text-gold">${a.ip}</span></span>
                                    <span><strong>User:</strong> ${a.user}</span>
                                    <span><strong>Endpoint:</strong> <span class="font-monospace">${a.endpoint}</span></span>
                                </div>
                                <div class="alert-row-detail">${formatJSON(a.detail)}</div>
                                <div class="alert-row-actions">
                                    ${h.btn({ label: 'IP tiltás',     icon: 'bi-ban',          variant: 'outline-danger',  size: 'sm' })}
                                    ${h.btn({ label: 'Audit nyitás',  icon: 'bi-journal-text', variant: 'outline-gold',    size: 'sm', onclick: "showSection('auditLog')" })}
                                    ${h.btn({ label: 'Elutasít',      icon: 'bi-x-circle',     variant: 'outline-secondary', size: 'sm' })}
                                </div>
                            </div>
                        </article>
                    `).join('')}
                </div>
            `,
            noBodyPadding: true
        })}
    `,

    /* ---------- Super admin (only visible page section) ---------- */
    superAdmin: () => `
        ${h.header({
            icon: 'bi-stars', title: 'Super admin',
            subtitle: 'Admin szerepkörök kiosztása és visszavonása',
            actions: [{ label: 'Admin grant', icon: 'bi-plus-lg', variant: 'gold',
                onclick: "openCriticalAction('admin.grant', 'új admin')" }]
        })}

        <div class="alert alert-warning bg-warning bg-opacity-10 border-warning d-flex align-items-start gap-2">
            <i class="bi bi-info-circle-fill text-warning mt-1"></i>
            <div class="flex-grow-1">
                <strong>Last-super-admin lock</strong> aktív — egy super-admin saját
                <code>is_super_admin</code> flag-jét nem tudja levenni, ha ő az utolsó.
                Minden admin grant/revoke <strong>kritikus művelet</strong>: 30 char indok + jelszó megerősítés szükséges.
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

    /* ---------- Közösségi kapcsolatok ---------- */
    friends: () => `
        ${h.header({
            icon: 'bi-people', title: 'Közösségi kapcsolatok',
            subtitle: 'Barátkérelmek, kapcsolatok és blokkolások egy helyen'
        })}
        ${h.stats([
            { icon: 'bi-diagram-3-fill', value: '142', label: 'Összes barátság', color: 'primary' },
            { icon: 'bi-person-plus',    value: '8',   label: 'Függő kérelem',   color: 'warning' },
            { icon: 'bi-person-x-fill',  value: '5',   label: 'Aktív blokkolás', color: 'danger' }
        ])}
        <div class="row g-4">
            <div class="col-lg-7">
                ${h.card({
                    title: 'Függő barátkérelmek', icon: 'bi-person-plus-fill', noBodyPadding: true,
                    body: `
                        <table class="table mb-0">
                            <thead><tr><th>Küldő</th><th>Címzett</th><th>Küldve</th><th class="text-end"></th></tr></thead>
                            <tbody>
                                ${[
                                    { from: 'SakkMester99',   to: 'RookRider',       when: '2 órája' },
                                    { from: 'FairPlayer',     to: 'Magnus Carlsen',  when: '1 napja' },
                                    { from: 'ChessRookie',    to: 'Hikaru Nakamura', when: '3 napja' }
                                ].map(r => `
                                    <tr>
                                        <td><span class="text-white">${r.from}</span></td>
                                        <td><span class="text-white">${r.to}</span></td>
                                        <td><span class="text-secondary">${r.when}</span></td>
                                        <td class="text-end">${h.btn({ label: 'Részletek', size: 'sm' })}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `
                })}
            </div>
            <div class="col-lg-5">
                ${h.card({
                    title: 'Aktív blokkolások', icon: 'bi-person-x-fill', noBodyPadding: true,
                    body: `
                        <table class="table mb-0">
                            <thead><tr><th>Blokkoló</th><th>Blokkolt</th><th class="text-end"></th></tr></thead>
                            <tbody>
                                ${[
                                    { who: 'FairPlayer',   whom: 'ToxikusZoli' },
                                    { who: 'SakkMester99', whom: 'SpamKing' }
                                ].map(b => `
                                    <tr>
                                        <td><span class="text-white">${b.who}</span></td>
                                        <td><span class="text-white">${b.whom}</span></td>
                                        <td class="text-end">${h.btn({ label: 'Feloldás', variant: 'outline-success', size: 'sm' })}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
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
   8) Szekció váltás + sidebar állapot
   ============================================================= */
function showSection(sectionId, event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();

    const renderer = SECTIONS[sectionId] || SECTIONS[DEFAULT_SECTION];
    const target = document.getElementById('adminSections');
    if (!target) return;

    target.innerHTML = `<div class="section-content animate-slide-in">${renderer()}</div>`;

    // Sidebar aktív állapot frissítése
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

    // Szekció-specifikus init
    if (sectionId === 'dashboard') initChart();
    if (sectionId === 'profileImageReview') {
        window.MattMesterAdminProfileImages?.refresh?.();
    }

    // Mobil sidebar bezárása
    if (window.innerWidth < 992) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobileOverlay');
        sidebar?.classList.remove('show');
        sidebar?.classList.add('collapsed');
        overlay?.classList.remove('show');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
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
   9) Admin token visszaszámláló (ADMIN_PANEL.md §2.5)
   - 15 perces sliding TTL vizualizációja
   - csak UI demo, valódi API hívás nincs
   ============================================================= */
const TOKEN_TTL_SECONDS = 15 * 60;
let tokenSecondsLeft = TOKEN_TTL_SECONDS;
let tokenIntervalId = null;

function startTokenCountdown() {
    updateTokenPill();
    if (tokenIntervalId) clearInterval(tokenIntervalId);
    tokenIntervalId = setInterval(() => {
        tokenSecondsLeft = Math.max(0, tokenSecondsLeft - 1);
        updateTokenPill();
        if (tokenSecondsLeft === 0) {
            // Demo: 0-nál csak figyelmeztetés, nem reset
            // (valós flow: re-elevate jelszóval új tokenért)
            // 5mp után visszaállítjuk demo célból
            setTimeout(() => { tokenSecondsLeft = TOKEN_TTL_SECONDS; updateTokenPill(); }, 5000);
        }
    }, 1000);
}

function updateTokenPill() {
    const pill = document.getElementById('adminTokenPill');
    const countdown = document.getElementById('tokenCountdown');
    if (!pill || !countdown) return;

    const m = Math.floor(tokenSecondsLeft / 60);
    const s = tokenSecondsLeft % 60;
    countdown.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    pill.classList.remove('healthy', 'warning', 'expiring', 'expired');
    if (tokenSecondsLeft === 0)         pill.classList.add('expired');
    else if (tokenSecondsLeft <= 60)    pill.classList.add('expiring');
    else if (tokenSecondsLeft <= 300)   pill.classList.add('warning');
    else                                pill.classList.add('healthy');

    const pct = (tokenSecondsLeft / TOKEN_TTL_SECONDS) * 100;
    pill.style.setProperty('--token-progress', `${pct}%`);
}

function refreshAdminToken() {
    // Demo: visszaállítjuk 15 percre. Valós flow: POST /api/admin/auth/refresh
    tokenSecondsLeft = TOKEN_TTL_SECONDS;
    updateTokenPill();
    const pill = document.getElementById('adminTokenPill');
    pill?.classList.add('refresh-flash');
    setTimeout(() => pill?.classList.remove('refresh-flash'), 600);
    showToast('Admin token frissítve (+15 perc).', 'success', 'bi-shield-fill-check');
}

/* =============================================================
   10) Toast + kritikus művelet modal helperek
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
    toast.innerHTML = `<i class="bi ${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function openCriticalAction(action, targetLabel) {
    const modalEl = document.getElementById('criticalActionModal');
    if (!modalEl || !window.bootstrap?.Modal) return;

    const titleMap = {
        'users.ban':              'Felhasználó tiltása',
        'users.delete':           'Felhasználó törlése',
        'chat.delete':            'Chat üzenet törlése',
        'notifications.broadcast':'Globális értesítés küldése',
        'admin.grant':            'Admin szerep kiosztása',
        'admin.revoke':           'Admin szerep visszavonása'
    };
    document.getElementById('criticalActionTitle').textContent = titleMap[action] || action;
    document.getElementById('criticalActionDescription').innerHTML = `
        <strong class="text-white">Művelet:</strong> <code class="text-gold">${action}</code><br>
        <strong class="text-white">Cél:</strong> ${targetLabel}
    `;
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
    document.getElementById('criticalPassword').value = '';
    new window.bootstrap.Modal(modalEl).show();
}

function executeCriticalAction() {
    // Demo: csak vizuális megerősítés, valódi végrehajtás nincs
    const modalEl = document.getElementById('criticalActionModal');
    const reason = document.getElementById('criticalReason').value;
    const password = document.getElementById('criticalPassword').value;

    if (reason.length < 30) {
        showToast('Az indok min. 30 karakter legyen.', 'danger', 'bi-exclamation-triangle-fill');
        return;
    }
    if (!password) {
        showToast('Jelszó megerősítés szükséges.', 'danger', 'bi-key-fill');
        return;
    }

    if (modalEl && window.bootstrap?.Modal) {
        window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    }
    showToast('Kritikus művelet naplózva (demo).', 'success', 'bi-shield-fill-check');
    // Token rotáció kritikus művelet után (ADMIN_PANEL.md §2.7)
    refreshAdminToken();
}

/* =============================================================
   11) Háttér műveletek (logout, export, modal nyitás)
   ============================================================= */
async function logAuthStatusReport(contextLabel = 'admin-logout') {
    try {
        const response = await fetch('/api/sessionInfo');
        const data = await response.json().catch(() => ({}));

        console.clear();
        console.log('--- Auth Status Report ---');
        console.log('Context:', contextLabel);
        console.log('Session info:', response.ok ? data : { success: false, loggedIn: false });

        if (window.MattMesterSocket?.socket) {
            console.log('SocketInfo:', window.MattMesterSocket?.getSnapshot ? window.MattMesterSocket.getSnapshot() : {
                socketId: window.MattMesterSocket.socket.id,
                connected: window.MattMesterSocket.socket.connected,
                sessionBound: window.MattMesterSocket.socket.connected ? 'Active' : 'Disconnected/Pending'
            });
        } else {
            console.warn('SocketInfo: A socket objektum nem található vagy még nem lett inicializálva.');
        }
        console.log('--------------------------');
    } catch (error) {
        console.error('Hiba az auth status report naplozasakor:', error);
    }
}

function exportUsers() {
    runSafelyAsync('exportUsers', async () => {
        requestController.schedule('exportUsers', async () => {
            try {
                const response = await fetch('/api/admin/export-users', {
                    signal: requestController.withAbortSignal('exportUsers')
                });
                if (!response.ok) throw new Error('Hiba történt a felhasználók exportálása során.');
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'users.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            } catch (error) {
                if (error?.name === 'AbortError') throw error;
                console.error('Hiba:', error);
                alert(error.message || 'Hiba történt a felhasználók exportálása során.');
            } finally {
                requestController.clearSignal('exportUsers');
            }
        });
    });
}

function viewUser(userId) {
    const modalEl = document.getElementById('userModal');
    if (!modalEl || !window.bootstrap?.Modal) return;
    new window.bootstrap.Modal(modalEl).show();
}

function logout() {
    if (!confirm('Biztosan ki szeretnél lépni?')) return;
    runSafelyAsync('adminLogout', async () => {
        requestController.schedule('logout', async () => {
            try {
                const response = await fetch('/api/logout', {
                    method: 'POST',
                    signal: requestController.withAbortSignal('logout')
                });
                if (!response.ok) throw new Error('Sikertelen kijelentkezes.');
                await logAuthStatusReport('admin-logout-success');
            } catch (error) {
                if (error?.name === 'AbortError') throw error;
                console.error('Logout hiba:', error);
                throw error;
            } finally {
                requestController.clearSignal('logout');
                window.location.href = '/';
            }
        });
    });
}

/* =============================================================
   12) Activity chart
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
                    borderColor: '#d4af37',
                    backgroundColor: gradient,
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
   13) Profilkép moderáció (eseménydelegációval)
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
        if (STATE.loading) return;
        STATE.loading = true;
        setMessage(null, '');
        try {
            const response = await fetch('/api/admin/profile-images/pending');
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.success) {
                throw new Error(result?.message || 'Hiba a függő profilképek lekérdezése során.');
            }
            renderRows(result.data || []);
        } catch (error) {
            console.error('admin profile-images pending fetch hiba:', error);
            setMessage('danger', error.message || 'Hiba a lekérdezés során.');
            renderRows([]);
        } finally {
            STATE.loading = false;
        }
    }

    async function approve(uploadId) {
        try {
            const response = await fetch(`/api/admin/profile-images/${encodeURIComponent(uploadId)}/approve`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.success) throw new Error(result?.message || 'A jóváhagyás sikertelen.');
            setMessage('success', result.message || 'A profilkép jóváhagyva.');
            await refresh();
        } catch (error) {
            console.error('admin profile-image approve hiba:', error);
            setMessage('danger', error.message || 'A jóváhagyás sikertelen.');
        }
    }

    async function reject(uploadId) {
        const reviewNoteRaw = window.prompt('Add meg az elutasítás indokát (opcionális, max 500 karakter):', '') || '';
        const reviewNote = reviewNoteRaw.trim().slice(0, 500);
        try {
            const response = await fetch(`/api/admin/profile-images/${encodeURIComponent(uploadId)}/reject`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reviewNote: reviewNote || null })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.success) throw new Error(result?.message || 'Az elutasítás sikertelen.');
            setMessage('success', result.message || 'A profilkép elutasítva.');
            await refresh();
        } catch (error) {
            console.error('admin profile-image reject hiba:', error);
            setMessage('danger', error.message || 'Az elutasítás sikertelen.');
        }
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
   14) Init
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
        startTokenCountdown();
        window.MattMesterChatModal?.init();
    });
});
