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
            relative = tx('Épp most', 'Just now');
        } else if (diffMinutes < 60) {
            relative = `${diffMinutes} ${tx('perce', 'min ago')}`;
        } else if (diffHours < 24) {
            relative = `${diffHours} ${tx('órája', 'h ago')}`;
        } else if (diffDays < 7) {
            relative = `${diffDays} ${tx('napja', 'd ago')}`;
        } else {
            const dOpts = { year: 'numeric', month: 'short', day: 'numeric' };
            relative = window.MattMesterI18n?.formatDate ? window.MattMesterI18n.formatDate(date, dOpts) : date.toLocaleDateString('hu-HU', dOpts);
        }

        const absOpts = {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        };
        const absolute = window.MattMesterI18n?.formatDateTime ? window.MattMesterI18n.formatDateTime(date, absOpts) : date.toLocaleString('hu-HU', absOpts);

        formatted = { relative, absolute };
    }
    return formatted;
}

function getSecurityEventLabels() {
    return {
        login: { label: tx('Bejelentkezés', 'Login'), icon: 'log-in', category: 'auth' },
        logout: { label: tx('Kijelentkezés', 'Logout'), icon: 'log-out', category: 'auth' },
        register: { label: tx('Regisztráció', 'Registration'), icon: 'user-plus', category: 'auth' },
        logout_all_devices: { label: tx('Kijelentkezés minden eszközről', 'Logout from all devices'), icon: 'shield-off', category: 'security' },
        profile_settings_update: { label: tx('Profil beállítások módosítva', 'Profile settings updated'), icon: 'user-cog', category: 'profile' },
        password_change: { label: tx('Jelszó módosítva', 'Password changed'), icon: 'key-round', category: 'security' },
        profile_image_upload: { label: tx('Profilkép feltöltve', 'Profile picture uploaded'), icon: 'image-up', category: 'profile' },
        profile_image_remove: { label: tx('Profilkép eltávolítva', 'Profile picture removed'), icon: 'image-minus', category: 'profile' },
        profile_delete: { label: tx('Profil törölve', 'Profile deleted'), icon: 'user-x', category: 'security' },
        login_failed: { label: tx('Sikertelen bejelentkezés', 'Failed login'), icon: 'shield-alert', category: 'security' },
        current_password_verify_failed: { label: tx('Hibás jelszó ellenőrzés', 'Invalid password verification'), icon: 'shield-alert', category: 'security' },
        banned: { label: tx('Admin tiltás alkalmazva', 'Admin ban applied'), icon: 'shield-x', category: 'security' },
        unbanned: { label: tx('Admin tiltás feloldva', 'Admin ban lifted'), icon: 'shield-check', category: 'security' },
        friend_request_sent: { label: tx('Barát kérelem küldve', 'Friend request sent'), icon: 'user-plus', category: 'social' },
        friend_request_accepted: { label: tx('Barát kérelem elfogadva', 'Friend request accepted'), icon: 'user-check', category: 'social' },
        friend_request_rejected: { label: tx('Barát kérelem elutasítva', 'Friend request rejected'), icon: 'user-minus', category: 'social' },
        friend_blocked: { label: tx('Felhasználó letiltva', 'User blocked'), icon: 'user-x', category: 'social' },
        friend_unblocked: { label: tx('Letiltás feloldva', 'User unblocked'), icon: 'user-check', category: 'social' },
        friend_removed: { label: tx('Barát eltávolítva', 'Friend removed'), icon: 'user-minus', category: 'social' }
    };
}

function getSecurityEventDescriptor(item) {
    const labels = getSecurityEventLabels();
    const descriptor = labels[item.eventType] || {
        label: (item.message || item.eventType || tx('Ismeretlen esemény', 'Unknown event')),
        icon: 'activity',
        category: item.eventCategory || 'security'
    };
    return descriptor;
}

// HU server-side `message` szovegek client-oldali EN forditasa. A backend a
// `security_activity_log.message` oszlopot magyarul tarolja (pl. "Sikeres
// bejelentkezes."), igy EN mode-ban ezt itt kell mappingelni. Ha a szoveg
// nem szerepel a mapping-ben, az eredeti uzenetet hagyjuk meg.
function translateSecurityEventMessage(message) {
    if (!message) return '';
    const map = {
        'Sikeres bejelentkezés.': tx('Sikeres bejelentkezés.', 'Successful login.'),
        'Sikeres kijelentkezés.': tx('Sikeres kijelentkezés.', 'Successful logout.'),
        'Sikertelen bejelentkezési kísérlet (hibás jelszó).': tx('Sikertelen bejelentkezési kísérlet (hibás jelszó).', 'Failed login attempt (wrong password).'),
        'Sikertelen bejelentkezés.': tx('Sikertelen bejelentkezés.', 'Failed login.'),
        'Sikeres regisztráció.': tx('Sikeres regisztráció.', 'Successful registration.'),
        'Automatikus bejelentkezés regisztráció után.': tx('Automatikus bejelentkezés regisztráció után.', 'Automatic login after registration.'),
        'Profilkép feltöltve.': tx('Profilkép feltöltve.', 'Profile picture uploaded.'),
        'Profilkép feltöltve': tx('Profilkép feltöltve', 'Profile picture uploaded'),
        'Profilkép eltávolítva.': tx('Profilkép eltávolítva.', 'Profile picture removed.'),
        'Profilkép jóváhagyva.': tx('Profilkép jóváhagyva.', 'Profile picture approved.'),
        'Profilkép elutasítva.': tx('Profilkép elutasítva.', 'Profile picture rejected.'),
        'Email cím sikeresen megerősítve.': tx('Email cím sikeresen megerősítve.', 'Email address successfully verified.'),
        'Jelszó sikeresen visszaállítva.': tx('Jelszó sikeresen visszaállítva.', 'Password successfully reset.'),
        'Jelszó megváltozva.': tx('Jelszó megváltozva.', 'Password changed.'),
        'Profil beállítások módosítva.': tx('Profil beállítások módosítva.', 'Profile settings updated.'),
        'Sikeres kijelentkezés minden eszközről.': tx('Sikeres kijelentkezés minden eszközről.', 'Successfully logged out from all devices.'),
        'Barát hozzáadva.': tx('Barát hozzáadva.', 'Friend added.'),
        'Barát törölve.': tx('Barát törölve.', 'Friend removed.'),
        'Barát kérelem küldve.': tx('Barát kérelem küldve.', 'Friend request sent.'),
        'Barát kérelem elfogadva.': tx('Barát kérelem elfogadva.', 'Friend request accepted.'),
        'Barát kérelem elutasítva.': tx('Barát kérelem elutasítva.', 'Friend request rejected.'),
        'Felhasználó letiltva.': tx('Felhasználó letiltva.', 'User blocked.'),
        'Letiltás feloldva.': tx('Letiltás feloldva.', 'Block lifted.'),
        'Üzenet elküldve.': tx('Üzenet elküldve.', 'Message sent.'),
        'Felhasználói tiltás.': tx('Felhasználói tiltás.', 'User banned.'),
        'Tiltás feloldva.': tx('Tiltás feloldva.', 'Ban lifted.'),
        'Hibás jelszó ellenőrzés.': tx('Hibás jelszó ellenőrzés.', 'Invalid password verification.')
    };
    return map[message] || message;
}

function getSecurityStatusBadge(item) {
    const severity = String(item.severity || 'info').toLowerCase();
    let badge = { text: tx('Info', 'Info'), className: 'security-badge security-badge-info' };

    if (item.success === false || severity === 'error' || severity === 'critical') {
        badge = { text: tx('Sikertelen', 'Failed'), className: 'security-badge security-badge-error' };
    } else if (severity === 'warning') {
        badge = { text: tx('Figyelmeztetés', 'Warning'), className: 'security-badge security-badge-warning' };
    } else if (item.eventType === 'login') {
        badge = { text: tx('Sikeres', 'Successful'), className: 'security-badge security-badge-success' };
    }
    return badge;
}

function shortenUserAgent(userAgent) {
    let result = tx('Ismeretlen', 'Unknown');
    if (userAgent) {
        const ua = String(userAgent);
        const browserMatches = [
            { regex: /Edg\//i, name: 'Edge' },
            { regex: /OPR\//i, name: 'Opera' },
            { regex: /Chrome\//i, name: 'Chrome' },
            { regex: /Firefox\//i, name: 'Firefox' },
            { regex: /Safari\//i, name: 'Safari' }
        ];
        let browser = tx('Böngésző', 'Browser');
        for (const entry of browserMatches) {
            if (entry.regex.test(ua)) { browser = entry.name; break; }
        }
        let os = tx('Ismeretlen OS', 'Unknown OS');
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
                    <td colspan="5" class="text-center text-secondary py-4">${tx('Nincs megjeleníthető esemény a kiválasztott szűrőre.', 'No events to display for the selected filter.')}</td>
                </tr>
            `;
        } else {
            const rows = items.map((item) => {
                const descriptor = getSecurityEventDescriptor(item);
                const badge = getSecurityStatusBadge(item);
                const { relative, absolute } = formatSecurityEventDate(item.occurredAt);
                const ip = item.ipAddress || '—';
                const uaShort = shortenUserAgent(item.userAgent);
                const translatedMessage = translateSecurityEventMessage(item.message);
                const description = translatedMessage ? escapeSecurityHtml(translatedMessage) : '';

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
                    <td colspan="5" class="text-center text-secondary py-4">${tx('Biztonsági napló betöltése...', 'Loading security log...')}</td>
                </tr>
            `;
        }

        try {
            const response = await fetch('/api/security/activity?limit=150', {
                headers: { 'Accept': 'application/json' }
            });
            const result = await parseJson(response);
            if (!response.ok || !result.success) {
                throw new Error(result.message || tx('Sikertelen biztonsági napló lekérés.', 'Failed to fetch security log.'));
            }
            securityActivityState.items = Array.isArray(result.data) ? result.data : [];
            renderSecurityActivityTable();
            setSecurityActivityFeedback('', 'info');
        } catch (error) {
            console.error('Security activity betöltési hiba:', error);
            if (tbody) {
                tbody.innerHTML = `
                    <tr class="security-empty-row">
                        <td colspan="5" class="text-center text-danger py-4">${escapeSecurityHtml(error.message || tx('Hiba a biztonsági napló betöltésekor.', 'Error loading the security log.'))}</td>
                    </tr>
                `;
            }
            setSecurityActivityFeedback(error.message || tx('Hiba a biztonsági napló betöltésekor.', 'Error loading the security log.'), 'error');
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
            confirmButton.textContent = tx('Kijelentkezés...', 'Logging out...');
        }
        setLogoutAllDevicesMessage('', 'info');

        try {
            const response = await fetch('/api/security/logout-all-devices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await parseJson(response);
            if (!response.ok || !result.success) {
                throw new Error(result.message || tx('Nem sikerült kijelentkeztetni minden eszközről.', 'Failed to log out from all devices.'));
            }

            if (socket) {
                socket.disconnect();
            }

            setLogoutAllDevicesMessage(result.message || tx('Sikeres kijelentkezés minden eszközről.', 'Successfully logged out from all devices.'), 'success');
            setTimeout(() => {
                window.location.href = '/';
            }, 800);
        } catch (error) {
            console.error('Logout all devices hiba:', error);
            setLogoutAllDevicesMessage(error.message || tx('Hiba a kijelentkezés során.', 'Error during logout.'), 'danger');
            logoutAllDevicesState.submitting = false;
            if (confirmButton) {
                confirmButton.disabled = false;
                confirmButton.textContent = tx('Kijelentkezés minden eszközről', 'Logout from all devices');
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
                confirmButton.textContent = tx('Kijelentkezés minden eszközről', 'Logout from all devices');
                setLogoutAllDevicesMessage('', 'info');
            });
        });

        logoutAllDevicesState.bound = true;
    }
}

