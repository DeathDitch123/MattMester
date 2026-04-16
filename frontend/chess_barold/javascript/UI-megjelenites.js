// ============================================================
// UI-MEGJELENITES — Frontend renderelés szerver-állapotból
// ============================================================
// NINCS state.js / logika.js import — minden adat a szervertől jön.
// A szerver JSON-t ad (allapot objektum), ebből rajzolunk.
// ============================================================

/**
 * Kirajzolja a táblát a szerver által küldött állapotból.
 * @param {object} allapot - szerver válasz: { tabla, koronLevo, vege, utolsoLepes, sakkPoz, ido }
 * @param {boolean} flip - true = fekete játékos nézete (tábla fejjel lefelé)
 */
export function tablaRajzol(allapot, flip = false) {
    const boardElem = document.getElementById("board");
    if (!boardElem) return;
    boardElem.innerHTML = "";

    for (let renderY = 0; renderY < 8; renderY++) {
        for (let renderX = 0; renderX < 8; renderX++) {
            const x = flip ? (7 - renderX) : renderX;
            const y = flip ? (7 - renderY) : renderY;
            const mezo = allapot.tabla.find(m => m.x === x && m.y === y);
            const mezoDiv = document.createElement("div");

            const isLight = (x + y) % 2 === 0;
            mezoDiv.className = "square";
            mezoDiv.setAttribute("role", isLight ? "light" : "dark");
            mezoDiv.dataset.x = x;
            mezoDiv.dataset.y = y;
            mezoDiv.dataset.pos = mezo.pos;

            if (renderX === 0) {
                const rank = document.createElement("span");
                rank.className = "coord-rank";
                rank.textContent = String(8 - y);
                mezoDiv.appendChild(rank);
            }

            if (renderY === 7) {
                const file = document.createElement("span");
                file.className = "coord-file";
                file.textContent = String.fromCharCode(97 + x);
                mezoDiv.appendChild(file);
            }

            if (mezo.piece) {
                const pDiv = document.createElement("div");
                pDiv.className = "piece";
                pDiv.style.backgroundImage = `url('../images/${mezo.piece.color}_${mezo.piece.type}.png')`;
                mezoDiv.appendChild(pDiv);
            }

            boardElem.appendChild(mezoDiv);
        }
    }

    kiemelFrissit(allapot);
    koronLevoFrissit(allapot);
    idoFrissit(allapot);
}

/**
 * Frissíti az utolsó lépés (sárga) és sakk (piros) kiemeléseket.
 * Az adatok a szerver állapotából jönnek — NEM frontenden számolunk.
 */
function kiemelFrissit(allapot) {
    const mezok = document.querySelectorAll(".square");
    for (let i = 0; i < mezok.length; i++) {
        mezok[i].classList.remove("from", "to", "check");
    }

    // Utolsó lépés sárga kiemelés (from/to)
    if (allapot.utolsoLepes) {
        const fromEl = mezoElemKeres(allapot.utolsoLepes.from.x, allapot.utolsoLepes.from.y);
        const toEl = mezoElemKeres(allapot.utolsoLepes.to.x, allapot.utolsoLepes.to.y);
        if (fromEl) fromEl.classList.add("from");
        if (toEl) toEl.classList.add("to");
    }

    // Sakk jelzés (piros) — a szerver megmondja melyik király van sakkban
    if (allapot.sakkPoz) {
        const sakkEl = mezoElemKeres(allapot.sakkPoz.x, allapot.sakkPoz.y);
        if (sakkEl) sakkEl.classList.add("check");
    }
}

/**
 * Frissíti a körön lévő játékos szövegét.
 */
function koronLevoFrissit(allapot) {
    const turnElem = document.getElementById("turn-name");
    if (turnElem) {
        turnElem.textContent = allapot.koronLevo;
    }
    const statusElem = document.getElementById("status");
    if (statusElem && !allapot.vege) {
        statusElem.textContent = "játékon";
    }
}

/**
 * Frissíti a két játékos óráját a HTML-ben.
 */
function idoFrissit(allapot) {
    if (!allapot.ido) return;
    const format = (mp) => {
        const perc = Math.floor(mp / 60);
        const masodperc = mp % 60;
        return `${perc}:${masodperc.toString().padStart(2, '0')}`;
    };
    document.getElementById("clock-white").textContent = format(allapot.ido.white);
    document.getElementById("clock-black").textContent = format(allapot.ido.black);
}

/**
 * Megjeleníti a játék végét jelző üzenetet.
 */
export function uiJatekVegeMegjelenit(uzenet) {
    const statusElem = document.getElementById("status");
    if (statusElem) statusElem.textContent = uzenet;
}

/**
 * Megjeleníti a gyalog átváltozás választó popup-ot.
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
 * Húzás közbeni kiemelés — a szerver által adott lépéslistából.
 * @param {string} babuType - 'pawn', 'king', stb.
 * @param {string} babuColor - 'white' | 'black'
 * @param {Array} lepesek - szerver válasz: [{toX, toY, tipus, promotion}]
 */
export function huzasKiemel(babuType, babuColor, lepesek) {
    for (let i = 0; i < lepesek.length; i++) {
        const l = lepesek[i];
        const celEl = mezoElemKeres(l.toX, l.toY);
        if (!celEl) continue;

        if (l.tipus === "enpassant") {
            celEl.classList.add("enpassant");
        } else if (l.tipus === "castle") {
            celEl.classList.add("castle");
        } else if (l.tipus === "capture") {
            celEl.classList.add("capture");
        } else {
            celEl.classList.add("move");
        }

        if (l.promotion) {
            celEl.classList.add("promotion-target");
        }
    }
}

/**
 * Húzás kiemelések törlése.
 */
export function huzasKiemelTorol() {
    const mezok = document.querySelectorAll(".square");
    for (let i = 0; i < mezok.length; i++) {
        mezok[i].classList.remove("move", "capture", "enpassant", "castle", "promotion-target");
    }
}

/**
 * Segédfüggvény — mező DOM elem keresése koordináta alapján.
 */
function mezoElemKeres(x, y) {
    return document.querySelector(`.square[data-x="${x}"][data-y="${y}"]`);
}

/**
 * Slide animáció — a bábu csúszik a régi mezőről az újra.
 * Meghívás UTÁN kell hívni, hogy tablaRajzol() már lefutott (a bábu a célmezőn van).
 * @param {object} utolsoLepes - { from: {x,y}, to: {x,y} }
 */
let aktivLepesGhost = null;
let aktivLepesCelPiece = null;
const LEPES_ANIM_MS = 180;
const LEPES_ANIM_FALLBACK_MS = 700;

export function lepesAnimacio(utolsoLepes) {
    if (!utolsoLepes) return Promise.resolve(false);
    const fromEl = mezoElemKeres(utolsoLepes.from.x, utolsoLepes.from.y);
    const toEl = mezoElemKeres(utolsoLepes.to.x, utolsoLepes.to.y);
    if (!fromEl) return Promise.resolve(false);
    if (!toEl) return Promise.resolve(false);

    const toPiece = toEl.querySelector(".piece");
    if (!toPiece) return Promise.resolve(false);

    if (aktivLepesGhost) {
        aktivLepesGhost.remove();
        aktivLepesGhost = null;
    }
    if (aktivLepesCelPiece && aktivLepesCelPiece.isConnected) {
        aktivLepesCelPiece.style.visibility = "";
    }
    aktivLepesCelPiece = null;

    const fromRect = fromEl.getBoundingClientRect();
    const toRect = toEl.getBoundingClientRect();
    const pieceRect = toPiece.getBoundingClientRect();

    const startLeft = fromRect.left + (fromRect.width - pieceRect.width) / 2;
    const startTop = fromRect.top + (fromRect.height - pieceRect.height) / 2;
    const endLeft = toRect.left + (toRect.width - pieceRect.width) / 2;
    const endTop = toRect.top + (toRect.height - pieceRect.height) / 2;

    const ghost = toPiece.cloneNode(true);
    ghost.style.position = "fixed";
    ghost.style.left = `${startLeft}px`;
    ghost.style.top = `${startTop}px`;
    ghost.style.width = `${pieceRect.width}px`;
    ghost.style.height = `${pieceRect.height}px`;
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "9999";
    ghost.style.transition = `transform ${LEPES_ANIM_MS}ms ease-out`;
    ghost.style.willChange = "transform";

    document.body.appendChild(ghost);
    aktivLepesGhost = ghost;
    aktivLepesCelPiece = toPiece;

    toPiece.style.visibility = "hidden";

    const dx = endLeft - startLeft;
    const dy = endTop - startTop;

    return new Promise((resolve) => {
        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            if (ghost.parentNode) ghost.remove();
            if (toPiece.isConnected) toPiece.style.visibility = "";
            if (aktivLepesGhost === ghost) aktivLepesGhost = null;
            if (aktivLepesCelPiece === toPiece) aktivLepesCelPiece = null;
            resolve(true);
        };

        requestAnimationFrame(() => {
            ghost.style.transform = `translate(${dx}px, ${dy}px)`;
            ghost.addEventListener("transitionend", cleanup, { once: true });
            setTimeout(cleanup, LEPES_ANIM_FALLBACK_MS);
        });
    });
}

export { mezoElemKeres };