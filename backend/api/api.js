const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt'); //?npm install bcrypt
const database = require('../sql/database.js');
const sql = require('../sql/sql_funtions.js');
const fs = require('fs/promises');

//!Multer
const multer = require('multer'); //?npm install multer
const path = require('path');
const { request } = require('http');
const { stat } = require('fs');
const { isAdmin } = require('./funtions.js');

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
            // erre itt még rá kell nézni, hogy a sql függvények jól vannak-e megírva, mert lehet, hogy nem jól keresnek rá a username-re és emailre
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
                                            // Ha minden ellenőrzés sikeres, akkor folytatjuk a regisztrációt
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
