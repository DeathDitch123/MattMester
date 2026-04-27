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
        restoreLastMode();
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

function bindLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            await runSafelyAsync('loginSubmitHandler', async () => {
                event.preventDefault();

                const messageElement = document.getElementById('loginMessage');
                const usernameInput = document.getElementById('loginUsername');
                const passwordInput = document.getElementById('loginPassword');
                const rememberElement = document.getElementById('rememberMe');

                if (!usernameInput || !passwordInput) {
                    throw new Error('A login mezok nem talalhatok.');
                }

                const usernameOrMail = usernameInput.value.trim();
                const password = passwordInput.value;
                const remember = rememberElement ? rememberElement.checked : false;

                clearFormMessage(messageElement);

                if (!usernameOrMail || !password) {
                    throw new Error('Minden mező kitöltése kötelező.');
                }

                requestController.schedule('loginSubmit', async () => {
                    try {
                        const response = await fetch('/api/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ usernameOrMail, password, remember }),
                            signal: requestController.withAbortSignal('login')
                        });
                        const result = await parseJson(response);

                        if (!response.ok) {
                            throw new Error(result.message || 'Sikertelen bejelentkezes.');
                        }

                        showFormMessage(messageElement, 'success', result.message || 'Sikeres bejelentkezes.');
                        loginForm.reset();
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
                        requestController.clearSignal('login');
                    }
                });
            });
        });
    }
}

function bindRegisterForm() {
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            await runSafelyAsync('registerSubmitHandler', async () => {
                event.preventDefault();

                const messageElement = document.getElementById('registerMessage');
                const usernameInput = document.getElementById('registerUsername');
                const emailInput = document.getElementById('registerEmail');
                const passwordInput = document.getElementById('registerPassword');

                if (!usernameInput || !emailInput || !passwordInput) {
                    throw new Error('A register mezok nem talalhatok.');
                }

                const username = usernameInput.value.trim();
                const email = emailInput.value.trim();
                const password = passwordInput.value;

                clearFormMessage(messageElement);

                const validationMessage = validateRegisterInput(username, email, password);
                if (validationMessage !== '') {
                    throw new Error(validationMessage);
                }

                requestController.schedule('registerSubmit', async () => {
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

                        showFormMessage(messageElement, 'success', result.message || 'Sikeres regisztráció.');
                        registerForm.reset();
                        hideModalById('registerModal');
                        await refreshAuthUi('register-success');
                        showToast('Sikeres regisztráció. Most már bejelentkezhetsz.');
                    } catch (error) {
                        rethrowIfAborted(error);
                        showFormMessage(messageElement, 'danger', error.message || 'Nem sikerult csatlakozni a szerverhez.');
                        console.error('Hiba a regisztráció soran:', error);
                    } finally {
                        requestController.clearSignal('register');
                    }
                });
            });
        });
    }
}

function validateRegisterInput(username, email, password) {
    let message = "";

    if (!username || !email || !password) {
        message = 'Minden mező kitöltése kötelező.';
    }
    else if (username.length < 3 || username.length > 50) {
        message = 'A felhasználónévnek 3 és 50 karakter között kell lennie.';
    }
    else if (!USERNAME_REGEX.test(username)) {
        message = 'A felhasználónév csak alfanumerikus karaktereket, pontot, aláhúzást és kötőjelet tartalmazhat.';
    }
    else if (!EMAIL_REGEX.test(email)) {
        message = 'Érvénytelen email cím formátum.';
    }
    else if (password.length < 8) {
        message = 'A jelszónak legalább 8 karakter hosszú kell legyen.';
    }
    else if (!PASSWORD_REGEX.test(password)) {
        message = 'A jelszónak tartalmaznia kell legalább egy nagybetűt, egy kisbetűt és egy számot.';
    }

    return message;
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

function showFormMessage(messageElement, type, message) {
    if (!messageElement) {
        return;
    }

    messageElement.className = `mt-3 text-center alert alert-${type}`;
    messageElement.textContent = message;
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

function restoreLastMode() {
    const lastModeLabel = document.getElementById('lastModeLabel');
    if (!lastModeLabel) {
        return;
    }

    const storedMode = localStorage.getItem('selectedGameMode');
    if (storedMode) {
        lastModeLabel.textContent = storedMode;
    }
}

function selectGame(mode) {
    const lastModeLabel = document.getElementById('lastModeLabel');
    if (lastModeLabel) {
        lastModeLabel.textContent = mode;
    }

    localStorage.setItem('selectedGameMode', mode);
    window.location.href = `../chess_barold/html/chess.html?mode=${encodeURIComponent(mode)}`;
}

window.selectGame = selectGame;