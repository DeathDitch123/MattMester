/**
 * Profile oldal HU -> EN bug fix regresszio teszt.
 *
 * Ket terulet:
 *  1) Ability usage mapping — `frontend/javascript/profile/02-utils.js`
 *     `getProfileAbilityDisplay()` minden ismert ability-key-re visszaad
 *     HU + EN nev + leiras parost.
 *  2) Security event message mapping — `frontend/javascript/profile/11-securityActivity.js`
 *     `translateSecurityEventMessage()` a backend altal HU-ban tarolt
 *     `security_activity_log.message` szovegeket EN moodban leforditja.
 */

const path = require('path');
const fs = require('fs');

const UTILS_PATH = path.join(__dirname, '..', 'javascript', 'profile', '02-utils.js');
const SECURITY_PATH = path.join(__dirname, '..', 'javascript', 'profile', '11-securityActivity.js');

// `tx(hu, en)` szimulator — a tesztkornyezet kapcsolja a nyelvet a `currentLang` alapjan.
let currentLang = 'hu';
function makeTx() {
    return (hu, en) => (currentLang === 'en' && en != null ? en : (hu != null ? hu : (en || '')));
}

function setupGlobals() {
    global.window = global;
    global.console = console;
    global.tx = makeTx();
    global.window.tx = global.tx;
    global.window.MattMesterI18n = {
        tx: global.tx,
        get: () => currentLang,
        set: (lang) => { currentLang = lang; },
        applyAll: () => {},
        onLangChange: () => () => {}
    };
    global.document = {
        getElementById: () => null,
        addEventListener: () => {},
        readyState: 'complete'
    };
    global.fetch = () => Promise.resolve({ ok: false, json: () => ({}) });
}

// Tesztben kezzel atemelt mapping-ek a forrasfajlokbol — a `function ... ()`
// declaracioknak Jest strict module scope-ban a top-level `eval`-bol nem
// szivargnak ki, ezert kiemeljuk a fuggvenytestet a forrasfajlbol es egy
// non-strict `Function` wrapper-ben evaluljuk, majd `globalThis`-re tesszuk.
function extractFunction(code, fnName) {
    // Egyszeru string-alapu funkcio extractor — megkeresi a `function fnName(`
    // kezdetet es megfeleli `}` parositassal kiveszi a teljes blokkot.
    const startIdx = code.search(new RegExp(`function\\s+${fnName}\\s*\\(`));
    if (startIdx < 0) {
        throw new Error(`extractFunction: ${fnName} not found`);
    }
    let i = code.indexOf('{', startIdx);
    let depth = 0;
    let inString = null;
    let inLineComment = false;
    let inBlockComment = false;
    let escaped = false;
    for (; i < code.length; i++) {
        const ch = code[i];
        const next = code[i + 1];
        if (inLineComment) {
            if (ch === '\n') inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            if (ch === '*' && next === '/') { inBlockComment = false; i++; }
            continue;
        }
        if (inString) {
            if (escaped) { escaped = false; continue; }
            if (ch === '\\') { escaped = true; continue; }
            if (ch === inString) inString = null;
            continue;
        }
        if (ch === '/' && next === '/') { inLineComment = true; i++; continue; }
        if (ch === '/' && next === '*') { inBlockComment = true; i++; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { inString = ch; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) {
                return code.slice(startIdx, i + 1);
            }
        }
    }
    throw new Error(`extractFunction: ${fnName} body not closed`);
}

function injectFunctions(filePath, fnNames) {
    const code = fs.readFileSync(filePath, 'utf8');
    const blocks = fnNames.map((n) => extractFunction(code, n)).join('\n\n');
    // eslint-disable-next-line no-new-func
    const wrapper = new Function('globalThis', `
        ${blocks}
        ${fnNames.map((n) => `globalThis.${n} = ${n};`).join('\n')}
    `);
    wrapper(global);
}

beforeEach(() => {
    setupGlobals();
    currentLang = 'hu';
    injectFunctions(UTILS_PATH, ['getProfileAbilityDisplay', 'resolveAbilityDisplay']);
    injectFunctions(SECURITY_PATH, ['getSecurityEventLabels', 'translateSecurityEventMessage']);
});

const ABILITY_KEYS = ['time_pause', 'freeze', 'swap', 'board_hide', 'shield', 'lefokozas'];

describe('Profile ability usage mapping (02-utils.js)', () => {
    test('getProfileAbilityDisplay HU módban magyar neveket ad', () => {
        currentLang = 'hu';
        const map = getProfileAbilityDisplay();
        expect(map.time_pause.name).toBe('Időmegállítás');
        expect(map.freeze.name).toBe('Bábu fagyasztás');
        expect(map.swap.name).toBe('Bábucsere');
        expect(map.board_hide.name).toBe('Tábla eltakar');
        expect(map.shield.name).toBe('Pajzs');
        expect(map.lefokozas.name).toBe('Lefokozás');
    });

    test('getProfileAbilityDisplay EN módban angol neveket ad', () => {
        currentLang = 'en';
        const map = getProfileAbilityDisplay();
        expect(map.time_pause.name).toBe('Time stop');
        expect(map.freeze.name).toBe('Freeze piece');
        expect(map.swap.name).toBe('Piece swap');
        expect(map.board_hide.name).toBe('Hide board');
        expect(map.shield.name).toBe('Shield');
        expect(map.lefokozas.name).toBe('Demote');
    });

    test.each(ABILITY_KEYS)('%s leiras HU + EN — nem ures es nem azonos', (key) => {
        currentLang = 'hu';
        const huDesc = getProfileAbilityDisplay()[key].description;
        currentLang = 'en';
        const enDesc = getProfileAbilityDisplay()[key].description;
        expect(huDesc).toBeTruthy();
        expect(enDesc).toBeTruthy();
        expect(huDesc).not.toBe(enDesc);
    });

    test('resolveAbilityDisplay ismeretlen key-re fallback a server `name`-re', () => {
        currentLang = 'en';
        const out = resolveAbilityDisplay({ key: 'unknown_key', name: 'Szerver feliratot', description: 'Szerver leiras' });
        expect(out.name).toBe('Szerver feliratot');
        expect(out.description).toBe('Szerver leiras');
    });

    test('resolveAbilityDisplay ismert key-re klienst hasznal a server name helyett', () => {
        currentLang = 'en';
        // A server HU-ban kuldi (Idomegallitas) — a kliens EN-re forditja.
        const out = resolveAbilityDisplay({ key: 'time_pause', name: 'Időmegállítás', description: 'HU desc' });
        expect(out.name).toBe('Time stop');
        expect(out.description).toMatch(/Time stop/i);
    });
});

describe('Security event message mapping (11-securityActivity.js)', () => {
    const HU_MESSAGES = [
        'Sikeres bejelentkezés.',
        'Sikeres kijelentkezés.',
        'Sikertelen bejelentkezési kísérlet (hibás jelszó).',
        'Sikertelen bejelentkezés.',
        'Sikeres regisztráció.',
        'Profilkép feltöltve.',
        'Profilkép jóváhagyva.',
        'Email cím sikeresen megerősítve.',
        'Jelszó megváltozva.',
        'Profil beállítások módosítva.',
        'Sikeres kijelentkezés minden eszközről.',
        'Barát hozzáadva.',
        'Barát törölve.',
        'Felhasználó letiltva.',
        'Üzenet elküldve.'
    ];

    test.each(HU_MESSAGES)('translateSecurityEventMessage HU módban változatlanul hagyja: %s', (huMsg) => {
        currentLang = 'hu';
        expect(translateSecurityEventMessage(huMsg)).toBe(huMsg);
    });

    test.each(HU_MESSAGES)('translateSecurityEventMessage EN módban angolra fordít: %s', (huMsg) => {
        currentLang = 'en';
        const en = translateSecurityEventMessage(huMsg);
        expect(en).toBeTruthy();
        // Az EN forditasban nem szabad szerepelnie tipikus HU karaktereknek
        expect(en).not.toBe(huMsg);
    });

    test('translateSecurityEventMessage ures input -> ures string', () => {
        currentLang = 'en';
        expect(translateSecurityEventMessage('')).toBe('');
        expect(translateSecurityEventMessage(null)).toBe('');
        expect(translateSecurityEventMessage(undefined)).toBe('');
    });

    test('translateSecurityEventMessage ismeretlen szovegre az eredetit adja vissza', () => {
        currentLang = 'en';
        const unknown = 'Egyedi szerver-szoveg amit nem mappingelunk';
        expect(translateSecurityEventMessage(unknown)).toBe(unknown);
    });

    test('"Sikeres bejelentkezés." -> "Successful login." EN módban', () => {
        currentLang = 'en';
        expect(translateSecurityEventMessage('Sikeres bejelentkezés.')).toBe('Successful login.');
    });
});

describe('getSecurityEventLabels — HU + EN coverage', () => {
    const EVENT_KEYS = [
        'login', 'logout', 'register',
        'logout_all_devices', 'profile_settings_update', 'password_change',
        'profile_image_upload', 'profile_image_remove', 'profile_delete',
        'login_failed', 'current_password_verify_failed', 'banned', 'unbanned',
        'friend_request_sent', 'friend_request_accepted', 'friend_request_rejected',
        'friend_blocked', 'friend_unblocked', 'friend_removed'
    ];

    test.each(EVENT_KEYS)('%s — HU label nem üres', (key) => {
        currentLang = 'hu';
        const labels = getSecurityEventLabels();
        expect(labels[key]).toBeDefined();
        expect(labels[key].label).toBeTruthy();
    });

    test.each(EVENT_KEYS)('%s — EN label nem üres és nem azonos a HU-val', (key) => {
        currentLang = 'hu';
        const huLabel = getSecurityEventLabels()[key].label;
        currentLang = 'en';
        const enLabel = getSecurityEventLabels()[key].label;
        expect(enLabel).toBeTruthy();
        // Legtobb feliratnak el kell ternie HU vs EN
        // (megengedo: kivetel pl. ha a HU/EN azonos volna, de ezeknek a kulcsoknak NEM)
        expect(enLabel).not.toBe(huLabel);
    });
});
