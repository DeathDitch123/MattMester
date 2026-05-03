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
// USER REPORTS (player-vs-player bejelentesek; NEM chat-uzenet bejelentesek)
// list = osszes / 'open' / 'under_review' / 'closed' szuressel.
// PATCH /reports/:id/status - admin atallithatja a status-t es resolution-t.
// =====================================================================

router.get(
    '/reports',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Szerverhiba a bejelentes lista lekerdezesekor.' };
        try {
            const status = typeof request.query?.status === 'string' ? request.query.status.trim() : '';
            const limit = Math.min(Math.max(Number(request.query?.limit) || 100, 1), 500);
            const reports = await sql.listUserReports({ status: status || null, limit });
            const counts = await sql.countUserReportsByStatus();
            payload = {
                success: true,
                data: reports,
                counts,
                message: reports.length ? `${reports.length} bejelentes.` : 'Nincs bejelentes.'
            };
            response.locals.adminAudit.skip = true; // read-only listazas
        } catch (error) {
            console.error('admin/reports list hiba:', error.message);
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

// GET /admin/games/:gameId/review - egy konkret meccs reszletes lekerdezese
// admin manualis review-hoz: PGN, lepes-lista timestamp-pel (timing pattern
// elemzes), jatekos-info. Csak a Bejelentesek panel hivja egy report-hoz
// kapcsolt meccs megnyitasakor.
router.get(
    '/games/:gameId/review',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a meccs lekerdezese soran.' };
        try {
            const gameId = Number(request.params?.gameId) || 0;
            if (!gameId) {
                statusCode = 400;
                throw new Error('Ervenytelen meccs azonosito.');
            }
            const game = await sql.getGameReviewById(gameId);
            if (!game) {
                statusCode = 404;
                throw new Error('A meccs nem talalhato.');
            }
            payload = { success: true, data: game };
            response.locals.adminAudit.skip = true; // read-only
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

// PATCH a bejelentes status-an. Body: { status, resolution?, adminNote? }.
// Status valtozasanal automatikusan rogziti a reviewer + reviewed_at mezoket.
// reason kotelezo (REPORTS_REVIEW critical action - min. 30 char ha closed,
// barmilyen kis valasz mas status-nal).
router.patch(
    '/reports/:id/status',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.REPORTS_REVIEW),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a bejelentes frissitese soran.' };
        try {
            const adminUserId = Number(request.adminAuth?.userId) || 0;
            const reportId = Number(request.params?.id) || 0;
            if (!reportId) {
                statusCode = 400;
                throw new Error('Ervenytelen bejelentes azonosito.');
            }

            const { status, resolution, adminNote } = request.body || {};
            const result = await sql.updateUserReportStatus(reportId, {
                status,
                resolution,
                adminNote: adminNote ?? request.adminReason ?? null,
                reviewerUserId: adminUserId
            });

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.REPORTS_REVIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'user_report';
            response.locals.adminAudit.targetId = reportId;
            response.locals.adminAudit.afterState = { status, resolution: resolution || null };
            response.locals.adminAudit.success = true;

            // Real-time push: a tobbi admin tabnak frissulnek a counterek + lista.
            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    adminSocketHub.broadcastAdmin('admin:reports:updated', {
                        reportId,
                        status: status || null,
                        resolution: resolution || null,
                        reviewedByUserId: adminUserId,
                        at: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('admin:reports:updated broadcast hiba:', broadcastErr.message);
            }

            payload = {
                success: true,
                message: 'A bejelentes frissitve.',
                data: { reportId, updated: result.updated }
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            const messageLower = String(error?.message || '').toLowerCase();
            if (messageLower.includes('nem talalhato')) statusCode = 404;
            else if (messageLower.includes('ervenytelen')) statusCode = 400;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.REPORTS_REVIEW;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'REPORT_UPDATE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// Admin profil kép kezelés (feltöltés és eltávolítás - azonnal approved)
const ADMIN_PROFILE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_ADMIN_PROFILE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const adminProfileImageStorage = multer.diskStorage({
    destination: (request, file, callback) => {
        callback(null, path.join(__dirname, '../../profile_pictures'));
    },
    filename: (request, file, callback) => {
        const sanitizedName = String(file.originalname || 'profile-image')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .toLowerCase();
        callback(null, Date.now() + '-' + sanitizedName);
    }
});

const adminProfileImageUpload = multer({
    storage: adminProfileImageStorage,
    limits: { fileSize: ADMIN_PROFILE_IMAGE_MAX_BYTES },
    fileFilter: (request, file, callback) => {
        if (!ALLOWED_ADMIN_PROFILE_IMAGE_MIME_TYPES.has(file.mimetype)) {
            callback(new Error('Nem támogatott képformátum. Csak JPG, PNG és WEBP engedélyezett.'));
        } else {
            callback(null, true);
        }
    }
});

// POST /admin/users/:id/profile-image - admin képfeltöltés (azonnal approved)
router.post(
    '/users/:id/profile-image',
    adminLimiterChain,
    parseAdminToken,
    // Multer-t a reason-check ELŐTT futtatjuk, kulonben req.body meg ures
    // (multipart/form-data eseten a body-t multer parse-olja).
    (request, response, next) => {
        adminProfileImageUpload.single('image')(request, response, (uploadError) => {
            if (uploadError) {
                return response.status(400).json({ success: false, message: uploadError.message || 'Képfeltöltés sikertelen.' });
            }
            next();
        });
    },
    requireReasonOnMutate(ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a profilkép feltöltése során.' };
        let uploadedPath = null;
        try {
            const userId = Number(request.params?.id) || 0;
            if (!userId) {
                statusCode = 400;
                throw new Error('Érvénytelen felhasználó azonosító.');
            }

            if (!request.file) {
                statusCode = 400;
                throw new Error('A kép kiválasztása kötelező.');
            }

            if (request.file.size > ADMIN_PROFILE_IMAGE_MAX_BYTES) {
                statusCode = 400;
                throw new Error('A kép mérete legfeljebb 3 MB lehet.');
            }

            uploadedPath = `/profile_pictures/${request.file.filename}`;
            
            // Globális context az adminUserId-hez az SQL függvényen belül
            global._currentAdminUserId = request.adminAuth?.userId || 0;
            const uploadResult = await sql.uploadProfileImageAdminApproved(userId, uploadedPath);
            delete global._currentAdminUserId;

            // Értesítés küldése az usernek
            try {
                await sql.insertNotification({
                    type: 'profile_image_updated',
                    audience: 'user',
                    targetUserId: userId,
                    title: 'Profilkép frissítve',
                    message: 'Az adminisztrátor frissítette a profilképedet.',
                    severity: 'info'
                });
            } catch (notifyErr) {
                console.warn('Értesítés küldése sikertelen:', notifyErr.message);
            }

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'profile_image';
            response.locals.adminAudit.targetId = uploadResult.uploadId;
            response.locals.adminAudit.afterState = { status: 'approved', profileImage: uploadedPath };
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: 'Profilkép sikeresen feltöltve és jóváhagyva.',
                data: {
                    uploadId: uploadResult.uploadId,
                    profileImage: uploadResult.profileImage,
                    profileImageStatus: uploadResult.status
                }
            };
        } catch (error) {
            if (uploadedPath) {
                try {
                    const relativeUploadedPath = uploadedPath.replace(/^\//, '');
                    await fs.unlink(path.join(__dirname, '../..', relativeUploadedPath));
                } catch (deleteError) {
                    console.warn('Feltöltött kép törlése nem sikerült:', deleteError.message);
                }
            }
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || 'Szerverhiba a képfeltöltés közben.' };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'ADMIN_IMAGE_UPLOAD_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// POST /admin/users/:id/profile-image/remove - admin képeltávolítás
router.post(
    '/users/:id/profile-image/remove',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a profilkép eltávolítása során.' };
        try {
            const userId = Number(request.params?.id) || 0;
            if (!userId) {
                statusCode = 400;
                throw new Error('Érvénytelen felhasználó azonosító.');
            }

            const removeResult = await sql.resetUserProfileImageToDefault(userId);

            // Értesítés küldése az usernek
            try {
                await sql.insertNotification({
                    type: 'profile_image_removed',
                    audience: 'user',
                    targetUserId: userId,
                    title: 'Profilkép eltávolítva',
                    message: 'Az adminisztrátor eltávolította a profilképedet.',
                    severity: 'info'
                });
            } catch (notifyErr) {
                console.warn('Értesítés küldése sikertelen:', notifyErr.message);
            }

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.PROFILE_IMAGE_REVIEW;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'profile_image';
            response.locals.adminAudit.targetId = userId;
            response.locals.adminAudit.afterState = { status: 'default', profileImage: '/profile_pictures/default.png' };
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: 'Profilkép eltávolítva.',
                data: {
                    profileImage: removeResult.profileImage,
                    profileImageStatus: removeResult.profileImageStatus
                }
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            const messageLower = String(error?.message || '').toLowerCase();
            if (messageLower.includes('nem található') || messageLower.includes('nem talalhato')) {
                statusCode = 404;
            }
            payload = { success: false, message: error.message || 'Szerverhiba a profilkép eltávolítása közben.' };
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'ADMIN_IMAGE_REMOVE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);


module.exports = router;
