/**
 * frontend/javascript/shared/i18n.js — tx() inline switch, onLangChange()
 * listener, formatDate / formatDateTime lokalizalt formazas, dinamikus
 * data-i18n-tartalmu DOM-elemek nyelvvaltaskori frissulese.
 *
 * Jest env: 'node' (lasd backend/jest.config.js). DOM-ot manualisan stuboljuk.
 */

const path = require('path');
const fs = require('fs');

const I18N_PATH = path.join(__dirname, '..', 'javascript', 'shared', 'i18n.js');

// --- Minimalis DOM stub (a tesztekhez szukseges felulet) ---
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
        set innerHTML(v) { this._innerHTML = String(v ?? ''); this._textContent = String(v ?? ''); },
        getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
        setAttribute(k, v) { this._attrs[k] = String(v); },
        hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
        removeAttribute(k) { delete this._attrs[k]; },
        appendChild(child) { this._children.push(child); child.parentNode = this; return child; },
        querySelectorAll(selector) {
            return matchAll(this, selector);
        },
        matches(selector) { return matchesSelector(this, selector); },
        addEventListener() {},
        removeEventListener() {},
        classList: {
            _set: new Set(),
            add(c) { this._set.add(c); },
            remove(c) { this._set.delete(c); },
            toggle(c, force) { if (force === true) this._set.add(c); else if (force === false) this._set.delete(c); else { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } },
            contains(c) { return this._set.has(c); }
        }
    };
}

function matchesSelector(el, selector) {
    // Csak az `[attr]` és `[attr], [attr2]` formatumokat tamogatjuk a tesztekhez.
    const parts = selector.split(',').map((s) => s.trim());
    return parts.some((p) => {
        const m = p.match(/^\[([a-zA-Z0-9-]+)\]$/);
        if (!m) return false;
        return el.hasAttribute(m[1]);
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
    global.MutationObserver = function () {
        return { observe() {}, disconnect() {} };
    };
    // Event dispatch stub (a window-ra)
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
    global.removeEventListener = function (type, fn) {
        const list = events.get(type) || [];
        events.set(type, list.filter((f) => f !== fn));
    };
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

describe('MattMesterI18n — public API surface', () => {
    test('window.MattMesterI18n elerheto', () => {
        expect(global.MattMesterI18n).toBeDefined();
    });

    test('publikus fuggvenyek leteznek', () => {
        const api = global.MattMesterI18n;
        ['t', 'tx', 'set', 'get', 'applyAll', 'onLangChange', 'formatDate', 'formatDateTime'].forEach((fn) => {
            expect(typeof api[fn]).toBe('function');
        });
        expect(Array.isArray(api.SUPPORTED)).toBe(true);
        expect(api.SUPPORTED).toEqual(expect.arrayContaining(['hu', 'en']));
    });
});

describe('MattMesterI18n.tx — inline HU/EN', () => {
    test('alapertelmezetten HU-t ad vissza', () => {
        expect(global.MattMesterI18n.get()).toBe('hu');
        expect(global.MattMesterI18n.tx('Szia', 'Hello')).toBe('Szia');
    });

    test('EN nyelven angolt ad vissza', () => {
        global.MattMesterI18n.set('en');
        expect(global.MattMesterI18n.tx('Szia', 'Hello')).toBe('Hello');
    });

    test('hianyzo EN parameter eseten HU fallback', () => {
        global.MattMesterI18n.set('en');
        expect(global.MattMesterI18n.tx('Szia')).toBe('Szia');
    });

    test('hianyzo HU eseten EN fallback', () => {
        expect(global.MattMesterI18n.tx(null, 'Hello')).toBe('Hello');
    });
});

describe('MattMesterI18n.onLangChange — re-render listener', () => {
    test('regisztralt callback meghivodik nyelvvaltaskor', () => {
        const fn = jest.fn();
        global.MattMesterI18n.onLangChange(fn);
        global.MattMesterI18n.set('en');
        expect(fn).toHaveBeenCalledWith('en');
        global.MattMesterI18n.set('hu');
        expect(fn).toHaveBeenCalledWith('hu');
        expect(fn).toHaveBeenCalledTimes(2);
    });

    test('unsubscribe lekapcsolja a listenert', () => {
        const fn = jest.fn();
        const off = global.MattMesterI18n.onLangChange(fn);
        off();
        global.MattMesterI18n.set('en');
        expect(fn).not.toHaveBeenCalled();
    });

    test('handler hibaja nem szakitja meg a kovetkezo handlert', () => {
        const bad = jest.fn(() => { throw new Error('boom'); });
        const good = jest.fn();
        global.MattMesterI18n.onLangChange(bad);
        global.MattMesterI18n.onLangChange(good);
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
        global.MattMesterI18n.set('en');
        expect(bad).toHaveBeenCalled();
        expect(good).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    test('nem-fuggveny argumentum biztonsagos no-op', () => {
        const off = global.MattMesterI18n.onLangChange(null);
        expect(typeof off).toBe('function');
        expect(() => global.MattMesterI18n.set('en')).not.toThrow();
    });
});

describe('MattMesterI18n.formatDate / formatDateTime', () => {
    test('formatDate HU lokalban szamokat tartalmaz', () => {
        const out = global.MattMesterI18n.formatDate('2026-03-15');
        expect(out).toMatch(/2026/);
        expect(out).toMatch(/15/);
    });

    test('formatDate EN nyelven futtathato', () => {
        global.MattMesterI18n.set('en');
        const out = global.MattMesterI18n.formatDate('2026-03-15');
        expect(out).toMatch(/2026/);
        expect(out).toMatch(/15/);
    });

    test('ervenytelen datum eseten en-dash', () => {
        expect(global.MattMesterI18n.formatDate('not-a-date')).toBe('–');
    });

    test('formatDateTime futtathato ervenyes datumon', () => {
        const out = global.MattMesterI18n.formatDateTime('2026-03-15T10:00:00Z');
        expect(typeof out).toBe('string');
        expect(out.length).toBeGreaterThan(0);
        expect(out).not.toBe('–');
    });
});

describe('MattMesterI18n — DOM applyAll dinamikusan injektalt elemekre', () => {
    test('data-i18n attribut frissul nyelvvaltaskor', () => {
        const span = makeElement('span');
        span.setAttribute('data-i18n', 'common.cancel');
        document.body.appendChild(span);
        global.MattMesterI18n.applyAll();
        expect(span.textContent).toBe('Mégse');
        global.MattMesterI18n.set('en');
        expect(span.textContent).toBe('Cancel');
    });

    test('data-i18n-attr placeholder frissul', () => {
        const input = makeElement('input');
        input.setAttribute('data-i18n-attr', 'placeholder:login.password_ph');
        document.body.appendChild(input);
        global.MattMesterI18n.applyAll();
        expect(input.getAttribute('placeholder')).toBe('Jelszó');
        global.MattMesterI18n.set('en');
        expect(input.getAttribute('placeholder')).toBe('Password');
    });
});

describe('MattMesterI18n.set — lang persistencia es korlatok', () => {
    test('nem tamogatott nyelvet visszautasit', () => {
        expect(global.MattMesterI18n.set('xx')).toBe(false);
        expect(global.MattMesterI18n.get()).toBe('hu');
    });

    test('azonos nyelv set-je no-op true (handler nem fut)', () => {
        const fn = jest.fn();
        global.MattMesterI18n.onLangChange(fn);
        expect(global.MattMesterI18n.set('hu')).toBe(true);
        expect(fn).not.toHaveBeenCalled();
    });
});
