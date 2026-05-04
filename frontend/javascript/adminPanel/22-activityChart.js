/* =============================================================
   18) Activity chart
   ============================================================= */
// initChart: csak a Chart.js peldanyt epiti fel a meglevo state alapjan
// (loadActivityChart hivja amikor adat jott). Mock data NINCS — ha nincs adat,
// az overlay magyarazza el miert.
function initChart() {
    try {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js nem elerheto.');
        } else {
            const canvas = document.getElementById('activityChart');
            if (canvas) {
                const existing = Chart.getChart(canvas);
                if (existing) existing.destroy();
                state.activityChart.chartInstance = null;

                const labels = Array.isArray(state.activityChart.labels) ? state.activityChart.labels : [];
                const datasetSource = state.activityChart.datasets || {};
                const ctx = canvas.getContext('2d');

                const datasets = ACTIVITY_DATASET_META.map((meta, idx) => {
                    const data = Array.isArray(datasetSource[meta.key]) ? datasetSource[meta.key] : [];
                    const dashed = idx >= 3; // audit es alerts vonal szaggatott (admin esemenyek)
                    return {
                        label: meta.label,
                        data,
                        borderColor: meta.color,
                        backgroundColor: idx === 0 ? buildLineGradient(ctx, meta.color) : 'transparent',
                        borderWidth: idx === 0 ? 2.5 : 2,
                        borderDash: dashed ? [6, 4] : [],
                        fill: idx === 0,
                        tension: 0.35,
                        pointBackgroundColor: meta.color,
                        pointBorderColor: '#0f172a',
                        pointBorderWidth: 1,
                        pointRadius: 2.5,
                        pointHoverRadius: 5
                    };
                });

                state.activityChart.chartInstance = new Chart(ctx, {
                    type: 'line',
                    data: { labels, datasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                labels: {
                                    color: '#cbd5e1',
                                    font: { family: 'Inter', size: 11 },
                                    boxWidth: 14,
                                    padding: 12,
                                    usePointStyle: true
                                }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                titleColor: '#d4af37',
                                bodyColor: '#e2e8f0',
                                borderColor: 'rgba(212, 175, 55, 0.35)',
                                borderWidth: 1,
                                padding: 10,
                                mode: 'index',
                                intersect: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(51, 65, 85, 0.5)' },
                                ticks: { color: '#94a3b8', font: { family: 'Inter' }, precision: 0 }
                            },
                            x: {
                                grid: { display: false },
                                ticks: {
                                    color: '#94a3b8',
                                    font: { family: 'Inter' },
                                    maxRotation: 0,
                                    autoSkip: true,
                                    autoSkipPadding: 12
                                }
                            }
                        },
                        interaction: { intersect: false, mode: 'index' }
                    }
                });
            }
        }
    } catch (err) {
        console.error('initChart hiba:', err);
    }
}

function buildLineGradient(ctx, hex) {
    let result = 'transparent';
    try {
        const grad = ctx.createLinearGradient(0, 0, 0, 280);
        grad.addColorStop(0, hex + '55');
        grad.addColorStop(1, hex + '00');
        result = grad;
    } catch (err) {
        console.warn('buildLineGradient hiba:', err);
        result = 'transparent';
    }
    return result;
}

async function loadActivityChart(options = {}) {
    const silent = options.silent === true;
    try {
        if (!state.adminToken) {
            applyActivityChartStatus({ status: 'error', error: 'Nincs admin token — a 24h aktivitás nem tölthető be.' });
        } else {
            if (!silent) applyActivityChartStatus({ status: 'loading' });
            const headers = adminAuthHeaders({ Accept: 'application/json' });
            const response = await fetch('/api/admin/stats/activity', {
                method: 'GET',
                credentials: 'same-origin',
                headers
            });
            if (!response.ok) {
                let bodyMessage = `HTTP ${response.status}`;
                try {
                    const body = await response.json();
                    if (body?.message) bodyMessage = body.message;
                } catch (_) { /* nem JSON */ }
                if (response.status === 401 || response.status === 403) {
                    handleAdminAuthError('admin_token_required');
                }
                applyActivityChartStatus({ status: 'error', error: bodyMessage });
            } else {
                const json = await response.json();
                if (!json?.success || !json?.data) {
                    applyActivityChartStatus({ status: 'error', error: json?.message || 'Ismeretlen válasz.' });
                } else {
                    const totals = json.data.totals || {};
                    const records = Number(totals.records || 0);
                    state.activityChart.labels = json.data.labels || [];
                    state.activityChart.datasets = json.data.datasets || {};
                    state.activityChart.totals = totals;
                    state.activityChart.loadedAt = new Date();
                    state.activityChart.error = null;
                    state.activityChart.status = records > 0 ? 'loaded' : 'empty';
                    applyActivityChartStatus(state.activityChart);
                }
            }
        }
    } catch (err) {
        console.error('loadActivityChart hiba:', err);
        applyActivityChartStatus({ status: 'error', error: err?.message || 'Hálózati hiba.' });
    }
}

function applyActivityChartStatus(next) {
    try {
        if (next && next !== state.activityChart) {
            state.activityChart.status = next.status || state.activityChart.status;
            if (next.error !== undefined) state.activityChart.error = next.error;
            if (next.loadedAt) state.activityChart.loadedAt = next.loadedAt;
        }
        const status = state.activityChart.status;

        const pill = document.getElementById('chartStatusPill');
        const labelEl = document.getElementById('chartStatusLabel');
        const detailEl = document.getElementById('chartStatusDetail');
        const overlay = document.getElementById('activityChartOverlay');
        const totalsEl = document.getElementById('activityChartTotals');

        const meta = ACTIVITY_STATUS[status] || ACTIVITY_STATUS.idle;
        if (pill) {
            ['idle', 'loading', 'loaded', 'empty', 'error'].forEach((s) => pill.classList.remove(`chart-status-${s}`));
            pill.classList.add(`chart-status-${status}`);
            pill.title = meta.label;
            const dot = pill.querySelector('.ws-pill-dot');
            if (dot) {
                ['ws-dot-idle', 'ws-dot-connecting', 'ws-dot-live', 'ws-dot-down'].forEach((c) => dot.classList.remove(c));
                dot.classList.add(meta.dotClass);
                dot.classList.toggle('ws-dot-spin', Boolean(meta.spin));
            }
        }
        if (labelEl) labelEl.textContent = meta.label;
        if (detailEl) {
            const recordCount = state.activityChart.totals?.records ?? 0;
            const time = state.activityChart.loadedAt ? `frissítve: ${formatRelative(state.activityChart.loadedAt)}` : '';
            if (status === 'loaded') {
                detailEl.textContent = `· ${recordCount} rekord${time ? ' · ' + time : ''}`;
            } else if (status === 'error') {
                detailEl.textContent = `· ${state.activityChart.error || ''}`;
            } else if (status === 'empty') {
                detailEl.textContent = time ? `· ${time}` : '';
            } else {
                detailEl.textContent = '';
            }
        }

        if (overlay) {
            if (status === 'loaded') {
                overlay.classList.add('d-none');
                overlay.innerHTML = '';
            } else {
                overlay.classList.remove('d-none');
                overlay.innerHTML = activityChartOverlay(state.activityChart);
            }
        }

        if (totalsEl) {
            if (state.activityChart.totals && status !== 'idle' && status !== 'loading') {
                totalsEl.innerHTML = renderChartTotals(state.activityChart.totals);
            } else if (status === 'idle' || status === 'loading') {
                totalsEl.innerHTML = '<span class="text-secondary small">A 24h összegzések a chart betöltése után jelennek meg.</span>';
            } else if (status === 'error') {
                totalsEl.innerHTML = `<span class="text-danger small"><i class="bi bi-exclamation-triangle me-1"></i>${escapeHtml(state.activityChart.error || 'Hiba a betöltésnél.')}</span>`;
            }
        }

        if (status === 'loaded' || status === 'empty') {
            initChart();
        }
    } catch (err) {
        console.error('applyActivityChartStatus hiba:', err);
    }
}

function startActivityRefreshTimer() {
    try {
        if (state.activityRefreshIntervalId) {
            clearInterval(state.activityRefreshIntervalId);
            state.activityRefreshIntervalId = null;
        }
        // 60 mp-enkent ujratoltjuk amig a dashboard nyitva van
        state.activityRefreshIntervalId = setInterval(() => {
            if (state.currentSectionId === 'dashboard' && state.adminToken) {
                loadActivityChart({ silent: true });
            }
        }, 60000);
    } catch (err) {
        console.warn('startActivityRefreshTimer hiba:', err);
    }
}

