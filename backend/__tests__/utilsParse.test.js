/**
 * backend/utils/parse.js — parsePositiveInteger egyseg-tesztek.
 * Az N14 (#38) sprintben atkoltozott helper. Itt minden hatar-eset le van fedve,
 * mert az API koztes-rétegek mind erre tamaszkodnak userId / pageSize / convId
 * normalizalashoz, es egy buggy ag az osszes endpoint-on nehez bug-okat okozna.
 */

const {
    parsePositiveInteger,
    parsePositiveIntegerInRange,
    clampPositiveInteger,
    parseEnumString,
    parseTrimmedString,
    parseBooleanStrict
} = require('../utils/parse.js');

describe('parsePositiveInteger — pozitiv egesz validacio', () => {
    test('tipikus pozitiv egesz: szam tipus', () => {
        expect(parsePositiveInteger(1)).toBe(1);
        expect(parsePositiveInteger(42)).toBe(42);
        expect(parsePositiveInteger(99999)).toBe(99999);
    });

    test('tipikus pozitiv egesz: string formaban', () => {
        expect(parsePositiveInteger('1')).toBe(1);
        expect(parsePositiveInteger('42')).toBe(42);
        expect(parsePositiveInteger('99999')).toBe(99999);
    });

    test('0 nem fogadhato el (nem pozitiv)', () => {
        expect(parsePositiveInteger(0)).toBeNull();
        expect(parsePositiveInteger('0')).toBeNull();
    });

    test('negativ szam fallback-elt ad', () => {
        expect(parsePositiveInteger(-1)).toBeNull();
        expect(parsePositiveInteger(-100)).toBeNull();
        expect(parsePositiveInteger('-5')).toBeNull();
    });

    test('lebego pont (Number.isInteger guard) elutasit', () => {
        expect(parsePositiveInteger(1.5)).toBeNull();
        expect(parsePositiveInteger(0.1)).toBeNull();
        expect(parsePositiveInteger('3.14')).toBeNull();
    });

    test('NaN / Infinity elutasit', () => {
        expect(parsePositiveInteger(NaN)).toBeNull();
        expect(parsePositiveInteger(Infinity)).toBeNull();
        expect(parsePositiveInteger(-Infinity)).toBeNull();
        expect(parsePositiveInteger('abc')).toBeNull();
    });

    test('null / undefined / ures string elutasit', () => {
        expect(parsePositiveInteger(null)).toBeNull();
        expect(parsePositiveInteger(undefined)).toBeNull();
        expect(parsePositiveInteger('')).toBeNull();
    });

    test('boolean es objektum / array elutasit (szigoru typeof guard)', () => {
        expect(parsePositiveInteger(true)).toBeNull();
        expect(parsePositiveInteger(false)).toBeNull();
        expect(parsePositiveInteger({})).toBeNull();
        expect(parsePositiveInteger([])).toBeNull();
        expect(parsePositiveInteger([1])).toBeNull(); // Array NEM kerul Number-coercion alá
    });

    test('fallback alapertekkel ervenyte len input eseten', () => {
        expect(parsePositiveInteger('foo', 99)).toBe(99);
        expect(parsePositiveInteger(null, 0)).toBe(0);
        expect(parsePositiveInteger(-1, 100)).toBe(100);
    });

    test('fallback NEM aktivalodik ervenyes input eseten', () => {
        expect(parsePositiveInteger(5, 99)).toBe(5);
        expect(parsePositiveInteger('7', 99)).toBe(7);
    });

    test('fallback default = null', () => {
        expect(parsePositiveInteger('foo')).toBeNull();
    });

    test('large safe integer kezeles (Number.MAX_SAFE_INTEGER)', () => {
        expect(parsePositiveInteger(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    });
});

describe('parsePositiveIntegerInRange — bounded validacio', () => {
    test('range-on-belul → ervenyes', () => {
        expect(parsePositiveIntegerInRange(5, 1, 10)).toBe(5);
        expect(parsePositiveIntegerInRange(1, 1, 10)).toBe(1);
        expect(parsePositiveIntegerInRange(10, 1, 10)).toBe(10);
    });

    test('range-on-kivul → fallback', () => {
        expect(parsePositiveIntegerInRange(0, 1, 10)).toBeNull();
        expect(parsePositiveIntegerInRange(11, 1, 10)).toBeNull();
        expect(parsePositiveIntegerInRange(-1, 1, 10)).toBeNull();
    });

    test('ervenytelen alaperves szam → fallback', () => {
        expect(parsePositiveIntegerInRange('abc', 1, 10, 5)).toBe(5);
        expect(parsePositiveIntegerInRange(null, 1, 10, 5)).toBe(5);
    });

    test('string input range-on-belul', () => {
        expect(parsePositiveIntegerInRange('5', 1, 10)).toBe(5);
    });

    test('boolean / array NEM koerszional (egyezo a parsePositiveInteger-rel)', () => {
        expect(parsePositiveIntegerInRange(true, 1, 10)).toBeNull();
        expect(parsePositiveIntegerInRange([5], 1, 10)).toBeNull();
    });
});

describe('clampPositiveInteger — clamp helper', () => {
    test('range-on-belul → ervenyes', () => {
        expect(clampPositiveInteger(50, 1, 100)).toBe(50);
    });

    test('negativ es nulla → fallback (a parsePositiveInteger elutasitja, a clamp nem mentheti)', () => {
        // A clamp NEM tudja megmenteni a negativot/nullat — azok mar elutasitottak
        // a parsePositiveInteger-nel. A range-clamp csak pozitiv egesz inputra hat.
        expect(clampPositiveInteger(-1, 1, 100, 99)).toBe(99);
        expect(clampPositiveInteger(0, 1, 100, 99)).toBe(99);
    });

    test('magasabb mint max → max-ra csap', () => {
        expect(clampPositiveInteger(99999, 1, 100)).toBe(100);
        expect(clampPositiveInteger('500', 1, 100)).toBe(100);
    });

    test('parseolhatatlan → fallback', () => {
        expect(clampPositiveInteger('abc', 1, 100, 25)).toBe(25);
    });
});

describe('parseEnumString — whitelist-alapu enum', () => {
    const ALLOWED = ['cheating', 'spam', 'toxicity'];

    test('whitelist eleme → ervenyes', () => {
        expect(parseEnumString('spam', ALLOWED)).toBe('spam');
    });

    test('nem-whitelist string → fallback', () => {
        expect(parseEnumString('hacking', ALLOWED)).toBeNull();
        expect(parseEnumString('SPAM', ALLOWED)).toBeNull(); // case-sensitive
    });

    test('nem-string input → fallback', () => {
        expect(parseEnumString(123, ALLOWED)).toBeNull();
        expect(parseEnumString(null, ALLOWED)).toBeNull();
        expect(parseEnumString({}, ALLOWED)).toBeNull();
    });

    test('Set-nek atadva is mukodik', () => {
        expect(parseEnumString('spam', new Set(ALLOWED))).toBe('spam');
    });

    test('fallback ervenyetlen eseten', () => {
        expect(parseEnumString('foo', ALLOWED, 'default')).toBe('default');
    });
});

describe('parseTrimmedString — non-empty trim helper', () => {
    test('ervenyes string trim-elve', () => {
        expect(parseTrimmedString('  hello  ', 100)).toBe('hello');
    });

    test('ures vagy whitespace-only → fallback', () => {
        expect(parseTrimmedString('', 100)).toBeNull();
        expect(parseTrimmedString('   ', 100)).toBeNull();
        expect(parseTrimmedString('\t\n', 100)).toBeNull();
    });

    test('hossz-bound: trim utan tul-hosszu → fallback', () => {
        expect(parseTrimmedString('a'.repeat(101), 100)).toBeNull();
        expect(parseTrimmedString('a'.repeat(100), 100)).toBe('a'.repeat(100));
    });

    test('nem-string → fallback', () => {
        expect(parseTrimmedString(123, 100)).toBeNull();
        expect(parseTrimmedString(null, 100)).toBeNull();
        expect(parseTrimmedString(undefined, 100)).toBeNull();
        expect(parseTrimmedString({}, 100)).toBeNull();
    });

    test('prototype-pollution kulcsok elutasitva', () => {
        expect(parseTrimmedString('__proto__', 100)).toBeNull();
        expect(parseTrimmedString('constructor', 100)).toBeNull();
        expect(parseTrimmedString('prototype', 100)).toBeNull();
        // Trim-elve a fenti kulcsok jonnek vissza:
        expect(parseTrimmedString('  __proto__  ', 100)).toBeNull();
    });

    test('fallback ervenytelen eseten', () => {
        expect(parseTrimmedString('', 100, 'def')).toBe('def');
    });
});

describe('parseBooleanStrict — szigoru bool parse', () => {
    test('true-felek → true', () => {
        expect(parseBooleanStrict(true)).toBe(true);
        expect(parseBooleanStrict(1)).toBe(true);
        expect(parseBooleanStrict('1')).toBe(true);
        expect(parseBooleanStrict('true')).toBe(true);
    });

    test('false-felek → false', () => {
        expect(parseBooleanStrict(false)).toBe(false);
        expect(parseBooleanStrict(0)).toBe(false);
        expect(parseBooleanStrict('0')).toBe(false);
        expect(parseBooleanStrict('false')).toBe(false);
    });

    test('mas string-ek → fallback (NEM koerszional yes/no)', () => {
        expect(parseBooleanStrict('yes')).toBeNull();
        expect(parseBooleanStrict('no')).toBeNull();
        expect(parseBooleanStrict('TRUE')).toBeNull(); // case-sensitive
    });

    test('null / undefined / object → fallback', () => {
        expect(parseBooleanStrict(null)).toBeNull();
        expect(parseBooleanStrict(undefined)).toBeNull();
        expect(parseBooleanStrict({})).toBeNull();
        expect(parseBooleanStrict([])).toBeNull();
    });

    test('fallback ervenytelen eseten', () => {
        expect(parseBooleanStrict('foo', false)).toBe(false);
        expect(parseBooleanStrict(null, true)).toBe(true);
    });
});
