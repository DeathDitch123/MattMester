// Eredetileg a backend/api/routes/admin.js egyetlen fajlban volt — szet lett bontva
// rendeltetes szerinti sub-router-ekre. Az index.js mountolja oket /api/admin ala.

const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const sql = require('../../../sql/sql_functions.js');
const adminRepo = require('../../../sql/adminRepo.js');
const { passwordRegex } = require('../../validation.js');

const {
    parseAdminToken,
    requireSuperAdmin,
    requireReasonOnMutate,
    auditContext
} = require('../../admin/middleware.js');
const { auditFlush } = require('../../admin/auditService.js');
const alertingService = require('../../admin/alertingService.js');
const { adminLimiterChain } = require('../../admin/adminRateLimiter.js');
const { ADMIN_PERMISSIONS, ADMIN_ERROR_CODES } = require('../../admin/constants.js');
const { invalidateIpBlockCache } = require('../../middleware/ipBlockGuard.js');
const networkClassifier = require('../../admin/networkClassifier.js');

const router = express.Router();

// =====================================================================
// CHAT MODERATION
// flagged list = is_body_masked TRUE uzenetek; allow = unmask, delete = fizikai torles.
// =====================================================================

router.get(
    '/chat/flagged',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Szerverhiba a chat moderacios lista lekerdezese soran.' };
        try {
            const limit = Math.min(Math.max(Number(request.query?.limit) || 50, 1), 200);
            const messages = await sql.getFlaggedChatMessages(limit);
            payload = {
                success: true,
                data: messages,
                message: messages.length ? `${messages.length} jelolt uzenet.` : 'Nincs jelolt uzenet.'
            };
            response.locals.adminAudit.skip = true; // read-only listazas, ne logoljuk minden lekerest
        } catch (error) {
            console.error('Admin flagged chat lista hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

// Allow: a fuggo felhasznaloi bejelenteseket lezarja 'allowed' statusszal.
// FONTOS: ez NEM veszi le a maszkolast (is_body_masked) — a profanity-filter blocklist
// hard rule, az admin sem birálhatja felul. Ha egy uzenet csak auto-flagged es nincs
// pending bejelentes rajta, a hivas 409-cel hibazik.
// Reason kotelezo (chat.view_any normal action, min 10 char).
router.post(
    '/chat/messages/:messageId/allow',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.CHAT_VIEW_ANY),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a bejelentes lezarasa soran.' };
        try {
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            const messageId = Number(request.params?.messageId) || 0;
            if (!messageId) {
                statusCode = 400;
                throw new Error('Ervenytelen uzenet azonosito.');
            }

            const result = await sql.dismissReportsForMessage(messageId, adminUserId, request.adminReason);

            // Spam-protection: a bejelentoke(t) 5 oraig kitiltjuk az ujabb bejelentesektol.
            // (Ha az admin "Engedelyezes"-t hasznalt = a bejelentes nem volt valid.)
            let muteResult = { affected: 0, until: null };
            if (Array.isArray(result.reporterUserIds) && result.reporterUserIds.length) {
                try {
                    muteResult = await sql.setChatReportMuteForUsers(result.reporterUserIds, sql.CHAT_REPORT_MUTE_HOURS);
                } catch (muteErr) {
                    console.warn('chat allow: report mute set hiba:', muteErr.message);
                }
            }

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.CHAT_VIEW_ANY;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'chat_message';
            response.locals.adminAudit.targetId = messageId;
            response.locals.adminAudit.afterState = {
                reportsDismissed: result.dismissedReports,
                mutedReporterCount: muteResult.affected,
                muteUntil: muteResult.until
            };
            response.locals.adminAudit.success = true;

            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:chat:reviewed', {
                        messageId,
                        action: 'allowed',
                        reviewedByUserId: adminUserId,
                        mutedReporterCount: muteResult.affected,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('chat allow: admin broadcast hiba:', broadcastErr.message);
            }

            // Az erintett bejelentoknek elkuldjuk a notification-szeru push-t is, hogy
            // ha eppen nyitva van a chat, kapjanak feedbacket.
            try {
                const socketHub = request.app?.locals?.socketHub;
                if (socketHub && typeof socketHub.emitToUser === 'function' && Array.isArray(result.reporterUserIds)) {
                    for (const uid of result.reporterUserIds) {
                        socketHub.emitToUser(uid, 'chat:report:muted', {
                            messageId,
                            muteUntil: muteResult.until,
                            hours: sql.CHAT_REPORT_MUTE_HOURS
                        });
                    }
                }
            } catch (pushErr) {
                console.warn('chat allow: reporter push hiba:', pushErr.message);
            }

            payload = {
                success: true,
                message: `${result.dismissedReports} bejelentes lezarva (allowed). A maszkolas (ha van) erintetlen marad. ${muteResult.affected} bejelento ${sql.CHAT_REPORT_MUTE_HOURS} oras report-mute-ot kapott.`,
                data: {
                    messageId,
                    action: 'allowed',
                    dismissedReports: result.dismissedReports,
                    mutedReporterCount: muteResult.affected,
                    muteUntil: muteResult.until
                }
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            const messageLower = String(error?.message || '').toLowerCase();
            if (messageLower.includes('nem talalhato') || messageLower.includes('nem található')) {
                statusCode = 404;
            } else if (messageLower.includes('nincs feldolgozhato')) {
                statusCode = 409;
            }
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.CHAT_VIEW_ANY;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'CHAT_ALLOW_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// Delete: reason kotelezo (chat.delete kritikus action, min 30 char).
router.post(
    '/chat/messages/:messageId/delete',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba az uzenet torlese soran.' };
        try {
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            const messageId = Number(request.params?.messageId) || 0;
            if (!messageId) {
                statusCode = 400;
                throw new Error('Ervenytelen uzenet azonosito.');
            }

            const result = await sql.deleteChatMessageById(messageId, adminUserId, request.adminReason);

            // 3-csapas auto-ban: az admin altal torolt uzenet kuldoje strike-ot kap.
            // UNIQUE(message_id) miatt ha mar volt strike (auto-mask), nem duplikalja.
            // A torles erdeklodo eset: a uzenet NEM volt auto-flagged, de admin tragarnak
            // talalta es torolte → strike + esetleges ban.
            let strikeOutcome = null;
            let ipEscalationOutcome = null;
            try {
                if (result?.senderId) {
                    strikeOutcome = await sql.recordProfanityStrikeAndMaybeBan(
                        result.senderId,
                        messageId,
                        'admin_delete'
                    );
                    if (strikeOutcome?.banApplied) {
                        // Account-ban event + esetleges IP-ban escalation. A user IP-jet
                        // a users.last_login_ip-bol vesszuk (offline user-t is bantudunk).
                        try {
                            const senderIp = await sql.getUserLastLoginIp(result.senderId);
                            ipEscalationOutcome = await sql.recordAccountBanEvent({
                                userId: result.senderId,
                                ipAddress: senderIp,
                                source: 'profanity_strike',
                                reason: strikeOutcome.banReason
                            });
                        } catch (escErr) {
                            console.warn('chat delete: account-ban event hiba:', escErr.message);
                        }

                        const adminSocketHub = request.app?.locals?.adminSocketHub;
                        if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                            adminSocketHub.broadcastAdmin('admin:chat:auto-ban', {
                                userId: result.senderId,
                                strikeCount: strikeOutcome.strikeCount,
                                banType: strikeOutcome.banType,
                                bannedUntil: strikeOutcome.bannedUntil,
                                reason: strikeOutcome.banReason,
                                source: 'admin_delete',
                                triggeredByAdminId: adminUserId,
                                ipBlock: ipEscalationOutcome && ipEscalationOutcome.triggeredIpBlock ? {
                                    ipAddress: ipEscalationOutcome.ipAddress,
                                    blockType: ipEscalationOutcome.blockType,
                                    blockedUntil: ipEscalationOutcome.blockedUntil
                                } : null,
                                at: new Date().toISOString()
                            });
                        }
                        // banUser() (nem disconnectUser) — `user:banned` eventet kuld,
                        // amitol a kliens a /html/ban.html-re navigal a /api/logout helyett.
                        const socketHub = request.app?.locals?.socketHub;
                        if (socketHub && typeof socketHub.banUser === 'function') {
                            await socketHub.banUser(result.senderId, strikeOutcome.banReason || 'profanity_strike_ban');
                        }
                    }
                }
            } catch (strikeErr) {
                console.warn('chat delete: profanity strike hiba:', strikeErr.message);
            }

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'chat_message';
            response.locals.adminAudit.targetId = messageId;
            response.locals.adminAudit.afterState = { deleted: true };
            response.locals.adminAudit.success = true;

            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:chat:reviewed', {
                        messageId,
                        action: 'deleted',
                        reviewedByUserId: adminUserId,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('chat delete: admin broadcast hiba:', broadcastErr.message);
            }

            try {
                const socketHub = request.app?.locals?.socketHub;
                if (socketHub && typeof socketHub.emitToUser === 'function' && Array.isArray(result.participantUserIds)) {
                    for (const uid of result.participantUserIds) {
                        socketHub.emitToUser(uid, 'chat:message:deleted', {
                            messageId,
                            conversationId: result.conversationId
                        });
                    }
                }
            } catch (pushErr) {
                console.warn('chat delete: user push hiba:', pushErr.message);
            }

            const strikeMsgPart = strikeOutcome?.banApplied
                ? ` Auto-ban alkalmazva: ${strikeOutcome.strikeCount}. csapas (${strikeOutcome.banType}).`
                : (strikeOutcome?.strikeRecorded
                    ? ` Strike rogzitve: ${strikeOutcome.strikeCount}. csapas.`
                    : '');
            payload = {
                success: true,
                message: `Az uzenet veglegesen torolve.${strikeMsgPart}`,
                data: { messageId, action: 'deleted', strike: strikeOutcome || null }
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            const messageLower = String(error?.message || '').toLowerCase();
            if (messageLower.includes('nem talalhato') || messageLower.includes('nem található')) {
                statusCode = 404;
            }
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'CHAT_DELETE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// Admin: szavakat hozzaad a dinamikus chat blocklist-hoz. A request body egy `words`
// tomb (vagy egyetlen szo) — opcionalisan egy `sourceMessageId` (a forras-uzenet id-je).
// reason kotelezo (chat.delete kritikus action min. 30 char).
router.post(
    '/chat/blocklist/add',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a blocklist bovites soran.' };
        try {
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            const wordsInput = request.body?.words;
            const sourceMessageId = Number(request.body?.sourceMessageId) || null;

            const wordsArray = Array.isArray(wordsInput)
                ? wordsInput
                : (typeof wordsInput === 'string' ? [wordsInput] : []);

            if (!wordsArray.length) {
                statusCode = 400;
                throw new Error('Legalabb egy szot meg kell adni.');
            }

            const result = await sql.addDynamicBlockedWords(wordsArray, adminUserId, sourceMessageId);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'chat_blocklist';
            response.locals.adminAudit.targetId = sourceMessageId;
            response.locals.adminAudit.afterState = { added: result.added, words: result.words };
            response.locals.adminAudit.success = true;

            // Live broadcast a tobbi admin tabnak — ha nyitva van a chat moderalas
            // panel, jelezhetjuk hogy a blocklist bovult.
            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:chat:blocklist-updated', {
                        added: result.added,
                        skipped: result.skipped,
                        addedByUserId: adminUserId,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('chat blocklist add: broadcast hiba:', broadcastErr.message);
            }

            payload = {
                success: true,
                message: `${result.added} szo hozzaadva (${result.skipped} mar letezett vagy kihagyva).`,
                data: result
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.CHAT_DELETE_MESSAGE;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'CHAT_BLOCKLIST_ADD_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);


module.exports = router;
