import { jatek, mezoKeres } from './state.js';
import { szabLepKeres } from './logika.js';
import { lepesHajt, jatekUjraIndit } from './engine.js';
import { tablaRajzol, atvaltozasModal } from './UI-megjelenites.js';

// --- BELSŐ ÁLLAPOT A KATTINTÁSOKHOZ ---
let kijeloltMezo = null;
let ervenyesLepesek = [];

/**
 * Inicializálás: Ez fut le az oldal betöltésekor
 */
function init() {
    // Gombok eseménykezelői
    const ujJatekGomb = document.getElementById("new-game-btn");
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
    }
    
    const modalPieces = document.querySelectorAll(".promotion-piece");
    modalPieces.forEach(pieceDiv => {
        pieceDiv.addEventListener("click", () => {
            if (jatek.atvaltozasVar) {
                const választottTípus = pieceDiv.dataset.type; // queen, rook, stb.
                const { piece, move } = jatek.atvaltozasVar;

                // Végrehajtjuk a lépést az új típussal
                lepesHajt(piece, move, választottTípus);

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

// Start!
window.addEventListener("DOMContentLoaded", init);