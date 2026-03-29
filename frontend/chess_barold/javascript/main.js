// ============================================================
// MAIN.JS — Frontend: drag&drop + API hívások
// ============================================================
// NINCS state.js / logika.js / engine.js / timer.js import.
// Minden logika a szerveren fut, itt csak:
//   1. API hívások (fetch)
//   2. Drag & drop (mousedown/mousemove/mouseup)
//   3. UI frissítés a szerver válaszából
//   4. Játékmód választás (bot / pvp)
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

// Bot játék infó
let botInfo = null;

// Hardcoded HTML template — a chess.html .app belseje, board tartalma nélkül
const OLDAL_VAZ = `
        <header class="topbar">
            <div class="player player-black">
                <div class="name" id="name-black">Ellenfél</div>
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
                <div id="elo-change" class="elo-change hidden"></div>
                <button id="feladBtn" class="felad-btn">Feladás</button>
                <button id="newGameBtn" class="new-game-btn hidden">Új játék</button>
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
                <div class="name" id="name-white">Te</div>
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

async function apiUjBotJatek(difficulty) {
    const res = await fetch('/api/chess/new-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ difficulty })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hiba');
    gameId = data.gameId;
    botInfo = data.botInfo;
    return data.allapot;
}

async function apiNehezsegek() {
    const res = await fetch('/api/chess/difficulties');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hiba');
    return data.szintek;
}

async function apiUserElo() {
    const res = await fetch('/api/chess/user-elo');
    const data = await res.json();
    if (!res.ok) return { elo: 800, bejelentkezve: false };
    return data;
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

async function apiFeladMagat() {
    const res = await fetch(`/api/chess/${gameId}/surrender`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hiba');
    return data;
}

// ────────────────────────────────────────────
// JÁTÉKMÓD VÁLASZTÁS
// ────────────────────────────────────────────

async function modValasztoMegjelenit() {
    const modal = document.getElementById("mode-modal");
    const step1 = document.getElementById("mode-step1");
    const step2 = document.getElementById("mode-step2");
    const diffList = document.getElementById("difficulty-list");

    modal.classList.remove("hidden");
    step1.classList.remove("hidden");
    step2.classList.add("hidden");

    // ELO lekérdezés
    try {
        const userData = await apiUserElo();
        const eloElem = document.getElementById("user-elo-value");
        if (eloElem) eloElem.textContent = userData.elo;
    } catch (e) {
        console.error("ELO lekérdezés hiba:", e);
    }

    // Robot gomb
    document.getElementById("mode-bot").onclick = async () => {
        step1.classList.add("hidden");
        step2.classList.remove("hidden");

        // Nehézségek lekérdezése
        try {
            const szintek = await apiNehezsegek();
            diffList.innerHTML = "";

            for (let i = 0; i < szintek.length; i++) {
                const s = szintek[i];
                const btn = document.createElement("button");
                btn.className = "diff-btn";
                btn.innerHTML = `
                    <span class="diff-name">${s.nev}</span>
                    <span class="diff-elo">Ajánlott ELO: ${s.elo}</span>
                `;
                btn.addEventListener("click", () => {
                    modal.classList.add("hidden");
                    jatekIndit(s.szint);
                });
                diffList.appendChild(btn);
            }
        } catch (e) {
            console.error("Nehézségek lekérdezés hiba:", e);
            diffList.innerHTML = '<p style="color:#f88">Hiba a szintek betöltésekor.</p>';
        }
    };

    // Vissza gomb
    document.getElementById("mode-back").onclick = () => {
        step2.classList.add("hidden");
        step1.classList.remove("hidden");
    };
}

async function jatekIndit(nehezseg) {
    try {
        const allapot = await apiUjBotJatek(nehezseg);

        // Nevek frissítése
        nevekFrissit();

        allapotFrissit(allapot);
        idoPollingIndit();
        integritasEllenorzesIndit();
        console.log(`[INIT] Bot játék indítva — ${botInfo.nev} (ELO: ${botInfo.elo})`);
    } catch (e) {
        console.error('Bot játék indítási hiba:', e);
    }
}

function nevekFrissit() {
    const nameBlack = document.getElementById("name-black");
    const nameWhite = document.getElementById("name-white");

    if (botInfo) {
        // Bot = fekete
        if (nameBlack) nameBlack.textContent = `🤖 ${botInfo.nev} (${botInfo.elo})`;
        if (nameWhite) nameWhite.textContent = "Te";
    } else {
        if (nameBlack) nameBlack.textContent = "Fekete";
        if (nameWhite) nameWhite.textContent = "Fehér";
    }
}

// ────────────────────────────────────────────
// ÁLLAPOT FRISSÍTÉS + RENDERELÉS
// ────────────────────────────────────────────

// ────────────────────────────────────────────
// FELADÁS LOGIKA
// ────────────────────────────────────────────

let surrenderHoldTimer = null;
const FELADAS_HOLD_MS = 1500;

function feladasModalMegjelenit() {
    document.getElementById('surrender-modal').classList.remove('hidden');
}

function feladasModalElrejt() {
    document.getElementById('surrender-modal').classList.add('hidden');
}

async function doFeladJatek() {
    if (!gameId) return;
    try {
        const data = await apiFeladMagat();
        jatekVegeUI(data.uzenet || 'Feladtad a játékot.');
        idoPollingLeall();
        integritasEllenorzesLeall();
        gameId = null;
    } catch (e) {
        console.error('Feladás hiba:', e);
    }
}

function surrenderModalEsemenyekKot() {
    document.getElementById('surrenderCancelBtn').onclick = feladasModalElrejt;

    const confirmBtn = document.getElementById('surrenderConfirmBtn');
    const startHold = () => {
        confirmBtn.classList.add('holding');
        surrenderHoldTimer = setTimeout(async () => {
            confirmBtn.classList.remove('holding');
            feladasModalElrejt();
            await doFeladJatek();
        }, FELADAS_HOLD_MS);
    };
    const stopHold = () => {
        clearTimeout(surrenderHoldTimer);
        surrenderHoldTimer = null;
        confirmBtn.classList.remove('holding');
    };
    confirmBtn.addEventListener('mousedown', startHold);
    confirmBtn.addEventListener('mouseup', stopHold);
    confirmBtn.addEventListener('mouseleave', stopHold);
    confirmBtn.addEventListener('touchstart', e => { e.preventDefault(); startHold(); });
    confirmBtn.addEventListener('touchend', stopHold);
}

function jatekVegeUI(uzenet) {
    uiJatekVegeMegjelenit(uzenet);
    integritasEllenorzesLeall();
    const feladBtn = document.getElementById('feladBtn');
    const newGameBtn = document.getElementById('newGameBtn');
    if (feladBtn) feladBtn.classList.add('hidden');
    if (newGameBtn) newGameBtn.classList.remove('hidden');
}

// ────────────────────────────────────────────

function allapotFrissit(allapot) {
    utolsoAllapot = allapot;
    try { if (appObserver) appObserver.disconnect(); } catch(e) {}
    oldalVazVisszaallit();
    tablaRajzol(allapot);
    huzasHozzaadMinden(allapot);
    esemenyekUjraKot();
    nevekFrissit();
    try { observerIndit(); } catch(e) { console.error("Observer indítás hiba:", e); }

    if (allapot.uzenet) {
        jatekVegeUI(allapot.uzenet);
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
        "#feladBtn",
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

    // Szöveg tartalom ellenőrzés
    const szovegEllenorzesek = [
        { sel: ".player-black .name", min: 1 },
        { sel: "#clock-black", min: 1 },
        { sel: "#feladBtn", min: 1 },
        { sel: "#turn-name", min: 1 },
        { sel: "#status", min: 1 },
        { sel: ".player-white .name", min: 1 },
        { sel: "#clock-white", min: 1 },
        { sel: ".sidebar .legend", min: 5 },
        { sel: ".sidebar .status-row", min: 3 },
    ];
    for (let i = 0; i < szovegEllenorzesek.length; i++) {
        const e = szovegEllenorzesek[i];
        const elem = document.querySelector(e.sel);
        if (elem && elem.textContent.trim().length < e.min) {
            console.log("[INTEGRITÁS] Üres szöveg:", e.sel);
            return true;
        }
    }

    // Legend div-ek száma
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
 */
function idoPollingIndit() {
    idoPollingLeall();
    idoPollTimer = setInterval(async () => {
        if (!gameId) return;
        if (huzasFolyamatban) return;
        try {
            const allapot = await apiAllapot();
            utolsoAllapot = allapot;

            if (oldalSerult(allapot)) {
                allapotFrissit(allapot);
            } else {
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

            if (allapot.vege && allapot.uzenet) {
                jatekVegeUI(allapot.uzenet);
                idoPollingLeall();
            }
        } catch (e) {
            // Csendben kezeljük
        }
    }, 1000);
}

function idoPollingLeall() {
    if (idoPollTimer) {
        clearInterval(idoPollTimer);
        idoPollTimer = null;
    }
}

/**
 * Rövid intervallumon poll-ozza az állapotot amíg a bot gondolkodik.
 * Amint botGondolkodik === false, frissíti a táblát a bot lépésével.
 */
function botValaszPoll() {
    const timer = setInterval(async () => {
        if (!gameId) { clearInterval(timer); return; }
        try {
            const allapot = await apiAllapot();
            if (!allapot.botGondolkodik) {
                clearInterval(timer);
                allapotFrissit(allapot);
                if (allapot.vege && allapot.uzenet) {
                    jatekVegeUI(allapot.uzenet);
                    idoPollingLeall();
                }
            }
        } catch (e) {
            clearInterval(timer);
        }
    }, 300);
}

// ────────────────────────────────────────────
// INICIALIZÁLÁS
// ────────────────────────────────────────────

/**
 * Eseménykezelők újrakötése — reset, new game, promotion.
 */
function esemenyekUjraKot() {
    // Feladás gomb
    const feladBtn = document.getElementById("feladBtn");
    if (feladBtn) {
        const ujBtn = feladBtn.cloneNode(true);
        feladBtn.parentNode.replaceChild(ujBtn, feladBtn);
        ujBtn.addEventListener("click", () => {
            if (!gameId || (utolsoAllapot && utolsoAllapot.vege)) return;
            feladasModalMegjelenit();
        });
    }

    // Új játék gomb — visszavisz a mód választóba
    const newGameBtn = document.getElementById("newGameBtn");
    if (newGameBtn) {
        const ujBtn = newGameBtn.cloneNode(true);
        newGameBtn.parentNode.replaceChild(ujBtn, newGameBtn);
        ujBtn.addEventListener("click", () => {
            idoPollingLeall();
            integritasEllenorzesLeall();
            gameId = null;
            botInfo = null;
            utolsoAllapot = null;
            modValasztoMegjelenit();
        });
    }

    // Átváltozás gombok
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
                    if (eredmeny.uzenet) {
                        jatekVegeUI(eredmeny.uzenet);
                        idoPollingLeall();
                    }
                } catch (e) {
                    console.error('Átváltozás lépés hiba:', e);
                    if (utolsoAllapot) allapotFrissit(utolsoAllapot);
                }
            }
        });
    }
}

async function init() {
    console.log("[INIT] Mattmester indítás...");

    // Feladás modal eseménykezelők (csak egyszer kell kötni)
    surrenderModalEsemenyekKot();

    // Oldal bezárás = feladás + ELO veszteség
    window.addEventListener('beforeunload', () => {
        if (gameId && utolsoAllapot && !utolsoAllapot.vege) {
            fetch(`/api/chess/${gameId}/surrender`, { method: 'POST', keepalive: true });
        }
    });

    // Játékmód választó megjelenítés
    modValasztoMegjelenit();
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

        // Bot játékban: csak a saját (nem-bot) bábuit lehet húzni
        if (allapot.botAktiv && mezo.piece.color === allapot.botSzin) continue;

        // Csak a körön lévő bábuit lehet húzni
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
            huzasFolyamatban = false;
            return;
        }
        if (!lepesek || lepesek.length === 0) {
            huzasFolyamatban = false;
            return;
        }

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

    if (!celMezoElem) return;

    const toX = parseInt(celMezoElem.dataset.x, 10);
    const toY = parseInt(celMezoElem.dataset.y, 10);

    // Megkeressük a szerver lépéslistájában
    const talaltLepes = lepesek.find(l => l.toX === toX && l.toY === toY);
    if (!talaltLepes) return;

    // Gyalog átváltozás
    if (talaltLepes.promotion) {
        window._atvaltozasVarData = { fromX, fromY, toX, toY };
        atvaltozasModal(piece.color);
        return;
    }

    // Lépés küldése
    try {
        const eredmeny = await apiLepes(fromX, fromY, toX, toY);
        allapotFrissit(eredmeny.allapot);
        if (eredmeny.uzenet) {
            jatekVegeUI(eredmeny.uzenet);
            idoPollingLeall();
        } else if (eredmeny.allapot.botGondolkodik) {
            botValaszPoll();
        }
    } catch (e) {
        console.error('Lépés hiba:', e);
        // Visszarajzoljuk az aktuális állapotot
        if (utolsoAllapot) allapotFrissit(utolsoAllapot);
    }
}

// Start!
window.addEventListener("DOMContentLoaded", init);
