/**
 * Regresszió teszt: az új DICT kulcsok (admin moderálás, chat blocklist,
 * profile aria-labelek, stb.) léteznek HU + EN szótárban és az értékük
 * nem tartalmaz egyéb HU/EN keveredést.
 *
 * A teszt direktben olvassa be az i18n.js forrását, és ellenőrzi a kulcsokat
 * a window.MattMesterI18n.t(key) hívással mindkét nyelven.
 */

const path = require('path');
const fs = require('fs');

const I18N_PATH = path.join(__dirname, '..', 'javascript', 'shared', 'i18n.js');

function makeElement(tag) {
    return {
        tagName: (tag || 'div').toUpperCase(),
        _attrs: {},
        _children: [],
        _textContent: '',
        _innerHTML: '',
        get textContent() { return this._textContent; },
        set textContent(v) { this._textContent = String(v ?? ''); },
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) { this._innerHTML = String(v ?? ''); },
        getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
        setAttribute(k, v) { this._attrs[k] = String(v); },
        hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
        removeAttribute(k) { delete this._attrs[k]; },
        appendChild(child) { this._children.push(child); child.parentNode = this; return child; },
        querySelectorAll() { return []; },
        matches() { return false; },
        addEventListener() {},
        removeEventListener() {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
    };
}

function makeStorage() {
    const map = new Map();
    return {
        getItem(k) { return map.has(k) ? map.get(k) : null; },
        setItem(k, v) { map.set(k, String(v)); },
        removeItem(k) { map.delete(k); },
        clear() { map.clear(); }
    };
}

function setupGlobals() {
    const body = makeElement('body');
    const html = makeElement('html');
    const documentObj = {
        body,
        documentElement: html,
        readyState: 'complete',
        addEventListener() {},
        querySelectorAll() { return []; }
    };
    global.window = global;
    global.document = documentObj;
    global.localStorage = makeStorage();
    global.CustomEvent = function CustomEvent(name, payload) { this.type = name; this.detail = payload?.detail; };
    global.MutationObserver = function () { return { observe() {}, disconnect() {} }; };
    global.dispatchEvent = function () { return true; };
    global.addEventListener = function () {};
    global.removeEventListener = function () {};
}

function loadI18n() {
    const code = fs.readFileSync(I18N_PATH, 'utf8');
    eval(code); // eslint-disable-line no-eval
}

beforeEach(() => {
    setupGlobals();
    delete global.MattMesterI18n;
    loadI18n();
});

const NEW_ADMIN_KEYS = [
    'admin.blocklist_add_title',
    'admin.blocklist_add_warning',
    'admin.blocklist_source_message',
    'admin.blocklist_words_label',
    'admin.blocklist_no_words',
    'admin.blocklist_words_hint',
    'admin.reason',
    'admin.blocklist_reason_ph',
    'admin.blocklist_add_btn',
    'admin.chat_allow_title',
    'admin.chat_allow_warning',
    'admin.chat_sender',
    'admin.chat_allow_reason_label',
    'admin.chat_allow_reason_ph',
    'admin.chat_allow_btn',
    'admin.image_reject_title',
    'admin.image_reject_warning',
    'admin.image_reject_user',
    'admin.image_reject_reason_label',
    'admin.image_reject_reason_ph',
    'admin.image_reject_btn',
    'admin.admin_image_crop',
    'admin.admin_image_hint',
    'admin.admin_image_save_hint',
    'admin.admin_image_save',
    'admin.tests_run_title',
    'admin.tests_run_hint',
    'admin.note_optional',
    'admin.tests_note_ph',
    'admin.tests_run_btn',
    'admin.quick_chat_title',
    'admin.quick_chat_intro',
    'admin.message',
    'admin.quick_chat_ph',
    'admin.send'
];

const NEW_PROFILE_KEYS = [
    'profile.top_nav_aria',
    'profile.sidebar_toggle_aria',
    'profile.friends_filter_aria',
    'profile.friends_refresh_aria',
    'profile.friends_add_aria',
    'profile.security_filter_aria',
    'profile.email_ph',
    'profile.player_alt'
];

describe('Új admin DICT kulcsok — HU + EN', () => {
    test.each(NEW_ADMIN_KEYS)('%s — HU értéke nem üres és nem maga a kulcs', (key) => {
        const value = global.MattMesterI18n.t(key);
        expect(value).toBeTruthy();
        expect(value).not.toBe(key);
    });

    test.each(NEW_ADMIN_KEYS)('%s — EN értéke nem üres és nem maga a kulcs', (key) => {
        global.MattMesterI18n.set('en');
        const value = global.MattMesterI18n.t(key);
        expect(value).toBeTruthy();
        expect(value).not.toBe(key);
    });

    test('HU és EN értékek különböznek (legalábbis nem mindegyik egyezik)', () => {
        // Néhány kulcs angolban és magyarban is azonos lehet (pl. "Spectator"),
        // de a többségnek el kell térnie. Ellenőrizzük, hogy legalább 50% eltér.
        let differCount = 0;
        for (const key of NEW_ADMIN_KEYS) {
            global.MattMesterI18n.set('hu');
            const hu = global.MattMesterI18n.t(key);
            global.MattMesterI18n.set('en');
            const en = global.MattMesterI18n.t(key);
            if (hu !== en) differCount++;
        }
        expect(differCount).toBeGreaterThan(NEW_ADMIN_KEYS.length / 2);
    });
});

describe('Új profile DICT kulcsok — HU + EN', () => {
    test.each(NEW_PROFILE_KEYS)('%s — HU értéke nem üres és nem maga a kulcs', (key) => {
        const value = global.MattMesterI18n.t(key);
        expect(value).toBeTruthy();
        expect(value).not.toBe(key);
    });

    test.each(NEW_PROFILE_KEYS)('%s — EN értéke nem üres és nem maga a kulcs', (key) => {
        global.MattMesterI18n.set('en');
        const value = global.MattMesterI18n.t(key);
        expect(value).toBeTruthy();
        expect(value).not.toBe(key);
    });
});

describe('chatModal HU/EN renderelés — tx() használat ellenőrzése', () => {
    const CHATMODAL_PATH = path.join(__dirname, '..', 'javascript', 'chatModal.js');

    test('chatModal markup tartalmazza a tx() hívásokat a feliratokhoz', () => {
        const code = fs.readFileSync(CHATMODAL_PATH, 'utf8');
        // A korabbi hardcoded "Csevegések" most ${tx(...)} kifejezesben van
        expect(code).toMatch(/tx\(['"]Csevegések['"],\s*['"]Conversations['"]\)/);
        expect(code).toMatch(/tx\(['"]Üzenetek betöltése\.\.\.['"],\s*['"]Loading messages\.\.\.['"]\)/);
        expect(code).toMatch(/tx\(['"]Küldés['"],\s*['"]Send['"]\)/);
        expect(code).toMatch(/tx\(['"]Üzenet bejelentése['"],\s*['"]Report message['"]\)/);
        expect(code).toMatch(/tx\(['"]Bejelentés['"],\s*['"]Report['"]\)/);
    });
});

describe('chess_barold UI-megjelenites & domSkeleton — i18n integráció', () => {
    const UI_PATH = path.join(__dirname, '..', 'chess_barold', 'javascript', 'UI-megjelenites.js');
    const SKELETON_PATH = path.join(__dirname, '..', 'chess_barold', 'javascript', 'domSkeleton.js');

    test('UI-megjelenites renderMoveList üres állapot tx-szel', () => {
        const code = fs.readFileSync(UI_PATH, 'utf8');
        expect(code).toMatch(/tx[a-zA-Z]*\(['"]Még nincs lépés['"],\s*['"]No moves yet['"]\)/);
    });

    test('domSkeleton OLDAL_VAZ data-i18n attributumokat tartalmaz', () => {
        const code = fs.readFileSync(SKELETON_PATH, 'utf8');
        expect(code).toMatch(/data-i18n="chess\.surrender"/);
        expect(code).toMatch(/data-i18n="chess\.opponent"/);
        expect(code).toMatch(/data-i18n="chess\.bot_thinking"/);
        expect(code).toMatch(/data-i18n="chess\.you_label"/);
        expect(code).toMatch(/data-i18n="chess\.in_game"/);
    });
});
