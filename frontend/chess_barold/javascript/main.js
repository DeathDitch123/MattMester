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

// Manualis flip-toggle state — a setting auto-flip felulirhato manualisan.
let manualisFlipFelulirva = null; // null = auto-flip kovetkezik, true/false = manualis

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
// A bejelentkezett felhasznalo username-je — bot/lokal meccsen is ezt mutatjuk
// a `name-white` mezoben (nem a kemenykodolt "Te"-t). Init-kor toltodik fel
// `/api/sessionInfo`-bol; ha nincs session (vendeg), 'Te' marad fallback-nek.
let sajatUsername = null;
let pvpSocket = null;              // Socket.io kliens (globális window.io())
let kliensIdoTimer = null;         // kliens-oldali óra countdown (csak megjelenítés)
let varakozoLepesPromisek = [];    // chess:moves:response Promise-ek

// Hang lejátszás → audio.js modulba kiemelve. A lepesHangLejatszas() es a
// teljes audio-kontextus + cache + dedup ott él, ide csak importáljuk.
const DRAG_START_THRESHOLD_PX = 6;


// ────────────────────────────────────────────
// API HÍVÁSOK
// ────────────────────────────────────────────

// Hot-seat (lokális 2-játékos) endpoint TÖRÖLVE — a backend `/api/chess/new`
// endpoint nincs többé. Csak bot meccs és PvP socket-en keresztül lehet játszani.

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

async function apiUjBotJatek(difficulty, mode, ranked) {
    const body = { difficulty };
    if (mode) body.mode = mode;
    if (typeof ranked === 'boolean') body.ranked = ranked;
    const res = await fetch('/api/chess/new-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hiba');
    gameId = data.gameId;
    botInfo = data.botInfo;
    return data.allapot;
}

// apiModes / apiNehezsegek / apiUserElo torolve — csak a regi (mostmar torolt)
// modValasztoMegjelenit hasznalta. A frontpage chessModeChooser sajat fetch-ekkel hivja.

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

// Az aktuális kiválasztott mód + ranked flag (a teljes modal-flow-ban használt).
let selectedMode = null;
let selectedRanked = true;

// Az új (frontpage) chooser megnyitása. Ha valamiért nem érhető el (script load
// hiba vagy timing race), fallback: visszairányítás az index oldalra.
function ujMeccsChooserNyitas() {
    const chooser = window.MattMesterChessModeChooser;
    if (chooser && typeof chooser.open === 'function') {
        chooser.open();
        return;
    }
    window.location.href = '/';
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
        rematchUiReset('Az ellenfél elutasította a revanst.');
        rematchBejovoModal(false);
    });
    socket.on('chess:rematch:expired', () => {
        rematchUiReset('A revans lejárt.');
        rematchBejovoModal(false);
    });
    socket.on('chess:rematch:cancelled', () => {
        rematchUiReset('A revans érvénytelen — ellenfél kilépett.');
        rematchBejovoModal(false);
    });
    socket.on('chess:rematch:error', (data) => {
        rematchUiReset((data && data.uzenet) || 'Revans hiba');
        rematchBejovoModal(false);
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
        // Custom HTML modal a natív alert() helyett (memoria-szabaly).
        if (typeof window.mmAlert === 'function') {
            window.mmAlert({ title: 'PvP hiba', message: data.uzenet || 'Ismeretlen hiba.' });
        }
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
        if (typeof window.mmAlert === 'function') {
            window.mmAlert({ title: 'Meghívás elutasítva', message: 'Az ellenfél elutasította a meghívást.' });
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

    // Rejoin — ha nincs játék, nincs teendő. KIVÉVE: ha a frontpage chooser
    // pendingMatch flag-gel ide-küldte a felhasználót de a backend nem talál
    // aktív meccset (pl. meccs közben befejeződött), nyissuk meg az UJ chooser-t,
    // különben a user üres oldalon ragadna.
    // FONTOS: ha az URL-ben van `?type=bot|pvp`, a bot/pvp init-flow eppen
    // most letrehozza a meccset — ne nyissuk meg a chooser-t, mert csak villanna
    // egyet feleslegesen.
    socket.on('chess:rejoin:none', () => {
        if (pvpAktiv) return;
        if (gameId) return; // mar van bot/pvp meccs folyamatban
        try {
            const params = new URLSearchParams(window.location.search);
            const t = params.get('type');
            if (t === 'bot' || t === 'pvp') return;
        } catch (_) { /* ignore */ }
        ujMeccsChooserNyitas();
    });
}

let pvpGameId = null;

function pvpJatekKezdet(data) {
    console.log('[PvP] game:start', { sajatSzin: data.sajatSzin, sajatNev: data.sajatNev, ellenfelNev: data.ellenfelNev, gameId: data.gameId });
    // PVP overlay-k elrejtese (a regi #mode-modal HTML mar nincs, ne keressuk).
    const waiting = document.getElementById('pvp-waiting');
    const popup = document.getElementById('pvp-invite');
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
        getGameId: () => pvpGameId,
        getSzin:   () => sajatSzin,
        isPvp:     () => true,
        getSocket: () => pvpSocketKeres()
    }).then(() => abilitiesAllapotFrissit(data.allapot));

    // Ingame chat aktivalas — csak PvP-n. Bot meccsen nincs ertelme.
    chatPanelMutat();
    chatPanelEnged(true);
    chatMessagesUrites();
}

// Eldonti hogy flippelve renderelje-e a tablat: manualis felulir > auto-flip
// setting + sajat szin. Ha a manualis nincs allitva, a setting + sajat szin alapjan.
function kellFlippelni() {
    if (manualisFlipFelulirva !== null) return manualisFlipFelulirva;
    let autoflip = true;
    try { autoflip = getChessSettings().autoflip !== false; } catch (e) { autoflip = true; }
    return autoflip && pvpAktiv && sajatSzin === 'black';
}

function pvpAllapotFrissit(allapot) {
    const elozoAllapot = utolsoAllapot;
    utolsoAllapot = allapot;
    kivalasztott = null;
    try { if (appObserver) appObserver.disconnect(); } catch (e) {}
    oldalVazVisszaallit();
    tablaRajzol(allapot, kellFlippelni());
    renderMoveList(allapot);

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
    const rematchBtn = document.getElementById('rematchBtn');
    const offerElem = document.getElementById('draw-offer-received');
    const dcElem = document.getElementById('opponent-disconnected');
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
    if (dcElem) dcElem.classList.add('hidden');
    if (window._dcInterval) {
        clearInterval(window._dcInterval);
        window._dcInterval = null;
    }
}

// N13 — rematch UI segedfuggvenyek
function rematchUiVarakozas() {
    const rematchBtn = document.getElementById('rematchBtn');
    if (rematchBtn) {
        rematchBtn.disabled = true;
        rematchBtn.textContent = 'Várakozás az ellenfélre...';
    }
}
function rematchUiReset(uzenet) {
    const rematchBtn = document.getElementById('rematchBtn');
    if (rematchBtn) {
        rematchBtn.disabled = false;
        rematchBtn.textContent = 'Revans';
    }
    if (uzenet) {
        const statusElem = document.getElementById('status');
        if (statusElem) {
            const eredeti = statusElem.textContent;
            statusElem.textContent = uzenet;
            setTimeout(() => {
                if (statusElem.textContent === uzenet) statusElem.textContent = eredeti;
            }, 3000);
        }
    }
}
function rematchBejovoModal(mutat, gameId) {
    const modal = document.getElementById('rematch-offer-modal');
    if (!modal) return;
    if (mutat) {
        modal.dataset.gameId = String(gameId || '');
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
        delete modal.dataset.gameId;
    }
}

// Rematch gomb + bejovo modal kotsei. Csak egyszer hivodik az init()-bol.
function rematchEsemenyekKot() {
    const rematchBtn = document.getElementById('rematchBtn');
    if (rematchBtn) {
        rematchBtn.addEventListener('click', () => {
            const socket = pvpSocketKeres && pvpSocketKeres();
            if (!socket || !socket.connected) {
                rematchUiReset('Nincs kapcsolat a szerverrel.');
                return;
            }
            const targetGameId = (utolsoAllapot && utolsoAllapot.gameId) || pvpGameId;
            socket.emit('chess:rematch:offer', { gameId: targetGameId });
            rematchUiVarakozas();
        });
    }
    const acceptBtn = document.getElementById('rematchAcceptBtn');
    const declineBtn = document.getElementById('rematchDeclineBtn');
    const modal = document.getElementById('rematch-offer-modal');
    if (acceptBtn) {
        acceptBtn.addEventListener('click', () => {
            const socket = pvpSocketKeres && pvpSocketKeres();
            const gid = modal && modal.dataset.gameId ? Number(modal.dataset.gameId) : null;
            rematchBejovoModal(false);
            if (socket && socket.connected && gid) {
                socket.emit('chess:rematch:accept', { gameId: gid });
            }
        });
    }
    if (declineBtn) {
        declineBtn.addEventListener('click', () => {
            const socket = pvpSocketKeres && pvpSocketKeres();
            const gid = modal && modal.dataset.gameId ? Number(modal.dataset.gameId) : null;
            rematchBejovoModal(false);
            if (socket && socket.connected && gid) {
                socket.emit('chess:rematch:decline', { gameId: gid });
            }
        });
    }
    // Overlay-klikk = decline (custom modal pattern, nem natív confirm).
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal && declineBtn) declineBtn.click();
        });
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

        // Vegtelen idős mod (ido[szin] === null vagy === Infinity) eseten
        // nem csokkentunk, kulonben NaN lenne. Csak akkor decrementaljuk,
        // ha tenylegesen szam.
        if (Number.isFinite(utolsoAllapot.ido[aktivSzin])) {
            utolsoAllapot.ido[aktivSzin] = Math.max(0, utolsoAllapot.ido[aktivSzin] - 1);
        }

        const format = (mp) => {
            // null / undefined / Infinity / NaN -> '∞' (idotlen meccs).
            // A masik formattol (UI-megjelenites.js) eltérően itt is kezelni
            // kell, kulonben '0:00' jelenne meg az ora-ticken.
            if (mp === null || mp === undefined || !Number.isFinite(mp)) return '∞';
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

async function jatekIndit(nehezseg, mode, ranked, modal) {
    try {
        const allapot = await apiUjBotJatek(nehezseg, mode, ranked);

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
            getSocket: () => null,
            // REST ability response: a teljes új allapot-ot átfuttatjuk a fő
            // állapot-frissítőn, hogy a tábla, óra és ability bar mind szinkron legyen.
            onAllapotValtozas: (uj) => allapotFrissit(uj)
        });
        abilitiesAllapotFrissit(allapot);

        console.log(`[INIT] Bot játék indítva — ${botInfo.nev} (ELO: ${botInfo.elo}) — mode=${allapot.mode || mode || 'default'}, ranked=${allapot.ranked}`);
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
        // Bot = fekete. A jatekos nev: ha be van jelentkezve (sajatUsername),
        // a username-jet, kulonben "Te" fallback. A korabbi keménykódolt "Te"
        // helyett (lasd 2026-05-04 user-feedback).
        if (nameBlack) nameBlack.textContent = `🤖 ${botInfo.nev} (${botInfo.elo})`;
        if (nameWhite) nameWhite.textContent = sajatUsername || 'Te';
    } else {
        if (nameBlack) nameBlack.textContent = "Fekete";
        if (nameWhite) nameWhite.textContent = sajatUsername || "Fehér";
    }
}

// Bejelentkezett felhasznalo username-jenek lekerese a session API-bol.
// Egyszer fut le init-kor; idempotens, ha mar van `sajatUsername`, nem hivja
// ujra. Ha nincs session (vendeg / hiba), null marad — a fallback "Te" /
// "Fehér" jelzes lep ervenybe.
async function sajatUsernameKeres() {
    if (sajatUsername) return sajatUsername;
    try {
        const utils = window.MattMesterUtils;
        if (!utils || typeof utils.fetchSessionInfo !== 'function') return null;
        const data = await utils.fetchSessionInfo();
        if (data && data.loggedIn && data.user && typeof data.user.username === 'string') {
            sajatUsername = data.user.username;
            // Ha mar fut egy meccs es a "Te" placeholder lathato, frissitsuk
            // azonnal — nem kell uj jatekot indítani a username-ert.
            try { nevekFrissit(); } catch (_) {}
            return sajatUsername;
        }
    } catch (err) {
        console.warn('[chess] username fetch hiba:', err);
    }
    return null;
}

function utottpiecekFrissit(allapot) {
    const byWhite = document.getElementById('captured-by-white');
    const byBlack = document.getElementById('captured-by-black');
    if (!byWhite || !byBlack || !allapot?.tabla) return;

    const KEZDO = { pawn: 8, rook: 2, knight: 2, bishop: 2, queen: 1, king: 1 };
    const SORREND = ['queen', 'rook', 'bishop', 'knight', 'pawn'];

    const meglevo = { white: {}, black: {} };
    for (const m of allapot.tabla) {
        if (!m.piece) continue;
        const c = m.piece.color, t = m.piece.type;
        meglevo[c][t] = (meglevo[c][t] || 0) + 1;
    }

    function utottLista(utottSzin) {
        const lista = [];
        for (const tipus of SORREND) {
            const meglevoDb = meglevo[utottSzin][tipus] || 0;
            const hianyzik = KEZDO[tipus] - meglevoDb;
            for (let i = 0; i < hianyzik; i++) lista.push(tipus);
        }
        return lista;
    }

    function render(el, utottSzin) {
        const lista = utottLista(utottSzin);
        el.innerHTML = '';
        for (const tipus of lista) {
            const img = document.createElement('div');
            img.className = 'captured-piece';
            img.style.backgroundImage = `url('../images/${utottSzin}_${tipus}.png')`;
            el.appendChild(img);
        }
    }

    // fehér játékos ütötte a fekete bábukat → captured-by-white mutatja a fekete bábukat
    render(byWhite, 'black');
    render(byBlack, 'white');

    // Right-side captured panel — nagyobb meretu icon-ok, ket szegmens.
    // A "sajat alul" szabaly: a sajat szin alul, az ellenfel felul kerul.
    // Mindkettonek elotte a username (ha bot, "Te" / bot-nev).
    capturedPanelFrissit(allapot, utottLista);

    // Material advantage (anyagi elony) — standard babu-pontok alapjan
    // szamoljuk, ki nyer az utesekben (kiraly nem szamit, mert mate-tel
    // veget er a meccs). A `+N` cimke csak a vezeto oldalan jelenik meg,
    // a masik oldalon `hidden`. Ha egyenlo (vagy nincs ütott bábu), mindketto
    // rejtett — igy nem zavar 0:0-rol felesleges UI-elem.
    const PIECE_VALUES = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 };
    const sumValues = (utottList) => utottList.reduce((acc, t) => acc + (PIECE_VALUES[t] || 0), 0);
    const blackUtottek = utottLista('black'); // amit a fehér ütött
    const whiteUtottek = utottLista('white'); // amit a fekete ütött
    const whiteScore = sumValues(blackUtottek);
    const blackScore = sumValues(whiteUtottek);
    const matWhiteEl = document.getElementById('material-white');
    const matBlackEl = document.getElementById('material-black');
    if (matWhiteEl && matBlackEl) {
        const diff = whiteScore - blackScore;
        matWhiteEl.classList.toggle('hidden', diff <= 0);
        matBlackEl.classList.toggle('hidden', diff >= 0);
        if (diff > 0) matWhiteEl.textContent = `+${diff}`;
        if (diff < 0) matBlackEl.textContent = `+${-diff}`;
    }
}

// Right-side captured panel renderer — a leütött bábukat nagyobb meretben
// mutatja ket szekcioban. "Sajat alul" szabaly:
//   - bottom = `mySzin` szin altal leutott bábuk (= ellen szin szinet)
//   - top    = ellenfel altal leutott bábuk (= my szin szinét)
// Bot-meccsen `name-mine` = sajatUsername (ha bejelentkezett), `name-opp` =
// `🤖 ${botInfo.nev}`. PvP-n a `pvpJatekosNevek`-bol jonnek a nevek.
function capturedPanelFrissit(allapot, utottListaFn) {
    const opp = document.getElementById('captured-pieces-opp');
    const mine = document.getElementById('captured-pieces-mine');
    const oppName = document.getElementById('captured-name-opp');
    const mineName = document.getElementById('captured-name-mine');
    if (!opp || !mine) return;

    // mySzin: PvP-n `sajatSzin`, bot-on a jatekos = white (botSzin = black)
    const mySzin = sajatSzin || (allapot && allapot.botSzin ? (allapot.botSzin === 'white' ? 'black' : 'white') : 'white');
    const oppSzin = mySzin === 'white' ? 'black' : 'white';

    // Captured listak: amit a `mySzin` jatekos leutott (= `oppSzin` szinu babuk)
    // mine alul jelenik meg, az ellenfel altal leutottek (= `mySzin` szinu babuk) felul.
    const mineUtottList = utottListaFn(oppSzin); // amit mi utottunk (ellen szinu)
    const oppUtottList  = utottListaFn(mySzin);  // amit ellenfel utott (mi szinunk)

    function renderBig(el, lista, lostPieceColor) {
        el.innerHTML = '';
        for (const tipus of lista) {
            const div = document.createElement('div');
            div.className = 'captured-big-piece';
            div.style.backgroundImage = `url('../images/${lostPieceColor}_${tipus}.png')`;
            div.title = tipus;
            el.appendChild(div);
        }
    }

    // mineUtottList = ellen szinu babuk amit mi vittunk -> `oppSzin` szinu kepek
    renderBig(mine, mineUtottList, oppSzin);
    // oppUtottList = my szinu babuk amit az ellen vitt -> `mySzin` szinu kepek
    renderBig(opp, oppUtottList, mySzin);

    // Nev cimke beirasa — sajatUsername / botInfo / pvpJatekosNevek alapjan.
    if (mineName) {
        mineName.textContent = sajatUsername || (pvpAktiv ? sajatNev : 'Te') || 'Te';
    }
    if (oppName) {
        if (pvpAktiv) {
            oppName.textContent = ellenfelNev || 'Ellenfél';
        } else if (botInfo) {
            oppName.textContent = `🤖 ${botInfo.nev}`;
        } else {
            oppName.textContent = 'Ellenfél';
        }
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
    // Ingame chat: input letiltva (a meccs vege), de az uzenetek megmaradnak
    // — a felhasznalo elolvashatja a tortenetet meg a modal-zaras elott.
    chatPanelEnged(false);
    // Auto-felugro game-end modal — matt / patt / feladas / ido kifutas
    // utan a felhasznalonak ket valasztasa van: Fololdal vagy Uj jatek.
    // A modal-on belul az Uj jatek a `chessModeChooser`-t nyitja meg
    // (ujMeccsChooserNyitas), igy a felhasznalo kivalaszthatja a kovetkezo
    // mod-ot (Mattmester / Klasszikus / Blitz stb.) ugyanazon az oldalon.
    gameEndModalMegnyit(uzenet, eloValtozas);
}

// Game-end modal megnyitas + szovegek beallitasa. A `bindGameEndModal`
// hivasa egyszer fut le init-kor, az event listener-ek innen kezelodnek.
function gameEndModalMegnyit(uzenet, eloValtozas) {
    const modal = document.getElementById('game-end-modal');
    const msgEl = document.getElementById('gameEndMessage');
    const eloEl = document.getElementById('gameEndElo');
    if (!modal) return;
    if (msgEl) msgEl.textContent = uzenet || 'Játék vége';
    if (eloEl) {
        eloEl.classList.remove('positive', 'negative');
        eloEl.textContent = '';
        if (eloValtozas && typeof eloValtozas === 'object') {
            const before = eloValtozas.eloBefore ?? eloValtozas.before;
            const after  = eloValtozas.eloAfter  ?? eloValtozas.after;
            if (typeof before === 'number' && typeof after === 'number') {
                const diff = after - before;
                const sign = diff >= 0 ? '+' : '';
                eloEl.textContent = `ELO: ${before} → ${after} (${sign}${diff})`;
                eloEl.classList.add(diff >= 0 ? 'positive' : 'negative');
            }
        }
    }
    modal.classList.remove('hidden');
}

function gameEndModalElrejt() {
    const modal = document.getElementById('game-end-modal');
    if (modal) modal.classList.add('hidden');
}

// A game-end modal gombjainak bekotese — egyszer fut le `init()`-bol.
// `Fololdal` -> sima frontpage redirect (`/`), `Uj jatek` ->
// `ujMeccsChooserNyitas()` ami a `chessModeChooser`-t nyitja meg.
function bindGameEndModal() {
    const homeBtn = document.getElementById('gameEndHomeBtn');
    const newBtn  = document.getElementById('gameEndNewGameBtn');
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            window.location.href = '/';
        });
    }
    if (newBtn) {
        newBtn.addEventListener('click', () => {
            gameEndModalElrejt();
            // Uj meccs valasztas elott a regi chat-tortenetet eldobjuk +
            // panel rejtve marad, amig a uj PvP `game:start` ujra meg nem
            // mutatja. Igy az elozo meccs uzenetei nem szivarognak at.
            chatPanelLezar();
            ujMeccsChooserNyitas();
        });
    }
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
    tablaRajzol(allapot, kellFlippelni());
    renderMoveList(allapot);
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
    utottpiecekFrissit(allapot);
    eloValtozasFrissit(allapot.eloValtozas || null);
    botGondolkodasFrissit(allapot);
    abilitiesAllapotFrissit(allapot);

    if (allapot.uzenet) {
        jatekVegeUI(allapot.uzenet);
    }
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
            // N9: move-list panel uritese, mert uj jatekot indit a felhasznalo.
            clearMoveList();
            // N11: manualis flip felulirast is reseteli, hogy a kovetkezo PvP-ben
            // visszalegyen az auto-flip viselkedes.
            manualisFlipFelulirva = null;
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

// ────────────────────────────────────────────
// INGAME CHAT (bal oldali panel) — csak PvP meccs alatt
// ────────────────────────────────────────────
//
// Backend protokoll (`chess/pvp.js`):
//   chess:chat:send  ({gameId, text})  -> csak az aktiv meccs ket jatekosatol
//   chess:chat:message ({gameId, from:{userId,color,username}, text, ts})
//   -> minden szobatag (sajat is) megkapja
//
// Lifecycle:
//   - PvP `chess:game:start` -> `chatPanelMutat()` + enable input
//   - Game-end (`jatekVegeUI`) -> `chatPanelEnged(false)` (input letiltva,
//     uzenetek megmaradnak)
//   - Uj jatek / oldal-elhagyas -> `chatPanelLezar()` (input torolve, panel rejtve)

let chatSocketBekotve = false;

function chatPanelMutat() {
    const panel = document.getElementById('ingame-chat-panel');
    if (panel) panel.classList.remove('hidden');
    // Probaljuk meg ujra bekotni a socket listener-t — init-kor lehet,
    // hogy a `pvpSocketKeres()` meg null volt (a socketClient.js aszinkron
    // tolti be a kapcsolatot). PvP game:start-kor mar megvan, igy itt
    // sikeresen latoljuk.
    if (!chatSocketBekotve) {
        const socket = pvpSocketKeres();
        if (socket && typeof socket.on === 'function') {
            socket.on('chess:chat:message', (payload) => {
                runSafelyHelper(() => chatUzenetRender(payload));
            });
            chatSocketBekotve = true;
        }
    }
}

function chatPanelElrejt() {
    const panel = document.getElementById('ingame-chat-panel');
    if (panel) panel.classList.add('hidden');
}

function chatPanelEnged(engedett) {
    const input = document.getElementById('ingame-chat-input');
    const sendBtn = document.getElementById('ingame-chat-send');
    if (input) input.disabled = !engedett;
    if (sendBtn) sendBtn.disabled = !engedett;
    if (input && !engedett) {
        // Game-end-en a meccs UTAN megmarad ami ki van irva, de uj uzenet
        // nem mehet — a placeholder ezt jelzi.
        input.placeholder = 'Chat lezárva (meccs vége).';
    } else if (input) {
        input.placeholder = 'Üzenet…';
    }
}

function chatMessagesUrites() {
    const cont = document.getElementById('ingame-chat-messages');
    if (cont) cont.innerHTML = '<div class="ingame-chat-empty">Még nincs üzenet — szólj az ellenfélnek!</div>';
}

function chatPanelLezar() {
    chatPanelEnged(false);
    chatPanelElrejt();
    chatMessagesUrites();
}

// Egy uj uzenet renderelese (sajat / ellenfel). A `from.color` alapjan
// dontjuk el, sajat oldalra (gold) vagy ellenfel oldalra (default) rajzolja.
function chatUzenetRender(payload) {
    const cont = document.getElementById('ingame-chat-messages');
    if (!cont) return;
    // Az "ures" placeholder-t kivesszuk az elso uzenet erkezesekor.
    const empty = cont.querySelector('.ingame-chat-empty');
    if (empty) empty.remove();

    const isMine = payload?.from?.color === sajatSzin;
    const div = document.createElement('div');
    div.className = `ingame-chat-msg ${isMine ? 'is-mine' : 'is-opp'}`;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'ingame-chat-msg-name';
    nameSpan.textContent = payload?.from?.username || (isMine ? 'Te' : 'Ellenfél');
    const textNode = document.createElement('span');
    // textContent — XSS-mentes, az input mar szerver-szanitalt
    textNode.textContent = payload?.text || '';
    div.appendChild(nameSpan);
    div.appendChild(textNode);
    cont.appendChild(div);
    // Auto-scroll a legujabb uzenetre (sima behavior csillapitja a jumpot).
    cont.scrollTop = cont.scrollHeight;
}

function bindChatPanel() {
    const form = document.getElementById('ingame-chat-form');
    const input = document.getElementById('ingame-chat-input');
    if (!form || !input) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = (input.value || '').trim();
        if (!text || !pvpAktiv || !pvpGameId) return;
        const socket = pvpSocketKeres();
        if (!socket) return;
        socket.emit('chess:chat:send', { gameId: pvpGameId, text });
        input.value = '';
    });

    // Socket listener — egyszer kotjuk; ha az `pvpSocketKeres()` (ami a
    // window.MattMesterSocket.socket-et adja) elerheto, csatolunk hozza
    // egy uzenet listener-t. Ha meg nem, `chatSocketBekotve` false marad
    // es a kovetkezo `bindChatPanel` hivasnal megprobalja megint.
    if (!chatSocketBekotve) {
        const socket = pvpSocketKeres();
        if (socket && typeof socket.on === 'function') {
            socket.on('chess:chat:message', (payload) => {
                runSafelyHelper(() => chatUzenetRender(payload));
            });
            chatSocketBekotve = true;
        }
    }
}

function runSafelyHelper(fn) {
    try { fn(); } catch (err) { console.warn('[chat] handler hiba:', err); }
}

// Segitseg modal handler — `#helpFloatingBtn` -> `#help-modal` toggle.
// Custom HTML modal (NEM natív alert/confirm), ESC + overlay-klikk + `×` zar.
function bindHelpModal() {
    const modal = document.getElementById('help-modal');
    const openBtn = document.getElementById('helpFloatingBtn');
    const closeBtn = document.getElementById('helpModalClose');
    const overlay = modal ? modal.querySelector('.help-modal-overlay') : null;
    if (!modal || !openBtn || !closeBtn) return;

    const open = () => modal.classList.remove('hidden');
    const close = () => modal.classList.add('hidden');

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    if (overlay) overlay.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
    });
}

async function init() {
    console.log("[INIT] Mattmester indítás...");

    // N10: kliens-oldali beallitasok betoltese + modal-bind. localStorage perszisztencia,
    // try-catch a settings.js-ben kezeli az incognito sandboxot.
    try { initChessSettings(); } catch (e) { console.warn('settings init hiba:', e); }

    // Segitseg (jelmagyarazat) modal kotese — bal-also `?` gombbal nyilik.
    // A modal background-ra (overlay) vagy a `×` zar gombra klikk + Escape
    // billentyu mind zarja. Ugyanaz a custom modal pattern mint a settings.
    bindHelpModal();

    // Game-end modal kotese (Fololdal / Uj jatek) — egyszer kotjuk az event
    // listener-eket, a modal megnyitasat a `jatekVegeUI` triggerelheti
    // dinamikusan.
    bindGameEndModal();

    // Ingame chat — input + form bind. Socket listener-t a `bindChatPanel`
    // belsoleg csatolja, ha a `pvpSocketKeres()` mar elerheto, kulonben a
    // pvpJatekKezdet ujrahivja.
    bindChatPanel();
    // Oldalbol elnavigaciokor a chat lezar — nincs szerver-leiratkozas
    // szukseges, mert a socket disconnect-et kovetoen sem fogadunk uzenetet.
    window.addEventListener('beforeunload', () => {
        try { chatPanelLezar(); } catch (_) {}
    });

    // Bejelentkezett username asynk lekerese (cache-elve `sajatUsername`-ben),
    // hogy a player-badge "Te" helyett a valodi nev lassek meg bot-meccsen.
    // Tűzz-es-felejts: a nevekFrissit() automatikusan hivodik a fetch utan.
    sajatUsernameKeres().catch(() => {});

    // N11: manualis flip-toggle a sidebar gombrol. A setting auto-flip felulirhato manualisan,
    // amig a felhasznalo nem klikkel ujat.
    const flipBtn = document.getElementById('flipBoardBtn');
    if (flipBtn) {
        flipBtn.addEventListener('click', () => {
            const aktualis = kellFlippelni();
            manualisFlipFelulirva = !aktualis;
            if (utolsoAllapot) {
                tablaRajzol(utolsoAllapot, kellFlippelni());
                renderMoveList(utolsoAllapot);
            }
        });
    }

    // N13: rematch gomb + bejovo offer modal eseme nykezelok.
    rematchEsemenyekKot();

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

    // Rejoin próba — ha van aktív PvP játék, visszacsatlakozik. A `chess:rejoin`
    // emit-et újra-próbáljuk amíg a socket meg nem érkezik (max ~5s), mert a
    // frontpage-rőL érkezve a meccs adatai csak a backendnél vannak — a kliensnek
    // ezt kell lekérnie a `chess:rejoin`-nal, különben az index oldalon kapott
    // `chess:game:start` event "elveszne" (már disconnect-elt socket fogadta).
    function emitRejoinWhenReady(retriesLeft = 10) {
        const socket = pvpSocketKeres();
        if (socket && socket.connected) {
            socket.emit('chess:rejoin');
            pendingChessInviteAcceptKuld(socket);
            return;
        }
        if (socket) {
            socket.once('connect', () => {
                socket.emit('chess:rejoin');
                pendingChessInviteAcceptKuld(socket);
            });
            return;
        }
        if (retriesLeft > 0) {
            setTimeout(() => emitRejoinWhenReady(retriesLeft - 1), 250);
        }
    }
    setTimeout(() => emitRejoinWhenReady(), 500);

    // Query-string alapú auto-indítás (frontpage chess mode chooser-ből):
    //   - `?type=bot&mode=X&difficulty=Y` → bot meccs azonnal (nincs modal)
    //   - egyébként ha sessionStorage-ben van pendingMatch (queue / friend
    //     invite match-et kapott a frontpage) → modal NEM jelenik meg, a
    //     `chess:rejoin` flow tölti be a meccset
    //   - különben (direkt URL látogatás vagy backwards-compat) → modal
    const params = new URLSearchParams(window.location.search);
    const autoType = params.get('type');
    const autoMode = params.get('mode');
    if (autoType === 'bot' && autoMode) {
        await initBotFromQueryParams(params);
        return;
    }

    let hasPendingMatch = false;
    try {
        const raw = window.sessionStorage.getItem('mattmester.chessPendingMatch');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.gameId && (Date.now() - (parsed.ts || 0)) < 30_000) {
                hasPendingMatch = true;
            }
            window.sessionStorage.removeItem('mattmester.chessPendingMatch');
        }
    } catch (_) { /* ignore */ }

    if (hasPendingMatch || autoType === 'pvp') {
        // PvP/pending match: a chess:rejoin / chess:game:start eventek tovabb intezik
        return;
    }

    // Játékmód választó megjelenítés — az új (frontpage) chooser-rel
    ujMeccsChooserNyitas();
}

// ────────────────────────────────────────────
// Query-paraméteres BOT auto-indítás (frontpage chooser-ből)
// ────────────────────────────────────────────
async function initBotFromQueryParams(params) {
    const mode = params.get('mode');
    const difficulty = parseInt(params.get('difficulty') || '0', 10);

    selectedMode = mode;
    selectedRanked = false; // bot MINDIG casual

    try {
        await jatekIndit(difficulty || 1, mode, false, null);
    } catch (err) {
        console.error('Bot auto-indítás hiba:', err);
        ujMeccsChooserNyitas();
    }
}

// Backwards-compat alias — projectIntegrity teszt erre is utal
async function initFromQueryParams(params) {
    return initBotFromQueryParams(params);
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
