/**
 * Bug 2026-05-04 — disconnect grace periodok ott, ahol eddig HIANYOZTAK.
 *
 * Ket terulet kapott uj grace-t (a 60s chess-meccs grace mar megvolt; ezt nem bantjuk):
 *   1. MATCHMAKING QUEUE — `chess:queue:join` utan disconnect eseten
 *      a regi kod azonnal kidobta a usert a queue-bol. Most: 30mp grace,
 *      ha kozben reconnect-el (uj socket a user-room-ban), bent marad a queue-ban.
 *   2. PRESENCE BROADCAST — utolso socket disconnectje utan a clientsById
 *      record-ot 10mp-ig megorzizzuk. Ha kozben uj socket erkezik ugyanazzal
 *      a clientId-vel, a takarito timer-t toroljuk (nincs flicker).
 *
 * A teszt source-level (regex) ellenorzeseket es funkcionalis (fake timers + mock io)
 * szimulaciot is vegez.
 */

const fs = require('fs');
const path = require('path');

const PVP_PATH = path.resolve(__dirname, '..', 'chess', 'pvp.js');
const SOCKETS_PATH = path.resolve(__dirname, '..', 'sockets.js');
const pvpSrc = fs.readFileSync(PVP_PATH, 'utf8');
const socketsSrc = fs.readFileSync(SOCKETS_PATH, 'utf8');

describe('backend pvp.js — matchmaking queue 30s disconnect grace', () => {
    test('QUEUE_DISCONNECT_GRACE_MS = 30_000 (30 masodperc)', () => {
        expect(pvpSrc).toMatch(/QUEUE_DISCONNECT_GRACE_MS\s*=\s*30_000|30000/);
    });

    test('queueDisconnectTimers Map letezik (per-userId timer tarolas)', () => {
        expect(pvpSrc).toMatch(/queueDisconnectTimers\s*=\s*new Map/);
    });

    test('handlePvpDisconnect setTimeout-tal halasztja a queue-bol-eltavolitast', () => {
        // A regi azonnali queue.splice helyett setTimeout(..., QUEUE_DISCONNECT_GRACE_MS)
        // pattern-nek kell jelen lennie. Csak a handlePvpDisconnect torzset nezzuk.
        const handlerStart = pvpSrc.indexOf('async function handlePvpDisconnect(');
        expect(handlerStart).toBeGreaterThan(-1);
        const torzs = pvpSrc.substring(handlerStart);
        expect(torzs).toMatch(/setTimeout\(/);
        expect(torzs).toMatch(/QUEUE_DISCONNECT_GRACE_MS/);
    });

    test('queue grace timer reconnect check: io.in(user-room).fetchSockets()', () => {
        // A kesleltetett callback-nek ujra ellenoriznie kell, hogy a user mar
        // reconnect-elt-e (legalabb egy socket a user-room-ban).
        const handlerStart = pvpSrc.indexOf('async function handlePvpDisconnect(');
        expect(handlerStart).toBeGreaterThan(-1);
        // Vegigolvassuk a fuggveny-torzset (a kovetkezo top-level fuggvenyig)
        const torzs = pvpSrc.substring(handlerStart);
        expect(torzs).toMatch(/io\.in\(`user-room:\$\{userId\}`\)\.fetchSockets/);
    });

    test('chess:queue:join cancel-eli a fuggoben grace timer-t', () => {
        // Ha a felhasznalo reconnect utan ujra queue-ba akar allni, a folyamatban
        // levo grace-takarito timer-t torolni kell.
        const idx = pvpSrc.indexOf("socket.on('chess:queue:join'");
        expect(idx).toBeGreaterThan(-1);
        const next = pvpSrc.indexOf("socket.on('chess:queue:leave'", idx);
        const tartomany = pvpSrc.substring(idx, next > -1 ? next : idx + 4000);
        // Multiline mintat hasznalunk — a clearTimeout / queueDisconnectTimers.get / delete
        // hivasok kulon-kulon ott vannak a torzsben.
        expect(tartomany).toMatch(/queueDisconnectTimers\.get/);
        expect(tartomany).toMatch(/clearTimeout/);
        expect(tartomany).toMatch(/queueDisconnectTimers\.delete/);
    });

    test('chess:queue:leave cancel-eli a fuggoben grace timer-t (explicit leave)', () => {
        const idx = pvpSrc.indexOf("socket.on('chess:queue:leave'");
        expect(idx).toBeGreaterThan(-1);
        // A leave handler torzsenek a kovetkezo socket.on-ig
        const next = pvpSrc.indexOf("socket.on('chess:", idx + 30);
        const tartomany = pvpSrc.substring(idx, next > -1 ? next : idx + 2000);
        expect(tartomany).toMatch(/clearTimeout/);
        expect(tartomany).toMatch(/queueDisconnectTimers\.delete/);
    });
});

describe('backend sockets.js — 10s presence-broadcast grace', () => {
    test('PRESENCE_DISCONNECT_GRACE_MS = 10_000 (10 masodperc)', () => {
        expect(socketsSrc).toMatch(/PRESENCE_DISCONNECT_GRACE_MS\s*=\s*10_000|10000/);
    });

    test('presenceGraceTimers Map letezik (per-clientId timer tarolas)', () => {
        expect(socketsSrc).toMatch(/presenceGraceTimers\s*=\s*new Map/);
    });

    test('disconnect handler: utolso socket eseten setTimeout-tal halasztott takaritas', () => {
        const idx = socketsSrc.indexOf("socket.on('disconnect'");
        expect(idx).toBeGreaterThan(-1);
        const next = socketsSrc.indexOf("socket.emit('notification:state'", idx);
        const tartomany = socketsSrc.substring(idx, next > -1 ? next : idx + 6000);
        // A grace logikahoz fontos elemek
        expect(tartomany).toMatch(/lastSocketGone/);
        expect(tartomany).toMatch(/setTimeout\(/);
        expect(tartomany).toMatch(/PRESENCE_DISCONNECT_GRACE_MS/);
        expect(tartomany).toMatch(/presenceGraceTimers\.set/);
    });

    test('grace callback: reconnect check, syncPresence csak mar tenyleg offline-kor', () => {
        // A halasztott callback-nek ellenoriznie kell, hogy a clientRecord uj
        // socketet kapott-e idokozben. A 2. elofordulast keressuk (NEM a const
        // declaration, hanem a setTimeout-on beluli hivast).
        const first = socketsSrc.indexOf('PRESENCE_DISCONNECT_GRACE_MS');
        const second = socketsSrc.indexOf('PRESENCE_DISCONNECT_GRACE_MS', first + 1);
        expect(second).toBeGreaterThan(first);
        // A setTimeout korulet (~1500 char visszafele) tartalmazza a callback-et.
        const tartomany = socketsSrc.substring(Math.max(0, second - 2500), second + 200);
        expect(tartomany).toMatch(/socketIds\.size\s*>\s*0/);
        expect(tartomany).toMatch(/clientsById\.delete/);
        expect(tartomany).toMatch(/syncPresence\(\)/);
    });

    test('registerSocket cancel-eli a fuggoben presence-grace timer-t reconnect-kor', () => {
        const idx = socketsSrc.indexOf('function registerSocket(');
        expect(idx).toBeGreaterThan(-1);
        // Az elso ~600 karakter elegendo a cancel logikahoz.
        const tartomany = socketsSrc.substring(idx, idx + 1200);
        expect(tartomany).toMatch(/presenceGraceTimers\.get/);
        expect(tartomany).toMatch(/clearTimeout/);
        expect(tartomany).toMatch(/presenceGraceTimers\.delete/);
    });
});

describe('backend pvp.js — funkcionalis: queue grace timer eletutja', () => {
    // jest.useFakeTimers() hasznalata az async grace teszteleshez.
    let pvp;

    beforeEach(() => {
        // Tisztan toltjuk be a modult, hogy az _internals Map-ek minden
        // tesztben uresek legyenek.
        jest.resetModules();
        jest.useFakeTimers();
        pvp = require('../chess/pvp.js');
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    function buildMockIo({ stillOnlineUserIds } = { stillOnlineUserIds: [] }) {
        return {
            in: (room) => ({
                fetchSockets: async () => {
                    // user-room:${userId} → ha a user az online-listaban van, 1 socket; egyebkent 0.
                    const m = String(room).match(/^user-room:(\d+)$/);
                    if (m) {
                        const uid = Number(m[1]);
                        return stillOnlineUserIds.includes(uid) ? [{ id: 'mock-sock' }] : [];
                    }
                    return [];
                }
            }),
            to: () => ({ emit: () => {} })
        };
    }

    test('disconnect: 30mp utan, ha a user OFFLINE marad, a queue-bol kikerul', async () => {
        const userId = 4242;
        const qKey = 'klasszikus:ranked';

        // Manualisan elhelyezzuk a usert egy queue-ba
        const { matchmakingQueueByMode, userQueueIndex, queueDisconnectTimers } = pvp._internals;
        matchmakingQueueByMode.set(qKey, [{ userId, username: 'A', elo: 800, socketId: 's1', mode: 'klasszikus', ranked: true }]);
        userQueueIndex.set(userId, qKey);

        const io = buildMockIo({ stillOnlineUserIds: [] }); // offline marad

        await pvp.handlePvpDisconnect(userId, io);
        // Disconnect utan AZONNAL meg ott van a queue-ban (grace miatt)
        expect(matchmakingQueueByMode.get(qKey)).toHaveLength(1);
        expect(userQueueIndex.has(userId)).toBe(true);
        expect(queueDisconnectTimers.has(userId)).toBe(true);

        // 30mp eltelte
        jest.advanceTimersByTime(pvp.QUEUE_DISCONNECT_GRACE_MS);
        // A timer setTimeout-callback aszinkron io.in().fetchSockets() hivast tesz —
        // engedjuk lefutni a microtask queue-t.
        await Promise.resolve();
        await Promise.resolve();

        expect(matchmakingQueueByMode.get(qKey)).toHaveLength(0);
        expect(userQueueIndex.has(userId)).toBe(false);
        expect(queueDisconnectTimers.has(userId)).toBe(false);
    });

    test('disconnect + reconnect grace alatt: a user a queue-ban marad', async () => {
        const userId = 5252;
        const qKey = 'klasszikus:ranked';

        const { matchmakingQueueByMode, userQueueIndex, queueDisconnectTimers } = pvp._internals;
        matchmakingQueueByMode.set(qKey, [{ userId, username: 'B', elo: 800, socketId: 's1', mode: 'klasszikus', ranked: true }]);
        userQueueIndex.set(userId, qKey);

        // Reconnect-elt — a fetchSockets visszaad legalabb egy socketet.
        const io = buildMockIo({ stillOnlineUserIds: [userId] });

        await pvp.handlePvpDisconnect(userId, io);
        expect(queueDisconnectTimers.has(userId)).toBe(true);

        jest.advanceTimersByTime(pvp.QUEUE_DISCONNECT_GRACE_MS);
        await Promise.resolve();
        await Promise.resolve();

        // A timer lefutott, de a stillOnline check miatt nem takaritott
        expect(matchmakingQueueByMode.get(qKey)).toHaveLength(1);
        expect(userQueueIndex.has(userId)).toBe(true);
        expect(queueDisconnectTimers.has(userId)).toBe(false); // A timer maga lefutott, csak no-op-olt
    });

    test('grace lejarat ELOTT 29mp: meg ott van a queue-ban', async () => {
        const userId = 6262;
        const qKey = 'klasszikus:ranked';

        const { matchmakingQueueByMode, userQueueIndex } = pvp._internals;
        matchmakingQueueByMode.set(qKey, [{ userId, username: 'C', elo: 800, socketId: 's1', mode: 'klasszikus', ranked: true }]);
        userQueueIndex.set(userId, qKey);

        const io = buildMockIo({ stillOnlineUserIds: [] });
        await pvp.handlePvpDisconnect(userId, io);

        jest.advanceTimersByTime(pvp.QUEUE_DISCONNECT_GRACE_MS - 1000); // 29mp
        await Promise.resolve();

        expect(matchmakingQueueByMode.get(qKey)).toHaveLength(1);
        expect(userQueueIndex.has(userId)).toBe(true);
    });
});
