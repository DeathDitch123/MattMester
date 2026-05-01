// Admin endpoint rate limit + adaptive escalation check.
// ADMIN_PANEL.md §5 (Top 15, #4) + §7.2.
//
// Ket lepcso:
//   1. preCheckEscalation - ha az IP aktiv escalation alatt van, eleve 429.
//   2. createRateLimiter wrapper - az alap factory hivasa, kemenyebb max-szal.
//
// Loopback / localhost whitelist: dev kornyezetben (127.0.0.1, ::1, ::ffff:127.0.0.1)
// se rate limit, se escalation nem aktivalodik. Igy a sajatgepes admin tesztelesnel
// nem lockoljuk ki magunkat 12 percre.

const { createRateLimiter, userOrIpKeyGenerator } = require('../middleware/rateLimiter.js');
const adminRepo = require('../../sql/adminRepo.js');
const { getRequestIp } = require('./middleware.js');

const LOOPBACK_IPS = new Set([
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'localhost',
    'ismeretlen' // getRequestIp fallback (pl. tesztkornyezet, no socket)
]);

function isLoopbackIp(ip) {
    if (!ip) return false;
    const normalized = String(ip).trim().toLowerCase();
    if (LOOPBACK_IPS.has(normalized)) return true;
    // Privat halozati ranges (LAN / dev) is kihagyhato — pl. 192.168.x, 10.x, 172.16-31.x
    if (/^192\.168\./.test(normalized)) return true;
    if (/^10\./.test(normalized)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(normalized)) return true;
    if (/^::ffff:192\.168\./.test(normalized)) return true;
    if (/^::ffff:10\./.test(normalized)) return true;
    if (/^fe80:/.test(normalized)) return true; // link-local IPv6
    return false;
}

async function preCheckEscalation(request, response, next) {
    let blocked = false;
    let escalationInfo = null;

    try {
        const ip = getRequestIp(request);

        // Loopback / dev IP-eken nincs escalation, es a regi escalation sorokat is
        // azonnal toroljuk, hogy a "12 perc mulva" hiba ne maradjon meg ragacsos modon.
        if (isLoopbackIp(ip)) {
            try {
                if (typeof adminRepo.deleteRateEscalationsForScope === 'function') {
                    await adminRepo.deleteRateEscalationsForScope('ip', ip);
                }
            } catch (_) {}
            return next();
        }

        const escalation = await adminRepo.getActiveRateEscalation('ip', ip);
        if (escalation) {
            blocked = true;
            escalationInfo = escalation;
        }
    } catch (error) {
        console.warn('preCheckEscalation hiba:', error.message);
    }

    if (blocked) {
        response.status(429).json({
            success: false,
            code: 'ADMIN_RATE_ESCALATED',
            message: `Atmenetileg szigoritott rate limit aktiv ezen IP-re. Probald ujra ${Math.max(1, Math.ceil((new Date(escalationInfo.expires_at).getTime() - Date.now()) / 60000))} perc mulva.`,
            data: {
                multiplier: Number(escalationInfo.multiplier),
                expiresAt: new Date(escalationInfo.expires_at).toISOString()
            }
        });
    } else {
        next();
    }
}

// Admin-specifikus rate limiter: 1 perc / 60 keres user-szinten.
// Eszkalacioval kombinalva: ha aktiv az escalation, mar a preCheck dob 429-et.
// Loopback / privat halo IP-en a `skip` callback miatt egyaltalan nem korlatozunk.
const adminBaseLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: userOrIpKeyGenerator,
    message: 'Tul sok admin keres rovid ido alatt. Probald ujra kesobb.',
    code: 'ADMIN_RATE_LIMIT',
    skip: (request) => {
        try { return isLoopbackIp(getRequestIp(request)); } catch (_) { return false; }
    }
});

const adminLimiterChain = [preCheckEscalation, adminBaseLimiter];

module.exports = {
    preCheckEscalation,
    adminBaseLimiter,
    adminLimiterChain
};
