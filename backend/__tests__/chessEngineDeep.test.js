/**
 * chess/engine.js — engine.js mely funkcios tesztek (alapfelallas, lepes-vegrehajtas,
 * legalLepesekKliens helper).
 */

jest.mock('../chess/timer.js', () => ({
    idoFut: jest.fn(),
    idoLeall: jest.fn()
}));

jest.mock('../chess/chess_sql_functions.js', () => ({
    lepesMentDb: jest.fn(() => Promise.resolve()),
    jatekVegeMentDb: jest.fn(() => Promise.resolve()),
    veresegMentDb: jest.fn(() => Promise.resolve()),
    gyozelemMentDb: jest.fn(() => Promise.resolve()),
    dontetlenMentDb: jest.fn(() => Promise.resolve()),
    eloFrissitDb: jest.fn(() => Promise.resolve()),
    eloLekerdezDb: jest.fn(() => Promise.resolve(1500)),
    meccsekSzamDb: jest.fn(() => Promise.resolve(50)),
    buildPgnLikeFromMoves: jest.fn(() => Promise.resolve('1. e4 *'))
}));

const { jatekLetrehoz } = require('../chess/state.js');
const { jatekUjraIndit, legalLepesekKliens, lepesKoordinataval } = require('../chess/engine.js');

describe('jatekUjraIndit — startup', () => {
    test('64 mezo + alapfelallas teljes (32 babu)', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        expect(jatek.tabla.length).toBe(64);
        const piecesOnBoard = jatek.tabla.filter(m => m.piece);
        expect(piecesOnBoard.length).toBe(32);
    });

    test('white kovetkezik elsonek', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        expect(jatek.koronLevo).toBe('white');
    });

    test('lepesszam = 0 init', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        expect(jatek.lepesszam).toBe(0);
        expect(jatek.felLepes).toBe(0);
    });

    test('alapallas: kiraly e1/e8 helyen', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        const whiteKing = jatek.tabla.find(m => m.piece && m.piece.type === 'king' && m.piece.color === 'white');
        const blackKing = jatek.tabla.find(m => m.piece && m.piece.type === 'king' && m.piece.color === 'black');
        expect(whiteKing.x).toBe(4); expect(whiteKing.y).toBe(7);
        expect(blackKing.x).toBe(4); expect(blackKing.y).toBe(0);
    });

    test('alapallas: vezerek d1/d8 helyen', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        const whiteQueen = jatek.tabla.find(m => m.piece && m.piece.type === 'queen' && m.piece.color === 'white');
        const blackQueen = jatek.tabla.find(m => m.piece && m.piece.type === 'queen' && m.piece.color === 'black');
        expect(whiteQueen.x).toBe(3); expect(whiteQueen.y).toBe(7);
        expect(blackQueen.x).toBe(3); expect(blackQueen.y).toBe(0);
    });

    test('alapallas: 8-8 gyalog 2.es 7. soron', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        const whitePawns = jatek.tabla.filter(m => m.piece && m.piece.type === 'pawn' && m.piece.color === 'white');
        const blackPawns = jatek.tabla.filter(m => m.piece && m.piece.type === 'pawn' && m.piece.color === 'black');
        expect(whitePawns.length).toBe(8);
        expect(blackPawns.length).toBe(8);
        for (const p of whitePawns) expect(p.y).toBe(6);
        for (const p of blackPawns) expect(p.y).toBe(1);
    });

    test('alapallas: 2-2 bastya, 2-2 huszar, 2-2 futo, 1-1 kiraly+vezer per szin', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        const counts = (color, type) => jatek.tabla.filter(m => m.piece && m.piece.type === type && m.piece.color === color).length;
        for (const color of ['white', 'black']) {
            expect(counts(color, 'rook')).toBe(2);
            expect(counts(color, 'knight')).toBe(2);
            expect(counts(color, 'bishop')).toBe(2);
            expect(counts(color, 'queen')).toBe(1);
            expect(counts(color, 'king')).toBe(1);
        }
    });

    test('mode-uj inditasal pozicioTortenet alaphash-szal kezd', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        expect(jatek.pozicioTortenet.length).toBe(1);
    });

    test('lepesTortenet ures', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        expect(jatek.lepesTortenet).toEqual([]);
    });

    test('jatek.vege = false init', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatek.vege = true; // szennyezz be
        jatekUjraIndit(jatek);
        expect(jatek.vege).toBe(false);
    });

    test('mezo.pos algebrai jelolessel beallitva', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        // a8 = x=0, y=0
        const a8 = jatek.tabla.find(m => m.x === 0 && m.y === 0);
        expect(a8.pos).toBe('a8');
        // h1 = x=7, y=7
        const h1 = jatek.tabla.find(m => m.x === 7 && m.y === 7);
        expect(h1.pos).toBe('h1');
    });
});

describe('legalLepesekKliens — kliens lepes-lookup', () => {
    test('ures mezore → []', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        // (4, 4) = e4 ures
        expect(legalLepesekKliens(jatek, 4, 4)).toEqual([]);
    });

    test('ellenfel babujara → [] (csak sajat lephet)', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        // koronLevo = 'white', de fekete gyalog (1, 1)-en
        expect(legalLepesekKliens(jatek, 1, 1)).toEqual([]);
    });

    test('saját gyalog (e2): 2 lepes — 1 vagy 2 mezot', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        // (4, 6) = e2
        const lepesek = legalLepesekKliens(jatek, 4, 6);
        expect(lepesek.length).toBe(2);
        const targets = lepesek.map(l => `${l.toX},${l.toY}`);
        expect(targets).toContain('4,5'); // e3
        expect(targets).toContain('4,4'); // e4
    });

    test('huszar 2 lepes: b1 → a3 / c3', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        // (1, 7) = b1
        const lepesek = legalLepesekKliens(jatek, 1, 7);
        expect(lepesek.length).toBe(2);
    });

    test('blokkolt futo (alapallas) → 0 lepes', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        // (2, 7) = c1 — blokkolva
        expect(legalLepesekKliens(jatek, 2, 7)).toEqual([]);
    });

    test('koordinatak megjelennek a lepesben', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        const lepesek = legalLepesekKliens(jatek, 4, 6);
        for (const l of lepesek) {
            expect(typeof l.toX).toBe('number');
            expect(typeof l.toY).toBe('number');
            expect(typeof l.tipus).toBe('string');
            expect(typeof l.promotion).toBe('boolean');
        }
    });

    test('out-of-range mezo → []', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        expect(legalLepesekKliens(jatek, -1, 0)).toEqual([]);
        expect(legalLepesekKliens(jatek, 99, 99)).toEqual([]);
    });
});

describe('lepesKoordinataval — illegal lepes elutasitva', () => {
    test('illegal lepes → success:false', async () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        // (4, 6) → (4, 3) — 3 mezos gyalog-lepes nem szabalyos
        const r = await lepesKoordinataval(jatek, 4, 6, 4, 3, 'queen');
        expect(r.success).toBe(false);
    });

    test('legal e2-e4 kovetkezik', async () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        const r = await lepesKoordinataval(jatek, 4, 6, 4, 4, 'queen');
        expect(r.success).toBe(true);
        expect(jatek.koronLevo).toBe('black'); // valt kor
        expect(jatek.lepesszam).toBe(1);
    });

    test('illegal lepes ures mezorol → success:false', async () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        const r = await lepesKoordinataval(jatek, 4, 4, 4, 3, 'queen');
        expect(r.success).toBe(false);
    });
});
