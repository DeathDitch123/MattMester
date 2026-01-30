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
router.get('/testselect', async (request, response) => {
    try {
        const selectall = await database.selectall();
        response.status(200).json({
            message: 'Ez a végpont működik.',
            results: selectall
        });
    } catch (error) {
        response.status(500).json({
            message: 'Ez a végpont nem működik.'
        });
    }
});
router.post('/testinsert', async (request, response) => {
    try {
        const { id , username } = request.body;

        if (!id || !username) {
            return response.status(400).json({
                message: 'paraméterek szükségesek'
            });
        }

        await database.insertall(id, username);
        response.status(200).json({
            message: 'Sikeres beszúrás.'
        });
    } catch (error) {
        console.error('Insert error:', error);
        response.status(500).json({
            message: 'Sikertelen beszúrás.',
            error: error.message
        });
    }
});

module.exports = router;
