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
                            ? tx('Az admin jogosultságod visszavonásra került.', 'Your admin privileges have been revoked.')
                            : tx('Az admin munkamenet lezárult.', 'The admin session has ended.');
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

            [
                'admin:alert:unauthorized',
                'admin:alert:rate_escalated',
                'admin:alert:token_invalid',
                'admin:alert:suspicious_pattern',
                'admin:alert:user_banned',
                'admin:alert:user_unbanned',
                'admin:alert:user_deleted'
            ].forEach((eventName) => {
                sock.on(eventName, (payload = {}) => {
                    const kind = eventName.replace('admin:alert:', '');
                    const enriched = {
                        // A backend payload-ja: { alertId, occurredAt, kind, severity, ip, userId, endpoint, detail }
                        // A frontend renderAlertRow ezt varja: { id, occurredAt, kind, severity, ip, userId, endpoint, detail, dismissedAt }
                        id: payload.alertId || payload.id || null,
                        occurredAt: payload.occurredAt || new Date().toISOString(),
                        kind,
                        severity: payload.severity || (kind === 'suspicious_pattern' || kind === 'user_deleted' ? 'critical' : kind === 'user_unbanned' ? 'info' : 'warning'),
                        ip: payload.ip || payload.ipAddress || null,
                        userId: payload.userId || null,
                        endpoint: payload.endpoint || null,
                        detail: payload.detail || null,
                        dismissedAt: null
                    };
                    state.liveAlerts.unshift(enriched);
                    if (state.liveAlerts.length > MAX_LIVE_BUFFER) state.liveAlerts.length = MAX_LIVE_BUFFER;
                    onLiveAlertUpdate(enriched);
                });
            });

            // Multi-admin sync: ha egy mas admin kioltott alert(eke)t, frissitsuk a sajat listankat is.
            sock.on('admin:alert:dismissed', (payload = {}) => {
                const alertId = Number(payload.alertId) || 0;
                if (!alertId) return;
                state.liveAlerts = state.liveAlerts.map((a) =>
                    Number(a.id) === alertId ? { ...a, dismissedAt: payload.at || new Date().toISOString() } : a
                );
                if (!state.alertsFilter?.includeDismissed) {
                    state.liveAlerts = state.liveAlerts.filter((a) => Number(a.id) !== alertId);
                }
                if (state.currentSectionId === 'alerts') {
                    showSection('alerts', null, { silent: true });
                }
                refreshAdminBellBadge();
            });

            sock.on('admin:alert:dismissed-all', () => {
                if (state.alertsFilter?.includeDismissed) {
                    state.liveAlerts = state.liveAlerts.map((a) =>
                        a.dismissedAt ? a : { ...a, dismissedAt: new Date().toISOString() }
                    );
                } else {
                    state.liveAlerts = [];
                }
                if (state.currentSectionId === 'alerts') {
                    showSection('alerts', null, { silent: true });
                }
                refreshAdminBellBadge();
            });

            sock.on('admin:alert:restored', (payload = {}) => {
                const alertId = Number(payload.alertId) || 0;
                if (!alertId) return;
                state.liveAlerts = state.liveAlerts.map((a) =>
                    Number(a.id) === alertId ? { ...a, dismissedAt: null, dismissedByUserId: null } : a
                );
                if (state.currentSectionId === 'alerts') {
                    showSection('alerts', null, { silent: true });
                }
                refreshAdminBellBadge();
            });

            // Profilkep moderacio broadcast: a tobbi admin tab fuggo lista azonnal frissuljon.
            // A dashboard 'tickPendingImages' szamlalot az admin:stats:tick (5s) tartja szinkronban,
            // de a Profilkepek view tablazatat csak ezzel az esemennyel tudjuk azonnal ujrahuzni.
            sock.on('admin:profile-image:reviewed', () => {
                if (state.currentSectionId === 'profileImageReview') {
                    window.MattMesterAdminProfileImages?.refresh?.();
                }
            });

            // Chat moderacio: uj jelolt uzenet erkezett (profanity-filter maszkolt) VAGY
            // mas admin felulbiralta (allow/delete) — mindketto eseten frissitsuk a listat.
            sock.on('admin:chat:flagged', () => {
                if (state.currentSectionId === 'chats') {
                    window.MattMesterAdminChatModeration?.refresh?.();
                }
            });
            sock.on('admin:chat:reviewed', () => {
                if (state.currentSectionId === 'chats') {
                    window.MattMesterAdminChatModeration?.refresh?.();
                }
            });
            sock.on('admin:chat:blocklist-updated', (payload = {}) => {
                if (typeof showToast === 'function' && payload?.added) {
                    showToast(tx(`Chat blocklist: +${payload.added} szó.`, `Chat blocklist: +${payload.added} word(s).`), 'info', 'bi-shield-check');
                }
            });
            // Player-vs-player bejelentes erkezett vagy admin frissitette: ha a
            // moderationReports panel aktiv, csendben refresh-eljuk.
            sock.on('admin:reports:new', (payload = {}) => {
                if (state.currentSectionId === 'moderationReports') {
                    window.MattMesterAdminReports?.refresh?.();
                } else if (typeof showToast === 'function') {
                    showToast(tx('Új player-bejelentés érkezett.', 'New player report received.'), 'info', 'bi-flag');
                }
            });
            sock.on('admin:reports:updated', () => {
                if (state.currentSectionId === 'moderationReports') {
                    window.MattMesterAdminReports?.refresh?.();
                }
            });
            // 3-csapas trágárság auto-ban: a rendszer automatikusan tiltott egy felhasznalot.
            sock.on('admin:chat:auto-ban', (payload = {}) => {
                if (typeof showToast === 'function') {
                    const tier = payload?.banType === 'perma'
                        ? tx('végleges (perma)', 'permanent (perma)')
                        : payload?.banType === 'temp_10d'
                            ? tx('10 napos', '10-day')
                            : payload?.banType === 'temp_1d'
                                ? tx('1 napos', '1-day')
                                : tx('auto', 'auto');
                    const username = payload?.username || `#${payload?.userId || '?'}`;
                    showToast(
                        tx(`Auto-ban: ${escapeHtml(username)} — ${payload?.strikeCount}. csapás (${tier} tiltás).`, `Auto-ban: ${escapeHtml(username)} — strike #${payload?.strikeCount} (${tier} ban).`),
                        'warning',
                        'bi-shield-fill-exclamation'
                    );
                }
                // A user-listat is frissitsuk, mert mostantol "tiltott" allapotban van.
                if (typeof loadAdminUsersList === 'function') {
                    loadAdminUsersList({ silent: true });
                }
                if (state.currentSectionId === 'chats') {
                    window.MattMesterAdminChatModeration?.refresh?.();
                }
            });

            // Soft-delete restore broadcast: a tobbi admin tab user-listja + a userDelete
            // varolista is frissuljon. A 'users', 'userDetail', 'userBan', 'userDelete'
            // szekciok mind a state.users.list-bol szurnek, igy mindegyiket re-renderelni kell.
            sock.on('admin:user:deletion-restored', () => {
                loadAdminUsersList({ silent: true }).then(() => {
                    const refreshable = ['users', 'userDetail', 'userBan', 'userDelete'];
                    if (refreshable.includes(state.currentSectionId)) {
                        showSection(state.currentSectionId, null, { silent: true });
                    }
                });
            });

            // Bejelentkezesi feed real-time push (login + login_failed event-ek).
            // A backend a payload-ban mar `location` (geoip + kategoria) es `device` mezovel
            // kuldi az enriched adatot — a frontendnek nincs sajat geoIP DB-je.
            sock.on('admin:security:login', (payload = {}) => {
                const enriched = {
                    id: payload.id || null,
                    userId: payload.userId || null,
                    username: payload.username || '—',
                    eventType: payload.eventType || 'login',
                    success: payload.success === true,
                    ip: payload.ip || null,
                    userAgent: payload.userAgent || null,
                    device: payload.device || parseUserAgentClient(payload.userAgent),
                    location: payload.location || classifyIpClient(payload.ip),
                    risk: payload.eventType === 'login_failed' ? 'high' : 'low',
                    occurredAt: payload.occurredAt || new Date().toISOString()
                };
                state.liveLogins.unshift(enriched);
                if (state.liveLogins.length > 200) state.liveLogins.length = 200;
                if (state.currentSectionId === 'security') {
                    showSection('security', null, { silent: true });
                }
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

