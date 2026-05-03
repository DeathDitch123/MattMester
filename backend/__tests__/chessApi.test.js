/**
 * Chess REST API smoke tesztek (api/chess_api.js).
 *
 * Lefedi:
 *   - GET /api/chess/modes — listClient() pass-through
 *   - GET /api/chess/difficulties — osszesNehezsegiSzint() pass-through
 *   - GET /api/chess/user-elo — auth + session-cache + DB-fallback
 *   - POST /api/chess/new-bot — input-validacio (difficulty, mode), state-letrehozas
 *
 * NEM teszteli a kovetkezoket (sok side-effect, kulon teszt-suite kellene):
 *   - POST /api/chess/:id/lepes — engine-szintu unit teszt mar van (chessLifecycle)
 *   - POST /api/chess/:id/surrender — DB + ELO oldalhatas, manualis smoke
 *   - POST /api/chess/:id/ability — abilities.test.js (kulon)
 */

const express = require('express');
const session = require('express-session');
const supertest = require('supertest');

jest.mock('../chess/chess_sql_functions.js', () => ({
    jatekMentDb: jest.fn(() => Promise.resolve(123)),
    eloLekerdezDb: jest.fn(() => Promise.resolve(1234)),
    lepesMentDb: jest.fn(() => Promise.resolve()),
    jatekVegeMentDb: jest.fn(() => Promise.resolve()),
    veresegMentDb: jest.fn(() => Promise.resolve()),
    gyozelemMentDb: jest.fn(() => Promise.resolve()),
    dontetlenMentDb: jest.fn(() => Promise.resolve()),
    buildPgnLikeFromMoves: jest.fn(() => Promise.resolve('1. e4 *'))
}));

// A valodi timer.js setInterval-t inditana — Jest-ben ez akadalyozna a tiszta
// kilepest. Mockoljuk no-op-pal: a teszt nem valos lepest hajt vegre, igy az ora
// nem fontos.
jest.mock('../chess/timer.js', () => ({
    idoFut: jest.fn(),
    idoLeall: jest.fn()
}));

jest.mock('../api/functions.js', () => ({
    requireVerifiedEmail: (req, res, next) => next(), // verifikaltnak tekintjuk
    EMAIL_VERIFICATION_REQUIRED_MESSAGE: ''
}));

const sql = require('../chess/chess_sql_functions.js');
const chessRouter = require('../api/chess_api.js');

function buildApp({ sessionUserId = null, sessionElo = null } = {}) {
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'test',
        resave: false,
        saveUninitialized: false
    }));
    // Session-bevezeto (test-flow: pre-set userId + elo)
    app.use((req, res, next) => {
        if (sessionUserId !== null) req.session.userId = sessionUserId;
        if (sessionElo !== null) req.session.elo = sessionElo;
        next();
    });
    app.use('/api/chess', chessRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
});

// Issue #63 multi-tab guard: az aktiv meccsek a state.js belso jatekok Map-jeben
// halmozodnak fel. Az afterEach a 0..10000 ID-tartomanyban torol minden meccset,
// igy a kovetkezo teszt tiszta state-rol indul es a guard nem 409-eli a happy
// path-okat.
const { jatekTorol, jatekKeres } = require('../chess/state.js');
afterEach(() => {
    for (let id = 0; id < 10000; id++) {
        if (jatekKeres(id)) jatekTorol(id);
    }
});

describe('GET /api/chess/modes', () => {
    test('200 + 5 mod minden hozzajuk tartozo metadattal', async () => {
        const app = buildApp();
        const res = await supertest(app).get('/api/chess/modes');
        expect(res.status).toBe(200);
        expect(res.body.modes).toBeDefined();
        expect(Object.keys(res.body.modes).length).toBe(5);
        // Kanonikus 5 mod megerositese
        expect(res.body.modes.mattmester).toBeDefined();
        expect(res.body.modes.blitz).toBeDefined();
        // defaultMode is letezik
        expect(res.body.defaultMode).toBe('mattmester_10p');
    });

    test('eloColumn nem szivargat (csak hasElo boolean)', async () => {
        const app = buildApp();
        const res = await supertest(app).get('/api/chess/modes');
        for (const k in res.body.modes) {
            expect(res.body.modes[k].eloColumn).toBeUndefined();
            expect(typeof res.body.modes[k].hasElo).toBe('boolean');
        }
    });
});

describe('GET /api/chess/difficulties', () => {
    test('200 + szintek lista', async () => {
        const app = buildApp();
        const res = await supertest(app).get('/api/chess/difficulties');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.szintek)).toBe(true);
        expect(res.body.szintek.length).toBeGreaterThan(0);
    });

    test('minden szint nev + elo + szint mezovel', async () => {
        const app = buildApp();
        const res = await supertest(app).get('/api/chess/difficulties');
        for (const sz of res.body.szintek) {
            expect(typeof sz.nev).toBe('string');
            expect(typeof sz.elo).toBe('number');
            expect(typeof sz.szint).toBe('number');
        }
    });
});

describe('GET /api/chess/user-elo', () => {
    test('vendég (no session) → bejelentkezve:false + KEZDO_ELO', async () => {
        const app = buildApp();
        const res = await supertest(app).get('/api/chess/user-elo');
        expect(res.status).toBe(200);
        expect(res.body.bejelentkezve).toBe(false);
        expect(res.body.elo).toBe(800);
        expect(sql.eloLekerdezDb).not.toHaveBeenCalled();
    });

    test('session-elo jelen → DB NEM hívva (#46 cache)', async () => {
        const app = buildApp({ sessionUserId: 7, sessionElo: 1500 });
        const res = await supertest(app).get('/api/chess/user-elo');
        expect(res.status).toBe(200);
        expect(res.body.bejelentkezve).toBe(true);
        expect(res.body.elo).toBe(1500);
        expect(sql.eloLekerdezDb).not.toHaveBeenCalled();
    });

    test('session-elo hianyzik → DB-fallback', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app).get('/api/chess/user-elo');
        expect(res.status).toBe(200);
        expect(res.body.bejelentkezve).toBe(true);
        expect(res.body.elo).toBe(1234); // mock visszater
        expect(sql.eloLekerdezDb).toHaveBeenCalledWith(7);
    });

    test('DB-hiba 500-zal valaszol', async () => {
        sql.eloLekerdezDb.mockRejectedValueOnce(new Error('DB le'));
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app).get('/api/chess/user-elo');
        expect(res.status).toBe(500);
        expect(res.body.error).toBeDefined();
    });
});

describe('POST /api/chess/new-bot — input validacio', () => {
    test('helyes input → 200 + gameId + allapot', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1, mode: 'mattmester' });
        expect(res.status).toBe(200);
        expect(res.body.gameId).toBeDefined();
        expect(res.body.allapot).toBeDefined();
        expect(res.body.botInfo).toBeDefined();
    });

    test('vendég is indithat bot meccset (userId=null fele engedi)', async () => {
        const app = buildApp(); // no session userId
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1, mode: 'mattmester' });
        expect(res.status).toBe(200);
        // nincs DB save guest meccsre
    });

    test('ervenytelen difficulty → 400', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 99, mode: 'mattmester' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/nehézségi/i);
    });

    test('hianyzo difficulty → 400', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ mode: 'mattmester' });
        expect(res.status).toBe(400);
    });

    test('negativ difficulty → 400', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: -1, mode: 'mattmester' });
        expect(res.status).toBe(400);
    });

    test('ervenytelen mode → 400', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1, mode: 'invalid_mode_xyz' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Érvénytelen játékmód/i);
    });

    test('mode hianyzik → DEFAULT_MODE-ot hasznal', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1 });
        expect(res.status).toBe(200);
        expect(res.body.allapot.mode).toBe('mattmester_10p'); // DEFAULT_MODE
    });

    test('bot meccs ranked=false (mindig casual)', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1, mode: 'blitz' });
        expect(res.status).toBe(200);
        expect(res.body.allapot.ranked).toBe(false);
    });

    test('uj jatek lepesTortenet-je ures (nincs lepés még)', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1, mode: 'mattmester' });
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.allapot.lepesTortenet)).toBe(true);
        expect(res.body.allapot.lepesTortenet.length).toBe(0);
    });

    test('SZIGORU: float difficulty (1.5) → 400 (nem fogad el truncate-elve)', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1.5, mode: 'mattmester' });
        expect(res.status).toBe(400);
    });

    test('SZIGORU: kevert string difficulty ("1abc") → 400', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: '1abc', mode: 'mattmester' });
        expect(res.status).toBe(400);
    });

    test('SZIGORU: difficulty=9 (hatar+1) → 400', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 9, mode: 'mattmester' });
        expect(res.status).toBe(400);
    });

    test('SZIGORU: difficulty=0 → 400', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 0, mode: 'mattmester' });
        expect(res.status).toBe(400);
    });

    test('SZIGORU: difficulty mint object/array → 400', async () => {
        const app = buildApp({ sessionUserId: 7 });
        for (const bad of [{ a: 1 }, [1], true, null]) {
            const res = await supertest(app)
                .post('/api/chess/new-bot')
                .send({ difficulty: bad, mode: 'mattmester' });
            expect(res.status).toBe(400);
        }
    });

    test('SZIGORU: mode mint object → 400', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .send({ difficulty: 1, mode: { name: 'mattmester' } });
        expect(res.status).toBe(400);
    });

    test('SZIGORU: req.body mint primitiv (null/string) → 400 difficulty hianyzik', async () => {
        const app = buildApp({ sessionUserId: 7 });
        const res = await supertest(app)
            .post('/api/chess/new-bot')
            .set('Content-Type', 'application/json')
            .send('null');
        expect(res.status).toBe(400);
    });
});
