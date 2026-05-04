/**
 * sql/modules/emailVerification.js — DB-layer email-verifikalas tesztek.
 */

jest.mock('../sql/database.js', () => ({
    getPool: jest.fn()
}));

const dbMock = require('../sql/database.js');

let executeMock;
beforeEach(() => {
    executeMock = jest.fn();
    dbMock.getPool.mockReturnValue({ execute: executeMock });
});

const ev = require('../sql/modules/emailVerification.js');

describe('saveEmailVerificationToken', () => {
    test('UPDATE-tel ment + updated:true (affectedRows > 0)', async () => {
        executeMock.mockResolvedValueOnce([{ affectedRows: 1 }]);
        const r = await ev.saveEmailVerificationToken(7, 'h', new Date());
        expect(r.updated).toBe(true);
    });

    test('affectedRows = 0 → updated:false', async () => {
        executeMock.mockResolvedValueOnce([{ affectedRows: 0 }]);
        const r = await ev.saveEmailVerificationToken(7, 'h', new Date());
        expect(r.updated).toBe(false);
    });

    test('DB hiba → throw', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        await expect(ev.saveEmailVerificationToken(7, 'h', new Date())).rejects.toThrow();
    });
});

describe('findUserByVerificationTokenHash', () => {
    test('letezo token → user-row', async () => {
        executeMock.mockResolvedValueOnce([[{ id: 7, email: 'x@y.c', is_email_verified: 0 }]]);
        const r = await ev.findUserByVerificationTokenHash('h');
        expect(r.id).toBe(7);
    });

    test('nem-letezo → null', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const r = await ev.findUserByVerificationTokenHash('badHash');
        expect(r).toBeNull();
    });

    test('DB hiba → throw', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        await expect(ev.findUserByVerificationTokenHash('h')).rejects.toThrow();
    });
});

describe('markEmailVerified', () => {
    test('updated:true ha sikeres', async () => {
        executeMock.mockResolvedValueOnce([{ affectedRows: 1 }]);
        const r = await ev.markEmailVerified(7);
        expect(r.updated).toBe(true);
    });

    test('token-mezok torolve a query-vel', async () => {
        executeMock.mockResolvedValueOnce([{ affectedRows: 1 }]);
        await ev.markEmailVerified(7);
        const [query] = executeMock.mock.calls[0];
        expect(query).toMatch(/email_verification_token_hash = NULL/);
        expect(query).toMatch(/is_email_verified = TRUE/);
    });
});

describe('clearEmailVerificationState', () => {
    test('updated:true ha sikeres', async () => {
        executeMock.mockResolvedValueOnce([{ affectedRows: 1 }]);
        const r = await ev.clearEmailVerificationState(7);
        expect(r.updated).toBe(true);
    });

    test('is_email_verified = FALSE-ra', async () => {
        executeMock.mockResolvedValueOnce([{ affectedRows: 1 }]);
        await ev.clearEmailVerificationState(7);
        const [query] = executeMock.mock.calls[0];
        expect(query).toMatch(/is_email_verified = FALSE/);
    });
});

describe('getUserVerificationStatusById', () => {
    test('letezo user → row', async () => {
        executeMock.mockResolvedValueOnce([[
            { id: 7, username: 'x', email: 'x@y.c', is_email_verified: 1 }
        ]]);
        const r = await ev.getUserVerificationStatusById(7);
        expect(r.id).toBe(7);
        expect(r.is_email_verified).toBe(1);
    });

    test('nem-letezo → null', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const r = await ev.getUserVerificationStatusById(99);
        expect(r).toBeNull();
    });

    test('DB hiba → throw', async () => {
        executeMock.mockRejectedValueOnce(new Error('le'));
        await expect(ev.getUserVerificationStatusById(7)).rejects.toThrow();
    });
});
