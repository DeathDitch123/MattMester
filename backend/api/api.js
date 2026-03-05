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
                    if (remember) {
                        request.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 7; // 7 nap
                    } else {
                        request.session.cookie.maxAge = null; // session cookie (böngésző bezárásáig)
                    }
                }
            }
        }
        return response.status(statusCode).json({
            message: 'Sikeres bejelentkezés.',
            elo: currentUser.elo,
            role: currentUser.role
        });
    } catch (error) {
        console.error('Login hiba:', error);
        const finalStatusCode = statusCode === 200 ? 500 : statusCode;
        return response.status(finalStatusCode).json({ message: error.message });
    }
});
// ?GET /api/logout - session lezárása és cookie törlése
const logoutHandler = async (request, response) => {
    let statusCode = 200;
    let message = 'Sikeres kijelentkezés.';

    try {
        if (!request.session.userId || !request.session) {
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
        response.status(statusCode).json({ message });
    } catch (error) {
        console.error('Logout hiba:', error);
        return response.status(500).json({ message: 'Szerverhiba a kijelentkezés során.' });
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
                                            request.session.role = 'user';
                                            request.session.elo = 1200;
                                            request.session.cookie.maxAge = null; // session cookie (böngésző bezárásáig)

                                            statusCode = 201;

                                            request.session.save((err) => {
                                                if (err) {
                                                    console.error('Session mentési hiba:', err);
                                                    return response.status(500).json({ message: 'Sikertelen regisztráció.' });
                                                }
                                                else {
                                                    console.log('Session sikeresen mentése a regisztráció után.');
                                                    return response.status(statusCode).json({
                                                        message: 'Sikeres regisztráció',
                                                        elo: 1200,
                                                        role: 'user'
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
        return response.status(FinalStatusCode).json({ message: error.message });
    }
});

// ?GET /api/leaderboard - top 10 játékos ELO alapján
router.get('/leaderboard', async (request, response) => {
    try {
        const rows = await sql.getLeaderBoard();
        return response.status(200).json(rows);
    } catch (error) {
        console.error('Leaderboard hiba:', error);
        return response.status(500).json({ message: 'Nem sikerült lekérni a ranglistát.' });
    }
});

// ?GET /api/sessioninfo - aktuális session információk lekérdezése
router.get('/sessionInfo', (request, response) => {
    if (request.session.userId) {
        return response.status(200).json({
            loggedIn: true,
            user: {
                username: request.session.username,
                role: request.session.role,
                elo: request.session.elo,
                sessionMaxAge: request.session.cookie.maxAge,
                sessionExpires: request.session.cookie.expires
            }
        });
    } else {
        return response.status(200).json({ loggedIn: false });
    }
});
module.exports = router;