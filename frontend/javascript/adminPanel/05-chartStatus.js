/* =============================================================
   8.5) Activity chart status helperek (UI render — egy forras-igazsag)
   ============================================================= */
const ACTIVITY_STATUS = Object.freeze({
    idle: { get label() { return tx('Inicializálás…', 'Initializing…'); }, variant: 'secondary', icon: 'bi-hourglass', dotClass: 'ws-dot-idle', spin: false },
    loading: { get label() { return tx('Adatok betöltése…', 'Loading data…'); }, variant: 'warning', icon: 'bi-arrow-repeat', dotClass: 'ws-dot-connecting', spin: true },
    loaded: { get label() { return tx('Élő', 'Live'); }, variant: 'success', icon: 'bi-broadcast-pin', dotClass: 'ws-dot-live', spin: false },
    empty: { get label() { return tx('Nincs 24h adat', 'No 24h data'); }, variant: 'secondary', icon: 'bi-pause-circle', dotClass: 'ws-dot-idle', spin: false },
    error: { get label() { return tx('Hiba', 'Error'); }, variant: 'danger', icon: 'bi-exclamation-triangle', dotClass: 'ws-dot-down', spin: false }
});

function chartStatusPill(chartState) {
    const status = ACTIVITY_STATUS[chartState?.status] || ACTIVITY_STATUS.idle;
    const time = chartState?.loadedAt ? `${tx('frissítve', 'updated')}: ${formatRelative(chartState.loadedAt)}` : '';
    const recordCount = (chartState?.totals?.records ?? 0);
    const detail = chartState?.status === 'loaded'
        ? `${recordCount} ${tx('rekord', 'records')}${time ? ' · ' + time : ''}`
        : (chartState?.status === 'error' ? (chartState?.error || tx('Ismeretlen hiba', 'Unknown error')) : '');
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
                <div>${tx('Aktivitási adatok betöltése…', 'Loading activity data…')}</div>
            </div>
        `;
    } else if (status === 'empty') {
        result = `
            <div class="activity-chart-message">
                <i class="bi bi-pause-circle"></i>
                <div class="activity-chart-message-title">${tx('Nincs 24 órás aktivitási adat', 'No 24-hour activity data')}</div>
                <div class="activity-chart-message-sub">${tx('Az utóbbi 24 órában nem rögzítettünk eseményt — amint történik valami, automatikusan megjelenik.', 'No events recorded in the last 24 hours — they will appear automatically as soon as something happens.')}</div>
            </div>
        `;
    } else if (status === 'error') {
        result = `
            <div class="activity-chart-message activity-chart-message-error">
                <i class="bi bi-exclamation-triangle"></i>
                <div class="activity-chart-message-title">${tx('Hiba a 24h aktivitás betöltésénél', 'Error loading 24h activity')}</div>
                <div class="activity-chart-message-sub">${escapeHtml(chartState?.error || tx('Ismeretlen hiba', 'Unknown error'))}</div>
            </div>
        `;
    }
    return result;
}

const ACTIVITY_DATASET_META = Object.freeze([
    { key: 'logins', get label() { return tx('Login', 'Login'); }, color: '#d4af37', icon: 'bi-box-arrow-in-right' },
    { key: 'registrations', get label() { return tx('Regisztráció', 'Registration'); }, color: '#10b981', icon: 'bi-person-plus-fill' },
    { key: 'gamesStarted', get label() { return tx('Új játszma', 'New game'); }, color: '#3b82f6', icon: 'bi-trophy-fill' },
    { key: 'auditEntries', get label() { return tx('Audit', 'Audit'); }, color: '#8b5cf6', icon: 'bi-journal-text' },
    { key: 'alerts', get label() { return tx('Riasztás', 'Alert'); }, color: '#ef4444', icon: 'bi-exclamation-octagon-fill' }
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

