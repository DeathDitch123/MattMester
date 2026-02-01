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

module.exports = router;
