/**
 * Bug 2026-05-04 — fix #3 regresszio-vedelem: a `nevekFrissit` mostantol
 * meghivja a `.app.classList.toggle('flipped', kellFlippelni())`-t, igy a
 * CSS-szabaly (`.app.flipped { ... order: ... }`) kepes felcsere lni a
 * topbar/bottombar pozicioit.
 *
 * Forras-ellenorzes (file regex), nem DOM teszt — a main.js egy ES module
 * ami nem importalhato Node-ban koznvetlenul.
 */

const fs = require('fs');
const path = require('path');

const MAIN_JS_PATH = path.resolve(__dirname, '..', 'chess_barold', 'javascript', 'main.js');
const mainJs = fs.readFileSync(MAIN_JS_PATH, 'utf8');

function extractFunctionBody(source, name) {
    const startIdx = source.indexOf(`function ${name}(`);
    if (startIdx === -1) return null;
    const openBrace = source.indexOf('{', startIdx);
    if (openBrace === -1) return null;
    let depth = 1;
    let i = openBrace + 1;
    while (i < source.length && depth > 0) {
        const ch = source[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
    }
    return source.substring(openBrace + 1, i - 1);
}

describe('main.js#nevekFrissit — `.app.flipped` class toggle (Bug #3)', () => {
    const torzs = extractFunctionBody(mainJs, 'nevekFrissit');

    test('a `nevekFrissit` letezik a forrasban', () => {
        expect(torzs).not.toBeNull();
    });

    test('a `nevekFrissit` lekerdezi a `.app` elemet', () => {
        expect(torzs).toMatch(/document\.querySelector\(['"]\.app['"]\)/);
    });

    test('a `nevekFrissit` meghivja a `kellFlippelni`-t', () => {
        expect(torzs).toMatch(/kellFlippelni\s*\(/);
    });

    test('a `nevekFrissit` togglelja a `flipped` class-t a `.app`-on', () => {
        // Eltelfogadhato barmelyik szintaxis:
        //   classList.toggle('flipped', condition)  vagy
        //   if (...) classList.add('flipped') / else classList.remove('flipped')
        const usesToggle = /classList\.toggle\(['"]flipped['"]/.test(torzs);
        const usesAdd = /classList\.add\(['"]flipped['"]/.test(torzs);
        const usesRemove = /classList\.remove\(['"]flipped['"]/.test(torzs);
        expect(usesToggle || (usesAdd && usesRemove)).toBe(true);
    });
});
