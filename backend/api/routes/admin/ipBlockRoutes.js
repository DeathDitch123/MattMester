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
// IP BLOCK MANAGEMENT
// =====================================================================

// POST /admin/ip-blocks — uj/frissitett blokk az ip_blocks tablaba.
// body: { ipAddress, blockedUntil?, reason }
router.post(
    '/ip-blocks',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba az IP blokk soran.' };
        const adminUserId = Number(request.adminAuth?.userId) || 0;
        const adminUsername = request.adminAuth?.username || null;
        try {
            const body = request.body || {};
            const ipAddress = String(body.ipAddress || '').trim();
            const blockedUntilRaw = body.blockedUntil || null;
            const reason = body.reason ? String(body.reason).trim() : null;

            if (!ipAddress || ipAddress.length > 45) {
                statusCode = 400;
                throw new Error('Ervenytelen IP cim.');
            }
            // Egyszeru sanity check IPv4/IPv6 formara
            if (!/^[0-9a-fA-F:.]+$/.test(ipAddress)) {
                statusCode = 400;
                throw new Error('Ervenytelen IP cim formatum.');
            }
            // Loopback (127.0.0.1, ::1, localhost) blokkolasat tiltjuk — az admin nem
            // tudna magat kizarni dev kornyezetbol amugy is (whitelist a guard-ban),
            // szoval a sor csak felrevezeto lenne ("blokkolva van de meg mukodik?").
            const loopbackPatterns = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
            if (loopbackPatterns.includes(ipAddress.toLowerCase()) || ipAddress.startsWith('127.')) {
                statusCode = 400;
                throw new Error('Loopback IP cimet (localhost) nem lehet blokkolni.');
            }

            let blockedUntil = null;
            if (blockedUntilRaw) {
                const parsed = new Date(blockedUntilRaw);
                if (Number.isNaN(parsed.getTime())) {
                    statusCode = 400;
                    throw new Error('Ervenytelen lejarati datum.');
                }
                blockedUntil = parsed;
            }

            await adminRepo.upsertIpBlock(ipAddress, blockedUntil, reason, adminUserId, adminUsername);
            invalidateIpBlockCache(ipAddress);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.IP_BLOCK_CREATE;
            response.locals.adminAudit.severity = 'critical';
            response.locals.adminAudit.targetType = 'ip';
            response.locals.adminAudit.targetKey = ipAddress;
            response.locals.adminAudit.targetLabel = ipAddress;
            response.locals.adminAudit.reason = reason;
            response.locals.adminAudit.success = true;

            payload = {
                success: true,
                message: `IP ${ipAddress} blokkolva.`,
                ipAddress,
                blockedUntil: blockedUntil ? blockedUntil.toISOString() : null
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.IP_BLOCK_CREATE;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'IP_BLOCK_CREATE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// DELETE /admin/ip-blocks/:ip — blokk feloldasa.
router.delete(
    '/ip-blocks/:ip',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba az IP blokk feloldasa soran.' };
        try {
            const ipAddress = String(request.params?.ip || '').trim();
            if (!ipAddress) {
                statusCode = 400;
                throw new Error('Ervenytelen IP cim.');
            }
            const affected = await adminRepo.removeIpBlock(ipAddress);
            invalidateIpBlockCache(ipAddress);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.IP_BLOCK_REMOVE;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'ip';
            response.locals.adminAudit.targetKey = ipAddress;
            response.locals.adminAudit.targetLabel = ipAddress;
            response.locals.adminAudit.success = true;

            payload = { success: true, message: `IP ${ipAddress} feloldva.`, affected };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.IP_BLOCK_REMOVE;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'IP_BLOCK_REMOVE_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);

// POST /admin/users/:id/restore-deletion — soft-deleted user visszaallitasa.
// Idempotens: ha a user nincs soft-delete allapotban, 0 affectedRows + figyelmezteto uzenet.
router.post(
    '/users/:id/restore-deletion',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Belso hiba a visszaallitaskor.' };
        const adminUserId = Number(request.adminAuth?.userId) || 0;
        const targetUserId = Number(request.params?.id) || 0;
        try {
            if (!targetUserId) {
                statusCode = 400;
                throw new Error('Ervenytelen felhasznalo azonosito.');
            }
            const affected = await sql.restoreUserFromSoftDelete(targetUserId);

            response.locals.adminAudit.action = 'users.restore_deletion';
            response.locals.adminAudit.severity = 'warning';
            response.locals.adminAudit.targetType = 'user';
            response.locals.adminAudit.targetId = targetUserId;
            response.locals.adminAudit.success = true;

            if (affected > 0) {
                // Audit log a target user_logs-ba.
                try {
                    await sql.insertUserLog(targetUserId, {
                        eventType: 'restored_from_deletion',
                        eventCategory: 'security',
                        severity: 'info',
                        source: 'admin',
                        success: true,
                        message: 'Admin visszavonta a fiók törlését.',
                        ipAddress: request.adminAuth?.ipAddress || request.ip,
                        userAgent: request.adminAuth?.userAgent || request.headers['user-agent'],
                        metadata: {
                            actorAdminId: adminUserId,
                            actorAdminUsername: request.adminAuth?.username
                        }
                    });
                } catch (logErr) {
                    console.warn('restore-deletion: target user_logs insert hiba:', logErr.message);
                }

                // Live broadcast az admin tabokra (a delete-tablan eltunjon a sor).
                try {
                    const adminSocketHub = request.app?.locals?.adminSocketHub;
                    if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                        adminSocketHub.broadcastAdmin('admin:user:deletion-restored', {
                            userId: targetUserId,
                            restoredByUserId: adminUserId,
                            at: new Date().toISOString()
                        });
                    }
                } catch (broadcastErr) {
                    console.warn('restore-deletion: broadcast hiba:', broadcastErr.message);
                }
            }

            payload = {
                success: true,
                message: affected > 0 ? 'Felhasználó visszaállítva.' : 'A felhasználó nem volt törlésre kijelölve.',
                affected
            };
        } catch (error) {
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || payload.message };
            response.locals.adminAudit.action = 'users.restore_deletion';
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'RESTORE_DELETION_FAILED';
        }
        return response.status(statusCode).json(payload);
    }
);


module.exports = router;
