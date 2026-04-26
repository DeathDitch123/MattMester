// Admin endpoint rate limit + adaptive escalation check.
// ADMIN_PANEL.md §5 (Top 15, #4) + §7.2.
//
// Ket lepcso:
//   1. preCheckEscalation - ha az IP aktiv escalation alatt van, eleve 429.
//   2. createRateLimiter wrapper - az alap factory hivasa, kemenyebb max-szal.

const { createRateLimiter, userOrIpKeyGenerator } = require('../middleware/rateLimiter.js');
const adminRepo = require('../../sql/adminRepo.js');
const { getRequestIp } = require('./middleware.js');

async function preCheckEscalation(request, response, next) {
    let blocked = false;
    let escalationInfo = null;

    try {
        const ip = getRequestIp(request);
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
const adminBaseLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: userOrIpKeyGenerator,
    message: 'Tul sok admin keres rovid ido alatt. Probald ujra kesobb.',
    code: 'ADMIN_RATE_LIMIT'
});

const adminLimiterChain = [preCheckEscalation, adminBaseLimiter];

module.exports = {
    preCheckEscalation,
    adminBaseLimiter,
    adminLimiterChain
};
