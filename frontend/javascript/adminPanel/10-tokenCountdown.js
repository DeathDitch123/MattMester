/* =============================================================
   13) Token countdown — VALÓS (server expiresAt alapján)
   ============================================================= */
let tokenIntervalId = null;
let autoRefreshing = false;

function startTokenCountdown() {
    if (tokenIntervalId) clearInterval(tokenIntervalId);
    updateTokenPill();
    tokenIntervalId = setInterval(async () => {
        const left = getRemainingTokenSeconds();

        // Auto-refresh: ha 60s alatti, kérünk egy refresh-t (sliding TTL)
        if (state.adminToken && left > 0 && left <= 60 && !autoRefreshing) {
            autoRefreshing = true;
            try {
                await callRefresh();
            } catch (error) {
                // Auth hiba -> handleAdminAuthError elintezi; halozat/5xx -> token marad, kovetkezo tick ujraprobalja.
                handleAdminAuthError(error?.code || '');
            }
            finally { autoRefreshing = false; }
        }

        // Lejárat -> új elevate kérése
        if (state.adminToken && left === 0) {
            clearAdminToken();
            updateTokenPill();
            showToast(tx('Az admin token lejárt — újra elevate.', 'Admin token expired — re-elevate.'), 'warning', 'bi-shield-fill-x');
            showElevateModal();
            return;
        }

        updateTokenPill();
    }, 1000);
}

// callRefresh / refreshAdminToken kozos forras: shared/adminAuthFlow.js.
async function callRefresh() {
    return getAdminAuthFlow().callRefresh();
}

async function refreshAdminToken() {
    return getAdminAuthFlow().refreshAdminToken();
}

function updateTokenPill() {
    const pill = document.getElementById('adminTokenPill');
    const countdown = document.getElementById('tokenCountdown');
    if (!pill || !countdown) return;

    const left = state.adminToken ? getRemainingTokenSeconds() : 0;
    const m = Math.floor(left / 60);
    const s = left % 60;
    countdown.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    pill.classList.remove('healthy', 'warning', 'expiring', 'expired');
    if (!state.adminToken) pill.classList.add('expired');
    else if (left === 0) pill.classList.add('expired');
    else if (left <= 60) pill.classList.add('expiring');
    else if (left <= 300) pill.classList.add('warning');
    else pill.classList.add('healthy');

    const totalCap = 15 * 60;
    const pct = (left / totalCap) * 100;
    pill.style.setProperty('--token-progress', `${pct}%`);
}

