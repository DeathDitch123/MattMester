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
const { escapeCsvValue } = require('./_helpers.js');

const router = express.Router();

// =====================================================================
// SECURITY — Bejelentkezesek admin oldal
// =====================================================================

// Kozos enrichment: row-bol kliens-szafe alak (network kategoria + UA parser + risk).
function enrichLoginRow(row) {
    const location = networkClassifier.classifyIp(row.ip_address);
    const device = networkClassifier.parseUserAgent(row.user_agent);
    const risk = networkClassifier.classifyRisk(row);
    return {
        id: row.id,
        userId: row.user_id,
        username: row.username,
        eventType: row.event_type,
        success: row.success === null ? null : Boolean(row.success),
        ip: row.ip_address,
        userAgent: row.user_agent,
        device,
        location,
        risk,
        message: row.message,
        metadata: row.metadata,
        occurredAt: row.occurred_at
    };
}

// Orszag-szuro: csak a megadott ISO orszagkodu sorok. A lokalis (loopback/private/docker)
// IP-ket egyutt szuri ki — ha az admin orszag-filter aktiv, csak public+country>matching matradnak.
function applyCountryFilter(rows, country) {
    if (!country) return rows;
    const upper = String(country).toUpperCase();
    return rows.filter((r) => String(r.location?.country || '').toUpperCase() === upper);
}

// GET /admin/security/logins — szurheto bejelentkezesi feed.
router.get(
    '/security/logins',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, data: [], message: 'Belso hiba a bejelentkezesi naplo lekerdezesekor.' };
        try {
            const q = request.query || {};
            const options = {
                limit: Math.min(Math.max(Number(q.limit) || 200, 1), 500),
                sinceDate: q.since ? new Date(q.since) : null,
                untilDate: q.until ? new Date(q.until) : null,
                ipAddress: q.ip ? String(q.ip).slice(0, 45) : null,
                username: q.username ? String(q.username).slice(0, 50) : null,
                status: q.status === 'success' || q.status === 'failed' ? q.status : 'all'
            };
            const rows = await adminRepo.listAdminLoginHistory(options);
            const enriched = rows.map(enrichLoginRow);
            const filtered = applyCountryFilter(enriched, q.country || null);
            payload = { success: true, data: filtered };
            response.locals.adminAudit.skip = true;
        } catch (error) {
            statusCode = 500;
            payload = { success: false, data: [], message: error.message || payload.message };
        }
        return response.status(statusCode).json(payload);
    }
);

// GET /admin/security/logins.csv — ugyanaz a szurokkel, CSV download.
router.get(
    '/security/logins.csv',
    adminLimiterChain,
    parseAdminToken,
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        try {
            const q = request.query || {};
            const options = {
                limit: Math.min(Math.max(Number(q.limit) || 500, 1), 500),
                sinceDate: q.since ? new Date(q.since) : null,
                untilDate: q.until ? new Date(q.until) : null,
                ipAddress: q.ip ? String(q.ip).slice(0, 45) : null,
                username: q.username ? String(q.username).slice(0, 50) : null,
                status: q.status === 'success' || q.status === 'failed' ? q.status : 'all'
            };
            const rows = await adminRepo.listAdminLoginHistory(options);
            const enriched = rows.map(enrichLoginRow);
            const filtered = applyCountryFilter(enriched, q.country || null);

            const headers = ['id', 'occurred_at', 'username', 'event_type', 'success', 'ip', 'location', 'browser', 'os', 'risk', 'user_agent', 'message'];
            const lines = [headers.map(escapeCsvValue).join(',')];
            for (const r of filtered) {
                lines.push([
                    r.id,
                    r.occurredAt ? new Date(r.occurredAt).toISOString() : '',
                    r.username || '',
                    r.eventType || '',
                    r.success === null ? '' : (r.success ? 'true' : 'false'),
                    r.ip || '',
                    r.location?.label || '',
                    r.device?.browser || '',
                    r.device?.os || '',
                    r.risk || '',
                    r.userAgent || '',
                    r.message || ''
                ].map(escapeCsvValue).join(','));
            }
            const csvBody = lines.join('\n') + '\n';

            const filename = `bejelentkezesek-${new Date().toISOString().slice(0, 10)}.csv`;
            response.setHeader('Content-Type', 'text/csv; charset=utf-8');
            response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            response.locals.adminAudit.action = ADMIN_PERMISSIONS.SECURITY_LOGINS_EXPORT;
            response.locals.adminAudit.severity = 'info';
            response.locals.adminAudit.targetType = 'security';
            response.locals.adminAudit.targetLabel = `bejelentkezes-export (${filtered.length} sor)`;
            response.locals.adminAudit.success = true;

            return response.status(statusCode).send(csvBody);
        } catch (error) {
            console.error('admin/security/logins.csv hiba:', error.message);
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.SECURITY_LOGINS_EXPORT;
            response.locals.adminAudit.success = false;
            response.locals.adminAudit.errorCode = 'CSV_EXPORT_FAILED';
            return response.status(500).json({ success: false, message: error.message || 'CSV export hiba.' });
        }
    }
);


module.exports = router;
