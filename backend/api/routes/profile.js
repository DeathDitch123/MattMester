const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const sql = require('../../sql/sql_funtions.js');
const { usernameRegex, emailRegex, passwordRegex } = require('../validation.js');
const { isAuthenticated, requireVerifiedEmail } = require('../funtions.js');
const {
    generateVerificationToken,
    sendVerificationEmail
} = require('../emailVerification.js');
const {
    verifyPasswordLimiter,
    profileUpdateLimiter,
    profileImageUploadLimiter,
    profileImageRemoveLimiter,
    profileDeleteLimiter
} = require('../middleware/rateLimiter.js');
const {
    logAuthenticatedAction,
    saveSessionAsync,
    destroySessionAsync
} = require('./_shared.js');

const router = express.Router();

const PROFILE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storage = multer.diskStorage({
    destination: (request, file, callback) => {
        callback(null, path.join(__dirname, '../../profile_pictures'));
    },
    filename: (request, file, callback) => {
        const sanitizedName = String(file.originalname || 'profile-image')
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .toLowerCase();
        callback(null, Date.now() + '-' + sanitizedName); //?egyedi név: dátum - file eredeti neve
    }
});

const profileImageUpload = multer({
    storage,
    limits: {
        fileSize: PROFILE_IMAGE_MAX_BYTES
    },
    fileFilter: (request, file, callback) => {
        if (!ALLOWED_PROFILE_IMAGE_MIME_TYPES.has(file.mimetype)) {
            callback(new Error('Nem támogatott képformátum. Csak JPG, PNG és WEBP engedélyezett.'));
        } else {
            callback(null, true);
        }
    }
});

router.post('/profile/verify-current-password', verifyPasswordLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let result = { success: true, valid: false, message: 'A jelenlegi jelszó hibás.' };
    try {
        const currentPassword = typeof request.body?.currentPassword === 'string' ? request.body.currentPassword : '';
        if (!currentPassword) {
            statusCode = 400;
            result = { success: false, valid: false, message: 'A jelenlegi jelszó kötelező.' };
        } else {
            const user = await sql.getUserAuthById(request.session.userId);
            if (!user) {
                statusCode = 404;
                result = { success: false, valid: false, message: 'A felhasználó nem található.' };
            } else {
                const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
                if (isMatch) {
                    result = { success: true, valid: true, message: 'A jelenlegi jelszó helyes.' };
                } else {
                    await logAuthenticatedAction(request, request.session.userId, {
                        eventType: 'current_password_verify_failed',
                        eventCategory: 'security',
                        severity: 'warning',
                        source: 'backend',
                        success: false,
                        message: 'Sikertelen jelenlegi jelszó ellenőrzés.'
                    });
                }
            }
        }
    } catch (error) {
        console.error('Current password verify hiba:', error);
        statusCode = 500;
        result = { success: false, valid: false, message: 'Szerverhiba az ellenőrzés során.' };
    }
    return response.status(statusCode).json(result);
});

router.post('/profile/settings', profileUpdateLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const body = request.body || {};
        const username = typeof body.username === 'string' ? body.username.trim() : '';
        const email = typeof body.email === 'string' ? body.email.trim() : '';
        const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
        const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

        if (!username || !email) {
            statusCode = 400;
            throw new Error('A felhasználónév és az e-mail cím kötelező.');
        }

        if (username.length < 3 || username.length > 50) {
            statusCode = 400;
            throw new Error('A felhasználónévnek 3 és 50 karakter között kell lennie.');
        }

        if (!usernameRegex.test(username)) {
            statusCode = 400;
            throw new Error('A felhasználónév formátuma érvénytelen.');
        }

        if (!emailRegex.test(email)) {
            statusCode = 400;
            throw new Error('Érvénytelen e-mail formátum.');
        }

        if (!currentPassword) {
            statusCode = 400;
            throw new Error('A profil módosításához add meg a jelenlegi jelszavad.');
        }

        if (newPassword) {
            if (!currentPassword) {
                statusCode = 400;
                throw new Error('Jelszó módosításához add meg a jelenlegi jelszavad.');
            }

            if (newPassword.includes('\\')) {
                statusCode = 400;
                throw new Error('A jelszó nem megengedett karaktert tartalmaz.');
            }

            if (newPassword.length < 8) {
                statusCode = 400;
                throw new Error('A jelszónak legalább 8 karakter hosszú kell legyen.');
            }

            if (!passwordRegex.test(newPassword)) {
                statusCode = 400;
                throw new Error('A jelszónak tartalmaznia kell nagybetűt, kisbetűt és számot.');
            }
        }

        const currentAuthUser = await sql.getUserAuthById(request.session.userId);
        if (!currentAuthUser) {
            statusCode = 404;
            throw new Error('A felhasználó nem található.');
        }

        const hasUsernameChanged = username !== currentAuthUser.username;
        const hasEmailChanged = email !== currentAuthUser.email;
        const hasPasswordChanged = newPassword.length > 0;

        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentAuthUser.password_hash);
        if (!isCurrentPasswordValid) {
            statusCode = 401;
            throw new Error('A jelenlegi jelszó hibás.');
        }

        if (!hasUsernameChanged && !hasEmailChanged && !hasPasswordChanged) {
            statusCode = 400;
            throw new Error('Nincs változás, nincs mit menteni.');
        }

        let passwordHash = null;
        if (hasPasswordChanged) {
            passwordHash = await bcrypt.hash(newPassword, 10);
        }

        const updateResult = await sql.updateUserProfileSettings(request.session.userId, {
            username,
            email,
            passwordHash
        });

        if (updateResult.usernameChanged) {
            request.session.username = updateResult.username;
        }

        await saveSessionAsync(request, 'Hiba a session mentésekor profil frissítés után.');

        const changedFields = [];
        if (updateResult.usernameChanged) {
            changedFields.push('username');
        }
        if (updateResult.emailChanged) {
            changedFields.push('email');
        }
        if (updateResult.passwordChanged) {
            changedFields.push('password');
        }

        await logAuthenticatedAction(request, request.session.userId, {
            eventType: 'profile_settings_update',
            eventCategory: 'profile',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Profil beállítások frissítve.',
            metadata: { changedFields }
        });

        if (updateResult.passwordChanged) {
            await logAuthenticatedAction(request, request.session.userId, {
                eventType: 'password_change',
                eventCategory: 'security',
                severity: 'warning',
                source: 'backend',
                success: true,
                message: 'Jelszó sikeresen megváltoztatva.'
            });
        }

        let newVerificationEmailSent = false;
        if (updateResult.emailChanged) {
            try {
                const { rawToken, tokenHash, expiresAt } = generateVerificationToken();
                await sql.saveEmailVerificationToken(request.session.userId, tokenHash, expiresAt);
                const sendInfo = await sendVerificationEmail(email, username, rawToken, { flow: 'email_changed' });
                newVerificationEmailSent = true;
                await logAuthenticatedAction(request, request.session.userId, {
                    eventType: 'email_verification_sent',
                    eventCategory: 'security',
                    severity: 'info',
                    source: 'backend',
                    success: true,
                    message: 'Új verifikációs email elküldve email változtatás után.',
                    metadata: {
                        email,
                        reason: 'email_changed',
                        expiresAt,
                        transport: sendInfo.transport || null,
                        messageId: sendInfo.messageId || null,
                        providerResponse: sendInfo.providerResponse || null
                    }
                });
            } catch (verificationError) {
                console.error('Email változtatás utáni verifikációs email hiba:', verificationError.message);
                await logAuthenticatedAction(request, request.session.userId, {
                    eventType: 'email_verification_sent',
                    eventCategory: 'security',
                    severity: 'error',
                    source: 'backend',
                    success: false,
                    message: 'Verifikációs email küldése sikertelen email változtatás után.',
                    metadata: {
                        email,
                        reason: 'email_changed',
                        error: verificationError.message,
                        smtpReason: verificationError.smtpReason || null
                    }
                });
            }
        }

        payload = {
            success: true,
            message: updateResult.emailChanged
                ? 'A profil beállítások sikeresen frissültek. Az új email címet meg kell erősítened — küldtünk egy linket.'
                : 'A profil beállítások sikeresen frissültek.',
            changedFields,
            emailVerification: updateResult.emailChanged
                ? { required: true, sent: newVerificationEmailSent }
                : undefined
        };
    } catch (error) {
        console.error('Profile settings hiba:', error);
        if (statusCode === 200) statusCode = 500;
        if (error?.code === 'ER_DUP_ENTRY' || error.message?.includes('foglalt')) statusCode = 409;
        payload = { success: false, message: error.message || 'Szerverhiba a profil beállítások mentése közben.' };
    }
    return response.status(statusCode).json(payload);
});

router.post('/profile/delete', profileDeleteLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentPassword = typeof request.body?.currentPassword === 'string' ? request.body.currentPassword : '';

        if (!currentPassword) {
            statusCode = 400;
            throw new Error('A jelenlegi jelszó kötelező.');
        }

        if (currentPassword.includes('\\')) {
            statusCode = 400;
            throw new Error('A jelszó nem megengedett karaktert tartalmaz.');
        }

        if (currentPassword.length < 8) {
            statusCode = 400;
            throw new Error('A jelszónak legalább 8 karakter hosszú kell legyen.');
        }

        if (!passwordRegex.test(currentPassword)) {
            statusCode = 400;
            throw new Error('A jelszónak tartalmaznia kell nagybetűt, kisbetűt és számot.');
        }

        const authUser = await sql.getUserAuthById(request.session.userId);
        if (!authUser) {
            statusCode = 404;
            throw new Error('A felhasználó nem található.');
        }

        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, authUser.password_hash);
        if (!isCurrentPasswordValid) {
            statusCode = 401;
            throw new Error('A jelenlegi jelszó hibás.');
        }

        await logAuthenticatedAction(request, request.session.userId, {
            eventType: 'profile_delete',
            eventCategory: 'security',
            severity: 'critical',
            source: 'backend',
            success: true,
            message: 'Profil törlése.'
        });

        const deleteResult = await sql.deleteUserProfileWithTransaction(request.session.userId);
        await destroySessionAsync(request, 'Session törlési hiba profil törlés után.');
        response.clearCookie('connect.sid');

        payload = {
            success: true,
            message: 'A profil sikeresen törölve lett.',
            userId: deleteResult.userId,
            username: deleteResult.username
        };
    } catch (error) {
        console.error('Profile delete hiba:', error);
        if (statusCode === 200) statusCode = 500;
        if (error.message === 'Admin profil nem törölhető.') statusCode = 403;
        else if (error.message === 'A felhasználó nem található.') statusCode = 404;
        else if (error.message === 'A jelenlegi jelszó hibás.') statusCode = 401;
        payload.message = error.message || 'Szerverhiba a profil törlése közben.';
    }
    return response.status(statusCode).json(payload);
});

router.post('/profile/upload-image', profileImageUploadLimiter, isAuthenticated, requireVerifiedEmail, (request, response) => {
    profileImageUpload.single('image')(request, response, async (uploadError) => {
        let statusCode = 200;
        let payload = { success: false, message: '' };
        let uploadedPath = null;
        try {
            if (uploadError) {
                if (uploadError.code === 'LIMIT_FILE_SIZE') {
                    statusCode = 400;
                    throw new Error('A kép mérete legfeljebb 3 MB lehet.');
                }

                statusCode = 400;
                throw new Error(uploadError.message || 'A képfeltöltés sikertelen.');
            }

            if (!request.file) {
                statusCode = 400;
                throw new Error('A kép kiválasztása kötelező.');
            }

            uploadedPath = `/profile_pictures/${request.file.filename}`;
            const uploadResult = await sql.uploadProfileImage(request.session.userId, uploadedPath);
            request.session.profile_image = uploadResult.profileImage;
            request.session.profile_image_status = uploadResult.status;
            await saveSessionAsync(request, 'Hiba a profilkép feltöltése utáni session mentésekor.');

            await logAuthenticatedAction(request, request.session.userId, {
                eventType: 'profile_image_upload',
                eventCategory: 'profile',
                severity: 'info',
                source: 'backend',
                success: true,
                message: 'Új profilkép feltöltve, elbírálásra vár.',
                metadata: { filename: uploadedPath, status: uploadResult.status }
            });

            payload = {
                success: true,
                message: 'A profilkép sikeresen feltöltve, elbírálásra vár.',
                profile_image: uploadResult.profileImage,
                profile_image_status: uploadResult.status
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
        }
        return response.status(statusCode).json(payload);
    });
});

// Bejelentkezett user per-mode ELO értékei — minden mode-ra a megfelelő oszlopból.
router.get('/profile/elo-by-mode', isAuthenticated, async (request, response) => {
    try {
        const { getPool } = require('../../sql/database.js');
        const pool = getPool();
        const userId = request.session.userId;

        const [rows] = await pool.execute(
            `SELECT elo, elo_mattmester, elo_classical, elo_blitz FROM users WHERE id = ?`,
            [userId]
        );
        if (!rows[0]) {
            return response.status(404).json({ success: false, message: 'Felhasználó nem található.' });
        }
        const r = rows[0];
        return response.status(200).json({
            success: true,
            elo: {
                mattmester: r.elo_mattmester ?? r.elo,
                classical:  r.elo_classical  ?? r.elo,
                blitz:      r.elo_blitz      ?? r.elo
            }
        });
    } catch (error) {
        console.error('[profile/elo-by-mode] hiba:', error);
        return response.status(500).json({ success: false, message: 'Szerverhiba az ELO lekérdezésekor.' });
    }
});

// Bejelentkezett user képesség-használati statisztikája — ability_log + abilities join.
// Visszaad: [{ key, displayName, count }] minden lehetséges ability-re (count=0 ha sosem használt).
router.get('/profile/abilities-usage', isAuthenticated, async (request, response) => {
    try {
        const { getPool } = require('../../sql/database.js');
        const pool = getPool();
        const userId = request.session.userId;

        // Összes ability + a userhez tartozó használat (LEFT JOIN, hogy nem-használt is megjelenjen)
        const [rows] = await pool.execute(
            `SELECT a.name AS \`key\`, a.description, COALESCE(cnt.db, 0) AS db
             FROM abilities a
             LEFT JOIN (
                 SELECT ability_id, COUNT(*) AS db
                 FROM ability_log
                 WHERE player_id = ?
                 GROUP BY ability_id
             ) cnt ON cnt.ability_id = a.id
             ORDER BY a.id ASC`,
            [userId]
        );

        const DISPLAY = {
            time_pause: { name: 'Időmegállítás',  icon: 'timer' },
            freeze:     { name: 'Bábu fagyasztás', icon: 'snowflake' },
            swap:       { name: 'Bábucsere',       icon: 'shuffle' },
            board_hide: { name: 'Tábla eltakar',   icon: 'eye-off' },
            shield:     { name: 'Pajzs',           icon: 'shield' },
            time_steal: { name: 'Időlopás',        icon: 'hourglass' }
        };

        const items = rows.map(r => ({
            key: r.key,
            name: DISPLAY[r.key]?.name || r.key,
            icon: DISPLAY[r.key]?.icon || 'zap',
            description: r.description || '',
            count: Number(r.db) || 0
        }));

        return response.status(200).json({ success: true, abilities: items });
    } catch (error) {
        console.error('[profile/abilities-usage] hiba:', error);
        return response.status(500).json({ success: false, message: 'Szerverhiba a statisztika lekérdezésekor.' });
    }
});

router.post('/profile/remove-image', profileImageRemoveLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const removeResult = await sql.resetUserProfileImageToDefault(request.session.userId);
        request.session.profile_image = removeResult.profileImage;
        request.session.profile_image_status = removeResult.profileImageStatus;
        await saveSessionAsync(request, 'Hiba a profilkép eltávolítása utáni session mentésekor.');

        await logAuthenticatedAction(request, request.session.userId, {
            eventType: 'profile_image_remove',
            eventCategory: 'profile',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Profilkép visszaállítva az alapértelmezett képre.'
        });

        payload = {
            success: true,
            message: 'A profilkép visszaállítva az alapértelmezett képre.',
            profile_image: removeResult.profileImage,
            profile_image_status: removeResult.profileImageStatus
        };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        if (error.message === 'A felhasználó nem található.') statusCode = 404;
        payload = { success: false, message: error.message || 'Szerverhiba a profilkép eltávolítása közben.' };
    }
    return response.status(statusCode).json(payload);
});

module.exports = router;
