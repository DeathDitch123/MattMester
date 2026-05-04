// ============================================================
// SAKK — JATEK VEGE ORCHESTRATOR (meccs befejezes flow)
// ============================================================
// Egyetlen entry: `jatekVegeUI(uzenet, eloValtozas)`. Hivja a tobbi modult,
// hogy a teljes meccs-vege flow lefusson:
//   1. tabla folott "Jatek vege" felirat (UI-megjelenites)
//   2. integritas-ellenorzo timer leallitasa (allapot)
//   3. bot-thinking indikator + bot polling leallitas
//   4. `lepesKuldes` fail-safe timer toroles
//   5. ELO badge frissites (ha eloValtozas adatott)
//   6. feladas-gomb elrejtve, "Uj jatek" gomb mutatva
//   7. ingame chat: input letiltva (uzenetek megmaradnak)
//   8. game-end modal felugras (Fololdal / Uj jatek valasztas)
//
// A modult a bot-meccs `kattintasLep` / `babuHuzasEgerFel`, a `pvp/pvpJatek.js`
// `pvpJatekVege`, es a `allapot.js` polling-ag jatek-vege hivasa is hasznalja.
// ============================================================

import { state } from './state.js';
import { uiJatekVegeMegjelenit } from './UI-megjelenites.js';
import { integritasEllenorzesLeall, botGondolkodasFrissit, lepesKuldesLezar } from './allapot.js';
import { eloValtozasFrissit, gameEndModalMegnyit } from './ui/gameEndModal.js';
import { chatPanelEnged } from './ui/chatPanel.js';

export function jatekVegeUI(uzenet, eloValtozas) {
    uiJatekVegeMegjelenit(uzenet);
    integritasEllenorzesLeall();
    botGondolkodasFrissit(false);
    if (state.botPollTimer) {
        clearInterval(state.botPollTimer);
        state.botPollTimer = null;
    }
    lepesKuldesLezar();
    if (eloValtozas !== undefined) {
        eloValtozasFrissit(eloValtozas);
    }
    const feladBtn = document.getElementById('feladBtn');
    const newGameBtn = document.getElementById('newGameBtn');
    if (feladBtn) feladBtn.classList.add('hidden');
    if (newGameBtn) newGameBtn.classList.remove('hidden');
    // Ingame chat: input letiltva (a meccs vege), de az uzenetek megmaradnak
    // — a felhasznalo elolvashatja a tortenetet meg a modal-zaras elott.
    chatPanelEnged(false);
    // Auto-felugro game-end modal — matt / patt / feladas / ido kifutas
    // utan a felhasznalonak ket valasztasa van: Fololdal vagy Uj jatek.
    // A modal-on belul az Uj jatek a `chessModeChooser`-t nyitja meg
    // (ujMeccsChooserNyitas), igy a felhasznalo kivalaszthatja a kovetkezo
    // mod-ot (Mattmester / Klasszikus / Blitz stb.) ugyanazon az oldalon.
    gameEndModalMegnyit(uzenet, eloValtozas);
}
