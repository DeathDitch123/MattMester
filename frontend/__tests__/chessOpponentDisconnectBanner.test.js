/**
 * Bug 2026-05-04 — "Connection lost" banner az ellenfelnel disconnect alatt.
 *
 * Felhasznaloi keres: az ellenfelnel latszodjon hogy connection lost es
 * hogy visszaszamol az 1 perc.
 *
 * Bug-pre-fix: a `#opponent-disconnected` elem a `.sidebar`-ban volt,
 * a sidebar `display: none` miatt LATHATATLAN. A javitas: `position: fixed`
 * banner a viewport teteje kozepen, chess.com-szeru piros pulzalo dot-tal +
 * `m:ss` formatum countdown.
 */

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(
    path.resolve(__dirname, '..', 'chess_barold', 'html', 'chess.html'),
    'utf8'
);
const CSS = fs.readFileSync(
    path.resolve(__dirname, '..', 'chess_barold', 'css', 'chess.css'),
    'utf8'
);
const MAIN_JS = fs.readFileSync(
    path.resolve(__dirname, '..', 'chess_barold', 'javascript', 'main.js'),
    'utf8'
);
// Refactor: a `pvpJatekVege` mostantol a `pvp/pvpJatek.js` modulban van.
const PVP_JATEK_JS = fs.readFileSync(
    path.resolve(__dirname, '..', 'chess_barold', 'javascript', 'pvp', 'pvpJatek.js'),
    'utf8'
);

describe('chess.html — opponent-disconnected banner DOM', () => {
    test('a banner kezdoleg `hidden` class-szal van (csak disconnect alatt latszodjon)', () => {
        expect(HTML).toMatch(/id=["']opponent-disconnected["']\s+class=["']opponent-dc hidden["']/);
    });

    test('a banner role="status" + aria-live (akadalymentesseg)', () => {
        expect(HTML).toMatch(/id=["']opponent-disconnected["'][^>]*role=["']status["']/);
        expect(HTML).toMatch(/id=["']opponent-disconnected["'][^>]*aria-live=/);
    });

    test('a banner alapertelmezes szovege "Ellenfel kapcsolata megszakadt"-szeru', () => {
        // Az `Ellenfel kapcsolata megszakadt` (vagy hasonlo) frazisnak meg kell
        // jelennie a banner-ben — a "Ellenfel kikapcsolt..." nem eleg vilagos.
        // A `class="opponent-dc hidden"` az aktual banner-element azonositoja
        // (NEM az eltavolitas-utasi komment!).
        const re = /id="opponent-disconnected"\s+class="opponent-dc hidden"/;
        const match = HTML.match(re);
        expect(match).not.toBeNull();
        const idx = match.index;
        const blokk = HTML.substring(idx, Math.min(idx + 600, HTML.length));
        expect(blokk).toMatch(/(Ellenf[eé]l|connection|kapcsolat)/i);
    });

    test('a banner BODY-szinten van (NEM a sidebar-on belul) — display:none parent fix', () => {
        // Regen a sidebar-ban volt, parent `display: none` miatt rejtve maradt
        // a `position: fixed` ellenere is. Mostantol a body-ban, sibling-je
        // a `.app`-nak. A test biztositja, hogy a `<aside class="sidebar">`
        // tartomanyaban NINCS opponent-disconnected element.
        const sidebarStart = HTML.indexOf('<aside class="sidebar">');
        const sidebarEnd = HTML.indexOf('</aside>', sidebarStart);
        if (sidebarStart > -1 && sidebarEnd > -1) {
            const sidebarBlock = HTML.substring(sidebarStart, sidebarEnd);
            expect(sidebarBlock).not.toMatch(/id="opponent-disconnected"/);
        }
    });

    test('a banner kezdoertek `1:00` (m:ss formatum, nem `60`)', () => {
        const idx = HTML.indexOf('id="dc-countdown"');
        expect(idx).toBeGreaterThan(-1);
        const blokk = HTML.substring(idx, idx + 80);
        // 1:00 vagy 0:60 valamelyike — m:ss formatumu kezdoertek.
        expect(blokk).toMatch(/[01]:\d{2}/);
    });
});

describe('chess.css — opponent-disconnected banner fixed-position styling', () => {
    test('.opponent-dc fixed-position (NEM sidebar belso)', () => {
        // A regi szabaly margin/padding/border volt, sidebar belso. A javitas
        // `position: fixed`-szel a viewport-hoz rogziti, hogy lathato legyen.
        const ruleMatch = CSS.match(/\.opponent-dc\s*\{[\s\S]*?\}/);
        expect(ruleMatch).not.toBeNull();
        expect(ruleMatch[0]).toMatch(/position\s*:\s*fixed/);
    });

    test('.opponent-dc magas z-index (a tabla + chooser felett)', () => {
        const ruleMatch = CSS.match(/\.opponent-dc\s*\{[\s\S]*?\}/);
        const zMatch = ruleMatch[0].match(/z-index\s*:\s*(\d+)/);
        expect(zMatch).not.toBeNull();
        const z = Number(zMatch[1]);
        // Chooser z-index: 1080. A banner-nek nagyobbnak kell lennie.
        expect(z).toBeGreaterThan(1080);
    });

    test('.opponent-dc piros border (urgency-jelzes)', () => {
        const ruleMatch = CSS.match(/\.opponent-dc\s*\{[\s\S]*?\}/);
        // accent-red token vagy a hex/rgb #ef4444-szeru piros.
        expect(ruleMatch[0]).toMatch(/border[^;]*?(accent-red|#ef4444|rgba?\(\s*239)/i);
    });

    test('.opponent-dc::before pulzalo dot (vizualis "live" jelzes)', () => {
        expect(CSS).toMatch(/\.opponent-dc::before\s*\{/);
        // A pulzalo animacio kulcssza
        expect(CSS).toMatch(/@keyframes\s+opponentDcDot/);
    });

    test('.opponent-dc maga is pulzal (banner-szintu animacio)', () => {
        expect(CSS).toMatch(/@keyframes\s+opponentDcPulse/);
    });

    test('#dc-countdown monospace + nagyobb font (olvashato szam)', () => {
        const ruleMatch = CSS.match(/#dc-countdown\s*\{[\s\S]*?\}/);
        expect(ruleMatch).not.toBeNull();
        expect(ruleMatch[0]).toMatch(/font-family[^;]*monospace/i);
    });
});

describe('main.js — chess:opponent:disconnected handler', () => {
    test('countdown m:ss formatumban van (1:00, 0:45, 0:09)', () => {
        // A javitas-elotti keszet: csak `masodperc.toString()` (pl. "60", "45", "9").
        // Most: `formatDc(mp)` ami m:ss-szel formaz.
        const idx = MAIN_JS.indexOf("chess:opponent:disconnected");
        expect(idx).toBeGreaterThan(-1);
        // A handler-en belul keresunk olyan formatot, ami m:ss-szerintu kimenetet
        // ad. A `padStart(2, '0')` jelenlete + Math.floor(mp/60) + mp%60 kombinacio
        // jellemzo erre.
        const handlerRange = MAIN_JS.substring(idx, idx + 1500);
        expect(handlerRange).toMatch(/padStart\s*\(\s*2\s*,\s*['"]0['"]\s*\)/);
        expect(handlerRange).toMatch(/mp\s*\/\s*60|masodperc\s*\/\s*60/);
        expect(handlerRange).toMatch(/mp\s*%\s*60|masodperc\s*%\s*60/);
    });

    test('countdown 0-ra ert nem megy negativba (Math.max guard)', () => {
        const idx = MAIN_JS.indexOf("chess:opponent:disconnected");
        const handlerRange = MAIN_JS.substring(idx, idx + 1500);
        // Az `0` alatt is helyesen "0:00"-t mutat (negativ ertekek elkerulese).
        expect(handlerRange).toMatch(/Math\.max\s*\(\s*0\s*,\s*masodperc\s*\)/);
    });

    test('chess:opponent:reconnected handler elrejti a banner-t es leallitja az interval-t', () => {
        const idx = MAIN_JS.indexOf("chess:opponent:reconnected");
        expect(idx).toBeGreaterThan(-1);
        const handlerRange = MAIN_JS.substring(idx, idx + 500);
        expect(handlerRange).toMatch(/classList\.add\(['"]hidden['"]\)/);
        expect(handlerRange).toMatch(/clearInterval\s*\(\s*window\._dcInterval/);
    });

    test('pvpJatekVege elrejti a disconnect-banner-t (post-forfeit cleanup)', () => {
        // Refactor: pvpJatekVege a pvp/pvpJatek.js modulban (export function-rel)
        const startIdx = PVP_JATEK_JS.search(/(?:export\s+)?function\s+pvpJatekVege\s*\(/);
        expect(startIdx).toBeGreaterThan(-1);
        const openBrace = PVP_JATEK_JS.indexOf('{', startIdx);
        let depth = 1;
        let i = openBrace + 1;
        while (i < PVP_JATEK_JS.length && depth > 0) {
            const ch = PVP_JATEK_JS[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        const torzs = PVP_JATEK_JS.substring(openBrace + 1, i - 1);
        // A pvpJatekVege a disconnectes banner-t is le kell rejtse — kulonben
        // a forfeit utan is pulzalna a piros banner (visual noise).
        expect(torzs).toMatch(/opponent-disconnected[\s\S]*?classList\.add\s*\(\s*['"]hidden['"]/);
    });
});

describe('main.js — countdown formaz pure-logic teszt', () => {
    // A formatDc fuggvenyt ujraepitjuk pure formaban es ellenoorizzuk a
    // varhato kimeneteket (60 -> "1:00", 45 -> "0:45", 9 -> "0:09", 0 -> "0:00").
    function formatDc(mp) {
        const m = Math.floor(mp / 60);
        const s = mp % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    test('60 -> "1:00"', () => {
        expect(formatDc(60)).toBe('1:00');
    });

    test('45 -> "0:45"', () => {
        expect(formatDc(45)).toBe('0:45');
    });

    test('9 -> "0:09" (1-jegyu masodperc 0-val padding)', () => {
        expect(formatDc(9)).toBe('0:09');
    });

    test('0 -> "0:00" (lejart grace, banner mar el lesz rejtve a forfeit emit utan)', () => {
        expect(formatDc(0)).toBe('0:00');
    });

    test('59 -> "0:59" (1mp-cel a lejarat elott)', () => {
        expect(formatDc(59)).toBe('0:59');
    });
});
