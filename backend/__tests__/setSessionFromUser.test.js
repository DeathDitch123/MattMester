/**
 * N4 — `setSessionFromUser(req, user)` ugyanazokat a session-mezőket állítja be
 * login és register után. A korábban szétszórt 3 inline-blokk (login, register,
 * sessionInfo refresh) most egyetlen helper-en megy keresztül; ez a teszt
 * biztosítja, hogy a kulcs-set ne divergáljon később sem.
 */

const { setSessionFromUser } = require('../api/middleware/auth.js');

function makeFakeRequest() {
    // `cookie.maxAge` setable kell legyen — express-session-ben a sessionData része.
    return { session: { cookie: { maxAge: undefined } } };
}

describe('setSessionFromUser — single source of truth', () => {
    test('login után minden auth-mezőt beállít', () => {
        const req = makeFakeRequest();
        const user = {
            id: 42,
            username: 'tesztelek',
            role: 'player',
            elo: 1234,
            elo_MM: 1100,
            elo_bullet: 950,
            profile_image: '/profile_pictures/foo.png',
            profile_image_status: 'approved',
            is_email_verified: true
        };
        setSessionFromUser(req, user, { cookieMaxAge: 7 * 24 * 60 * 60 * 1000 });
        expect(req.session.userId).toBe(42);
        expect(req.session.username).toBe('tesztelek');
        expect(req.session.role).toBe('player');
        expect(req.session.elo).toBe(1234);
        expect(req.session.elo_MM).toBe(1100);
        expect(req.session.elo_bullet).toBe(950);
        expect(req.session.profile_image).toBe('/profile_pictures/foo.png');
        expect(req.session.profile_image_status).toBe('approved');
        expect(req.session.is_email_verified).toBe(true);
        expect(req.session.cookie.maxAge).toBe(7 * 24 * 60 * 60 * 1000);
    });

    test('register után — minimal user-rel — sane default-okat ad', () => {
        const req = makeFakeRequest();
        setSessionFromUser(req, {
            id: 99,
            username: 'ujfiok',
            role: 'player',
            elo: 800,
            elo_MM: 800,
            elo_bullet: 800,
            is_email_verified: false
        }, { cookieMaxAge: null });
        // A register-flow nem ad profile_image-et — default-ra esünk vissza
        expect(req.session.profile_image).toBe('/profile_pictures/default.png');
        expect(req.session.profile_image_status).toBe('default');
        expect(req.session.is_email_verified).toBe(false);
        expect(req.session.cookie.maxAge).toBeNull();
    });

    test('login és register UGYANAZOKAT a kulcsokat állítja be (kulcs-egyezés)', () => {
        const reqLogin = makeFakeRequest();
        const reqRegister = makeFakeRequest();
        setSessionFromUser(reqLogin, {
            id: 1, username: 'a', role: 'player',
            elo: 800, elo_MM: 800, elo_bullet: 800,
            profile_image: '/x.png', profile_image_status: 'approved',
            is_email_verified: true
        });
        setSessionFromUser(reqRegister, {
            id: 2, username: 'b', role: 'player',
            elo: 800, elo_MM: 800, elo_bullet: 800,
            is_email_verified: false
        });
        const keysLogin = Object.keys(reqLogin.session).filter(k => k !== 'cookie').sort();
        const keysRegister = Object.keys(reqRegister.session).filter(k => k !== 'cookie').sort();
        expect(keysLogin).toEqual(keysRegister);
    });
});

describe('Auth middleware exports — pageGuard, apiGuard, adminGuard, setSessionFromUser', () => {
    test('a 4 nyilvanos middleware mind exportalva van', () => {
        const mw = require('../api/middleware/auth.js');
        expect(typeof mw.pageGuard).toBe('function');
        expect(typeof mw.apiGuard).toBe('function');
        expect(typeof mw.adminGuard).toBe('function');
        expect(typeof mw.setSessionFromUser).toBe('function');
    });

    test('a régi functions.js az új middleware-re re-exportál', () => {
        const legacy = require('../api/functions.js');
        const mw = require('../api/middleware/auth.js');
        // isAuthenticated === apiGuard meg el (8 route hasznalja); isAdmin
        // re-export N14 (#73) ota torolve, ami a teszt resze.
        expect(legacy.isAuthenticated).toBe(mw.apiGuard);
        expect(legacy.isAdmin).toBeUndefined();
    });
});
