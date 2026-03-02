import { jatek, mezoKeres } from './state.js';

const boardElem = document.getElementById("board");

/**
 * Kirajzolja a táblát, a bábukat és a jelölőket.
 */
export function tablaRajzol(kijeloltMezo = null, ervenyesLepesek = []) {
    boardElem.innerHTML = ""; // Alaphelyzetbe állítás

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const mezo = mezoKeres(x, y);
            const mezoDiv = document.createElement("div");
            
            // Mező színe (sakktábla minta)
            const isLight = (x + y) % 2 === 0;
            mezoDiv.className = `square ${isLight ? 'light' : 'dark'}`;
            mezoDiv.dataset.x = x;
            mezoDiv.dataset.y = y;

            // 1. Kijelölt bábu kiemelése
            if (kijeloltMezo && mezo === kijeloltMezo) {
                mezoDiv.classList.add("selected");
            }

            // 2. Lépéslehetőségek (pöttyök/körök)
            const lepes = ervenyesLepesek.find(l => l.to === mezo);
            if (lepes) {
                const marker = document.createElement("div");
                // Ha ütés, kap egy külön classt (pl. pirosas kör), egyébként sima pötty
                marker.className = lepes.capture ? "possible-capture" : "possible-move";
                mezoDiv.appendChild(marker);
            }

            // 3. Bábuk megjelenítése a te fájlneveid alapján
            if (mezo.piece) {
                const img = document.createElement("img");
                // Útvonal: ../images/szin_tipus.png
                img.src = `../images/${mezo.piece.color}_${mezo.piece.type}.png`;
                img.className = "piece";
                img.draggable = false; // Ne lehessen böngészőből "elhúzni" a képet
                mezoDiv.appendChild(img);
            }

            boardElem.appendChild(mezoDiv);
        }
    }
    
    // UI szöveges elemek frissítése
    const turnElem = document.getElementById("turn-name");
    if (turnElem) {
        turnElem.textContent = jatek.koronLevo === "white" ? "fehér" : "fekete";
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
 * Megjeleníti a gyalogátváltozás választót.
 */
export function atvaltozasModal(szin) {
    const modal = document.getElementById("promotion-modal");
    modal.classList.remove("hidden");
    
    // Frissítsük a modalban lévő képeket a megfelelő színűre
    const choices = modal.querySelectorAll(".promotion-piece");
    choices.forEach(div => {
        const type = div.dataset.type;
        div.style.backgroundImage = `url('../images/${szin}_${type}.png')`;
    });
}