/**
 * Chat életciklus és jogosultság – unit tesztek
 * A canUsersChat központi helpert tesztelik mock executor-ral (nem valódi DB).
 * A cleanup és konverzáció-életciklus a getPool()-on keresztül mockolt lekérésekre támaszkodik.
 */

// A database modul-t mockoljuk, hogy getPool() kontrollált legyen.
const mockPool = {
    execute: jest.fn(),
    getConnection: jest.fn()
};

const mockConnection = {
    execute: jest.fn(),
    beginTransaction: jest.fn(() => Promise.resolve()),
    commit: jest.fn(() => Promise.resolve()),
    rollback: jest.fn(() => Promise.resolve()),
    release: jest.fn()
};

jest.mock('../sql/database.js', () => ({
    getPool: () => mockPool
}));

const sql = require('../sql/sql_functions.js');

// ─── Segéd: mock executor, ami sorra válaszol a várt lekérésekre ───
function buildExecutor(responses) {
    const queue = [...responses];
    return {
        execute: jest.fn(async () => {
            if (!queue.length) {
                return [[]];
            }
            const next = queue.shift();
            if (next instanceof Error) throw next;
            return [next];
        })
    };
}

describe('canUsersChat központi helper', () => {
    test('canChat=false, ha az egyik user ID érvénytelen', async () => {
        const result = await sql.canUsersChat(0, 5);
        expect(result.canChat).toBe(false);
        expect(result.reason).toBe('invalid_users');
    });

    test('canChat=false, ha a két user ugyanaz', async () => {
        const result = await sql.canUsersChat(7, 7);
        expect(result.canChat).toBe(false);
        expect(result.reason).toBe('invalid_users');
    });

    test('canChat=false user_deleted, ha az egyik user rekord hiányzik', async () => {
        const executor = buildExecutor([
            [], // ensureFriendBlocksTable CREATE TABLE -> jest tetszőleges válasz
            [{ id: 1, is_banned: 0 }] // csak egy user van
        ]);
        const result = await sql.canUsersChat(1, 2, executor);
        expect(result.canChat).toBe(false);
        expect(result.reason).toBe('user_deleted');
    });

    test('canChat=false user_banned, ha valamelyik user ban-olva van', async () => {
        const executor = buildExecutor([
            [], // ensureFriendBlocksTable
            [
                { id: 1, is_banned: 0 },
                { id: 2, is_banned: 1 }
            ]
        ]);
        const result = await sql.canUsersChat(1, 2, executor);
        expect(result.canChat).toBe(false);
        expect(result.reason).toBe('user_banned');
    });

    test('canChat=false not_friends, ha a friends rekord hiányzik vagy nem accepted', async () => {
        const executor = buildExecutor([
            [],
            [
                { id: 1, is_banned: 0 },
                { id: 2, is_banned: 0 }
            ],
            [{ status: 'pending' }]
        ]);
        const result = await sql.canUsersChat(1, 2, executor);
        expect(result.canChat).toBe(false);
        expect(result.reason).toBe('not_friends');
    });

    test('canChat=false blocked, ha aktív tiltás van bármelyik irányban', async () => {
        const executor = buildExecutor([
            [],
            [
                { id: 1, is_banned: 0 },
                { id: 2, is_banned: 0 }
            ],
            [{ status: 'accepted' }],
            [{ id: 99 }] // aktív block rekord
        ]);
        const result = await sql.canUsersChat(1, 2, executor);
        expect(result.canChat).toBe(false);
        expect(result.reason).toBe('blocked');
    });

    test('canChat=true, ha minden feltétel teljesül (barátság + nincs tiltás + nincs ban)', async () => {
        const executor = buildExecutor([
            [],
            [
                { id: 1, is_banned: 0 },
                { id: 2, is_banned: 0 }
            ],
            [{ status: 'accepted' }],
            [] // nincs block
        ]);
        const result = await sql.canUsersChat(1, 2, executor);
        expect(result.canChat).toBe(true);
        expect(result.reason).toBeNull();
    });

    test('email verifikáció-vesztés nem szünteti meg a csevegést (nem vizsgáljuk)', async () => {
        // Szimulálva: minden "aktív" feltétel teljesül, verifikált státusz irreleváns.
        const executor = buildExecutor([
            [],
            [
                { id: 1, is_banned: 0 },
                { id: 2, is_banned: 0 }
            ],
            [{ status: 'accepted' }],
            []
        ]);
        const result = await sql.canUsersChat(1, 2, executor);
        expect(result.canChat).toBe(true);
    });
});

describe('cleanupDirectConversationBetween', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockPool.getConnection.mockResolvedValue(mockConnection);
    });

    test('nem létező pár esetén üres eredmény', async () => {
        mockConnection.execute
            .mockResolvedValueOnce([[]]) // ensureChatTables - create 1
            .mockResolvedValueOnce([[]]) // create 2
            .mockResolvedValueOnce([[]]) // create 3
            .mockResolvedValueOnce([[]]); // SELECT conversation – üres

        const result = await sql.cleanupDirectConversationBetween(1, 2);
        expect(result.deletedConversationIds).toEqual([]);
        expect(mockConnection.commit).toHaveBeenCalled();
    });

    test('érvénytelen / azonos user ID esetén nem nyúl az adatbázishoz', async () => {
        const result = await sql.cleanupDirectConversationBetween(5, 5);
        expect(result.deletedConversationIds).toEqual([]);
        expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
    });

    test('létező privát konverzációt törli', async () => {
        mockConnection.execute
            .mockResolvedValueOnce([[]]) // ensureChatTables create 1
            .mockResolvedValueOnce([[]]) // create 2
            .mockResolvedValueOnce([[]]) // create 3
            .mockResolvedValueOnce([[{ conversation_id: 42 }]]) // SELECT
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE

        const result = await sql.cleanupDirectConversationBetween(1, 2);
        expect(result.deletedConversationIds).toEqual([42]);
        expect(result.participantUserIds).toEqual([1, 2]);
        expect(mockConnection.commit).toHaveBeenCalled();
    });
});

describe('Chat életciklus – end-to-end szcenáriók (logikai modell)', () => {
    // Ezek magas szintű forgatókönyv-tesztek, amelyek a canUsersChat helper
    // kombinálódását demonstrálják a tipikus flow-kban.

    test('SZCENÁRIÓ: barát megszűnése -> canChat=false (not_friends)', async () => {
        const executor = buildExecutor([
            [],
            [{ id: 1, is_banned: 0 }, { id: 2, is_banned: 0 }],
            [], // nincs friends rekord (törölve lett)
        ]);
        const result = await sql.canUsersChat(1, 2, executor);
        expect(result.canChat).toBe(false);
        expect(result.reason).toBe('not_friends');
    });

    test('SZCENÁRIÓ: tiltás -> canChat=false (blocked), akkor is ha barátok voltak', async () => {
        const executor = buildExecutor([
            [],
            [{ id: 1, is_banned: 0 }, { id: 2, is_banned: 0 }],
            [{ status: 'accepted' }],
            [{ id: 1 }]
        ]);
        const result = await sql.canUsersChat(1, 2, executor);
        expect(result.canChat).toBe(false);
        expect(result.reason).toBe('blocked');
    });

    test('SZCENÁRIÓ: profil törlés -> canChat=false (user_deleted)', async () => {
        const executor = buildExecutor([
            [],
            [{ id: 1, is_banned: 0 }] // csak az egyik user van még
        ]);
        const result = await sql.canUsersChat(1, 2, executor);
        expect(result.canChat).toBe(false);
        expect(result.reason).toBe('user_deleted');
    });

    test('SZCENÁRIÓ: újra-barátkozás törlés után -> canChat=true', async () => {
        // A régi beszélgetés cleanup-olva, új friends rekord accepted,
        // nincs block, nincs ban -> canChat újra igaz.
        const executor = buildExecutor([
            [],
            [{ id: 1, is_banned: 0 }, { id: 2, is_banned: 0 }],
            [{ status: 'accepted' }],
            []
        ]);
        const result = await sql.canUsersChat(1, 2, executor);
        expect(result.canChat).toBe(true);
    });
});
