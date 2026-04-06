const USERNAME_REGEX = /^[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ0-9._-]+$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const socket = window.MattMesterSocket?.socket || io();
lucide.createIcons();

const PROFILE_SETTINGS_CONFIRM_SECONDS = 10;
const PROFILE_DELETE_CONFIRM_SECONDS = 5;
const PROFILE_IMAGE_MAX_SIZE_BYTES = 3 * 1024 * 1024;
const PROFILE_IMAGE_ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PLAYER_SEARCH_DEBOUNCE_MS = 300;
const PROFILE_CROSS_TAB_REFRESH_THROTTLE_MS = 1200;

const profileSettingsState = {
    bound: false,
    initial: null,
    pendingPayload: null,
    countdownTimer: null,
    countdownLeft: PROFILE_SETTINGS_CONFIRM_SECONDS,
    countdownFinished: false,
    requiresPasswordCheck: false,
    passwordVerified: false
};
const profileDeleteState = {
    bound: false,
    countdownTimer: null,
    countdownLeft: PROFILE_DELETE_CONFIRM_SECONDS,
    countdownFinished: false,
    submitting: false
};
const profileImageEditorState = {
    bound: false,
    image: null,
    objectUrl: null,
    scale: 1,
    rotationDeg: 0,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
    uploading: false,
    bufferCanvas: document.createElement('canvas')
};
const playerSearchState = {
    topbar: {
        debounceTimer: null,
        abortController: null,
        requestToken: 0
    },
    modal: {
        debounceTimer: null,
        abortController: null,
        requestToken: 0
    }
};
const profileRealtimeSyncState = {
    bound: false,
    unsubscribe: null
};

async function syncSocketContextForStartup(reason = 'profile-startup') {
    try {
        if (window.MattMesterSocket?.syncSocketContextOrReconnect) {
            await window.MattMesterSocket.syncSocketContextOrReconnect(reason);
        }
    } catch (error) {
        console.warn('Profile startup socket context sync hiba:', error.message || error);
    }
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

document.addEventListener('DOMContentLoaded', () => {
    runSafely('profileDOMContentLoadedBindings', () => {
        bindLogoutButton();
        bindTopBarPlayerSearchValidation();
        bindModalPlayerSearchValidation();
        bindSearchResultsModalEvents();
        bindProfileDeleteModalEvents();
        bindProfileImageUploadEvents();
        bindRemoveAvatarEvents();
        bindCrossTabProfileRefreshEvents();
    });

    runSafelyAsync('profileInitialLoadSequence', async () => {
        await syncSocketContextForStartup('profile-initial-load');
        await refreshAuthUi('profile-initial-load');
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

async function logSessionAndSocketInfo(sessionInfoInput = null, contextLabel = 'auth-refresh') {
    try {
        const sessionInfo = sessionInfoInput || await fetchSessionInfo();

        console.clear();
        console.log('--- Auth Status Report ---');
        console.log('Context:', contextLabel);
        console.log('Session info:', sessionInfo);

        if (socket) {
            console.log('SocketInfo:', window.MattMesterSocket?.getSnapshot ? window.MattMesterSocket.getSnapshot() : {
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

async function refreshAuthUi(contextLabel = 'auth-refresh') {
    try {
        const sessionInfo = await fetchSessionInfo();
        showStats(sessionInfo);
        handleProfileSettings(sessionInfo);
        logSessionAndSocketInfo(sessionInfo, contextLabel);
    } catch (error) {
        console.error('refreshAuthUi hiba:', error);
    }
}

async function syncSocketContextOrReconnect(reason = 'session-mutation') {
    try {
        if (window.MattMesterSocket?.syncSocketContextOrReconnect) {
            await window.MattMesterSocket.syncSocketContextOrReconnect(reason);
            return;
        }

        throw new Error('A közös socket sync API nem érhető el.');
    } catch (error) {
        throw new Error(`Socket context szinkronizálási hiba: ${error.message}`);
    }
}

function bindCrossTabProfileRefreshEvents() {
    try {
        if (profileRealtimeSyncState.bound) {
            return;
        }

        if (!window.MattMesterSocket?.subscribeSessionContextChanges) {
            throw new Error('A közös session context observer API nem érhető el.');
        }

        const unsubscribe = window.MattMesterSocket.subscribeSessionContextChanges(async (eventPayload = {}) => {
            try {
                await refreshAuthUi();
            } catch (error) {
                throw new Error(`Cross-tab profil frissítési hiba: ${error.message}`);
            }
        }, {
            throttleMs: PROFILE_CROSS_TAB_REFRESH_THROTTLE_MS
        });

        if (typeof unsubscribe !== 'function') {
            throw new Error('A session context observer leiratkozó függvény nem érkezett meg.');
        }

        profileRealtimeSyncState.unsubscribe = unsubscribe;
        profileRealtimeSyncState.bound = true;

        window.addEventListener('beforeunload', () => {
            runSafely('profileRealtimeSyncUnsubscribe', () => {
                try {
                    if (typeof profileRealtimeSyncState.unsubscribe === 'function') {
                        profileRealtimeSyncState.unsubscribe();
                    }
                    profileRealtimeSyncState.unsubscribe = null;
                    profileRealtimeSyncState.bound = false;
                } catch (error) {
                    throw new Error(`Cross-tab observer leiratkozási hiba: ${error.message}`);
                }
            });
        }, { once: true });
    } catch (error) {
        throw new Error(`Cross-tab profil refresh eseménykötési hiba: ${error.message}`);
    }
}

function getPlayerSearchRuntime(source = 'topbar') {
    return source === 'modal' ? playerSearchState.modal : playerSearchState.topbar;
}

function cancelPlayerSearch(source = 'topbar', abortInFlight = true) {
    const runtime = getPlayerSearchRuntime(source);
    if (runtime.debounceTimer) {
        clearTimeout(runtime.debounceTimer);
        runtime.debounceTimer = null;
    }

    if (abortInFlight && runtime.abortController) {
        runtime.abortController.abort();
        runtime.abortController = null;
    }
}

function schedulePlayerSearch(source = 'topbar', delayMs = PLAYER_SEARCH_DEBOUNCE_MS) {
    const runtime = getPlayerSearchRuntime(source);
    if (runtime.debounceTimer) {
        clearTimeout(runtime.debounceTimer);
        runtime.debounceTimer = null;
    }

    runtime.debounceTimer = setTimeout(() => {
        runtime.debounceTimer = null;
        searchPlayer(source).catch((error) => {
            if (error?.name === 'AbortError' || error?.name === 'SearchStaleError') {
                console.debug('Keresés megszakítva vagy elavult:', error.message);
            } else {
                console.error('Keresés hiba:', error);
            }
        });
    }, Math.max(0, Number(delayMs) || 0));
}

async function searchPlayer(source = 'topbar'){
    const runtime = getPlayerSearchRuntime(source);
    const requestToken = runtime.requestToken + 1;
    runtime.requestToken = requestToken;

    try {
        const elements = source === 'modal'
            ? getModalPlayerSearchElements()
            : getTopBarPlayerSearchElements();
        const { input, button, feedback } = elements;
        if (!input || !button || !feedback) {
            throw new Error('A kereső elemek nem találhatók a DOM-ban.');
        }

        const username = (input.value || '').trim();
        if (!username || username.length < 3 || username.length > 50 || !USERNAME_REGEX.test(username)) {
            throw new Error('Érvénytelen felhasználónév a kereséshez.');
        }
        const searchText = username;

        feedback.classList.remove('text-danger', 'text-success');
        feedback.classList.add('text-secondary');
        feedback.textContent = 'Keresés folyamatban...';
        button.disabled = true;

        if (runtime.abortController) {
            runtime.abortController.abort();
        }
        runtime.abortController = new AbortController();

        const response = await fetch(`/api/searchPlayer?username=${encodeURIComponent(username)}`, {
            signal: runtime.abortController.signal
        });

        if (runtime.requestToken !== requestToken) {
            const staleError = new Error('A keresés elavulttá vált.');
            staleError.name = 'SearchStaleError';
            throw staleError;
        }

        const result = await parseJson(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Sikertelen keresés.');
        }

        feedback.classList.remove('text-secondary', 'text-danger');
        feedback.classList.add('text-success');
        feedback.textContent = `A keresés eredményes: ${result.data.length} találat.`;

        openSearchResultsModal(Array.isArray(result.data) ? result.data : [], searchText);
        clearPlayerSearchInputs();
    } catch (error) {
        if (error?.name === 'AbortError' || error?.name === 'SearchStaleError') {
            throw error;
        }

        const { feedback } = source === 'modal'
            ? getModalPlayerSearchElements()
            : getTopBarPlayerSearchElements();
        if (feedback) {
            feedback.classList.remove('text-secondary', 'text-success');
            feedback.classList.add('text-danger');
            feedback.textContent = error.message || 'Hiba történt a játékos keresése során.';
        }
        clearPlayerSearchInputs();
        console.error('Hiba a jatekos kereses soran:', error);
    } finally {
        if (runtime.requestToken === requestToken) {
            runtime.abortController = null;
        }

        if (source === 'modal') {
            validatePlayerSearchElements(getModalPlayerSearchElements());
        } else {
            validatePlayerSearchElements(getTopBarPlayerSearchElements());
        }
    }
}

function getSearchResultsModalElements() {
    return {
        modal: document.getElementById('searchResultsModal'),
        titleText: document.getElementById('searchResultsModalTitleText'),
        list: document.getElementById('searchResultsList'),
        summary: document.getElementById('searchResultsSummary'),
        empty: document.getElementById('searchResultsEmpty')
    };
}

function clearPlayerSearchInputs() {
    const { input: topInput } = getTopBarPlayerSearchElements();
    const { input: modalInput } = getModalPlayerSearchElements();

    if (topInput) {
        topInput.value = '';
    }

    if (modalInput) {
        modalInput.value = '';
    }

    validatePlayerSearchElements(getTopBarPlayerSearchElements());
    validatePlayerSearchElements(getModalPlayerSearchElements());
}

function getModalPlayerSearchElements() {
    return {
        input: document.getElementById('modalPlayerSearchInput'),
        button: document.getElementById('modalPlayerSearchButton'),
        feedback: document.getElementById('modalPlayerSearchFeedback')
    };
}

function createSearchResultListItem(player) {
    const item = document.createElement('div');
    item.className = 'search-results-item';
    item.setAttribute('role', 'listitem');
    item.dataset.userId = String(player.userId || player.id || '');
    item.dataset.username = String(player.username || '');
    item.dataset.friendStatus = String(player.friendStatus || 'none');

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'position-relative flex-shrink-0';

    const avatar = document.createElement('img');
    avatar.className = 'friend-avatar rounded-circle';
    if ((player.profileImageStatus || '').toLowerCase() === 'pending') {
        avatar.classList.add('search-result-avatar-pending');
    }
    avatar.style.width = '40px';
    avatar.style.height = '40px';
    avatar.style.objectFit = 'cover';
    avatar.alt = `${player.username || 'Jatekos'} profilkepe`;
    avatar.src = player.profileImage || '/profile_pictures/default.png';
    avatarWrap.appendChild(avatar);

    const info = document.createElement('div');
    info.className = 'flex-grow-1 min-width-0';

    const name = document.createElement('h6');
    name.className = 'mb-0 text-white text-truncate';
    name.style.fontSize = '0.9rem';
    name.textContent = player.username || 'Ismeretlen jatekos';
    info.appendChild(name);

    const actions = document.createElement('div');
    actions.className = 'search-results-actions';

    const friendStatus = String(player.friendStatus || 'none');
    let actionButton, chatButton;

    // Friend gomb az eredeti Friend Add helyett
    if (friendStatus === 'none' || friendStatus === 'rejected') {
        actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.className = 'btn btn-sm btn-outline-gold py-1 px-2';
        actionButton.title = 'Barát hozzáadása';
        actionButton.dataset.action = 'add-friend';
        actionButton.dataset.userId = String(player.userId || player.id || '');
        actionButton.dataset.username = String(player.username || '');
        actionButton.innerHTML = '<i data-lucide="user-plus" style="width: 16px; height: 16px;"></i>';
        actions.appendChild(actionButton);
    } else if (friendStatus === 'pending') {
        actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.className = 'btn btn-sm btn-outline-warning py-1 px-2';
        actionButton.title = 'Barát kérelem: függőben';
        actionButton.dataset.action = 'pending-friend';
        actionButton.dataset.userId = String(player.userId || player.id || '');
        actionButton.innerHTML = '<i data-lucide="arrow-up-right" style="width: 16px; height: 16px;"></i>';
        actions.appendChild(actionButton);
    } else if (friendStatus === 'accepted') {
        actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.className = 'btn btn-sm btn-outline-success py-1 px-2';
        actionButton.title = 'Barát: elfogadva';
        actionButton.dataset.action = 'accepted-friend';
        actionButton.dataset.userId = String(player.userId || player.id || '');
        actionButton.innerHTML = '<i data-lucide="check" style="width: 16px; height: 16px;"></i>';
        actions.appendChild(actionButton);

        chatButton = document.createElement('button');
        chatButton.type = 'button';
        chatButton.className = 'btn btn-sm btn-outline-gold py-1 px-2';
        chatButton.title = 'Üzenet küldése';
        chatButton.dataset.action = 'chat';
        chatButton.dataset.userId = String(player.userId || player.id || '');
        chatButton.dataset.username = String(player.username || '');
        chatButton.innerHTML = '<i data-lucide="message-circle" style="width: 16px; height: 16px;"></i>';
        actions.appendChild(chatButton);
    } else if (friendStatus === 'blocked') {
        actionButton = document.createElement('button');
        actionButton.type = 'button';
        actionButton.className = 'btn btn-sm btn-outline-danger py-1 px-2';
        actionButton.title = 'Felhasználó: letiltva';
        actionButton.dataset.action = 'blocked-friend';
        actionButton.dataset.userId = String(player.userId || player.id || '');
        actionButton.disabled = true;
        actionButton.innerHTML = '<i data-lucide="slash-circle" style="width: 16px; height: 16px;"></i>';
        actions.appendChild(actionButton);
    }

    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'btn btn-sm btn-outline-gold py-1 px-2';
    viewButton.title = 'Megtekintés';
    viewButton.dataset.action = 'view-profile';
    viewButton.dataset.userId = String(player.userId || player.id || '');
    viewButton.dataset.username = String(player.username || '');
    viewButton.innerHTML = '<i data-lucide="eye" style="width: 16px; height: 16px;"></i>';
    actions.appendChild(viewButton);

    item.appendChild(avatarWrap);
    item.appendChild(info);
    item.appendChild(actions);

    return item;
}

function openSearchResultsModal(players, searchText = '') {
    const { modal, titleText, list, summary, empty } = getSearchResultsModalElements();
    if (!modal || !list || !summary || !empty) {
        throw new Error('A keresési találatok modal elemei nem találhatók a DOM-ban.');
    }

    if (titleText) {
        const normalizedSearchText = String(searchText || '').trim();
        titleText.textContent = normalizedSearchText
            ? `Keresési találatok: "${normalizedSearchText}"`
            : 'Keresési találatok';
    }

    list.innerHTML = '';
    const normalizedPlayers = Array.isArray(players) ? players : [];

    if (!normalizedPlayers.length) {
        summary.textContent = 'A keresés nem adott találatot.';
        empty.classList.remove('d-none');
        list.classList.add('d-none');
    } else {
        summary.textContent = `${normalizedPlayers.length} találat a keresésre.`;
        empty.classList.add('d-none');
        list.classList.remove('d-none');
        normalizedPlayers.forEach((player) => {
            list.appendChild(createSearchResultListItem(player));
        });
    }

    const modalInstance = bootstrap.Modal.getOrCreateInstance(modal);
    modalInstance.show();
    validatePlayerSearchElements(getModalPlayerSearchElements());
    lucide.createIcons();
}

function bindSearchResultsModalEvents() {
    const { modal, list } = getSearchResultsModalElements();
    const { input: modalInput } = getModalPlayerSearchElements();
    if (!modal || !modalInput || !list) {
        throw new Error('A keresési modal eseménykezelő elemei nem találhatók.');
    }

    modal.addEventListener('shown.bs.modal', () => {
        modalInput.focus();
        modalInput.select();
    });

    list.addEventListener('click', (event) => {
        try {
            const actionButton = event.target.closest('button[data-action]');
            if (!actionButton) {
                return;
            }

            const userId = Number(actionButton.dataset.userId);
            const username = String(actionButton.dataset.username || '').trim();
            const action = actionButton.dataset.action;

            if (!userId && action !== 'pending-friend' && action !== 'accepted-friend' && action !== 'blocked-friend') {
                if (action === 'add-friend' || action === 'view-profile' || action === 'chat') {
                    throw new Error('Hiányzó userId a keresési találat akciónál.');
                }
            }

            if (action === 'add-friend') {
                runSafelyAsync('searchResultAddFriend', async () => {
                    try {
                        const response = await fetch('/api/friends/add', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ targetUserId: userId })
                        });

                        const result = await parseJson(response);
                        if (!response.ok || !result.success) {
                            throw new Error(result.message || 'Nem sikerült a barát kérelem küldése.');
                        }

                        // Gomb frissítése pending státuszra
                        actionButton.dataset.action = 'pending-friend';
                        actionButton.className = 'btn btn-sm btn-outline-warning py-1 px-2';
                        actionButton.title = 'Barát kérelem: elküldve';
                        actionButton.innerHTML = '<i data-lucide="arrow-up-right" style="width: 16px; height: 16px;"></i>';
                        lucide.createIcons();

                        console.log('Barát kérelem elküldve:', { userId, username });
                    } catch (error) {
                        console.error('Barát kérelem hiba:', error);
                        throw error;
                    }
                });
            } else if (action === 'view-profile') {
                console.log('View profile action payload:', { userId, username });
            } else if (action === 'chat') {
                console.log('Chat action payload:', { userId, username });
            } else if (action === 'pending-friend' || action === 'accepted-friend' || action === 'blocked-friend') {
                // Ezek az akciók nem interaktívak, vagy később implementálandók
                return;
            }
        } catch (error) {
            console.error('Keresési találat akció hiba:', error);
        }
    });
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

        if (socket) {
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
            runSafelyAsync('logoutButtonClick', async () => {
                event.preventDefault();
                await handleLogout();
            });
        });
    });
}

function getTopBarPlayerSearchElements() {
    return {
        input: document.getElementById('playerSearchInput'),
        button: document.getElementById('playerSearchButton'),
        feedback: document.getElementById('playerSearchFeedback')
    };
}

function validatePlayerSearchElements(elements) {
    const { input, button, feedback } = elements || {};
    if (!input || !button || !feedback) {
        return false;
    }

    const value = (input.value || '').trim();
    const hasValue = value.length > 0;
    let errorMessage = '';

    if (hasValue && (value.length < 3 || value.length > 50)) {
        errorMessage = 'A keresett felhasználónévnek 3 és 50 karakter között kell lennie.';
    } else if (hasValue && !USERNAME_REGEX.test(value)) {
        errorMessage = 'A keresett felhasználónév formátuma érvénytelen.';
    }

    const isValid = hasValue && !errorMessage;
    button.disabled = !isValid;

    input.classList.remove('is-valid', 'is-invalid');
    feedback.classList.remove('text-danger', 'text-success');
    if (!hasValue) {
        input.removeAttribute('aria-invalid');
        feedback.textContent = '';
        input.title = 'Adj meg legalább 3 karakteres felhasználónevet a kereséshez.';
        button.title = 'Adj meg felhasználónevet a kereséshez.';
    } else if (errorMessage) {
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
        feedback.classList.add('text-danger');
        feedback.textContent = errorMessage;
        input.title = errorMessage;
        button.title = errorMessage;
    } else {
        input.classList.add('is-valid');
        input.removeAttribute('aria-invalid');
        feedback.classList.add('text-success');
        feedback.textContent = 'A felhasználónév formátuma megfelelő.';
        input.title = 'A formátum megfelelő, indítható a keresés.';
        button.title = 'Keresés';
    }

    return isValid;
}

function bindPlayerSearchValidation(source, getElements) {
    const elements = getElements();
    const { input, button } = elements;
    if (!input || !button) {
        throw new Error(`Hianyzik a kereso input vagy gomb (${source}).`);
    }

    const validate = () => {
        return validatePlayerSearchElements(elements);
    };

    input.addEventListener('input', () => {
        runSafely('playerSearchInput', () => {
            validate();
        });
    });
    input.addEventListener('blur', () => {
        runSafely('playerSearchBlur', () => {
            validate();
        });
    });

    button.addEventListener('click', () => {
        runSafely('playerSearchClick', () => {
            if (!button.disabled) {
                schedulePlayerSearch(source, 0);
            }
        });
    });

    input.addEventListener('keydown', (event) => {
        runSafely('playerSearchKeydown', () => {
            if (event.key === 'Enter') {
                event.preventDefault();
            }
        });
    });

    runSafely('playerSearchInitialValidate', () => {
        validate();
    });
}

function bindTopBarPlayerSearchValidation() {
    bindPlayerSearchValidation('topbar', getTopBarPlayerSearchElements);
}

function bindModalPlayerSearchValidation() {
    bindPlayerSearchValidation('modal', getModalPlayerSearchElements);
}

function getProfileImageStatusMeta(statusInput) {
    const normalizedStatus = String(statusInput || '').trim().toLowerCase() || 'approved';

    if (normalizedStatus === 'pending') {
        return {
            normalizedStatus,
            textClass: 'text-warning',
            label: 'Függő (elbírálásra vár)'
        };
    }

    if (normalizedStatus === 'rejected') {
        return {
            normalizedStatus,
            textClass: 'text-danger',
            label: 'Elutasított'
        };
    }

    if (normalizedStatus === 'default') {
        return {
            normalizedStatus,
            textClass: 'text-info',
            label: 'Alapértelmezett'
        };
    }

    return {
        normalizedStatus: 'approved',
        textClass: 'text-success',
        label: 'Jóváhagyott'
    };
}

function applyProfileImagePresentation(user) {
    const profileImagePath = (user?.profile_image || '').trim() || '/profile_pictures/default.png';
    const username = user?.username || 'Felhasznalo';
    const statusMeta = getProfileImageStatusMeta(user?.profile_image_status);
    const normalizedImagePath = profileImagePath.toLowerCase();
    const isPending = statusMeta.normalizedStatus === 'pending' && normalizedImagePath !== '/profile_pictures/default.png';
    const isDefault = normalizedImagePath === '/profile_pictures/default.png';

    const avatars = [
        document.getElementById('profileAvatarDashboard'),
        document.getElementById('profileAvatarSettings')
    ].filter(Boolean);

    avatars.forEach((avatarElement) => {
        avatarElement.src = profileImagePath;
        avatarElement.alt = `${username} profilkepe`;
        avatarElement.classList.toggle('profile-image-pending', isPending);
    });

    const statusElements = [
        document.getElementById('profileImageHeaderStatus'),
        document.getElementById('profileImageSettingsStatus')
    ].filter(Boolean);

    statusElements.forEach((statusElement) => {
        statusElement.classList.remove('text-secondary', 'text-success', 'text-warning', 'text-danger', 'text-info');
        statusElement.classList.add(statusMeta.textClass);
        statusElement.textContent = `Profilkép státusz: ${statusMeta.label}`;
    });

    // Remove gomb letiltása, ha a kép az alapértelmezett
    const removeButton = document.getElementById('removeAvatarButton');
    if (removeButton) {
        removeButton.disabled = isDefault;
        removeButton.title = isDefault ? 'Nem lehet eltávolítani az alapértelmezett képet' : 'Profilkép eltávolítása';
    }
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

        applyProfileImagePresentation(user);

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
        applyProfileImagePresentation(user);

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
    try {
        const elements = getProfileSettingsElements();
        if (!elements.form) {
            throw new Error('Hianyzik a profile settings form.');
        }

        const onInputChange = () => {
            runSafely('profileSettingsOnInputChange', () => {
                validateProfileSettingsForm();
            });
        };

        [elements.usernameInput, elements.emailInput, elements.newPasswordInput, elements.confirmPasswordInput]
            .filter(Boolean)
            .forEach((element) => {
                element.addEventListener('input', onInputChange);
                element.addEventListener('blur', onInputChange);
            });

        elements.form.addEventListener('submit', (event) => {
            runSafely('profileSettingsSubmit', () => {
                event.preventDefault();

                const validation = validateProfileSettingsForm();
                if (!validation.isValid) {
                    throw new Error('Ervenytelen profile settings form.');
                }

                profileSettingsState.pendingPayload = validation.payload;
                openProfileSettingsConfirmModal(validation.changedFieldLabels);
            });
        });

        if (elements.confirmSaveButton) {
            elements.confirmSaveButton.addEventListener('click', async () => {
                await runSafelyAsync('profileSettingsConfirmSave', async () => {
                    await submitProfileSettingsChanges();
                });
            });
        }

        if (elements.modalCurrentPasswordInput) {
            elements.modalCurrentPasswordInput.addEventListener('input', () => {
                runSafely('profileSettingsModalPasswordInput', () => {
                    verifyModalCurrentPassword();
                });
            });

            elements.modalCurrentPasswordInput.addEventListener('blur', () => {
                runSafely('profileSettingsModalPasswordBlur', () => {
                    verifyModalCurrentPassword();
                });
            });
        }

        if (elements.confirmModal) {
            elements.confirmModal.addEventListener('hidden.bs.modal', () => {
                runSafely('profileSettingsModalHidden', () => {
                    profileSettingsState.pendingPayload = null;
                    profileSettingsState.passwordVerified = false;
                    profileSettingsState.requiresPasswordCheck = false;
                    resetProfileSettingsConfirmState();
                });
            });
        }
    } catch (error) {
        console.error('bindProfileSettingsEvents hiba:', error);
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
        changesList: document.getElementById('profileSettingsChangesList'),
        modalMessage: document.getElementById('profileSettingsModalMessage'),
        modalPasswordBlock: document.getElementById('profileSettingsModalPasswordBlock'),
        modalCurrentPasswordInput: document.getElementById('modalCurrentPassword'),
        modalCurrentPasswordFeedback: document.getElementById('modalCurrentPasswordFeedback')
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
    const { formMessage, modalMessage } = getProfileSettingsElements();
    const messageTargets = [formMessage, modalMessage].filter(Boolean);
    if (!messageTargets.length) {
        return;
    }

    if (!message) {
        messageTargets.forEach((target) => {
            target.className = 'alert d-none mb-0';
            target.textContent = '';
        });
        return;
    }

    messageTargets.forEach((target) => {
        target.className = `alert alert-${type} mb-0`;
        target.textContent = message;
    });
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
    if (!values.username) {
        fieldErrors.username = 'A felhasználónév kötelező.';
    } else if (values.username.length < 3 || values.username.length > 50) {
        fieldErrors.username = 'A felhasználónévnek 3 és 50 karakter között kell lennie.';
    } else if (!USERNAME_REGEX.test(values.username)) {
        fieldErrors.username = 'A felhasználónév formátuma érvénytelen.';
    }

    if (!values.email) {
        fieldErrors.email = 'Az e-mail cím kötelező.';
    } else if (!EMAIL_REGEX.test(values.email)) {
        fieldErrors.email = 'Érvénytelen e-mail formátum.';
    }

    if (values.confirmPassword && !values.newPassword) {
        fieldErrors.newPassword = 'Adj meg új jelszót is.';
    }

    if (values.newPassword) {
        if (values.newPassword.includes('\\')) {
            fieldErrors.newPassword = 'A jelszó nem megengedett karaktert tartalmaz.';
        } else if (values.newPassword.length < 8) {
            fieldErrors.newPassword = 'A jelszónak legalább 8 karakter hosszú kell legyen.';
        } else if (!PASSWORD_REGEX.test(values.newPassword)) {
            fieldErrors.newPassword = 'A jelszónak tartalmaznia kell nagybetűt, kisbetűt és számot.';
        }
    }

    if (values.newPassword || values.confirmPassword) {
        if (!values.confirmPassword) {
            fieldErrors.confirmPassword = 'Erősítsd meg az új jelszót.';
        } else if (values.newPassword !== values.confirmPassword) {
            fieldErrors.confirmPassword = 'A két jelszó nem egyezik.';
        }
    }

    const hasFieldError = Object.values(fieldErrors).some(Boolean);
    const hasAnyChange = hasUsernameChanged || hasEmailChanged || values.newPassword.length > 0;
    const isValid = !hasFieldError && hasAnyChange;

    applyInputFeedback(
        elements.usernameInput,
        elements.usernameFeedback,
        fieldErrors.username ? 'error' : (hasUsernameChanged ? 'success' : 'neutral'),
        fieldErrors.username || (hasUsernameChanged ? 'A felhasználónév módosításra kerül.' : 'Nincs változás.')
    );

    applyInputFeedback(
        elements.emailInput,
        elements.emailFeedback,
        fieldErrors.email ? 'error' : (hasEmailChanged ? 'success' : 'neutral'),
        fieldErrors.email || (hasEmailChanged ? 'Az e-mail cím módosításra kerül.' : 'Nincs változás.')
    );

    applyInputFeedback(
        elements.newPasswordInput,
        elements.newPasswordFeedback,
        fieldErrors.newPassword ? 'error' : (values.newPassword ? 'success' : 'neutral'),
        fieldErrors.newPassword || (values.newPassword ? 'Az új jelszó formátuma megfelelő.' : 'A jelszó nem változik.')
    );

    applyInputFeedback(
        elements.confirmPasswordInput,
        elements.confirmPasswordFeedback,
        fieldErrors.confirmPassword ? 'error' : (values.confirmPassword ? 'success' : 'neutral'),
        fieldErrors.confirmPassword || (values.confirmPassword ? 'A jelszó megerősítése rendben.' : 'Megerősítés nem szükséges.')
    );

    if (elements.saveButton) {
        elements.saveButton.disabled = !isValid;
    }

    if (hasFieldError) {
        const firstError = Object.values(fieldErrors).find(Boolean);
        setProfileSettingsMessage('danger', firstError || 'Ellenőrizd a mezőket.');
    } else if (!hasAnyChange) {
        setProfileSettingsMessage('warning', 'Nincs változás. Módosíts legalább egy mezőt a mentéshez.');
    } else {
        setProfileSettingsMessage('success', 'Minden rendben, mentésre kész.');
    }

    const changedFieldLabels = [];
    if (hasUsernameChanged) {
        changedFieldLabels.push(`Felhasználónév: ${profileSettingsState.initial.username} -> ${values.username}`);
    }
    if (hasEmailChanged) {
        changedFieldLabels.push(`Email: ${profileSettingsState.initial.email} -> ${values.email}`);
    }
    if (values.newPassword) {
        changedFieldLabels.push('Jelszó frissítésre kerül.');
    }

    const payload = isValid ? {
        username: values.username,
        email: values.email,
        newPassword: values.newPassword
    } : null;

    return { isValid, payload, changedFieldLabels };
}

function resetProfileSettingsConfirmState() {
    const elements = getProfileSettingsElements();
    if (profileSettingsState.countdownTimer) {
        clearInterval(profileSettingsState.countdownTimer);
        profileSettingsState.countdownTimer = null;
    }

    profileSettingsState.countdownLeft = PROFILE_SETTINGS_CONFIRM_SECONDS;
    profileSettingsState.countdownFinished = false;

    if (elements.confirmSaveButton) {
        elements.confirmSaveButton.disabled = true;
        elements.confirmSaveButton.textContent = `Mentes (${PROFILE_SETTINGS_CONFIRM_SECONDS}s)`;
    }

    if (elements.confirmHint) {
        elements.confirmHint.textContent = `A mentés gomb ${PROFILE_SETTINGS_CONFIRM_SECONDS} másodperc múlva lesz aktív.`;
    }

    if (elements.modalCurrentPasswordInput) {
        elements.modalCurrentPasswordInput.value = '';
    }

    setModalCurrentPasswordFeedback('neutral', '');

}

function openProfileSettingsConfirmModal(changedFieldLabels) {
    const elements = getProfileSettingsElements();
    if (!elements.confirmModal || !elements.changesList) {
        return;
    }

    profileSettingsState.requiresPasswordCheck = true;
    profileSettingsState.passwordVerified = !profileSettingsState.requiresPasswordCheck;

    elements.changesList.innerHTML = '';
    changedFieldLabels.forEach((label) => {
        const item = document.createElement('li');
        item.className = 'text-light mb-1';
        item.textContent = label;
        elements.changesList.appendChild(item);
    });

    resetProfileSettingsConfirmState();

    if (elements.modalPasswordBlock) {
        elements.modalPasswordBlock.classList.remove('d-none');
    }

    if (profileSettingsState.requiresPasswordCheck) {
        setModalCurrentPasswordFeedback('neutral', 'A mentéshez add meg a jelenlegi jelszavad.');
    }

    const modal = bootstrap.Modal.getOrCreateInstance(elements.confirmModal);
    modal.show();

    profileSettingsState.countdownTimer = setInterval(() => {
        profileSettingsState.countdownLeft -= 1;

        if (elements.confirmSaveButton) {
            if (profileSettingsState.countdownLeft > 0) {
                elements.confirmSaveButton.textContent = `Mentes (${profileSettingsState.countdownLeft}s)`;
            } else {
                profileSettingsState.countdownFinished = true;
                elements.confirmSaveButton.textContent = 'Mentes';
                updateModalSaveButtonState();
            }
        }

        if (elements.confirmHint) {
            elements.confirmHint.textContent = profileSettingsState.countdownLeft > 0
                ? `A mentés gomb ${profileSettingsState.countdownLeft} másodperc múlva lesz aktív.`
                : 'A mentés gomb most már aktív.';
        }

        if (profileSettingsState.countdownLeft <= 0) {
            clearInterval(profileSettingsState.countdownTimer);
            profileSettingsState.countdownTimer = null;
        }
    }, 1000);
}

function setModalCurrentPasswordFeedback(state, message) {
    const { modalCurrentPasswordInput, modalCurrentPasswordFeedback } = getProfileSettingsElements();
    if (!modalCurrentPasswordInput || !modalCurrentPasswordFeedback) {
        return;
    }

    modalCurrentPasswordInput.classList.remove('is-valid', 'is-invalid');
    modalCurrentPasswordFeedback.classList.remove('text-secondary', 'text-success', 'text-danger');
    modalCurrentPasswordFeedback.textContent = message;

    if (state === 'success') {
        modalCurrentPasswordInput.classList.add('is-valid');
        modalCurrentPasswordFeedback.classList.add('text-success');
    } else if (state === 'error') {
        modalCurrentPasswordInput.classList.add('is-invalid');
        modalCurrentPasswordFeedback.classList.add('text-danger');
    } else {
        modalCurrentPasswordFeedback.classList.add('text-secondary');
    }
}

function updateModalSaveButtonState() {
    const { confirmSaveButton } = getProfileSettingsElements();
    if (!confirmSaveButton) {
        return;
    }

    const readyByPassword = profileSettingsState.requiresPasswordCheck ? profileSettingsState.passwordVerified : true;
    confirmSaveButton.disabled = !(profileSettingsState.countdownFinished && readyByPassword);
}

function verifyModalCurrentPassword() {
    const elements = getProfileSettingsElements();
    if (!profileSettingsState.requiresPasswordCheck || !elements.modalCurrentPasswordInput) {
        return;
    }

    const currentPassword = elements.modalCurrentPasswordInput.value;
    if (!currentPassword) {
        profileSettingsState.passwordVerified = false;
        setModalCurrentPasswordFeedback('error', 'A jelenlegi jelszó kötelező.');
        updateModalSaveButtonState();
        return;
    }

    if (currentPassword.includes('\\')) {
        profileSettingsState.passwordVerified = false;
        setModalCurrentPasswordFeedback('error', 'A jelszó nem megengedett karaktert tartalmaz.');
        updateModalSaveButtonState();
        return;
    }

    if (currentPassword.length < 8) {
        profileSettingsState.passwordVerified = false;
        setModalCurrentPasswordFeedback('error', 'A jelszónak legalább 8 karakter hosszú kell legyen.');
        updateModalSaveButtonState();
        return;
    }

    if (!PASSWORD_REGEX.test(currentPassword)) {
        profileSettingsState.passwordVerified = false;
        setModalCurrentPasswordFeedback('error', 'A jelszónak tartalmaznia kell nagybetűt, kisbetűt és számot.');
        updateModalSaveButtonState();
        return;
    }

    profileSettingsState.passwordVerified = true;
    setModalCurrentPasswordFeedback('success', 'A jelszó formátuma megfelelő.');
    updateModalSaveButtonState();
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
            body: JSON.stringify({
                ...profileSettingsState.pendingPayload,
                currentPassword: elements.modalCurrentPasswordInput?.value || ''
            })
        });

        const result = await parseJson(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Nem sikerült menteni a profil beállításokat.');
        }

        setProfileSettingsMessage('success', result.message || 'A profil beállítások sikeresen frissültek.');
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

        await syncSocketContextOrReconnect('profile-settings-save');
        await refreshAuthUi('profile-settings-save-success');
    } catch (error) {
        setProfileSettingsMessage('danger', error.message || 'Hiba történt a mentés során.');
        elements.confirmSaveButton.textContent = 'Mentes';
        updateModalSaveButtonState();
        throw new Error(error.message || 'Profil beállítás mentési hiba.');
    }
}

function getProfileDeleteElements() {
    return {
        modal: document.getElementById('deleteProfileModal'),
        passwordInput: document.getElementById('deleteProfileConfirmInput'),
        passwordFeedback: document.getElementById('deleteProfileConfirmFeedback'),
        acknowledgeCheckbox: document.getElementById('deleteProfileAcknowledge'),
        confirmButton: document.getElementById('confirmDeleteProfileBtn'),
        timer: document.getElementById('deleteTimer'),
        message: document.getElementById('deleteProfileMessage')
    };
}

function setDeleteProfileMessage(type, message) {
    const { message: messageElement } = getProfileDeleteElements();
    if (!messageElement) {
        return;
    }

    if (!message) {
        messageElement.className = 'alert d-none mt-3 mb-0';
        messageElement.textContent = '';
        return;
    }

    messageElement.className = `alert alert-${type} mt-3 mb-0`;
    messageElement.textContent = message;
}

function setDeleteProfilePasswordFeedback(state, message) {
    const { passwordInput, passwordFeedback } = getProfileDeleteElements();
    if (!passwordInput || !passwordFeedback) {
        return;
    }

    passwordInput.classList.remove('is-valid', 'is-invalid');
    passwordFeedback.classList.remove('text-secondary', 'text-success', 'text-danger');
    passwordFeedback.textContent = message;

    if (state === 'error') {
        passwordInput.classList.add('is-invalid');
        passwordFeedback.classList.add('text-danger');
    } else if (state === 'success') {
        passwordInput.classList.add('is-valid');
        passwordFeedback.classList.add('text-success');
    } else {
        passwordFeedback.classList.add('text-secondary');
    }
}

function validateDeleteProfilePassword(password) {
    if (!password) {
        return 'A jelenlegi jelszó kötelező.';
    }
    if (password.includes('\\')) {
        return 'A jelszó nem megengedett karaktert tartalmaz.';
    }
    if (password.length < 8) {
        return 'A jelszónak legalább 8 karakter hosszú kell legyen.';
    }
    if (!PASSWORD_REGEX.test(password)) {
        return 'A jelszónak tartalmaznia kell nagybetűt, kisbetűt és számot.';
    }
    return '';
}

function updateDeleteProfileConfirmButtonState() {
    const elements = getProfileDeleteElements();
    if (!elements.confirmButton || !elements.passwordInput || !elements.acknowledgeCheckbox) {
        return;
    }

    const password = elements.passwordInput.value || '';
    const passwordError = validateDeleteProfilePassword(password);
    const acknowledged = elements.acknowledgeCheckbox.checked;

    if (!password) {
        setDeleteProfilePasswordFeedback('neutral', 'A törléshez add meg a jelenlegi jelszavad.');
    } else if (passwordError) {
        setDeleteProfilePasswordFeedback('error', passwordError);
    } else {
        setDeleteProfilePasswordFeedback('success', 'A jelszó formátuma megfelelő.');
    }

    const canSubmit = profileDeleteState.countdownFinished
        && !profileDeleteState.submitting
        && acknowledged
        && password.length > 0
        && !passwordError;

    elements.confirmButton.disabled = !canSubmit;
}

function resetDeleteProfileModalState() {
    const elements = getProfileDeleteElements();

    if (profileDeleteState.countdownTimer) {
        clearInterval(profileDeleteState.countdownTimer);
        profileDeleteState.countdownTimer = null;
    }

    profileDeleteState.countdownLeft = PROFILE_DELETE_CONFIRM_SECONDS;
    profileDeleteState.countdownFinished = false;
    profileDeleteState.submitting = false;

    if (elements.passwordInput) {
        elements.passwordInput.value = '';
    }

    if (elements.acknowledgeCheckbox) {
        elements.acknowledgeCheckbox.checked = false;
    }

    if (elements.confirmButton) {
        elements.confirmButton.innerHTML = `Törlés (<span id="deleteTimer">${PROFILE_DELETE_CONFIRM_SECONDS}</span>s)`;
        elements.confirmButton.disabled = true;
    }

    setDeleteProfileMessage('danger', '');
    setDeleteProfilePasswordFeedback('neutral', 'A törléshez add meg a jelenlegi jelszavad.');
}

function startDeleteProfileCountdown() {
    const elements = getProfileDeleteElements();
    if (!elements.confirmButton) {
        return;
    }

    if (profileDeleteState.countdownTimer) {
        clearInterval(profileDeleteState.countdownTimer);
    }

    profileDeleteState.countdownTimer = setInterval(() => {
        profileDeleteState.countdownLeft -= 1;

        const { timer } = getProfileDeleteElements();
        if (timer) {
            timer.textContent = String(Math.max(profileDeleteState.countdownLeft, 0));
        }

        if (profileDeleteState.countdownLeft <= 0) {
            profileDeleteState.countdownFinished = true;
            clearInterval(profileDeleteState.countdownTimer);
            profileDeleteState.countdownTimer = null;
            elements.confirmButton.textContent = 'Törlés';
        }

        updateDeleteProfileConfirmButtonState();
    }, 1000);
}

async function submitDeleteProfile() {
    const elements = getProfileDeleteElements();
    if (!elements.passwordInput || !elements.acknowledgeCheckbox || !elements.confirmButton) {
        return;
    }

    const currentPassword = elements.passwordInput.value || '';
    const passwordError = validateDeleteProfilePassword(currentPassword);
    if (passwordError) {
        setDeleteProfilePasswordFeedback('error', passwordError);
        updateDeleteProfileConfirmButtonState();
        return;
    }

    if (!elements.acknowledgeCheckbox.checked) {
        setDeleteProfileMessage('danger', 'Fogadd el, hogy a törlés nem visszavonható.');
        updateDeleteProfileConfirmButtonState();
        return;
    }

    profileDeleteState.submitting = true;
    elements.confirmButton.disabled = true;
    elements.confirmButton.textContent = 'Törlés folyamatban...';
    setDeleteProfileMessage('danger', '');

    try {
        const response = await fetch('/api/profile/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword })
        });

        const result = await parseJson(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'A profil törlése nem sikerült.');
        }

        if (elements.modal) {
            const modal = bootstrap.Modal.getOrCreateInstance(elements.modal);
            modal.hide();
        }

        if (socket) {
            socket.disconnect();
        }

        await refreshAuthUi('profile-delete-success');
        window.location.href = '/';
    } catch (error) {
        profileDeleteState.submitting = false;
        setDeleteProfileMessage('danger', error.message || 'Hiba történt a profil törlése közben.');
        updateDeleteProfileConfirmButtonState();
        throw new Error(error.message || 'Profil törlési hiba.');
    }
}

function bindProfileDeleteModalEvents() {
    try {
        const elements = getProfileDeleteElements();
        if (!elements.modal) {
            throw new Error('Hianyzik a delete profile modal.');
        }

        if (profileDeleteState.bound) {
            throw new Error('A delete profile esemenyek mar be vannak kotve.');
        }

        profileDeleteState.bound = true;

        if (elements.passwordInput) {
            elements.passwordInput.addEventListener('input', () => {
                runSafely('deleteProfilePasswordInput', () => {
                    setDeleteProfileMessage('danger', '');
                    updateDeleteProfileConfirmButtonState();
                });
            });

            elements.passwordInput.addEventListener('blur', () => {
                runSafely('deleteProfilePasswordBlur', () => {
                    updateDeleteProfileConfirmButtonState();
                });
            });
        }

        if (elements.acknowledgeCheckbox) {
            elements.acknowledgeCheckbox.addEventListener('change', () => {
                runSafely('deleteProfileAcknowledgeChange', () => {
                    setDeleteProfileMessage('danger', '');
                    updateDeleteProfileConfirmButtonState();
                });
            });
        }

        if (elements.confirmButton) {
            elements.confirmButton.addEventListener('click', async () => {
                await runSafelyAsync('deleteProfileConfirmClick', async () => {
                    await submitDeleteProfile();
                });
            });
        }

        elements.modal.addEventListener('show.bs.modal', () => {
            runSafely('deleteProfileModalShow', () => {
                resetDeleteProfileModalState();
                startDeleteProfileCountdown();
            });
        });

        elements.modal.addEventListener('hidden.bs.modal', () => {
            runSafely('deleteProfileModalHidden', () => {
                resetDeleteProfileModalState();
            });
        });
    } catch (error) {
        console.error('bindProfileDeleteModalEvents hiba:', error);
    }
}

function getProfileImageEditorElements() {
    return {
        uploadInput: document.getElementById('avatarUpload'),
        modal: document.getElementById('profileImageEditorModal'),
        canvas: document.getElementById('profileImageEditorCanvas'),
        previewCanvas: document.getElementById('profileImageEditorPreview'),
        zoomInput: document.getElementById('profileImageZoom'),
        rotateInput: document.getElementById('profileImageRotate'),
        resetButton: document.getElementById('resetProfileImageEditor'),
        saveButton: document.getElementById('saveProfileImageButton'),
        message: document.getElementById('profileImageEditorMessage')
    };
}

function setProfileImageEditorMessage(type, message) {
    const { message: messageElement } = getProfileImageEditorElements();
    if (!messageElement) {
        return;
    }

    if (!message) {
        messageElement.className = 'alert d-none mt-3 mb-0';
        messageElement.textContent = '';
        return;
    }

    messageElement.className = `alert alert-${type} mt-3 mb-0`;
    messageElement.textContent = message;
}

function resetProfileImageEditorState() {
    const elements = getProfileImageEditorElements();
    profileImageEditorState.scale = 1;
    profileImageEditorState.rotationDeg = 0;
    profileImageEditorState.offsetX = 0;
    profileImageEditorState.offsetY = 0;
    profileImageEditorState.dragging = false;
    profileImageEditorState.lastPointerX = 0;
    profileImageEditorState.lastPointerY = 0;
    profileImageEditorState.uploading = false;

    if (elements.zoomInput) {
        elements.zoomInput.value = '1';
    }

    if (elements.rotateInput) {
        elements.rotateInput.value = '0';
    }

    if (elements.saveButton) {
        elements.saveButton.disabled = !profileImageEditorState.image;
        elements.saveButton.textContent = 'Mentés';
    }

    setProfileImageEditorMessage('danger', '');
}

function revokeProfileImageObjectUrl() {
    if (profileImageEditorState.objectUrl) {
        URL.revokeObjectURL(profileImageEditorState.objectUrl);
        profileImageEditorState.objectUrl = null;
    }
}

function clearProfileImageEditorImage() {
    profileImageEditorState.image = null;
    revokeProfileImageObjectUrl();
    resetProfileImageEditorState();
    renderProfileImageEditor();
}

function getEditorCropRadius(canvas) {
    return Math.min(canvas.width, canvas.height) * 0.32;
}

function drawTransformedImage(ctx, image, canvasWidth, canvasHeight) {
    ctx.save();
    ctx.translate(canvasWidth / 2 + profileImageEditorState.offsetX, canvasHeight / 2 + profileImageEditorState.offsetY);
    ctx.rotate((profileImageEditorState.rotationDeg * Math.PI) / 180);
    ctx.scale(profileImageEditorState.scale, profileImageEditorState.scale);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
}

function renderProfileImageEditor() {
    const elements = getProfileImageEditorElements();
    if (!elements.canvas || !elements.previewCanvas) {
        return;
    }

    const canvas = elements.canvas;
    const previewCanvas = elements.previewCanvas;
    const rect = canvas.getBoundingClientRect();
    const nextWidth = Math.max(320, Math.round(rect.width || 640));
    const nextHeight = Math.max(260, Math.round(rect.height || 340));

    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        canvas.width = nextWidth;
        canvas.height = nextHeight;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const image = profileImageEditorState.image;
    if (!image) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.font = '15px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Válassz egy képet a szerkesztéshez.', canvas.width / 2, canvas.height / 2);
        return;
    }

    const cropRadius = getEditorCropRadius(canvas);
    drawTransformedImage(ctx, image, canvas.width, canvas.height);

    ctx.save();
    ctx.fillStyle = 'rgba(2, 6, 23, 0.58)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, cropRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, cropRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const bufferCanvas = profileImageEditorState.bufferCanvas;
    bufferCanvas.width = canvas.width;
    bufferCanvas.height = canvas.height;
    const bufferCtx = bufferCanvas.getContext('2d');
    if (!bufferCtx) {
        return;
    }
    bufferCtx.clearRect(0, 0, bufferCanvas.width, bufferCanvas.height);
    drawTransformedImage(bufferCtx, image, bufferCanvas.width, bufferCanvas.height);

    const previewCtx = previewCanvas.getContext('2d');
    if (!previewCtx) {
        return;
    }

    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.save();
    previewCtx.beginPath();
    previewCtx.arc(previewCanvas.width / 2, previewCanvas.height / 2, previewCanvas.width / 2, 0, Math.PI * 2);
    previewCtx.clip();
    previewCtx.drawImage(
        bufferCanvas,
        canvas.width / 2 - cropRadius,
        canvas.height / 2 - cropRadius,
        cropRadius * 2,
        cropRadius * 2,
        0,
        0,
        previewCanvas.width,
        previewCanvas.height
    );
    previewCtx.restore();
}

function bindProfileImageEditorCanvasEvents() {
    const { canvas } = getProfileImageEditorElements();
    if (!canvas) {
        return;
    }

    canvas.addEventListener('pointerdown', (event) => {
        if (!profileImageEditorState.image || profileImageEditorState.uploading) {
            return;
        }

        profileImageEditorState.dragging = true;
        profileImageEditorState.lastPointerX = event.clientX;
        profileImageEditorState.lastPointerY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
        if (!profileImageEditorState.dragging || !profileImageEditorState.image || profileImageEditorState.uploading) {
            return;
        }

        const deltaX = event.clientX - profileImageEditorState.lastPointerX;
        const deltaY = event.clientY - profileImageEditorState.lastPointerY;

        profileImageEditorState.lastPointerX = event.clientX;
        profileImageEditorState.lastPointerY = event.clientY;
        profileImageEditorState.offsetX += deltaX;
        profileImageEditorState.offsetY += deltaY;
        renderProfileImageEditor();
    });

    const stopDragging = (event) => {
        if (profileImageEditorState.dragging) {
            profileImageEditorState.dragging = false;
            if (typeof event.pointerId === 'number') {
                canvas.releasePointerCapture(event.pointerId);
            }
        }
    };

    canvas.addEventListener('pointerup', stopDragging);
    canvas.addEventListener('pointercancel', stopDragging);
    canvas.addEventListener('pointerleave', stopDragging);
}

function validateProfileImageFile(file) {
    if (!file) {
        return 'A kép kiválasztása kötelező.';
    }

    if (!PROFILE_IMAGE_ALLOWED_MIME_TYPES.has(file.type)) {
        return 'Nem támogatott képformátum. Csak JPG, PNG és WEBP engedélyezett.';
    }

    if (file.size > PROFILE_IMAGE_MAX_SIZE_BYTES) {
        return 'A kép mérete legfeljebb 3 MB lehet.';
    }

    return '';
}

async function openProfileImageEditorFromFile(file) {
    const elements = getProfileImageEditorElements();
    if (!elements.modal) {
        return;
    }

    revokeProfileImageObjectUrl();
    profileImageEditorState.objectUrl = URL.createObjectURL(file);

    const image = new Image();
    image.src = profileImageEditorState.objectUrl;

    await new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('A kép betöltése sikertelen.'));
    });

    profileImageEditorState.image = image;
    resetProfileImageEditorState();

    const modal = bootstrap.Modal.getOrCreateInstance(elements.modal);
    modal.show();
    setTimeout(() => renderProfileImageEditor(), 0);
}

function getCroppedProfileImageBlob() {
    const { canvas } = getProfileImageEditorElements();
    const image = profileImageEditorState.image;
    if (!canvas || !image) {
        return Promise.reject(new Error('Nincs szerkesztésre kiválasztott kép.'));
    }

    const cropRadius = getEditorCropRadius(canvas);
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = 512;
    outputCanvas.height = 512;
    const outputCtx = outputCanvas.getContext('2d');
    if (!outputCtx) {
        return Promise.reject(new Error('Nem sikerült előkészíteni a kép mentését.'));
    }

    outputCtx.drawImage(
        profileImageEditorState.bufferCanvas,
        canvas.width / 2 - cropRadius,
        canvas.height / 2 - cropRadius,
        cropRadius * 2,
        cropRadius * 2,
        0,
        0,
        outputCanvas.width,
        outputCanvas.height
    );

    return new Promise((resolve, reject) => {
        outputCanvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('A kép mentése sikertelen.'));
                return;
            }

            resolve(blob);
        }, 'image/png');
    });
}

async function submitProfileImageUpload() {
    const elements = getProfileImageEditorElements();
    if (!elements.saveButton || profileImageEditorState.uploading) {
        return;
    }

    if (!profileImageEditorState.image) {
        setProfileImageEditorMessage('danger', 'Nincs szerkesztésre kiválasztott kép.');
        return;
    }

    profileImageEditorState.uploading = true;
    elements.saveButton.disabled = true;
    elements.saveButton.textContent = 'Feltöltés...';
    setProfileImageEditorMessage('danger', '');

    try {
        const imageBlob = await getCroppedProfileImageBlob();
        const formData = new FormData();
        formData.append('image', imageBlob, 'profile-image.png');

        const response = await fetch('/api/profile/upload-image', {
            method: 'POST',
            body: formData
        });

        const result = await parseJson(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'A képfeltöltés nem sikerült.');
        }

        setProfileSettingsMessage('success', result.message || 'A profilkép feltöltve, függő státuszba került.');

        if (elements.modal) {
            const modal = bootstrap.Modal.getOrCreateInstance(elements.modal);
            modal.hide();
        }

        if (elements.uploadInput) {
            elements.uploadInput.value = '';
        }

        await syncSocketContextOrReconnect('profile-image-upload');
        await refreshAuthUi('profile-image-upload-success');
    } catch (error) {
        setProfileImageEditorMessage('danger', error.message || 'Hiba történt a képfeltöltés közben.');
        throw new Error(error.message || 'Profilkép feltöltési hiba.');
    } finally {
        profileImageEditorState.uploading = false;
        if (elements.saveButton) {
            elements.saveButton.disabled = !profileImageEditorState.image;
            elements.saveButton.textContent = 'Mentés';
        }
    }
}

function bindProfileImageUploadEvents() {
    try {
        const elements = getProfileImageEditorElements();
        if (!elements.uploadInput || !elements.modal) {
            throw new Error('Hianyzik a profile image upload input vagy modal.');
        }

        if (profileImageEditorState.bound) {
            throw new Error('A profile image upload esemenyek mar be vannak kotve.');
        }

        profileImageEditorState.bound = true;

        elements.uploadInput.addEventListener('change', async (event) => {
            await runSafelyAsync('profileImageUploadChange', async () => {
                try {
                    const file = event.target.files?.[0] || null;
                    const fileError = validateProfileImageFile(file);

                    if (fileError) {
                        throw new Error(fileError);
                    }

                    await openProfileImageEditorFromFile(file);
                } catch (error) {
                    setProfileSettingsMessage('danger', error.message || 'A kiválasztott kép nem nyitható meg.');
                    elements.uploadInput.value = '';
                    throw error;
                }
            });
        });

        if (elements.zoomInput) {
            elements.zoomInput.addEventListener('input', () => {
                runSafely('profileImageZoomInput', () => {
                    profileImageEditorState.scale = Number(elements.zoomInput.value) || 1;
                    renderProfileImageEditor();
                });
            });
        }

        if (elements.rotateInput) {
            elements.rotateInput.addEventListener('input', () => {
                runSafely('profileImageRotateInput', () => {
                    profileImageEditorState.rotationDeg = Number(elements.rotateInput.value) || 0;
                    renderProfileImageEditor();
                });
            });
        }

        if (elements.resetButton) {
            elements.resetButton.addEventListener('click', () => {
                runSafely('profileImageResetClick', () => {
                    resetProfileImageEditorState();
                    renderProfileImageEditor();
                });
            });
        }

        if (elements.saveButton) {
            elements.saveButton.addEventListener('click', async () => {
                await runSafelyAsync('profileImageSaveClick', async () => {
                    await submitProfileImageUpload();
                });
            });
        }

        bindProfileImageEditorCanvasEvents();

        elements.modal.addEventListener('shown.bs.modal', () => {
            runSafely('profileImageModalShown', () => {
                renderProfileImageEditor();
            });
        });

        elements.modal.addEventListener('hidden.bs.modal', () => {
            runSafely('profileImageModalHidden', () => {
                clearProfileImageEditorImage();
                if (elements.uploadInput) {
                    elements.uploadInput.value = '';
                }
            });
        });

        window.addEventListener('resize', () => {
            runSafely('profileImageWindowResize', () => {
                if (profileImageEditorState.image) {
                    renderProfileImageEditor();
                }
            });
        });
    } catch (error) {
        console.error('bindProfileImageUploadEvents hiba:', error);
    }
}

function getRemoveAvatarElements() {
    return {
        modal: document.getElementById('removeAvatarModal'),
        confirmButton: document.getElementById('confirmRemoveAvatarButton'),
        message: document.getElementById('removeAvatarMessage')
    };
}

function setRemoveAvatarMessage(type, message) {
    const { message: messageElement } = getRemoveAvatarElements();
    if (!messageElement) {
        return;
    }

    if (!message) {
        messageElement.className = 'alert d-none mb-0';
        messageElement.textContent = '';
        return;
    }

    messageElement.className = `alert alert-${type} mb-0`;
    messageElement.textContent = message;
}

async function submitRemoveAvatar() {
    const elements = getRemoveAvatarElements();
    if (!elements.confirmButton) {
        return;
    }

    elements.confirmButton.disabled = true;
    elements.confirmButton.textContent = 'Eltávolítás...';
    setRemoveAvatarMessage('danger', '');

    try {
        const response = await fetch('/api/profile/remove-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await parseJson(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'A profilkép eltávolítása nem sikerült.');
        }

        setProfileSettingsMessage('success', result.message || 'A profilkép visszaállítva az alapértelmezett képre.');

        if (elements.modal) {
            const modal = bootstrap.Modal.getOrCreateInstance(elements.modal);
            modal.hide();
        }

        await syncSocketContextOrReconnect('profile-image-remove');
        await refreshAuthUi('profile-image-remove-success');
    } catch (error) {
        setRemoveAvatarMessage('danger', error.message || 'Hiba történt a profilkép eltávolítása közben.');
        throw new Error(error.message || 'Profilkép eltávolítási hiba.');
    } finally {
        elements.confirmButton.disabled = false;
        elements.confirmButton.textContent = 'Eltávolítás';
    }
}

function bindRemoveAvatarEvents() {
    try {
        const elements = getRemoveAvatarElements();
        if (!elements.modal || !elements.confirmButton) {
            throw new Error('Hianyzik a remove avatar modal vagy confirm gomb.');
        }

        elements.confirmButton.addEventListener('click', async () => {
            await runSafelyAsync('removeAvatarConfirmClick', async () => {
                await submitRemoveAvatar();
            });
        });

        elements.modal.addEventListener('show.bs.modal', () => {
            runSafely('removeAvatarModalShow', () => {
                setRemoveAvatarMessage('danger', '');
            });
        });

        elements.modal.addEventListener('hidden.bs.modal', () => {
            runSafely('removeAvatarModalHidden', () => {
                setRemoveAvatarMessage('danger', '');
            });
        });
    } catch (error) {
        console.error('bindRemoveAvatarEvents hiba:', error);
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

