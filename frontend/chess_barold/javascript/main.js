import { jatek, mezoKeres } from './state.js';
import { szabLepKeres } from './logika.js';
import { lepesHajt, jatekUjraIndit } from './engine.js';
import { tablaRajzol, atvaltozasModal } from './UI-megjelenites.js';

// --- BELSŐ ÁLLAPOT A KATTINTÁSOKHOZ ---
let kijeloltMezo = null;
let ervenyesLepesek = [];
let aktivHuzas = null;

/**
 * Inicializálás: Ez fut le az oldal betöltésekor
 */
function init() {
    // Gombok eseménykezelői
    const ujJatekGomb = document.getElementById("resetBtn");
    if (ujJatekGomb) {
        ujJatekGomb.addEventListener("click", () => {
            jatekUjraIndit();
            kijeloltMezo = null;
            ervenyesLepesek = [];
        });
    }

    // Tábla kattintás kezelése
    const tablaElem = document.getElementById("board");
    if (tablaElem) {
        tablaElem.addEventListener("click", kattintasKezeles);
        tablaElem.addEventListener("dragstart", huzasIndit);
        tablaElem.addEventListener("dragover", huzasFelett);
        tablaElem.addEventListener("drop", huzasEjt);
        tablaElem.addEventListener("dragend", huzasVege);
    }
    
    const modalPieces = document.querySelectorAll(".promotion-piece");
    modalPieces.forEach(pieceDiv => {
        pieceDiv.addEventListener("click", () => {
            if (jatek.atvaltozasVar) {
                const valasztottTipus = pieceDiv.dataset.type; // queen, rook, stb.
                const { piece, move } = jatek.atvaltozasVar;

                // Végrehajtjuk a lépést az új típussal
                lepesHajt(piece, move, valasztottTipus);

                // Modal elrejtése és állapot törlése
                document.getElementById("promotion-modal").classList.add("hidden");
                jatek.atvaltozasVar = null;
            }
        });
    });

    jatekUjraIndit();
}

/**
 * Kezeli a mezőkre való kattintást
 */
function kattintasKezeles(esemeny) {
    if (aktivHuzas) return;
    if (jatek.vege || jatek.atvaltozasVar) return;

    // Megkeressük melyik mezőre kattintottak (HTML attribútumok alapján)
    const mezoElem = esemeny.target.closest(".square");
    if (!mezoElem) return;

    const x = parseInt(mezoElem.dataset.x);
    const y = parseInt(mezoElem.dataset.y);
    const kattintottMezo = mezoKeres(x, y);

    // 1. HA MÁR VAN KIJELÖLT BÁBU -> Megpróbálunk lépni
    if (kijeloltMezo && ervenyesLepesek.some(l => l.to === kattintottMezo)) {
        const lepes = ervenyesLepesek.find(l => l.to === kattintottMezo);

        // Gyalogátváltozás ellenőrzése
        if (kijeloltMezo.piece.type === "pawn" && (kattintottMezo.y === 0 || kattintottMezo.y === 7)) {
            jatek.atvaltozasVar = { piece: kijeloltMezo.piece, move: lepes };
            atvaltozasModal(kijeloltMezo.piece.color);
        } else {
            lepesHajt(kijeloltMezo.piece, lepes);
        }

        kijeloltMezo = null;
        ervenyesLepesek = [];
    }
    // 2. HA SAJÁT BÁBURA KATTINTUNK -> Kijelöljük
    else if (kattintottMezo.piece && kattintottMezo.piece.color === jatek.koronLevo) {
        kijeloltMezo = kattintottMezo;
        ervenyesLepesek = szabLepKeres(kattintottMezo.piece);
    }
    // 3. ÜRES MEZŐ VAGY ÉRVÉNYTELEN -> Kijelölés törlése
    else {
        kijeloltMezo = null;
        ervenyesLepesek = [];
    }

    // UI frissítése a kijelölésekkel
    tablaRajzol(kijeloltMezo, ervenyesLepesek);
}

function huzasIndit(esemeny) {
    if (jatek.vege || jatek.atvaltozasVar) {
        esemeny.preventDefault();
        return;
    }

    const pieceElem = esemeny.target.closest(".piece");
    const mezoElem = esemeny.target.closest(".square");
    if (!pieceElem || !mezoElem) {
        esemeny.preventDefault();
        return;
    }

    const x = parseInt(mezoElem.dataset.x, 10);
    const y = parseInt(mezoElem.dataset.y, 10);
    const forrasMezo = mezoKeres(x, y);
    if (!forrasMezo?.piece || forrasMezo.piece.color !== jatek.koronLevo) {
        esemeny.preventDefault();
        return;
    }

    const lepesek = szabLepKeres(forrasMezo.piece);
    if (lepesek.length === 0) {
        esemeny.preventDefault();
        return;
    }

    aktivHuzas = { piece: forrasMezo.piece, lepesek };
    kijeloltMezo = forrasMezo;
    ervenyesLepesek = lepesek;
    tablaRajzol(kijeloltMezo, ervenyesLepesek);

    esemeny.dataTransfer.effectAllowed = "move";
    esemeny.dataTransfer.setData("text/plain", `${x},${y}`);
}

function huzasFelett(esemeny) {
    if (!aktivHuzas) return;
    esemeny.preventDefault();
    esemeny.dataTransfer.dropEffect = "move";
}

function huzasEjt(esemeny) {
    if (!aktivHuzas) return;
    esemeny.preventDefault();

    const mezoElem = esemeny.target.closest(".square");
    if (!mezoElem) {
        huzasAllapotTorol();
        tablaRajzol(kijeloltMezo, ervenyesLepesek);
        return;
    }

    const x = parseInt(mezoElem.dataset.x, 10);
    const y = parseInt(mezoElem.dataset.y, 10);
    const celMezo = mezoKeres(x, y);
    const lepes = aktivHuzas.lepesek.find(l => l.to === celMezo);

    if (lepes) {
        if (aktivHuzas.piece.type === "pawn" && (celMezo.y === 0 || celMezo.y === 7)) {
            jatek.atvaltozasVar = { piece: aktivHuzas.piece, move: lepes };
            atvaltozasModal(aktivHuzas.piece.color);
        } else {
            lepesHajt(aktivHuzas.piece, lepes);
        }
    }

    huzasAllapotTorol();
    tablaRajzol(kijeloltMezo, ervenyesLepesek);
}

function huzasVege() {
    if (!aktivHuzas) return;
    huzasAllapotTorol();
    tablaRajzol(kijeloltMezo, ervenyesLepesek);
}

function huzasAllapotTorol() {
    aktivHuzas = null;
    kijeloltMezo = null;
    ervenyesLepesek = [];
}

// Start!
window.addEventListener("DOMContentLoaded", init);