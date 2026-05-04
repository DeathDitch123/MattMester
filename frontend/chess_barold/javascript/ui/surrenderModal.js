// ============================================================
// SAKK UI — FELADAS (SURRENDER) MODAL
// ============================================================
// "Biztos hogy feladod?" modal + long-press confirm gomb (1.5s hold).
// A long-press anti-misclick: vegletes lepes, NE legyen veletlen.
//
// A modul self-contained: csak a DOM-ra hagyatkozik. A `bindSurrenderModal`
// onConfirm callback-et kap, ami a tenyleges feladast vegrehajto fuggvenyt
// hivja (main.js-ben `doFeladJatek` az ELO + DB + UI flow-t intezi).
//
// `state.surrenderHoldTimer` a kozos `state.js` containerben van (a long-press
// timer ref-je) — a startHold tarolja, a stopHold torli.
// ============================================================

import { state } from '../state.js';

const FELADAS_HOLD_MS = 1500;

export function feladasModalMegjelenit() {
    document.getElementById('surrender-modal').classList.remove('hidden');
}

export function feladasModalElrejt() {
    document.getElementById('surrender-modal').classList.add('hidden');
}

// A modal gombjainak bekotese (Cancel + long-press Confirm).
// A `onConfirm` callback akkor fut, ha a felhasznalo 1.5s-ig nyomva tartja
// a megerosito gombot — ez vegrehajtja a feladast.
export function bindSurrenderModal({ onConfirm } = {}) {
    document.getElementById('surrenderCancelBtn').onclick = feladasModalElrejt;

    const confirmBtn = document.getElementById('surrenderConfirmBtn');
    const startHold = () => {
        confirmBtn.classList.add('holding');
        state.surrenderHoldTimer = setTimeout(async () => {
            confirmBtn.classList.remove('holding');
            feladasModalElrejt();
            if (typeof onConfirm === 'function') await onConfirm();
        }, FELADAS_HOLD_MS);
    };
    const stopHold = () => {
        clearTimeout(state.surrenderHoldTimer);
        state.surrenderHoldTimer = null;
        confirmBtn.classList.remove('holding');
    };
    confirmBtn.addEventListener('mousedown', startHold);
    confirmBtn.addEventListener('mouseup', stopHold);
    confirmBtn.addEventListener('mouseleave', stopHold);
    confirmBtn.addEventListener('touchstart', e => { e.preventDefault(); startHold(); });
    confirmBtn.addEventListener('touchend', stopHold);
}
