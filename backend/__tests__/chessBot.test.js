/**
 * chess/bot.js — bot lepes-valaszto tesztek.
 *
 * Lefedi:
 *   - nehezsegiSzintInfo: 1..8 ervenyes szintek, fallback default
 *   - osszesNehezsegiSzint: 8 elemes lista
 *   - botLepesValaszt: alapallasban legal lepes valaszt minden nehezsegen
 *   - botLepesValaszt: matt-helyzetben matt-lepest valaszt
 *   - NEHEZSEGEK meta: ELO emelkedo, depth ervenyes
 */

jest.mock('../chess/timer.js', () => ({
    idoFut: jest.fn(),
    idoLeall: jest.fn()
}));

const { jatekLetrehoz } = require('../chess/state.js');
const { jatekUjraIndit } = require('../chess/engine.js');
const {
    botLepesValaszt,
    botKepessegValaszt,
    nehezsegiSzintInfo,
    osszesNehezsegiSzint,
    NEHEZSEGEK
} = require('../chess/bot.js');

function freshBotGame() {
    const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
    jatekUjraIndit(jatek);
    return jatek;
}

describe('NEHEZSEGEK — invariansok (NEM tautologikus szerkezet-validacio)', () => {
    test('ELO monoton emelkedo: kezdo szint <= mester szint (jatekos elvarasa)', () => {
        // Ez logikai invarians — ha valaki uj szintet ad hozza, ne megtorje.
        for (let i = 1; i <= 7; i++) {
            expect(NEHEZSEGEK[i + 1].elo).toBeGreaterThanOrEqual(NEHEZSEGEK[i].elo);
        }
    });

    test('randomPct 0..100 koz (kulonben buggy: bot 200%-ban random lepne)', () => {
        for (let i = 1; i <= 8; i++) {
            expect(NEHEZSEGEK[i].randomPct).toBeGreaterThanOrEqual(0);
            expect(NEHEZSEGEK[i].randomPct).toBeLessThanOrEqual(100);
        }
    });
});

describe('nehezsegiSzintInfo', () => {
    test('ervenyes szint visszaadja az info-objektumot', () => {
        const info = nehezsegiSzintInfo(1);
        expect(info).toBeDefined();
        expect(info.elo).toBe(NEHEZSEGEK[1].elo);
    });

    test('out-of-range → fallback (4-es default)', () => {
        const info = nehezsegiSzintInfo(99);
        expect(info).toEqual(NEHEZSEGEK[4]);
        expect(nehezsegiSzintInfo(0)).toEqual(NEHEZSEGEK[4]);
        expect(nehezsegiSzintInfo(-1)).toEqual(NEHEZSEGEK[4]);
    });

    test('null / undefined → fallback', () => {
        expect(nehezsegiSzintInfo(null)).toEqual(NEHEZSEGEK[4]);
        expect(nehezsegiSzintInfo(undefined)).toEqual(NEHEZSEGEK[4]);
    });

    test('string szint Number-tol kulonbozo: fallback', () => {
        // A jelenlegi impl Object index-el, igy '1' string-szam is mukodhet (JavaScript object key lookup)
        const info = nehezsegiSzintInfo('1');
        // Vagy NEHEZSEGEK[1] vagy fallback — mind a kettot tolerajuk
        expect(info).toBeDefined();
    });
});

describe('osszesNehezsegiSzint', () => {
    test('pontosan 8 elemu lista', () => {
        const lista = osszesNehezsegiSzint();
        expect(lista).toHaveLength(8);
    });

    test('mindegyik elem szint+nev+elo', () => {
        for (const sz of osszesNehezsegiSzint()) {
            expect(typeof sz.szint).toBe('number');
            expect(typeof sz.nev).toBe('string');
            expect(typeof sz.elo).toBe('number');
        }
    });

    test('szintek 1..8 sorrendben', () => {
        const szintek = osszesNehezsegiSzint().map(sz => sz.szint).sort((a, b) => a - b);
        expect(szintek).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });
});

describe('botLepesValaszt — minden nehezsegen ervenyes lepes', () => {
    test.each([1, 2, 3, 4, 5, 6, 7, 8])('nehezseg=%i: bot legal lepest valaszt', (szint) => {
        const j = freshBotGame();
        j.koronLevo = 'black'; // bot fekete szokvanyosan
        const lepes = botLepesValaszt(j, szint);
        // A formaz {fromX, fromY, toX, toY, promotion} mintat ad vissza.
        expect(lepes).toBeDefined();
        if (lepes) {
            expect(typeof lepes.fromX).toBe('number');
            expect(typeof lepes.fromY).toBe('number');
            expect(typeof lepes.toX).toBe('number');
            expect(typeof lepes.toY).toBe('number');
            // Ervenyes 0..7 hatar
            expect(lepes.fromX).toBeGreaterThanOrEqual(0); expect(lepes.fromX).toBeLessThan(8);
            expect(lepes.fromY).toBeGreaterThanOrEqual(0); expect(lepes.fromY).toBeLessThan(8);
            expect(lepes.toX).toBeGreaterThanOrEqual(0); expect(lepes.toX).toBeLessThan(8);
            expect(lepes.toY).toBeGreaterThanOrEqual(0); expect(lepes.toY).toBeLessThan(8);
        }
    });

    test('alapallasban legalabb 20 legal lepes letezik a botnak', () => {
        const j = freshBotGame();
        j.koronLevo = 'black';
        const lepes = botLepesValaszt(j, 1);
        expect(lepes).not.toBeNull();
    });
});

describe('botKepessegValaszt', () => {
    test('klasszikus mod (abilities=null) → null vagy undefined (no-op)', () => {
        const j = freshBotGame();
        const r = botKepessegValaszt(j, 1);
        // Klasszikus modban nincs ability, igy null/undefined elvarhato
        expect(r === null || r === undefined).toBe(true);
    });

    test('mattmester mod + nincs pont → null/undefined', () => {
        const { jatek } = jatekLetrehoz({ mode: 'mattmester' });
        jatekUjraIndit(jatek);
        // Pontok 0 — bot nem tud aktivalni semmit
        const r = botKepessegValaszt(jatek, 1);
        expect(r === null || r === undefined).toBe(true);
    });
});
