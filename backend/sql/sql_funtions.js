// Aggregator (barrel) modul. A korabbi monolit sql_funtions.js tartalmat
// rendeltetes szerint csoportositott modulokra bontottuk a `./modules/` ala,
// ez a fajl pedig kompatibilitasi reteg: a meglevo `require('./sql_funtions')`
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
    ipCollisionCheck: admin.ipCollisionCheck,
    ipCollisions: admin.ipCollisions,

    // bans
    banUser: bans.banUser,
    unbanUser: bans.unbanUser,
    checkUserBanStatus: bans.checkUserBanStatus,
    isEmailBanned: bans.isEmailBanned,

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
    markFriendRequestNotificationsReadForUser: notifications.markFriendRequestNotificationsReadForUser,
    markAllNotificationsReadForUser: notifications.markAllNotificationsReadForUser,
    getUnreadNotificationCount: notifications.getUnreadNotificationCount
};
