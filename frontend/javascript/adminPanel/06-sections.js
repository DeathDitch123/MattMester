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
                /* Konstans 'success' szin + nincs `empty` flag — a kartya
                 * vizualisan koherens a tobbi stat-card-dal akkor is, ha
                 * eppen 0 a jatszma. Csak a hint szovege valtozik. */
                label: 'Aktív játszma', color: 'success',
                hint: inGameEmpty
                    ? '<span class="text-secondary"><i class="bi bi-pause-circle me-1"></i>Nincs élő játszma — kattints a játszmák listájához</span>'
                    : '<span class="live-indicator text-success"><span class="live-dot"></span>Élőben most</span>',
                hintClass: inGameEmpty ? 'text-secondary' : 'text-success',
                interactive: 'games',
                cardId: 'mainInGameCard',
                emblem: 'chess'
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
                hasUser && !isCurrentUser
                    ? { label: 'Üzenet', icon: 'bi-chat-dots', variant: 'outline-info', size: 'sm', attrs: 'title="Üzenet küldése (Issue #53)"', onclick: 'openAdminQuickChatModal()' }
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
                        <div class="danger-action">
                            <div>
                                <div class="fw-semibold text-white">Profil törlése <span class="badge bg-danger ms-1">kritikus</span></div>
                                <small class="text-secondary">Véglegesen eltávolítja a felhasználót — jelszó megerősítés szükséges.</small>
                            </div>
                            ${h.btn({
                    label: 'Törlés kezelése', icon: 'bi-trash3-fill', variant: 'outline-danger', size: 'sm',
                    onclick: `deleteAdminUser(${u.id})`
                })}
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
                            A tiltás mutáló művelet — min. <strong>10 karakter indok</strong> és <strong>jelszó megerősítés</strong> szükséges.
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
                        <form class="row g-3" onsubmit="event.preventDefault();">
                            <div class="col-md-6">
                                <label class="form-label" for="banType">Típus</label>
                                <select id="banType" class="form-select" onchange="onBanTypeChange()">
                                    <option value="Ideiglenes">Ideiglenes</option>
                                    <option value="Végleges">Végleges</option>
                                    <option value="Csak chat">Csak chat</option>
                                </select>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label" for="banDuration">Időtartam (óra)</label>
                                <input id="banDuration" class="form-control" type="number" value="24" min="1">
                            </div>
                            <div class="col-12">
                                <label class="form-label" for="banReason">
                                    Indok <span class="text-danger">*</span>
                                    <span class="critical-reason-counter ms-2">
                                        <span id="banReasonCount">0</span> / 10
                                    </span>
                                </label>
                                <textarea id="banReason" class="form-control" rows="3" placeholder="Rövid indok — naplózásra kerül (min. 10 karakter)." oninput="onBanReasonInput(this)"></textarea>
                            </div>
                            <div class="col-12">
                                <label class="form-label" for="banPassword">Saját admin jelszó <span class="text-danger">*</span></label>
                                <input id="banPassword" class="form-control" type="password" autocomplete="current-password" placeholder="Saját admin jelszavad megerősítésre">
                            </div>
                            ${hasUser ? `
                                <div class="col-12 mt-2">
                                    <button type="button" id="banHoldBtn" class="ban-hold-btn"
                                            data-target-id="${u.id}"
                                            onmousedown="startBanHold(this)"
                                            onmouseup="cancelBanHold(this)"
                                            onmouseleave="cancelBanHold(this)"
                                            ontouchstart="event.preventDefault(); startBanHold(this)"
                                            ontouchend="cancelBanHold(this)">
                                        <span class="ban-hold-label"><i class="bi bi-shield-fill-check me-2"></i>Tiltás alkalmazása</span>
                                        <small class="ban-hold-sub">Tartsd nyomva 5 másodpercig</small>
                                    </button>
                                </div>
                            ` : `
                                <div class="col-12 mt-2">
                                    <button type="button" class="ban-hold-btn" disabled>
                                        <span class="ban-hold-label"><i class="bi bi-shield-fill-check me-2"></i>Tiltás alkalmazása</span>
                                        <small class="ban-hold-sub">Először válassz felhasználót</small>
                                    </button>
                                </div>
                            `}
                        </form>
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
                                                ${h.iconBtn({ icon: 'bi-check-circle', variant: 'success', title: 'Feloldás (kritikus)', onclick: `openCriticalAction('users.unban', '${escapeHtml(b.username || '').replace(/'/g, "\\\\'")}', ${b.id})` })}
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

    /* ---------- Felhasználók > Felhasználó törlése ---------- */
    userDelete: () => {
        const u = state.selectedUser;
        const hasUser = Boolean(u);
        const targetLabel = hasUser ? (u.username || `#${u.id}`) : 'kiválasztott felhasználó';
        const isAdminTarget = hasUser && u.role === 'admin';

        // Varolista: minden user akinek pending_deletion_until a jovoben van.
        const allUsers = Array.isArray(state.users.list) ? state.users.list : [];
        const now = Date.now();
        const pendingList = allUsers.filter((x) => {
            if (!x.pendingDeletionUntil) return false;
            const t = new Date(x.pendingDeletionUntil).getTime();
            return Number.isFinite(t) && t > now;
        }).sort((a, b) => new Date(a.pendingDeletionUntil) - new Date(b.pendingDeletionUntil));

        return `
        ${h.header({
            icon: 'bi-trash3-fill', title: 'Felhasználó törlése',
            subtitle: hasUser
                ? `${targetLabel} — előre kiválasztva törléshez`
                : 'Profil törlése admin oldalról (24h grace + visszaállítás)',
            actions: hasUser
                ? [{ label: 'Vissza a listához', icon: 'bi-arrow-left', size: 'sm', onclick: "showSection('users')" }]
                : []
        })}
        <div class="row g-4 mb-4">
            <div class="col-lg-5">
                ${h.card({
            title: hasUser ? `Profil törlése — ${escapeHtml(targetLabel)}` : 'Profil törlése',
            icon: 'bi-trash3-fill',
            headerExtra: h.badge('kritikus művelet', 'danger'),
            body: `
                        <div class="alert alert-danger bg-danger bg-opacity-10 border-danger small mb-3">
                            <i class="bi bi-exclamation-triangle-fill me-1"></i>
                            <strong>Véglegesen eltávolítja</strong> a felhasználót. A meccsadatok megmaradnak az ellenfelek számára (felhasználói nevek <em>Törölt felhasználó</em>-ra cserélődnek), de a profil, barátok, chat üzenetek, képességek naplói <strong>minden eltűnik</strong>. A művelet <strong>nem visszavonható</strong>.
                        </div>
                        <div class="alert alert-info bg-info bg-opacity-10 border-info small mb-3">
                            <i class="bi bi-info-circle me-1"></i>
                            Megerősítéshez a saját <strong>admin jelszavadat</strong> kell megadnod a lenti mezőben. Az indok <strong>opcionális</strong>, de javasolt audit célokra.
                        </div>
                        ${hasUser ? `
                            <div class="ban-target-card mb-3">
                                ${h.user({ name: u.username, email: u.email, profile_image: u.profileImage, username: u.username })}
                                <div class="ban-target-meta">
                                    ${rolePill(u.role === 'admin' ? 'admin' : 'player')}
                                    ${u.isBanned ? statusPill('banned') : renderPresenceStatusBadgeInline(u)}
                                </div>
                            </div>
                            ${isAdminTarget ? `
                                <div class="alert alert-warning bg-warning bg-opacity-10 border-warning small mb-3">
                                    <i class="bi bi-shield-fill-exclamation me-1"></i>
                                    <strong>Admin profil nem törölhető</strong> ezen a felületen. Ehhez super-admin műveletre van szükség.
                                </div>
                            ` : ''}
                        ` : `
                            <div class="alert alert-info bg-info bg-opacity-10 border-info small mb-3">
                                <i class="bi bi-info-circle me-1"></i>
                                Nincs kiválasztott felhasználó — válassz egyet a
                                <a href="#" class="text-gold" onclick="showSection('users', event)">listából</a>.
                            </div>
                        `}
                        <form class="row g-3" onsubmit="event.preventDefault();">
                            <div class="col-12">
                                <label class="form-label" for="deleteReason">
                                    Indok <span class="text-secondary">(opcionális, max 1000 char)</span>
                                </label>
                                <textarea id="deleteReason" class="form-control" rows="3" maxlength="1000"
                                          placeholder="Részletes indok — naplózásra kerül. Lehet üres is."></textarea>
                            </div>
                            <div class="col-12">
                                <label class="form-label" for="deletePassword">Saját admin jelszó <span class="text-danger">*</span></label>
                                <input id="deletePassword" class="form-control" type="password"
                                       autocomplete="current-password"
                                       placeholder="Saját admin jelszavad megerősítésre">
                            </div>
                            ${hasUser && !isAdminTarget ? `
                                <div class="col-12 mt-2">
                                    <button type="button" id="deleteHoldBtn" class="ban-hold-btn"
                                            data-target-id="${u.id}"
                                            onmousedown="startDeleteHold(this)"
                                            onmouseup="cancelDeleteHold(this)"
                                            onmouseleave="cancelDeleteHold(this)"
                                            ontouchstart="event.preventDefault(); startDeleteHold(this)"
                                            ontouchend="cancelDeleteHold(this)">
                                        <span class="ban-hold-label"><i class="bi bi-trash3-fill me-2"></i>Profil törlése</span>
                                        <small class="ban-hold-sub">Tartsd nyomva 5 másodpercig</small>
                                    </button>
                                </div>
                            ` : `
                                <div class="col-12 mt-2">
                                    <button type="button" class="ban-hold-btn" disabled>
                                        <span class="ban-hold-label"><i class="bi bi-trash3-fill me-2"></i>Profil törlése</span>
                                        <small class="ban-hold-sub">${isAdminTarget ? 'Admin profil nem törölhető' : 'Először válassz felhasználót'}</small>
                                    </button>
                                </div>
                            `}
                        </form>
                    `
        })}
            </div>
            <div class="col-lg-7">
                ${h.card({
            title: 'Törlésre várólista',
            icon: 'bi-hourglass-split',
            headerExtra: `<span class="text-secondary small">${pendingList.length} bejegyzés · ${pendingList.length > 0 ? '24h grace' : ''}</span>`,
            noBodyPadding: true,
            body: `
                        <table class="table mb-0">
                            <thead>
                                <tr>
                                    <th>Felhasználó</th>
                                    <th>Hátralévő idő</th>
                                    <th class="text-end">Művelet</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pendingList.length === 0
                    ? `<tr><td colspan="3" class="text-center text-secondary py-4">
                            <i class="bi bi-hourglass me-1"></i>Nincs törlésre váró felhasználó.
                       </td></tr>`
                    : pendingList.map((p) => {
                        const untilTs = new Date(p.pendingDeletionUntil).getTime();
                        const diffMs = Math.max(0, untilTs - now);
                        const totalMin = Math.floor(diffMs / 60000);
                        const hours = Math.floor(totalMin / 60);
                        const mins = totalMin % 60;
                        const countdown = hours > 0 ? `${hours}ó ${mins}p` : `${mins}p`;
                        const danger = hours < 2;
                        return `
                                            <tr>
                                                <td>${h.user({ name: p.username, email: p.email, profile_image: p.profileImage, username: p.username, struck: true })}</td>
                                                <td>
                                                    <span class="${danger ? 'text-danger fw-semibold' : 'text-warning'}" title="${escapeHtml(new Date(p.pendingDeletionUntil).toLocaleString('hu-HU'))}">
                                                        <i class="bi bi-hourglass-split me-1"></i>${countdown}
                                                    </span>
                                                    ${p.deletedReason ? `<div class="small text-secondary" title="${escapeHtml(p.deletedReason)}">${escapeHtml(p.deletedReason.length > 60 ? p.deletedReason.slice(0, 60) + '…' : p.deletedReason)}</div>` : ''}
                                                </td>
                                                <td class="text-end">
                                                    ${h.iconBtn({ icon: 'bi-eye', variant: 'light', title: 'Megtekintés', onclick: `openAdminUserView(${p.id})` })}
                                                    ${h.iconBtn({ icon: 'bi-arrow-counterclockwise', variant: 'success', title: 'Visszaállít (törlés visszavonása)', onclick: `restoreUserDeletion(${p.id})` })}
                                                </td>
                                            </tr>
                                        `;
                    }).join('')}
                            </tbody>
                        </table>
                    `
        })}
            </div>
        </div>
    `;
    },

    /* ---------- Moderáció > Chat ---------- */
    chats: () => `
        ${h.header({
            icon: 'bi-chat-dots-fill', title: 'Chat moderálás',
            subtitle: 'Megjelölt és bejelentett üzenetek áttekintése'
        })}
        ${h.card({
            title: `<span id="chatModerationCardTitle">Megjelölt üzenetek</span>`,
            icon: 'bi-exclamation-triangle-fill',
            noBodyPadding: true,
            body: `
                <div class="px-3 pt-3">
                    <p class="text-secondary mb-2">Két forrás:
                        <span class="badge bg-danger">Bejelentett</span> = felhasználói bejelentés;
                        <span class="badge bg-warning text-dark">Auto-flagged</span> = a profanity-filter blocklist által maszkolt üzenet (fix szabály, az admin sem engedélyezheti — csak törölhető vagy figyelmen kívül hagyható).
                        Az <strong>Engedélyezés</strong> a felhasználói bejelentéseket utasítja el, a <strong>Törlés</strong> véglegesen eltávolítja az üzenetet és strike-ot rögzít a feladónak (3 csapas után auto-ban).
                    </p>
                    <div id="chatModerationMessage" class="alert d-none" role="alert"></div>
                </div>
                <div class="moderation-list" id="chatModerationList">
                    <div class="text-center text-secondary py-4">Töltés...</div>
                </div>
            `
        })}
    `,

    /* ---------- Moderáció > Profilképek ---------- */
    profileImageReview: () => `
        ${h.header({
        icon: 'bi-image', title: 'Függő profilképek',
        subtitle: 'Új profilképek jóváhagyása vagy elutasítása'
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
    // Player-vs-player bejelentesek (NEM chat). A chat bejelentesei kulon
    // a "Chat moderalas" panel-en jelennek meg. Itt kategoria-alapu reportokat
    // kezelunk (cheating, toxicity, spam, harassment, unfair_play, other) +
    // status-uk allithato (open / under_review / closed).
    moderationReports: () => `
        ${h.header({
        icon: 'bi-flag-fill', title: 'Bejelentések',
        subtitle: 'Felhasználók által beküldött player-bejelentések'
    })}
        ${h.card({
            title: `<span id="reportsModerationCardTitle">Bejelentések</span>`,
            icon: 'bi-flag-fill',
            noBodyPadding: true,
            body: `
                <div class="px-3 pt-3">
                    <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
                        <button type="button" class="btn btn-sm btn-outline-light reports-filter-btn active" data-reports-filter="all">
                            Összes <span class="badge bg-secondary ms-1" id="reportsCountAll">0</span>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-warning reports-filter-btn" data-reports-filter="open">
                            Nyitott <span class="badge bg-warning text-dark ms-1" id="reportsCountOpen">0</span>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-info reports-filter-btn" data-reports-filter="under_review">
                            Vizsgálat alatt <span class="badge bg-info text-dark ms-1" id="reportsCountUnderReview">0</span>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-success reports-filter-btn" data-reports-filter="closed">
                            Lezárt <span class="badge bg-success ms-1" id="reportsCountClosed">0</span>
                        </button>
                    </div>
                    <p class="text-secondary mb-2 small">
                        Felhasználói bejelentések más játékosokra. A chat-üzenet bejelentések
                        a <strong>Chat moderálás</strong> panelen jelennek meg (külön rendszer).
                        Hamis bejelentésért a bejelentő NEM kap büntetést.
                    </p>
                    <div id="reportsModerationMessage" class="alert d-none" role="alert"></div>
                </div>
                <div class="moderation-list" id="reportsModerationList">
                    <div class="text-center text-secondary py-4">Töltés...</div>
                </div>
            `
        })}
    `,

    /* ---------- Játékok > Játszmák ---------- */
    games: () => {
        const g = state.gamesAdmin;
        const c = g.counts || { ongoing: 0, finished: 0, abandoned: 0, draw: 0 };
        const fmtTime = (iso) => {
            if (!iso) return '—';
            try { return new Date(iso).toLocaleString('hu-HU'); } catch (_) { return String(iso); }
        };
        const filterButtons = ['all', 'ongoing', 'finished', 'abandoned'].map((key) => {
            const labels = { all: 'Összes', ongoing: 'Élő', finished: 'Befejezett', abandoned: 'Megszakított' };
            const active = g.filter === key ? ' active' : '';
            return `<button type="button" class="btn btn-outline-secondary${active}" onclick="setGamesFilter('${key}')">${labels[key]}</button>`;
        }).join('');

        const rows = (g.list || []).map((row) => {
            const winner = row.winner ? `<span class="text-success">${escapeHtml(row.winner.username || '—')}</span>` : '<span class="text-secondary">—</span>';
            const buttons = [];
            buttons.push(`<button type="button" class="btn btn-sm btn-outline-gold" onclick="openSpectator(${row.id})" title="Megnez"><i class="bi bi-eye"></i></button>`);
            if (row.status === 'ongoing') {
                buttons.push(`<button type="button" class="btn btn-sm btn-outline-danger" onclick="confirmForceEndGame(${row.id})" title="Force end"><i class="bi bi-stop-circle"></i></button>`);
            } else {
                buttons.push(`<button type="button" class="btn btn-sm btn-outline-secondary" onclick="downloadGamePgn(${row.id})" title="PGN letoltes"><i class="bi bi-download"></i></button>`);
            }
            return [
                `<span class="font-monospace text-gold">#${row.id}</span>`,
                `<div class="d-flex align-items-center gap-2"><i class="bi bi-circle text-light"></i><span>${escapeHtml(row.white?.username || '—')}</span></div>`,
                `<div class="d-flex align-items-center gap-2"><i class="bi bi-circle-fill text-dark border rounded-circle"></i><span>${escapeHtml(row.black?.username || '—')}</span></div>`,
                statusPill(row.status),
                winner,
                String(row.moveCount || 0),
                escapeHtml(row.timeControl || '—'),
                `<span class="text-secondary small">${fmtTime(row.startTime)}</span>`,
                `<div class="d-inline-flex gap-2">${buttons.join('')}</div>`
            ];
        });

        return `
            ${h.header({
                icon: 'bi-knight-fill', title: 'Játszmák',
                subtitle: g.loaded ? `${g.list.length} jatszma listazva` : 'Lefutott és folyamatban lévő játszmák'
            })}
            ${h.stats([
                { icon: 'bi-play-circle-fill', value: c.ongoing, label: 'Folyamatban', color: 'success' },
                { icon: 'bi-trophy-fill',      value: c.finished, label: 'Befejezett', color: 'warning' },
                { icon: 'bi-x-circle-fill',    value: c.abandoned, label: 'Megszakított', color: 'danger' },
                { icon: 'bi-circle-half',      value: c.draw, label: 'Döntetlen', color: 'primary' }
            ])}
            <div class="alerts-filter-bar mb-3">
                <div class="btn-group btn-group-sm" role="group">${filterButtons}</div>
                <input type="text" class="form-control form-control-sm" placeholder="Felhasznalonev keresese..."
                       value="${escapeHtml(g.search || '')}" onchange="setGamesSearch(this.value)" style="max-width:280px;">
            </div>
            ${g.error ? `<div class="alert alert-danger">${escapeHtml(g.error)}</div>` : ''}
            ${g.loading
                ? `<div class="content-card text-center py-5"><i class="bi bi-arrow-repeat spin"></i> Toltes...</div>`
                : (rows.length === 0 && g.loaded
                    ? `<div class="content-card text-center py-5 text-secondary">Nincs jatszma a megadott szurokre.</div>`
                    : h.table({
                        title: 'Játszmák listája',
                        headers: ['Azonosító', 'Világos', 'Sötét', 'Állapot', 'Győztes', 'Lépések', 'Időkontroll', 'Indult', ''],
                        rows
                    })
                )
            }
        `;
    },

    /* ---------- Játékok > Képességek ---------- */
    abilities: () => {
        const a = state.abilities;
        const cards = (a.list || []).map((ab) => `
            <div class="col-md-6 col-lg-4">
                ${h.card({
                    title: escapeHtml(ab.name),
                    headerExtra: h.badge(`${ab.cooldownTurns} kor cooldown`, 'warning'),
                    classes: 'h-100',
                    body: `
                        <p class="text-secondary mb-3">${escapeHtml(ab.description || '—')}</p>
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">${ab.usageCount || 0} hasznalat</small>
                            <div class="btn-group">
                                <button type="button" class="btn btn-sm btn-outline-gold" onclick="openAbilityEditor(${ab.id})" title="Szerkesztes"><i class="bi bi-pencil"></i></button>
                                <button type="button" class="btn btn-sm btn-outline-danger" onclick="confirmDeleteAbility(${ab.id})" title="Torles"><i class="bi bi-trash"></i></button>
                            </div>
                        </div>
                    `
                })}
            </div>
        `).join('');

        return `
            ${h.header({
                icon: 'bi-magic', title: 'Képességek / Erősítők',
                subtitle: a.loaded ? `${a.list.length} képesség` : 'Speciális játékos képességek kezelése',
                actions: [
                    { label: 'Új képesség', icon: 'bi-plus-lg', variant: 'gold', onclick: 'openAbilityEditor()' }
                ]
            })}
            ${a.error ? `<div class="alert alert-danger">${escapeHtml(a.error)}</div>` : ''}
            ${a.loading
                ? `<div class="content-card text-center py-5"><i class="bi bi-arrow-repeat spin"></i> Toltes...</div>`
                : (a.list.length === 0 && a.loaded
                    ? `<div class="content-card text-center py-5 text-secondary">Meg nincsenek kepessegek. Kattints az "Uj kepesseg" gombra.</div>`
                    : `<div class="row g-4">${cards}</div>`)
            }
        `;
    },

    /* ---------- Naplók > Bejelentkezések ---------- */
    security: () => {
        const list = state.loginsLoaded ? state.liveLogins : [];
        const f = state.loginsFilter || {};
        const subtitle = state.loginsLoaded
            ? `${list.length} bejelentkezési bejegyzés`
            : 'Sikeres és sikertelen bejelentkezési kísérletek';
        // Dinamikus eszkoz/rendszer-lista a mar betoltott sorokbol — csak azok jelennek
        // meg, amelyek tenylegesen szerepelnek a feed-ben. A backend UA-parser ennel
        // tobb rendszert ismer fel, de a dropdown csak a "letezo" valasztasokat kinalja.
        const devicesSet = new Set();
        for (const l of list) {
            const d = l.device?.display;
            if (d && d !== '—') devicesSet.add(d);
        }
        const devices = [...devicesSet].sort();
        const statusBadge = (l) => {
            // login_failed esemenyhez (vagy explicit success === false) Sikertelen,
            // egyebkent Sikeres. A success mezo backend-rol jon (user_logs.success).
            if (l.eventType === 'login_failed' || l.success === false) {
                return `<span class="badge bg-danger">Sikertelen</span>`;
            }
            return `<span class="badge bg-success">Sikeres</span>`;
        };
        const tableRows = list.map(l => [
            `<span class="fw-semibold text-white">${escapeHtml(l.username || '—')}</span>`,
            `<span class="font-monospace ${l.risk === 'high' ? 'text-danger' : 'text-gold'}">${escapeHtml(l.ip || '—')}</span>`,
            `<span class="text-secondary"><i class="bi bi-geo-alt me-1"></i>${escapeHtml(l.location?.label || '—')}</span>`,
            `<span class="text-secondary"><i class="bi ${l.device?.icon || 'bi-question-circle'} me-1"></i>${escapeHtml(l.device?.display || '—')}</span>`,
            `<span class="text-secondary" title="${escapeHtml(l.occurredAt || '')}">${escapeHtml(formatRelative(l.occurredAt))}</span>`,
            statusBadge(l),
            riskPill(l.risk || 'low')
        ]);
        // Datum-koherencia: a "—ig" mezo nem mehet a "—tol" ele, es forditva.
        // Az input min/max attributumok biztositjak, hogy a jobb-oldali datepicker
        // a baloldali kivalasztasa elotti napokat letiltja (es viszont).
        const sinceMin = '';
        const sinceMax = f.untilDate ? escapeHtml(f.untilDate) : '';
        const untilMin = f.sinceDate ? escapeHtml(f.sinceDate) : '';
        const untilMax = '';
        return `
        ${h.header({
            icon: 'bi-shield-check', title: 'Bejelentkezési előzmények',
            subtitle,
            actions: [
                { label: 'Napló export', icon: 'bi-download', size: 'sm', onclick: 'exportLoginsCsv()' }
            ]
        })}

        <div class="alerts-filter-bar">
            <input id="loginsFilterUsername" type="text" class="form-control form-control-sm"
                   placeholder="Felhasználónév..." value="${escapeHtml(f.username || '')}"
                   onchange="onLoginsFilterChange()">
            <select id="loginsFilterStatus" class="form-select form-select-sm" onchange="onLoginsFilterChange()">
                <option value="all"     ${f.status === 'all' ? 'selected' : ''}>Minden státusz</option>
                <option value="success" ${f.status === 'success' ? 'selected' : ''}>Sikeres</option>
                <option value="failed"  ${f.status === 'failed' ? 'selected' : ''}>Sikertelen</option>
            </select>
            <select id="loginsFilterDevice" class="form-select form-select-sm" onchange="onLoginsFilterChange()"
                    title="${devices.length === 0 ? 'Csak akkor jelennek meg eszkozok, ha mar volt bejelentkezes' : 'Csak a mar bejelentkezett rendszerek/bongeszok'}">
                <option value="" ${!f.device ? 'selected' : ''}>Minden eszköz / böngésző</option>
                ${devices.map((d) => `
                    <option value="${escapeHtml(d)}" ${f.device === d ? 'selected' : ''}>${escapeHtml(d)}</option>
                `).join('')}
                ${devices.length === 0 ? '<option disabled>— még nincs bejelentkezés —</option>' : ''}
            </select>
            <input id="loginsFilterSince" type="datetime-local" class="form-control form-control-sm"
                   value="${escapeHtml(f.sinceDate || '')}" ${sinceMin ? `min="${sinceMin}"` : ''} ${sinceMax ? `max="${sinceMax}"` : ''}
                   onchange="onLoginsFilterChange()" title="Dátum-tól">
            <input id="loginsFilterUntil" type="datetime-local" class="form-control form-control-sm"
                   value="${escapeHtml(f.untilDate || '')}" ${untilMin ? `min="${untilMin}"` : ''} ${untilMax ? `max="${untilMax}"` : ''}
                   onchange="onLoginsFilterChange()" title="Dátum-ig">
            <button type="button" class="btn btn-outline-light btn-sm" onclick="resetLoginsFilter()">
                <i class="bi bi-x"></i> Szűrők törlése
            </button>
        </div>

        ${list.length === 0 && state.loginsLoaded
            ? `<div class="content-card text-center py-5">
                  <i class="bi bi-shield-check display-6 text-secondary mb-2"></i>
                  <div class="text-secondary">Nincs bejelentkezési bejegyzés a megadott szűrőkre.</div>
               </div>`
            : h.table({
                headers: ['Felhasználó', 'IP cím', 'Helyszín', 'Eszköz / böngésző', 'Idő', 'Státusz', 'Kockázat'],
                rows: tableRows
            })
        }
    `;
    },

    /* ---------- Naplók > Audit napló ---------- */
    auditLog: () => {
        const fullList = auditList();
        const intent = state.auditFilterIntent;
        // Alert -> audit pre-fill: kliens oldali szuro a riasztas kontextusara.
        const list = intent ? fullList.filter((a) => {
            const t = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
            const from = intent.sinceDate ? new Date(intent.sinceDate).getTime() : 0;
            const to = intent.untilDate ? new Date(intent.untilDate).getTime() : Infinity;
            if (t && (t < from || t > to)) return false;
            if (intent.userId && a.target?.id && Number(a.target.id) !== Number(intent.userId)) return false;
            if (intent.ip && a.actor?.ip && a.actor.ip !== intent.ip) return false;
            return true;
        }) : fullList;
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

            ${intent ? `
                <div class="alert alert-info bg-info bg-opacity-10 border-info d-flex align-items-start gap-2 mb-3">
                    <i class="bi bi-funnel-fill text-info mt-1"></i>
                    <div class="flex-grow-1">
                        <strong>Riasztás-szűrés aktív:</strong>
                        ${intent.ip ? `IP=<code class="text-gold">${escapeHtml(intent.ip)}</code> · ` : ''}
                        ${intent.userId ? `User=<code class="text-gold">#${intent.userId}</code> · ` : ''}
                        Időszak: <span class="font-monospace">${escapeHtml(new Date(intent.sinceDate).toLocaleString('hu-HU'))}</span>
                        — <span class="font-monospace">${escapeHtml(new Date(intent.untilDate).toLocaleString('hu-HU'))}</span>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-light" onclick="clearAuditFilterIntent()">
                        <i class="bi bi-x"></i> Szűrő törlése
                    </button>
                </div>
            ` : ''}

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
        const f = state.alertsFilter || {};
        return `
            ${h.header({
            icon: 'bi-exclamation-octagon-fill', title: 'Riasztások',
            subtitle: state.alertsLoaded
                ? `${list.length} bejegyzés${f.includeDismissed ? ' (elrejtettek is)' : ''}`
                : 'Jogosulatlan próbák, rate limit szigorítások, gyanús minták',
            actions: [{ label: 'Mind elrejtése', icon: 'bi-eye-slash-fill', size: 'sm', onclick: 'dismissAllAlerts()' }]
        })}

            <div class="row g-3 mb-4">
                ${[
                { icon: 'bi-shield-fill-x', label: 'Unauthorized', value: byKind.unauthorized || 0, color: 'warning' },
                { icon: 'bi-key-fill', label: 'Token hiba', value: byKind.token_invalid || 0, color: 'warning' },
                { icon: 'bi-speedometer2', label: 'Rate escalated', value: byKind.rate_escalated || 0, color: 'warning' },
                { icon: 'bi-bug-fill', label: 'Suspicious pattern', value: byKind.suspicious_pattern || 0, color: 'danger' },
                { icon: 'bi-slash-circle-fill', label: 'Tiltások', value: byKind.user_banned || 0, color: 'danger' },
                { icon: 'bi-trash3-fill', label: 'Törlések', value: byKind.user_deleted || 0, color: 'danger' }
            ].map(item => `
                    <div class="col-6 col-md-4 col-lg-2">
                        <div class="mini-stat">
                            <i class="bi ${item.icon} text-${item.color}"></i>
                            <div class="mini-stat-value">${item.value}</div>
                            <div class="mini-stat-label">${item.label}</div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div class="alerts-filter-bar">
                <select id="alertsFilterKind" class="form-select form-select-sm" onchange="onAlertsFilterChange()">
                    <option value="">Minden kategória</option>
                    ${Object.entries(ALERT_KIND).map(([k, v]) => `
                        <option value="${k}" ${f.kind === k ? 'selected' : ''}>${v.label}</option>
                    `).join('')}
                </select>
                <select id="alertsFilterSeverity" class="form-select form-select-sm" onchange="onAlertsFilterChange()">
                    <option value="">Minden severity</option>
                    <option value="info"     ${f.severity === 'info' ? 'selected' : ''}>Info</option>
                    <option value="warning"  ${f.severity === 'warning' ? 'selected' : ''}>Warning</option>
                    <option value="critical" ${f.severity === 'critical' ? 'selected' : ''}>Critical</option>
                </select>
                <input id="alertsFilterIp" type="text" class="form-control form-control-sm"
                       placeholder="IP cím szűrés..." value="${escapeHtml(f.ipAddress || '')}"
                       onchange="onAlertsFilterChange()">
                <label class="alerts-filter-toggle">
                    <input type="checkbox" id="alertsFilterIncludeDismissed"
                           ${f.includeDismissed ? 'checked' : ''}
                           onchange="onAlertsFilterChange()">
                    <span>Elrejtettek mutatása</span>
                </label>
                <button type="button" class="btn btn-outline-light btn-sm" onclick="resetAlertsFilter()">
                    <i class="bi bi-x"></i> Szűrők törlése
                </button>
            </div>

            ${h.card({
                body: `<div class="alert-list">${list.length === 0
                    ? '<div class="text-center text-secondary py-5"><i class="bi bi-check2-circle me-2"></i>Nincs aktív riasztás.</div>'
                    : list.map(renderAlertRow).join('')}</div>`,
                noBodyPadding: true
            })}
        `;
    },

    /* ---------- Super admin ---------- */
    superAdmin: () => {
        const s = state.adminsList;
        const fmt = (iso) => {
            if (!iso) return '—';
            try { return new Date(iso).toLocaleString('hu-HU'); } catch (_) { return String(iso); }
        };
        const rows = (s.list || []).map((a) => [
            h.user({ name: a.username || `#${a.id}`, email: a.email || '' }),
            a.isSuperAdmin
                ? `<span class="super-pill"><i class="bi bi-stars"></i>Super admin</span>`
                : rolePill('admin'),
            `<span class="text-secondary">${fmt(a.createdAt)}</span>`,
            `<span class="text-secondary">${fmt(a.lastActive)}</span>`,
            `<div class="d-inline-flex gap-2">
                ${a.isSuperAdmin
                    ? h.btn({ label: 'Super lock', icon: 'bi-lock-fill', variant: 'outline-secondary', size: 'sm', attrs: 'disabled' })
                    : h.btn({
                        label: 'Revoke', icon: 'bi-shield-fill-x', variant: 'outline-danger', size: 'sm',
                        onclick: `openCriticalAction('admin.revoke', '${escapeHtml(a.username || '#' + a.id).replace(/'/g, "\\'")}', ${Number(a.id) || 'null'})`
                    })}
            </div>`
        ]);
        return `
            ${h.header({
                icon: 'bi-stars', title: 'Super admin',
                subtitle: s.loaded ? `${s.list.length} admin felhasznalo` : 'Admin szerepkörök kiosztása és visszavonása',
                actions: [
                    { label: 'Admin grant', icon: 'bi-plus-lg', variant: 'gold', onclick: "openAdminGrantPicker()" }
                ]
            })}
            <div class="alert alert-warning bg-warning bg-opacity-10 border-warning d-flex align-items-start gap-2">
                <i class="bi bi-info-circle-fill text-warning mt-1"></i>
                <div class="flex-grow-1">
                    <strong>Last-super-admin lock</strong> aktív — egy super-admin saját
                    <code>is_super_admin</code> flag-jét nem tudja levenni, ha ő az utolsó.
                    Minden admin grant/revoke <strong>kritikus művelet</strong>: 30 char indok + jelszó megerősítés.
                </div>
            </div>
            ${s.error ? `<div class="alert alert-danger">${escapeHtml(s.error)}</div>` : ''}
            ${s.loading
                ? `<div class="content-card text-center py-5"><i class="bi bi-arrow-repeat spin"></i> Toltes...</div>`
                : (rows.length === 0 && s.loaded
                    ? `<div class="content-card text-center py-5 text-secondary">Nincs admin felhasznalo.</div>`
                    : h.table({
                        title: 'Admin felhasználók', icon: 'bi-shield-fill',
                        headers: ['Admin', 'Szint', 'Csatlakozott', 'Utoljára aktív', 'Műveletek'],
                        rows
                    }))
            }
        `;
    },

    /* ---------- Közösségi ---------- */
    friends: () => {
        const s = state.socialAdmin;
        const c = s.counts || {};
        const fmtRel = (iso) => {
            if (!iso) return '—';
            try { return formatRelative(iso); } catch (_) { return String(iso); }
        };
        const requestRows = (s.requests || []).map((r) => `
            <tr>
                <td><span class="text-white">${escapeHtml(r.from?.username || '—')}</span></td>
                <td><span class="text-white">${escapeHtml(r.to?.username || '—')}</span></td>
                <td><span class="text-secondary">${fmtRel(r.inviteTime)}</span></td>
                <td class="text-end"><span class="badge bg-secondary">${escapeHtml(r.status)}</span></td>
            </tr>
        `).join('');
        const blockRows = (s.blocks || []).map((b) => `
            <tr>
                <td><span class="text-white">${escapeHtml(b.blocker?.username || '—')}</span></td>
                <td><span class="text-white">${escapeHtml(b.blocked?.username || '—')}</span></td>
                <td class="text-end">
                    <button type="button" class="btn btn-sm btn-outline-success"
                            onclick="confirmAdminUnblock(${Number(b.blocker?.id) || 0}, ${Number(b.blocked?.id) || 0}, '${escapeHtml(b.blocker?.username || '')}', '${escapeHtml(b.blocked?.username || '')}')">
                        <i class="bi bi-unlock"></i> Felold
                    </button>
                </td>
            </tr>
        `).join('');
        return `
            ${h.header({
                icon: 'bi-people', title: 'Közösségi kapcsolatok',
                subtitle: 'Barátkérelmek, kapcsolatok és blokkolások egy helyen'
            })}
            ${h.stats([
                { icon: 'bi-diagram-3-fill', value: c.totalFriendships || 0, label: 'Összes barátság', color: 'primary' },
                { icon: 'bi-person-plus',    value: c.pendingRequests  || 0, label: 'Függő kérelem',   color: 'warning' },
                { icon: 'bi-person-x-fill',  value: c.activeBlocks     || 0, label: 'Aktív blokkolás', color: 'danger' }
            ])}
            ${s.error ? `<div class="alert alert-danger">${escapeHtml(s.error)}</div>` : ''}
            <div class="row g-4">
                <div class="col-lg-7">
                    ${h.card({
                        title: 'Függő barátkérelmek', icon: 'bi-person-plus-fill', noBodyPadding: true,
                        body: requestRows.length
                            ? `<table class="table mb-0"><thead><tr><th>Küldő</th><th>Címzett</th><th>Küldve</th><th class="text-end">Allapot</th></tr></thead><tbody>${requestRows}</tbody></table>`
                            : `<div class="text-center text-secondary py-4">${s.requestsLoaded ? 'Nincs fuggo kerelem.' : 'Toltes...'}</div>`
                    })}
                </div>
                <div class="col-lg-5">
                    ${h.card({
                        title: 'Aktív blokkolások', icon: 'bi-person-x-fill', noBodyPadding: true,
                        body: blockRows.length
                            ? `<table class="table mb-0"><thead><tr><th>Blokkoló</th><th>Blokkolt</th><th class="text-end"></th></tr></thead><tbody>${blockRows}</tbody></table>`
                            : `<div class="text-center text-secondary py-4">${s.blocksLoaded ? 'Nincs aktiv blokk.' : 'Toltes...'}</div>`
                    })}
                </div>
            </div>
        `;
    },

    /* ---------- Tesztek ---------- */
    tests: () => {
        const t = state.testsAdmin;
        const latest = t.latest;
        const running = t.running;
        const fmt = (iso) => {
            if (!iso) return '—';
            try { return new Date(iso).toLocaleString('hu-HU'); } catch (_) { return String(iso); }
        };
        const fmtDur = (ms) => {
            if (!Number.isFinite(ms)) return '—';
            if (ms < 1000) return `${ms} ms`;
            const sec = ms / 1000;
            if (sec < 60) return `${sec.toFixed(1)} s`;
            return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
        };
        const isSuper = Boolean(state.isSuperAdmin);
        const runDisabled = running ? 'disabled' : (!isSuper ? 'disabled title="Csak super-admin futtathat tesztet."' : '');

        // A Jest tenyleges futasi ideje (rawSummary.jestRunMs) tisztabb metrika,
        // mint a teljes spawn idotartam (durationMs = npx + jest setup + tesztek + exit).
        // Ha van jestRunMs, azt mutatjuk; subtitle-ben a teljes spawn idot.
        const jestRunMs = latest?.rawSummary?.jestRunMs;
        const displayDurationMs = Number.isFinite(jestRunMs) ? jestRunMs : (latest?.durationMs ?? null);
        const durationSubtitle = (latest && Number.isFinite(jestRunMs) && Number.isFinite(latest.durationMs) && latest.durationMs > jestRunMs + 200)
            ? `+ ${fmtDur(latest.durationMs - jestRunMs)} startup`
            : '';

        const statsRow = h.stats([
            { icon: 'bi-check-circle-fill', value: latest ? latest.passed  : '—', label: 'Sikeres', color: 'success' },
            { icon: 'bi-x-circle-fill',     value: latest ? latest.failed  : '—', label: 'Sikertelen', color: 'danger' },
            { icon: 'bi-skip-forward-fill', value: latest ? latest.skipped : '—', label: 'Kihagyott', color: 'warning' },
            { icon: 'bi-stopwatch',         value: latest ? fmtDur(displayDurationMs) : '—', label: durationSubtitle ? `Jest idő (${durationSubtitle})` : 'Jest idő', color: 'primary' }
        ]);

        const historyRows = (t.history || []).map((r) => `
            <tr>
                <td><span class="font-monospace text-gold">#${r.id}</span></td>
                <td>${escapeHtml(r.triggeredByUsername || (r.triggeredBy ? '#' + r.triggeredBy : 'rendszer'))}</td>
                <td><span class="badge bg-${r.status === 'passed' ? 'success' : (r.status === 'failed' ? 'danger' : (r.status === 'running' ? 'info' : 'secondary'))}">${escapeHtml(r.status)}</span></td>
                <td><span class="font-monospace">${r.passed}/${r.total}</span></td>
                <td><span class="font-monospace">${r.failed}</span></td>
                <td><span class="text-secondary">${fmtDur(r.durationMs)}</span></td>
                <td><span class="text-secondary small">${fmt(r.startedAt)}</span></td>
            </tr>
        `).join('');

        return `
            ${h.header({
                icon: 'bi-clipboard2-check', title: 'Tesztek',
                subtitle: latest
                    ? `Utolso futas: ${fmt(latest.startedAt)} — ${escapeHtml(latest.status)}`
                    : 'Backend Jest + Supertest tesztek',
                actions: [
                    { label: running ? 'Fut...' : 'Tesztek futtatasa', icon: running ? 'bi-arrow-repeat' : 'bi-play-fill', variant: 'gold', size: 'sm', onclick: 'confirmRunTests()', attrs: runDisabled }
                ]
            })}

            ${running ? `
                <div class="alert alert-info bg-info bg-opacity-10 border-info d-flex align-items-center gap-2 mb-3">
                    <i class="bi bi-arrow-repeat spin"></i>
                    <div class="flex-grow-1">
                        <strong>Fut: run #${running.runId}</strong> — eltelt: ${fmtDur(running.elapsedMs || 0)}
                    </div>
                </div>
            ` : ''}
            ${t.error ? `<div class="alert alert-danger">${escapeHtml(t.error)}</div>` : ''}

            ${statsRow}

            <div class="row g-4">
                <div class="col-lg-7">
                    ${h.card({
                        title: 'Test suite-ok',
                        icon: 'bi-list-check',
                        headerExtra: latest ? `<span class="badge bg-warning text-dark" id="testsAutoClearPillSuites" data-tests-autoclear><i class="bi bi-clock-history me-1"></i>auto-clear: <span data-tests-autoclear-seconds>—</span>s</span>` : '',
                        noBodyPadding: true,
                        body: latest && latest.rawSummary && Array.isArray(latest.rawSummary.testResults)
                            ? `<div class="test-list">${latest.rawSummary.testResults.map((tr) => {
                                const failing = Number(tr.numFailingTests) || 0;
                                const passing = Number(tr.numPassingTests) || 0;
                                const pending = Number(tr.numPendingTests) || 0;
                                const total = passing + failing + pending;
                                const status = failing > 0 ? 'fail' : 'pass';
                                const label = failing > 0 ? 'FAIL' : 'PASS';
                                const fileName = String(tr.name || '').split(/[\\/]/).pop();
                                const durTxt = Number.isFinite(tr.durationMs) ? fmtDur(tr.durationMs) : '';
                                return `<div class="test-row test-${status}">
                                    <div class="test-status-dot"></div>
                                    <span class="test-suite">${escapeHtml(fileName)}</span>
                                    <span class="test-name">${passing}/${total}${pending > 0 ? ` (${pending} skipped)` : ''}</span>
                                    ${durTxt ? `<span class="test-duration text-secondary small me-2">${durTxt}</span>` : ''}
                                    <span class="test-status-label">${label}</span>
                                </div>`;
                            }).join('')}</div>`
                            : `<div class="text-center text-secondary py-4">${t.latestLoaded ? 'A reszletek csak a session alatt es csak a futtatas utan 1 percig lathatok. Kattints a "Tesztek futtatasa" gombra a friss eredmenyhez.' : 'Toltes...'}</div>`
                    })}
                </div>
                <div class="col-lg-5">
                    ${h.card({
                        title: 'Stderr (utolso 4KB)', icon: 'bi-terminal-fill',
                        headerExtra: latest ? `<span class="badge bg-warning text-dark" id="testsAutoClearPillStderr" data-tests-autoclear><i class="bi bi-clock-history me-1"></i>auto-clear: <span data-tests-autoclear-seconds>—</span>s</span>` : '',
                        body: latest && latest.stderrTail
                            ? (() => {
                                // Jest natívan "X passed, Y total" formaban irja — a felhasznalo
                                // logikailag elobb a totalt szeretne latni: "Y total, X passed".
                                const swapped = latest.stderrTail.replace(/(\d+)\s+passed,\s+(\d+)\s+total/g, '$2 total, $1 passed');
                                return `<pre class="json-block" style="max-height:280px;overflow:auto;white-space:pre-wrap;">${escapeHtml(swapped)}</pre>`;
                            })()
                            : `<pre class="json-block" style="max-height:280px;overflow:auto;">${latest ? '(Nincs stderr output)' : '(Meg nincs futas)'}</pre>`
                    })}
                </div>
            </div>

            <div class="mt-4">
                ${h.card({
                    title: 'Futtatasi elozmenyek', icon: 'bi-clock-history',
                    noBodyPadding: true,
                    body: historyRows.length
                        ? `<table class="table mb-0"><thead><tr><th>ID</th><th>Inditotta</th><th>Allapot</th><th>Pass/Total</th><th>Fail</th><th>Idotartam</th><th>Indult</th></tr></thead><tbody>${historyRows}</tbody></table>`
                        : `<div class="text-center text-secondary py-4">${t.historyLoaded ? 'Meg nincs futasi elozmeny.' : 'Toltes...'}</div>`
                })}
            </div>
        `;
    },

    /* ---------- Beállítások ---------- */
    settings: () => {
        const s = state.siteSettings;
        const d = s.data || {};
        const langs = [
            { value: 'hu', label: 'Magyar', selected: d.defaultLanguage === 'hu' },
            { value: 'en', label: 'English', selected: d.defaultLanguage === 'en' }
        ];
        const tzCurrent = d.timezone || 'Europe/Budapest';
        return `
            ${h.header({
                icon: 'bi-gear-fill', title: 'Beállítások',
                subtitle: s.loaded ? `Mentve: ${d.updatedAt ? new Date(d.updatedAt).toLocaleString('hu-HU') : '—'}` : 'Általános platform paraméterek'
            })}
            ${s.error ? `<div class="alert alert-danger">${escapeHtml(s.error)}</div>` : ''}
            ${s.loading
                ? `<div class="content-card text-center py-5"><i class="bi bi-arrow-repeat spin"></i> Toltes...</div>`
                : (!s.loaded
                    ? `<div class="content-card text-center py-5 text-secondary">Meg nincsenek betoltott beallitasok.</div>`
                    : h.card({
                        body: `
                            <form id="settingsForm" onsubmit="event.preventDefault(); submitSiteSettings();">
                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <label class="form-label" for="settingsSiteName">Oldal neve</label>
                                        <input type="text" class="form-control" id="settingsSiteName" maxlength="100" value="${escapeHtml(d.siteName || '')}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label" for="settingsSupportEmail">Support e-mail</label>
                                        <input type="email" class="form-control" id="settingsSupportEmail" maxlength="150" value="${escapeHtml(d.supportEmail || '')}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label" for="settingsLanguage">Alapertelmezett nyelv</label>
                                        <select class="form-select" id="settingsLanguage">
                                            ${langs.map((l) => `<option value="${l.value}" ${l.selected ? 'selected' : ''}>${l.label}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label" for="settingsTimezone">Idozona</label>
                                        <input type="text" class="form-control" id="settingsTimezone" maxlength="64" value="${escapeHtml(tzCurrent)}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" id="settingsRegistration" ${d.registrationEnabled ? 'checked' : ''}>
                                            <label class="form-check-label" for="settingsRegistration">Regisztracio engedelyezve</label>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" id="settingsMaintenance" ${d.maintenanceMode ? 'checked' : ''} onchange="onMaintenanceToggleChange(this.checked)">
                                            <label class="form-check-label text-warning" for="settingsMaintenance"><i class="bi bi-cone-striped me-1"></i>Karbantartasi mod</label>
                                        </div>
                                    </div>
                                </div>
                                <div class="alert alert-warning bg-warning bg-opacity-10 border-warning small mt-3 mb-3 ${d.maintenanceMode ? '' : 'd-none'}" id="settingsMaintenanceWarn">
                                    <i class="bi bi-exclamation-triangle-fill me-1"></i>
                                    <strong>Figyelem:</strong> a karbantartasi mod aktivalasa minden NEM-admin usert kizar a platformrol.
                                </div>
                                <div class="text-end">
                                    <button type="submit" class="btn btn-gold"><i class="bi bi-check2 me-1"></i>Beallitasok mentese</button>
                                </div>
                            </form>
                        `
                    }))
            }
        `;
    }
};

