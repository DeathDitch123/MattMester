/**
 * backend/api/routes/players.js — endpoint smoke tesztek.
 *
 * Lefedi:
 *   - GET /leaderboard
 *   - GET /searchPlayer (auth, validacio: ures, hossz, regex)
 *   - GET /recentOpponents (auth, limit clamp)
 *   - GET /banInfo (no-auth, session VAGY query param)
 *   - GET /players/:id/profile (auth, targetUserId validacio, 404)
 */

const express = require('express');
const session = require('express-session');
const supertest = require('supertest');

jest.mock('../sql/sql_functions.js', () => ({
    searchUsersByUsernameContains: jest.fn(),
    getRecentOpponentsForUser: jest.fn(),
    getBanInfoById: jest.fn(),
    getPublicPlayerProfileById: jest.fn(),
    checkUserBanStatus: jest.fn(() => Promise.resolve(null))
}));

jest.mock('../api/middleware/rateLimiter.js', () => {
    const passthrough = (req, res, next) => next();
    return new Proxy({}, { get: () => passthrough });
});

jest.mock('../services.js', () => ({
    leaderboardService: {
        getLeaderBoard: jest.fn(() => ({ elo: [{ username: 'a', elo: 1500 }] }))
    }
}));

const sql = require('../sql/sql_functions.js');
const services = require('../services.js');
const playersRoutes = require('../api/routes/players.js');

function buildApp({ sessionUserId = null, sessionRole = 'player' } = {}) {
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'test',
        resave: false,
        saveUninitialized: false
    }));
    app.use((req, res, next) => {
        if (sessionUserId !== null) {
            req.session.userId = sessionUserId;
            req.session.role = sessionRole;
        }
        next();
    });
    app.use(playersRoutes);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('GET /leaderboard', () => {
    test('200 + data', async () => {
        const res = await supertest(buildApp()).get('/leaderboard');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
    });

    test('500 ha leaderboardService throw-ol', async () => {
        services.leaderboardService.getLeaderBoard.mockImplementationOnce(() => { throw new Error('cache hiba'); });
        const res = await supertest(buildApp()).get('/leaderboard');
        expect(res.status).toBe(500);
        expect(res.body.success).toBe(false);
    });

    test('nem kell auth (publik endpoint)', async () => {
        const res = await supertest(buildApp()).get('/leaderboard');
        expect(res.status).not.toBe(401);
    });
});

describe('GET /searchPlayer', () => {
    test('401 nincs session', async () => {
        const res = await supertest(buildApp()).get('/searchPlayer?username=foo');
        expect(res.status).toBe(401);
    });

    test('400 hianyzo username', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/searchPlayer');
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/kötelező|kotelez/i);
    });

    test('400 ures username', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/searchPlayer?username=');
        expect(res.status).toBe(400);
    });

    test('400 tul rovid username (<3 karakter)', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/searchPlayer?username=ab');
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/3.*50/);
    });

    test('400 tul hosszu username (>50 karakter)', async () => {
        const long = 'a'.repeat(51);
        const res = await supertest(buildApp({ sessionUserId: 7 })).get(`/searchPlayer?username=${long}`);
        expect(res.status).toBe(400);
    });

    test('400 ervenytelen karakterek (regex)', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/searchPlayer?username=foo<script>');
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/formátum|formatum/i);
    });

    test('200 ervenyes username + matches', async () => {
        sql.searchUsersByUsernameContains.mockResolvedValueOnce([
            { id: 5, username: 'foo', profile_image: null, profile_image_status: 'approved' }
        ]);
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/searchPlayer?username=foo');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].username).toBe('foo');
    });

    test('200 nincs talalat — ures data + uzenet', async () => {
        sql.searchUsersByUsernameContains.mockResolvedValueOnce([]);
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/searchPlayer?username=zzzzzzzzz');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
        expect(res.body.message).toMatch(/Nincs/);
    });

    test('default profile-image fallback URL', async () => {
        sql.searchUsersByUsernameContains.mockResolvedValueOnce([
            { id: 5, username: 'foo', profile_image: null }
        ]);
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/searchPlayer?username=foo');
        expect(res.body.data[0].profileImage).toBe('/profile_pictures/default.png');
    });
});

describe('GET /recentOpponents', () => {
    test('401 nincs session', async () => {
        const res = await supertest(buildApp()).get('/recentOpponents');
        expect(res.status).toBe(401);
    });

    test('200 ures lista', async () => {
        sql.getRecentOpponentsForUser.mockResolvedValueOnce([]);
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/recentOpponents');
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(0);
    });

    test('200 osszeallitva a fields-bol', async () => {
        sql.getRecentOpponentsForUser.mockResolvedValueOnce([
            {
                opponentUserId: 5,
                username: 'rival',
                profileImage: '/foo.png',
                profileImageStatus: 'approved',
                elo: 1500,
                eloMM: 1600,
                eloBullet: 1400,
                lastActiveAt: null,
                lastPlayedAt: null,
                matchCount: 3,
                lastGameId: 12
            }
        ]);
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/recentOpponents');
        expect(res.status).toBe(200);
        expect(res.body.data[0]).toEqual(expect.objectContaining({
            userId: 5,
            username: 'rival',
            elo: 1500,
            matchCount: 3
        }));
    });

    test('limit query param atadva sql-nek', async () => {
        sql.getRecentOpponentsForUser.mockResolvedValueOnce([]);
        await supertest(buildApp({ sessionUserId: 7 })).get('/recentOpponents?limit=10');
        expect(sql.getRecentOpponentsForUser).toHaveBeenCalledWith(7, { limit: 10 });
    });
});

describe('GET /banInfo', () => {
    test('200 + banned:false ha nincs userId session-ben es nincs query', async () => {
        const res = await supertest(buildApp()).get('/banInfo');
        expect(res.status).toBe(200);
        expect(res.body.banned).toBe(false);
    });

    test('200 + banned:false nem-ban-olt user-re', async () => {
        sql.getBanInfoById.mockResolvedValueOnce({ is_banned: false, username: 'x' });
        const res = await supertest(buildApp()).get('/banInfo?userId=7');
        expect(res.status).toBe(200);
        expect(res.body.banned).toBe(false);
    });

    test('200 + banned:true permanens ban-ra', async () => {
        sql.getBanInfoById.mockResolvedValueOnce({
            is_banned: true,
            banned_until: null,
            ban_reason: 'spam',
            username: 'baduser'
        });
        const res = await supertest(buildApp()).get('/banInfo?userId=7');
        expect(res.body.banned).toBe(true);
        expect(res.body.isPerma).toBe(true);
        expect(res.body.reason).toBe('spam');
    });

    test('200 + banned:true ideiglenes ban (jovobeli)', async () => {
        const future = new Date(Date.now() + 86400_000);
        sql.getBanInfoById.mockResolvedValueOnce({
            is_banned: true,
            banned_until: future,
            ban_reason: 'flood'
        });
        const res = await supertest(buildApp()).get('/banInfo?userId=7');
        expect(res.body.banned).toBe(true);
        expect(res.body.isPerma).toBe(false);
        expect(res.body.bannedUntil).toBe(future.toISOString());
    });

    test('200 + banned:false lejart ban-ra (multbeli datum)', async () => {
        sql.getBanInfoById.mockResolvedValueOnce({
            is_banned: true,
            banned_until: new Date(Date.now() - 86400_000)
        });
        const res = await supertest(buildApp()).get('/banInfo?userId=7');
        expect(res.body.banned).toBe(false);
    });

    test('session userId precedens a query userId felett', async () => {
        sql.getBanInfoById.mockResolvedValueOnce({ is_banned: false });
        await supertest(buildApp({ sessionUserId: 7 })).get('/banInfo?userId=999');
        expect(sql.getBanInfoById).toHaveBeenCalledWith(7);
    });
});

describe('GET /players/:targetUserId/profile', () => {
    test('401 nincs session', async () => {
        const res = await supertest(buildApp()).get('/players/5/profile');
        expect(res.status).toBe(401);
    });

    test('400 ervenytelen targetUserId (NaN)', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/players/abc/profile');
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/azonosító|azonosito/i);
    });

    test('400 zero targetUserId', async () => {
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/players/0/profile');
        expect(res.status).toBe(400);
    });

    test('404 nem letezo user', async () => {
        sql.getPublicPlayerProfileById.mockResolvedValueOnce(null);
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/players/999/profile');
        expect(res.status).toBe(404);
    });

    test('200 + adatok visszaadva', async () => {
        sql.getPublicPlayerProfileById.mockResolvedValueOnce({
            id: 5,
            username: 'rival',
            role: 'player',
            profile_image: '/foo.png',
            profile_image_status: 'approved',
            created_at: '2025-01-01',
            last_active: '2025-05-01',
            elo: 1500,
            elo_MM: 1600,
            elo_bullet: 1400,
            wins: 10,
            losses: 5,
            draws: 2,
            winrate_percent: 58.82
        });
        const res = await supertest(buildApp({ sessionUserId: 7 })).get('/players/5/profile');
        expect(res.status).toBe(200);
        expect(res.body.data.username).toBe('rival');
        expect(res.body.data.elo).toBe(1500);
        expect(res.body.data.wins).toBe(10);
    });
});
