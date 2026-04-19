const { getPool } = require('./database.js');

const DEFAULT_PROFILE_IMAGE_PATH = '/profile_pictures/default.png';
const ALLOWED_PROFILE_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function isAllowedProfileImagePath(value) {
    if (typeof value !== 'string') {
        return false;
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized.startsWith('/profile_pictures/')) {
        return false;
    }
    if (normalized.includes('..')) {
        return false;
    }

    const extensionIndex = normalized.lastIndexOf('.');
    if (extensionIndex === -1) {
        return false;
    }

    const extension = normalized.slice(extensionIndex);
    return ALLOWED_PROFILE_IMAGE_EXTENSIONS.has(extension);
}

async function normalizeUserProfileImage(pool, userId, currentProfileImage, latestUploadStatus) {
    let normalizedProfileImage = currentProfileImage;

    if (!isAllowedProfileImagePath(normalizedProfileImage)) {
        normalizedProfileImage = DEFAULT_PROFILE_IMAGE_PATH;
    }

    if (latestUploadStatus === 'rejected') {
        normalizedProfileImage = DEFAULT_PROFILE_IMAGE_PATH;
    }

    if (normalizedProfileImage !== currentProfileImage) {
        await pool.execute('UPDATE users SET profile_image = ? WHERE id = ?', [normalizedProfileImage, userId]);
    }

    return normalizedProfileImage;
}

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
            (
                SELECT piu.status
                FROM profile_image_uploads piu
                WHERE piu.user_id = u.id
                ORDER BY piu.upload_time DESC, piu.id DESC
                LIMIT 1
            ) AS profile_image_status,
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
            NULL AS profile_image_status,
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
        if (!rows.length) {
            return null;
        }

        const dbUser = rows[0];
        const normalizedProfileImage = await normalizeUserProfileImage(
            pool,
            userId,
            dbUser.profile_image,
            dbUser.profile_image_status || null
        );

        dbUser.profile_image = normalizedProfileImage;
        dbUser.profile_image_status = normalizedProfileImage === DEFAULT_PROFILE_IMAGE_PATH
            ? 'default'
            : (dbUser.profile_image_status || 'approved');
        return dbUser;
    } catch (error) {
        if (error.code === 'ER_BAD_FIELD_ERROR') {
            const [rows] = await pool.execute(fallbackQuery, [userId]);
            if (!rows.length) {
                return null;
            }

            const dbUser = rows[0];
            const normalizedProfileImage = await normalizeUserProfileImage(
                pool,
                userId,
                dbUser.profile_image,
                null
            );

            dbUser.profile_image = normalizedProfileImage;
            dbUser.profile_image_status = normalizedProfileImage === DEFAULT_PROFILE_IMAGE_PATH
                ? 'default'
                : 'approved';
            return dbUser;
        }
        throw new Error('Hiba a session felhasznalo lekerdezese soran.');
    }
}

async function getPublicPlayerProfileById(targetUserId) {
    const pool = getPool();
    const query = `
        SELECT
            u.id,
            u.username,
            u.role,
            u.profile_image,
            (
                SELECT piu.status
                FROM profile_image_uploads piu
                WHERE piu.user_id = u.id
                ORDER BY piu.upload_time DESC, piu.id DESC
                LIMIT 1
            ) AS profile_image_status,
            u.created_at,
            u.last_active,
            u.elo,
            u.elo_MM,
            u.elo_bullet,
            COALESCE(s.wins, 0) AS wins,
            COALESCE(s.losses, 0) AS losses,
            COALESCE(s.draws, 0) AS draws,
            ROUND(
                IFNULL((COALESCE(s.wins, 0) / NULLIF(COALESCE(s.wins, 0) + COALESCE(s.losses, 0) + COALESCE(s.draws, 0), 0)) * 100, 0),
                2
            ) AS winrate_percent
        FROM users u
        LEFT JOIN statistics s ON s.user_id = u.id
        WHERE u.id = ?
          AND u.is_banned = FALSE
        LIMIT 1
    `;

    try {
        const [rows] = await pool.execute(query, [targetUserId]);
        if (!rows.length) {
            return null;
        }

        return rows[0];
    } catch (error) {
        console.error('Hiba a publikus játékos profil lekérdezése során:', error);
        throw new Error('Nem sikerült a játékos profil lekérése.');
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
    const metadata = logData.metadata || null;
    const ipAddress = logData.ipAddress || (metadata && metadata.ipAddress) || null;
    const userAgent = logData.userAgent || (metadata && metadata.userAgent) || null;
    const metadataValue = metadata == null ? null : JSON.stringify(metadata);
    let result = { insertId: null };

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
            message,
            ip_address,
            user_agent,
            metadata,
            occurred_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        ipAddress,
        userAgent,
        metadataValue,
        logData.occurredAt || new Date()
    ];

    try {
        const [insertResult] = await pool.execute(query, params);
        result = { insertId: insertResult.insertId };
    } catch (error) {
        throw new Error('Hiba a felhasznaloi log mentese soran.');
    }
    return result;
}

async function getUserSecurityActivity(userId, limit = 100) {
    const pool = getPool();
    const maxRows = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const query = `
        SELECT id, event_type, event_category, severity, success, message,
               ip_address, user_agent, metadata, occurred_at
        FROM user_logs
        WHERE user_id = ? AND event_category IN ('auth', 'security', 'profile', 'social')
        ORDER BY occurred_at DESC
        LIMIT ?
    `;
    let result = [];

    try {
        const [rows] = await pool.query(query, [userId, maxRows]);
        result = (rows || []).map((row) => {
            let metadata = null;
            if (row.metadata != null) {
                try {
                    metadata = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
                } catch (_error) {
                    metadata = null;
                }
            }
            return {
                id: `log-${row.id}`,
                occurredAt: row.occurred_at,
                eventType: row.event_type,
                eventCategory: row.event_category,
                severity: row.severity,
                success: row.success === null ? null : Boolean(row.success),
                message: row.message,
                ipAddress: row.ip_address || (metadata && metadata.ipAddress) || null,
                userAgent: row.user_agent || (metadata && metadata.userAgent) || null,
                metadata
            };
        });
    } catch (error) {
        throw new Error('Hiba a biztonsági napló lekérdezése során.');
    }
    return result;
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
        ORDER BY g.start_time DESC; -- Legfrissebbek elöl
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

async function uploadProfileImage(userId, filename) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [userRows] = await connection.execute('SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
        if (!userRows.length) {
            throw new Error('A felhasználó nem található.');
        }

        if (!isAllowedProfileImagePath(filename)) {
            throw new Error('Érvénytelen profilkép útvonal.');
        }

        const [insertResult] = await connection.execute(
            'INSERT INTO profile_image_uploads (user_id, filename, status, review_note) VALUES (?, ?, "pending", ?)',
            [userId, filename, 'Elbírálásra vár.']
        );

        await connection.execute('UPDATE users SET profile_image = ? WHERE id = ?', [filename, userId]);

        await connection.commit();
        return {
            uploadId: insertResult.insertId,
            status: 'pending',
            profileImage: filename
        };
    } catch (error) {
        await connection.rollback();
        if (error.message === 'A felhasználó nem található.' || error.message === 'Érvénytelen profilkép útvonal.') {
            throw error;
        }
        throw new Error('Hiba a profil kép feltöltése során.');
    } finally {
        connection.release();
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
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.execute(
            'SELECT user_id, filename, status FROM profile_image_uploads WHERE id = ? FOR UPDATE',
            [uploadId]
        );

        if (!rows.length) {
            throw new Error('A kép nem található vagy már nem függő állapotú.');
        }

        const upload = rows[0];
        if (upload.status !== 'pending') {
            throw new Error('A kép nem található vagy már nem függő állapotú.');
        }

        await connection.execute(
            'UPDATE profile_image_uploads SET status = "rejected", reviewed_by = ?, review_time = NOW(), review_note = ? WHERE id = ?',
            [adminUserId, reviewNote, uploadId]
        );

        await connection.execute(
            'UPDATE users SET profile_image = ? WHERE id = ? AND profile_image = ?',
            [DEFAULT_PROFILE_IMAGE_PATH, upload.user_id, upload.filename]
        );

        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        if (error.message === 'A kép nem található vagy már nem függő állapotú.') {
            throw error;
        }
        throw new Error('Hiba a kép elutasítása során.');
    } finally {
        connection.release();
    }
}

async function getUserProfileImage(userId) {
    const pool = getPool();
    const query = `SELECT profile_image FROM users WHERE id = ?`;
    try {
        const [rows] = await pool.execute(query, [userId]);
        const profileImage = rows[0]?.profile_image;
        if (!isAllowedProfileImagePath(profileImage)) {
            return DEFAULT_PROFILE_IMAGE_PATH;
        }
        return profileImage;
    } catch (error) {
        throw new Error('Hiba a profil kep lekerdezese soran.');
    }
}

async function resetUserProfileImageToDefault(userId) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [userRows] = await connection.execute(
            'SELECT profile_image FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
            [userId]
        );

        if (!userRows.length) {
            throw new Error('A felhasználó nem található.');
        }

        const currentProfileImage = userRows[0].profile_image;

        const [result] = await connection.execute(
            'UPDATE users SET profile_image = ? WHERE id = ?',
            [DEFAULT_PROFILE_IMAGE_PATH, userId]
        );

        if (!result.affectedRows) {
            throw new Error('A felhasználó nem található.');
        }

        if (isAllowedProfileImagePath(currentProfileImage) && currentProfileImage !== DEFAULT_PROFILE_IMAGE_PATH) {
            await connection.execute(
                'UPDATE profile_image_uploads SET status = "discarded", review_time = NOW(), review_note = ? WHERE user_id = ? AND filename = ? AND status IN ("pending", "approved")',
                ['A felhasználó eltávolította a profilképét.', userId, currentProfileImage]
            );
        }

        await connection.execute(
            'UPDATE profile_image_uploads SET status = "discarded", review_time = NOW(), review_note = ? WHERE user_id = ? AND status = "pending"',
            ['A felhasználó eltávolította a profilképét.', userId]
        );

        await connection.commit();

        return {
            profileImage: DEFAULT_PROFILE_IMAGE_PATH,
            profileImageStatus: 'default'
        };
    } catch (error) {
        await connection.rollback();
        if (error.message === 'A felhasználó nem található.') {
            throw error;
        }
        throw new Error('Hiba a profilkép eltávolítása során.');
    } finally {
        connection.release();
    }
}

async function getAndDeleteDiscardedProfileImages() {
    const pool = getPool();
    try {
        const [discardedRows] = await pool.execute(
            'SELECT id, filename FROM profile_image_uploads WHERE status IN ("discarded", "rejected")'
        );

        return discardedRows;
    } catch (error) {
        console.error('Hiba a discarded/rejected képek lekérdezése során:', error);
        return [];
    }
}

async function deleteDiscardedProfileImageRecord(uploadId) {
    const pool = getPool();
    try {
        const [result] = await pool.execute(
            'DELETE FROM profile_image_uploads WHERE id = ? AND status IN ("discarded", "rejected")',
            [uploadId]
        );

        return result.affectedRows > 0;
    } catch (error) {
        console.error(`Hiba a discarded/rejected kép (${uploadId}) törlése során:`, error);
        return false;
    }
}

async function deleteOrphanProfileImageUploadRecords() {
    const pool = getPool();
    try {
        const [result] = await pool.execute(
            `
                DELETE piu
                FROM profile_image_uploads piu
                LEFT JOIN users u ON u.profile_image = piu.filename
                WHERE (piu.filename IS NULL OR TRIM(piu.filename) = '')
                   OR (
                        piu.filename <> '/profile_pictures/default.png'
                    AND u.id IS NULL
                   )
            `
        );

        return Number(result.affectedRows || 0);
    } catch (error) {
        console.error('Hiba az arvahagyott profile_image_uploads rekordok torlese soran:', error);
        return 0;
    }
}

async function getAllProfileImageReferences() {
    const pool = getPool();
    try {
        const [userRows] = await pool.execute(
            'SELECT profile_image AS filename FROM users WHERE profile_image IS NOT NULL AND TRIM(profile_image) <> ""'
        );
        const [uploadRows] = await pool.execute(
            'SELECT filename FROM profile_image_uploads WHERE filename IS NOT NULL AND TRIM(filename) <> ""'
        );

        const seen = new Set();
        const references = [];

        [...userRows, ...uploadRows].forEach((row) => {
            const filename = String(row.filename || '').trim();
            if (filename && !seen.has(filename)) {
                seen.add(filename);
                references.push(filename);
            }
        });

        return references;
    } catch (error) {
        console.error('Hiba a profilkep referencia lista lekerdezese soran:', error);
        return [];
    }
}
async function searchUsersByUsernameContains(searchText, currentUserId) {
    const pool = getPool();
    const query = `
        SELECT
            u.id,
            u.username,
            u.profile_image,
            CASE
                WHEN u.profile_image = '/profile_pictures/default.png' THEN 'default'
                ELSE COALESCE(
                    (
                        SELECT piu.status
                        FROM profile_image_uploads piu
                        WHERE piu.user_id = u.id
                        ORDER BY piu.upload_time DESC, piu.id DESC
                        LIMIT 1
                    ),
                    'approved'
                )
            END AS profile_image_status,
            CASE
                WHEN f.user1_id IS NOT NULL OR f.user2_id IS NOT NULL THEN f.status
                ELSE 'none'
            END AS friend_status
        FROM users u
        LEFT JOIN friends f ON (
            (u.id = f.user1_id AND ? = f.user2_id) OR
            (u.id = f.user2_id AND ? = f.user1_id)
        )
        WHERE u.username LIKE ?
          AND u.id <> ?
          AND u.is_banned = FALSE
        ORDER BY u.username ASC
    `;
    try {
        const [rows] = await pool.execute(query, [currentUserId, currentUserId, `%${searchText}%`, currentUserId]);
        return rows;
    } catch (error) {
        console.error('Hiba a felhasználó keresése során:', error);
        return [];
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



async function addFriendRequest(currentUserId, targetUserId) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        if (await isEitherUserBlocked(currentUserId, targetUserId, connection)) {
            throw new Error('A barát kérelem nem küldhető, mert valamelyik fél tiltásban van.');
        }

        // user1_id és user2_id normalizálása: user1_id < user2_id
        const [user1Id, user2Id] = normalizeFriendPair(currentUserId, targetUserId);

        // Ellenőrzés, van-e már barátkapcsolat
        const [existingRows] = await connection.execute(
            'SELECT status FROM friends WHERE user1_id = ? AND user2_id = ?',
            [user1Id, user2Id]
        );

        if (existingRows.length > 0) {
            const existingStatus = existingRows[0].status;
            if (existingStatus === 'pending' || existingStatus === 'accepted') {
                throw new Error('Már van függőben vagy fogadott barát kérelem.');
            }
            // Csak rejected rekordot lehet újra pendingre visszahozni.
            if (existingStatus === 'rejected') {
                await connection.execute(
                    'UPDATE friends SET status = ?, action_user_id = ?, invite_time = NOW() WHERE user1_id = ? AND user2_id = ?',
                    ['pending', currentUserId, user1Id, user2Id]
                );
            } else {
                throw new Error('A barát kapcsolat állapota miatt nem küldhető új kérelem.');
            }
        } else {
            // Új barát kérelem
            await connection.execute(
                'INSERT INTO friends (user1_id, user2_id, action_user_id, status) VALUES (?, ?, ?, ?)',
                [user1Id, user2Id, currentUserId, 'pending']
            );
        }

        await connection.commit();
        return { success: true, message: 'Barát kérelem elküldve.' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function getFriendStatus(currentUserId, targetUserId) {
    const pool = getPool();
    try {
        const [user1Id, user2Id] = normalizeFriendPair(currentUserId, targetUserId);
        
        const query = `
            SELECT status FROM friends 
            WHERE user1_id = ? AND user2_id = ?
        `;
        
        const [rows] = await pool.execute(query, [user1Id, user2Id]);
        return rows.length > 0 ? rows[0].status : 'none';
    } catch (error) {
        console.error('Hiba a friend status lekérdezése során:', error);
        return 'none';
    }
}

function normalizeFriendPair(firstUserId, secondUserId) {
    return [firstUserId, secondUserId].sort((a, b) => Number(a) - Number(b));
}

async function ensureFriendBlocksTable(executor) {
    try {
        await executor.execute(`
            CREATE TABLE IF NOT EXISTS friend_blocks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                blocker_user_id INT NOT NULL,
                blocked_user_id INT NOT NULL,
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_friend_block (blocker_user_id, blocked_user_id),
                CHECK (blocker_user_id <> blocked_user_id),
                FOREIGN KEY (blocker_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
    } catch (error) {
        throw new Error('Hiba a friend_blocks tabla letrehozasa soran.');
    }
}

async function isEitherUserBlocked(currentUserId, targetUserId, executor = null) {
    const db = executor || getPool();
    try {
        await ensureFriendBlocksTable(db);

        const [rows] = await db.execute(
            `
                SELECT id
                FROM friend_blocks
                WHERE active = TRUE
                  AND (
                    (blocker_user_id = ? AND blocked_user_id = ?)
                    OR
                    (blocker_user_id = ? AND blocked_user_id = ?)
                  )
                LIMIT 1
            `,
            [currentUserId, targetUserId, targetUserId, currentUserId]
        );

        return rows.length > 0;
    } catch (error) {
        throw new Error('Hiba a felhasznaloi tiltas ellenorzese soran.');
    }
}

function buildFriendListItem(row, relationStatus) {
    const normalizedStatus = String(relationStatus || 'none');
    const ownBlockActive = Boolean(Number(row.own_block_active || 0));
    const oppositeBlockActive = Boolean(Number(row.opposite_block_active || 0));
    const isBlockedContext = normalizedStatus.startsWith('blocked');

    return {
        userId: row.id,
        username: row.username,
        profileImage: row.profile_image || '/profile_pictures/default.png',
        profileImageStatus: row.profile_image_status || 'approved',
        relationStatus: normalizedStatus,
        canView: normalizedStatus === 'friends' || normalizedStatus === 'incoming_pending' || isBlockedContext,
        canAccept: normalizedStatus === 'incoming_pending',
        canReject: normalizedStatus === 'incoming_pending',
        canBlock: normalizedStatus === 'incoming_pending',
        canUnblock: ownBlockActive,
        canChat: normalizedStatus === 'friends',
        canDeleteFriend: normalizedStatus === 'friends',
        ownBlockActive,
        oppositeBlockActive,
        isBlockedContext
    };
}

async function getAcceptedFriendsForUser(userId) {
    const pool = getPool();
    try {
        await ensureFriendBlocksTable(pool);

        const query = `
            SELECT
                u.id,
                u.username,
                u.profile_image,
                CASE
                    WHEN u.profile_image = '/profile_pictures/default.png' THEN 'default'
                    ELSE COALESCE(
                        (
                            SELECT piu.status
                            FROM profile_image_uploads piu
                            WHERE piu.user_id = u.id
                            ORDER BY piu.upload_time DESC, piu.id DESC
                            LIMIT 1
                        ),
                        'approved'
                    )
                END AS profile_image_status
            FROM friends f
            JOIN users u ON (
                (f.user1_id = ? AND u.id = f.user2_id)
                OR
                (f.user2_id = ? AND u.id = f.user1_id)
            )
            LEFT JOIN friend_blocks own_block ON own_block.blocker_user_id = ? AND own_block.blocked_user_id = u.id AND own_block.active = TRUE
            LEFT JOIN friend_blocks opposite_block ON opposite_block.blocker_user_id = u.id AND opposite_block.blocked_user_id = ? AND opposite_block.active = TRUE
            WHERE (f.user1_id = ? OR f.user2_id = ?)
              AND f.status = 'accepted'
              AND own_block.id IS NULL
              AND opposite_block.id IS NULL
              AND u.is_banned = FALSE
            ORDER BY u.username ASC
        `;

        const [rows] = await pool.execute(query, [userId, userId, userId, userId, userId, userId]);
        return rows.map((row) => buildFriendListItem(row, 'friends'));
    } catch (error) {
        throw new Error('Hiba a baratlista lekerdezese soran.');
    }
}

async function getIncomingPendingFriendsForUser(userId) {
    const pool = getPool();
    try {
        await ensureFriendBlocksTable(pool);

        const query = `
            SELECT
                u.id,
                u.username,
                u.profile_image,
                CASE
                    WHEN u.profile_image = '/profile_pictures/default.png' THEN 'default'
                    ELSE COALESCE(
                        (
                            SELECT piu.status
                            FROM profile_image_uploads piu
                            WHERE piu.user_id = u.id
                            ORDER BY piu.upload_time DESC, piu.id DESC
                            LIMIT 1
                        ),
                        'approved'
                    )
                END AS profile_image_status
            FROM friends f
            JOIN users u ON (
                (f.user1_id = ? AND u.id = f.user2_id)
                OR
                (f.user2_id = ? AND u.id = f.user1_id)
            )
            LEFT JOIN friend_blocks own_block ON own_block.blocker_user_id = ? AND own_block.blocked_user_id = u.id AND own_block.active = TRUE
            LEFT JOIN friend_blocks opposite_block ON opposite_block.blocker_user_id = u.id AND opposite_block.blocked_user_id = ? AND opposite_block.active = TRUE
            WHERE (f.user1_id = ? OR f.user2_id = ?)
              AND f.status = 'pending'
              AND f.action_user_id <> ?
              AND own_block.id IS NULL
              AND opposite_block.id IS NULL
              AND u.is_banned = FALSE
            ORDER BY u.username ASC
        `;

        const [rows] = await pool.execute(query, [userId, userId, userId, userId, userId, userId, userId]);
        return rows.map((row) => buildFriendListItem(row, 'incoming_pending'));
    } catch (error) {
        throw new Error('Hiba a bejovo baratkerelmek lekerdezese soran.');
    }
}

async function getBlockedUsersForUser(userId) {
    const pool = getPool();
    try {
        await ensureFriendBlocksTable(pool);

        const query = `
            SELECT
                u.id,
                u.username,
                u.profile_image,
                CASE
                    WHEN u.profile_image = '/profile_pictures/default.png' THEN 'default'
                    ELSE COALESCE(
                        (
                            SELECT piu.status
                            FROM profile_image_uploads piu
                            WHERE piu.user_id = u.id
                            ORDER BY piu.upload_time DESC, piu.id DESC
                            LIMIT 1
                        ),
                        'approved'
                    )
                END AS profile_image_status
            FROM friend_blocks fb
            JOIN users u ON u.id = fb.blocked_user_id
            WHERE fb.blocker_user_id = ?
              AND fb.active = TRUE
              AND u.is_banned = FALSE
            ORDER BY u.username ASC
        `;

        const [rows] = await pool.execute(query, [userId]);
        return rows.map((row) => buildFriendListItem({ ...row, own_block_active: 1, opposite_block_active: 0 }, 'blocked_by_me'));
    } catch (error) {
        throw new Error('Hiba a tiltott felhasznalok lekerdezese soran.');
    }
}

async function getBlockedByThemForUser(userId) {
    const pool = getPool();
    try {
        await ensureFriendBlocksTable(pool);

        const query = `
            SELECT
                u.id,
                u.username,
                u.profile_image,
                CASE
                    WHEN u.profile_image = '/profile_pictures/default.png' THEN 'default'
                    ELSE COALESCE(
                        (
                            SELECT piu.status
                            FROM profile_image_uploads piu
                            WHERE piu.user_id = u.id
                            ORDER BY piu.upload_time DESC, piu.id DESC
                            LIMIT 1
                        ),
                        'approved'
                    )
                END AS profile_image_status
            FROM friend_blocks fb
            JOIN users u ON u.id = fb.blocker_user_id
            WHERE fb.blocked_user_id = ?
              AND fb.active = TRUE
              AND u.is_banned = FALSE
            ORDER BY u.username ASC
        `;

        const [rows] = await pool.execute(query, [userId]);
        return rows.map((row) => buildFriendListItem({ ...row, own_block_active: 0, opposite_block_active: 1 }, 'blocked_by_them'));
    } catch (error) {
        throw new Error('Hiba a masik fel altal tiltott lista lekerdezese soran.');
    }
}

async function getFriendListForUser(userId, filter = 'friend') {
    try {
        const normalizedFilter = String(filter || 'friend').trim().toLowerCase();

        if (normalizedFilter === 'friend') {
            return getAcceptedFriendsForUser(userId);
        }

        if (normalizedFilter === 'pending') {
            return getIncomingPendingFriendsForUser(userId);
        }

        if (normalizedFilter === 'blocked') {
            const [blockedByMe, blockedByThem] = await Promise.all([
                getBlockedUsersForUser(userId),
                getBlockedByThemForUser(userId)
            ]);

            const blockedMap = new Map();

            [...blockedByMe, ...blockedByThem].forEach((item) => {
                const current = blockedMap.get(item.userId);
                if (!current) {
                    blockedMap.set(item.userId, item);
                } else {
                    blockedMap.set(item.userId, {
                        ...current,
                        relationStatus: current.ownBlockActive && item.oppositeBlockActive
                            ? 'blocked_mutual'
                            : current.ownBlockActive
                                ? 'blocked_by_me'
                                : 'blocked_by_them',
                        ownBlockActive: Boolean(current.ownBlockActive || item.ownBlockActive),
                        oppositeBlockActive: Boolean(current.oppositeBlockActive || item.oppositeBlockActive),
                        canUnblock: Boolean(current.ownBlockActive || item.ownBlockActive),
                        isBlockedContext: true,
                        canView: true
                    });
                }
            });

            return Array.from(blockedMap.values()).sort((left, right) => {
                return String(left.username || '').localeCompare(String(right.username || ''), 'hu');
            });
        }

        const [friends, pending, blockedByMe, blockedByThem] = await Promise.all([
            getAcceptedFriendsForUser(userId),
            getIncomingPendingFriendsForUser(userId),
            getBlockedUsersForUser(userId),
            getBlockedByThemForUser(userId)
        ]);

        const priority = {
            blocked_mutual: 4,
            blocked_by_me: 3,
            blocked_by_them: 2,
            incoming_pending: 1,
            friends: 0
        };

        const mapByUserId = new Map();
        [...friends, ...pending, ...blockedByMe, ...blockedByThem].forEach((item) => {
            const current = mapByUserId.get(item.userId);
            if (!current) {
                mapByUserId.set(item.userId, item);
            } else {
                const merged = {
                    ...current,
                    ownBlockActive: Boolean(current.ownBlockActive || item.ownBlockActive),
                    oppositeBlockActive: Boolean(current.oppositeBlockActive || item.oppositeBlockActive),
                    canUnblock: Boolean(current.canUnblock || item.canUnblock),
                    isBlockedContext: Boolean(current.isBlockedContext || item.isBlockedContext)
                };

                if ((priority[item.relationStatus] || 0) >= (priority[current.relationStatus] || 0)) {
                    merged.relationStatus = item.relationStatus;
                    merged.canAccept = item.canAccept;
                    merged.canReject = item.canReject;
                    merged.canBlock = item.canBlock;
                    merged.canChat = item.canChat;
                    merged.canView = item.canView;
                }

                mapByUserId.set(item.userId, merged);
            }
        });

        return Array.from(mapByUserId.values()).sort((left, right) => {
            return String(left.username || '').localeCompare(String(right.username || ''), 'hu');
        });
    } catch (error) {
        throw new Error('Hiba a barat lista osszeallitasa soran.');
    }
}

async function acceptFriendRequest(currentUserId, targetUserId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        if (await isEitherUserBlocked(currentUserId, targetUserId, connection)) {
            throw new Error('A kérés nem fogadható el, mert tiltás van érvényben.');
        }

        const [user1Id, user2Id] = normalizeFriendPair(currentUserId, targetUserId);
        const [result] = await connection.execute(
            `
                UPDATE friends
                SET status = 'accepted', action_user_id = ?, invite_time = NOW()
                WHERE user1_id = ?
                  AND user2_id = ?
                  AND status = 'pending'
                  AND action_user_id <> ?
            `,
            [currentUserId, user1Id, user2Id, currentUserId]
        );

        if (!result.affectedRows) {
            throw new Error('Nincs elfogadható függő kérelem ehhez a felhasználóhoz.');
        }

        await connection.commit();
        return { success: true, message: 'A barát kérelem elfogadva.' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function rejectFriendRequest(currentUserId, targetUserId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [user1Id, user2Id] = normalizeFriendPair(currentUserId, targetUserId);
        const [result] = await connection.execute(
            `
                UPDATE friends
                SET status = 'rejected', action_user_id = ?, invite_time = NOW()
                WHERE user1_id = ?
                  AND user2_id = ?
                  AND status = 'pending'
                  AND action_user_id <> ?
            `,
            [currentUserId, user1Id, user2Id, currentUserId]
        );

        if (!result.affectedRows) {
            throw new Error('Nincs elutasítható függő kérelem ehhez a felhasználóhoz.');
        }

        await connection.commit();
        return { success: true, message: 'A barát kérelem elutasítva.' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function blockUserDirectional(currentUserId, targetUserId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        await ensureFriendBlocksTable(connection);

        await connection.execute(
            `
                INSERT INTO friend_blocks (blocker_user_id, blocked_user_id, active)
                VALUES (?, ?, TRUE)
                ON DUPLICATE KEY UPDATE
                    active = TRUE,
                    updated_at = CURRENT_TIMESTAMP
            `,
            [currentUserId, targetUserId]
        );

        const [user1Id, user2Id] = normalizeFriendPair(currentUserId, targetUserId);
        await connection.execute(
            `
                UPDATE friends
                SET status = 'rejected', action_user_id = ?, invite_time = NOW()
                WHERE user1_id = ?
                  AND user2_id = ?
                  AND status = 'pending'
            `,
            [currentUserId, user1Id, user2Id]
        );

        await connection.commit();
        return { success: true, message: 'A felhasználó letiltva.' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function unblockUserDirectional(currentUserId, targetUserId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        await ensureFriendBlocksTable(connection);

        const [result] = await connection.execute(
            `
                UPDATE friend_blocks
                SET active = FALSE,
                    updated_at = CURRENT_TIMESTAMP
                WHERE blocker_user_id = ?
                  AND blocked_user_id = ?
                  AND active = TRUE
            `,
            [currentUserId, targetUserId]
        );

        if (!result.affectedRows) {
            throw new Error('Nincs feloldható saját tiltás ehhez a felhasználóhoz.');
        }

        await connection.commit();
        return { success: true, message: 'A tiltás feloldva.' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function deleteFriendConnection(currentUserId, targetUserId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [user1Id, user2Id] = normalizeFriendPair(currentUserId, targetUserId);
        const [result] = await connection.execute(
            `
                DELETE FROM friends
                WHERE user1_id = ?
                  AND user2_id = ?
                  AND status = 'accepted'
            `,
            [user1Id, user2Id]
        );

        if (!result.affectedRows) {
            throw new Error('Nincs törölhető elfogadott barát kapcsolat ehhez a felhasználóhoz.');
        }

        await connection.commit();
        return { success: true, message: 'A barát kapcsolat törölve.' };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

const CHAT_MAX_MESSAGE_LENGTH = 1000;
const CHAT_BLOCKED_WORDS = [
    // English profanity
    'fuck',
    'fucking',
    'fucker',
    'fucked',
    'fk',
    'shit',
    'shitty',
    'bullshit',
    'crap',
    'bitch',
    'son of a bitch',
    'bastard',
    'asshole',
    'ass',
    'dick',
    'dickhead',
    'douche',
    'douchebag',
    'jerkoff',
    'wanker',
    'piss off',
    'prick',
    'slut',
    'whore',
    'retard',
    'motherfucker',
    'mf',
    'fml',
    'stfu',
    'gtfo',
    'damn',
    'goddamn',
    'jackass',
    'dipshit',
    'shithead',
    'piece of shit',
    'screw you',
    'screw off',
    'suck it',
    'pussy',
    'cum',
    'cunt',
    'twat',
    'bloody hell',
    'arsehole',
    'tosser',
    'slag',
    'numbnuts',
    'knobhead',
    'jerk',
    'idiot',
    'moron',
    'loser',
    'dumbass',
    'trash',
    'screwup',
    // Hungarian profanity
    'fasz',
    'faszom',
    'faszfej',
    'geci',
    'gecifej',
    'kurva',
    'kurvara',
    'kurva anyad',
    'anyad',
    'anyad picsaja',
    'bazdmeg',
    'basszameg',
    'baszd meg',
    'baszod',
    'baszki',
    'szopd le',
    'szopjal le',
    'bekaphatod',
    'rohadt',
    'rohadek',
    'szar',
    'szaros',
    'fos',
    'hulye',
    'idiota',
    'hulye fasz',
    'hulye kurva',
    'gyoker',
    'barom',
    'csicska',
    'picsaba',
    'picsa',
    'szopas',
    'szopatlak',
    'szopjal',
    'szopo',
    'kocsog',
    'kocsogok',
    'kocsogfej',
    'takarodj',
    'menj a picsaba',
    'huzz a picsaba',
    'rohadjal meg',
    'dogolj meg',
    'hulye',
    'hulyegyerek',
    'idióta',
    'nyomorek',
    'seggfej',
    'segg',
    'seggnyalo',
    'fereg',
    'szemetlada',
    'tetu',
    'ribanc',
    'kurvajo',
    // Spanish profanity
    'mierda',
    'joder',
    'cojones',
    'puta',
    'puto',
    'cabron',
    'gilipollas',
    'idiota de mierda',
    'vete a la mierda',
    // French profanity
    'merde',
    'putain',
    'connard',
    'connasse',
    'salope',
    'encule',
    'va te faire foutre',
    // German profanity
    'scheisse',
    'fick dich',
    'arschloch',
    'hurensohn',
    'verpiss dich',
    'miststuck',
    // Italian profanity
    'cazzo',
    'stronzo',
    'vaffanculo',
    'troia',
    'pezzo di merda',
    // Portuguese profanity
    'merda',
    'caralho',
    'foda se',
    'filho da puta',
    'vai te foder',
    // Polish profanity
    'kurwa',
    'cholera',
    'spierdalaj',
    'pierdol sie',
    'debil',
    // Turkish profanity
    'siktir',
    'amk',
    'orospu',
    'pic',
    // Dutch profanity
    'klootzak',
    'tering',
    'godverdomme',
    // Romanian profanity
    'dracu',
    'pula',
    'muie'
];

function escapeRegex(input) {
    return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTextForModeration(message) {
    const raw = String(message || '');
    return raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function containsBlockedWord(message) {
    const normalizedMessage = normalizeTextForModeration(message);
    if (!normalizedMessage) {
        return false;
    }

    return CHAT_BLOCKED_WORDS.some((term) => {
        const normalizedWord = normalizeTextForModeration(term);
        if (!normalizedWord) {
            return false;
        }

        if (normalizedWord.includes(' ')) {
            return normalizedMessage.includes(normalizedWord);
        }

        const escapedWord = escapeRegex(normalizedWord);
        const boundaryRegex = new RegExp(`(^|\\s)${escapedWord}($|\\s)`, 'i');
        return boundaryRegex.test(normalizedMessage);
    });
}

async function ensureChatTables(executor) {
    await executor.execute(`
        CREATE TABLE IF NOT EXISTS chat_conversations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            type ENUM('private', 'group') NOT NULL,
            name VARCHAR(255) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_message_at TIMESTAMP NULL DEFAULT NULL,
            last_message_preview VARCHAR(255) NULL,
            UNIQUE KEY unique_group_name (name),
            INDEX idx_chat_conversations_last_message_at (last_message_at)
        )
    `);

    await executor.execute(`
        CREATE TABLE IF NOT EXISTS chat_participants (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            user_id INT NOT NULL,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_read_message_id INT NULL,
            UNIQUE KEY unique_chat_participant (conversation_id, user_id),
            INDEX idx_chat_participants_user (user_id),
            INDEX idx_chat_participants_conversation (conversation_id),
            FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    await executor.execute(`
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            sender_id INT NOT NULL,
            body TEXT NOT NULL,
            body_masked TEXT NULL,
            is_body_masked BOOLEAN DEFAULT FALSE,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
            FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_chat_messages_conversation_sent_at (conversation_id, sent_at),
            INDEX idx_chat_messages_sender (sender_id)
        )
    `);
}

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

function resolvePreviewFromBody(body, maxLength = 120) {
    const normalized = String(body || '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return '';
    }

    if (normalized.length <= maxLength) {
        return normalized;
    }

    return `${normalized.slice(0, maxLength - 1)}…`;
}

async function assertConversationParticipant(userId, conversationId) {
    const pool = getPool();
    const normalizedUserId = normalizePositiveInt(userId, 0);
    const normalizedConversationId = normalizePositiveInt(conversationId, 0);

    if (!normalizedUserId || !normalizedConversationId) {
        throw new Error('Érvénytelen felhasználó vagy beszélgetés azonosító.');
    }

    await ensureChatTables(pool);
    const [rows] = await pool.execute(
        `
            SELECT cp.id
            FROM chat_participants cp
            JOIN users u ON u.id = cp.user_id
            WHERE cp.conversation_id = ?
              AND cp.user_id = ?
              AND u.is_banned = FALSE
            LIMIT 1
        `,
        [normalizedConversationId, normalizedUserId]
    );

    if (!rows.length) {
        throw new Error('A felhasználó nem résztvevője a beszélgetésnek.');
    }

    return true;
}

async function getUserConversations(userId, limit = 20, cursor = null) {
    const pool = getPool();
    const normalizedUserId = normalizePositiveInt(userId, 0);
    if (!normalizedUserId) {
        throw new Error('Érvénytelen felhasználó azonosító.');
    }

    try {
        await ensureChatTables(pool);
        const normalizedLimit = normalizeListLimit(limit, 20, 50);
        const normalizedCursor = normalizePositiveInt(cursor, 0);

        const params = [normalizedUserId];
        let cursorClause = '';
        if (normalizedCursor) {
            cursorClause = 'AND c.id < ?';
            params.push(normalizedCursor);
        }

        params.push(normalizedLimit + 1);

        const [rows] = await pool.execute(
            `
                SELECT
                    c.id AS conversation_id,
                    c.type,
                    c.name,
                    c.created_at,
                    c.last_message_at,
                    c.last_message_preview,
                    COALESCE(last_message.id, 0) AS last_message_id,
                    COALESCE(last_message.sender_id, 0) AS last_message_sender_id,
                    COALESCE(last_message_body.username, '') AS last_message_sender_username,
                    COALESCE(last_message.sent_at, c.last_message_at, c.created_at) AS sort_time,
                    COALESCE(
                        (
                            SELECT COUNT(*)
                            FROM chat_messages unread_messages
                            WHERE unread_messages.conversation_id = c.id
                              AND unread_messages.id > COALESCE(current_participant.last_read_message_id, 0)
                              AND unread_messages.sender_id <> ?
                        ),
                        0
                    ) AS unread_count,
                    (
                        SELECT COUNT(*)
                        FROM chat_participants participant_count
                        WHERE participant_count.conversation_id = c.id
                    ) AS participant_count,
                    other_user.id AS other_user_id,
                    other_user.username AS other_user_username,
                    other_user.profile_image AS other_user_profile_image,
                    'default' AS other_user_profile_image_status
                FROM chat_participants current_participant
                JOIN chat_conversations c ON c.id = current_participant.conversation_id
                LEFT JOIN chat_messages last_message ON last_message.id = (
                    SELECT max_message.id
                    FROM chat_messages max_message
                    WHERE max_message.conversation_id = c.id
                    ORDER BY max_message.id DESC
                    LIMIT 1
                )
                LEFT JOIN users last_message_body ON last_message_body.id = last_message.sender_id
                LEFT JOIN chat_participants other_participant
                    ON other_participant.conversation_id = c.id
                   AND other_participant.user_id <> current_participant.user_id
                LEFT JOIN users other_user ON other_user.id = other_participant.user_id
                WHERE current_participant.user_id = ?
                  ${cursorClause}
                ORDER BY sort_time DESC, c.id DESC
                LIMIT ?
            `,
            [normalizedUserId, ...params]
        );

        const hasMore = rows.length > normalizedLimit;
        const sliced = hasMore ? rows.slice(0, normalizedLimit) : rows;

        const data = sliced.map((row) => ({
            conversationId: row.conversation_id,
            type: row.type,
            name: row.name,
            createdAt: row.created_at,
            lastMessageAt: row.last_message_at,
            lastMessagePreview: row.last_message_preview || '',
            lastMessage: row.last_message_id
                ? {
                    id: row.last_message_id,
                    senderId: row.last_message_sender_id,
                    senderUsername: row.last_message_sender_username,
                    sentAt: row.sort_time
                }
                : null,
            unreadCount: Number(row.unread_count || 0),
            participantCount: Number(row.participant_count || 0),
            otherUser: row.other_user_id
                ? {
                    userId: row.other_user_id,
                    username: row.other_user_username,
                    profileImage: row.other_user_profile_image || DEFAULT_PROFILE_IMAGE_PATH,
                    profileImageStatus: row.other_user_profile_image_status || 'default'
                }
                : null
        }));

        return {
            data,
            hasMore,
            nextCursor: hasMore && data.length ? data[data.length - 1].conversationId : null
        };
    } catch (error) {
        throw new Error('Hiba a beszelgetes lista lekerdezese soran.');
    }
}

async function getConversationMessages(userId, conversationId, beforeMessageId = null, limit = 30) {
    const pool = getPool();
    const normalizedUserId = normalizePositiveInt(userId, 0);
    const normalizedConversationId = normalizePositiveInt(conversationId, 0);

    if (!normalizedUserId || !normalizedConversationId) {
        throw new Error('Érvénytelen felhasználó vagy beszélgetés azonosító.');
    }

    try {
        await ensureChatTables(pool);
        await assertConversationParticipant(normalizedUserId, normalizedConversationId);

        const normalizedLimit = normalizeListLimit(limit, 30, 50);
        const normalizedBeforeMessageId = normalizePositiveInt(beforeMessageId, 0);

        const params = [normalizedConversationId];
        let beforeClause = '';
        if (normalizedBeforeMessageId) {
            beforeClause = 'AND m.id < ?';
            params.push(normalizedBeforeMessageId);
        }

        params.push(normalizedLimit + 1);

        const [rows] = await pool.execute(
            `
                SELECT
                    m.id,
                    m.conversation_id,
                    m.sender_id,
                    m.body,
                    m.body_masked,
                    m.is_body_masked,
                    m.sent_at,
                    u.username AS sender_username,
                    u.profile_image AS sender_profile_image,
                    'default' AS sender_profile_image_status
                FROM chat_messages m
                JOIN users u ON u.id = m.sender_id
                WHERE m.conversation_id = ?
                  ${beforeClause}
                ORDER BY m.id DESC
                LIMIT ?
            `,
            params
        );

        const hasMore = rows.length > normalizedLimit;
        const sliced = hasMore ? rows.slice(0, normalizedLimit) : rows;

        return {
            data: sliced.map((row) => ({
                id: row.id,
                conversationId: row.conversation_id,
                senderId: row.sender_id,
                senderUsername: row.sender_username,
                senderProfileImage: row.sender_profile_image || DEFAULT_PROFILE_IMAGE_PATH,
                senderProfileImageStatus: row.sender_profile_image_status || 'default',
                body: row.is_body_masked ? (row.body_masked || row.body) : row.body,
                bodyOriginal: row.body,
                isBodyMasked: Boolean(row.is_body_masked),
                sentAt: row.sent_at
            })),
            hasMore,
            nextCursor: hasMore && sliced.length ? sliced[sliced.length - 1].id : null
        };
    } catch (error) {
        if (error.message === 'A felhasználó nem résztvevője a beszélgetésnek.') {
            throw error;
        }
        throw new Error('Hiba az uzenetek lekerdezese soran.');
    }
}

async function createOrGetDirectConversation(currentUserId, targetUserId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    const normalizedCurrentUserId = normalizePositiveInt(currentUserId, 0);
    const normalizedTargetUserId = normalizePositiveInt(targetUserId, 0);

    if (!normalizedCurrentUserId || !normalizedTargetUserId) {
        throw new Error('Érvénytelen felhasználó azonosító.');
    }

    if (normalizedCurrentUserId === normalizedTargetUserId) {
        throw new Error('Önmagaddal nem nyithatsz privát beszélgetést.');
    }

    try {
        await connection.beginTransaction();
        await ensureChatTables(connection);
        await ensureFriendBlocksTable(connection);

        if (await isEitherUserBlocked(normalizedCurrentUserId, normalizedTargetUserId, connection)) {
            throw new Error('A privát beszélgetés nem nyitható meg tiltás miatt.');
        }

        const [user1Id, user2Id] = normalizeFriendPair(normalizedCurrentUserId, normalizedTargetUserId);
        const [friendRows] = await connection.execute(
            `
                SELECT id
                FROM friends
                WHERE user1_id = ?
                  AND user2_id = ?
                  AND status = 'accepted'
                LIMIT 1
            `,
            [user1Id, user2Id]
        );

        if (!friendRows.length) {
            throw new Error('A privát beszélgetés csak elfogadott barátok között nyitható meg.');
        }

        const [existingRows] = await connection.execute(
            `
                SELECT c.id
                FROM chat_conversations c
                JOIN chat_participants cp ON cp.conversation_id = c.id
                WHERE c.type = 'private'
                  AND cp.user_id IN (?, ?)
                GROUP BY c.id
                HAVING COUNT(*) = 2
                   AND COUNT(DISTINCT cp.user_id) = 2
                   AND (
                        SELECT COUNT(*)
                        FROM chat_participants cp_count
                        WHERE cp_count.conversation_id = c.id
                   ) = 2
                ORDER BY c.id DESC
                LIMIT 1
            `,
            [normalizedCurrentUserId, normalizedTargetUserId]
        );

        if (existingRows.length) {
            await connection.commit();
            return {
                conversationId: existingRows[0].id,
                created: false
            };
        }

        const [insertConversationResult] = await connection.execute(
            `
                INSERT INTO chat_conversations (type, name, created_at, last_message_at, last_message_preview)
                VALUES ('private', NULL, NOW(), NULL, NULL)
            `
        );

        const conversationId = insertConversationResult.insertId;
        await connection.execute(
            `
                INSERT INTO chat_participants (conversation_id, user_id)
                VALUES (?, ?), (?, ?)
            `,
            [conversationId, normalizedCurrentUserId, conversationId, normalizedTargetUserId]
        );

        await connection.commit();
        return {
            conversationId,
            created: true
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function insertMessageInConversation(userId, conversationId, message, policyResult = {}) {
    const pool = getPool();
    const connection = await pool.getConnection();

    const normalizedUserId = normalizePositiveInt(userId, 0);
    const normalizedConversationId = normalizePositiveInt(conversationId, 0);
    const normalizedMessage = String(message || '').trim();

    if (!normalizedUserId || !normalizedConversationId) {
        throw new Error('Érvénytelen felhasználó vagy beszélgetés azonosító.');
    }

    if (!normalizedMessage) {
        throw new Error('Az üzenet nem lehet üres.');
    }

    if (normalizedMessage.length > CHAT_MAX_MESSAGE_LENGTH) {
        throw new Error(`Az üzenet legfeljebb ${CHAT_MAX_MESSAGE_LENGTH} karakter lehet.`);
    }

    if (policyResult?.blocked) {
        throw new Error(policyResult.message || 'Az üzenetet a tartalmi szabályzat blokkolta.');
    }

    const isBodyMasked = Boolean(policyResult?.isMasked);
    const bodyMasked = isBodyMasked
        ? String(policyResult?.maskedMessage || '').trim() || '***'
        : null;
    const previewText = resolvePreviewFromBody(isBodyMasked ? bodyMasked : normalizedMessage);

    try {
        await connection.beginTransaction();
        await ensureChatTables(connection);
        await assertConversationParticipant(normalizedUserId, normalizedConversationId);

        const [insertResult] = await connection.execute(
            `
                INSERT INTO chat_messages (conversation_id, sender_id, body, body_masked, is_body_masked, sent_at)
                VALUES (?, ?, ?, ?, ?, NOW())
            `,
            [normalizedConversationId, normalizedUserId, normalizedMessage, bodyMasked, isBodyMasked]
        );

        const messageId = insertResult.insertId;

        await connection.execute(
            `
                UPDATE chat_conversations
                SET last_message_at = NOW(),
                    last_message_preview = ?
                WHERE id = ?
            `,
            [previewText, normalizedConversationId]
        );

        await connection.execute(
            `
                UPDATE chat_participants
                SET last_read_message_id = ?
                WHERE conversation_id = ?
                  AND user_id = ?
            `,
            [messageId, normalizedConversationId, normalizedUserId]
        );

        const [rows] = await connection.execute(
            `
                SELECT
                    m.id,
                    m.conversation_id,
                    m.sender_id,
                    m.body,
                    m.body_masked,
                    m.is_body_masked,
                    m.sent_at,
                    u.username AS sender_username,
                    u.profile_image AS sender_profile_image,
                    'default' AS sender_profile_image_status
                FROM chat_messages m
                JOIN users u ON u.id = m.sender_id
                WHERE m.id = ?
                LIMIT 1
            `,
            [messageId]
        );

        await connection.commit();

        if (!rows.length) {
            throw new Error('Az üzenet létrejött, de a visszaolvasás nem sikerült.');
        }

        const row = rows[0];
        return {
            id: row.id,
            conversationId: row.conversation_id,
            senderId: row.sender_id,
            senderUsername: row.sender_username,
            senderProfileImage: row.sender_profile_image || DEFAULT_PROFILE_IMAGE_PATH,
            senderProfileImageStatus: row.sender_profile_image_status || 'default',
            body: row.is_body_masked ? (row.body_masked || row.body) : row.body,
            bodyOriginal: row.body,
            isBodyMasked: Boolean(row.is_body_masked),
            sentAt: row.sent_at
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
    getPublicPlayerProfileById,
    getUserAuthById,
    updateUserProfileSettings,
    insertUserLog,
    getUserSecurityActivity,
    getTotalUsers,
    getTotalGames,
    getOnlineGamesCount,
    getAllUsers,
    getAllRooms,
    ipCollisionCheck,
    ipCollisions,
    uploadProfileImage,
    getPendingProfileImages,
    approveProfileImage,
    rejectProfileImage,
    getUserProfileImage,
    resetUserProfileImageToDefault,
    getAndDeleteDiscardedProfileImages,
    deleteDiscardedProfileImageRecord,
    deleteOrphanProfileImageUploadRecords,
    getAllProfileImageReferences,
    searchUsersByUsernameContains,
    deleteUserProfileWithTransaction,
    addFriendRequest,
    getFriendStatus,
    getFriendListForUser,
    acceptFriendRequest,
    rejectFriendRequest,
    blockUserDirectional,
    unblockUserDirectional,
    deleteFriendConnection,
    getUserConversations,
    getConversationMessages,
    createOrGetDirectConversation,
    insertMessageInConversation,
    assertConversationParticipant,
    containsBlockedWord,
    normalizeTextForModeration
};