// Eredetileg a backend/api/routes/admin.js egyetlen fajlban volt — szet lett bontva
// rendeltetes szerinti sub-router-ekre. Az index.js mountolja oket /api/admin ala.

const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const sql = require('../../../sql/sql_funtions.js');
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
// PROFILE IMAGE REVIEW
// pending list (read), approve (reason opcionalis), reject (reason kotelezo).
// =====================================================================

router.get(
    '/profile-images/pending',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Szerverhiba a fuggo profilkepek lekerdezese soran.' };
        try {
            const pending = await sql.getPendingProfileImages();
            const data = (pending || []).map((row) => ({
                uploadId: row.id,
                userId: row.user_id,
                username: row.username,
                filename: row.filename,
                currentImage: row.current_image,
                uploadTime: row.upload_time,
                status: row.status
            }));
            payload = {
                success: true,
                data,
                message: data.length ? `${data.length} fuggo profilkep.` : 'Nincs fuggo profilkep.'
            };
            response.locals.adminAudit.skip = true; // read-only listazas, ne logoljuk minden lekerest
        } catch (error) {
            console.error('Admin pending profile images hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

// Approve: reason OPCIONALIS (nem kotelezo a requireReasonOnMutate, ezert kihagyjuk).
// Helyette manualisan, ha jott reason, attesszuk audit reasonra; egyebkent default.
router.post(
    '/profile-images/:uploadId/approve',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a profilkep jovahagyasa soran.' };
        try {
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            const uploadId = Number(request.params?.uploadId) || 0;
            if (!uploadId) {
                statusCode = 400;
                throw new Error('Ervenytelen feltoltes azonosito.');
            }

            // Reason opcionalis approve-nal; manualisan rakjuk az auditra
            request.adminReason = String(request.body?.reason || '').trim().slice(0, 1000) || 'profilkep jovahagyas';

            const approveResult = await sql.approveProfileImage(uploadId, adminUserId);
            const ownerUserId = Number(approveResult?.userId) || 0;
            const ownerFilename = approveResult?.filename || null;
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'profile_image';
            response.locals.adminAudit.targetId = uploadId;
            response.locals.adminAudit.afterState = { status: 'approved' };
            response.locals.adminAudit.success = true;

            // Live broadcast a tobbi admin tabnak: a fuggo profilkep lista + dashboard tick frissuljon.
            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:profile-image:reviewed', {
                        uploadId,
                        status: 'approved',
                        reviewedByUserId: adminUserId,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('profile-image approve: broadcast hiba:', broadcastErr.message);
            }

            // Real-time push az erintett felhasznalo nyitott tabjaira: a profil oldal
            // image status pill + avatar azonnal frissuljon (fetchSessionInfo re-fetch).
            try {
                const socketHub = request.app?.locals?.socketHub;
                if (ownerUserId && socketHub && typeof socketHub.emitToUser === 'function') {
                    socketHub.emitToUser(ownerUserId, 'user:profile:imageReviewed', {
                        uploadId,
                        status: 'approved',
                        filename: ownerFilename,
                        at: new Date().toISOString()
                    });
                }
            } catch (pushErr) {
                console.warn('profile-image approve: user push hiba:', pushErr.message);
            }

            payload = {
                success: true,
                message: 'A profilkep jovahagyva. A kep globalisan lathatova valt.',
                data: { uploadId, status: 'approved' }
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            const messageLower = String(error?.message || '').toLowerCase();
            if (messageLower.includes('nem talalhato') || messageLower.includes('nem található')) {
                statusCode = 404;
            } else if (messageLower.includes('csak fuggo') || messageLower.includes('csak függő')) {
                statusCode = 409;
            }
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'PROFILE_IMAGE_APPROVE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// Reject: reason KOTELEZO (requireReasonOnMutate).
router.post(
    '/profile-images/:uploadId/reject',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a profilkep elutasitasa soran.' };
        try {
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            const uploadId = Number(request.params?.uploadId) || 0;
            if (!uploadId) {
                statusCode = 400;
                throw new Error('Ervenytelen feltoltes azonosito.');
            }

            const reviewNoteRaw = typeof request.body?.reviewNote === 'string' ? request.body.reviewNote.trim() : '';
            const reviewNote = reviewNoteRaw ? reviewNoteRaw.slice(0, 500) : (request.adminReason || null);

            const rejectResult = await sql.rejectProfileImage(uploadId, adminUserId, reviewNote);
            const ownerUserId = Number(rejectResult?.userId) || 0;
            const ownerFilename = rejectResult?.filename || null;
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'profile_image';
            response.locals.adminAudit.targetId = uploadId;
            response.locals.adminAudit.afterState = { status: 'rejected', reviewNote };
            response.locals.adminAudit.success = true;

            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:profile-image:reviewed', {
                        uploadId,
                        status: 'rejected',
                        reviewedByUserId: adminUserId,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('profile-image reject: broadcast hiba:', broadcastErr.message);
            }

            try {
                const socketHub = request.app?.locals?.socketHub;
                if (ownerUserId && socketHub && typeof socketHub.emitToUser === 'function') {
                    socketHub.emitToUser(ownerUserId, 'user:profile:imageReviewed', {
                        uploadId,
                        status: 'rejected',
                        filename: ownerFilename,
                        reviewNote,
                        at: new Date().toISOString()
                    });
                }
            } catch (pushErr) {
                console.warn('profile-image reject: user push hiba:', pushErr.message);
            }

            payload = {
                success: true,
                message: 'A profilkep elutasitva. A publikus kep visszaallt az alapertelmezettre.',
                data: { uploadId, status: 'rejected' }
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            const messageLower = String(error?.message || '').toLowerCase();
            if (messageLower.includes('nem található') || messageLower.includes('nem talalhato')) {
                statusCode = 404;
            }
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'PROFILE_IMAGE_REJECT_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);


module.exports = router;
