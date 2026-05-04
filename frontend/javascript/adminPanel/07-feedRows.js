/* =============================================================
   10) Audit / alert / live-feed row renderelők
   ============================================================= */
function renderAuditRow(a, idx = 0) {
    const sev = a.severity || 'info';
    const time = formatAuditTime(a.occurredAt);
    const actor = a.actor?.username || 'rendszer';
    const targetLabel = a.target?.label
        ? `<span class="audit-row-target"><i class="bi bi-bullseye me-1"></i>${escapeHtml(a.target.label)}</span>` : '';
    const detailId = `auditDetail-${a.eventId || idx}-${Math.random().toString(36).slice(2, 7)}`;
    return `
        <article class="audit-row sev-${sev}" data-audit-id="${a.eventId || ''}">
            <div class="audit-row-head">
                <span class="audit-row-time font-monospace">${time}</span>
                <span class="audit-row-actor"><i class="bi bi-person-circle me-1"></i>${escapeHtml(actor)}</span>
                <span class="audit-row-arrow"><i class="bi bi-arrow-right"></i></span>
                <span class="audit-row-action font-monospace">${escapeHtml(a.action || '')}</span>
                ${targetLabel}
                <div class="audit-row-spacer"></div>
                ${severityPill(sev)}
                <button type="button" class="btn btn-sm btn-outline-gold btn-icon ms-2 audit-row-toggle"
                    onclick="document.getElementById('${detailId}').classList.toggle('d-none'); this.classList.toggle('open');"
                    aria-label="Részletek">
                    <i class="bi bi-chevron-down"></i>
                </button>
            </div>
            <div class="audit-row-reason"><i class="bi bi-quote me-1"></i>${escapeHtml(a.reason || '')}</div>
            <div id="${detailId}" class="audit-row-detail d-none">
                <div class="row g-3">
                    <div class="col-md-6">
                        <div class="audit-diff-label">before</div>
                        ${formatJSON(a.diff?.before)}
                    </div>
                    <div class="col-md-6">
                        <div class="audit-diff-label">after</div>
                        ${formatJSON(a.diff?.after)}
                    </div>
                </div>
                <div class="audit-meta mt-3">
                    <span><strong>event_id:</strong> <span class="font-monospace text-gold">${a.eventId || '—'}</span></span>
                    <span><strong>severity:</strong> ${sev}</span>
                    ${a.target ? `<span><strong>target:</strong> ${escapeHtml(a.target.type || '')}#${a.target.id || ''}</span>` : ''}
                </div>
            </div>
        </article>
    `;
}

function renderAlertRow(a) {
    const kind = a.kind || 'unauthorized';
    const sev = a.severity || 'warning';
    const time = formatAuditTime(a.occurredAt);
    const userLabel = a.userId ? `#${a.userId}` : (a.user || '—');
    const isDismissed = Boolean(a.dismissedAt);
    const ipEsc = escapeHtml(a.ip || '');
    const occurredEsc = escapeHtml(a.occurredAt || '');
    return `
        <article class="alert-row sev-${sev}${isDismissed ? ' is-dismissed' : ''}" data-alert-id="${a.id || ''}">
            <div class="alert-row-icon"><i class="bi ${ALERT_KIND[kind]?.icon || 'bi-question'}"></i></div>
            <div class="alert-row-body">
                <div class="alert-row-head">
                    ${alertKindLabel(kind)}
                    ${severityPill(sev)}
                    ${isDismissed ? '<span class="badge bg-secondary ms-2"><i class="bi bi-eye-slash me-1"></i>Elrejtett</span>' : ''}
                    <span class="alert-row-time font-monospace ms-auto">${time}</span>
                </div>
                <div class="alert-row-meta">
                    <span><strong>IP:</strong> <span class="font-monospace text-gold">${escapeHtml(a.ip || '—')}</span></span>
                    <span><strong>User:</strong> ${escapeHtml(String(userLabel))}</span>
                    <span><strong>Endpoint:</strong> <span class="font-monospace">${escapeHtml(a.endpoint || '*')}</span></span>
                </div>
                <div class="alert-row-detail">${formatJSON(a.detail)}</div>
                <div class="alert-row-actions">
                    ${a.ip && a.ip !== 'ismeretlen'
                        ? h.btn({ label: 'IP tiltás', icon: 'bi-ban', variant: 'outline-danger', size: 'sm', onclick: `openIpBlockModal('${ipEsc.replace(/'/g, "\\'")}', ${a.id || 'null'})` })
                        : h.btn({ label: 'IP tiltás', icon: 'bi-ban', variant: 'outline-danger', size: 'sm', attrs: 'disabled title="Nincs IP cim"' })
                    }
                    ${h.btn({ label: 'Audit nyitás', icon: 'bi-journal-text', variant: 'outline-gold', size: 'sm', onclick: `openAuditFromAlert(${a.id || 'null'}, '${ipEsc.replace(/'/g, "\\'")}', ${a.userId || 'null'}, '${occurredEsc.replace(/'/g, "\\'")}')` })}
                    ${isDismissed
                        ? h.btn({ label: 'Visszaállít', icon: 'bi-arrow-counterclockwise', variant: 'outline-success', size: 'sm', onclick: `restoreOneAlert(${a.id || 'null'})` })
                        : h.btn({ label: 'Elrejtés', icon: 'bi-eye-slash', variant: 'outline-secondary', size: 'sm', onclick: `dismissOneAlert(${a.id || 'null'})` })
                    }
                </div>
            </div>
        </article>
    `;
}

function liveFeedRow(kind, ev) {
    const sev = ev.severity || (kind === 'alert' ? 'warning' : 'info');
    const time = formatAuditTime(ev.occurredAt);
    const action = kind === 'alert' ? (ev.kind || 'alert') : (ev.action || '');
    const target = kind === 'alert' ? (ev.ip || '') : (ev.target?.label || '—');
    return `
        <li class="live-feed-row sev-${sev}${kind === 'alert' ? ' live-feed-alert' : ''}">
            <span class="live-feed-time">${time}</span>
            <span class="live-feed-action">${escapeHtml(action)}</span>
            <span class="live-feed-target ${kind === 'alert' ? 'font-monospace text-secondary' : ''}">${escapeHtml(target)}</span>
            ${severityPill(sev)}
        </li>
    `;
}

