/**
 * frontend/javascript/_utils.js — runSafely / runSafelyAsync / escapeHtml /
 * fetchSessionInfo tesztek.
 *
 * A modul IIFE-vel publikalja a window.MattMesterUtils-ot. A teszt elott betoltjuk.
 */

const path = require('path');
const fs = require('fs');

beforeAll(() => {
    // Stub window + console + fetch
    global.window = global;
    global.console = console;
    // Loading: a fajl `(function () { ... })()` IIFE — kiertekel jest-ben
    const code = fs.readFileSync(path.join(__dirname, '..', 'javascript', '_utils.js'), 'utf8');
    eval(code); // eslint-disable-line no-eval
});

describe('MattMesterUtils — namespace setup', () => {
    test('window.MattMesterUtils elerheto', () => {
        expect(window.MattMesterUtils).toBeDefined();
    });

    test('runSafely fuggveny', () => {
        expect(typeof window.MattMesterUtils.runSafely).toBe('function');
    });

    test('runSafelyAsync fuggveny', () => {
        expect(typeof window.MattMesterUtils.runSafelyAsync).toBe('function');
    });

    test('escapeHtml fuggveny', () => {
        expect(typeof window.MattMesterUtils.escapeHtml).toBe('function');
    });

    test('fetchSessionInfo fuggveny', () => {
        expect(typeof window.MattMesterUtils.fetchSessionInfo).toBe('function');
    });
});

describe('runSafely', () => {
    test('handler-erteket vissza adja', () => {
        const r = window.MattMesterUtils.runSafely('test', () => 42);
        expect(r).toBe(42);
    });

    test('throw → undefined + console.error', () => {
        const orig = console.error;
        console.error = jest.fn();
        const r = window.MattMesterUtils.runSafely('test', () => { throw new Error('x'); });
        expect(r).toBeUndefined();
        expect(console.error).toHaveBeenCalled();
        console.error = orig;
    });

    test('null handler return', () => {
        const r = window.MattMesterUtils.runSafely('t', () => null);
        expect(r).toBeNull();
    });
});

describe('runSafelyAsync', () => {
    test('async handler-erteket vissza adja', async () => {
        const r = await window.MattMesterUtils.runSafelyAsync('test', async () => 42);
        expect(r).toBe(42);
    });

    test('async throw → undefined', async () => {
        const orig = console.error;
        console.error = jest.fn();
        const r = await window.MattMesterUtils.runSafelyAsync('test', async () => {
            throw new Error('x');
        });
        expect(r).toBeUndefined();
        console.error = orig;
    });
});

describe('escapeHtml', () => {
    const esc = () => window.MattMesterUtils.escapeHtml;

    test('HTML special chars', () => {
        expect(esc()('<script>')).toBe('&lt;script&gt;');
        expect(esc()('a & b')).toBe('a &amp; b');
        expect(esc()('"hello"')).toBe('&quot;hello&quot;');
        expect(esc()("o'clock")).toBe('o&#39;clock');
    });

    test('teljes XSS payload', () => {
        const r = esc()('<img src=x onerror="alert(1)">');
        expect(r).not.toContain('<');
        expect(r).not.toContain('"');
        expect(r).toContain('&lt;');
        expect(r).toContain('&quot;');
    });

    test('null / undefined → ures string', () => {
        expect(esc()(null)).toBe('');
        expect(esc()(undefined)).toBe('');
    });

    test('szam input → string conversion', () => {
        expect(esc()(42)).toBe('42');
    });

    test('boolean input → string conversion', () => {
        expect(esc()(true)).toBe('true');
        expect(esc()(false)).toBe('false');
    });

    test('& mindig elsoként (no double-escape)', () => {
        expect(esc()('&amp;')).toBe('&amp;amp;'); // OK, dupla escape ha mar escaped van
    });
});
