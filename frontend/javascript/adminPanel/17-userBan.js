/* =============================================================
   Inline ban form: hold-to-confirm + jelszo verifikacio
   ============================================================= */
const BAN_HOLD_MS = 5000;
let banHoldTimer = null;

function onBanTypeChange() {
    const banType = document.getElementById('banType')?.value;
    const banDuration = document.getElementById('banDuration');
    if (!banDuration) return;
    if (banType === 'Végleges') {
        banDuration.disabled = true;
        banDuration.value = '';
        banDuration.placeholder = 'Nincs lejárat';
    } else {
        banDuration.disabled = false;
        banDuration.placeholder = '';
        if (!banDuration.value) banDuration.value = '24';
    }
}

function onBanReasonInput(textarea) {
    const counter = document.getElementById('banReasonCount');
    if (!counter || !textarea) return;
    const len = textarea.value.length;
    counter.textContent = String(len);
    counter.parentElement.classList.toggle('valid', len >= 10);
}

function startBanHold(btn) {
    if (!btn || btn.disabled) return;
    if (banHoldTimer) { clearTimeout(banHoldTimer); banHoldTimer = null; }
    btn.classList.add('holding');
    banHoldTimer = setTimeout(async () => {
        btn.classList.remove('holding');
        banHoldTimer = null;
        await submitBanInline(btn);
    }, BAN_HOLD_MS);
}

function cancelBanHold(btn) {
    if (banHoldTimer) {
        clearTimeout(banHoldTimer);
        banHoldTimer = null;
    }
    if (btn) btn.classList.remove('holding');
}

async function submitBanInline(btn) {
    await runSafelyAsync('submitBanInline', async () => {
        const targetUserId = Number(btn?.dataset?.targetId) || 0;
        if (!targetUserId) { showToast('Nincs kiválasztott felhasználó.', 'danger'); return; }

        const banType = document.getElementById('banType')?.value || 'Ideiglenes';
        const durationHours = Number(document.getElementById('banDuration')?.value) || 24;
        const reason = (document.getElementById('banReason')?.value || '').trim();
        const currentPassword = document.getElementById('banPassword')?.value || '';

        if (reason.length < 10) {
            showToast('Az indoknak legalább 10 karakter hosszúnak kell lennie.', 'warning', 'bi-exclamation-circle');
            return;
        }
        if (!currentPassword) {
            showToast('A saját admin jelszó megadása kötelező.', 'warning', 'bi-exclamation-circle');
            return;
        }

        try {
            btn.disabled = true;
            const res = await fetch(`/api/admin/users/${targetUserId}/ban`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ banType, durationHours, reason, currentPassword })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
                showToast('A felhasználó sikeresen tiltva lett.', 'success', 'bi-shield-fill-check');
                await loadAdminUsersList({ silent: true });
                showSection(state.currentSectionId, null, { silent: true });
            } else {
                if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                showToast(data.message || 'Hiba a tiltás alkalmazásánál.', 'danger');
                btn.disabled = false;
            }
        } catch (err) {
            showToast('Hálózati hiba a tiltás során.', 'danger');
            console.error('inline ban hiba:', err);
            btn.disabled = false;
        }
    });
}

