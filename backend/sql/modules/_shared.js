// Megosztott segedfuggvenyek es konstansok az SQL modulok kozott.
// Csak primitiv normalizaciot es konstans halmazokat tartalmaz, NEM fuggosegi
// pontot mas SQL modulok fele, igy biztonsagosan importalhato barhonnan.

const ALLOWED_NOTIFICATION_TARGET_ROLES = new Set(['player', 'admin']);

function normalizePositiveInt(value, fallback = 0) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

function normalizeListLimit(value, fallback = 20, max = 50) {
    const parsed = normalizePositiveInt(value, fallback);
    return Math.min(Math.max(parsed, 1), max);
}

module.exports = {
    ALLOWED_NOTIFICATION_TARGET_ROLES,
    normalizePositiveInt,
    normalizeListLimit
};
