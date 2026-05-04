/**
 * sql/modules/users.js — basic DB-layer tests (mockolt connection + pool).
 */

jest.mock('../sql/database.js', () => ({
    getPool: jest.fn()
}));

const dbMock = require('../sql/database.js');

let executeMock, connectionMock;
beforeEach(() => {
    executeMock = jest.fn();
    connectionMock = {
        beginTransaction: jest.fn(() => Promise.resolve()),
        commit: jest.fn(() => Promise.resolve()),
        rollback: jest.fn(() => Promise.resolve()),
        release: jest.fn(),
        execute: executeMock
    };
    dbMock.getPool.mockReturnValue({
        execute: executeMock,
        getConnection: jest.fn(() => Promise.resolve(connectionMock))
    });
});

const users = require('../sql/modules/users.js');

describe('insertUser — transactional registration', () => {
    test('sikeres insert: user-rekord + statistics-rekord', async () => {
        executeMock.mockResolvedValueOnce([{ insertId: 7 }]); // user
        executeMock.mockResolvedValueOnce([{}]); // statistics

        const r = await users.insertUser('foobar', 'pwhash', 'a@b.c');
        expect(r.insertId).toBe(7);
        expect(connectionMock.beginTransaction).toHaveBeenCalled();
        expect(connectionMock.commit).toHaveBeenCalled();
        expect(executeMock).toHaveBeenCalledTimes(2);
    });

    test('duplicate email → "email cím már foglalt"', async () => {
        const dupErr = new Error('dup');
        dupErr.code = 'ER_DUP_ENTRY';
        dupErr.sqlMessage = "Duplicate entry 'a@b.c' for key 'email'";
        executeMock.mockRejectedValueOnce(dupErr);
        await expect(users.insertUser('x', 'h', 'a@b.c')).rejects.toThrow(/email/i);
        expect(connectionMock.rollback).toHaveBeenCalled();
    });

    test('duplicate username → "felhasználónév már foglalt"', async () => {
        const dupErr = new Error('dup');
        dupErr.code = 'ER_DUP_ENTRY';
        dupErr.sqlMessage = "Duplicate entry 'foo' for key 'username'";
        executeMock.mockRejectedValueOnce(dupErr);
        await expect(users.insertUser('foo', 'h', 'x@y.c')).rejects.toThrow(/felhasználón/i);
    });

    test('osszes mas hiba → "regisztráció során"', async () => {
        executeMock.mockRejectedValueOnce(new Error('Connection lost'));
        await expect(users.insertUser('x', 'h', 'a@b.c')).rejects.toThrow(/regisztráció/i);
    });

    test('release a finally-ben minden esetben', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        try { await users.insertUser('x', 'h', 'a@b.c'); } catch (_) {}
        expect(connectionMock.release).toHaveBeenCalled();
    });

    test('statistics insert hiba → rollback', async () => {
        executeMock.mockResolvedValueOnce([{ insertId: 7 }]);
        executeMock.mockRejectedValueOnce(new Error('stats hiba'));
        await expect(users.insertUser('x', 'h', 'a@b.c')).rejects.toThrow();
        expect(connectionMock.rollback).toHaveBeenCalled();
    });
});

describe('getUserByUsername / getUserByEmail', () => {
    test('letezo username → user-row', async () => {
        executeMock.mockResolvedValueOnce([[{ id: 7, username: 'foo' }]]);
        const r = await users.getUserByUsername('foo');
        expect(r.id).toBe(7);
    });

    test('nem-letezo username → undefined', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const r = await users.getUserByUsername('x');
        expect(r).toBeUndefined();
    });

    test('elo-aliasok (elo_MM, elo_bullet)', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        await users.getUserByUsername('foo');
        const [query] = executeMock.mock.calls[0];
        expect(query).toMatch(/elo_classical AS elo_MM/);
        expect(query).toMatch(/elo_blitz AS elo_bullet/);
    });

    test('email-cimre lekerdez', async () => {
        executeMock.mockResolvedValueOnce([[{ id: 7, email: 'a@b.c' }]]);
        const r = await users.getUserByEmail('a@b.c');
        expect(r.id).toBe(7);
    });

    test('DB-hiba → throw', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        await expect(users.getUserByUsername('x')).rejects.toThrow();
    });
});
