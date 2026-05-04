// ============================================================
// SAKK PVP — SOCKET HANDLEREK + INIT
// ============================================================
// A PvP socket flow OSSZES handler-jenek bekotese:
//   - chess:game:start / chess:state:update / chess:game:end (lifecycle)
//   - chess:rematch:* (rematch event-ek a server-tol)
//   - chess:moves:response (legalis lepeslista valasz)
//   - chess:error (PvP hibajelzes)
//   - chess:invite:received / declined / expired / cancelled (meghivasok)
//   - chess:queue:joined / left (random matchmaking)
//   - chess:opponent:disconnected / reconnected (60s grace banner)
//   - chess:draw:offered / declined (dontetlen flow)
//   - chess:rejoin:none (no-match rejoin valasz - chooser nyitas)
//
// `pvpSocketInit()` idempotens: a `socket._pvpHandlersRegistered` flaggel
// megjegyzi, hogy a handler-ek mar bekotve vannak; ha a socket meg nem all
// keszen, 500ms-os retry-szal visszaprobalja.
// ============================================================

import { state } from '../state.js';
import { pvpSocketKeres } from './socketRef.js';
import { rejoinOverlayElrejt } from './rejoinOverlay.js';
import { pvpJatekKezdet, pvpAllapotFrissit, pvpJatekVege } from './pvpJatek.js';
import {
    rematchUiVarakozas, rematchUiReset, rematchBejovoModal
} from './rematch.js';
import { ujMeccsChooserNyitas } from '../chooser.js';

export function pvpSocketInit() {
    const socket = pvpSocketKeres();
    if (!socket) {
        // A socket lehet még nem áll készen — próbáljuk később
        setTimeout(pvpSocketInit, 500);
        return;
    }
    if (socket._pvpHandlersRegistered) return;
    socket._pvpHandlersRegistered = true;

    // Játék indul (mindkét játékosnak, egyéni state.sajatSzin-nel)
    socket.on('chess:game:start', (data) => {
        pvpJatekKezdet(data);
    });

    // Állapot frissítés (lépés után broadcast)
    socket.on('chess:state:update', (data) => {
        console.log('[PvP] state:update', { koronLevo: data.allapot?.koronLevo, lepesszam: data.allapot?.lepesszam });
        if (!state.pvpAktiv) return;
        pvpAllapotFrissit(data.allapot);
    });

    // Játék vége
    socket.on('chess:game:end', (data) => {
        // POST-GRACE FORFEIT REJOIN: a backend kuldhet game:end-et a chess:game:start
        // nelkul is, ha a felhasznalo a 60s disconnect-grace LEJARTA utan jott vissza.
        // Ilyenkor `state.pvpAktiv === false`, de a UI-nak meg kell mutatnia a vereseget.
        // A backend a `postGraceRejoin: true` + `state.sajatSzin` mezokkel jelzi ezt az
        // edge-case-et. Beallitjuk a minimalis state-et, hogy a `pvpJatekVege`
        // helyesen tudja az ELO-jelolest (white/black) megmutatni.
        if (!state.pvpAktiv && data && data.postGraceRejoin && data.sajatSzin) {
            state.pvpAktiv = true;
            state.sajatSzin = data.sajatSzin;
            state.pvpGameId = data.allapot && data.allapot.gameId ? data.allapot.gameId : state.pvpGameId;
            state.gameId = state.pvpGameId;
            // Rejoin overlay le — sikertelen reconnect, mutatjuk az eredmenyt.
            rejoinOverlayElrejt();
            // Chooser is le, ha veletlen kinyilt volna (safety-timeout race).
            try {
                if (window.MattMesterChessModeChooser && typeof window.MattMesterChessModeChooser.close === 'function') {
                    window.MattMesterChessModeChooser.close();
                }
            } catch (_) {}
        }
        if (!state.pvpAktiv) return;
        pvpJatekVege(data);
    });

    // N13 — Rematch event-ek (server → kliens)
    socket.on('chess:rematch:offered', () => {
        // Sajat ajanlat nyugtazva — a rematch-gomb varakozasi allapotba kerul.
        rematchUiVarakozas();
    });
    socket.on('chess:rematch:incoming', (data) => {
        // Ellenfel ajanlott — bejovo modal megjelenitese.
        rematchBejovoModal(true, data && data.gameId);
    });
    socket.on('chess:rematch:declined', (data) => {
        rematchUiReset(window.MattMesterI18n?.tx ? window.MattMesterI18n.tx('Az ellenfél elutasította a revanst.', 'The opponent declined the rematch.') : 'Az ellenfél elutasította a revanst.');
        rematchBejovoModal(false);
    });
    socket.on('chess:rematch:expired', () => {
        rematchUiReset(window.MattMesterI18n?.tx ? window.MattMesterI18n.tx('A revans lejárt.', 'The rematch expired.') : 'A revans lejárt.');
        rematchBejovoModal(false);
    });
    socket.on('chess:rematch:cancelled', () => {
        rematchUiReset(window.MattMesterI18n?.tx ? window.MattMesterI18n.tx('A revans érvénytelen — ellenfél kilépett.', 'Rematch invalid — opponent left.') : 'A revans érvénytelen — ellenfél kilépett.');
        rematchBejovoModal(false);
    });
    socket.on('chess:rematch:error', (data) => {
        rematchUiReset((data && data.uzenet) || (window.MattMesterI18n?.tx ? window.MattMesterI18n.tx('Revans hiba', 'Rematch error') : 'Revans hiba'));
        rematchBejovoModal(false);
    });

    // Legális lépések válasz
    socket.on('chess:moves:response', (data) => {
        console.log('[PvP] moves:response', { lepesek: data.lepesek?.length || 0, x: data.x, y: data.y });
        // Találjuk meg és teljesítsük a várakozó promise-t
        if (state.varakozoLepesPromisek.length > 0) {
            const w = state.varakozoLepesPromisek.shift();
            if (w.timer) clearTimeout(w.timer);
            w.resolve(data.lepesek || []);
        }
    });

    // Hiba
    socket.on('chess:error', (data) => {
        console.warn('[PvP hiba]', data.uzenet);
        // Custom HTML modal a natív alert() helyett (memoria-szabaly).
        const txp = (hu, en) => (window.MattMesterI18n?.tx ? window.MattMesterI18n.tx(hu, en) : hu);
        if (typeof window.mmAlert === 'function') {
            window.mmAlert({ title: txp('PvP hiba', 'PvP error'), message: data.uzenet || txp('Ismeretlen hiba.', 'Unknown error.') });
        }
        const statusElem = document.getElementById('status');
        if (statusElem) {
            statusElem.textContent = data.uzenet || txp('Hiba', 'Error');
            setTimeout(() => {
                if (state.utolsoAllapot && !state.utolsoAllapot.vege) {
                    statusElem.textContent = txp('játékon', 'in game');
                }
            }, 3000);
        }
    });

    // Bejövő meghívás
    socket.on('chess:invite:received', (data) => {
        const popup = document.getElementById('pvp-invite');
        const nameElem = document.getElementById('pvp-invite-name');
        if (nameElem) nameElem.textContent = data.inviterName || (window.MattMesterI18n?.tx ? window.MattMesterI18n.tx('Ismeretlen', 'Unknown') : 'Ismeretlen');
        if (popup) popup.classList.remove('hidden');

        const acceptBtn = document.getElementById('pvp-invite-accept');
        const declineBtn = document.getElementById('pvp-invite-decline');
        if (acceptBtn) {
            acceptBtn.onclick = () => {
                socket.emit('chess:invite:accept', { gameId: data.gameId });
                if (popup) popup.classList.add('hidden');
            };
        }
        if (declineBtn) {
            declineBtn.onclick = () => {
                socket.emit('chess:invite:decline', { gameId: data.gameId });
                if (popup) popup.classList.add('hidden');
            };
        }
    });

    // Meghívás elutasítva
    socket.on('chess:invite:declined', () => {
        const waiting = document.getElementById('pvp-waiting');
        if (waiting) waiting.classList.add('hidden');
        if (typeof window.mmAlert === 'function') {
            const txi = (hu, en) => (window.MattMesterI18n?.tx ? window.MattMesterI18n.tx(hu, en) : hu);
            window.mmAlert({ title: txi('Meghívás elutasítva', 'Invitation declined'), message: txi('Az ellenfél elutasította a meghívást.', 'The opponent declined the invitation.') });
        }
    });

    // Meghívás lejárt/cancel
    socket.on('chess:invite:expired', () => {
        const waiting = document.getElementById('pvp-waiting');
        const popup = document.getElementById('pvp-invite');
        if (waiting) waiting.classList.add('hidden');
        if (popup) popup.classList.add('hidden');
    });
    socket.on('chess:invite:cancelled', () => {
        const waiting = document.getElementById('pvp-waiting');
        const popup = document.getElementById('pvp-invite');
        if (waiting) waiting.classList.add('hidden');
        if (popup) popup.classList.add('hidden');
    });

    // Random queue
    socket.on('chess:queue:joined', () => {
        // Már megjelent a "keresés..." lépésben — nincs plusz teendő
    });
    socket.on('chess:queue:left', () => {
        // Cancel UI már kezeli
    });

    // Ellenfél disconnect — chess.com-szeru countdown banner
    // (CSS fixed-positioning, lasd `.opponent-dc` a chess.css-ben).
    // Ha az ellenfel 60mp alatt nem ter vissza, a backend auto-forfeit-tel
    // zarja a meccset (lasd handlePvpDisconnect).
    socket.on('chess:opponent:disconnected', (data) => {
        if (!state.pvpAktiv) return;
        const dcElem = document.getElementById('opponent-disconnected');
        const countElem = document.getElementById('dc-countdown');
        if (!dcElem) return;
        dcElem.classList.remove('hidden');
        let masodperc = Math.floor((data.gracePeriodMs || 60000) / 1000);
        // m:ss formatum (pl. 1:00, 0:45, 0:09) — vizualisan tisztabb a "60mp"
        // helyett, es a felhasznalo lat kell hogy ez ido, nem szam.
        const formatDc = (mp) => {
            const m = Math.floor(mp / 60);
            const s = mp % 60;
            return `${m}:${s.toString().padStart(2, '0')}`;
        };
        if (countElem) countElem.textContent = formatDc(masodperc);
        if (window._dcInterval) clearInterval(window._dcInterval);
        window._dcInterval = setInterval(() => {
            masodperc--;
            if (countElem) countElem.textContent = formatDc(Math.max(0, masodperc));
            if (masodperc <= 0) {
                clearInterval(window._dcInterval);
                window._dcInterval = null;
                // 0-ra ert a countdown — a backend auto-forfeit-je hamarosan
                // game:end-tel zar. Az "1:00" helyett mostantol "0:00" mutatja
                // a banner, igy a felhasznalo tisztan latja, hogy lejart az ido.
            }
        }, 1000);
    });
    socket.on('chess:opponent:reconnected', () => {
        const dcElem = document.getElementById('opponent-disconnected');
        if (dcElem) dcElem.classList.add('hidden');
        if (window._dcInterval) {
            clearInterval(window._dcInterval);
            window._dcInterval = null;
        }
    });

    // Döntetlen ajánlat
    socket.on('chess:draw:offered', () => {
        if (!state.pvpAktiv) return;
        const offerElem = document.getElementById('draw-offer-received');
        if (offerElem) offerElem.classList.remove('hidden');
        const acceptBtn = document.getElementById('draw-accept');
        const declineBtn = document.getElementById('draw-decline');
        if (acceptBtn) {
            acceptBtn.onclick = () => {
                socket.emit('chess:draw:accept', { gameId: state.pvpGameId });
                if (offerElem) offerElem.classList.add('hidden');
            };
        }
        if (declineBtn) {
            declineBtn.onclick = () => {
                socket.emit('chess:draw:decline', { gameId: state.pvpGameId });
                if (offerElem) offerElem.classList.add('hidden');
            };
        }
    });
    socket.on('chess:draw:declined', () => {
        const statusElem = document.getElementById('status');
        if (statusElem) {
            const eredetiSzoveg = statusElem.textContent;
            statusElem.textContent = window.MattMesterI18n?.tx ? window.MattMesterI18n.tx('Döntetlen ajánlat elutasítva', 'Draw offer declined') : 'Döntetlen ajánlat elutasítva';
            setTimeout(() => {
                if (state.utolsoAllapot && !state.utolsoAllapot.vege) {
                    statusElem.textContent = eredetiSzoveg;
                }
            }, 3000);
        }
    });

    // Rejoin — ha nincs játék, nincs teendő. KIVÉVE: ha a frontpage chooser
    // pendingMatch flag-gel ide-küldte a felhasználót de a backend nem talál
    // aktív meccset (pl. meccs közben befejeződött), nyissuk meg az UJ chooser-t,
    // különben a user üres oldalon ragadna.
    // FONTOS: ha az URL-ben van `?type=bot|pvp`, a bot/pvp init-flow eppen
    // most letrehozza a meccset — ne nyissuk meg a chooser-t, mert csak villanna
    // egyet feleslegesen.
    socket.on('chess:rejoin:none', () => {
        // Akarmi tortent, a rejoin overlay mehet le — nincs aktiv meccs.
        rejoinOverlayElrejt();
        if (state.pvpAktiv) return;
        if (state.gameId) return; // mar van bot/pvp meccs folyamatban
        try {
            const params = new URLSearchParams(window.location.search);
            const t = params.get('type');
            if (t === 'bot' || t === 'pvp') return;
        } catch (_) { /* ignore */ }
        ujMeccsChooserNyitas();
    });
}
