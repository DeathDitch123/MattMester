/**
 * ELO szamitas egyseg-tesztek (chess/elo.js).
 *
 * Lefedi az osszes K-faktor agat:
 *   - K=40 (osszMeccs < 10, kezdo)
 *   - K=20 (standard)
 *   - K=10 (nagymester, 2400+)
 *
 * Plusz: szimmetria (feher+fekete = 0 zero-sum-jellegu),
 * minimum-clamp (100 alatt nem mehet),
 * dontetlen vs azonos ELO = 0 valtozas, stb.
 */

const { KEZDO_ELO, eloSzamit, eloMeccsEredmeny } = require('../chess/elo.js');

describe('elo/KEZDO_ELO', () => {
    test('a kezdo ELO 800', () => {
        expect(KEZDO_ELO).toBe(800);
    });
});

describe('elo/eloSzamit — K-faktor agak', () => {
    test('K=40 ha osszMeccs < 10 (kezdo gyors-beallas)', () => {
        // Azonos ELO + gyozelem: varhato=0.5, valtozas = 40*(1-0.5) = 20
        const r = eloSzamit(800, 800, 1, 5);
        expect(r.valtozas).toBe(20);
        expect(r.ujElo).toBe(820);
    });

    test('K=20 ha 10 <= osszMeccs es elo < 2400 (standard)', () => {
        const r = eloSzamit(800, 800, 1, 50);
        expect(r.valtozas).toBe(10); // 20 * 0.5
        expect(r.ujElo).toBe(810);
    });

    test('K=10 ha jatekosElo >= 2400 (nagymester)', () => {
        const r = eloSzamit(2400, 2400, 1, 100);
        expect(r.valtozas).toBe(5); // 10 * 0.5
        expect(r.ujElo).toBe(2405);
    });

    test('a 2400-as hatar inkluziv (a 2400 mar K=10)', () => {
        const r = eloSzamit(2400, 1000, 0, 100); // azonos, varhato kb 1
        // Csak ellenorzes hogy a K-faktor=10 ag aktivalodik
        expect(Math.abs(r.valtozas)).toBeLessThanOrEqual(10);
    });

    test('a 2399-es elo meg K=20 (standard)', () => {
        const r = eloSzamit(2399, 2399, 1, 50);
        expect(r.valtozas).toBe(10);
    });
});

describe('elo/eloSzamit — varhato eredmeny es szimmetria', () => {
    test('azonos ELO + dontetlen = 0 valtozas', () => {
        const r = eloSzamit(1500, 1500, 0.5, 50);
        expect(r.valtozas).toBe(0);
        expect(r.ujElo).toBe(1500);
    });

    test('alacsonyabb ELO ellen veresegrol nagy mientes', () => {
        // 1600 vs 1200 (varhato: kb 0.91), veresseg: valtozas = 20*(0-0.91) = -18.2 → -18
        const r = eloSzamit(1600, 1200, 0, 50);
        expect(r.valtozas).toBeLessThan(-15);
        expect(r.ujElo).toBeLessThan(1600);
    });

    test('magasabb ELO elleni gyozelem nagy bonus', () => {
        // 1200 vs 1600: varhato: kb 0.09, gyozelem: valtozas = 20*(1-0.09) = 18
        const r = eloSzamit(1200, 1600, 1, 50);
        expect(r.valtozas).toBeGreaterThan(15);
        expect(r.ujElo).toBeGreaterThan(1200);
    });

    test('zero-sum jellegu: dontetlen kulonbozo eloval', () => {
        // 1200 vs 1600 dontetlen → alacsonyabbak nyer kb +9, magasabb veszit kb -9
        const a = eloSzamit(1200, 1600, 0.5, 50);
        const b = eloSzamit(1600, 1200, 0.5, 50);
        expect(a.valtozas).toBeGreaterThan(0);
        expect(b.valtozas).toBeLessThan(0);
        expect(Math.abs(a.valtozas + b.valtozas)).toBeLessThanOrEqual(1); // round eltolas
    });
});

describe('elo/eloSzamit — minimum-clamp (100 alatt nem mehet)', () => {
    test('extremen alacsony ELO + ket szintnyi veresseg → 100 minimum', () => {
        // 110 ELO vs 50 ELO veresseg: varhato ~0.913, change ~-18, ujElo = 92 → clamp 100
        const r = eloSzamit(110, 50, 0, 50);
        expect(r.ujElo).toBe(100);
        expect(r.valtozas).toBeLessThan(-10);
    });

    test('100 ELO + tovabbi veresseg → marad 100', () => {
        const r = eloSzamit(100, 2400, 0, 50);
        expect(r.ujElo).toBe(100);
    });

    test('99 ELO eseten is 100-ra clamp-elunk', () => {
        const r = eloSzamit(99, 2400, 0, 50);
        // a varhato kb 0, valtozas 0 → ujElo = 99 → clamp 100
        expect(r.ujElo).toBe(100);
    });
});

describe('elo/eloMeccsEredmeny — meccs-eredmeny dispatching', () => {
    test('white nyer: fehér +pont, fekete -pont', () => {
        const r = eloMeccsEredmeny(1500, 1500, 'white', 50, 50);
        expect(r.feher.valtozas).toBeGreaterThan(0);
        expect(r.fekete.valtozas).toBeLessThan(0);
    });

    test('black nyer: fekete +pont, feher -pont', () => {
        const r = eloMeccsEredmeny(1500, 1500, 'black', 50, 50);
        expect(r.feher.valtozas).toBeLessThan(0);
        expect(r.fekete.valtozas).toBeGreaterThan(0);
    });

    test('draw: azonos ELO eseten 0 mindkettonel', () => {
        const r = eloMeccsEredmeny(1500, 1500, 'draw', 50, 50);
        expect(r.feher.valtozas).toBe(0);
        expect(r.fekete.valtozas).toBe(0);
    });

    test('mindket jatekos sajat K-faktort kap', () => {
        // feher 5 meccs = K=40; fekete 50 meccs = K=20
        const r = eloMeccsEredmeny(1500, 1500, 'white', 5, 50);
        expect(r.feher.valtozas).toBe(20); // 40 * 0.5
        expect(r.fekete.valtozas).toBe(-10); // 20 * 0.5
    });

    test('default meccsszam (99) eseten K=20 fele', () => {
        const r = eloMeccsEredmeny(1500, 1500, 'white');
        expect(r.feher.valtozas).toBe(10);
        expect(r.fekete.valtozas).toBe(-10);
    });
});

describe('elo — boundary + idempotencia', () => {
    test('eloSzamit nem mutalja az inputot', () => {
        const a = 1500;
        eloSzamit(a, 1500, 1, 50);
        expect(a).toBe(1500);
    });

    test('eloMeccsEredmeny nem mutalja az inputot', () => {
        const fa = 1500, fb = 1500;
        eloMeccsEredmeny(fa, fb, 'draw', 50, 50);
        expect(fa).toBe(1500);
        expect(fb).toBe(1500);
    });

    test('ismeretlen eredmeny a "draw" agba esik', () => {
        // a kod eredmeny !== white && !== black eseten draw-kent kezel
        const r = eloMeccsEredmeny(1500, 1500, 'unknown', 50, 50);
        expect(r.feher.valtozas).toBe(0);
        expect(r.fekete.valtozas).toBe(0);
    });
});
