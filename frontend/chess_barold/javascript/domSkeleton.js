// ============================================================
// domSkeleton.js — sakk DOM csontvaz + integritas ellenorzo
// ============================================================
// Eredetileg a main.js-ben volt; rendeltetes szerinti szet bontas
// soran kiemelve. Ket dolgot exportal:
//   1. oldalSerult(allapot) — kritikus DOM-elemek + szovegek + ELO
//      mezok jelenletet ellenorzi. true = serult, false = ep.
//   2. oldalVazVisszaallit() — a hardcoded HTML template-bol
//      ujraepiti a .app belsejét, ha az integritas-check serulest
//      jelez.


// Hardcoded HTML template — a chess.html .app belseje, board tartalma nélkül
const OLDAL_VAZ = `
        <div id="game-corner-status" class="game-corner-status">
            <div class="status-row">
                Aktív: <strong id="turn-name">fehér</strong>
            </div>
            <div id="status" class="status">játékon</div>
        </div>
        <button id="feladBtn" class="felad-btn felad-btn-fixed">Feladás</button>

        <header class="topbar">
            <div class="player player-black">
                <div class="captured-pieces" id="captured-by-black"></div>
                <span id="material-black" class="material-adv hidden">+0</span>
                <div class="name" id="name-black">Ellenfél</div>
                <div class="player-abilities" id="player-abilities-black"></div>
                <div class="clock" id="clock-black">10:00</div>
            </div>
        </header>

        <main class="main">
            <div class="board-wrap">
                <div id="board" class="board" aria-label="Sakk tábla"></div>

                <!-- TÁBLAKITAKARÁS overlay -->
                <div id="board-hide-overlay" class="board-hide-overlay hidden">
                    <span>Tábla eltakarva</span>
                    <span id="board-hide-countdown">5</span>
                </div>

                <div id="promotion-modal" class="promotion-modal hidden">
                    <div class="promotion-overlay"></div>
                    <div class="promotion-choices">
                        <div class="promotion-piece" data-type="queen"></div>
                        <div class="promotion-piece" data-type="rook"></div>
                        <div class="promotion-piece" data-type="bishop"></div>
                        <div class="promotion-piece" data-type="knight"></div>
                    </div>
                </div>
            </div>

            <aside class="sidebar">
                <!-- KÉPESSÉG BAR (legacy — most rejtve, helyette player-badge ability sorok) -->
                <div id="ability-bar" class="ability-bar hidden">
                    <div class="ability-points">
                        <span class="ap-label">Pontok</span>
                        <span class="ap-mine" id="ap-mine">0</span>
                        <span class="ap-sep">vs</span>
                        <span class="ap-opp" id="ap-opp">0</span>
                    </div>
                    <div id="ability-buttons" class="ability-buttons"></div>
                    <div id="ability-hint" class="ability-hint hidden"></div>
                </div>

                <div id="bot-thinking" class="bot-thinking hidden">🤖 A bot gondolkodik...</div>
                <div id="opponent-disconnected" class="opponent-dc hidden">
                    Ellenfél kikapcsolt... <span id="dc-countdown">60</span>mp
                </div>
                <div id="elo-change" class="elo-change hidden"></div>
                <button id="drawOfferBtn" class="draw-btn hidden">Döntetlen ajánlat</button>
                <div id="draw-offer-received" class="draw-offer hidden">
                    <p>Ellenfeled döntetlent ajánl</p>
                    <div class="draw-offer-buttons">
                        <button id="draw-accept" class="pvp-invite-btn accept">Elfogad</button>
                        <button id="draw-decline" class="pvp-invite-btn decline">Elutasít</button>
                    </div>
                </div>
                <button id="rematchBtn" class="rematch-btn hidden">Revans</button>
                <button id="newGameBtn" class="new-game-btn hidden">Új játék</button>
            </aside>
        </main>

        <footer class="bottombar">
            <div class="player player-white">
                <div class="captured-pieces" id="captured-by-white"></div>
                <span id="material-white" class="material-adv hidden">+0</span>
                <div class="name" id="name-white">Te</div>
                <div class="player-abilities" id="player-abilities-white"></div>
                <div class="clock" id="clock-white">10:00</div>
            </div>
        </footer>`;
/**
 * Ellenőrzi hogy az oldal váza sérült-e (bármi hiányzik).
 */
export function oldalSerult(allapot) {
    const kritikusElemek = [
        ".app",
        "header.topbar",
        ".player-black",
        ".player-black .name",
        "#clock-black",
        "main.main",
        ".board-wrap",
        "#board",
        "#promotion-modal",
        ".promotion-overlay",
        ".promotion-choices",
        '.promotion-piece[data-type="queen"]',
        '.promotion-piece[data-type="rook"]',
        '.promotion-piece[data-type="bishop"]',
        '.promotion-piece[data-type="knight"]',
        "aside.sidebar",
        "#game-corner-status .status-row",
        "#turn-name",
        "#status",
        "#bot-thinking",
        "#feladBtn",
        "footer.bottombar",
        ".player-white",
        ".player-white .name",
        "#clock-white"
    ];
    for (let i = 0; i < kritikusElemek.length; i++) {
        if (!document.querySelector(kritikusElemek[i])) {
            console.log("[INTEGRITÁS] Hiányzó elem:", kritikusElemek[i]);
            return true;
        }
    }

    // Szöveg tartalom ellenőrzés
    const szovegEllenorzesek = [
        { sel: ".player-black .name", min: 1 },
        { sel: "#clock-black", min: 1 },
        { sel: "#feladBtn", min: 1 },
        { sel: "#turn-name", min: 1 },
        { sel: "#status", min: 1 },
        { sel: ".player-white .name", min: 1 },
        { sel: "#clock-white", min: 1 },
        { sel: "#game-corner-status .status-row", min: 3 },
    ];
    for (let i = 0; i < szovegEllenorzesek.length; i++) {
        const e = szovegEllenorzesek[i];
        const elem = document.querySelector(e.sel);
        if (elem && elem.textContent.trim().length < e.min) {
            console.log("[INTEGRITÁS] Üres szöveg:", e.sel);
            return true;
        }
    }

    // Help modal jelmagyarazat sorai — uj helyukon (#help-modal .legend > div)
    // ugyanugy 6 db kell, hogy mind a 6 vizualis kategoria megjelenjen.
    const legendDivek = document.querySelectorAll("#help-modal .legend > div");
    if (legendDivek.length < 6) {
        console.log("[INTEGRITÁS] Legend sorok:", legendDivek.length, "/ 6");
        return true;
    }

    if (allapot) {
        const boardElem = document.getElementById("board");
        if (!boardElem) return true;
        const mezok = boardElem.querySelectorAll(".square");
        if (mezok.length !== 64) {
            console.log("[INTEGRITÁS] Mezők száma:", mezok.length, "/ 64");
            return true;
        }
        const szerverBabuk = allapot.tabla.filter(m => m.piece).length;
        const domBabuk = boardElem.querySelectorAll(".piece").length;
        if (domBabuk !== szerverBabuk) {
            console.log("[INTEGRITÁS] Bábuk DOM:", domBabuk, "szerver:", szerverBabuk);
            return true;
        }
    }
    return false;
}

/**
 * Visszaállítja az oldal vázát a hardcoded template-ből.
 */
export function oldalVazVisszaallit() {
    let appElem = document.querySelector(".app");
    if (!appElem) {
        console.log("[HELYREÁLLÍTÁS] .app hiányzik — body-ból újra");
        appElem = document.createElement("div");
        appElem.className = "app";
        document.body.innerHTML = "";
        document.body.appendChild(appElem);
    }
    appElem.innerHTML = OLDAL_VAZ;
}
