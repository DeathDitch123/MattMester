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
const { isAdmin } = require('./funtions.js');
const { profile } = require('console');

const storage = multer.diskStorage({
    destination: (request, file, callback) => {
        callback(null, path.join(__dirname, '../uploads'));
    },
    filename: (request, file, callback) => {
        callback(null, Date.now() + '-' + file.originalname); //?egyedi név: dátum - file eredeti neve
    }
});

const upload = multer({ storage });

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

                    return request.session.save((err) => {
                        if (err) {
                            console.error('Session mentési hiba:', err);
                            return response.status(500).json({ success: false, message: 'Hiba a munkamenet mentésekor.' });
                        }

                        // Csak a sikeres mentés után küldjük el a JSON választ
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
                                            request.session.elo = 1200;
                                            request.session.elo_MM = 1200;
                                            request.session.elo_bullet = 1200;
                                            request.session.cookie.maxAge = null; // session cookie (böngésző bezárásáig)

                                            const ipAdress = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
                                            console.log(`Új regisztráció: ${username} (${email}) - IP: ${ipAdress}`);
                                            const userAgent = request.headers['user-agent'] || 'Ismeretlen';
                                            console.log(`User Agent: ${userAgent}`);

                                            statusCode = 201;

                                            request.session.save(async (err) => {
                                                if (err) {
                                                    console.error('Session mentési hiba:', err);
                                                    return response.status(500).json({ success: false, message: 'Sikertelen regisztráció.' });
                                                }
                                                else {
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
        if (!request.session?.userId) {
            return response.status(statusCode).json(result);
        }

        const dbUser = await sql.getSessionUserById(request.session.userId);

        if (!dbUser) {
            request.session.destroy(() => {
                console.log('Session megsemmisítve, mert a hozzá tartozó felhasználó nem található.');
            });
            return response.status(statusCode).json(result);
        }

        // Csak a hasznalt auth mezoket frissitjuk, nem irjuk felul a teljes session objektumot.
        request.session.userId = dbUser.id;
        request.session.username = dbUser.username;
        request.session.role = dbUser.role;
        request.session.elo = dbUser.elo;

        result.loggedIn = true;
        result.user = {
            id: dbUser.id,
            username: dbUser.username,
            email: dbUser.email,
            profile_image: dbUser.profile_image,
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

router.post('/profile/verify-current-password', async (request, response) => {
    try {
        if (!request.session?.userId) {
            return response.status(401).json({ success: false, valid: false, message: 'Bejelentkezes szukseges.' });
        }

        const currentPassword = typeof request.body?.currentPassword === 'string' ? request.body.currentPassword : '';
        if (!currentPassword) {
            return response.status(400).json({ success: false, valid: false, message: 'A jelenlegi jelszo kotelezo.' });
        }

        const user = await sql.getUserAuthById(request.session.userId);
        if (!user) {
            return response.status(404).json({ success: false, valid: false, message: 'A felhasznalo nem talalhato.' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
        if (!isMatch) {
            return response.status(200).json({ success: true, valid: false, message: 'A jelenlegi jelszo hibas.' });
        }

        return response.status(200).json({ success: true, valid: true, message: 'A jelenlegi jelszo helyes.' });
    } catch (error) {
        console.error('Current password verify hiba:', error);
        return response.status(500).json({ success: false, valid: false, message: 'Szerverhiba az ellenorzes soran.' });
    }
});

router.post('/profile/settings', async (request, response) => {
    let statusCode = 200;
    try {
        if (!request.session?.userId) {
            statusCode = 401;
            throw new Error('A profil modositasahoz be kell jelentkezni.');
        }

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
            throw new Error('A felhasznalonev es az email cim kotelezo.');
        }

        if (username.length < 3 || username.length > 50) {
            statusCode = 400;
            throw new Error('A felhasznalonevnek 3 es 50 karakter kozott kell lennie.');
        }

        if (!usernameRegex.test(username)) {
            statusCode = 400;
            throw new Error('A felhasznalonev formatuma ervenytelen.');
        }

        if (!emailRegex.test(email)) {
            statusCode = 400;
            throw new Error('Ervenytelen email formatum.');
        }

        if (!currentPassword) {
            statusCode = 400;
            throw new Error('A profil modositasahoz add meg a jelenlegi jelszavad.');
        }

        if (newPassword) {
            if (!currentPassword) {
                statusCode = 400;
                throw new Error('Jelszo modositasahoz add meg a jelenlegi jelszavad.');
            }

            if (newPassword.includes('\\')) {
                statusCode = 400;
                throw new Error('A jelszo nem megengedett karaktert tartalmaz.');
            }

            if (newPassword.length < 8) {
                statusCode = 400;
                throw new Error('A jelszonak legalabb 8 karakter hosszu kell legyen.');
            }

            if (!passwordRegex.test(newPassword)) {
                statusCode = 400;
                throw new Error('A jelszonak tartalmaznia kell nagybetut, kisbetut es szamot.');
            }
        }

        const currentAuthUser = await sql.getUserAuthById(request.session.userId);
        if (!currentAuthUser) {
            statusCode = 404;
            throw new Error('A felhasznalo nem talalhato.');
        }

        const hasUsernameChanged = username !== currentAuthUser.username;
        const hasEmailChanged = email !== currentAuthUser.email;
        const hasPasswordChanged = newPassword.length > 0;

        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, currentAuthUser.password_hash);
        if (!isCurrentPasswordValid) {
            statusCode = 401;
            throw new Error('A jelenlegi jelszo hibas.');
        }

        if (!hasUsernameChanged && !hasEmailChanged && !hasPasswordChanged) {
            statusCode = 400;
            throw new Error('Nincs valtozas, nincs mit menteni.');
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
                message: 'Profil beallitasok frissitve.',
                metadata: {
                    changedFields
                }
            });
        } catch (logError) {
            console.warn('Profile settings log hiba:', logError.message);
        }

        return response.status(statusCode).json({
            success: true,
            message: 'A profil beallitasok sikeresen frissultek.',
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
            message: error.message || 'Szerverhiba a profil beallitasok mentese kozben.'
        });
    }
});

router.post('/profile/delete', async (request, response) => {
    let statusCode = 200;
    try {
        if (!request.session?.userId) {
            statusCode = 401;
            throw new Error('Bejelentkezes szukseges.');
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
        const currentPassword = typeof request.body?.currentPassword === 'string' ? request.body.currentPassword : '';

        if (!currentPassword) {
            statusCode = 400;
            throw new Error('A jelenlegi jelszo kotelezo.');
        }

        if (currentPassword.includes('\\')) {
            statusCode = 400;
            throw new Error('A jelszo nem megengedett karaktert tartalmaz.');
        }

        if (currentPassword.length < 8) {
            statusCode = 400;
            throw new Error('A jelszonak legalabb 8 karakter hosszu kell legyen.');
        }

        if (!passwordRegex.test(currentPassword)) {
            statusCode = 400;
            throw new Error('A jelszonak tartalmaznia kell nagybetut, kisbetut es szamot.');
        }

        const authUser = await sql.getUserAuthById(request.session.userId);
        if (!authUser) {
            statusCode = 404;
            throw new Error('A felhasznalo nem talalhato.');
        }

        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, authUser.password_hash);
        if (!isCurrentPasswordValid) {
            statusCode = 401;
            throw new Error('A jelenlegi jelszo hibas.');
        }

        const deleteResult = await sql.deleteUserProfileWithTransaction(request.session.userId);

        await new Promise((resolve) => {
            request.session.destroy((error) => {
                if (error) {
                    console.warn('Session torlesi hiba profil torles utan:', error);
                }
                response.clearCookie('connect.sid');
                resolve();
            });
        });

        return response.status(200).json({
            success: true,
            message: 'A profil sikeresen torolve lett.',
            userId: deleteResult.userId,
            username: deleteResult.username
        });
    } catch (error) {
        console.error('Profile delete hiba:', error);

        if (statusCode === 200) {
            statusCode = 500;
        }

        if (error.message === 'Admin profil nem torolheto.') {
            statusCode = 403;
        }

        if (error.message === 'A felhasznalo nem talalhato.') {
            statusCode = 404;
        }

        if (error.message === 'A jelenlegi jelszo hibas.') {
            statusCode = 401;
        }

        return response.status(statusCode).json({
            success: false,
            message: error.message || 'Szerverhiba a profil torlese kozben.'
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
module.exports = router;