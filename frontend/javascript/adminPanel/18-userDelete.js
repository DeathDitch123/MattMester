/* =============================================================
   Inline delete form: hold-to-confirm + jelszo-verifikacio (mint a ban-nal)
   ============================================================= */
let deleteHoldTimer = null;

function startDeleteHold(btn) {
    if (!btn || btn.disabled) return;
    if (deleteHoldTimer) { clearTimeout(deleteHoldTimer); deleteHoldTimer = null; }
    btn.classList.add('holding');
    deleteHoldTimer = setTimeout(async () => {
        btn.classList.remove('holding');
        deleteHoldTimer = null;
        await submitDeleteInline(btn);
    }, BAN_HOLD_MS);
}

function cancelDeleteHold(btn) {
    if (deleteHoldTimer) {
        clearTimeout(deleteHoldTimer);
        deleteHoldTimer = null;
    }
    if (btn) btn.classList.remove('holding');
}

async function submitDeleteInline(btn) {
    await runSafelyAsync('submitDeleteInline', async () => {
        const targetUserId = Number(btn?.dataset?.targetId) || 0;
        if (!targetUserId) { showToast('Nincs kiválasztott felhasználó.', 'danger'); return; }

        const reason = (document.getElementById('deleteReason')?.value || '').trim();
        const currentPassword = document.getElementById('deletePassword')?.value || '';

        if (!currentPassword) {
            showToast('A saját admin jelszó megadása kötelező.', 'warning', 'bi-exclamation-circle');
            return;
        }

        try {
            btn.disabled = true;
            const res = await fetch(`/api/admin/users/${targetUserId}/delete`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    currentPassword,
                    reason: reason.length > 0 ? reason : null
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                const name = data.deletedUsername ? escapeHtml(data.deletedUsername) : 'A felhasználó';
                showToast(
                    data.message || `${name} törlésre kijelölve. 24 órán belül visszaállítható a Felhasználó listából.`,
                    'success',
                    'bi-hourglass-split'
                );
                if (state.selectedUser && Number(state.selectedUser.id) === Number(targetUserId)) {
                    state.selectedUser = null;
                    state.selectedUserId = null;
                }
                await loadAdminUsersList({ silent: true });
                showSection('users', null, { silent: true });
            } else {
                if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                showToast(data.message || 'Hiba a profil törlése során.', 'danger');
                btn.disabled = false;
            }
        } catch (err) {
            showToast('Hálózati hiba a profil törlése során.', 'danger');
            console.error('inline delete hiba:', err);
            btn.disabled = false;
        }
    });
}

// Soft-deleted user visszaallitasa (24h grace-en belul). Modal popup-ban kerunk megerositest.
function restoreUserDeletion(userId) {
    if (!userId) return;
    const modalEl = document.getElementById('restoreUserModal');
    if (!modalEl || !window.bootstrap?.Modal) {
        // Fallback: ha valamiert nincs modal, browser confirm
        if (confirm('Visszaállítja a felhasználót?')) {
            executeUserRestore(userId);
        }
        return;
    }
    // Username megjelenitese a modalban (csak ha a state.users.list-ben van).
    const u = (state.users.list || []).find((x) => Number(x.id) === Number(userId));
    setText('restoreUserModalName', u?.username || `#${userId}`);
    const untilEl = document.getElementById('restoreUserModalUntil');
    if (untilEl && u?.pendingDeletionUntil) {
        untilEl.textContent = new Date(u.pendingDeletionUntil).toLocaleString('hu-HU');
    } else if (untilEl) {
        untilEl.textContent = '—';
    }
    state.restoreUserData = { userId };
    new window.bootstrap.Modal(modalEl).show();
}

async function executeUserRestore(userId) {
    if (!userId) return;
    return runSafelyAsync('executeUserRestore', async () => {
        try {
            const res = await fetch(`/api/admin/users/${userId}/restore-deletion`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' })
            });
            const data = await res.json().catch(() => ({}));
            // Modal bezarasa eredmenytol fuggetlenul (mar elindult a muvelet).
            const modalEl = document.getElementById('restoreUserModal');
            if (modalEl && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
            }
            if (res.ok && data?.success) {
                showToast(data.message || 'Felhasználó visszaállítva.', 'success', 'bi-arrow-counterclockwise');
                await loadAdminUsersList({ silent: true });
                const refreshable = ['users', 'userDetail', 'userBan', 'userDelete'];
                if (refreshable.includes(state.currentSectionId)) {
                    showSection(state.currentSectionId, null, { silent: true });
                }
            } else {
                if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                showToast(data.message || 'Hiba a visszaállításkor.', 'danger');
            }
        } catch (err) {
            console.error('executeUserRestore hiba:', err);
            showToast('Hálózati hiba a visszaállításkor.', 'danger');
        }
    });
}

function confirmUserRestore() {
    const userId = state.restoreUserData?.userId;
    if (!userId) return;
    executeUserRestore(userId);
}


function applyUserDetailAvatar() {
    try {
        const u = state.selectedUser;
        if (!u || !window.MattMesterProfileImage) return;
        const targets = [
            { el: document.getElementById('userDetailProfileImage'), size: 96 },
            { el: document.getElementById('userDetailProfileImageLarge'), size: 160 }
        ];
        for (const t of targets) {
            if (t.el) {
                window.MattMesterProfileImage.applyProfileImagePresentation(t.el, {
                    source: { username: u.username, profile_image: u.profileImage },
                    size: t.size
                });
            }
        }
    } catch (err) {
        console.warn('applyUserDetailAvatar hiba:', err);
    }
}

function setAdminUserDetailImageMessage(type, message) {
    try {
        const el = document.getElementById('adminUserDetailImageMessage');
        if (!el) return;
        if (!message) {
            el.className = 'alert d-none mt-2 mb-0 py-2 px-3';
            el.textContent = '';
            return;
        }
        el.className = `alert alert-${type} mt-2 mb-0 py-2 px-3`;
        el.textContent = message;
    } catch (err) {
        console.warn('setAdminUserDetailImageMessage hiba:', err);
    }
}

function collectAdminUserDetailFormValues() {
    const getValue = (id) => document.getElementById(id)?.value ?? '';
    const getNumber = (id, fallback = 0) => {
        const parsed = Number(getValue(id));
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    return {
        username: String(getValue('editUsername')).trim(),
        email: String(getValue('editEmail')).trim(),
        role: String(getValue('editRole')).trim(),
        emailVerified: Boolean(document.getElementById('editEmailVerified')?.checked),
        elo: getNumber('editEloClassic', 0),
        eloMM: getNumber('editEloMM', 0),
        eloBullet: getNumber('editEloBullet', 0),
        wins: getNumber('editWins', 0),
        losses: getNumber('editLosses', 0),
        draws: getNumber('editDraws', 0),
        abilitiesUsed: getNumber('editAbilitiesUsed', 0),
        reason: String(document.getElementById('editReason')?.value || '').trim()
    };
}

function applyAdminUserDetailFormValues(values) {
    const selectedUser = state.selectedUser;
    if (!selectedUser) return null;

    const updated = {
        ...selectedUser,
        username: values.username || selectedUser.username,
        email: values.email || selectedUser.email,
        role: values.role || selectedUser.role,
        emailVerified: Boolean(values.emailVerified),
        elo: values.elo,
        eloMM: values.eloMM,
        eloBullet: values.eloBullet,
        wins: values.wins,
        losses: values.losses,
        draws: values.draws,
        totalAbilities: values.abilitiesUsed,
        profileImageStatus: selectedUser.profileImageStatus || 'default'
    };

    state.selectedUser = updated;
    if (Array.isArray(state.users.list)) {
        state.users.list = state.users.list.map((item) => Number(item.id) === Number(updated.id) ? { ...item, ...updated } : item);
    }
    return updated;
}

async function saveAdminUserDetailChanges() {
    const saveBtn = document.getElementById('adminUserDetailSaveBtn');
    const originalLabel = saveBtn ? saveBtn.innerHTML : '';
    try {
        const user = state.selectedUser;
        if (!user) {
            showToast('Nincs kiválasztott felhasználó.', 'warning', 'bi-exclamation-triangle');
            return false;
        }

        const validation = validateAdminUserDetailForm();
        if (!validation.canSave) {
            if (!validation.anyChange) {
                showToast('Nincs változás a mentéshez.', 'warning', 'bi-exclamation-circle');
            } else if (validation.hasErrors) {
                showToast('Javítsd ki a piros mezőket a mentés előtt.', 'warning', 'bi-exclamation-circle');
            } else {
                showToast('Az indok legalább 10 karakter legyen.', 'warning', 'bi-exclamation-circle');
            }
            return false;
        }

        const values = collectAdminUserDetailFormValues();
        const initial = adminUserDetailFormState.initial || {};

        // Csak a tényleg megváltozott mezőket küldjük el — kisebb felület + tisztább audit log.
        const payload = { reason: values.reason };
        const fieldMap = [
            ['username', 'username'],
            ['email', 'email'],
            ['role', 'role'],
            ['emailVerified', 'emailVerified'],
            ['elo', 'eloClassic'],
            ['eloMM', 'eloMM'],
            ['eloBullet', 'eloBullet'],
            ['wins', 'wins'],
            ['losses', 'losses'],
            ['draws', 'draws'],
            ['totalAbilities', 'abilitiesUsed']
        ];
        for (const [apiKey, formKey] of fieldMap) {
            const next = formKey === 'abilitiesUsed' ? values.abilitiesUsed : values[formKey === 'eloClassic' ? 'elo' : formKey];
            const initialKey = ({
                username: 'username', email: 'email', role: 'role', emailVerified: 'emailVerified',
                eloClassic: 'eloClassic', eloMM: 'eloMM', eloBullet: 'eloBullet',
                wins: 'wins', losses: 'losses', draws: 'draws', abilitiesUsed: 'abilitiesUsed'
            })[formKey];
            if (next !== initial[initialKey]) payload[apiKey] = next;
        }

        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Mentés...';
        }

        const response = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}/edit`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.success) {
            const code = result?.code || '';
            if (code && getAdminAuthFlow().handleAdminAuthError(code)) {
                return false;
            }
            throw new Error(result?.message || 'A mentés sikertelen.');
        }

        // Backend válasz alapján szinkronizáljuk a globális state-et és minden felületet.
        const after = result.data?.after || {};
        applyAdminUserPartialUpdate(user.id, {
            username: after.username,
            email: after.email,
            role: after.role,
            emailVerified: after.emailVerified,
            elo: after.elo,
            eloMM: after.eloMM,
            eloBullet: after.eloBullet,
            wins: after.wins,
            losses: after.losses,
            draws: after.draws,
            totalAbilities: after.totalAbilities,
            // Email csere esetén a verified flag is változhatott (admin által)
            emailVerifiedAt: after.emailVerified ? (state.selectedUser?.emailVerifiedAt || new Date().toISOString()) : null
        });

        // Friss user lista + audit lista letöltése — minden admin felület naprakész
        try { loadAdminUsersList({ silent: true }); } catch (_) { }
        // Ha a "Részletek megtekintése" modal éppen ezen a useren van nyitva,
        // frissítsük a benne lévő audit + security tabok tartalmát is
        try {
            if (state.userView?.userId && Number(state.userView.userId) === Number(user.id)) {
                if (typeof loadAdminUserAuditTab === 'function') {
                    loadAdminUserAuditTab('target');
                    loadAdminUserAuditTab('actor');
                }
                if (typeof loadAdminUserSecurityActivity === 'function') {
                    loadAdminUserSecurityActivity();
                }
            }
        } catch (_) { }

        showToast(result.message || 'Mentés sikeres.', 'success', 'bi-check2-circle');
        return true;
    } catch (err) {
        console.warn('saveAdminUserDetailChanges hiba:', err);
        showToast(err?.message || 'A mentés sikertelen.', 'danger', 'bi-x-circle');
        return false;
    } finally {
        if (saveBtn) {
            saveBtn.innerHTML = originalLabel || '<i class="bi bi-check2-circle me-1"></i>Mentés';
            // a disabled állapotot a következő validateAdminUserDetailForm() helyreteszi
            try { validateAdminUserDetailForm(); } catch (_) { }
        }
    }
}

function adminSendPasswordReset(userId) {
    try {
        const user = state.selectedUser && Number(state.selectedUser.id) === Number(userId) ? state.selectedUser : (Array.isArray(state.users.list) ? state.users.list.find((x) => Number(x.id) === Number(userId)) : null);
        if (!user || !user.email) {
            showToast('Nincs kiválasztva felhasználó vagy email cím hiányzik.', 'danger', 'bi-x-circle');
            return;
        }

        const btn = event.target.closest('button');
        const originalText = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; }

        fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: user.email })
        }).then((res) => res.json().catch(() => ({}))).then((result) => {
            if (result && result.success) {
                showToast('Jelszó-visszaállító email elküldve.', 'success', 'bi-check2-circle');
            } else {
                showToast(result.message || 'Nem sikerült elküldeni a visszaállító emailt.', 'danger', 'bi-x-circle');
            }
        }).catch((err) => {
            showToast('Hálózati hiba történt a küldés során.', 'danger', 'bi-x-circle');
        }).finally(() => { if (btn) { btn.disabled = false; btn.innerHTML = originalText; } });
    } catch (e) {
        console.error('adminSendPasswordReset hiba:', e);
        showToast('Hiba történt a jelszó-visszaállítás során.', 'danger', 'bi-x-circle');
    }
}

async function adminRevokeUserSessions(userId, event) {
    try {
        const user = findAdminUserById(userId) || state.selectedUser;
        if (!user) {
            showToast('A felhasználó nem található.', 'danger', 'bi-x-circle');
            return;
        }

        // Biztonsági megerősítés kérése
        if (!confirm(`Biztosan meg akarod szakítani ${user.username || 'a felhasználó'} összes aktív munkamenetét (kijelentkeztetés minden eszközről)?`)) {
            return;
        }

        const btn = event ? event.target.closest('button') : null;
        const originalText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Folyamatban...';
        }

        const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ reason: 'admin_revoke_all_sessions' })
        });

        const result = await response.json().catch(() => ({}));

        if (response.ok && result?.success) {
            showToast(result.message || 'Munkamenetek sikeresen megszakítva.', 'success', 'bi-check2-circle');

            // Ha épp nyitva van a részletek modal, csendben frissítjük a jelenléti állapotot (offline-ra fog ugrani)
            if (state.userView?.userId && Number(state.userView.userId) === Number(userId)) {
                loadAdminUserPresence();
            }
        } else {
            const code = result?.code || '';
            // Ellenőrizzük, hogy nem auth hiba-e (pl. lejárt az admin tokenünk közben)
            if (!getAdminAuthFlow().handleAdminAuthError(code)) {
                showToast(result?.message || 'Hiba történt a munkamenetek megszakításakor.', 'danger', 'bi-x-circle');
            }
        }

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    } catch (e) {
        console.error('adminRevokeUserSessions hiba:', e);
        showToast('Hálózati hiba történt a művelet során.', 'danger', 'bi-x-circle');
    }
}

function validateAdminUserDetailImageFile(file) {
    if (!file) return 'Nincs kiválasztott fájl.';
    if (!ADMIN_USER_DETAIL_IMAGE_ALLOWED_MIME_TYPES.has(file.type)) {
        return 'Csak JPG, PNG vagy WEBP fájl tölthető fel.';
    }
    if (file.size <= 0) return 'Üres fájl nem tölthető fel.';
    if (file.size > ADMIN_USER_DETAIL_IMAGE_MAX_SIZE_BYTES) {
        return 'A fájl túl nagy. Maximum 3 MB engedélyezett.';
    }
    return '';
}

function applyAdminUserPartialUpdate(userId, partial = {}) {
    let updated = null;
    try {
        const numericId = Number(userId);
        if (!Number.isFinite(numericId)) return null;

        if (Array.isArray(state.users.list)) {
            state.users.list = state.users.list.map((entry) => {
                if (Number(entry.id) === numericId) {
                    updated = { ...entry, ...partial };
                    return updated;
                }
                return entry;
            });
        }

        if (state.selectedUser && Number(state.selectedUser.id) === numericId) {
            state.selectedUser = { ...state.selectedUser, ...partial };
            updated = state.selectedUser;
        }

        if (state.currentSectionId === 'users') {
            renderAdminUsersTable({ reason: 'refresh' });
        }
        if (state.currentSectionId === 'userDetail') {
            showSection('userDetail', null, { silent: true });
        }
        if (state.userView?.userId && Number(state.userView.userId) === numericId && updated) {
            renderAdminUserViewModal(updated);
        }
    } catch (err) {
        console.warn('applyAdminUserPartialUpdate hiba:', err);
    }
    return updated;
}

function openSelectedUserProfileView() {
    try {
        const selectedId = Number(state.selectedUser?.id || 0);
        if (!selectedId) {
            showToast('Nincs kiválasztott felhasználó.', 'warning', 'bi-exclamation-triangle');
            return false;
        }
        return openAdminUserView(selectedId);
    } catch (err) {
        console.warn('openSelectedUserProfileView hiba:', err);
        showToast('A profil megtekintés most nem elérhető.', 'danger', 'bi-x-circle');
        return false;
    }
}

