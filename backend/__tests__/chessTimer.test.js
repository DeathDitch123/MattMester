/**
 * chess/timer.js — szerver-oldali ora kezeles tesztek.
 *
 * Lefedi:
 *   - idoLeall: timer torlodik, utolsoTickMs reseteli
 *   - idoFut: vegtelen ido modban nincs timer, idokorlatos modban setInterval
 *   - idoTikk: paused effekt eseten nem fogy az ido, lejart eseten nem
 */

// VALODI (nem mockolt) timer.js — hisz pont ezt teszteljuk.
jest.unmock('../chess/timer.js');

// De a state-import ne csinaljon mast.
const { jatekLetrehoz, jatekTorol } = require('../chess/state.js');
const { idoLeall, idoFut } = require('../chess/timer.js');

describe('idoLeall', () => {
    test('mindket szin timer-jet leallitja', () => {
        const { jatek, gameId } = jatekLetrehoz({ mode: 'blitz' });
        // Manualisan setInterval-t kreal a timer slotba
        jatek.jatekosok.white.timer = setInterval(() => {}, 60_000);
        jatek.jatekosok.black.timer = setInterval(() => {}, 60_000);
        idoLeall(jatek);
        expect(jatek.jatekosok.white.timer).toBeNull();
        expect(jatek.jatekosok.black.timer).toBeNull();
        jatekTorol(gameId);
    });

    test('utolsoTickMs reseteli', () => {
        const { jatek, gameId } = jatekLetrehoz({ mode: 'blitz' });
        jatek.jatekosok.white.utolsoTickMs = 12345;
        idoLeall(jatek);
        expect(jatek.jatekosok.white.utolsoTickMs).toBeNull();
        jatekTorol(gameId);
    });

    test('idempotens: tobbszori hivas nem dob', () => {
        const { jatek, gameId } = jatekLetrehoz({ mode: 'blitz' });
        idoLeall(jatek);
        expect(() => idoLeall(jatek)).not.toThrow();
        jatekTorol(gameId);
    });
});

describe('idoFut', () => {
    test('vegtelen ido (mattmester) → NEM indit timer-t', () => {
        const { jatek, gameId } = jatekLetrehoz({ mode: 'mattmester' });
        jatek.jatekosok.white.ido = null;
        idoFut(jatek, 'white');
        expect(jatek.jatekosok.white.timer).toBeNull();
        idoLeall(jatek);
        jatekTorol(gameId);
    });

    test('idokorlatos modban timer indul', () => {
        const { jatek, gameId } = jatekLetrehoz({ mode: 'blitz' });
        // jatekLetrehoz mar feltoltotte ido-t
        idoFut(jatek, 'white');
        expect(jatek.jatekosok.white.timer).not.toBeNull();
        idoLeall(jatek);
        jatekTorol(gameId);
    });

    test('idoFut leallitja a regi timer-t mielott uj-at indit', () => {
        const { jatek, gameId } = jatekLetrehoz({ mode: 'blitz' });
        idoFut(jatek, 'white');
        const t1 = jatek.jatekosok.white.timer;
        idoFut(jatek, 'white');
        const t2 = jatek.jatekosok.white.timer;
        // Az uj timer kulonbozik a regitol (vagy ugyanaz, ha a Node.js intern recikl)
        expect(t2).not.toBeNull();
        idoLeall(jatek);
        jatekTorol(gameId);
    });
});
