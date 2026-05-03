/**
 * Chess modes egyseg-tesztek.
 *
 * Lefedi:
 *   - getMode / isValidMode / isValidEloColumn / queueKey / listClient
 *   - mind az 5 mod metaadata helyes-e
 *   - rankedAllowed konzisztens-e az eloColumn jelenletevel (CASUAL = no ELO)
 *   - listClient nem szivargatja az eloColumn DB-oszlopnevet
 */

const {
    MODES,
    DEFAULT_MODE,
    ALLOWED_ELO_COLUMNS,
    getMode,
    isValidMode,
    isValidEloColumn,
    queueKey,
    listClient
} = require('../chess/modes.js');

describe('chess/modes — kanonikus 5 jatekmod', () => {
    test('pontosan 5 mod letezik', () => {
        expect(Object.keys(MODES).length).toBe(5);
    });

    test('a varando 5 kulcs jelen van', () => {
        const expected = ['mattmester', 'mattmester_10p', 'klasszikus', 'klasszikus_10p', 'blitz'];
        for (const k of expected) {
            expect(MODES[k]).toBeDefined();
        }
    });

    test('DEFAULT_MODE egy ervenyes mod', () => {
        expect(isValidMode(DEFAULT_MODE)).toBe(true);
    });

    test('minden modnak van id, nev, leiras, abilities, ido, eloColumn, rankedAllowed', () => {
        for (const k in MODES) {
            const m = MODES[k];
            expect(typeof m.id).toBe('string');
            expect(typeof m.nev).toBe('string');
            expect(typeof m.leiras).toBe('string');
            expect(typeof m.abilities).toBe('boolean');
            expect(m.ido === null || typeof m.ido === 'number').toBe(true);
            expect(m.eloColumn === null || ALLOWED_ELO_COLUMNS.has(m.eloColumn)).toBe(true);
            expect(typeof m.rankedAllowed).toBe('boolean');
        }
    });

    test('id mezo egyezik a kulccsal (single source of truth)', () => {
        for (const k in MODES) {
            expect(MODES[k].id).toBe(k);
        }
    });
});

describe('chess/modes — fair-play szabaly: vegtelen ido = casual, idokorlatos = lehet ranked', () => {
    test('vegtelen ido (ido === null) eseten rankedAllowed=false es eloColumn=null', () => {
        for (const k in MODES) {
            const m = MODES[k];
            if (m.ido === null) {
                expect(m.rankedAllowed).toBe(false);
                expect(m.eloColumn).toBeNull();
            }
        }
    });

    test('idokorlatos mod (ido > 0) eseten rankedAllowed=true es eloColumn ervenyes', () => {
        for (const k in MODES) {
            const m = MODES[k];
            if (typeof m.ido === 'number' && m.ido > 0) {
                expect(m.rankedAllowed).toBe(true);
                expect(m.eloColumn).not.toBeNull();
                expect(ALLOWED_ELO_COLUMNS.has(m.eloColumn)).toBe(true);
            }
        }
    });

    test('mattmester ∞ es mattmester_10p az ELO-oszlopot OSZTANAK (10p hasznalja)', () => {
        // mattmester casual (∞) → eloColumn=null, mattmester_10p → 'elo_mattmester'
        expect(MODES.mattmester.eloColumn).toBeNull();
        expect(MODES.mattmester_10p.eloColumn).toBe('elo_mattmester');
    });

    test('klasszikus ∞ es klasszikus_10p ugyanaz a felallas', () => {
        expect(MODES.klasszikus.eloColumn).toBeNull();
        expect(MODES.klasszikus_10p.eloColumn).toBe('elo_classical');
    });

    test('blitz csak idokorlatos formaban letezik (5 perc, sajat oszlop)', () => {
        expect(MODES.blitz.ido).toBe(300);
        expect(MODES.blitz.eloColumn).toBe('elo_blitz');
        expect(MODES.blitz.rankedAllowed).toBe(true);
    });
});

describe('chess/modes — getMode / isValidMode', () => {
    test('getMode visszaadja a meta-objektumot ervenyes kulcsra', () => {
        const m = getMode('blitz');
        expect(m).not.toBeNull();
        expect(m.id).toBe('blitz');
    });

    test('getMode null nem-letezo kulcsra', () => {
        expect(getMode('nem-letezik')).toBeNull();
        expect(getMode('')).toBeNull();
        expect(getMode(undefined)).toBeNull();
        expect(getMode(null)).toBeNull();
    });

    test('isValidMode true csak a varando 5 kulcsra', () => {
        expect(isValidMode('mattmester')).toBe(true);
        expect(isValidMode('mattmester_10p')).toBe(true);
        expect(isValidMode('klasszikus')).toBe(true);
        expect(isValidMode('klasszikus_10p')).toBe(true);
        expect(isValidMode('blitz')).toBe(true);
    });

    test('isValidMode false nem-letezo / prototype-mezo / ures kulcsra', () => {
        expect(isValidMode('rapid')).toBe(false);
        expect(isValidMode('mattmester_5p')).toBe(false);
        expect(isValidMode('')).toBe(false);
        expect(isValidMode('toString')).toBe(false); // prototype-only - hasOwnProperty guard
        expect(isValidMode('constructor')).toBe(false);
    });
});

describe('chess/modes — isValidEloColumn (SQL-injection vedelem)', () => {
    test('csak a 4 whitelist oszlopnev megengedett', () => {
        expect(isValidEloColumn('elo')).toBe(true);
        expect(isValidEloColumn('elo_mattmester')).toBe(true);
        expect(isValidEloColumn('elo_classical')).toBe(true);
        expect(isValidEloColumn('elo_blitz')).toBe(true);
    });

    test('elutasit minden mast (SQL-injection vector)', () => {
        expect(isValidEloColumn('users')).toBe(false);
        expect(isValidEloColumn('elo; DROP TABLE')).toBe(false);
        expect(isValidEloColumn('"elo"')).toBe(false);
        expect(isValidEloColumn('')).toBe(false);
        expect(isValidEloColumn(null)).toBe(false);
        expect(isValidEloColumn(undefined)).toBe(false);
        expect(isValidEloColumn(0)).toBe(false);
        expect(isValidEloColumn({})).toBe(false);
    });
});

describe('chess/modes — queueKey (matchmaking szegregacio)', () => {
    test('queueKey ranked + casual elkulonites', () => {
        expect(queueKey('blitz', true)).toBe('blitz:r');
        expect(queueKey('blitz', false)).toBe('blitz:c');
        expect(queueKey('mattmester_10p', true)).toBe('mattmester_10p:r');
    });

    test('queueKey kulonbozo modok kulonbozo szegmensben (nincs cross-match)', () => {
        const keys = ['mattmester_10p', 'klasszikus_10p', 'blitz'].map(k => queueKey(k, true));
        const unique = new Set(keys);
        expect(unique.size).toBe(3);
    });

    test('truthy / falsy ranked argumentum konvencio', () => {
        expect(queueKey('blitz', 1)).toBe('blitz:r');
        expect(queueKey('blitz', 0)).toBe('blitz:c');
        expect(queueKey('blitz', null)).toBe('blitz:c');
        expect(queueKey('blitz', undefined)).toBe('blitz:c');
    });
});

describe('chess/modes — listClient (publikus meta a frontendnek)', () => {
    test('listClient nem szivargatja az eloColumn DB-oszlopnevet', () => {
        const list = listClient();
        for (const k in list) {
            expect(list[k].eloColumn).toBeUndefined();
            // Helyette hasElo boolean
            expect(typeof list[k].hasElo).toBe('boolean');
        }
    });

    test('hasElo konzisztens a backend eloColumn jelenletevel', () => {
        const list = listClient();
        for (const k in list) {
            expect(list[k].hasElo).toBe(MODES[k].eloColumn !== null);
        }
    });

    test('listClient mindenkulcsra publikalja az alap-mezoket', () => {
        const list = listClient();
        for (const k in list) {
            expect(list[k].id).toBe(k);
            expect(typeof list[k].nev).toBe('string');
            expect(typeof list[k].leiras).toBe('string');
            expect(typeof list[k].abilities).toBe('boolean');
            expect(list[k].ido === null || typeof list[k].ido === 'number').toBe(true);
            expect(typeof list[k].rankedAllowed).toBe('boolean');
        }
    });
});
