// ============================================================
// SAKK — TABLA-INTERAKCIO (drag&drop + click-to-move + UI gombok)
// ============================================================
// Egy fajlban a felhasznalo-tabla interakcio teljes spektrumat tartjuk:
//
//   1. Tabla-szintu lepesek
//      - `huzasHozzaadMinden(allapot)`: drag-listener kotes minden hozhato babura
//      - `huzasHozzaad(...)`: a drag&drop + click-kezelo egy babura
//      - `babuKlonMozgat`, `babuHuzasEgerFel`: drag-segedek
//      - `kattintasLep(toX, toY)`: click-to-move execute (kijelolt babuval)
//      - `kivalasztasTorol`: kijeloles + bogyok torlese
//      - `azonnaliDomLepes`: optimisztikus DOM-mutate, mielott a szerver valaszol
//      - `legalisLepesKeres`: cache vagy szerver lekerdezes a lepes-listara
//
//   2. UI gombok (feladas, uj jatek, draw, atvaltozas)
//      - `esemenyekUjraKot()`: a tabla-render utan ujrakoti az event handler-eket
//        (mert tablaRajzol() leszerel mindent es uj DOM-elemeket csinal)
//
// A drag-start threshold (6 px) globalis konstans a modulra: anelkul a parraneglt
// klikkek dragnek tunnenek, ami ronthatna a click-to-move flow-t.
// ============================================================

import { state } from './state.js';
import { isAbilityArmed } from './abilities.js';
import {
    huzasKiemel, huzasKiemelTorol, mezoElemKeres,
    atvaltozasModal, atvaltozasModalElrejt, clearMoveList
} from './UI-megjelenites.js';
import { apiLepes, apiLepesek } from './api.js';
import {
    allapotFrissit, lepesKuldesIndit, lepesKuldesLezar,
    idoPollingLeall, integritasEllenorzesLeall, botValaszPoll
} from './allapot.js';
import { eloValtozasFrissit } from './ui/gameEndModal.js';
import { feladasModalMegjelenit } from './ui/surrenderModal.js';
import {
    pvpLegalisLepesKeres, pvpLepesKuld, pvpDontetlenAjanlat, pvpAllapotReset
} from './pvp/pvpActions.js';
import { ujMeccsChooserNyitas } from './chooser.js';
import { jatekVegeUI } from './gameEnd.js';

const DRAG_START_THRESHOLD_PX = 6;

// ──────────────────────────────────────────────────────────────
// UI GOMB-KOTESEK (tabla-render utan ujra-kotodnek)
// ──────────────────────────────────────────────────────────────

export function esemenyekUjraKot() {
    // Feladás gomb
    const feladBtn = document.getElementById("feladBtn");
    if (feladBtn) {
        const ujBtn = feladBtn.cloneNode(true);
        feladBtn.parentNode.replaceChild(ujBtn, feladBtn);
        ujBtn.addEventListener("click", () => {
            if (!state.gameId || (state.utolsoAllapot && state.utolsoAllapot.vege)) return;
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
            if (state.botPollTimer) {
                clearInterval(state.botPollTimer);
                state.botPollTimer = null;
            }
            state.gameId = null;
            state.botInfo = null;
            state.utolsoAllapot = null;
            lepesKuldesLezar();
            pvpAllapotReset();
            eloValtozasFrissit(null);
            // N9: move-list panel uritese, mert uj jatekot indit a felhasznalo.
            clearMoveList();
            // N11: manualis flip felulirast is reseteli, hogy a kovetkezo PvP-ben
            // visszalegyen az auto-flip viselkedes.
            state.manualisFlipFelulirva = null;
            // N13: rematch-gomb elrejtese (mode-valaszto modal a kovetkezo lepes).
            const rematchBtnReset = document.getElementById('rematchBtn');
            if (rematchBtnReset) {
                rematchBtnReset.classList.add('hidden');
                rematchBtnReset.disabled = false;
                rematchBtnReset.textContent = 'Revans';
            }
            ujMeccsChooserNyitas();
        });
    }

    // Döntetlen ajánlat gomb (csak PvP-ben)
    const drawBtn = document.getElementById("drawOfferBtn");
    if (drawBtn) {
        const ujBtn = drawBtn.cloneNode(true);
        drawBtn.parentNode.replaceChild(ujBtn, drawBtn);
        if (state.pvpAktiv && state.utolsoAllapot && !state.utolsoAllapot.vege) {
            ujBtn.classList.remove('hidden');
            ujBtn.addEventListener("click", () => pvpDontetlenAjanlat());
        } else {
            ujBtn.classList.add('hidden');
        }
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

                // PvP: socket emit
                if (state.pvpAktiv) {
                    pvpLepesKuld(d.fromX, d.fromY, d.toX, d.toY, tipus);
                    return;
                }

                try {
                    const eredmeny = await apiLepes(d.fromX, d.fromY, d.toX, d.toY, tipus);
                    allapotFrissit(eredmeny.allapot);
                    if (eredmeny.uzenet) {
                        jatekVegeUI(eredmeny.uzenet);
                        idoPollingLeall();
                    } else if (eredmeny.allapot.botGondolkodik) {
                        botValaszPoll();
                    }
                } catch (e) {
                    console.error('Átváltozás lépés hiba:', e);
                    if (state.utolsoAllapot) allapotFrissit(state.utolsoAllapot);
                }
            }
        });
    }
}

// ──────────────────────────────────────────────────────────────
// DRAG&DROP — mousedown / mousemove / mouseup
// ──────────────────────────────────────────────────────────────

export function huzasHozzaadMinden(allapot) {
    // PvP turn enforcement: ha nem a saját szín van soron, egyik bábu sem húzható
    if (state.pvpAktiv && allapot.koronLevo !== state.sajatSzin) {
        console.log('[PvP] turn enforce blokk', { koronLevo: allapot.koronLevo, sajatSzin: state.sajatSzin });
        // Click-to-move se működjön (state.kivalasztott nulláz)
        state.kivalasztott = null;
        return;
    }

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

        // PvP: csak a saját színű bábuit lehet húzni
        if (state.pvpAktiv && mezo.piece.color !== state.sajatSzin) continue;

        // Csak a körön lévő bábuit lehet húzni
        if (mezo.piece.color !== allapot.koronLevo) continue;

        huzasHozzaad(babuElem, x, y, mezo.piece, allapot);
    }

    // Click-to-move: mousedown üres/ellenfél mezőre → lépés a kijelölttel
    const mezok = document.querySelectorAll(".square");
    for (let i = 0; i < mezok.length; i++) {
        mezok[i].addEventListener("mousedown", function (e) {
            if (isAbilityArmed()) return; // képesség célpont-választás folyamatban
            if (!state.kivalasztott || state.lepesKuldesFolyamatban) return;

            // Drag folyamat közben ne kezeljünk click-to-move-ot.
            if (state.huzasFolyamatban) return;

            // Bal gomb legyen (touch esetén 0/undefined is jöhet).
            if (typeof e.button === 'number' && e.button !== 0) return;

            const toX = parseInt(this.dataset.x, 10);
            const toY = parseInt(this.dataset.y, 10);
            kattintasLep(toX, toY);
        });
    }
}

function huzasHozzaad(babuElem, fromX, fromY, piece, allapot) {
    let mozgott = false; // megkülönbözteti a kattintást a húzástól

    babuElem.addEventListener("mousedown", async function (e) {
        if (isAbilityArmed()) return; // képesség célpont-választás folyamatban
        if (allapot.vege || state.lepesKuldesFolyamatban) return;

        e.preventDefault();
        e.stopPropagation();

        // Ha már van kijelölt és ERRE a mezőre kattintunk mint célmező (ütés)
        if (state.kivalasztott && state.kivalasztott.piece.color !== piece.color) {
            kattintasLep(fromX, fromY);
            return;
        }

        // Ha ugyanarra a bábura kattintunk: kijelölés törlése
        if (state.kivalasztott && state.kivalasztott.x === fromX && state.kivalasztott.y === fromY) {
            kivalasztasTorol();
            return;
        }

        mozgott = false;

        // Kijelölés beállítása (click-to-move)
        kivalasztasTorol();
        state.kivalasztott = { x: fromX, y: fromY, piece, lepesek: null };
        const mezoElem = babuElem.parentElement;
        mezoElem.classList.add("selected");

        // A drag ne várjon szerverre: a lépéslistát aszinkron kérjük le a click-to-move bogyókhoz.
        const lepesekPromise = state.pvpAktiv
            ? pvpLegalisLepesKeres(fromX, fromY)
            : apiLepesek(fromX, fromY);
        lepesekPromise
            .then(lepesek => {
                if (!state.kivalasztott) return;
                if (state.kivalasztott.x !== fromX || state.kivalasztott.y !== fromY) return;
                state.kivalasztott.lepesek = lepesek;
                huzasKiemel(piece.type, piece.color, lepesek || []);
            })
            .catch(() => {
                // Ilyenkor drag továbbra is működik, csak bogyók nem jönnek.
            });

        let klon = null;
        let dragAktiv = false;
        const startX = e.clientX;
        const startY = e.clientY;
        const eltX = babuElem.offsetWidth / 2;
        const eltY = babuElem.offsetHeight / 2;

        function dragIndit(em) {
            if (dragAktiv) return;
            dragAktiv = true;
            state.huzasFolyamatban = true;

            klon = babuElem.cloneNode(true);
            klon.className = "piece dragging";
            klon.style.position = "fixed";
            klon.style.zIndex = 9999;
            klon.style.pointerEvents = "none";
            klon.style.width = babuElem.offsetWidth + "px";
            klon.style.height = babuElem.offsetHeight + "px";
            document.body.appendChild(klon);

            babuElem.style.opacity = "0.3";
            babuKlonMozgat(em.clientX, em.clientY, klon, eltX, eltY);
        }

        function egerMozogKezelo(em) {
            if (!dragAktiv) {
                const dx = Math.abs(em.clientX - startX);
                const dy = Math.abs(em.clientY - startY);
                if (dx < DRAG_START_THRESHOLD_PX && dy < DRAG_START_THRESHOLD_PX) return;
                dragIndit(em);
            }
            mozgott = true;
            if (klon) babuKlonMozgat(em.clientX, em.clientY, klon, eltX, eltY);
        }

        function egerFelKezelo(ef) {
            document.removeEventListener("mousemove", egerMozogKezelo);
            document.removeEventListener("mouseup", egerFelKezelo);

            if (dragAktiv) {
                state.huzasFolyamatban = false;
                if (klon) klon.remove();
                babuElem.style.opacity = "";
            }

            if (mozgott) {
                // Drag & drop: lépés a célmezőre
                huzasKiemelTorol();
                kivalasztasTorol();
                babuHuzasEgerFel(ef, fromX, fromY, piece);
            }
            // Ha nem mozgott (kattintás): kijelölés marad, bogyók maradnak
        }

        document.addEventListener("mousemove", egerMozogKezelo);
        document.addEventListener("mouseup", egerFelKezelo);
    });
}

// Kijeloles torlese (selected class + bogyok eltavolitasa)
function kivalasztasTorol() {
    state.kivalasztott = null;
    document.querySelectorAll(".square.selected").forEach(el => el.classList.remove("selected"));
    huzasKiemelTorol();
}

function azonnaliDomLepes(fromX, fromY, toX, toY, piece, talaltLepes) {
    const fromEl = mezoElemKeres(fromX, fromY);
    const toEl = mezoElemKeres(toX, toY);
    if (!fromEl || !toEl) return;

    const mozgoBabu = fromEl.querySelector('.piece');
    if (!mozgoBabu) return;

    const celBabu = toEl.querySelector('.piece');
    if (celBabu) celBabu.remove();

    if (talaltLepes && talaltLepes.tipus === 'enpassant') {
        const utottY = piece.color === 'white' ? toY + 1 : toY - 1;
        const utottMezo = mezoElemKeres(toX, utottY);
        const utottBabu = utottMezo ? utottMezo.querySelector('.piece') : null;
        if (utottBabu) utottBabu.remove();
    }

    if (talaltLepes && talaltLepes.tipus === 'castle') {
        const rovidSanc = toX > fromX;
        const rookFromX = rovidSanc ? 7 : 0;
        const rookToX = rovidSanc ? 5 : 3;
        const rookFromEl = mezoElemKeres(rookFromX, fromY);
        const rookToEl = mezoElemKeres(rookToX, fromY);
        const rookBabu = rookFromEl ? rookFromEl.querySelector('.piece') : null;
        if (rookBabu && rookToEl) rookToEl.appendChild(rookBabu);
    }

    toEl.appendChild(mozgoBabu);
}

async function legalisLepesKeres(fromX, fromY, toX, toY, cacheLepesek = null) {
    let lepesek = Array.isArray(cacheLepesek) ? cacheLepesek : null;

    if (!lepesek) {
        try {
            if (state.pvpAktiv) {
                lepesek = await pvpLegalisLepesKeres(fromX, fromY);
            } else {
                lepesek = await apiLepesek(fromX, fromY);
            }
        } catch (_) {
            return { talaltLepes: null, lepesek: [] };
        }
    }

    const talaltLepes = lepesek.find(l => l.toX === toX && l.toY === toY) || null;
    return { talaltLepes, lepesek };
}

// Click-to-move: lepes a kijelolt babuval a celmezore
async function kattintasLep(toX, toY) {
    if (!state.kivalasztott || state.lepesKuldesFolyamatban) return;
    const { x: fromX, y: fromY, piece, lepesek } = state.kivalasztott;

    const { talaltLepes } = await legalisLepesKeres(fromX, fromY, toX, toY, lepesek);
    if (!talaltLepes) {
        kivalasztasTorol();
        return;
    }

    kivalasztasTorol();

    // Gyalog átváltozás
    const promotionGyanus = !!talaltLepes.promotion;
    if (promotionGyanus) {
        window._atvaltozasVarData = { fromX, fromY, toX, toY };
        atvaltozasModal(piece.color);
        return;
    }

    lepesKuldesIndit();
    azonnaliDomLepes(fromX, fromY, toX, toY, piece, talaltLepes);

    // PvP: socket-en küld
    if (state.pvpAktiv) {
        pvpLepesKuld(fromX, fromY, toX, toY);
        lepesKuldesLezar();
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
        if (state.utolsoAllapot) allapotFrissit(state.utolsoAllapot);
    } finally {
        lepesKuldesLezar();
    }
}

function babuKlonMozgat(mx, my, klon, eltX, eltY) {
    klon.style.left = (mx - eltX) + "px";
    klon.style.top = (my - eltY) + "px";
}

async function babuHuzasEgerFel(ef, fromX, fromY, piece) {
    const elemAlatt = document.elementFromPoint(ef.clientX, ef.clientY);
    const celMezoElem = elemAlatt ? elemAlatt.closest(".square") : null;

    if (!celMezoElem) return;

    const toX = parseInt(celMezoElem.dataset.x, 10);
    const toY = parseInt(celMezoElem.dataset.y, 10);

    if (toX === fromX && toY === fromY) return;

    const { talaltLepes } = await legalisLepesKeres(fromX, fromY, toX, toY, null);
    if (!talaltLepes) return;

    // Gyalog átváltozás
    if (talaltLepes.promotion) {
        window._atvaltozasVarData = { fromX, fromY, toX, toY };
        atvaltozasModal(piece.color);
        return;
    }

    lepesKuldesIndit();
    azonnaliDomLepes(fromX, fromY, toX, toY, piece, talaltLepes);

    // PvP: socket-en küld
    if (state.pvpAktiv) {
        pvpLepesKuld(fromX, fromY, toX, toY);
        lepesKuldesLezar();
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
        if (state.utolsoAllapot) allapotFrissit(state.utolsoAllapot);
    } finally {
        lepesKuldesLezar();
    }
}
