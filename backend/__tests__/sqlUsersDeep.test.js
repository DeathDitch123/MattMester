/**
 * sql/modules/users.js — extended DB layer tesztek (search, getUserAuthById, etc).
 */

jest.mock('../sql/database.js', () => ({
    getPool: jest.fn()
}));

const dbMock = require('../sql/database.js');

let executeMock, queryMock;
beforeEach(() => {
    executeMock = jest.fn();
    queryMock = jest.fn();
    dbMock.getPool.mockReturnValue({ execute: executeMock, query: queryMock });
});

const users = require('../sql/modules/users.js');

describe('searchUsersByUsernameContains', () => {
    test('LIKE query username-re', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        await users.searchUsersByUsernameContains('foo', 7);
        const [query, params] = executeMock.mock.calls[0];
        expect(query).toMatch(/LIKE/i);
        expect(params).toContain(7);
    });

    test('rows mappelve', async () => {
        executeMock.mockResolvedValueOnce([[
            { id: 5, username: 'foobar', profile_image: '/foo.png', profile_image_status: 'approved' }
        ]]);
        const r = await users.searchUsersByUsernameContains('foo', 7);
        expect(r).toHaveLength(1);
    });
});

describe('getSessionUserById', () => {
    test('letezo user → row', async () => {
        executeMock.mockResolvedValueOnce([[{ id: 7, username: 'x' }]]);
        const r = await users.getSessionUserById(7);
        expect(r).toBeDefined();
        if (r) expect(r.id).toBe(7);
    });

    test('nem-letezo → undefined/null', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const r = await users.getSessionUserById(99);
        expect(r === undefined || r === null).toBe(true);
    });
});

describe('getUserAuthById', () => {
    test('jelszo-hash visszaadas', async () => {
        executeMock.mockResolvedValueOnce([[{
            id: 7, username: 'x', email: 'a@b.c', password_hash: 'h'
        }]]);
        const r = await users.getUserAuthById(7);
        if (r) expect(r.password_hash).toBe('h');
    });
});

describe('updateUserProfileSettings — edge cases', () => {
    test('nincs valtozas (azonos username + email + nincs password) → changed:false', async () => {
        executeMock.mockResolvedValueOnce([[
            { id: 7, username: 'foo', email: 'a@b.c' }
        ]]);
        const r = await users.updateUserProfileSettings(7, { username: 'foo', email: 'a@b.c' });
        expect(r.changed).toBe(false);
    });

    test('username-valtas → SET username + flag', async () => {
        executeMock.mockResolvedValueOnce([[
            { id: 7, username: 'old', email: 'a@b.c' }
        ]]);
        executeMock.mockResolvedValueOnce([{ changedRows: 1 }]);
        const r = await users.updateUserProfileSettings(7, { username: 'new', email: 'a@b.c' });
        expect(r.usernameChanged).toBe(true);
    });

    test('email-valtas → reset email_verification', async () => {
        executeMock.mockResolvedValueOnce([[
            { id: 7, username: 'x', email: 'a@b.c' }
        ]]);
        executeMock.mockResolvedValueOnce([{ changedRows: 1 }]);
        await users.updateUserProfileSettings(7, { email: 'new@b.c' });
        const [query] = executeMock.mock.calls[1];
        expect(query).toMatch(/is_email_verified = FALSE/);
    });

    test('duplicate username → throw "felhasznalonev mar foglalt"', async () => {
        executeMock.mockResolvedValueOnce([[
            { id: 7, username: 'old', email: 'a@b.c' }
        ]]);
        const dupErr = new Error('dup');
        dupErr.code = 'ER_DUP_ENTRY';
        dupErr.sqlMessage = "Duplicate entry 'foo' for key 'username'";
        executeMock.mockRejectedValueOnce(dupErr);
        await expect(users.updateUserProfileSettings(7, { username: 'foo' })).rejects.toThrow(/felhasznalonev/i);
    });
});

describe('listExpiredSoftDeletedUserIds', () => {
    test('lejart pending_deletion_until-tal user-ek', async () => {
        queryMock.mockResolvedValueOnce([[
            { id: 1 }, { id: 2 }
        ]]);
        const r = await users.listExpiredSoftDeletedUserIds();
        expect(r).toEqual([1, 2]);
    });

    test('ures lista', async () => {
        queryMock.mockResolvedValueOnce([[]]);
        const r = await users.listExpiredSoftDeletedUserIds();
        expect(r).toEqual([]);
    });
});

describe('getUserBasicById', () => {
    test('alap-mezok visszaadas', async () => {
        executeMock.mockResolvedValueOnce([[{ id: 7, username: 'x', role: 'player' }]]);
        const r = await users.getUserBasicById(7);
        expect(r.id).toBe(7);
    });
});

describe('getUserIdsByRole', () => {
    test('admin role-ra → admin id-k', async () => {
        executeMock.mockResolvedValueOnce([[{ id: 1 }, { id: 5 }]]);
        const r = await users.getUserIdsByRole('admin');
        expect(r).toEqual([1, 5]);
    });
});

describe('getAllActiveUserIds', () => {
    test('lista visszaadas', async () => {
        executeMock.mockResolvedValueOnce([[{ id: 1 }, { id: 2 }, { id: 3 }]]);
        const r = await users.getAllActiveUserIds();
        expect(r).toEqual([1, 2, 3]);
    });

    test('ures DB → []', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const r = await users.getAllActiveUserIds();
        expect(r).toEqual([]);
    });
});
