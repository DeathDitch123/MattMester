import { jatek, mezoKeres } from './state.js';

/**
 * Kirajzolja a táblát, a bábukat és a jelölőket.
 * Paraméterek megegyeznek a chess.js viselkedéssel.
 */
export function tablaRajzol() {
    const boardElem = document.getElementById("board");
    if (!boardElem) return;
    boardElem.innerHTML = "";

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const mezo = mezoKeres(x, y);
            const mezoDiv = document.createElement("div");

            const isLight = (x + y) % 2 === 0;
            mezoDiv.className = "square";
            mezoDiv.setAttribute("role", isLight ? "light" : "dark");
            mezoDiv.dataset.x = x;
            mezoDiv.dataset.y = y;
            mezoDiv.dataset.pos = mezo.pos;
            mezo.el = mezoDiv;

            if (mezo.piece) {
                const pDiv = document.createElement("div");
                pDiv.className = "piece";
                pDiv.style.backgroundImage = `url('../images/${mezo.piece.color}_${mezo.piece.type}.png')`;
                mezoDiv.appendChild(pDiv);
            }

            boardElem.appendChild(mezoDiv);
        }
    }

    kiemelFrissit();
    koronLevoFrissit();
}

/**
 * Frissíti az utolsó lépés (sárga) és sakk (piros) kiemeléseket.
 * 1:1 a chess.js kiemelFrissit() függvényével.
 */
function kiemelFrissit() {
    const mezok = document.querySelectorAll(".square");
    for (let i = 0; i < mezok.length; i++) {
        mezok[i].classList.remove("from", "to", "check");
    }

    if (jatek.utolsoLepes) {
        const honnan = jatek.utolsoLepes.from;
        const hova = jatek.utolsoLepes.to;
        if (honnan && honnan.el) honnan.el.classList.add("from");
        if (hova && hova.el)     hova.el.classList.add("to");
    }

    for (let i = 0; i < jatek.tabla.length; i++) {
        const m = jatek.tabla[i];
        if (m.piece && m.piece.type === "king") {
            const ellenSzin = (m.piece.color === "white") ? "black" : "white";
            if (mezoTamadvaGyors(m.x, m.y, ellenSzin)) {
                m.el.classList.add("check");
            }
        }
    }
}

/**
 * Gyors ellenőrzés: támadott-e a mező. Importáljuk a logikából.
 */
import { mezoTamadva as mezoTamadvaGyors } from './logika.js';

/**
 * Frissíti a körön lévő játékos szövegét.
 */
function koronLevoFrissit() {
    const turnElem = document.getElementById("turn-name");
    if (turnElem) {
        turnElem.textContent = jatek.koronLevo;
    }
    const statusElem = document.getElementById("status");
    if (statusElem && !jatek.vege) {
        statusElem.textContent = "játékon";
    }
}

/**
 * Frissíti a két játékos óráját a HTML-ben.
 */
export function uiFrissitIdo() {
    const format = (mp) => {
        const perc = Math.floor(mp / 60);
        const masodperc = mp % 60;
        return `${perc}:${masodperc.toString().padStart(2, '0')}`;
    };
    
    document.getElementById("clock-white").textContent = format(jatek.jatekosok.white.ido);
    document.getElementById("clock-black").textContent = format(jatek.jatekosok.black.ido);
}

/**
 * Megjeleníti a játék végét jelző üzenetet.
 */
export function uiJatekVegeMegjelenit(uzenet) {
    const statusElem = document.getElementById("status");
    if (statusElem) statusElem.textContent = uzenet;
}

/**
 * Megjeleníti a gyalog átváltozás választó popup-ot. 1:1 chess.js.
 */
export function atvaltozasModal(szin) {
    const modal = document.getElementById("promotion-modal");
    const valasztek = modal.querySelectorAll(".promotion-piece");
    for (let i = 0; i < valasztek.length; i++) {
        const v = valasztek[i];
        const tipus = v.dataset.type;
        v.style.backgroundImage = `url('../images/${szin}_${tipus}.png')`;
    }
    modal.classList.remove("hidden");
}

/**
 * Elrejti az átváltozás modalt.
 */
export function atvaltozasModalElrejt() {
    document.getElementById("promotion-modal").classList.add("hidden");
}

/**
 * Húzás közbeni kiemelés — 1:1 a chess.js huzasKiemel()-ével.
 */
export function huzasKiemel(babu, lepesek) {
    for (let i = 0; i < lepesek.length; i++) {
        const l = lepesek[i];

        if (l.special === "enpassant") {
            l.to.el.classList.add("enpassant");
        } else if (l.special === "castle-ks" || l.special === "castle-qs") {
            if (babu.type === "king" && l.rookFrom) {
                l.rookFrom.el.classList.add("castle");
            } else if (babu.type === "rook") {
                const hazSor = (babu.color === "white") ? 7 : 0;
                const kirMezo = mezoKeres(4, hazSor);
                if (kirMezo && kirMezo.el) kirMezo.el.classList.add("castle");
            }
        } else if (l.capture === true) {
            l.to.el.classList.add("capture");
        } else {
            l.to.el.classList.add("move");
        }

        if (babu.type === "pawn") {
            const utSor = (babu.color === "white") ? 0 : 7;
            if (l.to.y === utSor) l.to.el.classList.add("promotion-target");
        }
    }
}

/**
 * Húzás kiemelések törlése — 1:1 a chess.js huzasKiemelTorol()-ével.
 */
export function huzasKiemelTorol() {
    const mezok = document.querySelectorAll(".square");
    for (let i = 0; i < mezok.length; i++) {
        mezok[i].classList.remove("move", "capture", "enpassant", "castle", "promotion-target");
    }
}