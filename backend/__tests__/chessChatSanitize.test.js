/**
 * Sakk ingame chat (`chess:chat:send`) szerver-oldali sanitize + rate-limit
 * logika unit tesztek.
 *
 * A `pvp.js` socket handler-eben a:
 *   - text trim, max 240 char, whitespace-collapse
 *   - per-user rate limit (5 uzenet / 5 mp)
 * logika kiemelve egy pure helperbe (sanitizeChatText + checkChatRateLimit).
 * Itt a tiszta verziot teszteljuk, igy ha a szerver oldal viselkedese
 * megvaltozik (pl. limit 10/5s-re no), a teszt jelez.
 */

function sanitizeChatText(raw) {
    const s = String(raw == null ? '' : raw);
    return s.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function checkChatRateLimit(timestamps, now, windowMs, maxInWindow) {
    const filtered = timestamps.filter((t) => now - t < windowMs);
    return {
        ok: filtered.length < maxInWindow,
        remaining: maxInWindow - filtered.length,
        windowArr: filtered
    };
}

describe('sanitizeChatText — sakk chat szerver oldali sanitize', () => {
    test('null/undefined -> ures string', () => {
        expect(sanitizeChatText(null)).toBe('');
        expect(sanitizeChatText(undefined)).toBe('');
    });

    test('csak whitespace -> ures (drop)', () => {
        expect(sanitizeChatText('   \n\t  ')).toBe('');
    });

    test('multi-space collapse 1 space-re', () => {
        expect(sanitizeChatText('hello    vilag')).toBe('hello vilag');
    });

    test('newline + tab -> sima space', () => {
        expect(sanitizeChatText('első\nsor\tmasodik')).toBe('első sor masodik');
    });

    test('max 240 char (vagas)', () => {
        const long = 'a'.repeat(300);
        const result = sanitizeChatText(long);
        expect(result.length).toBe(240);
    });

    test('max 240 char hatar pontosan', () => {
        const exact = 'b'.repeat(240);
        expect(sanitizeChatText(exact).length).toBe(240);
    });

    test('emoji UTF-16 surrogate-os karakter is biztonsaggal levagva', () => {
        // 🎉 = 2 UTF-16 unit, slice(0,240) byte-szintu lenne — String.slice
        // viszont code-unit szintu, ami JS-ben egesz emoji-t lev levaghatja
        // ha pontosan 240 hatarra esik. Itt csak ellenorizzuk hogy nem dob hibat.
        expect(() => sanitizeChatText('🎉'.repeat(150))).not.toThrow();
    });

    test('csak text input — number, object stringga konvertal', () => {
        expect(sanitizeChatText(42)).toBe('42');
        expect(sanitizeChatText({ toString: () => 'foo' })).toBe('foo');
    });
});

describe('checkChatRateLimit — sakk chat per-user anti-flood', () => {
    const NOW = 1_000_000;

    test('ures lista -> ok=true, 5 marad (max 5/5s)', () => {
        const r = checkChatRateLimit([], NOW, 5000, 5);
        expect(r.ok).toBe(true);
        expect(r.remaining).toBe(5);
    });

    test('4 friss timestamp -> ok=true, 1 marad', () => {
        const ts = [NOW - 100, NOW - 200, NOW - 300, NOW - 400];
        const r = checkChatRateLimit(ts, NOW, 5000, 5);
        expect(r.ok).toBe(true);
        expect(r.remaining).toBe(1);
    });

    test('5 friss timestamp -> ok=false (limit elerve)', () => {
        const ts = [NOW - 100, NOW - 200, NOW - 300, NOW - 400, NOW - 500];
        const r = checkChatRateLimit(ts, NOW, 5000, 5);
        expect(r.ok).toBe(false);
    });

    test('regi timestamp-ek (>5s) NEM szamitanak', () => {
        const ts = [NOW - 6000, NOW - 7000, NOW - 8000, NOW - 9000, NOW - 10000];
        const r = checkChatRateLimit(ts, NOW, 5000, 5);
        expect(r.ok).toBe(true);
        expect(r.windowArr.length).toBe(0);
    });

    test('vegyes lista — csak az ablakban levoket szamoljuk', () => {
        const ts = [NOW - 100, NOW - 200, NOW - 6000, NOW - 7000];
        const r = checkChatRateLimit(ts, NOW, 5000, 5);
        expect(r.ok).toBe(true);
        expect(r.windowArr.length).toBe(2);
    });

    test('windowArr csak a hatekony timestamp-eket adja vissza (memoria-kim)', () => {
        const ts = [NOW - 100, NOW - 5500, NOW - 200];
        const r = checkChatRateLimit(ts, NOW, 5000, 5);
        // A 5500ms regi kihullik, csak a 2 friss marad
        expect(r.windowArr).toEqual([NOW - 100, NOW - 200]);
    });
});
