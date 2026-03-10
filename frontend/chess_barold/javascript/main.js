import { jatek, mezoKeres } from './state.js';
import { szabLepKeres } from './logika.js';
import { lepesHajt, jatekUjraIndit } from './engine.js';
import { tablaRajzol, atvaltozasModal, atvaltozasModalElrejt, huzasKiemel, huzasKiemelTorol } from './UI-megjelenites.js';

/**
 * Inicializálás — 1:1 a chess.js DOMContentLoaded blokkjával
 */
function init() {
    document.getElementById("resetBtn").addEventListener("click", jatekUjraIndit);

    // Átváltozás modal bábuk eseménykezelői
    const valasztek = document.querySelectorAll(".promotion-piece");
    for (let i = 0; i < valasztek.length; i++) {
        valasztek[i].addEventListener("click", function () {
            const tipus = this.dataset.type;
            atvaltozasModalElrejt();
            if (jatek.atvaltozasVar) {
                lepesHajt(jatek.atvaltozasVar.piece, jatek.atvaltozasVar.move, tipus);
                jatek.atvaltozasVar = null;
            }
        });
    }

    jatekUjraIndit();
}

/**
 * Húzás hozzáadása — meghívódik tablaRajzol után minden bábura (export, UI hívja)
 * 1:1 a chess.js huzasHozzaad() függvényével, moduláris adaptáció.
 */
export function huzasHozzaadMinden() {
    const babuElemek = document.querySelectorAll(".piece");
    for (let i = 0; i < babuElemek.length; i++) {
        const babuElem = babuElemek[i];
        const mezoElem = babuElem.parentElement;
        const x = parseInt(mezoElem.dataset.x, 10);
        const y = parseInt(mezoElem.dataset.y, 10);
        const mezo = mezoKeres(x, y);
        if (!mezo || !mezo.piece) continue;
        huzasHozzaad(babuElem, mezo.piece);
    }
}

function huzasHozzaad(babuElem, babu) {
    babuElem.addEventListener("mousedown", function (e) {
        if (jatek.vege === true) return;
        if (babu.color !== jatek.koronLevo) return;

        e.preventDefault();
        e.stopPropagation();

        // Klón létrehozása — 1:1 chess.js
        const klon = babuElem.cloneNode(true);
        klon.className = "piece dragging";
        klon.style.position = "fixed";
        klon.style.zIndex = 9999;
        klon.style.pointerEvents = "none";
        klon.style.width = babuElem.offsetWidth + "px";
        klon.style.height = babuElem.offsetHeight + "px";
        const eltX = babuElem.offsetWidth / 2;
        const eltY = babuElem.offsetHeight / 2;
        document.body.appendChild(klon);

        // Eredeti bábu halvány
        babuElem.style.opacity = "0.3";

        // Szabályos lépések kiszámítása és kiemelés
        const lepesek = szabLepKeres(babu);
        huzasKiemel(babu, lepesek);

        // Klón kezdő pozíció
        babuKlonMozgat(e.clientX, e.clientY, klon, eltX, eltY);

        // Mozgatás
        function egerMozogKezelo(em) {
            babuKlonMozgat(em.clientX, em.clientY, klon, eltX, eltY);
        }

        // Felengedés
        function egerFelKezelo(ef) {
            document.removeEventListener("mousemove", egerMozogKezelo);
            document.removeEventListener("mouseup", egerFelKezelo);
            babuHuzasEgerFel(ef, klon, babuElem, lepesek, babu);
        }

        document.addEventListener("mousemove", egerMozogKezelo);
        document.addEventListener("mouseup", egerFelKezelo);
    });
}

function babuKlonMozgat(mx, my, klon, eltX, eltY) {
    klon.style.left = (mx - eltX) + "px";
    klon.style.top = (my - eltY) + "px";
}

function babuHuzasEgerFel(ef, klon, babuElem, lepesek, babu) {
    const elemAlatt = document.elementFromPoint(ef.clientX, ef.clientY);
    const celMezoElem = elemAlatt ? elemAlatt.closest(".square") : null;
    klon.remove();
    babuElem.style.opacity = "";

    if (celMezoElem) {
        const cx = parseInt(celMezoElem.dataset.x, 10);
        const cy = parseInt(celMezoElem.dataset.y, 10);
        const celMezo = mezoKeres(cx, cy);
        let talaltLepes = null;

        for (let i = 0; i < lepesek.length; i++) {
            if (lepesek[i].to === celMezo) {
                talaltLepes = lepesek[i];
                break;
            }
        }

        if (talaltLepes) {
            // Gyalog átváltozás ellenőrzése
            if (babu.type === "pawn") {
                const utSor = (babu.color === "white") ? 0 : 7;
                if (talaltLepes.to.y === utSor) {
                    jatek.atvaltozasVar = { piece: babu, move: talaltLepes };
                    atvaltozasModal(babu.color);
                    huzasKiemelTorol();
                    return;
                }
            }
            lepesHajt(babu, talaltLepes);
        } else {
            tablaRajzol();
            huzasHozzaadMinden();
        }
    } else {
        tablaRajzol();
        huzasHozzaadMinden();
    }

    huzasKiemelTorol();
}

// Start!
window.addEventListener("DOMContentLoaded", init);