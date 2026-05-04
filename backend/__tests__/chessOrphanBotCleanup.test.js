/**
 * Bug 2026-05-04 — "Mar van aktiv jatszmad" PvP queue/invite eseten,
 * ha a felhasznalo F5/tab-bezar utan rakadt egy bot meccsen.
 *
 * Fix: a `cleanupOwnAbandonedBotGame` mostantol a state.js-bol export-alt
 * kozos helper, amit a /new-bot, valamint a PvP queue+invite handlerei is
 * meghivnak a multi-tab guard ELOTT. Igy egy ragadt bot meccs nem blokkolja
 * a felhasznalot a PvP queue / invite csatlakozasban.
 *
 * Ezek a tesztek a state-szintu helper viselkedeset ellenorzik:
 *   - bot meccs eltakaritva
 *   - PvP meccs ERINTHETETLEN (azt a 60s grace period kezeli)
 *   - mas user meccse erinthetetlen
 */

const {
    jatekLetrehoz,
    jatekTorol,
    jatekKeres,
    hasAnyActiveGameForUser,
    cleanupOwnAbandonedBotGame
} = require('../chess/state.js');
const { jatekUjraIndit } = require('../chess/engine.js');

function teardownGames(...gameIds) {
    for (const id of gameIds) {
        if (id != null) jatekTorol(id);
    }
}

describe('cleanupOwnAbandonedBotGame — PvP queue/invite ELOTTI takaritas', () => {
    test('export-alt a state.js-bol (pvp.js es chess_api.js mindketto importalja)', () => {
        expect(typeof cleanupOwnAbandonedBotGame).toBe('function');
    });

    test('nincs aktiv meccs -> false (no-op)', () => {
        expect(cleanupOwnAbandonedBotGame(424242)).toBe(false);
    });

    test('null / undefined / 0 userId -> false (defenziv)', () => {
        expect(cleanupOwnAbandonedBotGame(null)).toBe(false);
        expect(cleanupOwnAbandonedBotGame(undefined)).toBe(false);
        expect(cleanupOwnAbandonedBotGame(0)).toBe(false);
    });

    test('SAJAT BOT meccs (orphan) -> takarit + true', () => {
        const userId = 5001;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.botAktiv = true;
        jatek.botSzin = 'black';
        jatek.jatekosok.white.userId = userId;

        // Pre-condition: hasActive
        expect(hasAnyActiveGameForUser(userId).hasActive).toBe(true);

        // Cleanup hivasa
        const result = cleanupOwnAbandonedBotGame(userId);
        expect(result).toBe(true);

        // Post-condition: nincs tobb aktiv meccse
        expect(hasAnyActiveGameForUser(userId).hasActive).toBe(false);
        expect(jatekKeres(gameId)).toBeNull();
    });

    test('PVP meccset SOSEM takarit el -> false, meccs erintetlen', () => {
        const userId = 5002;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.pvpAktiv = true;
        jatek.pvpStatusz = 'active';
        jatek.jatekosok.white.userId = userId;

        const result = cleanupOwnAbandonedBotGame(userId);
        expect(result).toBe(false);

        // PvP meccs valtozatlanul aktiv — a 60s grace period dolga lekezelni.
        expect(hasAnyActiveGameForUser(userId).gameId).toBe(gameId);

        teardownGames(gameId);
    });

    test('mas user bot meccse NEM takaritodik -> false (csak SAJAT)', () => {
        const otherUser = 5003;
        const me = 5004;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.botAktiv = true;
        jatek.jatekosok.white.userId = otherUser;

        // Nem en vagyok a meccs jatekosa -> nincs mit takaritani
        const result = cleanupOwnAbandonedBotGame(me);
        expect(result).toBe(false);
        expect(jatekKeres(gameId)).not.toBeNull();

        teardownGames(gameId);
    });

    test('ket-tab forgatokonyv: bot-meccs orphan, PvP queue mukodne miutan takaritottunk', () => {
        // Ez a teszt a flow-t modellezi: a felhasznalo egyik tab-ban bot meccsel
        // jatszott, F5-tel kilepett, masik tab-ban PvP queue-t inditana. A multi-
        // tab guard a takaritas UTAN futna, igy az aktiv-meccs check tiszta
        // allapotot lat.
        const userId = 5005;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.botAktiv = true;
        jatek.botSzin = 'black';
        jatek.jatekosok.white.userId = userId;

        // 1. Lepes: takaritas (a queue handler ezt csinalja eloszor)
        const cleaned = cleanupOwnAbandonedBotGame(userId);
        expect(cleaned).toBe(true);

        // 2. Multi-tab guard ujraellenorzi az aktiv-meccs allapotot — nincs tobb.
        expect(hasAnyActiveGameForUser(userId).hasActive).toBe(false);

        // Cleanup ne dobjon, ha a meccs mar nincs (idempotens).
        expect(jatekKeres(gameId)).toBeNull();
    });
});
