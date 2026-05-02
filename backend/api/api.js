const express = require('express');
const router = express.Router();

const authRoutes = require('./routes/auth.js');
const profileRoutes = require('./routes/profile.js');
const securityRoutes = require('./routes/security.js');
const playersRoutes = require('./routes/players.js');
const friendsRoutes = require('./routes/friends.js');
const chatRoutes = require('./routes/chat.js');
const adminRoutes = require('./routes/admin.js');
const notificationsRoutes = require('./routes/notifications.js');
const publicRoutes = require('./routes/public.js');
const reportsRoutes = require('./routes/reports.js');
const { maintenanceGuard } = require('./middleware/maintenanceGuard.js');

// Maintenance guard: ha a site_settings.maintenance_mode TRUE, a nem-admin
// kereseket 503-mal lojuk vissza. Az admin-utvonalak (parseAdminToken alaja)
// es az admin Bearer-tokenes kereseket atengedi, hogy a "kiur" is meg tudjon
// lepni. Az /api/admin/* routerre is rakerul, de az ott eleve admin-only.
router.use(maintenanceGuard());

router.use('/admin', adminRoutes);
router.use(publicRoutes);
router.use(authRoutes);
router.use(profileRoutes);
router.use(securityRoutes);
router.use(playersRoutes);
router.use(friendsRoutes);
router.use(chatRoutes);
router.use(notificationsRoutes);
router.use(reportsRoutes);

module.exports = router;
module.exports.initChatRateLimiterCleanup = chatRoutes.initChatRateLimiterCleanup;
