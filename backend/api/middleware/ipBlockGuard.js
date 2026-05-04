// ipBlockGuard — request-szintu hard IP blokk middleware.
// Az admin a Riasztasok oldalrol blokkolhat IP-t (ip_blocks tabla),
// es ez a middleware mindenfele bejovo request-et 403-mal elutasit ha az IP blokkolt.
//
// Issue #1 (2026-05) — DISABLED. Mivel a szerver localhost-on fut, az IP-blokk
// rendszer ervenytelen (a tabla mindig ures, a loopback whitelist eddig is
// `next()`-elt minden ip-t). A middleware most azonnal `next()`-el ki, igy a
// teljes IP-blokk feature de-facto ki van kapcsolva.
// A `ip_blocks` tabla CREATE-je megmaradt regresszio-vedelemkent (a vele
// kapcsolt admin route + ban-cascade kod nem dob hibat ha a tabla letezik,
// csak nem hasznal semmit), de a request-szintu enforcement nullara csokkent.

const adminRepo = require('../../sql/adminRepo.js');
const { getRequestIpAddress } = require('../routes/_shared.js');

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // ip -> { value: blockObj|null, expires: timestamp }

// Localhost / loopback addresses — fejlesztoi safety net, hogy az admin nem tudja
// magat kizarni dev kornyezetbol. Production-ben sem indokolt loopback-et blokkolni.
const LOOPBACK_IPS = new Set([
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'localhost'
]);

function isLoopback(ip) {
    if (!ip) return false;
    const normalized = String(ip).toLowerCase();
    return LOOPBACK_IPS.has(normalized) || normalized.startsWith('127.');
}

function invalidateIpBlockCache(ipAddress) {
    if (!ipAddress) return;
    cache.delete(String(ipAddress));
}

function clearIpBlockCache() {
    cache.clear();
}

async function getActiveIpBlockCached(ipAddress) {
    const key = String(ipAddress);
    const cached = cache.get(key);
    const now = Date.now();
    if (cached && cached.expires > now) {
        return cached.value;
    }
    const value = await adminRepo.getActiveIpBlock(ipAddress);
    cache.set(key, { value: value || null, expires: now + CACHE_TTL_MS });
    return value || null;
}

async function ipBlockGuard(request, response, next) {
    // Issue #1 — DISABLED. Localhost-only deploy-ban az IP-blokk feature
    // ertelmetlen (lasd file-szintu doc-blokk). A middleware azonnal next()-el.
    // Az admin endpoint-ok megmaradnak (felesleges UI-ramekek nelkul az admin
    // panel hibat dobna), de tenyleges enforce nincs.
    return next();
}

module.exports = {
    ipBlockGuard,
    invalidateIpBlockCache,
    clearIpBlockCache
};
