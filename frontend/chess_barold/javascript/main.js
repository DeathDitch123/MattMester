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
         lepesAnimacio } from './UI-megjelenites.js';
import { abilitiesInit, abilitiesAllapotFrissit, abilitiesReset, isAbilityArmed } from './abilities.js';

// Az aktuális játék ID — a szerver adja
let gameId = null;

// Utolsó ismert állapot (csak rendereléshez, NEM logikai döntésekhez)
let utolsoAllapot = null;

// Idő szinkron polling timer
let idoPollTimer = null;

// Húzás folyamatban flag — ilyenkor NEM renderelünk újra
let huzasFolyamatban = false;

// Kliens már lerakta a bábút, de még vár a szerver válaszára
let lepesKuldesFolyamatban = false;
let lepesKuldesFailSafeTimer = null;

// Click-to-move: kijelölt bábu adatai
let kivalasztott = null; // { x, y, piece, lepesek }

// MutationObserver — DOM manipuláció észlelése
let appObserver = null;

// Integritás ellenőrző timer (független az API poll-tól)
let integritasTimer = null;

// Folyamatban lévő helyreállítás flag (rekurzió védelem)
let helyreallitasFut = false;

// Bot játék infó
let botInfo = null;
let botPollTimer = null;
let utolsoAnimaltLepesKulcs = null;
let slidingFolyamatban = false;

// ── PVP JÁTÉK ÁLLAPOT ──
let pvpAktiv = false;
let sajatSzin = null;              // 'white' | 'black'
let ellenfelNev = null;
let sajatNev = null;
let pvpSocket = null;              // Socket.io kliens (globális window.io())
let kliensIdoTimer = null;         // kliens-oldali óra countdown (csak megjelenítés)
let varakozoLepesPromisek = [];    // chess:moves:response Promise-ek

// Hang lejátszás deduplikálás + egyszeri AudioContext
let utolsoHangLepesKulcs = null;
let audioCtx = null;
const HANG_FAJLOK = {
    jatekosLep: '../sounds/Jatekos_lep.mp3',
    ellenfelLep: '../sounds/Ellenfel_lep.mp3',
    sakk: '../sounds/sakk.mp3',
    matt: '../sounds/matt.mp3',
    sanc: '../sounds/sanc.mp3'
};
const hangCache = {};
const DRAG_START_THRESHOLD_PX = 6;

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

                <!-- TÁBLAKITAKARÁS overlay -->
                <div id="board-hide-overlay" class="board-hide-overlay hidden">
                    <span>Tábla eltakarva</span>
                    <span id="board-hide-countdown">5</span>
                </div>

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

                <!-- KÉPESSÉG BAR -->
                <div id="ability-bar" class="ability-bar hidden">
                    <div class="ability-points">
                        <span class="ap-label">Pontok</span>
                        <span class="ap-mine" id="ap-mine">0</span>
                        <span class="ap-sep">vs</span>
                        <span class="ap-opp" id="ap-opp">0</span>
                    </div>
                    <div id="ability-buttons" class="ability-buttons"></div>
                    <div id="ability-hint" class="ability-hint hidden"></div>
                </div>

                <div id="bot-thinking" class="bot-thinking hidden">🤖 A bot gondolkodik...</div>
                <div id="opponent-disconnected" class="opponent-dc hidden">
                    Ellenfél kikapcsolt... <span id="dc-countdown">60</span>mp
                </div>
                <div id="elo-change" class="elo-change hidden"></div>
                <button id="drawOfferBtn" class="draw-btn hidden">Döntetlen ajánlat</button>
                <div id="draw-offer-received" class="draw-offer hidden">
                    <p>Ellenfeled döntetlent ajánl</p>
                    <div class="draw-offer-buttons">
                        <button id="draw-accept" class="pvp-invite-btn accept">Elfogad</button>
                        <button id="draw-decline" class="pvp-invite-btn decline">Elutasít</button>
                    </div>
                </div>
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

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 9000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        const data = await res.json();
        return { res, data };
    } finally {
        clearTimeout(timeoutId);
    }
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
    const { res, data } = await fetchJsonWithTimeout(`/api/chess/${gameId}/state`, {}, 6000);
    if (!res.ok) throw new Error(data.error || 'Hiba');
    return data;
}

async function apiLepesek(x, y) {
    const { res, data } = await fetchJsonWithTimeout(`/api/chess/${gameId}/moves/${x}/${y}`, {}, 7000);
    if (!res.ok) throw new Error(data.error || 'Hiba');
    return data.lepesek;
}

async function apiLepes(fromX, fromY, toX, toY, promotion) {
    const body = { fromX, fromY, toX, toY };
    if (promotion) body.promotion = promotion;
    const { res, data } = await fetchJsonWithTimeout(`/api/chess/${gameId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }, 12000);
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
    const stepPvp = document.getElementById("mode-step-pvp");
    const stepFriends = document.getElementById("mode-step-friends");
    const stepQueue = document.getElementById("mode-step-queue");
    const diffList = document.getElementById("difficulty-list");

    const mindElrejt = () => {
        step1.classList.add("hidden");
        step2.classList.add("hidden");
        if (stepPvp) stepPvp.classList.add("hidden");
        if (stepFriends) stepFriends.classList.add("hidden");
        if (stepQueue) stepQueue.classList.add("hidden");
    };

    modal.classList.remove("hidden");
    mindElrejt();
    step1.classList.remove("hidden");

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
        mindElrejt();
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

    // PvP gomb
    const pvpBtn = document.getElementById("mode-pvp");
    if (pvpBtn) {
        pvpBtn.onclick = () => {
            mindElrejt();
            if (stepPvp) stepPvp.classList.remove("hidden");
        };
    }

    // PvP → Barát
    const pvpFriendBtn = document.getElementById("pvp-friend");
    if (pvpFriendBtn) {
        pvpFriendBtn.onclick = async () => {
            mindElrejt();
            if (stepFriends) stepFriends.classList.remove("hidden");
            await baratListaMegjelenit();
        };
    }

    // PvP → Random queue
    const pvpRandomBtn = document.getElementById("pvp-random");
    if (pvpRandomBtn) {
        pvpRandomBtn.onclick = () => {
            mindElrejt();
            if (stepQueue) stepQueue.classList.remove("hidden");
            randomQueueIndit();
        };
    }

    // Vissza gombok
    document.getElementById("mode-back").onclick = () => {
        mindElrejt();
        step1.classList.remove("hidden");
    };
    const backPvp = document.getElementById("mode-back-pvp-menu");
    if (backPvp) {
        backPvp.onclick = () => {
            mindElrejt();
            step1.classList.remove("hidden");
        };
    }
    const backFriends = document.getElementById("mode-back-friends");
    if (backFriends) {
        backFriends.onclick = () => {
            mindElrejt();
            if (stepPvp) stepPvp.classList.remove("hidden");
        };
    }
    const queueCancel = document.getElementById("queue-cancel");
    if (queueCancel) {
        queueCancel.onclick = () => {
            randomQueueMegse();
            mindElrejt();
            if (stepPvp) stepPvp.classList.remove("hidden");
        };
    }
}

// ────────────────────────────────────────────
// PVP — BARÁT LISTA + QUEUE + MEGHÍVÁS
// ────────────────────────────────────────────

async function apiBaratLista() {
    const res = await fetch('/api/friends/list?status=friend');
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Hiba a barátlista lekérésekor.');
    return data.data || [];
}

async function baratListaMegjelenit() {
    const listaElem = document.getElementById("friend-list");
    if (!listaElem) return;
    listaElem.innerHTML = '<p style="color:#aaa">Betöltés...</p>';

    try {
        const baratok = await apiBaratLista();
        listaElem.innerHTML = "";
        if (baratok.length === 0) {
            listaElem.innerHTML = '<p style="color:#aaa">Nincsenek barátaid.</p>';
            return;
        }
        for (let i = 0; i < baratok.length; i++) {
            const b = baratok[i];
            const btn = document.createElement("button");
            btn.className = "friend-btn";
            const uid = b.userId || b.id;
            const uname = b.username || 'Ismeretlen';
            btn.innerHTML = `
                <span class="friend-name">${uname}</span>
                <span class="friend-action">Meghívás</span>
            `;
            btn.addEventListener("click", () => meghivasKuld(uid, uname));
            listaElem.appendChild(btn);
        }
    } catch (e) {
        listaElem.innerHTML = `<p style="color:#f88">${e.message}</p>`;
    }
}

function meghivasKuld(targetUserId, targetName) {
    const socket = pvpSocketKeres();
    if (!socket) return;

    socket.emit('chess:invite', { targetUserId });

    const waiting = document.getElementById("pvp-waiting");
    const waitingName = document.getElementById("pvp-waiting-name");
    if (waitingName) waitingName.textContent = targetName || "";
    if (waiting) waiting.classList.remove("hidden");

    const cancelBtn = document.getElementById("pvp-cancel");
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            socket.emit('chess:invite:cancel');
            if (waiting) waiting.classList.add("hidden");
        };
    }
}

function randomQueueIndit() {
    const socket = pvpSocketKeres();
    if (!socket) return;
    socket.emit('chess:queue:join');
}

function randomQueueMegse() {
    const socket = pvpSocketKeres();
    if (!socket) return;
    socket.emit('chess:queue:leave');
}

// ────────────────────────────────────────────
// PVP — SOCKET.IO INTEGRÁCIÓ
// ────────────────────────────────────────────

function pvpSocketKeres() {
    // Mindig friss socket lekérdezés (reconnect után új socket lehet)
    const elerheto = window.MattMesterSocket && window.MattMesterSocket.socket;
    if (elerheto) {
        pvpSocket = window.MattMesterSocket.socket;
    }
    return pvpSocket;
}

// Másik oldalról elfogadott meghívás — chessInviteGlobal.js mentett egy gameId-t a sessionStorage-ba.
// Ezt a sakk oldal betöltése után küldjük el a szervernek.
const PENDING_CHESS_INVITE_ACCEPT_KEY = 'mattmester.pendingChessInviteAccept';
function pendingChessInviteAcceptKuld(socket) {
    if (!socket) return;
    let payload = null;
    try {
        const raw = window.sessionStorage.getItem(PENDING_CHESS_INVITE_ACCEPT_KEY);
        if (raw) payload = JSON.parse(raw);
    } catch (_) {}
    if (!payload || !payload.gameId) return;
    try { window.sessionStorage.removeItem(PENDING_CHESS_INVITE_ACCEPT_KEY); } catch (_) {}
    // 60s lejárat (a backend invite TTL-jéhez igazodva)
    if (payload.ts && Date.now() - payload.ts > 60000) return;
    socket.emit('chess:invite:accept', { gameId: payload.gameId });
}

function pvpSocketInit() {
    const socket = pvpSocketKeres();
    if (!socket) {
        // A socket lehet még nem áll készen — próbáljuk később
        setTimeout(pvpSocketInit, 500);
        return;
    }
    if (socket._pvpHandlersRegistered) return;
    socket._pvpHandlersRegistered = true;

    // Játék indul (mindkét játékosnak, egyéni sajatSzin-nel)
    socket.on('chess:game:start', (data) => {
        pvpJatekKezdet(data);
    });

    // Állapot frissítés (lépés után broadcast)
    socket.on('chess:state:update', (data) => {
        console.log('[PvP] state:update', { koronLevo: data.allapot?.koronLevo, lepesszam: data.allapot?.lepesszam });
        if (!pvpAktiv) return;
        pvpAllapotFrissit(data.allapot);
    });

    // Játék vége
    socket.on('chess:game:end', (data) => {
        if (!pvpAktiv) return;
        pvpJatekVege(data);
    });

    // Legális lépések válasz
    socket.on('chess:moves:response', (data) => {
        console.log('[PvP] moves:response', { lepesek: data.lepesek?.length || 0, x: data.x, y: data.y });
        // Találjuk meg és teljesítsük a várakozó promise-t
        if (varakozoLepesPromisek.length > 0) {
            const w = varakozoLepesPromisek.shift();
            if (w.timer) clearTimeout(w.timer);
            w.resolve(data.lepesek || []);
        }
    });

    // Hiba
    socket.on('chess:error', (data) => {
        console.warn('[PvP hiba]', data.uzenet);
        // Vizuális popup, hogy a tesztelő észrevegye
        try { alert('PvP hiba: ' + (data.uzenet || 'ismeretlen')); } catch (_) {}
        const statusElem = document.getElementById('status');
        if (statusElem) {
            statusElem.textContent = data.uzenet || 'Hiba';
            setTimeout(() => {
                if (utolsoAllapot && !utolsoAllapot.vege) {
                    statusElem.textContent = 'játékon';
                }
            }, 3000);
        }
    });

    // Bejövő meghívás
    socket.on('chess:invite:received', (data) => {
        const popup = document.getElementById('pvp-invite');
        const nameElem = document.getElementById('pvp-invite-name');
        if (nameElem) nameElem.textContent = data.inviterName || 'Ismeretlen';
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
        alert('Az ellenfél elutasította a meghívást.');
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

    // Ellenfél disconnect
    socket.on('chess:opponent:disconnected', (data) => {
        if (!pvpAktiv) return;
        const dcElem = document.getElementById('opponent-disconnected');
        const countElem = document.getElementById('dc-countdown');
        if (!dcElem) return;
        dcElem.classList.remove('hidden');
        let masodperc = Math.floor((data.gracePeriodMs || 60000) / 1000);
        if (countElem) countElem.textContent = masodperc;
        if (window._dcInterval) clearInterval(window._dcInterval);
        window._dcInterval = setInterval(() => {
            masodperc--;
            if (countElem) countElem.textContent = masodperc;
            if (masodperc <= 0) {
                clearInterval(window._dcInterval);
                window._dcInterval = null;
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
        if (!pvpAktiv) return;
        const offerElem = document.getElementById('draw-offer-received');
        if (offerElem) offerElem.classList.remove('hidden');
        const acceptBtn = document.getElementById('draw-accept');
        const declineBtn = document.getElementById('draw-decline');
        if (acceptBtn) {
            acceptBtn.onclick = () => {
                socket.emit('chess:draw:accept', { gameId: pvpGameId });
                if (offerElem) offerElem.classList.add('hidden');
            };
        }
        if (declineBtn) {
            declineBtn.onclick = () => {
                socket.emit('chess:draw:decline', { gameId: pvpGameId });
                if (offerElem) offerElem.classList.add('hidden');
            };
        }
    });
    socket.on('chess:draw:declined', () => {
        const statusElem = document.getElementById('status');
        if (statusElem) {
            const eredetiSzoveg = statusElem.textContent;
            statusElem.textContent = 'Döntetlen ajánlat elutasítva';
            setTimeout(() => {
                if (utolsoAllapot && !utolsoAllapot.vege) {
                    statusElem.textContent = eredetiSzoveg;
                }
            }, 3000);
        }
    });

    // Rejoin — ha nincs játék, nincs teendő
    socket.on('chess:rejoin:none', () => {
        // csendben
    });
}

let pvpGameId = null;

function pvpJatekKezdet(data) {
    console.log('[PvP] game:start', { sajatSzin: data.sajatSzin, sajatNev: data.sajatNev, ellenfelNev: data.ellenfelNev, gameId: data.gameId });
    // Modal elrejtés + játék állapot beállítás
    const modal = document.getElementById('mode-modal');
    const waiting = document.getElementById('pvp-waiting');
    const popup = document.getElementById('pvp-invite');
    if (modal) modal.classList.add('hidden');
    if (waiting) waiting.classList.add('hidden');
    if (popup) popup.classList.add('hidden');

    pvpAktiv = true;
    sajatSzin = data.sajatSzin;
    ellenfelNev = data.ellenfelNev;
    sajatNev = data.sajatNev;
    pvpGameId = data.gameId;
    gameId = data.gameId;
    botInfo = null;
    utolsoAllapot = null;
    utolsoAnimaltLepesKulcs = null;

    // Bot polling leállítás
    idoPollingLeall();
    if (botPollTimer) {
        clearInterval(botPollTimer);
        botPollTimer = null;
    }

    // UI reset
    const feladBtn = document.getElementById('feladBtn');
    const newGameBtn = document.getElementById('newGameBtn');
    if (feladBtn) feladBtn.classList.remove('hidden');
    if (newGameBtn) newGameBtn.classList.add('hidden');
    const drawBtn = document.getElementById('drawOfferBtn');
    if (drawBtn) drawBtn.classList.remove('hidden');

    // Board render + kliens időzítő indítás
    pvpAllapotFrissit(data.allapot);
    pvpKliensIdoIndit();

    // Képesség UI inicializálás
    abilitiesInit({
        getGameId: () => pvpGameId,
        getSzin:   () => sajatSzin,
        isPvp:     () => true,
        getSocket: () => pvpSocketKeres()
    }).then(() => abilitiesAllapotFrissit(data.allapot));
}

function pvpAllapotFrissit(allapot) {
    const elozoAllapot = utolsoAllapot;
    utolsoAllapot = allapot;
    kivalasztott = null;
    try { if (appObserver) appObserver.disconnect(); } catch (e) {}
    oldalVazVisszaallit();
    tablaRajzol(allapot, sajatSzin === 'black');

    // Animáció minden új lépéshez (saját + ellenfél egyaránt)
    if (ujLepesTortent(elozoAllapot, allapot)) {
        {
            const animKulcs = allapotLepesKulcs(allapot);
            if (animKulcs && animKulcs !== utolsoAnimaltLepesKulcs) {
                utolsoAnimaltLepesKulcs = animKulcs;
                slidingFolyamatban = true;
                Promise.resolve(lepesAnimacio(allapot.utolsoLepes)).finally(() => {
                    slidingFolyamatban = false;
                });
            }
        }
    }
    lepesHangLejatszas(allapot);
    huzasHozzaadMinden(allapot);
    esemenyekUjraKot();
    nevekFrissit();
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

function pvpJatekVege(data) {
    utolsoAllapot = data.allapot;
    pvpKliensIdoLeall();
    // ELO kiszámítás a saját szín szerint
    let eloValtozas = null;
    if (data.eloValtozas) {
        eloValtozas = data.eloValtozas[sajatSzin];
    }
    uiJatekVegeMegjelenit(data.uzenet || 'Játék vége');
    eloValtozasFrissit(eloValtozas);
    const feladBtn = document.getElementById('feladBtn');
    const newGameBtn = document.getElementById('newGameBtn');
    const drawBtn = document.getElementById('drawOfferBtn');
    const offerElem = document.getElementById('draw-offer-received');
    const dcElem = document.getElementById('opponent-disconnected');
    if (feladBtn) feladBtn.classList.add('hidden');
    if (newGameBtn) newGameBtn.classList.remove('hidden');
    if (drawBtn) drawBtn.classList.add('hidden');
    if (offerElem) offerElem.classList.add('hidden');
    if (dcElem) dcElem.classList.add('hidden');
    if (window._dcInterval) {
        clearInterval(window._dcInterval);
        window._dcInterval = null;
    }
}

function pvpLegalisLepesKeres(x, y) {
    const socket = pvpSocketKeres();
    console.log('[PvP] moves:request küldés', { x, y, gameId: pvpGameId, socketConnected: socket?.connected });
    if (!socket) return Promise.resolve([]);
    return new Promise((resolve) => {
        const w = { resolve, timer: null };
        w.timer = setTimeout(() => {
            const idx = varakozoLepesPromisek.indexOf(w);
            if (idx !== -1) varakozoLepesPromisek.splice(idx, 1);
            console.warn('[PvP] moves:request timeout (5s) — szerver nem válaszolt');
            resolve([]);
        }, 5000);
        varakozoLepesPromisek.push(w);
        socket.emit('chess:moves:request', { gameId: pvpGameId, x, y });
    });
}

function pvpLepesKuld(fromX, fromY, toX, toY, promotion) {
    const socket = pvpSocketKeres();
    console.log('[PvP] move küldés', { fromX, fromY, toX, toY, promotion, gameId: pvpGameId, socketConnected: socket?.connected });
    if (!socket) return;
    socket.emit('chess:move', { gameId: pvpGameId, fromX, fromY, toX, toY, promotion });
}

function pvpKliensIdoIndit() {
    pvpKliensIdoLeall();
    if (!pvpAktiv || !utolsoAllapot || utolsoAllapot.vege) return;

    kliensIdoTimer = setInterval(() => {
        if (!utolsoAllapot || utolsoAllapot.vege) return;
        const aktivSzin = utolsoAllapot.koronLevo;
        if (!utolsoAllapot.ido) return;

        utolsoAllapot.ido[aktivSzin] = Math.max(0, utolsoAllapot.ido[aktivSzin] - 1);

        const format = (mp) => {
            const perc = Math.floor(mp / 60);
            const masodperc = mp % 60;
            return `${perc}:${masodperc.toString().padStart(2, '0')}`;
        };
        const whiteElem = document.getElementById('clock-white');
        const blackElem = document.getElementById('clock-black');
        if (whiteElem) whiteElem.textContent = format(utolsoAllapot.ido.white);
        if (blackElem) blackElem.textContent = format(utolsoAllapot.ido.black);
    }, 1000);
}

function pvpKliensIdoLeall() {
    if (kliensIdoTimer) {
        clearInterval(kliensIdoTimer);
        kliensIdoTimer = null;
    }
}

function pvpFeladas() {
    const socket = pvpSocketKeres();
    if (!socket || !pvpGameId) return;
    socket.emit('chess:surrender', { gameId: pvpGameId });
}

function pvpDontetlenAjanlat() {
    const socket = pvpSocketKeres();
    if (!socket || !pvpGameId) return;
    socket.emit('chess:draw:offer', { gameId: pvpGameId });
    const drawBtn = document.getElementById('drawOfferBtn');
    if (drawBtn) {
        drawBtn.disabled = true;
        drawBtn.textContent = 'Ajánlat elküldve';
    }
}

function pvpAllapotReset() {
    pvpAktiv = false;
    sajatSzin = null;
    ellenfelNev = null;
    sajatNev = null;
    pvpGameId = null;
    pvpKliensIdoLeall();
    const drawBtn = document.getElementById('drawOfferBtn');
    if (drawBtn) {
        drawBtn.disabled = false;
        drawBtn.textContent = 'Döntetlen ajánlat';
        drawBtn.classList.add('hidden');
    }
    varakozoLepesPromisek.length = 0;
    abilitiesReset();
}

async function jatekIndit(nehezseg, modal) {
    try {
        const allapot = await apiUjBotJatek(nehezseg);

        if (modal) modal.classList.add("hidden");

        // Nevek frissítése
        nevekFrissit();

        allapotFrissit(allapot);
        idoPollingIndit();

        // Képesség UI inicializálás (bot meccs — REST mód, mindig white)
        await abilitiesInit({
            getGameId: () => gameId,
            getSzin:   () => 'white',  // bot meccsen a játékos mindig white
            isPvp:     () => false,
            getSocket: () => null
        });
        abilitiesAllapotFrissit(allapot);

        console.log(`[INIT] Bot játék indítva — ${botInfo.nev} (ELO: ${botInfo.elo})`);
    } catch (e) {
        console.error('Bot játék indítási hiba:', e);
        const diffList = document.getElementById("difficulty-list");
        if (diffList) {
            diffList.innerHTML = `<p style="color:#f88">Hiba a játék indításakor: ${e.message || 'Ismeretlen hiba'}</p>`;
        }
    }
}

function nevekFrissit() {
    const nameBlack = document.getElementById("name-black");
    const nameWhite = document.getElementById("name-white");

    if (pvpAktiv) {
        // PvP — szerverből érkező név páros, saját szín alapján label
        const whiteNev = (utolsoAllapot && utolsoAllapot.pvpJatekosNevek) ? utolsoAllapot.pvpJatekosNevek.white : (sajatSzin === 'white' ? sajatNev : ellenfelNev);
        const blackNev = (utolsoAllapot && utolsoAllapot.pvpJatekosNevek) ? utolsoAllapot.pvpJatekosNevek.black : (sajatSzin === 'black' ? sajatNev : ellenfelNev);
        if (nameWhite) nameWhite.textContent = `${whiteNev || 'Fehér'}${sajatSzin === 'white' ? ' (Te)' : ''}`;
        if (nameBlack) nameBlack.textContent = `${blackNev || 'Fekete'}${sajatSzin === 'black' ? ' (Te)' : ''}`;
    } else if (botInfo) {
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

    // PvP: socket-en küld, a szerver ad vissza game:end-et
    if (pvpAktiv) {
        pvpFeladas();
        return;
    }

    try {
        const data = await apiFeladMagat();
        jatekVegeUI(data.uzenet || 'Feladtad a játékot.', data.eloValtozas ?? null);
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

function eloValtozasFrissit(eloValtozas) {
    const eloElem = document.getElementById('elo-change');
    if (!eloElem) return;

    eloElem.classList.remove('positive', 'negative');

    if (!eloValtozas) {
        eloElem.textContent = '';
        eloElem.classList.add('hidden');
        return;
    }

    const diff = Number(eloValtozas.eloChange || 0);
    const sign = diff >= 0 ? '+' : '';
    eloElem.textContent = `ELO: ${eloValtozas.eloBefore} -> ${eloValtozas.eloAfter} (${sign}${diff})`;
    eloElem.classList.add(diff >= 0 ? 'positive' : 'negative');
    eloElem.classList.remove('hidden');
}

function jatekVegeUI(uzenet, eloValtozas) {
    uiJatekVegeMegjelenit(uzenet);
    integritasEllenorzesLeall();
    botGondolkodasFrissit(false);
    if (botPollTimer) {
        clearInterval(botPollTimer);
        botPollTimer = null;
    }
    lepesKuldesLezar();
    if (eloValtozas !== undefined) {
        eloValtozasFrissit(eloValtozas);
    }
    const feladBtn = document.getElementById('feladBtn');
    const newGameBtn = document.getElementById('newGameBtn');
    if (feladBtn) feladBtn.classList.add('hidden');
    if (newGameBtn) newGameBtn.classList.remove('hidden');
}

function botGondolkodasFrissit(allapotVagyBool) {
    const thinkingElem = document.getElementById('bot-thinking');
    if (!thinkingElem) return;

    const gondolkodik = typeof allapotVagyBool === 'boolean'
        ? allapotVagyBool
        : !!(allapotVagyBool && allapotVagyBool.botAktiv && allapotVagyBool.botGondolkodik && !allapotVagyBool.vege);

    if (gondolkodik) thinkingElem.classList.remove('hidden');
    else thinkingElem.classList.add('hidden');
}

function audioContextKeres() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
}

function hangObjektumKeres(hangKulcs) {
    if (hangCache[hangKulcs]) return hangCache[hangKulcs];
    const fajl = HANG_FAJLOK[hangKulcs];
    if (!fajl) return null;
    const audio = new Audio(fajl);
    audio.preload = 'auto';
    hangCache[hangKulcs] = audio;
    return audio;
}

function hangLejatszas(hangKulcs, fallbackFreq = 620, fallbackMs = 90, fallbackGain = 0.03) {
    const hang = hangObjektumKeres(hangKulcs);
    if (!hang) {
        pittyen(fallbackFreq, fallbackMs, fallbackGain);
        return;
    }

    hang.currentTime = 0;
    const playPromise = hang.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
            pittyen(fallbackFreq, fallbackMs, fallbackGain);
        });
    }
}

function pittyen(freq, durationMs, gain = 0.03) {
    const ctx = audioContextKeres();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const start = ctx.currentTime;
    const end = start + (durationMs / 1000);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start);

    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
}

function lepesHangLejatszas(allapot) {
    if (!allapot || !allapot.utolsoLepes) return;

    const l = allapot.utolsoLepes;
    const kulcs = `${allapot.lepesszam}:${l.from.x},${l.from.y}->${l.to.x},${l.to.y}`;
    if (kulcs === utolsoHangLepesKulcs) return;
    utolsoHangLepesKulcs = kulcs;

    if (allapot.vege) {
        hangLejatszas('matt', 350, 180, 0.04);
        return;
    }

    if (allapot.sakkPoz) {
        hangLejatszas('sakk', 900, 90, 0.035);
        return;
    }

    if (l.special === 'castle-ks' || l.special === 'castle-qs') {
        hangLejatszas('sanc', 560, 120, 0.03);
        return;
    }

    const lepoSzin = allapot.koronLevo === 'white' ? 'black' : 'white';
    const botLepett = !!(allapot.botAktiv && allapot.botSzin === lepoSzin);
    hangLejatszas(botLepett ? 'ellenfelLep' : 'jatekosLep', 620, 90, 0.03);
}

function allapotLepesKulcs(allapot) {
    if (!allapot || !allapot.utolsoLepes) return null;
    const l = allapot.utolsoLepes;
    return `${allapot.lepesszam}:${l.from.x},${l.from.y}->${l.to.x},${l.to.y}`;
}

function botLepesAnimacioKell(elozoAllapot, ujAllapot) {
    if (!elozoAllapot || !ujAllapot) return false;
    if (!ujAllapot.utolsoLepes) return false;
    if (ujAllapot.lepesszam === elozoAllapot.lepesszam) return false;

    // Az utolsó lépést az a szín tette meg, aki NEM körön lévő az új állapotban.
    const lepoSzin = ujAllapot.koronLevo === 'white' ? 'black' : 'white';
    return !!(ujAllapot.botAktiv && ujAllapot.botSzin === lepoSzin);
}

// Bármely új lépés (saját vagy ellenfél) történt-e az előző állapot óta.
function ujLepesTortent(elozoAllapot, ujAllapot) {
    if (!ujAllapot || !ujAllapot.utolsoLepes) return false;
    if (!elozoAllapot) return false;
    return ujAllapot.lepesszam !== elozoAllapot.lepesszam;
}

function lepesKuldesIndit() {
    lepesKuldesFolyamatban = true;
    if (lepesKuldesFailSafeTimer) clearTimeout(lepesKuldesFailSafeTimer);
    lepesKuldesFailSafeTimer = setTimeout(async () => {
        lepesKuldesFolyamatban = false;
        try {
            if (!gameId) return;
            const allapot = await apiAllapot();
            allapotFrissit(allapot);
        } catch (_) {
            // A normál poll tovább próbálkozik.
        }
    }, 10000);
}

function lepesKuldesLezar() {
    lepesKuldesFolyamatban = false;
    if (lepesKuldesFailSafeTimer) {
        clearTimeout(lepesKuldesFailSafeTimer);
        lepesKuldesFailSafeTimer = null;
    }
}

// ────────────────────────────────────────────

function allapotFrissit(allapot, animald = false) {
    const elozoAllapot = utolsoAllapot;
    utolsoAllapot = allapot;
    kivalasztott = null;
    try { if (appObserver) appObserver.disconnect(); } catch(e) {}
    oldalVazVisszaallit();
    tablaRajzol(allapot, pvpAktiv && sajatSzin === 'black');
    const automataAnimacio = ujLepesTortent(elozoAllapot, allapot);
    if ((animald || automataAnimacio) && allapot.utolsoLepes) {
        const animKulcs = allapotLepesKulcs(allapot);
        if (animKulcs && animKulcs !== utolsoAnimaltLepesKulcs) {
            utolsoAnimaltLepesKulcs = animKulcs;
            slidingFolyamatban = true;
            Promise.resolve(lepesAnimacio(allapot.utolsoLepes)).finally(() => {
                slidingFolyamatban = false;
            });
        }
    }
    lepesHangLejatszas(allapot);
    huzasHozzaadMinden(allapot);
    esemenyekUjraKot();
    nevekFrissit();
    eloValtozasFrissit(allapot.eloValtozas || null);
    botGondolkodasFrissit(allapot);
    abilitiesAllapotFrissit(allapot);

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
        "#bot-thinking",
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
        if (huzasFolyamatban || helyreallitasFut || lepesKuldesFolyamatban || slidingFolyamatban) return;
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
        if (huzasFolyamatban || helyreallitasFut || lepesKuldesFolyamatban || slidingFolyamatban) return;
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
        if (botPollTimer) return;
        if (huzasFolyamatban || lepesKuldesFolyamatban || slidingFolyamatban) return;
        try {
            const elozoAllapot = utolsoAllapot;
            const allapot = await apiAllapot();
            utolsoAllapot = allapot;
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
    if (botPollTimer) {
        clearInterval(botPollTimer);
        botPollTimer = null;
    }

    let egymasUtanHibak = 0;
    botPollTimer = setInterval(async () => {
        if (!gameId) {
            clearInterval(botPollTimer);
            botPollTimer = null;
            return;
        }
        if (slidingFolyamatban) return;
        try {
            const elozoAllapot = utolsoAllapot;
            const allapot = await apiAllapot();
            utolsoAllapot = allapot;
            egymasUtanHibak = 0;
            botGondolkodasFrissit(allapot);
            if (!allapot.botGondolkodik) {
                clearInterval(botPollTimer);
                botPollTimer = null;
                allapotFrissit(allapot, true);
                if (allapot.vege && allapot.uzenet) {
                    jatekVegeUI(allapot.uzenet);
                    idoPollingLeall();
                }
            }
        } catch (e) {
            egymasUtanHibak++;
            if (egymasUtanHibak >= 5) {
                // Ne álljon meg teljesen: visszaesünk a normál pollra.
                clearInterval(botPollTimer);
                botPollTimer = null;
            }
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
            if (botPollTimer) {
                clearInterval(botPollTimer);
                botPollTimer = null;
            }
            gameId = null;
            botInfo = null;
            utolsoAllapot = null;
            lepesKuldesLezar();
            pvpAllapotReset();
            eloValtozasFrissit(null);
            modValasztoMegjelenit();
        });
    }

    // Döntetlen ajánlat gomb (csak PvP-ben)
    const drawBtn = document.getElementById("drawOfferBtn");
    if (drawBtn) {
        const ujBtn = drawBtn.cloneNode(true);
        drawBtn.parentNode.replaceChild(ujBtn, drawBtn);
        if (pvpAktiv && utolsoAllapot && !utolsoAllapot.vege) {
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
                if (pvpAktiv) {
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

    // Oldal bezárás — bot játéknál surrender API, PvP-ben a server grace period kezeli
    window.addEventListener('beforeunload', () => {
        if (pvpAktiv) return; // PvP-ben a socket disconnect + grace period kezeli
        if (gameId && utolsoAllapot && !utolsoAllapot.vege) {
            fetch(`/api/chess/${gameId}/surrender`, { method: 'POST', keepalive: true });
        }
    });

    // Socket init + PvP handler regisztráció
    pvpSocketInit();

    // Rejoin próba — ha van aktív PvP játék, visszacsatlakozik
    setTimeout(() => {
        const socket = pvpSocketKeres();
        if (socket && socket.connected) {
            socket.emit('chess:rejoin');
            pendingChessInviteAcceptKuld(socket);
        } else if (socket) {
            socket.once('connect', () => {
                socket.emit('chess:rejoin');
                pendingChessInviteAcceptKuld(socket);
            });
        }
    }, 500);

    // Játékmód választó megjelenítés
    modValasztoMegjelenit();
}

// ────────────────────────────────────────────
// DRAG & DROP — mousedown/mousemove/mouseup
// ────────────────────────────────────────────

function huzasHozzaadMinden(allapot) {
    // PvP turn enforcement: ha nem a saját szín van soron, egyik bábu sem húzható
    if (pvpAktiv && allapot.koronLevo !== sajatSzin) {
        console.log('[PvP] turn enforce blokk', { koronLevo: allapot.koronLevo, sajatSzin });
        // Click-to-move se működjön (kivalasztott nulláz)
        kivalasztott = null;
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
        if (pvpAktiv && mezo.piece.color !== sajatSzin) continue;

        // Csak a körön lévő bábuit lehet húzni
        if (mezo.piece.color !== allapot.koronLevo) continue;

        huzasHozzaad(babuElem, x, y, mezo.piece, allapot);
    }

    // Click-to-move: mousedown üres/ellenfél mezőre → lépés a kijelölttel
    const mezok = document.querySelectorAll(".square");
    for (let i = 0; i < mezok.length; i++) {
        mezok[i].addEventListener("mousedown", function (e) {
            if (isAbilityArmed()) return; // képesség célpont-választás folyamatban
            if (!kivalasztott || lepesKuldesFolyamatban) return;

            // Drag folyamat közben ne kezeljünk click-to-move-ot.
            if (huzasFolyamatban) return;

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
        if (allapot.vege || lepesKuldesFolyamatban) return;

        e.preventDefault();
        e.stopPropagation();

        // Ha már van kijelölt és ERRE a mezőre kattintunk mint célmező (ütés)
        if (kivalasztott && kivalasztott.piece.color !== piece.color) {
            kattintasLep(fromX, fromY);
            return;
        }

        // Ha ugyanarra a bábura kattintunk: kijelölés törlése
        if (kivalasztott && kivalasztott.x === fromX && kivalasztott.y === fromY) {
            kivalasztasTorol();
            return;
        }

        mozgott = false;

        // Kijelölés beállítása (click-to-move)
        kivalasztasTorol();
        kivalasztott = { x: fromX, y: fromY, piece, lepesek: null };
        const mezoElem = babuElem.parentElement;
        mezoElem.classList.add("selected");

        // A drag ne várjon szerverre: a lépéslistát aszinkron kérjük le a click-to-move bogyókhoz.
        const lepesekPromise = pvpAktiv
            ? pvpLegalisLepesKeres(fromX, fromY)
            : apiLepesek(fromX, fromY);
        lepesekPromise
            .then(lepesek => {
                if (!kivalasztott) return;
                if (kivalasztott.x !== fromX || kivalasztott.y !== fromY) return;
                kivalasztott.lepesek = lepesek;
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
            huzasFolyamatban = true;

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
                huzasFolyamatban = false;
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

/**
 * Kijelölés törlése (selected class + bogyók eltávolítása)
 */
function kivalasztasTorol() {
    kivalasztott = null;
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
            if (pvpAktiv) {
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

/**
 * Click-to-move: lépés a kijelölt bábuval a célmezőre
 */
async function kattintasLep(toX, toY) {
    if (!kivalasztott || lepesKuldesFolyamatban) return;
    const { x: fromX, y: fromY, piece, lepesek } = kivalasztott;

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
    if (pvpAktiv) {
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
        if (utolsoAllapot) allapotFrissit(utolsoAllapot);
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
    if (pvpAktiv) {
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
        if (utolsoAllapot) allapotFrissit(utolsoAllapot);
    } finally {
        lepesKuldesLezar();
    }
}

// Start!
window.addEventListener("DOMContentLoaded", init);
