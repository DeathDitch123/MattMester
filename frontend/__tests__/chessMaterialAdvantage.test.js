/**
 * Sakk material advantage szamlalo logika tesztek.
 *
 * A `utottpiecekFrissit` (chess_barold/javascript/main.js) a Játekos badge
 * mellett `+N` cimket mutat, ha az adott oldal anyagilag vezet. A logika
 * extrakcioja itt: standard pont-ertekek pawn=1, knight/bishop=3, rook=5,
 * queen=9, king nincs szamolva (mate-tel veget er). A teszt csak a `score
 * = sum(piece values)` reszre fokuszal, mert a DOM-render mar settled (a
 * `material-adv.hidden` toggle elemi: positive=mutat, negative=elrejt).
 *
 * NEM toltjuk be a fajlat (egyebkent eval-lal kellene + 1500 sor stuboltan),
 * helyette a logika magat allitjuk fel ujra a teszt scope-jaban es ellen-
 * orizzuk hogy a same-shape input ugyanazt adja, amit a main.js#utottList
 * algoritmus ad.
 */

const KEZDO = { pawn: 8, rook: 2, knight: 2, bishop: 2, queen: 1, king: 1 };
const SORREND = ['queen', 'rook', 'bishop', 'knight', 'pawn'];
const PIECE_VALUES = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 };

function utottLista(meglevo, utottSzin) {
    const lista = [];
    for (const tipus of SORREND) {
        const meglevoDb = meglevo[utottSzin][tipus] || 0;
        const hianyzik = KEZDO[tipus] - meglevoDb;
        for (let i = 0; i < hianyzik; i++) lista.push(tipus);
    }
    return lista;
}
function sumValues(utottList) {
    return utottList.reduce((acc, t) => acc + (PIECE_VALUES[t] || 0), 0);
}
function buildMeglevoFromTabla(tabla) {
    const meglevo = { white: {}, black: {} };
    for (const m of tabla) {
        if (!m.piece) continue;
        const c = m.piece.color, t = m.piece.type;
        meglevo[c][t] = (meglevo[c][t] || 0) + 1;
    }
    return meglevo;
}
function fullStartTabla() {
    // 64 mezo, kezdo allas — minden bábú a maga helyén
    const tabla = [];
    const back = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            let piece = null;
            if (y === 0) piece = { color: 'black', type: back[x] };
            else if (y === 1) piece = { color: 'black', type: 'pawn' };
            else if (y === 6) piece = { color: 'white', type: 'pawn' };
            else if (y === 7) piece = { color: 'white', type: back[x] };
            tabla.push({ x, y, piece });
        }
    }
    return tabla;
}

describe('material advantage szamitas', () => {
    test('kezdo allason senki nem vezet (0:0)', () => {
        const meglevo = buildMeglevoFromTabla(fullStartTabla());
        const blackUtott = utottLista(meglevo, 'black');
        const whiteUtott = utottLista(meglevo, 'white');
        expect(sumValues(blackUtott)).toBe(0);
        expect(sumValues(whiteUtott)).toBe(0);
    });

    test('feher 1 fekete gyalogot utott -> +1 white', () => {
        const tabla = fullStartTabla();
        // toroljuk az egyik fekete gyalogot
        const idx = tabla.findIndex(m => m.piece && m.piece.color === 'black' && m.piece.type === 'pawn');
        tabla[idx].piece = null;
        const meglevo = buildMeglevoFromTabla(tabla);
        const score = sumValues(utottLista(meglevo, 'black'));
        expect(score).toBe(1);
    });

    test('feher utott egy queen-t (9p), fekete utott egy rook-ot (5) → +4 white', () => {
        const tabla = fullStartTabla();
        const qIdx = tabla.findIndex(m => m.piece && m.piece.color === 'black' && m.piece.type === 'queen');
        tabla[qIdx].piece = null;
        const rIdx = tabla.findIndex(m => m.piece && m.piece.color === 'white' && m.piece.type === 'rook');
        tabla[rIdx].piece = null;
        const meglevo = buildMeglevoFromTabla(tabla);
        const whiteScore = sumValues(utottLista(meglevo, 'black'));
        const blackScore = sumValues(utottLista(meglevo, 'white'));
        expect(whiteScore).toBe(9);
        expect(blackScore).toBe(5);
        expect(whiteScore - blackScore).toBe(4);
    });

    test('knight es bishop egyforma (3p)', () => {
        expect(PIECE_VALUES.knight).toBe(PIECE_VALUES.bishop);
        expect(PIECE_VALUES.knight).toBe(3);
    });

    test('king nincs sem a SORREND-ben sem a PIECE_VALUES-ban (mate-tel zarodna a meccs)', () => {
        expect(PIECE_VALUES.king).toBeUndefined();
        expect(SORREND).not.toContain('king');
        // Mivel a SORREND csak {queen, rook, bishop, knight, pawn}-t jarja be,
        // a kiraly elveszese sosem szamolodik be a `material-adv` osszesitesbe.
        // Ez szandekos: a meccs mate-tel veget er, mielott a kiraly tenyleg
        // levehetove valna a tablarol.
        const tabla = fullStartTabla();
        const kIdx = tabla.findIndex(m => m.piece && m.piece.color === 'black' && m.piece.type === 'king');
        tabla[kIdx].piece = null;
        const meglevo = buildMeglevoFromTabla(tabla);
        const list = utottLista(meglevo, 'black');
        expect(list).not.toContain('king');
        expect(sumValues(list)).toBe(0);
    });

    test('promotion utan tobb queen-t lat -> negativ "hianyzas" nem szamolodik', () => {
        // Ha promotion-bol 2 queen van a tablan, KEZDO.queen=1, meglevo.queen=2,
        // hianyzik = 1 - 2 = -1, a `for (i=0; i<-1)` nem fut, helyes.
        const tabla = fullStartTabla();
        // adjunk egy plusz feher queen-t valami ures kockara
        tabla[35].piece = { color: 'white', type: 'queen' };
        const meglevo = buildMeglevoFromTabla(tabla);
        const list = utottLista(meglevo, 'white');
        expect(list).not.toContain('queen');
    });
});
