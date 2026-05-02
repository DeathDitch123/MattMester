const { getPool } = require('../database.js');
const {
    DEFAULT_PROFILE_IMAGE_PATH,
    applyProfileImageVisibility
} = require('./profileImage.js');
const {
    normalizeFriendPair,
    ensureFriendBlocksTable
} = require('./friends.js');
const {
    normalizePositiveInt,
    normalizeListLimit
} = require('./_shared.js');

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
    'fasszopó',
    'faszszopó',
    'csapi',
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
    'kurvanyomor',
    'nigger',
    'nigga',
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
    'muie',
    'román'
];

function escapeRegex(input) {
    return String(input || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeTextForModeration(message) {
    const raw = String(message || '');
    return raw
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
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

// Az email-modositas miatti ideiglenes verifikacio-vesztes NEM szunteti meg
// a beszelgetest, ezert itt szandekosan NEM ellenorizzuk az is_email_verified
// mezot. A profil akkor szamit "torolt"-nek, ha a users rekord nem letezik
// (FOREIGN KEY ON DELETE CASCADE torli a kapcsolodo sorokat is).
async function canUsersChat(userAId, userBId, executor = null) {
    const db = executor || getPool();
    const normalizedA = normalizePositiveInt(userAId, 0);
    const normalizedB = normalizePositiveInt(userBId, 0);

    const defaultReason = (reason) => ({ canChat: false, reason });

    if (!normalizedA || !normalizedB || normalizedA === normalizedB) {
        return defaultReason('invalid_users');
    }

    try {
        await ensureFriendBlocksTable(db);

        const [userRows] = await db.execute(
            `
                SELECT id, is_banned
                FROM users
                WHERE id IN (?, ?)
            `,
            [normalizedA, normalizedB]
        );

        if (userRows.length < 2) {
            return defaultReason('user_deleted');
        }

        const anyBanned = userRows.some((row) => Boolean(Number(row.is_banned || 0)));
        if (anyBanned) {
            return defaultReason('user_banned');
        }

        const [user1Id, user2Id] = normalizeFriendPair(normalizedA, normalizedB);
        const [friendRows] = await db.execute(
            `
                SELECT status
                FROM friends
                WHERE user1_id = ?
                  AND user2_id = ?
                LIMIT 1
            `,
            [user1Id, user2Id]
        );

        if (!friendRows.length || friendRows[0].status !== 'accepted') {
            return defaultReason('not_friends');
        }

        const [blockRows] = await db.execute(
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
            [normalizedA, normalizedB, normalizedB, normalizedA]
        );

        if (blockRows.length) {
            return defaultReason('blocked');
        }

        return { canChat: true, reason: null };
    } catch (error) {
        throw new Error('Hiba a canUsersChat ellenorzese soran.');
    }
}

async function getPrivateConversationParticipantIds(conversationId, executor = null) {
    const db = executor || getPool();
    const normalizedConversationId = normalizePositiveInt(conversationId, 0);
    if (!normalizedConversationId) {
        return [];
    }

    const [rows] = await db.execute(
        `
            SELECT cp.user_id
            FROM chat_participants cp
            JOIN chat_conversations c ON c.id = cp.conversation_id
            WHERE cp.conversation_id = ?
              AND c.type = 'private'
        `,
        [normalizedConversationId]
    );

    return rows.map((row) => Number(row.user_id)).filter((id) => id > 0);
}

// Torli a ket felhasznalo kozotti privat beszelgetest, ha letezik.
// Egyszeru torles (nem archivalas). A cascade a resztvevoket es uzeneteket is torli.
async function cleanupDirectConversationBetween(userAId, userBId) {
    const pool = getPool();
    const connection = await pool.getConnection();
    const normalizedA = normalizePositiveInt(userAId, 0);
    const normalizedB = normalizePositiveInt(userBId, 0);

    if (!normalizedA || !normalizedB || normalizedA === normalizedB) {
        connection.release();
        return { deletedConversationIds: [], participantUserIds: [] };
    }

    try {
        await connection.beginTransaction();
        await ensureChatTables(connection);

        const [rows] = await connection.execute(
            `
                SELECT c.id AS conversation_id
                FROM chat_conversations c
                JOIN chat_participants cp ON cp.conversation_id = c.id
                WHERE c.type = 'private'
                  AND cp.user_id IN (?, ?)
                GROUP BY c.id
                HAVING COUNT(DISTINCT cp.user_id) = 2
                   AND (
                       SELECT COUNT(*) FROM chat_participants cp2
                       WHERE cp2.conversation_id = c.id
                   ) = 2
            `,
            [normalizedA, normalizedB]
        );

        const conversationIds = rows.map((row) => Number(row.conversation_id)).filter(Boolean);

        if (conversationIds.length) {
            const placeholders = conversationIds.map(() => '?').join(',');
            await connection.execute(
                `DELETE FROM chat_conversations WHERE id IN (${placeholders})`,
                conversationIds
            );
        }

        await connection.commit();

        return {
            deletedConversationIds: conversationIds,
            participantUserIds: [normalizedA, normalizedB]
        };
    } catch (error) {
        await connection.rollback();
        throw new Error('Hiba a privat beszelgetes takaritasa soran.');
    } finally {
        connection.release();
    }
}

// Teljes sepret a user osszes privat beszelgetesen: amelyikre canChat=false,
// azt torli. Hatekonyan listazza a torlendoket, majd atomi DELETE-tel torol.
async function cleanupUnusableConversationsForUser(userId) {
    const pool = getPool();
    const normalizedUserId = normalizePositiveInt(userId, 0);
    const result = { deletedConversationIds: [], affectedPairs: [] };

    if (!normalizedUserId) {
        return result;
    }

    await ensureChatTables(pool);
    await ensureFriendBlocksTable(pool);

    const [rows] = await pool.execute(
        `
            SELECT c.id AS conversation_id, other_cp.user_id AS other_user_id
            FROM chat_conversations c
            JOIN chat_participants self_cp
                ON self_cp.conversation_id = c.id AND self_cp.user_id = ?
            JOIN chat_participants other_cp
                ON other_cp.conversation_id = c.id AND other_cp.user_id <> ?
            WHERE c.type = 'private'
        `,
        [normalizedUserId, normalizedUserId]
    );

    const idsToDelete = [];
    for (const row of rows) {
        const otherUserId = Number(row.other_user_id);
        if (!otherUserId) continue;
        // Kulon ellenorzes minden parra – kis volumenu, egy user chat-listaja rovid.
        // Nagy meretekhez erdemes lenne JOIN-alapu bulk lekerdezesre cserelni.
        const { canChat } = await canUsersChat(normalizedUserId, otherUserId);
        if (!canChat) {
            idsToDelete.push(Number(row.conversation_id));
            result.affectedPairs.push([normalizedUserId, otherUserId]);
        }
    }

    if (idsToDelete.length) {
        const placeholders = idsToDelete.map(() => '?').join(',');
        await pool.execute(
            `DELETE FROM chat_conversations WHERE id IN (${placeholders})`,
            idsToDelete
        );
        result.deletedConversationIds = idsToDelete;
    }

    return result;
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

// Privat chatre kibovitett vedelem: reszvetel + canChat ellenorzes.
// Ha a kapcsolat mar nem el, a beszelgetest torli es hibat dob.
// Visszaadja a konverzacio tipusat, hogy a hivo eldonthesse, emit-elni kell-e.
async function assertConversationUsable(userId, conversationId) {
    const pool = getPool();
    await assertConversationParticipant(userId, conversationId);

    const normalizedUserId = normalizePositiveInt(userId, 0);
    const normalizedConversationId = normalizePositiveInt(conversationId, 0);

    const [conversationRows] = await pool.execute(
        `SELECT type FROM chat_conversations WHERE id = ? LIMIT 1`,
        [normalizedConversationId]
    );

    if (!conversationRows.length) {
        throw new Error('A beszélgetés már nem található.');
    }

    if (conversationRows[0].type !== 'private') {
        return { type: conversationRows[0].type };
    }

    const participantIds = await getPrivateConversationParticipantIds(normalizedConversationId, pool);
    const otherUserId = participantIds.find((id) => id !== normalizedUserId);

    if (!otherUserId) {
        await pool.execute(`DELETE FROM chat_conversations WHERE id = ?`, [normalizedConversationId]);
        const err = new Error('A beszélgetés már nem elérhető.');
        err.conversationId = normalizedConversationId;
        err.affectedUserIds = [normalizedUserId];
        err.code = 'CONVERSATION_UNAVAILABLE';
        throw err;
    }

    const permission = await canUsersChat(normalizedUserId, otherUserId);
    if (!permission.canChat) {
        await pool.execute(`DELETE FROM chat_conversations WHERE id = ?`, [normalizedConversationId]);
        const err = new Error('A beszélgetés már nem elérhető.');
        err.conversationId = normalizedConversationId;
        err.affectedUserIds = [normalizedUserId, otherUserId];
        err.code = 'CONVERSATION_UNAVAILABLE';
        err.reason = permission.reason;
        throw err;
    }

    return { type: 'private', otherUserId };
}

async function getUserConversations(userId, limit = 20, cursor = null) {
    const pool = getPool();
    const normalizedUserId = normalizePositiveInt(userId, 0);
    if (!normalizedUserId) {
        throw new Error('Érvénytelen felhasználó azonosító.');
    }

    try {
        await ensureChatTables(pool);

        // Dinamikus szures: a listazas elott lefuttatjuk a cleanupot, hogy
        // csak aktiv kommunikacios kapcsolattal rendelkezo beszelgetesek
        // maradjanak. A cleanup hibaja nem blokkolhatja a listazast.
        try {
            await cleanupUnusableConversationsForUser(normalizedUserId);
        } catch (cleanupError) {
            console.warn('[chat] Listázás előtti cleanup hiba:', cleanupError.message);
        }

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
                    CASE
                        WHEN other_user.profile_image = '/profile_pictures/default.png' THEN 'default'
                        ELSE COALESCE(
                            (
                                SELECT piu.status
                                FROM profile_image_uploads piu
                                WHERE piu.user_id = other_user.id
                                ORDER BY piu.upload_time DESC, piu.id DESC
                                LIMIT 1
                            ),
                            'approved'
                        )
                    END AS other_user_profile_image_status
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
                ? (() => {
                    const visibility = applyProfileImageVisibility(
                        row.other_user_profile_image,
                        row.other_user_profile_image_status,
                        row.other_user_id,
                        normalizedUserId
                    );
                    return {
                        userId: row.other_user_id,
                        username: row.other_user_username,
                        profileImage: visibility.profileImage,
                        profileImageStatus: visibility.profileImageStatus
                    };
                })()
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
                    END AS sender_profile_image_status
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
            data: sliced.map((row) => {
                const visibility = applyProfileImageVisibility(
                    row.sender_profile_image,
                    row.sender_profile_image_status,
                    row.sender_id,
                    normalizedUserId
                );
                return {
                    id: row.id,
                    conversationId: row.conversation_id,
                    senderId: row.sender_id,
                    senderUsername: row.sender_username,
                    senderProfileImage: visibility.profileImage,
                    senderProfileImageStatus: visibility.profileImageStatus,
                    body: row.is_body_masked ? (row.body_masked || row.body) : row.body,
                    bodyOriginal: row.body,
                    isBodyMasked: Boolean(row.is_body_masked),
                    sentAt: row.sent_at
                };
            }),
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

        const permission = await canUsersChat(normalizedCurrentUserId, normalizedTargetUserId, connection);
        if (!permission.canChat) {
            const reasonMessage = {
                blocked: 'A privát beszélgetés nem nyitható meg tiltás miatt.',
                not_friends: 'A privát beszélgetés csak elfogadott barátok között nyitható meg.',
                user_banned: 'A privát beszélgetés nem nyitható meg: egyik fél letiltott.',
                user_deleted: 'A privát beszélgetés nem nyitható meg: a másik fél már nem elérhető.',
                invalid_users: 'Érvénytelen felhasználó azonosító.'
            };
            throw new Error(reasonMessage[permission.reason] || 'A privát beszélgetés jelenleg nem elérhető.');
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
                    END AS sender_profile_image_status
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

async function getUnreadChatMessageTotal(userId) {
    const pool = getPool();
    let total = 0;
    try {
        const normalizedUserId = normalizePositiveInt(userId, 0);
        if (!normalizedUserId) {
            throw new Error('Érvénytelen felhasználó azonosító.');
        }

        const [rows] = await pool.execute(
            `
                SELECT COALESCE(SUM(unread_per_conv.unread_count), 0) AS total_unread
                FROM (
                    SELECT (
                        SELECT COUNT(*)
                        FROM chat_messages msg
                        WHERE msg.conversation_id = current_participant.conversation_id
                          AND msg.id > COALESCE(current_participant.last_read_message_id, 0)
                          AND msg.sender_id <> current_participant.user_id
                    ) AS unread_count
                    FROM chat_participants current_participant
                    WHERE current_participant.user_id = ?
                ) AS unread_per_conv
            `,
            [normalizedUserId]
        );

        total = Number(rows[0]?.total_unread || 0);
    } catch (error) {
        throw new Error(error.message || 'Hiba az olvasatlan üzenetek számolása során.');
    }
    return total;
}

async function markConversationReadForUser(userId, conversationId) {
    const pool = getPool();
    let outcome = { changed: false, lastMessageId: 0 };
    try {
        const normalizedUserId = normalizePositiveInt(userId, 0);
        const normalizedConversationId = normalizePositiveInt(conversationId, 0);
        if (!normalizedUserId) {
            throw new Error('Érvénytelen felhasználó azonosító.');
        }
        if (!normalizedConversationId) {
            throw new Error('Érvénytelen beszélgetés azonosító.');
        }

        const [maxRows] = await pool.execute(
            `
                SELECT COALESCE(MAX(id), 0) AS max_message_id
                FROM chat_messages
                WHERE conversation_id = ?
            `,
            [normalizedConversationId]
        );
        const maxMessageId = Number(maxRows[0]?.max_message_id || 0);

        if (maxMessageId > 0) {
            const [updateResult] = await pool.execute(
                `
                    UPDATE chat_participants
                    SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?)
                    WHERE conversation_id = ?
                      AND user_id = ?
                `,
                [maxMessageId, normalizedConversationId, normalizedUserId]
            );
            outcome = { changed: updateResult.affectedRows > 0, lastMessageId: maxMessageId };
        } else {
            outcome = { changed: false, lastMessageId: 0 };
        }
    } catch (error) {
        throw new Error(error.message || 'Hiba a beszélgetés olvasottá jelölése során.');
    }
    return outcome;
}

module.exports = {
    CHAT_MAX_MESSAGE_LENGTH,
    CHAT_BLOCKED_WORDS,
    escapeRegex,
    normalizeTextForModeration,
    containsBlockedWord,
    resolvePreviewFromBody,
    ensureChatTables,
    canUsersChat,
    getPrivateConversationParticipantIds,
    cleanupDirectConversationBetween,
    cleanupUnusableConversationsForUser,
    assertConversationParticipant,
    assertConversationUsable,
    getUserConversations,
    getConversationMessages,
    createOrGetDirectConversation,
    insertMessageInConversation,
    getUnreadChatMessageTotal,
    markConversationReadForUser
};
