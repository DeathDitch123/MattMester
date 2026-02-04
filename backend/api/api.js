const express = require('express');
const router = express.Router();
const database = require('../sql/database.js');
const fs = require('fs/promises');

//!Multer
const multer = require('multer'); //?npm install multer
const path = require('path');

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
    const { username, password } = request.body;
    try {
        if (!username || !password) {
            throw new Error("Hiányzó username vagy password.");
        }
        let user = null;
        //függvémy meghívása mely eldönti hogy létezik e a user
        if (userCheck(username, password)) {
            // biztosítjuk, hogy request.session.user objektum létezzen

            request.session.user = {
                name: username,
                timestamp: Date.now()
            };
            console.log(request.session.user);
            response.status(200).json({ message: "Minden fasza" });
        }
        else {
            response.status(401).json({ message: "Hibás felhasználó vagy jelszó" });
        }
    } catch (error) {
        console.error('Login hiba:', error);
        return response.status(500).json({ message: error });
    }
});

// ?GET /api/logout - session lezárása és cookie törlése
router.get('/logout', (request, response) => {
    try {
        if (!request.session) {
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

function userCheck(p1, p2) {
    return p1 == p2;
}


module.exports = router;
