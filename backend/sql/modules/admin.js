const { getPool } = require('../database.js');

// Admin altal vegzett user-mezo modositas. Ket tablat erint:
//   - users: username, email, role, is_email_verified, email_verified_at, elo, elo_MM, elo_bullet
//   - statistics: wins, losses, draws, abilities_used (kulon tabla, nincs FK kaszkad UPDATE-re)
// Tranzakcioban: elobb FOR UPDATE snapshot a JOIN-on, majd csak a valtozott mezokre UPDATE.
// Visszaadja a { before, after, changedKeys } objektumot az audit log-hoz.
async function adminUpdateUserCore(userId, changes = {}) {
    const pool = getPool();
    const connection = await pool.getConnection();
    const trimStr = (v) => String(v).trim();
    const allowedRoles = new Set(['player', 'admin']);
    const clampInt = (max) => (v) => {
        const n = Math.trunc(Number(v));
        if (!Number.isFinite(n) || n < 0) return 0;
        return Math.min(n, max);
    };
    const ELO_MAX = 9999;
    const STAT_MAX = 1_000_000;

    try {
        await connection.beginTransaction();

        const [userRows] = await connection.execute(
            `SELECT id, username, email, role, is_email_verified,
                    elo,
                    elo_classical AS elo_MM,
                    elo_blitz AS elo_bullet
             FROM users WHERE id = ? LIMIT 1 FOR UPDATE`,
            [userId]
        );
        if (!userRows.length) {
            await connection.rollback();
            const error = new Error('A felhasznalo nem talalhato.');
            error.code = 'USER_NOT_FOUND';
            throw error;
        }

        // statistics sor lehet hogy nincs — biztos ami biztos letrehozzuk uresen, hogy a FOR UPDATE
        // egy letezo sort lockoljon. (INSERT IGNORE — ha van, nem ir felul.)
        await connection.execute(
            'INSERT IGNORE INTO statistics (user_id, wins, losses, draws, abilities_used) VALUES (?, 0, 0, 0, 0)',
            [userId]
        );
        const [statRows] = await connection.execute(
            'SELECT wins, losses, draws, abilities_used FROM statistics WHERE user_id = ? LIMIT 1 FOR UPDATE',
            [userId]
        );
        const statRow = statRows[0] || { wins: 0, losses: 0, draws: 0, abilities_used: 0 };

        const before = {
            username: userRows[0].username,
            email: userRows[0].email,
            role: userRows[0].role,
            emailVerified: Boolean(userRows[0].is_email_verified),
            elo: Number(userRows[0].elo) || 0,
            eloMM: Number(userRows[0].elo_MM) || 0,
            eloBullet: Number(userRows[0].elo_bullet) || 0,
            wins: Number(statRow.wins) || 0,
            losses: Number(statRow.losses) || 0,
            draws: Number(statRow.draws) || 0,
            totalAbilities: Number(statRow.abilities_used) || 0
        };

        const userFields = [];
        const userParams = [];
        const changedKeys = [];

        const setUserIf = (key, column, raw, transform = (x) => x) => {
            if (raw === undefined) return;
            const next = transform(raw);
            if (next === before[key]) return;
            userFields.push(`${column} = ?`);
            userParams.push(next);
            changedKeys.push(key);
        };

        if (typeof changes.username === 'string') {
            const trimmed = trimStr(changes.username);
            if (trimmed.length < 3 || trimmed.length > 50) {
                await connection.rollback();
                throw new Error('A felhasznalonevnek 3 es 50 karakter kozott kell lennie.');
            }
            setUserIf('username', 'username', trimmed);
        }

        if (typeof changes.email === 'string') {
            const trimmed = trimStr(changes.email).toLowerCase();
            if (trimmed.length < 3 || trimmed.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
                await connection.rollback();
                throw new Error('Ervenytelen e-mail cim.');
            }
            setUserIf('email', 'email', trimmed);
        }

        if (typeof changes.role === 'string') {
            const trimmed = trimStr(changes.role);
            if (!allowedRoles.has(trimmed)) {
                await connection.rollback();
                throw new Error('Ervenytelen szerepkor.');
            }
            setUserIf('role', 'role', trimmed);
        }

        if (changes.emailVerified !== undefined) {
            const next = Boolean(changes.emailVerified);
            if (next !== before.emailVerified) {
                userFields.push('is_email_verified = ?');
                userParams.push(next ? 1 : 0);
                if (next) {
                    userFields.push('email_verified_at = NOW()');
                } else {
                    userFields.push('email_verified_at = NULL');
                }
                changedKeys.push('emailVerified');
            }
        }

        setUserIf('elo',       'elo',             changes.elo,       clampInt(ELO_MAX));
        setUserIf('eloMM',     'elo_classical',   changes.eloMM,     clampInt(ELO_MAX));
        setUserIf('eloBullet', 'elo_blitz',       changes.eloBullet, clampInt(ELO_MAX));

        const statFields = [];
        const statParams = [];
        const setStatIf = (key, column, raw) => {
            if (raw === undefined) return;
            const next = clampInt(STAT_MAX)(raw);
            if (next === before[key]) return;
            statFields.push(`${column} = ?`);
            statParams.push(next);
            changedKeys.push(key);
        };
        setStatIf('wins',           'wins',           changes.wins);
        setStatIf('losses',         'losses',         changes.losses);
        setStatIf('draws',          'draws',          changes.draws);
        setStatIf('totalAbilities', 'abilities_used', changes.totalAbilities);

        if (userFields.length === 0 && statFields.length === 0) {
            await connection.commit();
            return { changed: false, before, after: { ...before }, changedKeys: [] };
        }

        try {
            if (userFields.length > 0) {
                userParams.push(userId);
                await connection.execute(
                    `UPDATE users SET ${userFields.join(', ')} WHERE id = ?`,
                    userParams
                );
            }
            if (statFields.length > 0) {
                statParams.push(userId);
                await connection.execute(
                    `UPDATE statistics SET ${statFields.join(', ')} WHERE user_id = ?`,
                    statParams
                );
            }
        } catch (error) {
            await connection.rollback();
            if (error?.code === 'ER_DUP_ENTRY') {
                if (String(error.sqlMessage || '').includes('username')) {
                    throw new Error('A felhasznalonev mar foglalt.');
                }
                if (String(error.sqlMessage || '').includes('email')) {
                    throw new Error('Az e-mail cim mar foglalt.');
                }
                throw new Error('Duplikalt adat — a modositas nem menthető.');
            }
            throw error;
        }

        const after = { ...before };
        for (const key of changedKeys) {
            if (key === 'emailVerified') {
                after.emailVerified = Boolean(changes.emailVerified);
            } else if (key === 'username' || key === 'role') {
                after[key] = trimStr(changes[key]);
            } else if (key === 'email') {
                after.email = trimStr(changes.email).toLowerCase();
            } else if (key === 'elo' || key === 'eloMM' || key === 'eloBullet') {
                after[key] = clampInt(ELO_MAX)(changes[key]);
            } else if (key === 'wins' || key === 'losses' || key === 'draws' || key === 'totalAbilities') {
                after[key] = clampInt(STAT_MAX)(changes[key]);
            }
        }

        await connection.commit();
        return { changed: changedKeys.length > 0, before, after, changedKeys };
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        throw error;
    } finally {
        connection.release();
    }
}

async function getTotalUsers() {
    const pool = getPool();
    const query = 'SELECT COUNT(*) AS total FROM users';
    try {
        const [rows] = await pool.execute(query);
        return rows[0].total;
    } catch (error) {
        throw new Error('Hiba a felhasználók lekérdezése során.');
    }
}

async function getTotalGames() {
    const pool = getPool();
    const query = 'SELECT COUNT(*) AS total FROM games';
    try {
        const [rows] = await pool.execute(query);
        return rows[0].total;
    } catch (error) {
        throw new Error('Hiba a játékok lekérdezése során.');
    }
}

async function getOnlineGamesCount() {
    const pool = getPool();
    const query = 'SELECT COUNT(*) AS total FROM games WHERE status = "ongoing"';
    try {
        const [rows] = await pool.execute(query);
        return rows[0].total;
    } catch (error) {
        throw new Error('Hiba a játékok lekérdezése során.');
    }
}

async function getAllUsers() {
    const pool = getPool();
    const query = `
        SELECT
            u.id,
            u.username,
            u.email,
            u.role,
            u.profile_image,
            u.is_email_verified,
            u.email_verified_at,
            u.elo,
            u.elo_classical AS elo_MM,
            u.elo_blitz AS elo_bullet,
            u.is_banned,
            u.banned_until,
            u.pending_deletion_until,
            u.deleted_reason,
            u.last_active,
            u.created_at,
            (
                SELECT piu.status
                FROM profile_image_uploads piu
                WHERE piu.user_id = u.id
                ORDER BY piu.upload_time DESC, piu.id DESC
                LIMIT 1
            ) AS profile_image_status,
            COALESCE(s.wins, 0) AS wins,
            COALESCE(s.losses, 0) AS losses,
            COALESCE(s.draws, 0) AS draws,
            COALESCE(s.abilities_used, 0) AS total_abilities,
            IFNULL(ROUND((s.wins / NULLIF(s.wins + s.losses + s.draws, 0)) * 100, 1), 0) AS win_rate_percent,
            (SELECT ip_address FROM user_logs WHERE user_id = u.id AND event_type = 'login' ORDER BY occurred_at DESC LIMIT 1) AS last_ip
        FROM
            users u
        LEFT JOIN
            statistics s ON u.id = s.user_id
        ORDER BY
            u.last_active DESC;
        `;
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a felhasználók lekérdezése során.');
    }
}

async function getAllRooms() {
    const pool = getPool();
    const query = `
        SELECT
            g.id AS game_id,
            g.white_player_id,
            g.black_player_id,
            g.winner_id,
            w.username AS white_player,
            b.username AS black_player,
            win.username AS winner,
            g.status,
            g.time_control,
            g.initial_fen,
            g.current_fen,
            g.pgn,
            g.start_time,
            g.end_time,
            (SELECT COUNT(*) FROM ability_log WHERE game_id = g.id) AS abilities_used_in_game,
            (SELECT GROUP_CONCAT(CONCAT(sender.username, ': ', gc.message) SEPARATOR ' | ')
             FROM game_chats gc
             JOIN users sender ON gc.sender_id = sender.id
             WHERE gc.game_id = g.id) AS chat_history
        FROM
            games g
        JOIN users w ON g.white_player_id = w.id
        JOIN users b ON g.black_player_id = b.id
        LEFT JOIN users win ON g.winner_id = win.id
        ORDER BY g.start_time DESC;
        `;
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a szobák lekérdezése során.');
    }
}

// IP-utkozes ellenorzes: ugyanarrol az IP-rol indultak-e tobbszoros login kiserletek.
async function ipCollisionCheck(ipAddress) {
    const pool = getPool();
    const query = `
        SELECT user_id, COUNT(*) AS attempts
        FROM user_logs
        WHERE ip_address = ?
          AND event_type = 'login'
          AND occurred_at > (NOW() - INTERVAL 1 HOUR)
        GROUP BY user_id
        HAVING attempts > 5
    `;
    let result = [];
    try {
        const [rows] = await pool.execute(query, [ipAddress]);
        result = rows;
    } catch (error) {
        throw new Error('Hiba az IP cím ütközés ellenőrzése során.');
    }
    return result;
}

async function ipCollisions() {
    const pool = getPool();
    const query = `
        SELECT ul.ip_address,
               COUNT(DISTINCT ul.user_id) AS user_count,
               GROUP_CONCAT(DISTINCT u.username SEPARATOR ', ') AS shared_accounts
        FROM user_logs ul
        JOIN users u ON ul.user_id = u.id
        WHERE ul.event_type = 'login' AND ul.ip_address IS NOT NULL
        GROUP BY ul.ip_address
        HAVING user_count > 1
    `;
    let result = [];
    try {
        const [rows] = await pool.execute(query);
        result = rows;
    } catch (error) {
        throw new Error('Hiba az IP cím ütközések lekérdezése során.');
    }
    return result;
}

module.exports = {
    adminUpdateUserCore,
    getTotalUsers,
    getTotalGames,
    getOnlineGamesCount,
    getAllUsers,
    getAllRooms,
    ipCollisionCheck,
    ipCollisions
};
