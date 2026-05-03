/**
 * Profilkép láthatósági tesztek.
 *
 * Lefedi:
 *  - applyProfileImageVisibility helper viselkedése (owner vs non-owner pending,
 *    rejected, approved, default)
 *  - players /profile és /searchPlayer route: non-owner pending maszkolás default-ra
 *  - admin /profile-images approve/reject jogosultság és státuszváltás
 *  - admin nélkül 403 (isAdmin gate)
 */

const request = require('supertest');
const express = require('express');
const session = require('express-session');

jest.mock('../sql/sql_funtions', () => {
    const actual = jest.requireActual('../sql/sql_funtions');
    return {
        ...actual,
        getPublicPlayerProfileById: jest.fn(),
        searchUsersByUsernameContains: jest.fn(),
        getPendingProfileImages: jest.fn(),
        approveProfileImage: jest.fn(),
        rejectProfileImage: jest.fn()
    };
});

jest.mock('../api/middleware/rateLimiter.js', () => {
    const passthrough = (request, response, next) => next();
    return {
        createRateLimiter: () => passthrough,
        userOrIpKeyGenerator: (request) => `uid:${request.session?.userId || 'anon'}`,
        playerSearchLimiter: passthrough,
        verifyPasswordLimiter: passthrough,
        profileUpdateLimiter: passthrough,
        profileImageUploadLimiter: passthrough,
        profileImageRemoveLimiter: passthrough,
        profileDeleteLimiter: passthrough,
        chatMessageLimiter: passthrough,
        chatDirectOpenLimiter: passthrough
    };
});

// Admin step-up token middleware - tesztben sima role=admin atengedi.
// Az F2 ota az admin endpointokon Authorization: Bearer kotelezo, de
// itt a regi tesztek a session.role-ra epulnek; a token-ellenorzest atugorjuk.
jest.mock('../api/admin/middleware.js', () => {
    const actual = jest.requireActual('../api/admin/middleware.js');
    return {
        ...actual,
        parseAdminToken: (request, response, next) => {
            const sessionRole = request.session?.role;
            const sessionUserId = Number(request.session?.userId) || 0;
            if (!sessionUserId) {
                return response.status(401).json({ success: false, message: 'Nincs session.' });
            }
            if (sessionRole !== 'admin') {
                return response.status(403).json({ success: false, message: 'Nincs jogosultsag.' });
            }
            request.adminAuth = {
                userId: sessionUserId,
                username: request.session?.username || 'admin',
                isSuperAdmin: Boolean(request.session?.is_super_admin),
                tokenId: 1,
                ipAddress: '127.0.0.1',
                userAgent: 'jest'
            };
            return next();
        }
    };
});

jest.mock('../api/admin/adminRateLimiter.js', () => {
    const passthrough = (request, response, next) => next();
    return {
        preCheckEscalation: passthrough,
        adminBaseLimiter: passthrough,
        adminLimiterChain: [passthrough]
    };
});

jest.mock('../api/admin/auditService.js', () => ({
    auditFlush: (request, response, next) => next(),
    recordAuditEntry: jest.fn(() => Promise.resolve({ eventId: 1 })),
    bindSocketHub: jest.fn(),
    redactObject: (input) => input,
    buildDiff: () => ({ before: null, after: null })
}));

jest.mock('../api/admin/alertingService.js', () => ({
    bindSocketHub: jest.fn(),
    recordUnauthorized: jest.fn(() => Promise.resolve({ alertId: 1 })),
    recordTokenInvalid: jest.fn(() => Promise.resolve({ alertId: 1 })),
    recordSuspiciousPattern: jest.fn(() => Promise.resolve({ alertId: 1 }))
}));

jest.mock('../services.js', () => ({
    leaderboardService: { getLeaderBoard: () => ({}) },
    notificationService: { send: jest.fn(() => Promise.resolve({ deliveredTo: [], errors: [] })) }
}));

const sql = require('../sql/sql_funtions');

function buildApp(sessionUser) {
    const app = express();
    app.use(express.json());
    app.use(session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }
    }));
    app.use((request, response, next) => {
        if (sessionUser) {
            Object.assign(request.session, sessionUser);
        }
        next();
    });

    const playersRoutes = require('../api/routes/players.js');
    const adminRoutes = require('../api/routes/admin');
    app.use('/api', playersRoutes);
    app.use('/api/admin', adminRoutes);
    return app;
}

describe('applyProfileImageVisibility helper', () => {
    const { applyProfileImageVisibility } = sql;

    test('owner pending kepet kapja vissza valtozatlanul', () => {
        const result = applyProfileImageVisibility('/profile_pictures/123-x.png', 'pending', 7, 7);
        expect(result.profileImage).toBe('/profile_pictures/123-x.png');
        expect(result.profileImageStatus).toBe('pending');
    });

    test('non-owner pending eseten default kep + default status', () => {
        const result = applyProfileImageVisibility('/profile_pictures/123-x.png', 'pending', 7, 9);
        expect(result.profileImage).toBe('/profile_pictures/default.png');
        expect(result.profileImageStatus).toBe('default');
    });

    test('rejected kep mindenkinel default-ra all', () => {
        const ownerView = applyProfileImageVisibility('/profile_pictures/123-x.png', 'rejected', 7, 7);
        const otherView = applyProfileImageVisibility('/profile_pictures/123-x.png', 'rejected', 7, 9);
        expect(ownerView.profileImage).toBe('/profile_pictures/default.png');
        expect(ownerView.profileImageStatus).toBe('default');
        expect(otherView.profileImage).toBe('/profile_pictures/default.png');
    });

    test('approved kep globalisan latszik', () => {
        const result = applyProfileImageVisibility('/profile_pictures/y.png', 'approved', 7, 9);
        expect(result.profileImage).toBe('/profile_pictures/y.png');
        expect(result.profileImageStatus).toBe('approved');
    });

    test('viewer 0 (anonim/cache) eseten pending defaultra all', () => {
        const result = applyProfileImageVisibility('/profile_pictures/y.png', 'pending', 7, 0);
        expect(result.profileImage).toBe('/profile_pictures/default.png');
    });
});

describe('GET /api/players/:id/profile non-owner pending maszkolas', () => {
    afterEach(() => jest.clearAllMocks());

    test('non-owner pending kep helyett defaultot kap', async () => {
        sql.getPublicPlayerProfileById.mockImplementation(async (targetId, viewerId) => {
            // A valodi SQL lehivja az applyProfileImageVisibility-t — mock visszaadja
            // a maszkolt eredmenyt amit a route szerint elvarunk.
            const visibility = sql.applyProfileImageVisibility('/profile_pictures/abc.png', 'pending', targetId, viewerId);
            return {
                id: targetId,
                username: 'target_user',
                role: 'player',
                profile_image: visibility.profileImage,
                profile_image_status: visibility.profileImageStatus,
                created_at: '2024-01-01',
                last_active: '2024-01-02',
                elo: 1200, elo_MM: 1200, elo_bullet: 1200,
                wins: 0, losses: 0, draws: 0, winrate_percent: 0
            };
        });

        const app = buildApp({ userId: 999, role: 'player' });
        const response = await request(app).get('/api/players/7/profile');
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.profileImage).toBe('/profile_pictures/default.png');
        expect(response.body.data.profileImageStatus).toBe('default');
    });

    test('owner pending kep megmaradnak a sajat profil lekerdezesnel', async () => {
        sql.getPublicPlayerProfileById.mockImplementation(async (targetId, viewerId) => {
            const visibility = sql.applyProfileImageVisibility('/profile_pictures/abc.png', 'pending', targetId, viewerId);
            return {
                id: targetId,
                username: 'me',
                role: 'player',
                profile_image: visibility.profileImage,
                profile_image_status: visibility.profileImageStatus,
                created_at: '2024-01-01',
                last_active: '2024-01-02',
                elo: 1200, elo_MM: 1200, elo_bullet: 1200,
                wins: 0, losses: 0, draws: 0, winrate_percent: 0
            };
        });

        const app = buildApp({ userId: 7, role: 'player' });
        const response = await request(app).get('/api/players/7/profile');
        expect(response.status).toBe(200);
        expect(response.body.data.profileImage).toBe('/profile_pictures/abc.png');
        expect(response.body.data.profileImageStatus).toBe('pending');
    });
});

describe('GET /api/searchPlayer non-owner pending maszkolas', () => {
    afterEach(() => jest.clearAllMocks());

    test('a kereses publikus valaszaban pending kep helyett default lesz a non-owner szamara', async () => {
        sql.searchUsersByUsernameContains.mockImplementation(async (text, currentUserId) => {
            // Szimulaljuk hogy az SQL-ben mar a viewer-aware mask futott:
            const rows = [
                { id: 7, username: 'pending_user', profile_image: '/profile_pictures/abc.png', profile_image_status: 'pending', friend_status: 'none' },
                { id: 8, username: 'approved_user', profile_image: '/profile_pictures/ok.png', profile_image_status: 'approved', friend_status: 'none' }
            ];
            return rows.map((row) => {
                const visibility = sql.applyProfileImageVisibility(row.profile_image, row.profile_image_status, row.id, currentUserId);
                return { ...row, profile_image: visibility.profileImage, profile_image_status: visibility.profileImageStatus };
            });
        });

        const app = buildApp({ userId: 999, role: 'player' });
        const response = await request(app).get('/api/searchPlayer').query({ username: 'use' });
        expect(response.status).toBe(200);
        const pendingRow = response.body.data.find((row) => row.userId === 7);
        const approvedRow = response.body.data.find((row) => row.userId === 8);
        expect(pendingRow.profileImage).toBe('/profile_pictures/default.png');
        expect(pendingRow.profileImageStatus).toBe('default');
        expect(approvedRow.profileImage).toBe('/profile_pictures/ok.png');
        expect(approvedRow.profileImageStatus).toBe('approved');
    });
});

describe('Admin pending profile images jogosultsag + statuszvaltas', () => {
    afterEach(() => jest.clearAllMocks());

    test('GET /api/admin/profile-images/pending nem-admin szamara 403', async () => {
        const app = buildApp({ userId: 999, role: 'player' });
        const response = await request(app).get('/api/admin/profile-images/pending');
        expect(response.status).toBe(403);
    });

    test('GET /api/admin/profile-images/pending admin szamara visszaadja a listat', async () => {
        sql.getPendingProfileImages.mockResolvedValue([
            { id: 1, user_id: 7, username: 'a', filename: '/profile_pictures/x.png', current_image: '/profile_pictures/x.png', upload_time: '2024-01-01', status: 'pending' }
        ]);
        const app = buildApp({ userId: 1, role: 'admin' });
        const response = await request(app).get('/api/admin/profile-images/pending');
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0]).toMatchObject({ uploadId: 1, userId: 7, username: 'a' });
    });

    test('POST approve admin szamara approved statusszal valaszol', async () => {
        sql.approveProfileImage.mockResolvedValue(true);
        const app = buildApp({ userId: 1, role: 'admin' });
        const response = await request(app).post('/api/admin/profile-images/42/approve').send({});
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe('approved');
        expect(sql.approveProfileImage).toHaveBeenCalledWith(42, 1);
    });

    test('POST reject admin szamara rejected statusszal valaszol es atadja a jegyzetet', async () => {
        sql.rejectProfileImage.mockResolvedValue(true);
        const app = buildApp({ userId: 1, role: 'admin' });
        const response = await request(app)
            .post('/api/admin/profile-images/55/reject')
            .send({ reviewNote: 'Nem alkalmas tartalom.', reason: 'Nem alkalmas tartalom; szabalysertes.' });
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.status).toBe('rejected');
        expect(sql.rejectProfileImage).toHaveBeenCalledWith(55, 1, 'Nem alkalmas tartalom.');
    });

    test('POST approve nem-admin szamara 403', async () => {
        const app = buildApp({ userId: 999, role: 'player' });
        const response = await request(app).post('/api/admin/profile-images/42/approve').send({});
        expect(response.status).toBe(403);
        expect(sql.approveProfileImage).not.toHaveBeenCalled();
    });

    test('POST reject nem-admin szamara 403', async () => {
        const app = buildApp({ userId: 999, role: 'player' });
        const response = await request(app).post('/api/admin/profile-images/42/reject').send({});
        expect(response.status).toBe(403);
        expect(sql.rejectProfileImage).not.toHaveBeenCalled();
    });
});
