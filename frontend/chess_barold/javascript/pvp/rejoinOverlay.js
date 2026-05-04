// ============================================================
// SAKK PVP — REJOIN OVERLAY (F5 / disconnect utan visible feedback)
// ============================================================
// Az overlay az `init()` legelejen aktivalodik (mielott barmi mas tortenne)
// es eltunik amint:
//   1. `chess:game:start` erkezik (rejoin success — pvpJatekKezdet hivja)
//   2. `chess:rejoin:none` erkezik (no active match — handler hivja)
//   3. 5s safety-timeout (offline socket / hibas backend / vendeg user)
//
// Az overlay z-index magasabb mint a chooser-e (3500 > 1080), igy defensive-en
// eltakar mindent ami a tabla helyett megjelenne, amig a rejoin folyamatban van.
//
// `state.rejoinOverlayHidden` idempotens flag — masodik elrejtes no-op.
// ============================================================

import { state } from '../state.js';

export function rejoinOverlayMutat() {
    const el = document.getElementById('rejoin-overlay');
    if (el) el.classList.remove('hidden');
}

export function rejoinOverlayElrejt() {
    if (state.rejoinOverlayHidden) return;
    state.rejoinOverlayHidden = true;
    const el = document.getElementById('rejoin-overlay');
    if (el) el.classList.add('hidden');
}
