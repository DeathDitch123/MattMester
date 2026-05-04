function bindNotificationCenterEvents() {
    if (!notificationCenterState.bound) {
        const { list, modal, markAllBtn } = getNotificationCenterElements();

        // Admin által módosult profil — friss adatok lehúzása, hogy a felület
        // (Security & Activity History, ELO/wins/losses, e-mail, stb.) azonnal
        // tükrözze az új állapotot, ne csak az értesítés.
        window.addEventListener('mattmester:user:profile:adminEdit', () => {
            runSafelyAsync('userProfileAdminEditRefresh', async () => {
                try { await refreshSecurityActivity(); } catch (_) {}
                try { await refreshAuthUi('admin-profile-edit'); } catch (_) {}
            });
        });

        // Admin jovahagyta / elutasitotta a fuggo profilkepet — sessionInfo re-fetch
        // hogy a Profile Settings avatar + image-status pill azonnal lekoveti az uj allapotot.
        window.addEventListener('mattmester:user:profile:imageReviewed', () => {
            runSafelyAsync('userProfileImageReviewedRefresh', async () => {
                try { await refreshAuthUi('admin-profile-image-reviewed'); } catch (_) {}
            });
        });

        window.addEventListener('mattmester:notification:push', (event) => {
            runSafely('notificationPushCollect', () => {
                const notification = normalizeNotificationItem(event?.detail || {});
                const existingIndex = notification.id
                    ? notificationCenterState.items.findIndex((entry) => entry.id === notification.id)
                    : -1;
                if (existingIndex >= 0) {
                    notificationCenterState.items.splice(existingIndex, 1);
                }
                notificationCenterState.items.unshift(notification);
                if (notificationCenterState.items.length > notificationCenterState.maxItems) {
                    notificationCenterState.items.length = notificationCenterState.maxItems;
                }
                if (!notification.isRead) {
                    setNotificationBadge(notificationCenterState.unreadCount + 1);
                }
                renderNotificationCenterList();
            });
        });

        window.addEventListener('mattmester:notification:badge', (event) => {
            runSafely('notificationBadgeUpdate', () => {
                const count = Number(event?.detail?.unreadCount) || 0;
                setNotificationBadge(count);
            });
        });

        window.addEventListener('mattmester:chat:unread-total', (event) => {
            runSafely('chatUnreadTotalUpdate', () => {
                const total = Number(event?.detail?.totalUnread) || 0;
                setChatBadge(total);
            });
        });

        window.addEventListener('mattmester:notification:reset', (event) => {
            runSafely('notificationResetFromServer', () => {
                const reason = String(event?.detail?.reason || 'session-change');
                resetNotificationCenterState(reason);
            });
        });

        // Multi-tab szinkron: ha az adott user masik tabjan / a backend
        // dismiss-elte az ertesitest, ezen a tabon is azonnal tunjon el.
        window.addEventListener('mattmester:notification:dismissed', (event) => {
            runSafely('notificationDismissedFromServer', () => {
                const notificationId = Number(event?.detail?.notificationId) || 0;
                if (notificationId > 0) {
                    const idx = notificationCenterState.items.findIndex((entry) => entry.id === notificationId);
                    if (idx >= 0) {
                        const wasUnread = !notificationCenterState.items[idx].isRead;
                        notificationCenterState.items.splice(idx, 1);
                        if (wasUnread) {
                            setNotificationBadge(Math.max(0, notificationCenterState.unreadCount - 1));
                        }
                        renderNotificationCenterList();
                    }
                }
            });
        });

        window.addEventListener('mattmester:notification:dismissed-all', () => {
            runSafely('notificationDismissedAllFromServer', () => {
                notificationCenterState.items = [];
                setNotificationBadge(0);
                renderNotificationCenterList();
            });
        });

        window.addEventListener('mattmester:notification:dismissed-bulk', (event) => {
            runSafely('notificationDismissedBulkFromServer', () => {
                const filter = event?.detail?.filter || {};
                const filterType = typeof filter.type === 'string' ? filter.type : null;
                const filterSenderUserId = Number(filter.senderUserId) || null;
                if (!filterType && !filterSenderUserId) {
                    return;
                }
                let unreadDelta = 0;
                notificationCenterState.items = notificationCenterState.items.filter((entry) => {
                    const matchesType = !filterType || entry.type === filterType;
                    const matchesSender = !filterSenderUserId || Number(entry.fromUserId) === filterSenderUserId;
                    const shouldRemove = matchesType && matchesSender;
                    if (shouldRemove && !entry.isRead) {
                        unreadDelta += 1;
                    }
                    return !shouldRemove;
                });
                if (unreadDelta > 0) {
                    setNotificationBadge(Math.max(0, notificationCenterState.unreadCount - unreadDelta));
                }
                renderNotificationCenterList();
            });
        });

        window.addEventListener('mattmester:chat:unread:reset', (event) => {
            runSafely('chatUnreadResetFromServer', () => {
                const reason = String(event?.detail?.reason || 'session-change');
                resetChatBadgeState(reason);
            });
        });

        window.addEventListener('mattmester:session-context:changed', (event) => {
            // Amikor a socket:state / presence:state observer session valtast jelez,
            // authoritative refresh-t inditunk a backend fele, hogy a frontend
            // allapot mindig a DB-vel legyen szinkronban.
            runSafelyAsync('notificationSessionContextRefresh', async () => {
                const reason = `session-context:${event?.detail?.trigger || 'change'}`;
                await refreshNotificationAndChatStateForCurrentSession(reason);
            });
        });

        if (list) {
            list.addEventListener('click', (event) => {
                runSafelyAsync('notificationListAction', async () => {
                    const button = event.target.closest('[data-notification-action]');
                    if (!button) {
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    const wrapper = button.closest('[data-notification-id]');
                    const notificationId = Number(wrapper?.dataset.notificationId) || 0;
                    const fromUserId = Number(wrapper?.dataset.fromUserId) || 0;
                    const conversationId = Number(wrapper?.dataset.conversationId) || 0;
                    const action = button.dataset.notificationAction;

                    // Profil = view-only, ratelimit / spam vedelem nem ertelmezett.
                    if (action === 'profile' && fromUserId) {
                        await openPlayerProfileModalByUserId(fromUserId);
                        return;
                    }

                    // open_chat = read + modal close, nem optimistic remove.
                    if (action === 'open_chat' && (conversationId || fromUserId)) {
                        const isReadSaved = await markNotificationReadOnServer(notificationId);
                        if (!isReadSaved) {
                            console.error('[notifications] chat megnyitas mellett read mentes sikertelen:', notificationId);
                        }
                        window.dispatchEvent(new CustomEvent('mattmester:chat:open-conversation', {
                            detail: { conversationId, targetUserId: fromUserId }
                        }));
                        if (modal) {
                            bootstrap.Modal.getOrCreateInstance(modal).hide();
                        }
                        return;
                    }

                    // Innen lefele: minden ag dismiss-elendo, ami optimistic
                    // local-removal-t es per-notif in-flight guardot ervenyesit.
                    const isResolvingAction = (
                        action === 'remove'
                        || ((action === 'accept' || action === 'reject' || action === 'block') && fromUserId)
                    );
                    if (!isResolvingAction || !notificationId) {
                        return;
                    }

                    // 1. lepes — abuse / double-click vedelem: ha mar fut egy
                    //    POST erre az ertesitesre, a kovetkezo klikkek no-op-ok.
                    if (notificationCenterState.pendingActionIds.has(notificationId)) {
                        return;
                    }
                    notificationCenterState.pendingActionIds.add(notificationId);

                    // 2. lepes — minden akcio-gombot disable-elunk a kartyan,
                    //    hogy egy lassu valtas alatt se lehessen tovabbi POST-okat
                    //    ramai meg. Mar nem latszik, ha eltunt, de safety-net.
                    const cardButtons = wrapper
                        ? Array.from(wrapper.querySelectorAll('[data-notification-action]'))
                        : [button];
                    cardButtons.forEach((btn) => { btn.disabled = true; });

                    // 3. lepes — optimistic UI: local state-bol kivesszuk, mielott
                    //    a halozati hivas befejezodne. Ha hibazik, visszaallitjuk.
                    const idx = notificationCenterState.items.findIndex((entry) => entry.id === notificationId);
                    let removedItem = null;
                    let removedIndex = -1;
                    if (idx >= 0) {
                        removedIndex = idx;
                        removedItem = notificationCenterState.items[idx];
                        notificationCenterState.items.splice(idx, 1);
                        if (removedItem && !removedItem.isRead) {
                            setNotificationBadge(Math.max(0, notificationCenterState.unreadCount - 1));
                        }
                        renderNotificationCenterList();
                    }

                    const restoreOnFailure = (feedbackMessage) => {
                        if (removedItem && removedIndex >= 0) {
                            const insertAt = Math.min(removedIndex, notificationCenterState.items.length);
                            notificationCenterState.items.splice(insertAt, 0, removedItem);
                            if (!removedItem.isRead) {
                                setNotificationBadge(notificationCenterState.unreadCount + 1);
                            }
                            renderNotificationCenterList();
                        }
                        if (feedbackMessage && typeof setFriendsFeedback === 'function') {
                            setFriendsFeedback(feedbackMessage, 'warning');
                        }
                    };

                    try {
                        if (action === 'remove') {
                            const isDismissSaved = await dismissNotificationOnServer(notificationId);
                            if (!isDismissSaved) {
                                restoreOnFailure(tx('Az ertesites eltavolitasa nem sikerult.', 'Failed to remove the notification.'));
                            }
                        } else {
                            // accept / reject / block: friend action elobb, dismiss utana.
                            const result = await performFriendActionFromNotification(action, fromUserId);
                            if (result.success) {
                                const isDismissSaved = await dismissNotificationOnServer(notificationId);
                                if (!isDismissSaved && typeof setFriendsFeedback === 'function') {
                                    setFriendsFeedback(tx('A muvelet sikerult, de az ertesites eltavolitasa nem sikerult. Frissitsd az oldalt.', 'The operation succeeded, but removing the notification failed. Please refresh the page.'), 'warning');
                                }
                                if (typeof setFriendsFeedback === 'function') {
                                    setFriendsFeedback(result.message, 'success');
                                }
                                if (typeof refreshFriendsList === 'function') {
                                    await refreshFriendsList(friendsState?.activeFilter || 'friend');
                                }
                            } else {
                                restoreOnFailure(null);
                                if (typeof setFriendsFeedback === 'function') {
                                    setFriendsFeedback(result.message || tx('Hiba a muvelet soran.', 'Error during the operation.'), 'error');
                                }
                            }
                        }
                    } finally {
                        notificationCenterState.pendingActionIds.delete(notificationId);
                        // Ha a kartya meg latszik (hiba miatt visszaallt), engedelyezzuk
                        // ujra a gombokat. Ha eltunt, a felhasznalo soha nem latja
                        // oket, de a guard tisztitas igy is fontos a memoria miatt.
                        cardButtons.forEach((btn) => { btn.disabled = false; });
                    }
                });
            });
        }

        if (markAllBtn) {
            markAllBtn.addEventListener('click', () => {
                runSafelyAsync('markAllNotificationsRead', async () => {
                    // Per spec: a "Mind olvasott" gomb feliratot megtartjuk, de
                    // a viselkedese permanens user-oldali eltavolitas mindenre.
                    if (notificationCenterState.markAllInFlight) {
                        return;
                    }
                    notificationCenterState.markAllInFlight = true;
                    markAllBtn.disabled = true;

                    // Optimistic: azonnal kiuritjuk a UI-t, hibara visszaallitjuk.
                    const previousItems = notificationCenterState.items.slice();
                    const previousUnread = notificationCenterState.unreadCount;
                    notificationCenterState.items = [];
                    setNotificationBadge(0);
                    renderNotificationCenterList();

                    try {
                        const success = await markAllNotificationsReadOnServer();
                        if (!success) {
                            notificationCenterState.items = previousItems;
                            setNotificationBadge(previousUnread);
                            renderNotificationCenterList();
                            if (typeof setFriendsFeedback === 'function') {
                                setFriendsFeedback(tx('Az ertesitesek tomeges eltavolitasa nem sikerult.', 'Bulk removal of notifications failed.'), 'warning');
                            }
                        }
                    } finally {
                        notificationCenterState.markAllInFlight = false;
                        markAllBtn.disabled = false;
                    }
                });
            });
        }

        if (modal) {
            modal.addEventListener('shown.bs.modal', () => {
                runSafelyAsync('notificationModalShown', async () => {
                    await fetchNotificationsFromServer();
                });
            });
        }

        notificationCenterState.bound = true;
    }

    if (!notificationCenterState.initialized) {
        runSafelyAsync('notificationsInitialFetch', async () => {
            await fetchNotificationsFromServer();
        });
        notificationCenterState.initialized = true;
    }

    if (!chatBadgeState.initialized) {
        runSafelyAsync('chatUnreadInitialFetch', async () => {
            await fetchChatUnreadTotal();
        });
        chatBadgeState.initialized = true;
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
        const debugEnabled = String(window.localStorage?.getItem('mattmester.debugAuthLogs') || 'false').toLowerCase() === 'true';
        
        if (debugEnabled) {
            const sessionInfo = sessionInfoInput || await fetchSessionInfo();

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
        }
    } catch (error) {
        console.error('Hiba a session/socket informacio naplozasakor:', error);
    }
}

async function refreshAuthUi(contextLabel = 'auth-refresh') {
    try {
        const sessionInfo = await fetchSessionInfo();
        showStats(sessionInfo);
        handleProfileSettings(sessionInfo);
        renderAccountStatus(sessionInfo);
        logSessionAndSocketInfo(sessionInfo, contextLabel);
    } catch (error) {
        console.error('refreshAuthUi hiba:', error);
    }
}

