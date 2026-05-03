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
        const pendingDeletion = user?.pendingDeletionUntil ? new Date(user.pendingDeletionUntil) : null;
        const isPending = pendingDeletion && pendingDeletion > new Date();

        const onlineHtml = online
            ? `<span class="user-presence user-presence-online" title="Online · ${tabCount} aktív tab">
                  <span class="user-presence-dot"></span>Online${tabCount > 1 ? ` <span class="user-presence-tabs">${tabCount}</span>` : ''}
               </span>`
            : `<span class="user-presence user-presence-offline" title="Offline"><span class="user-presence-dot"></span>Offline</span>`;
        const bannedHtml = banned ? `<span class="badge badge-status-banned ms-1">Tiltott</span>` : '';
        const pendingHtml = isPending ? `
            <span class="badge bg-danger ms-1" title="Hard-delete: ${escapeHtml(pendingDeletion.toLocaleString('hu-HU'))}">
                <i class="bi bi-hourglass-split me-1"></i>Törlésre várólista
            </span>` : '';
        html = `<div class="user-status-cell">${onlineHtml}${bannedHtml}${pendingHtml}</div>`;
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

