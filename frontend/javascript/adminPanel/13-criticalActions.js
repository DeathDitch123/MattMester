/* =============================================================
   16) Toast + kritikus művelet modal helperek
   ============================================================= */
function showToast(message, variant = 'success', icon = 'bi-check-circle-fill') {
    let container = document.getElementById('adminToastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'adminToastContainer';
        container.className = 'admin-toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `admin-toast admin-toast-${variant}`;
    toast.innerHTML = `<i class="bi ${icon}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function openCriticalAction(action, targetLabel, overrideTargetUserId, extras = null) {
    try {
        const modalEl = document.getElementById('criticalActionModal');
        if (modalEl && window.bootstrap?.Modal) {
            const titleMap = {
                'users.ban': 'Felhasználó tiltása',
                'users.unban': 'Tiltás feloldása',
                'users.delete': 'Felhasználó törlése',
                'chat.delete': 'Chat üzenet törlése',
                'notifications.broadcast': 'Globális értesítés küldése',
                'admin.grant': 'Admin szerep kiosztása',
                'admin.revoke': 'Admin szerep visszavonása',
                'settings.edit': 'Beállítások mentése',
                'abilities.edit': 'Képesség módosítása',
                'social.unblock': 'Blokk feloldása',
                'games.force_end': 'Meccs erőszakos befejezése'
                // tests.run sajat modallal megy (testsRunConfirmModal) — nem kerulhet ide
            };
            // Pozitiv (zold) styling: a tiltas-feloldas vissza-allitja a hozzaferest, nem destruktiv.
            const positiveActions = new Set(['users.unban']);
            const modalContent = modalEl.querySelector('.critical-action-modal');
            if (modalContent) {
                modalContent.classList.toggle('is-positive', positiveActions.has(action));
            }
            setText('criticalActionTitle', titleMap[action] || action);
            const desc = document.getElementById('criticalActionDescription');
            if (desc) {
                desc.innerHTML = `
                    <strong class="text-white">Művelet:</strong> <code class="text-gold">${escapeHtml(action)}</code><br>
                    <strong class="text-white">Cél:</strong> ${escapeHtml(targetLabel)}
                `;
            }
            const reasonField = document.getElementById('criticalReason');
            const counter = document.getElementById('criticalReasonCount');
            // Reason opcionalis kategoria: ezeknel a counter "valid" mindig, es a "/10" jelolés nem mutatódik.
            // Egyezzen a backend-OPTIONAL_REASON_ACTIONS-szal (constants.js).
            const OPTIONAL_REASON = new Set([
                'users.delete',
                'chat.delete',
                'games.force_end',
                'abilities.edit',
                'social.unblock',
                'profile_image.review'
            ]);
            const isOptionalReason = OPTIONAL_REASON.has(action);
            // Ha az inline panelen már megadta az indokot (ban vagy delete), vegyük át (nincs duplikáció).
            const inlineReason = (document.getElementById('banReason')?.value?.trim()
                || document.getElementById('deleteReason')?.value?.trim()
                || '');
            if (reasonField && counter) {
                reasonField.value = inlineReason;
                const initLen = inlineReason.length;
                counter.textContent = String(initLen);
                const isValid = isOptionalReason ? true : (initLen >= 10);
                counter.parentElement.classList.toggle('valid', isValid);
                reasonField.oninput = () => {
                    const len = reasonField.value.length;
                    counter.textContent = String(len);
                    counter.parentElement.classList.toggle('valid', isOptionalReason ? true : (len >= 10));
                };
                counter.textContent = String(initLen);
                if (counter.nextSibling) counter.nextSibling.textContent = isOptionalReason ? '' : ' / 10';
                // A reason mezo label-jet is jelolni ki a "*" piros csillaggal csak akkor
                // ha kotelezo. Opcionalisnal "(opcionalis)" felirat jelenik meg helyette.
                const reasonLabel = document.querySelector('label[for="criticalReason"]');
                if (reasonLabel) {
                    if (isOptionalReason) {
                        // Opcionalis reason: nincs char-szamlalo, nincs csillag, csak "(opcionalis)" felirat.
                        reasonLabel.innerHTML = `Indok <span class="text-secondary fw-normal small ms-1">(opcionális)</span>`;
                    } else {
                        reasonLabel.innerHTML = `Indok <span class="text-danger">*</span>
                            <span class="critical-reason-counter ms-2">
                                <span id="criticalReasonCount">${initLen}</span> / 10
                            </span>`;
                        // A label-en belul ujraepitett "criticalReasonCount"-ra ujra rakni az event listenert
                        const newCounter = document.getElementById('criticalReasonCount');
                        if (newCounter) {
                            const newCounterParent = newCounter.parentElement;
                            newCounterParent.classList.toggle('valid', initLen >= 10);
                            reasonField.oninput = () => {
                                const len = reasonField.value.length;
                                newCounter.textContent = String(len);
                                newCounterParent.classList.toggle('valid', len >= 10);
                            };
                        }
                    }
                }
                // Placeholder is logic-fuggore valtoztatassa
                reasonField.placeholder = isOptionalReason
                    ? 'Indoklás (opcionális) — üresen is hagyható.'
                    : 'Naplózásra kerülő indok (min. 10 karakter)…';
            }
            const passwordField = document.getElementById('criticalPassword');
            if (passwordField) {
                passwordField.value = '';
            }
            const targetUserId = overrideTargetUserId != null ? overrideTargetUserId : (state.selectedUser?.id || null);
            state.criticalActionData = { action, targetUserId, targetLabel, ...(extras || {}) };
            new window.bootstrap.Modal(modalEl).show();
        } else {
            showToast(`A(z) ${action} még csak shell elem.`, 'info', 'bi-cone-striped');
        }
    } catch (error) {
        console.error('openCriticalAction hiba:', error);
        showToast('A kritikus művelet nézet még nem kész.', 'danger', 'bi-exclamation-triangle-fill');
    }
}

async function executeCriticalAction() {
    await runSafelyAsync('executeCriticalAction', async () => {
        const modalEl = document.getElementById('criticalActionModal');
        if (modalEl && window.bootstrap?.Modal) {
            // aria-hidden warning vedelem: blur az aktiv elemen mielott bezarjuk a modalt
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }
            window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
        }

        const { action, targetUserId } = state.criticalActionData || {};
        const reason = document.getElementById('criticalReason')?.value?.trim() || '';
        const currentPassword = document.getElementById('criticalPassword')?.value || '';

        // Opcionalis reason action-ok (egyezzen az openCriticalAction OPTIONAL_REASON setjevel).
        const REASON_OPTIONAL_ACTIONS = new Set([
            'users.delete', 'chat.delete', 'games.force_end',
            'abilities.edit', 'social.unblock', 'profile_image.review'
        ]);
        const reasonOptional = REASON_OPTIONAL_ACTIONS.has(action);
        if (!reasonOptional && reason.length < 10) {
            showToast('Az indoknak legalább 10 karakter hosszúnak kell lennie.', 'warning', 'bi-exclamation-circle');
            return;
        }

        // users.delete esetén a saját admin jelszó kötelező (a backend bcrypt-tel ellenőrzi).
        if (action === 'users.delete' && !currentPassword) {
            showToast('A saját admin jelszó megadása kötelező.', 'warning', 'bi-exclamation-circle');
            return;
        }

        if (action === 'users.ban') {
            if (!targetUserId) { showToast('Nincs kiválasztott felhasználó.', 'danger'); return; }
            const banType = document.getElementById('banType')?.value || 'Ideiglenes';
            const durationHours = Number(document.getElementById('banDuration')?.value) || 24;
            try {
                const res = await fetch(`/api/admin/users/${targetUserId}/ban`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ banType, durationHours, reason })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.success) {
                    showToast('A felhasználó sikeresen tiltva lett.', 'success', 'bi-shield-fill-check');
                    await loadAdminUsersList({ silent: true });
                    showSection(state.currentSectionId, null, { silent: true });
                } else {
                    if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                    showToast(data.message || 'Hiba a tiltás alkalmazásánál.', 'danger');
                }
            } catch (err) {
                showToast('Hálózati hiba a tiltás során.', 'danger');
                console.error('ban hiba:', err);
            }
        } else if (action === 'users.unban') {
            if (!targetUserId) { showToast('Nincs kiválasztott felhasználó.', 'danger'); return; }
            try {
                const res = await fetch(`/api/admin/users/${targetUserId}/unban`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ reason })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.success) {
                    showToast('A tiltás sikeresen feloldva.', 'success', 'bi-check-circle-fill');
                    await loadAdminUsersList({ silent: true });
                    showSection(state.currentSectionId, null, { silent: true });
                } else {
                    if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                    showToast(data.message || 'Hiba a tiltás feloldásánál.', 'danger');
                }
            } catch (err) {
                showToast('Hálózati hiba a tiltás feloldása során.', 'danger');
                console.error('unban hiba:', err);
            }
        } else if (action === 'users.delete') {
            if (!targetUserId) { showToast('Nincs kiválasztott felhasználó.', 'danger'); return; }
            try {
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
                    showToast(`${name} profilja sikeresen törölve.`, 'success', 'bi-trash3-fill');
                    // A torolt user-t ki kell venni a state-bol, kulonben a userDelete view 'kijelolve' marad.
                    if (state.selectedUser && Number(state.selectedUser.id) === Number(targetUserId)) {
                        state.selectedUser = null;
                    }
                    await loadAdminUsersList({ silent: true });
                    showSection(state.currentSectionId, null, { silent: true });
                } else {
                    if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                    showToast(data.message || 'Hiba a profil törlése során.', 'danger');
                }
            } catch (err) {
                showToast('Hálózati hiba a profil törlése során.', 'danger');
                console.error('user delete hiba:', err);
            }
        } else if (action === 'chat.delete') {
            const messageId = Number(state.criticalActionData?.messageId) || 0;
            if (!messageId) {
                showToast('Nincs kiválasztott üzenet a törléshez.', 'danger');
                return;
            }
            try {
                const res = await fetch(`/api/admin/chat/messages/${messageId}/delete`, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ reason })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data.success) {
                    showToast('Az üzenet véglegesen törölve.', 'success', 'bi-trash3-fill');
                    window.MattMesterAdminChatModeration?.refresh?.();
                } else {
                    if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                    showToast(data.message || 'Hiba az üzenet törlésénél.', 'danger');
                }
            } catch (err) {
                showToast('Hálózati hiba az üzenet törlésénél.', 'danger');
                console.error('chat delete hiba:', err);
            }
        } else {
            showToast(`A(z) ${action || 'ismeretlen'} művelet még nincs bekötve.`, 'info', 'bi-cone-striped');
        }
    });
}

