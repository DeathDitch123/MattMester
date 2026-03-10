// ============================================================
// MAIN.JS — Frontend: drag&drop + API hívások
// ============================================================
// NINCS state.js / logika.js / engine.js / timer.js import.
// Minden logika a szerveren fut, itt csak:
//   1. API hívások (fetch)
//   2. Drag & drop (mousedown/mousemove/mouseup)
//   3. UI frissítés a szerver válaszából
// ============================================================

import { tablaRajzol, atvaltozasModal, atvaltozasModalElrejt,
         huzasKiemel, huzasKiemelTorol, uiJatekVegeMegjelenit, mezoElemKeres } from './UI-megjelenites.js';

// Az aktuális játék ID — a szerver adja
let gameId = null;

// Utolsó ismert állapot (csak rendereléshez, NEM logikai döntésekhez)
let utolsoAllapot = null;

// Idő szinkron polling timer
let idoPollTimer = null;

// Húzás folyamatban flag — ilyenkor NEM renderelünk újra
let huzasFolyamatban = false;

// MutationObserver — DOM manipuláció észlelése
let appObserver = null;

// Integritás ellenőrző timer (független az API poll-tól)
let integritasTimer = null;

// Folyamatban lévő helyreállítás flag (rekurzió védelem)
let helyreallitasFut = false;

// Hardcoded HTML template — a chess.html .app belseje, board tartalma nélkül
const OLDAL_VAZ = `
        <header class="topbar">
            <div class="player player-black">
                <div class="name">Magnus</div>
                <div class="clock" id="clock-black">10:00</div>
            </div>
        </header>

        <main class="main">
            <div class="board-wrap">
                <div id="board" class="board" aria-label="Sakk tábla"></div>

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
                <div class="status-row">
                    Aktív: <strong id="turn-name">fehér</strong>
                </div>
                <div id="status" class="status">játékon</div>
                <button id="resetBtn">Újra</button>
                <div class="legend">
                    <div><span class="legend-sq from"></span> Utolsó lépés</div>
                    <div><span class="legend-sq capture"></span> Ütés lehetőség</div>
                    <div><span class="legend-sq check"></span> Király sakkban</div>
                    <div><span class="legend-sq enpassant"></span> En passant</div>
                    <div><span class="legend-sq castle"></span> Sáncolás</div>
                    <div><span class="legend-sq promotion"></span> Átváltozás</div>
                </div>
            </aside>
        </main>

        <footer class="bottombar">
            <div class="player player-white">
                <div class="name">Orlan</div>
                <div class="clock" id="clock-white">10:00</div>
            </div>
        </footer>`;

// ────────────────────────────────────────────
// API HÍVÁSOK
// ────────────────────────────────────────────

async function apiUjJatek() {
    const res = await fetch('/api/chess/new', { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hiba');
    gameId = data.gameId;
    return data.allapot;
}

async function apiAllapot() {
    const res = await fetch(`/api/chess/${gameId}/state`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hiba');
    return data;
}

async function apiLepesek(x, y) {
    const res = await fetch(`/api/chess/${gameId}/moves/${x}/${y}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hiba');
    return data.lepesek;
}

async function apiLepes(fromX, fromY, toX, toY, promotion) {
    const body = { fromX, fromY, toX, toY };
    if (promotion) body.promotion = promotion;
    const res = await fetch(`/api/chess/${gameId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Illegális lépés');
    return data;
}

async function apiReset() {
    const res = await fetch(`/api/chess/${gameId}/reset`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hiba');
    return data.allapot;
}

// ────────────────────────────────────────────
// ÁLLAPOT FRISSÍTÉS + RENDERELÉS
// ────────────────────────────────────────────

function allapotFrissit(allapot) {
    utolsoAllapot = allapot;
    try { if (appObserver) appObserver.disconnect(); } catch(e) {}
    oldalVazVisszaallit();
    tablaRajzol(allapot);
    huzasHozzaadMinden(allapot);
    esemenyekUjraKot();
    try { observerIndit(); } catch(e) { console.error("Observer indítás hiba:", e); }

    if (allapot.uzenet) {
        uiJatekVegeMegjelenit(allapot.uzenet);
    }
}

/**
 * Ellenőrzi hogy az oldal váza sérült-e (bármi hiányzik).
 */
function oldalSerult(allapot) {
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
        ".sidebar .status-row",
        "#turn-name",
        "#status",
        "#resetBtn",
        ".sidebar .legend",
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

    // Szöveg tartalom ellenőrzés — ha a szöveget törlik, az elem megmarad de üres
    const szovegEllenorzesek = [
        { sel: ".player-black .name", min: 1 },
        { sel: "#clock-black", min: 1 },
        { sel: "#resetBtn", min: 1 },
        { sel: "#turn-name", min: 1 },
        { sel: "#status", min: 1 },
        { sel: ".player-white .name", min: 1 },
        { sel: "#clock-white", min: 1 },
        { sel: ".sidebar .legend", min: 5 },      // 6 legend sor
        { sel: ".sidebar .status-row", min: 3 },   // "Aktív: fehér"
    ];
    for (let i = 0; i < szovegEllenorzesek.length; i++) {
        const e = szovegEllenorzesek[i];
        const elem = document.querySelector(e.sel);
        if (elem && elem.textContent.trim().length < e.min) {
            console.log("[INTEGRITÁS] Üres szöveg:", e.sel);
            return true;
        }
    }

    // Legend div-ek száma (6 kell legyen)
    const legendDivek = document.querySelectorAll(".sidebar .legend > div");
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
function oldalVazVisszaallit() {
    let appElem = document.querySelector(".app");
    if (!appElem) {
        console.log("[HELYREÁLLÍTÁS] .app hiányzik — body-ból újra");
        appElem = document.createElement("div");
        appElem.className = "app";
        document.body.innerHTML = "";
        document.body.appendChild(appElem);
    }
    // Mindig: teljes váz felülírás a template-ből
    appElem.innerHTML = OLDAL_VAZ;
}

/**
 * Observer indítás — figyeli a body-t (subtree).
 */
function observerIndit() {
    if (appObserver) appObserver.disconnect();

    appObserver = new MutationObserver(() => {
        if (huzasFolyamatban || helyreallitasFut) return;
        if (!utolsoAllapot) return;
        try {
            if (oldalSerult(utolsoAllapot)) {
                console.warn("[OBSERVER] DOM sérülés → helyreállítás");
                biztonsagosHelyreallit();
            }
        } catch (e) {
            console.error("[OBSERVER] Hiba:", e);
        }
    });

    appObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

/**
 * Helyreállítás try-catch-csel és rekurzió védelemmel.
 */
function biztonsagosHelyreallit() {
    if (helyreallitasFut || !utolsoAllapot) return;
    helyreallitasFut = true;
    try {
        allapotFrissit(utolsoAllapot);
        console.log("[HELYREÁLLÍTÁS] Sikeres");
    } catch (e) {
        console.error("[HELYREÁLLÍTÁS] Hiba:", e);
    } finally {
        helyreallitasFut = false;
    }
}

/**
 * Független integritás timer — 500ms.
 */
function integritasEllenorzesIndit() {
    integritasEllenorzesLeall();
    console.log("[INTEGRITÁS] Timer elindítva (500ms)");
    integritasTimer = setInterval(() => {
        if (huzasFolyamatban || helyreallitasFut) return;
        if (!utolsoAllapot) return;
        try {
            if (oldalSerult(utolsoAllapot)) {
                console.warn("[TIMER] DOM sérülés → helyreállítás");
                biztonsagosHelyreallit();
            }
        } catch (e) {
            console.error("[TIMER] Hiba:", e);
        }
    }, 500);
}

function integritasEllenorzesLeall() {
    if (integritasTimer) {
        clearInterval(integritasTimer);
        integritasTimer = null;
    }
}

/**
 * Idő polling — másodpercenként lekéri az állapotot a szervertől.
 * Ezzel szinkronban marad az óra és észleli az időlejáratot is.
 */
function idoPollingIndit() {
    idoPollingLeall();
    idoPollTimer = setInterval(async () => {
        if (!gameId) return;
        if (huzasFolyamatban) return; // húzás közben nincs poll-frissítés
        try {
            const allapot = await apiAllapot();
            utolsoAllapot = allapot;

            // Teljes oldal integritás ellenőrzés
            if (oldalSerult(allapot)) {
                // Valami hiányzik — teljes újraépítés
                allapotFrissit(allapot);
            } else {
                // Normál: csak óra frissítés
                const format = (mp) => {
                    const perc = Math.floor(mp / 60);
                    const masodperc = mp % 60;
                    return `${perc}:${masodperc.toString().padStart(2, '0')}`;
                };
                if (allapot.ido) {
                    document.getElementById("clock-white").textContent = format(allapot.ido.white);
                    document.getElementById("clock-black").textContent = format(allapot.ido.black);
                }
            }

            // Időlejárat → játék vége
            if (allapot.vege && allapot.uzenet) {
                uiJatekVegeMegjelenit(allapot.uzenet);
                idoPollingLeall();
            }
        } catch (e) {
            // Csendben kezeljük — a következő poll újrapróbálja
        }
    }, 1000);
}

function idoPollingLeall() {
    if (idoPollTimer) {
        clearInterval(idoPollTimer);
        idoPollTimer = null;
    }
}

// ────────────────────────────────────────────
// INICIALIZÁLÁS
// ────────────────────────────────────────────

/**
 * Eseménykezelők újrakötése — reset gomb + promotion kiválasztás.
 * Minden allapotFrissit után hívjuk, mert a DOM újraépüléskor az események elvesznek.
 */
function esemenyekUjraKot() {
    const resetBtn = document.getElementById("resetBtn");
    if (resetBtn) {
        // Klónozás trükk: leveszi az összes régi listenert
        const ujBtn = resetBtn.cloneNode(true);
        resetBtn.parentNode.replaceChild(ujBtn, resetBtn);
        ujBtn.addEventListener("click", async () => {
            try {
                if (gameId) {
                    const allapot = await apiReset();
                    allapotFrissit(allapot);
                    idoPollingIndit();
                }
            } catch (e) {
                console.error('Reset hiba:', e);
            }
        });
    }

    const valasztek = document.querySelectorAll(".promotion-piece");
    for (let i = 0; i < valasztek.length; i++) {
        const eredeti = valasztek[i];
        const uj = eredeti.cloneNode(true);
        eredeti.parentNode.replaceChild(uj, eredeti);
        uj.addEventListener("click", async function () {
            const tipus = this.dataset.type;
            atvaltozasModalElrejt();

            if (window._atvaltozasVarData) {
                const d = window._atvaltozasVarData;
                window._atvaltozasVarData = null;
                try {
                    const eredmeny = await apiLepes(d.fromX, d.fromY, d.toX, d.toY, tipus);
                    allapotFrissit(eredmeny.allapot);
                } catch (e) {
                    console.error('Átváltozás lépés hiba:', e);
                    if (utolsoAllapot) allapotFrissit(utolsoAllapot);
                }
            }
        });
    }
}

async function init() {
    console.log("[INIT] Chess védelem indítás...");

    // Események első kötése
    esemenyekUjraKot();

    // Új játék indítás
    try {
        const allapot = await apiUjJatek();
        allapotFrissit(allapot);
        idoPollingIndit();
        integritasEllenorzesIndit();
        console.log("[INIT] Kész — játék fut, védelem aktív");
    } catch (e) {
        console.error('Játék indítási hiba:', e);
    }
}

// ────────────────────────────────────────────
// DRAG & DROP — mousedown/mousemove/mouseup
// ────────────────────────────────────────────

function huzasHozzaadMinden(allapot) {
    const babuElemek = document.querySelectorAll(".piece");
    for (let i = 0; i < babuElemek.length; i++) {
        const babuElem = babuElemek[i];
        const mezoElem = babuElem.parentElement;
        const x = parseInt(mezoElem.dataset.x, 10);
        const y = parseInt(mezoElem.dataset.y, 10);

        // Mező keresés az állapotból
        const mezo = allapot.tabla.find(m => m.x === x && m.y === y);
        if (!mezo || !mezo.piece) continue;

        // Csak a körön lévő játékos bábuit lehet húzni
        if (mezo.piece.color !== allapot.koronLevo) continue;

        huzasHozzaad(babuElem, x, y, mezo.piece, allapot);
    }
}

function huzasHozzaad(babuElem, fromX, fromY, piece, allapot) {
    babuElem.addEventListener("mousedown", async function (e) {
        if (allapot.vege) return;

        e.preventDefault();
        e.stopPropagation();
        huzasFolyamatban = true;

        // Legális lépések lekérdezése a SZERVERTŐL
        let lepesek;
        try {
            lepesek = await apiLepesek(fromX, fromY);
        } catch (err) {
            return; // Ha hiba van, nem húzunk
        }
        if (!lepesek || lepesek.length === 0) return;

        // Klón létrehozása
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

        // Kiemelés megjelenítés
        huzasKiemel(piece.type, piece.color, lepesek);

        // Klón kezdő pozíció
        babuKlonMozgat(e.clientX, e.clientY, klon, eltX, eltY);

        function egerMozogKezelo(em) {
            babuKlonMozgat(em.clientX, em.clientY, klon, eltX, eltY);
        }

        function egerFelKezelo(ef) {
            document.removeEventListener("mousemove", egerMozogKezelo);
            document.removeEventListener("mouseup", egerFelKezelo);
            huzasFolyamatban = false;
            babuHuzasEgerFel(ef, klon, babuElem, fromX, fromY, piece, lepesek);
        }

        document.addEventListener("mousemove", egerMozogKezelo);
        document.addEventListener("mouseup", egerFelKezelo);
    });
}

function babuKlonMozgat(mx, my, klon, eltX, eltY) {
    klon.style.left = (mx - eltX) + "px";
    klon.style.top = (my - eltY) + "px";
}

async function babuHuzasEgerFel(ef, klon, babuElem, fromX, fromY, piece, lepesek) {
    const elemAlatt = document.elementFromPoint(ef.clientX, ef.clientY);
    const celMezoElem = elemAlatt ? elemAlatt.closest(".square") : null;
    klon.remove();
    babuElem.style.opacity = "";
    huzasKiemelTorol();

    if (!celMezoElem) {
        // Érvénytelen ejtés — nincs változás
        return;
    }

    const toX = parseInt(celMezoElem.dataset.x, 10);
    const toY = parseInt(celMezoElem.dataset.y, 10);

    // Megkeressük a szerver lépéslistájában
    const talaltLepes = lepesek.find(l => l.toX === toX && l.toY === toY);
    if (!talaltLepes) {
        // Illegális cél — nincs változás
        return;
    }

    // Gyalog átváltozás ellenőrzés
    if (talaltLepes.promotion) {
        window._atvaltozasVarData = { fromX, fromY, toX, toY };
        atvaltozasModal(piece.color);
        return;
    }

    // Lépés küldése a szerverre
    try {
        const eredmeny = await apiLepes(fromX, fromY, toX, toY);
        allapotFrissit(eredmeny.allapot);
        if (eredmeny.uzenet) {
            uiJatekVegeMegjelenit(eredmeny.uzenet);
            idoPollingLeall();
        }
    } catch (e) {
        console.error('Lépés hiba:', e);
        // Visszarajzoljuk az aktuális állapotot
        if (utolsoAllapot) allapotFrissit(utolsoAllapot);
    }
}

// Start!
window.addEventListener("DOMContentLoaded", init);