// ============================================================
// CHESS ABILITIES — Képesség (skill) rendszer
// ============================================================
// A "képességes sakk" központi modulja:
//   - ABILITY_CONFIG: árak / cooldown / max-per-meccs / time-cost
//   - PIECE_VALUES: ütésért járó pont a bábu típusától
//   - abilityAktival: egyetlen belépési pont (REST + socket egyaránt ezt hívja)
//   - per-effekt handlerek: time_pause, freeze, swap, board_hide, shield, time_steal
//   - hook függvények: pontHozzaad, isMezoFagyott, isMezoVedett, isJatekosBlokkolt,
//                       cooldownTickAndCleanup, timeStealAlkalmaz
// ============================================================
// Minden szerver-oldali — a kliens semmilyen állapotot nem tart, csak request-et küld.
// A validáció (timing, pont, cooldown, max, célpont) ITT történik központilag.
// ============================================================

const { mezoKeres } = require('./state.js');
const { mezoTamadva } = require('./logika.js');
const { idoFut } = require('./timer.js');

// ── KÉPESSÉG KONFIG ──
//   ar:           pontköltség
//   cooldown:     hányadik körig nem aktiválható újra (a lépő szín körét számolja)
//   maxPerGame:   meccsenkénti hard cap
//   turnCost:     true = az aktiválás VÁLT körön (mintha lépés lett volna)
//   mikor:        'sajatKor' | 'barmikor'
//   kellCelpont:  egy mező-paraméter szükséges
//   kellKetCelpont: két mező-paraméter szükséges
const ABILITY_CONFIG = {
    time_pause: { ar: 8,  cooldown: 4, maxPerGame: 3, turnCost: false, mikor: 'sajatKor' },
    freeze:     { ar: 12, cooldown: 4, maxPerGame: 2, turnCost: false, mikor: 'sajatKor', kellCelpont: true },
    swap:       { ar: 18, cooldown: 5, maxPerGame: 2, turnCost: true,  mikor: 'sajatKor', kellKetCelpont: true },
    board_hide: { ar: 20, cooldown: 5, maxPerGame: 2, turnCost: false, mikor: 'sajatKor' },
    shield:     { ar: 10, cooldown: 4, maxPerGame: 3, turnCost: false, mikor: 'barmikor', kellCelpont: true },
    time_steal: { ar: 6,  cooldown: 3, maxPerGame: 3, turnCost: false, mikor: 'barmikor' }
};

// ── ÜTÉSÉRT JÁRÓ PONTOK ──
const PIECE_VALUES = {
    pawn:   1,
    knight: 3,
    bishop: 3,
    rook:   5,
    queen:  9,
    king:   0   // a király ütése = matt = meccs vége, nincs pont (a győzelem már a "díj")
};

// ── HATÁSIDŐK ──
const TIME_PAUSE_MS  = 8_000;   // saját óra szüneteltetése
const BOARD_HIDE_MS  = 5_000;   // ellenfél nem léphet
const TIME_STEAL_SEC = 5;       // ütésnél átkerülő másodperc

function ellenkezoSzin(szin) {
    return szin === 'white' ? 'black' : 'white';
}

// ============================================================
// VALIDÁCIÓ + KÖZPONTI BELÉPÉSI PONT
// ============================================================

/**
 * Központi ability aktiváló — REST és socket handler ugyanezt hívja.
 * @param {object} jatek
 * @param {'white'|'black'} szin
 * @param {string} key  — ability kulcs (ABILITY_CONFIG-ban kell legyen)
 * @param {object} params  — ability-specifikus paraméterek (pl. { x, y })
 * @returns {{ success: boolean, error?: string, allapotValtozas?: object }}
 */
function abilityAktival(jatek, szin, key, params) {
    if (jatek.vege)        return { success: false, error: 'A játék véget ért.' };
    if (!jatek.abilities)  return { success: false, error: 'Képességek nincsenek inicializálva.' };

    const config = ABILITY_CONFIG[key];
    if (!config) return { success: false, error: 'Ismeretlen képesség.' };

    if (szin !== 'white' && szin !== 'black') {
        return { success: false, error: 'Érvénytelen szín.' };
    }

    // Timing
    if (config.mikor === 'sajatKor' && jatek.koronLevo !== szin) {
        return { success: false, error: 'Csak a saját körödben aktiválható.' };
    }

    // Pont
    if (jatek.abilities.points[szin] < config.ar) {
        return { success: false, error: 'Nincs elég pontod.' };
    }

    // Cooldown
    const remaining = jatek.abilities.cooldowns[szin][key] || 0;
    if (remaining > 0) {
        return { success: false, error: `Cooldown alatt — ${remaining} kör.` };
    }

    // Max per meccs
    const usedCount = jatek.abilities.used[szin][key] || 0;
    if (usedCount >= config.maxPerGame) {
        return { success: false, error: 'Elérted a meccsenkénti limitet.' };
    }

    // Effekt-specifikus paraméter validáció + alkalmazás
    let result;
    switch (key) {
        case 'time_pause':  result = applyTimePause(jatek, szin); break;
        case 'freeze':      result = applyFreeze(jatek, szin, params); break;
        case 'swap':        result = applySwap(jatek, szin, params); break;
        case 'board_hide':  result = applyBoardHide(jatek, szin); break;
        case 'shield':      result = applyShield(jatek, szin, params); break;
        case 'time_steal':  result = applyTimeSteal(jatek, szin); break;
        default:            return { success: false, error: 'Nincs handler.' };
    }

    if (!result.success) return result;

    // ── Sikerült: állapot mutálás ──
    jatek.abilities.points[szin] -= config.ar;
    jatek.abilities.cooldowns[szin][key] = config.cooldown;
    jatek.abilities.used[szin][key] = usedCount + 1;

    // turnCost: a lépő szín vált (mintha rendes lépés lett volna).
    // Cleanup ugyanúgy mint normál lépésnél (cooldown decrement, lejárt effektek).
    if (config.turnCost) {
        const ujSzin = ellenkezoSzin(szin);
        cooldownTickAndCleanup(jatek, szin, ujSzin);
        jatek.koronLevo = ujSzin;
        jatek.lepesszam++;
        idoFut(jatek, jatek.koronLevo);
    }

    return { success: true };
}

// ============================================================
// PER-EFFEKT HANDLEREK
// ============================================================

function applyTimePause(jatek, szin) {
    // Saját óra szünet — addig nem tikkel mig pausedUntilMs > now.
    jatek.abilities.effects.pausedUntilMs[szin] = Date.now() + TIME_PAUSE_MS;
    return { success: true };
}

// Közös célmező-validátor freeze-hez és shield-hez.
// `tulajdonos` = 'sajat' (shield) vagy 'ellen' (freeze).
// Visszaad { success: true, mezo } vagy { success: false, error }.
function celMezoValidate(jatek, szin, params, tulajdonos) {
    if (!params || params.x == null || params.y == null) {
        return { success: false, error: 'Hiányzó célmező.' };
    }
    const mezo = mezoKeres(jatek, params.x, params.y);
    if (!mezo)        return { success: false, error: 'Érvénytelen mező.' };
    if (!mezo.piece)  return { success: false, error: 'Üres mező.' };

    const sajat = mezo.piece.color === szin;
    if (tulajdonos === 'sajat' && !sajat) {
        return { success: false, error: 'Csak saját bábura tehetsz pajzsot.' };
    }
    if (tulajdonos === 'ellen' && sajat) {
        return { success: false, error: 'Csak ellenséges bábu jegelhető.' };
    }
    return { success: true, mezo };
}

function applyFreeze(jatek, szin, params) {
    const v = celMezoValidate(jatek, szin, params, 'ellen');
    if (!v.success) return v;
    const mezo = v.mezo;

    // Király nem jegelhető (különben matt nem lenne kivédhető).
    if (mezo.piece.type === 'king') {
        return { success: false, error: 'Király nem jegelhető.' };
    }

    // Egy mezőn csak egy fagyasztás lehet egyszerre.
    if (jatek.abilities.effects.frozenPieces.some(f => f.x === mezo.x && f.y === mezo.y)) {
        return { success: false, error: 'Ez a bábu már jegelve van.' };
    }

    // A fagyasztás a CÉLPONT színének következő köréig tart — amikor a célpont
    // szín legközelebb lép, a hatás lejár (cooldownTickAndCleanup törli).
    jatek.abilities.effects.frozenPieces.push({
        x: mezo.x,
        y: mezo.y,
        ofColor: mezo.piece.color,
        untilMoveOf: mezo.piece.color
    });

    return { success: true };
}

function applySwap(jatek, szin, params) {
    if (!params || !params.from || !params.to) {
        return { success: false, error: 'Hiányzó mezők (from, to).' };
    }
    const a = mezoKeres(jatek, params.from.x, params.from.y);
    const b = mezoKeres(jatek, params.to.x,   params.to.y);
    if (!a || !b)              return { success: false, error: 'Érvénytelen mezők.' };
    if (!a.piece || !b.piece)  return { success: false, error: 'Mindkét mezőn legyen bábu.' };
    if (a.piece.color !== szin || b.piece.color !== szin) {
        return { success: false, error: 'Csak saját bábukat cserélhetsz.' };
    }
    if (a.piece.type === 'king' || b.piece.type === 'king') {
        return { success: false, error: 'Király nem cserélhető.' };
    }
    if (a === b) return { success: false, error: 'Ugyanaz a két mező.' };

    // EXPLOIT FIX #2 — jegelt bábu nem cserélhető (különben a freeze megkerülhető).
    if (isMezoFagyott(jatek, a.x, a.y) || isMezoFagyott(jatek, b.x, b.y)) {
        return { success: false, error: 'Jegelt bábut nem cserélhetsz.' };
    }

    const piA = a.piece;
    const piB = b.piece;
    // EXPLOIT FIX #1 — eredeti hasMoved-eket eltároljuk a teljes rollback-hez.
    const piAHadMoved = piA.hasMoved;
    const piBHadMoved = piB.hasMoved;

    // Csere
    a.piece = piB; piB.square = a;
    b.piece = piA; piA.square = b;
    // A castling jogot a bábuk elveszik (mintha mozogtak volna)
    piA.hasMoved = true;
    piB.hasMoved = true;

    // Self-check ellenőrzés — ha a saját király most sakkban van, visszacsinálunk.
    let kingSquare = null;
    for (let i = 0; i < jatek.tabla.length; i++) {
        const m = jatek.tabla[i];
        if (m.piece && m.piece.type === 'king' && m.piece.color === szin) {
            kingSquare = m;
            break;
        }
    }
    if (kingSquare && mezoTamadva(jatek, kingSquare.x, kingSquare.y, ellenkezoSzin(szin))) {
        // EXPLOIT FIX #1 — TELJES rollback: pozíció + hasMoved.
        a.piece = piA; piA.square = a;
        b.piece = piB; piB.square = b;
        piA.hasMoved = piAHadMoved;
        piB.hasMoved = piBHadMoved;
        return { success: false, error: 'A csere sakkba állítaná a saját királyodat.' };
    }

    // EXPLOIT FIX #3 — shield/freeze pozíció-rekordok átkötése a két mező között.
    // (Freeze itt csak akkor érintett, ha valamilyen okból ott van — a fenti check
    //  már elutasítja a jegelt mezőről induló swap-et, de a defenzív kötés ártalmatlan.)
    swapPositionRecords(jatek.abilities.effects.shieldedPieces, a, b);
    swapPositionRecords(jatek.abilities.effects.frozenPieces,   a, b);

    // Utolsó lépés frissítés (animációhoz / kiemeléshez), en passant törlés
    jatek.utolsoLepes = {
        from: { x: a.x, y: a.y },
        to:   { x: b.x, y: b.y },
        capture: false,
        special: 'swap'
    };
    jatek.enPassant = null;
    jatek.felLepes++;

    return { success: true };
}

// Két mező közötti pozíció-rekordok cseréje (swap segéd).
// A rekord-tömbben a `(a.x, a.y)`-en és `(b.x, b.y)`-en található elemek
// koordinátái cserélődnek — így pl. a shield/freeze "követi" a bábut a swap után.
function swapPositionRecords(records, a, b) {
    if (!Array.isArray(records) || records.length === 0) return;
    const aRec = records.find(r => r.x === a.x && r.y === a.y);
    const bRec = records.find(r => r.x === b.x && r.y === b.y);
    if (aRec) { aRec.x = b.x; aRec.y = b.y; }
    if (bRec) { bRec.x = a.x; bRec.y = a.y; }
}

function applyBoardHide(jatek, szin) {
    // Ellenfél a köre kezdetétől BOARD_HIDE_MS-ig nem léphet.
    // Mivel most még a mi körünkben vagyunk, az "ellenfél köre kezdődik" pillanat
    // a következő lépés alkalmazása után lesz. Ezért nem most állítjuk be, hanem
    // egy "pendingBoardHide" flag-et helyezünk el, amit az engine a turn-end-en aktivál.
    const ellen = ellenkezoSzin(szin);
    jatek.abilities.effects.blockedUntilMs[ellen] = -1; // pending marker, az engine tölti fel valódi időpontra
    return { success: true };
}

function applyShield(jatek, szin, params) {
    const v = celMezoValidate(jatek, szin, params, 'sajat');
    if (!v.success) return v;
    const mezo = v.mezo;

    if (mezo.piece.type === 'king') {
        return { success: false, error: 'Királyra nem tehető pajzs (matt különben nem lenne lehetséges).' };
    }

    if (jatek.abilities.effects.shieldedPieces.some(s => s.x === mezo.x && s.y === mezo.y)) {
        return { success: false, error: 'Ez a bábu már védett.' };
    }

    // A pajzs a védett szín következő körének VÉGÉIG tart (1 körre védi).
    jatek.abilities.effects.shieldedPieces.push({
        x: mezo.x,
        y: mezo.y,
        ofColor: mezo.piece.color,
        untilMoveOf: mezo.piece.color
    });

    return { success: true };
}

function applyTimeSteal(jatek, szin) {
    // Buff: a következő ütésednél TIME_STEAL_SEC másodperc átkerül az ellenfél órájáról.
    // Stackelhető (kétszer aktiválva 2x másodperc kerül át). Nem lejár.
    jatek.abilities.effects.pendingTimeSteal[szin] = (jatek.abilities.effects.pendingTimeSteal[szin] || 0) + 1;
    return { success: true };
}

// ============================================================
// HOOK FÜGGVÉNYEK — ezeket az engine.js / timer.js hívja
// ============================================================

/**
 * Ütésért járó pont hozzáadás. Az engine.js capture-detektálásakor hívja.
 * @returns {number} a hozzáadott pont (debug/log célból)
 */
function pontHozzaad(jatek, szin, capturedType) {
    if (!jatek.abilities) return 0;
    const ertek = PIECE_VALUES[capturedType] || 0;
    if (ertek > 0) {
        jatek.abilities.points[szin] += ertek;
    }
    return ertek;
}

/**
 * Igaz, ha a (x,y) mezőn lévő bábu fagyasztva van.
 * Az engine.js move validation hívja: ha igaz → reject.
 */
function isMezoFagyott(jatek, x, y) {
    if (!jatek.abilities) return false;
    return jatek.abilities.effects.frozenPieces.some(f => f.x === x && f.y === y);
}

/**
 * Igaz, ha a (x,y) mezőn lévő bábu pajzsos.
 * Az engine.js capture-validation hívja: ha igaz → a CAPTURE invalid.
 */
function isMezoVedett(jatek, x, y) {
    if (!jatek.abilities) return false;
    return jatek.abilities.effects.shieldedPieces.some(s => s.x === x && s.y === y);
}

/**
 * Igaz, ha az adott szín pillanatnyilag nem léphet (board_hide alatt).
 */
function isJatekosBlokkolt(jatek, szin) {
    if (!jatek.abilities) return false;
    const until = jatek.abilities.effects.blockedUntilMs[szin];
    if (!until || until < 0) return false;
    return Date.now() < until;
}

/**
 * Időlopás alkalmazása ütéskor — ha az aktuálisan lépő színnek van pendingTimeSteal-je,
 * felhasznál belőle 1-et és átköt másodperceket.
 */
function timeStealAlkalmaz(jatek, lepoSzin) {
    if (!jatek.abilities) return 0;
    const pending = jatek.abilities.effects.pendingTimeSteal[lepoSzin] || 0;
    if (pending <= 0) return 0;

    const ellen = ellenkezoSzin(lepoSzin);
    const elveheto = Math.min(TIME_STEAL_SEC, jatek.jatekosok[ellen].ido);
    if (elveheto <= 0) {
        jatek.abilities.effects.pendingTimeSteal[lepoSzin] = pending - 1;
        return 0;
    }
    jatek.jatekosok[ellen].ido -= elveheto;
    jatek.jatekosok[lepoSzin].ido += elveheto;
    jatek.abilities.effects.pendingTimeSteal[lepoSzin] = pending - 1;
    return elveheto;
}

/**
 * Turn-end takarítás — minden lepesHajt után meghívandó MIELŐTT a koronLevo váltás.
 * Paraméterek:
 *   lepoSzin: aki most lépett (a saját cooldown-jai csökkennek 1-gyel)
 *   ujSzin:   akinek most kezdődik a köre
 */
function cooldownTickAndCleanup(jatek, lepoSzin, ujSzin) {
    if (!jatek.abilities) return;

    // 1. Lépő szín cooldown-jai -1 (a saját abilityjeit lehívta egy körre).
    const cd = jatek.abilities.cooldowns[lepoSzin];
    for (const k in cd) {
        if (cd[k] > 0) cd[k]--;
    }

    // 2. Lejárt fagyasztás-effektek tisztítása:
    //    Egy fagyasztott bábunak akkor jár le a hatás, amikor a tulajdonos szín lépett
    //    (mert "1 körig nem mozdulhat" = az ő következő köréig hatott).
    jatek.abilities.effects.frozenPieces = jatek.abilities.effects.frozenPieces.filter(f => {
        return f.untilMoveOf !== lepoSzin;
    });

    // 3. Lejárt pajzs-effektek (ugyanaz a szabály — a védett szín lépett egyet).
    jatek.abilities.effects.shieldedPieces = jatek.abilities.effects.shieldedPieces.filter(s => {
        return s.untilMoveOf !== lepoSzin;
    });

    // 4. Board_hide pending → ténylegesen aktiválás az ellenfél új körének elején.
    //    Az ujSzin kapja meg a blokkot, ha az ő blockedUntilMs-je -1 (pending).
    if (jatek.abilities.effects.blockedUntilMs[ujSzin] === -1) {
        jatek.abilities.effects.blockedUntilMs[ujSzin] = Date.now() + BOARD_HIDE_MS;
    }
    // Lejárt board_hide törlése.
    for (const sz of ['white', 'black']) {
        const u = jatek.abilities.effects.blockedUntilMs[sz];
        if (u && u > 0 && Date.now() >= u) {
            jatek.abilities.effects.blockedUntilMs[sz] = null;
        }
    }
}

/**
 * A kliens-felé exportált ABILITY_CONFIG (csak read-only adat).
 * A frontend ebből rendereli a gomb-listát + árakat + cooldownokat.
 */
function getKliensConfig() {
    const out = {};
    for (const k in ABILITY_CONFIG) {
        const c = ABILITY_CONFIG[k];
        out[k] = {
            ar: c.ar,
            cooldown: c.cooldown,
            maxPerGame: c.maxPerGame,
            turnCost: c.turnCost,
            mikor: c.mikor,
            kellCelpont: !!c.kellCelpont,
            kellKetCelpont: !!c.kellKetCelpont
        };
    }
    return out;
}

module.exports = {
    ABILITY_CONFIG,
    PIECE_VALUES,
    TIME_PAUSE_MS,
    BOARD_HIDE_MS,
    TIME_STEAL_SEC,
    abilityAktival,
    pontHozzaad,
    isMezoFagyott,
    isMezoVedett,
    isJatekosBlokkolt,
    timeStealAlkalmaz,
    cooldownTickAndCleanup,
    getKliensConfig
};
