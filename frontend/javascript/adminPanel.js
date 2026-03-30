//MINDEN API AMI ITT MEG VAN HÍVVA ISADMIN() VALIDÁLÁSSAL KELL TÖRTÉNJEN A BACKENDEN, HOGY CSAK ADMINOK FÉRHESSENEK HOZZÁJUK
document.addEventListener('DOMContentLoaded', function () {
    initChart();
    initRevealAnimations();
    initResponsiveSidebar();
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
    fetch('/admin/export-users')
        .then(response => {
            if (!response.ok) {
                throw new Error('Hiba történt a felhasználók exportálása során.');
            }
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'users.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('Hiba:', error);
            alert('Hiba történt a felhasználók exportálása során.');
        });
}

function viewUser(userId) {
    // MÉG LE KELL FEJLESZTENI + API ENDPOINTOT A BACKENDEN
    const modal = new bootstrap.Modal(document.getElementById('userModal'));
    modal.show();
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        fetch('/api/logout', { method: 'POST' })
            .then(() => { window.location.href = '/'; })
            .catch(() => { window.location.href = '/'; });
    }
}

function initChart() {
    const canvas = document.getElementById('activityChart');
    if (!canvas) return;

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