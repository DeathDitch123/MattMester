// ============================================================
// SAKK — ALLAPOT FRISSITES + POLLING + INTEGRITAS-ELLENORZES
// ============================================================
// A teljes "fogadj egy szerver-allapot snapshot-ot, render-eld, pollozz tovabb"
// flow ezen a modul belul el:
//
//   - `allapotFrissit(allapot)`: a fo render orchestrator. Tabla rajzolas,
//     animacio, captured-panel, ELO badge, ability bar, jatek-vege detekcio.
//   - `botGondolkodasFrissit(allapot)`: bot-thinking indikator toggle.
//   - `lepesKuldesIndit/Lezar`: client-side fail-safe — ha a backend nem valaszol
//     10s-en belul a /move POST-ra, automatikusan ujra-pollozzuk.
//   - `idoPollingIndit/Leall`: 1Hz allapot-poll (PvP-n a socket gyorsabb, ott
//     nem indul; bot-meccsen a fo szinkron).
//   - `botValaszPoll`: 300ms intenziv poll a bot-gondolkodas-tickhez.
//   - `observerIndit`, `biztonsagosHelyreallit`, `integritasEllenorzes*`:
//     DOM-serules detekcio + recovery (egy MutationObserver + 500ms timer).
//
// Glue pattern: 3 fuggvenyt (`huzasHozzaadMinden`, `esemenyekUjraKot`,
// `jatekVegeUI`) a main.js init() ad at `setAllapotGlue(...)`-szal. Igy nincs
// korkoros import, a `pvp/pvpJatek.js` es a `bot/botJatek.js` modulokba ki-
// szervezes utan is mukodik.
// ============================================================

import { state } from './state.js';
import { apiAllapot } from './api.js';
import { tablaRajzol, lepesAnimacio, renderMoveList } from './UI-megjelenites.js';
import { lepesHangLejatszas } from './audio.js';
import { oldalSerult, oldalVazVisszaallit } from './domSkeleton.js';
import { kellFlippelni } from './flip.js';
import { nevekFrissit } from './ui/nevek.js';
import { utottpiecekFrissit } from './ui/capturedPanel.js';
import { eloValtozasFrissit } from './ui/gameEndModal.js';
import { abilitiesAllapotFrissit } from './abilities.js';

// ──────────────────────────────────────────────────────────────
// Glue: a main.js init() koti be a hatramaradt orchestrator-funkciokat
// ──────────────────────────────────────────────────────────────

const _glue = {
    huzasHozzaadMinden: () => {},
    esemenyekUjraKot:   () => {},
    jatekVegeUI:        () => {}
};

export function setAllapotGlue(glue) {
    if (typeof glue.huzasHozzaadMinden === 'function') _glue.huzasHozzaadMinden = glue.huzasHozzaadMinden;
    if (typeof glue.esemenyekUjraKot   === 'function') _glue.esemenyekUjraKot   = glue.esemenyekUjraKot;
    if (typeof glue.jatekVegeUI        === 'function') _glue.jatekVegeUI        = glue.jatekVegeUI;
}

// ──────────────────────────────────────────────────────────────
// Diff helperek (ket allapot-snapshot kozott valtozas detekcio)
// ──────────────────────────────────────────────────────────────

export function allapotLepesKulcs(allapot) {
    if (!allapot || !allapot.utolsoLepes) return null;
    const l = allapot.utolsoLepes;
    return `${allapot.lepesszam}:${l.from.x},${l.from.y}->${l.to.x},${l.to.y}`;
}

export function botLepesAnimacioKell(elozoAllapot, ujAllapot) {
    if (!elozoAllapot || !ujAllapot) return false;
    if (!ujAllapot.utolsoLepes) return false;
    if (ujAllapot.lepesszam === elozoAllapot.lepesszam) return false;

    // Az utolsó lépést az a szín tette meg, aki NEM körön lévő az új állapotban.
    const lepoSzin = ujAllapot.koronLevo === 'white' ? 'black' : 'white';
    return !!(ujAllapot.botAktiv && ujAllapot.botSzin === lepoSzin);
}

// Bármely új lépés (saját vagy ellenfél) történt-e az előző állapot óta.
export function ujLepesTortent(elozoAllapot, ujAllapot) {
    if (!ujAllapot || !ujAllapot.utolsoLepes) return false;
    if (!elozoAllapot) return false;
    return ujAllapot.lepesszam !== elozoAllapot.lepesszam;
}

// ──────────────────────────────────────────────────────────────
// Lepes-kuldes fail-safe (POST /move 10s timeout)
// ──────────────────────────────────────────────────────────────

export function lepesKuldesIndit() {
    state.lepesKuldesFolyamatban = true;
    if (state.lepesKuldesFailSafeTimer) clearTimeout(state.lepesKuldesFailSafeTimer);
    state.lepesKuldesFailSafeTimer = setTimeout(async () => {
        state.lepesKuldesFolyamatban = false;
        try {
            if (!state.gameId) return;
            const allapot = await apiAllapot();
            allapotFrissit(allapot);
        } catch (_) {
            // A normál poll tovább próbálkozik.
        }
    }, 10000);
}

export function lepesKuldesLezar() {
    state.lepesKuldesFolyamatban = false;
    if (state.lepesKuldesFailSafeTimer) {
        clearTimeout(state.lepesKuldesFailSafeTimer);
        state.lepesKuldesFailSafeTimer = null;
    }
}

// ──────────────────────────────────────────────────────────────
// Bot gondolkodas indikator
// ──────────────────────────────────────────────────────────────

export function botGondolkodasFrissit(allapotVagyBool) {
    const thinkingElem = document.getElementById('bot-thinking');
    if (!thinkingElem) return;

    const gondolkodik = typeof allapotVagyBool === 'boolean'
        ? allapotVagyBool
        : !!(allapotVagyBool && allapotVagyBool.botAktiv && allapotVagyBool.botGondolkodik && !allapotVagyBool.vege);

    if (gondolkodik) thinkingElem.classList.remove('hidden');
    else thinkingElem.classList.add('hidden');
}

// ──────────────────────────────────────────────────────────────
// Fo allapot-frissito (orkesztrator)
// ──────────────────────────────────────────────────────────────

export function allapotFrissit(allapot, animald = false) {
    const elozoAllapot = state.utolsoAllapot;
    state.utolsoAllapot = allapot;
    state.kivalasztott = null;
    try { if (state.appObserver) state.appObserver.disconnect(); } catch(e) {}
    oldalVazVisszaallit();
    tablaRajzol(allapot, kellFlippelni());
    renderMoveList(allapot);
    const automataAnimacio = ujLepesTortent(elozoAllapot, allapot);
    if ((animald || automataAnimacio) && allapot.utolsoLepes) {
        const animKulcs = allapotLepesKulcs(allapot);
        if (animKulcs && animKulcs !== state.utolsoAnimaltLepesKulcs) {
            state.utolsoAnimaltLepesKulcs = animKulcs;
            state.slidingFolyamatban = true;
            Promise.resolve(lepesAnimacio(allapot.utolsoLepes)).finally(() => {
                state.slidingFolyamatban = false;
            });
        }
    }
    lepesHangLejatszas(allapot);
    _glue.huzasHozzaadMinden(allapot);
    _glue.esemenyekUjraKot();
    nevekFrissit();
    utottpiecekFrissit(allapot);
    eloValtozasFrissit(allapot.eloValtozas || null);
    botGondolkodasFrissit(allapot);
    abilitiesAllapotFrissit(allapot);

    if (allapot.uzenet) {
        _glue.jatekVegeUI(allapot.uzenet);
    }
}

// ──────────────────────────────────────────────────────────────
// MutationObserver — DOM serules detekcio
// ──────────────────────────────────────────────────────────────

export function observerIndit() {
    if (state.appObserver) state.appObserver.disconnect();

    state.appObserver = new MutationObserver(() => {
        if (state.huzasFolyamatban || state.helyreallitasFut || state.lepesKuldesFolyamatban || state.slidingFolyamatban) return;
        if (!state.utolsoAllapot) return;
        try {
            if (oldalSerult(state.utolsoAllapot)) {
                console.warn("[OBSERVER] DOM sérülés → helyreállítás");
                biztonsagosHelyreallit();
            }
        } catch (e) {
            console.error("[OBSERVER] Hiba:", e);
        }
    });

    state.appObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}

// Helyreallitas try-catch-csel es rekurzio-vedelemmel.
export function biztonsagosHelyreallit() {
    if (state.helyreallitasFut || !state.utolsoAllapot) return;
    state.helyreallitasFut = true;
    try {
        allapotFrissit(state.utolsoAllapot);
        console.log("[HELYREÁLLÍTÁS] Sikeres");
    } catch (e) {
        console.error("[HELYREÁLLÍTÁS] Hiba:", e);
    } finally {
        state.helyreallitasFut = false;
    }
}

// ──────────────────────────────────────────────────────────────
// Integritas timer (500ms) — fuggetlen az API poll-tol
// ──────────────────────────────────────────────────────────────

export function integritasEllenorzesIndit() {
    integritasEllenorzesLeall();
    console.log("[INTEGRITÁS] Timer elindítva (500ms)");
    state.integritasTimer = setInterval(() => {
        if (state.huzasFolyamatban || state.helyreallitasFut || state.lepesKuldesFolyamatban || state.slidingFolyamatban) return;
        if (!state.utolsoAllapot) return;
        try {
            if (oldalSerult(state.utolsoAllapot)) {
                console.warn("[TIMER] DOM sérülés → helyreállítás");
                biztonsagosHelyreallit();
            }
        } catch (e) {
            console.error("[TIMER] Hiba:", e);
        }
    }, 500);
}

export function integritasEllenorzesLeall() {
    if (state.integritasTimer) {
        clearInterval(state.integritasTimer);
        state.integritasTimer = null;
    }
}

// ──────────────────────────────────────────────────────────────
// 1Hz allapot-poll (csak akkor fut ha nincs bot-poll)
// ──────────────────────────────────────────────────────────────

export function idoPollingIndit() {
    idoPollingLeall();
    state.idoPollTimer = setInterval(async () => {
        if (!state.gameId) return;
        if (state.botPollTimer) return;
        if (state.huzasFolyamatban || state.lepesKuldesFolyamatban || state.slidingFolyamatban) return;
        try {
            const elozoAllapot = state.utolsoAllapot;
            const allapot = await apiAllapot();
            state.utolsoAllapot = allapot;
            botGondolkodasFrissit(allapot);

            const allapotValtozott = !elozoAllapot
                || allapot.lepesszam !== elozoAllapot.lepesszam
                || allapot.koronLevo !== elozoAllapot.koronLevo
                || !!allapot.vege !== !!elozoAllapot.vege;

            const boardHianyzik = !document.getElementById("board");
            if (boardHianyzik || allapotValtozott) {
                allapotFrissit(allapot, botLepesAnimacioKell(elozoAllapot, allapot));
            } else {
                const format = (mp) => {
                    // Vegtelen ido mod -> '∞' (lasd UI-megjelenites.js#idoFrissit).
                    if (mp === null || mp === undefined || !Number.isFinite(mp)) return '∞';
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
                _glue.jatekVegeUI(allapot.uzenet);
                idoPollingLeall();
            }
        } catch (e) {
            // Csendben kezeljük
        }
    }, 1000);
}

export function idoPollingLeall() {
    if (state.idoPollTimer) {
        clearInterval(state.idoPollTimer);
        state.idoPollTimer = null;
    }
}

// ──────────────────────────────────────────────────────────────
// Bot valasz polling — 300ms intenziv tick a bot gondolkodas alatt
// ──────────────────────────────────────────────────────────────

export function botValaszPoll() {
    if (state.botPollTimer) {
        clearInterval(state.botPollTimer);
        state.botPollTimer = null;
    }

    let egymasUtanHibak = 0;
    state.botPollTimer = setInterval(async () => {
        if (!state.gameId) {
            clearInterval(state.botPollTimer);
            state.botPollTimer = null;
            return;
        }
        if (state.slidingFolyamatban) return;
        try {
            const elozoAllapot = state.utolsoAllapot;
            const allapot = await apiAllapot();
            state.utolsoAllapot = allapot;
            egymasUtanHibak = 0;
            botGondolkodasFrissit(allapot);
            if (!allapot.botGondolkodik) {
                clearInterval(state.botPollTimer);
                state.botPollTimer = null;
                allapotFrissit(allapot, true);
                if (allapot.vege && allapot.uzenet) {
                    _glue.jatekVegeUI(allapot.uzenet);
                    idoPollingLeall();
                }
            }
        } catch (e) {
            egymasUtanHibak++;
            if (egymasUtanHibak >= 5) {
                // Ne álljon meg teljesen: visszaesünk a normál pollra.
                clearInterval(state.botPollTimer);
                state.botPollTimer = null;
            }
        }
    }, 300);
}
