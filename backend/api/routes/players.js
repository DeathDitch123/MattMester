const express = require('express');
const sql = require('../../sql/sql_funtions.js');
const { leaderboardService } = require('../../services.js');
const { usernameRegex } = require('../validation.js');
const { isAuthenticated } = require('../funtions.js');

const router = express.Router();

router.get('/leaderboard', async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        payload = { success: true, data: leaderboardService.getLeaderBoard() };
    } catch (error) {
        console.error('Leaderboard hiba:', error);
        statusCode = 500;
        payload.message = 'Szerverhiba a ranglista lekérdezése során.';
    }
    return response.status(statusCode).json(payload);
});

router.get('/searchPlayer', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const username = typeof request.query.username === 'string' ? request.query.username.trim() : '';

        if (!username) { statusCode = 400; throw new Error('A felhasználónév kötelező.'); }
        if (username.length < 3 || username.length > 50) { statusCode = 400; throw new Error('A felhasználónévnek 3 és 50 karakter között kell lennie.'); }
        if (!usernameRegex.test(username)) { statusCode = 400; throw new Error('A felhasználónév formátuma érvénytelen.'); }

        const currentUserId = Number(request.session?.userId) || 0;
        const users = await sql.searchUsersByUsernameContains(username, currentUserId);
        const data = (users || []).map((user) => ({
            userId: user.id,
            username: user.username,
            profileImage: user.profile_image || '/profile_pictures/default.png',
            profileImageStatus: user.profile_image_status || 'approved',
            friendStatus: user.friend_status || 'none'
        }));
        payload = {
            success: true,
            data,
            message: data.length ? `${data.length} találat` : 'Nincs találat a megadott keresésre.'
        };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a játékos keresése során.' };
    }
    return response.status(statusCode).json(payload);
});

router.get('/players/:targetUserId/profile', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const targetUserId = Number(request.params?.targetUserId) || 0;
        if (!targetUserId) { statusCode = 400; throw new Error('Érvénytelen játékos azonosító.'); }

        const profile = await sql.getPublicPlayerProfileById(targetUserId);
        if (!profile) { statusCode = 404; throw new Error('A játékos nem található.'); }

        payload = {
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
        };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a játékos profil lekérése során.' };
    }
    return response.status(statusCode).json(payload);
});

module.exports = router;
