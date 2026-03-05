import { jatek } from './state.js';
import { uiFrissitIdo, uiJatekVegeMegjelenit } from './UI-megjelenites.js';

export function idoLeall() {
    Object.values(jatek.jatekosok).forEach(p => {
        if (p.timer) clearInterval(p.timer);
        p.timer = null;
    });
}

export function idoTikk(szin) {
    if (jatek.vege) return idoLeall();
    jatek.jatekosok[szin].ido--;
    
    if (jatek.jatekosok[szin].ido <= 0) {
        jatek.vege = true;
        let nyertes = (szin === "white") ? "black" : "white";
        uiJatekVegeMegjelenit(szin + " időtúllépés — " + nyertes + " nyert");
        idoLeall();
    }
    uiFrissitIdo();
}

export function idoFut(szin) {
    idoLeall();
    jatek.jatekosok[szin].timer = setInterval(() => idoTikk(szin), 1000);
}