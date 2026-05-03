// Kepessegek (abilities) admin CRUD modul. A jatekosok valasztanak kepesseget
// jatszma elott; az admin a tablat tudja kezelni (uj kepesseg, modositas, torles).
// Torlesnel az ability_log integritast vedjuk: ha mar valaha hasznalva volt,
// nem engedjuk torolni — csak rename/leiras-update.

const { getPool } = require('../database.js');

async function listAbilities() {
    const pool = getPool();
    const [rows] = await pool.execute(
        `SELECT a.id, a.name, a.description, a.cooldown_turns,
                COALESCE(u.cnt, 0) AS usage_count
         FROM abilities a
         LEFT JOIN (
             SELECT ability_id, COUNT(*) AS cnt
             FROM ability_log
             GROUP BY ability_id
         ) u ON u.ability_id = a.id
         ORDER BY a.id ASC`
    );
    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        cooldownTurns: row.cooldown_turns,
        usageCount: Number(row.usage_count) || 0
    }));
}

async function getAbilityById(id) {
    const pool = getPool();
    const [rows] = await pool.execute(
        `SELECT id, name, description, cooldown_turns
         FROM abilities WHERE id = ? LIMIT 1`,
        [Number(id) || 0]
    );
    if (!rows.length) return null;
    const row = rows[0];
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        cooldownTurns: row.cooldown_turns
    };
}

function validatePatch(patch) {
    const result = {};
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
        const v = String(patch.name || '').trim();
        if (!v) throw new Error('A nev nem lehet ures.');
        if (v.length > 100) throw new Error('A nev max 100 karakter.');
        result.name = v;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'description')) {
        const v = String(patch.description || '').trim();
        if (v.length > 2000) throw new Error('A leiras max 2000 karakter.');
        result.description = v;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'cooldownTurns')) {
        const v = Number(patch.cooldownTurns);
        if (!Number.isInteger(v) || v < 0 || v > 999) {
            throw new Error('A cooldown egesz szam 0 es 999 kozott.');
        }
        result.cooldown_turns = v;
    }
    return result;
}

async function createAbility(patch) {
    const fields = validatePatch(patch);
    if (!fields.name) throw new Error('A nev kotelezo.');
    const pool = getPool();
    try {
        const [result] = await pool.execute(
            `INSERT INTO abilities (name, description, cooldown_turns)
             VALUES (?, ?, ?)`,
            [fields.name, fields.description || null, Number.isInteger(fields.cooldown_turns) ? fields.cooldown_turns : 0]
        );
        return getAbilityById(result.insertId);
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            throw new Error('Ezzel a nevvel mar letezik kepesseg.');
        }
        throw error;
    }
}

async function updateAbility(id, patch) {
    const before = await getAbilityById(id);
    if (!before) throw new Error('A kepesseg nem talalhato.');

    const fields = validatePatch(patch);
    const updates = [];
    const values = [];
    for (const [col, val] of Object.entries(fields)) {
        updates.push(`${col} = ?`);
        values.push(val);
    }
    if (updates.length === 0) {
        return { before, after: before };
    }
    values.push(Number(id));
    const pool = getPool();
    try {
        await pool.execute(
            `UPDATE abilities SET ${updates.join(', ')} WHERE id = ?`,
            values
        );
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            throw new Error('Ezzel a nevvel mar letezik masik kepesseg.');
        }
        throw error;
    }
    const after = await getAbilityById(id);
    return { before, after };
}

async function deleteAbility(id) {
    const before = await getAbilityById(id);
    if (!before) throw new Error('A kepesseg nem talalhato.');

    const pool = getPool();
    const [usageRows] = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM ability_log WHERE ability_id = ?`,
        [Number(id)]
    );
    const usageCount = Number(usageRows?.[0]?.cnt) || 0;
    if (usageCount > 0) {
        const err = new Error(`Ez a kepesseg ${usageCount} alkalommal volt hasznalva — nem lehet torolni az adatintegritas vedelme miatt.`);
        err.code = 'ABILITY_IN_USE';
        throw err;
    }

    await pool.execute(`DELETE FROM abilities WHERE id = ?`, [Number(id)]);
    return { before, after: null };
}

module.exports = {
    listAbilities,
    getAbilityById,
    createAbility,
    updateAbility,
    deleteAbility
};
