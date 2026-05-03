/* =============================================================
   19.1) Chat moderáció - admin tokennel + real-time
   ============================================================= */
window.MattMesterAdminChatModeration = (function initAdminChatModeration() {
    const STATE = {
        loading: false,
        bound: false,
        pendingAllowMessageId: 0,
        pendingBlocklistMessageId: 0,
        pendingBlocklistBody: ''
    };
    let allowModalInstance = null;
    let blocklistModalInstance = null;

    // A wordSplitter normalizalja az uzenetszoveget: kis-nagybetu, nyelvi diakritikák,
    // irasjelek leveve — a containsBlockedWord() ugyanezt teszi, igy egyezik a matching.
    function tokenizeBodyToWords(body) {
        const raw = String(body || '');
        const normalized = raw
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!normalized) return [];
        const tokens = normalized.split(' ').filter((w) => w.length >= 3);
        const seen = new Set();
        const result = [];
        for (const t of tokens) {
            if (!seen.has(t)) {
                seen.add(t);
                result.push(t);
            }
        }
        return result;
    }

    function setMessage(type, message) {
        const el = document.getElementById('chatModerationMessage');
        if (!el) return;
        if (!message) {
            el.className = 'alert d-none';
            el.textContent = '';
        } else {
            el.className = `alert alert-${type}`;
            el.textContent = message;
        }
    }

    function getAllowModalInstance() {
        if (allowModalInstance) return allowModalInstance;
        const el = document.getElementById('chatAllowModal');
        if (!el || typeof bootstrap === 'undefined') return null;
        allowModalInstance = bootstrap.Modal.getOrCreateInstance(el);
        return allowModalInstance;
    }

    function updateAllowReasonCounter() {
        const reasonField = document.getElementById('chatAllowReason');
        const counter = document.getElementById('chatAllowReasonCount');
        const confirmBtn = document.getElementById('chatAllowConfirmBtn');
        if (!reasonField || !counter) return;
        const len = reasonField.value.trim().length;
        counter.textContent = String(len);
        const valid = len >= 10 && len <= 1000;
        counter.parentElement?.classList.toggle('valid', valid);
        if (confirmBtn) confirmBtn.disabled = !valid;
    }

    function formatRelativeTime(iso) {
        try {
            const date = new Date(iso);
            if (Number.isNaN(date.getTime())) return '—';
            const diffMs = Date.now() - date.getTime();
            const diffSec = Math.max(0, Math.floor(diffMs / 1000));
            if (diffSec < 60) return `${diffSec} mp-e`;
            const diffMin = Math.floor(diffSec / 60);
            if (diffMin < 60) return `${diffMin} perce`;
            const diffH = Math.floor(diffMin / 60);
            if (diffH < 24) return `${diffH} órája`;
            const diffD = Math.floor(diffH / 24);
            return `${diffD} napja`;
        } catch (_) { return '—'; }
    }

    function renderRows(rows) {
        const list = document.getElementById('chatModerationList');
        const cardTitle = document.getElementById('chatModerationCardTitle');
        if (cardTitle) cardTitle.textContent = `Megjelölt üzenetek (${rows?.length || 0})`;
        if (!list) return;

        if (!rows || !rows.length) {
            list.innerHTML = '<div class="text-center text-secondary py-4">Nincs jelölt üzenet.</div>';
            return;
        }

        list.innerHTML = rows.map((row) => {
            const id = Number(row.id) || 0;
            const senderId = Number(row.senderId) || 0;
            const username = escapeHtml(row.senderUsername || '—');
            const safeProfileImage = escapeHtml(row.senderProfileImage || '/profile_pictures/default.png');
            const conversationType = String(row.conversationType || 'private');
            const convLabel = conversationType === 'group' ? 'csoport' : 'privát chat';
            const relTime = escapeHtml(formatRelativeTime(row.sentAt));
            const safeBody = escapeHtml(row.body || '');
            const safeBodyMasked = escapeHtml(row.bodyMasked || '***');
            const kind = String(row.kind || 'auto');
            const isAutoFlagged = Boolean(row.isAutoFlagged);
            const reportCount = Number(row.reportCount || 0);
            const reports = Array.isArray(row.reports) ? row.reports : [];
            const senderStrikeCount = Number(row.senderStrikeCount || 0);
            const messageStrikeBanType = row.messageStrikeBanType || null;

            // Tajekoztato badge a feladó eddigi csapasairol + a tiltas hosszarol.
            // Ha az uzenethez mar tartozik strike-rekord (auto-flagged eset), annak a
            // ban_type-jat mutatjuk; egyebkent (csak bejelentett) megbecsuljuk, hogy
            // egy esetleges Torles eseten hany. csapas lenne, es az milyen ban-t okozna.
            // A tenyleges tiltas a Tiltasok panelben latszik — ez csak vizualis hint.
            const banTypeToLabel = (t) => {
                if (t === 'temp_1d') return '1 napos tiltás';
                if (t === 'temp_10d') return '10 napos tiltás';
                if (t === 'perma') return 'végleges tiltás';
                return null;
            };
            let strikeInfoHtml = '';
            if (messageStrikeBanType) {
                const label = banTypeToLabel(messageStrikeBanType) || '—';
                strikeInfoHtml = `
                    <div class="text-secondary small mb-2">
                        <span class="badge bg-danger-subtle text-danger border border-danger-subtle me-1">
                            <i class="bi bi-exclamation-octagon me-1"></i>${senderStrikeCount}. csapás
                        </span>
                        <span class="text-warning">Tiltás hossza: ${label}</span>
                    </div>
                `;
            } else {
                const projectedStrike = senderStrikeCount + 1;
                const projectedType = projectedStrike >= 3 ? 'perma' : (projectedStrike === 2 ? 'temp_10d' : 'temp_1d');
                const label = banTypeToLabel(projectedType) || '—';
                strikeInfoHtml = `
                    <div class="text-secondary small mb-2">
                        <span class="badge bg-warning-subtle text-warning border border-warning-subtle me-1">
                            <i class="bi bi-exclamation-octagon me-1"></i>Eddigi csapások: ${senderStrikeCount}
                        </span>
                        <span class="text-secondary">Törlés esetén: ${projectedStrike}. csapás · ${label}</span>
                    </div>
                `;
            }

            // Badge: 'report' (felhasznaloi bejelentes) vagy 'auto' (rendszer-szuro).
            // Ha mindketto igaz, a kind='report' es jelezzuk a kettos cimket.
            const kindBadges = [];
            if (kind === 'report') {
                kindBadges.push(`<span class="badge bg-danger">Bejelentett (${reportCount})</span>`);
                if (isAutoFlagged) {
                    kindBadges.push(`<span class="badge bg-warning text-dark" title="Profanity-filter is jelolte">Auto-flagged</span>`);
                }
            } else {
                kindBadges.push(`<span class="badge bg-warning text-dark">Auto-flagged (rendszer)</span>`);
            }

            const reportersHtml = reports.length
                ? `
                    <div class="text-secondary small mb-2">
                        <i class="bi bi-flag-fill text-danger me-1"></i>Bejelentő${reports.length > 1 ? 'k' : ''}:
                        ${reports.map((r) => {
                            const reporterName = escapeHtml(r.reporterUsername || '—');
                            const reasonText = r.reason ? ` — <em>${escapeHtml(r.reason)}</em>` : '';
                            return `<div class="ms-3"><strong>${reporterName}</strong>${reasonText}</div>`;
                        }).join('')}
                    </div>
                `
                : '';

            // Engedelyezes csak 'report' kind-on jelenik meg — auto-flagged uzeneteket
            // a fix blocklist hard rule miatt az admin sem birálhatja felül.
            const allowBtn = kind === 'report'
                ? `<button type="button" class="btn btn-outline-success btn-sm" data-chat-action="allow" data-message-id="${id}" data-username="${username}">
                        <i class="bi bi-check-circle me-1"></i>Engedélyezés
                    </button>`
                : `<button type="button" class="btn btn-outline-secondary btn-sm" disabled title="Auto-flagged üzenet — a profanity-filter blocklist hard rule, az admin sem bírálhatja felül.">
                        <i class="bi bi-lock me-1"></i>Nem engedélyezhető
                    </button>`;

            // 'Tiltott szavakhoz': csak 'report' kind-on (= felhasznaloi bejelentes), ahol az
            // admin elismerheti hogy a szoveg tenyleg tragar es bekerulhet a blocklist-be.
            // Auto-flagged uzeneteknel ez fölösleges (mar a hardcoded listan szerepel).
            const blocklistBtn = kind === 'report'
                ? `<button type="button" class="btn btn-outline-danger btn-sm" data-chat-action="add-blocklist" data-message-id="${id}" data-body="${escapeHtml(row.body || '')}">
                        <i class="bi bi-shield-plus me-1"></i>Tiltott szavakhoz
                    </button>`
                : '';

            const maskedDisplay = isAutoFlagged
                ? `<div class="text-secondary small mb-1">A résztvevők ezt látják: <span class="font-monospace text-warning">${safeBodyMasked}</span></div>`
                : '';

            return `
                <article class="moderation-item" data-message-id="${id}">
                    <header class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                            ${kindBadges.join(' ')}
                            <small class="text-secondary">#${id} · ${escapeHtml(convLabel)} (#${row.conversationId})</small>
                        </div>
                        <small class="text-muted">${relTime}</small>
                    </header>
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <img src="${safeProfileImage}" alt="${username}" style="width:24px;height:24px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.1);">
                        <strong class="text-white">${username}</strong>
                        <span class="text-secondary small">#${senderId}</span>
                    </div>
                    ${reportersHtml}
                    ${strikeInfoHtml}
                    <blockquote class="moderation-quote">
                        ${maskedDisplay}
                        <div>${isAutoFlagged ? 'Eredeti: ' : ''}<span class="text-white">${safeBody}</span></div>
                    </blockquote>
                    <div class="d-flex justify-content-end gap-2 flex-wrap">
                        ${allowBtn}
                        ${blocklistBtn}
                        <button type="button" class="btn btn-outline-danger btn-sm" data-chat-action="delete" data-message-id="${id}" data-username="${username}">
                            <i class="bi bi-trash me-1"></i>Törlés
                        </button>
                    </div>
                </article>
            `;
        }).join('');
    }

    async function refresh() {
        let refreshed = false;
        try {
            if (!STATE.loading) {
                STATE.loading = true;
                setMessage(null, '');

                const response = await fetch('/api/admin/chat/flagged', {
                    headers: adminAuthHeaders(),
                    credentials: 'same-origin'
                });
                const result = await response.json().catch(() => ({}));
                const authHandled = response.status === 401 && handleAdminAuthError(result?.code || '');
                if (authHandled) {
                    renderRows([]);
                } else if (!response.ok || !result?.success) {
                    throw new Error(result?.message || 'Hiba a chat moderálási lista lekérdezésekor.');
                } else {
                    renderRows(result.data || []);
                    refreshed = true;
                }
            }
        } catch (error) {
            console.error('admin chat moderation fetch hiba:', error);
            setMessage('danger', error.message || 'Hiba a lekérdezés során.');
            renderRows([]);
        } finally {
            STATE.loading = false;
        }
        return refreshed;
    }

    function openAllow(messageId, username = '') {
        const id = Number(messageId) || 0;
        if (!id) return false;
        STATE.pendingAllowMessageId = id;

        const userLabel = document.getElementById('chatAllowModalUser');
        if (userLabel) userLabel.textContent = username || '—';

        const reasonField = document.getElementById('chatAllowReason');
        if (reasonField) reasonField.value = '';
        updateAllowReasonCounter();

        const modal = getAllowModalInstance();
        if (!modal) {
            setMessage('danger', 'A modal nem érhető el. Frissítsd az oldalt.');
            return false;
        }
        modal.show();
        setTimeout(() => reasonField?.focus(), 200);
        return true;
    }

    async function performAllow(messageId, reason) {
        const id = Number(messageId) || 0;
        if (!id || !reason || reason.length < 10) return false;
        let ok = false;
        try {
            setMessage(null, '');
            const response = await fetch(`/api/admin/chat/messages/${id}/allow`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ reason })
            });
            const result = await response.json().catch(() => ({}));
            if (response.status === 401 && handleAdminAuthError(result?.code || '')) return false;
            if (!response.ok || !result?.success) {
                throw new Error(result?.message || 'Az engedélyezés sikertelen.');
            }
            ok = true;
            setMessage('success', result.message || 'Az üzenet engedélyezve.');
            if (typeof showToast === 'function') {
                showToast('Üzenet engedélyezve.', 'success', 'bi-check-circle-fill');
            }
            await refresh();
        } catch (error) {
            console.error('admin chat allow hiba:', error);
            setMessage('danger', error.message || 'Az engedélyezés sikertelen.');
        }
        return ok;
    }

    function bind() {
        if (STATE.bound) return;
        STATE.bound = true;

        document.addEventListener('click', (event) => {
            if (event.target.closest('#chatModerationRefresh')) {
                event.preventDefault();
                refresh();
                return;
            }
            const btn = event.target.closest('button[data-chat-action]');
            if (!btn || !btn.closest('#chatModerationList')) return;

            const action = btn.dataset.chatAction;
            const messageId = Number(btn.dataset.messageId) || 0;
            const userId = Number(btn.dataset.userId) || 0;
            const username = btn.dataset.username || '';

            if (action === 'allow') {
                openAllow(messageId, username);
            } else if (action === 'delete') {
                // Reuse a meglevo critical-action modal-t: chat.delete kritikus action,
                // a kovetkezo lepesben (executeCriticalAction) az action-bol tudja
                // hogy chat-uzenetet kell torolni (state.criticalActionData.messageId).
                openCriticalAction('chat.delete', username, null, { messageId });
            } else if (action === 'add-blocklist') {
                openBlocklistAdd(messageId, btn.dataset.body || '');
            }
        });

        const reasonField = document.getElementById('chatAllowReason');
        if (reasonField) reasonField.addEventListener('input', updateAllowReasonCounter);

        const confirmBtn = document.getElementById('chatAllowConfirmBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                const reason = String(document.getElementById('chatAllowReason')?.value || '').trim().slice(0, 1000);
                const id = STATE.pendingAllowMessageId;
                if (!id || reason.length < 10) return;

                confirmBtn.disabled = true;
                const ok = await performAllow(id, reason);
                confirmBtn.disabled = false;

                if (ok) {
                    STATE.pendingAllowMessageId = 0;
                    getAllowModalInstance()?.hide();
                }
            });
        }

        // 'Tiltott szavakhoz' modal eventek
        const blReasonField = document.getElementById('chatBlocklistAddReason');
        if (blReasonField) blReasonField.addEventListener('input', updateBlocklistAddState);

        const blContainer = document.getElementById('chatBlocklistAddWordsContainer');
        if (blContainer) blContainer.addEventListener('change', updateBlocklistAddState);

        const blConfirmBtn = document.getElementById('chatBlocklistAddConfirmBtn');
        if (blConfirmBtn) {
            blConfirmBtn.addEventListener('click', async () => {
                if (blConfirmBtn.disabled) return;
                const reason = String(blReasonField?.value || '').trim().slice(0, 1000);
                const id = STATE.pendingBlocklistMessageId;
                const checkedWords = Array.from(
                    document.querySelectorAll('#chatBlocklistAddWordsContainer input[type="checkbox"]:checked')
                ).map((cb) => String(cb.value || '').trim()).filter(Boolean);

                if (!id || reason.length < 10 || !checkedWords.length) return;

                blConfirmBtn.disabled = true;
                const ok = await performAddBlocklist(id, checkedWords, reason);
                blConfirmBtn.disabled = false;

                if (ok) {
                    STATE.pendingBlocklistMessageId = 0;
                    STATE.pendingBlocklistBody = '';
                    getBlocklistModalInstance()?.hide();
                }
            });
        }
    }

    function getBlocklistModalInstance() {
        if (blocklistModalInstance) return blocklistModalInstance;
        const el = document.getElementById('chatBlocklistAddModal');
        if (!el || typeof bootstrap === 'undefined') return null;
        blocklistModalInstance = bootstrap.Modal.getOrCreateInstance(el);
        return blocklistModalInstance;
    }

    function updateBlocklistAddState() {
        const reasonField = document.getElementById('chatBlocklistAddReason');
        const counter = document.getElementById('chatBlocklistAddReasonCount');
        const confirmBtn = document.getElementById('chatBlocklistAddConfirmBtn');
        if (!reasonField || !counter || !confirmBtn) return;

        const reasonLen = reasonField.value.trim().length;
        counter.textContent = String(reasonLen);
        const reasonValid = reasonLen >= 10 && reasonLen <= 1000;
        counter.parentElement?.classList.toggle('valid', reasonValid);

        const checked = document.querySelectorAll('#chatBlocklistAddWordsContainer input[type="checkbox"]:checked').length;
        confirmBtn.disabled = !(reasonValid && checked > 0);
    }

    function openBlocklistAdd(messageId, body) {
        const id = Number(messageId) || 0;
        if (!id) return false;
        STATE.pendingBlocklistMessageId = id;
        STATE.pendingBlocklistBody = String(body || '');

        const sourceIdEl = document.getElementById('chatBlocklistAddSourceMessageId');
        if (sourceIdEl) sourceIdEl.textContent = `#${id}`;
        const sourceBodyEl = document.getElementById('chatBlocklistAddSourceBody');
        if (sourceBodyEl) sourceBodyEl.textContent = body || '—';

        const container = document.getElementById('chatBlocklistAddWordsContainer');
        const words = tokenizeBodyToWords(body);
        if (container) {
            if (!words.length) {
                container.innerHTML = '<span class="text-secondary small">Nincs választható szó (mind 3-nál rövidebb).</span>';
            } else {
                container.innerHTML = words.map((w, idx) => {
                    const safe = escapeHtml(w);
                    return `
                        <div class="form-check form-check-inline">
                            <input class="form-check-input" type="checkbox" id="chatBlocklistWordCb_${idx}" value="${safe}">
                            <label class="form-check-label font-monospace" for="chatBlocklistWordCb_${idx}">${safe}</label>
                        </div>
                    `;
                }).join('');
            }
        }

        const reasonField = document.getElementById('chatBlocklistAddReason');
        if (reasonField) reasonField.value = '';
        updateBlocklistAddState();

        const modal = getBlocklistModalInstance();
        if (!modal) {
            setMessage('danger', 'A modal nem érhető el. Frissítsd az oldalt.');
            return false;
        }
        modal.show();
        return true;
    }

    async function performAddBlocklist(messageId, words, reason) {
        const id = Number(messageId) || 0;
        if (!id || !Array.isArray(words) || !words.length) return false;
        let ok = false;
        try {
            setMessage(null, '');
            const response = await fetch('/api/admin/chat/blocklist/add', {
                method: 'POST',
                credentials: 'same-origin',
                headers: adminAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ words, sourceMessageId: id, reason })
            });
            const result = await response.json().catch(() => ({}));
            if (response.status === 401 && handleAdminAuthError(result?.code || '')) return false;
            if (!response.ok || !result?.success) {
                throw new Error(result?.message || 'A hozzáadás sikertelen.');
            }
            ok = true;
            setMessage('success', result.message || 'Szavak hozzáadva.');
            if (typeof showToast === 'function') {
                showToast('Tiltott szavak hozzáadva.', 'success', 'bi-shield-check');
            }
            await refresh();
        } catch (error) {
            console.error('admin chat blocklist add hiba:', error);
            setMessage('danger', error.message || 'A hozzáadás sikertelen.');
        }
        return ok;
    }

    document.addEventListener('DOMContentLoaded', () => runSafely('admin chat-moderation bind', bind));
    return { refresh, openAllow, openBlocklistAdd };
})();

