// Egyszeru, fuggosegmentes ULID-szeru azonositok az admin audit request_id mezohoz.
// Cel: monoton novekvo, lexikografikusan rendezheto, urlsafe karakterek.
// 26 karakter, Crockford base32, 48 bit timestamp + 80 bit random.

const crypto = require('crypto');

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now, length) {
    let result = '';
    let value = now;
    for (let i = length - 1; i >= 0; i -= 1) {
        const mod = value % ENCODING_LEN;
        result = ENCODING.charAt(mod) + result;
        value = (value - mod) / ENCODING_LEN;
    }
    return result;
}

function encodeRandom(length) {
    let result = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i += 1) {
        result += ENCODING.charAt(bytes[i] % ENCODING_LEN);
    }
    return result;
}

function generateUlid() {
    let result = '';
    try {
        const now = Date.now();
        result = encodeTime(now, TIME_LEN) + encodeRandom(RANDOM_LEN);
    } catch (error) {
        console.error('generateUlid hiba:', error.message);
        // Fallback: nem-ULID, de meg mindig egyedi.
        result = `req_${Date.now()}_${Math.random().toString(36).slice(2, 12).toUpperCase()}`.padEnd(26, '0').slice(0, 26);
    }
    return result;
}

module.exports = { generateUlid };
