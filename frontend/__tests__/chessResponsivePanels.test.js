/**
 * Bug 2026-05-04 — kis kepernyon (mobile/tablet) az "Ingame chat" es "Leutott
 * babuk" panelek `display: none`-szal eltuntek a `@media (max-width: 1100px)`
 * mediaszabaly miatt. Felhasznaloi panasz: "kicsibe nincs se chat se babu
 * leutes ful".
 *
 * Fix: a chess.css mobile-tablet @media szabalya MAR NEM rejti el a paneleket
 * `display: none`-szal globalisan; helyette flex-column-ban a tabla ALATT
 * mutatja oket. A teszt a CSS forrast olvassa es ellenorzi az invarianst:
 *   - nincs `.captured-panel { display: none }` a max-width: 1100px-en
 *   - flex-column body-elrendezes
 *   - panelek `order: 1+` ertekkel a tabla utan
 */

const fs = require('fs');
const path = require('path');

const CSS_PATH = path.resolve(__dirname, '..', 'chess_barold', 'css', 'chess.css');
const css = fs.readFileSync(CSS_PATH, 'utf8');

function findMediaBlock(source, mediaQuery) {
    // Egyszeru forward-keresses: megkeresi a `@media <query> {` blokkot es a
    // hozzatartozo zaro `}`-ig olvassa, brace-szamlalassal.
    const startMarker = `@media ${mediaQuery}`;
    const idx = source.indexOf(startMarker);
    if (idx === -1) return null;
    const openBrace = source.indexOf('{', idx);
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

describe('chess.css — mobil/tablet @media (max-width: 1100px) panel-lathatosag', () => {
    test('a CSS fajl letezik es nem ures', () => {
        expect(css.length).toBeGreaterThan(1000);
    });

    const mobileBlock = findMediaBlock(css, '(max-width: 1100px)');

    test('@media (max-width: 1100px) blokk megtalalhato', () => {
        expect(mobileBlock).not.toBeNull();
    });

    test('a mobile blokkban NINCS `.captured-panel { display: none }` (regresszio-vedelem)', () => {
        // Pre-fix: `.ingame-chat-panel, .captured-panel { display: none; }`
        // Post-fix: a captured-panel lathato marad, csak flex-row vagy column.
        expect(mobileBlock).not.toMatch(/\.captured-panel\s*\{[^}]*display\s*:\s*none/);
        expect(mobileBlock).not.toMatch(/\.ingame-chat-panel\s*,\s*\.captured-panel\s*\{[^}]*display\s*:\s*none/);
    });

    test('a mobile blokkban a body flex-column elrendezes (tabla felul, panelek alul)', () => {
        expect(mobileBlock).toMatch(/body\s*\{[^}]*flex-direction\s*:\s*column/);
    });

    test('a captured-panel kap egy `order` erteket a mobile blokkban (a tabla mogott)', () => {
        // Az `order: 2` (vagy 1+) biztositja, hogy a `.app` (order: 0) UTAN
        // jelenjen meg vertikalisan, a tabla alatt.
        expect(mobileBlock).toMatch(/\.captured-panel\s*\{[\s\S]*?order\s*:\s*\d+/);
    });

    test('az ingame-chat-panel kap egy `order` erteket a mobile blokkban', () => {
        expect(mobileBlock).toMatch(/\.ingame-chat-panel\s*\{[\s\S]*?order\s*:\s*\d+/);
    });

    test('az ingame-chat-panel.hidden mobil-fallback `display: none`-szal rejt (foglalt hely tisztitasa)', () => {
        // A desktop variansban `visibility: hidden` van (helyfoglalas miatt),
        // mobilon viszont a `display: none` indokolt — bot meccsen ne legyen
        // ures lyuk a tabla alatt, csak PvP-n (chatPanelMutat hivasakor) jelenjen meg.
        expect(mobileBlock).toMatch(/\.ingame-chat-panel\.hidden\s*\{[\s\S]*?display\s*:\s*none/);
    });
});

describe('chess.css — .app.flipped CSS swap (Bug #3)', () => {
    test('a fajlban definialva van a `.app.flipped .topbar` order szabaly', () => {
        // A flip-szinkron biztositja, hogy a sajat "Te" cimke MINDIG alul legyen.
        expect(css).toMatch(/\.app\.flipped\s+\.topbar\s*\{\s*order\s*:/);
        expect(css).toMatch(/\.app\.flipped\s+\.bottombar\s*\{\s*order\s*:/);
    });

    test('flipped allapotban a topbar order > bottombar order (CSS-szinten visszafele jelenik meg)', () => {
        // Ki olvassa az ertekekkel a swap iranyat — a topbar order higher mint
        // a bottombar order, igy a flex-column rendben mutatja a bottombar-t
        // elsonek (vizualisan felul).
        const topMatch = css.match(/\.app\.flipped\s+\.topbar\s*\{\s*order\s*:\s*(-?\d+)/);
        const bottomMatch = css.match(/\.app\.flipped\s+\.bottombar\s*\{\s*order\s*:\s*(-?\d+)/);
        expect(topMatch).not.toBeNull();
        expect(bottomMatch).not.toBeNull();
        const topOrder = Number(topMatch[1]);
        const bottomOrder = Number(bottomMatch[1]);
        expect(topOrder).toBeGreaterThan(bottomOrder);
    });
});
