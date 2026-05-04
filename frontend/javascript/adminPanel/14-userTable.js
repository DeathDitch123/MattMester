/* =============================================================
   16.5) Admin Felhasználók — szűrés, lazy loading, render, modal
   ============================================================= */

// Egy user row HTML-je. signature alapján a renderelő villantja, ha változott.
function renderAdminUserRow(user) {
    let html = '';
    try {
        if (user) {
            const signature = buildUserSignature(user);
            const banned = Boolean(user.isBanned);
            const display = h.user({
                name: user.username || '—',
                email: user.email || '',
                username: user.username,
                profile_image: user.profileImage,
                struck: banned
            });
            const eloCell = renderEloTrio(user);
            const roleCell = rolePill(user.role === 'admin' ? 'admin' : 'player');
            const statusCell = renderUserStatusCell(user);
            const lastActiveSource = user.online ? (user.presenceLastSeenAt || user.lastActive) : user.lastActive;
            const lastActiveCell = lastActiveSource
                ? `<span class="${user.online ? 'text-success fw-semibold' : 'text-secondary'}" title="${escapeHtml(new Date(lastActiveSource).toLocaleString('hu-HU'))}">${escapeHtml(user.online ? 'Most' : formatRelative(lastActiveSource))}</span>`
                : '<span class="text-muted">—</span>';
            const joinedCell = `<span class="text-secondary">${escapeHtml(formatDateOnly(user.createdAt))}</span>`;

            const isPendingDeletion = user.pendingDeletionUntil && new Date(user.pendingDeletionUntil) > new Date();
            let actionItems;
            if (isPendingDeletion) {
                actionItems = [
                    { icon: 'bi-eye', variant: 'light', title: 'Megtekintés', onclick: `openAdminUserView(${user.id})` },
                    { icon: 'bi-arrow-counterclockwise', variant: 'success', title: 'Visszaállít (törlés visszavonása)', onclick: `restoreUserDeletion(${user.id})` }
                ];
            } else if (banned) {
                actionItems = [
                    { icon: 'bi-eye', variant: 'light', title: 'Megtekintés', onclick: `openAdminUserView(${user.id})` },
                    { icon: 'bi-pencil', variant: 'gold', title: 'Szerkesztés', onclick: `editAdminUser(${user.id})` },
                    { icon: 'bi-check-circle', variant: 'success', title: 'Tiltás kezelése', onclick: `banAdminUser(${user.id})` }
                ];
            } else {
                actionItems = [
                    { icon: 'bi-eye', variant: 'light', title: 'Megtekintés', onclick: `openAdminUserView(${user.id})` },
                    { icon: 'bi-pencil', variant: 'gold', title: 'Szerkesztés', onclick: `editAdminUser(${user.id})` },
                    { icon: 'bi-ban', variant: 'danger', title: 'Tiltás (kritikus)', onclick: `banAdminUser(${user.id})` }
                ];
            }

            html = `
                <tr class="admin-user-row${user.online ? ' is-online' : ''}" data-user-id="${user.id}" data-signature="${escapeHtml(signature)}">
                    <td>${display}</td>
                    <td>${eloCell}</td>
                    <td>${roleCell}</td>
                    <td>${statusCell}</td>
                    <td>${lastActiveCell}</td>
                    <td>${joinedCell}</td>
                    <td class="text-end">${h.actions(actionItems)}</td>
                </tr>
            `;
        }
    } catch (err) {
        console.error('renderAdminUserRow hiba:', err);
        html = '';
    }
    return html;
}

// Üres állapot HTML — reason alapján más szöveg.
function renderAdminUsersEmptyRow(reason) {
    let html = '';
    try {
        const messages = {
            no_token: { icon: 'bi-shield-slash', title: 'Nincs admin token', sub: 'A lista betöltéséhez aktív admin step-up token szükséges.' },
            loading: { icon: 'bi-arrow-repeat', title: 'Felhasználói lista betöltése…', sub: '' },
            error: { icon: 'bi-exclamation-triangle', title: 'Hiba a lista betöltésénél', sub: state.users.error || 'Ismeretlen hiba.' },
            empty: { icon: 'bi-inbox', title: 'Nincs találat', sub: 'Próbáld törölni vagy módosítani a szűrőket.' }
        };
        const m = messages[reason] || messages.empty;
        html = `
            <tr class="admin-users-empty-row admin-users-empty-${reason || 'empty'}">
                <td colspan="7" class="text-center py-5">
                    <i class="bi ${m.icon} admin-users-empty-icon ${reason === 'loading' ? 'spin' : ''}"></i>
                    <div class="admin-users-empty-title">${escapeHtml(m.title)}</div>
                    ${m.sub ? `<div class="admin-users-empty-sub">${escapeHtml(m.sub)}</div>` : ''}
                </td>
            </tr>
        `;
    } catch (err) {
        console.error('renderAdminUsersEmptyRow hiba:', err);
        html = '<tr><td colspan="7" class="text-center py-4">Hiba.</td></tr>';
    }
    return html;
}

// Fő render: scroll-poz megőrzés + diff-flash + lazy load. reason: 'loaded',
// 'refresh', 'loading', 'error', 'no_token', 'filter', 'lazy'.
function renderAdminUsersTable(options = {}) {
    let rendered = false;
    try {
        const tbody = document.getElementById('adminUsersTbody');
        const wrap = document.getElementById('adminUsersTableWrap');
        if (!tbody) {
            // Nem aktív section, csak state-et frissítünk.
            rendered = false;
        } else {
            const reason = options.reason || 'refresh';
            const list = getFilteredAdminUsers();
            const total = list.length;
            const visibleCount = Math.min(state.users.visibleCount, total);
            const visible = list.slice(0, visibleCount);

            // Meta + footer frissítés
            updateAdminUsersMeta(total, visibleCount);

            // Hibajelzés / üres állapot
            const noToken = !state.adminToken || reason === 'no_token';
            const errored = reason === 'error';
            const loading = reason === 'loading' && state.users.list.length === 0;

            if (noToken) {
                tbody.innerHTML = renderAdminUsersEmptyRow('no_token');
            } else if (errored && state.users.list.length === 0) {
                tbody.innerHTML = renderAdminUsersEmptyRow('error');
            } else if (loading) {
                tbody.innerHTML = renderAdminUsersEmptyRow('loading');
            } else if (total === 0) {
                tbody.innerHTML = renderAdminUsersEmptyRow('empty');
            } else {
                // Diff-render: a saját scroll-konténer (wrap) scrollTop-jat őrizzük meg.
                const wrapScrollTop = wrap ? wrap.scrollTop : 0;
                const pageScrollY = window.scrollY;

                // Meglévő sorok index userId -> tr
                const existingRows = new Map();
                tbody.querySelectorAll('tr.admin-user-row').forEach((tr) => {
                    const id = tr.getAttribute('data-user-id');
                    if (id) existingRows.set(String(id), tr);
                });

                // Új sorrend felépítése — meglévő sort csak akkor cseréljük,
                // ha a signature változott (akkor flash).
                const fragment = document.createDocumentFragment();
                const newSignatures = new Map();
                visible.forEach((user) => {
                    const idStr = String(user.id);
                    const newSig = buildUserSignature(user);
                    newSignatures.set(idStr, newSig);
                    const existing = existingRows.get(idStr);
                    const prevSig = existing?.getAttribute('data-signature');
                    if (existing && prevSig === newSig) {
                        // Változatlan — visszahelyezzük az új pozícióba.
                        fragment.appendChild(existing);
                    } else {
                        const wrapper = document.createElement('tbody');
                        wrapper.innerHTML = renderAdminUserRow(user);
                        const newTr = wrapper.querySelector('tr');
                        if (newTr) {
                            if (existing && prevSig !== newSig) {
                                newTr.classList.add('admin-user-row-flash');
                                setTimeout(() => newTr.classList.remove('admin-user-row-flash'), 1100);
                            } else if (!existing && reason === 'refresh') {
                                newTr.classList.add('admin-user-row-flash-new');
                                setTimeout(() => newTr.classList.remove('admin-user-row-flash-new'), 1400);
                            }
                            fragment.appendChild(newTr);
                        }
                    }
                });

                tbody.replaceChildren(fragment);
                state.users.rowSignatures = newSignatures;

                // scroll poz visszaállítás — wrap scrollTop ÉS window scroll külön
                if (wrap && Math.abs(wrap.scrollTop - wrapScrollTop) > 1) {
                    wrap.scrollTop = wrapScrollTop;
                }
                if (Math.abs(window.scrollY - pageScrollY) > 1) {
                    window.scrollTo({ top: pageScrollY, behavior: 'instant' });
                }
            }

            // IntersectionObserver setup (csak egyszer, az aktív tbody-ra)
            ensureAdminUsersObserver();

            // wrap-en data-state, CSS hookhoz
            if (wrap) {
                wrap.dataset.state = noToken ? 'no_token' : (errored ? 'error' : (total === 0 ? 'empty' : 'loaded'));
            }
            rendered = true;
        }
    } catch (err) {
        console.error('renderAdminUsersTable hiba:', err);
        rendered = false;
    }
    return rendered;
}

function updateAdminUsersMeta(total, visibleCount) {
    try {
        const countEl = document.getElementById('adminUsersCount');
        const timeEl = document.getElementById('adminUsersUpdatedAt');
        const footerEl = document.getElementById('adminUsersFooterText');
        if (countEl) countEl.textContent = `${total} felhasználó`;
        if (timeEl) {
            if (state.users.loading) {
                timeEl.textContent = 'frissítés…';
            } else if (state.users.error) {
                timeEl.textContent = 'hiba';
            } else if (state.users.loadedAt) {
                timeEl.textContent = `frissítve: ${formatRelative(state.users.loadedAt)}`;
            } else {
                timeEl.textContent = '—';
            }
        }
        if (footerEl) {
            if (total === 0) {
                footerEl.textContent = '—';
            } else if (visibleCount >= total) {
                footerEl.textContent = `Mind a ${total} felhasználó megjelenítve.`;
            } else {
                footerEl.textContent = `${visibleCount} / ${total} felhasználó megjelenítve — görgess lefelé a továbbiakhoz.`;
            }
        }
    } catch (err) {
        console.warn('updateAdminUsersMeta hiba:', err);
    }
}

// IntersectionObserver — a sentinel láthatóvá válásakor +50 sor renderelve.
// A scroll-konténer a .admin-users-table-wrap (saját max-height + overflow), így
// az observer root-ja is ez kell legyen.
function ensureAdminUsersObserver() {
    try {
        const sentinel = document.getElementById('adminUsersSentinel');
        const root = document.getElementById('adminUsersTableWrap');
        if (!sentinel || !root) {
            // Nem aktív section
        } else if (state.users.observer && state.users.observer.__sentinel === sentinel && state.users.observer.__root === root) {
            // Már be van kötve ehhez a sentinelhez
        } else {
            if (state.users.observer) {
                try { state.users.observer.disconnect(); } catch (_) { }
            }
            const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const total = getFilteredAdminUsers().length;
                        if (state.users.visibleCount < total) {
                            state.users.visibleCount = Math.min(total, state.users.visibleCount + ADMIN_USERS_PAGE_SIZE);
                            renderAdminUsersTable({ reason: 'lazy' });
                        }
                    }
                });
            }, { root, rootMargin: '300px 0px' });
            observer.observe(sentinel);
            observer.__sentinel = sentinel;
            observer.__root = root;
            state.users.observer = observer;
        }
    } catch (err) {
        console.warn('ensureAdminUsersObserver hiba:', err);
    }
}

// Search input — debounce, hogy gyors gépelés esetén ne reszeljen minden chart.
function onAdminUsersFilterInput(event) {
    try {
        const value = event?.target?.value ?? '';
        state.users.filters.search = value;
        const clearBtn = document.getElementById('adminUsersSearchClear');
        if (clearBtn) clearBtn.classList.toggle('d-none', !value);
        if (state.users.searchDebounceId) clearTimeout(state.users.searchDebounceId);
        state.users.searchDebounceId = setTimeout(() => {
            state.users.visibleCount = ADMIN_USERS_PAGE_SIZE;
            renderAdminUsersTable({ reason: 'filter' });
        }, 180);
    } catch (err) {
        console.warn('onAdminUsersFilterInput hiba:', err);
    }
}

function clearAdminUsersSearch() {
    try {
        const input = document.getElementById('adminUserSearchInput');
        if (input) input.value = '';
        state.users.filters.search = '';
        const clearBtn = document.getElementById('adminUsersSearchClear');
        if (clearBtn) clearBtn.classList.add('d-none');
        state.users.visibleCount = ADMIN_USERS_PAGE_SIZE;
        renderAdminUsersTable({ reason: 'filter' });
    } catch (err) {
        console.warn('clearAdminUsersSearch hiba:', err);
    }
}

// Role / Status / OrderBy select változás — azonnal újrarenderel.
function onAdminUsersFilterChange() {
    try {
        const role = document.getElementById('adminRoleFilter')?.value ?? '';
        const status = document.getElementById('adminStatusFilter')?.value ?? '';
        const orderBy = document.getElementById('adminOrderBy')?.value ?? 'lastActive';
        state.users.filters.role = role;
        state.users.filters.status = status;
        state.users.filters.orderBy = orderBy;
        state.users.visibleCount = ADMIN_USERS_PAGE_SIZE;
        renderAdminUsersTable({ reason: 'filter' });
    } catch (err) {
        console.warn('onAdminUsersFilterChange hiba:', err);
    }
}

// Kézi frissítés gomb
function refreshAdminUsersList() {
    try {
        const btn = document.getElementById('adminUsersRefreshBtn');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('btn-loading');
            const icon = btn.querySelector('i.bi');
            if (icon) icon.classList.add('spin');
            setTimeout(() => {
                btn.disabled = false;
                btn.classList.remove('btn-loading');
                if (icon) icon.classList.remove('spin');
            }, 1200);
        }
        loadAdminUsersList({ silent: true });
    } catch (err) {
        console.warn('refreshAdminUsersList hiba:', err);
    }
}

// stats:tick triggerelt csendes refresh — csak ha a users section aktív
function maybeRefreshAdminUsersOnTick() {
    try {
        if (state.currentSectionId === 'users' && state.adminToken && !state.users.loading) {
            loadAdminUsersList({ silent: true });
        }
    } catch (err) {
        console.warn('maybeRefreshAdminUsersOnTick hiba:', err);
    }
}

// Egy user keresése a state.users.list-ből
function findAdminUserById(userId) {
    let result = null;
    try {
        const numericId = Number(userId);
        if (Number.isFinite(numericId)) {
            const list = Array.isArray(state.users.list) ? state.users.list : [];
            result = list.find((u) => Number(u.id) === numericId) || null;
        }
    } catch (err) {
        console.warn('findAdminUserById hiba:', err);
        result = null;
    }
    return result;
}

// Kiválaszt egy usert szerkesztés / tiltás céljára. nav: cél section.
// Ha a user nincs a betoltott cache-ben (pl. az admin meg nem nyitotta meg a
// Felhasznalok > Lista oldalt), automatikusan async betoltjuk a listat es ujra
// probalkozunk - igy a Bejelentesek panelrol is hasznalhato shortcut-kent.
function selectAdminUser(userId, nav) {
    let ok = false;
    try {
        let user = findAdminUserById(userId);
        if (!user && (!state.users.list || !state.users.list.length)) {
            // Async fallback: a hivot azonnal visszaadjuk false-szal, kozben
            // betoltjuk a listat es ujra probalkozunk.
            loadAdminUsersList({ silent: true }).then(() => {
                const refreshed = findAdminUserById(userId);
                if (refreshed) {
                    state.selectedUserId = refreshed.id;
                    state.selectedUser = refreshed;
                    if (nav) showSection(nav);
                } else {
                    showToast('A felhasználó nem található.', 'warning', 'bi-exclamation-triangle');
                }
            }).catch((err) => {
                console.warn('selectAdminUser betoltesi hiba:', err);
                showToast('Nem sikerült betölteni a felhasználói listát.', 'danger', 'bi-x-circle');
            });
            return false;
        }
        if (user) {
            state.selectedUserId = user.id;
            state.selectedUser = user;
            if (nav) showSection(nav);
            ok = true;
        } else {
            showToast('A felhasználó nem található.', 'warning', 'bi-exclamation-triangle');
        }
    } catch (err) {
        console.error('selectAdminUser hiba:', err);
    }
    return ok;
}

function editAdminUser(userId) {
    return selectAdminUser(userId, 'userDetail');
}

function banAdminUser(userId) {
    return selectAdminUser(userId, 'userBan');
}

function deleteAdminUser(userId) {
    return selectAdminUser(userId, 'userDelete');
}

