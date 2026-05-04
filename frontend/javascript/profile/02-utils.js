// Kliens-oldali ability név + leírás mapping (HU/EN). Az API a DB-bol HU-ban
// adja vissza az `a.name` + `a.description` mezoket — itt az `a.key` (stabil
// ability ID, pl. `time_pause`) alapjan kapcsoljuk a fordítást, hogy EN módban
// is jó feliratokat lássunk. Lasd `chess_barold/javascript/abilities.js` →
// getFeliratok() — ugyanez a forrás.
function getProfileAbilityDisplay() {
    return {
        time_pause: {
            name: tx('Időmegállítás', 'Time stop'),
            description: tx('Időmegállítás — saját óra rövid szüneteltetése (8mp)', 'Time stop — briefly pause your own clock (8s)')
        },
        freeze: {
            name: tx('Bábu fagyasztás', 'Freeze piece'),
            description: tx('Bábu befagyasztás — egy ellenséges bábu 1 körig nem mozdulhat', 'Freeze piece — an enemy piece cannot move for 1 turn')
        },
        swap: {
            name: tx('Bábucsere', 'Piece swap'),
            description: tx('Bábucsere — két saját bábu pozíciójának cseréje (a köröd is)', 'Piece swap — swap the positions of two of your own pieces (uses your turn)')
        },
        board_hide: {
            name: tx('Tábla eltakar', 'Hide board'),
            description: tx('Táblakitakarás — ellenfél 5mp-ig nem tud lépni', 'Board hide — opponent cannot move for 5 seconds')
        },
        shield: {
            name: tx('Pajzs', 'Shield'),
            description: tx('Pajzs — saját bábu 1 körre sebezhetetlenné válik', 'Shield — one of your pieces becomes invulnerable for 1 turn')
        },
        lefokozas: {
            name: tx('Lefokozás', 'Demote'),
            description: tx('Lefokozás — ellenséges bástya/futó/vezér a következő körében max. 4 mezőt léphet', 'Demote — an enemy rook/bishop/queen can move at most 4 squares on its next turn')
        }
    };
}

function resolveAbilityDisplay(a) {
    const map = getProfileAbilityDisplay();
    const entry = map[a?.key];
    return {
        name: entry?.name || a?.name || a?.key || '',
        description: entry?.description || a?.description || ''
    };
}

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
        grid.innerHTML = items.map(a => {
            const display = resolveAbilityDisplay(a);
            return `
            <div class="col-md-6">
                <div class="ability-card d-flex align-items-center gap-3">
                    <div class="ability-icon">
                        <i data-lucide="${escapeHtmlAttr(a.icon || 'zap')}"></i>
                    </div>
                    <div>
                        <h6 class="mb-1 text-white" title="${escapeHtml(display.description)}">${escapeHtml(display.name)}</h6>
                        <small class="text-secondary">${tx('Használva', 'Used')} ${a.count}${tx('-szer', ' times')}</small>
                    </div>
                </div>
            </div>
        `;
        }).join('');
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
