const express = require('express');
const bcrypt = require('bcrypt');
const sql = require('../../sql/sql_funtions.js');
const { usernameRegex, emailRegex, passwordRegex } = require('../validation.js');
const {
    authLoginLimiter,
    authRegisterLimiter,
    emailVerifyResendLimiter,
    emailVerifyConsumeLimiter,
    passwordResetRequestLimiter,
    passwordResetTokenLimiter
} = require('../middleware/rateLimiter.js');
const { isAuthenticated } = require('../funtions.js');
const {
    generateVerificationToken,
    generatePasswordResetToken,
    hashToken,
    sendVerificationEmail,
    sendPasswordResetEmail,
    isExpired
} = require('../emailVerification.js');
const {
    getRequestIpAddress,
    logAuthenticatedAction,
    saveSessionAsync,
    destroySessionAsync
} = require('./_shared.js');
const networkClassifier = require('../admin/networkClassifier.js');

const router = express.Router();

// Auth flow-ban (login / register / logout) frissitjuk az adott sessionID-vel
// nyitott socketek context-et, hogy az admin panel azonnal online-ra valtsa a
// usert. Backend-driven sync: nem fugg attol, hogy a frontend emit-el-e
// `socket:sync`-et — a sessionMiddleware csak handshake-kor olvas, ezert egy
// mar nyitott anonim socket cached session-jenek frissitese itt tortenik.
function applySocketSessionUpdate(request, sessionData) {
    try {
        const socketHub = request.app?.locals?.socketHub;
        if (!socketHub || typeof socketHub.applySessionUpdate !== 'function') return;
        const sessionId = request.sessionID || null;
        if (!sessionId) return;
        socketHub.applySessionUpdate(sessionId, sessionData || {});
    } catch (error) {
        console.warn('applySocketSessionUpdate hiba:', error.message);
    }
}

function buildMailVerifiedRedirectPath(payloadInput = {}) {
    const payload = payloadInput && typeof payloadInput === 'object' ? payloadInput : {};
    const params = new URLSearchParams();
    params.set('success', payload.success ? 'true' : 'false');
    params.set('alreadyVerified', payload.alreadyVerified ? 'true' : 'false');

    if (payload.code) {
        params.set('code', String(payload.code));
    }

    if (payload.message) {
        params.set('message', String(payload.message));
    }

    return `/html/mailVerified.html?${params.toString()}`;
}

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
            // Live broadcast az admin Bejelentkezesek oldal feedjebe.
            try {
                const adminSocketHub = request.app?.locals?.adminSocketHub;
                if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                    const failedIp = getRequestIpAddress(request);
                    const failedUa = request.headers['user-agent'] || null;
                    adminSocketHub.broadcastAdmin('admin:security:login', {
                        userId: user.id,
                        username: user.username,
                        eventType: 'login_failed',
                        success: false,
                        ip: failedIp,
                        userAgent: failedUa,
                        location: networkClassifier.classifyIp(failedIp),
                        device: networkClassifier.parseUserAgent(failedUa),
                        occurredAt: new Date().toISOString()
                    });
                }
            } catch (broadcastErr) {
                console.warn('login_failed broadcast hiba:', broadcastErr.message);
            }
            throw new Error('Hibás felhasználónév, emailcím vagy jelszó.');
        }

        if (user.is_banned) {
            statusCode = 403;
            const banErr = new Error('A fiók tiltva lett, ha fellebbezne, vegye fel a kapcsolatot a következő email címen az oldal készítőivel: mattmester.support@gmail.com');
            banErr.code = 'account_banned';
            throw banErr;
        }

        // Soft-delete grace period: ha admin torleshez jelolte, blokkolt belepes 24 oraig.
        // (A self-delete azonnali hard delete -> nem latja itt, mert a sor mar nincs.)
        if (user.pending_deletion_until && new Date(user.pending_deletion_until) > new Date()) {
            statusCode = 403;
            const untilStr = new Date(user.pending_deletion_until).toLocaleString('hu-HU');
            const delErr = new Error(`A fiókod admin által törlésre lett kijelölve (${untilStr} után véglegesen törlődik). Ha tévedésnek tartod, vedd fel a kapcsolatot: mattmester.support@gmail.com`);
            delErr.code = 'account_pending_deletion';
            throw delErr;
        }

        request.session.userId = user.id;
        request.session.username = user.username;
        request.session.role = user.role;
        request.session.elo = user.elo;
        request.session.elo_MM = user.elo_MM;
        request.session.elo_bullet = user.elo_bullet;
        request.session.profile_image = user.profile_image || '/profile_pictures/default.png';
        request.session.profile_image_status = user.profile_image_status || 'default';
        request.session.is_email_verified = !!user.is_email_verified;
        request.session.cookie.maxAge = remember ? 1000 * 60 * 60 * 24 * 7 : null;

        const ipAddress = getRequestIpAddress(request);
        const userAgent = request.headers['user-agent'] || 'Ismeretlen';
        console.log(`Bejelentkezés: ${user.username} - IP: ${ipAddress}`);
        console.log(`User Agent: ${userAgent}`);

        await saveSessionAsync(request, 'Hiba a munkamenet mentésekor.');

        // Mar nyitott socketek context-et a sessionID alapjan frissitjuk: a
        // bejelentkezes utan az admin panel azonnal online-ra latja a usert,
        // anelkul hogy a kliensnek socket reconnect-et / `socket:sync`-et kelljen
        // emit-elnie.
        applySocketSessionUpdate(request, {
            userId: user.id,
            username: user.username,
            role: user.role,
            profile_image: user.profile_image || '/profile_pictures/default.png',
            profile_image_status: user.profile_image_status || 'default',
            is_email_verified: !!user.is_email_verified
        });

        // Az utolso login IP-t bemashojuk a users tablaba — az auto IP-ban escalation
        // rendszer ezt hasznalja, ha admin offline usert banol.
        try {
            await sql.setUserLastLoginIp(user.id, ipAddress);
        } catch (ipErr) {
            console.warn('setUserLastLoginIp hiba (login):', ipErr.message);
        }

        await logAuthenticatedAction(request, user.id, {
            eventType: 'login',
            eventCategory: 'auth',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Sikeres bejelentkezés.',
            metadata: { remember: Boolean(remember) }
        });

        // Live broadcast az admin Bejelentkezesek oldal feedjebe.
        try {
            const adminSocketHub = request.app?.locals?.adminSocketHub;
            if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                adminSocketHub.broadcastAdmin('admin:security:login', {
                    userId: user.id,
                    username: user.username,
                    eventType: 'login',
                    success: true,
                    ip: ipAddress,
                    userAgent,
                    location: networkClassifier.classifyIp(ipAddress),
                    device: networkClassifier.parseUserAgent(userAgent),
                    occurredAt: new Date().toISOString()
                });
            }
        } catch (broadcastErr) {
            console.warn('login broadcast hiba:', broadcastErr.message);
        }

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
        if (error.code) payload.code = error.code;
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
            // sessionID-t a destroy elott kapjuk el; utana mar nem letezik a request-en.
            const previousSessionId = request.sessionID || null;

            await logAuthenticatedAction(request, logoutUserId, {
                eventType: 'logout',
                eventCategory: 'auth',
                severity: 'info',
                source: 'backend',
                success: true,
                message: 'Sikeres kijelentkezés.'
            });

            // Explicit last_active bump: a users.last_active csak `ON UPDATE
            // CURRENT_TIMESTAMP` szabaly miatt frissulne, az pedig nem trigger-el
            // ha a sor nem valtozik. Igy a "Utolso aktivitas" admin oszlop a
            // login-kori timestampen ragadt volna meg ("7 perce" stb. logout
            // utan), pedig a user epp most lett offline. Beirjuk a NOW()-t.
            try {
                await sql.touchUserLastActive(logoutUserId);
            } catch (touchErr) {
                console.warn('logout last_active touch hiba:', touchErr.message);
            }

            await destroySessionAsync(request, 'Sikertelen kijelentkezés.');
            response.clearCookie('connect.sid');
            console.log('Session sikeresen megsemmisítve.');
            payload.message = 'Sikeres kijelentkezés.';

            // Mar nyitott socketek context-et anonim allapotra valtjuk, hogy az
            // admin panel azonnal offline-ra valtsa a felhasznalot a kijelentkezes
            // utan — anelkul hogy a kliensnek socket disconnect/reconnect-et
            // kellene kezdemenyeznie.
            try {
                const socketHub = request.app?.locals?.socketHub;
                if (previousSessionId && socketHub && typeof socketHub.applySessionUpdate === 'function') {
                    socketHub.applySessionUpdate(previousSessionId, {
                        userId: null,
                        username: 'Vendég',
                        role: 'guest',
                        profile_image: null,
                        profile_image_status: 'default',
                        is_email_verified: false
                    });
                }
            } catch (sockErr) {
                console.warn('logout socket session sync hiba:', sockErr.message);
            }
        }
    } catch (error) {
        console.error('Logout hiba:', error);
        statusCode = 500;
        payload = { success: false, message: error.message };
    }
    const isGet = request.method === 'GET';
    if (isGet) {
        return response.redirect('/');
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

        const emailBan = await sql.isEmailBanned(email);
        if (emailBan) {
            statusCode = 403;
            const untilStr = emailBan.banned_until
                ? `${new Date(emailBan.banned_until).toLocaleDateString('hu-HU')}-ig`
                : 'véglegesen';
            throw new Error(`Ezzel az email címmel jelenleg nem lehet új fiókot regisztrálni (${untilStr}).`);
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
        request.session.is_email_verified = false;   // friss regisztráció — még nincs verify
        request.session.cookie.maxAge = null;

        const ipAddress = getRequestIpAddress(request);
        const userAgent = request.headers['user-agent'] || 'Ismeretlen';
        console.log(`Új regisztráció: ${username} (${email}) - IP: ${ipAddress}`);
        console.log(`User Agent: ${userAgent}`);

        statusCode = 201;
        await saveSessionAsync(request, 'Sikertelen regisztráció.');
        console.log('Session sikeresen mentve a regisztráció után.');

        // Backend-driven socket session sync: a regisztracio auto-loginol, ezert
        // a mar nyitott (anonim) socket context-et frissitjuk az uj userId-vel,
        // hogy az admin panel azonnal online-ra valtsa az uj felhasznalot.
        applySocketSessionUpdate(request, {
            userId: result.insertId,
            username,
            role: 'player',
            profile_image: '/profile_pictures/default.png',
            profile_image_status: 'default',
            is_email_verified: false
        });

        await logAuthenticatedAction(request, result.insertId, {
            eventType: 'register',
            eventCategory: 'auth',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Sikeres regisztráció.'
        });

        // A regisztracio auto-loginol (session.userId beallitva), ezert egy
        // 'login' eventet is rogzitunk: igy a frissen regisztralt user megjelenik
        // az admin Bejelentkezesi elozmenyek panelen is, nem csak a 'register'
        // sor jon le. A listAdminLoginHistory event_type IN ('login','login_failed')
        // szurot hasznal, igy 'register' nelkul nem latszana ott a be-belepes.
        await logAuthenticatedAction(request, result.insertId, {
            eventType: 'login',
            eventCategory: 'auth',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Automatikus bejelentkezés regisztráció után.',
            metadata: { viaRegistration: true }
        });

        // Live broadcast az admin Bejelentkezesek oldal feedjebe: a register-utani
        // auto-login is jelenjen meg azonnal a live feed-en.
        try {
            const adminSocketHub = request.app?.locals?.adminSocketHub;
            if (adminSocketHub && typeof adminSocketHub.broadcastAdmin === 'function') {
                adminSocketHub.broadcastAdmin('admin:security:login', {
                    userId: result.insertId,
                    username,
                    eventType: 'login',
                    success: true,
                    ip: ipAddress,
                    userAgent,
                    location: networkClassifier.classifyIp(ipAddress),
                    device: networkClassifier.parseUserAgent(userAgent),
                    occurredAt: new Date().toISOString()
                });
            }
        } catch (broadcastErr) {
            console.warn('register auto-login broadcast hiba:', broadcastErr.message);
        }

        let verificationEmailSent = false;
        try {
            const { rawToken, tokenHash, expiresAt } = generateVerificationToken();
            await sql.saveEmailVerificationToken(result.insertId, tokenHash, expiresAt);
            const sendInfo = await sendVerificationEmail(email, username, rawToken, { flow: 'register' });
            verificationEmailSent = true;
            await logAuthenticatedAction(request, result.insertId, {
                eventType: 'email_verification_sent',
                eventCategory: 'security',
                severity: 'info',
                source: 'backend',
                success: true,
                message: 'Verifikációs email elküldve regisztráció után.',
                metadata: {
                    email,
                    expiresAt,
                    transport: sendInfo.transport || null,
                    messageId: sendInfo.messageId || null,
                    providerResponse: sendInfo.providerResponse || null
                }
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
                metadata: {
                    email,
                    error: verificationError.message,
                    smtpReason: verificationError.smtpReason || null
                }
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
            } else if (dbUser.is_banned || (dbUser.pending_deletion_until && new Date(dbUser.pending_deletion_until) > new Date())) {
                // Banned VAGY admin-soft-deleted user: session destroy + clearCookie.
                // A frontend loggedIn:false-ot lat -> homepage kijelentkezett UI-t mutat.
                await new Promise((resolve) => {
                    request.session.destroy((err) => {
                        if (err) console.warn('sessionInfo: eviction destroy hiba:', err.message);
                        resolve();
                    });
                });
                response.clearCookie('connect.sid');
                const reasonLabel = dbUser.is_banned ? 'banned' : 'pending_deletion';
                console.log(`User (${dbUser.username}) session-je evictalva sessionInfo-n: ${reasonLabel}.`);
            } else {
                // Csak a hasznalt auth mezoket frissitjuk, nem irjuk felul a teljes session objektumot.
                request.session.userId = dbUser.id;
                request.session.username = dbUser.username;
                request.session.role = dbUser.role;
                request.session.elo = dbUser.elo;
                request.session.profile_image = dbUser.profile_image || '/profile_pictures/default.png';
                request.session.profile_image_status = dbUser.profile_image_status || 'default';
                // A verify flag-et is frissítjük, hogy a más tabon történt verifikáció
                // a következő navigáción át megjelenjen ebben a session-ben is.
                request.session.is_email_verified = !!dbUser.is_email_verified;

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
    let payload = { success: false, message: '', code: '' };
    let responseResult = null;
    try {
        const token = typeof request.query?.token === 'string' ? request.query.token.trim() : '';
        if (!token) {
            statusCode = 400;
            payload.code = 'MISSING_TOKEN';
            throw new Error('Hiányzó verifikációs token.');
        }

        const tokenHash = hashToken(token);
        const user = await sql.findUserByVerificationTokenHash(tokenHash);

        if (!user) {
            statusCode = 400;
            // Nincs azonosítható user, ezért itt nem írunk user_logs sort (FK: user_id NOT NULL).
            console.warn('[auth/verify-email] Érvénytelen vagy ismeretlen verifikációs token érkezett.');
            payload.code = 'INVALID_TOKEN';
            throw new Error('Érvénytelen vagy már felhasznált verifikációs token.');
        }

        if (user.is_email_verified) {
            payload = {
                success: true,
                code: 'EMAIL_ALREADY_VERIFIED',
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
            payload.code = 'TOKEN_EXPIRED';
            throw new Error('A verifikációs link lejárt. Kérj új linket a /api/auth/resend-verification végponton.');
        } else {
            await sql.markEmailVerified(user.id);
            // Ha ugyanaz a user verifyolt mint aki bejelentkezve van, frissítjük
            // a session flag-et — a következő socket connection már verified-ként látja.
            if (request.session?.userId === user.id) {
                request.session.is_email_verified = true;
                await saveSessionAsync(request, 'Hiba a session mentésekor verify után.');
            }
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
                code: 'EMAIL_VERIFIED',
                alreadyVerified: false,
                message: 'Email cím sikeresen megerősítve. Most már minden funkciót használhatsz.'
            };
        }
    } catch (error) {
        if (statusCode >= 500) {
            console.error('Email verify hiba:', error.message);
        } else {
            console.warn('Email verify figyelmeztetes:', error.message);
        }
        if (statusCode === 200) statusCode = 500;
        payload = {
            success: false,
            code: payload.code || 'EMAIL_VERIFY_FAILED',
            message: error.message || 'Szerverhiba az email verifikáció során.'
        };
    }

    const formatQuery = typeof request.query?.format === 'string' ? request.query.format.trim().toLowerCase() : '';
    const acceptedType = request.accepts(['html', 'json']);
    const prefersJson = formatQuery === 'json' || acceptedType === 'json';

    if (prefersJson) {
        responseResult = response.status(statusCode).json(payload);
    } else {
        const redirectTarget = buildMailVerifiedRedirectPath(payload);
        responseResult = response.redirect(302, redirectTarget);
    }

    return responseResult;
});

// ?POST /api/auth/resend-verification - új verifikációs email kérése (csak bejelentkezett, még nem verifikált usernek)
router.post('/auth/resend-verification', emailVerifyResendLimiter, isAuthenticated, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '', code: '' };
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
                code: 'EMAIL_ALREADY_VERIFIED',
                alreadyVerified: true,
                message: 'Az email cím már meg van erősítve, nincs szükség újraküldésre.'
            };
        } else if (!user.email) {
            statusCode = 400;
            throw new Error('Nincs email cím a profilhoz, előbb állíts be egyet.');
        } else {
            const { rawToken, tokenHash, expiresAt } = generateVerificationToken();
            await sql.saveEmailVerificationToken(userId, tokenHash, expiresAt);
            const sendInfo = await sendVerificationEmail(user.email, user.username, rawToken, { flow: 'resend' });

            await logAuthenticatedAction(request, userId, {
                eventType: 'email_verification_resend',
                eventCategory: 'security',
                severity: 'info',
                source: 'backend',
                success: true,
                message: 'Verifikációs email újraküldve.',
                metadata: {
                    email: user.email,
                    expiresAt,
                    transport: sendInfo.transport || null,
                    messageId: sendInfo.messageId || null,
                    providerResponse: sendInfo.providerResponse || null
                }
            });

            payload = {
                success: true,
                code: 'EMAIL_VERIFICATION_RESEND_SENT',
                alreadyVerified: false,
                message: 'Új verifikációs email elküldve. Ellenőrizd a postaládád.'
            };
        }
    } catch (error) {
        console.error('Resend verification hiba:', error.message);
        let responseCode = 'EMAIL_RESEND_FAILED';
        if (statusCode === 200) statusCode = 500;
        if (error?.code === 'EMAIL_SEND_FAILED') {
            statusCode = 503;
            responseCode = 'EMAIL_SEND_FAILED';
        }
        payload = {
            success: false,
            code: responseCode,
            message: error.message || 'Email küldés sikertelen, ellenőrizd az SMTP beállításokat vagy próbáld újra később.'
        };
    }
    return response.status(statusCode).json(payload);
});

// ?POST /api/auth/forgot-password - jelszó-visszaállító email kérése
router.post('/auth/forgot-password', passwordResetRequestLimiter, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '', code: '' };
    try {
        const email = typeof request.body?.email === 'string' ? request.body.email.trim() : '';
        if (!email) {
            statusCode = 400;
            throw new Error('Az email cím megadása kötelező.');
        }

        if (!emailRegex.test(email)) {
            statusCode = 400;
            throw new Error('Érvénytelen email cím formátum!');
        }

        const user = await sql.getUserByEmail(email);
        if (user && user.email) {
            const { rawToken, tokenHash, expiresAt } = generatePasswordResetToken();
            await sql.savePasswordResetToken(user.id, tokenHash, expiresAt);
            const sendInfo = await sendPasswordResetEmail(user.email, user.username, rawToken, { flow: 'forgot-password' });

            await logAuthenticatedAction(request, user.id, {
                eventType: 'password_reset_requested',
                eventCategory: 'security',
                severity: 'warning',
                source: 'backend',
                success: true,
                message: 'Jelszó-visszaállítási email elküldve.',
                metadata: {
                    email: user.email,
                    expiresAt,
                    transport: sendInfo.transport || null,
                    messageId: sendInfo.messageId || null,
                    providerResponse: sendInfo.providerResponse || null
                }
            });
        }

        payload = {
            success: true,
            code: 'PASSWORD_RESET_REQUEST_ACCEPTED',
            message: 'Ha létezik ilyen email cím, elküldtük a jelszó-visszaállító levelet.'
        };
    } catch (error) {
        console.error('Forgot password hiba:', error.message);
        if (statusCode === 200) {
            statusCode = error?.code === 'EMAIL_SEND_FAILED' ? 503 : 500;
        }
        payload = {
            success: false,
            code: error?.code || 'PASSWORD_RESET_REQUEST_FAILED',
            message: error.message || 'Jelszó-visszaállítási email küldése sikertelen.'
        };
    }
    return response.status(statusCode).json(payload);
});

// ?GET /api/auth/reset-password/verify - token ellenőrzés a visszaállító oldalon
router.get('/auth/reset-password/verify', passwordResetTokenLimiter, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '', code: '' };
    try {
        const token = typeof request.query?.token === 'string' ? request.query.token.trim() : '';
        if (!token) {
            statusCode = 400;
            payload.code = 'MISSING_TOKEN';
            throw new Error('Hiányzó jelszó-visszaállító token.');
        }

        const tokenHash = hashToken(token);
        const user = await sql.findUserByPasswordResetTokenHash(tokenHash);

        if (!user) {
            statusCode = 400;
            payload.code = 'INVALID_TOKEN';
            throw new Error('Érvénytelen vagy már felhasznált jelszó-visszaállító token.');
        }

        if (isExpired(user.reset_token_expires)) {
            statusCode = 400;
            await sql.clearPasswordResetToken(user.id).catch(() => { });
            await logAuthenticatedAction(request, user.id, {
                eventType: 'password_reset_token_failed',
                eventCategory: 'security',
                severity: 'warning',
                source: 'backend',
                success: false,
                message: 'Lejárt jelszó-visszaállító token.',
                metadata: { reason: 'expired' }
            });
            payload.code = 'TOKEN_EXPIRED';
            throw new Error('A jelszó-visszaállító link lejárt. Kérj új emailt a bejelentkezési oldalon.');
        }

        // (A jelszó-azonosság ellenőrzését a POST végponton végezzük el, mert ott érkezik az új jelszó.)

        payload = {
            success: true,
            code: 'PASSWORD_RESET_TOKEN_VALID',
            message: 'A jelszó-visszaállító token érvényes.'
        };
    } catch (error) {
        console.error('Password reset verify hiba:', error.message);
        if (statusCode === 200) {
            statusCode = 500;
        }
        payload = {
            success: false,
            code: payload.code || 'PASSWORD_RESET_VERIFY_FAILED',
            message: error.message || 'Szerverhiba a jelszó-visszaállítási token ellenőrzése során.'
        };
    }
    return response.status(statusCode).json(payload);
});

// ?POST /api/auth/reset-password - új jelszó mentése token alapján
router.post('/auth/reset-password', passwordResetTokenLimiter, async (request, response) => {
    let statusCode = 200;
    let payload = { success: false, message: '', code: '' };
    try {
        const token = typeof request.body?.token === 'string' ? request.body.token.trim() : '';
        const newPassword = typeof request.body?.password === 'string' ? request.body.password : '';
        const confirmPassword = typeof request.body?.confirmPassword === 'string' ? request.body.confirmPassword : '';

        if (!token) {
            statusCode = 400;
            payload.code = 'MISSING_TOKEN';
            throw new Error('Hiányzó jelszó-visszaállító token.');
        }

        if (!newPassword) {
            statusCode = 400;
            throw new Error('Az új jelszó megadása kötelező.');
        }

        if (confirmPassword && confirmPassword !== newPassword) {
            statusCode = 400;
            throw new Error('A két jelszó nem egyezik.');
        }

        if (newPassword.includes('\\')) {
            statusCode = 400;
            throw new Error('A jelszó nem megengedett karaktert tartalmaz!');
        }

        if (newPassword.length < 8) {
            statusCode = 400;
            throw new Error('A jelszónak legalább 8 karakter hosszúnak kell lennie!');
        }

        if (!passwordRegex.test(newPassword)) {
            statusCode = 400;
            throw new Error('A jelszónak tartalmaznia kell legalább egy nagybetűt, egy kisbetűt és egy számot!');
        }

        const tokenHash = hashToken(token);
        const user = await sql.findUserByPasswordResetTokenHash(tokenHash);

        if (!user) {
            statusCode = 400;
            payload.code = 'INVALID_TOKEN';
            throw new Error('Érvénytelen vagy már felhasznált jelszó-visszaállító token.');
        }

        if (isExpired(user.reset_token_expires)) {
            statusCode = 400;
            await sql.clearPasswordResetToken(user.id).catch(() => { });
            await logAuthenticatedAction(request, user.id, {
                eventType: 'password_reset_token_failed',
                eventCategory: 'security',
                severity: 'warning',
                source: 'backend',
                success: false,
                message: 'Lejárt jelszó-visszaállító token.',
                metadata: { reason: 'expired' }
            });
            payload.code = 'TOKEN_EXPIRED';
            throw new Error('A jelszó-visszaállító link lejárt. Kérj új emailt a bejelentkezési oldalon.');
        }

        // Ellenőrizzük, hogy az új jelszó nem egyezik-e meg a jelenleg tárolt jelszóval.
        const isSameAsOld = await bcrypt.compare(newPassword, user.password_hash);
        if (isSameAsOld) {
            statusCode = 400;
            payload.code = 'PASSWORD_SAME_AS_OLD';
            throw new Error('Az új jelszó nem egyezhet meg a régivel.');
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        await sql.updateUserPasswordAndClearResetToken(user.id, passwordHash);

        await logAuthenticatedAction(request, user.id, {
            eventType: 'password_reset_completed',
            eventCategory: 'security',
            severity: 'info',
            source: 'backend',
            success: true,
            message: 'Jelszó sikeresen visszaállítva.',
            metadata: { email: user.email }
        });

        payload = {
            success: true,
            code: 'PASSWORD_RESET_SUCCESS',
            message: 'A jelszavad sikeresen frissítve lett. Most már bejelentkezhetsz az új jelszóval.'
        };
    } catch (error) {
        console.error('Password reset submit hiba:', error.message);
        if (statusCode === 200) {
            statusCode = 500;
        }
        payload = {
            success: false,
            code: payload.code || 'PASSWORD_RESET_FAILED',
            message: error.message || 'Szerverhiba a jelszó visszaállítása során.'
        };
    }
    return response.status(statusCode).json(payload);
});

module.exports = router;
