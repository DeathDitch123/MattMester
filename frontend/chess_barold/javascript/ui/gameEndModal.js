// ============================================================
// SAKK UI — JATEK VEGE MODAL + ELO BADGE
// ============================================================
// A meccs befejezesekor (matt/patt/feladas/ido) megjeleno ket lehetoseget
// kinalo modal: "Foloda" vagy "Uj jatek". Plusz az ELO valtozast jelzo
// felirat a tabla folott (`#elo-change`).
//
// FONTOS: a modul csak a DOM-ra hagyatkozik — semmi state-import. A `bindGameEndModal`
// callback-eken at kapja a "uj jatek" + "fooldal" viselkedest (a main.js init()
// adja at), igy nincs korkoros import.
//
// Hasznalat:
//   import { eloValtozasFrissit, gameEndModalMegnyit, gameEndModalElrejt, bindGameEndModal }
//          from './ui/gameEndModal.js';
//   bindGameEndModal({ onHome: () => location.href = '/', onNewGame: () => { ... } });
// ============================================================

// ELO badge frissitese a tabla folott (`#elo-change`).
// `eloValtozas` formatum: `{ eloBefore, eloAfter, eloChange }` vagy null/undefined.
export function eloValtozasFrissit(eloValtozas) {
    const eloElem = document.getElementById('elo-change');
    if (!eloElem) return;

    eloElem.classList.remove('positive', 'negative');

    if (!eloValtozas) {
        eloElem.textContent = '';
        eloElem.classList.add('hidden');
        return;
    }

    const diff = Number(eloValtozas.eloChange || 0);
    const sign = diff >= 0 ? '+' : '';
    eloElem.textContent = `ELO: ${eloValtozas.eloBefore} -> ${eloValtozas.eloAfter} (${sign}${diff})`;
    eloElem.classList.add(diff >= 0 ? 'positive' : 'negative');
    eloElem.classList.remove('hidden');
}

// Game-end modal megnyitas + szovegek beallitasa.
// `eloValtozas` formatum lehet `{ eloBefore, eloAfter }` VAGY `{ before, after }`
// (kompatibilitas regi backend valaszokkal).
export function gameEndModalMegnyit(uzenet, eloValtozas) {
    const modal = document.getElementById('game-end-modal');
    const msgEl = document.getElementById('gameEndMessage');
    const eloEl = document.getElementById('gameEndElo');
    if (!modal) return;
    const txGameOver = window.MattMesterI18n?.tx ? window.MattMesterI18n.tx('Játék vége', 'Game over') : 'Játék vége';
    if (msgEl) msgEl.textContent = uzenet || txGameOver;
    if (eloEl) {
        eloEl.classList.remove('positive', 'negative');
        eloEl.textContent = '';
        if (eloValtozas && typeof eloValtozas === 'object') {
            const before = eloValtozas.eloBefore ?? eloValtozas.before;
            const after  = eloValtozas.eloAfter  ?? eloValtozas.after;
            if (typeof before === 'number' && typeof after === 'number') {
                const diff = after - before;
                const sign = diff >= 0 ? '+' : '';
                eloEl.textContent = `ELO: ${before} → ${after} (${sign}${diff})`;
                eloEl.classList.add(diff >= 0 ? 'positive' : 'negative');
            }
        }
    }
    modal.classList.remove('hidden');
}

export function gameEndModalElrejt() {
    const modal = document.getElementById('game-end-modal');
    if (modal) modal.classList.add('hidden');
}

// Gombok bekotese — egyszer fut le `init()`-bol. A "Foloda" + "Uj jatek"
// callback-eket a hivo passzolja be (chatPanelLezar / ujMeccsChooserNyitas
// hivasok ott elnek main.js-ben).
export function bindGameEndModal({ onHome, onNewGame } = {}) {
    const homeBtn = document.getElementById('gameEndHomeBtn');
    const newBtn  = document.getElementById('gameEndNewGameBtn');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            if (typeof onHome === 'function') {
                onHome();
            } else {
                window.location.href = '/';
            }
        });
    }
    if (newBtn) {
        newBtn.addEventListener('click', () => {
            gameEndModalElrejt();
            if (typeof onNewGame === 'function') onNewGame();
        });
    }
}
