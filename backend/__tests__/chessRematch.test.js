/**
 * N13 — Chess rematch (revans) handshake
 *
 * A tesztek a backend/chess/pvp.js rematch flow-jának struktúráját ellenőrzik:
 *   1. pendingRematches state + 30s timeout konstans
 *   2. chess:rematch:offer handler — vége-ellenőrzés, opponent ID kalkuláció,
 *      pendingRematches Map.set, ellenfélnek incoming emit
 *   3. chess:rematch:accept → handleRematchAccept → uj jatekIndit
 *   4. chess:rematch:decline cleanup
 *   5. handlePvpDisconnect a pendingRematches-bol is takarít
 *
 * A pvp.js stateful (Map-ek modul-szinten), igy itt a kodot olvasva ellenorizzuk
 * a guard-mintakat — a teljes integracio 2-tab manualis smoke-ban fut.
 */

const fs = require('fs');
const path = require('path');

const PVP_PATH = path.join(__dirname, '..', 'chess', 'pvp.js');
const pvpSrc = fs.readFileSync(PVP_PATH, 'utf8');

describe('N13.1 pendingRematches state + timeout', () => {
    test('pendingRematches Map ki van deklaralva modul-szinten', () => {
        expect(pvpSrc).toMatch(/const\s+pendingRematches\s*=\s*new\s+Map\(\)/);
    });

    test('REMATCH_TIMEOUT_MS = 30 masodperc', () => {
        expect(pvpSrc).toMatch(/REMATCH_TIMEOUT_MS\s*=\s*30[_]?000/);
    });
});

describe('N13.2 chess:rematch:offer handler', () => {
    test('offer handler ellenorzi hogy a meccs PvP es vege', () => {
        const re = /socket\.on\(['"]chess:rematch:offer['"][^]*?!jatek\.pvpAktiv\s*\|\|\s*!jatek\.vege/;
        expect(pvpSrc).toMatch(re);
    });

    test('offer 30s timeout-ot allit es Map.set-tel taroljaa pendingRematches-be', () => {
        const re = /pendingRematches\.set\(gameId,\s*\{[^]*?offererId[^]*?opponentId[^]*?mode[^]*?ranked/;
        expect(pvpSrc).toMatch(re);
    });

    test('offer az ellenfelnek user-room-ra kuldi az incoming event-et', () => {
        const re = /io\.to\(`user-room:\$\{opponentId\}`\)\.emit\(['"]chess:rematch:incoming['"]/;
        expect(pvpSrc).toMatch(re);
    });
});

describe('N13.3 chess:rematch:accept → handleRematchAccept', () => {
    test('handleRematchAccept letezik es jatekIndit-tel kovet', () => {
        expect(pvpSrc).toMatch(/async\s+function\s+handleRematchAccept/);
        const re = /handleRematchAccept[^]*?await\s+jatekIndit\(/;
        expect(pvpSrc).toMatch(re);
    });

    test('accept utan pendingRematches.delete + clearTimeout', () => {
        const re = /handleRematchAccept[^]*?clearTimeout\(rec\.timer\)[^]*?pendingRematches\.delete\(gameId\)/;
        expect(pvpSrc).toMatch(re);
    });

    test('accept az offerer userId-jat NEM fogadja el (csak a masik fel)', () => {
        // Anti-self-accept guard: rec.offererId === context.userId esetben return
        const re = /handleRematchAccept[^]*?if\s*\(\s*rec\.offererId\s*===\s*context\.userId\s*\)\s*return/;
        expect(pvpSrc).toMatch(re);
    });
});

describe('N13.4 chess:rematch:decline takarit', () => {
    test('decline csak a NEM-offerer-tol jon', () => {
        const re = /socket\.on\(['"]chess:rematch:decline['"][^]*?if\s*\(\s*rec\.offererId\s*===\s*context\.userId\s*\)\s*return/;
        expect(pvpSrc).toMatch(re);
    });

    test('decline torli a pendingRematches-bol es ertesiti az offerert', () => {
        const re = /chess:rematch:decline[^]*?pendingRematches\.delete\(gameId\)[^]*?chess:rematch:declined/;
        expect(pvpSrc).toMatch(re);
    });
});

describe('N13.5 handlePvpDisconnect torli a fuggoben revans-okat', () => {
    test('disconnect ciklus a pendingRematches-en az userId-t resztvevokent ellenorzi', () => {
        const re = /handlePvpDisconnect[^]*?for\s*\(\s*const\s+\[rgameId,\s*rec\]\s+of\s+pendingRematches\s*\)[^]*?(?:offererId|opponentId)\s*===\s*userId/;
        expect(pvpSrc).toMatch(re);
    });

    test('disconnect a masik felet chess:rematch:cancelled-vel ertesiti', () => {
        const re = /handlePvpDisconnect[^]*?chess:rematch:cancelled/;
        expect(pvpSrc).toMatch(re);
    });
});
