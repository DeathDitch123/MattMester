function bindCrossTabProfileRefreshEvents() {
    try {
        if (!profileRealtimeSyncState.bound) {
            if (!window.MattMesterSocket?.subscribeSessionContextChanges) {
                throw new Error('A közös session context observer API nem érhető el.');
            }

            const unsubscribe = window.MattMesterSocket.subscribeSessionContextChanges(async (eventPayload = {}) => {
                try {
                    await refreshAuthUi();
                    // Session valtas eseten az ertesites es chat unread allapotot
                    // is authoritative modon be kell tolteni, kulonben a modalban
                    // es a chat ikonon a regi user adatai maradnak.
                    await refreshNotificationAndChatStateForCurrentSession(
                        `cross-tab:${eventPayload?.trigger || 'change'}`
                    );
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
        }
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
            throw new Error(tx('A kereső elemek nem találhatók a DOM-ban.', 'Search elements not found in the DOM.'));
        }

        const username = (input.value || '').trim();
        if (!username || username.length < 3 || username.length > 50 || !USERNAME_REGEX.test(username)) {
            throw new Error(tx('Érvénytelen felhasználónév a kereséshez.', 'Invalid username for search.'));
        }
        const searchText = username;

        feedback.classList.remove('text-danger', 'text-success');
        feedback.classList.add('text-secondary');
        feedback.textContent = tx('Keresés folyamatban...', 'Searching...');
        button.disabled = true;

        if (runtime.abortController) {
            runtime.abortController.abort();
        }
        runtime.abortController = new AbortController();

        const response = await fetch(`/api/searchPlayer?username=${encodeURIComponent(username)}`, {
            signal: runtime.abortController.signal
        });

        if (runtime.requestToken !== requestToken) {
            const staleError = new Error(tx('A keresés elavulttá vált.', 'The search has become stale.'));
            staleError.name = 'SearchStaleError';
            throw staleError;
        }

        const result = await parseJson(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || tx('Sikertelen keresés.', 'Search failed.'));
        }

        feedback.classList.remove('text-secondary', 'text-danger');
        feedback.classList.add('text-success');
        feedback.textContent = `${tx('A keresés eredményes:', 'Search successful:')} ${result.data.length} ${tx('találat.', 'result(s).')}`;

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
            feedback.textContent = error.message || tx('Hiba történt a játékos keresése során.', 'An error occurred while searching for the player.');
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

