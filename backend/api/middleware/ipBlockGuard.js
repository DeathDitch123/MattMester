// ipBlockGuard — request-szintu hard IP blokk middleware.
// Az admin a Riasztasok oldalrol blokkolhat IP-t (ip_blocks tabla),
// es ez a middleware mindenfele bejovo request-et 403-mal elutasit ha az IP blokkolt.
//
// Rendelkezesek:
//  - In-memory cache (60sec TTL) hogy ne hivjuk a DB-t minden request-en.
//  - Fail-open: DB hiba eseten engedi tovabb a kerest, csak loggol.
//  - cache invalidacio: az upsertIpBlock / removeIpBlock hivasa utan toroljuk az adott IP cache-jet.

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
    try {
        const ip = getRequestIpAddress(request);
        if (!ip || ip === 'ismeretlen') return next();

        // Loopback whitelist: dev kornyezetben nem zarjuk ki a fejlesztot.
        if (isLoopback(ip)) return next();

        const block = await getActiveIpBlockCached(ip);
        if (block) {
            return response.status(403).json({
                success: false,
                code: 'ip_blocked',
                message: 'Ezt az IP címet az adminisztrátorok blokkolták.',
                blockedUntil: block.blocked_until,
                reason: block.reason
            });
        }
        return next();
    } catch (error) {
        // Fail-open: a blokk-rendszer DB-hibaja ne csukja le a teljes oldalt.
        console.warn('ipBlockGuard fail-open:', error.message);
        return next();
    }
}

module.exports = {
    ipBlockGuard,
    invalidateIpBlockCache,
    clearIpBlockCache
};
