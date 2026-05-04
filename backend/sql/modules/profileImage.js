const { getPool } = require('../database.js');

const DEFAULT_PROFILE_IMAGE_PATH = '/profile_pictures/default.png';
const ALLOWED_PROFILE_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Publikus, cache-elt ranglistakon a pending kepet mindig default-ra cserelnunk kell
// (a leaderboard-ot mindenki lathatja, igy a pending nem szivaroghat ki). A SELECT
// fragmentet a leaderboard modul hasznalja kozvetlenul.
const LEADERBOARD_PROFILE_IMAGE_EXPRESSION = `
    CASE
        WHEN u.profile_image = '/profile_pictures/default.png' THEN '/profile_pictures/default.png'
        WHEN COALESCE(
            (
                SELECT piu.status
                FROM profile_image_uploads piu
                WHERE piu.user_id = u.id
                ORDER BY piu.upload_time DESC, piu.id DESC
                LIMIT 1
            ),
            'approved'
        ) IN ('pending', 'rejected') THEN '/profile_pictures/default.png'
        ELSE u.profile_image
    END AS profile_image
`;

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

// Egyseges lathatosagi szabaly: pending kepet csak a tulajdonosa lat.
// Barki mas (vagy publikus/cache-elt nezet, ahol nincs viewer) az alapertelmezett kepet kapja.
// A 'rejected' statusz biztonsagi okbol szinten default fallback. Az 'approved'/'default' erintetlen.
function applyProfileImageVisibility(profileImage, profileImageStatus, ownerUserId, viewerUserId) {
    const normalizedStatus = String(profileImageStatus || 'approved').toLowerCase();
    const normalizedOwnerId = Number(ownerUserId) || 0;
    const normalizedViewerId = Number(viewerUserId) || 0;
    const isOwner = normalizedOwnerId > 0 && normalizedOwnerId === normalizedViewerId;
    let result = {
        profileImage: profileImage || DEFAULT_PROFILE_IMAGE_PATH,
        profileImageStatus: normalizedStatus || 'approved'
    };
    if (normalizedStatus === 'pending' && !isOwner) {
        result = { profileImage: DEFAULT_PROFILE_IMAGE_PATH, profileImageStatus: 'default' };
    } else if (normalizedStatus === 'rejected') {
        result = { profileImage: DEFAULT_PROFILE_IMAGE_PATH, profileImageStatus: 'default' };
    }
    return result;
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
        return { userId: upload.user_id, filename: upload.filename };
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
        return { userId: upload.user_id, filename: DEFAULT_PROFILE_IMAGE_PATH };
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

async function uploadProfileImageAdminApproved(userId, filename) {
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

        const adminUserId = Number(global._currentAdminUserId) || 0;

        const [insertResult] = await connection.execute(
            'INSERT INTO profile_image_uploads (user_id, filename, status, review_note, reviewed_by, review_time) VALUES (?, ?, "approved", ?, ?, NOW())',
            [userId, filename, 'Admin által azonnal jóváhagyva.', adminUserId || null]
        );

        await connection.execute('UPDATE users SET profile_image = ? WHERE id = ?', [filename, userId]);

        await connection.commit();
        return {
            uploadId: insertResult.insertId,
            status: 'approved',
            profileImage: filename
        };
    } catch (error) {
        await connection.rollback();
        if (error.message === 'A felhasználó nem található.' || error.message === 'Érvénytelen profilkép útvonal.') {
            throw error;
        }
        throw new Error('Hiba a profil kép admin feltöltése során.');
    } finally {
        connection.release();
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

module.exports = {
    DEFAULT_PROFILE_IMAGE_PATH,
    ALLOWED_PROFILE_IMAGE_EXTENSIONS,
    LEADERBOARD_PROFILE_IMAGE_EXPRESSION,
    isAllowedProfileImagePath,
    applyProfileImageVisibility,
    normalizeUserProfileImage,
    uploadProfileImage,
    getPendingProfileImages,
    approveProfileImage,
    rejectProfileImage,
    getUserProfileImage,
    uploadProfileImageAdminApproved,
    resetUserProfileImageToDefault,
    getAndDeleteDiscardedProfileImages,
    deleteDiscardedProfileImageRecord,
    deleteOrphanProfileImageUploadRecords,
    getAllProfileImageReferences
};
