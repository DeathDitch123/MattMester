const express = require('express');
const sql = require('../../sql/sql_functions.js');
const { leaderboardService } = require('../../services.js');
const { usernameRegex } = require('../validation.js');
const { isAuthenticated } = require('../functions.js');
const { playerSearchLimiter } = require('../middleware/rateLimiter.js');

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

router.get('/searchPlayer', playerSearchLimiter, isAuthenticated, async (request, response) => {
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

// Bejelentkezett user legutobbi ellenfeleinek listaja (max 25). A frontend
// fopanelen jelenik meg, kattintassal action modal-t nyit (profil / barat /
// jelentes). Csokkeno sorrend last_played_at szerint.
router.get('/recentOpponents', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, data: [], message: '' };
    try {
        const userId = Number(request.session?.userId) || 0;
        if (!userId) { statusCode = 401; throw new Error('Nincs bejelentkezett felhasznalo.'); }

        const requestedLimit = Number(request.query?.limit) || 25;
        const opponents = await sql.getRecentOpponentsForUser(userId, { limit: requestedLimit });
        const data = (opponents || []).map((o) => ({
            userId: o.opponentUserId,
            username: o.username,
            profileImage: o.profileImage || '/profile_pictures/default.png',
            profileImageStatus: o.profileImageStatus || 'approved',
            elo: o.elo,
            eloMM: o.eloMM,
            eloBullet: o.eloBullet,
            lastActiveAt: o.lastActiveAt,
            lastPlayedAt: o.lastPlayedAt,
            matchCount: o.matchCount,
            lastGameId: o.lastGameId
        }));
        payload = { success: true, data, message: data.length ? `${data.length} ellenfel.` : 'Meg nincsenek ellenfeleid.' };
    } catch (error) {
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, data: [], message: error.message || 'Szerverhiba a legutobbi ellenfelek lekerdesekor.' };
    }
    return response.status(statusCode).json(payload);
});

// Tiltott felhasznalo info-ja a ban.html-nek. NEM kovetel be auth-ot - tiltott
// user-rol van szo, a session is mar megsemmisitve lehet. Cserebe csak a sessionStore-bol /
// a session cookie-bol kifejtett userId alapjan ad valaszt. Ha nincs userId, a fronted
// generikus szoveget mutat (a banUserId-t a frontend a query string-bol vagy egy
// timestampes session-fragment-bol kapja).
//
// Praktikus vegrehajtas: `req.session?.userId` bar a logout megsemmisiti, a ban-redirect
// elott a session meg el (a force-logout `/api/logout`-ra kuld, amelyik ellotti pillantban
// bekuldjuk az infot). Ha a user direkt a ban.html-re navigal, akkor egy `userId` query
// stringet is elfogadunk fallback-kent.
router.get('/banInfo', async (request, response) => {
    let statusCode = 200;
    let payload = { success: true, banned: false };
    try {
        const sessionUserId = Number(request.session?.userId) || 0;
        const queryUserId = Number(request.query?.userId) || 0;
        const targetUserId = sessionUserId || queryUserId;
        if (!targetUserId) {
            return response.status(200).json({ success: true, banned: false });
        }

        const user = await sql.getBanInfoById(targetUserId);
        if (!user) {
            return response.status(200).json({ success: true, banned: false });
        }
        if (!user.is_banned) {
            return response.status(200).json({ success: true, banned: false });
        }

        const bannedUntil = user.banned_until ? new Date(user.banned_until) : null;
        const isPerma = !bannedUntil;
        const isExpired = bannedUntil && bannedUntil.getTime() <= Date.now();

        payload = {
            success: true,
            banned: !isExpired,
            isPerma,
            bannedUntil: bannedUntil ? bannedUntil.toISOString() : null,
            reason: user.ban_reason || null,
            username: user.username || null
        };
    } catch (error) {
        statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a ban-info lekerdesekor.' };
    }
    return response.status(statusCode).json(payload);
});

router.get('/players/:targetUserId/profile', isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const targetUserId = Number(request.params?.targetUserId) || 0;
        if (!targetUserId) { statusCode = 400; throw new Error('Érvénytelen játékos azonosító.'); }

        const viewerUserId = Number(request.session?.userId) || 0;
        const profile = await sql.getPublicPlayerProfileById(targetUserId, viewerUserId);
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
