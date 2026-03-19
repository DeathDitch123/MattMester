// CHESS BOT 
// Nehézségi szintek: mélység + random lépés arány.
// Értékelés: anyagi érték + piece-square táblák.


const { mezoKeres } = require('./state.js');
const { szabLepKeres, jatekAllapotEllenor } = require('./logika.js');

// ────────────────────────────────────────────
// NEHÉZSÉGI SZINTEK
// ────────────────────────────────────────────

const NEHEZSEGEK = {
    1: { nev: "Kezdő",       elo: 200,  melyseg: 1, randomPct: 40 },
    2: { nev: "Újonc",       elo: 400,  melyseg: 1, randomPct: 25 },
    3: { nev: "Amatőr",      elo: 600,  melyseg: 2, randomPct: 15 },
    4: { nev: "Haladó",      elo: 800,  melyseg: 2, randomPct: 8  },
    5: { nev: "Klubjátékos", elo: 1000, melyseg: 3, randomPct: 3  },
    6: { nev: "Erős",        elo: 1200, melyseg: 3, randomPct: 0  },
    7: { nev: "Mester",      elo: 1500, melyseg: 4, randomPct: 0  },
    8: { nev: "Nagymester",  elo: 1800, melyseg: 5, randomPct: 0  },
};

function nehezsegiSzintInfo(szint) {
    return NEHEZSEGEK[szint] || NEHEZSEGEK[4];
}

function osszesNehezsegiSzint() {
    return Object.entries(NEHEZSEGEK).map(([szint, info]) => ({
        szint: parseInt(szint),
        nev: info.nev,
        elo: info.elo
    }));
}

// ────────────────────────────────────────────
// BÁBUÉRTÉKEK (centipawn)
// ────────────────────────────────────────────

const BABU_ERTEK = {
    pawn: 100,
    knight: 320,
    bishop: 330,
    rook: 500,
    queen: 900,
    king: 20000
};
