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
            icon: 'bi-grid-1x2-fill', title: tx('Vezérlőpult', 'Dashboard'),
            subtitle: tx('A projekt fő mutatói egy pillantásra', 'Key project metrics at a glance')
        })}

            ${h.stats([
            {
                icon: 'bi-people-fill', value: stats.online?.totalUsers ?? 0, valueId: 'mainOnlineTotal',
                label: tx('Online felhasználó', 'Online users'), color: 'primary',
                hint: `<span id="mainOnlineHint">${stats.online?.totalAdmins ?? 0} admin · ${stats.online?.activeTabs ?? stats.online?.totalTabs ?? 0} ${tx('aktív tab', 'active tab(s)')}</span>`,
                hintClass: 'text-success', interactive: 'users', cardId: 'mainOnlineCard'
            },
            {
                icon: 'bi-trophy-fill', value: inGameValue, valueId: 'mainInGame',
                /* Konstans 'success' szin + nincs `empty` flag — a kartya
                 * vizualisan koherens a tobbi stat-card-dal akkor is, ha
                 * eppen 0 a jatszma. Csak a hint szovege valtozik. */
                label: tx('Aktív játszma', 'Active games'), color: 'success',
                hint: inGameEmpty
                    ? `<span class="text-secondary"><i class="bi bi-pause-circle me-1"></i>${tx('Nincs élő játszma — kattints a játszmák listájához', 'No live game — click for games list')}</span>`
                    : `<span class="live-indicator text-success"><span class="live-dot"></span>${tx('Élőben most', 'Live now')}</span>`,
                hintClass: inGameEmpty ? 'text-secondary' : 'text-success',
                interactive: 'games',
                cardId: 'mainInGameCard',
                emblem: 'chess'
            },
            {
                icon: 'bi-journal-check', value: last24.auditEntries ?? 0, valueId: 'mainAuditCount',
                label: tx('24h audit bejegyzés', '24h audit entries'), color: 'warning',
                hint: `<span id="mainAuditCriticalHint">${last24.criticalAuditEntries ?? 0} ${tx('kritikus művelet', 'critical action(s)')}</span>`,
                hintClass: 'text-warning', interactive: 'auditLog', cardId: 'mainAuditCard'
            },
            {
                icon: 'bi-exclamation-octagon-fill', value: last24.alerts ?? 0, valueId: 'mainAlertCount',
                label: tx('24h riasztás', '24h alerts'), color: 'danger',
                hint: `<span id="mainNewBansHint">${last24.newBans ?? 0} ${tx('új tiltás', 'new ban(s)')}</span>`,
                hintClass: 'text-danger', interactive: 'alerts', cardId: 'mainAlertCard'
            }
        ])}

            <div class="tick-band mb-4" id="tickBand" data-ws-status="${wsStatus.key}">
                <div class="tick-band-header">
                    <span class="live-indicator ${state.adminSocketConnected ? 'text-success' : 'text-muted'}" id="tickBandIndicator">
                        <span class="live-dot"></span>${tx('Élő tick', 'Live tick')}
                    </span>
                    <span class="tick-band-time">${tx('Frissítve', 'Updated')}: <span id="tickBandTime">${state.liveStatsAt ? formatRelative(state.liveStatsAt) : '—'}</span></span>
                </div>
                <div class="tick-band-body">
                    ${h.tickChip({ icon: 'bi-wifi', label: tx('Online', 'Online'), valueId: 'tickOnline', value: stats.online?.totalUsers ?? 0, color: 'success', nav: 'users', hint: tx('Online felhasználók — ugrás a felhasználói listára', 'Online users — go to user list') })}
                    ${h.tickChip({ icon: 'bi-window-stack', label: tx('Aktív tabok', 'Active tabs'), valueId: 'tickActiveTabs', value: stats.online?.activeTabs ?? stats.online?.totalTabs ?? 0, color: 'primary', nav: 'users', hint: tx('Nyitva tartott böngészőfülek — felhasználói lista', 'Open browser tabs — user list') })}
                    ${h.tickChip({ icon: 'bi-shield-fill', label: tx('Adminok', 'Admins'), valueId: 'tickAdmins', value: stats.online?.totalAdmins ?? 0, color: 'gold', nav: 'superAdmin', hint: tx('Online admin felhasználók — super admin nézet', 'Online admin users — super admin view') })}
                    ${h.tickChip({ icon: 'bi-trophy-fill', label: tx('Játékban', 'In game'), valueId: 'tickInGame', value: stats.online?.inGame ?? 0, color: inGameEmpty ? 'secondary' : 'success', nav: 'games', hint: tx('Folyamatban lévő játszmák', 'Ongoing games') })}
                    ${h.tickChip({ icon: 'bi-search', label: tx('Matchmakingben', 'Matchmaking'), valueId: 'tickMatchmaking', value: stats.online?.inMatchmaking ?? 0, color: 'primary', nav: 'games', hint: tx('Matchmakingben várakozó játékosok', 'Players waiting in matchmaking') })}
                    ${h.tickChip({ icon: 'bi-image', label: tx('Pending kép', 'Pending image'), valueId: 'tickPendingImages', value: stats.pending?.profileImages ?? 0, color: 'warning', nav: 'profileImageReview', hint: tx('Jóváhagyásra váró profilképek', 'Profile images awaiting approval') })}
                    ${h.tickChip({ icon: 'bi-person-plus', label: tx('Pending barát', 'Pending friends'), valueId: 'tickPendingFriends', value: stats.pending?.friendRequests ?? 0, color: 'primary', nav: 'friends', hint: tx('Függőben lévő barátkérelmek', 'Pending friend requests') })}
                    ${h.tickChip({ icon: 'bi-speedometer2', label: tx('Aktív rate esc.', 'Active rate esc.'), valueId: 'tickRateEsc', value: stats.rateLimit?.activeEscalations ?? 0, color: 'secondary', nav: 'alerts', hint: tx('Rate limit szigorítások — riasztások', 'Rate limit escalations — alerts') })}
                </div>
            </div>

            <div class="row g-4">
                <div class="col-xl-7">
                    <div class="content-card h-100 dashboard-equal-card activity-chart-card">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="bi bi-activity me-2 text-gold"></i>${tx('Aktivitás — utolsó 24 óra', 'Activity — last 24 hours')}
                                <span class="card-subtle-hint d-block">${tx('Óránkénti bontás · login, regisztráció, új játszma, audit, riasztás', 'Hourly breakdown · login, registration, new game, audit, alert')}</span>
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
                                ${chartStatus.totals ? renderChartTotals(chartStatus.totals) : `<span class="text-secondary small">${tx('A 24h összegzések a chart betöltése után jelennek meg.', '24h totals appear after the chart loads.')}</span>`}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-xl-5">
                    <div class="content-card h-100 live-feed-card dashboard-equal-card">
                        <div class="card-header">
                            <h5 class="card-title">
                                <i class="bi bi-broadcast me-2 text-gold"></i>${tx('Élő admin tevékenység', 'Live admin activity')}
                                <span class="card-subtle-hint d-block">${tx('Élő WS események — utolsó 25 db', 'Live WS events — last 25')}</span>
                            </h5>
                            <span class="ws-feed-badge ws-feed-${wsStatus.key}" id="wsStatusBadge" title="${wsStatus.label}">
                                <span class="ws-pill-dot ${wsStatus.dotClass}" aria-hidden="true"></span>
                                <span id="wsStatusBadgeLabel">${wsStatus.short}</span>
                            </span>
                        </div>
                        <div class="card-body p-0">
                            <div class="live-feed-meta">
                                <span class="live-feed-meta-count" id="liveFeedCount"><i class="bi bi-list-ul me-1"></i>${feedHasContent ? (auditItems.length + alertItems.length) : 0} ${tx('esemény', 'event(s)')}</span>
                                <span class="live-feed-meta-time" id="liveFeedLastTime">
                                    ${feedHasContent
                ? `${tx('Utolsó', 'Last')}: ${formatRelative(latestEventTime(auditItems, alertItems))}`
                : (feedReason === 'live' || feedReason === 'empty' ? tx('Még nincs esemény', 'No events yet') : feedEmptyMessage(feedReason).title)}
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
                { id: 'mini24Logins', icon: 'bi-box-arrow-in-right', label: tx('24h bejelentkezés', '24h logins'), value: last24.logins ?? 0, color: 'primary', nav: 'security' },
                { id: 'mini24Registrations', icon: 'bi-person-plus-fill', label: tx('24h regisztráció', '24h registrations'), value: last24.registrations ?? 0, color: 'success', nav: 'users' },
                { id: 'mini24Audit', icon: 'bi-journal-text', label: tx('24h audit', '24h audit'), value: last24.auditEntries ?? 0, color: 'warning', nav: 'auditLog' },
                { id: 'mini24Critical', icon: 'bi-exclamation-octagon', label: tx('24h kritikus', '24h critical'), value: last24.criticalAuditEntries ?? 0, color: 'danger', nav: 'auditLog' },
                { id: 'mini24Alerts', icon: 'bi-shield-fill-x', label: tx('24h riasztás', '24h alerts'), value: last24.alerts ?? 0, color: 'warning', nav: 'alerts' },
                { id: 'mini24Bans', icon: 'bi-ban', label: tx('24h új tiltás', '24h new bans'), value: last24.newBans ?? 0, color: 'danger', nav: 'userBan' }
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
            icon: 'bi-people-fill', title: tx('Felhasználói lista', 'User list'),
            subtitle: tx('Élő lista — szűrés, keresés és gyors műveletek', 'Live list — filter, search and quick actions')
        })}

        <div class="content-card admin-users-card">
            <div class="card-header admin-users-card-header">
                <div class="admin-users-card-headline">
                    <h5 class="card-title mb-0">
                        <i class="bi bi-people-fill me-2 text-gold"></i>${tx('Felhasználók', 'Users')}
                        <span class="admin-users-meta" id="adminUsersMeta">
                            <span class="admin-users-meta-count" id="adminUsersCount">0</span>
                            <span class="admin-users-meta-sep">·</span>
                            <span class="admin-users-meta-time" id="adminUsersUpdatedAt">${tx('betöltés…', 'loading…')}</span>
                        </span>
                    </h5>
                    <div class="admin-users-card-actions">
                        ${h.btn({
            label: tx('Új felhasználó', 'New user'), icon: 'bi-plus-lg', variant: 'gold', size: 'sm',
            attrs: 'data-bs-toggle="modal" data-bs-target="#addUserModal"'
        })}
                    </div>
                </div>
                <div class="admin-users-filter-bar">
                    <div class="admin-users-search">
                        <i class="bi bi-search"></i>
                        <label for="adminUserSearchInput" class="visually-hidden">${tx('Felhasználó keresése', 'Search user')}</label>
                        <input id="adminUserSearchInput" name="adminUserSearchInput" type="search"
                            class="form-control form-control-sm" placeholder="${tx('Keresés név vagy e-mail alapján…', 'Search by name or e-mail…')}"
                            value="${escapeHtml(f.search)}" autocomplete="off"
                            oninput="onAdminUsersFilterInput(event)">
                        <button type="button" class="admin-users-search-clear ${f.search ? '' : 'd-none'}"
                            id="adminUsersSearchClear" onclick="clearAdminUsersSearch()" aria-label="${tx('Keresés törlése', 'Clear search')}">
                            <i class="bi bi-x-circle-fill"></i>
                        </button>
                    </div>
                    <select id="adminRoleFilter" name="adminRoleFilter" class="form-select form-select-sm"
                        onchange="onAdminUsersFilterChange()">
                        <option value="" ${f.role === '' ? 'selected' : ''}>${tx('Minden szerepkör', 'All roles')}</option>
                        <option value="player" ${f.role === 'player' ? 'selected' : ''}>${tx('Játékos', 'Player')}</option>
                        <option value="admin"  ${f.role === 'admin' ? 'selected' : ''}>${tx('Admin', 'Admin')}</option>
                    </select>
                    <select id="adminStatusFilter" name="adminStatusFilter" class="form-select form-select-sm"
                        onchange="onAdminUsersFilterChange()">
                        <option value=""        ${f.status === '' ? 'selected' : ''}>${tx('Minden állapot', 'All states')}</option>
                        <option value="online"  ${f.status === 'online' ? 'selected' : ''}>● ${tx('Online', 'Online')}</option>
                        <option value="offline" ${f.status === 'offline' ? 'selected' : ''}>○ ${tx('Offline', 'Offline')}</option>
                        <option value="active"  ${f.status === 'active' ? 'selected' : ''}>${tx('Nem tiltott', 'Not banned')}</option>
                        <option value="banned"  ${f.status === 'banned' ? 'selected' : ''}>${tx('Tiltott', 'Banned')}</option>
                    </select>
                    <select id="adminOrderBy" name="adminOrderBy" class="form-select form-select-sm"
                        onchange="onAdminUsersFilterChange()">
                        <option value="lastActive" ${f.orderBy === 'lastActive' ? 'selected' : ''}>${tx('Utolsó aktivitás', 'Last activity')}</option>
                        <option value="username"   ${f.orderBy === 'username' ? 'selected' : ''}>${tx('Név (A–Z)', 'Name (A–Z)')}</option>
                        <option value="elo"        ${f.orderBy === 'elo' ? 'selected' : ''}>${tx('ELO (csökkenő)', 'ELO (descending)')}</option>
                        <option value="createdAt"  ${f.orderBy === 'createdAt' ? 'selected' : ''}>${tx('Csatlakozás (legújabb)', 'Joined (newest)')}</option>
                    </select>
                    ${h.btn({
            label: '', icon: 'bi-arrow-clockwise', variant: 'outline-light', size: 'sm',
            attrs: `id="adminUsersRefreshBtn" title="${tx('Lista frissítése', 'Refresh list')}" aria-label="${tx('Felhasználói lista frissítése', 'Refresh user list')}"`,
            onclick: 'refreshAdminUsersList()'
        })}
                </div>
            </div>
            <div class="admin-users-table-wrap" id="adminUsersTableWrap">
                <table class="table admin-users-table" id="adminUsersTable">
                    <thead>
                        <tr>
                            <th class="col-user">${tx('Felhasználó', 'User')}</th>
                            <th class="col-elo">ELO (${tx('K', 'C')} / MM / B)</th>
                            <th class="col-role">${tx('Szerepkör', 'Role')}</th>
                            <th class="col-status">${tx('Állapot', 'Status')}</th>
                            <th class="col-active">${tx('Utolsó aktivitás', 'Last activity')}</th>
                            <th class="col-joined">${tx('Csatlakozott', 'Joined')}</th>
                            <th class="col-actions text-end">${tx('Műveletek', 'Actions')}</th>
                        </tr>
                    </thead>
                    <tbody id="adminUsersTbody" aria-live="polite">
                        <tr class="admin-users-empty-row">
                            <td colspan="7" class="text-center text-secondary py-4">${tx('Felhasználói lista betöltése…', 'Loading user list…')}</td>
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
            ? tx('A saját profilodnál a feltöltés backend oldalon is működik.', 'For your own profile, the upload also takes effect server-side.')
            : tx('Admin feltöltésnél a kép státusza azonnal jóváhagyottként jelenik meg a felületen.', 'Admin uploads appear as approved immediately in the UI.');
        return `
        ${h.header({
            icon: 'bi-person-vcard', title: tx('Részletek és szerkesztés', 'Details and edit'),
            subtitle: hasUser ? tx(`${username} — kiválasztott profil`, `${username} — selected profile`) : tx('Egy kiválasztott profil teljes munkaablakja', 'Full workspace for the selected profile'),
            actions: [
                hasUser
                    ? { label: '', icon: 'bi-eye', variant: 'outline-light', size: 'sm', attrs: `title="${tx('Profil megtekintése', 'View profile')}" aria-label="${tx('Profil megtekintése', 'View profile')}"`, onclick: 'openSelectedUserProfileView()' }
                    : null,
                hasUser && !isCurrentUser
                    ? { label: tx('Üzenet', 'Message'), icon: 'bi-chat-dots', variant: 'outline-info', size: 'sm', attrs: `title="${tx('Üzenet küldése (Issue #53)', 'Send message (Issue #53)')}"`, onclick: 'openAdminQuickChatModal()' }
                    : null,
                { label: tx('Vissza a listához', 'Back to list'), icon: 'bi-arrow-left', size: 'sm', onclick: "showSection('users')" }
            ].filter(Boolean)
        })}

        ${hasUser ? '' : `
            <div class="content-card admin-empty-pick mb-4">
                <div class="card-body text-center py-5">
                    <i class="bi bi-person-bounding-box admin-empty-pick-icon"></i>
                    <h5 class="text-white mt-3">${tx('Nincs kiválasztott felhasználó', 'No user selected')}</h5>
                    <p class="text-secondary mb-3">${tx('A szerkesztéshez válassz egy felhasználót a listából.', 'Select a user from the list to edit.')}</p>
                    ${h.btn({ label: tx('Felhasználói lista', 'User list'), icon: 'bi-list-ul', variant: 'gold', onclick: "showSection('users')" })}
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
                        <div class="admin-user-detail-elo-box"><div class="admin-user-detail-elo-value">${eloClassic}</div><small>${tx('Klasszikus', 'Classic')}</small></div>
                        <div class="admin-user-detail-elo-box is-primary"><div class="admin-user-detail-elo-value">${eloMM}</div><small>MattMester</small></div>
                        <div class="admin-user-detail-elo-box"><div class="admin-user-detail-elo-value">${eloBullet}</div><small>Bullet</small></div>
                    </div>
                    <div class="admin-user-detail-banner-stats">
                        <div class="admin-user-detail-stat-pill"><span class="text-success fw-bold">${wins}</span><small>${tx('Győzelem', 'Win')}</small></div>
                        <div class="admin-user-detail-stat-pill"><span class="text-danger fw-bold">${losses}</span><small>${tx('Vereség', 'Loss')}</small></div>
                        <div class="admin-user-detail-stat-pill"><span class="text-warning fw-bold">${draws}</span><small>${tx('Döntetlen', 'Draw')}</small></div>
                        <div class="admin-user-detail-stat-pill is-rate">
                            <span class="text-gold fw-bold">${winRate.toFixed(1)}%</span><small>${tx('Győzelmi arány', 'Win rate')}</small>
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
                                <h5 class="card-title"><i class="bi bi-image me-2 text-gold"></i>${tx('Profilkép', 'Profile image')}</h5>
                            </div>
                            <div class="card-body text-center">
                                <img id="userDetailProfileImageLarge"
                                    class="admin-user-detail-large-avatar mb-3" alt="Profil"
                                    data-fallback="true"
                                    data-username="${escapeHtml(u.username || '')}"
                                    data-profile-image="${escapeHtml(u.profileImage || '')}">
                                <div class="admin-user-detail-image-tools">
                                    <div class="d-flex flex-wrap justify-content-center gap-2">
                                        <label for="adminUserDetailImageUpload" class="btn btn-gold btn-sm mb-0" title="${tx('Profilkép feltöltése (azonnal jóváhagyott)', 'Upload profile image (auto-approved)')}">
                                            <i class="bi bi-cloud-upload me-1"></i>${tx('Új kép', 'New image')}
                                        </label>
                                        <input id="adminUserDetailImageUpload" type="file" class="d-none" accept="image/jpeg,image/png,image/webp"
                                            onchange="handleAdminUserDetailImageInputChange(event)">
                                        <button type="button" class="btn btn-outline-danger btn-sm" onclick="handleAdminUserDetailImageRemove()">
                                            <i class="bi bi-trash3 me-1"></i>${tx('Eltávolítás', 'Remove')}
                                        </button>
                                    </div>
                                    <div class="text-secondary mt-2 small">${escapeHtml(uploadHint)}</div>
                                    <div class="admin-user-detail-image-status mt-2">
                                        <span class="text-secondary small">${tx('Profilkép státusz', 'Profile image status')}:</span>
                                        ${imageBadge || `<span class="badge bg-dark border border-secondary">${escapeHtml(String(u.profileImageStatus || 'default'))}</span>`}
                                    </div>
                                    <div id="adminUserDetailImageMessage" class="alert d-none mt-2 mb-0 py-2 px-3"></div>
                                </div>
                            </div>
                        </div>

                        <!-- Identitás kártya -->
                        <div class="content-card">
                            <div class="card-header">
                                <h5 class="card-title"><i class="bi bi-person-badge me-2 text-gold"></i>${tx('Identitás', 'Identity')}</h5>
                            </div>
                            <div class="card-body">
                                <div class="row g-3">
                                    <div class="col-12">
                                        <label for="editUsername" class="form-label">${tx('Felhasználónév', 'Username')}</label>
                                        <input id="editUsername" name="editUsername" type="text" class="form-control" value="${escapeHtml(u.username || '')}" autocomplete="off">
                                        <div id="editUsernameFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-12">
                                        <label for="editEmail" class="form-label">${tx('E-mail', 'E-mail')}</label>
                                        <input id="editEmail" name="editEmail" type="email" class="form-control" value="${escapeHtml(u.email || '')}" autocomplete="off">
                                        <div id="editEmailFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-12 col-sm-6">
                                        <label for="editRole" class="form-label">${tx('Szerepkör', 'Role')}</label>
                                        <select id="editRole" name="editRole" class="form-select">
                                            ${getAdminRoleOptions(u).map((opt) => `<option value="${escapeHtml(opt.value)}" ${opt.selected ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}
                                        </select>
                                        <div id="editRoleFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-12 col-sm-6 d-flex align-items-end">
                                        <div class="admin-user-detail-switch-card w-100">
                                            <div class="me-2">
                                                <div class="fw-semibold text-white small">${tx('Email megerősítettség', 'Email verification')}</div>
                                                <small class="text-secondary" id="editEmailVerifiedFeedback">${tx('Közvetlenül átállítható.', 'Can be toggled directly.')}</small>
                                            </div>
                                            <div class="form-check form-switch m-0 ms-auto">
                                                <input class="form-check-input" type="checkbox" role="switch" id="editEmailVerified" ${u.emailVerified ? 'checked' : ''}>
                                                <label class="form-check-label text-light visually-hidden" for="editEmailVerified">${tx('Megerősített', 'Verified')}</label>
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
                                <h5 class="card-title"><i class="bi bi-trophy me-2 text-gold"></i>${tx('ELO pontok', 'ELO points')}</h5>
                            </div>
                            <div class="card-body">
                                <div class="row g-3">
                                    <div class="col-12 col-md-4">
                                        <label for="editEloClassic" class="form-label">${tx('Klasszikus', 'Classic')}</label>
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
                                <h5 class="card-title mb-0"><i class="bi bi-graph-up-arrow me-2 text-gold"></i>${tx('Mérkőzés statisztika', 'Match statistics')}</h5>
                                <span class="badge bg-dark border border-secondary fw-normal">${tx('Győzelmi arány', 'Win rate')}: ${winRate.toFixed(1)}%</span>
                            </div>
                            <div class="card-body">
                                <div class="row g-3">
                                    <div class="col-6 col-md-3">
                                        <label for="editWins" class="form-label">${tx('Győzelmek', 'Wins')}</label>
                                        <input id="editWins" type="number" min="0" class="form-control" value="${escapeHtml(String(wins))}">
                                        <div id="editWinsFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-6 col-md-3">
                                        <label for="editLosses" class="form-label">${tx('Vereségek', 'Losses')}</label>
                                        <input id="editLosses" type="number" min="0" class="form-control" value="${escapeHtml(String(losses))}">
                                        <div id="editLossesFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-6 col-md-3">
                                        <label for="editDraws" class="form-label">${tx('Döntetlenek', 'Draws')}</label>
                                        <input id="editDraws" type="number" min="0" class="form-control" value="${escapeHtml(String(draws))}">
                                        <div id="editDrawsFeedback" class="form-text text-secondary"></div>
                                    </div>
                                    <div class="col-6 col-md-3">
                                        <label for="editAbilitiesUsed" class="form-label">${tx('Képességek', 'Abilities')}</label>
                                        <input id="editAbilitiesUsed" type="number" min="0" class="form-control" value="${escapeHtml(String(abilitiesUsed))}">
                                        <div id="editAbilitiesUsedFeedback" class="form-text text-secondary"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Metaadatok kártya -->
                        <div class="content-card">
                            <div class="card-header">
                                <h5 class="card-title"><i class="bi bi-info-circle me-2 text-gold"></i>${tx('Metaadatok', 'Metadata')}</h5>
                            </div>
                            <div class="card-body">
                                <div class="row g-3">
                                    ${h.kv(tx('Email állapot', 'Email state'), `${Boolean(u.emailVerified) ? tx('Megerősített', 'Verified') : tx('Nem megerősített', 'Not verified')}`)}
                                    ${h.kv(tx('Email megerősítve', 'Email verified'), u.emailVerifiedAt ? formatDateOnly(u.emailVerifiedAt) : '—')}
                                    ${h.kv(tx('Profilkép állapot', 'Profile image status'), String(u.profileImageStatus || 'default'))}
                                    ${h.kv(tx('Utolsó aktivitás', 'Last activity'), u.lastActive ? formatRelative(u.lastActive) : '—')}
                                    ${h.kv(tx('Utolsó IP', 'Last IP'), u.lastIp || '—')}
                                    ${h.kv(tx('Csatlakozott', 'Joined'), formatDateOnly(u.createdAt))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3) Változtatási csomag — full width -->
                <div class="content-card user-detail-save-pack admin-user-detail-save-card mt-4">
                    <div class="card-header">
                        <h5 class="card-title"><i class="bi bi-box-arrow-down-right me-2 text-gold"></i>${tx('Változtatási csomag', 'Change package')}</h5>
                    </div>
                    <div class="card-body">
                        <div class="row g-3 align-items-stretch">
                            <div class="col-12 col-lg-7">
                                <label for="editReason" class="form-label">${tx('Módosítás indoka', 'Reason for change')}</label>
                                <textarea id="editReason" class="form-control" rows="3" placeholder="${tx('Miért változtatod ezeket az adatokat? (audit log)', 'Why are you changing these values? (audit log)')}"></textarea>
                                <div id="editReasonFeedback" class="form-text text-secondary">${tx('Legalább 10 karakter szükséges.', 'At least 10 characters required.')}</div>
                            </div>
                            <div class="col-12 col-lg-5 d-flex flex-column">
                                <div class="admin-user-detail-changes-summary mb-2 flex-grow-1">
                                    <div class="text-secondary small mb-1"><i class="bi bi-list-check me-1"></i>${tx('Változások', 'Changes')}</div>
                                    <ul id="adminUserDetailChangesList" class="admin-user-detail-changes-list">
                                        <li class="text-secondary small">${tx('Még nincs változás.', 'No changes yet.')}</li>
                                    </ul>
                                </div>
                                <button type="submit" id="adminUserDetailSaveBtn" class="btn btn-gold btn-lg" disabled>
                                    <i class="bi bi-check2-circle me-1"></i>${tx('Mentés', 'Save')}
                                </button>
                                <small class="text-secondary text-center mt-1">${tx('Egy csomag · egy audit bejegyzés.', 'One package · one audit entry.')}</small>
                            </div>
                            <div class="col-12">
                                <div id="adminSavePackMessage" class="alert alert-dark border-secondary mb-0 py-2 px-3 small" role="alert">
                                    ${tx('Nincs változás. Módosíts legalább egy mezőt a mentéshez.', 'No changes. Modify at least one field to save.')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </form>

            <!-- 4) Veszélyes műveletek -->
            <div class="content-card mt-4 danger-zone">
                    <div class="card-header">
                        <h5 class="card-title text-danger"><i class="bi bi-exclamation-octagon-fill me-2"></i>${tx('Veszélyes műveletek', 'Dangerous actions')}</h5>
                    </div>
                    <div class="card-body">
                        <div class="danger-action">
                            <div>
                                <div class="fw-semibold text-white">${tx('Jelszó visszaállítás', 'Password reset')}</div>
                                <small class="text-secondary">${tx('A felhasználó e-mailjére küldünk egy egyszer használatos linket.', "We will send a one-time link to the user's email.")}</small>
                            </div>
                            ${!u.emailVerified
                    ? `<button type="button" class="btn btn-outline-warning btn-sm" disabled title="${tx('Email cím nincs megerősítve', 'Email address not verified')}"><i class="bi bi-send-fill me-1"></i>${tx('Link küldése', 'Send link')}</button>`
                    : h.btn({ label: tx('Link küldése', 'Send link'), icon: 'bi-send-fill', variant: 'outline-warning', size: 'sm', onclick: `adminSendPasswordReset(${u.id})` })
                }
                        </div>
                        <div class="danger-action">
                            <div>
                                <div class="fw-semibold text-white">${tx('Felhasználó tiltása', 'Ban user')} <span class="badge bg-danger ms-1">${tx('kritikus', 'critical')}</span></div>
                                <small class="text-secondary">${tx('30 char indok + jelszó megerősítés szükséges.', '30-char reason + password confirmation required.')}</small>
                            </div>
                            ${h.btn({
                    label: tx('Tiltás kezelése', 'Manage ban'), icon: 'bi-ban', variant: 'outline-danger', size: 'sm',
                    onclick: `banAdminUser(${u.id})`
                })}
                        </div>
                        <div class="danger-action">
                            <div>
                                <div class="fw-semibold text-white">${tx('Munkamenetek megszakítása', 'Revoke sessions')}</div>
                                <small class="text-secondary">${tx('Kijelentkezteti a felhasználót az összes eszközéről és érvényteleníti a tokenjeit.', 'Logs the user out from all devices and invalidates their tokens.')}</small>
                            </div>
                            ${h.btn({ label: tx('Kijelentkeztetés', 'Log out'), icon: 'bi-box-arrow-right', variant: 'outline-warning', size: 'sm', onclick: `adminRevokeUserSessions(${u.id}, event)` })}
                        </div>
                        <div class="danger-action">
                            <div>
                                <div class="fw-semibold text-white">${tx('Profil törlése', 'Delete profile')} <span class="badge bg-danger ms-1">${tx('kritikus', 'critical')}</span></div>
                                <small class="text-secondary">${tx('Véglegesen eltávolítja a felhasználót — jelszó megerősítés szükséges.', 'Permanently removes the user — password confirmation required.')}</small>
                            </div>
                            ${h.btn({
                    label: tx('Törlés kezelése', 'Manage deletion'), icon: 'bi-trash3-fill', variant: 'outline-danger', size: 'sm',
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
        const targetLabel = hasUser ? (u.username || `#${u.id}`) : tx('kiválasztott felhasználó', 'selected user');
        const allUsers = Array.isArray(state.users.list) ? state.users.list : [];
        const banList = allUsers.filter((x) => x.isBanned);

        return `
        ${h.header({
            icon: 'bi-slash-circle', title: tx('Tiltások', 'Bans'),
            subtitle: hasUser
                ? tx(`${targetLabel} — előre kiválasztva tiltáshoz`, `${targetLabel} — preselected for ban`)
                : tx('Új tiltás létrehozása és aktív tiltások kezelése', 'Create new ban and manage active bans'),
            actions: hasUser
                ? [{ label: tx('Vissza a listához', 'Back to list'), icon: 'bi-arrow-left', size: 'sm', onclick: "showSection('users')" }]
                : []
        })}
        <div class="row g-4 mb-4">
            <div class="col-lg-5">
                ${h.card({
            title: hasUser ? tx(`Új tiltás — ${escapeHtml(targetLabel)}`, `New ban — ${escapeHtml(targetLabel)}`) : tx('Új tiltás', 'New ban'),
            icon: 'bi-plus-circle',
            headerExtra: h.badge(tx('kritikus művelet', 'critical action'), 'danger'),
            body: `
                        <div class="alert alert-warning bg-warning bg-opacity-10 border-warning small mb-3">
                            <i class="bi bi-info-circle-fill me-1"></i>
                            ${tx('A tiltás mutáló művelet — min. <strong>10 karakter indok</strong> és <strong>jelszó megerősítés</strong> szükséges.', 'Ban is a mutating action — min. <strong>10-character reason</strong> and <strong>password confirmation</strong> required.')}
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
                                ${tx('Nincs kiválasztott felhasználó — válassz egyet a', 'No user selected — pick one from the')}
                                <a href="#" class="text-gold" onclick="showSection('users', event)">${tx('listából', 'list')}</a>.
                            </div>
                        `}
                        <form class="row g-3" onsubmit="event.preventDefault();">
                            <div class="col-md-6">
                                <label class="form-label" for="banType">${tx('Típus', 'Type')}</label>
                                <select id="banType" class="form-select" onchange="onBanTypeChange()">
                                    <option value="Ideiglenes">${tx('Ideiglenes', 'Temporary')}</option>
                                    <option value="Végleges">${tx('Végleges', 'Permanent')}</option>
                                    <option value="Csak chat">${tx('Csak chat', 'Chat only')}</option>
                                </select>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label" for="banDuration">${tx('Időtartam (óra)', 'Duration (hours)')}</label>
                                <input id="banDuration" class="form-control" type="number" value="24" min="1">
                            </div>
                            <div class="col-12">
                                <label class="form-label" for="banReason">
                                    ${tx('Indok', 'Reason')} <span class="text-danger">*</span>
                                    <span class="critical-reason-counter ms-2">
                                        <span id="banReasonCount">0</span> / 10
                                    </span>
                                </label>
                                <textarea id="banReason" class="form-control" rows="3" placeholder="${tx('Rövid indok — naplózásra kerül (min. 10 karakter).', 'Short reason — will be logged (min. 10 characters).')}" oninput="onBanReasonInput(this)"></textarea>
                            </div>
                            <div class="col-12">
                                <label class="form-label" for="banPassword">${tx('Saját admin jelszó', 'Your admin password')} <span class="text-danger">*</span></label>
                                <input id="banPassword" class="form-control" type="password" autocomplete="current-password" placeholder="${tx('Saját admin jelszavad megerősítésre', 'Your admin password for confirmation')}">
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
                                        <span class="ban-hold-label"><i class="bi bi-shield-fill-check me-2"></i>${tx('Tiltás alkalmazása', 'Apply ban')}</span>
                                        <small class="ban-hold-sub">${tx('Tartsd nyomva 5 másodpercig', 'Hold for 5 seconds')}</small>
                                    </button>
                                </div>
                            ` : `
                                <div class="col-12 mt-2">
                                    <button type="button" class="ban-hold-btn" disabled>
                                        <span class="ban-hold-label"><i class="bi bi-shield-fill-check me-2"></i>${tx('Tiltás alkalmazása', 'Apply ban')}</span>
                                        <small class="ban-hold-sub">${tx('Először válassz felhasználót', 'Select a user first')}</small>
                                    </button>
                                </div>
                            `}
                        </form>
                    `
        })}
            </div>
            <div class="col-lg-7">
                ${h.card({
            title: tx('Aktív tiltások', 'Active bans'), icon: 'bi-list-check', noBodyPadding: true,
            headerExtra: `<span class="text-secondary small">${banList.length} ${tx('bejegyzés', 'entries')}</span>`,
            body: `
                        <table class="table mb-0">
                            <thead><tr><th>${tx('Felhasználó', 'User')}</th><th>${tx('Lejár', 'Expires')}</th><th class="text-end">${tx('Művelet', 'Action')}</th></tr></thead>
                            <tbody>
                                ${banList.length === 0
                    ? `<tr><td colspan="3" class="text-center text-secondary py-4">${tx('Nincs aktív tiltás.', 'No active bans.')}</td></tr>`
                    : banList.map(b => `
                                        <tr>
                                            <td>${h.user({ name: b.username, email: b.email, profile_image: b.profileImage, username: b.username, struck: true })}</td>
                                            <td><span class="${b.bannedUntil ? '' : 'text-danger'}">${b.bannedUntil ? escapeHtml(window.MattMesterI18n?.formatDateTime ? window.MattMesterI18n.formatDateTime(b.bannedUntil) : new Date(b.bannedUntil).toLocaleString('hu-HU')) : tx('Soha', 'Never')}</span></td>
                                            <td class="text-end">
                                                ${h.iconBtn({ icon: 'bi-eye', variant: 'light', title: tx('Megtekintés', 'View'), onclick: `openAdminUserView(${b.id})` })}
                                                ${h.iconBtn({ icon: 'bi-check-circle', variant: 'success', title: tx('Feloldás (kritikus)', 'Unban (critical)'), onclick: `openCriticalAction('users.unban', '${escapeHtml(b.username || '').replace(/'/g, "\\\\'")}', ${b.id})` })}
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
        const targetLabel = hasUser ? (u.username || `#${u.id}`) : tx('kiválasztott felhasználó', 'selected user');
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
            icon: 'bi-trash3-fill', title: tx('Felhasználó törlése', 'Delete user'),
            subtitle: hasUser
                ? tx(`${targetLabel} — előre kiválasztva törléshez`, `${targetLabel} — preselected for deletion`)
                : tx('Profil törlése admin oldalról (24h grace + visszaállítás)', 'Profile deletion from admin side (24h grace + restore)'),
            actions: hasUser
                ? [{ label: tx('Vissza a listához', 'Back to list'), icon: 'bi-arrow-left', size: 'sm', onclick: "showSection('users')" }]
                : []
        })}
        <div class="row g-4 mb-4">
            <div class="col-lg-5">
                ${h.card({
            title: hasUser ? tx(`Profil törlése — ${escapeHtml(targetLabel)}`, `Delete profile — ${escapeHtml(targetLabel)}`) : tx('Profil törlése', 'Delete profile'),
            icon: 'bi-trash3-fill',
            headerExtra: h.badge(tx('kritikus művelet', 'critical action'), 'danger'),
            body: `
                        <div class="alert alert-danger bg-danger bg-opacity-10 border-danger small mb-3">
                            <i class="bi bi-exclamation-triangle-fill me-1"></i>
                            ${tx('<strong>Véglegesen eltávolítja</strong> a felhasználót. A meccsadatok megmaradnak az ellenfelek számára (felhasználói nevek <em>Törölt felhasználó</em>-ra cserélődnek), de a profil, barátok, chat üzenetek, képességek naplói <strong>minden eltűnik</strong>. A művelet <strong>nem visszavonható</strong>.', '<strong>Permanently removes</strong> the user. Match data is preserved for opponents (usernames replaced with <em>Deleted user</em>), but profile, friends, chat messages, ability logs <strong>are all gone</strong>. The action <strong>cannot be undone</strong>.')}
                        </div>
                        <div class="alert alert-info bg-info bg-opacity-10 border-info small mb-3">
                            <i class="bi bi-info-circle me-1"></i>
                            ${tx('Megerősítéshez a saját <strong>admin jelszavadat</strong> kell megadnod a lenti mezőben. Az indok <strong>opcionális</strong>, de javasolt audit célokra.', 'For confirmation, enter your <strong>admin password</strong> below. Reason is <strong>optional</strong> but recommended for audit purposes.')}
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
                                    ${tx('<strong>Admin profil nem törölhető</strong> ezen a felületen. Ehhez super-admin műveletre van szükség.', '<strong>Admin profile cannot be deleted</strong> from this UI. A super-admin action is required.')}
                                </div>
                            ` : ''}
                        ` : `
                            <div class="alert alert-info bg-info bg-opacity-10 border-info small mb-3">
                                <i class="bi bi-info-circle me-1"></i>
                                ${tx('Nincs kiválasztott felhasználó — válassz egyet a', 'No user selected — pick one from the')}
                                <a href="#" class="text-gold" onclick="showSection('users', event)">${tx('listából', 'list')}</a>.
                            </div>
                        `}
                        <form class="row g-3" onsubmit="event.preventDefault();">
                            <div class="col-12">
                                <label class="form-label" for="deleteReason">
                                    ${tx('Indok', 'Reason')} <span class="text-secondary">${tx('(opcionális, max 1000 char)', '(optional, max 1000 chars)')}</span>
                                </label>
                                <textarea id="deleteReason" class="form-control" rows="3" maxlength="1000"
                                          placeholder="${tx('Részletes indok — naplózásra kerül. Lehet üres is.', 'Detailed reason — will be logged. May be empty.')}"></textarea>
                            </div>
                            <div class="col-12">
                                <label class="form-label" for="deletePassword">${tx('Saját admin jelszó', 'Your admin password')} <span class="text-danger">*</span></label>
                                <input id="deletePassword" class="form-control" type="password"
                                       autocomplete="current-password"
                                       placeholder="${tx('Saját admin jelszavad megerősítésre', 'Your admin password for confirmation')}">
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
                                        <span class="ban-hold-label"><i class="bi bi-trash3-fill me-2"></i>${tx('Profil törlése', 'Delete profile')}</span>
                                        <small class="ban-hold-sub">${tx('Tartsd nyomva 5 másodpercig', 'Hold for 5 seconds')}</small>
                                    </button>
                                </div>
                            ` : `
                                <div class="col-12 mt-2">
                                    <button type="button" class="ban-hold-btn" disabled>
                                        <span class="ban-hold-label"><i class="bi bi-trash3-fill me-2"></i>${tx('Profil törlése', 'Delete profile')}</span>
                                        <small class="ban-hold-sub">${isAdminTarget ? tx('Admin profil nem törölhető', 'Admin profile cannot be deleted') : tx('Először válassz felhasználót', 'Select a user first')}</small>
                                    </button>
                                </div>
                            `}
                        </form>
                    `
        })}
            </div>
            <div class="col-lg-7">
                ${h.card({
            title: tx('Törlésre várólista', 'Pending deletion'),
            icon: 'bi-hourglass-split',
            headerExtra: `<span class="text-secondary small">${pendingList.length} ${tx('bejegyzés', 'entries')} · ${pendingList.length > 0 ? tx('24h grace', '24h grace') : ''}</span>`,
            noBodyPadding: true,
            body: `
                        <table class="table mb-0">
                            <thead>
                                <tr>
                                    <th>${tx('Felhasználó', 'User')}</th>
                                    <th>${tx('Hátralévő idő', 'Time remaining')}</th>
                                    <th class="text-end">${tx('Művelet', 'Action')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${pendingList.length === 0
                    ? `<tr><td colspan="3" class="text-center text-secondary py-4">
                            <i class="bi bi-hourglass me-1"></i>${tx('Nincs törlésre váró felhasználó.', 'No users pending deletion.')}
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
                                                    <span class="${danger ? 'text-danger fw-semibold' : 'text-warning'}" title="${escapeHtml(window.MattMesterI18n?.formatDateTime ? window.MattMesterI18n.formatDateTime(p.pendingDeletionUntil) : new Date(p.pendingDeletionUntil).toLocaleString('hu-HU'))}">
                                                        <i class="bi bi-hourglass-split me-1"></i>${countdown}
                                                    </span>
                                                    ${p.deletedReason ? `<div class="small text-secondary" title="${escapeHtml(p.deletedReason)}">${escapeHtml(p.deletedReason.length > 60 ? p.deletedReason.slice(0, 60) + '…' : p.deletedReason)}</div>` : ''}
                                                </td>
                                                <td class="text-end">
                                                    ${h.iconBtn({ icon: 'bi-eye', variant: 'light', title: tx('Megtekintés', 'View'), onclick: `openAdminUserView(${p.id})` })}
                                                    ${h.iconBtn({ icon: 'bi-arrow-counterclockwise', variant: 'success', title: tx('Visszaállít (törlés visszavonása)', 'Restore (cancel deletion)'), onclick: `restoreUserDeletion(${p.id})` })}
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
            icon: 'bi-chat-dots-fill', title: tx('Chat moderálás', 'Chat moderation'),
            subtitle: tx('Megjelölt és bejelentett üzenetek áttekintése', 'Review of flagged and reported messages')
        })}
        ${h.card({
            title: `<span id="chatModerationCardTitle">${tx('Megjelölt üzenetek', 'Flagged messages')}</span>`,
            icon: 'bi-exclamation-triangle-fill',
            noBodyPadding: true,
            body: `
                <div class="px-3 pt-3">
                    <p class="text-secondary mb-2">${tx('Két forrás:', 'Two sources:')}
                        <span class="badge bg-danger">${tx('Bejelentett', 'Reported')}</span> = ${tx('felhasználói bejelentés', 'user report')};
                        <span class="badge bg-warning text-dark">Auto-flagged</span> = ${tx('a profanity-filter blocklist által maszkolt üzenet (fix szabály, az admin sem engedélyezheti — csak törölhető vagy figyelmen kívül hagyható).', 'a message masked by the profanity-filter blocklist (fixed rule, even admins cannot allow it — only delete or ignore).')}
                        ${tx('Az <strong>Engedélyezés</strong> a felhasználói bejelentéseket utasítja el, a <strong>Törlés</strong> véglegesen eltávolítja az üzenetet és strike-ot rögzít a feladónak (3 csapas után auto-ban).', 'The <strong>Allow</strong> button rejects user reports; <strong>Delete</strong> permanently removes the message and records a strike for the sender (auto-ban after 3 strikes).')}
                    </p>
                    <div id="chatModerationMessage" class="alert d-none" role="alert"></div>
                </div>
                <div class="moderation-list" id="chatModerationList">
                    <div class="text-center text-secondary py-4">${tx('Töltés...', 'Loading...')}</div>
                </div>
            `
        })}
    `,

    /* ---------- Moderáció > Profilképek ---------- */
    profileImageReview: () => `
        ${h.header({
        icon: 'bi-image', title: tx('Függő profilképek', 'Pending profile images'),
        subtitle: tx('Új profilképek jóváhagyása vagy elutasítása', 'Approve or reject new profile images')
    })}
        ${h.card({
        body: `
                <p class="text-secondary mb-3">${tx('A függő profilképeket csak a feltöltő látja. Jóváhagyás után globálisan láthatóvá válnak; elutasítás esetén a publikus kép visszaáll az alapértelmezettre.', 'Pending profile images are only visible to the uploader. After approval they become globally visible; on rejection the public image reverts to default.')}</p>
                <div id="profileImageReviewMessage" class="alert d-none" role="alert"></div>
                <div class="table-responsive">
                    <table class="table align-middle mb-0">
                        <thead>
                            <tr>
                                <th>${tx('Felhasználó', 'User')}</th>
                                <th>${tx('Feltöltött kép', 'Uploaded image')}</th>
                                <th>${tx('Feltöltés ideje', 'Upload time')}</th>
                                <th class="text-end">${tx('Műveletek', 'Actions')}</th>
                            </tr>
                        </thead>
                        <tbody id="profileImageReviewTableBody">
                            <tr><td colspan="4" class="text-center text-secondary py-4">${tx('Töltés...', 'Loading...')}</td></tr>
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
        icon: 'bi-flag-fill', title: tx('Bejelentések', 'Reports'),
        subtitle: tx('Felhasználók által beküldött player-bejelentések', 'Player reports submitted by users')
    })}
        ${h.card({
            title: `<span id="reportsModerationCardTitle">${tx('Bejelentések', 'Reports')}</span>`,
            icon: 'bi-flag-fill',
            noBodyPadding: true,
            body: `
                <div class="px-3 pt-3">
                    <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
                        <button type="button" class="btn btn-sm btn-outline-light reports-filter-btn active" data-reports-filter="all">
                            ${tx('Összes', 'All')} <span class="badge bg-secondary ms-1" id="reportsCountAll">0</span>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-warning reports-filter-btn" data-reports-filter="open">
                            ${tx('Nyitott', 'Open')} <span class="badge bg-warning text-dark ms-1" id="reportsCountOpen">0</span>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-info reports-filter-btn" data-reports-filter="under_review">
                            ${tx('Vizsgálat alatt', 'Under review')} <span class="badge bg-info text-dark ms-1" id="reportsCountUnderReview">0</span>
                        </button>
                        <button type="button" class="btn btn-sm btn-outline-success reports-filter-btn" data-reports-filter="closed">
                            ${tx('Lezárt', 'Closed')} <span class="badge bg-success ms-1" id="reportsCountClosed">0</span>
                        </button>
                    </div>
                    <p class="text-secondary mb-2 small">
                        ${tx('Felhasználói bejelentések más játékosokra. A chat-üzenet bejelentések a <strong>Chat moderálás</strong> panelen jelennek meg (külön rendszer). Hamis bejelentésért a bejelentő NEM kap büntetést.', 'User reports about other players. Chat-message reports appear on the <strong>Chat moderation</strong> panel (separate system). False reporting does NOT punish the reporter.')}
                    </p>
                    <div id="reportsModerationMessage" class="alert d-none" role="alert"></div>
                </div>
                <div class="moderation-list" id="reportsModerationList">
                    <div class="text-center text-secondary py-4">${tx('Töltés...', 'Loading...')}</div>
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
            try { return window.MattMesterI18n?.formatDateTime ? window.MattMesterI18n.formatDateTime(iso) : new Date(iso).toLocaleString('hu-HU'); } catch (_) { return String(iso); }
        };
        const filterButtons = ['all', 'ongoing', 'finished', 'abandoned'].map((key) => {
            const labels = { all: tx('Összes', 'All'), ongoing: tx('Élő', 'Live'), finished: tx('Befejezett', 'Finished'), abandoned: tx('Megszakított', 'Abandoned') };
            const active = g.filter === key ? ' active' : '';
            return `<button type="button" class="btn btn-outline-secondary${active}" onclick="setGamesFilter('${key}')">${labels[key]}</button>`;
        }).join('');

        const rows = (g.list || []).map((row) => {
            const winner = row.winner ? `<span class="text-success">${escapeHtml(row.winner.username || '—')}</span>` : '<span class="text-secondary">—</span>';
            const buttons = [];
            buttons.push(`<button type="button" class="btn btn-sm btn-outline-gold" onclick="openSpectator(${row.id})" title="${tx('Megnez', 'View')}"><i class="bi bi-eye"></i></button>`);
            if (row.status === 'ongoing') {
                buttons.push(`<button type="button" class="btn btn-sm btn-outline-danger" onclick="confirmForceEndGame(${row.id})" title="${tx('Force end', 'Force end')}"><i class="bi bi-stop-circle"></i></button>`);
            } else {
                buttons.push(`<button type="button" class="btn btn-sm btn-outline-secondary" onclick="downloadGamePgn(${row.id})" title="${tx('PGN letoltes', 'Download PGN')}"><i class="bi bi-download"></i></button>`);
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
                icon: 'bi-knight-fill', title: tx('Játszmák', 'Games'),
                subtitle: g.loaded ? tx(`${g.list.length} jatszma listazva`, `${g.list.length} games listed`) : tx('Lefutott és folyamatban lévő játszmák', 'Past and ongoing games')
            })}
            ${h.stats([
                { icon: 'bi-play-circle-fill', value: c.ongoing, label: tx('Folyamatban', 'In progress'), color: 'success' },
                { icon: 'bi-trophy-fill',      value: c.finished, label: tx('Befejezett', 'Finished'), color: 'warning' },
                { icon: 'bi-x-circle-fill',    value: c.abandoned, label: tx('Megszakított', 'Abandoned'), color: 'danger' },
                { icon: 'bi-circle-half',      value: c.draw, label: tx('Döntetlen', 'Draw'), color: 'primary' }
            ])}
            <div class="alerts-filter-bar mb-3">
                <div class="btn-group btn-group-sm" role="group">${filterButtons}</div>
                <input type="text" class="form-control form-control-sm" placeholder="${tx('Felhasznalonev keresese...', 'Search username...')}"
                       value="${escapeHtml(g.search || '')}" onchange="setGamesSearch(this.value)" style="max-width:280px;">
            </div>
            ${g.error ? `<div class="alert alert-danger">${escapeHtml(g.error)}</div>` : ''}
            ${g.loading
                ? `<div class="content-card text-center py-5"><i class="bi bi-arrow-repeat spin"></i> ${tx('Toltes...', 'Loading...')}</div>`
                : (rows.length === 0 && g.loaded
                    ? `<div class="content-card text-center py-5 text-secondary">${tx('Nincs jatszma a megadott szurokre.', 'No games for the given filters.')}</div>`
                    : h.table({
                        title: tx('Játszmák listája', 'Games list'),
                        headers: [tx('Azonosító', 'ID'), tx('Világos', 'White'), tx('Sötét', 'Black'), tx('Állapot', 'Status'), tx('Győztes', 'Winner'), tx('Lépések', 'Moves'), tx('Időkontroll', 'Time control'), tx('Indult', 'Started'), ''],
                        rows
                    })
                )
            }
        `;
    },

    /* ---------- Játékok > Képességek ---------- */
    abilities: () => {
        const a = state.abilities;
        // Client-side ability i18n mapping: ha az ab.name egy ismert slug,
        // hasznaljuk a tx()-elt felhasznaloi-cimkeket. Egyebkent fallback a
        // server-strgre. (Ihlet: chess_barold/abilities.js getFeliratok().)
        // A backend `abilities` tabla `name` mezoje a slug-ot tartalmazza
        // (time_pause, freeze, swap, board_hide, shield, lefokozas).
        const abilityNameTx = (slug) => {
            switch (String(slug || '').toLowerCase()) {
                case 'time_pause': return tx('Időmegállítás', 'Time stop');
                case 'freeze':     return tx('Bábu befagyasztás', 'Freeze piece');
                case 'swap':       return tx('Bábucsere', 'Piece swap');
                case 'board_hide': return tx('Táblakitakarás', 'Board hide');
                case 'shield':     return tx('Pajzs', 'Shield');
                case 'lefokozas':  return tx('Lefokozás', 'Demote');
                default:           return null;
            }
        };
        const abilityDescTx = (slug) => {
            switch (String(slug || '').toLowerCase()) {
                case 'time_pause': return tx('Időmegállítás — saját óra rövid szüneteltetése (8mp)',
                                            'Time stop — pause your own clock briefly (8s)');
                case 'freeze':     return tx('Bábu befagyasztás — egy ellenséges bábu 1 körig nem mozdulhat',
                                            'Freeze piece — an enemy piece cannot move for 1 turn');
                case 'swap':       return tx('Bábucsere — két saját bábu pozíciójának cseréje (a köröd is)',
                                            'Piece swap — swap the positions of two of your own pieces (uses your turn)');
                case 'board_hide': return tx('Táblakitakarás — ellenfél 5mp-ig nem tud lépni',
                                            'Board hide — opponent cannot move for 5s');
                case 'shield':     return tx('Pajzs — saját bábu 1 körre sebezhetetlenné válik',
                                            'Shield — one of your pieces becomes invulnerable for 1 turn');
                case 'lefokozas':  return tx('Lefokozás — ellenséges bástya/futó/vezér a következő körében max. 4 mezőt léphet',
                                            'Demote — an enemy rook/bishop/queen may move at most 4 squares on its next turn');
                default:           return null;
            }
        };
        const cards = (a.list || []).map((ab) => {
            const localizedName = abilityNameTx(ab.name) || ab.name;
            const localizedDesc = abilityDescTx(ab.name) || (ab.description || '—');
            return `
            <div class="col-md-6 col-lg-4">
                ${h.card({
                    title: escapeHtml(localizedName),
                    headerExtra: h.badge(tx(`${ab.cooldownTurns} kor cooldown`, `${ab.cooldownTurns} turn cooldown`), 'warning'),
                    classes: 'h-100',
                    body: `
                        <p class="text-secondary mb-3">${escapeHtml(localizedDesc)}</p>
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">${ab.usageCount || 0} ${tx('hasznalat', 'uses')}</small>
                            <div class="btn-group">
                                <button type="button" class="btn btn-sm btn-outline-gold" onclick="openAbilityEditor(${ab.id})" title="${tx('Szerkesztes', 'Edit')}"><i class="bi bi-pencil"></i></button>
                                <button type="button" class="btn btn-sm btn-outline-danger" onclick="confirmDeleteAbility(${ab.id})" title="${tx('Torles', 'Delete')}"><i class="bi bi-trash"></i></button>
                            </div>
                        </div>
                    `
                })}
            </div>
        `;
        }).join('');

        return `
            ${h.header({
                icon: 'bi-magic', title: tx('Képességek / Erősítők', 'Abilities / Power-ups'),
                subtitle: a.loaded ? tx(`${a.list.length} képesség`, `${a.list.length} abilities`) : tx('Speciális játékos képességek kezelése', 'Manage special player abilities'),
                actions: [
                    { label: tx('Új képesség', 'New ability'), icon: 'bi-plus-lg', variant: 'gold', onclick: 'openAbilityEditor()' }
                ]
            })}
            ${a.error ? `<div class="alert alert-danger">${escapeHtml(a.error)}</div>` : ''}
            ${a.loading
                ? `<div class="content-card text-center py-5"><i class="bi bi-arrow-repeat spin"></i> ${tx('Toltes...', 'Loading...')}</div>`
                : (a.list.length === 0 && a.loaded
                    ? `<div class="content-card text-center py-5 text-secondary">${tx('Meg nincsenek kepessegek. Kattints az "Uj kepesseg" gombra.', 'No abilities yet. Click "New ability".')}</div>`
                    : `<div class="row g-4">${cards}</div>`)
            }
        `;
    },

    /* ---------- Naplók > Bejelentkezések ---------- */
    security: () => {
        const list = state.loginsLoaded ? state.liveLogins : [];
        const f = state.loginsFilter || {};
        const subtitle = state.loginsLoaded
            ? tx(`${list.length} bejelentkezési bejegyzés`, `${list.length} login entries`)
            : tx('Sikeres és sikertelen bejelentkezési kísérletek', 'Successful and failed login attempts');
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
                return `<span class="badge bg-danger">${tx('Sikertelen', 'Failed')}</span>`;
            }
            return `<span class="badge bg-success">${tx('Sikeres', 'Success')}</span>`;
        };
        const tableRows = list.map(l => [
            `<span class="fw-semibold text-white">${escapeHtml(l.username || '—')}</span>`,
            `<span class="font-monospace ${l.risk === 'high' ? 'text-danger' : 'text-gold'}">${escapeHtml(l.ip || '—')}</span>`,
            `<span class="text-secondary"><i class="bi bi-geo-alt me-1"></i>${escapeHtml(typeof translateLocationLabel === 'function' ? translateLocationLabel(l.location?.label) : (l.location?.label || '—'))}</span>`,
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
            icon: 'bi-shield-check', title: tx('Bejelentkezési előzmények', 'Login history'),
            subtitle,
            actions: [
                { label: tx('Napló export', 'Export log'), icon: 'bi-download', size: 'sm', onclick: 'exportLoginsCsv()' }
            ]
        })}

        <div class="alerts-filter-bar">
            <input id="loginsFilterUsername" type="text" class="form-control form-control-sm"
                   placeholder="${tx('Felhasználónév...', 'Username...')}" value="${escapeHtml(f.username || '')}"
                   onchange="onLoginsFilterChange()">
            <select id="loginsFilterStatus" class="form-select form-select-sm" onchange="onLoginsFilterChange()">
                <option value="all"     ${f.status === 'all' ? 'selected' : ''}>${tx('Minden státusz', 'All statuses')}</option>
                <option value="success" ${f.status === 'success' ? 'selected' : ''}>${tx('Sikeres', 'Success')}</option>
                <option value="failed"  ${f.status === 'failed' ? 'selected' : ''}>${tx('Sikertelen', 'Failed')}</option>
            </select>
            <select id="loginsFilterDevice" class="form-select form-select-sm" onchange="onLoginsFilterChange()"
                    title="${devices.length === 0 ? tx('Csak akkor jelennek meg eszkozok, ha mar volt bejelentkezes', 'Devices appear only after first login') : tx('Csak a mar bejelentkezett rendszerek/bongeszok', 'Only systems/browsers already used to log in')}">
                <option value="" ${!f.device ? 'selected' : ''}>${tx('Minden eszköz / böngésző', 'All devices / browsers')}</option>
                ${devices.map((d) => `
                    <option value="${escapeHtml(d)}" ${f.device === d ? 'selected' : ''}>${escapeHtml(d)}</option>
                `).join('')}
                ${devices.length === 0 ? `<option disabled>${tx('— még nincs bejelentkezés —', '— no logins yet —')}</option>` : ''}
            </select>
            <input id="loginsFilterSince" type="datetime-local" class="form-control form-control-sm"
                   value="${escapeHtml(f.sinceDate || '')}" ${sinceMin ? `min="${sinceMin}"` : ''} ${sinceMax ? `max="${sinceMax}"` : ''}
                   onchange="onLoginsFilterChange()" title="${tx('Dátum-tól', 'Date from')}">
            <input id="loginsFilterUntil" type="datetime-local" class="form-control form-control-sm"
                   value="${escapeHtml(f.untilDate || '')}" ${untilMin ? `min="${untilMin}"` : ''} ${untilMax ? `max="${untilMax}"` : ''}
                   onchange="onLoginsFilterChange()" title="${tx('Dátum-ig', 'Date to')}">
            <button type="button" class="btn btn-outline-light btn-sm" onclick="resetLoginsFilter()">
                <i class="bi bi-x"></i> ${tx('Szűrők törlése', 'Clear filters')}
            </button>
        </div>

        ${list.length === 0 && state.loginsLoaded
            ? `<div class="content-card text-center py-5">
                  <i class="bi bi-shield-check display-6 text-secondary mb-2"></i>
                  <div class="text-secondary">${tx('Nincs bejelentkezési bejegyzés a megadott szűrőkre.', 'No login entries for the given filters.')}</div>
               </div>`
            : h.table({
                headers: [tx('Felhasználó', 'User'), tx('IP cím', 'IP address'), tx('Helyszín', 'Location'), tx('Eszköz / böngésző', 'Device / browser'), tx('Idő', 'Time'), tx('Státusz', 'Status'), tx('Kockázat', 'Risk')],
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
            icon: 'bi-journal-check', title: tx('Audit napló', 'Audit log'),
            subtitle: tx('Admin műveletek append-only nyomvonala — kötelező indok, before/after diff', 'Append-only trail of admin actions — mandatory reason, before/after diff'),
            actions: [{ label: tx('Audit export', 'Audit export'), icon: 'bi-download', size: 'sm' }]
        })}

            ${intent ? `
                <div class="alert alert-info bg-info bg-opacity-10 border-info d-flex align-items-start gap-2 mb-3">
                    <i class="bi bi-funnel-fill text-info mt-1"></i>
                    <div class="flex-grow-1">
                        <strong>${tx('Riasztás-szűrés aktív', 'Alert filter active')}:</strong>
                        ${intent.ip ? `IP=<code class="text-gold">${escapeHtml(intent.ip)}</code> · ` : ''}
                        ${intent.userId ? `User=<code class="text-gold">#${intent.userId}</code> · ` : ''}
                        ${tx('Időszak', 'Period')}: <span class="font-monospace">${escapeHtml(window.MattMesterI18n?.formatDateTime ? window.MattMesterI18n.formatDateTime(intent.sinceDate) : new Date(intent.sinceDate).toLocaleString('hu-HU'))}</span>
                        — <span class="font-monospace">${escapeHtml(window.MattMesterI18n?.formatDateTime ? window.MattMesterI18n.formatDateTime(intent.untilDate) : new Date(intent.untilDate).toLocaleString('hu-HU'))}</span>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-light" onclick="clearAuditFilterIntent()">
                        <i class="bi bi-x"></i> ${tx('Szűrő törlése', 'Clear filter')}
                    </button>
                </div>
            ` : ''}

            <div class="row g-3 mb-4">
                ${[
                { icon: 'bi-info-circle-fill', label: tx('Info', 'Info'), value: counts.info, color: 'primary' },
                { icon: 'bi-exclamation-triangle-fill', label: tx('Warning', 'Warning'), value: counts.warning, color: 'warning' },
                { icon: 'bi-exclamation-octagon-fill', label: tx('Critical', 'Critical'), value: counts.critical, color: 'danger' },
                { icon: 'bi-clock-history', label: tx('Listázott', 'Listed'), value: list.length, color: 'success' }
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
                        <input type="text" class="form-control form-control-sm" placeholder="${tx('Action / target / actor keresés...', 'Search action / target / actor...')}">
                        <select class="form-select form-select-sm">
                            <option value="">${tx('Minden severity', 'All severities')}</option>
                            <option value="info">${tx('Info', 'Info')}</option>
                            <option value="warning">${tx('Warning', 'Warning')}</option>
                            <option value="critical">${tx('Critical', 'Critical')}</option>
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
            icon: 'bi-exclamation-octagon-fill', title: tx('Riasztások', 'Alerts'),
            subtitle: state.alertsLoaded
                ? tx(`${list.length} bejegyzés${f.includeDismissed ? ' (elrejtettek is)' : ''}`, `${list.length} entries${f.includeDismissed ? ' (incl. dismissed)' : ''}`)
                : tx('Jogosulatlan próbák, rate limit szigorítások, gyanús minták', 'Unauthorized attempts, rate-limit escalations, suspicious patterns'),
            actions: [{ label: tx('Mind elrejtése', 'Dismiss all'), icon: 'bi-eye-slash-fill', size: 'sm', onclick: 'dismissAllAlerts()' }]
        })}

            <div class="row g-3 mb-4">
                ${[
                { icon: 'bi-shield-fill-x', label: tx('Unauthorized', 'Unauthorized'), value: byKind.unauthorized || 0, color: 'warning' },
                { icon: 'bi-key-fill', label: tx('Token hiba', 'Token error'), value: byKind.token_invalid || 0, color: 'warning' },
                { icon: 'bi-speedometer2', label: tx('Rate escalated', 'Rate escalated'), value: byKind.rate_escalated || 0, color: 'warning' },
                { icon: 'bi-bug-fill', label: tx('Suspicious pattern', 'Suspicious pattern'), value: byKind.suspicious_pattern || 0, color: 'danger' },
                { icon: 'bi-slash-circle-fill', label: tx('Tiltások', 'Bans'), value: byKind.user_banned || 0, color: 'danger' },
                { icon: 'bi-trash3-fill', label: tx('Törlések', 'Deletions'), value: byKind.user_deleted || 0, color: 'danger' }
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
                    <option value="">${tx('Minden kategória', 'All categories')}</option>
                    ${Object.entries(ALERT_KIND).map(([k, v]) => `
                        <option value="${k}" ${f.kind === k ? 'selected' : ''}>${typeof v.label === 'function' ? v.label() : v.label}</option>
                    `).join('')}
                </select>
                <select id="alertsFilterSeverity" class="form-select form-select-sm" onchange="onAlertsFilterChange()">
                    <option value="">${tx('Minden severity', 'All severities')}</option>
                    <option value="info"     ${f.severity === 'info' ? 'selected' : ''}>${tx('Info', 'Info')}</option>
                    <option value="warning"  ${f.severity === 'warning' ? 'selected' : ''}>${tx('Warning', 'Warning')}</option>
                    <option value="critical" ${f.severity === 'critical' ? 'selected' : ''}>${tx('Critical', 'Critical')}</option>
                </select>
                <input id="alertsFilterIp" type="text" class="form-control form-control-sm"
                       placeholder="${tx('IP cím szűrés...', 'IP address filter...')}" value="${escapeHtml(f.ipAddress || '')}"
                       onchange="onAlertsFilterChange()">
                <label class="alerts-filter-toggle">
                    <input type="checkbox" id="alertsFilterIncludeDismissed"
                           ${f.includeDismissed ? 'checked' : ''}
                           onchange="onAlertsFilterChange()">
                    <span>Elrejtettek mutatása</span>
                </label>
                <button type="button" class="btn btn-outline-light btn-sm" onclick="resetAlertsFilter()">
                    <i class="bi bi-x"></i> ${tx('Szűrők törlése', 'Clear filters')}
                </button>
            </div>

            ${h.card({
                body: `<div class="alert-list">${list.length === 0
                    ? `<div class="text-center text-secondary py-5"><i class="bi bi-check2-circle me-2"></i>${tx('Nincs aktív riasztás.', 'No active alerts.')}</div>`
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
            try { return window.MattMesterI18n?.formatDateTime ? window.MattMesterI18n.formatDateTime(iso) : new Date(iso).toLocaleString('hu-HU'); } catch (_) { return String(iso); }
        };
        const rows = (s.list || []).map((a) => [
            h.user({ name: a.username || `#${a.id}`, email: a.email || '' }),
            a.isSuperAdmin
                ? `<span class="super-pill"><i class="bi bi-stars"></i>${tx('Super admin', 'Super admin')}</span>`
                : rolePill('admin'),
            `<span class="text-secondary">${fmt(a.createdAt)}</span>`,
            `<span class="text-secondary">${fmt(a.lastActive)}</span>`,
            `<div class="d-inline-flex gap-2">
                ${a.isSuperAdmin
                    ? h.btn({ label: tx('Super lock', 'Super lock'), icon: 'bi-lock-fill', variant: 'outline-secondary', size: 'sm', attrs: 'disabled' })
                    : h.btn({
                        label: tx('Revoke', 'Revoke'), icon: 'bi-shield-fill-x', variant: 'outline-danger', size: 'sm',
                        onclick: `openCriticalAction('admin.revoke', '${escapeHtml(a.username || '#' + a.id).replace(/'/g, "\\'")}', ${Number(a.id) || 'null'})`
                    })}
            </div>`
        ]);
        return `
            ${h.header({
                icon: 'bi-stars', title: tx('Super admin', 'Super admin'),
                subtitle: s.loaded ? tx(`${s.list.length} admin felhasznalo`, `${s.list.length} admin users`) : tx('Admin szerepkörök kiosztása és visszavonása', 'Grant and revoke admin roles'),
                actions: [
                    { label: tx('Admin grant', 'Grant admin'), icon: 'bi-plus-lg', variant: 'gold', onclick: "openAdminGrantPicker()" }
                ]
            })}
            <div class="alert alert-warning bg-warning bg-opacity-10 border-warning d-flex align-items-start gap-2">
                <i class="bi bi-info-circle-fill text-warning mt-1"></i>
                <div class="flex-grow-1">
                    ${tx('<strong>Last-super-admin lock</strong> aktív — egy super-admin saját <code>is_super_admin</code> flag-jét nem tudja levenni, ha ő az utolsó. Minden admin grant/revoke <strong>kritikus művelet</strong>: 30 char indok + jelszó megerősítés.', '<strong>Last-super-admin lock</strong> active — a super-admin cannot remove their own <code>is_super_admin</code> flag if they are the last one. Every admin grant/revoke is a <strong>critical action</strong>: 30-char reason + password confirmation.')}
                </div>
            </div>
            ${s.error ? `<div class="alert alert-danger">${escapeHtml(s.error)}</div>` : ''}
            ${s.loading
                ? `<div class="content-card text-center py-5"><i class="bi bi-arrow-repeat spin"></i> ${tx('Toltes...', 'Loading...')}</div>`
                : (rows.length === 0 && s.loaded
                    ? `<div class="content-card text-center py-5 text-secondary">${tx('Nincs admin felhasznalo.', 'No admin users.')}</div>`
                    : h.table({
                        title: tx('Admin felhasználók', 'Admin users'), icon: 'bi-shield-fill',
                        headers: [tx('Admin', 'Admin'), tx('Szint', 'Level'), tx('Csatlakozott', 'Joined'), tx('Utoljára aktív', 'Last active'), tx('Műveletek', 'Actions')],
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
                        <i class="bi bi-unlock"></i> ${tx('Felold', 'Unblock')}
                    </button>
                </td>
            </tr>
        `).join('');
        return `
            ${h.header({
                icon: 'bi-people', title: tx('Közösségi kapcsolatok', 'Social connections'),
                subtitle: tx('Barátkérelmek, kapcsolatok és blokkolások egy helyen', 'Friend requests, connections and blocks in one place')
            })}
            ${h.stats([
                { icon: 'bi-diagram-3-fill', value: c.totalFriendships || 0, label: tx('Összes barátság', 'Total friendships'), color: 'primary' },
                { icon: 'bi-person-plus',    value: c.pendingRequests  || 0, label: tx('Függő kérelem', 'Pending requests'),   color: 'warning' },
                { icon: 'bi-person-x-fill',  value: c.activeBlocks     || 0, label: tx('Aktív blokkolás', 'Active blocks'), color: 'danger' }
            ])}
            ${s.error ? `<div class="alert alert-danger">${escapeHtml(s.error)}</div>` : ''}
            <div class="row g-4">
                <div class="col-lg-7">
                    ${h.card({
                        title: tx('Függő barátkérelmek', 'Pending friend requests'), icon: 'bi-person-plus-fill', noBodyPadding: true,
                        body: requestRows.length
                            ? `<table class="table mb-0"><thead><tr><th>${tx('Küldő', 'Sender')}</th><th>${tx('Címzett', 'Recipient')}</th><th>${tx('Küldve', 'Sent')}</th><th class="text-end">${tx('Allapot', 'Status')}</th></tr></thead><tbody>${requestRows}</tbody></table>`
                            : `<div class="text-center text-secondary py-4">${s.requestsLoaded ? tx('Nincs fuggo kerelem.', 'No pending requests.') : tx('Toltes...', 'Loading...')}</div>`
                    })}
                </div>
                <div class="col-lg-5">
                    ${h.card({
                        title: tx('Aktív blokkolások', 'Active blocks'), icon: 'bi-person-x-fill', noBodyPadding: true,
                        body: blockRows.length
                            ? `<table class="table mb-0"><thead><tr><th>${tx('Blokkoló', 'Blocker')}</th><th>${tx('Blokkolt', 'Blocked')}</th><th class="text-end"></th></tr></thead><tbody>${blockRows}</tbody></table>`
                            : `<div class="text-center text-secondary py-4">${s.blocksLoaded ? tx('Nincs aktiv blokk.', 'No active blocks.') : tx('Toltes...', 'Loading...')}</div>`
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
        const runDisabled = running ? 'disabled' : (!isSuper ? `disabled title="${tx('Csak super-admin futtathat tesztet.', 'Only a super-admin can run tests.')}"` : '');

        // A Jest tenyleges futasi ideje (rawSummary.jestRunMs) tisztabb metrika,
        // mint a teljes spawn idotartam (durationMs = npx + jest setup + tesztek + exit).
        // Ha van jestRunMs, azt mutatjuk; subtitle-ben a teljes spawn idot.
        const jestRunMs = latest?.rawSummary?.jestRunMs;
        const displayDurationMs = Number.isFinite(jestRunMs) ? jestRunMs : (latest?.durationMs ?? null);
        const durationSubtitle = (latest && Number.isFinite(jestRunMs) && Number.isFinite(latest.durationMs) && latest.durationMs > jestRunMs + 200)
            ? `+ ${fmtDur(latest.durationMs - jestRunMs)} startup`
            : '';

        const jestTimeLabel = tx('Jest idő', 'Jest time');
        const statsRow = h.stats([
            { icon: 'bi-check-circle-fill', value: latest ? latest.passed  : '—', label: tx('Sikeres', 'Passed'), color: 'success' },
            { icon: 'bi-x-circle-fill',     value: latest ? latest.failed  : '—', label: tx('Sikertelen', 'Failed'), color: 'danger' },
            { icon: 'bi-skip-forward-fill', value: latest ? latest.skipped : '—', label: tx('Kihagyott', 'Skipped'), color: 'warning' },
            { icon: 'bi-stopwatch',         value: latest ? fmtDur(displayDurationMs) : '—', label: durationSubtitle ? `${jestTimeLabel} (${durationSubtitle})` : jestTimeLabel, color: 'primary' }
        ]);

        const historyRows = (t.history || []).map((r) => `
            <tr>
                <td><span class="font-monospace text-gold">#${r.id}</span></td>
                <td>${escapeHtml(r.triggeredByUsername || (r.triggeredBy ? '#' + r.triggeredBy : tx('rendszer', 'system')))}</td>
                <td><span class="badge bg-${r.status === 'passed' ? 'success' : (r.status === 'failed' ? 'danger' : (r.status === 'running' ? 'info' : 'secondary'))}">${escapeHtml(r.status)}</span></td>
                <td><span class="font-monospace">${r.passed}/${r.total}</span></td>
                <td><span class="font-monospace">${r.failed}</span></td>
                <td><span class="text-secondary">${fmtDur(r.durationMs)}</span></td>
                <td><span class="text-secondary small">${fmt(r.startedAt)}</span></td>
            </tr>
        `).join('');

        return `
            ${h.header({
                icon: 'bi-clipboard2-check', title: tx('Tesztek', 'Tests'),
                subtitle: latest
                    ? `${tx('Utolso futas', 'Last run')}: ${fmt(latest.startedAt)} — ${escapeHtml(latest.status)}`
                    : tx('Backend Jest + Supertest tesztek', 'Backend Jest + Supertest tests'),
                actions: [
                    { label: running ? tx('Fut...', 'Running...') : tx('Tesztek futtatása', 'Run tests'), icon: running ? 'bi-arrow-repeat' : 'bi-play-fill', variant: 'gold', size: 'sm', onclick: 'confirmRunTests()', attrs: runDisabled }
                ]
            })}

            ${running ? `
                <div class="alert alert-info bg-info bg-opacity-10 border-info d-flex align-items-center gap-2 mb-3">
                    <i class="bi bi-arrow-repeat spin"></i>
                    <div class="flex-grow-1">
                        <strong>${tx('Fut', 'Running')}: run #${running.runId}</strong> — ${tx('eltelt', 'elapsed')}: ${fmtDur(running.elapsedMs || 0)}
                    </div>
                </div>
            ` : ''}
            ${t.error ? `<div class="alert alert-danger">${escapeHtml(t.error)}</div>` : ''}

            ${statsRow}

            <div class="row g-4">
                <div class="col-lg-7">
                    ${h.card({
                        title: tx('Test suite-ok', 'Test suites'),
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
                                    <span class="test-name">${passing}/${total}${pending > 0 ? ` (${pending} ${tx('kihagyott', 'skipped')})` : ''}</span>
                                    ${durTxt ? `<span class="test-duration text-secondary small me-2">${durTxt}</span>` : ''}
                                    <span class="test-status-label">${label}</span>
                                </div>`;
                            }).join('')}</div>`
                            : `<div class="text-center text-secondary py-4">${t.latestLoaded ? tx('A reszletek csak a session alatt es csak a futtatas utan 1 percig lathatok. Kattints a "Tesztek futtatasa" gombra a friss eredmenyhez.', 'Details are visible only during the session and only for 1 minute after the run. Click the "Run tests" button to get a fresh result.') : tx('Toltes...', 'Loading...')}</div>`
                    })}
                </div>
                <div class="col-lg-5">
                    ${h.card({
                        title: tx('Stderr (utolso 4KB)', 'Stderr (last 4KB)'), icon: 'bi-terminal-fill',
                        headerExtra: latest ? `<span class="badge bg-warning text-dark" id="testsAutoClearPillStderr" data-tests-autoclear><i class="bi bi-clock-history me-1"></i>auto-clear: <span data-tests-autoclear-seconds>—</span>s</span>` : '',
                        body: latest && latest.stderrTail
                            ? (() => {
                                // Jest natívan "X passed, Y total" formaban irja — a felhasznalo
                                // logikailag elobb a totalt szeretne latni: "Y total, X passed".
                                const swapped = latest.stderrTail.replace(/(\d+)\s+passed,\s+(\d+)\s+total/g, '$2 total, $1 passed');
                                return `<pre class="json-block" style="max-height:280px;overflow:auto;white-space:pre-wrap;">${escapeHtml(swapped)}</pre>`;
                            })()
                            : `<pre class="json-block" style="max-height:280px;overflow:auto;">${latest ? tx('(Nincs stderr output)', '(No stderr output)') : tx('(Még nincs futás)', '(No run yet)')}</pre>`
                    })}
                </div>
            </div>

            <div class="mt-4">
                ${h.card({
                    title: tx('Futtatási előzmények', 'Run history'), icon: 'bi-clock-history',
                    noBodyPadding: true,
                    body: historyRows.length
                        ? `<table class="table mb-0"><thead><tr><th>ID</th><th>${tx('INDÍTOTTA', 'TRIGGERED BY')}</th><th>${tx('ÁLLAPOT', 'STATUS')}</th><th>PASS/TOTAL</th><th>FAIL</th><th>${tx('IDŐTARTAM', 'DURATION')}</th><th>${tx('INDULT', 'STARTED')}</th></tr></thead><tbody>${historyRows}</tbody></table>`
                        : `<div class="text-center text-secondary py-4">${t.historyLoaded ? tx('Meg nincs futasi elozmeny.', 'No run history yet.') : tx('Toltes...', 'Loading...')}</div>`
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
                icon: 'bi-gear-fill', title: tx('Beállítások', 'Settings'),
                subtitle: s.loaded ? tx(`Mentve: ${d.updatedAt ? new Date(d.updatedAt).toLocaleString('hu-HU') : '—'}`, `Saved: ${d.updatedAt ? (window.MattMesterI18n?.formatDateTime ? window.MattMesterI18n.formatDateTime(d.updatedAt) : new Date(d.updatedAt).toLocaleString('en-US')) : '—'}`) : tx('Általános platform paraméterek', 'General platform parameters')
            })}
            ${s.error ? `<div class="alert alert-danger">${escapeHtml(s.error)}</div>` : ''}
            ${s.loading
                ? `<div class="content-card text-center py-5"><i class="bi bi-arrow-repeat spin"></i> ${tx('Toltes...', 'Loading...')}</div>`
                : (!s.loaded
                    ? `<div class="content-card text-center py-5 text-secondary">${tx('Meg nincsenek betoltott beallitasok.', 'No settings loaded yet.')}</div>`
                    : h.card({
                        body: `
                            <form id="settingsForm" onsubmit="event.preventDefault(); submitSiteSettings();">
                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <label class="form-label" for="settingsSiteName">${tx('Oldal neve', 'Site name')}</label>
                                        <input type="text" class="form-control" id="settingsSiteName" maxlength="100" value="${escapeHtml(d.siteName || '')}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label" for="settingsSupportEmail">${tx('Support e-mail', 'Support e-mail')}</label>
                                        <input type="email" class="form-control" id="settingsSupportEmail" maxlength="150" value="${escapeHtml(d.supportEmail || '')}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label" for="settingsLanguage">${tx('Alapertelmezett nyelv', 'Default language')}</label>
                                        <select class="form-select" id="settingsLanguage">
                                            ${langs.map((l) => `<option value="${l.value}" ${l.selected ? 'selected' : ''}>${l.label}</option>`).join('')}
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label" for="settingsTimezone">${tx('Idozona', 'Timezone')}</label>
                                        <input type="text" class="form-control" id="settingsTimezone" maxlength="64" value="${escapeHtml(tzCurrent)}" required>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" id="settingsRegistration" ${d.registrationEnabled ? 'checked' : ''}>
                                            <label class="form-check-label" for="settingsRegistration">${tx('Regisztracio engedelyezve', 'Registration enabled')}</label>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" id="settingsMaintenance" ${d.maintenanceMode ? 'checked' : ''} onchange="onMaintenanceToggleChange(this.checked)">
                                            <label class="form-check-label text-warning" for="settingsMaintenance"><i class="bi bi-cone-striped me-1"></i>${tx('Karbantartasi mod', 'Maintenance mode')}</label>
                                        </div>
                                    </div>
                                </div>
                                <div class="alert alert-warning bg-warning bg-opacity-10 border-warning small mt-3 mb-3 ${d.maintenanceMode ? '' : 'd-none'}" id="settingsMaintenanceWarn">
                                    <i class="bi bi-exclamation-triangle-fill me-1"></i>
                                    ${tx('<strong>Figyelem:</strong> a karbantartasi mod aktivalasa minden NEM-admin usert kizar a platformrol.', '<strong>Warning:</strong> enabling maintenance mode locks out all non-admin users.')}
                                </div>
                                <div class="text-end">
                                    <button type="submit" class="btn btn-gold"><i class="bi bi-check2 me-1"></i>${tx('Beallitasok mentese', 'Save settings')}</button>
                                </div>
                            </form>
                        `
                    }))
            }
        `;
    }
};

