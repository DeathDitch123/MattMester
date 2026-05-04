/* =============================================================
   19) Profilkép moderáció - admin tokennel
   ============================================================= */
window.MattMesterAdminProfileImages = (function initAdminProfileImages() {
    const STATE = { loading: false, bound: false, pendingRejectUploadId: 0 };
    let rejectModalInstance = null;

    function getRejectModalInstance() {
        if (rejectModalInstance) return rejectModalInstance;
        const el = document.getElementById('profileImageRejectModal');
        if (!el || typeof bootstrap === 'undefined') return null;
        rejectModalInstance = bootstrap.Modal.getOrCreateInstance(el);
        return rejectModalInstance;
    }

    function updateRejectReasonCounter() {
        const reasonField = document.getElementById('profileImageRejectReason');
        const counter = document.getElementById('profileImageRejectReasonCount');
        const confirmBtn = document.getElementById('profileImageRejectConfirmBtn');
        if (!reasonField || !counter) return;
        const len = reasonField.value.trim().length;
        counter.textContent = String(len);
        const valid = len >= 10 && len <= 500;
        counter.parentElement?.classList.toggle('valid', valid);
        if (confirmBtn) confirmBtn.disabled = !valid;
    }

    function setMessage(type, message) {
        const el = document.getElementById('profileImageReviewMessage');
        if (!el) return;
        if (!message) {
            el.className = 'alert d-none';
            el.textContent = '';
        } else {
            el.className = `alert alert-${type}`;
            el.textContent = message;
        }
    }

    function renderRows(rows) {
        const tbody = document.getElementById('profileImageReviewTableBody');
        if (!tbody) return;
        if (!rows || !rows.length) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-secondary py-4">${tx('Nincs függő profilkép.', 'No pending profile pictures.')}</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map((row) => {
            const safeUsername = escapeHtml(row.username || '');
            const safeFilename = escapeHtml(row.filename || '/profile_pictures/default.png');
            const safeUploadTime = escapeHtml(row.uploadTime || '');
            const safeUploadId = Number(row.uploadId) || 0;
            return `
                <tr data-upload-id="${safeUploadId}">
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            <strong>${safeUsername}</strong>
                            <span class="text-secondary small">#${escapeHtml(row.userId)}</span>
                        </div>
                    </td>
                    <td>
                        <a href="${safeFilename}" target="_blank" rel="noopener noreferrer">
                            <img src="${safeFilename}" alt="${tx('Pending profilkép', 'Pending profile picture')}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.1);">
                        </a>
                    </td>
                    <td><span class="text-secondary small">${safeUploadTime}</span></td>
                    <td class="text-end">
                        <button type="button" class="btn btn-success btn-sm me-2" data-action="approve" data-upload-id="${safeUploadId}">
                            <i class="bi bi-check-circle me-1"></i>${tx('Jóváhagy', 'Approve')}
                        </button>
                        <button type="button" class="btn btn-outline-danger btn-sm" data-action="reject" data-upload-id="${safeUploadId}" data-username="${safeUsername}">
                            <i class="bi bi-x-circle me-1"></i>${tx('Elutasít', 'Reject')}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function refresh() {
        let refreshed = false;
        try {
            if (!STATE.loading) {
                STATE.loading = true;
                setMessage(null, '');

                const response = await fetch('/api/admin/profile-images/pending', {
                    headers: adminAuthHeaders(),
                    credentials: 'same-origin'
                });
                const result = await response.json().catch(() => ({}));
                const authHandled = response.status === 401 && handleAdminAuthError(result?.code || '');
                if (authHandled) {
                    renderRows([]);
                } else if (!response.ok || !result?.success) {
                    throw new Error(result?.message || tx('Hiba a függő profilképek lekérdezése során.', 'Error fetching pending profile pictures.'));
                } else {
                    renderRows(result.data || []);
                    refreshed = true;
                }
            }
        } catch (error) {
            console.error('admin profile-images pending fetch hiba:', error);
            setMessage('danger', error.message || tx('Hiba a lekérdezés során.', 'Error during fetch.'));
            renderRows([]);
        } finally {
            STATE.loading = false;
        }

        return refreshed;
    }

    async function approve(uploadId) {
        const id = Number(uploadId) || 0;
        if (!id) return false;
        let approved = false;
        try {
            setMessage(null, '');
            const response = await fetch(`/api/admin/profile-images/${id}/approve`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({})
            });
            const result = await response.json().catch(() => ({}));
            if (response.status === 401 && handleAdminAuthError(result?.code || '')) {
                return false;
            }
            if (!response.ok || !result?.success) {
                throw new Error(result?.message || tx('A jóváhagyás sikertelen.', 'Approval failed.'));
            }
            approved = true;
            setMessage('success', result.message || tx('A profilkép jóváhagyva.', 'Profile picture approved.'));
            if (typeof showToast === 'function') {
                showToast(tx('Profilkép jóváhagyva.', 'Profile picture approved.'), 'success', 'bi-check-circle-fill');
            }
            await refresh();
        } catch (error) {
            console.error('admin profile-image approve hiba:', error);
            setMessage('danger', error.message || tx('A jóváhagyás sikertelen.', 'Approval failed.'));
        }

        return approved;
    }

    // A reject() csak megnyitja a modal-t — a tenyleges API hivast a confirm gomb
    // (lasd bind() -> profileImageRejectConfirmBtn handler) intezi.
    function reject(uploadId, username = '') {
        const id = Number(uploadId) || 0;
        if (!id) return false;
        STATE.pendingRejectUploadId = id;

        const userLabel = document.getElementById('profileImageRejectModalUser');
        if (userLabel) userLabel.textContent = username || '—';

        const reasonField = document.getElementById('profileImageRejectReason');
        if (reasonField) reasonField.value = '';
        updateRejectReasonCounter();

        const modal = getRejectModalInstance();
        if (!modal) {
            setMessage('danger', tx('A modal nem érhető el. Frissítsd az oldalt.', 'Modal unavailable. Refresh the page.'));
            return false;
        }
        modal.show();
        setTimeout(() => reasonField?.focus(), 200);
        return true;
    }

    async function performReject(uploadId, reviewNote) {
        const id = Number(uploadId) || 0;
        if (!id) return false;
        if (!reviewNote || reviewNote.length < 10) return false;

        let rejected = false;
        try {
            setMessage(null, '');
            const response = await fetch(`/api/admin/profile-images/${id}/reject`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ reason: reviewNote, reviewNote })
            });
            const result = await response.json().catch(() => ({}));
            if (response.status === 401 && handleAdminAuthError(result?.code || '')) {
                return false;
            }
            if (!response.ok || !result?.success) {
                throw new Error(result?.message || tx('Az elutasítás sikertelen.', 'Rejection failed.'));
            }
            rejected = true;
            setMessage('success', result.message || tx('A profilkép elutasítva.', 'Profile picture rejected.'));
            if (typeof showToast === 'function') {
                showToast(tx('Profilkép elutasítva.', 'Profile picture rejected.'), 'success', 'bi-x-circle-fill');
            }
            await refresh();
        } catch (error) {
            console.error('admin profile-image reject hiba:', error);
            setMessage('danger', error.message || tx('Az elutasítás sikertelen.', 'Rejection failed.'));
        }

        return rejected;
    }

    function bind() {
        if (STATE.bound) return;
        STATE.bound = true;

        document.addEventListener('click', (event) => {
            if (event.target.closest('#profileImageReviewRefresh')) {
                event.preventDefault();
                refresh();
                return;
            }
            const btn = event.target.closest('button[data-action][data-upload-id]');
            if (btn && btn.closest('#profileImageReviewTableBody')) {
                const uploadId = Number(btn.dataset.uploadId) || 0;
                if (!uploadId) return;
                const action = btn.dataset.action;
                if (action === 'approve') approve(uploadId);
                else if (action === 'reject') reject(uploadId, btn.dataset.username || '');
            }
        });

        // Reject modal: textarea karakterszamlalo + confirm gomb engedelyezese
        const reasonField = document.getElementById('profileImageRejectReason');
        if (reasonField) {
            reasonField.addEventListener('input', updateRejectReasonCounter);
        }

        const confirmBtn = document.getElementById('profileImageRejectConfirmBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                const id = STATE.pendingRejectUploadId;
                const reviewNote = String(reasonField?.value || '').trim().slice(0, 500);
                if (!id || reviewNote.length < 10) return;

                confirmBtn.disabled = true;
                const ok = await performReject(id, reviewNote);
                confirmBtn.disabled = false;

                if (ok) {
                    STATE.pendingRejectUploadId = 0;
                    getRejectModalInstance()?.hide();
                }
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => runSafely('admin profile-image bind', bind));
    return { refresh, approve, reject };
})();

