/**
 * Regresszió teszt: az i18n.js applyAll() / set() hivasa szinkronizalja
 * a `<input type="date">`, `datetime-local`, `time`, `month`, `week` elemek
 * `lang` attributumat a current language-re.
 *
 * Ez fontos, mert a dokumentum-szintu `<html lang>` valtas nem frissiti
 * a mar renderelt natív date picker UI-t (Chrome/Edge/Firefox tobbsege
 * az elem-szintu `lang` attributum alapjan dontene a "May" vs "május",
 * "H K Sze Cs P Szo V" vs "S M T W T F S" formatumrol).
 *
 * A teszt source-szinten ellenőrzi, hogy:
 *  - i18n.js tartalmazza a `syncDatePickerLang` segedet,
 *  - applyAll() meghivja a syncDatePickerLang-et,
 *  - set() (azaz nyelvvaltas) tovabbgyuruzteti az uj lang-et minden
 *    relevans input-ra.
 */

const path = require('path');
const fs = require('fs');

const I18N_PATH = path.join(__dirname, '..', 'javascript', 'shared', 'i18n.js');

function makeElement(tag, type) {
    return {
        tagName: (tag || 'div').toUpperCase(),
        type: type || null,
        _attrs: type ? { type } : {},
        _children: [],
        _textContent: '',
        _innerHTML: '',
        style: { display: '' },
        offsetHeight: 1,
        get textContent() { return this._textContent; },
        set textContent(v) { this._textContent = String(v ?? ''); },
        get innerHTML() { return this._innerHTML; },
        set innerHTML(v) { this._innerHTML = String(v ?? ''); },
        getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
        setAttribute(k, v) { this._attrs[k] = String(v); },
        hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
        removeAttribute(k) { delete this._attrs[k]; },
        appendChild(child) { this._children.push(child); child.parentNode = this; return child; },
        querySelectorAll(selector) { return matchAll(this, selector); },
        matches(selector) { return matchesSelector(this, selector); },
        addEventListener() {},
        removeEventListener() {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
    };
}

function matchesSelector(el, selector) {
    const parts = selector.split(',').map((s) => s.trim());
    return parts.some((p) => {
        // [attr] forma
        let m = p.match(/^\[([a-zA-Z0-9-]+)\]$/);
        if (m) return el.hasAttribute(m[1]);
        // input[type="date"] forma
        m = p.match(/^input\[type=["']?([a-z-]+)["']?\]$/);
        if (m) return el.tagName === 'INPUT' && (el.getAttribute('type') === m[1]);
        return false;
    });
}

function walk(node, out) {
    out.push(node);
    (node._children || []).forEach((c) => walk(c, out));
}

function matchAll(root, selector) {
    const out = [];
    (root._children || []).forEach((c) => walk(c, out));
    return out.filter((el) => matchesSelector(el, selector));
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
    const events = new Map();
    const documentObj = {
        body,
        documentElement: html,
        readyState: 'complete',
        addEventListener() {},
        querySelectorAll(selector) { return matchAll(body, selector); }
    };

    global.window = global;
    global.document = documentObj;
    global.localStorage = makeStorage();
    global.CustomEvent = function CustomEvent(name, payload) { this.type = name; this.detail = payload?.detail; };
    global.MutationObserver = function () { return { observe() {}, disconnect() {} }; };
    global.dispatchEvent = function (ev) {
        const list = events.get(ev.type) || [];
        list.forEach((fn) => fn(ev));
        return true;
    };
    global.addEventListener = function (type, fn) {
        const list = events.get(type) || [];
        list.push(fn);
        events.set(type, list);
    };
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

describe('i18n.js — date picker locale szinkronizacio (source ellenőrzés)', () => {
    test('i18n.js source tartalmazza a syncDatePickerLang segedet', () => {
        const src = fs.readFileSync(I18N_PATH, 'utf8');
        expect(src).toMatch(/function\s+syncDatePickerLang/);
    });

    test('applyAll() meghivja a syncDatePickerLang-et', () => {
        const src = fs.readFileSync(I18N_PATH, 'utf8');
        // Az applyAll function body-ban szerepelnie kell a hivasnak.
        const applyAllMatch = src.match(/function\s+applyAll[\s\S]*?\n\s{4}\}/);
        expect(applyAllMatch).not.toBeNull();
        expect(applyAllMatch[0]).toMatch(/syncDatePickerLang\s*\(/);
    });

    test('a query selector lefedi a fontos input tipusokat', () => {
        const src = fs.readFileSync(I18N_PATH, 'utf8');
        expect(src).toMatch(/input\[type="date"\]/);
        expect(src).toMatch(/input\[type="datetime-local"\]/);
        expect(src).toMatch(/input\[type="time"\]/);
    });

    test('publikus API-n elerheto a syncDatePickerLang', () => {
        expect(typeof global.MattMesterI18n.syncDatePickerLang).toBe('function');
    });
});

describe('MattMesterI18n.syncDatePickerLang — input lang attribut szinkron', () => {
    test('applyAll() utan minden date-input lang attributuma a current language', () => {
        const dateInput = makeElement('input', 'date');
        const dtInput = makeElement('input', 'datetime-local');
        const timeInput = makeElement('input', 'time');
        const textInput = makeElement('input', 'text'); // ezt NEM erinti
        document.body.appendChild(dateInput);
        document.body.appendChild(dtInput);
        document.body.appendChild(timeInput);
        document.body.appendChild(textInput);

        global.MattMesterI18n.applyAll();
        expect(dateInput.getAttribute('lang')).toBe('hu');
        expect(dtInput.getAttribute('lang')).toBe('hu');
        expect(timeInput.getAttribute('lang')).toBe('hu');
        expect(textInput.getAttribute('lang')).toBeNull();
    });

    test('nyelvvaltas (set("en")) tovabbgyuruzteti az uj lang-et a date input-okra', () => {
        const dateInput = makeElement('input', 'date');
        const dtInput = makeElement('input', 'datetime-local');
        document.body.appendChild(dateInput);
        document.body.appendChild(dtInput);

        global.MattMesterI18n.applyAll();
        expect(dateInput.getAttribute('lang')).toBe('hu');

        global.MattMesterI18n.set('en');
        expect(dateInput.getAttribute('lang')).toBe('en');
        expect(dtInput.getAttribute('lang')).toBe('en');
    });

    test('text-input tipusok valtozatlanok maradnak', () => {
        const text = makeElement('input', 'text');
        const password = makeElement('input', 'password');
        document.body.appendChild(text);
        document.body.appendChild(password);

        global.MattMesterI18n.set('en');
        expect(text.getAttribute('lang')).toBeNull();
        expect(password.getAttribute('lang')).toBeNull();
    });

    test('syncDatePickerLang biztonsagosan hivhato uras scope-pal', () => {
        expect(() => global.MattMesterI18n.syncDatePickerLang(null)).not.toThrow();
        expect(() => global.MattMesterI18n.syncDatePickerLang(undefined)).not.toThrow();
    });
});
