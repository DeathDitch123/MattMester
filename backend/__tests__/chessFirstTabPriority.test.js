/**
 * First-tab-priority — multi-tab guard semmilyen tipusu aktiv meccset nem lock-ol fel.
 *
 * Bug 2026-05-04: a /new-bot endpoint a `cleanupOwnAbandonedBotGame` segedfuggvennyel
 * automatikusan kitorolt egy meglevo SAJAT BOT meccset, ha a felhasznalo egy MASIK
 * tab-ban uj bot-meccset inditott. Ez exploit-olhato volt: a 2. tab elinditasaval
 * ki lehetett dobni az 1. tab aktiv jatekat. Ugyanez a logika volt a PvP queue +
 * invite handlerekben (pvp.js) is — ott is takaritott bot-meccset.
 *
 * Fix: az ELSO tab amelyik elinditja a meccset prioritast elvez. BARMILYEN aktiv
 * meccs (bot vagy PvP) eseten a masik tab-bol indulo /new-bot 409-cel zarodik,
 * a PvP queue/invite hibauzenettel ("Mar van aktiv jatszmad").
 *
 * A `cleanupOwnAbandonedBotGame` helper teljesen eltavolitva (state.js), valamint
 * a `chess:bot:replaced` socket event + frontend handler is.
 */

jest.mock('../chess/timer.js', () => ({
    idoFut: jest.fn(),
    idoLeall: jest.fn()
}));

jest.mock('../chess/chess_sql_functions.js', () => ({
    jatekMentDb: jest.fn(() => Promise.resolve(123)),
    eloLekerdezDb: jest.fn(() => Promise.resolve(1234))
}));

jest.mock('../api/functions.js', () => ({
    requireVerifiedEmail: (req, res, next) => next(),
    EMAIL_VERIFICATION_REQUIRED_MESSAGE: ''
}));

const fs = require('fs');
const path = require('path');
const express = require('express');
const session = require('express-session');
const supertest = require('supertest');

const { jatekLetrehoz, jatekTorol, hasAnyActiveGameForUser } = require('../chess/state.js');
const { jatekUjraIndit } = require('../chess/engine.js');
const chessRouter = require('../api/chess_api.js');

function buildApp(sessionUserId) {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 't', resave: false, saveUninitialized: false }));
    app.use((req, res, next) => {
        if (sessionUserId !== null) req.session.userId = sessionUserId;
        next();
    });
    app.use('/api/chess', chessRouter);
    return app;
}

const STATE_SRC    = fs.readFileSync(path.join(__dirname, '..', 'chess', 'state.js'), 'utf8');
const CHESS_API_SRC = fs.readFileSync(path.join(__dirname, '..', 'api', 'chess_api.js'), 'utf8');
const PVP_SRC      = fs.readFileSync(path.join(__dirname, '..', 'chess', 'pvp.js'), 'utf8');
const MAIN_JS_SRC  = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'chess_barold', 'javascript', 'main.js'), 'utf8');

describe('first-tab-priority — kod-szintu garanciak (regresszio guard)', () => {
    test('state.js NEM tartalmaz cleanupOwnAbandonedBotGame helper-t', () => {
        expect(STATE_SRC).not.toMatch(/cleanupOwnAbandonedBotGame/);
    });

    test('chess_api.js /new-bot NEM hivja a cleanupOwnAbandonedBotGame-t', () => {
        expect(CHESS_API_SRC).not.toMatch(/cleanupOwnAbandonedBotGame/);
    });

    test('chess_api.js /new-bot NEM emit-el chess:bot:replaced-et', () => {
        expect(CHESS_API_SRC).not.toMatch(/chess:bot:replaced/);
        expect(CHESS_API_SRC).not.toMatch(/replacedOldGameId/);
    });

    test('pvp.js queue+invite NEM hivja a cleanupOwnAbandonedBotGame-t', () => {
        expect(PVP_SRC).not.toMatch(/cleanupOwnAbandonedBotGame/);
    });

    test('frontend main.js NEM tartalmaz chess:bot:replaced handler-t', () => {
        expect(MAIN_JS_SRC).not.toMatch(/chess:bot:replaced/);
    });

    test('chess_api.js /new-bot blokk: hasAnyActiveGameForUser → 409 GAME_ALREADY_ACTIVE', () => {
        // Az ag a 409-et ad amikor barmilyen aktiv meccs van
        expect(CHESS_API_SRC).toMatch(/hasAnyActiveGameForUser\s*\([^)]+\)\.hasActive[^]*?statusCode\s*=\s*409/);
        expect(CHESS_API_SRC).toMatch(/code:\s*['"]GAME_ALREADY_ACTIVE['"]/);
    });

    test('pvp.js queue+invite mindket helyen hasAnyActiveGameForUser-rel blokkol', () => {
        const hits = PVP_SRC.match(/hasAnyActiveGameForUser\s*\(\s*userId\s*\)\.hasActive/g) || [];
        expect(hits.length).toBeGreaterThanOrEqual(2);
    });
});

describe('first-tab-priority — POST /api/chess/new-bot integration (BOT meccs blokkol)', () => {
    test('SAJAT BOT meccs aktiv → 409, regi meccs erintetlen', async () => {
        const userId = 8001;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = userId;
        jatek.botAktiv = true;
        jatek.botSzin = 'black';

        const app = buildApp(userId);
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1, mode: 'mattmester' });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('GAME_ALREADY_ACTIVE');
        expect(res.body.activeGameId).toBe(gameId);
        // Regi bot meccs valtozatlanul aktiv
        expect(hasAnyActiveGameForUser(userId).gameId).toBe(gameId);

        jatekTorol(gameId);
    });

    test('SAJAT PVP meccs aktiv → 409, regi meccs erintetlen', async () => {
        const userId = 8002;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = userId;
        jatek.pvpAktiv = true;
        jatek.pvpStatusz = 'active';

        const app = buildApp(userId);
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1, mode: 'mattmester' });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('GAME_ALREADY_ACTIVE');
        expect(res.body.activeGameId).toBe(gameId);
        // PvP meccs valtozatlanul aktiv
        expect(hasAnyActiveGameForUser(userId).gameId).toBe(gameId);

        jatekTorol(gameId);
    });

    test('SAJAT BOT meccs black-jatekoskent (regression) → 409', async () => {
        // Habar a bot-flow-ban a user mindig white, regression-fixhez tesztelunk
        // black-jatekost is — a guard userId alapjan dolgozik szinvtetlenul.
        const userId = 8003;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.black.userId = userId;
        jatek.botAktiv = true;

        const app = buildApp(userId);
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1, mode: 'mattmester' });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('GAME_ALREADY_ACTIVE');
        expect(res.body.activeGameId).toBe(gameId);

        jatekTorol(gameId);
    });

    test('mas user aktiv meccse NEM blokkolja az enyemet', async () => {
        const me = 8004;
        const masik = 8005;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = masik;
        jatek.botAktiv = true;

        const app = buildApp(me);
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1, mode: 'mattmester' });

        expect(res.status).toBe(200);
        expect(res.body?.gameId).toBeDefined();

        jatekTorol(gameId);
        if (res.body?.gameId) jatekTorol(res.body.gameId);
    });

    test('lezart meccs (vege=true) NEM blokkolja az ujat', async () => {
        const userId = 8006;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = userId;
        jatek.vege = true;

        const app = buildApp(userId);
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1, mode: 'mattmester' });

        expect(res.status).toBe(200);
        expect(res.body?.gameId).toBeDefined();

        jatekTorol(gameId);
        if (res.body?.gameId) jatekTorol(res.body.gameId);
    });

    test('409 valasz tartalmazza az activeGameId + activeMode mezoket (frontend feedback)', async () => {
        const userId = 8007;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'mattmester' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = userId;
        jatek.botAktiv = true;

        const app = buildApp(userId);
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1, mode: 'klasszikus' });

        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({
            code: 'GAME_ALREADY_ACTIVE',
            activeGameId: gameId,
            activeMode: 'mattmester'
        });
        expect(typeof res.body.error).toBe('string');
        expect(res.body.error.length).toBeGreaterThan(0);

        jatekTorol(gameId);
    });
});
