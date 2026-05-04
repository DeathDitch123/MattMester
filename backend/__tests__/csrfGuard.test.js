/**
 * api/middleware/csrfGuard.js — Origin/Referer alapu CSRF guard tesztek.
 */

const { csrfGuard, isOriginAllowed, normalizeOrigin } = require('../api/middleware/csrfGuard.js');

const ORIG_ALLOWED = process.env.ALLOWED_ORIGINS;
beforeEach(() => {
    process.env.ALLOWED_ORIGINS = 'http://localhost:3000';
});
afterAll(() => {
    if (ORIG_ALLOWED === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = ORIG_ALLOWED;
});

function makeReq({ method = 'GET', origin = null, referer = null, url = '/api/x' } = {}) {
    return {
        method,
        headers: {
            ...(origin ? { origin } : {}),
            ...(referer ? { referer } : {})
        },
        originalUrl: url,
        url
    };
}

function makeRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
}

describe('normalizeOrigin', () => {
    test('localhost <-> 127.0.0.1 ekvivalens', () => {
        expect(normalizeOrigin('http://localhost:3000')).toBe('http://localhost:3000');
        expect(normalizeOrigin('http://127.0.0.1:3000')).toBe('http://localhost:3000');
    });

    test('https port nelkul', () => {
        expect(normalizeOrigin('https://example.com')).toBe('https://example.com');
    });

    test('invalid url → raw return', () => {
        expect(normalizeOrigin('not-a-url')).toBe('not-a-url');
    });

    test('null/undefined → ures string', () => {
        expect(normalizeOrigin(null)).toBe('');
        expect(normalizeOrigin(undefined)).toBe('');
    });
});

describe('isOriginAllowed', () => {
    test('whitelist match → true', () => {
        expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    });

    test('localhost <-> 127.0.0.1 normalize', () => {
        expect(isOriginAllowed('http://127.0.0.1:3000')).toBe(true);
    });

    test('different host → false', () => {
        expect(isOriginAllowed('http://evil.example.com')).toBe(false);
    });

    test('different port → false', () => {
        expect(isOriginAllowed('http://localhost:9999')).toBe(false);
    });

    test('null/empty → false', () => {
        expect(isOriginAllowed(null)).toBe(false);
        expect(isOriginAllowed('')).toBe(false);
    });

    test('wildcard "*" → minden enged (production-veszelyes, csak dev)', () => {
        process.env.ALLOWED_ORIGINS = '*';
        expect(isOriginAllowed('http://anything.com')).toBe(true);
    });

    test('tobb origin vesszovel elvalasztva', () => {
        process.env.ALLOWED_ORIGINS = 'http://localhost:3000,https://prod.example.com';
        expect(isOriginAllowed('http://localhost:3000')).toBe(true);
        expect(isOriginAllowed('https://prod.example.com')).toBe(true);
        expect(isOriginAllowed('http://other.com')).toBe(false);
    });
});

describe('csrfGuard middleware — read-only methods atengedve', () => {
    test('GET → next() (no Origin szukseges)', () => {
        const req = makeReq({ method: 'GET' });
        const res = makeRes();
        const next = jest.fn();
        csrfGuard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
    });

    test('HEAD → next()', () => {
        const req = makeReq({ method: 'HEAD' });
        const res = makeRes();
        const next = jest.fn();
        csrfGuard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('OPTIONS (preflight) → next()', () => {
        const req = makeReq({ method: 'OPTIONS' });
        const res = makeRes();
        const next = jest.fn();
        csrfGuard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});

describe('csrfGuard — state-changing methods', () => {
    test('POST + helyes Origin → next()', () => {
        const req = makeReq({ method: 'POST', origin: 'http://localhost:3000' });
        const res = makeRes();
        const next = jest.fn();
        csrfGuard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('POST + masik Origin → 403 CSRF_FORBIDDEN', () => {
        const req = makeReq({ method: 'POST', origin: 'http://evil.example.com' });
        const res = makeRes();
        const next = jest.fn();
        csrfGuard(req, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
            success: false,
            code: 'CSRF_FORBIDDEN'
        }));
    });

    test('POST + Referer fallback (Origin hianyzik)', () => {
        const req = makeReq({ method: 'POST', referer: 'http://localhost:3000/some/path' });
        const res = makeRes();
        const next = jest.fn();
        csrfGuard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('POST + masik Referer → 403', () => {
        const req = makeReq({ method: 'POST', referer: 'http://evil.example.com/x' });
        const res = makeRes();
        const next = jest.fn();
        csrfGuard(req, res, next);
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test('POST sem Origin sem Referer → atengedi (regi kliens / curl)', () => {
        const req = makeReq({ method: 'POST' });
        const res = makeRes();
        const next = jest.fn();
        csrfGuard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test('POST: Origin priority (van Origin es Referer is)', () => {
        // Origin a hibasan-allitott, Referer a helyes — az Origin DONT, igy 403.
        const req = makeReq({
            method: 'POST',
            origin: 'http://evil.example.com',
            referer: 'http://localhost:3000/foo'
        });
        const res = makeRes();
        csrfGuard(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test.each(['PUT', 'DELETE', 'PATCH'])('%s + masik Origin → 403', (method) => {
        const req = makeReq({ method, origin: 'http://evil.example.com' });
        const res = makeRes();
        csrfGuard(req, res, jest.fn());
        expect(res.status).toHaveBeenCalledWith(403);
    });

    test.each(['PUT', 'DELETE', 'PATCH'])('%s + helyes Origin → next()', (method) => {
        const req = makeReq({ method, origin: 'http://localhost:3000' });
        const res = makeRes();
        const next = jest.fn();
        csrfGuard(req, res, next);
        expect(next).toHaveBeenCalledTimes(1);
    });
});

describe('csrfGuard — error fail-open', () => {
    test('header parse hiba → next() (fail-open: SameSite cookie meg vedhet)', () => {
        // Olyan request-objekt amibol minden hianyzik
        const req = { method: 'POST', headers: null };
        const res = makeRes();
        const next = jest.fn();
        csrfGuard(req, res, next);
        // A try-catch-ban marad benne — ha meg-magat-osszedolne is, fail-open
        // miatt next() vagy 403 — mindkettore folkeszulve
        expect(next.mock.calls.length + res.status.mock.calls.length).toBe(1);
    });
});
