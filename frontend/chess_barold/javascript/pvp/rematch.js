// ============================================================
// SAKK PVP — REMATCH (REVANS) UI + EVENT-KOTES
// ============================================================
// N13 (#56): meccs vege utan a felhasznalo a `Revans` gombbal ujrameccset
// kerhet az ellenfeltol. Egy oldal ajanlja, a masik a `rematch-offer-modal`-ban
// elfogadja vagy elutasitja.
//
// Esemeny-flow:
//   - `Revans` gomb klikk -> emit `chess:rematch:offer`
//   - backend `chess:rematch:offered` valasz -> `rematchUiVarakozas()` (gomb disable)
//   - ellenfel `chess:rematch:incoming` event-et kap -> `rematchBejovoModal(true)`
//   - elfogadas: emit `chess:rematch:accept` -> backend uj meccset indit (game:start)
//   - elutasitas: emit `chess:rematch:decline` -> kuldonek `rematch:declined` jon
//     vissza, `rematchUiReset(uzenet)` gomb feloldva + status-flash
//
// FONTOS: a modul tobb funkciot exportal (Ui-segeden + esemenykotes), a hivasi
// helyek (pvpSocketInit) az egyes funkciot a megfelelo socket-event-re kotik.
// ============================================================

import { state } from '../state.js';
import { pvpSocketKeres } from './socketRef.js';

const tx = (hu, en) => (window.MattMesterI18n?.tx ? window.MattMesterI18n.tx(hu, en) : hu);

// "Varakozas az ellenfelre" UI: a gomb letiltodik + szoveg cserélődik.
// Akkor hivjuk amikor a sajat oldal ajanlott rematch-et (chess:rematch:offered).
export function rematchUiVarakozas() {
    const rematchBtn = document.getElementById('rematchBtn');
    if (rematchBtn) {
        rematchBtn.disabled = true;
        rematchBtn.textContent = tx('Várakozás az ellenfélre...', 'Waiting for opponent...');
    }
}

// Gomb visszaallitasa (decline / error / timeout). Opcionalis status-uzenet
// ami 3s-re a `#status` mezoben villan, majd visszater az eredeti szovegre.
export function rematchUiReset(uzenet) {
    const rematchBtn = document.getElementById('rematchBtn');
    if (rematchBtn) {
        rematchBtn.disabled = false;
        rematchBtn.textContent = tx('Revans', 'Rematch');
    }
    if (uzenet) {
        const statusElem = document.getElementById('status');
        if (statusElem) {
            const eredeti = statusElem.textContent;
            statusElem.textContent = uzenet;
            setTimeout(() => {
                if (statusElem.textContent === uzenet) statusElem.textContent = eredeti;
            }, 3000);
        }
    }
}

// Bejovo rematch ajanlat modal toggle. A `bejovoGameId` a `dataset`-be kerul,
// hogy az accept/decline kezelo eljuttassa a backend-nek (igy nem kell
// szabadon-allo state-valtozo).
export function rematchBejovoModal(mutat, bejovoGameId) {
    const modal = document.getElementById('rematch-offer-modal');
    if (!modal) return;
    if (mutat) {
        modal.dataset.gameId = String(bejovoGameId || '');
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
        delete modal.dataset.gameId;
    }
}

// Rematch gomb + bejovo modal kotesei. Csak egyszer hivodik az init()-bol.
export function rematchEsemenyekKot() {
    const rematchBtn = document.getElementById('rematchBtn');
    if (rematchBtn) {
        rematchBtn.addEventListener('click', () => {
            const socket = pvpSocketKeres && pvpSocketKeres();
            if (!socket || !socket.connected) {
                rematchUiReset(tx('Nincs kapcsolat a szerverrel.', 'No connection to the server.'));
                return;
            }
            const targetGameId = (state.utolsoAllapot && state.utolsoAllapot.gameId) || state.pvpGameId;
            socket.emit('chess:rematch:offer', { gameId: targetGameId });
            rematchUiVarakozas();
        });
    }
    const acceptBtn = document.getElementById('rematchAcceptBtn');
    const declineBtn = document.getElementById('rematchDeclineBtn');
    const modal = document.getElementById('rematch-offer-modal');
    if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
            const socket = pvpSocketKeres && pvpSocketKeres();
            const gid = modal && modal.dataset.gameId ? Number(modal.dataset.gameId) : null;
            rematchBejovoModal(false);
            if (socket && socket.connected && gid) {
                socket.emit('chess:rematch:accept', { gameId: gid });
            }
        });
    }
    if (declineBtn) {
        declineBtn.addEventListener('click', () => {
            const socket = pvpSocketKeres && pvpSocketKeres();
            const gid = modal && modal.dataset.gameId ? Number(modal.dataset.gameId) : null;
            rematchBejovoModal(false);
            if (socket && socket.connected && gid) {
                socket.emit('chess:rematch:decline', { gameId: gid });
            }
        });
    }
    // Overlay-klikk = decline (custom modal pattern, nem nativ confirm).
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal && declineBtn) declineBtn.click();
        });
    }
}
