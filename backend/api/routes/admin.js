const express = require('express');
const { isAdmin } = require('../funtions.js');

const router = express.Router();

router.get('/test', isAdmin, (request, response) => {
    let statusCode = 200;
    let payload = { message: 'Ez a végpont működik.' };
    try {
        payload = { message: 'Ez a végpont működik.' };
    } catch (error) {
        console.error('Admin test hiba:', error);
        statusCode = 500;
        payload = { message: 'Szerverhiba az admin teszt végponton.' };
    }
    return response.status(statusCode).json(payload);
});

module.exports = router;
