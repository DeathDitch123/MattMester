// Admin: uj felhasznalo letrehozasa az adminPanel "Uj felhasznalo" modalbol.
// POST /api/admin/users/create
// Body: { username, email, role?='player', initialElo?=1200, reason }
//
// Mukodes:
//   1. Validalja a username + email formatumot, foglaltsagot
//   2. General egy ideiglenes jelszot (16 char, secure)
//   3. bcrypt hash-eli, beszurja a users tablaba (insertUser)
//   4. Ha role !== 'player' VAGY initialElo !== alapertelmezett, frissiti
//   5. Visszaadja az ideiglenes jelszot az admin-nak (egyszer, masolva kell tovabbitani)
//
// Audit: requireReasonOnMutate(USERS_CREATE) — kotelezo indok a kritikus muvelet ellenorzes miatt.

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const sql = require('../../../sql/sql_functions.js');

const {
    parseAdminToken,
    requireReasonOnMutate,
    auditContext
} = require('../../admin/middleware.js');
const { auditFlush } = require('../../admin/auditService.js');
const { adminLimiterChain } = require('../../admin/adminRateLimiter.js');
const { ADMIN_PERMISSIONS } = require('../../admin/constants.js');
const { usernameRegex, emailRegex, passwordRegex } = require('../../validation.js');

const router = express.Router();

const PASSWORD_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

// Generate a 16-char password that satisfies passwordRegex (lower+upper+digit).
// Brute-forced retry to guarantee compliance — usually 1 try is enough since
// the alphabet contains all three classes.
function generateTempPassword() {
    for (let attempt = 0; attempt < 20; attempt++) {
        const buf = crypto.randomBytes(16);
        let s = '';
        for (let i = 0; i < 16; i++) {
            s += PASSWORD_ALPHABET[buf[i] % PASSWORD_ALPHABET.length];
        }
        if (passwordRegex.test(s)) return s;
    }
    // Garantalt fallback
    return 'AdminTemp123!' + crypto.randomBytes(2).toString('hex');
}

router.post(
    '/users/create',
    adminLimiterChain,
    parseAdminToken,
    express.json(),
    requireReasonOnMutate(ADMIN_PERMISSIONS.USERS_CREATE),
    auditContext,
    auditFlush,
    async (request, response) => {
        let statusCode = 200;
        let payload = { success: false, message: 'Szerverhiba a felhasznalo letrehozasa soran.' };
        try {
            const body = request.body || {};
            const username = typeof body.username === 'string' ? body.username.trim() : '';
            const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
            const role = (typeof body.role === 'string' && ['player', 'admin'].includes(body.role)) ? body.role : 'player';
            const initialEloRaw = body.initialElo;
            const initialElo = Number.isFinite(Number(initialEloRaw)) ? Math.round(Number(initialEloRaw)) : 1200;

            if (!username || !email) {
                statusCode = 400;
                throw new Error('A felhasznalonev es az email kotelezo.');
            }
            if (!emailRegex.test(email)) {
                statusCode = 400;
                throw new Error('Ervenytelen email formatum.');
            }
            if (username.length < 3 || username.length > 50) {
                statusCode = 400;
                throw new Error('A felhasznalonev 3-50 karakter lehet.');
            }
            if (!usernameRegex.test(username)) {
                statusCode = 400;
                throw new Error('A felhasznalonev csak alfanumerikus, pont, alahuzas, kotojel lehet.');
            }
            if (initialElo < 0 || initialElo > 4000) {
                statusCode = 400;
                throw new Error('Az ELO 0 es 4000 kozott lehet.');
            }

            if (await sql.getUserByEmail(email)) {
                statusCode = 409;
                throw new Error('Ez az email cim mar foglalt.');
            }
            if (await sql.getUserByUsername(username)) {
                statusCode = 409;
                throw new Error('Ez a felhasznalonev mar foglalt.');
            }

            const tempPassword = generateTempPassword();
            const passwordHash = await bcrypt.hash(tempPassword, 10);

            const insertResult = await sql.insertUser(username, passwordHash, email);
            const newUserId = insertResult?.insertId;
            if (!newUserId) throw new Error('Sikertelen beszuras.');

            // Role / ELO opcionalis update az alapertekektol elteres eseten.
            // A defaultok: role='player', elo=800 (lasd users tabla DEFAULT-jai).
            const needsRoleUpdate = role !== 'player';
            const needsEloUpdate = initialElo !== 800;

            if (needsRoleUpdate || needsEloUpdate) {
                try {
                    if (typeof sql.updateUserAdminFields === 'function') {
                        await sql.updateUserAdminFields(newUserId, {
                            role: needsRoleUpdate ? role : undefined,
                            elo: needsEloUpdate ? initialElo : undefined,
                            elo_MM: needsEloUpdate ? initialElo : undefined,
                            elo_bullet: needsEloUpdate ? initialElo : undefined
                        });
                    } else {
                        // Direct UPDATE fallback
                        const pool = require('../../../sql/database.js').getPool();
                        const fragments = [];
                        const values = [];
                        if (needsRoleUpdate) { fragments.push('role = ?'); values.push(role); }
                        if (needsEloUpdate) {
                            fragments.push('elo = ?', 'elo_MM = ?', 'elo_bullet = ?');
                            values.push(initialElo, initialElo, initialElo);
                        }
                        values.push(newUserId);
                        await pool.execute(`UPDATE users SET ${fragments.join(', ')} WHERE id = ?`, values);
                    }
                } catch (updateErr) {
                    console.warn('Admin user create: role/elo update failed (user already inserted):', updateErr.message);
                }
            }

            statusCode = 201;
            payload = {
                success: true,
                message: `Felhasznalo letrehozva: ${username}`,
                data: {
                    userId: newUserId,
                    username,
                    email,
                    role,
                    initialElo,
                    tempPassword,
                    note: 'Az ideiglenes jelszot egyszer kapod meg — masold ki es tovabbitsd a felhasznalonak. Bejelentkezes utan a "Profil > Jelszo" oldalon valtoztathatja meg.'
                }
            };

            // Audit context
            response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_CREATE;
            response.locals.adminAudit.targetUserId = newUserId;
            response.locals.adminAudit.success = true;
        } catch (error) {
            const message = error?.message || 'Szerverhiba a letrehozas soran.';
            payload = { success: false, message };
            if (statusCode === 200) statusCode = 500;
            try {
                response.locals.adminAudit.action = ADMIN_PERMISSIONS.USERS_CREATE;
                response.locals.adminAudit.success = false;
                response.locals.adminAudit.errorCode = 'USER_CREATE_FAILED';
            } catch (_) { /* ignore */ }
        }
        return response.status(statusCode).json(payload);
    }
);

module.exports = router;
