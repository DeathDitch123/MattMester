/**
 * api/admin/ulid.js — ULID generalas tesztek.
 */

const { generateUlid } = require('../api/admin/ulid.js');

describe('generateUlid', () => {
    test('26 karakter hosszu', () => {
        const u = generateUlid();
        expect(u.length).toBe(26);
    });

    test('csak Crockford base32 karaktereket tartalmaz', () => {
        const u = generateUlid();
        expect(u).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
    });

    test('nem deterministic — ket egymas utani UID kulonbozo', () => {
        const a = generateUlid();
        const b = generateUlid();
        expect(a).not.toBe(b);
    });

    test('time-prefix monoton novekszik (10 karakter alatt)', async () => {
        const a = generateUlid();
        await new Promise(r => setTimeout(r, 10));
        const b = generateUlid();
        // Az elso 10 karakter time-encode, igy lexikografikusan b >= a
        expect(b.slice(0, 10) >= a.slice(0, 10)).toBe(true);
    });

    test('1000 generalas mind unique', () => {
        const set = new Set();
        for (let i = 0; i < 1000; i++) {
            set.add(generateUlid());
        }
        expect(set.size).toBe(1000);
    });
});
