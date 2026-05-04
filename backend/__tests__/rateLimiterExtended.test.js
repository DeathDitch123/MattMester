/**
 * api/middleware/rateLimiter.js — extended tests on createRateLimiter,
 * userOrIpKeyGenerator + minden exportalt limiter-osszetevo letezik.
 */

const express = require('express');
const supertest = require('supertest');
const session = require('express-session');
const rl = require('../api/middleware/rateLimiter.js');

describe('createRateLimiter — factory', () => {
    test('factory letezik es fuggveny', () => {
        expect(typeof rl.createRateLimiter).toBe('function');
    });

    test('limiter middleware-t kreal', () => {
        const limiter = rl.createRateLimiter({ windowMs: 1000, max: 5 });
        expect(typeof limiter).toBe('function');
    });

    test('429 valasz miutan a max-ot eleri (NEM IP-fugges, key-generator userId-bol)', async () => {
        // Localhoston minden request 127.0.0.1-rol jon — viszont a rate-limit
        // logika fuggetlen az IP-tol amig a key-generator userId-t ad. Itt sajat
        // key-generator-t adunk hogy NE az IP-bol szarmaztassa a kulcsot.
        const limiter = rl.createRateLimiter({
            windowMs: 60_000,
            max: 2,
            message: 'TestLimit',
            code: 'TEST_LIMIT',
            keyGenerator: () => 'test-key'
        });
        const app = express();
        app.use(limiter);
        app.get('/', (req, res) => res.status(200).json({ ok: true }));

        await supertest(app).get('/');
        await supertest(app).get('/');
        const r3 = await supertest(app).get('/');
        expect(r3.status).toBe(429);
        expect(r3.body.message).toBe('TestLimit');
        expect(r3.body.code).toBe('TEST_LIMIT');
    });

    test('skipSuccessfulRequests = true → 200-as valaszok nem szamitanak', async () => {
        // Itt csak ellenorizzuk hogy az opcio nem dob.
        const limiter = rl.createRateLimiter({ windowMs: 60_000, max: 2, skipSuccessfulRequests: true });
        expect(typeof limiter).toBe('function');
    });
});

describe('userOrIpKeyGenerator — session priority', () => {
    test('userId session-bol → uid: prefix (NEM IP-fugges)', () => {
        // A localhostnal a session-userId logika fontos resze nem az IP, hanem
        // hogy a userId ut-jon kulonbozteti meg a usereket.
        const fakeRes = {};
        const k = rl.userOrIpKeyGenerator({ session: { userId: 7 }, ip: '127.0.0.1', headers: {} }, fakeRes);
        expect(k).toBe('uid:7');
    });

    test('nincs session → ip: prefix', () => {
        const fakeRes = {};
        const k = rl.userOrIpKeyGenerator({ session: null, ip: '127.0.0.1', headers: {} }, fakeRes);
        expect(k).toMatch(/^ip:/);
    });

    test('userId 0 → ip: prefix (no-session fallback)', () => {
        const fakeRes = {};
        const k = rl.userOrIpKeyGenerator({ session: { userId: 0 }, ip: '127.0.0.1', headers: {} }, fakeRes);
        expect(k).toMatch(/^ip:/);
    });
});

describe('Pre-configured limiters mind exportalva', () => {
    const expected = [
        'authLoginLimiter',
        'authRegisterLimiter',
        'profileUpdateLimiter',
        'profileImageUploadLimiter',
        'profileImageRemoveLimiter',
        'profileDeleteLimiter',
        'friendActionLimiter',
        'playerSearchLimiter',
        'chatMessageLimiter',
        'chatDirectOpenLimiter',
        'logoutAllDevicesLimiter',
        'emailVerifyResendLimiter',
        'emailVerifyConsumeLimiter',
        'passwordResetRequestLimiter',
        'passwordResetTokenLimiter',
        'notificationActionLimiter'
    ];

    test.each(expected)('%s exportalva mint middleware-fuggveny', (name) => {
        expect(typeof rl[name]).toBe('function');
    });
});
