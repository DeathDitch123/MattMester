/**
 * Regression test — ensure the admin Tests page, Admin grant modal,
 * and Abilities admin cards have EN translations available via tx() pairs
 * (and data-i18n keys for the static modal). The admin panel was previously
 * showing HU-only strings even when language was set to EN; this test
 * locks in the i18n-correct rendering at the source level.
 *
 * Approach:
 *   1) Read the relevant source files (06-sections.js, adminPanel.html, i18n.js).
 *   2) For each HU/EN string pair, assert the source contains a
 *      `tx('HU', 'EN')` call (or `data-i18n="key"` for the static modal).
 *   3) For the abilities mapping, verify the slug -> EN-label mapping exists.
 */
const fs = require('fs');
const path = require('path');

const SECTIONS_JS = fs.readFileSync(
    path.resolve(__dirname, '..', 'javascript', 'adminPanel', '06-sections.js'),
    'utf8'
);
const ADMIN_HTML = fs.readFileSync(
    path.resolve(__dirname, '..', 'html', 'adminPanel.html'),
    'utf8'
);
const I18N_JS = fs.readFileSync(
    path.resolve(__dirname, '..', 'javascript', 'shared', 'i18n.js'),
    'utf8'
);

/**
 * A laza tx-illesztes: a HU/EN szovegek egyezzenek, ' vagy " idezojellel,
 * tetszoleges whitespace-szel. A regex eskeleti pattern:
 *   tx\(\s*['"]HU['"]\s*,\s*['"]EN['"]\s*\)
 */
function txPair(hu, en) {
    const escapeRe = (s) => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
    const quote = `['"]`;
    return new RegExp(
        'tx\\(\\s*' + quote + escapeRe(hu) + quote +
        '\\s*,\\s*' + quote + escapeRe(en) + quote + '\\s*\\)'
    );
}

describe('admin Tests page — HU/EN tx pairs in 06-sections.js', () => {
    const TEST_PAIRS = [
        ['Tesztek', 'Tests'],
        ['Backend Jest + Supertest tesztek', 'Backend Jest + Supertest tests'],
        ['Sikeres', 'Passed'],
        ['Sikertelen', 'Failed'],
        ['Kihagyott', 'Skipped'],
        ['Jest idő', 'Jest time'],
        ['Test suite-ok', 'Test suites'],
        ['A reszletek csak a session alatt es csak a futtatas utan 1 percig lathatok. Kattints a "Tesztek futtatasa" gombra a friss eredmenyhez.',
         'Details are visible only during the session and only for 1 minute after the run. Click the "Run tests" button to get a fresh result.'],
        ['Stderr (utolso 4KB)', 'Stderr (last 4KB)'],
        ['(Még nincs futás)', '(No run yet)'],
        ['Futtatási előzmények', 'Run history'],
        ['INDÍTOTTA', 'TRIGGERED BY'],
        ['ÁLLAPOT', 'STATUS'],
        ['IDŐTARTAM', 'DURATION'],
        ['INDULT', 'STARTED'],
        ['Tesztek futtatása', 'Run tests']
    ];

    test.each(TEST_PAIRS)('source contains tx("%s", "%s")', (hu, en) => {
        expect(SECTIONS_JS).toMatch(txPair(hu, en));
    });

    test('Manual refresh marad EN (kezi frissites tx-pair globalisan)', () => {
        // 02-state.js-ben mar tx-elt — itt csak ellenorizzuk hogy a Tests
        // fejlec attrs-ben nem kerult duplikaltan a "Manual refresh".
        expect(SECTIONS_JS).not.toMatch(/Manual refresh.*Tesztek/);
    });
});

describe('admin Abilities admin — client-side slug -> EN mapping', () => {
    // Ezeket a slug-okat a backend INSERT IGNORE-ban seedeli (lasd
    // backend/sql/database.js): time_pause, freeze, swap, board_hide,
    // shield, lefokozas. Az admin oldal client-side mapping-jeben
    // mindegyikre kell, hogy legyen egy tx() name + tx() description.
    const ABILITY_NAME_PAIRS = [
        ['Időmegállítás', 'Time stop'],
        ['Bábu befagyasztás', 'Freeze piece'],
        ['Bábucsere', 'Piece swap'],
        ['Táblakitakarás', 'Board hide'],
        ['Pajzs', 'Shield'],
        ['Lefokozás', 'Demote']
    ];

    test.each(ABILITY_NAME_PAIRS)('ability name tx("%s", "%s") jelen van', (hu, en) => {
        expect(SECTIONS_JS).toMatch(txPair(hu, en));
    });

    test('client-side abilityNameTx mapping case-ok mindegyik slug-ra', () => {
        for (const slug of ['time_pause', 'freeze', 'swap', 'board_hide', 'shield', 'lefokozas']) {
            expect(SECTIONS_JS).toMatch(new RegExp('case\\s+[\'"]' + slug + '[\'"]'));
        }
    });

    test('client-side abilityDescTx-ben szerepel az EN leiras-fordit kulcsszavak', () => {
        // Spot-check: a leirasokban nem maradtak hardcoded HU-fragmentek-only.
        expect(SECTIONS_JS).toMatch(/Time stop — pause your own clock/);
        expect(SECTIONS_JS).toMatch(/Freeze piece — an enemy piece cannot move/);
        expect(SECTIONS_JS).toMatch(/Board hide — opponent cannot move/);
        expect(SECTIONS_JS).toMatch(/Shield — one of your pieces becomes invulnerable/);
        expect(SECTIONS_JS).toMatch(/Demote — an enemy rook\/bishop\/queen/);
        expect(SECTIONS_JS).toMatch(/Piece swap — swap the positions/);
    });
});

describe('Admin role grant modal — adminPanel.html data-i18n keys', () => {
    const REQUIRED_I18N_KEYS = [
        'admin.grant_admin_title',
        'admin.grant_admin_intro',
        'admin.grant_admin_label',
        'admin.grant_super_check',
        'admin.continue',
        'common.cancel'
    ];

    test.each(REQUIRED_I18N_KEYS)('admin grant modal hivatkozza a %s kulcsot', (key) => {
        const escaped = key.replace(/\./g, '\\.');
        expect(ADMIN_HTML).toMatch(new RegExp(`data-i18n="${escaped}"`));
    });

    test('admin grant modal placeholder-je data-i18n-attr-ral van', () => {
        expect(ADMIN_HTML).toMatch(/placeholder:admin\.grant_admin_ph/);
    });

    test('i18n.js DICT-ben az admin.grant_admin_ph mindket nyelven szerepel', () => {
        expect(I18N_JS).toMatch(/'admin\.grant_admin_ph':\s*'pl\.: SakkMester99'/);
        expect(I18N_JS).toMatch(/'admin\.grant_admin_ph':\s*'e\.g\. SakkMester99'/);
    });

    test('a kotelezo grant kulcsok HU + EN ertekekkel definialva vannak az i18n DICT-ben', () => {
        const escapeRe = (s) => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
        const PAIRS = [
            ['admin.grant_admin_title', 'Admin szerep adása', 'Grant admin role'],
            ['admin.grant_admin_label', 'Felhasználónév', 'Username'],
            ['admin.grant_super_check', 'Super-admin jogot is adjon', 'Also grant super-admin rights'],
            ['admin.continue', 'Tovább', 'Continue']
        ];
        for (const [key, hu, en] of PAIRS) {
            const k = escapeRe(key);
            expect(I18N_JS).toMatch(new RegExp("'" + k + "':\\s*'" + escapeRe(hu) + "'"));
            expect(I18N_JS).toMatch(new RegExp("'" + k + "':\\s*'" + escapeRe(en) + "'"));
        }
    });
});
