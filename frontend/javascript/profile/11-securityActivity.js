function getSecurityActivityElements() {
    return {
        tbody: document.getElementById('securityHistoryTableBody'),
        refreshButton: document.getElementById('refreshSecurityActivityButton'),
        filterButtons: Array.from(document.querySelectorAll('[data-security-filter]')),
        feedback: document.getElementById('securityActivityFeedback')
    };
}

function getLogoutAllDevicesElements() {
    return {
        modal: document.getElementById('logoutAllDevicesModal'),
        confirmButton: document.getElementById('confirmLogoutAllDevicesButton'),
        message: document.getElementById('logoutAllDevicesMessage')
    };
}

function setSecurityActivityFeedback(text, variant = 'info') {
    const { feedback } = getSecurityActivityElements();
    if (feedback) {
        feedback.classList.remove('d-none', 'is-success', 'is-error', 'is-info');
        if (text) {
            feedback.textContent = text;
            feedback.classList.add(`is-${variant}`);
        } else {
            feedback.textContent = '';
            feedback.classList.add('d-none');
        }
    }
}

function formatSecurityEventDate(value) {
    const date = new Date(value);
    let formatted = { relative: '-', absolute: '' };
    if (!Number.isNaN(date.getTime())) {
        const diffMs = Date.now() - date.getTime();
        const diffMinutes = Math.round(diffMs / 60000);
        const diffHours = Math.round(diffMs / 3600000);
        const diffDays = Math.round(diffMs / 86400000);

        let relative;
        if (diffMs < 45 * 1000) {
            relative = 'Épp most';
        } else if (diffMinutes < 60) {
            relative = `${diffMinutes} perce`;
        } else if (diffHours < 24) {
            relative = `${diffHours} órája`;
        } else if (diffDays < 7) {
            relative = `${diffDays} napja`;
        } else {
            relative = date.toLocaleDateString('hu-HU', { year: 'numeric', month: 'short', day: 'numeric' });
        }

        const absolute = date.toLocaleString('hu-HU', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });

        formatted = { relative, absolute };
    }
    return formatted;
}

const SECURITY_EVENT_LABELS = {
    login: { label: 'Bejelentkezés', icon: 'log-in', category: 'auth' },
    logout: { label: 'Kijelentkezés', icon: 'log-out', category: 'auth' },
    register: { label: 'Regisztráció', icon: 'user-plus', category: 'auth' },
    logout_all_devices: { label: 'Kijelentkezés minden eszközről', icon: 'shield-off', category: 'security' },
    profile_settings_update: { label: 'Profil beállítások módosítva', icon: 'user-cog', category: 'profile' },
    password_change: { label: 'Jelszó módosítva', icon: 'key-round', category: 'security' },
    profile_image_upload: { label: 'Profilkép feltöltve', icon: 'image-up', category: 'profile' },
    profile_image_remove: { label: 'Profilkép eltávolítva', icon: 'image-minus', category: 'profile' },
    profile_delete: { label: 'Profil törölve', icon: 'user-x', category: 'security' },
    login_failed: { label: 'Sikertelen bejelentkezés', icon: 'shield-alert', category: 'security' },
    current_password_verify_failed: { label: 'Hibás jelszó ellenőrzés', icon: 'shield-alert', category: 'security' },
    banned: { label: 'Admin tiltás alkalmazva', icon: 'shield-x', category: 'security' },
    unbanned: { label: 'Admin tiltás feloldva', icon: 'shield-check', category: 'security' },
    friend_request_sent: { label: 'Barát kérelem küldve', icon: 'user-plus', category: 'social' },
    friend_request_accepted: { label: 'Barát kérelem elfogadva', icon: 'user-check', category: 'social' },
    friend_request_rejected: { label: 'Barát kérelem elutasítva', icon: 'user-minus', category: 'social' },
    friend_blocked: { label: 'Felhasználó letiltva', icon: 'user-x', category: 'social' },
    friend_unblocked: { label: 'Letiltás feloldva', icon: 'user-check', category: 'social' },
    friend_removed: { label: 'Barát eltávolítva', icon: 'user-minus', category: 'social' }
};

function getSecurityEventDescriptor(item) {
    const descriptor = SECURITY_EVENT_LABELS[item.eventType] || {
        label: (item.message || item.eventType || 'Ismeretlen esemény'),
        icon: 'activity',
        category: item.eventCategory || 'security'
    };
    return descriptor;
}

function getSecurityStatusBadge(item) {
    const severity = String(item.severity || 'info').toLowerCase();
    let badge = { text: 'Info', className: 'security-badge security-badge-info' };

    if (item.success === false || severity === 'error' || severity === 'critical') {
        badge = { text: 'Sikertelen', className: 'security-badge security-badge-error' };
    } else if (severity === 'warning') {
        badge = { text: 'Figyelmeztetés', className: 'security-badge security-badge-warning' };
    } else if (item.eventType === 'login') {
        badge = { text: 'Sikeres', className: 'security-badge security-badge-success' };
    }
    return badge;
}

function shortenUserAgent(userAgent) {
    let result = 'Ismeretlen';
    if (userAgent) {
        const ua = String(userAgent);
        const browserMatches = [
            { regex: /Edg\//i, name: 'Edge' },
            { regex: /OPR\//i, name: 'Opera' },
            { regex: /Chrome\//i, name: 'Chrome' },
            { regex: /Firefox\//i, name: 'Firefox' },
            { regex: /Safari\//i, name: 'Safari' }
        ];
        let browser = 'Böngésző';
        for (const entry of browserMatches) {
            if (entry.regex.test(ua)) { browser = entry.name; break; }
        }
        let os = 'Ismeretlen OS';
        if (/Windows/i.test(ua)) os = 'Windows';
        else if (/Android/i.test(ua)) os = 'Android';
        else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS';
        else if (/Mac OS X/i.test(ua)) os = 'macOS';
        else if (/Linux/i.test(ua)) os = 'Linux';
        result = `${browser} · ${os}`;
    }
    return result;
}

function escapeSecurityHtml(value) {
    const safe = String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
    return safe;
}

function renderSecurityActivityTable() {
    const { tbody } = getSecurityActivityElements();
    if (tbody) {
        const filter = securityActivityState.activeFilter;
        const items = securityActivityState.items.filter((item) => {
            const descriptor = getSecurityEventDescriptor(item);
            return filter === 'all' || (item.eventCategory || descriptor.category) === filter;
        });

        if (!items.length) {
            tbody.innerHTML = `
                <tr class="security-empty-row">
                    <td colspan="5" class="text-center text-secondary py-4">Nincs megjeleníthető esemény a kiválasztott szűrőre.</td>
                </tr>
            `;
        } else {
            const rows = items.map((item) => {
                const descriptor = getSecurityEventDescriptor(item);
                const badge = getSecurityStatusBadge(item);
                const { relative, absolute } = formatSecurityEventDate(item.occurredAt);
                const ip = item.ipAddress || '—';
                const uaShort = shortenUserAgent(item.userAgent);
                const description = item.message ? escapeSecurityHtml(item.message) : '';

                return `
                    <tr class="security-row" data-event-type="${escapeSecurityHtml(item.eventType)}" data-category="${escapeSecurityHtml(item.eventCategory || descriptor.category)}">
                        <td>
                            <div class="security-date-cell">
                                <strong class="security-date-relative">${escapeSecurityHtml(relative)}</strong>
                                <small class="security-date-absolute">${escapeSecurityHtml(absolute)}</small>
                            </div>
                        </td>
                        <td>
                            <div class="security-event-cell">
                                <span class="security-event-icon"><i data-lucide="${escapeSecurityHtml(descriptor.icon)}"></i></span>
                                <div class="security-event-text">
                                    <strong>${escapeSecurityHtml(descriptor.label)}</strong>
                                    ${description ? `<small class="text-secondary d-block">${description}</small>` : ''}
                                </div>
                            </div>
                        </td>
                        <td class="security-ip-cell">${escapeSecurityHtml(ip)}</td>
                        <td class="security-ua-cell" title="${escapeSecurityHtml(item.userAgent || '')}">${escapeSecurityHtml(uaShort)}</td>
                        <td><span class="${badge.className}">${escapeSecurityHtml(badge.text)}</span></td>
                    </tr>
                `;
            }).join('');

            tbody.innerHTML = rows;
            if (window.lucide?.createIcons) {
                runSafely('securityLucideIcons', () => window.lucide.createIcons());
            }
        }
    }
}

function setSecurityFilterButtonsState(activeFilter) {
    const { filterButtons } = getSecurityActivityElements();
    filterButtons.forEach((btn) => {
        const filter = btn.dataset.securityFilter;
        btn.classList.toggle('is-active', filter === activeFilter);
    });
}

async function refreshSecurityActivity() {
    if (!securityActivityState.loading) {
        securityActivityState.loading = true;
        const { tbody, refreshButton } = getSecurityActivityElements();
        if (refreshButton) refreshButton.disabled = true;
        if (tbody && !securityActivityState.items.length) {
            tbody.innerHTML = `
                <tr class="security-empty-row">
                    <td colspan="5" class="text-center text-secondary py-4">Biztonsági napló betöltése...</td>
                </tr>
            `;
        }

        try {
            const response = await fetch('/api/security/activity?limit=150', {
                headers: { 'Accept': 'application/json' }
            });
            const result = await parseJson(response);
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Sikertelen biztonsági napló lekérés.');
            }
            securityActivityState.items = Array.isArray(result.data) ? result.data : [];
            renderSecurityActivityTable();
            setSecurityActivityFeedback('', 'info');
        } catch (error) {
            console.error('Security activity betöltési hiba:', error);
            if (tbody) {
                tbody.innerHTML = `
                    <tr class="security-empty-row">
                        <td colspan="5" class="text-center text-danger py-4">${escapeSecurityHtml(error.message || 'Hiba a biztonsági napló betöltésekor.')}</td>
                    </tr>
                `;
            }
            setSecurityActivityFeedback(error.message || 'Hiba a biztonsági napló betöltésekor.', 'error');
        } finally {
            securityActivityState.loading = false;
            if (refreshButton) refreshButton.disabled = false;
        }
    }
}

function bindSecurityActivityEvents() {
    if (!securityActivityState.bound) {
        const { refreshButton, filterButtons } = getSecurityActivityElements();

        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                runSafelyAsync('refreshSecurityActivityClick', async () => {
                    await refreshSecurityActivity();
                });
            });
        }

        filterButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                runSafely('securityFilterClick', () => {
                    const filter = btn.dataset.securityFilter;
                    if (SECURITY_FILTER_VALUES.has(filter) && filter !== securityActivityState.activeFilter) {
                        securityActivityState.activeFilter = filter;
                        setSecurityFilterButtonsState(filter);
                        renderSecurityActivityTable();
                    }
                });
            });
        });

        setSecurityFilterButtonsState(securityActivityState.activeFilter);
        securityActivityState.bound = true;
    }
}

function setLogoutAllDevicesMessage(text, variant = 'danger') {
    const { message } = getLogoutAllDevicesElements();
    if (message) {
        message.classList.remove('d-none', 'alert-danger', 'alert-success', 'alert-warning', 'alert-info');
        if (text) {
            message.textContent = text;
            message.classList.add(`alert-${variant}`);
        } else {
            message.textContent = '';
            message.classList.add('d-none');
        }
    }
}

async function handleLogoutAllDevices() {
    if (!logoutAllDevicesState.submitting) {
        const { confirmButton } = getLogoutAllDevicesElements();
        logoutAllDevicesState.submitting = true;
        if (confirmButton) {
            confirmButton.disabled = true;
            confirmButton.textContent = 'Kijelentkezés...';
        }
        setLogoutAllDevicesMessage('', 'info');

        try {
            const response = await fetch('/api/security/logout-all-devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await parseJson(response);
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Nem sikerült kijelentkeztetni minden eszközről.');
            }

            if (socket) {
                socket.disconnect();
            }

            setLogoutAllDevicesMessage(result.message || 'Sikeres kijelentkezés minden eszközről.', 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 800);
        } catch (error) {
            console.error('Logout all devices hiba:', error);
            setLogoutAllDevicesMessage(error.message || 'Hiba a kijelentkezés során.', 'danger');
            logoutAllDevicesState.submitting = false;
            if (confirmButton) {
                confirmButton.disabled = false;
                confirmButton.textContent = 'Kijelentkezés minden eszközről';
            }
        }
    }
}

function bindLogoutAllDevicesButton() {
    const { modal, confirmButton } = getLogoutAllDevicesElements();
    if (!logoutAllDevicesState.bound && modal && confirmButton) {
        confirmButton.addEventListener('click', () => {
            runSafelyAsync('logoutAllDevicesConfirmClick', async () => {
                await handleLogoutAllDevices();
            });
        });

        modal.addEventListener('show.bs.modal', () => {
            runSafely('logoutAllDevicesModalShow', () => {
                logoutAllDevicesState.submitting = false;
                confirmButton.disabled = false;
                confirmButton.textContent = 'Kijelentkezés minden eszközről';
                setLogoutAllDevicesMessage('', 'info');
            });
        });

        logoutAllDevicesState.bound = true;
    }
}

