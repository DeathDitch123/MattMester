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
    if (sectionId === 'chats') {
        window.MattMesterAdminChatModeration?.refresh?.();
    }
    if (sectionId === 'moderationReports') {
        window.MattMesterAdminReports?.refresh?.();
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
    if (sectionId === 'userBan' && !silent) {
        if (!Array.isArray(state.users.list) || state.users.list.length === 0) {
            // A userBan view a state.users.list-bol szuri ki az aktiv tiltasokat — ha
            // ures, betoltjuk, MAJD ujrarendereljuk hogy az aktiv tiltasok megjelenjenek.
            loadAdminUsersList({ silent: true }).then(() => {
                if (state.currentSectionId === 'userBan') {
                    showSection('userBan', null, { silent: true });
                }
            });
        }
    }
    if (sectionId === 'userDelete' && !silent) {
        // A userDelete view jobboldali "Torlesre varolista" panelje a state.users.list-bol
        // szuri ki a soft-deleted user-eket. Ha ures, betoltjuk + ujrarenderelunk.
        if (!Array.isArray(state.users.list) || state.users.list.length === 0) {
            loadAdminUsersList({ silent: true }).then(() => {
                if (state.currentSectionId === 'userDelete') {
                    showSection('userDelete', null, { silent: true });
                }
            });
        }
    }
    if (sectionId === 'alerts' && !silent) {
        // Csak NEM-silent renderelesnel toltsuk ujra az alerteket (initial nav, manual frissites).
        // Silent re-render-t a socket eventek vagy a loadAlerts fetch-utan trigger-eli, azoknak
        // mar friss adatuk van — uj fetch infinit loopot okozna.
        loadAlerts();
    }
    if (sectionId === 'security' && !silent) {
        // Bejelentkezesek: auto-load nem-silent navigation-on. (Silent re-render = socket
        // event vagy fetch-after callback, nem trigger-elhet ujabb fetch-et.)
        loadLogins();
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

