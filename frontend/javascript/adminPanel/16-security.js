/* =============================================================
   Bejelentkezesek (security) oldal: kliens-szintu classifier-ek + handler-ek
   ============================================================= */

// A backend networkClassifier.js mini-masolata frontend-szintre. A socket broadcast
// payload-ja nem tartalmazza az enrichment mezoket, ezert kliens-szinten szamoljuk.
function classifyIpClient(ip) {
    if (!ip || ip === 'ismeretlen') return { category: 'unknown', label: '—' };
    const lower = String(ip).toLowerCase().trim();
    if (lower === '127.0.0.1' || lower === '::1' || lower === '::ffff:127.0.0.1' ||
        lower.startsWith('127.') || lower === 'localhost') {
        return { category: 'loopback', label: 'Szervergép' };
    }
    if (/^169\.254\./.test(lower)) return { category: 'link-local', label: 'Link-local (APIPA)' };
    if (/^10\./.test(lower)) return { category: 'private', label: 'Belső hálózat (10.x)' };
    if (/^192\.168\./.test(lower)) return { category: 'private', label: 'Belső hálózat (LAN)' };
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(lower)) {
        if (/^172\.17\./.test(lower)) return { category: 'docker', label: 'Docker hálózat' };
        return { category: 'private', label: 'Belső hálózat (172.x)' };
    }
    if (/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(lower)) {
        return { category: 'cgnat', label: 'Mobilhálózat (CGNAT)' };
    }
    if (/^fe[89ab][0-9a-f]:/i.test(lower)) return { category: 'link-local', label: 'IPv6 link-local' };
    if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return { category: 'private', label: 'Belső IPv6' };
    if (lower.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(lower)) {
        return { category: 'public', label: 'Külső IP' };
    }
    return { category: 'unknown', label: '—' };
}

function parseUserAgentClient(ua) {
    if (!ua) return { browser: '—', os: '—', display: '—', icon: 'bi-question-circle' };
    const u = String(ua);
    let browser = 'Egyéb', icon = 'bi-globe';
    if (/Edg\//i.test(u)) { browser = 'Edge'; icon = 'bi-browser-edge'; }
    else if (/OPR\/|Opera/i.test(u)) { browser = 'Opera'; icon = 'bi-globe'; }
    else if (/Vivaldi\//i.test(u)) { browser = 'Vivaldi'; icon = 'bi-globe'; }
    else if (/Brave\//i.test(u)) { browser = 'Brave'; icon = 'bi-globe'; }
    else if (/SamsungBrowser\//i.test(u)) { browser = 'Samsung Internet'; icon = 'bi-globe'; }
    else if (/YaBrowser\//i.test(u)) { browser = 'Yandex'; icon = 'bi-globe'; }
    else if (/UCBrowser\//i.test(u)) { browser = 'UC Browser'; icon = 'bi-globe'; }
    else if (/Chromium\//i.test(u)) { browser = 'Chromium'; icon = 'bi-browser-chrome'; }
    else if (/Chrome\//i.test(u)) { browser = 'Chrome'; icon = 'bi-browser-chrome'; }
    else if (/Firefox\//i.test(u)) { browser = 'Firefox'; icon = 'bi-browser-firefox'; }
    else if (/Safari\//i.test(u) && !/Chrome|Edg|OPR/i.test(u)) { browser = 'Safari'; icon = 'bi-browser-safari'; }
    let os = 'Egyéb';
    if (/Windows NT/i.test(u)) os = 'Windows';
    else if (/Android/i.test(u)) os = 'Android';
    else if (/iPhone|iPad|iPod|iOS/i.test(u)) os = 'iOS';
    else if (/CrOS/i.test(u)) os = 'ChromeOS';
    else if (/Mac OS X|Macintosh/i.test(u)) os = 'macOS';
    else if (/Ubuntu/i.test(u)) os = 'Ubuntu';
    else if (/Fedora/i.test(u)) os = 'Fedora';
    else if (/Debian/i.test(u)) os = 'Debian';
    else if (/FreeBSD/i.test(u)) os = 'FreeBSD';
    else if (/OpenBSD/i.test(u)) os = 'OpenBSD';
    else if (/X11|Linux/i.test(u)) os = 'Linux';
    return { browser, os, display: `${browser} / ${os}`, icon };
}

async function loadLogins() {
    return runSafelyAsync('loadLogins', async () => {
        if (!state.adminToken) return;
        const f = state.loginsFilter || {};
        const params = new URLSearchParams();
        params.set('limit', '200');
        if (f.username) params.set('username', f.username);
        if (f.status && f.status !== 'all') params.set('status', f.status);
        if (f.device) params.set('device', f.device);
        if (f.sinceDate) params.set('since', new Date(f.sinceDate).toISOString());
        if (f.untilDate) params.set('until', new Date(f.untilDate).toISOString());
        try {
            const res = await fetch(`/api/admin/security/logins?${params.toString()}`, {
                method: 'GET',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ Accept: 'application/json' })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
                state.liveLogins = Array.isArray(data.data) ? data.data : [];
                state.loginsLoaded = true;
                if (state.currentSectionId === 'security') {
                    showSection('security', null, { silent: true });
                }
            } else {
                if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                showToast(data.message || 'Hiba a bejelentkezések betöltésekor.', 'danger');
            }
        } catch (err) {
            console.error('loadLogins hiba:', err);
            showToast('Hálózati hiba a bejelentkezések betöltésekor.', 'danger');
        }
    });
}

function onLoginsFilterChange() {
    state.loginsFilter = {
        username: (document.getElementById('loginsFilterUsername')?.value || '').trim(),
        status: document.getElementById('loginsFilterStatus')?.value || 'all',
        device: document.getElementById('loginsFilterDevice')?.value || '',
        sinceDate: document.getElementById('loginsFilterSince')?.value || '',
        untilDate: document.getElementById('loginsFilterUntil')?.value || ''
    };
    loadLogins();
}

function resetLoginsFilter() {
    state.loginsFilter = { username: '', status: 'all', device: '', sinceDate: '', untilDate: '' };
    loadLogins();
}

function exportLoginsCsv() {
    const f = state.loginsFilter || {};
    const params = new URLSearchParams();
    params.set('limit', '500');
    if (f.username) params.set('username', f.username);
    if (f.status && f.status !== 'all') params.set('status', f.status);
    if (f.device) params.set('device', f.device);
    if (f.sinceDate) params.set('since', new Date(f.sinceDate).toISOString());
    if (f.untilDate) params.set('until', new Date(f.untilDate).toISOString());

    // Bearer admin token kell — fetch + Blob download (window.open nem visz headert).
    runSafelyAsync('exportLoginsCsv', async () => {
        try {
            const res = await fetch(`/api/admin/security/logins.csv?${params.toString()}`, {
                method: 'GET',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ Accept: 'text/csv' })
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                showToast(data.message || `CSV export hiba (HTTP ${res.status}).`, 'danger');
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bejelentkezesek-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('CSV export elkészült.', 'success', 'bi-download');
        } catch (err) {
            console.error('exportLoginsCsv hiba:', err);
            showToast('Hálózati hiba a CSV exportnál.', 'danger');
        }
    });
}

async function dismissAllAlerts() {
    const undismissedCount = (state.liveAlerts || []).filter((a) => !a.dismissedAt).length;
    if (undismissedCount === 0) {
        showToast('Nincs elrejtendő riasztás.', 'info', 'bi-info-circle');
        return;
    }
    const ok = await (typeof window.mmConfirm === 'function'
        ? window.mmConfirm({
            title: 'Összes aktív riasztás elrejtése',
            message: `Biztosan elrejti az összes (${undismissedCount}) aktív riasztást?\n\nAz adatok megmaradnak — az "Elrejtettek mutatása" szűrővel bármikor visszanézheted.`,
            confirmLabel: 'Elrejtés',
            danger: true
        })
        : Promise.resolve(window.confirm(`Biztosan elrejti az összes (${undismissedCount}) aktív riasztást?`)));
    if (!ok) return;
    return runSafelyAsync('dismissAllAlerts', async () => {
        try {
            const res = await fetch(`/api/admin/alerts/dismiss-all`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
                if (state.alertsFilter?.includeDismissed) {
                    state.liveAlerts = state.liveAlerts.map((a) =>
                        a.dismissedAt ? a : { ...a, dismissedAt: new Date().toISOString() }
                    );
                } else {
                    state.liveAlerts = [];
                }
                if (state.currentSectionId === 'alerts') {
                    showSection('alerts', null, { silent: true });
                }
                showToast(`${data.affected || 0} riasztás elrejtve.`, 'success', 'bi-eye-slash-fill');
            } else {
                if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                showToast(data.message || 'Hiba az elrejtéskor.', 'danger');
            }
        } catch (err) {
            console.error('dismissAllAlerts hiba:', err);
            showToast('Hálózati hiba az elrejtéskor.', 'danger');
        }
    });
}

function openAuditFromAlert(alertId, ip, userId, occurredAt) {
    try {
        const occurredTs = occurredAt ? new Date(occurredAt).getTime() : Date.now();
        state.auditFilterIntent = {
            ip: ip || '',
            userId: userId || null,
            sinceDate: new Date(occurredTs - 60 * 60 * 1000).toISOString(),
            untilDate: new Date(occurredTs + 60 * 60 * 1000).toISOString()
        };
        showSection('auditLog');
    } catch (err) {
        console.warn('openAuditFromAlert hiba:', err);
        showSection('auditLog');
    }
}

function clearAuditFilterIntent() {
    state.auditFilterIntent = null;
    if (state.currentSectionId === 'auditLog') {
        showSection('auditLog', null, { silent: true });
    }
}

function openIpBlockModal(ipAddress, alertId) {
    if (!ipAddress) {
        showToast('Nincs IP cím a blokkoláshoz.', 'warning');
        return;
    }
    const modalEl = document.getElementById('ipBlockModal');
    if (!modalEl || !window.bootstrap?.Modal) {
        showToast('IP blokk modal nem elérhető.', 'warning');
        return;
    }
    setText('ipBlockModalIp', ipAddress);
    const reasonField = document.getElementById('ipBlockReason');
    const durationField = document.getElementById('ipBlockDuration');
    const typeField = document.getElementById('ipBlockType');
    if (reasonField) reasonField.value = '';
    if (durationField) durationField.value = '24';
    if (typeField) typeField.value = 'Ideiglenes';
    state.ipBlockData = { ipAddress, alertId };
    new window.bootstrap.Modal(modalEl).show();
}

function onIpBlockTypeChange() {
    const type = document.getElementById('ipBlockType')?.value;
    const duration = document.getElementById('ipBlockDuration');
    if (!duration) return;
    if (type === 'Végleges') {
        duration.disabled = true;
        duration.value = '';
        duration.placeholder = 'Nincs lejárat';
    } else {
        duration.disabled = false;
        duration.placeholder = '';
        if (!duration.value) duration.value = '24';
    }
}

async function submitIpBlock() {
    return runSafelyAsync('submitIpBlock', async () => {
        const { ipAddress } = state.ipBlockData || {};
        if (!ipAddress) { showToast('Nincs IP cím.', 'danger'); return; }

        const type = document.getElementById('ipBlockType')?.value || 'Ideiglenes';
        const durationHours = Number(document.getElementById('ipBlockDuration')?.value) || 24;
        const reason = (document.getElementById('ipBlockReason')?.value || '').trim();

        let blockedUntil = null;
        if (type !== 'Végleges') {
            const until = new Date();
            until.setHours(until.getHours() + Math.max(1, durationHours));
            blockedUntil = until.toISOString();
        }

        try {
            const res = await fetch('/api/admin/ip-blocks', {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ ipAddress, blockedUntil, reason: reason || null })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
                const modalEl = document.getElementById('ipBlockModal');
                if (modalEl) window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
                showToast(data.message || `IP ${ipAddress} blokkolva.`, 'success', 'bi-shield-fill-check');
            } else {
                if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                showToast(data.message || 'Hiba az IP blokkolásánál.', 'danger');
            }
        } catch (err) {
            console.error('submitIpBlock hiba:', err);
            showToast('Hálózati hiba az IP blokkolásánál.', 'danger');
        }
    });
}

