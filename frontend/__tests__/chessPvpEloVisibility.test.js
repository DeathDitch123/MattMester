/**
 * Bug 2026-05-04 — ranked PvP meccs vegen NEM jelent meg az ELO valtozas (+12 / -8 stb).
 * Felhasznaloi panasz: "nem szamolja az elo-t a játek az elo-s modokban".
 *
 * Ok: a `pvpJatekVege(data)` (main.js) eddig csak az `eloValtozasFrissit`-et
 * hivta, ami a `#elo-change` divbe ir. Az viszont a `.sidebar`-ban van, ami
 * `display: none`. A kovetkezesul a felhasznalo nem latott ELO-t a meccs
 * vegen. (A backend kiszamolta es DB-be is irta, csak a UI nem mutatta.)
 *
 * Fix: `pvpJatekVege` mostantol meghivja a `gameEndModalMegnyit`-et is, ami
 * a `#gameEndElo` mezobe irja a delta-t a modal-ban. Ezek a tesztek a logika-
 * adatfolyamot ellenorzik:
 *   - a backend `eloValtozas: { white, black }` payload-jat
 *   - a kliens `data.eloValtozas[sajatSzin]` extractolasat
 *   - a modal-szovegformatumot
 */

// pvpJatekVege ELO-extractor logika ujraepitese (csak az adatfolyam resz).
function extractEloChangeForSelf(data, sajatSzin) {
    if (!data || !data.eloValtozas) return null;
    return data.eloValtozas[sajatSzin] || null;
}

// gameEndModalMegnyit ELO-formatum logika (chessGameEndModal.test.js-bol).
function formatEloChange(eloValtozas) {
    if (!eloValtozas || typeof eloValtozas !== 'object') return null;
    const before = eloValtozas.eloBefore ?? eloValtozas.before;
    const after  = eloValtozas.eloAfter  ?? eloValtozas.after;
    if (typeof before !== 'number' || typeof after !== 'number') return null;
    const diff = after - before;
    const sign = diff >= 0 ? '+' : '';
    return `ELO: ${before} → ${after} (${sign}${diff})`;
}

describe('PvP game-end ELO adatfolyam (backend -> kliens -> modal)', () => {
    test('casual meccs (eloValtozas null): nincs ELO sor', () => {
        const data = { uzenet: 'matt', eredmeny: 'white', eloValtozas: null };
        const eloSelf = extractEloChangeForSelf(data, 'white');
        expect(eloSelf).toBeNull();
        expect(formatEloChange(eloSelf)).toBeNull();
    });

    test('ranked white nyer (+12): a sajat mezobol veszunk ki, modal "+12" mutat', () => {
        const data = {
            uzenet: 'matt',
            eredmeny: 'white',
            eloValtozas: {
                white: { eloBefore: 1200, eloAfter: 1212, eloChange: 12 },
                black: { eloBefore: 1300, eloAfter: 1288, eloChange: -12 }
            }
        };
        const eloSelfWhite = extractEloChangeForSelf(data, 'white');
        expect(eloSelfWhite).toEqual({ eloBefore: 1200, eloAfter: 1212, eloChange: 12 });
        expect(formatEloChange(eloSelfWhite)).toBe('ELO: 1200 → 1212 (+12)');
    });

    test('ranked black veszt (-12): a sajat mezobol veszunk ki, modal "-12" mutat', () => {
        const data = {
            uzenet: 'matt',
            eredmeny: 'white',
            eloValtozas: {
                white: { eloBefore: 1200, eloAfter: 1212, eloChange: 12 },
                black: { eloBefore: 1300, eloAfter: 1288, eloChange: -12 }
            }
        };
        const eloSelfBlack = extractEloChangeForSelf(data, 'black');
        expect(eloSelfBlack).toEqual({ eloBefore: 1300, eloAfter: 1288, eloChange: -12 });
        expect(formatEloChange(eloSelfBlack)).toBe('ELO: 1300 → 1288 (-12)');
    });

    test('ranked dontetlen (0 valtozas): "+0" pozitiv jelolessel', () => {
        const data = {
            eloValtozas: {
                white: { eloBefore: 1500, eloAfter: 1500, eloChange: 0 },
                black: { eloBefore: 1500, eloAfter: 1500, eloChange: 0 }
            }
        };
        expect(formatEloChange(extractEloChangeForSelf(data, 'white')))
            .toBe('ELO: 1500 → 1500 (+0)');
    });
});

describe('pvp/pvpJatek.js#pvpJatekVege regresszio-vedelem (gameEndModalMegnyit hivasa)', () => {
    // A bug forrasa az volt, hogy a `pvpJatekVege` NEM hivta a
    // `gameEndModalMegnyit`-et — a modal csak bot-meccs vegen nyilt meg
    // (`jatekVegeUI`). A javitasban a hivasnak ott kell lennie.
    // Refactor: a `pvpJatekVege` mostantol a `pvp/pvpJatek.js` modulban van.
    const fs = require('fs');
    const path = require('path');
    const PVP_JATEK_PATH = path.resolve(__dirname, '..', 'chess_barold', 'javascript', 'pvp', 'pvpJatek.js');
    const mainJs = fs.readFileSync(PVP_JATEK_PATH, 'utf8');

    test('a fajl tartalmazza a `function pvpJatekVege(` definiciot', () => {
        expect(mainJs).toMatch(/(?:export\s+)?function\s+pvpJatekVege\s*\(/);
    });

    test('a `pvpJatekVege` torzse meghivja a `gameEndModalMegnyit`-et', () => {
        // Tartomany-extrakcio: a `function pvpJatekVege(` -tol a kovetkezo
        // top-szintu `}\n` zarasig. (Egyszeru regex eleg, mert a fuggveny
        // viszonylag rovid es nincs benne nested function.)
        const startIdx = mainJs.search(/(?:export\s+)?function\s+pvpJatekVege\s*\(/);
        expect(startIdx).toBeGreaterThan(-1);
        // Olvassuk a torzset brace-szamlalassal
        const openBrace = mainJs.indexOf('{', startIdx);
        let depth = 1;
        let i = openBrace + 1;
        while (i < mainJs.length && depth > 0) {
            const ch = mainJs[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        const torzs = mainJs.substring(openBrace + 1, i - 1);
        expect(torzs).toMatch(/gameEndModalMegnyit\s*\(/);
    });
});
