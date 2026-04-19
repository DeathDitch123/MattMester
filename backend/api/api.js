const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt'); //?npm install bcrypt
const sql = require('../sql/sql_funtions.js');
const fs = require('fs/promises');
const { leaderboardService } = require('../services.js');
const { usernameRegex, emailRegex, passwordRegex } = require('./validation.js');
const { validateChatRateLimitOrThrow: validateRateLimit, writeChatSecurityAudit } = require('./chatUtils.js');

//!Multer
const multer = require('multer'); //?npm install multer
const path = require('path');
const { isAdmin, isAuthenticated } = require('./funtions.js');

const PROFILE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const CHAT_RATE_LIMIT_MAX_MESSAGES = 5;
const CHAT_RATE_LIMIT_WINDOW_MS = 10 * 1000;
const CHAT_BLACKLIST_POLICY = String(process.env.CHAT_BLACKLIST_POLICY || 'hard_block').trim().toLowerCase();
const chatRateLimitByUserId = new Map();

function getRequestIpAddress(request) {
    return request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'ismeretlen';
}

function saveSessionAsync(request, errorMessage) {
    return new Promise((resolve, reject) => {
        request.session.save((err) => {
            if (err) {
                console.error('Session mentési hiba:', err);
                reject(new Error(errorMessage));
            } else {
                resolve();
            }
        });
    });
}

function destroySessionAsync(request, errorMessage) {
    return new Promise((resolve, reject) => {
        request.session.destroy((err) => {
            if (err) {
                console.error('Session destroy hiba:', err);
                reject(new Error(errorMessage));
            } else {
                resolve();
            }
        });
    });
}

const storage = multer.diskStorage({
    destination: (request, file, callback) => {
        callback(null, path.join(__dirname, '../profile_pictures'));
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

router.get('/test', isAdmin, (request, response) => {
    response.status(200).json({
        message: 'Ez a végpont működik.'
    });
});
// ?POST /api/login - felhasználó azonosítása és session-be mentése
router.post('/login', async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const { usernameOrMail, password, remember } = request.body;
        if (!usernameOrMail || !password) {
            statusCode = 400;
            throw new Error('Nincs megadva username/email vagy jelszó');
        }

        let user = await sql.getUserByUsername(usernameOrMail);
        if (!user) user = await sql.getUserByEmail(usernameOrMail);
        if (!user) {
            statusCode = 401;
            throw new Error('Hibás felhasználónév, emailcím vagy jelszó.');
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            statusCode = 401;
            throw new Error('Hibás felhasználónév, emailcím vagy jelszó.');
        }

        request.session.userId = user.id;
        request.session.username = user.username;
        request.session.role = user.role;
        request.session.elo = user.elo;
        request.session.elo_MM = user.elo_MM;
        request.session.elo_bullet = user.elo_bullet;
        request.session.profile_image = user.profile_image || '/profile_pictures/default.png';
        request.session.profile_image_status = user.profile_image_status || 'default';
        request.session.cookie.maxAge = remember ? 1000 * 60 * 60 * 24 * 7 : null;

        const ipAddress = getRequestIpAddress(request);
        const userAgent = request.headers['user-agent'] || 'Ismeretlen';
        console.log(`Bejelentkezés: ${user.username} - IP: ${ipAddress}`);
        console.log(`User Agent: ${userAgent}`);

        await saveSessionAsync(request, 'Hiba a munkamenet mentésekor.');

        try {
            await sql.insertUserLog(user.id, {
                eventType: 'login',
                eventCategory: 'auth',
                severity: 'info',
                source: 'backend',
                success: true,
                message: 'Sikeres bejelentkezés.',
                ipAddress,
                userAgent,
                metadata: { ipAddress, userAgent, remember: Boolean(remember) }
            });
        } catch (logError) {
            console.warn('Login log hiba:', logError.message);
        }

        payload = {
            success: true,
            message: 'Sikeres bejelentkezés.',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                elo: user.elo,
                elo_MM: user.elo_MM,
                elo_bullet: user.elo_bullet
            }
        };
    } catch (error) {
        console.error('Login hiba:', error);
        if (statusCode === 200) statusCode = 500;
        payload.message = error.message;
    }
    response.status(statusCode).json(payload);
});
// ?GET /api/logout - session lezárása és cookie törlése
const logoutHandler = async (request, response) => {
    let statusCode = 200;
    let payload = { success: true, message: 'Nincs aktív session.' };
    try {
        if (request.session?.userId) {
            const logoutUserId = request.session.userId;
            const ipAddress = getRequestIpAddress(request);
            const userAgent = request.headers['user-agent'] || 'Ismeretlen';

            await destroySessionAsync(request, 'Sikertelen kijelentkezés.');
            response.clearCookie('connect.sid');
            console.log('Session sikeresen megsemmisítve.');
            payload.message = 'Sikeres kijelentkezés.';

            try {
                await sql.insertUserLog(logoutUserId, {
                    eventType: 'logout',
                    eventCategory: 'auth',
                    severity: 'info',
                    source: 'backend',
                    success: true,
                    message: 'Sikeres kijelentkezés.',
                    ipAddress,
                    userAgent,
                    metadata: { ipAddress, userAgent }
                });
            } catch (logError) {
                console.warn('Logout log hiba:', logError.message);
            }
        }
    } catch (error) {
        console.error('Logout hiba:', error);
        statusCode = 500;
        payload = { success: false, message: error.message };
    }
    response.status(statusCode).json(payload);
};
router.get('/logout', logoutHandler);
router.post('/logout', logoutHandler);
// ?POST /api/register - új felhasználó regisztrációja
router.post('/register', async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const { username, password, email } = request.body;
        if (!username || !password || !email) {
            statusCode = 400;
            throw new Error('Minden mező kitöltése kötelező.');
        }

        if (!emailRegex.test(email)) {
            statusCode = 400;
            throw new Error('Érvénytelen email cím formátum!');
        }

        if (username.length < 3 || username.length > 50) {
            statusCode = 400;
            throw new Error('A felhasználónévnek 3 és 50 karakter között kell lennie!');
        }

        if (!usernameRegex.test(username)) {
            statusCode = 400;
            throw new Error('A felhasználónév csak alfanumerikus karaktereket, pontot, aláhúzást és kötőjelet tartalmazhat!');
        }

        if (password.includes('\\')) {
            statusCode = 400;
            throw new Error('A jelszó nem megengedett karaktert tartalmaz!');
        }

        if (password.length < 8) {
            statusCode = 400;
            throw new Error('A jelszónak legalább 8 karakter hosszúnak kell lennie!');
        }

        if (!passwordRegex.test(password)) {
            statusCode = 400;
            throw new Error('A jelszónak tartalmaznia kell legalább egy nagybetűt, egy kisbetűt és egy számot!');
        }

        if (await sql.getUserByEmail(email)) {
            statusCode = 409;
            throw new Error('Az email cím már foglalt!');
        }

        if (await sql.getUserByUsername(username)) {
            statusCode = 409;
            throw new Error('A felhasználónév már foglalt!');
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = await sql.insertUser(username, passwordHash, email);

        request.session.userId = result.insertId;
        request.session.username = username;
        request.session.role = 'player';
        request.session.elo = 800;
        request.session.elo_MM = 800;
        request.session.elo_bullet = 800;
        request.session.profile_image = '/profile_pictures/default.png';
        request.session.profile_image_status = 'default';
        request.session.cookie.maxAge = null;

        const ipAddress = getRequestIpAddress(request);
        const userAgent = request.headers['user-agent'] || 'Ismeretlen';
        console.log(`Új regisztráció: ${username} (${email}) - IP: ${ipAddress}`);
        console.log(`User Agent: ${userAgent}`);

        statusCode = 201;
        await saveSessionAsync(request, 'Sikertelen regisztráció.');
        console.log('Session sikeresen mentve a regisztráció után.');

        try {
            await sql.insertUserLog(result.insertId, {
                eventType: 'register',
                eventCategory: 'auth',
                severity: 'info',
                source: 'backend',
                success: true,
                message: 'Sikeres regisztráció.',
                ipAddress,
                userAgent,
                metadata: { ipAddress, userAgent }
            });
        } catch (logError) {
            console.warn('Register log hiba:', logError.message);
        }

        payload = {
            success: true,
            message: 'Sikeres regisztráció',
            user: {
                id: result.insertId,
                username,
                email,
                role: 'player',
                elo: 800,
                elo_MM: 800,
                elo_bullet: 800
            }
        };
    } catch (error) {
        console.error('Regisztrációs hiba:', error);
        if (statusCode === 200) statusCode = 500;
        payload.message = error.message;
    }
    response.status(statusCode).json(payload);
});
// ?GET /api/sessioninfo - aktuális session információk lekérdezése
router.get('/sessionInfo', async (request, response) => {
    let statusCode = 200;
    let result = { success: true, loggedIn: false, user: null };
    try {
        if (request.session?.userId) {
            const dbUser = await sql.getSessionUserById(request.session.userId);

            if (!dbUser) {
                request.session.destroy(() => {
                    console.log('Session megsemmisítve, mert a hozzá tartozó felhasználó nem található.');
                });
            } else {
                // Csak a hasznalt auth mezoket frissitjuk, nem irjuk felul a teljes session objektumot.
                request.session.userId = dbUser.id;
                request.session.username = dbUser.username;
                request.session.role = dbUser.role;
                request.session.elo = dbUser.elo;
                request.session.profile_image = dbUser.profile_image || '/profile_pictures/default.png';
                request.session.profile_image_status = dbUser.profile_image_status || 'default';

                result.loggedIn = true;
                result.user = {
                    id: dbUser.id,
                    username: dbUser.username,
                    email: dbUser.email,
                    profile_image: dbUser.profile_image,
                    profile_image_status: dbUser.profile_image_status,
                    role: dbUser.role,
                    elo: dbUser.elo,
                    elo_MM: dbUser.elo_MM,
                    elo_bullet: dbUser.elo_bullet,
                    is_banned: dbUser.is_banned,
                    ban_reason: dbUser.ban_reason,
                    banned_until: dbUser.banned_until,
                    last_active: dbUser.last_active,
                    is_email_verified: dbUser.is_email_verified,
                    created_at: dbUser.created_at,
                    stats: {
                        wins: dbUser.wins,
                        losses: dbUser.losses,
                        draws: dbUser.draws,
                        abilities_used: dbUser.abilities_used
                    },
                    session: {
                        maxAge: request.session.cookie.maxAge,
                        expires: request.session.cookie.expires,
                        secure: request.session.cookie.secure,
                        httpOnly: request.session.cookie.httpOnly,
                        sameSite: request.session.cookie.sameSite
                    }
                };
            }
        }
    } catch (error) {
        console.error('Session info hiba:', error);
        statusCode = 500;
        result = {
            success: false,
            loggedIn: false,
            user: null,
            message: 'Szerverhiba a session információ lekérdezése során.'
        };
    }
    response.status(statusCode).json(result);
});

router.post('/profile/verify-current-password', isAuthenticated, async (request, response) => {
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
                }
            }
        }

    } catch (error) {
        console.error('Current password verify hiba:', error);
        statusCode = 500;
        result = { success: false, valid: false, message: 'Szerverhiba az ellenőrzés során.' };
    }
    response.status(statusCode).json(result);
});

router.post('/profile/settings', isAuthenticated, async (request, response) => {
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

        try {
            await sql.insertUserLog(request.session.userId, {
                eventType: 'profile_settings_update',
                eventCategory: 'profile',
                severity: 'info',
                source: 'backend',
                success: true,
                message: 'Profil beállítások frissítve.',
                metadata: {
                    changedFields
                }
            });
        } catch (logError) {
            console.warn('Profile settings log hiba:', logError.message);
        }

        payload = {
            success: true,
            message: 'A profil beállítások sikeresen frissültek.',
            changedFields
        };
    } catch (error) {
        console.error('Profile settings hiba:', error);
        if (statusCode === 200) statusCode = 500;
        if (error?.code === 'ER_DUP_ENTRY' || error.message?.includes('foglalt')) statusCode = 409;
        payload = { success: false, message: error.message || 'Szerverhiba a profil beállítások mentése közben.' };
    }
    response.status(statusCode).json(payload);
});

router.post('/profile/delete', isAuthenticated, async (request, response) => {
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
    response.status(statusCode).json(payload);
});

router.post('/profile/upload-image', isAuthenticated, (request, response) => {
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

            try {
                await sql.insertUserLog(request.session.userId, {
                    eventType: 'profile_image_upload',
                    eventCategory: 'profile',
                    severity: 'info',
                    source: 'backend',
                    success: true,
                    message: 'Új profilkép feltöltve, elbírálásra vár.',
                    metadata: { filename: uploadedPath, status: uploadResult.status }
                });
            } catch (logError) {
                console.warn('Profile image upload log hiba:', logError.message);
            }

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
                    await fs.unlink(path.join(__dirname, '..', relativeUploadedPath));
                } catch (deleteError) {
                    console.warn('Feltöltött kép törlése nem sikerült:', deleteError.message);
                }
            }
            if (statusCode === 200) statusCode = 500;
            payload = { success: false, message: error.message || 'Szerverhiba a képfeltöltés közben.' };
        }
        response.status(statusCode).json(payload);
    });
});

router.post('/profile/remove-image', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const removeResult = await sql.resetUserProfileImageToDefault(request.session.userId);
        request.session.profile_image = removeResult.profileImage;
        request.session.profile_image_status = removeResult.profileImageStatus;
        await saveSessionAsync(request, 'Hiba a profilkép eltávolítása utáni session mentésekor.');

        try {
            await sql.insertUserLog(request.session.userId, {
                eventType: 'profile_image_remove',
                eventCategory: 'profile',
                severity: 'info',
                source: 'backend',
                success: true,
                message: 'Profilkép visszaállítva az alapértelmezett képre.'
            });
        } catch (logError) {
            console.warn('Profile image remove log hiba:', logError.message);
        }

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
    response.status(statusCode).json(payload);
});

router.get('/security/activity', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, data: [], message: '' };
    try {
        const userId = Number(request.session?.userId) || 0;
        const rawLimit = Number(request.query?.limit) || 100;
        const limit = Math.min(Math.max(rawLimit, 1), 200);
        const data = await sql.getUserSecurityActivity(userId, limit);
        payload = {
            success: true,
            data,
            message: data.length ? `${data.length} esemény betöltve.` : 'Nincs megjeleníthető biztonsági esemény.'
        };
    } catch (error) {
        console.error('Security activity hiba:', error);
        statusCode = 500;
        payload = { success: false, data: [], message: error.message || 'Szerverhiba a biztonsági napló lekérése során.' };
    }
    response.status(statusCode).json(payload);
});

router.post('/security/logout-all-devices', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const userId = request.session.userId;
        const ipAddress = getRequestIpAddress(request);
        const userAgent = request.headers['user-agent'] || 'Ismeretlen';
        const store = request.sessionStore;

        if (!store || typeof store.all !== 'function' || typeof store.destroy !== 'function') {
            statusCode = 500;
            throw new Error('A munkamenet tároló nem támogatja az összes eszközről való kijelentkezést.');
        }

        const allSessions = await new Promise((resolve, reject) => {
            store.all((err, sessions) => {
                if (err) return reject(err);
                resolve(sessions || {});
            });
        });

        const entries = Array.isArray(allSessions)
            ? allSessions.map((sess) => [sess && sess.id, sess])
            : Object.entries(allSessions);

        let destroyedCount = 0;
        for (const [sid, sess] of entries) {
            if (!sid || !sess) continue;
            const sessUserId = sess.userId || sess.session?.userId;
            if (sessUserId === userId) {
                await new Promise((resolve) => {
                    store.destroy(sid, () => resolve());
                });
                destroyedCount += 1;
            }
        }

        try {
            await sql.insertUserLog(userId, {
                eventType: 'logout_all_devices',
                eventCategory: 'security',
                severity: 'warning',
                source: 'backend',
                success: true,
                message: `Kijelentkezés minden eszközről (${destroyedCount} munkamenet).`,
                ipAddress,
                userAgent,
                metadata: { ipAddress, userAgent, destroyedSessions: destroyedCount }
            });
        } catch (logError) {
            console.warn('Logout all devices log hiba:', logError.message);
        }

        response.clearCookie('connect.sid');

        payload = {
            success: true,
            destroyedSessions: destroyedCount,
            message: `Minden eszközről sikeresen kijelentkeztünk (${destroyedCount} munkamenet).`
        };
    } catch (error) {
        console.error('Logout all devices hiba:', error);
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba az összes eszközről való kijelentkezés során.' };
    }
    response.status(statusCode).json(payload);
});

router.get('/leaderboard', async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        payload = { success: true, data: leaderboardService.getLeaderBoard() };
    } catch (error) {
        console.error('Leaderboard hiba:', error);
        statusCode = 500;
        payload.message = 'Szerverhiba a ranglista lekérdezése során.';
    }
    response.status(statusCode).json(payload);
});
router.get('/searchPlayer', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const username = typeof request.query.username === 'string' ? request.query.username.trim() : '';

        if (!username) { statusCode = 400; throw new Error('A felhasználónév kötelező.'); }
        if (username.length < 3 || username.length > 50) { statusCode = 400; throw new Error('A felhasználónévnek 3 és 50 karakter között kell lennie.'); }
        if (!usernameRegex.test(username)) { statusCode = 400; throw new Error('A felhasználónév formátuma érvénytelen.'); }

        const currentUserId = Number(request.session?.userId) || 0;
        const users = await sql.searchUsersByUsernameContains(username, currentUserId);
        const data = (users || []).map((user) => ({
            userId: user.id,
            username: user.username,
            profileImage: user.profile_image || '/profile_pictures/default.png',
            profileImageStatus: user.profile_image_status || 'approved',
            friendStatus: user.friend_status || 'none'
        }));
        payload = {
            success: true,
            data,
            message: data.length ? `${data.length} találat` : 'Nincs találat a megadott keresésre.'
        };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a játékos keresése során.' };
    }
    response.status(statusCode).json(payload);
});

router.get('/players/:targetUserId/profile', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const targetUserId = Number(request.params?.targetUserId) || 0;
        if (!targetUserId) { statusCode = 400; throw new Error('Érvénytelen játékos azonosító.'); }

        const profile = await sql.getPublicPlayerProfileById(targetUserId);
        if (!profile) { statusCode = 404; throw new Error('A játékos nem található.'); }

        payload = {
            success: true,
            data: {
                userId: profile.id,
                username: profile.username,
                role: profile.role || 'player',
                profileImage: profile.profile_image || '/profile_pictures/default.png',
                profileImageStatus: profile.profile_image_status || 'approved',
                joinedAt: profile.created_at,
                lastActiveAt: profile.last_active,
                elo: profile.elo,
                eloMM: profile.elo_MM,
                eloBullet: profile.elo_bullet,
                wins: profile.wins,
                losses: profile.losses,
                draws: profile.draws,
                winRate: profile.winrate_percent
            }
        };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a játékos profil lekérése során.' };
    }
    response.status(statusCode).json(payload);
});

// ?POST /api/friends/add - barát kérelem küldése
router.post('/friends/add', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const { targetUserId } = request.body;

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!targetUserId || typeof targetUserId !== 'number') { statusCode = 400; throw new Error('Érvénytelen target user ID.'); }
        if (currentUserId === targetUserId) { statusCode = 400; throw new Error('Nem adhatsz hozzá magadat barátnak.'); }

        const result = await sql.addFriendRequest(currentUserId, targetUserId);
        payload = { success: true, message: result.message };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a barát kérelem küldése során.' };
    }
    response.status(statusCode).json(payload);
});

router.get('/friends/list', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const requestedStatus = String(request.query?.status || 'friend').trim().toLowerCase();
        const allowedStatuses = new Set(['all', 'pending', 'friend', 'blocked']);

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!allowedStatuses.has(requestedStatus)) { statusCode = 400; throw new Error('Érvénytelen státusz szűrő.'); }

        const data = await sql.getFriendListForUser(currentUserId, requestedStatus);
        payload = {
            success: true,
            data,
            filter: requestedStatus,
            message: data.length ? `${data.length} találat` : 'Nincs megjeleníthető kapcsolat a kiválasztott szűrőre.'
        };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a barát lista lekérése során.' };
    }
    response.status(statusCode).json(payload);
});

router.post('/friends/accept', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parsePositiveInteger(request.body?.targetUserId, null);

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!targetUserId) { statusCode = 400; throw new Error('Érvénytelen target user ID.'); }

        const result = await sql.acceptFriendRequest(currentUserId, targetUserId);
        payload = { success: true, message: result.message };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a barát kérelem elfogadása során.' };
    }
    response.status(statusCode).json(payload);
});

router.post('/friends/reject', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parsePositiveInteger(request.body?.targetUserId, null);

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!targetUserId) { statusCode = 400; throw new Error('Érvénytelen target user ID.'); }

        const result = await sql.rejectFriendRequest(currentUserId, targetUserId);
        payload = { success: true, message: result.message };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a barát kérelem elutasítása során.' };
    }
    response.status(statusCode).json(payload);
});

router.post('/friends/block', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parsePositiveInteger(request.body?.targetUserId, null);

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!targetUserId) { statusCode = 400; throw new Error('Érvénytelen target user ID.'); }
        if (currentUserId === targetUserId) { statusCode = 400; throw new Error('Nem tilthatod le saját magadat.'); }

        const result = await sql.blockUserDirectional(currentUserId, targetUserId);
        payload = { success: true, message: result.message };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a tiltás során.' };
    }
    response.status(statusCode).json(payload);
});

router.delete('/friends/unblock/:targetUserId', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parsePositiveInteger(request.params?.targetUserId, null);

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!targetUserId) { statusCode = 400; throw new Error('Érvénytelen target user ID.'); }

        const result = await sql.unblockUserDirectional(currentUserId, targetUserId);
        payload = { success: true, message: result.message };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a tiltás feloldása során.' };
    }
    response.status(statusCode).json(payload);
});

router.delete('/friends/:targetUserId', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parsePositiveInteger(request.params?.targetUserId, null);

        if (!currentUserId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasználó.'); }
        if (!targetUserId) { statusCode = 400; throw new Error('Érvénytelen target user ID.'); }

        const result = await sql.deleteFriendConnection(currentUserId, targetUserId);
        payload = { success: true, message: result.message };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a barát kapcsolat törlése során.' };
    }
    response.status(statusCode).json(payload);
});

function parsePositiveInteger(value, fallback = null) {
    const parsed = Number(value);
    let result = fallback;
    if (Number.isInteger(parsed) && parsed > 0) {
        result = parsed;
    }

    return result;
}

function parseChatListLimit(value, fallback = 30, min = 1, max = 50) {
    const parsed = parsePositiveInteger(value, fallback);
    let normalized = fallback;
    if (parsed) {
        normalized = Math.min(Math.max(parsed, min), max);
    }

    return normalized;
}

function getAuthenticatedUserIdOrThrow(request) {
    const currentUserId = Number(request.session?.userId) || 0;
    if (!currentUserId) {
        throw new Error('Nincs bejelentkezett felhasználó.');
    }

    return currentUserId;
}

function initChatRateLimiterCleanup() {
    const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 perc
    const MAX_TIMESTAMPS_PER_USER = 100;

    const cleanupInterval = setInterval(() => {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [userId, timestamps] of chatRateLimitByUserId.entries()) {
            const freshTimestamps = timestamps.filter(
                ts => now - ts < CHAT_RATE_LIMIT_WINDOW_MS
            );

            if (freshTimestamps.length === 0) {
                chatRateLimitByUserId.delete(userId);
                cleanedCount++;
            } else if (freshTimestamps.length > MAX_TIMESTAMPS_PER_USER) {
                const trimmed = freshTimestamps.slice(-MAX_TIMESTAMPS_PER_USER);
                chatRateLimitByUserId.set(userId, trimmed);
            } else {
                chatRateLimitByUserId.set(userId, freshTimestamps);
            }
        }

        if (cleanedCount > 0 || chatRateLimitByUserId.size > 0) {
            console.log(
                `[Chat Rate Limiter] Cleanup: ${cleanedCount} user(s) cleaned, ` +
                `${chatRateLimitByUserId.size} active user(s) remaining`
            );
        }
    }, CLEANUP_INTERVAL);

    // Graceful shutdown: stop cleanup on process exit
    process.on('exit', () => clearInterval(cleanupInterval));
}

function buildChatModerationPolicyResult(message) {
    const hasBlockedWord = sql.containsBlockedWord(message);
    const normalizedMessage = sql.normalizeTextForModeration(message);

    const policyResult = {
        blocked: false,
        isMasked: false,
        maskedMessage: null,
        containsBlockedWord: hasBlockedWord,
        policy: CHAT_BLACKLIST_POLICY,
        normalizedLength: normalizedMessage.length
    };

    if (hasBlockedWord) {
        if (CHAT_BLACKLIST_POLICY === 'soft_mask') {
            policyResult.isMasked = true;
            policyResult.maskedMessage = '***';
        } else {
            policyResult.blocked = true;
        }
    }

    return policyResult;
}

function resolveStatusCodeByError(error, defaultStatusCode = 500) {
    if (error?.statusCode) return error.statusCode;
    const message = String(error?.message || '').toLowerCase();
    let statusCode = defaultStatusCode;

    if (message.includes('nincs bejelentkezett')) {
        statusCode = 401;
    } else if (message.includes('túl sok üzenet')) {
        statusCode = 429;
    } else if (message.includes('érvénytelen') || message.includes('nem lehet üres') || message.includes('legfeljebb')) {
        statusCode = 400;
    } else if (message.includes('nem résztvevője') || message.includes('nem nyitható meg tiltás miatt')) {
        statusCode = 403;
    } else if (message.includes('nem található')) {
        statusCode = 404;
    }

    return statusCode;
}

router.get('/chat/conversations', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = {
        success: false,
        data: [],
        message: 'Szerverhiba a beszélgetések lekérése során.',
        cursor: null,
        hasMore: false
    };

    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);

        const limit = parseChatListLimit(request.query?.limit, 30, 1, 50);
        const cursor = parsePositiveInteger(request.query?.cursor, null);
        const result = await sql.getUserConversations(currentUserId, limit, cursor);

        payload = {
            success: true,
            data: result.data,
            message: result.data.length
                ? `${result.data.length} beszélgetés betöltve.`
                : 'Nincs beszélgetés.',
            cursor: result.nextCursor,
            hasMore: Boolean(result.hasMore)
        };
    } catch (error) {
        statusCode = resolveStatusCodeByError(error, 500);
        payload.message = error.message || payload.message;
    }

    return response.status(statusCode).json(payload);
});

router.get('/chat/conversations/:conversationId/messages', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = {
        success: false,
        data: [],
        message: 'Szerverhiba a beszélgetés üzeneteinek lekérése során.',
        beforeMessageId: null,
        cursor: null,
        hasMore: false
    };

    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);

        const conversationId = parsePositiveInteger(request.params?.conversationId, null);
        if (!conversationId) {
            throw new Error('Érvénytelen beszélgetés azonosító.');
        }

        const limit = parseChatListLimit(request.query?.limit, 30, 1, 50);
        const beforeMessageId = parsePositiveInteger(request.query?.beforeMessageId ?? request.query?.before, null);

        await sql.assertConversationParticipant(currentUserId, conversationId);
        const result = await sql.getConversationMessages(currentUserId, conversationId, beforeMessageId, limit);

        payload = {
            success: true,
            data: result.data,
            message: result.data.length
                ? `${result.data.length} üzenet betöltve.`
                : 'Nincs megjeleníthető üzenet.',
            beforeMessageId: result.nextCursor,
            cursor: result.nextCursor,
            hasMore: Boolean(result.hasMore)
        };
    } catch (error) {
        statusCode = resolveStatusCodeByError(error, 500);
        payload.message = error.message || payload.message;
    }

    return response.status(statusCode).json(payload);
});

router.post('/chat/conversations/:conversationId/messages', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = {
        success: false,
        data: null,
        message: 'Szerverhiba az üzenet küldése során.'
    };

    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);

        const conversationId = parsePositiveInteger(request.params?.conversationId, null);
        if (!conversationId) {
            throw new Error('Érvénytelen beszélgetés azonosító.');
        }

        const message = String(request.body?.message || '').trim();
        if (!message) {
            throw new Error('Az üzenet nem lehet üres.');
        }

        if (message.length > 1000) {
            throw new Error('Az üzenet legfeljebb 1000 karakter lehet.');
        }

        await sql.assertConversationParticipant(currentUserId, conversationId);
        validateRateLimit(chatRateLimitByUserId, currentUserId, CHAT_RATE_LIMIT_MAX_MESSAGES, CHAT_RATE_LIMIT_WINDOW_MS);

        const policyResult = buildChatModerationPolicyResult(message);

        if (policyResult.containsBlockedWord) {
            await writeChatSecurityAudit(currentUserId, 'chat_blocked_word', conversationId, {
                success: !policyResult.blocked,
                severity: policyResult.blocked ? 'warning' : 'info',
                message: policyResult.blocked
                    ? 'Tiltott szó miatt blokkolt chat üzenet.'
                    : 'Tiltott szó miatt maszkolt chat üzenet.',
                metadata: {
                    policy: policyResult.policy,
                    masked: policyResult.isMasked,
                    blocked: policyResult.blocked
                }
            });
        }

        if (policyResult.blocked) {
            throw new Error('Az üzenet tiltott kifejezést tartalmaz.');
        }

        const data = await sql.insertMessageInConversation(currentUserId, conversationId, message, policyResult);
        payload = {
            success: true,
            data,
            message: 'Üzenet elküldve.'
        };
    } catch (error) {
        const isRateLimited = String(error?.message || '').toLowerCase().includes('túl sok üzenet');

        if (isRateLimited) {
            const conversationId = parsePositiveInteger(request.params?.conversationId, null);
            const currentUserId = parsePositiveInteger(request.session?.userId, 0);
            await writeChatSecurityAudit(currentUserId, 'chat_rate_limited', conversationId, {
                success: false,
                severity: 'warning',
                message: 'Chat üzenetküldés rate limit miatt blokkolva.',
                metadata: {
                    limit: CHAT_RATE_LIMIT_MAX_MESSAGES,
                    windowMs: CHAT_RATE_LIMIT_WINDOW_MS
                }
            });
        }

        statusCode = resolveStatusCodeByError(error, 500);
        payload.message = error.message || payload.message;
    }

    return response.status(statusCode).json(payload);
});

router.post('/chat/conversations/direct', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = {
        success: false,
        data: null,
        message: 'Szerverhiba a privát beszélgetés megnyitása során.'
    };

    try {
        const currentUserId = getAuthenticatedUserIdOrThrow(request);

        const targetUserId = parsePositiveInteger(request.body?.targetUserId, null);
        if (!targetUserId) {
            throw new Error('Érvénytelen target user ID.');
        }

        if (currentUserId === targetUserId) {
            const selfErr = new Error('Önmagaddal nem nyithatsz privát beszélgetést.');
            selfErr.statusCode = 400;
            throw selfErr;
        }

        const openResult = await sql.createOrGetDirectConversation(currentUserId, targetUserId);
        await sql.assertConversationParticipant(currentUserId, openResult.conversationId);

        payload = {
            success: true,
            data: {
                conversationId: openResult.conversationId,
                created: Boolean(openResult.created)
            },
            message: openResult.created
                ? 'Privát beszélgetés létrehozva.'
                : 'Privát beszélgetés megnyitva.'
        };
    } catch (error) {
        statusCode = resolveStatusCodeByError(error, 500);
        payload.message = error.message || payload.message;
    }

    return response.status(statusCode).json(payload);
});

module.exports = router;
module.exports.initChatRateLimiterCleanup = initChatRateLimiterCleanup;