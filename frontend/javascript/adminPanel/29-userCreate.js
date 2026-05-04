/* =============================================================
   29) Admin: Új felhasználó létrehozás (Add User modal handler)
   =============================================================
   A `#addUserModal` "Felhasználó létrehozása" gombja innen hivodik
   meg (onclick="submitCreateUser()"). Olvassa a form ertekeit, validal
   client-side, POST-olja /api/admin/users/create-re, majd egy success
   modallal mutatja a generalt ideiglenes jelszot (egyszer kerul mutatasra,
   az admin-nak masolnia kell). */


async function submitCreateUser() {
    return runSafelyAsync('submitCreateUser', async () => {
        const usernameEl = document.getElementById('createUserUsername');
        const emailEl = document.getElementById('createUserEmail');
        const roleEl = document.getElementById('createUserRole');
        const eloEl = document.getElementById('createUserInitialElo');
        const reasonEl = document.getElementById('createUserReason');
        const submitBtn = document.getElementById('createUserSubmitBtn');
        const feedbackEl = document.getElementById('createUserFeedback');

        const setFeedback = (msg, kind) => {
            if (!feedbackEl) return;
            feedbackEl.className = `alert alert-${kind || 'info'}`;
            feedbackEl.textContent = msg;
            feedbackEl.classList.remove('d-none');
        };
        const clearFeedback = () => {
            if (feedbackEl) {
                feedbackEl.classList.add('d-none');
                feedbackEl.textContent = '';
            }
        };

        clearFeedback();

        const username = (usernameEl?.value || '').trim();
        const email = (emailEl?.value || '').trim();
        const role = roleEl?.value || 'player';
        const initialElo = Number(eloEl?.value);
        const reason = (reasonEl?.value || '').trim();

        if (!username || !email) {
            setFeedback(tx('A felhasználónév és az email kötelező.', 'Username and email are required.'), 'warning');
            return;
        }
        if (reason.length < 10) {
            setFeedback(tx('Az indoklásnak legalább 10 karakter hosszúnak kell lennie.', 'The reason must be at least 10 characters long.'), 'warning');
            return;
        }
        if (!Number.isFinite(initialElo) || initialElo < 0 || initialElo > 4000) {
            setFeedback(tx('Az ELO 0 és 4000 közötti egész szám lehet.', 'ELO must be an integer between 0 and 4000.'), 'warning');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${tx('Létrehozás…', 'Creating…')}`;
        }

        try {
            const res = await fetch('/api/admin/users/create', {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ username, email, role, initialElo, reason })
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data?.success) {
                if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                setFeedback(data?.message || tx('Hiba a létrehozás során.', 'Error during creation.'), 'danger');
                return;
            }

            // Bezarjuk a "Új felhasználó" modalt es megmutatjuk a temp jelszot.
            const addModalEl = document.getElementById('addUserModal');
            if (addModalEl && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(addModalEl).hide();
            }
            // Form reset a kovetkezo nyitashoz
            if (usernameEl) usernameEl.value = '';
            if (emailEl) emailEl.value = '';
            if (roleEl) roleEl.value = 'player';
            if (eloEl) eloEl.value = '1200';
            if (reasonEl) reasonEl.value = '';
            clearFeedback();

            await showCreatedUserCredentialsModal(data.data || {});
            showToast(tx('Felhasználó sikeresen létrehozva.', 'User successfully created.'), 'success', 'bi-person-plus-fill');

            // Frissitjuk a felhasznaloi listat hogy az ujon megjelenjen
            try { await loadAdminUsersList({ silent: true }); } catch (_) {}
            if (state.currentSectionId === 'users') showSection('users', null, { silent: true });
        } catch (err) {
            console.error('submitCreateUser hiba:', err);
            setFeedback(tx('Hálózati hiba. Próbáld újra.', 'Network error. Try again.'), 'danger');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = tx('Felhasználó létrehozása', 'Create user');
            }
        }
    });
}

// Egyszeri jelszo-megmutato modal — vanilla overlay, nem fugg Bootstraptol.
// Az admin masolhatja vagy bezarhatja; bezaras utan a jelszot tobbe nem latjuk.
async function showCreatedUserCredentialsModal(info) {
    if (typeof window.mmAlert !== 'function') {
        // Vegso fallback: showToast + console
        showToast(`${tx('Új user', 'New user')}: ${info.username} | ${tx('Jelszo', 'Password')}: ${info.tempPassword}`, 'success');
        return;
    }
    const message = [
        `${tx('Felhasználó', 'User')}: ${info.username || '—'}`,
        `${tx('Email', 'Email')}: ${info.email || '—'}`,
        `${tx('Szerepkör', 'Role')}: ${info.role || 'player'}`,
        `${tx('Kezdeti ELO', 'Initial ELO')}: ${info.initialElo || 1200}`,
        '',
        `${tx('Ideiglenes jelszó', 'Temporary password')}: ${info.tempPassword || tx('(hiányzik)', '(missing)')}`,
        '',
        info.note || tx('A jelszót másold ki és továbbítsd a felhasználónak — bezárás után nem jelenik meg újra.', 'Copy the password and forward it to the user — after closing it will not be shown again.')
    ].join('\n');
    await window.mmAlert({
        title: tx('✅ Új felhasználó létrehozva', '✅ New user created'),
        message,
        okLabel: tx('Kimásoltam', 'Copied')
    });
}
