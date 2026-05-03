/* =============================================================
   Admin oldalak (6) — fetch + handler fuggvenyek
   ============================================================= */

// Section-loader: amikor a felhasznalo egy oldalra navigal, elinditja a fetch-et.
// FONTOS: a `loading` mezot IS ellenorizni kell, kulonben a loaderek belso
// re-render hivasai (showSection silent) ujra triggernek a maybeLoad-ot, mielott
// a `loaded` true-ra valtana → vegtelen loop.
function maybeLoadSectionData(sectionId) {
    if (!state.adminToken) return;
    try {
        switch (sectionId) {
            case 'settings':
                if (!state.siteSettings.loaded && !state.siteSettings.loading) loadSiteSettings();
                break;
            case 'superAdmin':
                if (!state.adminsList.loaded && !state.adminsList.loading) loadAdminAdminsList();
                break;
            case 'abilities':
                if (!state.abilities.loaded && !state.abilities.loading) loadAdminAbilities();
                break;
            case 'friends':
                if (!state.socialAdmin.requestsLoaded && !state.socialAdmin.loading) loadAdminSocial();
                break;
            case 'games':
                if (!state.gamesAdmin.loaded && !state.gamesAdmin.loading) loadAdminGames();
                break;
            case 'tests':
                if (!state.testsAdmin.latestLoaded && !state.testsAdmin.loading) loadAdminTests();
                break;
        }
    } catch (err) {
        console.warn('maybeLoadSectionData hiba:', err.message);
    }
}

// ─── Helper: standard admin GET fetch + JSON parse ───
async function adminFetchJson(path, options = {}) {
    const opts = {
        method: options.method || 'GET',
        credentials: 'same-origin',
        headers: adminAuthHeaders(options.headers || { Accept: 'application/json' })
    };
    if (options.body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(options.body);
    }
    const res = await fetch(path, opts);
    let json = null;
    try { json = await res.json(); } catch (_) { json = null; }
    if (!res.ok) {
        if ((res.status === 401 || res.status === 403) && json?.code) {
            const flow = getAdminAuthFlow();
            if (flow?.handleAdminAuthError && flow.handleAdminAuthError(json.code)) {
                throw new Error(json.message || 'Auth hiba');
            }
        }
        throw new Error(json?.message || `HTTP ${res.status}`);
    }
    if (json && json.success === false) {
        throw new Error(json.message || 'Ismeretlen szerver hiba.');
    }
    return json;
}

// ────────────── BEALLITASOK ──────────────

async function loadSiteSettings() {
    state.siteSettings.loading = true;
    state.siteSettings.error = null;
    if (state.currentSectionId === 'settings') showSection('settings', null, { silent: true });
    try {
        const json = await adminFetchJson('/api/admin/settings');
        state.siteSettings.data = json.data;
        state.siteSettings.loaded = true;
        state.siteSettings.loading = false;
        if (state.currentSectionId === 'settings') showSection('settings', null, { silent: true });
    } catch (err) {
        state.siteSettings.loading = false;
        state.siteSettings.error = err.message;
        if (state.currentSectionId === 'settings') showSection('settings', null, { silent: true });
    }
}

async function submitSiteSettings() {
    console.log('[settings] submitSiteSettings hivva');
    const form = document.getElementById('settingsForm');
    if (!form) {
        console.warn('[settings] form elem nem talalhato — abort');
        return;
    }
    const before = state.siteSettings.data || {};
    const patch = {
        siteName:            document.getElementById('settingsSiteName')?.value?.trim() || '',
        supportEmail:        document.getElementById('settingsSupportEmail')?.value?.trim() || '',
        defaultLanguage:     document.getElementById('settingsLanguage')?.value || 'hu',
        timezone:            document.getElementById('settingsTimezone')?.value?.trim() || 'Europe/Budapest',
        registrationEnabled: Boolean(document.getElementById('settingsRegistration')?.checked),
        maintenanceMode:     Boolean(document.getElementById('settingsMaintenance')?.checked)
    };
    console.log('[settings] before=', before, 'patch=', patch);
    const enablingMaintenance = patch.maintenanceMode && !before.maintenanceMode;
    const desc = enablingMaintenance
        ? '<strong class="text-warning">Figyelem:</strong> a karbantartasi mod aktivalasa minden NEM-admin user-t kizar a platformrol!<br>'
        : '';
    console.log('[settings] openCriticalAction("settings.edit") hivasa');
    // FONTOS: a patch-et az `extras` paraméterben adjuk at — különben az
    // openCriticalAction felülírja a state.criticalActionData-t a sajat objektumaval.
    openCriticalAction('settings.edit', `Beallitasok mentese${enablingMaintenance ? ' (karbantartas BE)' : ''}`, null, { patch });
    // openCriticalAction megnyitja a modalt; a leiras-szoveg felulirasahoz toldjunk:
    setTimeout(() => {
        const descEl = document.getElementById('criticalActionDescription');
        if (descEl) {
            descEl.innerHTML = `${desc}<strong class="text-white">Muvelet:</strong> <code class="text-gold">settings.edit</code><br><strong class="text-white">Mezok:</strong> ${Object.keys(patch).join(', ')}`;
        }
    }, 30);
}

async function applySettingsEditFromCritical(reason) {
    console.log('[settings] applySettingsEditFromCritical hivva, reason=', reason);
    const patch = state.criticalActionData?.patch;
    if (!patch) {
        console.warn('[settings] state.criticalActionData.patch hianyzik — abort');
        return;
    }
    try {
        console.log('[settings] PUT /api/admin/settings inditasa, body=', { ...patch, reason });
        const json = await adminFetchJson('/api/admin/settings', {
            method: 'PUT',
            body: { ...patch, reason }
        });
        console.log('[settings] PUT sikeres, valasz=', json);
        state.siteSettings.data = json.data;
        state.siteSettings.loaded = true;
        showToast('Beallitasok mentve.', 'success', 'bi-check-circle-fill');
        if (state.currentSectionId === 'settings') showSection('settings', null, { silent: true });
    } catch (err) {
        console.error('[settings] PUT hiba:', err);
        showToast(err.message || 'Hiba a settings mentes soran.', 'danger');
    }
}

// ────────────── SUPER ADMIN ──────────────

async function loadAdminAdminsList() {
    state.adminsList.loading = true;
    state.adminsList.error = null;
    if (state.currentSectionId === 'superAdmin') showSection('superAdmin', null, { silent: true });
    try {
        const json = await adminFetchJson('/api/admin/admins/');
        state.adminsList.list = Array.isArray(json.data) ? json.data : [];
        state.adminsList.loaded = true;
        state.adminsList.loading = false;
        if (state.currentSectionId === 'superAdmin') showSection('superAdmin', null, { silent: true });
    } catch (err) {
        state.adminsList.loading = false;
        state.adminsList.error = err.message;
        if (state.currentSectionId === 'superAdmin') showSection('superAdmin', null, { silent: true });
    }
}

function openAdminGrantPicker() {
    const modalEl = document.getElementById('adminGrantPickerModal');
    const inputEl = document.getElementById('adminGrantUsername');
    if (modalEl && window.bootstrap?.Modal) {
        if (inputEl) inputEl.value = '';
        new window.bootstrap.Modal(modalEl).show();
    } else {
        showToast('A grant modal meg nem kesz.', 'info');
    }
}

async function adminGrantPickerSubmit() {
    const username = document.getElementById('adminGrantUsername')?.value?.trim();
    const makeSuper = Boolean(document.getElementById('adminGrantMakeSuper')?.checked);
    if (!username) { showToast('Felhasznalonev kotelezo.', 'warning'); return; }
    try {
        // Mivel nincs lookup-by-username admin endpoint, hasznaljuk a meglevo /admin/users/list-et
        const json = await adminFetchJson('/api/admin/users/list');
        const target = (json.data || []).find((u) => String(u.username).toLowerCase() === username.toLowerCase());
        if (!target) { showToast(`Nincs ilyen felhasznalo: ${username}`, 'warning'); return; }
        const modalEl = document.getElementById('adminGrantPickerModal');
        if (modalEl && window.bootstrap?.Modal) window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
        // openCriticalAction felulirja a state.criticalActionData-t — minden szukseges
        // mezot az `extras` paramen keresztul kell atadni, hogy megmaradjon.
        openCriticalAction('admin.grant', target.username, target.id, { makeSuper });
    } catch (err) {
        showToast(err.message || 'Hiba a user keresenel.', 'danger');
    }
}

async function applyAdminGrantFromCritical(reason) {
    const data = state.criticalActionData;
    if (!data?.targetUserId) return;
    try {
        await adminFetchJson('/api/admin/admins/grant', {
            method: 'POST',
            body: { targetUserId: data.targetUserId, makeSuper: Boolean(data.makeSuper), reason }
        });
        showToast('Admin jog megadva.', 'success', 'bi-shield-fill-check');
        await loadAdminAdminsList();
    } catch (err) {
        showToast(err.message || 'Hiba a grant soran.', 'danger');
    }
}

async function applyAdminRevokeFromCritical(reason) {
    const data = state.criticalActionData;
    if (!data?.targetUserId) return;
    try {
        await adminFetchJson('/api/admin/admins/revoke', {
            method: 'POST',
            body: { targetUserId: data.targetUserId, reason }
        });
        showToast('Admin jog visszavonva.', 'success', 'bi-shield-fill-x');
        await loadAdminAdminsList();
    } catch (err) {
        showToast(err.message || 'Hiba a revoke soran.', 'danger');
    }
}

// ────────────── KEPESSEGEK ──────────────

async function loadAdminAbilities() {
    state.abilities.loading = true;
    state.abilities.error = null;
    if (state.currentSectionId === 'abilities') showSection('abilities', null, { silent: true });
    try {
        const json = await adminFetchJson('/api/admin/abilities/');
        state.abilities.list = Array.isArray(json.data) ? json.data : [];
        state.abilities.loaded = true;
        state.abilities.loading = false;
        if (state.currentSectionId === 'abilities') showSection('abilities', null, { silent: true });
    } catch (err) {
        state.abilities.loading = false;
        state.abilities.error = err.message;
        if (state.currentSectionId === 'abilities') showSection('abilities', null, { silent: true });
    }
}

function openAbilityEditor(id) {
    const editing = id ? state.abilities.list.find((a) => a.id === Number(id)) : null;
    state.abilities.editing = editing || { id: null, name: '', description: '', cooldownTurns: 0 };
    const modalEl = document.getElementById('abilityEditorModal');
    if (!modalEl || !window.bootstrap?.Modal) {
        showToast('A kepesseg-editor meg nem kesz.', 'info');
        return;
    }
    const titleEl = document.getElementById('abilityEditorTitle');
    if (titleEl) titleEl.textContent = editing ? `Kepesseg szerkesztese: ${editing.name}` : 'Uj kepesseg';
    document.getElementById('abilityEditorName').value = state.abilities.editing.name || '';
    document.getElementById('abilityEditorDescription').value = state.abilities.editing.description || '';
    document.getElementById('abilityEditorCooldown').value = state.abilities.editing.cooldownTurns ?? 0;
    document.getElementById('abilityEditorReason').value = '';
    document.getElementById('abilityEditorReasonCount').textContent = '0';
    new window.bootstrap.Modal(modalEl).show();
}

async function abilityEditorSubmit() {
    const editing = state.abilities.editing;
    if (!editing) return;
    const name = document.getElementById('abilityEditorName')?.value?.trim();
    const description = document.getElementById('abilityEditorDescription')?.value?.trim();
    const cooldownTurns = Number(document.getElementById('abilityEditorCooldown')?.value) || 0;
    const reason = document.getElementById('abilityEditorReason')?.value?.trim() || '';
    if (!name) { showToast('A nev kotelezo.', 'warning'); return; }
    // abilities.edit opcionalis reason muvelet — uresen is OK

    try {
        if (editing.id) {
            await adminFetchJson(`/api/admin/abilities/${editing.id}`, {
                method: 'PATCH',
                body: { name, description, cooldownTurns, reason }
            });
            showToast('Kepesseg modositva.', 'success', 'bi-check-circle-fill');
        } else {
            await adminFetchJson('/api/admin/abilities/', {
                method: 'POST',
                body: { name, description, cooldownTurns, reason }
            });
            showToast('Kepesseg letrehozva.', 'success', 'bi-plus-circle-fill');
        }
        const modalEl = document.getElementById('abilityEditorModal');
        if (modalEl && window.bootstrap?.Modal) window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
        await loadAdminAbilities();
    } catch (err) {
        showToast(err.message || 'Hiba a mentes soran.', 'danger');
    }
}

function confirmDeleteAbility(id) {
    const ab = state.abilities.list.find((a) => a.id === Number(id));
    if (!ab) return;
    // openCriticalAction felulirja a state.criticalActionData-t — extras-be tesszuk a custom mezoket.
    openCriticalAction('abilities.edit', `Kepesseg torles: ${ab.name}`, null, { abilityId: id, deleteFlow: true });
}

async function applyAbilityDeleteFromCritical(reason) {
    const id = state.criticalActionData?.abilityId;
    if (!id) return;
    try {
        await adminFetchJson(`/api/admin/abilities/${id}`, {
            method: 'DELETE',
            body: { reason }
        });
        showToast('Kepesseg torolve.', 'success', 'bi-trash3-fill');
        await loadAdminAbilities();
    } catch (err) {
        showToast(err.message || 'Hiba a torles soran.', 'danger');
    }
}

// ────────────── KOZOSSEGI ──────────────

async function loadAdminSocial() {
    state.socialAdmin.loading = true;
    state.socialAdmin.error = null;
    if (state.currentSectionId === 'friends') showSection('friends', null, { silent: true });
    try {
        const [counts, requests, blocks] = await Promise.all([
            adminFetchJson('/api/admin/social/counts'),
            adminFetchJson('/api/admin/social/requests?status=pending'),
            adminFetchJson('/api/admin/social/blocks')
        ]);
        state.socialAdmin.counts = counts.data || { totalFriendships: 0, pendingRequests: 0, activeBlocks: 0 };
        state.socialAdmin.requests = Array.isArray(requests.data) ? requests.data : [];
        state.socialAdmin.blocks = Array.isArray(blocks.data) ? blocks.data : [];
        state.socialAdmin.requestsLoaded = true;
        state.socialAdmin.blocksLoaded = true;
        state.socialAdmin.countsLoaded = true;
        state.socialAdmin.loading = false;
        if (state.currentSectionId === 'friends') showSection('friends', null, { silent: true });
    } catch (err) {
        state.socialAdmin.loading = false;
        state.socialAdmin.error = err.message;
        if (state.currentSectionId === 'friends') showSection('friends', null, { silent: true });
    }
}

function confirmAdminUnblock(blockerId, blockedId, blockerName, blockedName) {
    if (!blockerId || !blockedId) return;
    // openCriticalAction felulirja a state.criticalActionData-t — extras-be tesszuk a custom mezoket.
    openCriticalAction('social.unblock', `Blokk feloldas: ${blockerName} → ${blockedName}`, null,
        { blockerId, blockedId, blockerName, blockedName });
}

async function applySocialUnblockFromCritical(reason) {
    const data = state.criticalActionData;
    if (!data?.blockerId || !data?.blockedId) return;
    try {
        await adminFetchJson(`/api/admin/social/blocks/${data.blockerId}/${data.blockedId}/unblock`, {
            method: 'POST',
            body: { reason }
        });
        showToast('Blokk feloldva.', 'success', 'bi-unlock-fill');
        await loadAdminSocial();
    } catch (err) {
        showToast(err.message || 'Hiba a feloldas soran.', 'danger');
    }
}

// ────────────── JATSZMAK ──────────────

async function loadAdminGames() {
    state.gamesAdmin.loading = true;
    state.gamesAdmin.error = null;
    if (state.currentSectionId === 'games') showSection('games', null, { silent: true });
    try {
        const params = new URLSearchParams();
        if (state.gamesAdmin.filter && state.gamesAdmin.filter !== 'all') {
            params.set('status', state.gamesAdmin.filter);
        }
        if (state.gamesAdmin.search) params.set('search', state.gamesAdmin.search);
        const [list, counts] = await Promise.all([
            adminFetchJson(`/api/admin/games/?${params.toString()}`),
            adminFetchJson('/api/admin/games/counts')
        ]);
        state.gamesAdmin.list = Array.isArray(list.data) ? list.data : [];
        state.gamesAdmin.counts = counts.data || { ongoing: 0, finished: 0, abandoned: 0, draw: 0 };
        state.gamesAdmin.loaded = true;
        state.gamesAdmin.loading = false;
        if (state.currentSectionId === 'games') showSection('games', null, { silent: true });
    } catch (err) {
        state.gamesAdmin.loading = false;
        state.gamesAdmin.error = err.message;
        if (state.currentSectionId === 'games') showSection('games', null, { silent: true });
    }
}

function setGamesFilter(filter) {
    state.gamesAdmin.filter = filter;
    loadAdminGames();
}
function setGamesSearch(value) {
    state.gamesAdmin.search = String(value || '').trim();
    loadAdminGames();
}

function downloadGamePgn(gameId) {
    if (!gameId) return;
    // PGN letoltes: a Bearer-token miatt fetch + Blob, hogy az admin token utazzon vele.
    (async () => {
        try {
            const res = await fetch(`/api/admin/games/${gameId}/pgn`, {
                method: 'GET',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ Accept: 'application/x-chess-pgn' })
            });
            if (!res.ok) {
                const txt = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status}: ${txt.slice(0, 200)}`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mattmester-game-${gameId}.pgn`;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300);
        } catch (err) {
            showToast(err.message || 'PGN letoltes hiba.', 'danger');
        }
    })();
}

function confirmForceEndGame(gameId) {
    if (!gameId) return;
    // openCriticalAction felulirja a state.criticalActionData-t — extras-be tesszuk.
    openCriticalAction('games.force_end', `Meccs eroszakos befejezese: #${gameId}`, null, { gameId });
}

async function applyGameForceEndFromCritical(reason) {
    const id = state.criticalActionData?.gameId;
    if (!id) return;
    try {
        await adminFetchJson(`/api/admin/games/${id}/force-end`, {
            method: 'POST',
            body: { reason }
        });
        showToast('Meccs befejezve (forced).', 'success', 'bi-stop-circle-fill');
        await loadAdminGames();
    } catch (err) {
        showToast(err.message || 'Hiba a force-end soran.', 'danger');
    }
}

// ────── Spectator ──────

async function openSpectator(gameId) {
    if (!gameId) return;
    state.gamesAdmin.spectator = { gameId, game: null, loading: true, error: null };
    const modalEl = document.getElementById('spectatorModal');
    if (!modalEl || !window.bootstrap?.Modal) {
        showToast('Spectator modal nem kesz.', 'info');
        return;
    }
    new window.bootstrap.Modal(modalEl).show();
    document.getElementById('spectatorTitle').textContent = `Spectator: meccs #${gameId}`;
    document.getElementById('spectatorBody').innerHTML = '<div class="text-center py-4"><i class="bi bi-arrow-repeat spin"></i> Meccs adat betoltese...</div>';

    try {
        const json = await adminFetchJson(`/api/admin/games/${gameId}`);
        state.gamesAdmin.spectator.game = json.data;
        state.gamesAdmin.spectator.loading = false;
        renderSpectatorBody();
        // WS join
        if (state.adminSocket) {
            state.adminSocket.emit('admin:games:spectate:join', { gameId });
        }
    } catch (err) {
        state.gamesAdmin.spectator.loading = false;
        state.gamesAdmin.spectator.error = err.message;
        document.getElementById('spectatorBody').innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message)}</div>`;
    }
}

function renderSpectatorBody() {
    const sp = state.gamesAdmin.spectator;
    const game = sp.game;
    const body = document.getElementById('spectatorBody');
    if (!body) return;
    if (!game) { body.innerHTML = '<div class="text-secondary">Nincs adat.</div>'; return; }

    const fen = game.currentFen || game.initialFen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const lastMoves = (game.moves || []).slice(-10).reverse();
    const moveList = lastMoves.map((m) => `
        <li class="d-flex justify-content-between gap-2 small">
            <span class="font-monospace text-secondary">${m.plyNumber}.</span>
            <span class="font-monospace text-white">${escapeHtml(m.san || (m.fromPos + '→' + m.toPos))}</span>
            <span class="text-secondary">${escapeHtml(m.player?.username || '—')}</span>
        </li>
    `).join('');

    body.innerHTML = `
        <div class="row g-3">
            <div class="col-md-7">
                <div class="text-secondary small mb-1">Aktualis allas (FEN):</div>
                <pre class="json-block" style="font-size:0.75rem;white-space:pre-wrap;word-break:break-all;">${escapeHtml(fen)}</pre>
                <div class="text-secondary small mt-3">
                    <strong>Vilagos:</strong> ${escapeHtml(game.white?.username || '—')} ·
                    <strong>Sotet:</strong> ${escapeHtml(game.black?.username || '—')} ·
                    <strong>Allapot:</strong> ${escapeHtml(game.status)}
                    ${game.timeControl ? ` · <strong>Idokontroll:</strong> ${escapeHtml(game.timeControl)}` : ''}
                </div>
            </div>
            <div class="col-md-5">
                <div class="text-secondary small mb-1">Utolso 10 lepes:</div>
                <ol class="list-unstyled mb-0" style="max-height:280px;overflow:auto;" id="spectatorMoves">
                    ${moveList || '<li class="text-secondary">Meg nincs lepes.</li>'}
                </ol>
            </div>
        </div>
    `;
}

function closeSpectator() {
    const sp = state.gamesAdmin.spectator;
    if (sp?.gameId && state.adminSocket) {
        try { state.adminSocket.emit('admin:games:spectate:leave', { gameId: sp.gameId }); } catch (_) {}
    }
    state.gamesAdmin.spectator = { gameId: null, game: null, loading: false, error: null };
}

function onAdminGamesMove(payload) {
    const sp = state.gamesAdmin.spectator;
    if (!sp || !sp.gameId || !payload) return;
    if (Number(payload.gameId) !== Number(sp.gameId)) return;
    if (!sp.game) return;
    // Frissitsuk a current_fen-t es toldjunk hozza egy lepest a moves vegere.
    if (payload.allapot?.fen) sp.game.currentFen = payload.allapot.fen;
    sp.game.moves = sp.game.moves || [];
    sp.game.moves.push({
        plyNumber: (sp.game.moves.length || 0) + 1,
        san: null,
        fromPos: payload.move ? `${payload.move.fromX},${payload.move.fromY}` : null,
        toPos: payload.move ? `${payload.move.toX},${payload.move.toY}` : null,
        player: { id: payload.player?.userId, username: payload.player?.color === 'white' ? sp.game.white?.username : sp.game.black?.username }
    });
    renderSpectatorBody();
}

// ────────────── TESZTEK ──────────────

// Ephemeral latest helpers: a "Test suite-ok" + "Stderr" reszek csak a session
// alatt es csak a futtatas utan 1 percig lathatok. Page reload, admin oldalrol
// kilepes, vagy 60s lejarata utan eltunnek.
//
// Visualis viselkedes: visszaszamlalo pill jelenik meg mind a ket kartya
// jobb felso sarkaban. 60s -> 0 -> meg 2 mp grace -> teljes clear.
const TESTS_LATEST_VISIBILITY_MS = 60 * 1000;
const TESTS_LATEST_GRACE_MS = 2 * 1000;

function updateTestsAutoClearPills() {
    const remainMs = state.testsAdmin.latestExpiresAt
        ? Math.max(0, state.testsAdmin.latestExpiresAt - Date.now())
        : 0;
    const remainSec = Math.ceil(remainMs / 1000);
    document.querySelectorAll('[data-tests-autoclear-seconds]').forEach((el) => {
        el.textContent = String(remainSec);
    });
    // Ha 0 ala ert, valtsuk pirosra a pillt (grace period)
    document.querySelectorAll('[data-tests-autoclear]').forEach((el) => {
        if (remainSec <= 0) {
            el.classList.remove('bg-warning', 'text-dark');
            el.classList.add('bg-danger');
            const inner = el.querySelector('[data-tests-autoclear-seconds]');
            if (inner) inner.textContent = '0';
        }
    });
}

function clearTestsLatest() {
    if (state.testsAdmin.latestExpireTimerId) {
        clearTimeout(state.testsAdmin.latestExpireTimerId);
        state.testsAdmin.latestExpireTimerId = null;
    }
    if (state.testsAdmin.latestTickerId) {
        clearInterval(state.testsAdmin.latestTickerId);
        state.testsAdmin.latestTickerId = null;
    }
    if (state.testsAdmin.latestGraceTimerId) {
        clearTimeout(state.testsAdmin.latestGraceTimerId);
        state.testsAdmin.latestGraceTimerId = null;
    }
    state.testsAdmin.latest = null;
    state.testsAdmin.latestExpiresAt = null;
    if (state.currentSectionId === 'tests') showSection('tests', null, { silent: true });
}

function setTestsLatest(latest) {
    // Elozo timerek teljes takaritasa
    if (state.testsAdmin.latestExpireTimerId) {
        clearTimeout(state.testsAdmin.latestExpireTimerId);
        state.testsAdmin.latestExpireTimerId = null;
    }
    if (state.testsAdmin.latestTickerId) {
        clearInterval(state.testsAdmin.latestTickerId);
        state.testsAdmin.latestTickerId = null;
    }
    if (state.testsAdmin.latestGraceTimerId) {
        clearTimeout(state.testsAdmin.latestGraceTimerId);
        state.testsAdmin.latestGraceTimerId = null;
    }

    state.testsAdmin.latest = latest;
    state.testsAdmin.latestExpiresAt = Date.now() + TESTS_LATEST_VISIBILITY_MS;

    // 1 mp-enkenti pill update (csak a DOM-on, nem teljes re-render).
    state.testsAdmin.latestTickerId = setInterval(() => {
        updateTestsAutoClearPills();
    }, 1000);

    // 60 mp utan: 2 mp grace, aztan teljes clear.
    state.testsAdmin.latestExpireTimerId = setTimeout(() => {
        // 0-ra ert; a tickerunk a pillt 0-ra es danger sztilusra rakja az
        // updateTestsAutoClearPills() kovetkezo hivasakor (1 mp-en belul).
        // Egyetlen extra render: egy 2 mp-es grace delay.
        state.testsAdmin.latestGraceTimerId = setTimeout(() => {
            clearTestsLatest();
        }, TESTS_LATEST_GRACE_MS);
    }, TESTS_LATEST_VISIBILITY_MS);
}

async function loadAdminTests() {
    state.testsAdmin.loading = true;
    state.testsAdmin.error = null;
    if (state.currentSectionId === 'tests') showSection('tests', null, { silent: true });
    try {
        // FONTOS: a `latest` mezot szandekosan NEM tigetjuk fel itt — csak akkor
        // jelenitjuk meg, ha a session alatt frissen futtattunk tesztet
        // (admin:tests:finished WS event). A History tabla ettol fuggetlenul tolt.
        const [history, running] = await Promise.all([
            adminFetchJson('/api/admin/tests/history'),
            adminFetchJson('/api/admin/tests/running')
        ]);
        state.testsAdmin.history = Array.isArray(history.data) ? history.data : [];
        state.testsAdmin.latestLoaded = true;  // a "page-loaded" jelzes
        state.testsAdmin.historyLoaded = true;
        if (running.data?.inProcess) {
            state.testsAdmin.running = {
                runId: running.data.inProcessMeta?.id,
                startedAt: running.data.inProcessMeta?.startedAt,
                elapsedMs: running.data.inProcessMeta?.durationMs
            };
        } else {
            state.testsAdmin.running = null;
        }
        state.testsAdmin.loading = false;
        if (state.currentSectionId === 'tests') showSection('tests', null, { silent: true });
    } catch (err) {
        state.testsAdmin.loading = false;
        state.testsAdmin.error = err.message;
        if (state.currentSectionId === 'tests') showSection('tests', null, { silent: true });
    }
}

function confirmRunTests() {
    if (state.testsAdmin.running) { showToast('Mar fut egy teszt.', 'warning'); return; }
    if (!state.isSuperAdmin) { showToast('Csak super-admin futtathat tesztet.', 'warning'); return; }
    const modalEl = document.getElementById('testsRunConfirmModal');
    if (!modalEl || !window.bootstrap?.Modal) {
        // Fallback: ha valamiert nem lenne modal, kozvetlenul futtatas reason nelkul.
        runTestsDirectly('');
        return;
    }
    const reasonField = document.getElementById('testsRunReason');
    if (reasonField) reasonField.value = '';
    new window.bootstrap.Modal(modalEl).show();
}

function submitTestsRunFromConfirm() {
    const modalEl = document.getElementById('testsRunConfirmModal');
    if (modalEl && window.bootstrap?.Modal) {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
        window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    }
    const reason = document.getElementById('testsRunReason')?.value?.trim() || '';
    runTestsDirectly(reason);
}

async function runTestsDirectly(reason) {
    try {
        const json = await adminFetchJson('/api/admin/tests/run', {
            method: 'POST',
            body: { reason: reason || '' }
        });
        showToast(`Teszt futas elinditva (run #${json.data?.runId}).`, 'success', 'bi-play-fill');
        // Uj run inditasakor toroljuk a regi latest-et (ha volt) — a felhasznalo
        // explicit kerese: ne lassa a regi adatokat amig az uj fut.
        clearTestsLatest();
        state.testsAdmin.running = {
            runId: json.data?.runId,
            startedAt: json.data?.startedAt,
            elapsedMs: 0
        };
        if (state.currentSectionId === 'tests') showSection('tests', null, { silent: true });
    } catch (err) {
        showToast(err.message || 'Hiba a teszt inditasanal.', 'danger');
    }
}

// Backwards-compat: ha a critical action wrapper meg ezt hivna a tests.run action-re,
// menjen at a kozvetlen runner-re.
async function applyTestsRunFromCritical(reason) {
    return runTestsDirectly(reason);
}

// ────────────── Critical action dispatch hook ──────────────
// A meglevo executeCriticalAction function-be be kell hookolnunk az uj action-okre.
// Egyszerubb wrapper: monkey-patch hogy az ismeretlen action-okre dispatcheljunk a fenti
// applyXxxFromCritical fuggvenyekre. Az eredeti executeCriticalAction kezeli a regi action-oket
// (users.ban, users.unban, users.delete, chat.delete) — ez a wrapper extra kezeli a 6 ujat.

(function attachExtraCriticalActions() {
    if (typeof executeCriticalAction !== 'function') return;
    const originalExecute = executeCriticalAction;

    const NEW_ACTION_HANDLERS = {
        'admin.grant':      (reason) => applyAdminGrantFromCritical(reason),
        'admin.revoke':     (reason) => applyAdminRevokeFromCritical(reason),
        'settings.edit':    (reason) => applySettingsEditFromCritical(reason),
        'abilities.edit':   (reason) => {
            const data = state.criticalActionData;
            if (data?.deleteFlow) return applyAbilityDeleteFromCritical(reason);
            // egyebkent az ability editor sajat reason mezojet hasznaljuk, nem ezt
            return Promise.resolve();
        },
        'social.unblock':   (reason) => applySocialUnblockFromCritical(reason),
        'games.force_end':  (reason) => applyGameForceEndFromCritical(reason)
        // tests.run szandekosan nincs itt — sajat egyszeru modalja van (testsRunConfirmModal),
        // nem a "Kritikus muvelet" flow-ban megy
    };

    // Opcionalis reason action-ok: ezeknel nincs char-minimum sem.
    const OPTIONAL_REASON_ACTIONS = new Set([
        'users.delete', 'chat.delete', 'games.force_end',
        'abilities.edit', 'social.unblock', 'profile_image.review'
    ]);

    window.executeCriticalAction = async function patchedExecuteCriticalAction() {
        const action = state.criticalActionData?.action;
        console.log('[critical] executeCriticalAction hivva, action=', action);
        if (action && NEW_ACTION_HANDLERS[action]) {
            const modalEl = document.getElementById('criticalActionModal');
            if (modalEl && window.bootstrap?.Modal) {
                // Bootstrap modal hide() utan aria-hidden=true keruli a modalra, de ha a
                // focus meg a "Muvelet vegrehajtasa" gombon van, az accessibility warning-ot
                // dob. Blur-oljuk az aktiv elemet, hogy a focus a body-ra menjen.
                if (document.activeElement && typeof document.activeElement.blur === 'function') {
                    document.activeElement.blur();
                }
                window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
            }
            const reason = document.getElementById('criticalReason')?.value?.trim() || '';
            console.log('[critical] reason length=', reason.length, 'optional=', OPTIONAL_REASON_ACTIONS.has(action));
            if (!OPTIONAL_REASON_ACTIONS.has(action) && reason.length < 10) {
                console.warn('[critical] reason tul rovid (<10 char) — abort');
                showToast('Az indoklasnak legalabb 10 karakter hosszunak kell lennie.', 'warning');
                return;
            }
            try {
                console.log('[critical] handler hivasa', action);
                await NEW_ACTION_HANDLERS[action](reason);
            } catch (err) {
                console.error('extra critical handler hiba:', err);
            }
            return;
        }
        console.log('[critical] action nem az uj handlerek kozott, originalExecute()');
        return originalExecute();
    };
})();

// Showsection hook — eredeti showSection meghagyva, csak a vegen meghivjuk a section-loadert.
(function attachSectionLoader() {
    if (typeof showSection !== 'function') return;
    const originalShow = showSection;
    window.showSection = function patchedShowSection(sectionId, event, options) {
        const result = originalShow(sectionId, event, options);
        try { maybeLoadSectionData(sectionId); } catch (_) { /* ignore */ }
        // Tesztek oldalon a pill DOM elemek a re-render utan azonnal kapjak a friss erteket
        // a "—" placeholder helyett.
        if (sectionId === 'tests' && state.testsAdmin.latestExpiresAt) {
            try { updateTestsAutoClearPills(); } catch (_) {}
        }
        return result;
    };
})();

// Ability editor reason counter
function abilityEditorReasonInput(value) {
    const el = document.getElementById('abilityEditorReasonCount');
    if (el) el.textContent = String(String(value || '').length);
}

// Maintenance switch warning toggle (Beallitasok form)
function onMaintenanceToggleChange(checked) {
    const warn = document.getElementById('settingsMaintenanceWarn');
    if (warn) warn.classList.toggle('d-none', !checked);
}

// ────────────── WS event listeners ──────────────
// A tobbi admin tab eseteben az `admin:settings:updated`, `admin:abilities:changed`,
// `admin:social:block_changed`, `admin:tests:finished`, `admin:games:move` eventeket
// figyeljuk. Bekotjuk amikor az admin socket connect-tel.

function attachAdminSocketListeners(socket) {
    if (!socket) return;
    socket.on('admin:settings:updated', (payload) => {
        if (payload?.settings) {
            state.siteSettings.data = payload.settings;
            state.siteSettings.loaded = true;
            if (state.currentSectionId === 'settings') showSection('settings', null, { silent: true });
        }
    });
    socket.on('admin:abilities:changed', () => {
        if (state.abilities.loaded) loadAdminAbilities();
    });
    socket.on('admin:social:block_changed', () => {
        if (state.socialAdmin.requestsLoaded) loadAdminSocial();
    });
    socket.on('admin:games:ended', () => {
        if (state.gamesAdmin.loaded) loadAdminGames();
    });
    socket.on('admin:games:move', onAdminGamesMove);
    socket.on('admin:games:ability', onAdminGamesMove);
    socket.on('admin:games:force_end', () => {
        showToast('A nezett meccs adminisztratorian befejezve.', 'warning');
    });
    socket.on('admin:tests:started', (payload) => {
        // Uj run kezdodik (akar mas admin tab-bol) -> regi latest takaritasa.
        clearTestsLatest();
        state.testsAdmin.running = {
            runId: payload?.runId,
            startedAt: payload?.startedAt,
            elapsedMs: 0
        };
        if (state.currentSectionId === 'tests') showSection('tests', null, { silent: true });
    });
    socket.on('admin:tests:progress', (payload) => {
        if (state.testsAdmin.running) {
            state.testsAdmin.running.elapsedMs = payload?.elapsedMs || 0;
            if (state.currentSectionId === 'tests') showSection('tests', null, { silent: true });
        }
    });
    socket.on('admin:tests:finished', async () => {
        state.testsAdmin.running = null;
        // Frissitsuk a history-t es kerjuk le a friss latest-et — ezt 60 mp-ig
        // mutatjuk, aztan auto-clear (setTestsLatest belso timerje).
        try {
            const [latest, history] = await Promise.all([
                adminFetchJson('/api/admin/tests/latest'),
                adminFetchJson('/api/admin/tests/history')
            ]);
            if (latest?.data) {
                setTestsLatest(latest.data);
            }
            state.testsAdmin.history = Array.isArray(history?.data) ? history.data : [];
        } catch (err) {
            console.warn('admin:tests:finished refresh hiba:', err.message);
        }
        if (state.currentSectionId === 'tests') showSection('tests', null, { silent: true });
        // A render utan azonnal frissitsuk a pill ertekeket, hogy ne lassa a felhasznalo a "—" placeholder-t.
        setTimeout(() => updateTestsAutoClearPills(), 50);
    });
}
