/* =============================================================
   8.5) Activity chart status helperek (UI render — egy forras-igazsag)
   ============================================================= */
const ACTIVITY_STATUS = Object.freeze({
    idle: { label: 'Inicializálás…', variant: 'secondary', icon: 'bi-hourglass', dotClass: 'ws-dot-idle', spin: false },
    loading: { label: 'Adatok betöltése…', variant: 'warning', icon: 'bi-arrow-repeat', dotClass: 'ws-dot-connecting', spin: true },
    loaded: { label: 'Élő', variant: 'success', icon: 'bi-broadcast-pin', dotClass: 'ws-dot-live', spin: false },
    empty: { label: 'Nincs 24h adat', variant: 'secondary', icon: 'bi-pause-circle', dotClass: 'ws-dot-idle', spin: false },
    error: { label: 'Hiba', variant: 'danger', icon: 'bi-exclamation-triangle', dotClass: 'ws-dot-down', spin: false }
});

function chartStatusPill(chartState) {
    const status = ACTIVITY_STATUS[chartState?.status] || ACTIVITY_STATUS.idle;
    const time = chartState?.loadedAt ? `frissítve: ${formatRelative(chartState.loadedAt)}` : '';
    const recordCount = (chartState?.totals?.records ?? 0);
    const detail = chartState?.status === 'loaded'
        ? `${recordCount} rekord${time ? ' · ' + time : ''}`
        : (chartState?.status === 'error' ? (chartState?.error || 'Ismeretlen hiba') : '');
    return `
        <span class="chart-status-pill chart-status-${chartState?.status || 'idle'}" id="chartStatusPill" title="${status.label}">
            <span class="ws-pill-dot ${status.dotClass}${status.spin ? ' ws-dot-spin' : ''}" aria-hidden="true"></span>
            <span class="chart-status-label" id="chartStatusLabel">${status.label}</span>
            ${detail ? `<span class="chart-status-detail" id="chartStatusDetail">· ${escapeHtml(detail)}</span>` : '<span class="chart-status-detail" id="chartStatusDetail"></span>'}
        </span>
    `;
}

function activityChartOverlay(chartState) {
    let result = '';
    const status = chartState?.status || 'idle';
    if (status === 'loading' || status === 'idle') {
        result = `
            <div class="activity-chart-loading">
                <i class="bi bi-arrow-repeat spin"></i>
                <div>Aktivitási adatok betöltése…</div>
            </div>
        `;
    } else if (status === 'empty') {
        result = `
            <div class="activity-chart-message">
                <i class="bi bi-pause-circle"></i>
                <div class="activity-chart-message-title">Nincs 24 órás aktivitási adat</div>
                <div class="activity-chart-message-sub">Az utóbbi 24 órában nem rögzítettünk eseményt — amint történik valami, automatikusan megjelenik.</div>
            </div>
        `;
    } else if (status === 'error') {
        result = `
            <div class="activity-chart-message activity-chart-message-error">
                <i class="bi bi-exclamation-triangle"></i>
                <div class="activity-chart-message-title">Hiba a 24h aktivitás betöltésénél</div>
                <div class="activity-chart-message-sub">${escapeHtml(chartState?.error || 'Ismeretlen hiba')}</div>
            </div>
        `;
    }
    return result;
}

const ACTIVITY_DATASET_META = Object.freeze([
    { key: 'logins', label: 'Login', color: '#d4af37', icon: 'bi-box-arrow-in-right' },
    { key: 'registrations', label: 'Regisztráció', color: '#10b981', icon: 'bi-person-plus-fill' },
    { key: 'gamesStarted', label: 'Új játszma', color: '#3b82f6', icon: 'bi-trophy-fill' },
    { key: 'auditEntries', label: 'Audit', color: '#8b5cf6', icon: 'bi-journal-text' },
    { key: 'alerts', label: 'Riasztás', color: '#ef4444', icon: 'bi-exclamation-octagon-fill' }
]);

function renderChartTotals(totals) {
    return ACTIVITY_DATASET_META.map((meta) => `
        <span class="chart-total-chip" style="--chip-color: ${meta.color};">
            <i class="bi ${meta.icon}"></i>
            <span class="chart-total-label">${meta.label}</span>
            <strong class="chart-total-value">${Number(totals?.[meta.key] || 0)}</strong>
        </span>
    `).join('');
}

