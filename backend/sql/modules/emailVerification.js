const { getPool } = require('../database.js');

async function saveEmailVerificationToken(userId, tokenHash, expiresAt) {
    const pool = getPool();
    let result = { updated: false };
    try {
        const query = `
            UPDATE users
            SET email_verification_token_hash = ?,
                email_verification_token_expires = ?,
                email_verification_sent_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        const [queryResult] = await pool.execute(query, [tokenHash, expiresAt, userId]);
        result = { updated: queryResult.affectedRows > 0 };
    } catch (error) {
        throw new Error('Hiba az email verifikációs token mentése során.');
    }
    return result;
}

async function findUserByVerificationTokenHash(tokenHash) {
    const pool = getPool();
    let foundUser = null;
    try {
        const query = `
            SELECT id, username, email, is_email_verified,
                   email_verification_token_hash,
                   email_verification_token_expires
            FROM users
            WHERE email_verification_token_hash = ?
            LIMIT 1
        `;
        const [rows] = await pool.execute(query, [tokenHash]);
        if (rows.length > 0) {
            foundUser = rows[0];
        }
    } catch (error) {
        throw new Error('Hiba a verifikációs token lekérdezése során.');
    }
    return foundUser;
}

async function markEmailVerified(userId) {
    const pool = getPool();
    let result = { updated: false };
    try {
        const query = `
            UPDATE users
            SET is_email_verified = TRUE,
                email_verified_at = CURRENT_TIMESTAMP,
                email_verification_token_hash = NULL,
                email_verification_token_expires = NULL
            WHERE id = ?
        `;
        const [queryResult] = await pool.execute(query, [userId]);
        result = { updated: queryResult.affectedRows > 0 };
    } catch (error) {
        throw new Error('Hiba az email verifikált állapot mentése során.');
    }
    return result;
}

async function clearEmailVerificationState(userId) {
    const pool = getPool();
    let result = { updated: false };
    try {
        const query = `
            UPDATE users
            SET is_email_verified = FALSE,
                email_verified_at = NULL,
                email_verification_token_hash = NULL,
                email_verification_token_expires = NULL,
                email_verification_sent_at = NULL
            WHERE id = ?
        `;
        const [queryResult] = await pool.execute(query, [userId]);
        result = { updated: queryResult.affectedRows > 0 };
    } catch (error) {
        throw new Error('Hiba a verifikációs állapot törlése során.');
    }
    return result;
}

async function getUserVerificationStatusById(userId) {
    const pool = getPool();
    let statusRow = null;
    try {
        const query = `
            SELECT id, username, email, is_email_verified,
                   email_verification_sent_at,
                   email_verification_token_expires
            FROM users
            WHERE id = ?
            LIMIT 1
        `;
        const [rows] = await pool.execute(query, [userId]);
        if (rows.length > 0) {
            statusRow = rows[0];
        }
    } catch (error) {
        throw new Error('Hiba a verifikációs állapot lekérdezése során.');
    }
    return statusRow;
}

module.exports = {
    saveEmailVerificationToken,
    findUserByVerificationTokenHash,
    markEmailVerified,
    clearEmailVerificationState,
    getUserVerificationStatusById
};
