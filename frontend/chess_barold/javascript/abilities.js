// ============================================================
// ABILITIES UI — frontend képesség gomb-bar + target select mód
// ============================================================
// A háttérlogika 100%-ban szerver-oldali. A frontend csak:
//   1. Lekéri a config-ot (ár, cooldown, max stb.) /api/chess/abilities-ből
//   2. Rendereli a gombokat #ability-bar-ba
//   3. Frissíti a pontok / cooldown / used overlay-eket szerver-állapotból
//   4. Célpont kiválasztó módra vált (freeze/swap/shield), majd küldi a request-et
//   5. Megjeleníti a board_hide overlay-t és a frozen/shielded mezők ikonjait
// ============================================================

import { mezoElemKeres } from './UI-megjelenites.js';

let cfg = null;                    // szerver-tól lekért ABILITY_CONFIG
let ctxKeret = null;               // { getGameId, getSzin, isPvp, getSocket }
let armed = null;                  // { key, lepesek: [] } — célpont-választó mód
let lastAllapot = null;            // legutolsó server allapot (effektek render-éhez)
let boardHideTimer = null;         // countdown interval
let kovetoSquareKattReg = false;   // egyszer regisztráljuk a board click handlert

const FELIRATOK = {
    time_pause: { nev: 'Időmegállítás',  rovid: 'IDŐ' },
    freeze:     { nev: 'Bábu fagyasztás', rovid: 'FAG' },
    swap:       { nev: 'Bábucsere',       rovid: 'CSE' },
    board_hide: { nev: 'Tábla eltakar',   rovid: 'TAK' },
    shield:     { nev: 'Pajzs',           rovid: 'PJZ' },
    time_steal: { nev: 'Időlopás',        rovid: 'LOP' }
};

// ──────────────────────────────────────────────────────────
// PUBLIC API
// ──────────────────────────────────────────────────────────

/**
 * @param {object} keret - { getGameId(), getSzin(), isPvp(), getSocket() }
 */
export async function abilitiesInit(keret) {
    ctxKeret = keret;
    if (!cfg) {
        try {
            const res = await fetch('/api/chess/abilities');
            const data = await res.json();
            cfg = data.config || {};
        } catch (e) {
            console.error('[abilities] config fetch hiba:', e);
            cfg = {};
        }
    }
    bemutatBartFrissit();
    boardClickReg();
}

/**
 * Server állapot frissült — frissítjük a pontokat / cooldown-okat / effekteket.
 */
export function abilitiesAllapotFrissit(allapot) {
    if (!allapot || !allapot.abilities) {
        bartElrejt();
        return;
    }
    lastAllapot = allapot;
    bartMegjelenit();
    // Ha az oldalVazVisszaallit() (main.js) közben kiürítette a gomb-konténert,
    // újrarendereljük. Ez idempotens: csak akkor render-el ha a DOM tényleg üres.
    bemutatBartFrissit();
    pontokFrissit(allapot);
    gombokFrissit(allapot);
    effektekFrissit(allapot);
    boardHideOverlayFrissit(allapot);
}

export function abilitiesReset() {
    armed = null;
    lastAllapot = null;
    bartElrejt();
    boardHideOverlayElrejt();
    hintElrejt();
    targetHintekTorol();
}

/**
 * Igaz, ha a játékos képesség-célpont kiválasztó módban van.
 * A move-handler ezt ellenőrzi, hogy ne lépjen véletlenül.
 */
export function isAbilityArmed() {
    return !!armed;
}

// ──────────────────────────────────────────────────────────
// BEMUTATÓ
// ──────────────────────────────────────────────────────────

function bartMegjelenit() {
    const bar = document.getElementById('ability-bar');
    if (bar) bar.classList.remove('hidden');
}

function bartElrejt() {
    const bar = document.getElementById('ability-bar');
    if (bar) bar.classList.add('hidden');
}

function bemutatBartFrissit() {
    const cont = document.getElementById('ability-buttons');
    if (!cont || !cfg) return;
    // Idempotens: ha már van bent ugyanannyi gomb, nem rendereljük újra
    // (a frissítést a `gombokFrissit` végzi state-update-eknél).
    const cfgKeyCount = Object.keys(cfg).length;
    if (cont.children.length === cfgKeyCount) return;
    cont.innerHTML = '';
    for (const key in cfg) {
        const c = cfg[key];
        const f = FELIRATOK[key] || { nev: key, rovid: '?' };
        const btn = document.createElement('button');
        btn.className = 'ability-btn';
        btn.dataset.key = key;
        btn.innerHTML = `
            <span class="ab-name">${f.nev}</span>
            <span class="ab-meta">
                <span class="ab-cost">${c.ar}p</span>
                <span class="ab-uses">0/${c.maxPerGame}</span>
            </span>
            <span class="ab-cooldown-overlay hidden"></span>
        `;
        btn.addEventListener('click', () => onAbilityKattintas(key));
        cont.appendChild(btn);
    }
}

function pontokFrissit(allapot) {
    const szin = ctxKeret?.getSzin?.() || (allapot.botAktiv ? 'white' : null);
    if (!szin) return;
    const ellen = szin === 'white' ? 'black' : 'white';
    const mineEl = document.getElementById('ap-mine');
    const oppEl  = document.getElementById('ap-opp');
    if (mineEl) mineEl.textContent = allapot.abilities.points[szin];
    if (oppEl)  oppEl.textContent  = allapot.abilities.points[ellen];
}

function gombokFrissit(allapot) {
    const szin = ctxKeret?.getSzin?.() || (allapot.botAktiv ? 'white' : null);
    if (!szin || !cfg) return;
    const myPoints = allapot.abilities.points[szin];
    const myCd     = allapot.abilities.cooldowns[szin] || {};
    const myUsed   = allapot.abilities.used[szin] || {};

    const gombok = document.querySelectorAll('.ability-btn');
    for (const btn of gombok) {
        const key = btn.dataset.key;
        const c = cfg[key];
        if (!c) continue;

        const cd = myCd[key] || 0;
        const used = myUsed[key] || 0;
        const enoughPts = myPoints >= c.ar;
        const onCd = cd > 0;
        const maxedOut = used >= c.maxPerGame;
        const wrongTiming = c.mikor === 'sajatKor' && allapot.koronLevo !== szin;

        // Cooldown overlay
        const overlay = btn.querySelector('.ab-cooldown-overlay');
        if (overlay) {
            if (onCd) {
                overlay.textContent = cd;
                overlay.classList.remove('hidden');
            } else {
                overlay.classList.add('hidden');
            }
        }

        // Cost színezés (jelzi ha drága)
        const costEl = btn.querySelector('.ab-cost');
        if (costEl) {
            costEl.textContent = `${c.ar}p`;
            costEl.classList.toggle('unaffordable', !enoughPts);
        }

        // Used / max
        const usesEl = btn.querySelector('.ab-uses');
        if (usesEl) usesEl.textContent = `${used}/${c.maxPerGame}`;

        // Disabled
        btn.disabled = !enoughPts || onCd || maxedOut || wrongTiming || allapot.vege;
    }
}

function effektekFrissit(allapot) {
    // Frozen + shielded mezők ikonjai
    document.querySelectorAll('.square').forEach(sq => {
        sq.classList.remove('frozen', 'shielded');
    });
    const frozen = allapot.abilities.effects.frozenPieces || [];
    for (const f of frozen) {
        const el = mezoElemKeres(f.x, f.y);
        if (el) el.classList.add('frozen');
    }
    const shielded = allapot.abilities.effects.shieldedPieces || [];
    for (const s of shielded) {
        const el = mezoElemKeres(s.x, s.y);
        if (el) el.classList.add('shielded');
    }
}

function boardHideOverlayFrissit(allapot) {
    const szin = ctxKeret?.getSzin?.() || (allapot.botAktiv ? 'white' : null);
    if (!szin) return;
    const until = allapot.abilities.effects.blockedUntilMs[szin];
    const overlay = document.getElementById('board-hide-overlay');
    const cnt = document.getElementById('board-hide-countdown');
    if (!overlay || !cnt) return;

    if (boardHideTimer) {
        clearInterval(boardHideTimer);
        boardHideTimer = null;
    }

    if (!until || until <= Date.now()) {
        overlay.classList.add('hidden');
        return;
    }

    overlay.classList.remove('hidden');
    const tick = () => {
        const remainingMs = until - Date.now();
        if (remainingMs <= 0) {
            overlay.classList.add('hidden');
            if (boardHideTimer) {
                clearInterval(boardHideTimer);
                boardHideTimer = null;
            }
            return;
        }
        cnt.textContent = Math.ceil(remainingMs / 1000);
    };
    tick();
    boardHideTimer = setInterval(tick, 200);
}

function boardHideOverlayElrejt() {
    const overlay = document.getElementById('board-hide-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (boardHideTimer) {
        clearInterval(boardHideTimer);
        boardHideTimer = null;
    }
}

// ──────────────────────────────────────────────────────────
// KÉPESSÉG AKTIVÁLÁS / TARGET SELECT
// ──────────────────────────────────────────────────────────

function onAbilityKattintas(key) {
    const c = cfg[key];
    if (!c) return;

    // Toggle: ha már armed, leszedjük
    if (armed && armed.key === key) {
        armedTorol();
        return;
    }
    if (armed) armedTorol();

    // Target nélküli ability → azonnal küldjük
    if (!c.kellCelpont && !c.kellKetCelpont) {
        kuldRequest(key, null);
        return;
    }

    // Célpont mód
    armed = { key, lepesek: [] };
    btnArmedJelolo(key, true);
    if (c.kellKetCelpont) {
        hintMutat(`${FELIRATOK[key]?.nev || key}: válassz KÉT saját bábut a táblán.`);
    } else {
        const cel = key === 'shield' ? 'saját' : 'ellenséges';
        hintMutat(`${FELIRATOK[key]?.nev || key}: válassz egy ${cel} bábut a táblán.`);
    }
    targetMezokKiemel(key);
}

function armedTorol() {
    if (armed) {
        btnArmedJelolo(armed.key, false);
        armed = null;
    }
    targetHintekTorol();
    hintElrejt();
}

function btnArmedJelolo(key, on) {
    const btn = document.querySelector(`.ability-btn[data-key="${key}"]`);
    if (btn) btn.classList.toggle('armed', !!on);
}

function hintMutat(msg) {
    const el = document.getElementById('ability-hint');
    if (el) {
        el.textContent = msg;
        el.classList.remove('hidden');
    }
}

function hintElrejt() {
    const el = document.getElementById('ability-hint');
    if (el) el.classList.add('hidden');
}

function targetMezokKiemel(key) {
    if (!lastAllapot) return;
    const szin = ctxKeret?.getSzin?.() || (lastAllapot.botAktiv ? 'white' : null);
    if (!szin) return;
    const ellen = szin === 'white' ? 'black' : 'white';

    let predicate;
    if (key === 'freeze') {
        predicate = (m) => m.piece && m.piece.color === ellen && m.piece.type !== 'king';
    } else if (key === 'shield') {
        predicate = (m) => m.piece && m.piece.color === szin && m.piece.type !== 'king';
    } else if (key === 'swap') {
        predicate = (m) => m.piece && m.piece.color === szin && m.piece.type !== 'king';
    } else {
        return;
    }

    for (const m of lastAllapot.tabla) {
        if (predicate(m)) {
            const el = mezoElemKeres(m.x, m.y);
            if (el) el.classList.add('ability-target-hint');
        }
    }
}

function targetHintekTorol() {
    document.querySelectorAll('.square.ability-target-hint').forEach(s => {
        s.classList.remove('ability-target-hint');
    });
}

function boardClickReg() {
    if (kovetoSquareKattReg) return;
    kovetoSquareKattReg = true;
    // Capture-phase mousedown — fut a normál piece/square handler ELŐTT.
    document.addEventListener('mousedown', (ev) => {
        if (!armed) return;
        const sq = ev.target.closest && ev.target.closest('.square');
        if (!sq) return;
        const x = parseInt(sq.dataset.x, 10);
        const y = parseInt(sq.dataset.y, 10);
        if (isNaN(x) || isNaN(y)) return;

        // Ne fusson le sem a drag, sem a click-to-move
        ev.preventDefault();
        ev.stopPropagation();

        const c = cfg[armed.key];
        if (c.kellKetCelpont) {
            armed.lepesek.push({ x, y });
            if (armed.lepesek.length === 1) {
                hintMutat('Most válaszd a MÁSODIK saját bábut.');
                return;
            }
            const params = { from: armed.lepesek[0], to: armed.lepesek[1] };
            const key = armed.key;
            // Az armed flag-et késleltetve töröljük, hogy a target-fázis handlerek
            // még lássák hogy "ability mód van" és visszaforduljanak.
            setTimeout(() => armedTorol(), 0);
            kuldRequest(key, params);
            return;
        }

        const params = { x, y };
        const key = armed.key;
        setTimeout(() => armedTorol(), 0);
        kuldRequest(key, params);
    }, true);
}

// ──────────────────────────────────────────────────────────
// REQUEST KÜLDÉS
// ──────────────────────────────────────────────────────────

function kuldRequest(key, params) {
    const gameId = ctxKeret?.getGameId?.();
    if (!gameId) {
        hintMutat('Nincs aktív játék.');
        return;
    }

    if (ctxKeret.isPvp && ctxKeret.isPvp()) {
        const socket = ctxKeret.getSocket?.();
        if (!socket) return;
        socket.emit('chess:ability', { gameId, key, params: params || undefined });
        return;
    }

    // Bot meccs / lokális → REST
    fetch(`/api/chess/${gameId}/ability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, params: params || undefined })
    })
        .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
        .then(({ ok, data }) => {
            if (!ok) {
                hintMutat(data.error || 'Sikertelen aktiválás.');
                return;
            }
            // Bot meccsen a REST a teljes új allapot-ot küldi vissza
            if (data.allapot) {
                abilitiesAllapotFrissit(data.allapot);
                // A main.js-nek is kell tudnia hogy a state változott (board újrarajzolás)
                if (typeof window.__abilityAllapotCallback === 'function') {
                    window.__abilityAllapotCallback(data.allapot);
                }
            }
        })
        .catch(err => {
            console.error('[abilities] REST hiba:', err);
            hintMutat('Hálózati hiba.');
        });
}
