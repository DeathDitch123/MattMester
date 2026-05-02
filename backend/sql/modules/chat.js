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

// Dinamikus blocklist (admin altal hozzadott szavak) — in-memory cache.
// Az ensureChatBlockedWordsDynamicTable + refreshDynamicBlockedWords() tolti fel.
const DYNAMIC_BLOCKED_WORDS = new Set();
let dynamicBlockedWordsLoaded = false;

async function ensureChatBlockedWordsDynamicTable(executor) {
    await executor.execute(`
        CREATE TABLE IF NOT EXISTS chat_blocked_words_dynamic (
            word VARCHAR(255) NOT NULL PRIMARY KEY,
            added_by_admin_id INT NULL,
            source_message_id INT NULL,
            added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (added_by_admin_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (source_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL,
            INDEX idx_chat_blocked_words_added_at (added_at)
        )
    `);
}

async function refreshDynamicBlockedWords() {
    try {
        const pool = getPool();
        await ensureChatBlockedWordsDynamicTable(pool);
        const [rows] = await pool.execute(`SELECT word FROM chat_blocked_words_dynamic`);
        DYNAMIC_BLOCKED_WORDS.clear();
        for (const row of rows) {
            const w = String(row.word || '').trim().toLowerCase();
            if (w) DYNAMIC_BLOCKED_WORDS.add(w);
        }
        dynamicBlockedWordsLoaded = true;
        return DYNAMIC_BLOCKED_WORDS.size;
    } catch (error) {
        console.warn('refreshDynamicBlockedWords hiba:', error.message);
        return 0;
    }
}

async function addDynamicBlockedWords(words, adminUserId, sourceMessageId = null) {
    const pool = getPool();
    await ensureChatBlockedWordsDynamicTable(pool);

    const cleaned = (Array.isArray(words) ? words : [words])
        .map((w) => String(w || '').trim().toLowerCase())
        .filter((w) => w.length > 0 && w.length <= 255)
        .filter((w, idx, arr) => arr.indexOf(w) === idx); // dedup

    if (!cleaned.length) {
        return { added: 0, skipped: 0, words: [] };
    }

    let added = 0;
    let skipped = 0;
    for (const word of cleaned) {
        try {
            const [result] = await pool.execute(
                `INSERT IGNORE INTO chat_blocked_words_dynamic (word, added_by_admin_id, source_message_id)
                 VALUES (?, ?, ?)`,
                [word, Number(adminUserId) || null, Number(sourceMessageId) || null]
            );
            if (result.affectedRows > 0) {
                added += 1;
                DYNAMIC_BLOCKED_WORDS.add(word);
            } else {
                skipped += 1;
            }
        } catch (error) {
            console.warn(`addDynamicBlockedWords (${word}) hiba:`, error.message);
            skipped += 1;
        }
    }

    return { added, skipped, words: cleaned };
}

function getDynamicBlockedWordsSnapshot() {
    return Array.from(DYNAMIC_BLOCKED_WORDS);
}

function containsBlockedWord(message) {
    const normalizedMessage = normalizeTextForModeration(message);
    if (!normalizedMessage) {
        return false;
    }

    // Hardcoded blocklist (CHAT_BLOCKED_WORDS) + dinamikus DB-bol toltott blocklist.
    const allTerms = [...CHAT_BLOCKED_WORDS, ...DYNAMIC_BLOCKED_WORDS];

    return allTerms.some((term) => {
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

async function ensureChatReportsTable(executor) {
    await executor.execute(`
        CREATE TABLE IF NOT EXISTS chat_message_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            message_id INT NOT NULL,
            reporter_user_id INT NOT NULL,
            reason VARCHAR(500) NULL,
            status ENUM('pending', 'allowed', 'deleted', 'dismissed') NOT NULL DEFAULT 'pending',
            reviewed_by INT NULL,
            reviewed_at TIMESTAMP NULL DEFAULT NULL,
            review_note VARCHAR(1000) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_report_per_user_per_message (message_id, reporter_user_id),
            FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
            FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
            INDEX idx_chat_message_reports_status (status, created_at),
            INDEX idx_chat_message_reports_message (message_id),
            INDEX idx_chat_message_reports_reporter (reporter_user_id)
        )
    `);
}

// Admin chat moderacio listaja KETFELE forrasbol jon:
//   1) auto: a profanity-filter altal maszkolt uzenetek (is_body_masked = TRUE) — fix
//      blocklist match, NEM felulbiralhato. Az admin csak torolheti vagy figyelmen kivul hagyhatja.
//   2) report: felhasznaloi bejelentes (chat_message_reports.status = 'pending') — itt az admin
//      eldontheti hogy elutasitja a bejelentest (Engedelyezes / dismiss) vagy torli az uzenetet.
// Egy uzenet lehet egyszerre auto-flagged ES bejelentett — ilyenkor 'report' kind-kent listazzuk
// (erdemibb action), de jelezzuk az isAutoFlagged flag-gel.
async function getFlaggedChatMessages(limit = 50) {
    const pool = getPool();
    const normalizedLimit = normalizeListLimit(limit, 50, 200);

    await ensureChatTables(pool);
    await ensureChatReportsTable(pool);

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
                c.type AS conversation_type,
                COALESCE(rep.report_count, 0) AS report_count,
                rep.earliest_report_at AS earliest_report_at,
                CASE
                    WHEN COALESCE(rep.report_count, 0) > 0 THEN 'report'
                    WHEN m.is_body_masked = TRUE THEN 'auto'
                    ELSE NULL
                END AS kind
            FROM chat_messages m
            JOIN users u ON u.id = m.sender_id
            JOIN chat_conversations c ON c.id = m.conversation_id
            LEFT JOIN (
                SELECT message_id, COUNT(*) AS report_count, MIN(created_at) AS earliest_report_at
                FROM chat_message_reports
                WHERE status = 'pending'
                GROUP BY message_id
            ) rep ON rep.message_id = m.id
            WHERE m.is_body_masked = TRUE OR rep.message_id IS NOT NULL
            ORDER BY COALESCE(rep.earliest_report_at, m.sent_at) DESC, m.id DESC
            LIMIT ?
        `,
        [normalizedLimit]
    );

    if (!rows.length) return [];

    const reportRowsByMessage = new Map();
    const messageIdsWithReports = rows
        .filter((row) => Number(row.report_count || 0) > 0)
        .map((row) => Number(row.id));

    if (messageIdsWithReports.length) {
        const placeholders = messageIdsWithReports.map(() => '?').join(',');
        const [reportRows] = await pool.execute(
            `
                SELECT r.id, r.message_id, r.reporter_user_id, r.reason, r.created_at,
                       u.username AS reporter_username
                FROM chat_message_reports r
                JOIN users u ON u.id = r.reporter_user_id
                WHERE r.status = 'pending' AND r.message_id IN (${placeholders})
                ORDER BY r.created_at ASC, r.id ASC
            `,
            messageIdsWithReports
        );
        reportRows.forEach((row) => {
            const list = reportRowsByMessage.get(Number(row.message_id)) || [];
            list.push({
                reportId: row.id,
                reporterUserId: row.reporter_user_id,
                reporterUsername: row.reporter_username,
                reason: row.reason,
                createdAt: row.created_at
            });
            reportRowsByMessage.set(Number(row.message_id), list);
        });
    }

    return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        conversationId: row.conversation_id,
        conversationType: row.conversation_type,
        senderId: row.sender_id,
        senderUsername: row.sender_username,
        senderProfileImage: row.sender_profile_image || DEFAULT_PROFILE_IMAGE_PATH,
        body: row.body,
        bodyMasked: row.body_masked || '***',
        isBodyMasked: Boolean(row.is_body_masked),
        isAutoFlagged: Boolean(row.is_body_masked),
        reportCount: Number(row.report_count || 0),
        reports: reportRowsByMessage.get(Number(row.id)) || [],
        sentAt: row.sent_at,
        earliestReportAt: row.earliest_report_at
    }));
}

async function getFlaggedChatMessageCount() {
    const pool = getPool();
    await ensureChatTables(pool);
    await ensureChatReportsTable(pool);
    const [rows] = await pool.execute(
        `
            SELECT COUNT(*) AS total FROM chat_messages m
            LEFT JOIN (
                SELECT message_id FROM chat_message_reports WHERE status = 'pending' GROUP BY message_id
            ) rep ON rep.message_id = m.id
            WHERE m.is_body_masked = TRUE OR rep.message_id IS NOT NULL
        `
    );
    return Number(rows[0]?.total || 0);
}

// Spam-protection: ha az admin "Engedelyezes"-t (= bejelentes elutasitas) hasznal egy bejelenten,
// a bejelento(k) 5 oraig nem tudnak ujabb bejelentest tenni. A users.chat_report_mute_until
// oszlop tartalmazza a lejaratot.
const CHAT_REPORT_MUTE_HOURS = 5;

async function getChatReportMuteUntil(userId) {
    const pool = getPool();
    const normalizedUserId = normalizePositiveInt(userId, 0);
    if (!normalizedUserId) return null;
    try {
        const [rows] = await pool.execute(
            `SELECT chat_report_mute_until FROM users WHERE id = ? LIMIT 1`,
            [normalizedUserId]
        );
        const value = rows[0]?.chat_report_mute_until || null;
        if (!value) return null;
        const date = new Date(value);
        if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
            return null;
        }
        return date;
    } catch (error) {
        console.warn('getChatReportMuteUntil hiba:', error.message);
        return null;
    }
}

async function setChatReportMuteForUsers(userIds, hours = CHAT_REPORT_MUTE_HOURS) {
    const pool = getPool();
    const ids = (Array.isArray(userIds) ? userIds : [userIds])
        .map((id) => normalizePositiveInt(id, 0))
        .filter((id) => id > 0)
        .filter((id, idx, arr) => arr.indexOf(id) === idx);
    if (!ids.length) return { affected: 0, until: null };
    const safeHours = Math.max(1, Math.min(Number(hours) || CHAT_REPORT_MUTE_HOURS, 24 * 30));
    try {
        const placeholders = ids.map(() => '?').join(',');
        // GREATEST: ha mar egy hosszabb mute van rajta, ne kurtítsuk le.
        const [result] = await pool.execute(
            `UPDATE users
             SET chat_report_mute_until = GREATEST(
                 COALESCE(chat_report_mute_until, NOW()),
                 DATE_ADD(NOW(), INTERVAL ? HOUR)
             )
             WHERE id IN (${placeholders})`,
            [safeHours, ...ids]
        );
        // A friss mute_until-t visszaolvassuk az elso erintett user-rol (mind ugyanaz lesz +/- mp).
        const [readBack] = await pool.execute(
            `SELECT chat_report_mute_until FROM users WHERE id = ? LIMIT 1`,
            [ids[0]]
        );
        return {
            affected: result.affectedRows,
            until: readBack[0]?.chat_report_mute_until || null
        };
    } catch (error) {
        console.warn('setChatReportMuteForUsers hiba:', error.message);
        return { affected: 0, until: null };
    }
}

async function ensureChatProfanityStrikesTable(executor) {
    await executor.execute(`
        CREATE TABLE IF NOT EXISTS chat_profanity_strikes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            message_id INT NULL,
            source ENUM('auto', 'admin_delete') NOT NULL,
            ban_type ENUM('temp_1d', 'temp_10d', 'perma', 'none') NOT NULL DEFAULT 'none',
            recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_message (message_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_chat_profanity_strikes_user (user_id, recorded_at)
        )
    `);
}

// 3-csapas tragarsag auto-ban rendszer. A hivo NEM hivja kulon a banUser-t — ez itt
// atomi modon: insert strike + count + ban application.
//   strike 1 -> 1 napos ban
//   strike 2 -> 10 napos ban
//   strike 3+ -> perma ban
// A UNIQUE(message_id) megakadalyozza, hogy egy uzenet ketszer kapjon strike-ot
// (pl. ha auto-mask + admin delete is bejon ugyanahhoz). INSERT IGNORE-zal kezeljuk.
// A hivot NEM erdekli a ban applikalt vagy sem (pl. ha mar perma-ban van) — itt
// vegezzuk az "el ne hozzuk romlobb statebol" logikat.
async function recordProfanityStrikeAndMaybeBan(userId, messageId, source = 'auto') {
    const pool = getPool();
    const connection = await pool.getConnection();
    const normalizedUserId = normalizePositiveInt(userId, 0);
    const normalizedMessageId = messageId ? normalizePositiveInt(messageId, 0) : null;

    if (!normalizedUserId) {
        connection.release();
        return { strikeRecorded: false, strikeCount: 0, banApplied: false, banType: 'none', bannedUntil: null };
    }

    const safeSource = (source === 'admin_delete') ? 'admin_delete' : 'auto';

    try {
        await connection.beginTransaction();
        await ensureChatProfanityStrikesTable(connection);

        // INSERT IGNORE: ha mar van strike erre a message_id-re, dedup.
        let strikeRecorded = false;
        try {
            const [insertResult] = await connection.execute(
                `INSERT IGNORE INTO chat_profanity_strikes (user_id, message_id, source, ban_type)
                 VALUES (?, ?, ?, 'none')`,
                [normalizedUserId, normalizedMessageId, safeSource]
            );
            strikeRecorded = insertResult.affectedRows > 0;
        } catch (insertErr) {
            console.warn('recordProfanityStrike insert hiba:', insertErr.message);
        }

        if (!strikeRecorded) {
            // Mar van strike erre az uzenetre — nem szamoljuk ujra, nem applikalunk ujabb bant.
            await connection.commit();
            return { strikeRecorded: false, strikeCount: 0, banApplied: false, banType: 'none', bannedUntil: null };
        }

        // Strike count szamolasa: hany strike-ja van a usernek osszesen.
        const [countRows] = await connection.execute(
            `SELECT COUNT(*) AS total FROM chat_profanity_strikes WHERE user_id = ?`,
            [normalizedUserId]
        );
        const strikeCount = Number(countRows[0]?.total || 0);

        // A user mar perma banolva van? Ha igen, NEM allitjuk vissza temp ban-ra.
        const [userRows] = await connection.execute(
            `SELECT is_banned, banned_until FROM users WHERE id = ? LIMIT 1`,
            [normalizedUserId]
        );
        const currentlyBanned = Boolean(Number(userRows[0]?.is_banned || 0));
        const currentBannedUntilRaw = userRows[0]?.banned_until || null;
        const currentlyPermaBanned = currentlyBanned && currentBannedUntilRaw === null;

        // Strike szam alapjan a celzott ban-tipus.
        let banType = 'none';
        let bannedUntil = null;
        let banReason = null;
        if (strikeCount >= 3) {
            banType = 'perma';
            bannedUntil = null;
            banReason = `Tragarsag (${strikeCount}. csapas) - automatikus vegleges tiltas`;
        } else if (strikeCount === 2) {
            banType = 'temp_10d';
            bannedUntil = new Date(Date.now() + 10 * 24 * 3600 * 1000);
            banReason = `Tragarsag (2. csapas) - automatikus 10 napos tiltas`;
        } else if (strikeCount === 1) {
            banType = 'temp_1d';
            bannedUntil = new Date(Date.now() + 1 * 24 * 3600 * 1000);
            banReason = `Tragarsag (1. csapas) - automatikus 1 napos tiltas`;
        }

        // Strike-on rogzitjuk a celzott ban-tipust auditabilitas miatt.
        await connection.execute(
            `UPDATE chat_profanity_strikes
             SET ban_type = ?
             WHERE user_id = ? AND message_id <=> ? AND source = ?
             ORDER BY id DESC LIMIT 1`,
            [banType, normalizedUserId, normalizedMessageId, safeSource]
        );

        // Ban applikalas: csak akkor, ha a uj allapot szigorubb (vagy ugyanolyan strict)
        // mint a jelenlegi. Perma-bannolt user-en nem variálunk.
        let banApplied = false;
        if (banType === 'none') {
            // (Nem fordulhat elo strikeRecorded=true mellett, vedelem)
        } else if (currentlyPermaBanned) {
            // Mar perma — semmi tennivalo.
        } else if (banType === 'perma') {
            await connection.execute(
                `UPDATE users SET is_banned = TRUE, ban_reason = ?, banned_until = NULL WHERE id = ?`,
                [banReason, normalizedUserId]
            );
            banApplied = true;
        } else {
            // Temp ban: ne rovidítsuk le a meglevo (esetleg hosszabb) bant.
            const currentExpiry = currentBannedUntilRaw ? new Date(currentBannedUntilRaw) : null;
            const proposedExpiry = bannedUntil;
            if (!currentExpiry || proposedExpiry > currentExpiry) {
                await connection.execute(
                    `UPDATE users SET is_banned = TRUE, ban_reason = ?, banned_until = ? WHERE id = ?`,
                    [banReason, proposedExpiry, normalizedUserId]
                );
                banApplied = true;
            }
        }

        await connection.commit();
        return {
            strikeRecorded: true,
            strikeCount,
            banApplied,
            banType,
            bannedUntil: bannedUntil ? bannedUntil.toISOString() : null,
            banReason
        };
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        console.warn('recordProfanityStrikeAndMaybeBan hiba:', error.message);
        return { strikeRecorded: false, strikeCount: 0, banApplied: false, banType: 'none', bannedUntil: null };
    } finally {
        connection.release();
    }
}

async function getProfanityStrikeCountForUser(userId) {
    const pool = getPool();
    const normalizedUserId = normalizePositiveInt(userId, 0);
    if (!normalizedUserId) return 0;
    try {
        await ensureChatProfanityStrikesTable(pool);
        const [rows] = await pool.execute(
            `SELECT COUNT(*) AS total FROM chat_profanity_strikes WHERE user_id = ?`,
            [normalizedUserId]
        );
        return Number(rows[0]?.total || 0);
    } catch (error) {
        console.warn('getProfanityStrikeCountForUser hiba:', error.message);
        return 0;
    }
}

// Felhasznaloi bejelentes egy chat uzenetrol. UNIQUE(message_id, reporter_user_id) miatt
// egy felhasznalo egy uzenetet csak egyszer jelenthet — a duplikatumot externalisan jelezzuk.
async function reportChatMessage(messageId, reporterUserId, reason = null) {
    const pool = getPool();
    const connection = await pool.getConnection();
    const normalizedMessageId = normalizePositiveInt(messageId, 0);
    const normalizedReporterId = normalizePositiveInt(reporterUserId, 0);

    if (!normalizedMessageId || !normalizedReporterId) {
        connection.release();
        throw new Error('Ervenytelen azonosito.');
    }

    const trimmedReason = reason ? String(reason).trim().slice(0, 500) : null;

    try {
        await connection.beginTransaction();
        await ensureChatTables(connection);
        await ensureChatReportsTable(connection);

        // Spam-protection: ha az adminok mar lenemitottak a bejelento-jogot, blokk.
        // (A users.chat_report_mute_until oszlop tartalmazza a lejaratot.)
        const [muteRows] = await connection.execute(
            `SELECT chat_report_mute_until FROM users WHERE id = ? LIMIT 1`,
            [normalizedReporterId]
        );
        const muteUntilRaw = muteRows[0]?.chat_report_mute_until || null;
        if (muteUntilRaw) {
            const muteUntil = new Date(muteUntilRaw);
            if (!Number.isNaN(muteUntil.getTime()) && muteUntil.getTime() > Date.now()) {
                const err = new Error(
                    'A fejlesztők nem találták relevánsnak a korábbi bejelentésedet, ezért lenémítottak ' +
                    `${CHAT_REPORT_MUTE_HOURS} órára. Új bejelentést ${muteUntil.toLocaleString('hu-HU')} után tudsz tenni.`
                );
                err.code = 'CHAT_REPORT_MUTED';
                err.muteUntil = muteUntil.toISOString();
                throw err;
            }
        }

        // Ellenorizzuk hogy az uzenet letezik es a bejelento NEM a sajat uzenetet jelenti.
        const [messageRows] = await connection.execute(
            `SELECT id, conversation_id, sender_id FROM chat_messages WHERE id = ? LIMIT 1`,
            [normalizedMessageId]
        );
        if (!messageRows.length) {
            throw new Error('Az uzenet nem talalhato.');
        }
        if (Number(messageRows[0].sender_id) === normalizedReporterId) {
            throw new Error('A sajat uzenetedet nem jelentheted.');
        }

        // A bejelentonek reszvevonek kell lennie a beszelgetesben (privacy: idegen
        // beszelgeteseket nem lehet "tavolrol" jelenteni).
        const [participantRows] = await connection.execute(
            `SELECT id FROM chat_participants WHERE conversation_id = ? AND user_id = ? LIMIT 1`,
            [messageRows[0].conversation_id, normalizedReporterId]
        );
        if (!participantRows.length) {
            throw new Error('Csak a beszelgetes resztvevoje jelenthet uzenetet.');
        }

        try {
            const [insertResult] = await connection.execute(
                `INSERT INTO chat_message_reports (message_id, reporter_user_id, reason, status)
                 VALUES (?, ?, ?, 'pending')`,
                [normalizedMessageId, normalizedReporterId, trimmedReason]
            );

            await connection.commit();
            return {
                reportId: insertResult.insertId,
                messageId: normalizedMessageId,
                conversationId: messageRows[0].conversation_id,
                senderId: messageRows[0].sender_id,
                duplicate: false
            };
        } catch (insertError) {
            // ER_DUP_ENTRY: a felhasznalo mar bejelentette ezt az uzenetet.
            if (insertError && (insertError.code === 'ER_DUP_ENTRY' || insertError.errno === 1062)) {
                await connection.rollback();
                return {
                    reportId: null,
                    messageId: normalizedMessageId,
                    conversationId: messageRows[0].conversation_id,
                    senderId: messageRows[0].sender_id,
                    duplicate: true
                };
            }
            throw insertError;
        }
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        throw error;
    } finally {
        connection.release();
    }
}

// Admin "Engedelyezes" — a fuggo bejelenteseket lezarja status='allowed'-del.
// FONTOS: ez NEM veszi le a maszkolast (is_body_masked) — a profanity-filter
// blocklist hard rule, az admin sem birálhatja felul.
async function dismissReportsForMessage(messageId, adminUserId, reviewNote = null) {
    const pool = getPool();
    const connection = await pool.getConnection();
    const normalizedMessageId = normalizePositiveInt(messageId, 0);
    const normalizedAdminId = normalizePositiveInt(adminUserId, 0);

    if (!normalizedMessageId) {
        connection.release();
        throw new Error('Ervenytelen uzenet azonosito.');
    }

    try {
        await connection.beginTransaction();
        await ensureChatReportsTable(connection);

        const [messageRows] = await connection.execute(
            `SELECT id, conversation_id, sender_id FROM chat_messages WHERE id = ? LIMIT 1`,
            [normalizedMessageId]
        );
        if (!messageRows.length) {
            throw new Error('Az uzenet nem talalhato.');
        }

        // A bejelento(k) listajat kiszedjuk MEG az UPDATE elott — kesobb 5 oras
        // mute-ot rakunk rajuk (spam-protection: aki feleslegesen reportolgat).
        const [reporterRows] = await connection.execute(
            `SELECT reporter_user_id FROM chat_message_reports
             WHERE message_id = ? AND status = 'pending'`,
            [normalizedMessageId]
        );
        const reporterUserIds = reporterRows
            .map((row) => Number(row.reporter_user_id))
            .filter((id) => id > 0);

        const [updateResult] = await connection.execute(
            `UPDATE chat_message_reports
             SET status = 'allowed', reviewed_by = ?, reviewed_at = NOW(), review_note = ?
             WHERE message_id = ? AND status = 'pending'`,
            [normalizedAdminId || null, reviewNote ? String(reviewNote).slice(0, 1000) : null, normalizedMessageId]
        );

        if (!updateResult.affectedRows) {
            throw new Error('Nincs feldolgozhato bejelentes ezen az uzeneten.');
        }

        const [participantRows] = await connection.execute(
            `SELECT user_id FROM chat_participants WHERE conversation_id = ?`,
            [messageRows[0].conversation_id]
        );

        await connection.commit();
        return {
            messageId: normalizedMessageId,
            conversationId: messageRows[0].conversation_id,
            senderId: messageRows[0].sender_id,
            dismissedReports: updateResult.affectedRows,
            reporterUserIds,
            participantUserIds: participantRows.map((row) => Number(row.user_id)).filter((id) => id > 0)
        };
    } catch (error) {
        try { await connection.rollback(); } catch (_) {}
        throw error;
    } finally {
        connection.release();
    }
}

// Admin "Torles": fizikailag torli az uzenetet. Visszaadja a conversationId-t es
// a resztvevok listajat, hogy a hivo realtime broadcastolhassa a torlest.
async function deleteChatMessageById(messageId, adminUserId = null, reviewNote = null) {
    const pool = getPool();
    const connection = await pool.getConnection();
    const normalizedId = normalizePositiveInt(messageId, 0);
    const normalizedAdminId = normalizePositiveInt(adminUserId, 0);
    if (!normalizedId) {
        connection.release();
        throw new Error('Ervenytelen uzenet azonosito.');
    }

    try {
        await connection.beginTransaction();
        await ensureChatReportsTable(connection);

        const [rows] = await connection.execute(
            `SELECT id, conversation_id, sender_id FROM chat_messages WHERE id = ? FOR UPDATE`,
            [normalizedId]
        );

        if (!rows.length) {
            throw new Error('Az uzenet nem talalhato.');
        }

        const conversationId = rows[0].conversation_id;
        const senderId = rows[0].sender_id;

        const [participantRows] = await connection.execute(
            `SELECT user_id FROM chat_participants WHERE conversation_id = ?`,
            [conversationId]
        );

        // A fuggo bejelenteseket lezarjuk 'deleted' statusszal — auditalhato marad,
        // mig az uzenet sora elott a CASCADE kitorli a sorokat (FK ON DELETE CASCADE).
        // (Kornyezet-fuggetlen: ha a CASCADE futna elobb, az UPDATE 0 sort erint.)
        await connection.execute(
            `UPDATE chat_message_reports
             SET status = 'deleted', reviewed_by = ?, reviewed_at = NOW(), review_note = ?
             WHERE message_id = ? AND status = 'pending'`,
            [normalizedAdminId || null, reviewNote ? String(reviewNote).slice(0, 1000) : null, normalizedId]
        );

        await connection.execute(`DELETE FROM chat_messages WHERE id = ?`, [normalizedId]);

        await connection.commit();
        return {
            messageId: normalizedId,
            conversationId,
            senderId,
            participantUserIds: participantRows.map((row) => Number(row.user_id)).filter((id) => id > 0)
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
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
    markConversationReadForUser,
    getFlaggedChatMessages,
    getFlaggedChatMessageCount,
    reportChatMessage,
    dismissReportsForMessage,
    deleteChatMessageById,
    getChatReportMuteUntil,
    setChatReportMuteForUsers,
    CHAT_REPORT_MUTE_HOURS,
    addDynamicBlockedWords,
    refreshDynamicBlockedWords,
    getDynamicBlockedWordsSnapshot,
    recordProfanityStrikeAndMaybeBan,
    getProfanityStrikeCountForUser
};
