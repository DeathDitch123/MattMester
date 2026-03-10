import { jatek, mezoKeres } from './state.js';
import { tablaRajzol, uiFrissitIdo, uiJatekVegeMegjelenit } from './UI-megjelenites.js';
import { huzasHozzaadMinden } from './main.js';
import { idoFut, idoLeall } from './timer.js';
import { jatekAllapotEllenor } from './logika.js';

export function jatekUjraIndit() {
    idoLeall();
    jatek.tabla = [];
    jatek.koronLevo = "white";
    jatek.vege = false;
    jatek.enPassant = null;
    jatek.utolsoLepes = null;
    jatek.atvaltozasVar = null;
    jatek.lepesszam = 0;
    jatek.felLepes = 0;
    jatek.lepesTortenet = [];
    jatek.jatekosok.white.ido = 600;
    jatek.jatekosok.black.ido = 600;

    // Tábla generálása 8x8
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            jatek.tabla.push({
                x, y,
                pos: `${String.fromCharCode(97 + x)}${8 - y}`,
                piece: null
            });
        }
    }

    alapfelallasHelyez();
    uiFrissitIdo();
    tablaRajzol();
    huzasHozzaadMinden();
    idoFut(jatek.koronLevo);
}

function alapfelallasHelyez() {
    const sorrend = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

    for (let x = 0; x < 8; x++) {
        mezoKeres(x, 1).piece = { type: "pawn", color: "black", hasMoved: false };
        mezoKeres(x, 6).piece = { type: "pawn", color: "white", hasMoved: false };
        mezoKeres(x, 0).piece = { type: sorrend[x], color: "black", hasMoved: false };
        mezoKeres(x, 7).piece = { type: sorrend[x], color: "white", hasMoved: false };
    }

    // Minden bábu kap referenciát a saját mezőjére
    jatek.tabla.forEach(m => { if (m.piece) m.piece.square = m; });
}

export function lepesHajt(babu, lepes, atvalTipus = "queen") {
    const { from, to, special } = lepes;

    // --- Lépéstörténetbe mentés (visszavonáshoz / ismétléshez) ---
    jatek.lepesTortenet.push({
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        piece: babu.type,
        color: babu.color,
        captured: to.piece ? to.piece.type : null,
        special: special || null,
        enPassantElotte: jatek.enPassant ? { ...jatek.enPassant } : null
    });

    // --- Féllépes számláló (50 lépés szabály) ---
    if (babu.type === "pawn" || to.piece) {
        jatek.felLepes = 0;
    } else {
        jatek.felLepes++;
    }

    // --- En passant mező frissítése ---
    // Ha gyalog kettőt lépett, beállítjuk az en passant célmezőt
    if (special === "double") {
        const irany = (babu.color === "white") ? -1 : 1;
        jatek.enPassant = { x: from.x, y: from.y + irany };
    } else {
        jatek.enPassant = null;
    }

    // --- SPECIÁLIS LÉPÉSEK VÉGREHAJTÁSA ---

    // Sáncolás: bástya is mozog
    if (special === "castle-ks" || special === "castle-qs") {
        const rook = lepes.rookFrom.piece;
        lepes.rookTo.piece = rook;
        rook.square = lepes.rookTo;
        rook.hasMoved = true;
        lepes.rookFrom.piece = null;
    }

    // En passant: az ütött gyalog eltűnik a saját mezőjéről
    if (special === "enpassant" && lepes.captured) {
        lepes.captured.piece = null;
    }

    // --- MOZGATÁS ---
    from.piece = null;
    to.piece = babu;
    babu.square = to;
    babu.hasMoved = true;

    // --- Gyalogátváltozás ---
    if (babu.type === "pawn" && (to.y === 0 || to.y === 7)) {
        babu.type = atvalTipus;
    }

    // --- Lépésszám növelés ---
    jatek.lepesszam++;
    jatek.utolsoLepes = lepes;

    // --- Játékosváltás és óra ---
    jatek.koronLevo = (jatek.koronLevo === "white") ? "black" : "white";
    idoFut(jatek.koronLevo);

    // --- Játékállapot ellenőrzés (matt / patt / 50 lépés) ---
    const allapot = jatekAllapotEllenor(jatek.koronLevo);
    if (allapot.vege) {
        jatek.vege = true;
        idoLeall();
        let uzenet;
        if (allapot.ok === "matt")    uzenet = `${jatek.koronLevo} matt — ${allapot.nyertes} nyert`;
        else if (allapot.ok === "patt") uzenet = "Döntetlen (Stalemate)";
        else if (allapot.ok === "50lepes") uzenet = "50 lépés szabály — Döntetlen.";
        uiJatekVegeMegjelenit(uzenet);
    }

    tablaRajzol();
    huzasHozzaadMinden();
}