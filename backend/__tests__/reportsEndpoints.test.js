/**
 * backend/api/routes/reports.js — POST /reports endpoint smoke tesztek.
 *
 * Lefedi:
 *   - 401 nincs auth
 *   - 400 hianyzo reportedUserId / onmagadat / ervenytelen kategoria
 *   - 200 happy path
 *   - 409 mar nyitott bejelentes
 *   - 429 tul sok bejelentest
 *   - 404 nem talalhato player
 */

const express = require('express');
const session = require('express-session');
const supertest = require('supertest');

jest.mock('../sql/sql_functions.js', () => ({
    USER_REPORT_CATEGORIES: ['cheating', 'toxicity', 'spam', 'harassment', 'unfair_play', 'other'],
    createUserReport: jest.fn(),
    insertUserLog: jest.fn(() => Promise.resolve()),
    checkUserBanStatus: jest.fn(() => Promise.resolve(null))
}));

const sql = require('../sql/sql_functions.js');
const reportsRoutes = require('../api/routes/reports.js');

function buildApp({ sessionUserId = null } = {}) {
    const app = express();
    app.use(express.json());
    app.use(session({ secret: 't', resave: false, saveUninitialized: false }));
    app.use((req, res, next) => {
        if (sessionUserId !== null) req.session.userId = sessionUserId;
        next();
    });
    app.use(reportsRoutes);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('POST /reports', () => {
    test('401 nincs session', async () => {
        const res = await supertest(buildApp()).post('/reports').send({
            reportedUserId: 5, category: 'spam'
        });
        expect(res.status).toBe(401);
    });

    test('400 hianyzo reportedUserId', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/reports').send({
            category: 'spam'
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/Hianyzo|hianyzo/i);
    });

    test('400 zero reportedUserId', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/reports').send({
            reportedUserId: 0, category: 'spam'
        });
        expect(res.status).toBe(400);
    });

    test('400 onmagat probalja jelenteni', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/reports').send({
            reportedUserId: 7, category: 'spam'
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/Onmagad|onmagad/i);
    });

    test('400 ervenytelen kategoria', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/reports').send({
            reportedUserId: 5, category: 'invalid_xyz'
        });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/kategoria|kategória/i);
    });

    test('400 ures kategoria', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/reports').send({
            reportedUserId: 5, category: ''
        });
        expect(res.status).toBe(400);
    });

    test('200 happy path — minden kategoria-szam ervenyes', async () => {
        for (const cat of ['cheating', 'toxicity', 'spam', 'harassment', 'unfair_play', 'other']) {
            sql.createUserReport.mockResolvedValueOnce({ id: 1, category: cat, gameId: null });
            const res = await supertest(buildApp({ sessionUserId: 7 })).post('/reports').send({
                reportedUserId: 5, category: cat
            });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        }
    });

    test('200 + reportId visszaadva', async () => {
        sql.createUserReport.mockResolvedValueOnce({ id: 42, category: 'spam', gameId: 99 });
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/reports').send({
            reportedUserId: 5, category: 'spam', gameId: 99, message: 'spamel'
        });
        expect(res.status).toBe(200);
        expect(res.body.data.reportId).toBe(42);
        expect(res.body.data.gameId).toBe(99);
    });

    test('409 mar nyitott bejelentes (dedup)', async () => {
        sql.createUserReport.mockRejectedValueOnce(new Error('Mar van nyitott bejelentes.'));
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/reports').send({
            reportedUserId: 5, category: 'spam'
        });
        expect(res.status).toBe(409);
    });

    test('429 tul sok bejelentest (rate-limit)', async () => {
        sql.createUserReport.mockRejectedValueOnce(new Error('Tul sok bejelentest tett ma.'));
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/reports').send({
            reportedUserId: 5, category: 'spam'
        });
        expect(res.status).toBe(429);
    });

    test('404 reported felhasznalo nem talalhato', async () => {
        sql.createUserReport.mockRejectedValueOnce(new Error('A felhasznalo nem talalhato.'));
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/reports').send({
            reportedUserId: 999, category: 'spam'
        });
        expect(res.status).toBe(404);
    });

    test('500 ismeretlen DB-hiba', async () => {
        sql.createUserReport.mockRejectedValueOnce(new Error('Connection refused'));
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/reports').send({
            reportedUserId: 5, category: 'spam'
        });
        expect(res.status).toBe(500);
    });

    test('case-insensitive category (lowercase normalization)', async () => {
        sql.createUserReport.mockResolvedValueOnce({ id: 1, category: 'spam', gameId: null });
        const res = await supertest(buildApp({ sessionUserId: 7 })).post('/reports').send({
            reportedUserId: 5, category: 'SPAM'
        });
        expect(res.status).toBe(200);
        // sql-be lowercase kerul
        expect(sql.createUserReport).toHaveBeenCalledWith(expect.objectContaining({ category: 'spam' }));
    });

    test('opcionalis message + gameId mezo', async () => {
        sql.createUserReport.mockResolvedValueOnce({ id: 1, category: 'spam', gameId: null });
        await supertest(buildApp({ sessionUserId: 7 })).post('/reports').send({
            reportedUserId: 5, category: 'spam'
        });
        expect(sql.createUserReport).toHaveBeenCalledWith(expect.objectContaining({
            message: null,
            gameId: null
        }));
    });
});
