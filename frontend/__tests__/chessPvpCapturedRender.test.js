/**
 * Bug 2026-05-04 — PvP meccsen a "Leutott babuk" panel sosem jelent meg.
 * Felhasznaloi panasz: "nem mukodik a babu leutes ful, nem rakja oda a babukat".
 *
 * Ok: a `pvpAllapotFrissit(allapot)` (main.js) csak a tablat, neveket es az
 * ELO sort frissitette — a `utottpiecekFrissit(allapot)` hivas hianyzott.
 * Ezek a tesztek a regressziot vedik (regex-ellenorzes a forrasban).
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

describe('main.js#pvpAllapotFrissit -- captured-panel render hivasa', () => {
    const torzs = extractFunctionBody(mainJs, 'pvpAllapotFrissit');

    test('a `pvpAllapotFrissit` fuggveny letezik a forrasban', () => {
        expect(torzs).not.toBeNull();
        expect(torzs.length).toBeGreaterThan(50);
    });

    test('a `pvpAllapotFrissit` meghivja az `utottpiecekFrissit`-et (PvP captured render)', () => {
        // Pre-fix: ez a hivas hianyzott a PvP-agbol, ezert a #captured-panel
        // PvP meccs alatt sosem rajzolt babukat. Post-fix: kotelezo hivas.
        expect(torzs).toMatch(/utottpiecekFrissit\s*\(/);
    });

    test('a `pvpAllapotFrissit` meghivja a `nevekFrissit`-et (regresszio-vedelem)', () => {
        expect(torzs).toMatch(/nevekFrissit\s*\(/);
    });

    test('a `pvpAllapotFrissit` meghivja a `tablaRajzol`-t (regresszio-vedelem)', () => {
        expect(torzs).toMatch(/tablaRajzol\s*\(/);
    });
});

describe('main.js#allapotFrissit (bot-ag) -- regresszio-vedelem', () => {
    const torzs = extractFunctionBody(mainJs, 'allapotFrissit');

    test('a bot-ag mar korabban is hivta az utottpiecekFrissit-et — ne torjon el', () => {
        expect(torzs).not.toBeNull();
        expect(torzs).toMatch(/utottpiecekFrissit\s*\(/);
    });
});
