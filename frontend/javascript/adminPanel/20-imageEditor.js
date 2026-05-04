/* =============================================================
   Admin profilkép szerkesztő — a profile.js editor admin párja.
   Ugyanaz a kanvas-alapú crop UX, csak az admin végpontra POST-ol
   (azonnali jóváhagyással). Modal: #adminProfileImageEditorModal.
   ============================================================= */
const adminImageEditorState = {
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
    bound: false,
    targetUserId: null,
    bufferCanvas: typeof document !== 'undefined' ? document.createElement('canvas') : null
};

function getAdminImageEditorElements() {
    return {
        modal: document.getElementById('adminProfileImageEditorModal'),
        canvas: document.getElementById('adminProfileImageEditorCanvas'),
        previewCanvas: document.getElementById('adminProfileImageEditorPreview'),
        zoomInput: document.getElementById('adminProfileImageZoom'),
        rotateInput: document.getElementById('adminProfileImageRotate'),
        resetButton: document.getElementById('adminResetProfileImageEditor'),
        saveButton: document.getElementById('adminSaveProfileImageButton'),
        message: document.getElementById('adminProfileImageEditorMessage')
    };
}

function setAdminImageEditorMessage(type, message) {
    const { message: el } = getAdminImageEditorElements();
    if (!el) return;
    if (!message) {
        el.className = 'alert d-none mt-3 mb-0';
        el.textContent = '';
    } else {
        el.className = `alert alert-${type} mt-3 mb-0`;
        el.textContent = message;
    }
}

function resetAdminImageEditorState() {
    const els = getAdminImageEditorElements();
    adminImageEditorState.scale = 1;
    adminImageEditorState.rotationDeg = 0;
    adminImageEditorState.offsetX = 0;
    adminImageEditorState.offsetY = 0;
    adminImageEditorState.dragging = false;
    adminImageEditorState.uploading = false;
    if (els.zoomInput) els.zoomInput.value = '1';
    if (els.rotateInput) els.rotateInput.value = '0';
    if (els.saveButton) {
        els.saveButton.disabled = !adminImageEditorState.image;
        els.saveButton.textContent = 'Mentés és jóváhagyás';
    }
    setAdminImageEditorMessage('danger', '');
}

function revokeAdminImageObjectUrl() {
    if (adminImageEditorState.objectUrl) {
        try { URL.revokeObjectURL(adminImageEditorState.objectUrl); } catch (_) { }
        adminImageEditorState.objectUrl = null;
    }
}

function getAdminEditorCropRadius(canvas) {
    return Math.min(canvas.width, canvas.height) * 0.32;
}

function drawAdminTransformedImage(ctx, image, w, h) {
    ctx.save();
    ctx.translate(w / 2 + adminImageEditorState.offsetX, h / 2 + adminImageEditorState.offsetY);
    ctx.rotate((adminImageEditorState.rotationDeg * Math.PI) / 180);
    ctx.scale(adminImageEditorState.scale, adminImageEditorState.scale);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
}

function renderAdminImageEditor() {
    const els = getAdminImageEditorElements();
    if (!els.canvas || !els.previewCanvas) return;

    const canvas = els.canvas;
    const previewCanvas = els.previewCanvas;
    const rect = canvas.getBoundingClientRect();
    const nextW = Math.max(320, Math.round(rect.width || 640));
    const nextH = Math.max(260, Math.round(rect.height || 340));
    if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const image = adminImageEditorState.image;
    if (!image) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
        ctx.font = '15px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Válassz egy képet a szerkesztéshez.', canvas.width / 2, canvas.height / 2);
        return;
    }

    const cropRadius = getAdminEditorCropRadius(canvas);
    drawAdminTransformedImage(ctx, image, canvas.width, canvas.height);

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

    const buf = adminImageEditorState.bufferCanvas;
    buf.width = canvas.width;
    buf.height = canvas.height;
    const bufCtx = buf.getContext('2d');
    if (!bufCtx) return;
    bufCtx.clearRect(0, 0, buf.width, buf.height);
    drawAdminTransformedImage(bufCtx, image, buf.width, buf.height);

    const previewCtx = previewCanvas.getContext('2d');
    if (!previewCtx) return;
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.save();
    previewCtx.beginPath();
    previewCtx.arc(previewCanvas.width / 2, previewCanvas.height / 2, previewCanvas.width / 2, 0, Math.PI * 2);
    previewCtx.clip();
    previewCtx.drawImage(
        buf,
        canvas.width / 2 - cropRadius, canvas.height / 2 - cropRadius,
        cropRadius * 2, cropRadius * 2,
        0, 0,
        previewCanvas.width, previewCanvas.height
    );
    previewCtx.restore();
}

function getAdminCroppedImageBlob() {
    const { canvas } = getAdminImageEditorElements();
    const image = adminImageEditorState.image;
    if (!canvas || !image) return Promise.reject(new Error('Nincs szerkesztésre kiválasztott kép.'));

    const cropRadius = getAdminEditorCropRadius(canvas);
    const out = document.createElement('canvas');
    out.width = 512;
    out.height = 512;
    const outCtx = out.getContext('2d');
    if (!outCtx) return Promise.reject(new Error('Nem sikerült előkészíteni a mentést.'));

    outCtx.drawImage(
        adminImageEditorState.bufferCanvas,
        canvas.width / 2 - cropRadius, canvas.height / 2 - cropRadius,
        cropRadius * 2, cropRadius * 2,
        0, 0, out.width, out.height
    );

    return new Promise((resolve, reject) => {
        out.toBlob((blob) => {
            if (!blob) reject(new Error('A kép mentése sikertelen.'));
            else resolve(blob);
        }, 'image/png');
    });
}

async function openAdminImageEditorFromFile(file, userId) {
    const els = getAdminImageEditorElements();
    if (!els.modal) throw new Error('Az admin képszerkesztő modal nem elérhető.');

    revokeAdminImageObjectUrl();
    adminImageEditorState.objectUrl = URL.createObjectURL(file);
    adminImageEditorState.targetUserId = userId;

    const image = new Image();
    image.src = adminImageEditorState.objectUrl;
    await new Promise((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('A kép betöltése sikertelen.'));
    });

    adminImageEditorState.image = image;
    resetAdminImageEditorState();

    const modal = bootstrap.Modal.getOrCreateInstance(els.modal);
    modal.show();
    setTimeout(() => renderAdminImageEditor(), 0);
}

async function submitAdminImageUpload() {
    const els = getAdminImageEditorElements();
    if (!els.saveButton || adminImageEditorState.uploading) return;
    if (!adminImageEditorState.image) {
        setAdminImageEditorMessage('danger', 'Nincs szerkesztésre kiválasztott kép.');
        return;
    }
    const userId = Number(adminImageEditorState.targetUserId) || 0;
    if (!userId) {
        setAdminImageEditorMessage('danger', 'Nincs kiválasztott felhasználó a feltöltéshez.');
        return;
    }

    adminImageEditorState.uploading = true;
    els.saveButton.disabled = true;
    els.saveButton.textContent = 'Feltöltés…';
    setAdminImageEditorMessage('info', 'Feltöltés folyamatban — azonnali jóváhagyással.');

    try {
        const blob = await getAdminCroppedImageBlob();
        const formData = new FormData();
        formData.append('image', blob, 'admin-profile-image.png');
        formData.append('reason', 'admin_profile_image_replace');

        const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/profile-image`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: adminAuthHeaders(),
            body: formData
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.success) {
            throw new Error(result?.message || 'A képfeltöltés nem sikerült.');
        }

        applyAdminUserPartialUpdate(userId, {
            profileImage: result?.data?.profileImage || `/profile_pictures/?t=${Date.now()}`,
            profileImageStatus: result?.data?.profileImageStatus || 'approved'
        });

        setAdminUserDetailImageMessage('success', result?.message || 'Profilkép feltöltve és jóváhagyva.');
        showToast('Profilkép feltöltve (jóváhagyott).', 'success', 'bi-check2-circle');

        const modal = bootstrap.Modal.getOrCreateInstance(els.modal);
        modal.hide();
    } catch (error) {
        setAdminImageEditorMessage('danger', error?.message || 'Hiba történt a képfeltöltés közben.');
    } finally {
        adminImageEditorState.uploading = false;
        if (els.saveButton) {
            els.saveButton.disabled = !adminImageEditorState.image;
            els.saveButton.textContent = 'Mentés és jóváhagyás';
        }
    }
}

function bindAdminImageEditorEvents() {
    if (adminImageEditorState.bound) return;
    const els = getAdminImageEditorElements();
    if (!els.modal || !els.canvas) return;
    adminImageEditorState.bound = true;

    if (els.zoomInput) {
        els.zoomInput.addEventListener('input', () => {
            adminImageEditorState.scale = Number(els.zoomInput.value) || 1;
            renderAdminImageEditor();
        });
    }
    if (els.rotateInput) {
        els.rotateInput.addEventListener('input', () => {
            adminImageEditorState.rotationDeg = Number(els.rotateInput.value) || 0;
            renderAdminImageEditor();
        });
    }
    if (els.resetButton) {
        els.resetButton.addEventListener('click', () => {
            resetAdminImageEditorState();
            renderAdminImageEditor();
        });
    }
    if (els.saveButton) {
        els.saveButton.addEventListener('click', () => { submitAdminImageUpload(); });
    }

    const canvas = els.canvas;
    canvas.addEventListener('pointerdown', (event) => {
        if (!adminImageEditorState.image || adminImageEditorState.uploading) return;
        adminImageEditorState.dragging = true;
        adminImageEditorState.lastPointerX = event.clientX;
        adminImageEditorState.lastPointerY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
        if (!adminImageEditorState.dragging || !adminImageEditorState.image) return;
        const dx = event.clientX - adminImageEditorState.lastPointerX;
        const dy = event.clientY - adminImageEditorState.lastPointerY;
        adminImageEditorState.lastPointerX = event.clientX;
        adminImageEditorState.lastPointerY = event.clientY;
        adminImageEditorState.offsetX += dx;
        adminImageEditorState.offsetY += dy;
        renderAdminImageEditor();
    });
    const stopDrag = (event) => {
        if (adminImageEditorState.dragging) {
            adminImageEditorState.dragging = false;
            if (typeof event.pointerId === 'number') {
                try { canvas.releasePointerCapture(event.pointerId); } catch (_) { }
            }
        }
    };
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);
    canvas.addEventListener('pointerleave', stopDrag);

    els.modal.addEventListener('shown.bs.modal', () => renderAdminImageEditor());
    els.modal.addEventListener('hidden.bs.modal', () => {
        adminImageEditorState.image = null;
        adminImageEditorState.targetUserId = null;
        revokeAdminImageObjectUrl();
        resetAdminImageEditorState();
        const input = document.getElementById('adminUserDetailImageUpload');
        if (input) input.value = '';
    });

    window.addEventListener('resize', () => {
        if (adminImageEditorState.image) renderAdminImageEditor();
    });
}

async function handleAdminUserDetailImageInputChange(event) {
    const input = event?.target || document.getElementById('adminUserDetailImageUpload');
    try {
        const selectedUser = state.selectedUser;
        if (!selectedUser || !selectedUser.id) throw new Error('Nincs kiválasztott felhasználó.');

        const file = input?.files?.[0] || null;
        const validationError = validateAdminUserDetailImageFile(file);
        if (validationError) throw new Error(validationError);

        bindAdminImageEditorEvents();
        await openAdminImageEditorFromFile(file, selectedUser.id);
        setAdminUserDetailImageMessage('info', 'Kép szerkesztése folyamatban…');
    } catch (err) {
        setAdminUserDetailImageMessage('danger', err?.message || 'A kiválasztott kép nem nyitható meg.');
    } finally {
        if (input) input.value = '';
    }
}

async function handleAdminUserDetailImageRemove() {
    try {
        const selectedUser = state.selectedUser;
        if (!selectedUser || !selectedUser.id) {
            throw new Error('Nincs kiválasztott felhasználó.');
        }

        setAdminUserDetailImageMessage('info', 'Profilkép eltávolítása...');

        let backendSuccess = false;
        try {
            const response = await fetch(`/api/admin/users/${encodeURIComponent(selectedUser.id)}/profile-image/remove`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ reason: 'admin_remove_profile_image' })
            });
            const result = await response.json().catch(() => ({}));
            if (response.ok && result?.success) {
                backendSuccess = true;
                applyAdminUserPartialUpdate(selectedUser.id, {
                    profileImage: '/profile_pictures/default.png',
                    profileImageStatus: 'default'
                });
                setAdminUserDetailImageMessage('success', result?.message || 'Profilkép eltávolítva.');
            }
        } catch (_) {
            backendSuccess = false;
        }

        if (!backendSuccess) {
            const previous = String(selectedUser.profileImage || '');
            if (previous.startsWith('blob:')) {
                try { URL.revokeObjectURL(previous); } catch (_) { }
            }
            applyAdminUserPartialUpdate(selectedUser.id, {
                profileImage: '/profile_pictures/default.png',
                profileImageStatus: 'default'
            });
            setAdminUserDetailImageMessage('warning', 'Frontend állapot frissítve. A végleges mentéshez backend endpoint szükséges.');
        }
    } catch (err) {
        setAdminUserDetailImageMessage('danger', err?.message || 'A profilkép eltávolítása sikertelen.');
    }
}

/* ---------- Admin User View Modal (két-tabos audit log) ---------- */

function openAdminUserView(userId) {
    let opened = false;
    try {
        const user = findAdminUserById(userId);
        const modalEl = document.getElementById('adminUserViewModal');
        if (!user) {
            showToast('A felhasználó nem található.', 'warning', 'bi-exclamation-triangle');
        } else if (!modalEl || !window.bootstrap?.Modal) {
            showToast('A megtekintés modal nem elérhető.', 'danger', 'bi-x-circle');
        } else {
            stopAdminUserViewRefresh();
            state.userView.userId = user.id;
            state.userView.activeTab = 'target';
            state.userView.target = { items: [], loading: false, error: null, loadedAt: null };
            state.userView.actor = { items: [], loading: false, error: null, loadedAt: null };
            state.userView.security = { items: [], loading: false, error: null, loadedAt: null, filter: 'all' };
            state.userView.presence = { online: false, tabs: [], loadedAt: null, refreshTimerId: null };
            renderAdminUserViewModal(user);
            updateAdminUserViewTabsHint('target');
            const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
            modal.show();
            loadAdminUserAuditTab('target');
            loadAdminUserPresence();
            startAdminUserViewRefresh();
            modalEl.addEventListener('hidden.bs.modal', stopAdminUserViewRefresh, { once: true });
            opened = true;
        }
    } catch (err) {
        console.error('openAdminUserView hiba:', err);
        showToast('Hiba a megtekintés megnyitásakor.', 'danger', 'bi-x-circle');
    }
    return opened;
}

function renderAdminUserViewModal(user) {
    try {
        if (user) {
            const avatarEl = document.getElementById('adminUserViewAvatar');
            if (avatarEl && window.MattMesterProfileImage) {
                window.MattMesterProfileImage.applyProfileImagePresentation(avatarEl, {
                    source: { username: user.username, profile_image: user.profileImage },
                    size: 96
                });
            }
            setText('adminUserViewName', user.username || '—');
            setText('adminUserViewEmail', user.email || '—');
            setText('adminUserViewEloClassic', String(Number(user.elo || 0)));
            setText('adminUserViewEloMM', String(Number(user.eloMM || 0)));
            setText('adminUserViewEloBullet', String(Number(user.eloBullet || 0)));
            setText('adminUserViewWins', String(Number(user.wins || 0)));
            setText('adminUserViewLosses', String(Number(user.losses || 0)));
            setText('adminUserViewDraws', String(Number(user.draws || 0)));
            setText('adminUserViewWinRate', `${Number(user.winRate || 0).toFixed(1)}%`);
            setText('adminUserViewLastActive', user.lastActive ? formatRelative(user.lastActive) : '—');
            setText('adminUserViewJoined', formatDateOnly(user.createdAt));
            setText('adminUserViewLastIp', user.lastIp || '—');
            setText('adminUserViewId', `#${user.id}`);

            const roleBadge = document.getElementById('adminUserViewRole');
            if (roleBadge) roleBadge.outerHTML = `<span id="adminUserViewRole">${rolePill(user.role === 'admin' ? 'admin' : 'player')}</span>`;
            const statusBadge = document.getElementById('adminUserViewStatus');
            if (statusBadge) statusBadge.outerHTML = `<span id="adminUserViewStatus">${user.isBanned ? statusPill('banned') : renderPresenceStatusBadgeInline(user)}</span>`;

            const emailVerifiedEl = document.getElementById('adminUserViewEmailVerified');
            if (emailVerifiedEl) emailVerifiedEl.outerHTML = renderEmailVerifiedBadge(user);
            const imageStatusEl = document.getElementById('adminUserViewImageStatus');
            if (imageStatusEl) imageStatusEl.outerHTML = renderProfileImageStatusBadge(user);

            // Tab gombok edit/ban onclick — modal-ba menjen
            const editBtn = document.getElementById('adminUserViewEditBtn');
            if (editBtn) editBtn.onclick = () => { closeAdminUserViewModal(); editAdminUser(user.id); };
            const banBtn = document.getElementById('adminUserViewBanBtn');
            if (banBtn) banBtn.onclick = () => { closeAdminUserViewModal(); banAdminUser(user.id); };
        }
    } catch (err) {
        console.error('renderAdminUserViewModal hiba:', err);
    }
}

function closeAdminUserViewModal() {
    try {
        const modalEl = document.getElementById('adminUserViewModal');
        if (modalEl && window.bootstrap?.Modal) {
            window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
        }
    } catch (err) {
        console.warn('closeAdminUserViewModal hiba:', err);
    }
}

// Tab váltás
function switchAdminUserViewTab(tabKey) {
    try {
        if (tabKey === 'target' || tabKey === 'actor' || tabKey === 'security') {
            state.userView.activeTab = tabKey;
            document.querySelectorAll('.admin-user-view-tab').forEach((btn) => {
                const isActive = btn.dataset.tab === tabKey;
                btn.classList.toggle('is-active', isActive);
            });
            document.querySelectorAll('.admin-user-view-tab-pane').forEach((pane) => {
                const isActive = pane.dataset.tab === tabKey;
                pane.classList.toggle('d-none', !isActive);
            });
            updateAdminUserViewTabsHint(tabKey);
            // Lazy load: ha még nincs adat ezen a tabon, betöltjük.
            const slot = state.userView[tabKey];
            if (slot && !slot.loadedAt && !slot.loading) {
                if (tabKey === 'security') {
                    loadAdminUserSecurityActivity();
                } else {
                    loadAdminUserAuditTab(tabKey);
                }
            } else if (tabKey === 'security') {
                // Már be volt töltve — de a filter alapján újrarenderelünk a legutóbbi fülre váltáskor.
                renderAdminUserViewSecurityList();
            }
        }
    } catch (err) {
        console.warn('switchAdminUserViewTab hiba:', err);
    }
}

// /api/admin/audit/search lekérés a megfelelő szűréssel
async function loadAdminUserAuditTab(tabKey) {
    let success = false;
    try {
        const userId = state.userView.userId;
        const slot = state.userView[tabKey];
        if (!userId || !slot) {
            // nincs mit
        } else if (!state.adminToken) {
            slot.error = 'Nincs admin token.';
            renderAdminUserViewAuditList(tabKey);
        } else {
            slot.loading = true;
            slot.error = null;
            renderAdminUserViewAuditList(tabKey);

            const params = new URLSearchParams();
            params.set('limit', '100');
            if (tabKey === 'target') {
                params.set('targetType', 'user');
                params.set('targetId', String(userId));
            } else {
                params.set('actorUserId', String(userId));
            }
            const headers = adminAuthHeaders({ Accept: 'application/json' });
            const response = await fetch(`/api/admin/audit/search?${params.toString()}`, {
                method: 'GET',
                credentials: 'same-origin',
                headers
            });
            if (!response.ok) {
                let bodyMessage = `HTTP ${response.status}`;
                try {
                    const body = await response.json();
                    if (body?.message) bodyMessage = body.message;
                } catch (_) { }
                if (response.status === 401 || response.status === 403) {
                    handleAdminAuthError('admin_token_required');
                }
                slot.error = bodyMessage;
                slot.loading = false;
                renderAdminUserViewAuditList(tabKey);
            } else {
                const json = await response.json();
                const items = Array.isArray(json?.data) ? json.data : (Array.isArray(json?.data?.items) ? json.data.items : []);
                slot.items = items;
                slot.loadedAt = new Date();
                slot.loading = false;
                renderAdminUserViewAuditList(tabKey);
                success = true;
            }
        }
    } catch (err) {
        console.error('loadAdminUserAuditTab hiba:', err);
        const slot = state.userView[tabKey];
        if (slot) {
            slot.error = err?.message || 'Hálózati hiba.';
            slot.loading = false;
            renderAdminUserViewAuditList(tabKey);
        }
    }
    return success;
}

function renderAdminUserViewAuditList(tabKey) {
    try {
        const container = document.querySelector(`.admin-user-view-tab-pane[data-tab="${tabKey}"] .admin-user-view-audit-list`);
        if (container) {
            const slot = state.userView[tabKey];
            if (slot.loading) {
                container.innerHTML = `<li class="admin-user-view-empty"><i class="bi bi-arrow-repeat spin"></i><div>Naplóbejegyzések betöltése…</div></li>`;
            } else if (slot.error) {
                container.innerHTML = `<li class="admin-user-view-empty admin-user-view-empty-error"><i class="bi bi-exclamation-triangle"></i><div>${escapeHtml(slot.error)}</div></li>`;
            } else if (!slot.items.length) {
                const emptyMsg = tabKey === 'target'
                    ? 'Még nincs naplóbejegyzés erről a felhasználóról.'
                    : 'Ez a felhasználó még nem hajtott végre admin műveletet.';
                container.innerHTML = `<li class="admin-user-view-empty"><i class="bi bi-inbox"></i><div>${emptyMsg}</div></li>`;
            } else {
                container.innerHTML = slot.items.map(renderAdminUserAuditEntry).join('');
            }
        }
    } catch (err) {
        console.warn('renderAdminUserViewAuditList hiba:', err);
    }
}

function renderAdminUserAuditEntry(entry) {
    let html = '';
    try {
        if (entry) {
            const sev = entry.severity || 'info';
            const time = formatAuditTime(entry.occurredAt);
            const action = entry.action || '—';
            const actor = entry.actor?.username || entry.actor?.id || '—';
            const target = entry.target?.label || entry.target?.id || '—';
            const reason = entry.reason ? escapeHtml(entry.reason) : '';
            html = `
                <li class="admin-user-view-audit-row sev-${sev}">
                    <div class="admin-user-view-audit-meta">
                        <span class="admin-user-view-audit-time">${escapeHtml(time)}</span>
                        ${severityPill(sev)}
                    </div>
                    <div class="admin-user-view-audit-body">
                        <div class="admin-user-view-audit-action">${escapeHtml(action)}</div>
                        <div class="admin-user-view-audit-targets">
                            <span class="text-muted">actor:</span> <span class="text-white">${escapeHtml(actor)}</span>
                            <span class="text-muted ms-2">target:</span> <span class="text-white">${escapeHtml(target)}</span>
                        </div>
                        ${reason ? `<div class="admin-user-view-audit-reason"><i class="bi bi-chat-left-quote"></i>${reason}</div>` : ''}
                    </div>
                </li>
            `;
        }
    } catch (err) {
        console.warn('renderAdminUserAuditEntry hiba:', err);
        html = '';
    }
    return html;
}

// Tab fejléc hint szövegének frissítése (jobb felső kis info)
function updateAdminUserViewTabsHint(tabKey) {
    let updated = false;
    try {
        const hintEl = document.getElementById('adminUserViewTabsHint');
        if (hintEl) {
            const messages = {
                target: '<i class="bi bi-info-circle me-1"></i>Audit napló — utolsó 100',
                actor: '<i class="bi bi-info-circle me-1"></i>Admin műveletek — utolsó 100',
                security: '<i class="bi bi-shield-lock me-1"></i>A felhasználó saját biztonsági naplója (max 150)'
            };
            hintEl.innerHTML = messages[tabKey] || messages.target;
            updated = true;
        }
    } catch (err) {
        console.warn('updateAdminUserViewTabsHint hiba:', err);
    }
    return updated;
}

/* ---------- Security activity (a user által saját profilján is látható log) ---------- */

const ADMIN_USER_VIEW_SECURITY_FILTERS = new Set(['all', 'auth', 'security', 'profile', 'social']);

async function loadAdminUserSecurityActivity() {
    let success = false;
    try {
        const userId = state.userView.userId;
        const slot = state.userView.security;
        if (!userId || !slot) {
            // nincs mit
        } else if (!state.adminToken) {
            slot.error = 'Nincs admin token.';
            renderAdminUserViewSecurityList();
        } else {
            slot.loading = true;
            slot.error = null;
            renderAdminUserViewSecurityList();
            const headers = adminAuthHeaders({ Accept: 'application/json' });
            const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/security-activity?limit=150`, {
                method: 'GET',
                credentials: 'same-origin',
                headers
            });
            if (!response.ok) {
                let bodyMessage = `HTTP ${response.status}`;
                try {
                    const body = await response.json();
                    if (body?.message) bodyMessage = body.message;
                } catch (_) { }
                if (response.status === 401 || response.status === 403) {
                    handleAdminAuthError('admin_token_required');
                }
                slot.error = bodyMessage;
                slot.loading = false;
                renderAdminUserViewSecurityList();
            } else {
                const json = await response.json();
                slot.items = Array.isArray(json?.data) ? json.data : [];
                slot.loadedAt = new Date();
                slot.loading = false;
                renderAdminUserViewSecurityList();
                success = true;
            }
        }
    } catch (err) {
        console.error('loadAdminUserSecurityActivity hiba:', err);
        const slot = state.userView.security;
        if (slot) {
            slot.error = err?.message || 'Hálózati hiba.';
            slot.loading = false;
            renderAdminUserViewSecurityList();
        }
    }
    return success;
}

function setAdminUserViewSecurityFilter(filter) {
    let applied = false;
    try {
        if (ADMIN_USER_VIEW_SECURITY_FILTERS.has(filter)) {
            state.userView.security.filter = filter;
            document.querySelectorAll('.admin-user-view-sec-filter').forEach((btn) => {
                btn.classList.toggle('is-active', btn.dataset.secFilter === filter);
            });
            renderAdminUserViewSecurityList();
            applied = true;
        }
    } catch (err) {
        console.warn('setAdminUserViewSecurityFilter hiba:', err);
    }
    return applied;
}

function renderAdminUserViewSecurityList() {
    let rendered = false;
    try {
        const container = document.querySelector('.admin-user-view-tab-pane[data-tab="security"] .admin-user-view-security-list');
        if (container) {
            const slot = state.userView.security;
            if (slot.loading) {
                container.innerHTML = `<li class="admin-user-view-empty"><i class="bi bi-arrow-repeat spin"></i><div>Biztonsági napló betöltése…</div></li>`;
            } else if (slot.error) {
                container.innerHTML = `<li class="admin-user-view-empty admin-user-view-empty-error"><i class="bi bi-exclamation-triangle"></i><div>${escapeHtml(slot.error)}</div></li>`;
            } else {
                const filter = slot.filter || 'all';
                const items = filter === 'all'
                    ? slot.items
                    : slot.items.filter((item) => String(item?.eventCategory || '').toLowerCase() === filter);
                if (!items.length) {
                    container.innerHTML = `<li class="admin-user-view-empty"><i class="bi bi-inbox"></i><div>Nincs találat ehhez a szűrőhöz.</div></li>`;
                } else {
                    container.innerHTML = items.map(renderAdminUserSecurityEntry).join('');
                }
            }
            rendered = true;
        }
    } catch (err) {
        console.warn('renderAdminUserViewSecurityList hiba:', err);
    }
    return rendered;
}

function renderAdminUserSecurityEntry(entry) {
    let html = '';
    try {
        if (entry) {
            const sev = entry.severity || 'info';
            const time = entry.occurredAt
                ? `${formatDateOnly(entry.occurredAt)} ${formatAuditTime(entry.occurredAt)}`
                : '—';
            const ok = entry.success === false ? 'fail' : (entry.success === true ? 'ok' : 'na');
            const okIcon = ok === 'ok' ? 'bi-check-circle-fill text-success'
                : ok === 'fail' ? 'bi-x-circle-fill text-danger'
                    : 'bi-dash-circle text-muted';
            const eventLabel = entry.eventType || entry.message || '—';
            const category = entry.eventCategory || 'all';
            const ip = entry.ipAddress || '—';
            const ua = entry.userAgent ? entry.userAgent.split(')')[0].split('(').pop() : '';
            html = `
                <li class="admin-user-view-security-row sev-${sev}">
                    <div class="admin-user-view-security-meta">
                        <span class="admin-user-view-security-time">${escapeHtml(time)}</span>
                        <span class="admin-user-view-security-cat" data-cat="${escapeHtml(category)}">${escapeHtml(category)}</span>
                    </div>
                    <div class="admin-user-view-security-body">
                        <div class="admin-user-view-security-event">
                            <i class="bi ${okIcon} me-1"></i>${escapeHtml(eventLabel)}
                        </div>
                        ${entry.message && entry.message !== eventLabel ? `<div class="admin-user-view-security-msg text-secondary small">${escapeHtml(entry.message)}</div>` : ''}
                        <div class="admin-user-view-security-tech text-secondary small">
                            <span><i class="bi bi-globe me-1"></i><span class="font-monospace">${escapeHtml(ip)}</span></span>
                            ${ua ? `<span class="ms-2"><i class="bi bi-browser-chrome me-1"></i>${escapeHtml(ua)}</span>` : ''}
                        </div>
                    </div>
                </li>
            `;
        }
    } catch (err) {
        console.warn('renderAdminUserSecurityEntry hiba:', err);
        html = '';
    }
    return html;
}

/* ---------- Presence panel ---------- */

async function loadAdminUserPresence() {
    let success = false;
    try {
        const userId = state.userView.userId;
        if (!userId) {
            // nincs mit
        } else if (!state.adminToken) {
            renderAdminUserViewPresence({ online: false, tabs: [] });
        } else {
            const headers = adminAuthHeaders({ Accept: 'application/json' });
            const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/presence`, {
                method: 'GET',
                credentials: 'same-origin',
                headers
            });
            if (response.ok) {
                const json = await response.json();
                const data = json?.data || { online: false };
                state.userView.presence.online = Boolean(data.online);
                state.userView.presence.tabs = Array.isArray(data.tabs) ? data.tabs : [];
                state.userView.presence.loadedAt = new Date();
                renderAdminUserViewPresence(data);
                success = true;
            } else {
                renderAdminUserViewPresence({ online: false, tabs: [] });
            }
        }
    } catch (err) {
        console.warn('loadAdminUserPresence hiba:', err);
        renderAdminUserViewPresence({ online: false, tabs: [] });
    }
    return success;
}

function renderAdminUserViewPresence(data) {
    let rendered = false;
    try {
        const panel = document.getElementById('adminUserViewPresence');
        const badge = document.getElementById('adminUserViewPresenceBadge');
        const label = document.getElementById('adminUserViewPresenceLabel');
        const meta = document.getElementById('adminUserViewPresenceMeta');
        const tabsList = document.getElementById('adminUserViewPresenceTabs');
        if (panel && badge && label && meta && tabsList) {
            const online = Boolean(data?.online);
            panel.dataset.state = online ? 'online' : 'offline';
            badge.classList.toggle('user-presence-online', online);
            badge.classList.toggle('user-presence-offline', !online);
            if (online) {
                label.textContent = 'Online';
                const tabCount = Number(data.tabCount || data.tabs?.length || 0);
                const sockets = Number(data.socketCount || 0);
                meta.textContent = `${tabCount} tab · ${sockets} socket${data.lastSeenAt ? ` · utolsó: ${formatRelative(data.lastSeenAt)}` : ''}`;
                const tabs = Array.isArray(data.tabs) ? data.tabs : [];
                tabsList.innerHTML = tabs.length === 0
                    ? `<li class="admin-user-view-presence-empty">Nincs aktív tab.</li>`
                    : tabs.map((tab) => `
                        <li class="admin-user-view-presence-tab">
                            <i class="bi bi-window"></i>
                            <span class="admin-user-view-presence-page">${escapeHtml(tab.page || '/')}</span>
                            <span class="admin-user-view-presence-time text-secondary">${escapeHtml(tab.lastSeenAt ? formatRelative(tab.lastSeenAt) : '—')}</span>
                        </li>
                    `).join('');
            } else {
                label.textContent = 'Offline';
                meta.textContent = '—';
                tabsList.innerHTML = '';
            }
            rendered = true;
        }
    } catch (err) {
        console.warn('renderAdminUserViewPresence hiba:', err);
    }
    return rendered;
}

// Egysegesitett 5 mp-es modal-frissito: presence + felhasznaloi alapadatok
// (REST users/list silent refresh + re-render) + az aktiv audit/security tab.
// Egy timer az egesz modalra; modal bezarasakor leall.
const ADMIN_USER_VIEW_REFRESH_MS = 5000;

async function refreshAdminUserViewModal() {
    let refreshed = false;
    try {
        const userId = state.userView.userId;
        const modalEl = document.getElementById('adminUserViewModal');
        const modalOpen = Boolean(modalEl?.classList.contains('show'));
        if (userId && modalOpen) {
            // 1) presence
            loadAdminUserPresence();
            // 2) Az aktiv tab adatai (csendben, hogy ne villantsa a "loading"-ot)
            const tab = state.userView.activeTab;
            if (tab === 'security') {
                refreshAdminUserSecurityActivitySilent();
            } else if (tab === 'target' || tab === 'actor') {
                refreshAdminUserAuditTabSilent(tab);
            }
            // 3) User alapadatok — REST users/list silent refresh, majd re-render
            await loadAdminUsersList({ silent: true });
            const updated = findAdminUserById(userId);
            if (updated) {
                renderAdminUserViewModal(updated);
            }
            refreshed = true;
        }
    } catch (err) {
        console.warn('refreshAdminUserViewModal hiba:', err);
    }
    return refreshed;
}

// Csendes audit refresh — nem mutat "betoltodes" allapotot, csak frissiti az
// items-et es egyetlen alkalommal renderelni, ha a felhasznalo meg ezt a tabot nezi.
async function refreshAdminUserAuditTabSilent(tabKey) {
    let success = false;
    try {
        const userId = state.userView.userId;
        const slot = state.userView[tabKey];
        if (!userId || !slot || !state.adminToken) {
            // semmi
        } else {
            const params = new URLSearchParams();
            params.set('limit', '100');
            if (tabKey === 'target') {
                params.set('targetType', 'user');
                params.set('targetId', String(userId));
            } else {
                params.set('actorUserId', String(userId));
            }
            const headers = adminAuthHeaders({ Accept: 'application/json' });
            const response = await fetch(`/api/admin/audit/search?${params.toString()}`, {
                method: 'GET', credentials: 'same-origin', headers
            });
            if (response.ok) {
                const json = await response.json();
                const items = Array.isArray(json?.data) ? json.data : (Array.isArray(json?.data?.items) ? json.data.items : []);
                slot.items = items;
                slot.loadedAt = new Date();
                if (state.userView.activeTab === tabKey) {
                    renderAdminUserViewAuditList(tabKey);
                }
                success = true;
            }
        }
    } catch (err) {
        console.warn('refreshAdminUserAuditTabSilent hiba:', err);
    }
    return success;
}

async function refreshAdminUserSecurityActivitySilent() {
    let success = false;
    try {
        const userId = state.userView.userId;
        const slot = state.userView.security;
        if (!userId || !slot || !state.adminToken) {
            // semmi
        } else {
            const headers = adminAuthHeaders({ Accept: 'application/json' });
            const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/security-activity?limit=150`, {
                method: 'GET', credentials: 'same-origin', headers
            });
            if (response.ok) {
                const json = await response.json();
                slot.items = Array.isArray(json?.data) ? json.data : [];
                slot.loadedAt = new Date();
                if (state.userView.activeTab === 'security') {
                    renderAdminUserViewSecurityList();
                }
                success = true;
            }
        }
    } catch (err) {
        console.warn('refreshAdminUserSecurityActivitySilent hiba:', err);
    }
    return success;
}

function startAdminUserViewRefresh() {
    let started = false;
    try {
        stopAdminUserViewRefresh();
        state.userView.refreshTimerId = setInterval(refreshAdminUserViewModal, ADMIN_USER_VIEW_REFRESH_MS);
        started = true;
    } catch (err) {
        console.warn('startAdminUserViewRefresh hiba:', err);
    }
    return started;
}

function stopAdminUserViewRefresh() {
    let stopped = false;
    try {
        if (state.userView.refreshTimerId) {
            clearInterval(state.userView.refreshTimerId);
            state.userView.refreshTimerId = null;
        }
        if (state.userView.presence && state.userView.presence.refreshTimerId) {
            clearInterval(state.userView.presence.refreshTimerId);
            state.userView.presence.refreshTimerId = null;
        }
        stopped = true;
    } catch (err) {
        console.warn('stopAdminUserViewRefresh hiba:', err);
    }
    return stopped;
}

