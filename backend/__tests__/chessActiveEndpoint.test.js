/**
 * GET /api/chess/active — first-tab-priority guard endpoint.
 *
 * A frontpage chooser meghivja MIELOTT bot-meccset inditana / queue-t emit-elne /
 * invite-ot kuldene. Ha hasActive:true → a frontend custom modalt mutat es NEM
 * navigal a chess.html-re. Igy a felhasznalo nem kapja meg a 409-et csak miutan
 * mar atdobta magat egy uj oldalra.
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

const { jatekLetrehoz, jatekTorol } = require('../chess/state.js');
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

describe('GET /api/chess/active — endpoint contract', () => {
    test('nincs session → hasActive:false (vendegnek nincs aktiv meccs userId-vel)', async () => {
        const app = buildApp(null);
        const res = await supertest(app).get('/api/chess/active');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ hasActive: false, isLive: false, gameId: null, mode: null, type: null });
    });

    test('session van, de nincs meccs → hasActive:false', async () => {
        const app = buildApp(7777);
        const res = await supertest(app).get('/api/chess/active');
        expect(res.status).toBe(200);
        expect(res.body.hasActive).toBe(false);
        expect(res.body.gameId).toBeNull();
        expect(res.body.type).toBeNull();
    });

    test('aktiv BOT meccs (recent activity) → hasActive:true, isLive:true, type:"bot", botInfo', async () => {
        const userId = 7001;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'mattmester' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = userId;
        jatek.botAktiv = true;
        jatek.botSzin = 'black';
        jatek.nehezseg = 4;
        jatek.lastActivityAt = Date.now(); // recent

        const app = buildApp(userId);
        const res = await supertest(app).get('/api/chess/active');
        expect(res.status).toBe(200);
        expect(res.body.hasActive).toBe(true);
        expect(res.body.isLive).toBe(true);
        expect(res.body.gameId).toBe(gameId);
        expect(res.body.mode).toBe('mattmester');
        expect(res.body.type).toBe('bot');
        expect(res.body.botInfo).toEqual(expect.objectContaining({
            nev: expect.any(String),
            elo: expect.any(Number),
            szint: 4
        }));

        jatekTorol(gameId);
    });

    test('aktiv PVP meccs (no disconnectTimer) → hasActive:true, isLive:true, type:"pvp"', async () => {
        const userId = 7002;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = userId;
        jatek.pvpAktiv = true;
        jatek.pvpStatusz = 'active';
        jatek.disconnectTimer = null; // jatekos jelen

        const app = buildApp(userId);
        const res = await supertest(app).get('/api/chess/active');
        expect(res.status).toBe(200);
        expect(res.body.hasActive).toBe(true);
        expect(res.body.isLive).toBe(true);
        expect(res.body.gameId).toBe(gameId);
        expect(res.body.type).toBe('pvp');

        jatekTorol(gameId);
    });

    test('lezart meccs (vege=true) → hasActive:false', async () => {
        const userId = 7003;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = userId;
        jatek.botAktiv = true;
        jatek.vege = true;

        const app = buildApp(userId);
        const res = await supertest(app).get('/api/chess/active');
        expect(res.status).toBe(200);
        expect(res.body.hasActive).toBe(false);

        jatekTorol(gameId);
    });

    test('mas user meccse NEM jelenik meg az enyemnel', async () => {
        const me = 7004;
        const masik = 7005;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = masik;
        jatek.botAktiv = true;

        const app = buildApp(me);
        const res = await supertest(app).get('/api/chess/active');
        expect(res.status).toBe(200);
        expect(res.body.hasActive).toBe(false);

        jatekTorol(gameId);
    });

    test('black-jatekoskent is hasActive:true (regression)', async () => {
        const userId = 7006;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.black.userId = userId;
        jatek.pvpAktiv = true;
        jatek.pvpStatusz = 'active';

        const app = buildApp(userId);
        const res = await supertest(app).get('/api/chess/active');
        expect(res.status).toBe(200);
        expect(res.body.hasActive).toBe(true);
        expect(res.body.gameId).toBe(gameId);
        expect(res.body.type).toBe('pvp');

        jatekTorol(gameId);
    });
});

describe('GET /api/chess/active — isLive 60s grace window logika', () => {
    test('BOT meccs lastActivityAt 60s+ ota inaktiv → isLive:false (orphan, rejoin engedett)', async () => {
        const userId = 8101;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = userId;
        jatek.botAktiv = true;
        jatek.botSzin = 'black';
        jatek.nehezseg = 3;
        jatek.lastActivityAt = Date.now() - 90_000; // 90s ota

        const app = buildApp(userId);
        const res = await supertest(app).get('/api/chess/active');
        expect(res.status).toBe(200);
        expect(res.body.hasActive).toBe(true);
        expect(res.body.isLive).toBe(false);
        expect(res.body.type).toBe('bot');

        jatekTorol(gameId);
    });

    test('BOT meccs lastActivityAt friss → isLive:true (modal blokkol)', async () => {
        const userId = 8102;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = userId;
        jatek.botAktiv = true;
        jatek.botSzin = 'black';
        jatek.nehezseg = 3;
        jatek.lastActivityAt = Date.now() - 10_000; // 10s ota (60s alatt)

        const app = buildApp(userId);
        const res = await supertest(app).get('/api/chess/active');
        expect(res.body.isLive).toBe(true);

        jatekTorol(gameId);
    });

    test('PVP meccs disconnectTimer FUT (grace window) → isLive:false (rejoin engedett)', async () => {
        const userId = 8103;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = userId;
        jatek.pvpAktiv = true;
        jatek.pvpStatusz = 'active';
        // disconnectTimer-t mock-oljuk: barmilyen truthy ertek (timer ref)
        jatek.disconnectTimer = setTimeout(() => {}, 60_000);
        jatek.disconnectSzin = 'white';

        const app = buildApp(userId);
        const res = await supertest(app).get('/api/chess/active');
        expect(res.body.hasActive).toBe(true);
        expect(res.body.isLive).toBe(false);
        expect(res.body.type).toBe('pvp');

        clearTimeout(jatek.disconnectTimer);
        jatekTorol(gameId);
    });

    test('PVP meccs disconnectTimer NULL → isLive:true (jatekos jelen)', async () => {
        const userId = 8104;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = userId;
        jatek.pvpAktiv = true;
        jatek.pvpStatusz = 'active';
        jatek.disconnectTimer = null;

        const app = buildApp(userId);
        const res = await supertest(app).get('/api/chess/active');
        expect(res.body.isLive).toBe(true);

        jatekTorol(gameId);
    });

    test('lastActivityAt frissul minden /state hivasnal (bot polling tracking)', async () => {
        const userId = 8105;
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        jatek.jatekosok.white.userId = userId;
        jatek.botAktiv = true;
        jatek.botSzin = 'black';
        jatek.nehezseg = 4;
        const regiTimestamp = Date.now() - 90_000;
        jatek.lastActivityAt = regiTimestamp;

        const app = buildApp(userId);
        // /state hivas → frissiti a lastActivityAt-t
        const stateRes = await supertest(app).get(`/api/chess/${gameId}/state`);
        expect(stateRes.status).toBe(200);

        // Most a /active mar isLive:true-t kell mondjon
        const activeRes = await supertest(app).get('/api/chess/active');
        expect(activeRes.body.isLive).toBe(true);
        // lastActivityAt frissult (timestamp tobb mint a regi)
        expect(jatek.lastActivityAt).toBeGreaterThan(regiTimestamp);

        jatekTorol(gameId);
    });
});

describe('chessModeChooser.js — kod-szintu first-tab-priority guard (frontpage)', () => {
    const CHOOSER_SRC = fs.readFileSync(
        path.join(__dirname, '..', '..', 'frontend', 'javascript', 'chessModeChooser.js'),
        'utf8'
    );

    test('helper: osszbeBlokkolHaAktivMeccsVan a /api/chess/active-ot hivja', () => {
        expect(CHOOSER_SRC).toMatch(/function\s+osszbeBlokkolHaAktivMeccsVan\s*\(/);
        expect(CHOOSER_SRC).toMatch(/fetch\(['"]\/api\/chess\/active['"]/);
    });

    test('helper: hasActive:true eseten window.mmAlert custom modalt mutat', () => {
        // Memoria-szabaly: NEM lehet native alert/confirm — custom HTML modal kell.
        expect(CHOOSER_SRC).toMatch(/window\.mmAlert/);
        // NEM hasznal natively alert-et a guard kornyeken
        const guardBlock = CHOOSER_SRC.match(/function\s+osszbeBlokkolHaAktivMeccsVan[^]*?^\s{4}\}/m);
        expect(guardBlock).toBeTruthy();
        expect(guardBlock[0]).not.toMatch(/\balert\s*\(/);
        expect(guardBlock[0]).not.toMatch(/\bconfirm\s*\(/);
    });

    test('helper: a popup szovege tartalmazza a kovetelt magyar uzenetet', () => {
        expect(CHOOSER_SRC).toMatch(/Egy másik oldalról már fut egy játék/);
    });

    test('navigateToBotGame await-eli az osszbeBlokkolHaAktivMeccsVan-t (bot guard)', () => {
        // A bot flow: difficulty kivalasztas utan ne navigaljon ha aktiv meccs van.
        const re = /async\s+function\s+navigateToBotGame[^]*?await\s+osszbeBlokkolHaAktivMeccsVan\s*\(\s*\)[^]*?return/;
        expect(CHOOSER_SRC).toMatch(re);
    });

    test('startQueue await-eli a guard-ot az emit ELOTT (PvP random queue)', () => {
        const re = /async\s+function\s+startQueue[^]*?await\s+osszbeBlokkolHaAktivMeccsVan\s*\(\s*\)[^]*?return[^]*?socket\.emit\(['"]chess:queue:join['"]/;
        expect(CHOOSER_SRC).toMatch(re);
    });

    test('startFriendInvite await-eli a guard-ot az emit ELOTT (PvP barat invite)', () => {
        const re = /async\s+function\s+startFriendInvite[^]*?await\s+osszbeBlokkolHaAktivMeccsVan\s*\(\s*\)[^]*?return[^]*?socket\.emit\(['"]chess:invite['"]/;
        expect(CHOOSER_SRC).toMatch(re);
    });

    test('chess:error "mar van aktiv" mar NEM auto-rejoin-ol, helyette mmAlert', () => {
        const idx = CHOOSER_SRC.indexOf("isActiveMatchError");
        expect(idx).toBeGreaterThan(-1);
        const blokk = CHOOSER_SRC.substring(idx, idx + 1500);
        // mmAlert szerepel
        expect(blokk).toMatch(/window\.mmAlert/);
        // NEM navigal automatikusan a chess.html-re ebben az agban
        // (a régi `window.location.href = '/chess_barold/html/chess.html'` torolve)
        const navMatch = blokk.match(/window\.location\.href\s*=\s*['"]\/chess_barold/);
        expect(navMatch).toBeNull();
    });

    test('helper: isLive=true agban mmAlert (modal), isLive=false agban auto-rejoin redirect', () => {
        // A guard ket agban dolgozik:
        //   isLive  → modal "Egy masik oldalrol mar fut..."
        //   !isLive → sessionStorage pendingMatch + redirect chess.html-re
        const guardBlock = CHOOSER_SRC.match(/async\s+function\s+osszbeBlokkolHaAktivMeccsVan[^]*?^\s{4}\}/m);
        expect(guardBlock).toBeTruthy();
        const src = guardBlock[0];
        // isLive elagaztatas
        expect(src).toMatch(/data\.isLive/);
        // mmAlert az isLive agban
        expect(src).toMatch(/window\.mmAlert/);
        // sessionStorage pendingMatch beallitas a !isLive agban
        expect(src).toMatch(/sessionStorage\.setItem\(['"]mattmester\.chessPendingMatch['"]/);
        // botRejoin URL parameter a bot eseten
        expect(src).toMatch(/type=botRejoin/);
        // Redirect chess.html-re
        expect(src).toMatch(/window\.location\.href\s*=/);
    });
});

describe('chess.html main.js + bot/botJatek.js — bot rejoin a 60s grace window-ban', () => {
    // Refactor: a botRejoin flow szet van bontva
    //   - main.js init(): URL-paraméter detekcio (?type=botRejoin)
    //   - bot/botJatek.js: initBotRejoinFromQueryParams (a tenyleges flow)
    const MAIN_JS_SRC = fs.readFileSync(
        path.join(__dirname, '..', '..', 'frontend', 'chess_barold', 'javascript', 'main.js'),
        'utf8'
    );
    const BOT_JATEK_SRC = fs.readFileSync(
        path.join(__dirname, '..', '..', 'frontend', 'chess_barold', 'javascript', 'bot', 'botJatek.js'),
        'utf8'
    );

    test('init() kezeli a ?type=botRejoin URL parametert', () => {
        expect(MAIN_JS_SRC).toMatch(/autoType\s*===\s*['"]botRejoin['"]/);
    });

    test('initBotRejoinFromQueryParams fuggveny letezik es nem hiv /new-bot-ot (nem indit uj meccset)', () => {
        const re = /(?:export\s+)?async\s+function\s+initBotRejoinFromQueryParams\s*\(/;
        expect(BOT_JATEK_SRC).toMatch(re);
        // A funkcio blokkjat kivagjuk
        const startIdx = BOT_JATEK_SRC.search(re);
        expect(startIdx).toBeGreaterThan(-1);
        const fnSrc = BOT_JATEK_SRC.substring(startIdx, startIdx + 2500);
        // NEM hiv /new-bot-ot (nem indit uj meccset)
        expect(fnSrc).not.toMatch(/\/api\/chess\/new-bot/);
        expect(fnSrc).not.toMatch(/apiUjBotJatek\s*\(/);
        // /api/chess/active-ot hivja a botInfo-ert
        expect(fnSrc).toMatch(/\/api\/chess\/active/);
        // apiAllapot()-tal lekeri a state-et
        expect(fnSrc).toMatch(/apiAllapot\s*\(\s*\)/);
        // Polling indit
        expect(fnSrc).toMatch(/idoPollingIndit\s*\(\s*\)/);
    });
});
