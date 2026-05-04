// Site-wide beallitasok modul. Egysoros tabla (id=1), in-memory cache (TTL=30s).
// A maintenance + registration toggle middleware-ek olvassak ezt a cache-t,
// igy minden requestnel nincs DB query.
//
// Cache invalidation: az updateSettings() hivasanal frissul, illetve a TTL.

const { getPool } = require('../database.js');

const CACHE_TTL_MS = 30 * 1000;

let cached = null;
let cachedAt = 0;

const ALLOWED_LANGUAGES = new Set(['hu', 'en']);

function normalizeRow(row) {
    if (!row) return null;
    return {
        siteName: row.site_name,
        supportEmail: row.support_email,
        defaultLanguage: row.default_language,
        timezone: row.timezone,
        registrationEnabled: Boolean(row.registration_enabled),
        maintenanceMode: Boolean(row.maintenance_mode),
        updatedAt: row.updated_at,
        updatedBy: row.updated_by
    };
}

function defaultSettings() {
    return {
        siteName: 'MattMester',
        supportEmail: 'mattmester.support@gmail.com',
        defaultLanguage: 'hu',
        timezone: 'Europe/Budapest',
        registrationEnabled: true,
        maintenanceMode: false,
        updatedAt: null,
        updatedBy: null
    };
}

async function loadFromDb() {
    let pool;
    try {
        pool = getPool();
    } catch (_) {
        // getPool() most dob, ha nincs init pool — graceful fallback default-ra.
        return defaultSettings();
    }
    try {
        const [rows] = await pool.execute(
            `SELECT site_name, support_email, default_language, timezone,
                    registration_enabled, maintenance_mode, updated_at, updated_by
             FROM site_settings WHERE id = 1 LIMIT 1`
        );
        if (!rows.length) return defaultSettings();
        return normalizeRow(rows[0]);
    } catch (error) {
        console.warn('siteSettings.loadFromDb hiba:', error.message);
        return defaultSettings();
    }
}

async function getSettings() {
    const now = Date.now();
    if (cached && (now - cachedAt) < CACHE_TTL_MS) {
        return cached;
    }
    cached = await loadFromDb();
    cachedAt = now;
    return cached;
}

// Sync access — middleware-ek a hot-path-on hasznaljak. Ha meg nincs cache,
// false defaultok-kal jonnek vissza (azaz: maintenance OFF, registration ON).
function getSettingsCachedSync() {
    return cached || defaultSettings();
}

function invalidateCache() {
    cached = null;
    cachedAt = 0;
}

// Patch field-by-field validacio + UPDATE. Visszaadja a frissitett settings-t.
async function updateSettings(patch, adminUserId) {
    // getPool() dob ha nincs init — a hibaüzenet legacy kompatibilis marad
    // a meglévő frontend hibakezeléssel ('Adatbazis nem elerheto.').
    let pool;
    try {
        pool = getPool();
    } catch (_) {
        throw new Error('Adatbazis nem elerheto.');
    }

    const before = await getSettings();
    const updates = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(patch, 'siteName')) {
        const v = String(patch.siteName || '').trim();
        if (!v) throw new Error('Az oldal neve nem lehet ures.');
        if (v.length > 100) throw new Error('Az oldal neve max 100 karakter.');
        updates.push('site_name = ?');
        values.push(v);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'supportEmail')) {
        const v = String(patch.supportEmail || '').trim().toLowerCase();
        if (!v) throw new Error('A support email nem lehet ures.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error('Ervenytelen email cim formatum.');
        if (v.length > 150) throw new Error('A support email max 150 karakter.');
        updates.push('support_email = ?');
        values.push(v);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'defaultLanguage')) {
        const v = String(patch.defaultLanguage || '').trim().toLowerCase();
        if (!ALLOWED_LANGUAGES.has(v)) throw new Error('Tamogatott nyelvek: hu, en.');
        updates.push('default_language = ?');
        values.push(v);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'timezone')) {
        const v = String(patch.timezone || '').trim();
        if (!v) throw new Error('Az idozona nem lehet ures.');
        if (v.length > 64) throw new Error('Az idozona max 64 karakter.');
        updates.push('timezone = ?');
        values.push(v);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'registrationEnabled')) {
        updates.push('registration_enabled = ?');
        values.push(patch.registrationEnabled ? 1 : 0);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'maintenanceMode')) {
        updates.push('maintenance_mode = ?');
        values.push(patch.maintenanceMode ? 1 : 0);
    }

    if (updates.length === 0) {
        return before;
    }

    updates.push('updated_by = ?');
    values.push(Number(adminUserId) || null);

    await pool.execute(
        `UPDATE site_settings SET ${updates.join(', ')} WHERE id = 1`,
        values
    );

    invalidateCache();
    const after = await getSettings();
    return { before, after };
}

module.exports = {
    getSettings,
    getSettingsCachedSync,
    invalidateCache,
    updateSettings,
    defaultSettings
};
