import { jatek, mezoKeres } from './state.js';
import { tablaRajzol, uiFrissitIdo } from './UI-megjelenites.js';
import { idoFut, idoLeall } from './timer.js';

export function jatekUjraIndit() {
    idoLeall();
    jatek.tabla = [];
    jatek.koronLevo = "white";
    jatek.vege = false;
    jatek.jatekosok.white.ido = 600;
    jatek.jatekosok.black.ido = 600;

    // Tábla generálása 8x8
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            jatek.tabla.push({
                x, y, pos: `${String.fromCharCode(97 + x)}${8 - y}`, piece: null
            });
        }
    }

    alapfelallasHelyez();
    uiFrissitIdo();
    tablaRajzol();
}

function alapfelallasHelyez() {
    const sorrend = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

    for (let x = 0; x < 8; x++) {
        // Parasztok
        mezoKeres(x, 1).piece = { type: "pawn", color: "black", hasMoved: false };
        mezoKeres(x, 6).piece = { type: "pawn", color: "white", hasMoved: false };

        // Tisztek
        mezoKeres(x, 0).piece = { type: sorrend[x], color: "black", hasMoved: false };
        mezoKeres(x, 7).piece = { type: sorrend[x], color: "white", hasMoved: false };
    }

    // Fontos: Minden bábu kapjon referenciát a saját mezőjére
    jatek.tabla.forEach(m => { if (m.piece) m.piece.square = m; });
}

export function lepesHajt(babu, lepes, atvalTipus = "queen") {
    const { from, to, special } = lepes;

    // Ha gyalogátváltozás történik, módosítjuk a bábu típusát
    if (babu.type === "pawn" && (to.y === 0 || to.y === 7)) {
        babu.type = atvalTipus;
    }
    // 1. Mozgatás
    lepes.from.piece = null;
    lepes.to.piece = babu;
    babu.square = lepes.to;
    babu.hasMoved = true;

    // 2. Játékosváltás és óra
    jatek.koronLevo = (jatek.koronLevo === "white") ? "black" : "white";
    idoFut(jatek.koronLevo);

    tablaRajzol();
}