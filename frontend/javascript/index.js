const USERNAME_REGEX = /^[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ0-9._-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const socket = window.MattMesterSocket?.socket || io();
const requestController = window.createRequestController(300);
let pendingModalId = '';

function rethrowIfAborted(error) {
    if (error?.name === 'AbortError') throw error;
}

function runSafely(label, handler) {
    try {
        return handler();
    } catch (error) {
        console.error(`${label} hiba:`, error);
        return undefined;
    }
}

async function runSafelyAsync(label, handler) {
    try {
        return await handler();
    } catch (error) {
        console.error(`${label} hiba:`, error);
        return undefined;
    }
}

let LeaderboardData = {
    elo: [],
    elo_MM: [],
    elo_bullet: [],
    winRate: [],
    lastUpdated: null
};

async function syncSocketContextForStartup(reason = 'index-startup') {
    try {
        if (window.MattMesterSocket?.syncSocketContextOrReconnect) {
            await window.MattMesterSocket.syncSocketContextOrReconnect(reason);
        }
    } catch (error) {
        console.warn('Startup socket context sync hiba:', error.message || error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    runSafely('indexDOMContentLoadedBindings', () => {
        installModalFocusGuards();
        bindLoginForm();
        bindForgotPasswordFlow();
        bindRegisterForm();
        bindLogoutButtonUser();
        bindLogoutButtonAdmin();
        bindLeaderBoardControls();
        socketHandler();
    });

    runSafelyAsync('indexInitialLoadSequence', async () => {
        await syncSocketContextForStartup('index-initial-load');
        await loadLeaderBoard();
        await refreshAuthUi();
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
    let data = { success: false, loggedIn: false };

    try {
        const response = await fetch('/api/sessionInfo', {
            signal: requestController.withAbortSignal('sessionInfo')
        });
        if (response.ok) {
            data = await parseJson(response);
        }
    } catch (error) {
        rethrowIfAborted(error);
        console.error('Hiba a session informacio lekerdezese soran:', error);
    } finally {
        requestController.clearSignal('sessionInfo');
    }

    return data;
}

async function loadLeaderBoard() {
    try {
        const response = await fetch('/api/leaderboard', {
            signal: requestController.withAbortSignal('leaderboard')
        });
        const payload = await parseJson(response);

        if (!response.ok || !payload.success) {
            throw new Error(payload.message || 'Nem sikerült betölteni a ranglistát.');
        }

        LeaderboardData = payload.data || {
            elo: [],
            elo_MM: [],
            elo_bullet: [],
            winRate: [],
            lastUpdated: null
        };
        renderLeaderBoard();
    } catch (error) {
        rethrowIfAborted(error);
        console.error('Hiba a ranglista lekérdezése során:', error);
    } finally {
        requestController.clearSignal('leaderboard');
    }
}

function bindLeaderBoardControls() {
    const filterElement = document.getElementById('leaderboardEloFilter');
    const limitElement = document.getElementById('leaderboardLimit');

    if (!filterElement || !limitElement) {
        throw new Error('A leaderboard vezérlők nem találhatók.');
    }

    filterElement.addEventListener('change', () => {
        runSafely('leaderboardFilterChange', () => {
            renderLeaderBoard();
        });
    });

    limitElement.addEventListener('change', () => {
        runSafely('leaderboardLimitChange', () => {
            renderLeaderBoard();
        });
    });
}

function escapeHtmlForLeaderboard(value) {
    const text = String(value == null ? '' : value);
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getRankBadgeClass(index) {
    let className = 'rank-default';
    if (index === 0) {
        className = 'rank-gold';
    } else if (index === 1) {
        className = 'rank-silver';
    } else if (index === 2) {
        className = 'rank-bronze';
    }
    return className;
}

function getRankIcon(index) {
    let icon = '';
    if (index === 0) {
        icon = '<i class="bi bi-trophy-fill"></i>';
    } else if (index === 1) {
        icon = '<i class="bi bi-award-fill"></i>';
    } else if (index === 2) {
        icon = '<i class="bi bi-award"></i>';
    }
    return icon;
}

function formatLeaderboardDate(value) {
    let formatted = '–';
    try {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) {
            formatted = date.toLocaleDateString('hu-HU', { year: 'numeric', month: '2-digit', day: '2-digit' });
        }
    } catch (error) {
        formatted = '–';
    }
    return formatted;
}

function buildLeaderboardRowHtml(player, index, filter) {
    const rankClass = getRankBadgeClass(index);
    const rankIcon = getRankIcon(index);
    const rawValue = filter === 'winRate' ? `${player.winrate_percent ?? 0}%` : (player[filter] ?? 0);
    const value = escapeHtmlForLeaderboard(rawValue);
    const lastActive = formatLeaderboardDate(player.last_active);
    const joinedAt = formatLeaderboardDate(player.joined_at || player.created_at);
    const username = escapeHtmlForLeaderboard(player.username || 'Ismeretlen');
    const profileImageSrc = escapeHtmlForLeaderboard(
        (window.MattMesterProfileImage?.normalizeProfileImageSource || ((value) => value || '/profile_pictures/default.png'))(player.profile_image)
    );

    return `
        <tr class="leaderboard-row leaderboard-row--rank-${index + 1}">
            <td class="leaderboard-cell-rank">
                <span class="rank-badge ${rankClass}">
                    ${rankIcon}
                    <span class="rank-number-value">${index + 1}</span>
                </span>
            </td>
            <td class="leaderboard-cell-player">
                <div class="leaderboard-player">
                    <span class="leaderboard-avatar-wrap">
                        <img class="leaderboard-avatar" src="${profileImageSrc}" alt="${username} profilkép" loading="lazy" onerror="this.src='/profile_pictures/default.png'">
                    </span>
                    <span class="leaderboard-player-name" title="${username}">${username}</span>
                </div>
            </td>
            <td class="leaderboard-cell-elo"><span class="leaderboard-elo-pill">${value}</span></td>
            <td class="leaderboard-cell-date d-none d-md-table-cell"><span class="leaderboard-date">${lastActive}</span></td>
            <td class="leaderboard-cell-date d-none d-lg-table-cell"><span class="leaderboard-date">${joinedAt}</span></td>
        </tr>
    `;
}

function renderLeaderBoard() {
    const filterElement = document.getElementById('leaderboardEloFilter');
    const limitElement = document.getElementById('leaderboardLimit');
    const tbody = document.getElementById('leaderboardBody');
    const emptyElement = document.getElementById('leaderboardEmpty');
    const lastUpdatedElement = document.getElementById('lastUpdated');

    if (!filterElement || !limitElement || !tbody) {
        throw new Error('A leaderboard DOM elemei nem találhatók.');
    }

    const filter = filterElement.value;
    const limit = Number(limitElement.value);

    try {
        const sortedData = [...(LeaderboardData[filter] || [])].slice(0, limit);

        if (emptyElement) {
            emptyElement.classList.toggle('d-none', sortedData.length > 0);
        }
        if (lastUpdatedElement && LeaderboardData.lastUpdated) {
            lastUpdatedElement.textContent = `frissítve: ${new Date(LeaderboardData.lastUpdated).toLocaleString('hu-HU')}`;
        }

        tbody.innerHTML = sortedData
            .map((player, index) => buildLeaderboardRowHtml(player, index, filter))
            .join('');
    } catch (error) {
        console.error('Hiba a ranglista megjelenítése során:', error);
    }
}

function setFieldFeedback(inputElement, feedbackElement, state, message) {
    if (!inputElement || !feedbackElement) {
        return;
    }

    inputElement.classList.remove('is-valid', 'is-invalid');
    feedbackElement.classList.remove('text-secondary', 'text-success', 'text-danger');
    feedbackElement.textContent = message || '';

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

function clearFieldFeedback(inputElement, feedbackElement) {
    if (!inputElement || !feedbackElement) {
        return;
    }
    inputElement.classList.remove('is-valid', 'is-invalid');
    feedbackElement.classList.remove('text-secondary', 'text-success', 'text-danger');
    feedbackElement.textContent = '';
}

function validateLoginInput(usernameOrMail, password) {
    const result = {
        isValid: false,
        summary: '',
        fields: {
            username: { state: 'neutral', message: 'Add meg a felhasználóneved vagy email címed.' },
            password: { state: 'neutral', message: 'Add meg a jelszavad.' }
        }
    };

    if (!usernameOrMail) {
        result.fields.username = { state: 'error', message: 'A felhasználónév vagy email megadása kötelező.' };
    } else if (usernameOrMail.includes('@')) {
        if (!EMAIL_REGEX.test(usernameOrMail)) {
            result.fields.username = { state: 'error', message: 'Az email cím formátuma érvénytelen.' };
        } else {
            result.fields.username = { state: 'success', message: 'Az email cím formátuma megfelelő.' };
        }
    } else if (usernameOrMail.length < 3 || usernameOrMail.length > 50) {
        result.fields.username = { state: 'error', message: 'A felhasználónév 3-50 karakter között lehet.' };
    } else if (!USERNAME_REGEX.test(usernameOrMail)) {
        result.fields.username = { state: 'error', message: 'A felhasználónév tiltott karaktert tartalmaz.' };
    } else {
        result.fields.username = { state: 'success', message: 'A felhasználónév formátuma megfelelő.' };
    }

    if (!password) {
        result.fields.password = { state: 'error', message: 'A jelszó megadása kötelező.' };
    } else {
        result.fields.password = { state: 'success', message: 'A jelszó megadva.' };
    }

    const firstError = Object.values(result.fields).find((field) => field.state === 'error');
    result.isValid = !firstError;
    result.summary = firstError ? firstError.message : '';
    return result;
}

function validateRegisterInput(username, email, password) {
    const result = {
        isValid: false,
        summary: '',
        fields: {
            username: { state: 'neutral', message: 'Adj meg egy 3-50 karakteres felhasználónevet.' },
            email: { state: 'neutral', message: 'Add meg az email címed.' },
            password: { state: 'neutral', message: 'Legalább 8 karakter, kisbetű, nagybetű, szám.' }
        }
    };

    if (!username) {
        result.fields.username = { state: 'error', message: 'A felhasználónév megadása kötelező.' };
    } else if (username.length < 3 || username.length > 50) {
        result.fields.username = { state: 'error', message: 'A felhasználónévnek 3 és 50 karakter között kell lennie.' };
    } else if (!USERNAME_REGEX.test(username)) {
        result.fields.username = { state: 'error', message: 'A felhasználónév csak betűt, számot, pontot, aláhúzást és kötőjelet tartalmazhat.' };
    } else {
        result.fields.username = { state: 'success', message: 'A felhasználónév formátuma megfelelő.' };
    }

    if (!email) {
        result.fields.email = { state: 'error', message: 'Az email cím megadása kötelező.' };
    } else if (!EMAIL_REGEX.test(email)) {
        result.fields.email = { state: 'error', message: 'Érvénytelen email cím formátum.' };
    } else {
        result.fields.email = { state: 'success', message: 'Az email cím formátuma megfelelő.' };
    }

    if (!password) {
        result.fields.password = { state: 'error', message: 'A jelszó megadása kötelező.' };
    } else if (password.length < 8) {
        result.fields.password = { state: 'error', message: 'A jelszónak legalább 8 karakter hosszúnak kell lennie.' };
    } else if (!PASSWORD_REGEX.test(password)) {
        result.fields.password = { state: 'error', message: 'A jelszónak tartalmaznia kell legalább egy nagybetűt, egy kisbetűt és egy számot.' };
    } else {
        result.fields.password = { state: 'success', message: 'A jelszó formátuma megfelelő.' };
    }

    const firstError = Object.values(result.fields).find((field) => field.state === 'error');
    result.isValid = !firstError;
    result.summary = firstError ? firstError.message : '';
    return result;
}

function renderLoginValidation(showNeutral = false) {
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const usernameFeedback = document.getElementById('loginUsernameFeedback');
    const passwordFeedback = document.getElementById('loginPasswordFeedback');
    const submitButton = document.getElementById('loginSubmitButton');

    if (!usernameInput || !passwordInput || !usernameFeedback || !passwordFeedback) {
        return { isValid: false, summary: 'A login mezők nem találhatók.' };
    }

    const validation = validateLoginInput(usernameInput.value.trim(), passwordInput.value);
    const usernameState = showNeutral ? validation.fields.username.state : (usernameInput.value.trim() ? validation.fields.username.state : 'neutral');
    const passwordState = showNeutral ? validation.fields.password.state : (passwordInput.value ? validation.fields.password.state : 'neutral');
    const usernameMessage = showNeutral ? validation.fields.username.message : (usernameInput.value.trim() ? validation.fields.username.message : 'Add meg a felhasználóneved vagy email címed.');
    const passwordMessage = showNeutral ? validation.fields.password.message : (passwordInput.value ? validation.fields.password.message : 'Add meg a jelszavad.');

    setFieldFeedback(usernameInput, usernameFeedback, usernameState, usernameMessage);
    setFieldFeedback(passwordInput, passwordFeedback, passwordState, passwordMessage);

    if (submitButton) {
        submitButton.disabled = !validation.isValid;
    }

    return validation;
}

function renderRegisterValidation(showNeutral = false) {
    const usernameInput = document.getElementById('registerUsername');
    const emailInput = document.getElementById('registerEmail');
    const passwordInput = document.getElementById('registerPassword');
    const usernameFeedback = document.getElementById('registerUsernameFeedback');
    const emailFeedback = document.getElementById('registerEmailFeedback');
    const passwordFeedback = document.getElementById('registerPasswordFeedback');
    const submitButton = document.getElementById('registerSubmitButton');

    if (!usernameInput || !emailInput || !passwordInput || !usernameFeedback || !emailFeedback || !passwordFeedback) {
        return { isValid: false, summary: 'A regisztrációs mezők nem találhatók.' };
    }

    const validation = validateRegisterInput(
        usernameInput.value.trim(),
        emailInput.value.trim(),
        passwordInput.value
    );

    const usernameState = showNeutral ? validation.fields.username.state : (usernameInput.value.trim() ? validation.fields.username.state : 'neutral');
    const emailState = showNeutral ? validation.fields.email.state : (emailInput.value.trim() ? validation.fields.email.state : 'neutral');
    const passwordState = showNeutral ? validation.fields.password.state : (passwordInput.value ? validation.fields.password.state : 'neutral');

    const usernameMessage = showNeutral ? validation.fields.username.message : (usernameInput.value.trim() ? validation.fields.username.message : 'Adj meg egy 3-50 karakteres felhasználónevet.');
    const emailMessage = showNeutral ? validation.fields.email.message : (emailInput.value.trim() ? validation.fields.email.message : 'Add meg az email címed.');
    const passwordMessage = showNeutral ? validation.fields.password.message : (passwordInput.value ? validation.fields.password.message : 'Legalább 8 karakter, kisbetű, nagybetű, szám.');

    setFieldFeedback(usernameInput, usernameFeedback, usernameState, usernameMessage);
    setFieldFeedback(emailInput, emailFeedback, emailState, emailMessage);
    setFieldFeedback(passwordInput, passwordFeedback, passwordState, passwordMessage);

    if (submitButton) {
        submitButton.disabled = !validation.isValid;
    }

    return validation;
}

function resetLoginValidationState() {
    clearFieldFeedback(document.getElementById('loginUsername'), document.getElementById('loginUsernameFeedback'));
    clearFieldFeedback(document.getElementById('loginPassword'), document.getElementById('loginPasswordFeedback'));
    const submitButton = document.getElementById('loginSubmitButton');
    if (submitButton) {
        submitButton.disabled = true;
    }
}

function resetRegisterValidationState() {
    clearFieldFeedback(document.getElementById('registerUsername'), document.getElementById('registerUsernameFeedback'));
    clearFieldFeedback(document.getElementById('registerEmail'), document.getElementById('registerEmailFeedback'));
    clearFieldFeedback(document.getElementById('registerPassword'), document.getElementById('registerPasswordFeedback'));
    const submitButton = document.getElementById('registerSubmitButton');
    if (submitButton) {
        submitButton.disabled = true;
    }
}

function bindLoginForm() {
    const loginForm = document.getElementById('loginForm');
    const loginModal = document.getElementById('loginModal');
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const submitButton = document.getElementById('loginSubmitButton');
    let isSubmitting = false;

    if (!loginForm || !usernameInput || !passwordInput) {
        return;
    }

    const validateLive = () => {
        const validation = renderLoginValidation(false);
        if (submitButton) {
            submitButton.disabled = isSubmitting || !validation.isValid;
        }
    };

    usernameInput.addEventListener('input', validateLive);
    usernameInput.addEventListener('blur', validateLive);
    passwordInput.addEventListener('input', validateLive);
    passwordInput.addEventListener('blur', validateLive);

    if (loginModal) {
        loginModal.addEventListener('show.bs.modal', () => {
            resetLoginValidationState();
            clearFormMessage(document.getElementById('loginMessage'));
        });
        loginModal.addEventListener('hidden.bs.modal', () => {
            resetLoginValidationState();
            clearFormMessage(document.getElementById('loginMessage'));
        });
    }

    resetLoginValidationState();

    loginForm.addEventListener('submit', async (event) => {
        await runSafelyAsync('loginSubmitHandler', async () => {
            event.preventDefault();

            if (isSubmitting) {
                return;
            }

            const messageElement = document.getElementById('loginMessage');
            const rememberElement = document.getElementById('rememberMe');
            const usernameOrMail = usernameInput.value.trim();
            const password = passwordInput.value;
            const remember = rememberElement ? rememberElement.checked : false;

            clearFormMessage(messageElement);

            const validation = renderLoginValidation(true);
            if (!validation.isValid) {
                showFormMessage(messageElement, 'danger', 'Javítsd a pirossal jelölt mezőket.');
                return;
            }

            isSubmitting = true;
            if (submitButton) {
                submitButton.disabled = true;
            }

            requestController.schedule('loginSubmit', async () => {
                let loginSucceeded = false;
                try {
                    const response = await fetch('/api/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ usernameOrMail, password, remember }),
                        signal: requestController.withAbortSignal('login')
                    });
                    const result = await parseJson(response);

                    if (!response.ok) {
                        if (result.code === 'account_banned') {
                            showFormMessage(
                                messageElement, 'danger',
                                'A fiók tiltva lett, ha fellebbezne, vegye fel a kapcsolatot a következő email címen az oldal készítőivel: <a href="https://mail.google.com/mail/?view=cm&fs=1&to=mattmester.support@gmail.com&su=Ban%20fellebbez%C3%A9s%20%E2%80%94%20MattMester" target="_blank" rel="noopener" class="alert-link">mattmester.support@gmail.com</a>',
                                true
                            );
                            return;
                        }
                        throw new Error(result.message || 'Sikertelen bejelentkezes.');
                    }

                    loginSucceeded = true;

                    showFormMessage(messageElement, 'success', result.message || 'Sikeres bejelentkezes.');
                    loginForm.reset();
                    resetLoginValidationState();
                    hideModalById('loginModal');
                    showToast('Sikeres bejelentkezes.');

                    if (socket) {
                        console.log('Login form successful, refreshing stats via socket...');
                        socket.disconnect();
                        socket.connect();
                    }
                    await refreshAuthUi('login-success');
                } catch (error) {
                    rethrowIfAborted(error);
                    showFormMessage(messageElement, 'danger', error.message || 'Nem sikerult csatlakozni a szerverhez.');
                    console.error('Hiba a bejelentkezes soran:', error);
                } finally {
                    isSubmitting = false;
                    requestController.clearSignal('login');
                    if (!loginSucceeded) {
                        validateLive();
                    }
                }
            });
        });
    });
}

function bindRegisterForm() {
    const registerForm = document.getElementById('registerForm');
    const registerModal = document.getElementById('registerModal');
    const usernameInput = document.getElementById('registerUsername');
    const emailInput = document.getElementById('registerEmail');
    const passwordInput = document.getElementById('registerPassword');
    const submitButton = document.getElementById('registerSubmitButton');
    let isSubmitting = false;

    if (!registerForm || !usernameInput || !emailInput || !passwordInput) {
        return;
    }

    const validateLive = () => {
        const validation = renderRegisterValidation(false);
        if (submitButton) {
            submitButton.disabled = isSubmitting || !validation.isValid;
        }
    };

    usernameInput.addEventListener('input', validateLive);
    usernameInput.addEventListener('blur', validateLive);
    emailInput.addEventListener('input', validateLive);
    emailInput.addEventListener('blur', validateLive);
    passwordInput.addEventListener('input', validateLive);
    passwordInput.addEventListener('blur', validateLive);

    if (registerModal) {
        registerModal.addEventListener('show.bs.modal', () => {
            resetRegisterValidationState();
            clearFormMessage(document.getElementById('registerMessage'));
        });
        registerModal.addEventListener('hidden.bs.modal', () => {
            resetRegisterValidationState();
            clearFormMessage(document.getElementById('registerMessage'));
        });
    }

    resetRegisterValidationState();

    registerForm.addEventListener('submit', async (event) => {
        await runSafelyAsync('registerSubmitHandler', async () => {
            event.preventDefault();

            if (isSubmitting) {
                return;
            }

            const messageElement = document.getElementById('registerMessage');
            const username = usernameInput.value.trim();
            const email = emailInput.value.trim();
            const password = passwordInput.value;

            clearFormMessage(messageElement);

            const validation = renderRegisterValidation(true);
            if (!validation.isValid) {
                showFormMessage(messageElement, 'danger', 'Javítsd a pirossal jelölt mezőket.');
                return;
            }

            isSubmitting = true;
            if (submitButton) {
                submitButton.disabled = true;
            }

            requestController.schedule('registerSubmit', async () => {
                let registerSucceeded = false;
                try {
                    const response = await fetch('/api/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, email, password }),
                        signal: requestController.withAbortSignal('register')
                    });

                    const result = await parseJson(response);

                    if (!response.ok) {
                        throw new Error(result.message || 'Sikertelen regisztráció.');
                    }

                    registerSucceeded = true;

                    showFormMessage(messageElement, 'success', result.message || 'Sikeres regisztráció.');
                    registerForm.reset();
                    resetRegisterValidationState();
                    hideModalById('registerModal');
                    await refreshAuthUi('register-success');
                    showToast('Sikeres regisztráció. Most már bejelentkezhetsz.');
                } catch (error) {
                    rethrowIfAborted(error);
                    showFormMessage(messageElement, 'danger', error.message || 'Nem sikerult csatlakozni a szerverhez.');
                    console.error('Hiba a regisztráció soran:', error);
                } finally {
                    isSubmitting = false;
                    requestController.clearSignal('register');
                    if (!registerSucceeded) {
                        validateLive();
                    }
                }
            });
        });
    });
}
async function handleLogout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: requestController.withAbortSignal('logout')
        });
        const result = await parseJson(response);

        if (!response.ok) {
            throw new Error(result.message || 'Sikertelen kijelentkezés.');
        }

        showToast(result.message || 'Sikeres kijelentkezés.');
        // Explicit badge nullázás azonnal, még a reconnect előtt: a UI ne
        // mutassa villanásnyira sem a régi user olvasatlan számát.
        try {
            window.dispatchEvent(new CustomEvent('mattmester:notification:reset', {
                detail: { reason: 'logout', at: new Date().toISOString() }
            }));
            window.dispatchEvent(new CustomEvent('mattmester:chat:unread:reset', {
                detail: { reason: 'logout', at: new Date().toISOString() }
            }));
        } catch (resetError) {
            console.warn('[index] logout reset dispatch hiba:', resetError.message);
        }

        if (socket) {
            socket.disconnect();
            socket.connect();
        }
        await refreshAuthUi('logout-success');
    } catch (error) {
        rethrowIfAborted(error);
        console.error('Hiba a kijelentkezés során:', error);
        showToast(error.message || 'Hiba történt a kijelentkezés során.');
    } finally {
        requestController.clearSignal('logout');
    }
}

function bindLogoutButtonUser() {
    const btn = document.getElementById('logoutBtnUser');
    if (btn) btn.addEventListener('click', handleLogout);
}

function bindLogoutButtonAdmin() {
    const btn = document.getElementById('logoutBtnAdmin');
    if (btn) btn.addEventListener('click', handleLogout);
}

async function refreshAuthUi(contextLabel = 'auth-refresh') {
    const guestActions = document.getElementById('guestActions');
    const userActions = document.getElementById('userActions');
    const adminActions = document.getElementById('adminActions');
    const eloDisplay = document.getElementById('eloDisplay');
    const welcomeMessage = document.querySelectorAll(".welcomeMessage");
    const loginModalMessage = document.getElementById('loginMessage');
    const registerModalMessage = document.getElementById('registerMessage');

    try {
        clearFormMessage(loginModalMessage);
        clearFormMessage(registerModalMessage);
        const data = await fetchSessionInfo();

        if (!data.success) {
            throw new Error('Nem sikerult lekerdezni a session informaciot.');
        }
        const user = data.user;
        const loggedIn = Boolean(user);
        const isAdmin = loggedIn && user.role === 'admin';

        console.clear();
        console.log('--- Auth Status Report ---');
        console.log('Context:', contextLabel);
        console.log('Session info:', data);

        if (socket) {
            console.log('SocketInfo:', window.MattMesterSocket?.getSnapshot ? window.MattMesterSocket.getSnapshot() : {
                socketId: socket.id,
                connected: socket.connected,
                sessionBound: socket.connected ? 'Active' : 'Disconnected/Pending'
            });
        }
        else {
            console.warn('SocketInfo: A socket objektum nem található vagy még nem lett inicializálva.');
        }
        console.log('--------------------------');

        if (guestActions) guestActions.classList.toggle('d-none', loggedIn);
        if (userActions) userActions.classList.toggle('d-none', !loggedIn || isAdmin);
        if (adminActions) adminActions.classList.toggle('d-none', !isAdmin);
        if (eloDisplay) eloDisplay.classList.toggle('d-none', !loggedIn);

        if (welcomeMessage) {
            welcomeMessage.forEach(el => {
                el.innerText = loggedIn ? `Szia, ${user.username}!` : '';
            });
        }
        if (loggedIn && user.elo !== undefined && eloDisplay) {
            eloDisplayrefresh(user);
        }
    } catch (error) {
        console.error('Hiba az auth allapot frissitesekor:', error);
        if (guestActions) guestActions.classList.remove('d-none');
        if (userActions) userActions.classList.add('d-none');
        if (adminActions) adminActions.classList.add('d-none');
        if (eloDisplay) eloDisplay.classList.add('d-none');
        if (welcomeMessage) welcomeMessage.forEach(el => el.innerText = '');
    }
}
function eloDisplayrefresh(user) {
    try {
        if (user && user.stats) {
            const eloMap = {
                'user_elo': user.elo,
                'user_MM_elo': user.elo_MM,
                'user_bullet_elo': user.elo_bullet,
            };
            for (const [key, value] of Object.entries(eloMap)) {
                const element = document.querySelector(`[data-stat="${key}"]`);
                if (element) element.textContent = value !== undefined ? value : '800';
            }
            const stats = user.stats || {};
            const totalGames = (stats.wins || 0) + (stats.losses || 0) + (stats.draws || 0);
            let winRate = 0;
            if (totalGames > 0) {
                winRate = ((stats.wins || 0) / totalGames * 100).toFixed(2) + '%';
            }
            const winRateElement = document.querySelector(`[data-stat="user_winRate"]`);
            if (winRateElement) winRateElement.textContent = winRate;
        } else {
            console.warn('ELO display refresh: Nincs elérhető user adat a megjelenítéshez.');
        }
    } catch (error) {
        console.error('Hiba az ELO display frissítésekor:', error);
    }
}
function socketHandler() {
    if (socket) {
        socket.on('stats:public', (stats) => {
            updateGlobalStats(stats);
        });

        socket.on('leaderboard:update', (payload) => {
            try {
                if (!payload || typeof payload !== 'object') {
                    return;
                }

                LeaderboardData = {
                    elo: Array.isArray(payload.elo) ? payload.elo : [],
                    elo_MM: Array.isArray(payload.elo_MM) ? payload.elo_MM : [],
                    elo_bullet: Array.isArray(payload.elo_bullet) ? payload.elo_bullet : [],
                    winRate: Array.isArray(payload.winRate) ? payload.winRate : [],
                    lastUpdated: payload.lastUpdated || null
                };

                renderLeaderBoard();
            } catch (error) {
                console.error('Hiba a leaderboard socket frissítés feldolgozásakor:', error);
            }
        });
    }
}

const statsElements = {
    players: document.querySelector('[data-stat="players"]'),
    liveGames: document.querySelector('[data-stat="liveGames"]'),
    online: document.querySelector('[data-stat="online"]'),
    allGames: document.querySelector('[data-stat="allGames"]')
};

function updateGlobalStats(stats) {
    const mapping = {
        players: stats.totalUsers,
        liveGames: stats.onlineGames,
        online: stats.onlinePlayers ?? stats.onlineUsers,
        allGames: stats.totalGames
    };

    Object.keys(mapping).forEach(key => {

        const el = statsElements[key];
        const newValue = mapping[key] ?? 0;

        if (!el) return;

        if (el.textContent != newValue) {

            el.textContent = newValue;

            el.classList.remove('stat-update-anim');
            void el.offsetWidth;
            el.classList.add('stat-update-anim');

            setTimeout(() => {
                el.classList.remove('stat-update-anim');
            }, 600);
        }
    });
}

function clearFormMessage(messageElement) {
    if (!messageElement) {
        return;
    }

    messageElement.className = 'mt-3 text-center alert d-none';
    messageElement.textContent = '';
}

function showFormMessage(messageElement, type, message, asHtml = false) {
    if (!messageElement) {
        return;
    }

    messageElement.className = `mt-3 text-center alert alert-${type}`;
    if (asHtml) {
        messageElement.innerHTML = message;
    } else {
        messageElement.textContent = message;
    }
}

function showModalById(modalId) {
    const modalElement = document.getElementById(modalId);
    if (!modalElement || !window.bootstrap || !window.bootstrap.Modal) {
        return;
    }

    const modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalElement);
    modalInstance.show();
}

function hideModalById(modalId) {
    const modalElement = document.getElementById(modalId);
    if (!modalElement || !window.bootstrap || !window.bootstrap.Modal) {
        return;
    }

    if (modalElement.contains(document.activeElement)) {
        document.activeElement.blur();
    }

    const modalInstance = window.bootstrap.Modal.getOrCreateInstance(modalElement);
    modalInstance.hide();
}

function setForgotPasswordEmailFeedback(inputElement, feedbackElement, state, message) {
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

function validateForgotPasswordEmail() {
    const emailInput = document.getElementById('forgotPasswordEmail');
    const feedbackElement = document.getElementById('forgotPasswordEmailFeedback');
    const submitButton = document.getElementById('forgotPasswordSubmitButton');
    const emailValue = emailInput ? emailInput.value.trim() : '';
    let isValid = false;
    let state = 'neutral';
    let message = 'Add meg az email címed.';

    if (!emailValue) {
        state = 'error';
        message = 'Az email cím megadása kötelező.';
    } else if (!EMAIL_REGEX.test(emailValue)) {
        state = 'error';
        message = 'Érvénytelen email cím formátum.';
    } else {
        state = 'success';
        message = 'Az email cím formátuma megfelelő.';
        isValid = true;
    }

    setForgotPasswordEmailFeedback(emailInput, feedbackElement, state, message);

    if (submitButton) {
        submitButton.disabled = !isValid;
    }

    return isValid;
}

function bindForgotPasswordFlow() {
    const loginModal = document.getElementById('loginModal');
    const forgotModal = document.getElementById('forgotPasswordModal');
    const openForgotButton = document.getElementById('openForgotPasswordModal');
    const backButton = document.getElementById('forgotPasswordBackButton');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');

    if (loginModal) {
        loginModal.addEventListener('hidden.bs.modal', () => {
            if (pendingModalId) {
                const nextModalId = pendingModalId;
                pendingModalId = '';
                showModalById(nextModalId);
            }
        });
    }

    if (forgotModal) {
        forgotModal.addEventListener('show.bs.modal', () => {
            const messageElement = document.getElementById('forgotPasswordMessage');
            const emailInput = document.getElementById('forgotPasswordEmail');
            const feedbackElement = document.getElementById('forgotPasswordEmailFeedback');
            if (messageElement) {
                clearFormMessage(messageElement);
            }
            if (emailInput) {
                emailInput.value = emailInput.value || '';
            }
            setForgotPasswordEmailFeedback(emailInput, feedbackElement, 'neutral', 'Add meg az email címed.');
        });

        forgotModal.addEventListener('hidden.bs.modal', () => {
            const messageElement = document.getElementById('forgotPasswordMessage');
            const emailInput = document.getElementById('forgotPasswordEmail');
            const feedbackElement = document.getElementById('forgotPasswordEmailFeedback');
            if (messageElement) {
                clearFormMessage(messageElement);
            }
            if (emailInput) {
                emailInput.value = '';
                emailInput.classList.remove('is-valid', 'is-invalid');
            }
            if (feedbackElement) {
                feedbackElement.classList.remove('text-secondary', 'text-success', 'text-danger');
                feedbackElement.textContent = '';
            }
        });
    }

    if (openForgotButton) {
        openForgotButton.addEventListener('click', () => {
            pendingModalId = 'forgotPasswordModal';
            hideModalById('loginModal');
        });
    }

    if (backButton) {
        backButton.addEventListener('click', () => {
            pendingModalId = 'loginModal';
            hideModalById('forgotPasswordModal');
        });
    }

    if (forgotPasswordForm) {
        const emailInput = document.getElementById('forgotPasswordEmail');
        if (emailInput) {
            emailInput.addEventListener('input', () => {
                validateForgotPasswordEmail();
            });
            emailInput.addEventListener('blur', () => {
                validateForgotPasswordEmail();
            });
        }

        forgotPasswordForm.addEventListener('submit', async (event) => {
            await runSafelyAsync('forgotPasswordSubmitHandler', async () => {
                event.preventDefault();

                const messageElement = document.getElementById('forgotPasswordMessage');
                const currentEmailInput = document.getElementById('forgotPasswordEmail');
                const submitButton = document.getElementById('forgotPasswordSubmitButton');
                const email = currentEmailInput ? currentEmailInput.value.trim() : '';

                clearFormMessage(messageElement);

                if (!validateForgotPasswordEmail()) {
                    showFormMessage(messageElement, 'danger', 'Ellenőrizd az email címet.');
                } else {
                    if (submitButton) {
                        submitButton.disabled = true;
                        submitButton.textContent = 'Küldés folyamatban...';
                    }

                    requestController.schedule('forgotPasswordSubmit', async () => {
                        try {
                            const response = await fetch('/api/auth/forgot-password', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email }),
                                signal: requestController.withAbortSignal('forgotPassword')
                            });
                            const result = await parseJson(response);

                            if (!response.ok) {
                                throw new Error(result.message || 'Sikertelen jelszó-visszaállítási kérés.');
                            }

                            showFormMessage(messageElement, 'success', result.message || 'Ha létezik ilyen email cím, elküldtük a visszaállító levelet.');
                            if (currentEmailInput) {
                                currentEmailInput.classList.remove('is-invalid');
                                currentEmailInput.classList.add('is-valid');
                            }
                        } catch (error) {
                            rethrowIfAborted(error);
                            showFormMessage(messageElement, 'danger', error.message || 'Nem sikerult csatlakozni a szerverhez.');
                            console.error('Hiba a jelszó-visszaállítási email kérés során:', error);
                        } finally {
                            requestController.clearSignal('forgotPassword');
                            if (submitButton) {
                                submitButton.disabled = !validateForgotPasswordEmail();
                                submitButton.textContent = 'Email küldése';
                            }
                        }
                    });
                }
            });
        });
    }
}

function installModalFocusGuards() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach((modal) => {
        modal.addEventListener('hide.bs.modal', () => {
            if (modal.contains(document.activeElement)) {
                document.activeElement.blur();
            }
        });
    });
}

function showToast(message) {
    const toastBody = document.getElementById('appToastBody');
    const toastElement = document.getElementById('appToast');

    if (toastBody) {
        toastBody.textContent = message;
    }

    if (!toastElement || !window.bootstrap || !window.bootstrap.Toast) {
        return;
    }

    const toast = window.bootstrap.Toast.getOrCreateInstance(toastElement);
    toast.show();
}

// A korábbi külső mode-választó (selectGame + restoreLastMode + #playModal)
// törölve — a mode-választás teljes egészében a chess.html-en történik.