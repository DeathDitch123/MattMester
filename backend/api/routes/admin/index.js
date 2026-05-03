// Admin API router aggregator — ADMIN_PANEL.md F2-F9.
//
// Eredetileg ez egyetlen 2921-soros backend/api/routes/admin.js fajl volt.
// Szet lett bontva rendeltetes szerinti sub-router-ekre — ez a fajl csak
// mountolja oket /api/admin ala. Az egyes sub-router-ek (export, notifications,
// stb.) onmagukban hordozzak az osszes import-jukat es middleware-laneukat.
//
// Middleware lanc minden mutalo endpointon:
//   adminLimiterChain -> parseAdminToken -> [requireSuperAdmin?] ->
//     express.json() -> requireReasonOnMutate(action) -> auditContext ->
//     auditFlush -> handler
//
// Read-only endpointokon a requireReasonOnMutate kihagyhato.

const express = require('express');

const authRoutes = require('../../admin/authRoutes.js');
const superAdminRoutes = require('../../admin/superAdminRoutes.js');
const settingsRoutes = require('../../admin/settingsRoutes.js');
const abilitiesRoutes = require('../../admin/abilitiesRoutes.js');
const socialRoutes = require('../../admin/socialRoutes.js');
const gamesRoutes = require('../../admin/gamesRoutes.js');
const testsRoutes = require('../../admin/testsRoutes.js');
const { parseAdminToken } = require('../../admin/middleware.js');
const { adminLimiterChain } = require('../../admin/adminRateLimiter.js');

// Az "uj" szet bontott modulok ugyanezen mappaban:
const exportUsersRoutes = require('./exportUsersRoutes.js');
const notificationsRoutes = require('./notificationsRoutes.js');
const profileImageRoutes = require('./profileImageRoutes.js');
const chatModerationRoutes = require('./chatModerationRoutes.js');
const userReportsRoutes = require('./userReportsRoutes.js');
const userEditRoutes = require('./userEditRoutes.js');
const readOnlyRoutes = require('./readOnlyRoutes.js');
const userDeleteRoutes = require('./userDeleteRoutes.js');
const alertsRoutes = require('./alertsRoutes.js');
const ipBlockRoutes = require('./ipBlockRoutes.js');
const securityLoginsRoutes = require('./securityLoginsRoutes.js');

const router = express.Router();

// 1. Auth sub-router (NINCS parseAdminToken a router szintjen, mert az elevate
//    epp ezt kell hogy elkerulje).
router.use('/auth', authRoutes);

// 2. Super-admin sub-router (router-szinten parseAdminToken+requireSuperAdmin).
router.use('/admins', superAdminRoutes);

// 2.b Site-wide settings sub-router (Beallitasok admin oldal)
router.use('/settings', settingsRoutes);

// 2.c Kepessegek admin CRUD
router.use('/abilities', abilitiesRoutes);

// 2.d Kozossegi kapcsolatok (admin moderation view)
router.use('/social', socialRoutes);

// 2.e Jatszmak admin (lista, PGN, force-end)
router.use('/games', gamesRoutes);

// 2.f Tesztfuttatas admin
router.use('/tests', testsRoutes);

// 3. Test endpoint (csak fejlesztoi modban).
if (process.env.NODE_ENV !== 'production') {
    router.get('/test', adminLimiterChain, parseAdminToken, (request, response) => {
        return response.status(200).json({
            success: true,
            message: 'Admin teszt vegpont mukodik.',
            data: {
                userId: request.adminAuth?.userId,
                username: request.adminAuth?.username,
                isSuperAdmin: request.adminAuth?.isSuperAdmin
            }
        });
    });
}

// 4. Tematikus sub-router-ek — mind /api/admin gyokerre mountolnak,
//    mert az eredeti admin.js-ben is gyokeren voltak (pl. /export-users,
//    /notifications/send, /users/:id/edit, /alerts, /ipblock, stb.).
router.use('/', exportUsersRoutes);
router.use('/', notificationsRoutes);
router.use('/', profileImageRoutes);
router.use('/', chatModerationRoutes);
router.use('/', userReportsRoutes);
router.use('/', userEditRoutes);
router.use('/', readOnlyRoutes);
router.use('/', userDeleteRoutes);
router.use('/', alertsRoutes);
router.use('/', ipBlockRoutes);
router.use('/', securityLoginsRoutes);

module.exports = router;
