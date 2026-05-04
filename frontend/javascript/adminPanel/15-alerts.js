/* =============================================================
   Riasztások oldal: loadAlerts, szűrők, dismiss, IP-blokk, audit nyitás
   ============================================================= */

async function loadAlerts() {
    return runSafelyAsync('loadAlerts', async () => {
        if (!state.adminToken) return;
        const f = state.alertsFilter || {};
        const params = new URLSearchParams();
        params.set('limit', '200');
        if (f.includeDismissed) params.set('includeDismissed', 'true');
        if (f.kind) params.set('kind', f.kind);
        if (f.severity) params.set('severity', f.severity);
        if (f.ipAddress) params.set('ip', f.ipAddress);
        try {
            const res = await fetch(`/api/admin/alerts/recent?${params.toString()}`, {
                method: 'GET',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ Accept: 'application/json' })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
                state.liveAlerts = Array.isArray(data.data) ? data.data : [];
                state.alertsLoaded = true;
                if (state.currentSectionId === 'alerts') {
                    showSection('alerts', null, { silent: true });
                }
                refreshAdminBellBadge();
            } else {
                if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                showToast(data.message || 'Hiba az alertek betöltésekor.', 'danger');
            }
        } catch (err) {
            console.error('loadAlerts hiba:', err);
            showToast('Hálózati hiba az alertek betöltésekor.', 'danger');
        }
    });
}

function onAlertsFilterChange() {
    state.alertsFilter = {
        kind: document.getElementById('alertsFilterKind')?.value || '',
        severity: document.getElementById('alertsFilterSeverity')?.value || '',
        ipAddress: (document.getElementById('alertsFilterIp')?.value || '').trim(),
        includeDismissed: Boolean(document.getElementById('alertsFilterIncludeDismissed')?.checked)
    };
    loadAlerts();
}

function resetAlertsFilter() {
    state.alertsFilter = { kind: '', severity: '', ipAddress: '', includeDismissed: false };
    loadAlerts();
}

async function dismissOneAlert(alertId) {
    if (!alertId) return;
    return runSafelyAsync('dismissOneAlert', async () => {
        try {
            const res = await fetch(`/api/admin/alerts/${alertId}/dismiss`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
                // Optimisztikus lokális frissítés — a broadcast a többi tab-ot is meghívja
                state.liveAlerts = state.liveAlerts.map((a) =>
                    Number(a.id) === Number(alertId)
                        ? { ...a, dismissedAt: new Date().toISOString() }
                        : a
                );
                if (!state.alertsFilter?.includeDismissed) {
                    state.liveAlerts = state.liveAlerts.filter((a) => Number(a.id) !== Number(alertId));
                }
                if (state.currentSectionId === 'alerts') {
                    showSection('alerts', null, { silent: true });
                }
                showToast('Riasztás elrejtve.', 'success', 'bi-eye-slash');
            } else {
                if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                showToast(data.message || 'Hiba az elrejtéskor.', 'danger');
            }
        } catch (err) {
            console.error('dismissOneAlert hiba:', err);
            showToast('Hálózati hiba az elrejtéskor.', 'danger');
        }
    });
}

async function restoreOneAlert(alertId) {
    if (!alertId) return;
    return runSafelyAsync('restoreOneAlert', async () => {
        try {
            const res = await fetch(`/api/admin/alerts/${alertId}/restore`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
                // Optimisztikus lokalis frissites: dismissedAt = null
                state.liveAlerts = state.liveAlerts.map((a) =>
                    Number(a.id) === Number(alertId) ? { ...a, dismissedAt: null, dismissedByUserId: null } : a
                );
                if (state.currentSectionId === 'alerts') {
                    showSection('alerts', null, { silent: true });
                }
                showToast('Riasztás visszaállítva.', 'success', 'bi-arrow-counterclockwise');
            } else {
                if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                showToast(data.message || 'Hiba a visszaállításkor.', 'danger');
            }
        } catch (err) {
            console.error('restoreOneAlert hiba:', err);
            showToast('Hálózati hiba a visszaállításkor.', 'danger');
        }
    });
}

