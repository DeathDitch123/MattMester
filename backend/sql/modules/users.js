const { getPool } = require('../database.js');
const {
    DEFAULT_PROFILE_IMAGE_PATH,
    applyProfileImageVisibility,
    normalizeUserProfileImage
} = require('./profileImage.js');
const {
    ALLOWED_NOTIFICATION_TARGET_ROLES,
    normalizePositiveInt
} = require('./_shared.js');

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
                          elo, elo_classical AS elo_MM, elo_blitz AS elo_bullet, role, is_banned,
                          ban_reason, banned_until, pending_deletion_until, last_active,
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
                          elo, elo_classical AS elo_MM, elo_blitz AS elo_bullet, role, is_banned,
                          ban_reason, banned_until, pending_deletion_until, last_active,
                          is_email_verified, created_at
                   FROM users WHERE email = ?`;
    try {
        const [rows] = await pool.execute(query, [mailAdress]);
        return rows[0];
    } catch (error) {
        throw new Error('Hiba a felhasználó lekérdezése során.');
    }
}

async function savePasswordResetToken(userId, tokenHash, expiresAt) {
    const pool = getPool();
    let result = { updated: false };
    try {
        const query = `
            UPDATE users
            SET reset_password_token = ?,
                reset_token_expires = ?
            WHERE id = ?
        `;
        const [queryResult] = await pool.execute(query, [tokenHash, expiresAt, userId]);
        result = { updated: queryResult.affectedRows > 0 };
    } catch (error) {
        throw new Error('Hiba a jelszó-visszaállítási token mentése során.');
    }
    return result;
}

async function findUserByPasswordResetTokenHash(tokenHash) {
    const pool = getPool();
    let foundUser = null;
    try {
        const query = `
            SELECT id, username, email, password_hash, reset_password_token, reset_token_expires
            FROM users
            WHERE reset_password_token = ?
            LIMIT 1
        `;
        const [rows] = await pool.execute(query, [tokenHash]);
        if (rows.length > 0) {
            foundUser = rows[0];
        }
    } catch (error) {
        throw new Error('Hiba a jelszó-visszaállítási token lekérdezése során.');
    }
    return foundUser;
}

async function clearPasswordResetToken(userId) {
    const pool = getPool();
    let result = { updated: false };
    try {
        const query = `
            UPDATE users
            SET reset_password_token = NULL,
                reset_token_expires = NULL
            WHERE id = ?
        `;
        const [queryResult] = await pool.execute(query, [userId]);
        result = { updated: queryResult.affectedRows > 0 };
    } catch (error) {
        throw new Error('Hiba a jelszó-visszaállítási token törlése során.');
    }
    return result;
}

async function updateUserPasswordAndClearResetToken(userId, passwordHash) {
    const pool = getPool();
    let result = { updated: false };
    try {
        const query = `
            UPDATE users
            SET password_hash = ?,
                reset_password_token = NULL,
                reset_token_expires = NULL
            WHERE id = ?
        `;
        const [queryResult] = await pool.execute(query, [passwordHash, userId]);
        result = { updated: queryResult.affectedRows > 0 };
    } catch (error) {
        throw new Error('Hiba a jelszó frissítése során.');
    }
    return result;
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
            u.elo_classical AS elo_MM,
            u.elo_blitz AS elo_bullet,
            u.is_banned,
            u.ban_reason,
            u.banned_until,
            u.pending_deletion_until,
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

async function getPublicPlayerProfileById(targetUserId, viewerUserId = 0) {
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
            u.elo_classical AS elo_MM,
            u.elo_blitz AS elo_bullet,
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

    let result = null;
    try {
        const [rows] = await pool.execute(query, [targetUserId]);
        if (rows.length) {
            const row = rows[0];
            const visibility = applyProfileImageVisibility(
                row.profile_image,
                row.profile_image_status,
                row.id,
                viewerUserId
            );
            row.profile_image = visibility.profileImage;
            row.profile_image_status = visibility.profileImageStatus;
            result = row;
        }
    } catch (error) {
        console.error('Hiba a publikus játékos profil lekérdezése során:', error);
        throw new Error('Nem sikerült a játékos profil lekérése.');
    }
    return result;
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
        fields.push('is_email_verified = FALSE');
        fields.push('email_verified_at = NULL');
        fields.push('email_verification_token_hash = NULL');
        fields.push('email_verification_token_expires = NULL');
        fields.push('email_verification_sent_at = NULL');
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
    let result = [];
    try {
        const [rows] = await pool.execute(query, [currentUserId, currentUserId, `%${searchText}%`, currentUserId]);
        result = rows.map((row) => {
            const visibility = applyProfileImageVisibility(
                row.profile_image,
                row.profile_image_status,
                row.id,
                currentUserId
            );
            return {
                ...row,
                profile_image: visibility.profileImage,
                profile_image_status: visibility.profileImageStatus
            };
        });
    } catch (error) {
        console.error('Hiba a felhasználó keresése során:', error);
        result = [];
    }
    return result;
}

async function deleteUserProfileWithTransaction(userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [userRows] = await connection.execute(
            'SELECT id, username, email, role, is_banned, banned_until, ban_reason FROM users WHERE id = ? LIMIT 1 FOR UPDATE',
            [userId]
        );

        if (!userRows.length) {
            throw new Error('A felhasznalo nem talalhato.');
        }

        const user = userRows[0];
        if (user.role === 'admin') {
            throw new Error('Admin profil nem torolheto.');
        }

        // Ha a user banned-allapotban van torleskor, a ban metaadata atkerul a banned_emails-be
        // hogy ne tudja a ban idejet megkerulni ujraregisztracioval.
        if (user.is_banned && user.email) {
            await connection.execute(
                `INSERT INTO banned_emails (email, banned_until, ban_reason, original_user_id)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                     banned_until = VALUES(banned_until),
                     ban_reason   = VALUES(ban_reason),
                     original_user_id = VALUES(original_user_id)`,
                [user.email, user.banned_until, user.ban_reason, userId]
            );
        }

        // A kapcsolt adatok explicit torlese nem bukik el akkor sem, ha 0 talalat van.
        // Ez akkor is ved, ha egy regi adatbazisban hianyosak az FK-k.
        await connection.execute('DELETE FROM user_logs WHERE user_id = ?', [userId]);
        await connection.execute('DELETE FROM profile_image_uploads WHERE user_id = ?', [userId]);
        // Masok kepei amiket o reviewolt: SET NULL hogy a torles ne bukjon el RESTRICT-en.
        await connection.execute(
            'UPDATE profile_image_uploads SET reviewed_by = NULL WHERE reviewed_by = ?',
            [userId]
        );
        await connection.execute(
            'DELETE FROM friends WHERE user1_id = ? OR user2_id = ? OR action_user_id = ?',
            [userId, userId, userId]
        );
        await connection.execute(
            'DELETE FROM friend_blocks WHERE blocker_user_id = ? OR blocked_user_id = ?',
            [userId, userId]
        );

        // Chat: a felhasznalo altal kuldott uzeneteket es a beszelgetesekben valo
        // resztvetelt is takaritjuk. A chat_conversations tabla nem hivatkozik
        // userre kozvetlenul, ezert nem toroljuk eros kezzel — orphan-ok kesobb is OK.
        await connection.execute('DELETE FROM chat_messages WHERE sender_id = ?', [userId]);
        await connection.execute('DELETE FROM chat_participants WHERE user_id = ?', [userId]);

        await connection.execute('UPDATE games SET winner_id = NULL WHERE winner_id = ?', [userId]);
        await connection.execute('DELETE FROM moves WHERE player_id = ?', [userId]);
        await connection.execute('DELETE FROM ability_log WHERE player_id = ?', [userId]);
        // game_chats a games(id) ON DELETE CASCADE-en keresztul torlodik a games-szel egyutt.
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

// =====================================================================
// Soft-delete (admin-trigger) + restore (24h grace period)
// =====================================================================

// Soft-delete: a felhasznalo NEM kerul fizikailag torlesre, csak `pending_deletion_until`
// kitoltodik (NOW() + graceMs). A login flow + middleware soft-deleted usert elutasit
// (mintha banned lenne). Az hourly cron purge fizikailag is torli ha lejart a grace.
// Visszater: { soft: true, pendingDeletionUntil: Date, username }.
async function softDeleteUserByAdmin(userId, adminUserId, reason, graceMs = 24 * 60 * 60 * 1000) {
    const pool = getPool();
    const [rows] = await pool.execute(
        'SELECT id, username, role, pending_deletion_until FROM users WHERE id = ? LIMIT 1',
        [userId]
    );
    if (!rows.length) throw new Error('A felhasznalo nem talalhato.');
    const user = rows[0];
    if (user.role === 'admin') throw new Error('Admin profil nem torolheto.');
    if (user.pending_deletion_until) throw new Error('A felhasznalo mar torlesre van kijelolve.');

    const pendingUntil = new Date(Date.now() + graceMs);
    await pool.execute(
        `UPDATE users
         SET pending_deletion_until = ?,
             deleted_by_admin_id = ?,
             deleted_reason = ?
         WHERE id = ?`,
        [pendingUntil, adminUserId || null, reason ? String(reason).slice(0, 500) : null, userId]
    );
    return {
        soft: true,
        userId,
        username: user.username,
        pendingDeletionUntil: pendingUntil
    };
}

// Visszaallitja a soft-deleted usert (pending_deletion_until + meta NULL-ra).
// Idempotens: ha mar nem soft-deleted, 0 affectedRows.
async function restoreUserFromSoftDelete(userId) {
    const pool = getPool();
    const [result] = await pool.execute(
        `UPDATE users
         SET pending_deletion_until = NULL,
             deleted_by_admin_id = NULL,
             deleted_reason = NULL
         WHERE id = ? AND pending_deletion_until IS NOT NULL`,
        [userId]
    );
    return result.affectedRows || 0;
}

// Lista admin oldali UI-hoz: soft-deleted user-ek, akiknek meg nem jart le a grace.
async function listSoftDeletedUsers(limit = 200) {
    const pool = getPool();
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const [rows] = await pool.query(
        `SELECT u.id, u.username, u.email, u.pending_deletion_until,
                u.deleted_by_admin_id, u.deleted_reason,
                a.username AS deleted_by_admin_username
         FROM users u
         LEFT JOIN users a ON a.id = u.deleted_by_admin_id
         WHERE u.pending_deletion_until IS NOT NULL
           AND u.pending_deletion_until > NOW()
         ORDER BY u.pending_deletion_until ASC
         LIMIT ?`,
        [safeLimit]
    );
    return rows || [];
}

// Cron-utility: lejart soft-deleted user-ek azonositoinak listaja, hogy a hourly job
// hard-delete-elje oket a `deleteUserProfileWithTransaction`-nel.
async function listExpiredSoftDeletedUserIds() {
    const pool = getPool();
    const [rows] = await pool.query(
        `SELECT id FROM users
         WHERE pending_deletion_until IS NOT NULL
           AND pending_deletion_until <= NOW()`
    );
    return (rows || []).map((r) => r.id);
}

async function getUserBasicById(userId) {
    const pool = getPool();
    let user = null;
    try {
        const normalizedUserId = normalizePositiveInt(userId, 0);
        if (normalizedUserId) {
            const [rows] = await pool.execute(
                `SELECT id, username, role FROM users WHERE id = ? LIMIT 1`,
                [normalizedUserId]
            );
            if (rows.length) {
                user = { id: rows[0].id, username: rows[0].username, role: rows[0].role };
            }
        }
    } catch (error) {
        throw new Error(error.message || 'Hiba a felhasználó alap adatok lekérése során.');
    }
    return user;
}

async function findUserByUsernameForAdmin(username) {
    const pool = getPool();
    let user = null;
    try {
        const normalizedUsername = String(username || '').trim();
        if (normalizedUsername) {
            const [rows] = await pool.execute(
                `SELECT id, username, role FROM users WHERE username = ? LIMIT 1`,
                [normalizedUsername]
            );
            if (rows.length) {
                user = { id: rows[0].id, username: rows[0].username, role: rows[0].role };
            }
        }
    } catch (error) {
        throw new Error(error.message || 'Hiba a felhasználó keresése során.');
    }
    return user;
}

async function getUserIdsByRole(role) {
    const pool = getPool();
    let ids = [];
    try {
        if (ALLOWED_NOTIFICATION_TARGET_ROLES.has(role)) {
            const [rows] = await pool.execute(
                `SELECT id FROM users WHERE role = ? AND is_banned = FALSE`,
                [role]
            );
            ids = rows.map((row) => Number(row.id));
        }
    } catch (error) {
        throw new Error(error.message || 'Hiba a szerep alapú felhasználó lekérés során.');
    }
    return ids;
}

async function getAllActiveUserIds() {
    const pool = getPool();
    let ids = [];
    try {
        const [rows] = await pool.execute(
            `SELECT id FROM users WHERE is_banned = FALSE`
        );
        ids = rows.map((row) => Number(row.id));
    } catch (error) {
        throw new Error(error.message || 'Hiba az aktív felhasználók lekérése során.');
    }
    return ids;
}

module.exports = {
    insertUser,
    getUserByUsername,
    getUserByEmail,
    savePasswordResetToken,
    findUserByPasswordResetTokenHash,
    clearPasswordResetToken,
    updateUserPasswordAndClearResetToken,
    getSessionUserById,
    getPublicPlayerProfileById,
    getUserAuthById,
    updateUserProfileSettings,
    searchUsersByUsernameContains,
    deleteUserProfileWithTransaction,
    softDeleteUserByAdmin,
    restoreUserFromSoftDelete,
    listSoftDeletedUsers,
    listExpiredSoftDeletedUserIds,
    getUserBasicById,
    findUserByUsernameForAdmin,
    getUserIdsByRole,
    getAllActiveUserIds
};
