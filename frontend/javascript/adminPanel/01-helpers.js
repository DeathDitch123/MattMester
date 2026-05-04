// MINDEN API AMI ITT MEG VAN HÍVVA ISADMIN() VALIDÁLÁSSAL KELL TÖRTÉNJEN A BACKENDEN,
// HOGY CSAK ADMINOK FÉRHESSENEK HOZZÁJUK
const requestController = window.createRequestController(300);

/* =============================================================
   1) Apró segédek — delegate-ek a `_utils.js` egyetlen kanonikus implementációjára
   ============================================================= */
const runSafely = (label, fn) => window.MattMesterUtils.runSafely(label, fn);
const runSafelyAsync = (label, fn) => window.MattMesterUtils.runSafelyAsync(label, fn);
const escapeHtml = (value) => window.MattMesterUtils.escapeHtml(value);

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
    suspicious_pattern: { label: 'Gyanús minta', icon: 'bi-bug-fill' },
    user_banned:   { label: 'Felhasználó tiltva',   icon: 'bi-slash-circle-fill' },
    user_unbanned: { label: 'Tiltás feloldva',      icon: 'bi-check-circle-fill' },
    user_deleted:  { label: 'Felhasználó törölve',  icon: 'bi-trash3-fill' }
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
    ongoing: { label: 'Élő', cls: 'bg-success' },
    finished: { label: 'Befejezett', cls: 'bg-secondary' },
    abandoned: { label: 'Megszakított', cls: 'bg-warning text-dark' }
};
const UNKNOWN_BADGE = { label: '—', cls: 'bg-secondary' };
const ROLE_BADGE = {
    admin: { label: 'Admin', cls: 'badge-role-admin' },
    player: { label: 'Játékos', cls: 'badge-role-player' }
};
const RISK_BADGE = {
    low: { label: 'Alacsony', cls: 'bg-success' },
    medium: { label: 'Közepes', cls: 'bg-warning text-dark' },
    high: { label: 'Magas', cls: 'bg-danger' }
};
const statusPill = (key) => {
    const s = STATUS_BADGE[key] || { ...UNKNOWN_BADGE, label: key || UNKNOWN_BADGE.label };
    return `<span class="badge ${s.cls}">${s.label}</span>`;
};
const rolePill = (key) => {
    const s = ROLE_BADGE[key] || { ...UNKNOWN_BADGE, label: key || UNKNOWN_BADGE.label };
    return `<span class="badge ${s.cls}">${s.label}</span>`;
};
const riskPill = (key) => {
    const s = RISK_BADGE[key] || { ...UNKNOWN_BADGE, label: key || UNKNOWN_BADGE.label };
    return `<span class="badge ${s.cls}">${s.label}</span>`;
};

