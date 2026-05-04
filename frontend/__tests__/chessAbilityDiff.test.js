/**
 * Sakk ability-diff detektor logika tesztek.
 *
 * Az `abilities.js#detektalUjabbAbilityHasznalat` ket allapot kozott vizsgalja:
 * ha barmelyik szin (`white` / `black`) `used[key]` szamlaloja novekedett, az
 * azt jelenti, hogy az adott szin most aktivalt egy kepesseget. Ezt hasznaljuk
 * az opponent ability-flash animaciohoz + hang lejatszashoz (mind PvP-n mind
 * bot-meccsen, mert mindketto ugyanezt a state.abilities.used struktural mezot
 * frissiti).
 *
 * A logika pure (allapot1 + allapot2 -> diff lista). Nem kell DOM. Itt a
 * pure verziot allitjuk fel ujra es ellenorizzuk a hatar-eseteket.
 */

function diffNewAbilityUses(elozo, uj, cfgKeys) {
    const events = [];
    if (!uj || !uj.abilities) return events;
    const oldalak = ['white', 'black'];
    for (const oldal of oldalak) {
        const elozoUsed = (elozo && elozo.abilities && elozo.abilities.used && elozo.abilities.used[oldal]) || {};
        const ujUsed = uj.abilities.used[oldal] || {};
        for (const key of cfgKeys) {
            const before = elozoUsed[key] || 0;
            const after = ujUsed[key] || 0;
            if (after > before) events.push({ oldal, key, delta: after - before });
        }
    }
    return events;
}

const CFG_KEYS = ['time_pause', 'freeze', 'swap', 'board_hide', 'shield', 'lefokozas'];

function emptyAbilitiesState() {
    return {
        abilities: {
            points: { white: 0, black: 0 },
            cooldowns: { white: {}, black: {} },
            used: { white: {}, black: {} },
            effects: { frozenPieces: [], shieldedPieces: [], demotedPieces: [], blockedUntilMs: { white: 0, black: 0 } }
        }
    };
}

describe('diffNewAbilityUses — opp/sajat ability aktivalas detektor', () => {
    test('nincs valtozas -> ures lista', () => {
        const a = emptyAbilitiesState();
        const b = emptyAbilitiesState();
        expect(diffNewAbilityUses(a, b, CFG_KEYS)).toEqual([]);
    });

    test('elozo allapot null (elso tick) -> ures lista', () => {
        const b = emptyAbilitiesState();
        expect(diffNewAbilityUses(null, b, CFG_KEYS)).toEqual([]);
    });

    test('elozo allapot abilities=null -> ures (a kliens ide-oda kapcsolasakor)', () => {
        const b = emptyAbilitiesState();
        expect(diffNewAbilityUses({}, b, CFG_KEYS)).toEqual([]);
    });

    test('uj allapot abilities=null (klasszikus mod) -> ures', () => {
        const a = emptyAbilitiesState();
        expect(diffNewAbilityUses(a, {}, CFG_KEYS)).toEqual([]);
    });

    test('feher hasznalt freeze-t (0 -> 1) -> 1 esemeny', () => {
        const a = emptyAbilitiesState();
        const b = emptyAbilitiesState();
        b.abilities.used.white.freeze = 1;
        const ev = diffNewAbilityUses(a, b, CFG_KEYS);
        expect(ev).toEqual([{ oldal: 'white', key: 'freeze', delta: 1 }]);
    });

    test('fekete hasznalt shieldet (bot-meccs: 0 -> 1) -> 1 esemeny opp oldalon', () => {
        const a = emptyAbilitiesState();
        const b = emptyAbilitiesState();
        b.abilities.used.black.shield = 1;
        const ev = diffNewAbilityUses(a, b, CFG_KEYS);
        expect(ev.length).toBe(1);
        expect(ev[0].oldal).toBe('black');
        expect(ev[0].key).toBe('shield');
    });

    test('mindket szin egyszerre (ket round egyutt feldolgozva) -> 2 esemeny', () => {
        const a = emptyAbilitiesState();
        const b = emptyAbilitiesState();
        b.abilities.used.white.freeze = 1;
        b.abilities.used.black.lefokozas = 1;
        const ev = diffNewAbilityUses(a, b, CFG_KEYS);
        expect(ev.length).toBe(2);
    });

    test('csokkenes (ami sosem fordulhat elo) -> nem detektaljuk', () => {
        const a = emptyAbilitiesState();
        a.abilities.used.white.freeze = 2;
        const b = emptyAbilitiesState();
        b.abilities.used.white.freeze = 1; // anomalis csokkenes
        expect(diffNewAbilityUses(a, b, CFG_KEYS)).toEqual([]);
    });

    test('hianyzo `used` mezo a config-bol (cfgKeys-ben uj key, de nincs hasznalat) -> ures', () => {
        const a = emptyAbilitiesState();
        const b = emptyAbilitiesState();
        const ev = diffNewAbilityUses(a, b, ['osmertelen_uj_kepesseg']);
        expect(ev).toEqual([]);
    });

    test('delta nagyobb mint 1 (egy tick alatt 2-vel nott) -> delta=2 esemeny', () => {
        const a = emptyAbilitiesState();
        a.abilities.used.white.swap = 1;
        const b = emptyAbilitiesState();
        b.abilities.used.white.swap = 3; // 2-vel nott (ritka, de meglehet ha laggol)
        const ev = diffNewAbilityUses(a, b, CFG_KEYS);
        expect(ev[0].delta).toBe(2);
    });
});
