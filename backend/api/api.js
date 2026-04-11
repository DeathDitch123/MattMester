const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt'); //?npm install bcrypt
const database = require('../sql/database.js');
const sql = require('../sql/sql_funtions.js');
const fs = require('fs/promises');
const { leaderboardService } = require('../services.js');

//!Multer
const multer = require('multer'); //?npm install multer
const path = require('path');
const { request } = require('http');
const { stat } = require('fs');
const { isAdmin, isAuthenticated } = require('./funtions.js');
const { profile } = require('console');

const PROFILE_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_PROFILE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function getRequestIpAddress(request) {
    return request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'ismeretlen';
}

function saveSessionAsync(request, errorMessage) {
    return new Promise((resolve, reject) => {
        request.session.save((err) => {
            if (err) {
                console.error('Session mentési hiba:', err);
                reject(new Error(errorMessage));
                return;
            }

            resolve();
        });
    });
}

function destroySessionAsync(request, errorMessage) {
    return new Promise((resolve, reject) => {
        request.session.destroy((err) => {
            if (err) {
                console.error('Session destroy hiba:', err);
                reject(new Error(errorMessage));
                return;
            }

            resolve();
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
            return;
        }

        callback(null, true);
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
    let currentUser = null;
    try {
        const { usernameOrMail, password, remember } = request.body;
        if (!usernameOrMail || !password) {
            statusCode = 400;
            throw new Error("Nincs megadva username/email vagy jelszó");
        }
        else {
            let user = await sql.getUserByUsername(usernameOrMail);
            if (!user) {
                user = await sql.getUserByEmail(usernameOrMail);
            }
            if (!user) {
                statusCode = 401;
                throw new Error('Hibás felhasználónév, emailcím vagy jelszó.');
            }
            else {
                const isMatch = await bcrypt.compare(password, user.password_hash);
                if (!isMatch) {
                    statusCode = 401;
                    throw new Error('Hibás felhasználónév, emailcím vagy jelszó.');
                }
                else {
                    currentUser = user;

                    request.session.userId = user.id;
                    request.session.username = user.username;
                    request.session.role = user.role;
                    request.session.elo = user.elo;
                    request.session.elo_MM = user.elo_MM;
                    request.session.elo_bullet = user.elo_bullet;
                    request.session.profile_image = user.profile_image || '/profile_pictures/default.png';
                    request.session.profile_image_status = user.profile_image_status || 'default';
                    if (remember) {
                        request.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 7; // 7 nap
                    } else {
                        request.session.cookie.maxAge = null; // session cookie (böngésző bezárásáig)
                    }
                    const ipAdress = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
                    console.log(`Bejelentkezés: ${user.username} - IP: ${ipAdress}`);
                    const userAgent = request.headers['user-agent'] || 'Ismeretlen';
                    console.log(`User Agent: ${userAgent}`);

                    await sql.logLoginAttempt(user.id, ipAdress, userAgent);

                    await new Promise((resolve, reject) => {
                        request.session.save((err) => {
                            if (err) {
                                console.error('Session mentési hiba:', err);
                                return reject(new Error('Hiba a munkamenet mentésekor.'));
                            }
                            resolve();
                        });
                    });

                    return response.status(statusCode).json({
                        success: true,
                        message: 'Sikeres bejelentkezés.',
                        user: {
                            id: currentUser.id,
                            username: currentUser.username,
                            email: currentUser.email,
                            role: currentUser.role,
                            elo: currentUser.elo,
                            elo_MM: currentUser.elo_MM,
                            elo_bullet: currentUser.elo_bullet
                        },
                    });
                }
            }
        }
    } catch (error) {
        console.error('Login hiba:', error);
        const finalStatusCode = statusCode === 200 ? 500 : statusCode;
        return response.status(finalStatusCode).json({ success: false, message: error.message });
    }
});
// ?GET /api/logout - session lezárása és cookie törlése
const logoutHandler = async (request, response) => {
    let statusCode = 200;
    let message = 'Sikeres kijelentkezés.';

    try {
        if (!request.session || !request.session.userId) {
            message = 'Nincs aktív session.';
        }
        else {
            await new Promise((resolve, reject) => {
                request.session.destroy(err => {
                    if (err) {
                        console.error('Session destroy hiba:', err);
                        statusCode = 500;
                        message = 'Sikertelen kijelentkezés.';
                        resolve(); // Akkor is resolve, hogy a try folytatódjon a beállított adatokkal
                    } else {
                        console.log('Session sikeresen megsemmisítve.');
                        response.clearCookie('connect.sid');
                        resolve();
                    }
                });
            });
        }
        response.status(statusCode).json({ success: statusCode < 400, message });
    } catch (error) {
        console.error('Logout hiba:', error);
        return response.status(500).json({ success: false, message: 'Szerverhiba a kijelentkezés során.' });
    }
};
router.get('/logout', logoutHandler);
router.post('/logout', logoutHandler);
// ?POST /api/register - új felhasználó regisztrációja
router.post('/register', async (request, response) => {
    let statusCode = 200;
    try {
        const { username, password, email } = request.body;
        if (!username || !password || !email) {
            statusCode = 400;
            throw new Error('Minden mező kitöltése kötelező.');
        }
        else {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                statusCode = 400;
                throw new Error('Érvénytelen email cím formátum!');
            }
            else {
                if (username.length < 3 || username.length > 50) {
                    statusCode = 400;
                    throw new Error('A felhasználónévnek 3 és 50 karakter között kell lennie!');
                }
                else {
                    const usernameRegex = /^[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ0-9._-]+$/;
                    if (!usernameRegex.test(username)) {
                        statusCode = 400;
                        throw new Error('A felhasználónév csak alfanumerikus karaktereket, pontot, aláhúzást és kötőjelet tartalmazhat!');
                    }
                    else {
                        if (password.includes("\\")) {
                            statusCode = 400;
                            throw new Error('A jelszó nem megengedett karaktert tartalmaz!');
                        }
                        else {
                            if (password.length < 8) {
                                statusCode = 400;
                                throw new Error('A jelszónak legalább 8 karakter hosszúnak kell lennie!');
                            }
                            else {
                                const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
                                if (!passwordRegex.test(password)) {
                                    statusCode = 400;
                                    throw new Error('A jelszónak tartalmaznia kell legalább egy nagybetűt, egy kisbetűt és egy számot!');
                                }
                                else {
                                    let existingUserByEmail = await sql.getUserByEmail(email);
                                    if (existingUserByEmail) {
                                        statusCode = 409;
                                        throw new Error('Az email cím már foglalt!');
                                    }
                                    else {
                                        let existingUserByUsername = await sql.getUserByUsername(username);
                                        if (existingUserByUsername) {
                                            statusCode = 409;
                                            throw new Error('A felhasználónév már foglalt!');
                                        }
                                        else {
                                            const saltRounds = 10;
                                            const passwordHash = await bcrypt.hash(password, saltRounds);
                                            const result = await sql.insertUser(username, passwordHash, email);

                                            request.session.userId = result.insertId;
                                            request.session.username = username;
                                            request.session.role = 'player';
                                            request.session.elo = 800;
                                            request.session.elo_MM = 800;
                                            request.session.elo_bullet = 800;
                                            request.session.profile_image = '/profile_pictures/default.png';
                                            request.session.profile_image_status = 'default';
                                            request.session.cookie.maxAge = null; // session cookie (böngésző bezárásáig)

                                            const ipAdress = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
                                            console.log(`Új regisztráció: ${username} (${email}) - IP: ${ipAdress}`);
                                            const userAgent = request.headers['user-agent'] || 'Ismeretlen';
                                            console.log(`User Agent: ${userAgent}`);

                                            statusCode = 201;

                                            await new Promise((resolve, reject) => {
                                                request.session.save((err) => {
                                                    if (err) {
                                                        console.error('Session mentési hiba:', err);
                                                        return reject(new Error('Sikertelen regisztráció.'));
                                                    }
                                                    resolve();
                                                });
                                            });

                                            console.log('Session sikeresen mentése a regisztráció után.');
                                            await sql.logLoginAttempt(result.insertId, ipAdress, userAgent);
                                            return response.status(statusCode).json({
                                                success: true,
                                                message: 'Sikeres regisztráció',
                                                user: {
                                                    id: result.insertId,
                                                    username,
                                                    email,
                                                    role: 'player',
                                                    elo: 1200,
                                                    elo_MM: 1200,
                                                    elo_bullet: 1200
                                                },
                                            });

                                        }
                                    }

                                }
                            }
                        }
                    }
                }
            }
        }


    } catch (error) {
        console.error('Regisztrációs hiba:', error);
        const FinalStatusCode = statusCode === 200 ? 500 : statusCode;
        return response.status(FinalStatusCode).json({ success: false, message: error.message });
    }
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

        return response.status(statusCode).json(result);
    } catch (error) {
        console.error('Session info hiba:', error);
        statusCode = 500;
        result = {
            success: false,
            loggedIn: false,
            user: null,
            message: 'Szerverhiba a session információ lekérdezése során.'
        };
        return response.status(statusCode).json(result);
    }
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

        return response.status(statusCode).json(result);
    } catch (error) {
        console.error('Current password verify hiba:', error);
        return response.status(500).json({ success: false, valid: false, message: 'Szerverhiba az ellenőrzés során.' });
    }
});

router.post('/profile/settings', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    try {
        const usernameRegex = /^[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ0-9._-]+$/;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

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

        await new Promise((resolve, reject) => {
            request.session.save((error) => {
                if (error) {
                    return reject(error);
                }
                resolve();
            });
        });

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

        return response.status(statusCode).json({
            success: true,
            message: 'A profil beállítások sikeresen frissültek.',
            changedFields
        });
    } catch (error) {
        console.error('Profile settings hiba:', error);

        if (statusCode === 200) {
            statusCode = 500;
        }

        if (error?.code === 'ER_DUP_ENTRY' || error.message?.includes('foglalt')) {
            statusCode = 409;
        }

        return response.status(statusCode).json({
            success: false,
            message: error.message || 'Szerverhiba a profil beállítások mentése közben.'
        });
    }
});

router.post('/profile/delete', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    try {
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
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

        await new Promise((resolve, reject) => {
            request.session.destroy((error) => {
                if (error) {
                    return reject(new Error(`Session törlési hiba profil törlés után: ${error.message}`));
                }
                response.clearCookie('connect.sid');
                resolve();
            });
        });

        return response.status(200).json({
            success: true,
            message: 'A profil sikeresen törölve lett.',
            userId: deleteResult.userId,
            username: deleteResult.username
        });
    } catch (error) {
        console.error('Profile delete hiba:', error);
        let responseMessage = error?.message || 'Szerverhiba a profil törlése közben.';

        if (statusCode === 200) {
            statusCode = 500;
        }

        if (error.message === 'Admin profil nem törölhető.' || error.message === 'Admin profil nem torolheto.') {
            statusCode = 403;
            responseMessage = 'Admin profil nem törölhető.';
        }

        if (error.message === 'A felhasználó nem található.' || error.message === 'A felhasznalo nem talalhato.') {
            statusCode = 404;
            responseMessage = 'A felhasználó nem található.';
        }

        if (error.message === 'A jelenlegi jelszó hibás.' || error.message === 'A jelenlegi jelszo hibas.') {
            statusCode = 401;
            responseMessage = 'A jelenlegi jelszó hibás.';
        }

        return response.status(statusCode).json({
            success: false,
            message: responseMessage
        });
    }
});

router.post('/profile/upload-image', isAuthenticated, (request, response) => {
    profileImageUpload.single('image')(request, response, async (uploadError) => {
        let statusCode = 200;
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

            return response.status(200).json({
                success: true,
                message: 'A profilkép sikeresen feltöltve, elbírálásra vár.',
                profile_image: uploadResult.profileImage,
                profile_image_status: uploadResult.status
            });
        } catch (error) {
            if (uploadedPath) {
                try {
                    const relativeUploadedPath = uploadedPath.replace(/^\//, '');
                    await fs.unlink(path.join(__dirname, '..', relativeUploadedPath));
                } catch (deleteError) {
                    console.warn('Feltöltött kép törlése nem sikerült:', deleteError.message);
                }
            }

            if (statusCode === 200) {
                statusCode = 500;
            }

            return response.status(statusCode).json({
                success: false,
                message: error.message || 'Szerverhiba a képfeltöltés közben.'
            });
        }
    });
});

router.post('/profile/remove-image', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    try {
        const removeResult = await sql.resetUserProfileImageToDefault(request.session.userId);
        request.session.profile_image = removeResult.profileImage;
        request.session.profile_image_status = removeResult.profileImageStatus;
        await saveSessionAsync(request, 'Hiba a profilkép eltávolítása utáni session mentésekor.');

        return response.status(200).json({
            success: true,
            message: 'A profilkép visszaállítva az alapértelmezett képre.',
            profile_image: removeResult.profileImage,
            profile_image_status: removeResult.profileImageStatus
        });
    } catch (error) {
        if (statusCode === 200) {
            statusCode = 500;
        }

        if (error.message === 'A felhasználó nem található.') {
            statusCode = 404;
        }

        return response.status(statusCode).json({
            success: false,
            message: error.message || 'Szerverhiba a profilkép eltávolítása közben.'
        });
    }
});

router.get('/leaderboard', async (request, response) => {
    try {
        const leaderboardData = leaderboardService.getLeaderBoard();
        return response.status(200).json({ success: true, data: leaderboardData });
    } catch (error) {
        console.error('Leaderboard hiba:', error);
        return response.status(500).json({ success: false, message: 'Szerverhiba a ranglista lekérdezése során.' });
    }
});
router.get('/searchPlayer', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    try {
        const usernameRegex = /^[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ0-9._-]+$/;
        const username = typeof request.query.username === 'string' ? request.query.username.trim() : '';

        if (!username) {
            statusCode = 400;
            throw new Error('A felhasználónév kötelező.');
        }

        if (username.length < 3 || username.length > 50) {
            statusCode = 400;
            throw new Error('A felhasználónévnek 3 és 50 karakter között kell lennie.');
        }

        if (!usernameRegex.test(username)) {
            statusCode = 400;
            throw new Error('A felhasználónév formátuma érvénytelen.');
        }

        const currentUserId = Number(request.session?.userId) || 0;
        const users = await sql.searchUsersByUsernameContains(username, currentUserId);
        const data = (users || []).map((user) => ({
            userId: user.id,
            username: user.username,
            profileImage: user.profile_image || '/profile_pictures/default.png',
            profileImageStatus: user.profile_image_status || 'approved',
            friendStatus: user.friend_status || 'none'
        }));

        return response.status(200).json({
            success: true,
            data,
            message: data.length
                ? `${data.length} találat`
                : 'Nincs találat a megadott keresésre.'
        });
    } catch (error) {
        if (statusCode === 200) {
            statusCode = 500;
        }

        return response.status(statusCode).json({
            success: false,
            message: error.message || 'Szerverhiba a játékos keresése során.'
        });
    }
});

router.get('/players/:targetUserId/profile', isAuthenticated, async (request, response) => {
    let statusCode = 200;

    try {
        const targetUserId = Number(request.params?.targetUserId) || 0;
        if (!targetUserId) {
            statusCode = 400;
            throw new Error('Érvénytelen játékos azonosító.');
        }

        const profile = await sql.getPublicPlayerProfileById(targetUserId);
        if (!profile) {
            statusCode = 404;
            throw new Error('A játékos nem található.');
        }

        return response.status(200).json({
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
        });
    } catch (error) {
        if (statusCode === 200) {
            statusCode = 500;
        }

        return response.status(statusCode).json({
            success: false,
            message: error.message || 'Szerverhiba a játékos profil lekérése során.'
        });
    }
});

// ?POST /api/friends/add - barát kérelem küldése
router.post('/friends/add', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const { targetUserId } = request.body;

        if (!currentUserId) {
            statusCode = 401;
            throw new Error('Nincs bejelentkezett felhasználó.');
        }

        if (!targetUserId || typeof targetUserId !== 'number') {
            statusCode = 400;
            throw new Error('Érvénytelen target user ID.');
        }

        if (currentUserId === targetUserId) {
            statusCode = 400;
            throw new Error('Nem adhatsz hozzá magadat barátnak.');
        }

        const result = await sql.addFriendRequest(currentUserId, targetUserId);
        
        return response.status(200).json({
            success: true,
            message: result.message
        });
    } catch (error) {
        if (statusCode === 200) {
            statusCode = 500;
        }

        return response.status(statusCode).json({
            success: false,
            message: error.message || 'Szerverhiba a barát kérelem küldése során.'
        });
    }
});

function parseTargetUserId(value) {
    const parsed = Number(value);
    let targetUserId = null;
    if (Number.isInteger(parsed) && parsed > 0) {
        targetUserId = parsed;
    }

    return targetUserId;
}

router.get('/friends/list', isAuthenticated, async (request, response) => {
    let statusCode = 200;

    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const requestedStatus = String(request.query?.status || 'friend').trim().toLowerCase();
        const allowedStatuses = new Set(['all', 'pending', 'friend', 'blocked']);

        if (!currentUserId) {
            statusCode = 401;
            throw new Error('Nincs bejelentkezett felhasználó.');
        }

        if (!allowedStatuses.has(requestedStatus)) {
            statusCode = 400;
            throw new Error('Érvénytelen státusz szűrő.');
        }

        const data = await sql.getFriendListForUser(currentUserId, requestedStatus);
        return response.status(200).json({
            success: true,
            data,
            filter: requestedStatus,
            message: data.length
                ? `${data.length} találat`
                : 'Nincs megjeleníthető kapcsolat a kiválasztott szűrőre.'
        });
    } catch (error) {
        if (statusCode === 200) {
            statusCode = 500;
        }

        return response.status(statusCode).json({
            success: false,
            message: error.message || 'Szerverhiba a barát lista lekérése során.'
        });
    }
});

router.post('/friends/accept', isAuthenticated, async (request, response) => {
    let statusCode = 200;

    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parseTargetUserId(request.body?.targetUserId);

        if (!currentUserId) {
            statusCode = 401;
            throw new Error('Nincs bejelentkezett felhasználó.');
        }

        if (!targetUserId) {
            statusCode = 400;
            throw new Error('Érvénytelen target user ID.');
        }

        const result = await sql.acceptFriendRequest(currentUserId, targetUserId);
        return response.status(200).json({
            success: true,
            message: result.message
        });
    } catch (error) {
        if (statusCode === 200) {
            statusCode = 500;
        }

        return response.status(statusCode).json({
            success: false,
            message: error.message || 'Szerverhiba a barát kérelem elfogadása során.'
        });
    }
});

router.post('/friends/reject', isAuthenticated, async (request, response) => {
    let statusCode = 200;

    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parseTargetUserId(request.body?.targetUserId);

        if (!currentUserId) {
            statusCode = 401;
            throw new Error('Nincs bejelentkezett felhasználó.');
        }

        if (!targetUserId) {
            statusCode = 400;
            throw new Error('Érvénytelen target user ID.');
        }

        const result = await sql.rejectFriendRequest(currentUserId, targetUserId);
        return response.status(200).json({
            success: true,
            message: result.message
        });
    } catch (error) {
        if (statusCode === 200) {
            statusCode = 500;
        }

        return response.status(statusCode).json({
            success: false,
            message: error.message || 'Szerverhiba a barát kérelem elutasítása során.'
        });
    }
});

router.post('/friends/block', isAuthenticated, async (request, response) => {
    let statusCode = 200;

    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parseTargetUserId(request.body?.targetUserId);

        if (!currentUserId) {
            statusCode = 401;
            throw new Error('Nincs bejelentkezett felhasználó.');
        }

        if (!targetUserId) {
            statusCode = 400;
            throw new Error('Érvénytelen target user ID.');
        }

        if (currentUserId === targetUserId) {
            statusCode = 400;
            throw new Error('Nem tilthatod le saját magadat.');
        }

        const result = await sql.blockUserDirectional(currentUserId, targetUserId);
        return response.status(200).json({
            success: true,
            message: result.message
        });
    } catch (error) {
        if (statusCode === 200) {
            statusCode = 500;
        }

        return response.status(statusCode).json({
            success: false,
            message: error.message || 'Szerverhiba a tiltás során.'
        });
    }
});

router.delete('/friends/unblock/:targetUserId', isAuthenticated, async (request, response) => {
    let statusCode = 200;

    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parseTargetUserId(request.params?.targetUserId);

        if (!currentUserId) {
            statusCode = 401;
            throw new Error('Nincs bejelentkezett felhasználó.');
        }

        if (!targetUserId) {
            statusCode = 400;
            throw new Error('Érvénytelen target user ID.');
        }

        const result = await sql.unblockUserDirectional(currentUserId, targetUserId);
        return response.status(200).json({
            success: true,
            message: result.message
        });
    } catch (error) {
        if (statusCode === 200) {
            statusCode = 500;
        }

        return response.status(statusCode).json({
            success: false,
            message: error.message || 'Szerverhiba a tiltás feloldása során.'
        });
    }
});

router.delete('/friends/:targetUserId', isAuthenticated, async (request, response) => {
    let statusCode = 200;

    try {
        const currentUserId = Number(request.session?.userId) || 0;
        const targetUserId = parseTargetUserId(request.params?.targetUserId);

        if (!currentUserId) {
            statusCode = 401;
            throw new Error('Nincs bejelentkezett felhasználó.');
        }

        if (!targetUserId) {
            statusCode = 400;
            throw new Error('Érvénytelen target user ID.');
        }

        const result = await sql.deleteFriendConnection(currentUserId, targetUserId);
        return response.status(200).json({
            success: true,
            message: result.message
        });
    } catch (error) {
        if (statusCode === 200) {
            statusCode = 500;
        }

        return response.status(statusCode).json({
            success: false,
            message: error.message || 'Szerverhiba a barát kapcsolat törlése során.'
        });
    }
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

function resolveStatusCodeByError(error, defaultStatusCode = 500) {
    const message = String(error?.message || '').toLowerCase();
    let statusCode = defaultStatusCode;

    if (message.includes('nincs bejelentkezett')) {
        statusCode = 401;
    } else if (message.includes('érvénytelen') || message.includes('ervenytelen') || message.includes('nem lehet üres') || message.includes('legfeljebb')) {
        statusCode = 400;
    } else if (message.includes('nem résztvevője') || message.includes('nem resztvevoje') || message.includes('nem nyitható meg tiltás miatt') || message.includes('nem nyithato meg tiltas miatt')) {
        statusCode = 403;
    } else if (message.includes('nem található') || message.includes('nem talalhato')) {
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
        const beforeMessageId = parsePositiveInteger(request.query?.before, null);

        await sql.assertConversationParticipant(currentUserId, conversationId);
        const result = await sql.getConversationMessages(currentUserId, conversationId, beforeMessageId, limit);

        payload = {
            success: true,
            data: result.data,
            message: result.data.length
                ? `${result.data.length} üzenet betöltve.`
                : 'Nincs megjeleníthető üzenet.',
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

        const policyResult = sql.containsBlockedWord(message)
            ? {
                blocked: true,
                message: 'Az üzenet tiltott kifejezést tartalmaz.'
            }
            : { blocked: false };

        const data = await sql.insertMessageInConversation(currentUserId, conversationId, message, policyResult);
        payload = {
            success: true,
            data,
            message: 'Üzenet elküldve.'
        };
    } catch (error) {
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
            throw new Error('Önmagaddal nem nyithatsz privát beszélgetést.');
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