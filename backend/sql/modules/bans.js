const { getPool } = require('../database.js');

async function banUser(userId, reason, bannedUntil) {
    const pool = getPool();
    await pool.execute(
        'UPDATE users SET is_banned = TRUE, ban_reason = ?, banned_until = ? WHERE id = ?',
        [reason || null, bannedUntil || null, userId]
    );
}

async function unbanUser(userId) {
    const pool = getPool();
    await pool.execute(
        'UPDATE users SET is_banned = FALSE, ban_reason = NULL, banned_until = NULL WHERE id = ?',
        [userId]
    );
}

// Gyors index lookup minden authentikalt request-en — csak a ban-statusz erdekel.
// Visszaadja: { is_banned: 0|1 } vagy null ha a user nem letezik.
async function checkUserBanStatus(userId) {
    const pool = getPool();
    try {
        const [rows] = await pool.execute(
            'SELECT is_banned FROM users WHERE id = ? LIMIT 1',
            [userId]
        );
        return rows[0] || null;
    } catch (error) {
        console.warn('checkUserBanStatus hiba:', error.message);
        return null;
    }
}

// Visszaadja az aktiv banned_emails rekordot ha az email blokkolva van.
// banned_until IS NULL = vegleges; banned_until > NOW() = meg aktiv temp ban.
// Lejart temp bant nem ad vissza (a sor megmarad audit-celra, de nem blokkol).
async function isEmailBanned(email) {
    if (!email) return null;
    const pool = getPool();
    const [rows] = await pool.execute(
        `SELECT email, banned_until, ban_reason, original_user_id
         FROM banned_emails
         WHERE email = ?
           AND (banned_until IS NULL OR banned_until > NOW())
         LIMIT 1`,
        [email]
    );
    return rows[0] || null;
}

module.exports = {
    banUser,
    unbanUser,
    checkUserBanStatus,
    isEmailBanned
};
