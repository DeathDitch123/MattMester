const USERNAME_REGEX = /^[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ0-9._-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const socket = io();
lucide.createIcons();

const PROFILE_SETTINGS_CONFIRM_SECONDS = 10;
const profileSettingsState = {
    bound: false,
    initial: null,
    pendingPayload: null,
    countdownTimer: null,
    countdownLeft: PROFILE_SETTINGS_CONFIRM_SECONDS
};

document.addEventListener('DOMContentLoaded', () => {
    bindLogoutButton();
    refreshAuthUi().catch((error) => {
        console.error('Hiba az auth UI frissitesekor:', error);
    });
});
// Ez parsol
async function parseJson(response) {
    try {
        return await response.json();
    } catch (error) {
        return {};
    }
}
//sessionInfo
async function fetchSessionInfo() {
    let result = { success: false, loggedIn: false };
    try {
        const response = await fetch('/api/sessionInfo');
        const data = await parseJson(response);
        if (response.ok) {
            result = data;
        }
    } catch (error) {
        console.error('Hiba a session informacio lekerdezese soran:', error);
    }
    return result;
}

async function logSessionAndSocketInfo() {
    try {
        const sessionInfo = await fetchSessionInfo();

        console.clear();
        console.log('--- Auth Status Report ---');
        console.log('Session info:', sessionInfo);

        if (typeof socket !== 'undefined') {
            console.log('SocketInfo:', {
                socketId: socket.id,
                connected: socket.connected,
                sessionBound: socket.connected ? 'Active' : 'Disconnected/Pending'
            });
        } else {
            console.warn('SocketInfo: A socket objektum nem található vagy még nem lett inicializálva.');
        }

        console.log('--------------------------');
    } catch (error) {
        console.error('Hiba a session/socket informacio naplozasakor:', error);
    }
}

async function refreshAuthUi() {
    try {
        const sessionInfo = await fetchSessionInfo();
        showStats(sessionInfo);
        handleProfileSettings(sessionInfo);
        logSessionAndSocketInfo();
    } catch (error) {
        console.error('refreshAuthUi hiba:', error);
    }
}

async function handleLogout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await parseJson(response);

        if (!response.ok) {
            throw new Error(result.message || 'Sikertelen kijelentkezes.');
        }

        if (typeof socket !== 'undefined') {
            socket.disconnect();
            socket.connect();
        }

        window.location.reload();
    } catch (error) {
        console.error('Hiba a kijelentkezes soran:', error);
    }
}

function bindLogoutButton() {
    const logoutButtons = document.querySelectorAll('[data-bs-target="#logoutModal"]');
    logoutButtons.forEach((button) => {
        button.addEventListener('click', (event) => {
            event.preventDefault();
            handleLogout();
        });
    });
}

function showStats(sessionInfo) {
    try {
        const user = sessionInfo?.user || sessionInfo?.data?.user || null;
        if (!user) {
            throw new Error('Nincs bejelentkezett felhasznalo a statok megjelenitesehez.');
        }

        const stats = user.stats || sessionInfo?.stats || {
            wins: user.wins,
            losses: user.losses,
            draws: user.draws
        };
        const username = user.username || 'Ismeretlen jatekos';
        const email = user.email || '';
        const role = user.role || 'player';
        const roleText = role.charAt(0).toUpperCase() + role.slice(1);

        const toNumber = (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };

        const wins = toNumber(stats.wins);
        const losses = toNumber(stats.losses);
        const draws = toNumber(stats.draws);
        const gamesPlayed = wins + losses + draws;
        const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

        const formatNumber = (value) => toNumber(value).toLocaleString('hu-HU');
        const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=d4af37&color=000&size=128`;
        const rankClasses = ['rank-beginner', 'rank-intermediate', 'rank-advanced', 'rank-expert', 'rank-master', 'rank-grandmaster'];
        const roleBadgeClasses = ['admin', 'badge-custom', 'badge-admin', 'badge-player'];
        const statBadgeClasses = ['badge-custom', 'badge-win', 'badge-loss', 'badge-draw', 'badge-ongoing'];
        const getRankForElo = (eloValue) => {
            const elo = toNumber(eloValue);
            let rank = { label: 'Grandmaster', className: 'rank-grandmaster' };

            if (elo < 1100) {
                rank = { label: 'Beginner', className: 'rank-beginner' };
            } else if (elo < 1400) {
                rank = { label: 'Intermediate', className: 'rank-intermediate' };
            } else if (elo < 1700) {
                rank = { label: 'Advanced', className: 'rank-advanced' };
            } else if (elo < 2000) {
                rank = { label: 'Expert', className: 'rank-expert' };
            } else if (elo < 2300) {
                rank = { label: 'Master', className: 'rank-master' };
            }

            return rank;
        };

        document.querySelectorAll('.top-bar-user-name').forEach((element) => {
            element.textContent = username;
        });

        document.querySelectorAll('.top-bar-user-role').forEach((element) => {
            element.textContent = roleText;
            element.classList.remove(...roleBadgeClasses);
            element.classList.add('badge-custom', role === 'admin' ? 'badge-admin' : 'badge-player');
        });

        const profileName = document.querySelector('.profile-header h1.h3');
        if (profileName) {
            profileName.textContent = username;
        }

        const profileEmail = document.querySelector('.profile-header p.text-secondary');
        if (profileEmail) {
            profileEmail.textContent = email;
        }

        const roleBadge = document.querySelector('.profile-header .role-badge');
        if (roleBadge) {
            roleBadge.textContent = roleText;
            roleBadge.classList.remove(...roleBadgeClasses);
            if (role === 'admin') {
                roleBadge.classList.add('admin', 'badge-custom', 'badge-admin');
            } else {
                roleBadge.classList.add('badge-custom', 'badge-player');
            }
        }

        const profileAvatar = document.querySelector('.profile-avatar');
        if (profileAvatar) {
            const avatarSrc = user.profile_image || fallbackAvatar;
            profileAvatar.src = avatarSrc;
            profileAvatar.alt = username;
        }

        const eloNumbers = document.querySelectorAll('.elo-display .elo-number');
        const eloRanks = document.querySelectorAll('.elo-display .elo-rank');
        const eloValues = [user.elo, user.elo_MM, user.elo_bullet];

        if (eloNumbers[0]) {
            eloNumbers[0].textContent = formatNumber(user.elo);
        }
        if (eloNumbers[1]) {
            eloNumbers[1].textContent = formatNumber(user.elo_MM);
        }
        if (eloNumbers[2]) {
            eloNumbers[2].textContent = formatNumber(user.elo_bullet);
        }

        eloValues.forEach((eloValue, index) => {
            const rankElement = eloRanks[index];
            if (rankElement) {
                const rank = getRankForElo(eloValue);
                rankElement.classList.remove(...rankClasses);
                rankElement.classList.add(rank.className);
                rankElement.textContent = rank.label;
            }
        });

        const statValues = document.querySelectorAll('.stat-card .stat-value');
        const statLabels = document.querySelectorAll('.stat-card .stat-label');
        if (statValues[0]) {
            statValues[0].textContent = formatNumber(wins);
        }
        if (statValues[1]) {
            statValues[1].textContent = formatNumber(losses);
        }
        if (statValues[2]) {
            statValues[2].textContent = formatNumber(draws);
        }
        if (statValues[3]) {
            statValues[3].textContent = `${winRate}%`;
        }

        if (statLabels[0]) {
            statLabels[0].classList.remove(...statBadgeClasses);
            statLabels[0].classList.add('badge-custom', 'badge-win');
        }
        if (statLabels[1]) {
            statLabels[1].classList.remove(...statBadgeClasses);
            statLabels[1].classList.add('badge-custom', 'badge-loss');
        }
        if (statLabels[2]) {
            statLabels[2].classList.remove(...statBadgeClasses);
            statLabels[2].classList.add('badge-custom', 'badge-draw');
        }
        if (statLabels[3]) {
            statLabels[3].classList.remove(...statBadgeClasses);
            statLabels[3].classList.add('badge-custom', 'badge-ongoing');
        }
    } catch (error) {
        throw new Error(`showStats hiba: ${error.message}`);
    }
}

function handleProfileSettings(sessionInfo) {
    try {
        const user = sessionInfo?.user || sessionInfo?.data?.user || null;
        if (!user) {
            throw new Error('Nincs bejelentkezett felhasznalo a statok megjelenitesehez.');
        }
        const settingsUsername = document.getElementById('settingsUsername');
        const settingsEmail = document.getElementById('settingsEmail');
        const settingsNewPassword = document.getElementById('settingsNewPassword');
        const settingsConfirmPassword = document.getElementById('settingsConfirmPassword');
        if (settingsUsername) {
            settingsUsername.value = user.username;
        }
        if (settingsEmail) {
            settingsEmail.value = user.email;
        }
        if (settingsNewPassword) {
            settingsNewPassword.value = '';
        }
        if (settingsConfirmPassword) {
            settingsConfirmPassword.value = '';
        }

        profileSettingsState.initial = {
            username: (user.username || '').trim(),
            email: (user.email || '').trim()
        };

        if (!profileSettingsState.bound) {
            bindProfileSettingsEvents();
            profileSettingsState.bound = true;
        }

        validateProfileSettingsForm();
    } catch (error) {
        console.error('Hiba a profil beállítások kezelésekor:', error);
    }
}

function bindProfileSettingsEvents() {
    const elements = getProfileSettingsElements();
    if (!elements.form) {
        return;
    }

    const onInputChange = () => {
        validateProfileSettingsForm();
    };

    [elements.usernameInput, elements.emailInput, elements.newPasswordInput, elements.confirmPasswordInput]
        .filter(Boolean)
        .forEach((element) => {
            element.addEventListener('input', onInputChange);
            element.addEventListener('blur', onInputChange);
        });

    elements.form.addEventListener('submit', (event) => {
        event.preventDefault();

        const validation = validateProfileSettingsForm();
        if (!validation.isValid) {
            return;
        }

        profileSettingsState.pendingPayload = validation.payload;
        openProfileSettingsConfirmModal(validation.changedFieldLabels);
    });

    if (elements.confirmSaveButton) {
        elements.confirmSaveButton.addEventListener('click', async () => {
            await submitProfileSettingsChanges();
        });
    }

    if (elements.confirmModal) {
        elements.confirmModal.addEventListener('hidden.bs.modal', () => {
            resetProfileSettingsConfirmState();
        });
    }
}

function getProfileSettingsElements() {
    return {
        form: document.getElementById('profileSettingsForm'),
        usernameInput: document.getElementById('settingsUsername'),
        emailInput: document.getElementById('settingsEmail'),
        newPasswordInput: document.getElementById('settingsNewPassword'),
        confirmPasswordInput: document.getElementById('settingsConfirmPassword'),
        usernameFeedback: document.getElementById('settingsUsernameFeedback'),
        emailFeedback: document.getElementById('settingsEmailFeedback'),
        newPasswordFeedback: document.getElementById('settingsNewPasswordFeedback'),
        confirmPasswordFeedback: document.getElementById('settingsConfirmPasswordFeedback'),
        formMessage: document.getElementById('profileSettingsMessage'),
        saveButton: document.getElementById('profileSettingsSaveButton'),
        confirmModal: document.getElementById('confirmProfileSettingsModal'),
        confirmSaveButton: document.getElementById('profileSettingsConfirmSaveButton'),
        confirmHint: document.getElementById('profileSettingsConfirmHint'),
        changesList: document.getElementById('profileSettingsChangesList')
    };
}

function applyInputFeedback(inputElement, feedbackElement, state, message) {
    if (!inputElement || !feedbackElement) {
        return;
    }

    inputElement.classList.remove('is-valid', 'is-invalid');
    feedbackElement.classList.remove('text-secondary', 'text-success', 'text-danger');
    feedbackElement.textContent = message;

    if (state === 'error') {
        inputElement.classList.add('is-invalid');
        feedbackElement.classList.add('text-danger');
    } else if (state === 'success') {
        inputElement.classList.add('is-valid');
        feedbackElement.classList.add('text-success');
    } else {
        feedbackElement.classList.add('text-secondary');
    }
}

function setProfileSettingsMessage(type, message) {
    const { formMessage } = getProfileSettingsElements();
    if (!formMessage) {
        return;
    }

    if (!message) {
        formMessage.className = 'alert d-none mb-0';
        formMessage.textContent = '';
        return;
    }

    formMessage.className = `alert alert-${type} mb-0`;
    formMessage.textContent = message;
}

function validateProfileSettingsForm() {
    const elements = getProfileSettingsElements();
    if (!elements.form || !profileSettingsState.initial) {
        return { isValid: false, payload: null, changedFieldLabels: [] };
    }

    const values = {
        username: (elements.usernameInput?.value || '').trim(),
        email: (elements.emailInput?.value || '').trim(),
        newPassword: elements.newPasswordInput?.value || '',
        confirmPassword: elements.confirmPasswordInput?.value || ''
    };

    const fieldErrors = {
        username: '',
        email: '',
        newPassword: '',
        confirmPassword: ''
    };

    const hasUsernameChanged = values.username !== profileSettingsState.initial.username;
    const hasEmailChanged = values.email !== profileSettingsState.initial.email;
    const hasPasswordChangeIntent = values.newPassword.length > 0 || values.confirmPassword.length > 0;

    if (!values.username) {
        fieldErrors.username = 'A felhasznalonev kotelezo.';
    } else if (values.username.length < 3 || values.username.length > 50) {
        fieldErrors.username = 'A felhasznalonevnek 3 es 50 karakter kozott kell lennie.';
    } else if (!USERNAME_REGEX.test(values.username)) {
        fieldErrors.username = 'A felhasznalonev formatuma ervenytelen.';
    }

    if (!values.email) {
        fieldErrors.email = 'Az email cim kotelezo.';
    } else if (!EMAIL_REGEX.test(values.email)) {
        fieldErrors.email = 'Ervenytelen email formatum.';
    }

    if (values.confirmPassword && !values.newPassword) {
        fieldErrors.newPassword = 'Adj meg uj jelszot is.';
    }

    if (values.newPassword) {
        if (values.newPassword.includes('\\')) {
            fieldErrors.newPassword = 'A jelszo nem megengedett karaktert tartalmaz.';
        } else if (values.newPassword.length < 8) {
            fieldErrors.newPassword = 'A jelszonak legalabb 8 karakter hosszu kell legyen.';
        } else if (!PASSWORD_REGEX.test(values.newPassword)) {
            fieldErrors.newPassword = 'A jelszonak tartalmaznia kell nagybetut, kisbetut es szamot.';
        }
    }

    if (values.newPassword || values.confirmPassword) {
        if (!values.confirmPassword) {
            fieldErrors.confirmPassword = 'Erositsd meg az uj jelszot.';
        } else if (values.newPassword !== values.confirmPassword) {
            fieldErrors.confirmPassword = 'A ket jelszo nem egyezik.';
        }
    }

    const hasFieldError = Object.values(fieldErrors).some(Boolean);
    const hasAnyChange = hasUsernameChanged || hasEmailChanged || values.newPassword.length > 0;
    const isValid = !hasFieldError && hasAnyChange;

    applyInputFeedback(
        elements.usernameInput,
        elements.usernameFeedback,
        fieldErrors.username ? 'error' : (hasUsernameChanged ? 'success' : 'neutral'),
        fieldErrors.username || (hasUsernameChanged ? 'Felhasznalonev modositasra kerul.' : 'Nincs valtozas.')
    );

    applyInputFeedback(
        elements.emailInput,
        elements.emailFeedback,
        fieldErrors.email ? 'error' : (hasEmailChanged ? 'success' : 'neutral'),
        fieldErrors.email || (hasEmailChanged ? 'Email modositasra kerul.' : 'Nincs valtozas.')
    );

    applyInputFeedback(
        elements.newPasswordInput,
        elements.newPasswordFeedback,
        fieldErrors.newPassword ? 'error' : (values.newPassword ? 'success' : 'neutral'),
        fieldErrors.newPassword || (values.newPassword ? 'Uj jelszo elfogadva.' : 'Jelszo nem valtozik.')
    );

    applyInputFeedback(
        elements.confirmPasswordInput,
        elements.confirmPasswordFeedback,
        fieldErrors.confirmPassword ? 'error' : (values.confirmPassword ? 'success' : 'neutral'),
        fieldErrors.confirmPassword || (values.confirmPassword ? 'Jelszo megerosites rendben.' : 'Megerosites nem szukseges.')
    );

    if (elements.saveButton) {
        elements.saveButton.disabled = !isValid;
    }

    if (hasFieldError) {
        const firstError = Object.values(fieldErrors).find(Boolean);
        setProfileSettingsMessage('danger', firstError || 'Ellenorizd a mezoket.');
    } else if (!hasAnyChange) {
        setProfileSettingsMessage('warning', 'Nincs valtozas. Modosits legalabb egy mezot a menteshez.');
    } else {
        setProfileSettingsMessage('success', 'Minden rendben, mentesre kesz.');
    }

    const changedFieldLabels = [];
    if (hasUsernameChanged) {
        changedFieldLabels.push(`Felhasznalonev: ${profileSettingsState.initial.username} -> ${values.username}`);
    }
    if (hasEmailChanged) {
        changedFieldLabels.push(`Email: ${profileSettingsState.initial.email} -> ${values.email}`);
    }
    if (values.newPassword) {
        changedFieldLabels.push('Jelszo frissitesre kerul.');
    }

    const payload = isValid ? {
        username: values.username,
        email: values.email,
        newPassword: values.newPassword
    } : null;

    return { isValid, payload, changedFieldLabels, hasPasswordChangeIntent };
}

function resetProfileSettingsConfirmState() {
    const elements = getProfileSettingsElements();
    if (profileSettingsState.countdownTimer) {
        clearInterval(profileSettingsState.countdownTimer);
        profileSettingsState.countdownTimer = null;
    }

    profileSettingsState.countdownLeft = PROFILE_SETTINGS_CONFIRM_SECONDS;

    if (elements.confirmSaveButton) {
        elements.confirmSaveButton.disabled = true;
        elements.confirmSaveButton.textContent = `Mentes (${PROFILE_SETTINGS_CONFIRM_SECONDS}s)`;
    }

    if (elements.confirmHint) {
        elements.confirmHint.textContent = `A mentes gomb ${PROFILE_SETTINGS_CONFIRM_SECONDS} masodperc mulva lesz aktiv.`;
    }
}

function openProfileSettingsConfirmModal(changedFieldLabels) {
    const elements = getProfileSettingsElements();
    if (!elements.confirmModal || !elements.changesList) {
        return;
    }

    elements.changesList.innerHTML = changedFieldLabels
        .map((label) => `<li class="text-light mb-1">${label}</li>`)
        .join('');

    resetProfileSettingsConfirmState();

    const modal = bootstrap.Modal.getOrCreateInstance(elements.confirmModal);
    modal.show();

    profileSettingsState.countdownTimer = setInterval(() => {
        profileSettingsState.countdownLeft -= 1;

        if (elements.confirmSaveButton) {
            if (profileSettingsState.countdownLeft > 0) {
                elements.confirmSaveButton.textContent = `Mentes (${profileSettingsState.countdownLeft}s)`;
            } else {
                elements.confirmSaveButton.disabled = false;
                elements.confirmSaveButton.textContent = 'Mentes';
            }
        }

        if (elements.confirmHint) {
            elements.confirmHint.textContent = profileSettingsState.countdownLeft > 0
                ? `A mentes gomb ${profileSettingsState.countdownLeft} masodperc mulva lesz aktiv.`
                : 'A mentes gomb most mar aktiv.';
        }

        if (profileSettingsState.countdownLeft <= 0) {
            clearInterval(profileSettingsState.countdownTimer);
            profileSettingsState.countdownTimer = null;
        }
    }, 1000);
}

async function submitProfileSettingsChanges() {
    const elements = getProfileSettingsElements();
    if (!profileSettingsState.pendingPayload || !elements.confirmSaveButton) {
        return;
    }

    elements.confirmSaveButton.disabled = true;
    elements.confirmSaveButton.textContent = 'Mentés folyamatban...';

    try {
        const response = await fetch('/api/profile/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(profileSettingsState.pendingPayload)
        });

        const result = await parseJson(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Nem sikerult menteni a profil beallitasokat.');
        }

        setProfileSettingsMessage('success', result.message || 'A profil beallitasok sikeresen frissultek.');
        profileSettingsState.pendingPayload = null;

        if (elements.newPasswordInput) {
            elements.newPasswordInput.value = '';
        }
        if (elements.confirmPasswordInput) {
            elements.confirmPasswordInput.value = '';
        }

        if (elements.confirmModal) {
            const modal = bootstrap.Modal.getOrCreateInstance(elements.confirmModal);
            modal.hide();
        }

        await refreshAuthUi();
    } catch (error) {
        setProfileSettingsMessage('danger', error.message || 'Hiba tortent a mentes soran.');
        elements.confirmSaveButton.disabled = false;
        elements.confirmSaveButton.textContent = 'Mentes';
    }
}
// Mobile Sidebar Toggle
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');

    sidebar.classList.toggle('show');
    overlay.classList.toggle('show');
}

// Active state handling for navigation
const navLinks = document.querySelectorAll('.nav-link');
navLinks.forEach(link => {
    link.addEventListener('click', function () {
        navLinks.forEach(l => l.classList.remove('active'));
        this.classList.add('active');

        // Close sidebar on mobile after clicking
        if (window.innerWidth < 992) {
            toggleSidebar();
        }
    });
});

// Smooth scroll for nav links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// Intersection Observer for scroll animations
const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -50px 0px' };
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('.card, .stat-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
});

