async function loadAbilitiesUsage() {
    const grid = document.getElementById('abilities-usage-grid');
    if (!grid) return;
    try {
        const res = await fetch('/api/profile/abilities-usage');
        const data = await res.json();
        if (!res.ok || !data.success) {
            grid.innerHTML = `<div class="col-12 text-secondary text-center py-3">${tx('Nem sikerült betölteni a képesség statisztikát.', 'Failed to load ability statistics.')}</div>`;
            return;
        }
        const items = data.abilities || [];
        if (items.length === 0) {
            grid.innerHTML = `<div class="col-12 text-secondary text-center py-3">${tx('Nincs még képesség.', 'No abilities yet.')}</div>`;
            return;
        }
        grid.innerHTML = items.map(a => `
            <div class="col-md-6">
                <div class="ability-card d-flex align-items-center gap-3">
                    <div class="ability-icon">
                        <i data-lucide="${escapeHtmlAttr(a.icon || 'zap')}"></i>
                    </div>
                    <div>
                        <h6 class="mb-1 text-white">${escapeHtml(a.name)}</h6>
                        <small class="text-secondary">${tx('Használva', 'Used')} ${a.count}${tx('-szer', ' times')}</small>
                    </div>
                </div>
            </div>
        `).join('');
        // Lucide ikonok újra-renderelése a frissen beillesztett DOM-on
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    } catch (err) {
        console.error('[profile] abilities-usage hiba:', err);
        grid.innerHTML = `<div class="col-12 text-secondary text-center py-3">${tx('Hiba a betöltés közben.', 'Error during loading.')}</div>`;
    }
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}
function escapeHtmlAttr(s) {
    return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '');
}
// Ez parsol
