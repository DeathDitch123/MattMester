// Admin step-up token flow - kozos modul (browser + Node test).
// Felelos: refresh hivas, auth hibakod -> akcio (logout / re-elevate / pass-through),
// es az Authorization: Bearer header attaching. Egyetlen forras-igazsag, hogy a UI
// es a unit tesztek ugyanazt a logikat hasznaljak.
//
// A factory dependency-injection-os: a hivo passzolja a UI helpereket (clearAdminToken,
// updateTokenPill, showElevateModal, showToast, redirect, flashPill) es a fetchFn-t.
// Igy node oldalrol mockolhato.

// `tx` mar globalis a `_utils.js`-bol (window.tx). NE deklaraljuk itt ujra
// const-tal, mert tobb top-level <script> tag kozos scope-jaban a `const tx`
// duplikacio SyntaxError-t okoz a bongeszoben.
function _txAuthFlow(hu, en) {
    if (typeof window !== 'undefined' && window.MattMesterI18n?.tx) return window.MattMesterI18n.tx(hu, en);
    return hu;
}

function createAdminAuthFlow(deps) {
    const config = deps || {};
    const state = config.state;
    const fetchFn = config.fetchFn;
    const clearAdminToken = config.clearAdminToken;
    const updateTokenPill = config.updateTokenPill;
    const showElevateModal = config.showElevateModal;
    const showToast = config.showToast;
    const redirect = config.redirect;
    const flashPill = config.flashPill;

    function adminAuthHeaders(extra) {
        const headers = Object.assign({}, extra || {});
        if (state && state.adminToken) {
            headers['Authorization'] = `Bearer ${state.adminToken}`;
        }
        return headers;
    }

    function handleAdminAuthError(code) {
        let handled = false;
        try {
            if (code === 'ADMIN_NO_SESSION') {
                if (typeof clearAdminToken === 'function') clearAdminToken();
                if (typeof updateTokenPill === 'function') updateTokenPill();
                if (typeof showToast === 'function') {
                    showToast(_txAuthFlow('A session megszűnt — visszairányítunk a főoldalra.', 'Session expired — redirecting to the home page.'), 'danger', 'bi-shield-fill-x');
                }
                if (typeof redirect === 'function') redirect('/');
                handled = true;
            } else if (code === 'ADMIN_NOT_ADMIN') {
                // DB szerint mar nincs admin jogosultsag (egy masik admin levehette,
                // vagy be lett tiltva). Tisztitas + redirect, NINCS elevate-modal:
                // ujra elevate-elni nem szabad, mert ugyse engedne be.
                if (typeof clearAdminToken === 'function') clearAdminToken();
                if (typeof updateTokenPill === 'function') updateTokenPill();
                if (typeof showToast === 'function') {
                    showToast(_txAuthFlow('Az admin jogosultságod visszavonásra került — visszairányítunk a főoldalra.', 'Your admin privileges have been revoked — redirecting to the home page.'), 'danger', 'bi-shield-fill-x');
                }
                if (typeof redirect === 'function') redirect('/');
                handled = true;
            } else if (
                code === 'ADMIN_TOKEN_INVALID' ||
                code === 'ADMIN_TOKEN_EXPIRED' ||
                code === 'ADMIN_TOKEN_MISSING'
            ) {
                if (typeof clearAdminToken === 'function') clearAdminToken();
                if (typeof updateTokenPill === 'function') updateTokenPill();
                if (typeof showToast === 'function') {
                    showToast(_txAuthFlow('Az admin token érvénytelen — kérj új elevate-et.', 'Admin token invalid — please re-elevate.'), 'warning', 'bi-shield-fill-x');
                }
                if (typeof showElevateModal === 'function') showElevateModal();
                handled = true;
            }
        } catch (err) {
            console.error('handleAdminAuthError hiba:', err && err.message);
        }
        return handled;
    }

    async function callRefresh() {
        let result = null;
        try {
            if (!state || !state.adminToken) {
                const missing = new Error('Nincs admin token.');
                missing.code = 'ADMIN_TOKEN_MISSING';
                throw missing;
            }
            const res = await fetchFn('/api/admin/auth/refresh', {
                method: 'POST',
                headers: adminAuthHeaders(),
                credentials: 'same-origin'
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data || !data.success) {
                const error = new Error((data && data.message) || 'Refresh sikertelen.');
                error.code = (data && data.code) || (res.status === 401 ? 'ADMIN_TOKEN_INVALID' : 'ADMIN_REFRESH_FAILED');
                error.status = res.status;
                throw error;
            }
            if (data.data && data.data.expiresAt) {
                state.adminTokenExpiresAt = new Date(data.data.expiresAt);
            }
            result = data;
        } catch (err) {
            console.error('callRefresh hiba:', err && err.message);
            throw err;
        }
        return result;
    }

    async function refreshAdminToken() {
        let success = false;
        if (!state || !state.adminToken) {
            if (typeof showElevateModal === 'function') showElevateModal();
        } else {
            if (typeof flashPill === 'function') {
                try { flashPill(); } catch (_) { /* UI flash nem kritikus */ }
            }
            try {
                await callRefresh();
                if (typeof updateTokenPill === 'function') updateTokenPill();
                if (typeof showToast === 'function') {
                    showToast(_txAuthFlow('Admin token meghosszabbítva.', 'Admin token extended.'), 'success', 'bi-shield-fill-check');
                }
                success = true;
            } catch (error) {
                console.error('refreshAdminToken hiba:', error && error.message);
                const handled = handleAdminAuthError((error && error.code) || '');
                if (!handled && typeof showToast === 'function') {
                    showToast(_txAuthFlow('Hálózati hiba a token frissítése során. Próbáld újra később.', 'Network error while refreshing token. Please try again later.'), 'warning', 'bi-wifi-off');
                }
            }
        }
        return success;
    }

    return {
        adminAuthHeaders,
        handleAdminAuthError,
        callRefresh,
        refreshAdminToken
    };
}

const api = { createAdminAuthFlow };

if (typeof window !== 'undefined') {
    window.MattMesterAdminAuthFlow = api;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
