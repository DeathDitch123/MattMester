/**
 * sql/modules/abilities.js — admin CRUD tesztek (validatePatch + listAbilities mockolt).
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

const ab = require('../sql/modules/abilities.js');

describe('listAbilities', () => {
    test('rows mappelve', async () => {
        executeMock.mockResolvedValueOnce([[
            { id: 1, name: 'time_pause', description: 'desc', cooldown_turns: 4, usage_count: 5 }
        ]]);
        const r = await ab.listAbilities();
        expect(r[0].id).toBe(1);
        expect(r[0].name).toBe('time_pause');
        expect(r[0].cooldownTurns).toBe(4);
        expect(r[0].usageCount).toBe(5);
    });

    test('ures DB → []', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const r = await ab.listAbilities();
        expect(r).toEqual([]);
    });
});

describe('getAbilityById', () => {
    test('letezo id → mapped objektum', async () => {
        executeMock.mockResolvedValueOnce([[{ id: 1, name: 'x', description: 'd', cooldown_turns: 4 }]]);
        const r = await ab.getAbilityById(1);
        expect(r.id).toBe(1);
        expect(r.name).toBe('x');
    });

    test('nem-letezo id → null', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        const r = await ab.getAbilityById(99);
        expect(r).toBeNull();
    });

    test('invalid id (string) → 0-ra normalizal', async () => {
        executeMock.mockResolvedValueOnce([[]]);
        await ab.getAbilityById('abc');
        expect(executeMock).toHaveBeenCalledWith(expect.any(String), [0]);
    });
});

describe('createAbility — validation', () => {
    test('hianyzo name → throw', async () => {
        await expect(ab.createAbility({})).rejects.toThrow(/nev kotelezo/i);
    });

    test('ures name → throw "nev nem lehet ures"', async () => {
        await expect(ab.createAbility({ name: '' })).rejects.toThrow();
    });

    test('tul hosszu name → throw', async () => {
        await expect(ab.createAbility({ name: 'x'.repeat(101) })).rejects.toThrow(/100/);
    });

    test('tul hosszu description → throw', async () => {
        await expect(ab.createAbility({ name: 'x', description: 'y'.repeat(2001) })).rejects.toThrow(/2000/);
    });

    test('cooldown < 0 → throw', async () => {
        await expect(ab.createAbility({ name: 'x', cooldownTurns: -1 })).rejects.toThrow(/cooldown/i);
    });

    test('cooldown > 999 → throw', async () => {
        await expect(ab.createAbility({ name: 'x', cooldownTurns: 1000 })).rejects.toThrow();
    });

    test('cooldown nem-integer → throw', async () => {
        await expect(ab.createAbility({ name: 'x', cooldownTurns: 1.5 })).rejects.toThrow();
    });

    test('helyes input → INSERT hivva', async () => {
        executeMock.mockResolvedValueOnce([{ insertId: 99 }]);
        executeMock.mockResolvedValueOnce([[{ id: 99, name: 'x', description: 'd', cooldown_turns: 4 }]]);
        const r = await ab.createAbility({ name: 'x', description: 'd', cooldownTurns: 4 });
        expect(r.id).toBe(99);
    });

    test('ER_DUP_ENTRY → throw "mar letezik"', async () => {
        const dupErr = new Error('dup');
        dupErr.code = 'ER_DUP_ENTRY';
        executeMock.mockRejectedValueOnce(dupErr);
        await expect(ab.createAbility({ name: 'x' })).rejects.toThrow(/mar letezik/i);
    });
});
