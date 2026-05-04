/* =============================================================
   Bejelentkezesek (security) oldal: kliens-szintu classifier-ek + handler-ek
   ============================================================= */

// A backend (networkClassifier.js) Hu nyelvu, statikus location label-eket general
// es perzisztal a payload-ba (`location.label`). Ezeket render-szinten kell
// EN-re forditani, ha a felhasznalo angol nyelvre allt at — kulonben az admin
// "Login history" oldalon EN modban is HU szovegek jelennek meg.
function translateLocationLabel(label) {
    if (!label || typeof label !== 'string') return label || '—';
    // 100% pontos egyezesek a backend networkClassifier.js label-jeibol.
    const map = {
        'Szervergép': 'Server host',
        'Link-local (APIPA)': 'Link-local (APIPA)',
        'Belső hálózat (10.x)': 'Internal network (10.x)',
        'Belső hálózat (LAN)': 'Internal network (LAN)',
        'Belső hálózat (172.x)': 'Internal network (172.x)',
        'Docker hálózat': 'Docker network',
        'Mobilhálózat (CGNAT)': 'Mobile network (CGNAT)',
        'IPv6 link-local': 'IPv6 link-local',
        'Belső IPv6': 'Internal IPv6',
        'Külső IP': 'Public IP',
        'Ismeretlen': 'Unknown',
        'Ismeretlen geoIP': 'Unknown geoIP',
        'Helyi hálózat': 'Local network',
        'Mobil hálózat': 'Mobile network'
    };
    if (Object.prototype.hasOwnProperty.call(map, label)) {
        return tx(label, map[label]);
    }
    return label; // ismeretlen / publikus geo-label (pl. "Budapest, HU") — valtozatlanul
}

// A backend networkClassifier.js mini-masolata frontend-szintre. A socket broadcast
// payload-ja nem tartalmazza az enrichment mezoket, ezert kliens-szinten szamoljuk.
function classifyIpClient(ip) {
    if (!ip || ip === 'ismeretlen') return { category: 'unknown', label: '—' };
    const lower = String(ip).toLowerCase().trim();
    if (lower === '127.0.0.1' || lower === '::1' || lower === '::ffff:127.0.0.1' ||
        lower.startsWith('127.') || lower === 'localhost') {
        return { category: 'loopback', label: tx('Szervergép', 'Server host') };
    }
    if (/^169\.254\./.test(lower)) return { category: 'link-local', label: tx('Link-local (APIPA)', 'Link-local (APIPA)') };
    if (/^10\./.test(lower)) return { category: 'private', label: tx('Belső hálózat (10.x)', 'Internal network (10.x)') };
    if (/^192\.168\./.test(lower)) return { category: 'private', label: tx('Belső hálózat (LAN)', 'Internal network (LAN)') };
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(lower)) {
        if (/^172\.17\./.test(lower)) return { category: 'docker', label: tx('Docker hálózat', 'Docker network') };
        return { category: 'private', label: tx('Belső hálózat (172.x)', 'Internal network (172.x)') };
    }
    if (/^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./.test(lower)) {
        return { category: 'cgnat', label: tx('Mobilhálózat (CGNAT)', 'Mobile network (CGNAT)') };
    }
    if (/^fe[89ab][0-9a-f]:/i.test(lower)) return { category: 'link-local', label: tx('IPv6 link-local', 'IPv6 link-local') };
    if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return { category: 'private', label: tx('Belső IPv6', 'Internal IPv6') };
    if (lower.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(lower)) {
        return { category: 'public', label: tx('Külső IP', 'Public IP') };
    }
    return { category: 'unknown', label: '—' };
}

function parseUserAgentClient(ua) {
    if (!ua) return { browser: '—', os: '—', display: '—', icon: 'bi-question-circle' };
    const u = String(ua);
    let browser = tx('Egyéb', 'Other'), icon = 'bi-globe';
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
    let os = tx('Egyéb', 'Other');
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
                showToast(data.message || tx('Hiba a bejelentkezések betöltésekor.', 'Error loading logins.'), 'danger');
            }
        } catch (err) {
            console.error('loadLogins hiba:', err);
            showToast(tx('Hálózati hiba a bejelentkezések betöltésekor.', 'Network error loading logins.'), 'danger');
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
                showToast(data.message || tx(`CSV export hiba (HTTP ${res.status}).`, `CSV export error (HTTP ${res.status}).`), 'danger');
                return;
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${tx('bejelentkezesek', 'logins')}-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(tx('CSV export elkészült.', 'CSV export ready.'), 'success', 'bi-download');
        } catch (err) {
            console.error('exportLoginsCsv hiba:', err);
            showToast(tx('Hálózati hiba a CSV exportnál.', 'Network error during CSV export.'), 'danger');
        }
    });
}

async function dismissAllAlerts() {
    const undismissedCount = (state.liveAlerts || []).filter((a) => !a.dismissedAt).length;
    if (undismissedCount === 0) {
        showToast(tx('Nincs elrejtendő riasztás.', 'No alerts to hide.'), 'info', 'bi-info-circle');
        return;
    }
    const ok = await (typeof window.mmConfirm === 'function'
        ? window.mmConfirm({
            title: tx('Összes aktív riasztás elrejtése', 'Hide all active alerts'),
            message: tx(
                `Biztosan elrejti az összes (${undismissedCount}) aktív riasztást?\n\nAz adatok megmaradnak — az "Elrejtettek mutatása" szűrővel bármikor visszanézheted.`,
                `Are you sure you want to hide all (${undismissedCount}) active alerts?\n\nThe data is preserved — use the "Show hidden" filter to view them again.`
            ),
            confirmLabel: tx('Elrejtés', 'Hide'),
            danger: true
        })
        : Promise.resolve(window.confirm(tx(`Biztosan elrejti az összes (${undismissedCount}) aktív riasztást?`, `Are you sure you want to hide all (${undismissedCount}) active alerts?`))));
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
                showToast(tx(`${data.affected || 0} riasztás elrejtve.`, `${data.affected || 0} alerts hidden.`), 'success', 'bi-eye-slash-fill');
            } else {
                if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                showToast(data.message || tx('Hiba az elrejtéskor.', 'Error hiding alerts.'), 'danger');
            }
        } catch (err) {
            console.error('dismissAllAlerts hiba:', err);
            showToast(tx('Hálózati hiba az elrejtéskor.', 'Network error while hiding alerts.'), 'danger');
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
        showToast(tx('Nincs IP cím a blokkoláshoz.', 'No IP address to block.'), 'warning');
        return;
    }
    const modalEl = document.getElementById('ipBlockModal');
    if (!modalEl || !window.bootstrap?.Modal) {
        showToast(tx('IP blokk modal nem elérhető.', 'IP block modal unavailable.'), 'warning');
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
        duration.placeholder = tx('Nincs lejárat', 'No expiration');
    } else {
        duration.disabled = false;
        duration.placeholder = '';
        if (!duration.value) duration.value = '24';
    }
}

async function submitIpBlock() {
    return runSafelyAsync('submitIpBlock', async () => {
        const { ipAddress } = state.ipBlockData || {};
        if (!ipAddress) { showToast(tx('Nincs IP cím.', 'No IP address.'), 'danger'); return; }

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
                showToast(data.message || tx(`IP ${ipAddress} blokkolva.`, `IP ${ipAddress} blocked.`), 'success', 'bi-shield-fill-check');
            } else {
                if (data?.code && getAdminAuthFlow().handleAdminAuthError(data.code)) return;
                showToast(data.message || tx('Hiba az IP blokkolásánál.', 'Error blocking IP.'), 'danger');
            }
        } catch (err) {
            console.error('submitIpBlock hiba:', err);
            showToast(tx('Hálózati hiba az IP blokkolásánál.', 'Network error while blocking IP.'), 'danger');
        }
    });
}

