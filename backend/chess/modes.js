// ============================================================
// CHESS GAME MODES — single source of truth a játék-módokról
// ============================================================
// 5 mód:
//   - mattmester:     végtelen idő, képességekkel
//   - mattmester_10p: 10+0, képességekkel
//   - klasszikus:     végtelen idő, képességek nélkül
//   - klasszikus_10p: 10+0, képességek nélkül
//   - blitz:          5+0, képességek nélkül
//
// Mindegyik mód ranked/unranked toggle-elhető.
// A mattmester ∞ és 10p ugyanazt az ELO oszlopot osztja meg (elo_mattmester).
// A klasszikus ∞ és 10p szintén egy oszlop (elo_classical).
// Blitz külön: elo_blitz.
// ============================================================

// Az ALLOWED_ELO_COLUMNS-ot a chess_sql_functions whitelist-hez használja —
// SOHA ne adj hozzá felhasználói inputtól származó stringet.
const ALLOWED_ELO_COLUMNS = new Set(['elo', 'elo_mattmester', 'elo_classical', 'elo_blitz']);

const MODES = {
    mattmester: {
        id: 'mattmester',
        nev: 'Mattmester',
        leiras: 'Képességes sakk, végtelen idővel.',
        abilities: true,
        ido: null,
        eloColumn: 'elo_mattmester',
        rankedAllowed: true
    },
    mattmester_10p: {
        id: 'mattmester_10p',
        nev: 'Mattmester 10p',
        leiras: 'Képességes sakk, 10 perces órával.',
        abilities: true,
        ido: 600,
        eloColumn: 'elo_mattmester',
        rankedAllowed: true
    },
    klasszikus: {
        id: 'klasszikus',
        nev: 'Klasszikus',
        leiras: 'Hagyományos sakk képességek nélkül, végtelen idővel.',
        abilities: false,
        ido: null,
        eloColumn: 'elo_classical',
        rankedAllowed: true
    },
    klasszikus_10p: {
        id: 'klasszikus_10p',
        nev: 'Klasszikus 10p',
        leiras: 'Hagyományos sakk képességek nélkül, 10 perces órával.',
        abilities: false,
        ido: 600,
        eloColumn: 'elo_classical',
        rankedAllowed: true
    },
    blitz: {
        id: 'blitz',
        nev: 'Blitz',
        leiras: 'Gyors sakk képességek nélkül, 5 perces órával.',
        abilities: false,
        ido: 300,
        eloColumn: 'elo_blitz',
        rankedAllowed: true
    }
};

const DEFAULT_MODE = 'mattmester_10p';

function getMode(key) {
    return MODES[key] || null;
}

function isValidMode(key) {
    return Object.prototype.hasOwnProperty.call(MODES, key);
}

function isValidEloColumn(col) {
    return ALLOWED_ELO_COLUMNS.has(col);
}

/**
 * A queue-kulcs amit a per-mode matchmaking használ.
 * Pl. 'mattmester_10p:r' (ranked) vagy 'klasszikus:c' (casual).
 */
function queueKey(modeKey, ranked) {
    return `${modeKey}:${ranked ? 'r' : 'c'}`;
}

/**
 * Kliens-felé exportált mode metaadat — minden mode publikus paramétere
 * (UI gomb-render-hez). A `eloColumn` szándékosan NINCS kiküldve, csak `hasElo`
 * boolean (a kliens nem kell tudja a DB oszlopnevet).
 */
function listClient() {
    const out = {};
    for (const k in MODES) {
        const m = MODES[k];
        out[k] = {
            id: m.id,
            nev: m.nev,
            leiras: m.leiras,
            abilities: m.abilities,
            ido: m.ido,                 // null = végtelen, egyébként sec
            hasElo: !!m.eloColumn,
            rankedAllowed: m.rankedAllowed
        };
    }
    return out;
}

module.exports = {
    MODES,
    DEFAULT_MODE,
    ALLOWED_ELO_COLUMNS,
    getMode,
    isValidMode,
    isValidEloColumn,
    queueKey,
    listClient
};
