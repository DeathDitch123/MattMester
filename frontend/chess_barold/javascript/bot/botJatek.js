// ============================================================
// SAKK BOT MECCS — INIT + AUTO-INDIT + REJOIN
// ============================================================
// A bot meccs lifecycle:
//   - `jatekIndit(nehezseg, mode, ranked, modal)`: friss meccs inditasa
//     POST /api/chess/new-bot hivassal, allapot render + abilities init +
//     polling indit + chat-panel quick mode.
//   - `initBotFromQueryParams(params)`: ?type=bot&mode=X&difficulty=Y URL
//     ag, a frontpage chooser-bol jott. Hivja a jatekIndit-et.
//   - `initBotRejoinFromQueryParams(rejoinGameId)`: ?type=botRejoin&gameId=N
//     ag, a 60s grace window-on belul az 1. tab elhagyta az oldalt, az uj tab
//     visszacsatlakozik a regi gameId-vel — NEM hiv /new-bot-ot, csak state
//     lekerdezes (`/api/chess/active` adja a botInfo-t) + render + polling.
//   - `initFromQueryParams(params)`: backwards-compat alias (projectIntegrity
//     teszt regen erre is utal).
// ============================================================

import { state } from '../state.js';
import { apiUjBotJatek, apiAllapot } from '../api.js';
import { abilitiesInit, abilitiesAllapotFrissit } from '../abilities.js';
import { nevekFrissit } from '../ui/nevek.js';
import { chatPanelMutat, chatPanelBotPlaceholder, chatPanelEnged } from '../ui/chatPanel.js';
import { allapotFrissit, idoPollingIndit } from '../allapot.js';
import { ujMeccsChooserNyitas } from '../chooser.js';

// ──────────────────────────────────────────────────────────────
// Friss bot meccs inditasa (frontpage chooser -> click difficulty)
// ──────────────────────────────────────────────────────────────

export async function jatekIndit(nehezseg, mode, ranked, modal) {
    try {
        const allapot = await apiUjBotJatek(nehezseg, mode, ranked);

        if (modal) modal.classList.add("hidden");

        // Nevek frissítése
        nevekFrissit();

        allapotFrissit(allapot);
        idoPollingIndit();

        // Képesség UI inicializálás (bot meccs — REST mód, mindig white)
        await abilitiesInit({
            getGameId: () => state.gameId,
            getSzin:   () => 'white',  // bot meccsen a játékos mindig white
            isPvp:     () => false,
            getSocket: () => null,
            // REST ability response: a teljes új allapot-ot átfuttatjuk a fő
            // állapot-frissítőn, hogy a tábla, óra és ability bar mind szinkron legyen.
            onAllapotValtozas: (uj) => allapotFrissit(uj)
        });
        abilitiesAllapotFrissit(allapot);

        // Bot meccsen quick-chat sav latszik (elore-megirt uzenetek), a sima
        // text-input REJTETT. A bot canned valaszokkal reagal a klikkekre.
        chatPanelMutat();
        chatPanelBotPlaceholder();    // quick lathato + uzenet ureses
        chatPanelEnged(true);         // quick gombok aktivak

        console.log(`[INIT] Bot játék indítva — ${state.botInfo.nev} (ELO: ${state.botInfo.elo}) — mode=${allapot.mode || mode || 'default'}, ranked=${allapot.ranked}`);
    } catch (e) {
        console.error('Bot játék indítási hiba:', e);
        const diffList = document.getElementById("difficulty-list");
        if (diffList) {
            const txb = (hu, en) => (window.MattMesterI18n?.tx ? window.MattMesterI18n.tx(hu, en) : hu);
            diffList.innerHTML = `<p style="color:#f88">${txb('Hiba a játék indításakor:', 'Error starting the game:')} ${e.message || txb('Ismeretlen hiba', 'Unknown error')}</p>`;
        }
    }
}

// ──────────────────────────────────────────────────────────────
// URL ag: ?type=bot&mode=X&difficulty=Y (frontpage chooser auto-indit)
// ──────────────────────────────────────────────────────────────

export async function initBotFromQueryParams(params) {
    const mode = params.get('mode');
    const difficulty = parseInt(params.get('difficulty') || '0', 10);

    state.selectedMode = mode;
    state.selectedRanked = false; // bot MINDIG casual

    try {
        await jatekIndit(difficulty || 1, mode, false, null);
    } catch (err) {
        console.error('Bot auto-indítás hiba:', err);
        ujMeccsChooserNyitas();
    }
}

// ──────────────────────────────────────────────────────────────
// URL ag: ?type=botRejoin&gameId=N (60s grace window-on beluli rejoin)
// ──────────────────────────────────────────────────────────────
// Az 1. tab elhagyta az oldalt, az allapot in-memory megmaradt; itt az uj
// tab visszacsatlakozik a regi state.gameId-vel — nincs /new-bot hivas,
// csak state lekerdezes + render + polling.

export async function initBotRejoinFromQueryParams(rejoinGameId) {
    try {
        // Globalis state beallitas — a tobbi flow (jatekIndit, allapotFrissit,
        // idoPollingIndit, abilitiesInit) erre hagyatkozik.
        state.gameId = rejoinGameId;

        // /api/chess/active → state.botInfo + mode (a /state nem ad nev/elo-t, csak nehezseg-et).
        let activeData = null;
        try {
            const res = await fetch('/api/chess/active', { credentials: 'same-origin' });
            if (res.ok) activeData = await res.json();
        } catch (_) {}

        if (!activeData || !activeData.hasActive || activeData.gameId !== rejoinGameId) {
            // A meccs idokozben befejezodott / kileptek a 60s window-bol →
            // chooser-re dobjuk a felhasznalot, ne ragadjon ures kepernyon.
            state.gameId = null;
            ujMeccsChooserNyitas();
            return;
        }

        state.botInfo = activeData.botInfo || null;
        state.selectedMode = activeData.mode || null;
        state.selectedRanked = false;

        const allapot = await apiAllapot();

        nevekFrissit();
        allapotFrissit(allapot);
        idoPollingIndit();

        await abilitiesInit({
            getGameId: () => state.gameId,
            getSzin:   () => 'white',
            isPvp:     () => false,
            getSocket: () => null,
            onAllapotValtozas: (uj) => allapotFrissit(uj)
        });
        abilitiesAllapotFrissit(allapot);

        chatPanelMutat();
        chatPanelBotPlaceholder();
        chatPanelEnged(true);

        console.log(`[REJOIN] Bot meccs folytatva (gameId=${state.gameId}, ${state.botInfo ? state.botInfo.nev : '?'})`);
    } catch (err) {
        console.error('Bot rejoin hiba:', err);
        state.gameId = null;
        ujMeccsChooserNyitas();
    }
}

// Backwards-compat alias — projectIntegrity teszt erre is utal
export async function initFromQueryParams(params) {
    return initBotFromQueryParams(params);
}
