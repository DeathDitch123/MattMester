const express = require('express');
const router = express.Router();

const authRoutes = require('./routes/auth.js');
const profileRoutes = require('./routes/profile.js');
const securityRoutes = require('./routes/security.js');
const playersRoutes = require('./routes/players.js');
const friendsRoutes = require('./routes/friends.js');
const chatRoutes = require('./routes/chat.js');
const adminRoutes = require('./routes/admin.js');

router.use('/admin', adminRoutes);
router.use(authRoutes);
router.use(profileRoutes);
router.use(securityRoutes);
router.use(playersRoutes);
router.use(friendsRoutes);
router.use(chatRoutes);

module.exports = router;
module.exports.initChatRateLimiterCleanup = chatRoutes.initChatRateLimiterCleanup;
