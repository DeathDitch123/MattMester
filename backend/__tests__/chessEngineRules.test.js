/**
 * chess/engine.js — szabaly-lifecycle tesztek (50-lepes szabaly, haromszori ismetles).
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
const { jatekUjraIndit, lepesKoordinataval } = require('../chess/engine.js');

function freshGame() {
    const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
    jatekUjraIndit(jatek);
    return jatek;
}

describe('felLepes (50-lepes szabaly) tracking', () => {
    test('gyalog lepes → felLepes reset (0)', async () => {
        const j = freshGame();
        j.felLepes = 50;
        await lepesKoordinataval(j, 4, 6, 4, 4, 'queen'); // e2-e4
        expect(j.felLepes).toBe(0);
    });

    test('huszar lepes (nem gyalog, nem utes) → felLepes++', async () => {
        const j = freshGame();
        // (1, 7) = b1 huszar; b1 → c3 = (2, 5)
        const before = j.felLepes;
        await lepesKoordinataval(j, 1, 7, 2, 5, 'queen');
        expect(j.felLepes).toBe(before + 1);
    });

    test('utes → felLepes reset', async () => {
        const j = freshGame();
        // Helyezzunk fekete babut a (4, 6) szomszedjaba hogy a feher utni tudjon
        // Egyszerubb: kezzel allitok be egy utheto poziciot
        for (const m of j.tabla) m.piece = null;
        j.tabla[7 * 8 + 4].piece = { type: 'king', color: 'white', hasMoved: false, id: 1, square: j.tabla[7 * 8 + 4] };
        j.tabla[0 * 8 + 4].piece = { type: 'king', color: 'black', hasMoved: false, id: 2, square: j.tabla[0 * 8 + 4] };
        j.tabla[3 * 8 + 4].piece = { type: 'queen', color: 'white', hasMoved: false, id: 3, square: j.tabla[3 * 8 + 4] };
        j.tabla[3 * 8 + 0].piece = { type: 'rook', color: 'black', hasMoved: false, id: 4, square: j.tabla[3 * 8 + 0] };
        j.felLepes = 30;
        // Vezer e5 utes a4-en
        await lepesKoordinataval(j, 4, 3, 0, 3, 'queen');
        expect(j.felLepes).toBe(0); // utes reset
    });
});

describe('pozicioTortenet — haromszori ismetles tracking', () => {
    test('minden lepes hash-t hozzaad', async () => {
        const j = freshGame();
        const startLen = j.pozicioTortenet.length;
        await lepesKoordinataval(j, 4, 6, 4, 4, 'queen'); // e2-e4
        expect(j.pozicioTortenet.length).toBe(startLen + 1);
    });

    test('huszar oda-vissza ismetlesi mintak generaltak', async () => {
        const j = freshGame();
        // (1, 7) → (2, 5) → vissza (csak feher, fekete kor)
        const startLen = j.pozicioTortenet.length;
        // Feher: b1-c3
        await lepesKoordinataval(j, 1, 7, 2, 5, 'queen');
        // Fekete: b8-c6
        await lepesKoordinataval(j, 1, 0, 2, 2, 'queen');
        // Feher: c3-b1
        await lepesKoordinataval(j, 2, 5, 1, 7, 'queen');
        // Fekete: c6-b8
        await lepesKoordinataval(j, 2, 2, 1, 0, 'queen');
        // Most a kezdoallashoz hasonlot kapunk vissza
        expect(j.pozicioTortenet.length).toBeGreaterThan(startLen);
    });
});

describe('lepesszam tracking', () => {
    test('minden sikeres lepes utan novekszik', async () => {
        const j = freshGame();
        expect(j.lepesszam).toBe(0);
        await lepesKoordinataval(j, 4, 6, 4, 4, 'queen');
        expect(j.lepesszam).toBe(1);
        await lepesKoordinataval(j, 4, 1, 4, 3, 'queen');
        expect(j.lepesszam).toBe(2);
    });

    test('illegal lepes NEM novelti', async () => {
        const j = freshGame();
        await lepesKoordinataval(j, 4, 6, 4, 4, 'queen');
        const before = j.lepesszam;
        await lepesKoordinataval(j, 4, 6, 4, 4, 'queen'); // ures mezo most
        expect(j.lepesszam).toBe(before);
    });
});

describe('lepesTortenet tartalom', () => {
    test('minden lepes hozza adja az entry-t (san + check + mate)', async () => {
        const j = freshGame();
        await lepesKoordinataval(j, 4, 6, 4, 4, 'queen'); // e2-e4
        expect(j.lepesTortenet).toHaveLength(1);
        const e = j.lepesTortenet[0];
        expect(e.san).toBeDefined();
        expect(e.color).toBe('white');
        expect(typeof e.check).toBe('boolean');
        expect(typeof e.mate).toBe('boolean');
    });

    test('SAN "e4" formatum az elso lepesnel', async () => {
        const j = freshGame();
        await lepesKoordinataval(j, 4, 6, 4, 4, 'queen');
        expect(j.lepesTortenet[0].san).toBe('e4');
    });

    test('SAN "Nf3" huszar-lepesnel', async () => {
        const j = freshGame();
        // g1-f3
        await lepesKoordinataval(j, 6, 7, 5, 5, 'queen');
        expect(j.lepesTortenet[0].san).toBe('Nf3');
    });

    test('koronLevo valt minden sikeres lepessel', async () => {
        const j = freshGame();
        expect(j.koronLevo).toBe('white');
        await lepesKoordinataval(j, 4, 6, 4, 4, 'queen');
        expect(j.koronLevo).toBe('black');
        await lepesKoordinataval(j, 4, 1, 4, 3, 'queen');
        expect(j.koronLevo).toBe('white');
    });
});

describe('ellenfel koreben sajat babu nem mozog', () => {
    test('feher kor — fekete babu mozdulasa illegal', async () => {
        const j = freshGame();
        // koronLevo=white, feher gyalog mozog... nem black
        const r = await lepesKoordinataval(j, 4, 1, 4, 3, 'queen');
        expect(r.success).toBe(false);
    });

    test('fekete kor — feher babu mozdulasa illegal', async () => {
        const j = freshGame();
        await lepesKoordinataval(j, 4, 6, 4, 4, 'queen'); // e2-e4 → black kovetkezik
        const r = await lepesKoordinataval(j, 0, 6, 0, 4, 'queen'); // feher a-pawn? Black kor!
        expect(r.success).toBe(false);
    });
});
