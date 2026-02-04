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

const storage = multer.diskStorage({
    destination: (request, file, callback) => {
        callback(null, path.join(__dirname, '../uploads'));
    },
    filename: (request, file, callback) => {
        callback(null, Date.now() + '-' + file.originalname); //?egyedi név: dátum - file eredeti neve
    }
});

const upload = multer({ storage });

//!Endpoints:
//?GET /api/test
router.get('/test', (request, response) => {
    response.status(200).json({
        message: 'Ez a végpont működik.'
    });
});

//?GET /api/testsql
/**
 * ❗ JAVÍTÁS:
 * selectAllTest → egységes elnevezés
 */
router.get('/testselect', async (req, res) => {
    try {
        const results = await database.selectAllTest();
        res.status(200).json({ results });
    } catch (error) {
        res.status(500).json({ message: 'Lekérdezési hiba.' });
    }
});

/**
 * ❗ JAVÍTÁS:
 * id eltávolítva a body-ból
 */
router.post('/testinsert', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({
                message: 'username megadása kötelező'
            });
        }

        await database.insertTestUser(username);

        res.status(201).json({
            message: 'Sikeres beszúrás'
        });

    } catch (error) {
        res.status(500).json({
            message: 'Sikertelen beszúrás',
            error: error.message
        });
    }
});

// ?POST /api/login - felhasználó azonosítása és session-be mentése
router.post('/login', async (request, response) => {
    const { username, password, remember } = request.body;
    try {
        if (!username || !password) {
            return response.status(400).json({ message: 'Felhasználónév és jelszó megadása kötelező.' });
        }
        const user = await sql.getUserByUsername(username);
        const authErrorMsg = 'Hibás felhasználónév vagy jelszó.';
        if (!user) {
            return response.status(401).json({ message: authErrorMsg });
        }
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return response.status(401).json({ message: authErrorMsg });
        }
        request.session.userId = user.id;
        request.session.username = user.username;
        request.session.role = user.role;
        request.session.elo = user.elo;

        if (remember) {
            request.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 7; // 7 nap
        } else {
            request.session.cookie.expires = false;
        }
        return response.status(200).json({
            message: 'Sikeres bejelentkezés.',
            elo: user.elo,
            role: user.role
        });
    } catch (error) {
        console.error('Login hiba:', error);
        return response.status(500).json({ message: 'Szerverhiba a bejelentkezés során.' });
    }
});

// ?GET /api/logout - session lezárása és cookie törlése
router.get('/logout', (request, response) => {
    try {
        if (!request.session.userId) {
            return response.status(200).json({ message: 'Nincs aktív session.' });
        }
        request.session.destroy(err => {
            if (err) {
                console.error('Session destroy hiba:', err);
                return response.status(500).json({ message: 'Sikertelen kijelentkezés.' });
            }
            // alapértelmezett cookie név: connect.sid
            response.clearCookie('connect.sid');
            return response.status(200).json({ message: 'Sikeres kijelentkezés.' });
        });
    } catch (error) {
        console.error('Logout hiba:', error);
        return response.status(500).json({ message: 'Szerverhiba a kijelentkezés során.' });
    }
});

// ?POST /api/register - új felhasználó regisztrációja
router.post('/register', async (request, response) => {
    try {
        const { username, password, email } = request.body;
        if (!username || !password || !email) {
            return response.status(400).json({ message: 'Minden mező kitöltése kötelező.' });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return response.status(400).json({ message: 'Érvénytelen email cím formátum!' });
        }
        if (username.length < 3 || username.length > 50) {
            return response.status(400).json({ message: 'A felhasználónévnek 3 és 50 karakter között kell lennie!' });
        }
        if (password.length < 8) {
            return response.status(400).json({ message: 'A jelszónak legalább 8 karakter hosszúnak kell lennie!' });
        }
        if (!/\d/.test(password)) {
            return response.status(400).json({ message: 'A jelszónak tartalmaznia kell legalább egy számot!' });
        }
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        const result = await sql.insertUser(username, passwordHash, email);

        request.session.userId = result.insertId;
        request.session.username = username;
        request.session.role = 'player';
        request.session.elo = 1200;

        request.session.save((err) => {
            if (err) {
                console.error('Session mentési hiba:', err);
                return response.status(500).json({ message: 'Hiba a beléptetés során.' });
            }
            return response.status(201).json({
                message: 'Sikeres regisztráció',
                elo: 1200,
                role: 'player'
            });
        });

    } catch (error) {
        if (error.message.includes('foglalt')) {
            return response.status(409).json({ message: error.message });
        }
        console.error('Register hiba:', error);
        return response.status(500).json({ message: 'Sikertelen regisztráció.' });
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
                elo: request.session.elo
            }
        });
    } else {
        return response.status(200).json({ loggedIn: false });
    }
});
module.exports = router;
