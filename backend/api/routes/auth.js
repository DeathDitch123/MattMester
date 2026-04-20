const express = require('express');
const bcrypt = require('bcrypt');
const sql = require('../../sql/sql_funtions.js');
const { usernameRegex, emailRegex, passwordRegex } = require('../validation.js');
const {
    authLoginLimiter,
    authRegisterLimiter,
    emailVerifyResendLimiter,
    emailVerifyConsumeLimiter
} = require('../middleware/rateLimiter.js');
const { isAuthenticated } = require('../funtions.js');
const {
    generateVerificationToken,
    hashToken,
    sendVerificationEmail,
    isExpired
} = require('../emailVerification.js');
const {
    getRequestIpAddress,
    logAuthenticatedAction,
    saveSessionAsync,
    destroySessionAsync
} = require('./_shared.js');

const router = express.Router();

// ?POST /api/login - felhasználó azonosítása és session-be mentése
router.post('/login', authLoginLimiter, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const { usernameOrMail, password, remember } = request.body;
        if (!usernameOrMail || !password) {
            statusCode = 400;
            throw new Error('Nincs megadva username/email vagy jelszó');
        }

        let user = await sql.getUserByUsername(usernameOrMail);
        if (!user) user = await sql.getUserByEmail(usernameOrMail);
        if (!user) {
            statusCode = 401;
            throw new Error('Hibás felhasználónév, emailcím vagy jelszó.');
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            statusCode = 401;
            await logAuthenticatedAction(request, user.id, {
                eventType: 'login_failed',
                eventCategory: 'security',
                severity: 'warning',
                source: 'backend',
                success: false,
                message: 'Sikertelen bejelentkezési kísérlet (hibás jelszó).'
            });
            throw new Error('Hibás felhasználónév, emailcím vagy jelszó.');
        }

        request.session.userId = user.id;
        request.session.username = user.username;
        request.session.role = user.role;
        request.session.elo = user.elo;
        request.session.elo_MM = user.elo_MM;
        request.session.elo_bullet = user.elo_bullet;
        request.session.profile_image = user.profile_image || '/profile_pictures/default.png';
        request.session.profile_image_status = user.profile_image_status || 'default';
        request.session.cookie.maxAge = remember ? 1000 * 60 * 60 * 24 * 7 : null;

        const ipAddress = getRequestIpAddress(request);
        const userAgent = request.headers['user-agent'] || 'Ismeretlen';
        console.log(`Bejelentkezés: ${user.username} - IP: ${ipAddress}`);
        console.log(`User Agent: ${userAgent}`);

        await saveSessionAsync(request, 'Hiba a munkamenet mentésekor.');

        await logAuthenticatedAction(request, user.id, {
            eventType: 'login',
            eventCategory: 'auth',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Sikeres bejelentkezés.',
            metadata: { remember: Boolean(remember) }
        });

        payload = {
            success: true,
            message: 'Sikeres bejelentkezés.',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role,
                elo: user.elo,
                elo_MM: user.elo_MM,
                elo_bullet: user.elo_bullet
            }
        };
    } catch (error) {
        console.error('Login hiba:', error);
        if (statusCode === 200) statusCode = 500;
        payload.message = error.message;
    }
    return response.status(statusCode).json(payload);
});

// ?GET /api/logout - session lezárása és cookie törlése
const logoutHandler = async (request, response) => {
    let statusCode = 200;
    let payload = { success: true, message: 'Nincs aktív session.' };
    try {
        if (request.session?.userId) {
            const logoutUserId = request.session.userId;

            await logAuthenticatedAction(request, logoutUserId, {
                eventType: 'logout',
                eventCategory: 'auth',
                severity: 'info',
                source: 'backend',
                success: true,
                message: 'Sikeres kijelentkezés.'
            });

            await destroySessionAsync(request, 'Sikertelen kijelentkezés.');
            response.clearCookie('connect.sid');
            console.log('Session sikeresen megsemmisítve.');
            payload.message = 'Sikeres kijelentkezés.';
        }
    } catch (error) {
        console.error('Logout hiba:', error);
        statusCode = 500;
        payload = { success: false, message: error.message };
    }
    return response.status(statusCode).json(payload);
};
router.get('/logout', logoutHandler);
router.post('/logout', logoutHandler);

// ?POST /api/register - új felhasználó regisztrációja
router.post('/register', authRegisterLimiter, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const { username, password, email } = request.body;
        if (!username || !password || !email) {
            statusCode = 400;
            throw new Error('Minden mező kitöltése kötelező.');
        }

        if (!emailRegex.test(email)) {
            statusCode = 400;
            throw new Error('Érvénytelen email cím formátum!');
        }

        if (username.length < 3 || username.length > 50) {
            statusCode = 400;
            throw new Error('A felhasználónévnek 3 és 50 karakter között kell lennie!');
        }

        if (!usernameRegex.test(username)) {
            statusCode = 400;
            throw new Error('A felhasználónév csak alfanumerikus karaktereket, pontot, aláhúzást és kötőjelet tartalmazhat!');
        }

        if (password.includes('\\')) {
            statusCode = 400;
            throw new Error('A jelszó nem megengedett karaktert tartalmaz!');
        }

        if (password.length < 8) {
            statusCode = 400;
            throw new Error('A jelszónak legalább 8 karakter hosszúnak kell lennie!');
        }

        if (!passwordRegex.test(password)) {
            statusCode = 400;
            throw new Error('A jelszónak tartalmaznia kell legalább egy nagybetűt, egy kisbetűt és egy számot!');
        }

        if (await sql.getUserByEmail(email)) {
            statusCode = 409;
            throw new Error('Az email cím már foglalt!');
        }

        if (await sql.getUserByUsername(username)) {
            statusCode = 409;
            throw new Error('A felhasználónév már foglalt!');
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const result = await sql.insertUser(username, passwordHash, email);

        request.session.userId = result.insertId;
        request.session.username = username;
        request.session.role = 'player';
        request.session.elo = 800;
        request.session.elo_MM = 800;
        request.session.elo_bullet = 800;
        request.session.profile_image = '/profile_pictures/default.png';
        request.session.profile_image_status = 'default';
        request.session.cookie.maxAge = null;

        const ipAddress = getRequestIpAddress(request);
        const userAgent = request.headers['user-agent'] || 'Ismeretlen';
        console.log(`Új regisztráció: ${username} (${email}) - IP: ${ipAddress}`);
        console.log(`User Agent: ${userAgent}`);

        statusCode = 201;
        await saveSessionAsync(request, 'Sikertelen regisztráció.');
        console.log('Session sikeresen mentve a regisztráció után.');

        await logAuthenticatedAction(request, result.insertId, {
            eventType: 'register',
            eventCategory: 'auth',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Sikeres regisztráció.'
        });

        let verificationEmailSent = false;
        try {
            const { rawToken, tokenHash, expiresAt } = generateVerificationToken();
            await sql.saveEmailVerificationToken(result.insertId, tokenHash, expiresAt);
            await sendVerificationEmail(email, username, rawToken);
            verificationEmailSent = true;
            await logAuthenticatedAction(request, result.insertId, {
                eventType: 'email_verification_sent',
                eventCategory: 'security',
                severity: 'info',
                source: 'backend',
                success: true,
                message: 'Verifikációs email elküldve regisztráció után.',
                metadata: { email, expiresAt }
            });
        } catch (verificationError) {
            console.error('Verifikációs email hiba regisztráció után:', verificationError.message);
            await logAuthenticatedAction(request, result.insertId, {
                eventType: 'email_verification_sent',
                eventCategory: 'security',
                severity: 'error',
                source: 'backend',
                success: false,
                message: 'Verifikációs email küldése sikertelen regisztráció után.',
                metadata: { email, error: verificationError.message }
            });
        }

        payload = {
            success: true,
            message: verificationEmailSent
                ? 'Sikeres regisztráció. Küldtünk egy megerősítő emailt, kérjük aktiváld a fiókodat.'
                : 'Sikeres regisztráció, de a verifikációs email küldése sikertelen — kérj újat a /resend-verification végponton.',
            emailVerification: {
                required: true,
                sent: verificationEmailSent
            },
            user: {
                id: result.insertId,
                username,
                email,
                role: 'player',
                elo: 800,
                elo_MM: 800,
                elo_bullet: 800,
                is_email_verified: false
            }
        };
    } catch (error) {
        console.error('Regisztrációs hiba:', error);
        if (statusCode === 200) statusCode = 500;
        payload.message = error.message;
    }
    return response.status(statusCode).json(payload);
});

// ?GET /api/sessioninfo - aktuális session információk lekérdezése
router.get('/sessionInfo', async (request, response) => {
    let statusCode = 200;
    let result = { success: true, loggedIn: false, user: null };
    try {
        if (request.session?.userId) {
            const dbUser = await sql.getSessionUserById(request.session.userId);

            if (!dbUser) {
                request.session.destroy(() => {
                    console.log('Session megsemmisítve, mert a hozzá tartozó felhasználó nem található.');
                });
            } else {
                // Csak a hasznalt auth mezoket frissitjuk, nem irjuk felul a teljes session objektumot.
                request.session.userId = dbUser.id;
                request.session.username = dbUser.username;
                request.session.role = dbUser.role;
                request.session.elo = dbUser.elo;
                request.session.profile_image = dbUser.profile_image || '/profile_pictures/default.png';
                request.session.profile_image_status = dbUser.profile_image_status || 'default';

                result.loggedIn = true;
                result.user = {
                    id: dbUser.id,
                    username: dbUser.username,
                    email: dbUser.email,
                    profile_image: dbUser.profile_image,
                    profile_image_status: dbUser.profile_image_status,
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
            }
        }
    } catch (error) {
        console.error('Session info hiba:', error);
        statusCode = 500;
        result = {
            success: false,
            loggedIn: false,
            user: null,
            message: 'Szerverhiba a session információ lekérdezése során.'
        };
    }
    return response.status(statusCode).json(result);
});

// ?GET /api/auth/verify-email - token alapú email megerősítés (egyszer használatos, lejáró)
router.get('/auth/verify-email', emailVerifyConsumeLimiter, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const token = typeof request.query?.token === 'string' ? request.query.token.trim() : '';
        if (!token) {
            statusCode = 400;
            throw new Error('Hiányzó verifikációs token.');
        }

        const tokenHash = hashToken(token);
        const user = await sql.findUserByVerificationTokenHash(tokenHash);

        if (!user) {
            statusCode = 400;
            await logAuthenticatedAction(request, 0, {
                eventType: 'email_verification_failed',
                eventCategory: 'security',
                severity: 'warning',
                source: 'backend',
                success: false,
                message: 'Érvénytelen vagy ismeretlen verifikációs token.',
                metadata: { reason: 'not_found' }
            }).catch(() => { });
            throw new Error('Érvénytelen vagy már felhasznált verifikációs token.');
        }

        if (user.is_email_verified) {
            payload = {
                success: true,
                alreadyVerified: true,
                message: 'Az email cím már meg van erősítve.'
            };
        } else if (isExpired(user.email_verification_token_expires)) {
            statusCode = 400;
            await logAuthenticatedAction(request, user.id, {
                eventType: 'email_verification_failed',
                eventCategory: 'security',
                severity: 'warning',
                source: 'backend',
                success: false,
                message: 'Lejárt verifikációs token.',
                metadata: { reason: 'expired' }
            });
            throw new Error('A verifikációs link lejárt. Kérj új linket a /api/auth/resend-verification végponton.');
        } else {
            await sql.markEmailVerified(user.id);
            await logAuthenticatedAction(request, user.id, {
                eventType: 'email_verification_success',
                eventCategory: 'security',
                severity: 'info',
                source: 'backend',
                success: true,
                message: 'Email cím sikeresen megerősítve.',
                metadata: { email: user.email }
            });
            payload = {
                success: true,
                alreadyVerified: false,
                message: 'Email cím sikeresen megerősítve. Most már minden funkciót használhatsz.'
            };
        }
    } catch (error) {
        console.error('Email verify hiba:', error.message);
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba az email verifikáció során.' };
    }
    return response.status(statusCode).json(payload);
});

// ?POST /api/auth/resend-verification - új verifikációs email kérése (csak bejelentkezett, még nem verifikált usernek)
router.post('/auth/resend-verification', emailVerifyResendLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '' };
    try {
        const userId = Number(request.session?.userId) || 0;
        if (!userId) {
            statusCode = 401;
            throw new Error('Bejelentkezés szükséges.');
        }

        const user = await sql.getUserVerificationStatusById(userId);
        if (!user) {
            statusCode = 404;
            throw new Error('A felhasználó nem található.');
        }

        if (user.is_email_verified) {
            payload = {
                success: true,
                alreadyVerified: true,
                message: 'Az email cím már meg van erősítve, nincs szükség újraküldésre.'
            };
        } else if (!user.email) {
            statusCode = 400;
            throw new Error('Nincs email cím a profilhoz, előbb állíts be egyet.');
        } else {
            const { rawToken, tokenHash, expiresAt } = generateVerificationToken();
            await sql.saveEmailVerificationToken(userId, tokenHash, expiresAt);
            await sendVerificationEmail(user.email, user.username, rawToken);

            await logAuthenticatedAction(request, userId, {
                eventType: 'email_verification_resend',
                eventCategory: 'security',
                severity: 'info',
                source: 'backend',
                success: true,
                message: 'Verifikációs email újraküldve.',
                metadata: { email: user.email, expiresAt }
            });

            payload = {
                success: true,
                alreadyVerified: false,
                message: 'Új verifikációs email elküldve. Ellenőrizd a postaládád.'
            };
        }
    } catch (error) {
        console.error('Resend verification hiba:', error.message);
        if (statusCode === 200) statusCode = 500;
        payload = { success: false, message: error.message || 'Szerverhiba a verifikációs email újraküldése során.' };
    }
    return response.status(statusCode).json(payload);
});

module.exports = router;
