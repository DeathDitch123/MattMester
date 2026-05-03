// Kozos helper-ek a szet bontott admin sub-router-ek szamara.
// Eredetileg az admin.js top-level scope-jaban voltak — a szetbontas utan
// itt egyetlen helyen exportaljuk, hogy nincs duplikat es nincs hianyzo
// reference.

function escapeCsvValue(value) {
    const normalized = value === null || value === undefined ? '' : String(value);
    return `"${normalized.replace(/"/g, '""')}"`;
}

module.exports = {
    escapeCsvValue
};
