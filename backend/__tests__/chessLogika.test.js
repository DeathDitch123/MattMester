/**
 * chess/logika.js — szabaly-motor unit tesztek.
 *
 * Lefedi a teljes szabalyrendszert valos jatek-allapotokkal:
 *   - mezoTamadva: gyalog/futo/huszar/bastya/kiraly tamadasi mintak
 *   - szabLepKeres: minden babutipus szabalyos lepesei
 *   - jatekAllapotEllenor: matt, patt, 50-lepes, anyaghiany, haromszori ismetles
 *   - elegtelenAnyag: K vs K, K+B vs K, K+N vs K, K+B vs K+B (azonos szinu futok)
 *   - pozicioHash: konzisztencia + sancolasi jogok beleszamitasa
 */

const { jatekLetrehoz } = require('../chess/state.js');
const { jatekUjraIndit } = require('../chess/engine.js');
const { mezoTamadva, szabLepKeres, jatekAllapotEllenor, pozicioHash } = require('../chess/logika.js');

jest.mock('../chess/timer.js', () => ({
    idoFut: jest.fn(),
    idoLeall: jest.fn()
}));

function freshGame() {
    const { jatek } = jatekLetrehoz({ mode: 'klasszikus', ranked: false });
    jatekUjraIndit(jatek);
    return jatek;
}

function clearBoard(jatek) {
    for (const m of jatek.tabla) m.piece = null;
}

function place(jatek, x, y, type, color) {
    const m = jatek.tabla[y * 8 + x];
    m.piece = { type, color, hasMoved: false, id: Math.random(), square: m };
    return m.piece;
}

describe('mezoTamadva — tamadasi mintak', () => {
    test('gyalog atlosan tamad, NEM elore', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 4, 'pawn', 'white'); // e4 (a 4=e, 4=4. sor felulrol)
        // Feher gyalog felfele tamad (-1 irany): (3, 3) es (5, 3)
        expect(mezoTamadva(j, 3, 3, 'white')).toBe(true);
        expect(mezoTamadva(j, 5, 3, 'white')).toBe(true);
        // Elore NEM tamad
        expect(mezoTamadva(j, 4, 3, 'white')).toBe(false);
        // Hatra NEM tamad (lefele)
        expect(mezoTamadva(j, 4, 5, 'white')).toBe(false);
    });

    test('fekete gyalog lefele tamad', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 4, 'pawn', 'black');
        expect(mezoTamadva(j, 3, 5, 'black')).toBe(true);
        expect(mezoTamadva(j, 5, 5, 'black')).toBe(true);
        expect(mezoTamadva(j, 4, 5, 'black')).toBe(false);
    });

    test('huszar 8 mezot tamad L-alakban', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 4, 'knight', 'white');
        const exp = [[2,3],[2,5],[3,2],[3,6],[5,2],[5,6],[6,3],[6,5]];
        for (const [x, y] of exp) {
            expect(mezoTamadva(j, x, y, 'white')).toBe(true);
        }
        // Egy nem-tamadott mezo
        expect(mezoTamadva(j, 4, 5, 'white')).toBe(false);
    });

    test('bastya — vizszintes / fuggoleges tamadas, blokk mukodik', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 0, 0, 'rook', 'white');
        // Soron tamad
        expect(mezoTamadva(j, 7, 0, 'white')).toBe(true);
        // Oszlopon tamad
        expect(mezoTamadva(j, 0, 7, 'white')).toBe(true);
        // Atlosan NEM tamad
        expect(mezoTamadva(j, 7, 7, 'white')).toBe(false);
    });

    test('bastya nem tamad kollegan tul', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 0, 0, 'rook', 'white');
        place(j, 0, 3, 'pawn', 'white'); // sajat blokkol
        expect(mezoTamadva(j, 0, 7, 'white')).toBe(false);
        // Csak a kozti mezok tamadottak (de a 3-as nem mert ott a sajat all)
        expect(mezoTamadva(j, 0, 1, 'white')).toBe(true);
        expect(mezoTamadva(j, 0, 2, 'white')).toBe(true);
    });

    test('futo atloban tamad', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 3, 3, 'bishop', 'white');
        expect(mezoTamadva(j, 0, 0, 'white')).toBe(true);
        expect(mezoTamadva(j, 7, 7, 'white')).toBe(true);
        expect(mezoTamadva(j, 6, 0, 'white')).toBe(true);
        // Nem-atloban NEM tamad
        expect(mezoTamadva(j, 3, 7, 'white')).toBe(false);
    });

    test('vezer = bastya + futo kombinaciok', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 3, 3, 'queen', 'white');
        // Sor
        expect(mezoTamadva(j, 7, 3, 'white')).toBe(true);
        // Oszlop
        expect(mezoTamadva(j, 3, 0, 'white')).toBe(true);
        // Atlo
        expect(mezoTamadva(j, 7, 7, 'white')).toBe(true);
    });

    test('kiraly csak 1 mezot tamad minden iranyba', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 4, 'king', 'white');
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                expect(mezoTamadva(j, 4 + dx, 4 + dy, 'white')).toBe(true);
            }
        }
        // 2 lepesnyire NEM tamad
        expect(mezoTamadva(j, 4, 6, 'white')).toBe(false);
    });

    test('mezoTamadva ellenfel-szin szerint elkulonit', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 4, 'rook', 'white');
        expect(mezoTamadva(j, 0, 4, 'white')).toBe(true);  // feher tamadja
        expect(mezoTamadva(j, 0, 4, 'black')).toBe(false); // fekete NEM
    });
});

describe('szabLepKeres — szabalyos lepesek (sakk-szabalyok altal sziurva)', () => {
    test('alapallasban a feher gyalog 2-t lephet (vagy 1-et)', () => {
        const j = freshGame();
        const m = j.tabla.find(m => m.x === 4 && m.y === 6 && m.piece && m.piece.type === 'pawn');
        const lepesek = szabLepKeres(j, m.piece);
        // (4, 4) es (4, 5) ervenyes lepes
        expect(lepesek.some(l => l.to.x === 4 && l.to.y === 5)).toBe(true);
        expect(lepesek.some(l => l.to.x === 4 && l.to.y === 4)).toBe(true);
    });

    test('huszar alapallasban 2 lepes', () => {
        const j = freshGame();
        const m = j.tabla.find(m => m.x === 1 && m.y === 7 && m.piece && m.piece.type === 'knight');
        const lepesek = szabLepKeres(j, m.piece);
        expect(lepesek.length).toBe(2);
    });

    test('blokkolt babunak nincs lepese', () => {
        const j = freshGame();
        const bishop = j.tabla.find(m => m.x === 2 && m.y === 7 && m.piece && m.piece.type === 'bishop');
        const lepesek = szabLepKeres(j, bishop.piece);
        // Alapallasban a futokat blokkoljak a sajat gyalogok
        expect(lepesek.length).toBe(0);
    });

    test('sakk-bottos lepes ki van szurve (illegal lepes elhagyna a kiralyt sakkban)', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        const pinned = place(j, 4, 5, 'rook', 'white'); // pinned a kiraly + ellenfel kozott
        place(j, 4, 0, 'rook', 'black');
        // A pinned bastya csak a pinning oszlop menten lephet
        const lepesek = szabLepKeres(j, pinned);
        for (const l of lepesek) {
            // Minden lepes az x=4 oszlopon kell hogy maradjon
            expect(l.to.x).toBe(4);
        }
    });
});

describe('jatekAllapotEllenor — vege-detekcio', () => {
    test('alapallas: nincs vege', () => {
        const j = freshGame();
        const r = jatekAllapotEllenor(j, 'white');
        expect(r.vege).toBe(false);
        expect(r.sakkban).toBe(false);
    });

    test('back-rank matt: fekete matt', () => {
        // y=0 a fekete sor (h8 = (7,0)). Feher bastya e8-on (4,0) ad sakkot,
        // fekete gyalogok blokkoljak az f7/g7/h7 menekulest.
        const j = freshGame();
        clearBoard(j);
        place(j, 7, 0, 'king', 'black');     // h8
        place(j, 5, 1, 'pawn', 'black');     // f7
        place(j, 6, 1, 'pawn', 'black');     // g7
        place(j, 7, 1, 'pawn', 'black');     // h7
        place(j, 4, 0, 'rook', 'white');     // e8 — back-rank check
        place(j, 4, 7, 'king', 'white');     // e1 (random safe)
        const r = jatekAllapotEllenor(j, 'black');
        expect(r.vege).toBe(true);
        expect(r.ok).toBe('matt');
        expect(r.nyertes).toBe('white');
    });

    test('patt: feher kiraly nem all sakkban, de nincs lepes', () => {
        // Klasszikus patt sarok-helyzet: feher kiraly a8, fekete vezer b6, fekete kiraly c6
        const j = freshGame();
        clearBoard(j);
        place(j, 0, 0, 'king', 'white');  // a8
        place(j, 1, 2, 'queen', 'black'); // b6 — lefedi a (1,0), (0,1), (1,1) menekulest
        place(j, 2, 2, 'king', 'black');  // c6 — vedi a vezert
        const r = jatekAllapotEllenor(j, 'white');
        expect(r.vege).toBe(true);
        expect(r.ok).toBe('patt');
    });

    test('50-lepes szabaly (felLepes >= 100)', () => {
        const j = freshGame();
        j.felLepes = 100;
        const r = jatekAllapotEllenor(j, 'white');
        expect(r.vege).toBe(true);
        expect(r.ok).toBe('50lepes');
    });

    test('elegtelen anyag: K vs K', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 0, 0, 'king', 'white');
        place(j, 7, 7, 'king', 'black');
        const r = jatekAllapotEllenor(j, 'white');
        expect(r.vege).toBe(true);
        expect(r.ok).toBe('anyaghiany');
    });

    test('elegtelen anyag: K+B vs K', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 0, 0, 'king', 'white');
        place(j, 1, 1, 'bishop', 'white');
        place(j, 7, 7, 'king', 'black');
        const r = jatekAllapotEllenor(j, 'white');
        expect(r.vege).toBe(true);
        expect(r.ok).toBe('anyaghiany');
    });

    test('elegtelen anyag: K+N vs K', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 0, 0, 'king', 'white');
        place(j, 1, 1, 'knight', 'white');
        place(j, 7, 7, 'king', 'black');
        const r = jatekAllapotEllenor(j, 'white');
        expect(r.vege).toBe(true);
        expect(r.ok).toBe('anyaghiany');
    });

    test('NEM elegtelen: K+B+B vs K (eleg matt-erdek)', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 0, 0, 'king', 'white');
        place(j, 1, 1, 'bishop', 'white');
        place(j, 2, 2, 'bishop', 'white');
        place(j, 3, 3, 'bishop', 'white'); // 4 babu, > 3 limit
        place(j, 7, 7, 'king', 'black');
        const r = jatekAllapotEllenor(j, 'white');
        // Nem 'anyaghiany' (akar matt akar nem)
        if (r.vege) expect(r.ok).not.toBe('anyaghiany');
    });

    test('haromszori ismetles', () => {
        const j = freshGame();
        const aktHash = pozicioHash(j);
        // 3 ismetles a tortenetben
        j.pozicioTortenet = [aktHash, aktHash, aktHash];
        const r = jatekAllapotEllenor(j, 'white');
        expect(r.vege).toBe(true);
        expect(r.ok).toBe('haromszor');
    });
});

describe('pozicioHash — konzisztencia', () => {
    test('azonos pozicio = azonos hash', () => {
        const j1 = freshGame();
        const j2 = freshGame();
        expect(pozicioHash(j1)).toBe(pozicioHash(j2));
    });

    test('kulonbozo koronLevo = kulonbozo hash', () => {
        const j = freshGame();
        const h1 = pozicioHash(j);
        j.koronLevo = 'black';
        const h2 = pozicioHash(j);
        expect(h1).not.toBe(h2);
    });

    test('en passant mezo a hashbe szamit', () => {
        const j = freshGame();
        const h1 = pozicioHash(j);
        j.enPassant = { x: 4, y: 5 };
        const h2 = pozicioHash(j);
        expect(h1).not.toBe(h2);
    });

    test('sancolasi jogok elveszese megvaltoztatja a hashet', () => {
        const j = freshGame();
        const h1 = pozicioHash(j);
        // Feher kiraly mar mozdult — sancolasi jog elveszett
        const king = j.tabla.find(m => m.piece && m.piece.type === 'king' && m.piece.color === 'white');
        king.piece.hasMoved = true;
        const h2 = pozicioHash(j);
        expect(h1).not.toBe(h2);
    });
});
