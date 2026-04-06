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
}

async function isEitherUserBlocked(currentUserId, targetUserId, executor = null) {
    const db = executor || getPool();
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
}

async function getIncomingPendingFriendsForUser(userId) {
    const pool = getPool();
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
}

async function getBlockedUsersForUser(userId) {
    const pool = getPool();
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
}

async function getBlockedByThemForUser(userId) {
    const pool = getPool();
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
}

async function getFriendListForUser(userId, filter = 'friend') {
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
                return;
            }

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
            return;
        }

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
    });

    return Array.from(mapByUserId.values()).sort((left, right) => {
        return String(left.username || '').localeCompare(String(right.username || ''), 'hu');
    });
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
    resetUserProfileImageToDefault,
    getAndDeleteDiscardedProfileImages,
    deleteDiscardedProfileImageRecord,
    searchUsersByUsernameContains,
    deleteUserProfileWithTransaction,
    addFriendRequest,
    getFriendStatus,
    getFriendListForUser,
    acceptFriendRequest,
    rejectFriendRequest,
    blockUserDirectional,
    unblockUserDirectional,
    deleteFriendConnection
};