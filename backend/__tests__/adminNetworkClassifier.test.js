/**
 * api/admin/networkClassifier.js — IP klasszifikalas + UA parser + risk score.
 */

const { classifyIp, parseUserAgent, classifyRisk } = require('../api/admin/networkClassifier.js');

describe('classifyIp — loopback / private / docker / link-local', () => {
    test('IPv4 loopback', () => {
        expect(classifyIp('127.0.0.1').category).toBe('loopback');
        expect(classifyIp('127.0.5.5').category).toBe('loopback');
    });

    test('IPv6 loopback (::1, ::ffff:127.0.0.1)', () => {
        expect(classifyIp('::1').category).toBe('loopback');
        expect(classifyIp('::ffff:127.0.0.1').category).toBe('loopback');
    });

    test('"localhost" string is loopback', () => {
        expect(classifyIp('localhost').category).toBe('loopback');
    });

    test('IPv4 private 10.x', () => {
        expect(classifyIp('10.0.0.5').category).toBe('private');
    });

    test('IPv4 private 192.168.x', () => {
        expect(classifyIp('192.168.1.1').category).toBe('private');
    });

    test('IPv4 private 172.16-31.x (RFC1918)', () => {
        expect(classifyIp('172.16.0.1').category).toBe('private');
        expect(classifyIp('172.31.255.255').category).toBe('private');
    });

    test('Docker network (172.17.x)', () => {
        expect(classifyIp('172.17.0.2').category).toBe('docker');
    });

    test('IPv4 link-local 169.254.x', () => {
        expect(classifyIp('169.254.0.1').category).toBe('link-local');
    });

    test('IPv6 link-local fe80', () => {
        expect(classifyIp('fe80::1').category).toBe('link-local');
    });

    test('IPv6 ULA fc00::/fd00::', () => {
        expect(classifyIp('fc00::1').category).toBe('private');
        expect(classifyIp('fd00::1').category).toBe('private');
    });

    test('null / undefined / "ismeretlen" / "" — unknown', () => {
        expect(classifyIp(null).category).toBe('unknown');
        expect(classifyIp(undefined).category).toBe('unknown');
        expect(classifyIp('').category).toBe('unknown');
        expect(classifyIp('ismeretlen').category).toBe('unknown');
    });

    test('publikus IPv4 (8.8.8.8) → public', () => {
        const r = classifyIp('8.8.8.8');
        expect(r.category).toBe('public');
    });

    test('mind a kategoria-elagazas eredmenyez label-t', () => {
        for (const ip of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.0.1', 'fe80::1', '8.8.8.8']) {
            const r = classifyIp(ip);
            expect(typeof r.label).toBe('string');
            expect(r.label.length).toBeGreaterThan(0);
        }
    });
});

describe('parseUserAgent', () => {
    test('Chrome detekcio', () => {
        const r = parseUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');
        expect(r.browser).toBe('Chrome');
        expect(r.os).toBe('Windows');
    });

    test('Firefox detekcio', () => {
        const r = parseUserAgent('Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/120.0');
        expect(r.browser).toBe('Firefox');
        expect(r.os).toBe('Linux');
    });

    test('Safari (csak Safari, NEM Chrome)', () => {
        const r = parseUserAgent('Mozilla/5.0 (Macintosh; Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15');
        expect(r.browser).toBe('Safari');
        expect(r.os).toBe('macOS');
    });

    test('Edge detekcio (Edg/ string)', () => {
        const r = parseUserAgent('Mozilla/5.0 Chrome/120.0 Edg/120.0');
        expect(r.browser).toBe('Edge');
    });

    test('iOS detekcio', () => {
        const r = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari');
        expect(r.os).toBe('iOS');
    });

    test('Android detekcio', () => {
        const r = parseUserAgent('Mozilla/5.0 (Linux; Android 13) Chrome/120.0');
        expect(r.os).toBe('Android');
    });

    test('null / undefined / ures → "—" placeholder', () => {
        for (const ua of [null, undefined, '']) {
            const r = parseUserAgent(ua);
            expect(r.display).toBe('—');
        }
    });

    test('display = "browser / os" formatum', () => {
        const r = parseUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0');
        expect(r.display).toBe('Chrome / Windows');
    });

    test('icon mezo mindig string', () => {
        const r = parseUserAgent('foo bar');
        expect(typeof r.icon).toBe('string');
    });

    // Bovitett detektor: a chromium-szarmaztatott bongeszok mind tartalmazzak
    // a "Chrome/" UA-string-et, ezert a sorrend kritikus — a specifikus jelolot
    // (Vivaldi/, Brave/, SamsungBrowser/ stb.) ELOBB kell ellenoriznunk.
    test('Vivaldi (Chromium-szarmazek, NEM Chrome)', () => {
        const r = parseUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36 Vivaldi/6.5.3206.50');
        expect(r.browser).toBe('Vivaldi');
    });

    test('Brave (Chromium-szarmazek, NEM Chrome)', () => {
        const r = parseUserAgent('Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0 Safari/537.36 Brave/1.62.156');
        expect(r.browser).toBe('Brave');
    });

    test('Samsung Internet (Chromium-szarmazek, NEM Chrome)', () => {
        const r = parseUserAgent('Mozilla/5.0 (Linux; Android 13) SamsungBrowser/23.0 Chrome/115.0 Mobile Safari/537.36');
        expect(r.browser).toBe('Samsung Internet');
        expect(r.os).toBe('Android');
    });

    test('Yandex Browser', () => {
        const r = parseUserAgent('Mozilla/5.0 (Windows NT 10.0) YaBrowser/24.1.0 Chrome/120.0');
        expect(r.browser).toBe('Yandex');
    });

    test('UC Browser', () => {
        const r = parseUserAgent('Mozilla/5.0 (Linux; Android 13) UCBrowser/13.4.0 Chrome/120.0');
        expect(r.browser).toBe('UC Browser');
    });

    test('Chromium (NEM Chrome)', () => {
        const r = parseUserAgent('Mozilla/5.0 (X11; Linux) Chromium/120.0 Chrome/120.0 Safari/537.36');
        expect(r.browser).toBe('Chromium');
    });

    test('curl CLI', () => {
        const r = parseUserAgent('curl/8.4.0');
        expect(r.browser).toBe('curl');
    });

    test('Postman runtime', () => {
        const r = parseUserAgent('PostmanRuntime/7.36.1');
        expect(r.browser).toBe('Postman');
    });

    test('ChromeOS detekcio', () => {
        const r = parseUserAgent('Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) Chrome/120.0 Safari/537.36');
        expect(r.os).toBe('ChromeOS');
        expect(r.browser).toBe('Chrome');
    });

    test('FreeBSD detekcio', () => {
        const r = parseUserAgent('Mozilla/5.0 (X11; FreeBSD amd64) Firefox/120.0');
        expect(r.os).toBe('FreeBSD');
    });

    test('OpenBSD detekcio', () => {
        const r = parseUserAgent('Mozilla/5.0 (X11; OpenBSD amd64) Firefox/120.0');
        expect(r.os).toBe('OpenBSD');
    });

    test('Ubuntu specifikus (NEM csak Linux)', () => {
        const r = parseUserAgent('Mozilla/5.0 (X11; Ubuntu; Linux x86_64) Firefox/120.0');
        expect(r.os).toBe('Ubuntu');
    });

    test('iPad / iPod is iOS', () => {
        expect(parseUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari').os).toBe('iOS');
        expect(parseUserAgent('Mozilla/5.0 (iPod touch; CPU iPhone OS 17_0 like Mac OS X) Safari').os).toBe('iOS');
    });
});

describe('classifyRisk', () => {
    test('login_failed → high', () => {
        expect(classifyRisk({ event_type: 'login_failed' })).toBe('high');
        expect(classifyRisk({ eventType: 'login_failed' })).toBe('high');
    });

    test('warning / error / critical severity → medium', () => {
        for (const sev of ['warning', 'error', 'critical']) {
            expect(classifyRisk({ severity: sev })).toBe('medium');
        }
    });

    test('info severity → low', () => {
        expect(classifyRisk({ severity: 'info' })).toBe('low');
    });

    test('null / undefined / nincs row → low', () => {
        expect(classifyRisk(null)).toBe('low');
        expect(classifyRisk(undefined)).toBe('low');
        expect(classifyRisk({})).toBe('low');
    });
});
