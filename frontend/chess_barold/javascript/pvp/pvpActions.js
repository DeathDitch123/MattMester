// ============================================================
// SAKK PVP — JATEKOS-AKCIOK + KLIENS-OLDALI ORA + RESET
// ============================================================
// A PvP socket-emit-elo akciok osszefoglaloja:
//   - `pvpLegalisLepesKeres(x, y)`: bábu kiválasztás után legalis lepesek lekerese
//     a szervertol (Promise-os, 5s timeout-tal)
//   - `pvpLepesKuld(...)`: tényleges lepes elkuldese
//   - `pvpFeladas()`: feladas socket-en
//   - `pvpDontetlenAjanlat()`: dontetlen ajanlat
//
// Kliens-oldali ora (csak megjelenites — nem autoritativ!):
//   - `pvpKliensIdoIndit()`: 1Hz-es countdown a `state.utolsoAllapot.ido` alapjan
//   - `pvpKliensIdoLeall()`: idozito leallitasa
// A backend timer.js a forras-igazsag, ez csak a UI-flickering ellen csinal
// koztes value-t a server-tick-ek kozott.
//
// `pvpAllapotReset()`: a teljes PvP state nullazasa uj meccs / chooser nyitas-kor.
// ============================================================

import { state } from '../state.js';
import { pvpSocketKeres } from './socketRef.js';
import { abilitiesReset } from '../abilities.js';

// ──────────────────────────────────────────────────────────────
// Lepesek (legalis lekereses + tenyleges kuldes)
// ──────────────────────────────────────────────────────────────

export function pvpLegalisLepesKeres(x, y) {
    const socket = pvpSocketKeres();
    console.log('[PvP] moves:request küldés', { x, y, gameId: state.pvpGameId, socketConnected: socket?.connected });
    if (!socket) return Promise.resolve([]);
    return new Promise((resolve) => {
        const w = { resolve, timer: null };
        w.timer = setTimeout(() => {
            const idx = state.varakozoLepesPromisek.indexOf(w);
            if (idx !== -1) state.varakozoLepesPromisek.splice(idx, 1);
            console.warn('[PvP] moves:request timeout (5s) — szerver nem válaszolt');
            resolve([]);
        }, 5000);
        state.varakozoLepesPromisek.push(w);
        socket.emit('chess:moves:request', { gameId: state.pvpGameId, x, y });
    });
}

export function pvpLepesKuld(fromX, fromY, toX, toY, promotion) {
    const socket = pvpSocketKeres();
    console.log('[PvP] move küldés', { fromX, fromY, toX, toY, promotion, gameId: state.pvpGameId, socketConnected: socket?.connected });
    if (!socket) return;
    socket.emit('chess:move', { gameId: state.pvpGameId, fromX, fromY, toX, toY, promotion });
}

// ──────────────────────────────────────────────────────────────
// Kliens-oldali ora (csak megjelenites — backend autoritativ)
// ──────────────────────────────────────────────────────────────

export function pvpKliensIdoIndit() {
    pvpKliensIdoLeall();
    if (!state.pvpAktiv || !state.utolsoAllapot || state.utolsoAllapot.vege) return;

    state.kliensIdoTimer = setInterval(() => {
        if (!state.utolsoAllapot || state.utolsoAllapot.vege) return;
        const aktivSzin = state.utolsoAllapot.koronLevo;
        if (!state.utolsoAllapot.ido) return;

        // Vegtelen idős mod (ido[szin] === null vagy === Infinity) eseten
        // nem csokkentunk, kulonben NaN lenne. Csak akkor decrementaljuk,
        // ha tenylegesen szam.
        if (Number.isFinite(state.utolsoAllapot.ido[aktivSzin])) {
            state.utolsoAllapot.ido[aktivSzin] = Math.max(0, state.utolsoAllapot.ido[aktivSzin] - 1);
        }

        const format = (mp) => {
            // null / undefined / Infinity / NaN -> '∞' (idotlen meccs).
            // A masik formattol (UI-megjelenites.js) eltérően itt is kezelni
            // kell, kulonben '0:00' jelenne meg az ora-ticken.
            if (mp === null || mp === undefined || !Number.isFinite(mp)) return '∞';
            const perc = Math.floor(mp / 60);
            const masodperc = mp % 60;
            return `${perc}:${masodperc.toString().padStart(2, '0')}`;
        };
        const whiteElem = document.getElementById('clock-white');
        const blackElem = document.getElementById('clock-black');
        if (whiteElem) whiteElem.textContent = format(state.utolsoAllapot.ido.white);
        if (blackElem) blackElem.textContent = format(state.utolsoAllapot.ido.black);
    }, 1000);
}

export function pvpKliensIdoLeall() {
    if (state.kliensIdoTimer) {
        clearInterval(state.kliensIdoTimer);
        state.kliensIdoTimer = null;
    }
}

// ──────────────────────────────────────────────────────────────
// Feladas + dontetlen ajanlat
// ──────────────────────────────────────────────────────────────

export function pvpFeladas() {
    const socket = pvpSocketKeres();
    if (!socket || !state.pvpGameId) return;
    socket.emit('chess:surrender', { gameId: state.pvpGameId });
}

export function pvpDontetlenAjanlat() {
    const socket = pvpSocketKeres();
    if (!socket || !state.pvpGameId) return;
    socket.emit('chess:draw:offer', { gameId: state.pvpGameId });
    const drawBtn = document.getElementById('drawOfferBtn');
    if (drawBtn) {
        drawBtn.disabled = true;
        drawBtn.textContent = window.MattMesterI18n?.tx ? window.MattMesterI18n.tx('Ajánlat elküldve', 'Offer sent') : 'Ajánlat elküldve';
    }
}

// ──────────────────────────────────────────────────────────────
// Teljes PvP state nullazas (uj meccs / chooser nyitas-kor)
// ──────────────────────────────────────────────────────────────

export function pvpAllapotReset() {
    state.pvpAktiv = false;
    state.sajatSzin = null;
    state.ellenfelNev = null;
    state.sajatNev = null;
    state.pvpGameId = null;
    pvpKliensIdoLeall();
    const drawBtn = document.getElementById('drawOfferBtn');
    if (drawBtn) {
        drawBtn.disabled = false;
        drawBtn.textContent = window.MattMesterI18n?.tx ? window.MattMesterI18n.tx('Döntetlen ajánlat', 'Offer draw') : 'Döntetlen ajánlat';
        drawBtn.classList.add('hidden');
    }
    state.varakozoLepesPromisek.length = 0;
    abilitiesReset();
}
