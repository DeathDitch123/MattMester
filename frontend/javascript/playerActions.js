// Player-actions: kozos modul a "jatekosra kattintva" workflow-hoz.
// - Action modal nyitasa: profil megtekintese / barat hozzaadasa / jelentes
// - Report modal: kategoria kivalasztasa + opcionalis uzenet, POST /api/reports
// - Recent opponents lista (Rocket League stilus) renderelese profile.html-en
//
// Teljes ujrahasznosithatosagra epul: a search modal es a recent opponents
// lista is ezt hasznalja, hogy egy valodi action-flow jojjon a kattintasbol.

(function () {
    'use strict';

    if (window.MattMesterPlayerActions) return; // egyszer init

    const tx = (hu, en) => (window.MattMesterI18n?.tx ? window.MattMesterI18n.tx(hu, en) : hu);

    function getReportCategories() {
        return [
            { value: 'cheating',    label: tx('Csalás (engine / külső segítség)', 'Cheating (engine / outside help)') },
            { value: 'toxicity',    label: tx('Toxikusság / sértegetés', 'Toxicity / insults') },
            { value: 'harassment',  label: tx('Zaklatás', 'Harassment') },
            { value: 'spam',        label: tx('Spam / reklám', 'Spam / advertising') },
            { value: 'unfair_play', label: tx('Fair play megsértése (pl. szándékos vesztés)', 'Fair play violation (e.g. intentional losing)') },
            { value: 'other',       label: tx('Egyéb', 'Other') }
        ];
    }
    const REPORT_CATEGORIES = getReportCategories();

    let actionModalEl = null;
    let reportModalEl = null;
    // currentTarget: { userId, username, profileImage, friendStatus, lastGameId? }
    // A lastGameId opcionalisan be van toltve a recent_opponents listanal -
    // a report flow ezt csatolhatja a bejelenteshez evidence-kent.
    let currentTarget = null;

    // ---------- Toast helper ----------
    function showToast(message, variant = 'info') {
        // Egyszeru, nem-blokkolo toast. Custom HTML, NEM browser-natívo
        // (a memory_no_native_dialogs feedback alapjan).
        try {
            const container = ensureToastContainer();
            const el = document.createElement('div');
            el.className = `mm-toast mm-toast-${variant}`;
            el.textContent = String(message || '');
            container.appendChild(el);
            requestAnimationFrame(() => el.classList.add('mm-toast-show'));
            setTimeout(() => {
                el.classList.remove('mm-toast-show');
                setTimeout(() => el.remove(), 300);
            }, 4000);
        } catch (e) { /* swallow */ }
    }

    function ensureToastContainer() {
        let container = document.getElementById('mmToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'mmToastContainer';
            container.style.cssText = 'position:fixed;top:84px;right:1rem;z-index:9999;display:flex;flex-direction:column;gap:.5rem;pointer-events:none;';
            document.body.appendChild(container);

            const style = document.createElement('style');
            style.textContent = `
                .mm-toast { background:#161b22; border:1px solid #30363d; color:#e6edf3; padding:.7rem 1rem; border-radius:8px; font-size:.9rem; box-shadow:0 6px 20px rgba(0,0,0,.45); pointer-events:auto; opacity:0; transform:translateX(20px); transition:opacity .3s, transform .3s; max-width:320px; }
                .mm-toast-show { opacity:1; transform:translateX(0); }
                .mm-toast-success { border-color:rgba(34,197,94,.4); color:#4ade80; }
                .mm-toast-danger  { border-color:rgba(220,53,69,.4); color:#ff8b95; }
                .mm-toast-warning { border-color:rgba(201,168,76,.4); color:#c9a84c; }
            `;
            document.head.appendChild(style);
        }
        return container;
    }

    // ---------- Action modal (profil / barat / jelentes) ----------
    function buildActionModal() {
        if (actionModalEl) return actionModalEl;
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'playerActionModal';
        modal.tabIndex = -1;
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="background:#161b22;border:1px solid #30363d;color:#e6edf3;">
                    <div class="modal-header" style="border-bottom:1px solid #30363d;">
                        <h5 class="modal-title d-flex align-items-center gap-2">
                            <i class="bi bi-person-circle"></i>
                            <span id="playerActionModalTitle">${tx('Játékos műveletek', 'Player actions')}</span>
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="d-flex align-items-center gap-3 mb-3">
                            <img id="playerActionAvatar" src="/profile_pictures/default.png"
                                style="width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #30363d;" alt="">
                            <div>
                                <div id="playerActionUsername" style="font-weight:700;font-size:1.1rem;">—</div>
                                <div id="playerActionStatus" style="color:#8b949e;font-size:.85rem;">—</div>
                            </div>
                        </div>
                        <div class="d-grid gap-2">
                            <button type="button" class="btn btn-outline-light" id="playerActionViewProfileBtn">
                                <i class="bi bi-eye me-2"></i>${tx('Profil megtekintése', 'View profile')}
                            </button>
                            <button type="button" class="btn btn-outline-success" id="playerActionFriendBtn">
                                <i class="bi bi-person-plus me-2"></i>${tx('Barátnak jelölés', 'Add as friend')}
                            </button>
                            <button type="button" class="btn btn-outline-danger" id="playerActionReportBtn">
                                <i class="bi bi-flag me-2"></i>${tx('Jelentés', 'Report')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        actionModalEl = modal;

        modal.querySelector('#playerActionViewProfileBtn').addEventListener('click', onViewProfileClick);
        modal.querySelector('#playerActionFriendBtn').addEventListener('click', onAddFriendClick);
        modal.querySelector('#playerActionReportBtn').addEventListener('click', onReportClick);
        return modal;
    }

    function buildReportModal() {
        if (reportModalEl) return reportModalEl;
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'playerReportModal';
        modal.tabIndex = -1;
        modal.setAttribute('aria-hidden', 'true');
        const optionsHtml = getReportCategories().map((c) => `<option value="${c.value}">${c.label}</option>`).join('');
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="background:#161b22;border:1px solid #30363d;color:#e6edf3;">
                    <div class="modal-header" style="border-bottom:1px solid #30363d;">
                        <h5 class="modal-title d-flex align-items-center gap-2">
                            <i class="bi bi-flag-fill text-danger"></i>
                            <span>${tx('Játékos jelentése', 'Report player')}</span>
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert" style="background:rgba(220,53,69,.08);border:1px solid rgba(220,53,69,.3);color:#f0d5d8;">
                            ${tx('Bejelentett játékos:', 'Reported player:')} <strong id="playerReportTargetName">—</strong>
                        </div>
                        <label class="form-label" style="color:#e6edf3;">${tx('Kategória', 'Category')}</label>
                        <select id="playerReportCategory" class="form-select"
                            style="background:#0d1117;color:#e6edf3;border:1px solid #30363d;">
                            ${optionsHtml}
                        </select>

                        <!-- Meccs-csatolas: csak akkor lathato, ha a target lastGameId-vel
                             jott (pl. recent opponents listabol). Default ON-on indul a
                             cheating / unfair_play kategorianal, mert ezek meccs-bizonyitekot
                             igenyelnek, az adminoknak konkret meccset kell tudni nezni. -->
                        <div id="playerReportGameAttachWrap" class="mt-3 d-none"
                            style="background:rgba(13,202,240,.06);border:1px solid rgba(13,202,240,.25);border-radius:8px;padding:.75rem 1rem;">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" id="playerReportAttachGame">
                                <label class="form-check-label" for="playerReportAttachGame">
                                    <strong>${tx('Bizonyíték:', 'Evidence:')}</strong> ${tx('a legutóbbi közös meccs csatolása', 'attach your latest match together')}
                                    <span class="text-secondary small d-block">
                                        ${tx('Az admin a PGN-t és a lépéseket átnézheti. Cheating / unfair play kategóriánál erősen ajánlott.', 'Admins can review the PGN and moves. Strongly recommended for cheating / unfair-play categories.')}
                                    </span>
                                </label>
                            </div>
                            <div class="text-info small mt-1" id="playerReportGameInfo" style="display:none;"></div>
                        </div>

                        <label class="form-label mt-3" style="color:#e6edf3;">${tx('Részletek (opcionális, max 1000 karakter)', 'Details (optional, max 1000 characters)')}</label>
                        <textarea id="playerReportMessage" rows="4" class="form-control"
                            maxlength="1000"
                            placeholder="${tx('Mi történt? (opcionális, de segít az adminoknak)', 'What happened? (optional, but helps admins)')}"
                            style="background:#0d1117;color:#e6edf3;border:1px solid #30363d;resize:vertical;"></textarea>
                        <div class="form-text" style="color:#8b949e;">
                            ${tx('Az adminisztrátorok átnézik a bejelentésedet. Hamis bejelentésért NEM kapsz büntetést — bátran használd ha valami zavar.', 'Administrators will review your report. You will NOT be punished for a false report — feel free to use it whenever something bothers you.')}
                        </div>
                        <div id="playerReportFeedback" class="alert mt-3 d-none" role="alert"></div>
                    </div>
                    <div class="modal-footer" style="border-top:1px solid #30363d;">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${tx('Mégse', 'Cancel')}</button>
                        <button type="button" class="btn btn-danger" id="playerReportSubmitBtn">
                            <i class="bi bi-send me-2"></i>${tx('Bejelentés elküldése', 'Send report')}
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        reportModalEl = modal;

        modal.querySelector('#playerReportSubmitBtn').addEventListener('click', onReportSubmit);

        // Kategoria valtaskor: cheating/unfair_play -> attach default ON,
        // egyebkent default OFF (de a user toggle-elheti).
        modal.querySelector('#playerReportCategory').addEventListener('change', (e) => {
            const cat = String(e.target.value || '');
            const checkbox = document.getElementById('playerReportAttachGame');
            if (checkbox && currentTarget?.lastGameId) {
                checkbox.checked = (cat === 'cheating' || cat === 'unfair_play');
            }
        });
        return modal;
    }

    function getActionModalInstance() {
        const el = buildActionModal();
        return window.bootstrap?.Modal?.getOrCreateInstance(el) || null;
    }

    function getReportModalInstance() {
        const el = buildReportModal();
        return window.bootstrap?.Modal?.getOrCreateInstance(el) || null;
    }

    // ---------- Public: openPlayerActionModal ----------
    function openPlayerActionModal(userInfo) {
        try {
            currentTarget = {
                userId: Number(userInfo?.userId) || 0,
                username: String(userInfo?.username || ''),
                profileImage: userInfo?.profileImage || '/profile_pictures/default.png',
                friendStatus: userInfo?.friendStatus || 'none',
                lastGameId: Number(userInfo?.lastGameId) || 0
            };
            if (!currentTarget.userId) return;

            buildActionModal();
            buildReportModal();

            const titleEl = document.getElementById('playerActionModalTitle');
            const usernameEl = document.getElementById('playerActionUsername');
            const statusEl = document.getElementById('playerActionStatus');
            const avatarEl = document.getElementById('playerActionAvatar');
            const friendBtn = document.getElementById('playerActionFriendBtn');

            if (titleEl) titleEl.textContent = currentTarget.username || tx('Játékos', 'Player');
            if (usernameEl) usernameEl.textContent = currentTarget.username || '—';
            if (avatarEl) avatarEl.src = currentTarget.profileImage;

            const statusLabel = friendStatusLabel(currentTarget.friendStatus);
            if (statusEl) statusEl.textContent = statusLabel;
            if (friendBtn) {
                if (currentTarget.friendStatus === 'friend') {
                    friendBtn.disabled = true;
                    friendBtn.innerHTML = `<i class="bi bi-check-circle me-2"></i>${tx('Már barátok vagytok', 'Already friends')}`;
                } else if (currentTarget.friendStatus === 'pending_outgoing') {
                    friendBtn.disabled = true;
                    friendBtn.innerHTML = `<i class="bi bi-hourglass me-2"></i>${tx('Függő barátkérés', 'Pending friend request')}`;
                } else if (currentTarget.friendStatus === 'pending_incoming') {
                    friendBtn.disabled = false;
                    friendBtn.innerHTML = `<i class="bi bi-check2 me-2"></i>${tx('Függő kérés elfogadása', 'Accept pending request')}`;
                } else if (currentTarget.friendStatus === 'blocked' || currentTarget.friendStatus === 'blocked_by_them') {
                    friendBtn.disabled = true;
                    friendBtn.innerHTML = `<i class="bi bi-slash-circle me-2"></i>${tx('Nem elérhető', 'Not available')}`;
                } else {
                    friendBtn.disabled = false;
                    friendBtn.innerHTML = `<i class="bi bi-person-plus me-2"></i>${tx('Barátnak jelölés', 'Add as friend')}`;
                }
            }

            const inst = getActionModalInstance();
            if (inst) inst.show();
        } catch (error) {
            console.warn('openPlayerActionModal hiba:', error);
        }
    }

    function friendStatusLabel(status) {
        switch (status) {
            case 'friend': return tx('Barát', 'Friend');
            case 'pending_outgoing': return tx('Barátkérés elküldve', 'Friend request sent');
            case 'pending_incoming': return tx('Barátkérést küldött neked', 'Sent you a friend request');
            case 'blocked': return tx('Blokkolva', 'Blocked');
            case 'blocked_by_them': return tx('Blokkolt téged', 'Blocked you');
            default: return tx('Nincs kapcsolat', 'No connection');
        }
    }

    // ---------- Action handlers ----------
    function onViewProfileClick() {
        if (!currentTarget?.userId) return;
        // Profil oldal nyitas: a profile.html lapot a player-id query stringgel
        // tudja a meglevo profile.js betolteni masik felhasznalo profilkent.
        // Hopefully a profile.js mar tamogatja a ?userId=X parametert; ha nem,
        // fallback-kent egyszeruen csak az aktualis tab marad nyitva es egy
        // info toast megy.
        const url = `/html/profile.html?userId=${encodeURIComponent(currentTarget.userId)}`;
        const modal = getActionModalInstance();
        if (modal) modal.hide();
        window.location.href = url;
    }

    async function onAddFriendClick() {
        if (!currentTarget?.userId) return;
        const friendBtn = document.getElementById('playerActionFriendBtn');
        if (friendBtn) friendBtn.disabled = true;
        try {
            const endpoint = currentTarget.friendStatus === 'pending_incoming'
                ? '/api/friends/accept'
                : '/api/friends/add';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ targetUserId: currentTarget.userId })
            });
            const data = await response.json().catch(() => ({}));
            if (response.ok && data?.success) {
                showToast(tx('Barátkérés elküldve.', 'Friend request sent.'), 'success');
                if (friendBtn) {
                    friendBtn.innerHTML = `<i class="bi bi-hourglass me-2"></i>${tx('Függő barátkérés', 'Pending friend request')}`;
                }
                getActionModalInstance()?.hide();
            } else {
                showToast(data?.message || tx('Nem sikerült elküldeni a barátkérést.', 'Could not send the friend request.'), 'danger');
                if (friendBtn) friendBtn.disabled = false;
            }
        } catch (error) {
            showToast(tx('Hálózati hiba a barátkérés küldésekor.', 'Network error while sending the friend request.'), 'danger');
            if (friendBtn) friendBtn.disabled = false;
        }
    }

    function onReportClick() {
        if (!currentTarget?.userId) return;
        // Action modal-t lecsukjuk, helyette a report-modal nyilik.
        const actionInst = getActionModalInstance();
        if (actionInst) actionInst.hide();

        buildReportModal();
        const targetNameEl = document.getElementById('playerReportTargetName');
        const feedbackEl = document.getElementById('playerReportFeedback');
        const messageEl = document.getElementById('playerReportMessage');
        const categoryEl = document.getElementById('playerReportCategory');
        const attachWrap = document.getElementById('playerReportGameAttachWrap');
        const attachCheckbox = document.getElementById('playerReportAttachGame');
        const gameInfoEl = document.getElementById('playerReportGameInfo');

        if (targetNameEl) targetNameEl.textContent = currentTarget.username || '—';
        if (feedbackEl) {
            feedbackEl.classList.add('d-none');
            feedbackEl.textContent = '';
        }
        if (messageEl) messageEl.value = '';
        if (categoryEl) categoryEl.value = REPORT_CATEGORIES[0].value;

        // Game-attach UI: csak akkor jelenitjuk meg, ha van lastGameId
        // (recent opponents-bol jott). Default cheating-re indul, ami alapertelmezetten
        // kategoria-ON eseten csatolja a meccset.
        if (attachWrap) {
            if (currentTarget.lastGameId) {
                attachWrap.classList.remove('d-none');
                if (attachCheckbox) attachCheckbox.checked = true; // cheating default
                if (gameInfoEl) {
                    gameInfoEl.style.display = '';
                    gameInfoEl.innerHTML = `<i class="bi bi-controller me-1"></i>${tx('Csatolt meccs:', 'Attached match:')} <strong>#${currentTarget.lastGameId}</strong>`;
                }
            } else {
                attachWrap.classList.add('d-none');
                if (attachCheckbox) attachCheckbox.checked = false;
                if (gameInfoEl) gameInfoEl.style.display = 'none';
            }
        }

        // Kis delay a Bootstrap belso animaciok miatt (ne ugorjon at semmin).
        setTimeout(() => {
            const reportInst = getReportModalInstance();
            if (reportInst) reportInst.show();
        }, 200);
    }

    async function onReportSubmit() {
        if (!currentTarget?.userId) return;
        const submitBtn = document.getElementById('playerReportSubmitBtn');
        const feedbackEl = document.getElementById('playerReportFeedback');
        const categoryEl = document.getElementById('playerReportCategory');
        const messageEl = document.getElementById('playerReportMessage');
        const category = categoryEl?.value || 'other';
        const message = (messageEl?.value || '').trim().slice(0, 1000);

        if (submitBtn) submitBtn.disabled = true;
        if (feedbackEl) {
            feedbackEl.classList.add('d-none');
            feedbackEl.textContent = '';
        }

        // Csatolt meccs: ha a checkbox be van pipalva ES van lastGameId-nk.
        // A backend ujraellenorzi hogy a bejelento + bejelentett tenyleg ket
        // resztvevoje volt-e a meccsnek - ha nem, csendben drop-pal a gameId.
        const attachCheckbox = document.getElementById('playerReportAttachGame');
        const attachGame = !!(attachCheckbox && attachCheckbox.checked && currentTarget.lastGameId);
        const gameIdToSend = attachGame ? Number(currentTarget.lastGameId) || 0 : 0;

        try {
            const body = {
                reportedUserId: currentTarget.userId,
                category,
                message: message || null
            };
            if (gameIdToSend) body.gameId = gameIdToSend;

            const response = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok && data?.success) {
                showToast(tx('Bejelentés rögzítve. Köszönjük.', 'Report submitted. Thank you.'), 'success');
                getReportModalInstance()?.hide();
            } else {
                if (feedbackEl) {
                    feedbackEl.className = 'alert alert-danger mt-3';
                    feedbackEl.textContent = data?.message || tx('Nem sikerült elküldeni a bejelentést.', 'Could not send the report.');
                    feedbackEl.classList.remove('d-none');
                }
            }
        } catch (error) {
            if (feedbackEl) {
                feedbackEl.className = 'alert alert-danger mt-3';
                feedbackEl.textContent = tx('Hálózati hiba a bejelentés küldésekor.', 'Network error while sending the report.');
                feedbackEl.classList.remove('d-none');
            }
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    // ---------- Recent opponents lista renderelese ----------
    async function loadRecentOpponents() {
        const list = document.getElementById('recentOpponentsList');
        const empty = document.getElementById('recentOpponentsEmpty');
        if (!list) return;

        list.innerHTML = `<div class="text-secondary text-center py-3">${tx('Betöltés...', 'Loading...')}</div>`;
        try {
            const response = await fetch('/api/recentOpponents?limit=25', {
                credentials: 'same-origin'
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data?.success) {
                list.innerHTML = `<div class="text-danger text-center py-3">${escapeHtml(data?.message || tx('Hiba a lista betöltésekor.', 'Error loading the list.'))}</div>`;
                return;
            }

            const opponents = Array.isArray(data.data) ? data.data : [];
            if (!opponents.length) {
                list.innerHTML = '';
                if (empty) empty.classList.remove('d-none');
                return;
            }
            if (empty) empty.classList.add('d-none');

            list.innerHTML = opponents.map((o) => renderOpponentRow(o)).join('');

            list.querySelectorAll('[data-recent-opponent]').forEach((btn) => {
                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    const userId = Number(btn.dataset.userId) || 0;
                    const username = btn.dataset.username || '';
                    const profileImage = btn.dataset.profileImage || '/profile_pictures/default.png';
                    const lastGameId = Number(btn.dataset.lastGameId) || 0;
                    if (userId) openPlayerActionModal({ userId, username, profileImage, lastGameId });
                });
            });
        } catch (error) {
            list.innerHTML = `<div class="text-danger text-center py-3">${tx('Hálózati hiba.', 'Network error.')}</div>`;
        }
    }

    function renderOpponentRow(o) {
        const safeName = escapeHtml(o.username || '—');
        const avatar = escapeHtml(o.profileImage || '/profile_pictures/default.png');
        const elo = Number(o.elo || 0);
        const matches = Number(o.matchCount || 1);
        const lastPlayed = o.lastPlayedAt ? formatRelative(o.lastPlayedAt) : '—';
        const matchesLabel = matches > 1 ? tx(`${matches} meccs`, `${matches} matches`) : tx('1 meccs', '1 match');
        const lastGameId = Number(o.lastGameId || 0);
        return `
            <button type="button"
                class="recent-opponent-row"
                data-recent-opponent
                data-user-id="${o.userId}"
                data-username="${safeName}"
                data-profile-image="${avatar}"
                data-last-game-id="${lastGameId}">
                <img src="${avatar}" alt="" class="recent-opponent-avatar">
                <div class="recent-opponent-meta">
                    <div class="recent-opponent-name">${safeName}</div>
                    <div class="recent-opponent-sub">
                        <span class="recent-opponent-elo">ELO ${elo}</span>
                        <span class="recent-opponent-dot">·</span>
                        <span class="recent-opponent-matches">${matchesLabel}</span>
                        <span class="recent-opponent-dot">·</span>
                        <span class="recent-opponent-time">${escapeHtml(lastPlayed)}</span>
                    </div>
                </div>
                <i class="bi bi-chevron-right recent-opponent-chevron"></i>
            </button>
        `;
    }

    function formatRelative(iso) {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '—';
        const diff = Date.now() - d.getTime();
        const min = Math.floor(diff / 60000);
        if (min < 1) return tx('most', 'now');
        if (min < 60) return tx(`${min} perce`, `${min} min ago`);
        const h = Math.floor(min / 60);
        if (h < 24) return tx(`${h} órája`, `${h} h ago`);
        const day = Math.floor(h / 24);
        if (day < 30) return tx(`${day} napja`, `${day} d ago`);
        return window.MattMesterI18n?.formatDate ? window.MattMesterI18n.formatDate(d) : d.toLocaleDateString('hu-HU');
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // ---------- Init: minimum CSS injection a recent-opponents listahoz ----------
    function injectStyles() {
        if (document.getElementById('mmPlayerActionsStyles')) return;
        const style = document.createElement('style');
        style.id = 'mmPlayerActionsStyles';
        style.textContent = `
            .recent-opponent-row { display:flex; align-items:center; gap:.75rem; width:100%; padding:.65rem .85rem;
                background:transparent; border:1px solid transparent; border-radius:8px; color:#e6edf3;
                text-align:left; transition:background-color .15s, border-color .15s; cursor:pointer; }
            .recent-opponent-row + .recent-opponent-row { margin-top:.35rem; }
            .recent-opponent-row:hover { background:rgba(201,168,76,.06); border-color:rgba(201,168,76,.25); }
            .recent-opponent-avatar { width:36px; height:36px; border-radius:50%; object-fit:cover;
                border:1px solid rgba(255,255,255,.12); flex-shrink:0; }
            .recent-opponent-meta { flex:1; min-width:0; }
            .recent-opponent-name { font-weight:600; color:#e6edf3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
            .recent-opponent-sub { font-size:.78rem; color:#8b949e; display:flex; align-items:center; gap:.4rem; flex-wrap:wrap; }
            .recent-opponent-elo { color:#c9a84c; font-weight:600; }
            .recent-opponent-dot { opacity:.5; }
            .recent-opponent-chevron { color:#8b949e; opacity:.55; flex-shrink:0; }
        `;
        document.head.appendChild(style);
    }

    document.addEventListener('DOMContentLoaded', () => {
        injectStyles();
        // Auto-load: csak akkor, ha a recent-opponents lista DOM-eleme letezik
        // az adott oldalon (profile.html-en igen, index.html-en nem feltetlenul).
        const list = document.getElementById('recentOpponentsList');
        if (list) {
            loadRecentOpponents().catch((err) => console.warn('loadRecentOpponents:', err));
        }
    });

    window.MattMesterPlayerActions = {
        REPORT_CATEGORIES,
        openPlayerActionModal,
        loadRecentOpponents,
        showToast
    };
})();
