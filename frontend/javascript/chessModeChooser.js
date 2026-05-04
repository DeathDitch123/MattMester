// Frontpage chess mode chooser — a TELJES játékmód-választás + matchmaking
// + friend invite az index.html-en történik. Az átirányítás `chess.html`-re
// CSAK akkor, amikor:
//   - bot meccs: rögtön a difficulty kiválasztása után
//   - PvP random queue: amikor a backend `chess:game:start` event-et küld (match)
//   - PvP friend: amikor a meghívott elfogadta (`chess:game:start`)
//
// A queue / invite közben a felhasználó A FRONTPAGE-EN MARAD; a modal mutatja
// a "Ellenfél keresése..." vagy "Várakozás a meghívottra..." állapotot.
//
// FONTOS: bot meccs MINDIG casual (ranked=false). A backend `/api/chess/new-bot`
// ignorálja a ranked field-et — itt sem mutatunk ranked toggle-t bot eset re.
// Az ELO szabaly: csak az IDOKORLATOS modok (rankedAllowed=true a backendből)
// adnak ELO-t. A vegtelen idős módoknál a ranked toggle disabled+kikapcsolt.

(function () {
    'use strict';

    const tx = (hu, en) => (window.MattMesterI18n?.tx ? window.MattMesterI18n.tx(hu, en) : hu);

    const STATE = {
        modes: null,         // /api/chess/modes válasz
        difficulties: null,  // /api/chess/difficulties válasz
        selectedMode: null,
        selectedModeMeta: null,
        selectedRanked: true,
        modalEl: null,
        bound: false,
        socket: null,        // window.MattMesterSocket?.socket cache
        listenersBound: false,
        // Aktív queue / invite info — cancel/timeout esetén kell
        queueActive: false,
        inviteTargetUserId: 0,
        inviteTargetName: '',
        // Navigálás folyamatban — ne hívja meg az unmount-listener a leave-t
        navigatingToGame: false
    };

    // ─────────────────────────────────────────────────────────────────
    // API hívások
    // ─────────────────────────────────────────────────────────────────

    async function fetchModes() {
        const res = await fetch('/api/chess/modes', { credentials: 'same-origin' });
        if (!res.ok) throw new Error(tx('Mód-lista letöltése sikertelen.', 'Failed to load mode list.'));
        return res.json();
    }

    async function fetchDifficulties() {
        const res = await fetch('/api/chess/difficulties', { credentials: 'same-origin' });
        if (!res.ok) throw new Error(tx('Nehézségi szintek letöltése sikertelen.', 'Failed to load difficulty levels.'));
        const data = await res.json();
        return data.szintek || [];
    }

    async function fetchUserElo() {
        try {
            const res = await fetch('/api/chess/user-elo', { credentials: 'same-origin' });
            if (!res.ok) return { elo: 800, bejelentkezve: false };
            return res.json();
        } catch (_) {
            return { elo: 800, bejelentkezve: false };
        }
    }

    async function fetchFriends() {
        try {
            const res = await fetch('/api/friends/list?status=friend', { credentials: 'same-origin' });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || tx('Barátlista hiba.', 'Friend list error.'));
            return data.data || [];
        } catch (_) {
            return [];
        }
    }

    // First-tab-priority guard: lekerdezi a backend-tol, hogy a felhasznalonak
    // van-e mar aktiv meccse, es az "live" (masik tab elen jatszik) vagy "orphan"
    // (60s+ ota inaktiv / disconnect grace alatt). Visszater true-val ha a hivo
    // flow ALLJON LE (modal vagy redirect tortent), false-szal ha mehet tovabb.
    //
    //   - !hasActive            → false (nincs aktiv meccs, indulhat uj)
    //   - hasActive && isLive   → modal "Egy masik oldalrol mar fut..." → return true
    //   - hasActive && !isLive  → AUTO-REJOIN: sessionStorage pendingMatch flag
    //     + redirect chess.html-re. A 60s window alatt a felhasznalo igy
    //     visszater a futo meccsbe (PvP: chess:rejoin emit; bot: ?type=botRejoin
    //     URL parameter). → return true
    //
    // Network hiba eseten engedjuk tovabbmenni a flow-t — a backend /new-bot
    // ill. socket guard ujrarancigalja a usert ha kell.
    async function osszbeBlokkolHaAktivMeccsVan() {
        let data;
        try {
            const res = await fetch('/api/chess/active', { credentials: 'same-origin' });
            if (!res.ok) return false;
            data = await res.json();
        } catch (_) {
            return false;
        }
        if (!data || !data.hasActive) return false;

        if (data.isLive) {
            // Masik tab elen jatszik → modal blokkol
            if (typeof window.mmAlert === 'function') {
                await window.mmAlert({
                    title: tx('Már fut egy meccsed', 'You already have an active match'),
                    message: tx('Egy másik oldalról már fut egy játék ezzel a felhasználóval. Fejezd be vagy add fel előbb a meccset.', 'A game is already running for this user from another tab. Finish or resign that match first.')
                });
            }
            return true;
        }

        // 60s window alatt vagyunk: automatikus rejoin a meccshez
        try {
            window.sessionStorage.setItem('mattmester.chessPendingMatch', JSON.stringify({
                gameId: Number(data.gameId) || 0,
                ts: Date.now()
            }));
        } catch (_) {}
        STATE.navigatingToGame = true;
        const target = (data.type === 'bot' && data.gameId)
            ? `/chess_barold/html/chess.html?type=botRejoin&gameId=${encodeURIComponent(data.gameId)}`
            : '/chess_barold/html/chess.html';
        window.location.href = target;
        return true;
    }

    // ─────────────────────────────────────────────────────────────────
    // Step navigáció + subtitle
    // ─────────────────────────────────────────────────────────────────

    function hideAllSteps() {
        const steps = STATE.modalEl?.querySelectorAll('.cmc-step');
        if (!steps) return;
        steps.forEach((s) => s.classList.add('hidden'));
    }

    function showStep(name) {
        hideAllSteps();
        const el = STATE.modalEl?.querySelector(`[data-step="${name}"]`);
        if (el) el.classList.remove('hidden');
        // Subtitle: az 1. lépésen "Válassz játékmódot", másutt a kiválasztott mód neve
        updateSubtitle(name);
    }

    function updateSubtitle(stepName) {
        const subtitle = STATE.modalEl?.querySelector('#cmcMainSubtitle');
        if (!subtitle) return;
        if (stepName === 'modes') {
            subtitle.textContent = tx('Válassz játékmódot', 'Choose a game mode');
        } else {
            const meta = STATE.selectedModeMeta;
            if (meta) {
                const idoTag = meta.ido === null ? tx('∞ idő', '∞ time') : tx(`${meta.ido / 60} perc`, `${meta.ido / 60} min`);
                subtitle.innerHTML = `<strong style="color:#c9a84c">${escapeHtml(meta.nev)}</strong> <span style="color:#8b949e;font-size:0.85rem">— ${escapeHtml(idoTag)}${meta.rankedAllowed ? '' : ', casual'}</span>`;
            }
        }
    }

    function setFeedback(msg, kind = 'info') {
        const el = STATE.modalEl?.querySelector('#cmcFeedback');
        if (!el) return;
        el.className = `cmc-feedback ${kind ? 'cmc-feedback-' + kind : ''}`;
        el.textContent = msg || '';
    }

    // ─────────────────────────────────────────────────────────────────
    // Renderek
    // ─────────────────────────────────────────────────────────────────

    function renderModes() {
        const list = STATE.modalEl?.querySelector('#cmcModeList');
        if (!list) return;
        list.innerHTML = '';
        const modes = STATE.modes?.modes || {};
        for (const k in modes) {
            const m = modes[k];
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'cmc-mode-card';
            const idoTag = m.ido === null
                ? `<span class="cmc-tag cmc-tag-time">${tx('∞ idő', '∞ time')}</span>`
                : `<span class="cmc-tag cmc-tag-time">${tx(`${m.ido / 60} perc`, `${m.ido / 60} min`)}</span>`;
            const abilityTag = m.abilities
                ? `<span class="cmc-tag cmc-tag-abilities">${tx('Képességes', 'Abilities')}</span>`
                : `<span class="cmc-tag">${tx('Klasszikus', 'Classical')}</span>`;
            const rankedTag = m.rankedAllowed
                ? `<span class="cmc-tag cmc-tag-ranked">${tx('Ranked', 'Ranked')}</span>`
                : `<span class="cmc-tag cmc-tag-casual">${tx('Casual', 'Casual')}</span>`;
            card.innerHTML = `
                <span class="cmc-mode-name">${escapeHtml(m.nev)}</span>
                <span class="cmc-mode-tags">${abilityTag}${idoTag}${rankedTag}</span>
            `;
            card.addEventListener('click', () => {
                STATE.selectedMode = k;
                STATE.selectedModeMeta = m;
                STATE.selectedRanked = !!m.rankedAllowed;
                showStep('opponent');
            });
            list.appendChild(card);
        }
    }

    function renderDifficulties() {
        const list = STATE.modalEl?.querySelector('#cmcDifficultyList');
        if (!list) return;
        list.innerHTML = '';
        const szintek = STATE.difficulties || [];
        szintek.forEach((s) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cmc-diff-btn';
            btn.innerHTML = `
                <span class="cmc-diff-name">${escapeHtml(s.nev)}</span>
                <span class="cmc-diff-elo">${tx('Ajánlott ELO', 'Suggested ELO')}: ${Number(s.elo) || 0}</span>
            `;
            btn.addEventListener('click', () => {
                navigateToBotGame(s.szint);
            });
            list.appendChild(btn);
        });
    }

    function renderFriends(list) {
        const wrap = STATE.modalEl?.querySelector('#cmcFriendList');
        if (!wrap) return;
        wrap.innerHTML = '';
        if (!list.length) {
            wrap.innerHTML = `<p class="cmc-empty">${tx('Nincs barátod a listában. Adj hozzá a profilodon.', "You don't have any friends listed. Add some in your profile.")}</p>`;
            return;
        }
        list.forEach((f) => {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'cmc-friend-btn';
            row.innerHTML = `
                <span class="cmc-friend-name">${escapeHtml(f.username || '')}</span>
                <span class="cmc-friend-elo">${tx('ELO', 'ELO')}: ${Number(f.elo) || 0}</span>
            `;
            row.addEventListener('click', () => {
                startFriendInvite(f.id, f.username);
            });
            wrap.appendChild(row);
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // Socket — queue + invite az index oldalon
    // ─────────────────────────────────────────────────────────────────

    function getSocket() {
        if (STATE.socket && STATE.socket.connected) return STATE.socket;
        STATE.socket = window.MattMesterSocket?.socket || null;
        return STATE.socket;
    }

    function bindSocketListeners() {
        const socket = getSocket();
        if (!socket || STATE.listenersBound) return;
        STATE.listenersBound = true;

        // Match (queue VAGY invite-accept) → navigálás chess.html-re a meccshez
        socket.on('chess:game:start', (data) => {
            if (!data || !data.gameId) return;
            // Csak akkor reagáljunk ha mi vártuk (queue VAGY invite). Ha a user
            // egy mási tab-en már a chess oldalon van, és ott is jött game:start,
            // akkor itt a frontpage-en nem akarjuk újra-átirányítani.
            if (!STATE.queueActive && !STATE.inviteTargetUserId) return;
            STATE.navigatingToGame = true;
            STATE.queueActive = false;
            STATE.inviteTargetUserId = 0;
            try {
                window.sessionStorage.setItem('mattmester.chessPendingMatch', JSON.stringify({
                    gameId: data.gameId,
                    ts: Date.now()
                }));
            } catch (_) {}
            window.location.href = '/chess_barold/html/chess.html';
        });

        // Queue confirm — már be vagyunk a sorban, csak feedback frissítése
        socket.on('chess:queue:joined', () => {
            if (STATE.queueActive) {
                setFeedback(tx('Sorban — ellenfél keresése folyamatban…', 'In queue — searching for opponent…'), 'info');
            }
        });
        socket.on('chess:queue:left', () => {
            STATE.queueActive = false;
        });

        // Invite válaszok (csak akkor érdekes, ha mi vagyunk a meghívó)
        socket.on('chess:invite:declined', () => {
            if (STATE.inviteTargetUserId) {
                setFeedback(tx('Az ellenfél elutasította a meghívást.', 'The opponent declined the invitation.'), 'error');
                STATE.inviteTargetUserId = 0;
                showStep('pvp');
            }
        });
        socket.on('chess:invite:expired', (data) => {
            if (STATE.inviteTargetUserId && data && data.targetUserId === STATE.inviteTargetUserId) {
                setFeedback(tx('A meghívás lejárt — nem reagált 60 másodperc alatt.', 'The invitation expired — no response within 60 seconds.'), 'error');
                STATE.inviteTargetUserId = 0;
                showStep('pvp');
            }
        });
        socket.on('chess:invite:cancelled', () => {
            if (STATE.inviteTargetUserId) {
                STATE.inviteTargetUserId = 0;
            }
        });

        // Backend hibaüzenetek
        socket.on('chess:error', (data) => {
            const msg = (data && data.uzenet) || tx('Ismeretlen hiba.', 'Unknown error.');
            // First-tab-priority: a "Mar van aktiv ..." backend uzenet azt
            // jelenti, hogy a felhasznalonak van mar aktiv meccse egy masik
            // tab-on. Korabban a frontend automatikusan rejoin-olt (atvitte a
            // user-t a chess.html-re), most viszont az ELSO TAB elvez prioritast,
            // a 2. tab maradjon a chooser-en es kapjon custom modal-t.
            const isActiveMatchError = /m[aá]r van akt[ií]v/i.test(msg);
            if (isActiveMatchError) {
                STATE.queueActive = false;
                STATE.inviteTargetUserId = 0;
                showStep('pvp');
                setFeedback('');
                if (typeof window.mmAlert === 'function') {
                    window.mmAlert({
                        title: tx('Már fut egy meccsed', 'You already have an active match'),
                        message: tx('Egy másik oldalról már fut egy játék ezzel a felhasználóval. Fejezd be vagy add fel előbb a meccset.', 'A game is already running for this user from another tab. Finish or resign that match first.')
                    });
                }
                return;
            }
            setFeedback(msg, 'error');
            // Hiba esetén állítsuk vissza a queueActive / inviteTarget flag-et,
            // hogy a felhasználó újra próbálkozhasson
            if (STATE.queueActive) {
                STATE.queueActive = false;
                showStep('pvp');
            } else if (STATE.inviteTargetUserId) {
                STATE.inviteTargetUserId = 0;
                showStep('pvp');
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────
    // Queue start/cancel
    // ─────────────────────────────────────────────────────────────────

    async function startQueue() {
        const socket = getSocket();
        if (!socket) {
            setFeedback(tx('Nincs socket kapcsolat — frissítsd az oldalt.', 'No socket connection — please refresh the page.'), 'error');
            return;
        }
        // First-tab-priority: emit ELOTT ellenorizzuk, hogy van-e mar aktiv meccs.
        // Ha igen → modal + maradunk a pvp step-en (NE indítsunk queue-t).
        if (await osszbeBlokkolHaAktivMeccsVan()) return;
        bindSocketListeners();

        STATE.queueActive = true;
        showStep('queue');
        const label = STATE.modalEl?.querySelector('#cmcQueueModeName');
        if (label && STATE.selectedModeMeta) {
            label.textContent = STATE.selectedModeMeta.nev;
        }
        setFeedback(tx('Csatlakozás a sorhoz…', 'Joining queue…'), 'info');
        socket.emit('chess:queue:join', {
            mode: STATE.selectedMode,
            ranked: STATE.selectedRanked
        });
    }

    function cancelQueue() {
        const socket = getSocket();
        if (socket && STATE.queueActive) {
            socket.emit('chess:queue:leave');
        }
        STATE.queueActive = false;
        setFeedback('');
        showStep('pvp');
    }

    // ─────────────────────────────────────────────────────────────────
    // Friend invite start/cancel
    // ─────────────────────────────────────────────────────────────────

    async function startFriendInvite(targetUserId, targetName) {
        const socket = getSocket();
        if (!socket) {
            setFeedback(tx('Nincs socket kapcsolat — frissítsd az oldalt.', 'No socket connection — please refresh the page.'), 'error');
            return;
        }
        // First-tab-priority: invite emit ELOTT ellenorizzuk, hogy van-e mar
        // aktiv meccs. Ha igen → modal + maradunk a friends step-en.
        if (await osszbeBlokkolHaAktivMeccsVan()) return;
        bindSocketListeners();

        STATE.inviteTargetUserId = Number(targetUserId) || 0;
        STATE.inviteTargetName = String(targetName || '');
        showStep('inviteWaiting');
        const nameEl = STATE.modalEl?.querySelector('#cmcInviteTargetName');
        if (nameEl) nameEl.textContent = STATE.inviteTargetName;
        const modeEl = STATE.modalEl?.querySelector('#cmcInviteModeName');
        if (modeEl && STATE.selectedModeMeta) modeEl.textContent = STATE.selectedModeMeta.nev;
        setFeedback(tx('Meghívás elküldve — várakozás a válaszra…', 'Invitation sent — waiting for reply…'), 'info');
        socket.emit('chess:invite', {
            targetUserId: STATE.inviteTargetUserId,
            mode: STATE.selectedMode,
            ranked: STATE.selectedRanked
        });
    }

    function cancelFriendInvite() {
        const socket = getSocket();
        if (socket && STATE.inviteTargetUserId) {
            socket.emit('chess:invite:cancel');
        }
        STATE.inviteTargetUserId = 0;
        setFeedback('');
        showStep('pvp');
    }

    // ─────────────────────────────────────────────────────────────────
    // Navigáció chess.html-re query-paraméterekkel (BOT eset)
    // ─────────────────────────────────────────────────────────────────

    async function navigateToBotGame(difficulty) {
        // First-tab-priority: a chess.html-re navigalas ELOTT ellenorizzuk,
        // hogy van-e mar aktiv meccs. Ha igen → modal + maradunk a chooser-en.
        if (await osszbeBlokkolHaAktivMeccsVan()) return;

        const params = new URLSearchParams({
            type: 'bot',
            mode: STATE.selectedMode,
            difficulty: String(difficulty)
        });
        STATE.navigatingToGame = true;
        window.location.href = `/chess_barold/html/chess.html?${params.toString()}`;
    }

    // ─────────────────────────────────────────────────────────────────
    // Helper
    // ─────────────────────────────────────────────────────────────────

    // Delegate-elve a `_utils.js`-be — ha valamiért még nem töltődött be (régebbi
    // page-betöltési race), egysoros fallback inline div+textContent. A normál
    // user-flow-ban a _utils.js mindig elérhető a többi script ELŐTT.
    function escapeHtml(s) {
        if (window.MattMesterUtils && window.MattMesterUtils.escapeHtml) {
            return window.MattMesterUtils.escapeHtml(s);
        }
        const div = document.createElement('div');
        div.textContent = String(s == null ? '' : s);
        return div.innerHTML;
    }

    // ─────────────────────────────────────────────────────────────────
    // Open / close / event-binding
    // ─────────────────────────────────────────────────────────────────

    // A modal HTML-t inject-eljük ha még nincs a DOM-ban — így ANY oldalon (frontpage,
    // profile, stb.) elég csak a script-et betölteni és meghívni az open()-t.
    function ensureModalInDom() {
        let el = document.getElementById('chessModeChooserModal');
        if (el) return el;
        const wrap = document.createElement('div');
        wrap.innerHTML = MODAL_HTML.trim();
        el = wrap.firstElementChild;
        document.body.appendChild(el);
        return el;
    }

    const MODAL_HTML = `
<div id="chessModeChooserModal" class="cmc-modal" role="dialog" aria-modal="true" aria-labelledby="cmcTitle">
    <div class="cmc-overlay" data-action="cmc-close"></div>
    <div class="cmc-content">
        <button type="button" class="cmc-close" data-action="cmc-close" aria-label="Bezárás" data-i18n-attr="aria-label:common.close">×</button>
        <h2 id="cmcTitle" class="cmc-title"><i class="bi bi-king-fill"></i> <span data-i18n="cmc.new_match">Új meccs</span></h2>
        <p id="cmcMainSubtitle" class="cmc-subtitle" data-i18n="cmc.choose_mode">Válassz játékmódot</p>
        <div class="cmc-step" data-step="modes">
            <div id="cmcModeList" class="cmc-mode-list"></div>
        </div>
        <div class="cmc-step hidden" data-step="opponent">
            <button type="button" class="cmc-action-btn" id="cmcBtnBot">
                <span class="cmc-icon">🤖</span><span class="cmc-label" data-i18n="cmc.vs_bot">Robot ellen</span>
            </button>
            <div style="height:0.5rem"></div>
            <button type="button" class="cmc-action-btn" id="cmcBtnPvp">
                <span class="cmc-icon">👥</span><span class="cmc-label" data-i18n="cmc.vs_player">Játékos ellen</span>
            </button>
            <button type="button" class="cmc-back" data-back="modes" data-i18n="cmc.back">← Vissza</button>
        </div>
        <div class="cmc-step hidden" data-step="botDifficulty">
            <p class="cmc-section-hint"><span data-i18n="cmc.bot_difficulty">Robot nehézség</span> <small style="color:#8b949e" data-i18n="cmc.casual_no_elo">(casual, ELO nem frissül)</small></p>
            <div id="cmcDifficultyList"></div>
            <button type="button" class="cmc-back" data-back="opponent" data-i18n="cmc.back">← Vissza</button>
        </div>
        <div class="cmc-step hidden" data-step="pvp">
            <div class="cmc-ranked">
                <span><span class="cmc-ranked-label" data-i18n="cmc.ranked">Ranked</span><br><span class="cmc-ranked-hint" data-i18n="cmc.ranked_hint">ELO frissül (csak időkorlátos módoknál)</span></span>
                <label class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" id="cmcRankedToggle" checked></label>
            </div>
            <button type="button" class="cmc-action-btn" id="cmcBtnPvpFriend">
                <span class="cmc-icon">👤</span><span class="cmc-label" data-i18n="cmc.invite_friend">Barát meghívása</span>
            </button>
            <div style="height:0.5rem"></div>
            <button type="button" class="cmc-action-btn" id="cmcBtnPvpRandom">
                <span class="cmc-icon">🎲</span><span class="cmc-label" data-i18n="cmc.random_opp">Random ellenfél</span>
            </button>
            <button type="button" class="cmc-back" data-back="opponent" data-i18n="cmc.back">← Vissza</button>
        </div>
        <div class="cmc-step hidden" data-step="friends">
            <p class="cmc-section-hint" data-i18n="cmc.choose_opp">Válassz ellenfelet</p>
            <div id="cmcFriendList"></div>
            <button type="button" class="cmc-back" data-back="pvp" data-i18n="cmc.back">← Vissza</button>
        </div>
        <div class="cmc-step hidden" data-step="queue">
            <p class="cmc-section-hint"><span data-i18n="cmc.searching_opp">Ellenfél keresése</span> — <strong id="cmcQueueModeName">…</strong></p>
            <div class="cmc-spinner-wrap"><div class="cmc-spinner"></div></div>
            <button type="button" class="cmc-back" id="cmcBtnQueueCancel" data-i18n="common.cancel">Mégsem</button>
        </div>
        <div class="cmc-step hidden" data-step="inviteWaiting">
            <p class="cmc-section-hint"><span data-i18n="cmc.waiting">Várakozás</span> — <strong id="cmcInviteTargetName">…</strong> <span data-i18n="cmc.for_response">válaszára</span> <small style="color:#8b949e">(<span id="cmcInviteModeName">…</span>)</small></p>
            <div class="cmc-spinner-wrap"><div class="cmc-spinner"></div></div>
            <button type="button" class="cmc-back" id="cmcBtnInviteCancel" data-i18n="cmc.cancel_invite">Meghívás visszavonása</button>
        </div>
        <div id="cmcFeedback" class="cmc-feedback" aria-live="polite"></div>
        <div class="cmc-elo-display"><span data-i18n="cmc.your_elo">A te ELO-d</span>: <strong id="cmcEloValue">800</strong></div>
    </div>
</div>`;

    async function open() {
        if (!STATE.modalEl) {
            STATE.modalEl = ensureModalInDom();
            if (!STATE.modalEl) return;
        }

        bindEvents();
        // Socket-listenereket NYISÁSKOR is bekötjük — a meghívás-fogadás
        // lehet hogy a chooser-en kívül történik (chessInviteGlobal.js
        // kezeli az invite:received-et), de a confirm + outgoing flow itt él.
        bindSocketListeners();

        // AKTIV-MECCS GUARD: mielott chooser-t mutatunk, kuldjunk egy
        // `chess:rejoin` emit-et. Ha a felhasznalonak aktiv PvP meccse van,
        // a `chessInviteGlobal.js` chess:game:start handler-e ATIRANYIT a
        // chess.html-re mielott a chooser-tartalom betoltodne. A felhasznalo
        // igy NEM ragad be a chooser-en akkor sem ha BACK-gombbal navigalt.
        // A modal-megnyitas megtortenik, de ha aktiv meccs van, a navigacio
        // ~50-100ms-on belul atvisz — futo flash, nem ragado allapot.
        const socket = getSocket();
        if (socket && socket.connected && !aSakkOldalon()) {
            try { socket.emit('chess:rejoin'); } catch (_) {}
        }

        STATE.modalEl.classList.add('is-open');
        document.body.classList.add('cmc-open');

        showStep('modes');
        setFeedback('');

        if (!STATE.modes) {
            try {
                STATE.modes = await fetchModes();
            } catch (e) {
                setFeedback(tx('Nem sikerült betölteni a játékmódokat. Próbáld újra.', 'Failed to load game modes. Please try again.'), 'error');
                return;
            }
        }
        renderModes();

        const userData = await fetchUserElo();
        const eloEl = STATE.modalEl.querySelector('#cmcEloValue');
        if (eloEl) eloEl.textContent = String(userData.elo || 800);
    }

    // A chess.html-en a main.js sajat flow-ja van (overlay + rejoin), igy itt
    // nem duplikaljuk az aktiv-meccs guard rejoin-emit-jet. Ha a chooser-t a
    // chess.html-rol nyitjuk (game-end "Uj jatek" gomb), a main.js mar hivta
    // a pvpAllapotReset-et — nincs aktiv meccs, nem kell rejoin emit.
    function aSakkOldalon() {
        try {
            return window.location.pathname.includes('/chess_barold/');
        } catch (_) {
            return false;
        }
    }

    function close() {
        if (!STATE.modalEl) return;
        // Ha a user bezarja a modal-t aktív queue / invite közben → leave/cancel
        if (STATE.queueActive) {
            const socket = getSocket();
            if (socket) socket.emit('chess:queue:leave');
            STATE.queueActive = false;
        }
        if (STATE.inviteTargetUserId && !STATE.navigatingToGame) {
            const socket = getSocket();
            if (socket) socket.emit('chess:invite:cancel');
            STATE.inviteTargetUserId = 0;
        }
        STATE.modalEl.classList.remove('is-open');
        document.body.classList.remove('cmc-open');
    }

    function bindEvents() {
        if (STATE.bound || !STATE.modalEl) return;
        STATE.bound = true;

        // Több `[data-action="cmc-close"]` elem van (X gomb + overlay), mindkettőre kell listener
        STATE.modalEl.querySelectorAll('[data-action="cmc-close"]').forEach((el) => {
            el.addEventListener('click', close);
        });

        // Bot meccs MINDIG casual — nem mutatunk ranked toggle-t
        STATE.modalEl.querySelector('#cmcBtnBot')?.addEventListener('click', async () => {
            STATE.selectedRanked = false;
            showStep('botDifficulty');
            if (!STATE.difficulties) {
                try {
                    STATE.difficulties = await fetchDifficulties();
                } catch (e) {
                    setFeedback(tx('Nem sikerült betölteni a nehézségeket.', 'Failed to load difficulties.'), 'error');
                    return;
                }
            }
            renderDifficulties();
        });

        STATE.modalEl.querySelector('#cmcBtnPvp')?.addEventListener('click', () => {
            const rankedToggle = STATE.modalEl.querySelector('#cmcRankedToggle');
            const meta = STATE.selectedModeMeta;
            if (rankedToggle) {
                if (meta && meta.rankedAllowed) {
                    rankedToggle.checked = true;
                    rankedToggle.disabled = false;
                    STATE.selectedRanked = true;
                } else {
                    // ∞ idős mód — csak casual
                    rankedToggle.checked = false;
                    rankedToggle.disabled = true;
                    STATE.selectedRanked = false;
                }
            }
            showStep('pvp');
        });

        STATE.modalEl.querySelector('#cmcRankedToggle')?.addEventListener('change', (e) => {
            STATE.selectedRanked = !!e.target.checked;
        });

        STATE.modalEl.querySelector('#cmcBtnPvpFriend')?.addEventListener('click', async () => {
            showStep('friends');
            const wrap = STATE.modalEl.querySelector('#cmcFriendList');
            if (wrap) wrap.innerHTML = `<p class="cmc-empty">${tx('Betöltés…', 'Loading…')}</p>`;
            const friends = await fetchFriends();
            renderFriends(friends);
        });

        STATE.modalEl.querySelector('#cmcBtnPvpRandom')?.addEventListener('click', () => {
            startQueue();
        });

        // Queue cancel
        STATE.modalEl.querySelector('#cmcBtnQueueCancel')?.addEventListener('click', cancelQueue);
        // Invite cancel
        STATE.modalEl.querySelector('#cmcBtnInviteCancel')?.addEventListener('click', cancelFriendInvite);

        STATE.modalEl.querySelectorAll('[data-back]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-back');
                showStep(target);
            });
        });

        // Eltávolításkor leave / cancel — pl. ha a felhasználó elnavigál máshol
        window.addEventListener('beforeunload', () => {
            if (STATE.navigatingToGame) return; // a meccsre megyünk, ne kanceljünk
            const socket = getSocket();
            if (socket && STATE.queueActive) socket.emit('chess:queue:leave');
            if (socket && STATE.inviteTargetUserId) socket.emit('chess:invite:cancel');
        });
    }

    window.MattMesterChessModeChooser = {
        open,
        close
    };
})();
