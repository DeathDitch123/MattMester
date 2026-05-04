async function openChatConversationFlow({ conversationId = 0, targetUserId = 0, source = 'friends-list', username = '' } = {}) {
    if (!window.MattMesterChatModal) {
        throw new Error(tx('A chat modal API nem érhető el.', 'The chat modal API is not available.'));
    }

    await window.MattMesterChatModal.init();

    const normalizedConversationId = Number(conversationId) || 0;
    const normalizedTargetUserId = Number(targetUserId) || 0;
    let successMessage = tx('Beszélgetés megnyitva.', 'Conversation opened.');

    if (normalizedConversationId) {
        await window.MattMesterChatModal.openConversation(normalizedConversationId);
    } else if (!normalizedTargetUserId) {
        throw new Error(tx('Hiányzik a cél felhasználó azonosító a chat nyitáshoz.', 'Missing target user id for opening chat.'));
    } else {
        await window.MattMesterChatModal.openDirectByUserId(normalizedTargetUserId);
        successMessage = username ? `${tx('Beszélgetés megnyitva:', 'Conversation opened:')} ${username}` : tx('Beszélgetés megnyitva.', 'Conversation opened.');
    }

    setProfileChatFeedbackBySource(source, successMessage, 'success');
}

function getFriendsSectionElements() {
    return {
        list: document.getElementById('friendsList'),
        refreshButton: document.getElementById('refreshFriendsButton'),
        filterButtons: document.querySelectorAll('[data-friends-filter]'),
        feedback: document.getElementById('friendsFeedback')
    };
}

function setFriendsFeedback(message = '', type = 'neutral') {
    const { feedback } = getFriendsSectionElements();
    if (feedback) {
        const hasMessage = Boolean(message);
        feedback.classList.remove('d-none', 'is-success', 'is-error');
        feedback.textContent = message || '';

        if (!hasMessage) {
            feedback.classList.add('d-none');
        } else if (type === 'success') {
            feedback.classList.add('is-success');
        } else if (type === 'error') {
            feedback.classList.add('is-error');
        }
    }
}

function normalizeFriendFilter(filterValue) {
    const normalized = String(filterValue || FRIEND_FILTER_DEFAULT).trim().toLowerCase();
    return FRIEND_FILTER_VALUES.has(normalized) ? normalized : FRIEND_FILTER_DEFAULT;
}

function getRelationMeta(relationStatusInput) {
    const relationStatus = String(relationStatusInput || '').trim().toLowerCase();

    if (relationStatus === 'incoming_pending') {
        return {
            relationStatus,
            listStatus: 'pending',
            statusLabel: tx('Függő kérés', 'Pending request'),
            statusClass: 'text-warning'
        };
    }

    if (relationStatus === 'blocked_by_me') {
        return {
            relationStatus,
            listStatus: 'blocked',
            statusLabel: tx('Tiltott', 'Blocked'),
            statusClass: 'text-danger'
        };
    }

    if (relationStatus === 'blocked_by_them') {
        return {
            relationStatus,
            listStatus: 'blocked',
            statusLabel: tx('Engem tiltott', 'Blocked me'),
            statusClass: 'text-danger'
        };
    }

    if (relationStatus === 'blocked_mutual') {
        return {
            relationStatus,
            listStatus: 'blocked',
            statusLabel: tx('Kölcsönös tiltás', 'Mutual block'),
            statusClass: 'text-danger'
        };
    }

    return {
        relationStatus: 'friends',
        listStatus: 'friend',
        statusLabel: tx('Már barát', 'Already friend'),
        statusClass: 'text-success'
    };
}

function createFriendActionButton(actionName, title, iconName, variantClass = 'btn-outline-gold') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn btn-sm ${variantClass} py-1 px-2`;
    if (actionName === 'delete-friend') {
        button.classList.add('friend-action-delete');
    }
    button.dataset.friendAction = actionName;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = `<i data-lucide="${iconName}" style="width: 16px; height: 16px;"></i>`;
    return button;
}

function createFriendDropdownAction(actionName, label, iconName, variantClass = '') {
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.className = `dropdown-item d-flex align-items-center gap-2 ${variantClass}`.trim();
    actionButton.dataset.friendAction = actionName;
    actionButton.innerHTML = `<i data-lucide="${iconName}" style="width: 16px; height: 16px;"></i><span>${label}</span>`;
    return actionButton;
}

function getFriendActionConfigs(friend) {
    const actions = [];

    if (friend.canChat) {
        actions.push({ action: 'chat', title: tx('Üzenet küldése', 'Send message'), label: tx('Üzenet küldése', 'Send message'), icon: 'message-square', buttonClass: 'btn-outline-gold' });
    }

    if (friend.canDeleteFriend) {
        actions.push({ action: 'delete-friend', title: tx('Barát törlése', 'Delete friend'), label: tx('Barát törlése', 'Delete friend'), icon: 'user-x', buttonClass: 'btn-outline-danger', dropdownClass: 'text-danger' });
    }

    if (friend.canAccept) {
        actions.push({ action: 'accept', title: tx('Barát kérelem elfogadása', 'Accept friend request'), label: tx('Elfogadás', 'Accept'), icon: 'check', buttonClass: 'btn-outline-success', dropdownClass: 'text-success' });
    }

    if (friend.canReject) {
        actions.push({ action: 'reject', title: tx('Barát kérelem elutasítása', 'Reject friend request'), label: tx('Elutasítás', 'Reject'), icon: 'x', buttonClass: 'btn-outline-danger', dropdownClass: 'text-danger' });
    }

    if (friend.canBlock) {
        actions.push({ action: 'block', title: tx('Felhasználó tiltása', 'Block user'), label: tx('Tiltás', 'Block'), icon: 'ban', buttonClass: 'btn-outline-danger', dropdownClass: 'text-danger' });
    }

    if (friend.canUnblock) {
        actions.push({ action: 'unblock', title: tx('Tiltás visszavonása', 'Unblock'), label: tx('Tiltás visszavonása', 'Unblock'), icon: 'shield-check', buttonClass: 'btn-outline-warning', dropdownClass: 'text-warning' });
    }

    if (friend.canView) {
        actions.push({ action: 'view', title: tx('Profil megtekintése', 'View profile'), label: tx('Profil megtekintése', 'View profile'), icon: 'eye', buttonClass: 'btn-outline-gold' });
    }

    return actions;
}

function createFriendListItem(friend) {
    const relationMeta = getRelationMeta(friend.relationStatus);
    const item = document.createElement('div');
    item.className = 'friend-item';
    item.setAttribute('role', 'listitem');
    item.dataset.userId = String(friend.userId || '');
    item.dataset.username = String(friend.username || '');
    item.dataset.conversationId = String(friend.conversationId || '');
    item.dataset.relationStatus = relationMeta.relationStatus;
    item.dataset.listStatus = relationMeta.listStatus;

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'position-relative flex-shrink-0';

    const avatar = document.createElement('img');
    avatar.className = 'friend-avatar rounded-circle';
    window.MattMesterProfileImage.applyProfileImagePresentation(avatar, {
        source: friend,
        alt: `${friend.username || tx('Játékos', 'Player')} ${tx('profilképe', 'profile picture')}`,
        size: 40
    });

    const statusDot = document.createElement('span');
    statusDot.className = 'friend-status offline';
    avatarWrap.appendChild(avatar);
    avatarWrap.appendChild(statusDot);

    const info = document.createElement('div');
    info.className = 'flex-grow-1 min-width-0';

    const username = document.createElement('h6');
    username.className = 'mb-0 text-white text-truncate';
    username.style.fontSize = '0.9rem';
    username.textContent = friend.username || tx('Ismeretlen játékos', 'Unknown player');

    const relation = document.createElement('small');
    relation.className = `${relationMeta.statusClass} d-block text-truncate`;
    relation.textContent = relationMeta.statusLabel;

    if (friend.isBlockedContext || friend.ownBlockActive || friend.oppositeBlockActive) {
        relation.dataset.blockState = friend.ownBlockActive && friend.oppositeBlockActive
            ? 'mutual'
            : friend.ownBlockActive
                ? 'own'
                : 'incoming';
    }

    info.appendChild(username);
    info.appendChild(relation);

    const actionConfigs = getFriendActionConfigs(friend);
    const actions = document.createElement('div');
    actions.className = 'friend-actions d-flex align-items-center gap-2 flex-shrink-0';

    const inlineActions = document.createElement('div');
    inlineActions.className = 'd-none d-md-flex flex-wrap justify-content-end gap-2';
    actionConfigs.forEach((actionConfig) => {
        inlineActions.appendChild(
            createFriendActionButton(
                actionConfig.action,
                actionConfig.title,
                actionConfig.icon,
                actionConfig.buttonClass
            )
        );
    });

    const dropdownWrapper = document.createElement('div');
    dropdownWrapper.className = 'dropdown d-md-none';

    const dropdownToggle = document.createElement('button');
    dropdownToggle.type = 'button';
    dropdownToggle.className = 'btn btn-sm btn-outline-gold dropdown-toggle';
    dropdownToggle.dataset.bsToggle = 'dropdown';
    dropdownToggle.setAttribute('aria-expanded', 'false');
    dropdownToggle.innerHTML = `<i data-lucide="ellipsis-vertical" style="width: 16px; height: 16px;"></i><span class="ms-1">${tx('Műveletek', 'Actions')}</span>`;

    const dropdownMenu = document.createElement('div');
    dropdownMenu.className = 'dropdown-menu dropdown-menu-end friend-actions-menu';
    actionConfigs.forEach((actionConfig) => {
        dropdownMenu.appendChild(
            createFriendDropdownAction(
                actionConfig.action,
                actionConfig.label,
                actionConfig.icon,
                actionConfig.dropdownClass
            )
        );
    });

    dropdownWrapper.appendChild(dropdownToggle);
    dropdownWrapper.appendChild(dropdownMenu);

    actions.appendChild(inlineActions);
    actions.appendChild(dropdownWrapper);

    item.appendChild(avatarWrap);
    item.appendChild(info);
    item.appendChild(actions);

    return item;
}

function setFriendListLoading(isLoading, label = null) {
    if (label === null) label = tx('Betöltés folyamatban...', 'Loading...');
    const { list, refreshButton, filterButtons } = getFriendsSectionElements();
    if (list) {
        friendsState.loading = Boolean(isLoading);
        if (refreshButton) {
            refreshButton.disabled = friendsState.loading;
        }

        filterButtons.forEach((button) => {
            button.disabled = friendsState.loading;
        });

        if (friendsState.loading) {
            list.innerHTML = `<div class="friend-list-empty">${label}</div>`;
        }
    }
}

function setFriendFilterButtonsState(activeFilter) {
    const { filterButtons } = getFriendsSectionElements();
    filterButtons.forEach((button) => {
        const isActive = button.dataset.friendsFilter === activeFilter;
        button.classList.toggle('is-active', isActive);
    });
}

function renderFriendsList(items = []) {
    const { list } = getFriendsSectionElements();
    if (list) {
        const hasItems = Array.isArray(items) && items.length > 0;
        list.innerHTML = '';

        if (!hasItems) {
            list.innerHTML = `<div class="friend-list-empty">${tx('Nincs megjeleníthető kapcsolat ebben a nézetben.', 'No relationships to display in this view.')}</div>`;
        } else {
            items.forEach((friend) => {
                list.appendChild(createFriendListItem(friend));
            });

            lucide.createIcons();
        }
    }
}

async function refreshFriendsList(filterValue = friendsState.activeFilter) {
    const { list } = getFriendsSectionElements();
    if (list) {
        const normalizedFilter = normalizeFriendFilter(filterValue);
        friendsState.activeFilter = normalizedFilter;
        setFriendFilterButtonsState(normalizedFilter);
        setFriendListLoading(true, tx('Barátok frissítése...', 'Refreshing friends...'));

        try {
            const response = await fetch(`/api/friends/list?status=${encodeURIComponent(normalizedFilter)}`);
            const result = await parseJson(response);

            if (!response.ok || !result.success) {
                throw new Error(result.message || tx('Nem sikerült a barát lista lekérése.', 'Failed to fetch the friends list.'));
            }

            friendsState.items = Array.isArray(result.data) ? result.data : [];
            renderFriendsList(friendsState.items);
            setFriendsFeedback(result.message || tx('Barátok frissítve.', 'Friends refreshed.'), 'success');
        } catch (error) {
            friendsState.items = [];
            list.innerHTML = `<div class="friend-list-empty text-danger">${error.message || tx('Sikertelen barát lista frissítés.', 'Friends list refresh failed.')}</div>`;
            setFriendsFeedback(error.message || tx('Sikertelen barát lista frissítés.', 'Friends list refresh failed.'), 'error');
        } finally {
            friendsState.loading = false;
            const { refreshButton, filterButtons } = getFriendsSectionElements();
            if (refreshButton) {
                refreshButton.disabled = false;
            }
            filterButtons.forEach((button) => {
                button.disabled = false;
            });
            setFriendFilterButtonsState(friendsState.activeFilter);
        }
    }
}

async function executeFriendAction(actionName, targetUserId) {
    if (!targetUserId) {
        throw new Error(tx('Hiányzó cél felhasználó azonosító.', 'Missing target user id.'));
    }

    if (actionName === 'accept') {
        return fetch('/api/friends/accept', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId })
        });
    }

    if (actionName === 'reject') {
        return fetch('/api/friends/reject', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId })
        });
    }

    if (actionName === 'block') {
        return fetch('/api/friends/block', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId })
        });
    }

    if (actionName === 'unblock') {
        return fetch(`/api/friends/unblock/${encodeURIComponent(targetUserId)}`, {
            method: 'DELETE'
        });
    }

    if (actionName === 'delete-friend') {
        return fetch(`/api/friends/${encodeURIComponent(targetUserId)}`, {
            method: 'DELETE'
        });
    }

    throw new Error(tx('Ismeretlen friend akció.', 'Unknown friend action.'));
}

function bindFriendsSectionEvents() {
    const { list, refreshButton, filterButtons } = getFriendsSectionElements();
    if (list && refreshButton && filterButtons.length && !friendsState.bound) {
        filterButtons.forEach((button) => {
            button.addEventListener('click', () => {
                runSafelyAsync('friendsFilterClick', async () => {
                    const nextFilter = normalizeFriendFilter(button.dataset.friendsFilter);
                    await refreshFriendsList(nextFilter);
                });
            });
        });

        refreshButton.addEventListener('click', () => {
            runSafelyAsync('friendsRefreshClick', async () => {
                await refreshFriendsList(friendsState.activeFilter);
            });
        });

        list.addEventListener('click', (event) => {
            runSafelyAsync('friendsListActionClick', async () => {
                const actionButton = event.target.closest('button[data-friend-action]');
                if (actionButton && !friendsState.loading) {
                    const item = actionButton.closest('.friend-item');
                    const targetUserId = Number(item?.dataset.userId || 0);
                    const conversationId = Number(item?.dataset.conversationId || 0);
                    const username = String(item?.dataset.username || '');
                    const actionName = String(actionButton.dataset.friendAction || '').trim().toLowerCase();

                    if (!actionName || !targetUserId) {
                        throw new Error(tx('Érvénytelen barát lista művelet.', 'Invalid friends list action.'));
                    }

                    let actionHandled = false;
                    if (actionName === 'view') {
                        await openPlayerProfileModalByUserId(targetUserId);
                        actionHandled = true;
                    }

                    if (actionName === 'chat') {
                        try {
                            await openChatConversationFlow({
                                conversationId,
                                targetUserId,
                                source: 'friends-list',
                                username
                            });
                        } catch (error) {
                            setProfileChatFeedbackBySource('friends-list', error.message || tx('A chat megnyitása sikertelen.', 'Failed to open chat.'), 'error');
                            throw error;
                        }
                        actionHandled = true;
                    }

                    if (!actionHandled) {
                        actionButton.disabled = true;
                        const response = await executeFriendAction(actionName, targetUserId);
                        const result = await parseJson(response);
                        if (!response.ok || !result.success) {
                            throw new Error(result.message || tx('A friend művelet nem sikerült.', 'The friend operation failed.'));
                        }

                        setFriendsFeedback(result.message || tx('A művelet sikeres volt.', 'The operation was successful.'), 'success');
                        await refreshFriendsList(friendsState.activeFilter);
                        setFriendsFeedback(result.message || tx('A művelet sikeres volt.', 'The operation was successful.'), 'success');
                    }
                }
            });
        });

        setFriendFilterButtonsState(friendsState.activeFilter);
        friendsState.bound = true;
    }
}

