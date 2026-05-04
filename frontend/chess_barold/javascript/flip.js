// ============================================================
// SAKK — TABLA-IRANY (FLIP) DONTES
// ============================================================
// Eldonti hogy flippelve renderelje-e a tablat (sajat oldal alul-szabaly).
// Prioritas:
//   1. manualis felulir (`state.manualisFlipFelulirva` !== null) — toggle gomb
//   2. setting `autoflip` (chess settings) + sajat szin (PvP-n black)
//
// Bot-meccsen a jatekos mindig white, igy auto-flip nem trigger-el.
// Hot-seat / klasszikus 2-jatekos modot regen tamogattuk, az tipikusan flippel
// minden lepes utan — DE a hot-seat endpoint torolve (lasd #54), igy ezt nem
// kezeljuk.
// ============================================================

import { state } from './state.js';
import { getChessSettings } from './settings.js';

export function kellFlippelni() {
    if (state.manualisFlipFelulirva !== null) return state.manualisFlipFelulirva;
    let autoflip = true;
    try { autoflip = getChessSettings().autoflip !== false; } catch (e) { autoflip = true; }
    return autoflip && state.pvpAktiv && state.sajatSzin === 'black';
}
