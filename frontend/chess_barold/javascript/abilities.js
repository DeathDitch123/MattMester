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
import { kepessegHangLejatszas } from './audio.js';

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
    lefokozas:  { nev: 'Lefokozás',       rovid: 'LEF' }
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
    const elozoAllapot = lastAllapot;
    lastAllapot = allapot;
    bartMegjelenit();
    // Ha az oldalVazVisszaallit() (main.js) közben kiürítette a gomb-konténert,
    // újrarendereljük. Ez idempotens: csak akkor render-el ha a DOM tényleg üres.
    bemutatBartFrissit(allapot);
    pontokFrissit(allapot);
    gombokFrissit(allapot);
    effektekFrissit(allapot);
    boardHideOverlayFrissit(allapot);
    // Diff-alapu opponent (es sajat) ability-aktivalas detektor — flash glow +
    // hang ha az ellenfel uj kepesseget hasznalt ket allapot kozott.
    detektalUjabbAbilityHasznalat(elozoAllapot, allapot);
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
    // Az eredeti `#ability-bar` (sidebar) MAR REJTETT — a player-badge UI
    // vette at a szerepet (lasd `playerBadgeAbilitiesRender`). Ezt itt csak
    // azert tartjuk, mert a domSkeleton.js OLDAL_VAZ template raformaztat
    // az integritas-ellenorzove altal kovetelt elemekre, es a `bartMegjelenit`
    // hivasa nem dob hibat ha az elem mar hidden.
    const bar = document.getElementById('ability-bar');
    if (bar) bar.classList.add('hidden'); // mindig rejtve marad
}

function bartElrejt() {
    const bar = document.getElementById('ability-bar');
    if (bar) bar.classList.add('hidden');
    // Player-badge ability sorokat is elrejtjuk, ha az ability-mod kikapcsol.
    document.querySelectorAll('.player-abilities').forEach((el) => {
        el.innerHTML = '';
        el.classList.remove('has-buttons');
    });
}

// Player-badge (top + bottom) ability gomb-sorok renderelese.
// `mySzin` = a sajat szinem ('white' / 'black'). A masik oldal automatikusan
// az opp. A `.is-mine` osztaly clickable + cost/uses/cooldown szamlalo,
// a `.is-opp` decorativ (no click, cooldown rejtve, csak glow animaciora).
function playerBadgeAbilitiesRender(mySzin) {
    if (!cfg) return;
    const oppSzin = mySzin === 'white' ? 'black' : 'white';
    const mineCont = document.getElementById(`player-abilities-${mySzin}`);
    const oppCont  = document.getElementById(`player-abilities-${oppSzin}`);
    const cfgKeyCount = Object.keys(cfg).length;

    function renderInto(cont, isMine) {
        if (!cont) return;
        // Idempotens: ne renderejunk ujra ha mar ugyanannyi gomb van + jo classzal.
        const want = isMine ? 'is-mine' : 'is-opp';
        if (cont.children.length === cfgKeyCount && cont.classList.contains(want)) return;
        cont.classList.remove('is-mine', 'is-opp');
        cont.classList.add(want, 'has-buttons');
        cont.innerHTML = '';
        for (const key of Object.keys(cfg)) {
            const c = cfg[key];
            const f = FELIRATOK[key] || { nev: key, rovid: '?' };
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'ability-btn ability-mini-btn';
            btn.dataset.key = key;
            btn.title = `${f.nev} — ${c.ar}p`;
            btn.innerHTML = `
                <span class="ab-mini-icon">${f.rovid}</span>
                <span class="ab-mini-cost">${c.ar}p</span>
                <span class="ab-mini-uses">0/${c.maxPerGame}</span>
                <span class="ab-cooldown-overlay hidden"></span>
                <span class="ab-mini-flash" aria-hidden="true"></span>
            `;
            if (isMine) {
                btn.addEventListener('click', () => onAbilityKattintas(key));
            } else {
                // Opp gomb — nem klikkelheto, focus is letiltva.
                btn.disabled = true;
                btn.tabIndex = -1;
                btn.setAttribute('aria-hidden', 'true');
            }
            cont.appendChild(btn);
        }
    }

    renderInto(mineCont, true);
    renderInto(oppCont, false);
}

function bemutatBartFrissit(allapot) {
    // A regi `#ability-bar` rejtett — itt a player-badge UI rendererjet
    // hivjuk. Szukseg van `mySzin`-re ami az allapotbol/keret-bol jon.
    const szin = ctxKeret?.getSzin?.() || (allapot && allapot.botAktiv ? 'white' : null);
    if (!szin) return;
    playerBadgeAbilitiesRender(szin);
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
    const oppSzin = szin === 'white' ? 'black' : 'white';

    // Sajat oldal — clickable, full info (cost / cooldown / used).
    frissitOldalt(document.getElementById(`player-abilities-${szin}`), allapot, szin, true);
    // Ellenfel oldal — decorativ, cooldown REJTVE (opacity 0 / textcontent '').
    frissitOldalt(document.getElementById(`player-abilities-${oppSzin}`), allapot, oppSzin, false);
}

// Egy ability gomb-sor (mine/opp) frissitese a megadott allapotbol.
// `isMine === true` -> minden info latszik, click engedelyezve.
// `isMine === false` -> uses + cost is mutatva (informaciot ad), de cooldown
// szam REJTVE (a felhasznalo ne lassa pontosan, mikor lehet ujra hasznalva),
// es a gomb minden esetben disabled-el (nem nyomhato meg).
function frissitOldalt(cont, allapot, oldalSzin, isMine) {
    if (!cont || !cfg) return;
    const points = allapot.abilities.points[oldalSzin] || 0;
    const cd     = allapot.abilities.cooldowns[oldalSzin] || {};
    const used   = allapot.abilities.used[oldalSzin] || {};

    const gombok = cont.querySelectorAll('.ability-btn');
    for (const btn of gombok) {
        const key = btn.dataset.key;
        const c = cfg[key];
        if (!c) continue;

        const onCd = (cd[key] || 0) > 0;
        const usedDb = used[key] || 0;
        const enoughPts = points >= c.ar;
        const maxedOut = usedDb >= c.maxPerGame;
        const wrongTiming = c.mikor === 'sajatKor' && allapot.koronLevo !== oldalSzin;

        // Cooldown overlay — `isMine`-nal lathato szammal, opp-nal csak vizualis
        // dim (ne lassa az ellenfel pontos cooldownjat). Ezert a textContent
        // ures az opp oldalon, csak az osztaly van rajta.
        const overlay = btn.querySelector('.ab-cooldown-overlay');
        if (overlay) {
            if (onCd) {
                overlay.textContent = isMine ? String(cd[key]) : '';
                overlay.classList.remove('hidden');
                overlay.classList.toggle('is-opp-cooldown', !isMine);
            } else {
                overlay.classList.add('hidden');
                overlay.classList.remove('is-opp-cooldown');
            }
        }

        // Cost feliratot mindketto mutatja, de a `unaffordable` highlight csak
        // a sajat oldalra hat (ne zavarjon, ha az ellen nem tudja megengedni).
        const costEl = btn.querySelector('.ab-mini-cost');
        if (costEl) {
            costEl.textContent = `${c.ar}p`;
            costEl.classList.toggle('unaffordable', isMine && !enoughPts);
        }
        const usesEl = btn.querySelector('.ab-mini-uses');
        if (usesEl) usesEl.textContent = `${usedDb}/${c.maxPerGame}`;

        if (isMine) {
            btn.disabled = !enoughPts || onCd || maxedOut || wrongTiming || allapot.vege;
        } else {
            btn.disabled = true; // opp NEM klikkelheto soha
        }
    }
}

// Diff: ket allapot kozott novekedett-e barmelyik kepesseg `used` szamlaloja
// — ha igen, az adott szin imenti aktivalt kepessegere flash glow + sound.
// A `.ability-mini-btn.flash` osztaly a CSS-ben 600ms-ig animal, utana
// a setTimeout leveszi.
function detektalUjabbAbilityHasznalat(elozo, uj) {
    if (!elozo || !uj || !uj.abilities) return;
    if (!cfg) return;

    const oldalak = ['white', 'black'];
    for (const oldal of oldalak) {
        const elozoUsed = (elozo.abilities && elozo.abilities.used && elozo.abilities.used[oldal]) || {};
        const ujUsed    = uj.abilities.used[oldal] || {};
        for (const key of Object.keys(cfg)) {
            const beforeN = elozoUsed[key] || 0;
            const afterN  = ujUsed[key] || 0;
            if (afterN > beforeN) {
                flashAbilityBtn(oldal, key);
                // Az opp kepessegehez hangot is jatszunk — sajatra mar a
                // `kuldRequest` is jatszott egyet, de itt is biztositek.
                try { kepessegHangLejatszas(); } catch (_) {}
            }
        }
    }
}

function flashAbilityBtn(oldal, key) {
    const cont = document.getElementById(`player-abilities-${oldal}`);
    if (!cont) return;
    const btn = cont.querySelector(`.ability-btn[data-key="${key}"]`);
    if (!btn) return;
    btn.classList.remove('flash');
    // void offsetWidth: reflow trigger — kulonben ha gyorsan egymas utan ket
    // azonos kepesseg flash-elne, az osztaly removal-add nem jatszana ujra.
    void btn.offsetWidth;
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 650);
}

function effektekFrissit(allapot) {
    // Frozen + shielded mezők ikonjai
    document.querySelectorAll('.square').forEach(sq => {
        sq.classList.remove('frozen', 'shielded', 'demoted');
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
    const demoted = allapot.abilities.effects.demotedPieces || [];
    for (const d of demoted) {
        const el = mezoElemKeres(d.x, d.y);
        if (el) el.classList.add('demoted');
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
    } else if (key === 'lefokozas') {
        const sliding = new Set(['rook', 'bishop', 'queen']);
        predicate = (m) => m.piece && m.piece.color === ellen && sliding.has(m.piece.type);
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
        // Optimistic feedback: hangot azonnal lejatsszuk, igy a sajat
        // aktivalas mindig hallhato. A szerver visszajelzes utan, ha mas
        // jatekos hasznal kepesseget, az `abilitiesAllapotFrissit` kerul
        // hivasra (ott egy diff-alapu sound trigger hangzik el).
        try { kepessegHangLejatszas(); } catch (_) {}
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
            // Sikeres aktivalas — sajat hang. (A szerver-allapotbol nem latszik,
            // ki nyomta — ezert a sajat oldal feedback-jet itt jatszuk.)
            try { kepessegHangLejatszas(); } catch (_) {}
            // A REST a teljes új allapot-ot küldi vissza — átadjuk a main.js-nek
            // hogy a tábla, óra, ability bar mind frissüljön egy ponton.
            if (data.allapot && typeof ctxKeret.onAllapotValtozas === 'function') {
                ctxKeret.onAllapotValtozas(data.allapot);
            } else if (data.allapot) {
                abilitiesAllapotFrissit(data.allapot);
            }
        })
        .catch(err => {
            console.error('[abilities] REST hiba:', err);
            hintMutat('Hálózati hiba.');
        });
}
