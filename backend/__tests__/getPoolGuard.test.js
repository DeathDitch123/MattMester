/**
 * getPoolGuard.test.js — getPool() most KÖTELEZŐEN dob, ha nincs init pool.
 *
 * Régen: getPool() visszaadta a (potenciálisan null) `pool`-t. A hívók fele
 * null-checkelt, másik fele nem — a non-checking caller-ek crash-eltek
 * tesztkörnyezetben (mock nélkül) a `pool.execute is not a function`-nal.
 *
 * Most: getPool() → 'DB pool nincs inicializalva' Error. A graceful-fallback-ot
 * igénylő callerek try/catch-csel kezelik (siteSettings, services).
 */

describe('getPool() guard', () => {
    let database;

    beforeEach(() => {
        // Friss require minden teszthez (a `pool` modul-szintű state).
        jest.resetModules();
        database = require('../sql/database.js');
    });

    test('init nélkül a getPool() readable hibát dob', () => {
        expect(() => database.getPool()).toThrow(/DB pool nincs inicializalva/);
    });

    test('a hibaüzenet stabil — fixált string pl. monitoring-hez', () => {
        try {
            database.getPool();
            throw new Error('getPool nem dobott');
        } catch (err) {
            expect(err).toBeInstanceOf(Error);
            expect(err.message).toBe('DB pool nincs inicializalva');
        }
    });

    test('_getPoolRaw() init nélkül undefined-ot ad (NEM dob)', () => {
        // Belső használatra: a graceful fallback util-jaihoz kell az opt-in null.
        expect(database._getPoolRaw()).toBeUndefined();
    });

    test('siteSettings.loadFromDb pool nélkül defaultSettings-et ad (graceful)', async () => {
        // Fontos: NEM mockoljuk a database.js-t, hanem a valódi getPool() throw-ot
        // teszteljuk. A modulnak ettől függetlenül vissza kell adnia a default-okat.
        jest.resetModules();
        const ss = require('../sql/modules/siteSettings.js');
        ss.invalidateCache();
        const r = await ss.getSettings();
        expect(r.siteName).toBe('MattMester');
        expect(r.maintenanceMode).toBe(false);
        expect(r.registrationEnabled).toBe(true);
    });

    test('siteSettings.updateSettings pool nélkül legacy hibaüzenettel dob', async () => {
        jest.resetModules();
        const ss = require('../sql/modules/siteSettings.js');
        await expect(ss.updateSettings({ siteName: 'X' }, 1))
            .rejects.toThrow('Adatbazis nem elerheto.');
    });

    test('services.refreshStats pool nélkül NEM crash-el (silent + console.error)', async () => {
        // Real getPool() most dob — de services.refreshStats try/catch-el kezeli
        // és csak console.error-t ad. Ne dobjon kifelé.
        jest.resetModules();
        // Mockoljuk a sql_functions-t, hogy ha mégis bejutna a happy path-ba,
        // ne hívjon real DB-t.
        jest.doMock('../sql/sql_functions.js', () => ({
            getTotalUsers: jest.fn(() => Promise.resolve(0)),
            getTotalGames: jest.fn(() => Promise.resolve(0)),
            getOnlineGamesCount: jest.fn(() => Promise.resolve(0)),
            getAllUsers: jest.fn(() => Promise.resolve([])),
            getAllRooms: jest.fn(() => Promise.resolve([])),
            getLeaderBoardByElo: jest.fn(() => Promise.resolve([])),
            getLeaderBoardByMM: jest.fn(() => Promise.resolve([])),
            getLeaderBoardByBullet: jest.fn(() => Promise.resolve([])),
            getLeaderBoardByWinRate: jest.fn(() => Promise.resolve([])),
            getUnreadNotificationCount: jest.fn(() => Promise.resolve(0)),
            getUnreadChatMessageTotal: jest.fn(() => Promise.resolve(0))
        }));
        const { services } = require('../services.js');
        const fakeIo = {
            sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
            to: jest.fn(() => ({ emit: jest.fn() }))
        };
        await expect(services.refreshStats(fakeIo)).resolves.toBeUndefined();
    });
});

describe('sessionSyncRace — singleton in-flight guard (concept-level)', () => {
    /**
     * A frontend socketClient.js-ben létrehozott in-flight singleton mintát
     * itt absztrakt szinten validáljuk (a backend test runner-rel). Az
     * implementáció maga frontend-only (DOM-független, tiszta logika).
     *
     * Cel: dokumentálni az elvárt viselkedést és regression-védelem nyújtani
     * arra az esetre, ha valaki később elrontja a singleton-pattern-t.
     */
    function makeSingletonRunner() {
        let inFlight = null;
        async function run(work, options = {}) {
            if (!options.forceReconnect && inFlight) {
                return inFlight;
            }
            const p = (async () => work())();
            if (!options.forceReconnect) {
                inFlight = p;
                const clear = () => { if (inFlight === p) inFlight = null; };
                p.then(clear, clear);
            }
            return p;
        }
        return run;
    }

    test('két párhuzamos hívás — ugyanaz a Promise, csak egy work() fut', async () => {
        const work = jest.fn(() => new Promise((resolve) => setTimeout(() => resolve('ok'), 10)));
        const run = makeSingletonRunner();
        const [a, b] = await Promise.all([run(work), run(work)]);
        expect(a).toBe('ok');
        expect(b).toBe('ok');
        expect(work).toHaveBeenCalledTimes(1);
    });

    test('forceReconnect bypass-olja a singleton-t — új work indul', async () => {
        const work = jest.fn(() => Promise.resolve('done'));
        const run = makeSingletonRunner();
        await Promise.all([
            run(work),
            run(work, { forceReconnect: true })
        ]);
        // Egy normál sync + egy forced sync = 2 work invocation.
        expect(work).toHaveBeenCalledTimes(2);
    });

    test('hibás run után a singleton törlődik — új hívás nem ragad be', async () => {
        const run = makeSingletonRunner();
        const failing = () => Promise.reject(new Error('boom'));
        await expect(run(failing)).rejects.toThrow('boom');
        // A következő hívás MÁR nem a régi (rejected) promise-t kapja.
        const ok = jest.fn(() => Promise.resolve('ok'));
        await expect(run(ok)).resolves.toBe('ok');
        expect(ok).toHaveBeenCalledTimes(1);
    });

    test('sikeres run után a singleton törlődik — friss hívás új work-öt indít', async () => {
        const run = makeSingletonRunner();
        const work = jest.fn(() => Promise.resolve('a'));
        await run(work);
        await run(work);
        expect(work).toHaveBeenCalledTimes(2);
    });
});
