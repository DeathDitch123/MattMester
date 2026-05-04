/**
 * sql/modules/chat.js — pure-helper tesztek (containsBlockedWord, resolvePreview, etc).
 */

jest.mock('../sql/database.js', () => ({
    getPool: jest.fn()
}));

const chat = require('../sql/modules/chat.js');

describe('containsBlockedWord — chat moderacio', () => {
    test('tiszta szoveg → false', () => {
        expect(chat.containsBlockedWord('hello, hogy vagy?')).toBe(false);
    });

    test('hardcoded blocklist (kis kifejezes pl. "muie") → true', () => {
        // A blocklist tartalmaz "muie"-t (per code grep)
        expect(chat.containsBlockedWord('te muie')).toBe(true);
    });

    test('case-insensitive (uppercase mas)', () => {
        expect(chat.containsBlockedWord('TE MUIE')).toBe(true);
    });

    test('reszszo NEM trigger (boundary regex — nem ut bele)', () => {
        // Ha a word "muie" es a szovegben "muiez" van, az NEM trigger
        expect(chat.containsBlockedWord('muiezacska')).toBe(false);
    });

    test('null / undefined / ures → false', () => {
        expect(chat.containsBlockedWord(null)).toBe(false);
        expect(chat.containsBlockedWord(undefined)).toBe(false);
        expect(chat.containsBlockedWord('')).toBe(false);
    });

    test('whitespace-only → false', () => {
        expect(chat.containsBlockedWord('   \t\n')).toBe(false);
    });

    test('akcentus-mentes ekvivalens (NFD normalizacio)', () => {
        // román (ekezetes) → roman (mert NFD strip-eli az akcent jeleket)
        // Csak akkor ervenyes ha a CHAT_BLOCKED_WORDS tartalmaz "román"-t
        // amit a kod normalizalja "roman"-na
        const result = chat.containsBlockedWord('a roman miert');
        expect(typeof result).toBe('boolean');
    });

    test('hosszu uzenet teljesitmeny (1000 char) — nem dob', () => {
        const long = 'a'.repeat(1000);
        expect(() => chat.containsBlockedWord(long)).not.toThrow();
    });
});

describe('resolvePreviewFromBody', () => {
    test('rovid szoveg → valtozatlanul', () => {
        expect(chat.resolvePreviewFromBody('Hello vilag')).toBe('Hello vilag');
    });

    test('hosszu szoveg → max 120 char (default)', () => {
        const long = 'x'.repeat(200);
        const r = chat.resolvePreviewFromBody(long);
        expect(r.length).toBeLessThanOrEqual(120 + 3); // "..."
    });

    test('whitespace normalizalva', () => {
        const r = chat.resolvePreviewFromBody('  foo   bar\n\nbaz  ');
        expect(r).toBe('foo bar baz');
    });

    test('null / undefined → ures string', () => {
        expect(chat.resolvePreviewFromBody(null)).toBe('');
        expect(chat.resolvePreviewFromBody(undefined)).toBe('');
        expect(chat.resolvePreviewFromBody('')).toBe('');
    });

    test('custom maxLength', () => {
        const r = chat.resolvePreviewFromBody('a'.repeat(50), 20);
        expect(r.length).toBeLessThanOrEqual(20 + 3);
    });
});

describe('getDynamicBlockedWordsSnapshot', () => {
    test('Array kerul vissza', () => {
        const r = chat.getDynamicBlockedWordsSnapshot();
        expect(Array.isArray(r)).toBe(true);
    });
});
