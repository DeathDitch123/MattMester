// CHESS BOT 
// Nehézségi szintek: mélység + random lépés arány.
// Értékelés: anyagi érték + piece-square táblák.


const { mezoKeres } = require('./state.js');
const { szabLepKeres, jatekAllapotEllenor } = require('./logika.js');

// ────────────────────────────────────────────
// NEHÉZSÉGI SZINTEK
// ────────────────────────────────────────────

const NEHEZSEGEK = {
    1: { nev: "Kezdő",       elo: 800,  melyseg: 1, randomPct: 16, varakozasMs: 2600, checkBonus: 12,  backtrackPenalty: 90, randomDisableFromPly: 28 },
    2: { nev: "Újonc",       elo: 1000, melyseg: 1, randomPct: 9,  varakozasMs: 2300, checkBonus: 18,  backtrackPenalty: 80, randomDisableFromPly: 24 },
    3: { nev: "Amatőr",      elo: 1200, melyseg: 2, randomPct: 3,  varakozasMs: 2050, checkBonus: 28,  backtrackPenalty: 70, randomDisableFromPly: 22 },
    4: { nev: "Haladó",      elo: 1400, melyseg: 2, randomPct: 0,  varakozasMs: 1850, checkBonus: 38,  backtrackPenalty: 60, randomDisableFromPly: 20 },
    5: { nev: "Klubjátékos", elo: 1600, melyseg: 3, randomPct: 0,  varakozasMs: 1700, checkBonus: 50,  backtrackPenalty: 45, randomDisableFromPly: 18 },
    6: { nev: "Erős",        elo: 1800, melyseg: 3, randomPct: 0,  varakozasMs: 1550, checkBonus: 54,  backtrackPenalty: 35, randomDisableFromPly: 26 },
    7: { nev: "Mester",      elo: 2000, melyseg: 4, randomPct: 0,  varakozasMs: 1400, checkBonus: 68,  backtrackPenalty: 25, randomDisableFromPly: 22 },
    8: { nev: "Nagymester",  elo: 2200, melyseg: 4, randomPct: 0,  varakozasMs: 1250, checkBonus: 82,  backtrackPenalty: 18, randomDisableFromPly: 18 },
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

// ────────────────────────────────────────────
// PIECE-SQUARE TÁBLÁK (fehér szemszögéből)
// ────────────────────────────────────────────
// Indexelés: [y][x], y=0 rank 8, y=7 rank 1
// Fekete számára: y-t tükrözzük (7 - y)

const PST = {
    pawn: [
        [  0,  0,  0,  0,  0,  0,  0,  0],  // rank 8
        [ 50, 50, 50, 50, 50, 50, 50, 50],  // rank 7
        [ 10, 10, 20, 30, 30, 20, 10, 10],  // rank 6
        [  5,  5, 10, 25, 25, 10,  5,  5],  // rank 5
        [  0,  0,  0, 20, 20,  0,  0,  0],  // rank 4
        [  5, -5,-10,  0,  0,-10, -5,  5],  // rank 3
        [  5, 10, 10,-20,-20, 10, 10,  5],  // rank 2
        [  0,  0,  0,  0,  0,  0,  0,  0],  // rank 1
    ],
    knight: [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,  0,  0,  0,  0,-20,-40],
        [-30,  0, 10, 15, 15, 10,  0,-30],
        [-30,  5, 15, 20, 20, 15,  5,-30],
        [-30,  0, 15, 20, 20, 15,  0,-30],
        [-30,  5, 10, 15, 15, 10,  5,-30],
        [-40,-20,  0,  5,  5,  0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50],
    ],
    bishop: [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0, 10, 10, 10, 10,  0,-10],
        [-10,  5,  5, 10, 10,  5,  5,-10],
        [-10,  0,  5, 10, 10,  5,  0,-10],
        [-10, 10, 10, 10, 10, 10, 10,-10],
        [-10,  5,  0,  0,  0,  0,  5,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20],
    ],
    rook: [
        [  0,  0,  0,  0,  0,  0,  0,  0],
        [  5, 10, 10, 10, 10, 10, 10,  5],
        [ -5,  0,  0,  0,  0,  0,  0, -5],
        [ -5,  0,  0,  0,  0,  0,  0, -5],
        [ -5,  0,  0,  0,  0,  0,  0, -5],
        [ -5,  0,  0,  0,  0,  0,  0, -5],
        [ -5,  0,  0,  0,  0,  0,  0, -5],
        [  0,  0,  0,  5,  5,  0,  0,  0],
    ],
    queen: [
        [-20,-10,-10, -5, -5,-10,-10,-20],
        [-10,  0,  0,  0,  0,  0,  0,-10],
        [-10,  0,  5,  5,  5,  5,  0,-10],
        [ -5,  0,  5,  5,  5,  5,  0, -5],
        [  0,  0,  5,  5,  5,  5,  0, -5],
        [-10,  5,  5,  5,  5,  5,  0,-10],
        [-10,  0,  5,  0,  0,  0,  0,-10],
        [-20,-10,-10, -5, -5,-10,-10,-20],
    ],
    king: [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [ 20, 20,  0,  0,  0,  0, 20, 20],
        [ 20, 30, 10,  0,  0, 10, 30, 20],
    ],
};

// ────────────────────────────────────────────
// TÁBLA ÉRTÉKELÉS
// ────────────────────────────────────────────

/**
 * Értékeli a tábla állapotát a megadott szín szemszögéből.
 * Pozitív = előnyben van, negatív = hátrányban.
 * @param {object} jatek
 * @param {string} szin - 'white' | 'black'
 * @returns {number} centipawn értékelés
 */
function tablaErtekel(jatek, szin) {
    let ertek = 0;

    for (let i = 0; i < jatek.tabla.length; i++) {
        const mezo = jatek.tabla[i];
        if (!mezo.piece) continue;

        const babu = mezo.piece;
        const babuErtek = BABU_ERTEK[babu.type] || 0;

        // Piece-square tábla érték
        const pst = PST[babu.type];
        let pstErtek = 0;
        if (pst) {
            if (babu.color === "white") {
                pstErtek = pst[mezo.y][mezo.x];
            } else {
                // Fekete: y tükrözés
                pstErtek = pst[7 - mezo.y][mezo.x];
            }
        }

        // Hozzáadás vagy kivonás a szín alapján
        if (babu.color === szin) {
            ertek += babuErtek + pstErtek;
        } else {
            ertek -= babuErtek + pstErtek;
        }
    }

    return ertek;
}

// ────────────────────────────────────────────
// MAKE / UNMAKE (ideiglenes lépés a kereséshez)
// ────────────────────────────────────────────

/**
 * Ideiglenesen végrehajtja a lépést a keresőfában.
 * Visszaadja az undo objektumot a visszavonáshoz.
 */
function botLepesCsinal(jatek, lepes) {
    const babu = lepes.from.piece;

    const undo = {
        fromPiece: lepes.from.piece,
        toPiece: lepes.to.piece,
        toPieceSquare: lepes.to.piece ? lepes.to.piece.square : null,
        enPassant: jatek.enPassant ? { ...jatek.enPassant } : null,
        koronLevo: jatek.koronLevo,
        felLepes: jatek.felLepes,
        babuHasMoved: babu.hasMoved,
        babuType: babu.type,
        // Sáncolás adatok
        rookFromPiece: null,
        rookToPiece: null,
        rookHasMoved: null,
        // En passant ütés
        epMezo: null,
        epBabu: null,
    };

    // En passant ütés
    if (lepes.special === "enpassant" && lepes.captured) {
        undo.epMezo = lepes.captured;
        undo.epBabu = lepes.captured.piece;
        lepes.captured.piece = null;
    }

    // Sáncolás bástya mozgatás
    if (lepes.special === "castle-ks" || lepes.special === "castle-qs") {
        const rook = lepes.rookFrom.piece;
        undo.rookFromPiece = rook;
        undo.rookToPiece = lepes.rookTo.piece;
        undo.rookHasMoved = rook.hasMoved;
        undo.rookSquare = rook.square;
        lepes.rookTo.piece = rook;
        rook.square = lepes.rookTo;
        rook.hasMoved = true;
        lepes.rookFrom.piece = null;
    }

    // Bábu mozgatása
    lepes.from.piece = null;
    lepes.to.piece = babu;
    babu.square = lepes.to;
    babu.hasMoved = true;

    // En passant célmező frissítés
    if (lepes.special === "double") {
        const irany = (babu.color === "white") ? -1 : 1;
        jatek.enPassant = { x: lepes.from.x, y: lepes.from.y + irany };
    } else {
        jatek.enPassant = null;
    }

    // Gyalog átváltozás (keresésben mindig vezér)
    if (babu.type === "pawn" && (lepes.to.y === 0 || lepes.to.y === 7)) {
        babu.type = "queen";
    }

    // Féllépes számláló
    if (undo.babuType === "pawn" || undo.toPiece) {
        jatek.felLepes = 0;
    } else {
        jatek.felLepes++;
    }

    // Játékosváltás
    jatek.koronLevo = (jatek.koronLevo === "white") ? "black" : "white";

    return undo;
}

/**
 * Visszavonja az ideiglenesen végrehajtott lépést.
 */
function botLepesVisszavon(jatek, lepes, undo) {
    const babu = lepes.to.piece;

    // Típus visszaállítás (átváltozás undo)
    babu.type = undo.babuType;

    // Bábu visszamozgatás
    lepes.from.piece = babu;
    babu.square = lepes.from;
    babu.hasMoved = undo.babuHasMoved;

    // Célmező visszaállítás (ütött bábu visszarakás)
    lepes.to.piece = undo.toPiece;
    if (undo.toPiece) {
        undo.toPiece.square = lepes.to;
    }

    // Sáncolás visszavonás
    if (lepes.special === "castle-ks" || lepes.special === "castle-qs") {
        lepes.rookFrom.piece = undo.rookFromPiece;
        if (undo.rookFromPiece) {
            undo.rookFromPiece.square = lepes.rookFrom;
            undo.rookFromPiece.hasMoved = undo.rookHasMoved;
        }
        lepes.rookTo.piece = undo.rookToPiece;
    }

    // En passant ütés visszavonás
    if (undo.epMezo) {
        undo.epMezo.piece = undo.epBabu;
    }

    // Játékállapot visszaállítás
    jatek.enPassant = undo.enPassant;
    jatek.koronLevo = undo.koronLevo;
    jatek.felLepes = undo.felLepes;
}

// ────────────────────────────────────────────
// LÉPÉS RENDEZÉS (alfa-béta hatékonysághoz)
// ────────────────────────────────────────────

/**
 * MVV-LVA rendezés: ütések előre, értékesebb áldozat és kevésbé értékes támadó elöl.
 */
function lepesekRendez(lepesek) {
    return lepesek.sort((a, b) => {
        const aScore = lepesRendezErtek(a);
        const bScore = lepesRendezErtek(b);
        return bScore - aScore;
    });
}

function lepesRendezErtek(lepes) {
    let ertek = 0;

    // Ütések előre
    if (lepes.capture && lepes.to.piece) {
        const aldozat = BABU_ERTEK[lepes.to.piece.type] || 0;
        const tamado = BABU_ERTEK[lepes.from.piece.type] || 0;
        ertek += 10000 + aldozat - tamado;
    } else if (lepes.special === "enpassant") {
        ertek += 10100; // gyalog üt gyalogot
    }

    // Gyalog átváltozás magas prioritás
    if (lepes.from.piece.type === "pawn") {
        const utSor = (lepes.from.piece.color === "white") ? 0 : 7;
        if (lepes.to.y === utSor) ertek += 9000;
    }

    return ertek;
}

function aktualisRandomPct(jatek, config) {
    if (jatek.lepesszam >= config.randomDisableFromPly) return 0;
    return config.randomPct;
}

function azonnaliMattLepesKeres(jatek, lepesek) {
    for (let i = 0; i < lepesek.length; i++) {
        const lepes = lepesek[i];
        const undo = botLepesCsinal(jatek, lepes);
        const allapot = jatekAllapotEllenor(jatek, jatek.koronLevo);
        botLepesVisszavon(jatek, lepes, undo);

        if (allapot.vege && allapot.ok === "matt") {
            return lepes;
        }
    }
    return null;
}

function visszalepesBuntetes(jatek, lepes, config) {
    const tort = jatek.lepesTortenet;
    if (!tort || tort.length < 2) return 0;

    const elozoBotLepes = tort[tort.length - 2];
    if (!elozoBotLepes) return 0;

    const visszalep =
        elozoBotLepes.from.x === lepes.to.x &&
        elozoBotLepes.from.y === lepes.to.y &&
        elozoBotLepes.to.x === lepes.from.x &&
        elozoBotLepes.to.y === lepes.from.y;

    return visszalep ? config.backtrackPenalty : 0;
}

function tamadoBonusz(jatek, config) {
    const allapot = jatekAllapotEllenor(jatek, jatek.koronLevo);
    if (allapot.vege && allapot.ok === "matt") return 100000;
    if (allapot.sakkban) return config.checkBonus;
    return 0;
}

// ────────────────────────────────────────────
// MINIMAX + ALFA-BÉTA
// ────────────────────────────────────────────

/**
 * @param {object} jatek
 * @param {number} melyseg - keresési mélység
 * @param {number} alfa - alfa-béta alsó határ
 * @param {number} beta - alfa-béta felső határ
 * @param {string} maximaloSzin - a bot színe (max-ot akarjuk)
 * @returns {number} értékelés centipawn-ban
 */
function minimax(jatek, melyseg, alfa, beta, maximaloSzin) {
    // Levélcsomópont
    if (melyseg === 0) {
        return tablaErtekel(jatek, maximaloSzin);
    }

    // Játékvége ellenőrzés
    const aktSzin = jatek.koronLevo;
    const allapot = jatekAllapotEllenor(jatek, aktSzin);
    if (allapot.vege) {
        if (allapot.ok === "matt") {
            // A köron lévő kapott mattot
            if (aktSzin === maximaloSzin) {
                return -100000 - melyseg; // minél mélyebben találja, annál rosszabb
            } else {
                return 100000 + melyseg; // minél hamarabb matt, annál jobb
            }
        }
        // Patt / 50 lépés = döntetlen
        return 0;
    }

    const maximalo = (aktSzin === maximaloSzin);

    // Összes legális lépés generálás
    let lepesek = [];
    for (let i = 0; i < jatek.tabla.length; i++) {
        const m = jatek.tabla[i];
        if (m.piece && m.piece.color === aktSzin) {
            const babuLepesek = szabLepKeres(jatek, m.piece);
            lepesek.push(...babuLepesek);
        }
    }

    lepesekRendez(lepesek);

    if (maximalo) {
        let legjobb = -Infinity;
        for (let i = 0; i < lepesek.length; i++) {
            const undo = botLepesCsinal(jatek, lepesek[i]);
            const ertek = minimax(jatek, melyseg - 1, alfa, beta, maximaloSzin);
            botLepesVisszavon(jatek, lepesek[i], undo);

            if (ertek > legjobb) legjobb = ertek;
            if (ertek > alfa) alfa = ertek;
            if (alfa >= beta) break; // béta vágás
        }
        return legjobb;
    } else {
        let legjobb = Infinity;
        for (let i = 0; i < lepesek.length; i++) {
            const undo = botLepesCsinal(jatek, lepesek[i]);
            const ertek = minimax(jatek, melyseg - 1, alfa, beta, maximaloSzin);
            botLepesVisszavon(jatek, lepesek[i], undo);

            if (ertek < legjobb) legjobb = ertek;
            if (ertek < beta) beta = ertek;
            if (alfa >= beta) break; // alfa vágás
        }
        return legjobb;
    }
}

// ────────────────────────────────────────────
// BOT LÉPÉS VÁLASZTÁS
// ────────────────────────────────────────────

/**
 * Kiválasztja a bot lépését a nehézségi szint alapján.
 * @param {object} jatek - a játék objektum
 * @param {number} nehezseg - 1-8 nehézségi szint
 * @returns {{ from: {x,y}, to: {x,y}, promotion: string|null } | null}
 */
function botLepesValaszt(jatek, nehezseg) {
    const config = NEHEZSEGEK[nehezseg] || NEHEZSEGEK[4];
    const botSzin = jatek.koronLevo;

    // Összes legális lépés gyűjtés
    let lepesek = [];
    for (let i = 0; i < jatek.tabla.length; i++) {
        const m = jatek.tabla[i];
        if (m.piece && m.piece.color === botSzin) {
            const babuLepesek = szabLepKeres(jatek, m.piece);
            for (let j = 0; j < babuLepesek.length; j++) {
                lepesek.push(babuLepesek[j]);
            }
        }
    }

    if (lepesek.length === 0) return null;

    // Ha van azonnali matt, azt mindig válassza (minden szinten).
    const mattLepes = azonnaliMattLepesKeres(jatek, lepesek);
    if (mattLepes) {
        return lepesFormaz(mattLepes, botSzin);
    }

    // Random lépés esélye (gyengébb szintek hibáznak)
    const randomPctAktualis = aktualisRandomPct(jatek, config);
    if (randomPctAktualis > 0 && Math.random() * 100 < randomPctAktualis) {
        const randomLepes = lepesek[Math.floor(Math.random() * lepesek.length)];
        return lepesFormaz(randomLepes, botSzin);
    }

    // Minimax keresés
    lepesekRendez(lepesek);

    let legjobbLepes = null;
    let legjobbErtek = -Infinity;

    for (let i = 0; i < lepesek.length; i++) {
        const undo = botLepesCsinal(jatek, lepesek[i]);
        let ertek = minimax(jatek, config.melyseg - 1, -Infinity, Infinity, botSzin);
        ertek += tamadoBonusz(jatek, config);
        ertek -= visszalepesBuntetes(jatek, lepesek[i], config);
        botLepesVisszavon(jatek, lepesek[i], undo);

        if (ertek > legjobbErtek) {
            legjobbErtek = ertek;
            legjobbLepes = lepesek[i];
        }
    }

    if (!legjobbLepes) return null;

    return lepesFormaz(legjobbLepes, botSzin);
}

/**
 * A belső lépés objektumot API-kompatibilis formátumra alakítja.
 */
function lepesFormaz(lepes, szin) {
    let promotion = null;
    if (lepes.from.piece && lepes.from.piece.type === "pawn") {
        const utSor = (szin === "white") ? 0 : 7;
        if (lepes.to.y === utSor) {
            promotion = "queen";
        }
    }

    return {
        fromX: lepes.from.x,
        fromY: lepes.from.y,
        toX: lepes.to.x,
        toY: lepes.to.y,
        promotion
    };
}

module.exports = {
    botLepesValaszt,
    nehezsegiSzintInfo,
    osszesNehezsegiSzint,
    NEHEZSEGEK
};
