/* =============================================================
   12) AUTH bootstrap — session ellenőrzés + step-up elevate
   ============================================================= */
async function bootstrapAdminAuth() {
    try {
        const r = await fetch('/api/sessionInfo', { credentials: 'same-origin' });
        const data = await r.json().catch(() => ({}));

        if (!data?.loggedIn || data.user?.role !== 'admin') {
            window.location.replace('/');
            return false;
        } else {
            state.currentUser = data.user;
            populateHeaderFromUser(data.user);
        }
    } catch (error) {
        console.error('bootstrapAdminAuth sessionInfo hiba:', error);
        window.location.replace('/');
        return false;
    }

    showElevateModal();

    showSection(state.currentSectionId || DEFAULT_SECTION, null, { silent: true });

    return true;
}

function populateHeaderFromUser(user) {
    const username = user?.username || 'Admin';
    setText('headerUsername', username);
    setText('headerRole', user?.role === 'admin' ? 'Admin' : (user?.role || ''));
    const avatar = document.getElementById('headerAvatar');
    if (avatar && window.MattMesterProfileImage) {
        window.MattMesterProfileImage.applyProfileImagePresentation(avatar, {
            source: user,
            size: 40
        });
    }
}

function showElevateModal() {
    const modalEl = document.getElementById('adminElevateModal');
    if (!modalEl || !window.bootstrap?.Modal) return;
    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl, {
        backdrop: 'static',
        keyboard: false
    });
    document.getElementById('elevateError')?.classList.add('d-none');
    const pwField = document.getElementById('elevatePassword');
    if (pwField) {
        pwField.value = '';
        // Enter -> submit
        pwField.onkeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); performElevate(); }
        };
    }
    modal.show();
    setTimeout(() => pwField?.focus(), 250);
}

async function performElevate() {
    const pwField = document.getElementById('elevatePassword');
    const errBox = document.getElementById('elevateError');
    const submitBtn = document.getElementById('elevateSubmit');
    const password = pwField?.value || '';
    const elevateState = { success: false };

    if (errBox) errBox.classList.add('d-none');

    try {
        if (!password) {
            if (errBox) {
                errBox.textContent = tx('A jelszó megadása kötelező.', 'Password is required.');
                errBox.classList.remove('d-none');
            }
        } else {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${tx('Aktiválás...', 'Activating...')}`;
            }

            const res = await fetch('/api/admin/auth/elevate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ password })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data?.success) {
                const msg = data?.message || tx('Sikertelen elevate. Ellenőrizd a jelszót.', 'Elevate failed. Check your password.');
                if (errBox) {
                    errBox.textContent = msg;
                    errBox.classList.remove('d-none');
                }
            } else {
                const tokenData = data.data || {};
                setAdminToken(tokenData.token, tokenData.expiresAt, Boolean(tokenData.isSuperAdmin));
                setText('headerRole', state.isSuperAdmin ? 'Super admin' : 'Admin');

                const modalEl = document.getElementById('adminElevateModal');
                if (modalEl) window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();

                showToast(tx('Admin szint aktiválva — token kiállítva (15 perc).', 'Admin level activated — token issued (15 min).'), 'success', 'bi-shield-fill-check');
                startTokenCountdown();
                connectAdminSocket();
                showSection(state.currentSectionId || DEFAULT_SECTION, null, { silent: true });
                elevateState.success = true;
            }
        }
    } catch (error) {
        console.error('performElevate hiba:', error);
        if (errBox) {
            errBox.textContent = tx('Hálózati hiba az elevate során.', 'Network error during elevate.');
            errBox.classList.remove('d-none');
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="bi bi-shield-fill-check me-1"></i>${tx('Aktiválás (15 perc)', 'Activate (15 min)')}`;
        }
    }

    return elevateState.success;
}

function setAdminToken(token, expiresAtIso, isSuper) {
    state.adminToken = token || null;
    state.adminTokenExpiresAt = expiresAtIso ? new Date(expiresAtIso) : null;
    state.isSuperAdmin = Boolean(isSuper);
    state.elevated = Boolean(token);
}

function clearAdminToken() {
    state.adminToken = null;
    state.adminTokenExpiresAt = null;
    state.elevated = false;
    requestController.cancelAll?.();
    if (state.adminSocket) {
        try { state.adminSocket.disconnect(); } catch (_) { }
        state.adminSocket = null;
        state.adminSocketConnected = false;
        applyWsStatusToDashboard();
    }
}

function getRemainingTokenSeconds() {
    if (!state.adminTokenExpiresAt) return 0;
    return Math.max(0, Math.floor((state.adminTokenExpiresAt - new Date()) / 1000));
}

// Auth flow forras-igazsag: shared/adminAuthFlow.js (browser + Node-tesztelheto).
// A factory-t lazyn instanciaaljuk, hogy a fuggvenyhivatkozasok hoist-olt deklaraciokra
// mutathassanak (clearAdminToken / updateTokenPill / showElevateModal / showToast).
let _adminAuthFlow = null;
function getAdminAuthFlow() {
    if (_adminAuthFlow) {
        return _adminAuthFlow;
    }
    const factory = window.MattMesterAdminAuthFlow && window.MattMesterAdminAuthFlow.createAdminAuthFlow;
    if (typeof factory !== 'function') {
        throw new Error('MattMesterAdminAuthFlow nincs betoltve (shared/adminAuthFlow.js).');
    }
    _adminAuthFlow = factory({
        state,
        fetchFn: (input, init) => fetch(input, init),
        clearAdminToken,
        updateTokenPill,
        showElevateModal,
        showToast,
        redirect: (url) => window.location.replace(url),
        flashPill: () => {
            const pill = document.getElementById('adminTokenPill');
            pill?.classList.add('refresh-flash');
            setTimeout(() => pill?.classList.remove('refresh-flash'), 600);
        }
    });
    return _adminAuthFlow;
}

function handleAdminAuthError(code) {
    return getAdminAuthFlow().handleAdminAuthError(code);
}

function adminAuthHeaders(extra) {
    return getAdminAuthFlow().adminAuthHeaders(extra);
}

