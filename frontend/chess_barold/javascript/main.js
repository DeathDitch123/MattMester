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
    tablaRajzol(allapot);
    huzasHozzaadMinden(allapot);

    if (allapot.uzenet) {
        uiJatekVegeMegjelenit(allapot.uzenet);
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
        try {
            const allapot = await apiAllapot();
            utolsoAllapot = allapot;

            // Óra frissítés
            const format = (mp) => {
                const perc = Math.floor(mp / 60);
                const masodperc = mp % 60;
                return `${perc}:${masodperc.toString().padStart(2, '0')}`;
            };
            if (allapot.ido) {
                document.getElementById("clock-white").textContent = format(allapot.ido.white);
                document.getElementById("clock-black").textContent = format(allapot.ido.black);
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

async function init() {
    document.getElementById("resetBtn").addEventListener("click", async () => {
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

    // Átváltozás modal kezelők — a kiválasztott típust elmentjük és POST-oljuk
    const valasztek = document.querySelectorAll(".promotion-piece");
    for (let i = 0; i < valasztek.length; i++) {
        valasztek[i].addEventListener("click", async function () {
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
                    // Visszarajzoljuk az aktuális állapotot
                    if (utolsoAllapot) allapotFrissit(utolsoAllapot);
                }
            }
        });
    }

    // Új játék indítás
    try {
        const allapot = await apiUjJatek();
        allapotFrissit(allapot);
        idoPollingIndit();
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