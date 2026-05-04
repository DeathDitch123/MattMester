/**
 * Sakk bot quick-chat: frazis-mapping + canned bot-valasz tesztek.
 *
 * A `main.js` quick-chat handlere ket ALLANDOT hasznal:
 *   - QUICK_CHAT_FRAZISOK[key]: a felhasznalo gomb-szovege
 *   - BOT_CANNED_VALASZOK[key]: a bot lehetséges valaszai (1-N elem)
 *
 * Itt a strukturat es a kulcs-konzisztenciat ellenorizzuk: minden valasztott
 * key-hez van fraz IS valasz IS, es a valasz-tomb nem ures (kulonben a bot
 * `[Math.random()]` indexelas null-ra futna).
 */

const QUICK_CHAT_FRAZISOK = {
    gl:       'Sok szerencsét!',
    hello:    'Hello!',
    nice:     'Szép lépés!',
    wow:      'Hűha!',
    oops:     'Hopp!',
    thinking: 'Gondolkodok…',
    thanks:   'Köszi a meccset!',
    wp:       'Jól játszottál!',
    gg:       'GG'
};

const BOT_CANNED_VALASZOK = {
    gl:       ['Köszi, neked is sok szerencsét!', 'Köszi! 🤖 Lássuk!'],
    hello:    ['Helló, készen állok!', 'Üdv! 🤖'],
    nice:     ['Köszi! 🤖', 'Na, próbálkozok!', 'Tanulok belőled.'],
    wow:      ['Igen, ez érdekes pozíció.', '🤖 Hmmm.'],
    oops:     ['Mindenkivel előfordul!', 'Néha a botok is bakiznak.'],
    thinking: ['Én is.', '🤖 számol…', 'Nehéz pozíció.'],
    thanks:   ['Én köszönöm a meccset!', 'Bármikor! 🤖'],
    wp:       ['Köszi! Te is jól játszottál.', '🤖 köszi!'],
    gg:       ['GG! Jó volt játszani.', 'GG! Bármikor revans.']
};

describe('quick-chat frazis-mapping konzisztencia', () => {
    test('minden frazis-kulcshoz van legalabb 1 bot canned valasz', () => {
        for (const key of Object.keys(QUICK_CHAT_FRAZISOK)) {
            expect(BOT_CANNED_VALASZOK[key]).toBeDefined();
            expect(Array.isArray(BOT_CANNED_VALASZOK[key])).toBe(true);
            expect(BOT_CANNED_VALASZOK[key].length).toBeGreaterThan(0);
        }
    });

    test('minden valasz-kulcs talalkozik egy frazis-kulccsal (nincs orphan)', () => {
        for (const key of Object.keys(BOT_CANNED_VALASZOK)) {
            expect(QUICK_CHAT_FRAZISOK[key]).toBeDefined();
        }
    });

    test('minden frazis nem-ures string', () => {
        for (const v of Object.values(QUICK_CHAT_FRAZISOK)) {
            expect(typeof v).toBe('string');
            expect(v.length).toBeGreaterThan(0);
        }
    });

    test('minden bot valasz nem-ures string', () => {
        for (const arr of Object.values(BOT_CANNED_VALASZOK)) {
            for (const v of arr) {
                expect(typeof v).toBe('string');
                expect(v.length).toBeGreaterThan(0);
            }
        }
    });

    test('a `gg` kulcsnal a valaszok GG-vel kezdodnek (kontextual koherencia)', () => {
        for (const v of BOT_CANNED_VALASZOK.gg) {
            expect(v.startsWith('GG')).toBe(true);
        }
    });

    test('a `gl` kulcsnal a valaszok hala-szovegek (kontextual koherencia)', () => {
        for (const v of BOT_CANNED_VALASZOK.gl) {
            expect(/Köszi|Köszön|Lássuk/.test(v)).toBe(true);
        }
    });
});

describe('quick-chat random-valasztas safety', () => {
    test('Math.floor(random * len) sosem ad ki ervenytelen indexet', () => {
        // Szimulalt 1000 iteracio mindegyik kulcson — sosem essen ki array.length-en kívül.
        for (const arr of Object.values(BOT_CANNED_VALASZOK)) {
            for (let i = 0; i < 1000; i++) {
                const idx = Math.floor(Math.random() * arr.length);
                expect(idx).toBeGreaterThanOrEqual(0);
                expect(idx).toBeLessThan(arr.length);
                expect(arr[idx]).toBeDefined();
            }
        }
    });
});
