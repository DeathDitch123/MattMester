/**
 * Sakk ora-format tesztek — vegtelen ido (∞) mp-ben.
 *
 * Az UI-megjelenites.js#idoFrissit es ket main.js#format kozos szabaly:
 *  - null / undefined / Infinity / NaN -> '∞'
 *  - kulonben "perc:masodperc(2-digit)"
 *
 * A logika dupla / triplikalt — fizikailag harom helyen van. Ezert egy
 * pure helper-t allitunk fel ide, ami ugyanazt a szabalyt kovetoi, es
 * ellenorizzuk a viselkedest a hatar-esetekre.
 */

function format(mp) {
    if (mp === null || mp === undefined || !Number.isFinite(mp)) return '∞';
    const perc = Math.floor(mp / 60);
    const masodperc = mp % 60;
    return `${perc}:${masodperc.toString().padStart(2, '0')}`;
}

describe('format(mp) — sakk ora-format', () => {
    test('null -> ∞ (vegtelen idős mod)', () => {
        expect(format(null)).toBe('∞');
    });
    test('undefined -> ∞', () => {
        expect(format(undefined)).toBe('∞');
    });
    test('Infinity -> ∞', () => {
        expect(format(Infinity)).toBe('∞');
    });
    test('NaN -> ∞ (vedo ag elrontott szam ellen)', () => {
        expect(format(NaN)).toBe('∞');
    });
    test('0 mp -> "0:00" (nem ∞ — az ora kifutott)', () => {
        expect(format(0)).toBe('0:00');
    });
    test('59 mp -> "0:59"', () => {
        expect(format(59)).toBe('0:59');
    });
    test('60 mp -> "1:00"', () => {
        expect(format(60)).toBe('1:00');
    });
    test('600 mp -> "10:00" (10p kezdo blitz)', () => {
        expect(format(600)).toBe('10:00');
    });
    test('5 mp -> "0:05" (paddingelt masodperc)', () => {
        expect(format(5)).toBe('0:05');
    });
    test('3661 mp -> "61:01" (60+ perc is OK, nem ora-konvertalt)', () => {
        expect(format(3661)).toBe('61:01');
    });
});
