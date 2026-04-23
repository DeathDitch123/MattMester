const express = require('express');
const sql = require('../../sql/sql_funtions.js');
const { isAdmin } = require('../funtions.js');

const router = express.Router();

// Router-szintű védelem: minden admin route automatikusan isAdmin-ellenőrzésen megy át.
router.use(isAdmin);

function escapeCsvValue(value) {
    const normalized = value === null || value === undefined ? '' : String(value);
    return `"${normalized.replace(/"/g, '""')}"`;
}

router.get('/test', (request, response) => {
    return response.status(200).json({ message: 'Ez a végpont működik.' });
});

router.get('/export-users', async (request, response) => {
    let statusCode = 200;
    let errorMessage = null;
    let csvBody = null;

    try {
        const users = await sql.getAllUsers();
        const headers = [
            'id',
            'username',
            'email',
            'role',
            'profile_image',
            'elo',
            'elo_MM',
            'elo_bullet',
            'is_banned',
            'banned_until',
            'last_active',
            'created_at',
            'wins',
            'losses',
            'draws',
            'total_abilities',
            'win_rate_percent',
            'last_ip'
        ];

        const rows = [headers.join(',')];
        for (const user of users || []) {
            rows.push([
                user.id,
                user.username,
                user.email,
                user.role,
                user.profile_image,
                user.elo,
                user.elo_MM,
                user.elo_bullet,
                user.is_banned,
                user.banned_until,
                user.last_active,
                user.created_at,
                user.wins,
                user.losses,
                user.draws,
                user.total_abilities,
                user.win_rate_percent,
                user.last_ip
            ].map(escapeCsvValue).join(','));
        }

        csvBody = `\uFEFF${rows.join('\n')}`;
    } catch (error) {
        console.error('Admin export-users hiba:', error);
        statusCode = 500;
        errorMessage = 'Szerverhiba a felhasználók exportálása során.';
    }

    let result;
    if (errorMessage) {
        result = response.status(statusCode).json({ message: errorMessage });
    } else {
        const filename = `users-${new Date().toISOString().slice(0, 10)}.csv`;
        response.setHeader('Content-Type', 'text/csv; charset=utf-8');
        response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        result = response.status(statusCode).send(csvBody);
    }
    return result;
});

module.exports = router;
