/**
 * Bug 2026-05-04 — multi-tab bot meccs csere ertesites.
 *
 * Forgatokonyv:
 *   1. Tab A: bot meccs gameId=3 indul, jatekos lep par lepest
 *   2. Tab B: chess.html?type=bot=... uj bot meccs indit
 *   3. Backend cleanupOwnAbandonedBotGame torli gameId=3-at, letrehoz gameId=4-et
 *   4. Tab A: idoPollingIndit /api/chess/3/state -> 404 vegtelenul (bug)
 *
 * Fix: a /new-bot endpoint emit-eli a `chess:bot:replaced` socket eventet a
 * felhasznalo OSSZES tab-jara (user-room) az `oldGameId` mezovel. A frontend
 * (main.js) erre reset-eli a state-et es a chooser-t nyitja meg.
 */

const fs = require('fs');
const path = require('path');

const CHESS_API_SRC = fs.readFileSync(
    path.resolve(__dirname, '..', 'api', 'chess_api.js'),
    'utf8'
);
const MAIN_JS_SRC = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'frontend', 'chess_barold', 'javascript', 'main.js'),
    'utf8'
);

describe('backend chess_api.js /new-bot — chess:bot:replaced emit', () => {
    test('replacedOldGameId capture-ol a cleanupOwnAbandonedBotGame ELOTT', () => {
        // A backend-nek tudnia kell a regi gameId-t, hogy a socket eventben elkuldje.
        // A `cleanupOwnAbandonedBotGame` torli a gameId-t, igy ELOTTE kell elmenteni.
        expect(CHESS_API_SRC).toMatch(/replacedOldGameId/);
        // hasAnyActiveGameForUser hivas a gameId lekerdezesere
        expect(CHESS_API_SRC).toMatch(/hasAnyActiveGameForUser\s*\(\s*userId\w*/);
    });

    test('socketHub.emitToUser hivas chess:bot:replaced eventnevvel', () => {
        expect(CHESS_API_SRC).toMatch(/socketHub\.emitToUser\s*\(\s*userId\s*,\s*['"]chess:bot:replaced['"]/);
    });

    test('emit payload tartalmazza az oldGameId + newGameId mezoket', () => {
        // A frontend handler az oldGameId alapjan dont, hogy reset-eli-e a state-et.
        const idx = CHESS_API_SRC.indexOf("'chess:bot:replaced'");
        expect(idx).toBeGreaterThan(-1);
        const blokk = CHESS_API_SRC.substring(idx, idx + 500);
        expect(blokk).toMatch(/oldGameId\s*:/);
        expect(blokk).toMatch(/newGameId\s*:/);
    });

    test('emit GUARD-olt: csak akkor megy, ha tenylegesen kitakaritottunk regi meccset', () => {
        // Az `if (replacedOldGameId && userId)` guard biztositja, hogy felesleges
        // emit nem megy ki minden /new-bot kerésnel — csak amikor tenyleg
        // kitakaritottunk valamit.
        expect(CHESS_API_SRC).toMatch(/if\s*\(\s*replacedOldGameId\s*&&\s*userId\s*\)/);
    });

    test('socketHub-keres `req.app.locals.socketHub`-bol (defensive null-check-szel)', () => {
        // A standard pattern a backend-ben: req.app?.locals?.socketHub. Ha a
        // socketHub nincs beallitva (pl. teszt environment), no-op.
        expect(CHESS_API_SRC).toMatch(/req\.app\??\.locals\??\.socketHub|req\.app\.locals\?\.socketHub/);
    });
});

describe('frontend main.js — chess:bot:replaced handler', () => {
    test('a handler regisztralva van a pvpSocketInit-ben', () => {
        expect(MAIN_JS_SRC).toMatch(/socket\.on\(['"]chess:bot:replaced['"]/);
    });

    test('a handler ellenoorizi az oldGameId-t a sajat gameId-vel', () => {
        const idx = MAIN_JS_SRC.indexOf("chess:bot:replaced");
        expect(idx).toBeGreaterThan(-1);
        const tartomany = MAIN_JS_SRC.substring(idx, idx + 1500);
        // Csak akkor reagaljon, ha a sajat gameId egyezik az oldGameId-vel.
        expect(tartomany).toMatch(/data\.oldGameId/);
        expect(tartomany).toMatch(/Number\(gameId\)\s*!==\s*Number\(data\.oldGameId\)|gameId\s*===?\s*data\.oldGameId/);
    });

    test('a handler reset-eli a state-et + leallitja a polling-okat', () => {
        const idx = MAIN_JS_SRC.indexOf("chess:bot:replaced");
        const tartomany = MAIN_JS_SRC.substring(idx, idx + 1500);
        // A reset jellemzo lepesei
        expect(tartomany).toMatch(/idoPollingLeall\s*\(/);
        expect(tartomany).toMatch(/clearInterval\s*\(\s*botPollTimer/);
        expect(tartomany).toMatch(/gameId\s*=\s*null/);
        expect(tartomany).toMatch(/botInfo\s*=\s*null/);
        expect(tartomany).toMatch(/utolsoAllapot\s*=\s*null/);
    });

    test('a handler a chooser-t nyitja meg (NEM hagyja ures kepernyon)', () => {
        const idx = MAIN_JS_SRC.indexOf("chess:bot:replaced");
        const tartomany = MAIN_JS_SRC.substring(idx, idx + 1500);
        expect(tartomany).toMatch(/ujMeccsChooserNyitas\s*\(/);
    });

    test('a handler felhasznaloi visszajelzest ad (mmAlert)', () => {
        // A user-feedback memoria-szabaly: NE legyen native alert/confirm.
        // A `window.mmAlert` a custom HTML modal helper.
        const idx = MAIN_JS_SRC.indexOf("chess:bot:replaced");
        const tartomany = MAIN_JS_SRC.substring(idx, idx + 1500);
        expect(tartomany).toMatch(/window\.mmAlert/);
        // NEM lehet natív alert
        expect(tartomany).not.toMatch(/window\.alert\s*\(/);
    });
});

describe('integracios szimulacio: /new-bot viselkedese aktiv bot-meccs jelenleteben', () => {
    // Ez a teszt a state.js-szintu cleanupOwnAbandonedBotGame helper viselkedeset
    // ellenoorizi (mar lefedve a chessOrphanBotCleanup.test.js-ben is, ide
    // dokumentacioskent ujraellenoorzes).
    const { jatekLetrehoz, jatekTorol, hasAnyActiveGameForUser, cleanupOwnAbandonedBotGame } = require('../chess/state.js');
    const { jatekUjraIndit } = require('../chess/engine.js');

    test('aktiv bot meccs eseten a cleanupOwnAbandonedBotGame torli + replacedOldGameId capture-elheto', () => {
        const userId = 7700;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.botAktiv = true;
        jatek.botSzin = 'black';
        jatek.jatekosok.white.userId = userId;

        // Kezdesz aktiv allapottal
        expect(hasAnyActiveGameForUser(userId).hasActive).toBe(true);
        const oldGameId = hasAnyActiveGameForUser(userId).gameId;
        expect(oldGameId).toBe(gameId);

        // Cleanup
        const cleaned = cleanupOwnAbandonedBotGame(userId);
        expect(cleaned).toBe(true);

        // A regi gameId mostantol nem aktiv
        expect(hasAnyActiveGameForUser(userId).hasActive).toBe(false);

        // Ha lett volna replacedOldGameId capture, az `oldGameId` szam.
        // (A /new-bot endpoint a kovetkezo lepeskent letrehozna egy uj meccset.)
        expect(typeof oldGameId).toBe('number');
        expect(oldGameId).toBeGreaterThan(0);
    });
});
