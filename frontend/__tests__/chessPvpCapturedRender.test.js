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

const MAIN_JS_PATH    = path.resolve(__dirname, '..', 'chess_barold', 'javascript', 'main.js');
const ALLAPOT_JS_PATH = path.resolve(__dirname, '..', 'chess_barold', 'javascript', 'allapot.js');
const PVP_JATEK_PATH  = path.resolve(__dirname, '..', 'chess_barold', 'javascript', 'pvp', 'pvpJatek.js');
const mainJs    = fs.readFileSync(MAIN_JS_PATH, 'utf8');
const allapotJs = fs.readFileSync(ALLAPOT_JS_PATH, 'utf8');
const pvpJatekJs = fs.readFileSync(PVP_JATEK_PATH, 'utf8');

function extractFunctionBody(source, name) {
    // Refactor: az `allapotFrissit` mostantol az `allapot.js` modulban van,
    // `export function` szintaxissal. Mindket variast keressuk.
    let startIdx = source.indexOf(`export function ${name}(`);
    if (startIdx === -1) startIdx = source.indexOf(`function ${name}(`);
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

describe('pvp/pvpJatek.js#pvpAllapotFrissit -- captured-panel render hivasa', () => {
    // Refactor: a `pvpAllapotFrissit` mostantol a `pvp/pvpJatek.js` modulban van.
    const torzs = extractFunctionBody(pvpJatekJs, 'pvpAllapotFrissit');

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

describe('allapot.js#allapotFrissit (kozos render-orchestrator) -- regresszio-vedelem', () => {
    // Refactor: az `allapotFrissit` az `allapot.js` modulba mozdult.
    const torzs = extractFunctionBody(allapotJs, 'allapotFrissit');

    test('a fuggveny meghivja az utottpiecekFrissit-et — ne torjon el', () => {
        expect(torzs).not.toBeNull();
        expect(torzs).toMatch(/utottpiecekFrissit\s*\(/);
    });
});
