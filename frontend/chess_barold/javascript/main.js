// ============================================================
// MAIN.JS — chess.html init() orchestrator
// ============================================================
// A teljes lifecycle ide kerul: glue-callback bekotes (allapot.js
// felhivasai), modal-bind-ek, rejoin overlay + socket-rejoin
// flow, query-string alapu auto-indit (bot / botRejoin / pendingMatch).
// Minden egyeb logika kulon modulokban van — ld. importok.
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
import { pvpSocketInit } from './pvp/pvpSocket.js';

const DRAG_START_THRESHOLD_PX = 6;

// Feladas-flow orchestrator (PvP vagy bot ag). A long-press confirm-callback
// hivja a `bindSurrenderModal({ onConfirm: doFeladJatek })`-on at.
async function doFeladJatek() {
    if (!state.gameId) return;

    if (state.pvpAktiv) {
        pvpFeladas();
        return;
    }

    try {
        const data = await apiFeladMagat();
        jatekVegeUI(data.uzenet || (window.MattMesterI18n?.tx ? window.MattMesterI18n.tx('Feladtad a játékot.', 'You resigned the game.') : 'Feladtad a játékot.'), data.eloValtozas ?? null);
        idoPollingLeall();
        integritasEllenorzesLeall();
        state.gameId = null;
    } catch (e) {
        console.error('Feladás hiba:', e);
    }
}

async function init() {
    console.log("[INIT] Mattmester indítás...");

    // Allapot-modul glue: a render-flow-ban hivott orchestrator-ok
    // referenciaja, hogy az allapot.js cyclic-import nelkul el tudja
    // erni oket.
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
    rejoinOverlayMutat();

    try { initChessSettings(); } catch (e) { console.warn('settings init hiba:', e); }

    bindHelpModal();

    bindGameEndModal({
        onHome: () => { window.location.href = '/'; },
        onNewGame: () => {
            chatPanelLezar();
            ujMeccsChooserNyitas();
        }
    });

    bindChatPanel();
    bindQuickChatPanel();
    window.addEventListener('beforeunload', () => {
        try { chatPanelLezar(); } catch (_) {}
    });

    sajatUsernameKeres().catch(() => {});

    // Manualis flip-toggle a sidebar gombrol — felulirja a setting auto-flip-jet
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

    rematchEsemenyekKot();

    bindSurrenderModal({ onConfirm: doFeladJatek });

    // Oldal bezárás — bot játéknál surrender API, PvP-ben a server grace period kezeli
    window.addEventListener('beforeunload', () => {
        if (state.pvpAktiv) return;
        if (state.gameId && state.utolsoAllapot && !state.utolsoAllapot.vege) {
            fetch(`/api/chess/${state.gameId}/surrender`, { method: 'POST', keepalive: true });
        }
    });

    pvpSocketInit();

    // Rejoin emit AGRESSZIV (azonnali + minden connect-en + 250ms retry, max 20x = 5s).
    // A backend valasza: aktiv meccs -> chess:game:start, kulonben chess:rejoin:none.
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
        socket.once('connect', () => {
            if (socket._rejoinAlreadySent) return;
            socket._rejoinAlreadySent = true;
            socket.emit('chess:rejoin');
            pendingChessInviteAcceptKuld(socket);
        });
        return true;
    }
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
    //   - `?type=botRejoin&gameId=N` → 60s grace-en beluli rejoin a futo bot meccshez
    //   - egyébként a rejoin valasz / 5s safety dont a chooser/tabla rendereles felol
    const params = new URLSearchParams(window.location.search);
    const autoType = params.get('type');
    const autoMode = params.get('mode');
    if (autoType === 'bot' && autoMode) {
        rejoinOverlayElrejt();
        await initBotFromQueryParams(params);
        return;
    }
    if (autoType === 'botRejoin') {
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
            // gameId === 0 sentinel ("ismeretlen, rejoin keresi") szandekosan accept-elt
            // — csak az ido-stempel alapjan dontunk.
            if (parsed && (Date.now() - (parsed.ts || 0)) < 30_000) {
                hasPendingMatch = true;
            }
            window.sessionStorage.removeItem('mattmester.chessPendingMatch');
        }
    } catch (_) { /* ignore */ }

    // Safety: 5s alatt ha sem chess:game:start sem chess:rejoin:none nem
    // erkezett (offline socket / vendeg felh / hibas backend), overlay le +
    // chooser nyit. Igy a felhasznalo nem ragad orokre az overlay alatt.
    setTimeout(() => {
        if (state.pvpAktiv || state.gameId) {
            rejoinOverlayElrejt();
            return;
        }
        rejoinOverlayElrejt();
        const modal = document.getElementById('chessModeChooserModal');
        if (modal && modal.classList.contains('is-open')) return;
        ujMeccsChooserNyitas();
    }, 5000);
}

window.addEventListener("DOMContentLoaded", init);
