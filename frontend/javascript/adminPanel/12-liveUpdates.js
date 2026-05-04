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
    refreshAdminBellBadge();
}

// Felso harang ikon piros badge frissitese — el nem rejtett (active) riasztas
// szam alapjan. Ha nincs aktiv, a badge `d-none`-os, kulonben mutatja a
// szamot (max 99+). A WS push, dismiss, dismiss-all es initial fetch utan
// is hivodik.
function refreshAdminBellBadge() {
    const badge = document.getElementById('adminBellBadge');
    if (!badge) return;
    const active = (state.liveAlerts || []).filter((a) => !a.dismissedAt).length;
    if (active <= 0) {
        badge.classList.add('d-none');
        badge.textContent = '0';
    } else {
        badge.classList.remove('d-none');
        badge.textContent = active > 99 ? '99+' : String(active);
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

        // Az 'Aktív játszma' kartya konstans 'success' szinezesu — nem
        // valt 'empty' allapotba ha nincs eppen meccs (lasd 06-sections.js
        // dashboard renderet). Csak a hint szovege valtozik a tobbi kartyahoz
        // hasonloan, nem a teljes vizualis paletta.

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

// Section-aware refresh map: minden szekciohoz a saját adatainak frissítese.
// A "Kézi frissítés" gomb a stats tick mellett az aktualis szekciot is frissiti,
// igy a felhasznalonak nem kell kulon "Frissites" gombot keresnie.
function refreshCurrentSection() {
    const id = state.currentSectionId;
    try {
        switch (id) {
            case 'users':              return loadAdminUsersList({ silent: true });
            case 'alerts':             return loadAlerts();
            case 'security':           return loadLogins();
            case 'chats':              return window.MattMesterAdminChatModeration?.refresh?.();
            case 'profileImageReview': return window.MattMesterAdminProfileImages?.refresh?.();
            case 'moderationReports':  return window.MattMesterAdminReports?.refresh?.();
            case 'tests':              return loadAdminTests();
            case 'games':              return loadAdminGames();
            case 'abilities':          return loadAdminAbilities();
            case 'superAdmin':         return loadAdminAdminsList();
            case 'friends':            return loadAdminSocial();
            case 'settings':           return loadSiteSettings();
            // 'auditLog' es 'dashboard' WS auto-update-tel mukodnek, nincs sajat REST loader
            default: return null;
        }
    } catch (err) {
        console.warn('refreshCurrentSection hiba:', err.message);
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
            // Az aktualis szekcio sajat adatait is frissitjuk (section-aware refresh).
            refreshCurrentSection();
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

