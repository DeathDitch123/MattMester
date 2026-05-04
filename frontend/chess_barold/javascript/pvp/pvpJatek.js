// ============================================================
// SAKK PVP — MECCS LIFECYCLE (game:start / state:update / game:end)
// ============================================================
// Harom socket-event handler-orchestrator-t exportal:
//
//   - `pvpJatekKezdet(data)`: chess:game:start. State init, UI reset,
//     tabla render + kliens-ora, abilities init, chat panel aktivalas.
//   - `pvpAllapotFrissit(allapot)`: chess:state:update broadcast. Tabla
//     ujrarajzol + animacio + captured panel + nevek + ability bar +
//     kliens-ora ujraszinkron.
//   - `pvpJatekVege(data)`: chess:game:end. Disconnect banner cleanup,
//     ELO kiszamitas, feladas/draw/rematch gombok atallitasa, chat letiltas,
//     game-end modal felugras (ELO valtozassal).
//
// A pvp/pvpSocket.js handlerei direktben hivjak ezeket a fuggvenyeket.
// ============================================================

import { state } from '../state.js';
import {
    tablaRajzol, lepesAnimacio, renderMoveList, clearMoveList, uiJatekVegeMegjelenit
} from '../UI-megjelenites.js';
import { abilitiesInit, abilitiesAllapotFrissit } from '../abilities.js';
import { lepesHangLejatszas } from '../audio.js';
import { oldalVazVisszaallit } from '../domSkeleton.js';
import { kellFlippelni } from '../flip.js';
import { nevekFrissit } from '../ui/nevek.js';
import { utottpiecekFrissit } from '../ui/capturedPanel.js';
import { eloValtozasFrissit, gameEndModalMegnyit, gameEndModalElrejt } from '../ui/gameEndModal.js';
import {
    chatPanelMutat, chatPanelBotMode, chatPanelEnged, chatMessagesUrites
} from '../ui/chatPanel.js';
import { pvpSocketKeres } from './socketRef.js';
import { rejoinOverlayElrejt } from './rejoinOverlay.js';
import { pvpKliensIdoIndit, pvpKliensIdoLeall } from './pvpActions.js';
import {
    allapotLepesKulcs, ujLepesTortent, idoPollingLeall
} from '../allapot.js';
import { huzasHozzaadMinden } from '../interakcio.js';
import { esemenyekUjraKot } from '../interakcio.js';

// ──────────────────────────────────────────────────────────────
// chess:game:start (uj meccs / sikeres rejoin)
// ──────────────────────────────────────────────────────────────

export function pvpJatekKezdet(data) {
    console.log('[PvP] game:start', { sajatSzin: data.sajatSzin, sajatNev: data.sajatNev, ellenfelNev: data.ellenfelNev, gameId: data.gameId });
    // Rejoin overlay le — sikerult visszacsatlakozni.
    rejoinOverlayElrejt();
    // PVP overlay-k elrejtese (a regi #mode-modal HTML mar nincs, ne keressuk).
    const waiting = document.getElementById('pvp-waiting');
    const popup = document.getElementById('pvp-invite');
    if (waiting) waiting.classList.add('hidden');
    if (popup) popup.classList.add('hidden');

    // F5 / disconnect rejoin: ha a chess.html init mar megnyitotta a mode
    // chooser-t (mert a rejoin valasz keson erkezett), zarjuk be — a kovetkezo
    // sorokban a tabla felulirja az UI-t. Ezzel a felhasznalo egyenesen a
    // meccsbe ker vissza, nem a "Uj meccs" modal-ba.
    try {
        if (window.MattMesterChessModeChooser && typeof window.MattMesterChessModeChooser.close === 'function') {
            window.MattMesterChessModeChooser.close();
        }
    } catch (_) { /* defensive */ }

    state.pvpAktiv = true;
    state.sajatSzin = data.sajatSzin;
    state.ellenfelNev = data.ellenfelNev;
    state.sajatNev = data.sajatNev;
    state.pvpGameId = data.gameId;
    state.gameId = data.gameId;
    state.botInfo = null;
    state.utolsoAllapot = null;
    state.utolsoAnimaltLepesKulcs = null;

    // Bot polling leállítás
    idoPollingLeall();
    if (state.botPollTimer) {
        clearInterval(state.botPollTimer);
        state.botPollTimer = null;
    }

    // UI reset
    const feladBtn = document.getElementById('feladBtn');
    const newGameBtn = document.getElementById('newGameBtn');
    const rematchBtn = document.getElementById('rematchBtn');
    if (feladBtn) feladBtn.classList.remove('hidden');
    if (newGameBtn) newGameBtn.classList.add('hidden');
    // N13: az uj meccs (akar rematch akar friss) elrejti a rematch-gombot.
    if (rematchBtn) {
        rematchBtn.classList.add('hidden');
        rematchBtn.disabled = false;
        rematchBtn.textContent = 'Revans';
    }
    // Uj meccs indulasakor a game-end modal eltunjon (ha veletlenul nyitva
    // maradt egy elozo veg utan a felhasznalo rakattintasra varakozott).
    gameEndModalElrejt();
    // N9: move-list panel ureseses az uj jatekhoz.
    clearMoveList();
    const drawBtn = document.getElementById('drawOfferBtn');
    if (drawBtn) drawBtn.classList.remove('hidden');

    // Board render + kliens időzítő indítás
    pvpAllapotFrissit(data.allapot);
    pvpKliensIdoIndit();

    // Képesség UI inicializálás
    // PvP-ben a state.update socket eventen érkezik vissza, így nem kell
    // onAllapotValtozas callback — a meglévő `chess:state:update` handler
    // hívja a pvpAllapotFrissit-et, ami az ability bar-t is frissíti.
    abilitiesInit({
        getGameId: () => state.pvpGameId,
        getSzin:   () => state.sajatSzin,
        isPvp:     () => true,
        getSocket: () => pvpSocketKeres()
    }).then(() => abilitiesAllapotFrissit(data.allapot));

    // Ingame chat aktivalas — PvP modban a sima text input, NEM quick-chat.
    chatPanelMutat();
    chatPanelBotMode(false);     // bot-mode kikapcs (input forma latszik)
    chatPanelEnged(true);
    chatMessagesUrites();
}

// ──────────────────────────────────────────────────────────────
// chess:state:update (lepes-broadcast utan szerver-allapot)
// ──────────────────────────────────────────────────────────────

export function pvpAllapotFrissit(allapot) {
    const elozoAllapot = state.utolsoAllapot;
    state.utolsoAllapot = allapot;
    state.kivalasztott = null;
    try { if (state.appObserver) state.appObserver.disconnect(); } catch (e) {}
    oldalVazVisszaallit();
    tablaRajzol(allapot, kellFlippelni());
    renderMoveList(allapot);

    // Animáció minden új lépéshez (saját + ellenfél egyaránt)
    if (ujLepesTortent(elozoAllapot, allapot)) {
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
    huzasHozzaadMinden(allapot);
    esemenyekUjraKot();
    nevekFrissit();
    // Bug 2026-05-04: PvP-modban a leutott babuk panel sosem renderelodott
    // (csak a bot-ag `allapotFrissit`-je hivta meg az `utottpiecekFrissit`-et).
    // Most a PvP allapot-frissito is meghivja, igy a jobb-oldali `#captured-
    // panel` (mobilon a tabla alatt) a PvP meccs kozben is kepben tartja a
    // leutott babukat es az anyagi elony jelzest.
    utottpiecekFrissit(allapot);
    eloValtozasFrissit(allapot.eloValtozas || null);
    abilitiesAllapotFrissit(allapot);

    // Kliens időzítő újraszinkronizálás
    pvpKliensIdoIndit();

    // Draw ajánlat törlés ha már nincs
    if (!allapot.drawAjanlat) {
        const offerElem = document.getElementById('draw-offer-received');
        if (offerElem) offerElem.classList.add('hidden');
    }
}

// ──────────────────────────────────────────────────────────────
// chess:game:end (matt / patt / feladas / kifutott ido / disconnect)
// ──────────────────────────────────────────────────────────────

export function pvpJatekVege(data) {
    state.utolsoAllapot = data.allapot;
    pvpKliensIdoLeall();
    // Disconnect-banner es countdown leallitas (a forfeit-emit utan
    // a banner mar feleslegessen pulzalna). Idempotens: ha nem fut a banner,
    // a `hidden` class hozzaadasa no-op.
    const dcElem = document.getElementById('opponent-disconnected');
    if (dcElem) dcElem.classList.add('hidden');
    if (window._dcInterval) {
        clearInterval(window._dcInterval);
        window._dcInterval = null;
    }
    // ELO kiszámítás a saját szín szerint
    let eloValtozas = null;
    if (data.eloValtozas) {
        eloValtozas = data.eloValtozas[state.sajatSzin];
    }
    uiJatekVegeMegjelenit(data.uzenet || 'Játék vége');
    // A `#elo-change` div a `.sidebar`-ban van, ami `display: none` — igy a
    // korabbi `eloValtozasFrissit(eloValtozas)` PvP meccs vegen NEM volt
    // lathato. (User-feedback 2026-05-04: "nem szamolja az ELO-t".) A javitas:
    // a game-end modalt megnyitjuk az eloValtozas-szal — a `gameEndModalMegnyit`
    // a modal `#gameEndElo` mezojebe irja a +/-N pontot, ami lathato.
    eloValtozasFrissit(eloValtozas);
    const feladBtn = document.getElementById('feladBtn');
    const newGameBtn = document.getElementById('newGameBtn');
    const drawBtn = document.getElementById('drawOfferBtn');
    const rematchBtn = document.getElementById('rematchBtn');
    const offerElem = document.getElementById('draw-offer-received');
    if (feladBtn) feladBtn.classList.add('hidden');
    if (newGameBtn) newGameBtn.classList.remove('hidden');
    if (drawBtn) drawBtn.classList.add('hidden');
    // N13: rematch gomb csak PvP veg utan, es csak ha az ellenfel nem hagyta el a meccset.
    if (rematchBtn) {
        rematchBtn.classList.remove('hidden');
        rematchBtn.disabled = false;
        rematchBtn.textContent = 'Revans';
    }
    if (offerElem) offerElem.classList.add('hidden');
    // (a `dcElem` mar a fuggveny tetejen elrejtve a banner-cleanup blokkban)
    // Game-end modal felugras (matt / patt / feladas / kifutott ido / disconnect).
    // Ranked meccs eseten itt jelenik meg az ELO-valtozas (+12 / -8 stb.) — a
    // sidebar #elo-change rejtett, igy ez az egyetlen lathato visszajelzes.
    chatPanelEnged(false);
    gameEndModalMegnyit(data.uzenet || 'Játék vége', eloValtozas);
}
