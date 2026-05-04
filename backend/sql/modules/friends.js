const { getPool } = require('../database.js');
const { applyProfileImageVisibility } = require('./profileImage.js');

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

function buildFriendListItem(row, relationStatus, viewerUserId = 0) {
    const normalizedStatus = String(relationStatus || 'none');
    const ownBlockActive = Boolean(Number(row.own_block_active || 0));
    const oppositeBlockActive = Boolean(Number(row.opposite_block_active || 0));
    const isBlockedContext = normalizedStatus.startsWith('blocked');

    const visibility = applyProfileImageVisibility(
        row.profile_image,
        row.profile_image_status,
        row.id,
        viewerUserId
    );

    return {
        userId: row.id,
        username: row.username,
        profileImage: visibility.profileImage,
        profileImageStatus: visibility.profileImageStatus,
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

async function addFriendRequest(currentUserId, targetUserId) {
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        if (await isEitherUserBlocked(currentUserId, targetUserId, connection)) {
            throw new Error('A barát kérelem nem küldhető, mert valamelyik fél tiltásban van.');
        }

        const [user1Id, user2Id] = normalizeFriendPair(currentUserId, targetUserId);

        const [existingRows] = await connection.execute(
            'SELECT status FROM friends WHERE user1_id = ? AND user2_id = ?',
            [user1Id, user2Id]
        );

        if (existingRows.length > 0) {
            const existingStatus = existingRows[0].status;
            if (existingStatus === 'pending' || existingStatus === 'accepted') {
                throw new Error('Már van függőben vagy fogadott barát kérelem.');
            }
            if (existingStatus === 'rejected') {
                await connection.execute(
                    'UPDATE friends SET status = ?, action_user_id = ?, invite_time = NOW() WHERE user1_id = ? AND user2_id = ?',
                    ['pending', currentUserId, user1Id, user2Id]
                );
            } else {
                throw new Error('A barát kapcsolat állapota miatt nem küldhető új kérelem.');
            }
        } else {
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
        return rows.map((row) => buildFriendListItem(row, 'friends', userId));
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
        return rows.map((row) => buildFriendListItem(row, 'incoming_pending', userId));
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
        return rows.map((row) => buildFriendListItem({ ...row, own_block_active: 1, opposite_block_active: 0 }, 'blocked_by_me', userId));
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
        return rows.map((row) => buildFriendListItem({ ...row, own_block_active: 0, opposite_block_active: 1 }, 'blocked_by_them', userId));
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

module.exports = {
    normalizeFriendPair,
    ensureFriendBlocksTable,
    isEitherUserBlocked,
    buildFriendListItem,
    addFriendRequest,
    getFriendStatus,
    getAcceptedFriendsForUser,
    getIncomingPendingFriendsForUser,
    getBlockedUsersForUser,
    getBlockedByThemForUser,
    getFriendListForUser,
    acceptFriendRequest,
    rejectFriendRequest,
    blockUserDirectional,
    unblockUserDirectional,
    deleteFriendConnection
};
