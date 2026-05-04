/**
 * Issue #63 — multi-tab guard tesztek (state.hasAnyActiveGameForUser + chess_api new-bot).
 *
 * Egy felhasznalo NEM tud egyszerre tobb meccset jatszani — sem 2 PvP-t,
 * sem 1 PvP + 1 bot kombinaciot, sem 2 bot-meccset.
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

describe('hasAnyActiveGameForUser — direct unit test', () => {
    test('nincs meccs → hasActive:false', () => {
        const r = hasAnyActiveGameForUser(99999);
        expect(r.hasActive).toBe(false);
    });

    test('null/undefined userId → hasActive:false', () => {
        expect(hasAnyActiveGameForUser(null).hasActive).toBe(false);
        expect(hasAnyActiveGameForUser(undefined).hasActive).toBe(false);
        expect(hasAnyActiveGameForUser(0).hasActive).toBe(false);
    });

    test('user white-jatekoskent → hasActive:true', () => {
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = 7;
        const r = hasAnyActiveGameForUser(7);
        expect(r.hasActive).toBe(true);
        expect(r.gameId).toBe(gameId);
        jatekTorol(gameId);
    });

    test('user black-jatekoskent → hasActive:true', () => {
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.black.userId = 7;
        const r = hasAnyActiveGameForUser(7);
        expect(r.hasActive).toBe(true);
        jatekTorol(gameId);
    });

    test('vege=true meccs nem szamit aktivnak', () => {
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = 7;
        jatek.vege = true;
        const r = hasAnyActiveGameForUser(7);
        expect(r.hasActive).toBe(false);
        jatekTorol(gameId);
    });

    test('mas user nem trigger-eli', () => {
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = 7;
        const r = hasAnyActiveGameForUser(99);
        expect(r.hasActive).toBe(false);
        jatekTorol(gameId);
    });
});

describe('POST /api/chess/new-bot — multi-tab guard (Issue #63)', () => {
    test('aktiv meccs nelkul → 200 OK (alap eset)', async () => {
        const app = buildApp(7);
        const res = await supertest(app).post('/api/chess/new-bot').send({ difficulty: 1, mode: 'mattmester' });
        expect(res.status).toBe(200);
        // Cleanup
        if (res.body?.gameId) jatekTorol(res.body.gameId);
    });

    test('mar van aktiv meccs → 409 GAME_ALREADY_ACTIVE', async () => {
        // Manualisan letrehozunk egy aktiv meccset user-7-nek
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = 7;

        const app = buildApp(7);
        const res = await supertest(app).post('/api/chess/new-bot').send({ difficulty: 1, mode: 'mattmester' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('GAME_ALREADY_ACTIVE');
        expect(res.body.activeGameId).toBe(gameId);

        jatekTorol(gameId);
    });

    test('vendeg (no session) → guard atengedi (nincs userId-jukhoz kothet)', async () => {
        const app = buildApp(null);
        const res = await supertest(app).post('/api/chess/new-bot').send({ difficulty: 1, mode: 'mattmester' });
        expect(res.status).toBe(200);
        if (res.body?.gameId) jatekTorol(res.body.gameId);
    });

    test('mas user aktiv meccse NEM blokkolja az enyemet', async () => {
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = 99; // mas user

        const app = buildApp(7);
        const res = await supertest(app).post('/api/chess/new-bot').send({ difficulty: 1, mode: 'mattmester' });
        expect(res.status).toBe(200);

        jatekTorol(gameId);
        if (res.body?.gameId) jatekTorol(res.body.gameId);
    });

    test('lezart meccs (vege=true) → uj indithato', async () => {
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = 7;
        jatek.vege = true; // mar lezart

        const app = buildApp(7);
        const res = await supertest(app).post('/api/chess/new-bot').send({ difficulty: 1, mode: 'mattmester' });
        expect(res.status).toBe(200);

        jatekTorol(gameId);
        if (res.body?.gameId) jatekTorol(res.body.gameId);
    });

    test('SAJAT BOT meccs → 409, NEM takaritodik el (first-tab-priority)', async () => {
        // First-tab-priority: az elso tab amelyik a bot-meccset elinditotta
        // prioritast elvez. Masik tab-bol indulo /new-bot keres 409-cel elutasitva,
        // a meglevo bot meccs ERINTHETETLEN.
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = 7;
        jatek.botAktiv = true;
        jatek.botSzin = 'black';

        const app = buildApp(7);
        const res = await supertest(app).post('/api/chess/new-bot').send({ difficulty: 1, mode: 'mattmester' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('GAME_ALREADY_ACTIVE');
        // Regi bot meccs valtozatlanul aktiv
        expect(hasAnyActiveGameForUser(7).gameId).toBe(gameId);

        jatekTorol(gameId);
    });

    test('aktiv PVP meccs → 409, meccs erintetlen', async () => {
        // PvP meccset sohasem takaritjuk a /new-bot-bol, es most a bot-tipusu
        // aktiv meccset sem (first-tab-priority).
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = 7;
        jatek.pvpAktiv = true;
        jatek.pvpStatusz = 'active';

        const app = buildApp(7);
        const res = await supertest(app).post('/api/chess/new-bot').send({ difficulty: 1, mode: 'mattmester' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('GAME_ALREADY_ACTIVE');
        // PvP meccs valtozatlanul aktiv
        expect(hasAnyActiveGameForUser(7).gameId).toBe(gameId);

        jatekTorol(gameId);
    });
});
