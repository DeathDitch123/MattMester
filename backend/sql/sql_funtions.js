const { getPool } = require('./database.js');

async function insertUser(username, passwordHash, email) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const query = 'INSERT INTO users (username, password_hash, email) VALUES (?, ?, ?)';
        const [userResult] = await connection.execute(query, [username, passwordHash, email]);
        const insertedUserId = userResult.insertId;

        const statsQuery = 'INSERT INTO statistics (user_id) VALUES (?)';
        await connection.execute(statsQuery, [insertedUserId]);

        await connection.commit();

        return userResult;
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            const duplicateMessage = error.sqlMessage || '';
            const message = duplicateMessage.includes('email')
                ? 'Ez az email cím már foglalt.'
                : 'Ez a felhasználónév már foglalt.';
            throw new Error(message);
        }
        throw new Error('Hiba történt a regisztráció során. Minden módosítás visszavonva.');
    }
    finally {
        connection.release();
    }
}
async function getUserByUsername(username) {
    const pool = getPool();
    const query = `SELECT id, username, email, password_hash, profile_image,
                          elo, elo_MM, elo_bullet, role, is_banned,
                          ban_reason, banned_until, last_active,
                          is_email_verified, created_at
                   FROM users WHERE username = ?`;
    try {
        const [rows] = await pool.execute(query, [username]);
        return rows[0];
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
}
async function getUserByEmail(mailAdress) {
    const pool = getPool();
    const query = `SELECT id, username, email, password_hash, profile_image,
                          elo, elo_MM, elo_bullet, role, is_banned,
                          ban_reason, banned_until, last_active,
                          is_email_verified, created_at
                   FROM users WHERE email = ?`;
    try {
        const [rows] = await pool.execute(query, [mailAdress]);
        return rows[0];
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
}
async function getLeaderBoardByElo() {
    const pool = getPool();
    const query = `SELECT id, username, elo, profile_image, last_active, created_at
                   FROM users
                   WHERE is_banned = FALSE
                   ORDER BY elo DESC
                   LIMIT 100`;
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
}

async function getLeaderBoardByMM() {
    const pool = getPool();
    const query = `SELECT id, username, elo_MM, profile_image, last_active, created_at
                   FROM users
                   WHERE is_banned = FALSE
                   ORDER BY elo_MM DESC
                   LIMIT 100`;
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
}

async function getLeaderBoardByBullet() {
    const pool = getPool();
    const query = `SELECT id, username, elo_bullet, profile_image, last_active, created_at
                   FROM users
                   WHERE is_banned = FALSE
                   ORDER BY elo_bullet DESC
                   LIMIT 100`;
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
}

async function getLeaderBoardByWinRate() {
    const pool = getPool();
    const query = `
        SELECT 
            u.id,
            u.username,
            u.elo,
            u.profile_image,
            ROUND(
                IFNULL(
                    (s.wins / NULLIF(s.wins + s.losses + s.draws, 0)) * 100, 
                    0
                ), 2
            ) AS winrate_percent,
            s.wins,
            s.losses,
            s.draws,
            u.last_active,
            u.created_at AS joined_at
        FROM 
            users u
        JOIN 
            statistics s ON u.id = s.user_id
        WHERE 
            u.is_banned = FALSE
        ORDER BY 
            u.elo DESC,
            winrate_percent DESC
        LIMIT 100;
        `;
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
}

async function getSessionUserById(userId) {
    const pool = getPool();
    const query = `
        SELECT
            u.id,
            u.username,
            u.email,
            u.role,
            u.profile_image,
            u.elo,
            u.elo_MM,
            u.elo_bullet,
            u.is_banned,
            u.ban_reason,
            u.banned_until,
            u.last_active,
            u.is_email_verified,
            u.created_at,
            COALESCE(s.wins, 0) AS wins,
            COALESCE(s.losses, 0) AS losses,
            COALESCE(s.draws, 0) AS draws,
            COALESCE(s.abilities_used, 0) AS abilities_used
        FROM users u
        LEFT JOIN statistics s ON s.user_id = u.id
        WHERE u.id = ?
        LIMIT 1
    `;

    const fallbackQuery = `
        SELECT
            u.id,
            u.username,
            u.email,
            u.role,
            u.profile_image,
            u.elo,
            NULL AS elo_MM,
            NULL AS elo_bullet,
            FALSE AS is_banned,
            NULL AS ban_reason,
            NULL AS banned_until,
            NULL AS last_active,
            FALSE AS is_email_verified,
            u.created_at,
            COALESCE(s.wins, 0) AS wins,
            COALESCE(s.losses, 0) AS losses,
            0 AS draws,
            COALESCE(s.abilities_used, 0) AS abilities_used
        FROM users u
        LEFT JOIN statistics s ON s.user_id = u.id
        WHERE u.id = ?
        LIMIT 1
    `;

    try {
        const [rows] = await pool.execute(query, [userId]);
        return rows[0];
    } catch (error) {
        if (error.code === 'ER_BAD_FIELD_ERROR') {
            const [rows] = await pool.execute(fallbackQuery, [userId]);
            return rows[0];
        }
        throw new Error('Hiba a session felhasznalo lekerdezese soran.');
    }
}

async function getUserAuthById(userId) {
    const pool = getPool();
    const query = 'SELECT id, username, email, password_hash FROM users WHERE id = ? LIMIT 1';
    try {
        const [rows] = await pool.execute(query, [userId]);
        return rows[0] || null;
    } catch (error) {
        throw new Error('Hiba a felhasznalo auth adatok lekerdezese soran.');
    }
}

async function updateUserProfileSettings(userId, updates) {
    const pool = getPool();
    const [currentRows] = await pool.execute('SELECT username, email FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!currentRows.length) {
        return {
            changed: false,
            usernameChanged: false,
            emailChanged: false,
            passwordChanged: false,
        };
    }

    const currentUser = currentRows[0];
    const fields = [];
    const params = [];
    const hasUsernameUpdate = Object.prototype.hasOwnProperty.call(updates, 'username')
        && typeof updates.username === 'string'
        && updates.username !== currentUser.username;
    const hasEmailUpdate = Object.prototype.hasOwnProperty.call(updates, 'email')
        && typeof updates.email === 'string'
        && updates.email !== currentUser.email;
    const hasPasswordUpdate = Object.prototype.hasOwnProperty.call(updates, 'passwordHash')
        && typeof updates.passwordHash === 'string'
        && updates.passwordHash.length > 0;

    if (hasUsernameUpdate) {
        fields.push('username = ?');
        params.push(updates.username);
    }

    if (hasEmailUpdate) {
        fields.push('email = ?');
        params.push(updates.email);
    }

    if (hasPasswordUpdate) {
        fields.push('password_hash = ?');
        params.push(updates.passwordHash);
    }

    if (fields.length === 0) {
        return {
            changed: false,
            usernameChanged: false,
            emailChanged: false,
            passwordChanged: false,
            username: currentUser.username,
            email: currentUser.email,
        };
    }

    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = ?`;
    params.push(userId);

    try {
        const [result] = await pool.execute(query, params);

        return {
            changed: result.changedRows > 0,
            usernameChanged: hasUsernameUpdate && result.changedRows > 0,
            emailChanged: hasEmailUpdate && result.changedRows > 0,
            passwordChanged: hasPasswordUpdate && result.changedRows > 0,
            username: updates.username,
            email: updates.email
        };
    } catch (error) {
        if (error?.code === 'ER_DUP_ENTRY') {
            if (error.sqlMessage?.includes('username')) {
                throw new Error('A felhasznalonev mar foglalt.');
            }
            if (error.sqlMessage?.includes('email')) {
                throw new Error('Az email cim mar foglalt.');
            }
            throw new Error('Duplikalt adat, a modositas nem mentheto.');
        }
        throw error;
    }
}

async function insertUserLog(userId, logData) {
    const pool = getPool();
    const metadataValue = logData.metadata == null ? null : JSON.stringify(logData.metadata);

    const query = `
        INSERT INTO user_logs (
            user_id,
            event_type,
            event_category,
            severity,
            source,
            success,
            metric_key,
            metric_value,
            metric_delta,
            details,
            metadata,
            occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
        userId,
        logData.eventType || 'profile_update',
        logData.eventCategory || 'profile',
        logData.severity || 'info',
        logData.source || 'backend',
        typeof logData.success === 'boolean' ? logData.success : null,
        logData.metricKey || null,
        typeof logData.metricValue === 'number' ? logData.metricValue : null,
        typeof logData.metricDelta === 'number' ? logData.metricDelta : null,
        logData.message || null,
        metadataValue,
        logData.occurredAt || new Date()
    ];

    try {
        await pool.execute(query, params);
    } catch (error) {
        throw new Error('Hiba a felhasznaloi log mentese soran.');
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
            u.elo,
            u.elo_MM,
            u.elo_bullet,
            u.is_banned,
            u.banned_until,
            u.last_active,
            u.created_at,
            COALESCE(s.wins, 0) AS wins,
            COALESCE(s.losses, 0) AS losses,
            COALESCE(s.draws, 0) AS draws,
            COALESCE(s.abilities_used, 0) AS total_abilities,
            IFNULL(ROUND((s.wins / NULLIF(s.wins + s.losses + s.draws, 0)) * 100, 1), 0) AS win_rate_percent,
            (SELECT ip_address FROM login_history WHERE user_id = u.id ORDER BY login_time DESC LIMIT 1) AS last_ip
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
        ORDER BY g.start_time DESC; -- Legfrissebbek elöl
        `;
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a szobák lekérdezése során.');
    }
}
//később ip csaláshoz esetleges szűréshez, vagy csak simán statisztikához, hogy melyik ip címről hány account van stb... bár ez utóbbi lehet, hogy nem annyira fontos, de majd meglátjuk
async function logLoginAttempt(userId, ipAddress, userAgent) {
    const pool = getPool();
    const query = 'INSERT INTO login_history (user_id, ip_address, user_agent) VALUES (?, ?, ?)';
    try {
        await pool.execute(query, [userId, ipAddress, userAgent]);
    } catch (error) {
        console.error('Hiba a login kísérlet naplózása során:', error);
    }
}
async function ipCollisionCheck(ipAddress) {
    const pool = getPool();
    const query = `SELECT user_id, COUNT(*) AS attempts FROM login_history WHERE ip_address = ? AND login_time > (NOW() - INTERVAL 1 HOUR) GROUP BY user_id HAVING attempts > 5`;
    try {
        const [rows] = await pool.execute(query, [ipAddress]);
        return rows;
    } catch (error) {
        throw new Error('Hiba az IP cím ütközés ellenőrzése során.');
    }
}
async function ipCollisions(){
    const pool = getPool();
    const query = `
        SELECT 
            ip_address, 
            COUNT(DISTINCT user_id) AS user_count, 
            GROUP_CONCAT(DISTINCT u.username SEPARATOR ', ') AS shared_accounts
        FROM 
            login_history lh
        JOIN 
            users u ON lh.user_id = u.id
        GROUP BY 
            ip_address
        HAVING 
            user_count > 1;
        `;
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba az IP cím ütközések lekérdezése során.');
    }
}

async function uploadProfileImage(userId, filename) {
    const pool = getPool();
    const query = 'INSERT INTO profile_image_uploads (user_id, filename, status) VALUES (?, ?, "pending")';
    try {
        const [result] = await pool.execute(query, [userId, filename]);
        return result.insertId;
    } catch (error) {
        throw new Error('Hiba a profil kep feltoltese soran.');
    }
}

async function getPendingProfileImages() {
    const pool = getPool();
    const query = `
        SELECT
            piu.id, piu.user_id, piu.filename, piu.upload_time, piu.status,
            u.username, u.profile_image AS current_image
        FROM profile_image_uploads piu
        JOIN users u ON piu.user_id = u.id
        WHERE piu.status = 'pending'
        ORDER BY piu.upload_time ASC
    `;
    try {
        const [rows] = await pool.execute(query);
        return rows;
    } catch (error) {
        throw new Error('Hiba a fuggo kepek lekerdezese soran.');
    }
}

async function approveProfileImage(uploadId, adminUserId) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            'SELECT user_id, filename, status FROM profile_image_uploads WHERE id = ? FOR UPDATE',
            [uploadId]
        );

        if (!rows.length) {
            throw new Error('A feltoltes nem talalhato.');
        }

        const upload = rows[0];
        if (upload.status !== 'pending') {
            throw new Error('Csak fuggo allapotu kep hagyhato jova.');
        }

        await connection.execute(
            'UPDATE users SET profile_image = ? WHERE id = ?',
            [upload.filename, upload.user_id]
        );

        await connection.execute(
            'UPDATE profile_image_uploads SET status = "approved", reviewed_by = ?, review_time = NOW(), review_note = NULL WHERE id = ?',
            [adminUserId, uploadId]
        );

        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        throw new Error(`Hiba a kep jovahagyasa soran: ${error.message}`);
    } finally {
        connection.release();
    }
}

async function rejectProfileImage(uploadId, adminUserId, reviewNote = null) {
    const pool = getPool();
    try {
        const [result] = await pool.execute(
            'UPDATE profile_image_uploads SET status = "rejected", reviewed_by = ?, review_time = NOW(), review_note = ? WHERE id = ? AND status = "pending"',
            [adminUserId, reviewNote, uploadId]
        );

        if (result.affectedRows === 0) {
            throw new Error('A kep nem talalhato vagy mar nem fuggo allapotu.');
        }

        return true;
    } catch (error) {
        throw new Error('Hiba a kep elutasitasa soran.');
    }
}

async function getUserProfileImage(userId) {
    const pool = getPool();
    const query = `SELECT profile_image FROM users WHERE id = ?`;
    try {
        const [rows] = await pool.execute(query, [userId]);
        return rows[0]?.profile_image || null;
    } catch (error) {
        throw new Error('Hiba a profil kep lekerdezese soran.');
    }
}

async function deleteUserProfileWithTransaction(userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [userRows] = await connection.execute(
            'SELECT id, username, role FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
            [userId]
        );

        if (!userRows.length) {
            throw new Error('A felhasznalo nem talalhato.');
        }

        const user = userRows[0];
        if (user.role === 'admin') {
            throw new Error('Admin profil nem torolheto.');
        }

        // A kapcsolt adatok explicit torlese nem bukik el akkor sem, ha 0 talalat van.
        // Ez akkor is ved, ha egy regi adatbazisban hianyosak az FK-k.
        await connection.execute('DELETE FROM user_logs WHERE user_id = ?', [userId]);
        await connection.execute('DELETE FROM login_history WHERE user_id = ?', [userId]);
        await connection.execute('DELETE FROM profile_image_uploads WHERE user_id = ?', [userId]);
        await connection.execute(
            'DELETE FROM friends WHERE user1_id = ? OR user2_id = ? OR action_user_id = ?',
            [userId, userId, userId]
        );

        await connection.execute('UPDATE games SET winner_id = NULL WHERE winner_id = ?', [userId]);
        await connection.execute('DELETE FROM moves WHERE player_id = ?', [userId]);
        await connection.execute('DELETE FROM ability_log WHERE player_id = ?', [userId]);
        await connection.execute('DELETE FROM games WHERE white_player_id = ? OR black_player_id = ?', [userId, userId]);
        await connection.execute('DELETE FROM statistics WHERE user_id = ?', [userId]);

        const [deleteResult] = await connection.execute('DELETE FROM users WHERE id = ?', [userId]);
        if (!deleteResult.affectedRows) {
            throw new Error('A profil torlese nem sikerult.');
        }

        await connection.commit();
        return {
            deleted: true,
            userId,
            username: user.username
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    insertUser,
    getUserByUsername,
    getUserByEmail,
    getLeaderBoardByElo,
    getLeaderBoardByMM,
    getLeaderBoardByBullet,
    getLeaderBoardByWinRate,
    getSessionUserById,
    getUserAuthById,
    updateUserProfileSettings,
    insertUserLog,
    getTotalUsers,
    getTotalGames,
    getOnlineGamesCount,
    getAllUsers,
    getAllRooms,
    logLoginAttempt,
    ipCollisionCheck,
    ipCollisions,
    uploadProfileImage,
    getPendingProfileImages,
    approveProfileImage,
    rejectProfileImage,
    getUserProfileImage,
    deleteUserProfileWithTransaction
};