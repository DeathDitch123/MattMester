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
            setFeedback('A felhasználónév és az email kötelező.', 'warning');
            return;
        }
        if (reason.length < 10) {
            setFeedback('Az indoklásnak legalább 10 karakter hosszúnak kell lennie.', 'warning');
            return;
        }
        if (!Number.isFinite(initialElo) || initialElo < 0 || initialElo > 4000) {
            setFeedback('Az ELO 0 és 4000 közötti egész szám lehet.', 'warning');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Létrehozás…';
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
                setFeedback(data?.message || 'Hiba a létrehozás során.', 'danger');
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
            showToast('Felhasználó sikeresen létrehozva.', 'success', 'bi-person-plus-fill');

            // Frissitjuk a felhasznaloi listat hogy az ujon megjelenjen
            try { await loadAdminUsersList({ silent: true }); } catch (_) {}
            if (state.currentSectionId === 'users') showSection('users', null, { silent: true });
        } catch (err) {
            console.error('submitCreateUser hiba:', err);
            setFeedback('Hálózati hiba. Próbáld újra.', 'danger');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Felhasználó létrehozása';
            }
        }
    });
}

// Egyszeri jelszo-megmutato modal — vanilla overlay, nem fugg Bootstraptol.
// Az admin masolhatja vagy bezarhatja; bezaras utan a jelszot tobbe nem latjuk.
async function showCreatedUserCredentialsModal(info) {
    if (typeof window.mmAlert !== 'function') {
        // Vegso fallback: showToast + console
        showToast(`Új user: ${info.username} | Jelszo: ${info.tempPassword}`, 'success');
        return;
    }
    const message = [
        `Felhasználó: ${info.username || '—'}`,
        `Email: ${info.email || '—'}`,
        `Szerepkör: ${info.role || 'player'}`,
        `Kezdeti ELO: ${info.initialElo || 1200}`,
        '',
        `Ideiglenes jelszó: ${info.tempPassword || '(hiányzik)'}`,
        '',
        info.note || 'A jelszót másold ki és továbbítsd a felhasználónak — bezárás után nem jelenik meg újra.'
    ].join('\n');
    await window.mmAlert({
        title: '✅ Új felhasználó létrehozva',
        message,
        okLabel: 'Kimásoltam'
    });
}
