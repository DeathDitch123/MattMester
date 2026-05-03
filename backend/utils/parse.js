// ============================================================
// backend/utils/parse.js — szam-normalizalo helperek (#38)
// ============================================================
// A regi parsePositiveInteger duplikalt definicio (api/routes/_shared.js +
// sockets.js) atkoltozve ide, igy egyetlen forras-igazsag van.
// A sql/modules/_shared.js normalizePositiveInt egyelore kulon (fallback=0
// default), de ha elindul az SQL repo-bontas, oda is athozhato.
// ============================================================

function parsePositiveInteger(value, fallback = null) {
    const parsed = Number(value);
    let result = fallback;
    if (Number.isInteger(parsed) && parsed > 0) {
        result = parsed;
    }
    return result;
}

module.exports = { parsePositiveInteger };
