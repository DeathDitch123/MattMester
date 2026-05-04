/**
 * Sakk game-end modal: ELO formatumozas + display tesztek.
 *
 * A `gameEndModalMegnyit(uzenet, eloValtozas)` (main.js) ket fő mukodest
 * csinal: 1) szovegeket beirja a modalba, 2) eloValtozas eseten szamol
 * delta-t es formaz "ELO: X → Y (+N / -N)" cimket. A teszt pure logikaval
 * (nem DOM-mal) az ELO szamitast es a formatumot ellenorzi.
 */

function formatEloChange(eloValtozas) {
    if (!eloValtozas || typeof eloValtozas !== 'object') return null;
    const before = eloValtozas.eloBefore ?? eloValtozas.before;
    const after  = eloValtozas.eloAfter  ?? eloValtozas.after;
    if (typeof before !== 'number' || typeof after !== 'number') return null;
    const diff = after - before;
    const sign = diff >= 0 ? '+' : '';
    return {
        text: `ELO: ${before} → ${after} (${sign}${diff})`,
        positive: diff >= 0,
        negative: diff < 0
    };
}

describe('formatEloChange — game-end modal ELO cimke', () => {
    test('null / undefined / nem-objektum -> null (nincs ELO sor)', () => {
        expect(formatEloChange(null)).toBeNull();
        expect(formatEloChange(undefined)).toBeNull();
        expect(formatEloChange(42)).toBeNull();
    });

    test('hianyzo before/after -> null (casual mod, nincs ELO frissites)', () => {
        expect(formatEloChange({ eloBefore: 1500 })).toBeNull();
        expect(formatEloChange({ eloAfter: 1520 })).toBeNull();
        expect(formatEloChange({})).toBeNull();
    });

    test('nyertes feher (+20) -> "ELO: 1500 → 1520 (+20)" + positive', () => {
        const r = formatEloChange({ eloBefore: 1500, eloAfter: 1520 });
        expect(r.text).toBe('ELO: 1500 → 1520 (+20)');
        expect(r.positive).toBe(true);
        expect(r.negative).toBe(false);
    });

    test('vesztes (-15) -> "ELO: 1500 → 1485 (-15)" + negative', () => {
        const r = formatEloChange({ eloBefore: 1500, eloAfter: 1485 });
        expect(r.text).toBe('ELO: 1500 → 1485 (-15)');
        expect(r.positive).toBe(false);
        expect(r.negative).toBe(true);
    });

    test('dontetlen (0 valtozas) -> "(+0)" + positive (nem negative)', () => {
        const r = formatEloChange({ eloBefore: 1500, eloAfter: 1500 });
        expect(r.text).toBe('ELO: 1500 → 1500 (+0)');
        expect(r.positive).toBe(true);
        expect(r.negative).toBe(false);
    });

    test('alternativ kulcsok (before/after — nem eloBefore/eloAfter) is mukodik', () => {
        const r = formatEloChange({ before: 1200, after: 1218 });
        expect(r.text).toBe('ELO: 1200 → 1218 (+18)');
    });

    test('eloBefore eloAfter elsobbsegi a before/after-rel szemben (ha mindketto van)', () => {
        const r = formatEloChange({ eloBefore: 1500, eloAfter: 1520, before: 999, after: 999 });
        expect(r.text).toBe('ELO: 1500 → 1520 (+20)');
    });
});
