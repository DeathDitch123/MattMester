// Helper az admin Bejelentkezesek oldalhoz.
//   1) classifyIp(ip)   -> { category, country, city, label }
//      - lokalis IP (loopback/private/docker/link-local/cgnat) -> kategorianek megfelelo cimke
//      - publikus IP -> geoip-lite lookup orszag + varos cimkere ('Budapest, HU')
//   2) parseUserAgent(ua) -> { browser, os, display, icon }
//   3) classifyRisk(row)  -> 'low' | 'medium' | 'high'
//
// A geoip-lite csomag offline IP -> orszag/varos DB-t hasznal (~50MB), nincs runtime API hivas.

const geoip = require('geoip-lite');

function classifyIp(ip) {
    const base = { category: 'unknown', country: null, countryName: null, city: null, label: '—' };
    if (!ip || ip === 'ismeretlen') return base;
    const lower = String(ip).toLowerCase().trim();

    // Loopback
    if (lower === '127.0.0.1' || lower === '::1' || lower === '::ffff:127.0.0.1' ||
        lower.startsWith('127.') || lower === 'localhost') {
        return { ...base, category: 'loopback', label: 'Szervergép' };
    }
    // Link-local IPv4
    if (/^169\.254\./.test(lower)) return { ...base, category: 'link-local', label: 'Link-local (APIPA)' };
    // Private IPv4 (RFC1918)
    if (/^10\./.test(lower)) return { ...base, category: 'private', label: 'Belső hálózat (10.x)' };
    if (/^192\.168\./.test(lower)) return { ...base, category: 'private', label: 'Belső hálózat (LAN)' };
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(lower)) {
        if (/^172\.17\./.test(lower)) return { ...base, category: 'docker', label: 'Docker hálózat' };
        return { ...base, category: 'private', label: 'Belső hálózat (172.x)' };
    }
    // IPv6 link-local
    if (/^fe[89ab][0-9a-f]:/i.test(lower)) return { ...base, category: 'link-local', label: 'IPv6 link-local' };
    // IPv6 ULA
    if (/^f[cd][0-9a-f]{2}:/i.test(lower)) return { ...base, category: 'private', label: 'Belső IPv6' };

    // Publikus (IPv4 vagy IPv6) — geoip-lite lookup. Megj.: a lookup a `::ffff:1.2.3.4`
    // mapped IPv6-hoz is mukodik (a libary kezeli). CGNAT (100.64.x) is itt fut le —
    // legtobbszor a telco orszagat adja vissza.
    const isIpv4 = /^\d+\.\d+\.\d+\.\d+$/.test(lower);
    const isIpv6 = lower.includes(':');
    if (!isIpv4 && !isIpv6) return base;

    let geo = null;
    try {
        geo = geoip.lookup(ip);
    } catch (_e) { /* lookup failure -> just unknown geo */ }

    if (geo && geo.country) {
        const country = String(geo.country).toUpperCase();
        const city = geo.city ? String(geo.city) : null;
        const label = city ? `${city}, ${country}` : country;
        return {
            category: 'public',
            country,
            countryName: country, // ISO kod; a frontend egyebkent is a kodot mutatja
            city,
            label
        };
    }
    return { ...base, category: 'public', label: 'Ismeretlen geoIP' };
}

// Bovitett bongeszo + OS detektor. A frontend dropdown csak a tenylegesen
// elofordulo (browser/OS) kombinaciokat kinalja, de a parser ennel tobb rendszert
// ismer fel — igy ha holnap egy SamsungBrowser kliens jelentkezik be, az is
// helyes neven jelenik meg, nem az "Egyéb" gyujto-cimkeben.
function parseUserAgent(ua) {
    if (!ua) return { browser: '—', os: '—', display: '—', icon: 'bi-question-circle' };
    const u = String(ua);

    // Browser sorrend kritikus: a specifikus chromium-szarmaztatasok (Edg, OPR,
    // Brave, Vivaldi, Samsung) ELOBB legyenek mint a Chrome/, mert mindegyik
    // tartalmazza a "Chrome/" string-et a sajat UA-jaban.
    let browser = 'Egyéb';
    let icon = 'bi-globe';
    if (/Edg\//i.test(u)) { browser = 'Edge'; icon = 'bi-browser-edge'; }
    else if (/OPR\/|Opera/i.test(u)) { browser = 'Opera'; icon = 'bi-globe'; }
    else if (/Vivaldi\//i.test(u)) { browser = 'Vivaldi'; icon = 'bi-globe'; }
    else if (/Brave\//i.test(u)) { browser = 'Brave'; icon = 'bi-globe'; }
    else if (/SamsungBrowser\//i.test(u)) { browser = 'Samsung Internet'; icon = 'bi-globe'; }
    else if (/YaBrowser\//i.test(u)) { browser = 'Yandex'; icon = 'bi-globe'; }
    else if (/UCBrowser\//i.test(u)) { browser = 'UC Browser'; icon = 'bi-globe'; }
    else if (/Chromium\//i.test(u)) { browser = 'Chromium'; icon = 'bi-browser-chrome'; }
    else if (/Chrome\//i.test(u)) { browser = 'Chrome'; icon = 'bi-browser-chrome'; }
    else if (/Firefox\//i.test(u)) { browser = 'Firefox'; icon = 'bi-browser-firefox'; }
    else if (/Safari\//i.test(u) && !/Chrome|Edg|OPR/i.test(u)) { browser = 'Safari'; icon = 'bi-browser-safari'; }
    else if (/curl\//i.test(u)) { browser = 'curl'; icon = 'bi-terminal'; }
    else if (/Wget\//i.test(u)) { browser = 'Wget'; icon = 'bi-terminal'; }
    else if (/PostmanRuntime\//i.test(u)) { browser = 'Postman'; icon = 'bi-terminal'; }
    else if (/node-fetch|axios|undici/i.test(u)) { browser = 'HTTP kliens'; icon = 'bi-terminal'; }

    // OS detektor — sorrend ugyanigy szamit (pl. Android elobb mint Linux,
    // mert az Android UA-k is tartalmazzak a "Linux" szot).
    let os = 'Egyéb';
    if (/Windows NT 10/i.test(u)) os = 'Windows';
    else if (/Windows NT/i.test(u)) os = 'Windows';
    else if (/Android/i.test(u)) os = 'Android';
    else if (/iPhone|iPad|iPod|iOS/i.test(u)) os = 'iOS';
    else if (/CrOS/i.test(u)) os = 'ChromeOS';
    else if (/Mac OS X|Macintosh/i.test(u)) os = 'macOS';
    else if (/Ubuntu/i.test(u)) os = 'Ubuntu';
    else if (/Fedora/i.test(u)) os = 'Fedora';
    else if (/Debian/i.test(u)) os = 'Debian';
    else if (/FreeBSD/i.test(u)) os = 'FreeBSD';
    else if (/OpenBSD/i.test(u)) os = 'OpenBSD';
    else if (/NetBSD/i.test(u)) os = 'NetBSD';
    else if (/X11|Linux/i.test(u)) os = 'Linux';

    return { browser, os, display: `${browser} / ${os}`, icon };
}

function classifyRisk(logRow) {
    if (!logRow) return 'low';
    const eventType = logRow.event_type || logRow.eventType;
    if (eventType === 'login_failed') return 'high';
    const sev = logRow.severity || 'info';
    if (sev === 'warning' || sev === 'error' || sev === 'critical') return 'medium';
    return 'low';
}

module.exports = {
    classifyIp,
    parseUserAgent,
    classifyRisk
};
