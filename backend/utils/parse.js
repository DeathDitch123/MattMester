// ============================================================
// backend/utils/parse.js — szigoru input-validacio helperek
// ============================================================
// Egyetlen forras az API-ba bekerulo userId / pageSize / kategoria-tipusu
// inputok normalizalasara. A user feedback ("sok ellenorzes legyen az apiban")
// alapjan minden helper SZIGORU, expicit-elutasitas-elsodleges:
//   - boolean, array, object NEM koerszionalodik szamma
//   - prototype-pollution kulcsok (`__proto__`, `constructor`, stb.) elutasitva
//   - ures string / whitespace-only string elutasitva
//   - bound-less helperek mellett bounded valtozat is van (DOS vedelem)
// ============================================================

function parsePositiveInteger(value, fallback = null) {
    let result = fallback;
    const t = typeof value;
    if (t === 'number') {
        if (Number.isInteger(value) && value > 0) {
            result = value;
        }
    } else if (t === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0) {
            const parsed = Number(trimmed);
            if (Number.isInteger(parsed) && parsed > 0) {
                result = parsed;
            }
        }
    }
    return result;
}

/**
 * Bounded varians — ha az input ervenyes pozitiv integer ES min..max-ban van, visszaadja;
 * egyebkent fallback. A bound-elt validacio API DOS-vedelmi minimum (pl. limit=999999999
 * lekerdezesek megakadalyozasa).
 */
function parsePositiveIntegerInRange(value, min, max, fallback = null) {
    const parsed = parsePositiveInteger(value, null);
    let result = fallback;
    if (parsed !== null && parsed >= min && parsed <= max) {
        result = parsed;
    }
    return result;
}

/**
 * Bounded clamp varians — invalid eseten fallback, ervenyes-de-bounds-on-kivuli eseten
 * a min/max-hoz csapja. Hasznos pl. paginacio limit-jenel ahol "akarmit kuldjunk be a
 * kliens, kapjon 1..100 kozotti erteket" elv.
 */
function clampPositiveInteger(value, min, max, fallback = null) {
    const parsed = parsePositiveInteger(value, null);
    let result = fallback;
    if (parsed !== null) {
        if (parsed < min) result = min;
        else if (parsed > max) result = max;
        else result = parsed;
    }
    return result;
}

/**
 * Whitelist-validalt enum-string. NEM koerszional, NEM trim-el (a hivo tegye).
 * @param {*} value
 * @param {Set<string>|Array<string>} allowed
 * @param {string|null} fallback
 */
function parseEnumString(value, allowed, fallback = null) {
    let result = fallback;
    if (typeof value === 'string') {
        const allowedSet = (allowed instanceof Set) ? allowed : new Set(allowed);
        if (allowedSet.has(value)) {
            result = value;
        }
    }
    return result;
}

/**
 * Trim-elt non-empty string vagy fallback. Hossz-bound kotelezo (DOS-vedelmi minimum).
 * Prototype-pollution kulcsok (`__proto__`, `constructor`, `prototype`) elutasitva.
 */
function parseTrimmedString(value, maxLen, fallback = null) {
    let result = fallback;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.length > 0 && trimmed.length <= maxLen) {
            // Anti prototype-pollution: ha `__proto__`/`constructor`/`prototype` szerepel
            // a string-ben es ezt egy hivo objektum-kulcskent hasznalja, nehez bug. A
            // trim-elt vegeredmeny nem lehet pontosan ilyen.
            if (trimmed !== '__proto__' && trimmed !== 'constructor' && trimmed !== 'prototype') {
                result = trimmed;
            }
        }
    }
    return result;
}

/**
 * Boolean coerce normalize. Csak {true,false,"true","false",1,0,"1","0"} fogadhato el.
 * Minden mas → fallback. NEM koerszionalja az "yes"/"no" stb. szovegeket.
 */
function parseBooleanStrict(value, fallback = null) {
    let result = fallback;
    if (value === true || value === 1 || value === '1' || value === 'true') result = true;
    else if (value === false || value === 0 || value === '0' || value === 'false') result = false;
    return result;
}

module.exports = {
    parsePositiveInteger,
    parsePositiveIntegerInRange,
    clampPositiveInteger,
    parseEnumString,
    parseTrimmedString,
    parseBooleanStrict
};
