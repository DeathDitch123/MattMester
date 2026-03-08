const USERNAME_REGEX = /^[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ0-9._-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

document.addEventListener('DOMContentLoaded', () => {
    installModalFocusGuards();
    bindLoginForm();
    bindRegisterForm();
    bindLogoutButtonUser();
    bindLogoutButtonAdmin();
    restoreLastMode();
    socketHandler();
    refreshAuthUi();
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

function bindLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const messageElement = document.getElementById('loginMessage');
            const usernameOrMail = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            const rememberElement = document.getElementById('rememberMe');
            const remember = rememberElement ? rememberElement.checked : false;

            clearFormMessage(messageElement);

            if (!usernameOrMail || !password) {
                showFormMessage(messageElement, 'danger', 'Minden mező kitöltése kötelező.');
            } else {
                try {
                    const response = await fetch('/api/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ usernameOrMail, password, remember })
                    });
                    const result = await parseJson(response);

                    if (!response.ok) {
                        showFormMessage(messageElement, 'danger', result.message || 'Sikertelen bejelentkezes.');
                        return;
                    }
                    else {
                        showFormMessage(messageElement, 'success', result.message || 'Sikeres bejelentkezes.');
                        loginForm.reset();
                        hideModalById('loginModal');
                        showToast('Sikeres bejelentkezes.');

                        if (typeof socket !== 'undefined') {
                            console.log('Login form successful, refreshing stats via socket...');
                            socket.disconnect(); //?Először bontjuk a kapcsolatot, hogy a szerver felismerje a session változást
                            socket.connect(); //?Újra csatlakoztatjuk a socketet, hogy a szerver felismerje az új session-t és frissítse a statisztikákat
                        }
                        await refreshAuthUi();
                    }
                } catch (error) {
                    showFormMessage(messageElement, 'danger', 'Nem sikerult csatlakozni a szerverhez.');
                    console.error('Hiba a bejelentkezes soran:', error);
                }
            }
        });
    }
}

function bindRegisterForm() {
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();

            const messageElement = document.getElementById('registerMessage');
            const username = document.getElementById('registerUsername').value.trim();
            const email = document.getElementById('registerEmail').value.trim();
            const password = document.getElementById('registerPassword').value;

            clearFormMessage(messageElement);

            const validationMessage = validateRegisterInput(username, email, password);
            if (validationMessage) {
                showFormMessage(messageElement, 'danger', validationMessage);
            }
            else {
                try {
                    const response = await fetch('/api/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, email, password })
                    });

                    const result = await parseJson(response);

                    if (!response.ok) {
                        showFormMessage(messageElement, 'danger', result.message || 'Sikertelen regisztráció.');
                    }
                    else {
                        showFormMessage(messageElement, 'success', result.message || 'Sikeres regisztráció.');
                        registerForm.reset();
                        hideModalById('registerModal');
                        await refreshAuthUi();
                        showToast('Sikeres regisztráció. Most már bejelentkezhetsz.');
                    }
                } catch (error) {
                    showFormMessage(messageElement, 'danger', 'Nem sikerult csatlakozni a szerverhez.');
                    console.error('Hiba a regisztráció soran:', error);
                }
            }
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
//közös kijelentkezés kezelése user és admin részére, hogy ne kelljen duplikálni a kódot
async function handleLogout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await parseJson(response);

        if (response.ok) {
            showToast(result.message || 'Sikeres kijelentkezés.');
            if (typeof socket !== 'undefined') {
                socket.disconnect();
                socket.connect();
            }
            await refreshAuthUi();
        } else {
            showToast(result.message || 'Sikertelen kijelentkezés.');
        }
    } catch (error) {
        console.error('Hiba a kijelentkezés során:', error);
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

async function refreshAuthUi() {
    const guestActions = document.getElementById('guestActions');
    const userActions = document.getElementById('userActions');
    const adminActions = document.getElementById('adminActions');
    const welcomeMessage = document.querySelectorAll(".welcomeMessage");

    try {
        const data = await fetchSessionInfo();

        if (!data.success) {
            throw new Error('Nem sikerult lekerdezni a session informaciot.');
        }
        const user = data.user;
        const loggedIn = Boolean(user);
        const isAdmin = loggedIn && user.role === 'admin';

        console.clear();
        console.log('--- Auth Status Report ---');
        console.log('Session info:', data);

        if (typeof socket !== 'undefined') {
            console.log('SocketInfo:', {
                socketId: socket.id,
                connected: socket.connected,
                // Itt láthatod, hogy a szerver felismerte-e a session-t a socketen keresztül
                sessionBound: socket.connected ? "Active" : "Disconnected/Pending"
            });
        }
        else {
            console.warn('SocketInfo: A socket objektum nem található vagy még nem lett inicializálva.');
        }
        console.log('--------------------------');

        if (guestActions) guestActions.classList.toggle('d-none', loggedIn);
        if (userActions) userActions.classList.toggle('d-none', !loggedIn || isAdmin);
        if (adminActions) adminActions.classList.toggle('d-none', !isAdmin);

        if (welcomeMessage) {
            welcomeMessage.forEach(el => {
                el.innerText = loggedIn ? `Szia, ${user.username}!` : '';
            });
        }
    } catch (error) {
        console.error('Hiba az auth allapot frissitesekor:', error);
        if (guestActions) guestActions.classList.remove('d-none');
        if (userActions) userActions.classList.add('d-none');
        if (adminActions) adminActions.classList.add('d-none');
        if (welcomeMessage) welcomeMessage.forEach(el => el.innerText = '');
    }
}

function socketHandler() {
    if (typeof socket !== 'undefined') {
        socket.on('stats:public', (stats) => {
            // stats tartalma: { onlineUsers, totalUsers, totalGames, onlineGames }
            updateGlobalStats(stats);
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
        online: stats.onlineUsers,
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
