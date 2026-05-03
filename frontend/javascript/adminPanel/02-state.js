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
    alertsLoaded: false,          // GET /admin/alerts/recent legalabb egyszer lefutott
    alertsFilter: {               // Riasztasok oldal szuro state
        kind: '',                 // '' = all
        severity: '',             // '' = all
        ipAddress: '',
        includeDismissed: false
    },
    auditFilterIntent: null,      // alert -> audit naviglas: { ip, userId, sinceDate, untilDate }
    liveLogins: [],               // admin:security:login események + REST initial fetch (legújabb elöl)
    loginsLoaded: false,          // GET /admin/security/logins legalabb egyszer lefutott
    loginsFilter: {               // Bejelentkezesek oldal szuro state
        username: '',
        status: 'all',            // 'all' | 'success' | 'failed'
        ipAddress: '',
        country: '',              // '' = mind; ISO orszagkod (pl. 'HU', 'US') — geoip-lite altal felismert orszagok
        sinceDate: '',
        untilDate: ''
    },

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
    currentSectionId: null,

    // ─── Admin oldalak (6) közös state ───

    // Beallitasok
    siteSettings: {
        loaded: false, loading: false, error: null,
        data: null  // { siteName, supportEmail, defaultLanguage, timezone, registrationEnabled, maintenanceMode }
    },

    // Super admin lista
    adminsList: {
        loaded: false, loading: false, error: null,
        list: []
    },

    // Kepessegek
    abilities: {
        loaded: false, loading: false, error: null,
        list: [],
        editing: null  // { id, name, description, cooldownTurns } vagy null = uj
    },

    // Kozossegi kapcsolatok
    socialAdmin: {
        requestsLoaded: false, blocksLoaded: false, countsLoaded: false,
        loading: false, error: null,
        requests: [], blocks: [],
        counts: { totalFriendships: 0, pendingRequests: 0, activeBlocks: 0 }
    },

    // Jatszmak
    gamesAdmin: {
        loaded: false, loading: false, error: null,
        list: [], counts: { ongoing: 0, finished: 0, abandoned: 0, draw: 0 },
        filter: 'all',   // 'all' | 'ongoing' | 'finished' | 'abandoned'
        search: '',
        // Spectator allapot
        spectator: {
            gameId: null,
            game: null,         // teljes meccs adat (getGameById eredmenye)
            loading: false,
            error: null
        }
    },

    // Tesztek
    testsAdmin: {
        latestLoaded: false, historyLoaded: false,
        // `latest` ephemeral: csak a session ELEN (page reload reseteli, nem
        // perziszteljuk localStorage-ban) es csak a futtatas utan 1 percig
        // marad lathato (latestExpireTimerId). A History tabla ettol fuggetlenul
        // a backend DB-bol toltodik.
        latest: null,
        latestExpiresAt: null,
        latestExpireTimerId: null,   // 60s -> grace start
        latestTickerId: null,        // 1s pill update
        latestGraceTimerId: null,    // 2s grace -> teljes clear
        history: [],
        running: null,    // { runId, startedAt, elapsedMs } amíg fut
        loading: false, error: null
    }
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
// alertsList: ha mar volt sikeres GET /admin/alerts/recent fetch (state.alertsLoaded),
// soha tobbet nem mutatjuk a sample data-t — uresen marad ha a DB-ben tenyleg nincs alert.
// Az elso betoltesig (sample) a placeholder UI elkerulesere mutatjuk a SAMPLE-t.
const alertsList = () => {
    if (state.alertsLoaded) return state.liveAlerts;
    return state.liveAlerts.length ? state.liveAlerts : SAMPLE_ALERTS;
};

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

