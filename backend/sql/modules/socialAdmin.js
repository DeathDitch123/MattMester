// Kozossegi kapcsolatok admin-szintu olvaso/iro modul. A "Kozossegi kapcsolatok"
// admin oldal hivja. Listazza a baratkereseket es blokkokat, illetve admin-szintu
// "force unblock" muveletet biztosit (a blokk active=FALSE-ra valtas).
//
// Az admin csak monitoringra es kivetelszeruen blokk-feloldasra hasznalja —
// barati kapcsolatokba (accept/reject) altalaban nem nyul be.

const { getPool } = require('../database.js');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

function clampOffset(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.max(0, Math.floor(n));
}

// Friend requests (status=pending|accepted|rejected) listaja userek nevevel.
// Default: pending. Frissites szerint csokkeno sorrend.
async function listFriendRequests(options = {}) {
    const status = ['pending', 'accepted', 'rejected', 'blocked'].includes(options.status)
        ? options.status
        : 'pending';
    const limit = clampLimit(options.limit);
    const offset = clampOffset(options.offset);
    const pool = getPool();

    const [rows] = await pool.execute(
        `SELECT f.id, f.user1_id, f.user2_id, f.action_user_id, f.status, f.invite_time,
                u1.username AS user1_username,
                u2.username AS user2_username,
                ua.username AS action_username
         FROM friends f
         LEFT JOIN users u1 ON u1.id = f.user1_id
         LEFT JOIN users u2 ON u2.id = f.user2_id
         LEFT JOIN users ua ON ua.id = f.action_user_id
         WHERE f.status = ?
         ORDER BY f.invite_time DESC
         LIMIT ${limit} OFFSET ${offset}`,
        [status]
    );

    return rows.map((row) => {
        const fromIsUser1 = Number(row.action_user_id) === Number(row.user1_id);
        const fromUser = fromIsUser1
            ? { id: row.user1_id, username: row.user1_username }
            : { id: row.user2_id, username: row.user2_username };
        const toUser = fromIsUser1
            ? { id: row.user2_id, username: row.user2_username }
            : { id: row.user1_id, username: row.user1_username };
        return {
            id: row.id,
            from: fromUser,
            to: toUser,
            status: row.status,
            inviteTime: row.invite_time
        };
    });
}

async function listFriendBlocks(options = {}) {
    const onlyActive = options.activeOnly !== false;
    const limit = clampLimit(options.limit);
    const offset = clampOffset(options.offset);
    const pool = getPool();

    const [rows] = await pool.execute(
        `SELECT b.id, b.blocker_user_id, b.blocked_user_id, b.active,
                b.created_at, b.updated_at,
                ub.username AS blocker_username,
                ud.username AS blocked_username
         FROM friend_blocks b
         LEFT JOIN users ub ON ub.id = b.blocker_user_id
         LEFT JOIN users ud ON ud.id = b.blocked_user_id
         ${onlyActive ? 'WHERE b.active = TRUE' : ''}
         ORDER BY b.updated_at DESC
         LIMIT ${limit} OFFSET ${offset}`
    );

    return rows.map((row) => ({
        id: row.id,
        blocker: { id: row.blocker_user_id, username: row.blocker_username },
        blocked: { id: row.blocked_user_id, username: row.blocked_username },
        active: Boolean(row.active),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }));
}

// Force-unblock: az admin egy aktiv blokkot deaktival. Visszaadja before/after.
async function forceUnblock(blockerId, blockedId) {
    const pool = getPool();
    const [rows] = await pool.execute(
        `SELECT id, blocker_user_id, blocked_user_id, active, created_at, updated_at
         FROM friend_blocks
         WHERE blocker_user_id = ? AND blocked_user_id = ?
         LIMIT 1`,
        [Number(blockerId) || 0, Number(blockedId) || 0]
    );
    if (!rows.length) {
        const err = new Error('A megadott blokk nem talalhato.');
        err.code = 'BLOCK_NOT_FOUND';
        throw err;
    }
    const before = {
        id: rows[0].id,
        blockerUserId: rows[0].blocker_user_id,
        blockedUserId: rows[0].blocked_user_id,
        active: Boolean(rows[0].active)
    };
    if (!before.active) {
        const err = new Error('Ez a blokk mar nincs aktivan.');
        err.code = 'BLOCK_INACTIVE';
        throw err;
    }
    await pool.execute(
        `UPDATE friend_blocks SET active = FALSE WHERE id = ?`,
        [before.id]
    );
    const after = { ...before, active: false };
    return { before, after };
}

// Aggregalt szamlalok a stats-kartyakhoz.
async function getSocialCounts() {
    const pool = getPool();
    const [rows] = await pool.execute(
        `SELECT
            (SELECT COUNT(*) FROM friends WHERE status = 'accepted') AS total_friendships,
            (SELECT COUNT(*) FROM friends WHERE status = 'pending') AS pending_requests,
            (SELECT COUNT(*) FROM friend_blocks WHERE active = TRUE) AS active_blocks`
    );
    const r = rows[0] || {};
    return {
        totalFriendships: Number(r.total_friendships) || 0,
        pendingRequests: Number(r.pending_requests) || 0,
        activeBlocks: Number(r.active_blocks) || 0
    };
}

module.exports = {
    listFriendRequests,
    listFriendBlocks,
    forceUnblock,
    getSocialCounts
};
