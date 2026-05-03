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
// CSV EXPORT - /export-users
// Auditolt info-szintu muvelet, reason opcionalis (read-only).
// =====================================================================

const { escapeCsvValue } = require('./_helpers.js');

router.get(
    '/export-users',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let errorPayload = null;
        let csvBody = null;
        try {
            const users = await sql.getAllUsers();
            const headers = [
                'id', 'username', 'email', 'role', 'profile_image',
                'elo', 'elo_MM', 'elo_bullet',
                'is_banned', 'banned_until', 'last_active', 'created_at',
                'wins', 'losses', 'draws', 'total_abilities', 'win_rate_percent', 'last_ip'
            ];
            const rows = [headers.join(',')];
            for (const user of users || []) {
                rows.push([
                    user.id, user.username, user.email, user.role, user.profile_image,
                    user.elo, user.elo_MM, user.elo_bullet,
                    user.is_banned, user.banned_until, user.last_active, user.created_at,
                    user.wins, user.losses, user.draws,
                    user.total_abilities, user.win_rate_percent, user.last_ip
                ].map(escapeCsvValue).join(','));
            }
            csvBody = `﻿${rows.join('\n')}`;

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_EXPORT;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'users_export';
            response.locals.adminAudit.targetLabel = `${users?.length || 0} sor`;
            response.locals.adminAudit.success = true;
        } catch (error) {
            console.error('Admin export-users hiba:', error.message);
            statusCode = 500;
            errorPayload = { success: false, message: 'Szerverhiba a felhasznalok exportalasa soran.' };
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_EXPORT;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'EXPORT_FAILED';
        }

        let result;
        if (errorPayload) {
            result = response.status(statusCode).json(errorPayload);
        } else {
            const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`;
            response.setHeader('Content-Type', 'text/csv; charset=utf-8');
            response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            result = response.status(statusCode).send(csvBody);
        }
        return result;
    }
);


module.exports = router;
