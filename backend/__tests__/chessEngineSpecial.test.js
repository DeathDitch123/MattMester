/**
 * chess/engine.js — special-move tesztek (castling, en passant, promotion).
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
const { jatekUjraIndit, lepesKoordinataval, legalLepesekKliens } = require('../chess/engine.js');
const { mezoTamadva, szabLepKeres } = require('../chess/logika.js');

function freshGame() {
    const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
    jatekUjraIndit(jatek);
    return jatek;
}

function clearBoard(jatek) {
    for (const m of jatek.tabla) m.piece = null;
}

function place(jatek, x, y, type, color, hasMoved = false, id = Math.random()) {
    const m = jatek.tabla[y * 8 + x];
    m.piece = { type, color, hasMoved, id, square: m };
    return m.piece;
}

describe('Sancolas (castling)', () => {
    test('ksancolas king-side e1 → g1, bastya h1 → f1', async () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        place(j, 7, 7, 'rook', 'white');
        place(j, 4, 0, 'king', 'black');

        const r = await lepesKoordinataval(j, 4, 7, 6, 7, 'queen');
        expect(r.success).toBe(true);
        // Kiraly g1-en (x=6, y=7), bastya f1-en (x=5, y=7)
        const king = j.tabla.find(m => m.piece && m.piece.type === 'king' && m.piece.color === 'white');
        const rook = j.tabla.find(m => m.piece && m.piece.type === 'rook' && m.piece.color === 'white');
        expect(king.x).toBe(6); expect(king.y).toBe(7);
        expect(rook.x).toBe(5); expect(rook.y).toBe(7);
    });

    test('qsancolas queen-side e1 → c1, bastya a1 → d1', async () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        place(j, 0, 7, 'rook', 'white');
        place(j, 4, 0, 'king', 'black');

        const r = await lepesKoordinataval(j, 4, 7, 2, 7, 'queen');
        expect(r.success).toBe(true);
        const king = j.tabla.find(m => m.piece && m.piece.type === 'king' && m.piece.color === 'white');
        const rook = j.tabla.find(m => m.piece && m.piece.type === 'rook' && m.piece.color === 'white');
        expect(king.x).toBe(2); expect(king.y).toBe(7);
        expect(rook.x).toBe(3); expect(rook.y).toBe(7);
    });

    test('sancolas blokkolva ha kozti mezo elfoglalt (h-file futo b1-en)', () => {
        const j = freshGame();
        // Alapallasban a kiraly nem tud sancolni mert a kozti mezok blokkoltak
        const lepesek = legalLepesekKliens(j, 4, 7);
        const castleMoves = lepesek.filter(l => l.tipus === 'castle');
        expect(castleMoves.length).toBe(0);
    });

    test('sancolas tilos sakk alatt', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        place(j, 7, 7, 'rook', 'white');
        // Fekete bastya e-fileon — sakkban a fehér király
        place(j, 4, 0, 'rook', 'black');
        place(j, 0, 0, 'king', 'black');

        const lepesek = legalLepesekKliens(j, 4, 7);
        const castleMoves = lepesek.filter(l => l.tipus === 'castle');
        expect(castleMoves.length).toBe(0);
    });

    test('sancolas tilos a kiraly mar mozgott', () => {
        const j = freshGame();
        clearBoard(j);
        const king = place(j, 4, 7, 'king', 'white', true); // hasMoved=true
        place(j, 7, 7, 'rook', 'white');
        place(j, 4, 0, 'king', 'black');

        const lepesek = legalLepesekKliens(j, 4, 7);
        const castleMoves = lepesek.filter(l => l.tipus === 'castle');
        expect(castleMoves.length).toBe(0);
    });

    test('sancolas tilos a bastya mar mozgott', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        place(j, 7, 7, 'rook', 'white', true); // hasMoved=true
        place(j, 4, 0, 'king', 'black');

        const lepesek = legalLepesekKliens(j, 4, 7);
        const castleMoves = lepesek.filter(l => l.tipus === 'castle');
        expect(castleMoves.length).toBe(0);
    });
});

describe('En passant', () => {
    test('en passant teljes mukodes', async () => {
        const j = freshGame();
        // Setup: feher gyalog e5, fekete gyalog d7 d5-osen lep at — feher en passant lephet
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        place(j, 4, 0, 'king', 'black');
        place(j, 4, 3, 'pawn', 'white'); // e5
        const blackPawn = place(j, 3, 1, 'pawn', 'black'); // d7

        // Fekete koren: d7 → d5 (double move) — beallitja az enPassant mezot
        j.koronLevo = 'black';
        const r1 = await lepesKoordinataval(j, 3, 1, 3, 3, 'queen');
        expect(r1.success).toBe(true);
        expect(j.enPassant).toEqual({ x: 3, y: 2 });

        // Feher koren: e5 → d6 (en passant) — fekete d5 gyalog levesz
        const r2 = await lepesKoordinataval(j, 4, 3, 3, 2, 'queen');
        expect(r2.success).toBe(true);
        // Fekete d-pawn eltunik
        const blackPawnMezo = j.tabla[3 * 8 + 3]; // d5
        expect(blackPawnMezo.piece).toBeNull();
    });

    test('en passant ablak 1 lepes (utana lejar)', async () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        place(j, 4, 0, 'king', 'black');
        place(j, 4, 3, 'pawn', 'white');
        place(j, 3, 1, 'pawn', 'black');
        place(j, 0, 6, 'pawn', 'white');

        j.koronLevo = 'black';
        await lepesKoordinataval(j, 3, 1, 3, 3, 'queen'); // d7-d5
        // Feher kovetkezik — ne en passant-t lepjen
        await lepesKoordinataval(j, 0, 6, 0, 5, 'queen'); // a2-a3
        // En passant ablak lezarult
        expect(j.enPassant).toBeNull();
    });
});

describe('Promotion (gyalogatvaltozas)', () => {
    test('feher gyalog e7 → e8 = vezer', async () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        place(j, 0, 0, 'king', 'black');
        place(j, 4, 1, 'pawn', 'white'); // e7

        const r = await lepesKoordinataval(j, 4, 1, 4, 0, 'queen');
        expect(r.success).toBe(true);
        const promotionField = j.tabla[0 * 8 + 4]; // e8
        expect(promotionField.piece.type).toBe('queen');
        expect(promotionField.piece.color).toBe('white');
    });

    test('atvaltozas knight-ra (alulpromocio)', async () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        place(j, 0, 0, 'king', 'black');
        place(j, 4, 1, 'pawn', 'white');

        await lepesKoordinataval(j, 4, 1, 4, 0, 'knight');
        const promotionField = j.tabla[0 * 8 + 4];
        expect(promotionField.piece.type).toBe('knight');
    });

    test('atvaltozas rook-ra', async () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        place(j, 0, 0, 'king', 'black');
        place(j, 4, 1, 'pawn', 'white');

        await lepesKoordinataval(j, 4, 1, 4, 0, 'rook');
        expect(j.tabla[0 * 8 + 4].piece.type).toBe('rook');
    });

    test('atvaltozas bishop-ra', async () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        place(j, 0, 0, 'king', 'black');
        place(j, 4, 1, 'pawn', 'white');

        await lepesKoordinataval(j, 4, 1, 4, 0, 'bishop');
        expect(j.tabla[0 * 8 + 4].piece.type).toBe('bishop');
    });

    test('legalLepesek mutatja a promotion flag-et', () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        place(j, 0, 0, 'king', 'black');
        place(j, 4, 1, 'pawn', 'white');

        const lepesek = legalLepesekKliens(j, 4, 1);
        const promotionLepes = lepesek.find(l => l.toX === 4 && l.toY === 0);
        expect(promotionLepes.promotion).toBe(true);
    });
});

describe('hasMoved tracking — sancolas + en passant kovetelmenyhez', () => {
    test('kiraly elso mozgasanal hasMoved → true', async () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        place(j, 4, 0, 'king', 'black');

        const king = j.tabla[7 * 8 + 4].piece;
        expect(king.hasMoved).toBe(false);
        await lepesKoordinataval(j, 4, 7, 4, 6, 'queen');
        const newKing = j.tabla[6 * 8 + 4].piece;
        expect(newKing.hasMoved).toBe(true);
    });

    test('bastya elso mozgasanal hasMoved → true', async () => {
        const j = freshGame();
        clearBoard(j);
        place(j, 4, 7, 'king', 'white');
        place(j, 4, 0, 'king', 'black');
        place(j, 0, 7, 'rook', 'white');

        await lepesKoordinataval(j, 0, 7, 0, 5, 'queen');
        const movedRook = j.tabla[5 * 8 + 0].piece;
        expect(movedRook.hasMoved).toBe(true);
    });
});
