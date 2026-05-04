// ============================================================
// SAKK UI — JATEKOS NEVEK (PLAYER BADGE-EK)
// ============================================================
// A `#name-white` / `#name-black` cimkek frissitese ket helyrol:
//   - PvP: `state.utolsoAllapot.pvpJatekosNevek` (vagy a `state.sajatNev` /
//     `state.ellenfelNev` fallback) + "(Te)" suffix a sajat szin alapjan
//   - Bot: jatekos = `state.sajatUsername` (ha bejelentkezett, kulonben "Te"),
//     bot = `🤖 ${state.botInfo.nev} (${state.botInfo.elo})`
//   - Idle: "Fehér" / "Fekete" placeholder
//
// A `flipped` osztaly toggle-jet is itt vegezzuk a `.app` element-en, hogy
// a player-badge-ek csereljenek ha a tabla forgatva van (`kellFlippelni`).
//
// `sajatUsernameKeres` a session API-bol szerzi a username-et init-kor.
// ============================================================

import { state } from '../state.js';
import { kellFlippelni } from '../flip.js';

export function nevekFrissit() {
    const nameBlack = document.getElementById("name-black");
    const nameWhite = document.getElementById("name-white");

    if (state.pvpAktiv) {
        // PvP — szerverből érkező név páros, saját szín alapján label
        const whiteNev = (state.utolsoAllapot && state.utolsoAllapot.pvpJatekosNevek) ? state.utolsoAllapot.pvpJatekosNevek.white : (state.sajatSzin === 'white' ? state.sajatNev : state.ellenfelNev);
        const blackNev = (state.utolsoAllapot && state.utolsoAllapot.pvpJatekosNevek) ? state.utolsoAllapot.pvpJatekosNevek.black : (state.sajatSzin === 'black' ? state.sajatNev : state.ellenfelNev);
        if (nameWhite) nameWhite.textContent = `${whiteNev || 'Fehér'}${state.sajatSzin === 'white' ? ' (Te)' : ''}`;
        if (nameBlack) nameBlack.textContent = `${blackNev || 'Fekete'}${state.sajatSzin === 'black' ? ' (Te)' : ''}`;
    } else if (state.botInfo) {
        // Bot = fekete. A jatekos nev: ha be van jelentkezve (state.sajatUsername),
        // a username-jet, kulonben "Te" fallback. A korabbi keménykódolt "Te"
        // helyett (lasd 2026-05-04 user-feedback).
        if (nameBlack) nameBlack.textContent = `🤖 ${state.botInfo.nev} (${state.botInfo.elo})`;
        if (nameWhite) nameWhite.textContent = state.sajatUsername || 'Te';
    } else {
        if (nameBlack) nameBlack.textContent = "Fekete";
        if (nameWhite) nameWhite.textContent = state.sajatUsername || "Fehér";
    }

    // Layout flip szinkron: amikor a tabla forgatva van (sajat = fekete +
    // autoflip), a player-badge-eket is meg kell csereltetni a CSS-ben (lasd
    // chess.css `.app.flipped`), kulonben a sajat "Te" cimke felul lenne, az
    // ellenfel meg alul — pont forditva mint amit a felhasznalo lat a tablan.
    const appEl = document.querySelector('.app');
    if (appEl) {
        const flipNeeded = (typeof kellFlippelni === 'function') ? !!kellFlippelni() : false;
        appEl.classList.toggle('flipped', flipNeeded);
    }
}

// Bejelentkezett felhasznalo username-jenek lekerese a session API-bol.
// Egyszer fut le init-kor; idempotens, ha mar van `state.sajatUsername`, nem hivja
// ujra. Ha nincs session (vendeg / hiba), null marad — a fallback "Te" /
// "Fehér" jelzes lep ervenybe.
export async function sajatUsernameKeres() {
    if (state.sajatUsername) return state.sajatUsername;
    try {
        const utils = window.MattMesterUtils;
        if (!utils || typeof utils.fetchSessionInfo !== 'function') return null;
        const data = await utils.fetchSessionInfo();
        if (data && data.loggedIn && data.user && typeof data.user.username === 'string') {
            state.sajatUsername = data.user.username;
            // Ha mar fut egy meccs es a "Te" placeholder lathato, frissitsuk
            // azonnal — nem kell uj jatekot indítani a username-ert.
            try { nevekFrissit(); } catch (_) {}
            return state.sajatUsername;
        }
    } catch (err) {
        console.warn('[chess] username fetch hiba:', err);
    }
    return null;
}
