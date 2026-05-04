const { getPool } = require('../database.js');
const {
    ALLOWED_NOTIFICATION_TARGET_ROLES,
    normalizePositiveInt,
    normalizeListLimit
} = require('./_shared.js');

const ALLOWED_NOTIFICATION_AUDIENCES = new Set(['user', 'multi', 'global', 'role', 'system']);
const ALLOWED_NOTIFICATION_SEVERITIES = new Set(['info', 'success', 'warning', 'error']);

function normalizeNotificationInput(notification) {
    const input = notification && typeof notification === 'object' ? notification : {};
    const type = String(input.type || '').trim().slice(0, 64);
    const audience = ALLOWED_NOTIFICATION_AUDIENCES.has(input.audience) ? input.audience : 'user';
    const severity = ALLOWED_NOTIFICATION_SEVERITIES.has(input.severity) ? input.severity : 'info';
    const targetRole = ALLOWED_NOTIFICATION_TARGET_ROLES.has(input.targetRole) ? input.targetRole : null;
    const targetUserId = normalizePositiveInt(input.targetUserId, 0) || null;
    const senderUserId = normalizePositiveInt(input.senderUserId, 0) || null;
    const title = String(input.title || '').trim().slice(0, 160);
    const message = String(input.message || '').trim().slice(0, 500);
    let payloadJson = null;
    if (input.payload && typeof input.payload === 'object') {
        try {
            payloadJson = JSON.stringify(input.payload);
        } catch (serializeError) {
            payloadJson = null;
        }
    }
    return {
        type,
        audience,
        severity,
        targetRole,
        targetUserId,
        senderUserId,
        title,
        message,
        payloadJson
    };
}

async function insertNotification(notification) {
    const pool = getPool();
    let insertedRow = null;
    try {
        const data = normalizeNotificationInput(notification);
        if (!data.type) {
            throw new Error('Értesítés típus kötelező.');
        }
        if (!data.title) {
            throw new Error('Értesítés cím kötelező.');
        }
        if (!data.message) {
            throw new Error('Értesítés szöveg kötelező.');
        }
        if (data.audience === 'user' && !data.targetUserId) {
            throw new Error('Egy célzott értesítéshez target_user_id kötelező.');
        }
        if (data.audience === 'role' && !data.targetRole) {
            throw new Error('Szerep alapú értesítéshez target_role kötelező.');
        }

        const [result] = await pool.execute(
            `
                INSERT INTO notifications
                    (type, audience, target_user_id, target_role, sender_user_id,
                     title, message, payload, severity)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                data.type,
                data.audience,
                data.targetUserId,
                data.targetRole,
                data.senderUserId,
                data.title,
                data.message,
                data.payloadJson,
                data.severity
            ]
        );

        insertedRow = {
            id: result.insertId,
            type: data.type,
            audience: data.audience,
            targetUserId: data.targetUserId,
            targetRole: data.targetRole,
            senderUserId: data.senderUserId,
            title: data.title,
            message: data.message,
            payload: data.payloadJson ? JSON.parse(data.payloadJson) : null,
            severity: data.severity,
            createdAt: new Date().toISOString(),
            isRead: false
        };
    } catch (error) {
        throw new Error(error.message || 'Hiba az értesítés mentése során.');
    }
    return insertedRow;
}

async function getNotificationsForUser(userId, userRole, limit = 30, cursor = null) {
    const pool = getPool();
    let result = { data: [], nextCursor: null, hasMore: false };
    try {
        const normalizedUserId = normalizePositiveInt(userId, 0);
        if (!normalizedUserId) {
            throw new Error('Érvénytelen felhasználó azonosító.');
        }

        const normalizedRole = ALLOWED_NOTIFICATION_TARGET_ROLES.has(userRole) ? userRole : 'player';
        const normalizedLimit = normalizeListLimit(limit, 30, 100);
        const normalizedCursor = normalizePositiveInt(cursor, 0);

        const params = [normalizedUserId, normalizedUserId, normalizedRole];
        let cursorClause = '';
        if (normalizedCursor) {
            cursorClause = 'AND n.id < ?';
            params.push(normalizedCursor);
        }
        params.push(normalizedLimit + 1);

        // Dismissed (per-user soft-deleted) ertesiteseket nem listazzuk.
        const [rows] = await pool.execute(
            `
                SELECT
                    n.id,
                    n.type,
                    n.audience,
                    n.target_user_id,
                    n.target_role,
                    n.sender_user_id,
                    sender.username AS sender_username,
                    n.title,
                    n.message,
                    n.payload,
                    n.severity,
                    n.created_at,
                    CASE WHEN nr.read_at IS NULL THEN 0 ELSE 1 END AS is_read
                FROM notifications n
                LEFT JOIN notification_reads nr
                    ON nr.notification_id = n.id AND nr.user_id = ?
                LEFT JOIN users sender ON sender.id = n.sender_user_id
                WHERE (
                    n.target_user_id = ?
                    OR n.audience = 'global'
                    OR (n.audience = 'role' AND n.target_role = ?)
                )
                AND (nr.dismissed_at IS NULL)
                ${cursorClause}
                ORDER BY n.id DESC
                LIMIT ?
            `,
            params
        );

        const hasMore = rows.length > normalizedLimit;
        const sliced = hasMore ? rows.slice(0, normalizedLimit) : rows;

        const data = sliced.map((row) => {
            let payload = null;
            if (row.payload) {
                try {
                    payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
                } catch (parseError) {
                    payload = null;
                }
            }
            return {
                id: Number(row.id),
                type: row.type,
                audience: row.audience,
                targetUserId: row.target_user_id ? Number(row.target_user_id) : null,
                targetRole: row.target_role || null,
                senderUserId: row.sender_user_id ? Number(row.sender_user_id) : null,
                senderUsername: row.sender_username || null,
                title: row.title,
                message: row.message,
                payload,
                severity: row.severity,
                createdAt: row.created_at,
                isRead: Boolean(row.is_read)
            };
        });

        result = {
            data,
            nextCursor: hasMore && data.length ? data[data.length - 1].id : null,
            hasMore
        };
    } catch (error) {
        throw new Error(error.message || 'Hiba az értesítések lekérése során.');
    }
    return result;
}

async function markNotificationRead(userId, notificationId) {
    const pool = getPool();
    let outcome = { changed: false };
    try {
        const normalizedUserId = normalizePositiveInt(userId, 0);
        const normalizedNotificationId = normalizePositiveInt(notificationId, 0);
        if (!normalizedUserId) {
            throw new Error('Érvénytelen felhasználó azonosító.');
        }
        if (!normalizedNotificationId) {
            throw new Error('Érvénytelen értesítés azonosító.');
        }

        const [accessRows] = await pool.execute(
            `
                SELECT n.id
                FROM notifications n
                LEFT JOIN users u ON u.id = ?
                WHERE n.id = ?
                  AND (
                        n.target_user_id = ?
                        OR n.audience = 'global'
                        OR (n.audience = 'role' AND n.target_role = u.role)
                  )
                LIMIT 1
            `,
            [normalizedUserId, normalizedNotificationId, normalizedUserId]
        );

        if (accessRows.length) {
            const [insertResult] = await pool.execute(
                `
                    INSERT INTO notification_reads (notification_id, user_id, read_at)
                    VALUES (?, ?, NOW())
                    ON DUPLICATE KEY UPDATE
                        read_at = COALESCE(read_at, VALUES(read_at))
                `,
                [normalizedNotificationId, normalizedUserId]
            );
            // affectedRows: 1 = beszurva, 2 = update tortent, 0 = no-op (mar volt read_at)
            outcome = { changed: insertResult.affectedRows === 1 };
        }
    } catch (error) {
        throw new Error(error.message || 'Hiba az értesítés olvasottá jelölése során.');
    }
    return outcome;
}

// Egy adott ertesites permanens user-oldali eltavolitasa (X / akcio gomb).
// Idempotens: tobbszori hivas nem hibazik, dismissed_at nem irodik felul.
async function dismissNotificationForUser(userId, notificationId) {
    const pool = getPool();
    let outcome = { changed: false, alreadyDismissed: false, accessible: false };
    try {
        const normalizedUserId = normalizePositiveInt(userId, 0);
        const normalizedNotificationId = normalizePositiveInt(notificationId, 0);
        if (!normalizedUserId) {
            throw new Error('Érvénytelen felhasználó azonosító.');
        }
        if (!normalizedNotificationId) {
            throw new Error('Érvénytelen értesítés azonosító.');
        }

        const [accessRows] = await pool.execute(
            `
                SELECT n.id, nr.dismissed_at
                FROM notifications n
                LEFT JOIN users u ON u.id = ?
                LEFT JOIN notification_reads nr
                    ON nr.notification_id = n.id AND nr.user_id = ?
                WHERE n.id = ?
                  AND (
                        n.target_user_id = ?
                        OR n.audience = 'global'
                        OR (n.audience = 'role' AND n.target_role = u.role)
                  )
                LIMIT 1
            `,
            [normalizedUserId, normalizedUserId, normalizedNotificationId, normalizedUserId]
        );

        if (accessRows.length) {
            outcome.accessible = true;
            const wasAlreadyDismissed = accessRows[0].dismissed_at !== null;
            outcome.alreadyDismissed = wasAlreadyDismissed;
            if (!wasAlreadyDismissed) {
                await pool.execute(
                    `
                        INSERT INTO notification_reads (notification_id, user_id, read_at, dismissed_at)
                        VALUES (?, ?, NOW(), NOW())
                        ON DUPLICATE KEY UPDATE
                            read_at = COALESCE(read_at, VALUES(read_at)),
                            dismissed_at = COALESCE(dismissed_at, VALUES(dismissed_at))
                    `,
                    [normalizedNotificationId, normalizedUserId]
                );
                outcome.changed = true;
            }
        }
    } catch (error) {
        throw new Error(error.message || 'Hiba az értesítés eltávolítása során.');
    }
    return outcome;
}

// Friend action utani cleanup: az adott senderhez tartozo friend_request
// ertesiteseket dismiss-eli a current usernel (nem read csak), hogy
// session-valtas utan se jojjenek vissza.
async function dismissFriendRequestNotificationsForUser(userId, senderUserId) {
    const pool = getPool();
    let outcome = { changed: 0 };
    try {
        const normalizedUserId = normalizePositiveInt(userId, 0);
        const normalizedSenderUserId = normalizePositiveInt(senderUserId, 0);
        if (!normalizedUserId) {
            throw new Error('Érvénytelen felhasználó azonosító.');
        }
        if (!normalizedSenderUserId) {
            throw new Error('Érvénytelen kuldo felhasznalo azonosito.');
        }

        // 1. lepes: uj sorokat huzunk fel azokra az ertesitesekre, amelyek
        //   meg nincsenek a notification_reads-ben (uj sor = read+dismiss egyutt).
        const [insertResult] = await pool.execute(
            `
                INSERT IGNORE INTO notification_reads (notification_id, user_id, read_at, dismissed_at)
                SELECT n.id, ?, NOW(), NOW()
                FROM notifications n
                LEFT JOIN notification_reads nr
                    ON nr.notification_id = n.id AND nr.user_id = ?
                WHERE nr.notification_id IS NULL
                  AND n.type = 'friend_request'
                  AND n.target_user_id = ?
                  AND n.sender_user_id = ?
            `,
            [normalizedUserId, normalizedUserId, normalizedUserId, normalizedSenderUserId]
        );

        // 2. lepes: a mar letezo soroknal (csak read volt) dismissed_at beallitas.
        const [updateResult] = await pool.execute(
            `
                UPDATE notification_reads nr
                JOIN notifications n
                    ON n.id = nr.notification_id
                SET nr.dismissed_at = NOW(),
                    nr.read_at = COALESCE(nr.read_at, NOW())
                WHERE nr.user_id = ?
                  AND nr.dismissed_at IS NULL
                  AND n.type = 'friend_request'
                  AND n.target_user_id = ?
                  AND n.sender_user_id = ?
            `,
            [normalizedUserId, normalizedUserId, normalizedSenderUserId]
        );

        outcome = {
            changed: Number(insertResult.affectedRows || 0) + Number(updateResult.affectedRows || 0)
        };
    } catch (error) {
        throw new Error(error.message || 'Hiba a friend request ertesites eltavolitasakor.');
    }
    return outcome;
}

// "Mind olvasott" UI gomb backend-je: minden lathato (meg nem dismissed)
// ertesitest permanensen eltavolit a user nezetebol (read+dismiss egyutt).
// A felirat a UI-on magyar konvencio miatt marad "Mind olvasott", de a
// viselkedes tenyleges per-user dismiss minden listazott elemen.
async function dismissAllNotificationsForUser(userId, userRole) {
    const pool = getPool();
    let outcome = { changed: 0 };
    try {
        const normalizedUserId = normalizePositiveInt(userId, 0);
        if (!normalizedUserId) {
            throw new Error('Érvénytelen felhasználó azonosító.');
        }
        const normalizedRole = ALLOWED_NOTIFICATION_TARGET_ROLES.has(userRole) ? userRole : 'player';

        const [insertResult] = await pool.execute(
            `
                INSERT IGNORE INTO notification_reads (notification_id, user_id, read_at, dismissed_at)
                SELECT n.id, ?, NOW(), NOW()
                FROM notifications n
                LEFT JOIN notification_reads nr
                    ON nr.notification_id = n.id AND nr.user_id = ?
                WHERE nr.notification_id IS NULL
                  AND (
                        n.target_user_id = ?
                        OR n.audience = 'global'
                        OR (n.audience = 'role' AND n.target_role = ?)
                  )
            `,
            [normalizedUserId, normalizedUserId, normalizedUserId, normalizedRole]
        );

        const [updateResult] = await pool.execute(
            `
                UPDATE notification_reads nr
                JOIN notifications n
                    ON n.id = nr.notification_id
                LEFT JOIN users u ON u.id = ?
                SET nr.dismissed_at = NOW(),
                    nr.read_at = COALESCE(nr.read_at, NOW())
                WHERE nr.user_id = ?
                  AND nr.dismissed_at IS NULL
                  AND (
                        n.target_user_id = ?
                        OR n.audience = 'global'
                        OR (n.audience = 'role' AND n.target_role = ?)
                  )
            `,
            [normalizedUserId, normalizedUserId, normalizedUserId, normalizedRole]
        );

        outcome = {
            changed: Number(insertResult.affectedRows || 0) + Number(updateResult.affectedRows || 0)
        };
    } catch (error) {
        throw new Error(error.message || 'Hiba az értesítések tömeges eltávolítása során.');
    }
    return outcome;
}

async function getUnreadNotificationCount(userId, userRole) {
    const pool = getPool();
    let count = 0;
    try {
        const normalizedUserId = normalizePositiveInt(userId, 0);
        if (!normalizedUserId) {
            throw new Error('Érvénytelen felhasználó azonosító.');
        }
        const normalizedRole = ALLOWED_NOTIFICATION_TARGET_ROLES.has(userRole) ? userRole : 'player';

        // Olvasatlan = read_at IS NULL ES dismissed_at IS NULL.
        // (A dismiss workflow mindig read_at-et is beallit, igy a ket feltetel
        // nem mond ellent egymasnak; a vedelem szandekos, ha kulso path
        // valaha is csak dismissed_at-et allitana be.)
        const [rows] = await pool.execute(
            `
                SELECT COUNT(*) AS unread_count
                FROM notifications n
                LEFT JOIN notification_reads nr
                    ON nr.notification_id = n.id AND nr.user_id = ?
                WHERE (nr.read_at IS NULL)
                  AND (nr.dismissed_at IS NULL)
                  AND (
                        n.target_user_id = ?
                        OR n.audience = 'global'
                        OR (n.audience = 'role' AND n.target_role = ?)
                  )
            `,
            [normalizedUserId, normalizedUserId, normalizedRole]
        );

        count = Number(rows[0]?.unread_count || 0);
    } catch (error) {
        throw new Error(error.message || 'Hiba az olvasatlan értesítések számolása során.');
    }
    return count;
}

module.exports = {
    ALLOWED_NOTIFICATION_AUDIENCES,
    ALLOWED_NOTIFICATION_SEVERITIES,
    ALLOWED_NOTIFICATION_TARGET_ROLES,
    normalizeNotificationInput,
    insertNotification,
    getNotificationsForUser,
    markNotificationRead,
    dismissNotificationForUser,
    dismissFriendRequestNotificationsForUser,
    dismissAllNotificationsForUser,
    getUnreadNotificationCount
};
