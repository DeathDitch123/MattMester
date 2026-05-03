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
    item.dataset.conversationId = String(player.conversationId || '');

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'position-relative flex-shrink-0';

    const avatar = document.createElement('img');
    avatar.className = 'friend-avatar rounded-circle';
    window.MattMesterProfileImage.applyProfileImagePresentation(avatar, {
        source: player,
        alt: `${player.username || 'Jatekos'} profilkepe`,
        size: 40
    });
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
        chatButton.dataset.conversationId = String(player.conversationId || '');
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

    // Jelentes gomb a keresesi talalat soraban: a globalis playerActionModal-t
    // hivja meg ami egy egyseges modal-bol enged jelenteni a jatekost.
    if (friendStatus !== 'blocked') {
        const reportButton = document.createElement('button');
        reportButton.type = 'button';
        reportButton.className = 'btn btn-sm btn-outline-danger py-1 px-2';
        reportButton.title = 'Jelentés';
        reportButton.dataset.action = 'report';
        reportButton.dataset.userId = String(player.userId || player.id || '');
        reportButton.dataset.username = String(player.username || '');
        reportButton.dataset.profileImage = String(player.profileImage || '/profile_pictures/default.png');
        reportButton.dataset.friendStatus = friendStatus;
        reportButton.innerHTML = '<i data-lucide="flag" style="width: 16px; height: 16px;"></i>';
        actions.appendChild(reportButton);
    }

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

    modal.addEventListener('hide.bs.modal', () => {
        const activeElement = document.activeElement;
        if (activeElement && modal.contains(activeElement) && typeof activeElement.blur === 'function') {
            activeElement.blur();
        }
    });

    modal.addEventListener('hidden.bs.modal', () => {
        const { input: topInput, button: topButton } = getTopBarPlayerSearchElements();
        let focusTarget = null;

        if (topInput && !topInput.disabled) {
            focusTarget = topInput;
        } else if (topButton && !topButton.disabled) {
            focusTarget = topButton;
        } else if (document.body && typeof document.body.focus === 'function') {
            focusTarget = document.body;
        }

        if (focusTarget && typeof focusTarget.focus === 'function') {
            focusTarget.focus();
        }
    });

    list.addEventListener('click', (event) => {
        try {
            const actionButton = event.target.closest('button[data-action]');
            if (!actionButton) {
                return;
            }

            const userId = Number(actionButton.dataset.userId);
            const conversationId = Number(actionButton.dataset.conversationId || 0);
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
                runSafelyAsync('searchResultViewProfile', async () => {
                    await openPlayerProfileModalByUserId(userId);
                });
            } else if (action === 'chat') {
                runSafelyAsync('searchResultOpenDirectChat', async () => {
                    try {
                        await openChatConversationFlow({
                            conversationId,
                            targetUserId: userId,
                            source: 'search-results',
                            username
                        });
                    } catch (error) {
                        setProfileChatFeedbackBySource('search-results', error.message || 'A chat megnyitása sikertelen.', 'error');
                        throw error;
                    }
                });
            } else if (action === 'report') {
                // Player jelentes: a globalis playerActions modul-ra delegalunk,
                // amelyik az egyseges report-modal-t nyitja meg kategoria-valasztassal.
                if (window.MattMesterPlayerActions?.openPlayerActionModal) {
                    const profileImage = String(actionButton.dataset.profileImage || '/profile_pictures/default.png');
                    const friendStatus = String(actionButton.dataset.friendStatus || 'none');
                    window.MattMesterPlayerActions.openPlayerActionModal({
                        userId,
                        username,
                        profileImage,
                        friendStatus
                    });
                    // A user a tobbi gomb (profil / barat) helyett egybol a Jelentes-t
                    // szeretne — automatikusan nyissuk a report-modalt is. (Az action
                    // modal flash-szeruen jelenik meg.)
                    setTimeout(() => {
                        const reportBtn = document.getElementById('playerActionReportBtn');
                        if (reportBtn) reportBtn.click();
                    }, 50);
                }
            } else if (action === 'pending-friend' || action === 'accepted-friend' || action === 'blocked-friend') {
                // Ezek az akciók nem interaktívak, vagy később implementálandók
            }
        } catch (error) {
            console.error('Keresési találat akció hiba:', error);
        }
    });
}

function setProfileChatFeedbackBySource(source, message, type = 'neutral') {
    const text = String(message || '').trim();
    const isSearchSource = source === 'search-results';
    const isFriendsSource = source === 'friends-list';

    if (isSearchSource) {
        const { feedback } = getModalPlayerSearchElements();
        if (feedback) {
            feedback.classList.remove('text-danger', 'text-success', 'text-secondary');
            feedback.textContent = text;

            if (text) {
                feedback.classList.add(type === 'error' ? 'text-danger' : (type === 'success' ? 'text-success' : 'text-secondary'));
            }
        }
    }

    if (isFriendsSource) {
        setFriendsFeedback(text, type === 'error' ? 'error' : (type === 'success' ? 'success' : 'neutral'));
    }
}

