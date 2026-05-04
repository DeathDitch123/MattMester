/**
 * backend/api/middleware/maintenanceGuard.js — egyseg-tesztek.
 *
 * Lefedi:
 *   - maintenanceGuard() / api-utvonalakra: 503 JSON ha karbantartas + nem-admin
 *   - mindig-engedelyezett prefixek (/api/admin/, /api/health, /api/login, /api/logout)
 *   - mindig-engedelyezett pathok (/api/auth/check)
 *   - admin Bearer token / session role atengedes
 *   - HTML accept header → redirect /html/maintenance.html
 *   - maintenanceHtmlGuard() / nem-API: redirect HTML-keresekre, static atengedes
 */

jest.mock('../sql/modules/siteSettings.js', () => {
    let cached = { maintenanceMode: false, supportEmail: null };
    return {
        getSettings: jest.fn(() => Promise.resolve(cached)),
        getSettingsCachedSync: jest.fn(() => cached),
        // teszt-helper a mock-elt cache aktualizalasahoz
        __setMaintenance: (val, supportEmail = null) => { cached = { maintenanceMode: val, supportEmail }; }
    };
});

const siteSettings = require('../sql/modules/siteSettings.js');
const { maintenanceGuard, maintenanceHtmlGuard } = require('../api/middleware/maintenanceGuard.js');

beforeEach(() => {
    siteSettings.__setMaintenance(false);
});

function makeReq({ url = '/api/x', authorization = null, sessionRole = null, accept = 'application/json', method = 'GET' } = {}) {
    return {
        originalUrl: url,
        url,
        method,
        headers: {
            authorization: authorization || '',
            accept
        },
        session: sessionRole ? { role: sessionRole } : null
    };
}

function makeRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    res.redirect = jest.fn();
    return res;
}

describe('maintenanceGuard — non-admin user, karbantartas KI', () => {
    test('next() hivva normal user-en', () => {
        const middleware = maintenanceGuard();
        const next = jest.fn();
        middleware(makeReq({ url: '/api/profile/me' }), makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});

describe('maintenanceGuard — non-admin user, karbantartas BE', () => {
    beforeEach(() => siteSettings.__setMaintenance(true, 'support@x.com'));

    test('blokkolt API utvonal → 503 JSON {maintenance:true}', () => {
        const middleware = maintenanceGuard();
        const next = jest.fn();
        const res = makeRes();
        middleware(makeReq({ url: '/api/profile/me', accept: 'application/json' }), res, next);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            maintenance: true,
            code: 'MAINTENANCE_MODE',
            supportEmail: 'support@x.com'
        }));
        expect(next).not.toHaveBeenCalled();
    });

    test('HTML accept-header → redirect /html/maintenance.html', () => {
        const middleware = maintenanceGuard();
        const next = jest.fn();
        const res = makeRes();
        middleware(makeReq({ url: '/api/profile/me', accept: 'text/html' }), res, next);
        expect(res.redirect).toHaveBeenCalledWith(302, '/html/maintenance.html');
    });

    // Mindig-engedelyezett prefixek
    const allowedPrefixes = [
        '/api/admin/users/list',
        '/api/health',
        '/api/login',
        '/api/logout'
    ];
    test.each(allowedPrefixes)('engedelyezett prefix: %s → next', (url) => {
        const middleware = maintenanceGuard();
        const next = jest.fn();
        middleware(makeReq({ url }), makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('engedelyezett egzakt path: /api/auth/check → next', () => {
        const middleware = maintenanceGuard();
        const next = jest.fn();
        middleware(makeReq({ url: '/api/auth/check' }), makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('admin Bearer token → next (admin be tud lepni)', () => {
        const middleware = maintenanceGuard();
        const next = jest.fn();
        middleware(makeReq({
            url: '/api/profile/me',
            authorization: 'Bearer abcdefghijklmnopqrstuvwxyz12345678'
        }), makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('admin session role → next', () => {
        const middleware = maintenanceGuard();
        const next = jest.fn();
        middleware(makeReq({ url: '/api/profile/me', sessionRole: 'admin' }), makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('player session role → blokkolva', () => {
        const middleware = maintenanceGuard();
        const next = jest.fn();
        const res = makeRes();
        middleware(makeReq({ url: '/api/profile/me', sessionRole: 'player' }), res, next);
        expect(res.status).toHaveBeenCalledWith(503);
        expect(next).not.toHaveBeenCalled();
    });

    test('rovid Bearer token (kevesebb mint 20 char) → blokkolva', () => {
        const middleware = maintenanceGuard();
        const next = jest.fn();
        const res = makeRes();
        middleware(makeReq({
            url: '/api/profile/me',
            authorization: 'Bearer short'
        }), res, next);
        expect(res.status).toHaveBeenCalledWith(503);
    });

    test('querystring leszedett path-en is mukodik', () => {
        const middleware = maintenanceGuard();
        const next = jest.fn();
        middleware(makeReq({ url: '/api/health?cb=123' }), makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});

describe('maintenanceHtmlGuard — root-level HTML guard', () => {
    beforeEach(() => siteSettings.__setMaintenance(true));

    test('GET / + accept text/html → redirect /html/maintenance.html', () => {
        const middleware = maintenanceHtmlGuard();
        const next = jest.fn();
        const res = makeRes();
        middleware(makeReq({ url: '/', accept: 'text/html' }), res, next);
        expect(res.redirect).toHaveBeenCalledWith(302, '/html/maintenance.html');
    });

    test('static asset (.css) → next', () => {
        const middleware = maintenanceHtmlGuard();
        const next = jest.fn();
        middleware(makeReq({ url: '/css/profile.css' }), makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('static asset (.js) → next', () => {
        const middleware = maintenanceHtmlGuard();
        const next = jest.fn();
        middleware(makeReq({ url: '/javascript/index.js' }), makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('/api/ utvonal → atengedi a sub-router-nek', () => {
        const middleware = maintenanceHtmlGuard();
        const next = jest.fn();
        middleware(makeReq({ url: '/api/profile/me' }), makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('maintenance.html → next (a landing-page kell tudjon betoltodni)', () => {
        const middleware = maintenanceHtmlGuard();
        const next = jest.fn();
        middleware(makeReq({ url: '/html/maintenance.html', accept: 'text/html' }), makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('admin → next', () => {
        const middleware = maintenanceHtmlGuard();
        const next = jest.fn();
        middleware(makeReq({ url: '/', sessionRole: 'admin', accept: 'text/html' }), makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('POST request mindig pass (nem HTML navigacio)', () => {
        const middleware = maintenanceHtmlGuard();
        const next = jest.fn();
        middleware(makeReq({ url: '/', method: 'POST', accept: 'text/html' }), makeRes(), next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('karbantartas KI → next (nincs redirect)', () => {
        siteSettings.__setMaintenance(false);
        const middleware = maintenanceHtmlGuard();
        const next = jest.fn();
        const res = makeRes();
        middleware(makeReq({ url: '/', accept: 'text/html' }), res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.redirect).not.toHaveBeenCalled();
    });
});
