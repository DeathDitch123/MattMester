/**
 * chess/state.js — game-state egyseg-tesztek.
 *
 * Lefedi:
 *   - jatekLetrehoz: id-novekmeny, mode-validacio, ranked auto-detekt
 *   - jatekKeres: ervenyes id, nem-letezo id
 *   - jatekTorol: timer cleanup
 *   - mezoKeres: hatar-validacio
 *   - jatekAllapotKliens: nincs SAN-szi vargas, lepesTortenet slim
 *   - abilitiesAlapallapot: minden mezo init
 */

jest.mock('../chess/timer.js', () => ({
    idoFut: jest.fn(),
    idoLeall: jest.fn()
}));

const { jatekLetrehoz, jatekKeres, jatekTorol, mezoKeres, jatekAllapotKliens, abilitiesAlapallapot } = require('../chess/state.js');
const { jatekUjraIndit } = require('../chess/engine.js');

describe('jatekLetrehoz — uj jatek inicializalas', () => {
    test('mind az 5 mode-ot el lehet inditani', () => {
        for (const mode of ['mattmester', 'mattmester_10p', 'klasszikus', 'klasszikus_10p', 'blitz']) {
            const { gameId, jatek } = jatekLetrehoz({ mode });
            expect(gameId).toBeGreaterThan(0);
            expect(jatek.mode).toBe(mode);
            jatekTorol(gameId);
        }
    });

    test('ervenytelen mode → DEFAULT_MODE-ra esik', () => {
        const { jatek } = jatekLetrehoz({ mode: 'invalid_xyz' });
        expect(['mattmester', 'mattmester_10p', 'klasszikus', 'klasszikus_10p', 'blitz']).toContain(jatek.mode);
    });

    test('hianyzo opciok → DEFAULT_MODE + ranked allowed', () => {
        const { jatek } = jatekLetrehoz();
        expect(jatek.mode).toBeDefined();
        expect(jatek.lepesTortenet).toEqual([]);
    });

    test('id minden uj meccsel novekszik', () => {
        const a = jatekLetrehoz({ mode: 'klasszikus' });
        const b = jatekLetrehoz({ mode: 'klasszikus' });
        expect(b.gameId).toBeGreaterThan(a.gameId);
        jatekTorol(a.gameId);
        jatekTorol(b.gameId);
    });

    test('ranked toggle: igy nem kerul ranked-be vegtelen ido (mattmester ∞)', () => {
        const { jatek } = jatekLetrehoz({ mode: 'mattmester', ranked: true });
        // mattmester rankedAllowed=false, igy ranked le-state-elodik
        expect(jatek.ranked).toBe(false);
    });

    test('idokorlatos mode + ranked=true → ranked=true', () => {
        const { jatek } = jatekLetrehoz({ mode: 'blitz', ranked: true });
        expect(jatek.ranked).toBe(true);
    });

    test('explicit ranked=false override-olja a default-ot', () => {
        const { jatek } = jatekLetrehoz({ mode: 'blitz', ranked: false });
        expect(jatek.ranked).toBe(false);
    });

    test('abilities: csak mattmester modokban inicializalva', () => {
        const a = jatekLetrehoz({ mode: 'mattmester' });
        const b = jatekLetrehoz({ mode: 'klasszikus' });
        expect(a.jatek.abilitiesEnabled).toBe(true);
        expect(b.jatek.abilitiesEnabled).toBe(false);
        // Klasszikus modban abilities=null
        expect(b.jatek.abilities).toBeNull();
    });

    test('idoStart a mode-ido alapjan', () => {
        const a = jatekLetrehoz({ mode: 'blitz' });
        expect(a.jatek.jatekosok.white.ido).toBe(300);
        expect(a.jatek.jatekosok.black.ido).toBe(300);
        const b = jatekLetrehoz({ mode: 'mattmester' });
        expect(b.jatek.jatekosok.white.ido).toBeNull();
    });

    test('PvP mezok kezdetben null/false', () => {
        const { jatek } = jatekLetrehoz();
        expect(jatek.pvpAktiv).toBe(false);
        expect(jatek.pvpStatusz).toBeNull();
        expect(jatek.disconnectTimer).toBeNull();
    });

    test('bot mezok kezdetben null/false', () => {
        const { jatek } = jatekLetrehoz();
        expect(jatek.botAktiv).toBe(false);
        expect(jatek.botSzin).toBeNull();
        expect(jatek.nehezseg).toBeNull();
    });
});

describe('jatekKeres — lookup', () => {
    test('letezo id → jatek-objektum', () => {
        const { gameId } = jatekLetrehoz({ mode: 'klasszikus' });
        const j = jatekKeres(gameId);
        expect(j).not.toBeNull();
        jatekTorol(gameId);
    });

    test('nem-letezo id → null', () => {
        expect(jatekKeres(99999)).toBeNull();
        expect(jatekKeres(0)).toBeNull();
        expect(jatekKeres(-1)).toBeNull();
    });

    test('torolt jatek → null', () => {
        const { gameId } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekTorol(gameId);
        expect(jatekKeres(gameId)).toBeNull();
    });
});

describe('jatekTorol — cleanup', () => {
    test('ervenyetlen id-ra no-op (nem dob)', () => {
        expect(() => jatekTorol(99999)).not.toThrow();
        expect(() => jatekTorol(null)).not.toThrow();
    });
});

describe('mezoKeres — koordinata-hatar', () => {
    test('ervenyes koordinata visszaadja a mezot', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        const m = mezoKeres(jatek, 4, 4);
        expect(m).not.toBeNull();
        expect(m.x).toBe(4);
        expect(m.y).toBe(4);
    });

    test('out-of-range x → null', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        expect(mezoKeres(jatek, -1, 4)).toBeNull();
        expect(mezoKeres(jatek, 8, 4)).toBeNull();
    });

    test('out-of-range y → null', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        expect(mezoKeres(jatek, 4, -1)).toBeNull();
        expect(mezoKeres(jatek, 4, 8)).toBeNull();
    });
});

describe('jatekAllapotKliens — kliens-biztos szerializacio', () => {
    test('alap-mezok elerhetoek', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        const a = jatekAllapotKliens(jatek);
        expect(a.gameId).toBe(jatek.gameId);
        expect(a.koronLevo).toBe('white');
        expect(a.vege).toBe(false);
        expect(a.lepesszam).toBe(0);
        expect(Array.isArray(a.tabla)).toBe(true);
        expect(a.tabla.length).toBe(64);
    });

    test('NEM kuld piece.id-t a kliensnek (anti-cheat)', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        const a = jatekAllapotKliens(jatek);
        for (const m of a.tabla) {
            if (m.piece) {
                expect(m.piece.id).toBeUndefined();
                expect(m.piece.hasMoved).toBeUndefined();
            }
        }
    });

    test('lepesTortenet slim formaban (csak color + san)', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        // Manualisan adjunk hozza egy entry-t
        jatek.lepesTortenet.push({
            from: { x: 4, y: 6 }, to: { x: 4, y: 4 },
            piece: 'pawn', color: 'white',
            captured: null, special: 'double',
            san: 'e4', check: false, mate: false
        });
        const a = jatekAllapotKliens(jatek);
        expect(a.lepesTortenet).toHaveLength(1);
        expect(a.lepesTortenet[0]).toEqual({ color: 'white', san: 'e4' });
        // from/to/captured NEM kerul ki a klienshez
        expect(a.lepesTortenet[0].from).toBeUndefined();
        expect(a.lepesTortenet[0].captured).toBeUndefined();
    });

    test('ido kuldese (kliens countdown-hoz)', () => {
        const { jatek } = jatekLetrehoz({ mode: 'blitz' });
        jatekUjraIndit(jatek);
        const a = jatekAllapotKliens(jatek);
        expect(a.ido.white).toBe(300);
        expect(a.ido.black).toBe(300);
    });

    test('vegtelen ido (mattmester) → null', () => {
        const { jatek } = jatekLetrehoz({ mode: 'mattmester' });
        jatekUjraIndit(jatek);
        const a = jatekAllapotKliens(jatek);
        expect(a.ido.white).toBeNull();
        expect(a.ido.black).toBeNull();
    });

    test('abilities: klasszikus modban null', () => {
        const { jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        const a = jatekAllapotKliens(jatek);
        expect(a.abilities).toBeNull();
    });

    test('abilities: mattmester modban kuldve', () => {
        const { jatek } = jatekLetrehoz({ mode: 'mattmester' });
        jatekUjraIndit(jatek);
        const a = jatekAllapotKliens(jatek);
        expect(a.abilities).not.toBeNull();
        expect(a.abilities.points).toEqual({ white: 0, black: 0 });
    });
});

describe('abilitiesAlapallapot — abilities init', () => {
    test('minden szubmezo letezik', () => {
        const a = abilitiesAlapallapot();
        expect(a.points).toEqual({ white: 0, black: 0 });
        expect(a.used).toEqual({ white: {}, black: {} });
        expect(a.cooldowns).toEqual({ white: {}, black: {} });
        expect(a.effects).toBeDefined();
        expect(a.effects.frozenPieces).toEqual([]);
        expect(a.effects.shieldedPieces).toEqual([]);
        expect(a.effects.demotedPieces).toEqual([]);
        expect(a.effects.blockedUntilMs).toEqual({ white: null, black: null });
        expect(a.effects.pausedUntilMs).toEqual({ white: null, black: null });
    });

    test('uj instance kulonbozo referencia (nem osztott)', () => {
        const a = abilitiesAlapallapot();
        const b = abilitiesAlapallapot();
        a.points.white = 5;
        expect(b.points.white).toBe(0);
    });
});
