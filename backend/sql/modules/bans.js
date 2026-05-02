const { getPool } = require('../database.js');

// Loopback whitelist — dev kornyezetben (127.x, ::1) ne triggereljen IP escalation-t.
const IP_LOOPBACK_PATTERNS = [
    /^127\./,
    /^::1$/,
    /^::ffff:127\./,
    /^localhost$/i
];

function isLoopbackIp(ip) {
    if (!ip) return true;
    const s = String(ip).trim();
    if (!s || s === 'ismeretlen') return true;
    return IP_LOOPBACK_PATTERNS.some((re) => re.test(s));
}

async function ensureAccountBanEventsTable(executor) {
    await executor.execute(`
        CREATE TABLE IF NOT EXISTS account_ban_events (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            ip_address VARCHAR(45) NULL,
            source ENUM('profanity_strike', 'admin_manual', 'admin_critical', 'other') NOT NULL DEFAULT 'other',
            reason VARCHAR(500) NULL,
            triggered_ip_block BOOLEAN NOT NULL DEFAULT FALSE,
            ip_block_type ENUM('temp_1d', 'perma', 'none') NOT NULL DEFAULT 'none',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_account_ban_events_ip (ip_address, created_at),
            INDEX idx_account_ban_events_user (user_id, created_at)
        )
    `);
}

async function banUser(userId, reason, bannedUntil) {
    const pool = getPool();
    await pool.execute(
        'UPDATE users SET is_banned = TRUE, ban_reason = ?, banned_until = ? WHERE id = ?',
        [reason || null, bannedUntil || null, userId]
    );
}

// Account-ban audit + IP escalation. A hivo MINDIG hivja ha banol egy usert (auto vagy admin),
// es atadja a banolt user IP-jet (vagy null ha nem ismert).
//
// Eskaláció:
//   1) Berakjuk az event-et az account_ban_events-be.
//   2) Ha az IP nem null/loopback es ugyanarrol az IP-rol mar mas user is volt banolva
//      (DISTINCT count >= 1) → IP-blokkot is alkalmazunk:
//        - Ha az IP-nek mar van ip_blocks history-ja (akar lejart) → PERMA IP ban
//        - Egyebkent → 1 napos IP ban (sosem perma elsore!)
//   3) A blokk az ip_blocks tablat hasznalja (UNIQUE upsert), igy a meglevo
//      ipBlockGuard middleware automatikusan ervenyesiti.
async function recordAccountBanEvent({ userId, ipAddress, source, reason }) {
    const pool = getPool();
    const numericUserId = Number(userId) || 0;
    const normalizedIp = ipAddress ? String(ipAddress).slice(0, 45) : null;
    const safeSource = ['profanity_strike', 'admin_manual', 'admin_critical', 'other'].includes(source)
        ? source
        : 'other';
    const safeReason = reason ? String(reason).slice(0, 500) : null;

    if (!numericUserId) {
        return { eventId: null, triggeredIpBlock: false };
    }

    try {
        await ensureAccountBanEventsTable(pool);

        // 1) Insert event
        const [insertResult] = await pool.execute(
            `INSERT INTO account_ban_events (user_id, ip_address, source, reason, triggered_ip_block, ip_block_type)
             VALUES (?, ?, ?, ?, FALSE, 'none')`,
            [numericUserId, normalizedIp, safeSource, safeReason]
        );
        const eventId = insertResult.insertId;

        // 2) IP escalation csak akkor, ha van valid IP es nem loopback
        if (!normalizedIp || isLoopbackIp(normalizedIp)) {
            return { eventId, triggeredIpBlock: false, ipAddress: normalizedIp };
        }

        // Hany MAS user (DISTINCT user_id, kihagyva a most banolt-at) volt mar banolva
        // ugyanerrol az IP-rol? Ha legalabb 1, az IP-nek "tortenete" van, escalation kell.
        const [priorRows] = await pool.execute(
            `SELECT COUNT(DISTINCT user_id) AS c
             FROM account_ban_events
             WHERE ip_address = ? AND user_id <> ?`,
            [normalizedIp, numericUserId]
        );
        const priorOtherUsers = Number(priorRows[0]?.c || 0);

        if (priorOtherUsers === 0) {
            // Tisztan ez az elso ban event ezen az IP-n (vagy csak ennek a usernek volt itt) — nincs IP escalation
            return { eventId, triggeredIpBlock: false, priorOtherUsers: 0, ipAddress: normalizedIp };
        }

        // 3) Mar van ip_blocks rekord erre az IP-re (akar aktiv akar lejart)?
        // Ha igen → PERMA. Ha nem → 1 napos elso alkalom.
        const [ipHistoryRows] = await pool.execute(
            `SELECT id, blocked_until FROM ip_blocks WHERE ip_address = ? LIMIT 1`,
            [normalizedIp]
        );
        const ipHasHistory = ipHistoryRows.length > 0;

        let blockType, blockedUntil;
        if (ipHasHistory) {
            blockType = 'perma';
            blockedUntil = null;
        } else {
            blockType = 'temp_1d';
            blockedUntil = new Date(Date.now() + 24 * 3600 * 1000);
        }

        const ipReason = `Auto IP-ban (escalation): ${safeSource} - ${safeReason || 'ismetlodo szabalysertes'} (${priorOtherUsers} masik banolt user erről az IP-ről)`;

        // upsertIpBlock: UNIQUE(ip_address) miatt UPDATE-eli ha mar van rekord.
        // Direkt SQL itt — adminRepo importja korkorős fuggoseget okozna.
        await pool.execute(
            `INSERT INTO ip_blocks (ip_address, blocked_until, reason, blocked_by_user_id, blocked_by_username)
             VALUES (?, ?, ?, NULL, 'rendszer')
             ON DUPLICATE KEY UPDATE
                 blocked_until = VALUES(blocked_until),
                 reason = VALUES(reason),
                 blocked_by_user_id = NULL,
                 blocked_by_username = 'rendszer',
                 created_at = CURRENT_TIMESTAMP`,
            [normalizedIp, blockedUntil, ipReason.slice(0, 500)]
        );

        // Marker: az event triggerelt IP blokkot
        await pool.execute(
            `UPDATE account_ban_events SET triggered_ip_block = TRUE, ip_block_type = ? WHERE id = ?`,
            [blockType, eventId]
        );

        // Cache invalidacio: az ipBlockGuard middleware 60 mp TTL-es cache-t hasznal,
        // a friss IP blokkot azonnal effektivizaljuk.
        try {
            const ipBlockGuard = require('../../api/middleware/ipBlockGuard.js');
            if (typeof ipBlockGuard.invalidateIpBlockCache === 'function') {
                ipBlockGuard.invalidateIpBlockCache(normalizedIp);
            }
        } catch (_) {}

        return {
            eventId,
            triggeredIpBlock: true,
            priorOtherUsers,
            blockType,
            blockedUntil: blockedUntil ? blockedUntil.toISOString() : null,
            ipAddress: normalizedIp
        };
    } catch (error) {
        console.warn('recordAccountBanEvent hiba:', error.message);
        return { eventId: null, triggeredIpBlock: false, ipAddress: normalizedIp };
    }
}

// Kisegito: a user utolso login IP-jet adja vissza (admin manual ban-nal hasznalt).
async function getUserLastLoginIp(userId) {
    const pool = getPool();
    const numericUserId = Number(userId) || 0;
    if (!numericUserId) return null;
    try {
        const [rows] = await pool.execute(
            `SELECT last_login_ip FROM users WHERE id = ? LIMIT 1`,
            [numericUserId]
        );
        return rows[0]?.last_login_ip || null;
    } catch (error) {
        console.warn('getUserLastLoginIp hiba:', error.message);
        return null;
    }
}

async function setUserLastLoginIp(userId, ipAddress) {
    const pool = getPool();
    const numericUserId = Number(userId) || 0;
    const normalizedIp = ipAddress ? String(ipAddress).slice(0, 45) : null;
    if (!numericUserId || !normalizedIp) return;
    try {
        await pool.execute(
            `UPDATE users SET last_login_ip = ? WHERE id = ?`,
            [normalizedIp, numericUserId]
        );
    } catch (error) {
        console.warn('setUserLastLoginIp hiba:', error.message);
    }
}

async function unbanUser(userId) {
    const pool = getPool();
    await pool.execute(
        'UPDATE users SET is_banned = FALSE, ban_reason = NULL, banned_until = NULL WHERE id = ?',
        [userId]
    );
}

// Gyors index lookup minden authentikalt request-en — ban + soft-delete statusz.
// Visszaadja: { is_banned: 0|1, pending_deletion_until: TIMESTAMP|null } vagy null ha a user nem letezik.
// Az isAuthenticated middleware mindkettot kiakasztja (az admin-soft-delete = belepes-tiltas).
async function checkUserBanStatus(userId) {
    const pool = getPool();
    try {
        const [rows] = await pool.execute(
            'SELECT is_banned, pending_deletion_until FROM users WHERE id = ? LIMIT 1',
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
    isEmailBanned,
    recordAccountBanEvent,
    getUserLastLoginIp,
    setUserLastLoginIp,
    isLoopbackIp
};
