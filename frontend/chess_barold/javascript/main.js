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
         huzasKiemel, huzasKiemelTorol, uiJatekVegeMegjelenit, mezoElemKeres,
         lepesAnimacio, renderMoveList, clearMoveList } from './UI-megjelenites.js';
import { abilitiesInit, abilitiesAllapotFrissit, abilitiesReset, isAbilityArmed } from './abilities.js';
import { lepesHangLejatszas } from './audio.js';
import { oldalSerult, oldalVazVisszaallit } from './domSkeleton.js';
import { initChessSettings, getChessSettings } from './settings.js';
import { state } from './state.js';
import { fetchJsonWithTimeout, apiUjBotJatek, apiAllapot, apiLepesek, apiLepes, apiFeladMagat }
    from './api.js';
import { bindHelpModal } from './ui/helpModal.js';
import { eloValtozasFrissit, gameEndModalMegnyit, gameEndModalElrejt, bindGameEndModal }
    from './ui/gameEndModal.js';
import { feladasModalMegjelenit, feladasModalElrejt, bindSurrenderModal }
    from './ui/surrenderModal.js';
import { utottpiecekFrissit } from './ui/capturedPanel.js';
import { nevekFrissit, sajatUsernameKeres } from './ui/nevek.js';
import { kellFlippelni } from './flip.js';
import {
    chatPanelMutat, chatPanelElrejt, chatPanelEnged, chatMessagesUrites,
    chatPanelBotPlaceholder, chatPanelBotMode, chatPanelLezar,
    chatUzenetRender, bindChatPanel, bindQuickChatPanel
} from './ui/chatPanel.js';
import { pvpSocketKeres, pendingChessInviteAcceptKuld } from './pvp/socketRef.js';
import { rejoinOverlayMutat, rejoinOverlayElrejt } from './pvp/rejoinOverlay.js';
import {
    rematchUiVarakozas, rematchUiReset, rematchBejovoModal, rematchEsemenyekKot
} from './pvp/rematch.js';
import {
    pvpLegalisLepesKeres, pvpLepesKuld, pvpKliensIdoIndit, pvpKliensIdoLeall,
    pvpFeladas, pvpDontetlenAjanlat, pvpAllapotReset
} from './pvp/pvpActions.js';
import {
    setAllapotGlue, allapotFrissit, allapotLepesKulcs, ujLepesTortent, botLepesAnimacioKell,
    botGondolkodasFrissit, lepesKuldesIndit, lepesKuldesLezar,
    observerIndit, biztonsagosHelyreallit,
    integritasEllenorzesIndit, integritasEllenorzesLeall,
    idoPollingIndit, idoPollingLeall, botValaszPoll
} from './allapot.js';
import { ujMeccsChooserNyitas } from './chooser.js';
import {
    jatekIndit, initBotFromQueryParams, initBotRejoinFromQueryParams, initFromQueryParams
} from './bot/botJatek.js';
import { jatekVegeUI } from './gameEnd.js';
import { esemenyekUjraKot, huzasHozzaadMinden } from './interakcio.js';
import { pvpJatekKezdet, pvpAllapotFrissit, pvpJatekVege } from './pvp/pvpJatek.js';

// Hang lejátszás → audio.js modulba kiemelve. A lepesHangLejatszas() es a
// teljes audio-kontextus + cache + dedup ott él, ide csak importáljuk.
const DRAG_START_THRESHOLD_PX = 6;


// REST API hivasok -> `api.js` modul (apiUjBotJatek, apiAllapot, apiLepesek,
// apiLepes, apiFeladMagat, fetchJsonWithTimeout).

// ────────────────────────────────────────────
// JÁTÉKMÓD VÁLASZTÁS
// ────────────────────────────────────────────

// Az aktualis kivalasztott mod + ranked flag a state.js-ben (state.selectedMode,
// state.selectedRanked) — innen torolve a globalis let, hogy modulokon at
// hozzaferheto legyen.

// `ujMeccsChooserNyitas` -> `chooser.js` modul (frontpage chooser megnyitas).


// ────────────────────────────────────────────
// PVP — SOCKET.IO INTEGRÁCIÓ
// ────────────────────────────────────────────

// `pvpSocketKeres` + `pendingChessInviteAcceptKuld` -> `pvp/socketRef.js` modul.


// `rejoinOverlayMutat` / `rejoinOverlayElrejt` -> `pvp/rejoinOverlay.js` modul.
// `pvpGameId` a state.pvpGameId-ben — ld. state.js

// `pvpJatekKezdet`, `pvpAllapotFrissit`, `pvpJatekVege` -> `pvp/pvpJatek.js` modul.
// A pvpSocketInit handlerei az importbol hivjak.


// N13 — rematch UI + esemenykotes -> `pvp/rematch.js` modul.

// PvP akciok (lepesKeres, lepesKuld, kliensIdo, feladas, dontetlen, allapotReset)
// -> `pvp/pvpActions.js` modul.

// `jatekIndit` -> `bot/botJatek.js` modul.

// `nevekFrissit` + `sajatUsernameKeres` -> `ui/nevek.js` modul.

// utottpiecekFrissit + capturedPanelFrissit -> `ui/capturedPanel.js` modul.
// Onnan importaljuk a fo `allapotFrissit`-be.

// ────────────────────────────────────────────
// ÁLLAPOT FRISSÍTÉS + RENDERELÉS
// ────────────────────────────────────────────

// ────────────────────────────────────────────
// FELADÁS LOGIKA
// ────────────────────────────────────────────

// feladasModalMegjelenit / feladasModalElrejt / bindSurrenderModal
// -> `ui/surrenderModal.js`. A long-press confirm-callback hivja a
// lenti `doFeladJatek`-et, ami a tenyleges feladas-flow orchestrator-a
// (PvP vagy bot agra szelektal).

async function doFeladJatek() {
    if (!state.gameId) return;

    // PvP: socket-en küld, a szerver ad vissza game:end-et
    if (state.pvpAktiv) {
        pvpFeladas();
        return;
    }

    try {
        const data = await apiFeladMagat();
        jatekVegeUI(data.uzenet || 'Feladtad a játékot.', data.eloValtozas ?? null);
        idoPollingLeall();
        integritasEllenorzesLeall();
        state.gameId = null;
    } catch (e) {
        console.error('Feladás hiba:', e);
    }
}

// `eloValtozasFrissit`, `gameEndModalMegnyit`, `gameEndModalElrejt`,
// `bindGameEndModal` -> `ui/gameEndModal.js` modul.

// `jatekVegeUI` -> `gameEnd.js` modul (meccs vege orchestrator).

// gameEndModalMegnyit / gameEndModalElrejt / bindGameEndModal kiszervezve
// -> `ui/gameEndModal.js`. A `bindGameEndModal` callback-eken at kapja a
// `Foloda` + `Uj jatek` gombok kezeloit (init() koti be).

// Allapot-frissites + polling + integritas-ellenorzes -> `allapot.js` modul.
// A 3 itt-maradt orchestrator (huzasHozzaadMinden, esemenyekUjraKot,
// jatekVegeUI) glue-callback-ekent kerul beszinkronizalva: ld. init() vegen
// `setAllapotGlue(...)` hivas.

// ────────────────────────────────────────────
// INICIALIZÁLÁS
// ────────────────────────────────────────────

// `esemenyekUjraKot` -> `interakcio.js` modul.

// ─── INGAME CHAT modul -> ui/chatPanel.js (chatPanel* + quickChat* + chatUzenetRender + bindChatPanel + bindQuickChatPanel + runSafelyHelper)

// Segitseg modal -> `ui/helpModal.js` modul (bindHelpModal).
// `runSafelyHelper` a chat hibakezelo helper-e, marad a chat blokk mellett.

async function init() {
    console.log("[INIT] Mattmester indítás...");

    // Allapot-modul glue bekotese: a 3 main.js-ben maradt orchestrator
    // (huzasHozzaadMinden, esemenyekUjraKot, jatekVegeUI) referenciaba kerul,
    // hogy az `allapot.js` modul tudja oket hivni a render-flow soran.
    setAllapotGlue({
        huzasHozzaadMinden,
        esemenyekUjraKot,
        jatekVegeUI
    });

    // F5 / disconnect rejoin overlay AZONNAL — még mielőtt bármi mas tortenne,
    // megmutatjuk a "Visszacsatlakozas folyamatban..." overlay-t. Igy a felhasznalo
    // sosem lat ures tablat vagy chooser-t mig a backend chess:rejoin valaszat
    // varjuk. Az overlay a chess:game:start (pvpJatekKezdet) vagy a chess:rejoin:none
    // handler vagy a 5s safety-timeout utan tunik el.
    //
    // Bot URL-params (`?type=bot&...`) eseten kesobb, az auto-indit elott rejtjuk.
    rejoinOverlayMutat();

    // N10: kliens-oldali beallitasok betoltese + modal-bind. localStorage perszisztencia,
    // try-catch a settings.js-ben kezeli az incognito sandboxot.
    try { initChessSettings(); } catch (e) { console.warn('settings init hiba:', e); }

    // Segitseg (jelmagyarazat) modal kotese — bal-also `?` gombbal nyilik.
    // A modal background-ra (overlay) vagy a `×` zar gombra klikk + Escape
    // billentyu mind zarja. Ugyanaz a custom modal pattern mint a settings.
    bindHelpModal();

    // Game-end modal kotese (Fololdal / Uj jatek) — egyszer kotjuk az event
    // listener-eket, a modal megnyitasat a `jatekVegeUI` triggerelheti
    // dinamikusan. Az `Uj jatek` callback eldobja a regi chat-tortenetet
    // mielott a chooser-t megnyitja.
    bindGameEndModal({
        onHome: () => { window.location.href = '/'; },
        onNewGame: () => {
            chatPanelLezar();
            ujMeccsChooserNyitas();
        }
    });

    // Ingame chat — input + form bind. Socket listener-t a `bindChatPanel`
    // belsoleg csatolja, ha a `pvpSocketKeres()` mar elerheto, kulonben a
    // pvpJatekKezdet ujrahivja.
    bindChatPanel();
    // Quick-chat (bot-meccs) gombok bekotese — egyszer fut le, a delegate
    // pattern miatt a click-handler a kontainerbol bubblezik.
    bindQuickChatPanel();
    // Oldalbol elnavigaciokor a chat lezar — nincs szerver-leiratkozas
    // szukseges, mert a socket disconnect-et kovetoen sem fogadunk uzenetet.
    window.addEventListener('beforeunload', () => {
        try { chatPanelLezar(); } catch (_) {}
    });

    // Bejelentkezett username asynk lekerese (cache-elve `state.sajatUsername`-ben),
    // hogy a player-badge "Te" helyett a valodi nev lassek meg bot-meccsen.
    // Tűzz-es-felejts: a nevekFrissit() automatikusan hivodik a fetch utan.
    sajatUsernameKeres().catch(() => {});

    // N11: manualis flip-toggle a sidebar gombrol. A setting auto-flip felulirhato manualisan,
    // amig a felhasznalo nem klikkel ujat.
    const flipBtn = document.getElementById('flipBoardBtn');
    if (flipBtn) {
        flipBtn.addEventListener('click', () => {
            const aktualis = kellFlippelni();
            state.manualisFlipFelulirva = !aktualis;
            if (state.utolsoAllapot) {
                tablaRajzol(state.utolsoAllapot, kellFlippelni());
                renderMoveList(state.utolsoAllapot);
            }
        });
    }

    // N13: rematch gomb + bejovo offer modal eseme nykezelok.
    rematchEsemenyekKot();

    // Feladás modal eseménykezelők (csak egyszer kell kötni). A long-press
    // confirm a `doFeladJatek` orchestrator-t hivja (PvP vagy bot ag).
    bindSurrenderModal({ onConfirm: doFeladJatek });

    // Oldal bezárás — bot játéknál surrender API, PvP-ben a server grace period kezeli
    window.addEventListener('beforeunload', () => {
        if (state.pvpAktiv) return; // PvP-ben a socket disconnect + grace period kezeli
        if (state.gameId && state.utolsoAllapot && !state.utolsoAllapot.vege) {
            fetch(`/api/chess/${state.gameId}/surrender`, { method: 'POST', keepalive: true });
        }
    });

    // Socket init + PvP handler regisztráció
    pvpSocketInit();

    // Rejoin próba — ha van aktív PvP játék, visszacsatlakozik. A `chess:rejoin`
    // emit AGRESSZIV (azonnali + minden connect-en + 250ms retry, max 20x = 5s).
    // A backend handler valasza:
    //   - aktiv meccs -> chess:game:start (pvpJatekKezdet rendereli a tablat)
    //   - nincs meccs -> chess:rejoin:none (ujMeccsChooserNyitas a chooser-t nyit)
    //
    // Az ido a backend-ben TOVABB FUT a 60s grace alatt — a felhasznalo nem
    // veszit gondolkodasi idot a refresh miatt.
    function probaljRejoint() {
        const socket = pvpSocketKeres();
        if (!socket) return false;
        if (socket._rejoinAlreadySent) return true;
        if (socket.connected) {
            socket._rejoinAlreadySent = true;
            socket.emit('chess:rejoin');
            pendingChessInviteAcceptKuld(socket);
            return true;
        }
        // Ha a socket meg nem connected, a connect eventre kuldjuk.
        socket.once('connect', () => {
            if (socket._rejoinAlreadySent) return;
            socket._rejoinAlreadySent = true;
            socket.emit('chess:rejoin');
            pendingChessInviteAcceptKuld(socket);
        });
        return true;
    }
    // Azonnali probalkozas + minden 250ms-ben ujraproba a socket meg-jelenesere.
    if (!probaljRejoint()) {
        let probaSzam = 0;
        const probaInterval = setInterval(() => {
            probaSzam++;
            if (probaljRejoint() || probaSzam > 20) {
                clearInterval(probaInterval);
            }
        }, 250);
    }

    // Query-string alapú auto-indítás (frontpage chess mode chooser-ből):
    //   - `?type=bot&mode=X&difficulty=Y` → bot meccs azonnal (nincs modal)
    //   - egyébként ha sessionStorage-ben van pendingMatch (queue / friend
    //     invite match-et kapott a frontpage) → modal NEM jelenik meg, a
    //     `chess:rejoin` flow tölti be a meccset
    //   - különben (direkt URL látogatás vagy backwards-compat) → varunk a
    //     rejoin valaszra (overlay alatt) majd a megfelelo handler dont
    const params = new URLSearchParams(window.location.search);
    const autoType = params.get('type');
    const autoMode = params.get('mode');
    if (autoType === 'bot' && autoMode) {
        // Bot auto-indit: a rejoin overlay-t most rejtjuk, mert nincs PvP rejoin-
        // varakozas. A bot meccs sajat init flow-ja folytatja.
        rejoinOverlayElrejt();
        await initBotFromQueryParams(params);
        return;
    }
    if (autoType === 'botRejoin') {
        // 60s grace window-on belul rejoin egy futo bot meccshez. Az 1. tab
        // elhagyta az oldalt (close/F5/disconnect), a 2. tab a frontpage chooser-bol
        // ide jott. Nem indit uj meccset (nincs /new-bot hivas), helyette a
        // meglevo state.gameId-vel folytatja.
        rejoinOverlayElrejt();
        const rejoinGameId = parseInt(params.get('gameId') || '0', 10);
        if (rejoinGameId > 0) {
            await initBotRejoinFromQueryParams(rejoinGameId);
        } else {
            ujMeccsChooserNyitas();
        }
        return;
    }

    let hasPendingMatch = false;
    try {
        const raw = window.sessionStorage.getItem('mattmester.chessPendingMatch');
        if (raw) {
            const parsed = JSON.parse(raw);
            // 30s-os friss flag (queue match / friend invite / aktiv-meccs reconnect).
            // state.gameId === 0 (sentinel "ismeretlen, rejoin keresi") szandekosan
            // accept-elt — ilyenkor csak az ido-stempel alapjan dontunk.
            if (parsed && (Date.now() - (parsed.ts || 0)) < 30_000) {
                hasPendingMatch = true;
            }
            window.sessionStorage.removeItem('mattmester.chessPendingMatch');
        }
    } catch (_) { /* ignore */ }

    // Akar van pendingMatch akar nincs: a rejoin overlay-t mostantol mar fut
    // (init() elejen aktivaltuk). A pvpSocketInit-ben regisztralt listenerek:
    //   - chess:game:start -> pvpJatekKezdet -> overlay le, tabla render, chooser zar
    //   - chess:rejoin:none -> overlay le, chooser nyit
    //
    // Safety: 5s alatt ha semmi nem tortent (offline socket / vendeg felh /
    // hibas backend), overlay le + chooser nyit. Igy a felhasznalo nem
    // ragad orokre az overlay alatt.
    setTimeout(() => {
        if (state.pvpAktiv || state.gameId) {
            // Mar fut egy meccs (rejoin sikerult vagy bot indult): csak overlay le.
            rejoinOverlayElrejt();
            return;
        }
        rejoinOverlayElrejt();
        const modal = document.getElementById('chessModeChooserModal');
        if (modal && modal.classList.contains('is-open')) return;
        ujMeccsChooserNyitas();
    }, 5000);
}

// `initBotFromQueryParams`, `initBotRejoinFromQueryParams`, `initFromQueryParams`
// -> `bot/botJatek.js` modul.

// Tabla-interakcio (drag&drop + click-to-move) -> `interakcio.js` modul.

// Start!
window.addEventListener("DOMContentLoaded", init);
