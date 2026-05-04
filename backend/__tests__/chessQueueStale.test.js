/**
 * N1 — Chess PvP queue + pending invite stale-state takarítás
 *
 * A tesztek a backend/chess/pvp.js védelmi check-jeit ellenőrzik:
 *   1. Pending invite timeout: socket.connected check (halott socketre nem emit-elünk)
 *   2. disconnectTimer: jatekKeres() + vege/pvpAktiv/disconnectSzin együttes guard
 *   3. handlePvpDisconnect queue + userQueueIndex stale entry takarítás
 *
 * A pvp.js stateful (Map-ek a modul-szinten), így itt a kódot olvasva ellenőrizzük
 * a guard-mintákat, nem futási példák alapján — a teljes integráció smoke a
 * 2-tab manuális tesztben fut.
 */

const fs = require('fs');
const path = require('path');

const PVP_PATH = path.join(__dirname, '..', 'chess', 'pvp.js');
const pvpSrc = fs.readFileSync(PVP_PATH, 'utf8');

describe('N1.1 Pending invite timeout: socket.connected check', () => {
    test('a 60mp invite timer halott socket-re NEM emit-el', () => {
        // A védelem: a setTimeout callback előbb ellenőrzi, hogy socket.connected
        // mielőtt socket.emit-et hívna; az io.to(user-room) változatlan marad.
        const re = /setTimeout\([^]*?if\s*\(\s*!pendingInvites\.has\(targetUserId\)\s*\)\s*return[^]*?if\s*\(\s*socket\.connected\s*\)\s*\{[^]*?socket\.emit\(['"]chess:invite:expired['"]/;
        expect(pvpSrc).toMatch(re);
    });
});

describe('N1.2 disconnectTimer: stale game guard', () => {
    test('disconnectTimer callback jatekKeres()-sel ellenőrzi, hogy a meccs még létezik', () => {
        // Régi: csak `!jatek.vege && jatek.disconnectSzin === szin` check.
        // Új: a closure-beli `jatek` referencia helyett `jatekKeres(gameId)` lookup,
        // hogy az időközben törölt vagy másik handler által végét ért meccsre ne fire-oljon.
        const re = /jatek\.disconnectTimer\s*=\s*setTimeout\(async\s*\(\)\s*=>\s*\{[^]*?const\s+stillExists\s*=\s*jatekKeres\(gameId\)/;
        expect(pvpSrc).toMatch(re);
    });

    test('disconnectTimer együttes guard: stillExists && !vege && pvpAktiv && disconnectSzin===szin', () => {
        // A double-fire elleni védelem: 4 feltétel együtt — ha bármelyik nem teljesül,
        // skipeljük a jatekVegeKezeles hívást.
        const re = /stillExists[^]*?&&\s*!stillExists\.vege[^]*?&&\s*stillExists\.pvpAktiv[^]*?&&\s*stillExists\.disconnectSzin\s*===\s*szin/;
        expect(pvpSrc).toMatch(re);
    });
});

describe('N1.3 handlePvpDisconnect: queue + userQueueIndex stale entry takarítás', () => {
    test('a disconnect handler eltávolítja a usert a queue-ból ÉS a userQueueIndex-ből', () => {
        // A meglévő impl: const qKey = userQueueIndex.get(userId); ha van, indul egy
        // 30mp-es grace setTimeout. A timer-callback a *.splice + userQueueIndex.delete
        // hívásokat tartalmazza (csak ha a felhasználó tényleg offline maradt).
        // Ez biztosítja, hogy disconnect + stillOffline → nincs stale entry sehol.
        const re = /async\s+function\s+handlePvpDisconnect[^]*?const\s+qKey\s*=\s*userQueueIndex\.get\(userId\)[^]*?\.splice\(idx,\s*1\)[^]*?userQueueIndex\.delete\(userId\)/;
        expect(pvpSrc).toMatch(re);
    });

    test('a queue eltavolitas grace-szel keslelteve fut (QUEUE_DISCONNECT_GRACE_MS)', () => {
        // Reconnect-tolerancia: a takaritas 30mp-pel keslelteve fut le, hogy
        // mobil-internet kis kihagyasanal ne kelljen ujra sorbaalni.
        expect(pvpSrc).toMatch(/QUEUE_DISCONNECT_GRACE_MS\s*=\s*30_000/);
        const handlerStart = pvpSrc.indexOf('async function handlePvpDisconnect(');
        expect(handlerStart).toBeGreaterThan(-1);
        const torzs = pvpSrc.substring(handlerStart);
        expect(torzs).toMatch(/setTimeout\(/);
        expect(torzs).toMatch(/QUEUE_DISCONNECT_GRACE_MS/);
    });
});

describe('N1.4 hasLiveActiveGame helper: stale activeGamesByUser auto-cleanup', () => {
    test('a queue:join és invite handler a hasLiveActiveGame helper-t hívja', () => {
        // A helper az egyetlen igazság-forrás arra, hogy a user aktív meccsben van-e.
        // Ha a regisztrált gameId már halott (cleanup nem futott), a helper törli és
        // false-t ad — így a queue / invite belépés nem blokkolódik értelmetlenül.
        expect(pvpSrc).toMatch(/function\s+hasLiveActiveGame\(userId\)/);
        expect(pvpSrc).toMatch(/hasLiveActiveGame\(userId\)/);
        expect(pvpSrc).toMatch(/hasLiveActiveGame\(targetUserId\)/);
    });
});
