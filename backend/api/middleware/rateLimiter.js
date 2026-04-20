const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

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
        keyGenerator,
        code = ''
    } = options;

    const limiterConfig = {
        windowMs,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests,
        handler: (request, response) => {
            let payload = { success: false, message };
            if (code) {
                payload.code = code;
            }
            return response.status(429).json(payload);
        }
    };

    if (typeof keyGenerator === 'function') {
        limiterConfig.keyGenerator = keyGenerator;
    }

    return rateLimit(limiterConfig);
}

// Bejelentkezett userhez userId-alapú kulcs, különben IPv6-biztos IP kulcs.
// Így egy támadó nem kerülheti meg a limitet IP-váltással, és nem limitálódnak
// együtt a közös IP mögötti különböző felhasználók sem.
function userOrIpKeyGenerator(request, response) {
    let key;
    try {
        const userId = Number(request.session?.userId) || 0;
        if (userId > 0) {
            key = `uid:${userId}`;
        } else {
            key = `ip:${ipKeyGenerator(request, response)}`;
        }
    } catch (error) {
        console.warn('userOrIpKeyGenerator hiba, fallback IP-re:', error.message);
        key = `ip:${ipKeyGenerator(request, response)}`;
    }
    return key;
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

// Profil adatmódosítás (username / email / jelszó): 15 perces ablakban max 10 próbálkozás
// felhasználónként. Védelem bcrypt-intenzív endpoint abuzálása ellen.
const profileUpdateLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 10,
    keyGenerator: userOrIpKeyGenerator,
    message: 'Túl sok profilmódosítási kérés. Próbáld újra később.'
});

// Profilkép feltöltés: 15 perces ablakban max 8 feltöltés felhasználónként.
// Védelem disk-spam / storage-abuzálás ellen.
const profileImageUploadLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 8,
    keyGenerator: userOrIpKeyGenerator,
    message: 'Túl sok képfeltöltés. Próbáld újra néhány perc múlva.'
});

// Profilkép eltávolítás (default-ra állítás): 15 perces ablakban max 15 művelet
// felhasználónként. Védelem upload/remove toggle-spam ellen.
const profileImageRemoveLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 15,
    keyGenerator: userOrIpKeyGenerator,
    message: 'Túl sok profilkép művelet. Próbáld újra később.'
});

// Profil törlés: 1 órás ablakban max 5 próbálkozás felhasználónként.
// Bcrypt-ellenőrzős és destruktív endpoint, szigorú limit.
const profileDeleteLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 5,
    keyGenerator: userOrIpKeyGenerator,
    message: 'Túl sok profil-törlési kísérlet. Próbáld újra később.'
});

// Barát műveletek (add / accept / reject / block / unblock / remove):
// 1 perces ablakban max 20 művelet felhasználónként — kényelmi UI-ra elég,
// de spam / social graph flood ellen véd.
const friendActionLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: userOrIpKeyGenerator,
    message: 'Túl sok barát művelet rövid idő alatt. Próbáld újra később.'
});

// Játékos keresés: 1 perces ablakban max 30 keresés felhasználónként.
// Védelem username-enumeráció és DB-flood ellen.
const playerSearchLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: userOrIpKeyGenerator,
    message: 'Túl sok keresés rövid idő alatt. Próbáld újra később.'
});

// Chat üzenetküldés (HTTP-szintű kiegészítő védelem a per-user Map-es limit mellé):
// 10 másodperces ablakban max 10 kérés felhasználónként. A tényleges
// üzenet-ráta limitet a chatUtils számolja, ez a réteg burst-védelmet ad.
const chatMessageLimiter = createRateLimiter({
    windowMs: 10 * 1000,
    max: 10,
    keyGenerator: userOrIpKeyGenerator,
    message: 'Túl sok üzenet rövid idő alatt. Próbáld újra később.'
});

// Összes eszközről kijelentkezés: 15 perces ablakban max 5 művelet felhasználónként.
// Az endpoint a teljes session-store-on iterál (O(n)), így abuzálható DoS vektor.
const logoutAllDevicesLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: userOrIpKeyGenerator,
    message: 'Túl sok kijelentkezés-minden-eszközről kísérlet. Próbáld újra később.'
});

// Privát beszélgetés megnyitás: 1 perces ablakban max 15 művelet felhasználónként.
// Védelem conversation-spam ellen.
const chatDirectOpenLimiter = createRateLimiter({
    windowMs: 60 * 1000,
    max: 15,
    keyGenerator: userOrIpKeyGenerator,
    message: 'Túl sok beszélgetés-megnyitási kérés. Próbáld újra később.'
});

// Email verifikáció újraküldés: 15 perces ablakban max 5 kérés felhasználónként / IP-nként.
// Védelem email-spam és bcrypt-free bulk abuse ellen.
const emailVerifyResendLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: userOrIpKeyGenerator,
    message: 'Túl sok verifikációs email újraküldés. Próbáld újra 15 perc múlva.',
    code: 'EMAIL_RESEND_RATE_LIMIT'
});

// Email verifikáció link megnyitás (GET verify): 15 perces ablakban max 30 próbálkozás IP-nként.
// Védelem token-enumeráció ellen.
const emailVerifyConsumeLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: 'Túl sok verifikációs kísérlet. Próbáld újra később.'
});

// Jelszó-visszaállító email kérés: 1 órás ablakban max 3 kérés IP-nként.
const passwordResetRequestLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: 'Túl sok jelszó-visszaállítási kérés. Próbáld újra egy óra múlva.'
});

// Jelszó-visszaállító token ellenőrzés és jelszócsere.
const passwordResetTokenLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Túl sok jelszó-visszaállítási kísérlet. Próbáld újra később.'
});

module.exports = {
    createRateLimiter,
    userOrIpKeyGenerator,
    authLoginLimiter,
    authRegisterLimiter,
    verifyPasswordLimiter,
    profileUpdateLimiter,
    profileImageUploadLimiter,
    profileImageRemoveLimiter,
    profileDeleteLimiter,
    friendActionLimiter,
    playerSearchLimiter,
    chatMessageLimiter,
    chatDirectOpenLimiter,
    logoutAllDevicesLimiter,
    emailVerifyResendLimiter,
    emailVerifyConsumeLimiter,
    passwordResetRequestLimiter,
    passwordResetTokenLimiter
};
