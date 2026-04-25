//MINDEN API AMI ITT MEG VAN HÍVVA ISADMIN() VALIDÁLÁSSAL KELL TÖRTÉNJEN A BACKENDEN, HOGY CSAK ADMINOK FÉRHESSENEK HOZZÁJUK
const requestController = window.createRequestController(300);

function runSafely(label, handler) {
    try {
        return handler();
    } catch (error) {
        console.error(`${label} hiba:`, error);
        return undefined;
    }
}

async function runSafelyAsync(label, handler) {
    try {
        return await handler();
    } catch (error) {
        console.error(`${label} hiba:`, error);
        return undefined;
    }
}

async function logAuthStatusReport(contextLabel = 'admin-logout') {
    try {
        const response = await fetch('/api/sessionInfo');
        const data = await response.json().catch(() => ({}));

        console.clear();
        console.log('--- Auth Status Report ---');
        console.log('Context:', contextLabel);
        console.log('Session info:', response.ok ? data : { success: false, loggedIn: false });

        if (window.MattMesterSocket?.socket) {
            console.log('SocketInfo:', window.MattMesterSocket?.getSnapshot ? window.MattMesterSocket.getSnapshot() : {
                socketId: window.MattMesterSocket.socket.id,
                connected: window.MattMesterSocket.socket.connected,
                sessionBound: window.MattMesterSocket.socket.connected ? 'Active' : 'Disconnected/Pending'
            });
        } else {
            console.warn('SocketInfo: A socket objektum nem található vagy még nem lett inicializálva.');
        }

        console.log('--------------------------');
    } catch (error) {
        console.error('Hiba az auth status report naplozasakor:', error);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    runSafely('adminDOMContentLoaded', () => {
        initChart();
        initRevealAnimations();
        initResponsiveSidebar();
        window.MattMesterChatModal?.init();
    });
});

function showSection(sectionId, event) {
    // Elrejti az összes szekciót, majd megjeleníti a kiválasztottat
    document.querySelectorAll('.section-content').forEach(section => {
        section.classList.add('d-none');
    });
    document.getElementById(sectionId).classList.remove('d-none');

    // Frissíti a navigációs linkeket
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    mainContent.classList.toggle('expanded');
    sidebar.classList.toggle('collapsed');
}

function exportUsers() {
    // MÉG FEJLESZTENI
    runSafelyAsync('exportUsers', async () => {
        requestController.schedule('exportUsers', async () => {
            try {
                const response = await fetch('/api/admin/export-users', {
                    signal: requestController.withAbortSignal('exportUsers')
                });

                if (!response.ok) {
                    throw new Error('Hiba történt a felhasználók exportálása során.');
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'users.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            } catch (error) {
                if (error?.name === 'AbortError') {
                    throw error;
                }
                console.error('Hiba:', error);
                alert(error.message || 'Hiba történt a felhasználók exportálása során.');
            } finally {
                requestController.clearSignal('exportUsers');
            }
        });
    });
}

function viewUser(userId) {
    // MÉG LE KELL FEJLESZTENI + API ENDPOINTOT A BACKENDEN
    const modal = new bootstrap.Modal(document.getElementById('userModal'));
    modal.show();
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        runSafelyAsync('adminLogout', async () => {
            requestController.schedule('logout', async () => {
                try {
                    const response = await fetch('/api/logout', {
                        method: 'POST',
                        signal: requestController.withAbortSignal('logout')
                    });

                    if (!response.ok) {
                        throw new Error('Sikertelen kijelentkezes.');
                    }

                    await logAuthStatusReport('admin-logout-success');
                } catch (error) {
                    if (error?.name === 'AbortError') {
                        throw error;
                    }
                    console.error('Logout hiba:', error);
                    throw error;
                } finally {
                    requestController.clearSignal('logout');
                    window.location.href = '/';
                }
            });
        });
    }
}

function initChart() {
    const canvas = document.getElementById('activityChart');
    if (!canvas) {
        throw new Error('Az activityChart canvas nem található.');
    }

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(212, 175, 55, 0.4)');
    gradient.addColorStop(1, 'rgba(212, 175, 55, 0.0)');

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', 'Now'],
            datasets: [{
                label: 'Active Players',
                data: [120, 80, 450, 890, 1200, 2100, 1842],
                borderColor: '#d4af37',
                backgroundColor: gradient,
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#d4af37',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4
            }, {
                label: 'Games Started',
                data: [45, 20, 180, 340, 520, 890, 642],
                borderColor: '#3b82f6',
                backgroundColor: 'transparent',
                borderWidth: 2,
                borderDash: [5, 5],
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Inter' }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: '#334155', drawBorder: false },
                    ticks: { color: '#94a3b8', font: { family: 'Inter' } }
                },
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: '#94a3b8', font: { family: 'Inter' } }
                }
            },
            interaction: { intersect: false, mode: 'index' }
        }
    });
}

function initRevealAnimations() {
    const observerOptions = { threshold: 0.1, rootMargin: '0px 0px -40px 0px' };
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    document.querySelectorAll('.stat-card, .content-card').forEach((el, i) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = `opacity 0.5s ease ${i * 0.05}s, transform 0.5s ease ${i * 0.05}s`;
        revealObserver.observe(el);
    });
}

window.MattMesterAdminProfileImages = (function initAdminProfileImages() {
    const STATE = { loading: false, bound: false };

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

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = String(value === null || value === undefined ? '' : value);
        return div.innerHTML;
    }

    function renderRows(rows) {
        const tbody = document.getElementById('profileImageReviewTableBody');
        if (!tbody) return;
        if (!rows || !rows.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-secondary py-4">Nincs függő profilkép.</td></tr>';
            return;
        }
        const html = rows.map((row) => {
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
                            <img src="${safeFilename}" alt="Pending profilkép" style="width:48px;height:48px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.1);">
                        </a>
                    </td>
                    <td><span class="text-secondary small">${safeUploadTime}</span></td>
                    <td class="text-end">
                        <button type="button" class="btn btn-success btn-sm me-2" data-action="approve" data-upload-id="${safeUploadId}">
                            <i class="bi bi-check-circle me-1"></i>Jóváhagy
                        </button>
                        <button type="button" class="btn btn-outline-danger btn-sm" data-action="reject" data-upload-id="${safeUploadId}">
                            <i class="bi bi-x-circle me-1"></i>Elutasít
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        tbody.innerHTML = html;
    }

    async function refresh() {
        if (STATE.loading) return;
        STATE.loading = true;
        setMessage(null, '');
        try {
            const response = await fetch('/api/admin/profile-images/pending');
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.success) {
                throw new Error(result?.message || 'Hiba a függő profilképek lekérdezése során.');
            }
            renderRows(result.data || []);
        } catch (error) {
            console.error('admin profile-images pending fetch hiba:', error);
            setMessage('danger', error.message || 'Hiba a lekérdezés során.');
            renderRows([]);
        } finally {
            STATE.loading = false;
        }
    }

    async function approve(uploadId) {
        try {
            const response = await fetch(`/api/admin/profile-images/${encodeURIComponent(uploadId)}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.success) {
                throw new Error(result?.message || 'A jóváhagyás sikertelen.');
            }
            setMessage('success', result.message || 'A profilkép jóváhagyva.');
            await refresh();
        } catch (error) {
            console.error('admin profile-image approve hiba:', error);
            setMessage('danger', error.message || 'A jóváhagyás sikertelen.');
        }
    }

    async function reject(uploadId) {
        const reviewNoteRaw = window.prompt('Add meg az elutasítás indokát (opcionális, max 500 karakter):', '') || '';
        const reviewNote = reviewNoteRaw.trim().slice(0, 500);
        try {
            const response = await fetch(`/api/admin/profile-images/${encodeURIComponent(uploadId)}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reviewNote: reviewNote || null })
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result?.success) {
                throw new Error(result?.message || 'Az elutasítás sikertelen.');
            }
            setMessage('success', result.message || 'A profilkép elutasítva.');
            await refresh();
        } catch (error) {
            console.error('admin profile-image reject hiba:', error);
            setMessage('danger', error.message || 'Az elutasítás sikertelen.');
        }
    }

    function bind() {
        if (STATE.bound) return;
        STATE.bound = true;

        const refreshButton = document.getElementById('profileImageReviewRefresh');
        if (refreshButton) {
            refreshButton.addEventListener('click', () => { refresh(); });
        }

        const tbody = document.getElementById('profileImageReviewTableBody');
        if (tbody) {
            tbody.addEventListener('click', (event) => {
                const button = event.target.closest('button[data-action]');
                if (!button) return;
                const uploadId = Number(button.dataset.uploadId) || 0;
                if (!uploadId) return;
                const action = button.dataset.action;
                if (action === 'approve') {
                    approve(uploadId);
                } else if (action === 'reject') {
                    reject(uploadId);
                }
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        try {
            bind();
        } catch (error) {
            console.error('admin profile-image bind hiba:', error);
        }
    });

    return { refresh, approve, reject };
})();

function initResponsiveSidebar() {
    if (window.innerWidth < 992) {
        document.getElementById('sidebar').classList.add('collapsed');
        document.getElementById('mainContent').classList.add('expanded');
    }
    window.addEventListener('resize', function () {
        if (window.innerWidth < 992) {
            document.getElementById('sidebar').classList.add('collapsed');
            document.getElementById('mainContent').classList.add('expanded');
        }
    });
}