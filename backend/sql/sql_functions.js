// Aggregator (barrel) modul. A korabbi monolit sql_functions.js tartalmat
// rendeltetes szerint csoportositott modulokra bontottuk a `./modules/` ala,
// ez a fajl pedig kompatibilitasi reteg: a meglevo `require('./sql_functions')`
// hivasok ugyanazokat a fuggvenyneveket talaljak meg, mint korabban.

const profileImage = require('./modules/profileImage.js');
const users = require('./modules/users.js');
const leaderboard = require('./modules/leaderboard.js');
const admin = require('./modules/admin.js');
const bans = require('./modules/bans.js');
const userLogs = require('./modules/userLogs.js');
const friends = require('./modules/friends.js');
const chat = require('./modules/chat.js');
const notifications = require('./modules/notifications.js');
const emailVerification = require('./modules/emailVerification.js');
const userReports = require('./modules/userReports.js');
const recentOpponents = require('./modules/recentOpponents.js');

module.exports = {
    // profileImage
    applyProfileImageVisibility: profileImage.applyProfileImageVisibility,
    uploadProfileImage: profileImage.uploadProfileImage,
    uploadProfileImageAdminApproved: profileImage.uploadProfileImageAdminApproved,
    getPendingProfileImages: profileImage.getPendingProfileImages,
    approveProfileImage: profileImage.approveProfileImage,
    rejectProfileImage: profileImage.rejectProfileImage,
    getUserProfileImage: profileImage.getUserProfileImage,
    resetUserProfileImageToDefault: profileImage.resetUserProfileImageToDefault,
    getAndDeleteDiscardedProfileImages: profileImage.getAndDeleteDiscardedProfileImages,
    deleteDiscardedProfileImageRecord: profileImage.deleteDiscardedProfileImageRecord,
    deleteOrphanProfileImageUploadRecords: profileImage.deleteOrphanProfileImageUploadRecords,
    getAllProfileImageReferences: profileImage.getAllProfileImageReferences,

    // users
    insertUser: users.insertUser,
    getUserByUsername: users.getUserByUsername,
    getUserByEmail: users.getUserByEmail,
    savePasswordResetToken: users.savePasswordResetToken,
    findUserByPasswordResetTokenHash: users.findUserByPasswordResetTokenHash,
    clearPasswordResetToken: users.clearPasswordResetToken,
    updateUserPasswordAndClearResetToken: users.updateUserPasswordAndClearResetToken,
    getSessionUserById: users.getSessionUserById,
    getPublicPlayerProfileById: users.getPublicPlayerProfileById,
    getUserAuthById: users.getUserAuthById,
    updateUserProfileSettings: users.updateUserProfileSettings,
    searchUsersByUsernameContains: users.searchUsersByUsernameContains,
    deleteUserProfileWithTransaction: users.deleteUserProfileWithTransaction,
    softDeleteUserByAdmin: users.softDeleteUserByAdmin,
    restoreUserFromSoftDelete: users.restoreUserFromSoftDelete,
    listSoftDeletedUsers: users.listSoftDeletedUsers,
    listExpiredSoftDeletedUserIds: users.listExpiredSoftDeletedUserIds,
    getUserBasicById: users.getUserBasicById,
    findUserByUsernameForAdmin: users.findUserByUsernameForAdmin,
    getUserIdsByRole: users.getUserIdsByRole,
    getAllActiveUserIds: users.getAllActiveUserIds,

    // leaderboard
    getLeaderBoardByElo: leaderboard.getLeaderBoardByElo,
    getLeaderBoardByMM: leaderboard.getLeaderBoardByMM,
    getLeaderBoardByBullet: leaderboard.getLeaderBoardByBullet,
    getLeaderBoardByWinRate: leaderboard.getLeaderBoardByWinRate,

    // admin
    adminUpdateUserCore: admin.adminUpdateUserCore,
    getTotalUsers: admin.getTotalUsers,
    getTotalGames: admin.getTotalGames,
    getOnlineGamesCount: admin.getOnlineGamesCount,
    getAllUsers: admin.getAllUsers,
    getAllRooms: admin.getAllRooms,
    ipCollisions: admin.ipCollisions,

    // bans
    banUser: bans.banUser,
    unbanUser: bans.unbanUser,
    checkUserBanStatus: bans.checkUserBanStatus,
    isEmailBanned: bans.isEmailBanned,
    recordAccountBanEvent: bans.recordAccountBanEvent,
    getUserLastLoginIp: bans.getUserLastLoginIp,
    setUserLastLoginIp: bans.setUserLastLoginIp,
    touchUserLastActive: bans.touchUserLastActive,
    getBanInfoById: bans.getBanInfoById,

    // userLogs
    insertUserLog: userLogs.insertUserLog,
    getUserSecurityActivity: userLogs.getUserSecurityActivity,

    // friends
    addFriendRequest: friends.addFriendRequest,
    getFriendStatus: friends.getFriendStatus,
    getFriendListForUser: friends.getFriendListForUser,
    acceptFriendRequest: friends.acceptFriendRequest,
    rejectFriendRequest: friends.rejectFriendRequest,
    blockUserDirectional: friends.blockUserDirectional,
    unblockUserDirectional: friends.unblockUserDirectional,
    deleteFriendConnection: friends.deleteFriendConnection,

    // chat
    getUserConversations: chat.getUserConversations,
    getConversationMessages: chat.getConversationMessages,
    createOrGetDirectConversation: chat.createOrGetDirectConversation,
    insertMessageInConversation: chat.insertMessageInConversation,
    assertConversationParticipant: chat.assertConversationParticipant,
    assertConversationUsable: chat.assertConversationUsable,
    canUsersChat: chat.canUsersChat,
    getPrivateConversationParticipantIds: chat.getPrivateConversationParticipantIds,
    cleanupDirectConversationBetween: chat.cleanupDirectConversationBetween,
    cleanupUnusableConversationsForUser: chat.cleanupUnusableConversationsForUser,
    containsBlockedWord: chat.containsBlockedWord,
    normalizeTextForModeration: chat.normalizeTextForModeration,
    getUnreadChatMessageTotal: chat.getUnreadChatMessageTotal,
    markConversationReadForUser: chat.markConversationReadForUser,
    getFlaggedChatMessages: chat.getFlaggedChatMessages,
    getFlaggedChatMessageCount: chat.getFlaggedChatMessageCount,
    reportChatMessage: chat.reportChatMessage,
    dismissReportsForMessage: chat.dismissReportsForMessage,
    deleteChatMessageById: chat.deleteChatMessageById,
    getChatReportMuteUntil: chat.getChatReportMuteUntil,
    setChatReportMuteForUsers: chat.setChatReportMuteForUsers,
    CHAT_REPORT_MUTE_HOURS: chat.CHAT_REPORT_MUTE_HOURS,
    addDynamicBlockedWords: chat.addDynamicBlockedWords,
    refreshDynamicBlockedWords: chat.refreshDynamicBlockedWords,
    getDynamicBlockedWordsSnapshot: chat.getDynamicBlockedWordsSnapshot,
    recordProfanityStrikeAndMaybeBan: chat.recordProfanityStrikeAndMaybeBan,
    getProfanityStrikeCountForUser: chat.getProfanityStrikeCountForUser,

    // emailVerification
    saveEmailVerificationToken: emailVerification.saveEmailVerificationToken,
    findUserByVerificationTokenHash: emailVerification.findUserByVerificationTokenHash,
    markEmailVerified: emailVerification.markEmailVerified,
    clearEmailVerificationState: emailVerification.clearEmailVerificationState,
    getUserVerificationStatusById: emailVerification.getUserVerificationStatusById,

    // notifications
    insertNotification: notifications.insertNotification,
    getNotificationsForUser: notifications.getNotificationsForUser,
    markNotificationRead: notifications.markNotificationRead,
    dismissNotificationForUser: notifications.dismissNotificationForUser,
    dismissFriendRequestNotificationsForUser: notifications.dismissFriendRequestNotificationsForUser,
    dismissAllNotificationsForUser: notifications.dismissAllNotificationsForUser,
    getUnreadNotificationCount: notifications.getUnreadNotificationCount,

    // user-vs-user reports (player bejelentesek - chat-tol fuggetlen)
    USER_REPORT_CATEGORIES: userReports.ALLOWED_CATEGORIES,
    USER_REPORT_STATUSES: userReports.ALLOWED_STATUSES,
    USER_REPORT_RESOLUTIONS: userReports.ALLOWED_RESOLUTIONS,
    createUserReport: userReports.createUserReport,
    listUserReports: userReports.listUserReports,
    updateUserReportStatus: userReports.updateUserReportStatus,
    countUserReportsByStatus: userReports.countUserReportsByStatus,
    getGameReviewById: userReports.getGameReviewById,

    // recent opponents (Rocket League stilusu lista)
    RECENT_OPPONENTS_DEFAULT_LIMIT: recentOpponents.RECENT_OPPONENTS_DEFAULT_LIMIT,
    RECENT_OPPONENTS_MAX_LIMIT: recentOpponents.RECENT_OPPONENTS_MAX_LIMIT,
    recordRecentOpponentPair: recentOpponents.recordRecentOpponentPair,
    getRecentOpponentsForUser: recentOpponents.getRecentOpponentsForUser
};
