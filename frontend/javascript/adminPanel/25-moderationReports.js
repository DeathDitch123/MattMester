/* =============================================================
   19.2) Player bejelentesek (user_reports) - admin tokennel
   ============================================================= */
window.MattMesterAdminReports = (function initAdminReports() {
    const STATE = {
        loading: false,
        bound: false,
        statusFilter: 'all',
        items: [],
        counts: { all: 0, open: 0, under_review: 0, closed: 0, total: 0 },
        pendingReportId: 0,
        pendingTargetStatus: ''
    };
    let actionModalInstance = null;

    const CATEGORY_LABELS = {
        cheating:    { label: 'Csalás',           color: 'danger'  },
        toxicity:    { label: 'Toxikusság',       color: 'danger'  },
        harassment:  { label: 'Zaklatás',         color: 'danger'  },
        spam:        { label: 'Spam',             color: 'warning' },
        unfair_play: { label: 'Fair play sértés', color: 'warning' },
        other:       { label: 'Egyéb',            color: 'secondary' }
    };

    const STATUS_LABELS = {
        open:         { label: 'Nyitott',         color: 'warning' },
        under_review: { label: 'Vizsgálat alatt', color: 'info'    },
        closed:       { label: 'Lezárva',         color: 'success' }
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function formatRelative(iso) {
        try {
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return '—';
            const diff = Math.max(0, Date.now() - d.getTime());
            const min = Math.floor(diff / 60000);
            if (min < 1) return 'most';
            if (min < 60) return `${min} perce`;
            const h = Math.floor(min / 60);
            if (h < 24) return `${h} órája`;
            const day = Math.floor(h / 24);
            return `${day} napja`;
        } catch (_) { return '—'; }
    }

    function setMessage(type, message) {
        const el = document.getElementById('reportsModerationMessage');
        if (!el) return;
        if (!message) { el.className = 'alert d-none'; el.textContent = ''; }
        else { el.className = `alert alert-${type}`; el.textContent = message; }
    }

    function updateCounts(counts) {
        const c = counts || {};
        const all = (c.open || 0) + (c.under_review || 0) + (c.closed || 0);
        const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = String(v); };
        setText('reportsCountAll', all);
        setText('reportsCountOpen', c.open || 0);
        setText('reportsCountUnderReview', c.under_review || 0);
        setText('reportsCountClosed', c.closed || 0);
        STATE.counts = { all, open: c.open || 0, under_review: c.under_review || 0, closed: c.closed || 0, total: c.total || all };
    }

    function renderRows(rows) {
        const list = document.getElementById('reportsModerationList');
        const cardTitle = document.getElementById('reportsModerationCardTitle');
        if (cardTitle) cardTitle.textContent = `Bejelentések (${rows?.length || 0})`;
        if (!list) return;

        if (!rows || !rows.length) {
            list.innerHTML = '<div class="text-center text-secondary py-4">Nincs bejelentés ezzel a szűréssel.</div>';
            return;
        }

        list.innerHTML = rows.map((row) => {
            const id = Number(row.id) || 0;
            const reporterName = escapeHtml(row.reporterUsername || '—');
            const reportedName = escapeHtml(row.reportedUsername || '—');
            const reporterImg = escapeHtml(row.reporterProfileImage || '/profile_pictures/default.png');
            const reportedImg = escapeHtml(row.reportedProfileImage || '/profile_pictures/default.png');
            const cat = CATEGORY_LABELS[row.category] || CATEGORY_LABELS.other;
            const stat = STATUS_LABELS[row.status] || STATUS_LABELS.open;
            const msg = escapeHtml(row.message || '');
            const note = escapeHtml(row.adminNote || '');
            const created = escapeHtml(formatRelative(row.createdAt));
            const reviewer = row.reviewerUsername ? escapeHtml(row.reviewerUsername) : null;
            const reviewedAt = row.reviewedAt ? escapeHtml(formatRelative(row.reviewedAt)) : null;

            const actions = [];
            // "Tiltas" shortcut: ATKAPSCOLAS a Felhasznalok > Tiltasok section-re
            // a bejelentett userrel kivalasztva. A bejelentes status-at NEM
            // valtoztatja - az adminnak utana kell visszajonni es lezarni.
            // (Vagy ha a Lezaras modal-ban 'banned' resolution-t valaszt, a
            // server-side mar mindent dokumental.)
            if (row.reportedUserId) {
                actions.push(`<button type="button" class="btn btn-outline-danger btn-sm" data-reports-action="ban-shortcut" data-user-id="${row.reportedUserId}" title="Ugrás a Tiltások oldalra a bejelentett felhasználóval"><i class="bi bi-slash-circle me-1"></i>Tiltás</button>`);
            }
            if (row.status === 'open') {
                actions.push(`<button type="button" class="btn btn-outline-info btn-sm" data-reports-action="under_review" data-report-id="${id}"><i class="bi bi-search me-1"></i>Vizsgálat alá</button>`);
                actions.push(`<button type="button" class="btn btn-outline-success btn-sm" data-reports-action="closed" data-report-id="${id}"><i class="bi bi-check2-circle me-1"></i>Lezárás</button>`);
            } else if (row.status === 'under_review') {
                actions.push(`<button type="button" class="btn btn-outline-success btn-sm" data-reports-action="closed" data-report-id="${id}"><i class="bi bi-check2-circle me-1"></i>Lezárás</button>`);
                actions.push(`<button type="button" class="btn btn-outline-warning btn-sm" data-reports-action="open" data-report-id="${id}"><i class="bi bi-arrow-counterclockwise me-1"></i>Visszanyitás</button>`);
            } else {
                actions.push(`<button type="button" class="btn btn-outline-warning btn-sm" data-reports-action="open" data-report-id="${id}"><i class="bi bi-arrow-counterclockwise me-1"></i>Újranyitás</button>`);
            }

            // A jelenlegi resolution lattatasa, ha van (closed eseten valaszthato).
            const resolutionLabels = {
                dismissed: 'Elutasítva (alaptalan)',
                warned:    'Figyelmeztetve',
                banned:    'Tiltva'
            };
            const resolutionBadge = (row.resolution && row.resolution !== 'none' && resolutionLabels[row.resolution])
                ? `<span class="badge bg-dark border border-secondary text-light ms-1">${escapeHtml(resolutionLabels[row.resolution])}</span>`
                : '';

            const reviewerLine = reviewer
                ? `<div class="text-secondary small mt-1"><i class="bi bi-person-check me-1"></i>${reviewer} · ${reviewedAt}</div>`
                : '';
            const noteLine = note
                ? `<div class="text-warning small mt-1"><i class="bi bi-pencil me-1"></i>${note}</div>`
                : '';

            // Csatolt meccs blokk: ha van game_id, megjelenitjuk az alapinfot +
            // egy "Megtekintes" gombot, ami a game review modal-t nyitja a
            // PGN + lepeslista + timing analizissel. Igy az admin tud informalt
            // dontest hozni cheating / unfair_play bejelentesekkel kapcsolatban.
            let gameAttachmentBlock = '';
            if (row.game && row.gameId) {
                const tc = escapeHtml(row.game.timeControl || '—');
                const gameStatus = String(row.game.status || '');
                const statusBadge = gameStatus === 'finished' ? 'success' : (gameStatus === 'ongoing' ? 'info' : 'secondary');
                const winnerName = row.game.winnerId
                    ? (Number(row.game.winnerId) === Number(row.game.whiteUserId)
                        ? escapeHtml(row.game.whiteUsername || '?') + ' (világos)'
                        : escapeHtml(row.game.blackUsername || '?') + ' (sötét)')
                    : (gameStatus === 'finished' ? 'döntetlen' : '—');
                const endLabel = row.game.endTime ? escapeHtml(formatRelative(row.game.endTime)) : 'folyamatban';
                gameAttachmentBlock = `
                    <div class="mt-2 p-2 rounded" style="background:rgba(13,202,240,0.06);border:1px solid rgba(13,202,240,0.25);">
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                            <i class="bi bi-controller text-info"></i>
                            <strong class="text-info small">Csatolt meccs #${row.gameId}</strong>
                            <span class="badge bg-${statusBadge}">${escapeHtml(gameStatus)}</span>
                            <span class="text-secondary small">${tc}</span>
                            <span class="text-secondary small">·</span>
                            <span class="text-secondary small">Győztes: ${winnerName}</span>
                            <span class="text-secondary small">·</span>
                            <span class="text-secondary small">${endLabel}</span>
                            <button type="button" class="btn btn-outline-info btn-sm ms-auto"
                                data-reports-action="view-game" data-game-id="${row.gameId}">
                                <i class="bi bi-eye me-1"></i>Megtekintés
                            </button>
                        </div>
                    </div>
                `;
            }

            return `
                <article class="moderation-item" data-report-id="${id}">
                    <header class="d-flex justify-content-between align-items-start mb-2 flex-wrap gap-2">
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                            <span class="badge bg-${cat.color}">${escapeHtml(cat.label)}</span>
                            <span class="badge bg-${stat.color}">${escapeHtml(stat.label)}</span>${resolutionBadge}
                            <small class="text-secondary">#${id}</small>
                        </div>
                        <small class="text-muted">${created}</small>
                    </header>
                    <div class="d-flex align-items-center gap-3 mb-2 flex-wrap">
                        <div class="d-flex align-items-center gap-2">
                            <img src="${reporterImg}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.1);">
                            <span class="text-secondary small">Bejelentő:</span>
                            <strong class="text-white">${reporterName}</strong>
                        </div>
                        <i class="bi bi-arrow-right text-secondary"></i>
                        <div class="d-flex align-items-center gap-2">
                            <img src="${reportedImg}" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1px solid rgba(220,53,69,0.3);">
                            <span class="text-secondary small">Bejelentett:</span>
                            <strong class="text-danger">${reportedName}</strong>
                        </div>
                    </div>
                    ${msg ? `<blockquote class="moderation-quote"><div class="text-white">${msg}</div></blockquote>` : ''}
                    ${gameAttachmentBlock}
                    ${reviewerLine}
                    ${noteLine}
                    <div class="d-flex justify-content-end gap-2 flex-wrap mt-2">
                        ${actions.join('')}
                    </div>
                </article>
            `;
        }).join('');
    }

    async function refresh() {
        if (STATE.loading) return;
        STATE.loading = true;
        setMessage(null, '');
        try {
            const params = new URLSearchParams();
            if (STATE.statusFilter && STATE.statusFilter !== 'all') {
                params.set('status', STATE.statusFilter);
            }
            params.set('limit', '200');

            const response = await fetch(`/api/admin/reports?${params.toString()}`, {
                method: 'GET',
                credentials: 'same-origin',
                headers: adminAuthHeaders()
            });
            const data = await response.json().catch(() => ({}));
            const authHandled = response.status === 401 && handleAdminAuthError(data?.code || '');
            if (authHandled) {
                renderRows([]);
                return;
            }
            if (!response.ok || !data?.success) {
                throw new Error(data?.message || 'Hiba a bejelentés lista lekérdezésekor.');
            }
            STATE.items = Array.isArray(data.data) ? data.data : [];
            updateCounts(data.counts || {});
            renderRows(STATE.items);
        } catch (error) {
            console.error('reports refresh hiba:', error);
            setMessage('danger', error.message || 'Hiba a frissítés során.');
            renderRows([]);
        } finally {
            STATE.loading = false;
        }
    }

    // ---------- Jatszma review modal ----------
    let gameReviewModalInstance = null;

    function getGameReviewModalEl() {
        let el = document.getElementById('reportsGameReviewModal');
        if (el) return el;
        el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'reportsGameReviewModal';
        el.tabIndex = -1;
        el.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content bg-dark text-light border-secondary">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title">
                            <i class="bi bi-controller me-2 text-info"></i>
                            <span id="reportsGameReviewTitle">Játszma review</span>
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body" id="reportsGameReviewBody">
                        <div class="text-center text-secondary py-4">Töltés...</div>
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Bezár</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(el);
        return el;
    }

    function getGameReviewModalInstance() {
        if (gameReviewModalInstance) return gameReviewModalInstance;
        const el = getGameReviewModalEl();
        if (typeof bootstrap === 'undefined') return null;
        gameReviewModalInstance = bootstrap.Modal.getOrCreateInstance(el);
        return gameReviewModalInstance;
    }

    function formatThinkMs(ms) {
        if (ms == null) return '—';
        if (ms < 1000) return `${ms} ms`;
        const s = ms / 1000;
        if (s < 60) return `${s.toFixed(1)} mp`;
        const m = Math.floor(s / 60);
        const sec = Math.round(s - m * 60);
        return `${m}m ${sec}s`;
    }

    function renderGameReview(game) {
        const body = document.getElementById('reportsGameReviewBody');
        if (!body || !game) return;

        const winnerLine = game.winnerId
            ? (Number(game.winnerId) === Number(game.whitePlayerId)
                ? `<span class="text-light">${escapeHtml(game.whiteUsername || '?')} <span class="text-secondary">(világos)</span></span>`
                : `<span class="text-light">${escapeHtml(game.blackUsername || '?')} <span class="text-secondary">(sötét)</span></span>`)
            : (game.status === 'finished' ? '<span class="text-info">Döntetlen</span>' : '<span class="text-secondary">—</span>');

        const moves = Array.isArray(game.moves) ? game.moves : [];
        // Lepespar-renderelés (1. e4 e5 / 2. Nf3 Nc6 / ...) kiegészítve a thinkMs
        // adatokkal mindkét félre. A PGN-t is mutatjuk teljes egészében olvashatóan.
        const pairs = [];
        for (let i = 0; i < moves.length; i += 2) {
            pairs.push({
                num: Math.floor(i / 2) + 1,
                white: moves[i] || null,
                black: moves[i + 1] || null
            });
        }
        const movesHtml = pairs.map((p) => {
            const wThink = p.white ? formatThinkMs(p.white.thinkMs) : '';
            const bThink = p.black ? formatThinkMs(p.black.thinkMs) : '';
            const wSan = p.white ? escapeHtml(p.white.san || '') : '';
            const bSan = p.black ? escapeHtml(p.black.san || '') : '';
            // Gyors moves jelzese: <500ms gyanus mert engine-rapid suggest.
            const wFast = p.white && p.white.thinkMs != null && p.white.thinkMs < 500 ? 'text-warning' : 'text-light';
            const bFast = p.black && p.black.thinkMs != null && p.black.thinkMs < 500 ? 'text-warning' : 'text-light';
            return `
                <div class="d-flex gap-2 small font-monospace align-items-center" style="padding:2px 0;">
                    <span class="text-secondary" style="min-width:32px;text-align:right;">${p.num}.</span>
                    <span class="${wFast}" style="min-width:80px;">${wSan}</span>
                    <span class="text-secondary" style="min-width:60px;font-size:.75rem;">${wThink}</span>
                    <span class="${bFast}" style="min-width:80px;">${bSan}</span>
                    <span class="text-secondary" style="font-size:.75rem;">${bThink}</span>
                </div>
            `;
        }).join('');

        const titleEl = document.getElementById('reportsGameReviewTitle');
        if (titleEl) {
            titleEl.textContent = `Játszma review #${game.id} — ${game.whiteUsername || '?'} vs ${game.blackUsername || '?'}`;
        }

        body.innerHTML = `
            <div class="row g-3 mb-3">
                <div class="col-md-6">
                    <div class="p-2 rounded" style="background:rgba(255,255,255,0.04);border:1px solid #30363d;">
                        <div class="text-secondary small">Világos</div>
                        <div class="d-flex align-items-center gap-2">
                            <img src="${escapeHtml(game.whiteProfileImage || '/profile_pictures/default.png')}" alt=""
                                style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.15);">
                            <strong>${escapeHtml(game.whiteUsername || '?')}</strong>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="p-2 rounded" style="background:rgba(0,0,0,0.4);border:1px solid #30363d;">
                        <div class="text-secondary small">Sötét</div>
                        <div class="d-flex align-items-center gap-2">
                            <img src="${escapeHtml(game.blackProfileImage || '/profile_pictures/default.png')}" alt=""
                                style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:1px solid rgba(220,53,69,0.3);">
                            <strong>${escapeHtml(game.blackUsername || '?')}</strong>
                        </div>
                    </div>
                </div>
            </div>
            <div class="row g-2 small mb-3">
                <div class="col-6 col-md-3">
                    <div class="text-secondary">Időkontroll</div>
                    <div>${escapeHtml(game.timeControl || '—')}</div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="text-secondary">Status</div>
                    <div>${escapeHtml(game.status || '—')}</div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="text-secondary">Győztes</div>
                    <div>${winnerLine}</div>
                </div>
                <div class="col-6 col-md-3">
                    <div class="text-secondary">Lépések</div>
                    <div>${moves.length}</div>
                </div>
            </div>

            <h6 class="mb-2"><i class="bi bi-clock-history me-1"></i>Lépéslista (gondolkodási idővel)</h6>
            <p class="text-secondary small mb-2">A 0,5 másodpercnél gyorsabb lépéseket sárgával jelöljük — gyanú esetén engine-segítségre utalhat (pl. premove vagy script).</p>
            <div class="p-2 rounded" style="background:#0d1117;border:1px solid #30363d;max-height:280px;overflow-y:auto;">
                ${movesHtml || '<div class="text-secondary small">Nincsenek lépések rögzítve.</div>'}
            </div>

            <h6 class="mt-3 mb-2"><i class="bi bi-file-earmark-text me-1"></i>PGN</h6>
            <textarea readonly class="form-control bg-black text-info border-secondary font-monospace small"
                rows="6" style="resize:vertical;">${escapeHtml(game.pgn || '(nincs PGN)')}</textarea>

            <div class="d-flex flex-wrap gap-2 mt-3">
                <button type="button" class="btn btn-outline-info btn-sm" id="reportsGameDownloadPgn">
                    <i class="bi bi-download me-1"></i>PGN letöltése (.pgn)
                </button>
                <button type="button" class="btn btn-outline-warning btn-sm" id="reportsGameDownloadReview">
                    <i class="bi bi-file-earmark-text me-1"></i>Részletes review letöltése (.txt)
                </button>
                <small class="text-secondary align-self-center">
                    A .pgn-t pl. lichess.org / chess.com analízisbe töltheted; a .txt a teljes
                    timing breakdown-t tartalmazza manuális átnézéshez.
                </small>
            </div>
        `;

        // Letoltesi gombok event handlerek - a renderGameReview minden hivasanal
        // ujra hozza a body-t, igy az event-listener-eket is itt kell rakotni.
        const pgnBtn = document.getElementById('reportsGameDownloadPgn');
        const reviewBtn = document.getElementById('reportsGameDownloadReview');
        if (pgnBtn) pgnBtn.addEventListener('click', () => downloadGamePgn(game));
        if (reviewBtn) reviewBtn.addEventListener('click', () => downloadGameReviewTxt(game));
    }

    function triggerDownload(content, filename, mimeType) {
        try {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            console.warn('triggerDownload hiba:', err);
        }
    }

    function safeFilenamePart(value) {
        return String(value || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
    }

    function downloadGamePgn(game) {
        const filename = `mattmester_game_${game.id}_${safeFilenamePart(game.whiteUsername)}_vs_${safeFilenamePart(game.blackUsername)}.pgn`;
        const pgn = game.pgn || `[Event "MattMester"]\n[White "${game.whiteUsername || '?'}"]\n[Black "${game.blackUsername || '?'}"]\n[Result "*"]\n\n*\n`;
        triggerDownload(pgn, filename, 'application/x-chess-pgn');
    }

    function downloadGameReviewTxt(game) {
        const lines = [];
        const pad = (label, value) => `${label.padEnd(20)} ${value}`;
        const moves = Array.isArray(game.moves) ? game.moves : [];

        lines.push('=================================================================');
        lines.push('  MATTMESTER — JÁTSZMA REVIEW');
        lines.push('  (admin manuális átnézéshez - bejelentés bizonyítékaként készült)');
        lines.push('=================================================================');
        lines.push('');
        lines.push(pad('Meccs azonosító:', `#${game.id}`));
        lines.push(pad('Világos:',         `${game.whiteUsername || '?'}  (id=${game.whitePlayerId || '?'})`));
        lines.push(pad('Sötét:',           `${game.blackUsername || '?'}  (id=${game.blackPlayerId || '?'})`));
        lines.push(pad('Időkontroll:',     game.timeControl || '—'));
        lines.push(pad('Status:',          game.status || '—'));
        const winnerLabel = game.winnerId
            ? (Number(game.winnerId) === Number(game.whitePlayerId)
                ? `${game.whiteUsername || '?'} (világos)`
                : `${game.blackUsername || '?'} (sötét)`)
            : (game.status === 'finished' ? 'döntetlen' : '—');
        lines.push(pad('Győztes:',         winnerLabel));
        lines.push(pad('Kezdés:',          game.startTime ? new Date(game.startTime).toLocaleString('hu-HU') : '—'));
        lines.push(pad('Vége:',            game.endTime   ? new Date(game.endTime).toLocaleString('hu-HU')   : '—'));
        lines.push(pad('Lépésszám:',       String(moves.length)));
        lines.push('');

        // Timing analízis: gyanús lépések száma + mediánok.
        const thinkTimes = moves.map((m) => m.thinkMs).filter((v) => v != null && v >= 0);
        const fastMoves = thinkTimes.filter((t) => t < 500).length;
        const sortedThinks = [...thinkTimes].sort((a, b) => a - b);
        const median = sortedThinks.length
            ? (sortedThinks.length % 2
                ? sortedThinks[(sortedThinks.length - 1) >> 1]
                : Math.round((sortedThinks[sortedThinks.length / 2 - 1] + sortedThinks[sortedThinks.length / 2]) / 2))
            : 0;
        lines.push('--- TIMING ANALÍZIS ----------------------------------------------');
        lines.push(pad('Gyors (<500ms):', `${fastMoves} / ${thinkTimes.length} lépés`));
        lines.push(pad('Medián gondolkodás:', `${median} ms`));
        lines.push('Megj.: a 500ms alatti lépések gyanúsak lehetnek (premove / engine-script).');
        lines.push('       Egy konzisztensen <500ms aktív lépés-soros sablon = nagy valószínűségű csalás.');
        lines.push('');

        lines.push('--- LÉPÉSLISTA (mindkét fél) -------------------------------------');
        lines.push(`${'#'.padStart(4)}  ${'Játékos'.padEnd(10)}  ${'Lépés'.padEnd(10)}  ${'Gondolkodás'.padEnd(12)}  Flag`);
        for (const m of moves) {
            const isWhite = Number(m.playerId) === Number(game.whitePlayerId);
            const playerCode = isWhite ? 'WHITE' : 'BLACK';
            const thinkLabel = m.thinkMs == null ? '—' : (m.thinkMs < 1000 ? `${m.thinkMs}ms` : `${(m.thinkMs / 1000).toFixed(1)}s`);
            const flags = [];
            if (m.thinkMs != null && m.thinkMs < 500) flags.push('FAST');
            if (m.isCheckmate) flags.push('CHECKMATE');
            else if (m.isCheck) flags.push('check');
            if (m.isCapture) flags.push('capture');
            const flagStr = flags.length ? `[${flags.join(',')}]` : '';
            lines.push(`${String(m.plyNumber).padStart(4)}  ${playerCode.padEnd(10)}  ${String(m.san || '').padEnd(10)}  ${thinkLabel.padEnd(12)}  ${flagStr}`);
        }
        lines.push('');
        lines.push('--- TELJES PGN ---------------------------------------------------');
        lines.push(game.pgn || '(nincs PGN tárolva)');
        lines.push('');
        lines.push('--- VÉGSŐ FEN ----------------------------------------------------');
        lines.push(game.currentFen || '(nincs)');
        lines.push('');
        lines.push('=================================================================');
        lines.push(`Generálva: ${new Date().toLocaleString('hu-HU')}  | MattMester admin review export`);
        lines.push('=================================================================');

        const filename = `mattmester_review_${game.id}_${safeFilenamePart(game.whiteUsername)}_vs_${safeFilenamePart(game.blackUsername)}.txt`;
        triggerDownload(lines.join('\n'), filename, 'text/plain;charset=utf-8');
    }

    async function openGameReviewModal(gameId) {
        getGameReviewModalEl();
        const body = document.getElementById('reportsGameReviewBody');
        const titleEl = document.getElementById('reportsGameReviewTitle');
        if (titleEl) titleEl.textContent = `Játszma review #${gameId}`;
        if (body) body.innerHTML = '<div class="text-center text-secondary py-4">Töltés...</div>';

        const inst = getGameReviewModalInstance();
        if (inst) inst.show();

        try {
            const response = await fetch(`/api/admin/games/${encodeURIComponent(gameId)}/review`, {
                method: 'GET',
                credentials: 'same-origin',
                headers: adminAuthHeaders()
            });
            const data = await response.json().catch(() => ({}));
            const authHandled = response.status === 401 && handleAdminAuthError(data?.code || '');
            if (authHandled) return;
            if (!response.ok || !data?.success) {
                if (body) body.innerHTML = `<div class="alert alert-danger">${escapeHtml(data?.message || 'Hiba a meccs lekérdezésekor.')}</div>`;
                return;
            }
            renderGameReview(data.data);
        } catch (error) {
            if (body) body.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message || 'Hálózati hiba.')}</div>`;
        }
    }

    function getActionModalEl() {
        let el = document.getElementById('reportsActionModal');
        if (el) return el;
        el = document.createElement('div');
        el.className = 'modal fade';
        el.id = 'reportsActionModal';
        el.tabIndex = -1;
        el.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content bg-dark text-light border-secondary">
                    <div class="modal-header border-secondary">
                        <h5 class="modal-title"><i class="bi bi-flag me-2"></i><span id="reportsActionModalTitle">Bejelentés művelet</span></h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div id="reportsActionResolutionWrap" class="mb-3 d-none">
                            <label class="form-label small text-secondary">Eredmény (resolution)</label>
                            <select id="reportsActionResolution" class="form-select bg-black text-light border-secondary">
                                <option value="dismissed">Elutasítva (alaptalan bejelentés)</option>
                                <option value="warned">Figyelmeztetve (csak jelzés)</option>
                                <option value="banned">Tiltva (külön a Tiltások oldalon!)</option>
                                <option value="none">— Nincs választás</option>
                            </select>
                            <div class="form-text text-secondary small">
                                A resolution dokumentálja az admin döntését.
                                <strong>Fontos:</strong> a "Tiltva" itt csak megjelölés —
                                a tényleges tiltást a <em>Tiltások</em> oldalon kell végrehajtani
                                (használd a kártyán lévő <strong>Tiltás</strong> shortcut-ot).
                            </div>
                        </div>
                        <p class="text-secondary mb-2">Adj meg egy indoklást (audit log) - min. 10, max. 1000 karakter.</p>
                        <textarea id="reportsActionReason" class="form-control bg-black text-light border-secondary" rows="3" maxlength="1000" placeholder="Mi az indoka?"></textarea>
                        <div class="text-end small text-secondary mt-1"><span id="reportsActionReasonCount">0</span>/1000</div>
                        <div id="reportsActionFeedback" class="alert d-none mt-2"></div>
                    </div>
                    <div class="modal-footer border-secondary">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Mégse</button>
                        <button type="button" class="btn btn-primary" id="reportsActionConfirmBtn" disabled>Megerősítés</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(el);
        return el;
    }

    function getActionModalInstance() {
        if (actionModalInstance) return actionModalInstance;
        const el = getActionModalEl();
        if (typeof bootstrap === 'undefined') return null;
        actionModalInstance = bootstrap.Modal.getOrCreateInstance(el);
        return actionModalInstance;
    }

    function openStatusActionModal(reportId, targetStatus) {
        STATE.pendingReportId = reportId;
        STATE.pendingTargetStatus = targetStatus;

        // FONTOS: a modal-t ELSO megnyitas elott letrehozzuk, kulonben a benti
        // mezok (#reportsActionReasonCount stb.) meg nincsenek a DOM-ban es a
        // getElementById null-t ad. Eddig egy unguarded `.textContent = '0'`
        // exception-be futott a TypeError: Cannot set properties of null.
        getActionModalEl();

        const titleMap = {
            open: 'Bejelentés újranyitása',
            under_review: 'Vizsgálat alá helyezés',
            closed: 'Bejelentés lezárása'
        };
        const titleEl = document.getElementById('reportsActionModalTitle');
        const reasonEl = document.getElementById('reportsActionReason');
        const feedbackEl = document.getElementById('reportsActionFeedback');
        const confirmBtn = document.getElementById('reportsActionConfirmBtn');
        const counterEl = document.getElementById('reportsActionReasonCount');
        const resolutionWrap = document.getElementById('reportsActionResolutionWrap');
        const resolutionSelect = document.getElementById('reportsActionResolution');
        if (titleEl) titleEl.textContent = titleMap[targetStatus] || 'Bejelentés művelet';
        if (reasonEl) reasonEl.value = '';
        if (feedbackEl) { feedbackEl.classList.add('d-none'); feedbackEl.textContent = ''; }
        if (confirmBtn) confirmBtn.disabled = true;
        if (counterEl) counterEl.textContent = '0';

        // A resolution-valasztot CSAK a 'closed' (lezaras) modal-ban mutatjuk —
        // mas status-valtozasnal (under_review / open) nem ertelmes a resolution.
        if (resolutionWrap) {
            if (targetStatus === 'closed') {
                resolutionWrap.classList.remove('d-none');
                if (resolutionSelect) resolutionSelect.value = 'dismissed';
            } else {
                resolutionWrap.classList.add('d-none');
            }
        }

        getActionModalInstance()?.show();
    }

    async function performStatusUpdate() {
        const reportId = Number(STATE.pendingReportId) || 0;
        const targetStatus = String(STATE.pendingTargetStatus || '');
        const reasonEl = document.getElementById('reportsActionReason');
        const feedbackEl = document.getElementById('reportsActionFeedback');
        const confirmBtn = document.getElementById('reportsActionConfirmBtn');
        const reason = (reasonEl?.value || '').trim();

        if (!reportId || !targetStatus) return;
        if (reason.length < 10) {
            if (feedbackEl) { feedbackEl.className = 'alert alert-warning'; feedbackEl.textContent = 'Az indoklás minimum 10 karakter.'; }
            return;
        }
        if (confirmBtn) confirmBtn.disabled = true;

        // Closed status eseten kuldjuk a resolution-t is (dismissed/warned/banned/none).
        // Mas status-valtozasnal a server ignoralja - undefined-kent NEM kuldodik el.
        const resolutionSelect = document.getElementById('reportsActionResolution');
        const resolutionValue = (targetStatus === 'closed' && resolutionSelect)
            ? String(resolutionSelect.value || 'none')
            : undefined;

        try {
            const body = {
                status: targetStatus,
                adminNote: reason,
                reason
            };
            if (resolutionValue !== undefined) body.resolution = resolutionValue;

            const response = await fetch(`/api/admin/reports/${encodeURIComponent(reportId)}/status`, {
                method: 'PATCH',
                credentials: 'same-origin',
                headers: { ...adminAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await response.json().catch(() => ({}));
            const authHandled = response.status === 401 && handleAdminAuthError(data?.code || '');
            if (authHandled) return;
            if (!response.ok || !data?.success) {
                throw new Error(data?.message || 'A frissítés sikertelen.');
            }
            getActionModalInstance()?.hide();
            await refresh();
        } catch (error) {
            if (feedbackEl) { feedbackEl.className = 'alert alert-danger'; feedbackEl.textContent = error.message || 'Hiba.'; }
        } finally {
            if (confirmBtn) confirmBtn.disabled = false;
        }
    }

    function bind() {
        if (STATE.bound) return;
        STATE.bound = true;

        // Refresh + filter + per-row akció gombok delegalt click handler.
        document.addEventListener('click', (event) => {
            try {
                if (event.target.closest('#reportsModerationRefresh')) {
                    event.preventDefault();
                    refresh();
                    return;
                }
                const filterBtn = event.target.closest('button[data-reports-filter]');
                if (filterBtn) {
                    event.preventDefault();
                    document.querySelectorAll('button[data-reports-filter]').forEach((b) => b.classList.remove('active'));
                    filterBtn.classList.add('active');
                    STATE.statusFilter = String(filterBtn.dataset.reportsFilter || 'all');
                    refresh();
                    return;
                }
                const actionBtn = event.target.closest('button[data-reports-action]');
                if (actionBtn && actionBtn.closest('#reportsModerationList')) {
                    event.preventDefault();
                    const action = String(actionBtn.dataset.reportsAction || '');
                    if (action === 'ban-shortcut') {
                        const userId = Number(actionBtn.dataset.userId) || 0;
                        if (userId) banAdminUser(userId);
                        return;
                    }
                    if (action === 'view-game') {
                        const gameId = Number(actionBtn.dataset.gameId) || 0;
                        if (gameId) openGameReviewModal(gameId);
                        return;
                    }
                    const reportId = Number(actionBtn.dataset.reportId) || 0;
                    if (reportId && action) openStatusActionModal(reportId, action);
                    return;
                }
            } catch (err) {
                console.warn('reports moderation handler hiba:', err);
            }
        });

        // Reason counter + confirm
        document.addEventListener('input', (event) => {
            if (event.target?.id === 'reportsActionReason') {
                const len = String(event.target.value || '').trim().length;
                const counter = document.getElementById('reportsActionReasonCount');
                const confirmBtn = document.getElementById('reportsActionConfirmBtn');
                if (counter) counter.textContent = String(len);
                if (confirmBtn) confirmBtn.disabled = !(len >= 10 && len <= 1000);
            }
        });
        document.addEventListener('click', (event) => {
            if (event.target?.id === 'reportsActionConfirmBtn') {
                event.preventDefault();
                performStatusUpdate();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => runSafely('admin reports bind', bind));
    return { refresh };
})();

