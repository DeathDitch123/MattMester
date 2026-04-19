const rateLimit = require('express-rate-limit');

// Univerzális factory: bármely endpointra készíthető testreszabott rate limiter.
// Paraméterek: windowMs (időablak ms), max (kérések max száma), message (429-es válasz szövege),
// skipSuccessfulRequests (csak sikertelen válaszokat számol — brute-force védelemhez hasznos),
// keyGenerator (alapból IP; felülírható pl. userId vagy session-alapú kulcsra).
function createRateLimiter(options = {}) {
    const {
        windowMs = 15 * 60 * 1000,
        max = 30,
        message = 'Túl sok kérés. Próbáld újra később.',
        skipSuccessfulRequests = false,
        keyGenerator
    } = options;

    const limiterConfig = {
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests,
        handler: (request, response) => {
            return response.status(429).json({ success: false, message });
        }
    };

    if (typeof keyGenerator === 'function') {
        limiterConfig.keyGenerator = keyGenerator;
    }

    return rateLimit(limiterConfig);
}

// Bejelentkezés: 15 perces ablakban max 10 sikertelen próbálkozás IP-nként.
// Sikeres login nem számít bele — így nem zárjuk ki a jogos felhasználót.
const authLoginLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    message: 'Túl sok bejelentkezési kísérlet. Próbáld újra 15 perc múlva.'
});

// Regisztráció: 1 órás ablakban max 5 próbálkozás IP-nként (spam / bot védelem).
const authRegisterLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: 'Túl sok regisztrációs kísérlet. Próbáld újra egy óra múlva.'
});

// Jelenlegi jelszó ellenőrzése (settings modal): 15 perces ablakban max 10 sikertelen kísérlet.
const verifyPasswordLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    message: 'Túl sok jelszó-ellenőrzési kísérlet. Próbáld újra 15 perc múlva.'
});

module.exports = {
    createRateLimiter,
    authLoginLimiter,
    authRegisterLimiter,
    verifyPasswordLimiter
};
