/**
 * Bug 2026-05-04 (II. iteracio) — F5 / kapcsolat-vesztes utan a felhasznalo
 * NEM kapott vissza a meccsbe. Felhasznaloi panasz:
 *   "REFRESHELES UTAN LEGYEN RECONNECT A MECCSHEZ, DE NE ALLJON MEG AZ IDEJE"
 *
 * Fix: ket reszbol all a flow-fix
 *   1) `chessInviteGlobal.js`: socket-connect-kor `chess:rejoin` emit (NEM chess
 *      oldalon). Ha aktiv meccs van, `chess:game:start` valasz erkezik es
 *      auto-navigaljuk a /chess_barold/html/chess.html-re a sessionStorage
 *      `mattmester.chessPendingMatch` flag-gel.
 *   2) `main.js (chess.html)`: a chooser nyitasat eltoljuk (1.5s wait),
 *      hogy a rejoin valasz mellett a tabla rendelodjon, ne a chooser.
 *      Plusz a `pvpJatekKezdet` defenziv-zarja a chooser-t.
 *   3) `chessModeChooser.js`: a "Mar van aktiv" backend hiba mostantol auto-
 *      navigal a chess.html-re (rejoin) helyette egy hiba-uzenet helyett.
 *
 * Az ido a backendben TOVABB FUT a 60s grace alatt — a felhasznalo nem
 * veszit gondolkodasi idot a refresh miatt.
 */

const fs = require('fs');
const path = require('path');

const FRONTEND = path.resolve(__dirname, '..', '..', 'frontend');
const CHESS_INVITE_GLOBAL = path.join(FRONTEND, 'javascript', 'chessInviteGlobal.js');
const CHESS_MODE_CHOOSER = path.join(FRONTEND, 'javascript', 'chessModeChooser.js');
const MAIN_JS = path.join(FRONTEND, 'chess_barold', 'javascript', 'main.js');

function readFile(p) {
    return fs.readFileSync(p, 'utf8');
}

describe('chessInviteGlobal.js — aktiv-meccs detektor (Bug 2026-05-04 II.)', () => {
    const src = readFile(CHESS_INVITE_GLOBAL);

    test('a fajl tartalmazza az `elindulRejoinDetekcio` (vagy egyenertekut)', () => {
        // Lehet kulonbozo fuggveny-nev, de tartalmaznia kell a chess:rejoin
        // emit-et a chess.html-en KIVUL.
        expect(src).toMatch(/socket\.emit\(['"]chess:rejoin['"]/);
    });

    test('a chess:rejoin emit GUARDOLT az `aSakkOldalon()` ellenorzessel', () => {
        // A chess.html-en a main.js sajat rejoin-jat kuldi, igy a global
        // detektor ott NEM duplikalna. Az `aSakkOldalon()` hivasnak benne
        // kell lennie a rejoin-flow-ban.
        expect(src).toMatch(/aSakkOldalon\s*\(/);
    });

    test('a fajl listenel a chess:game:start-ra es navigal chess.html-re', () => {
        expect(src).toMatch(/socket\.on\(['"]chess:game:start['"]/);
        expect(src).toMatch(/CHESS_PAGE_PATH|chess_barold\/html\/chess\.html/);
    });

    test('a navigacio elott sessionStorage flag-et ir (mattmester.chessPendingMatch)', () => {
        // Ez a flag jelzi a chess.html-nek, hogy a chooser-t NE nyissa meg —
        // varja a rejoin valaszt.
        expect(src).toMatch(/mattmester\.chessPendingMatch/);
    });

    test('reconnect (transport switch) eseten is megprobalja a rejoin-t', () => {
        // A `socket.on('connect', ...)` listener biztositja, hogy a halozat
        // visszajottekor is leperdul a rejoin.
        expect(src).toMatch(/socket\.on\(['"]connect['"]/);
    });

    test('bfcache (back button) restore: pageshow listener emit-eli a rejoin-t', () => {
        // Bug 2026-05-04: BACK gomb utan a Chrome bfcache-bol szolgalja a
        // home page-et, a script-ek NEM futnak ujra. A `pageshow` event
        // `persisted=true` flag-gel jelzi a bfcache-eset, manualisan emit-elunk.
        expect(src).toMatch(/addEventListener\(['"]pageshow['"]/);
        expect(src).toMatch(/persisted/);
    });

    test('tab-vissza (visibilitychange) is trigger-eli a rejoin-t', () => {
        // Tab-switch utan a felhasznalo visszajon — ha kozben a meccse miatt
        // at kell mennie a chess.html-re, megtegyuk.
        expect(src).toMatch(/addEventListener\(['"]visibilitychange['"]/);
    });

    test('window focus is trigger-eli a rejoin-t (fallback)', () => {
        // visibilitychange nem mindig megbizhato bfcache utan, ezert focus
        // event-tel is duplazzuk.
        expect(src).toMatch(/addEventListener\(['"]focus['"]/);
    });
});

describe('chessModeChooser.js — open() emit chess:rejoin AKTIV-MECCS GUARD', () => {
    const src = readFile(CHESS_MODE_CHOOSER);

    test('az `open` fuggveny emit-eli a chess:rejoin-t mielott a modal-t megjeleniti', () => {
        // Bug 2026-05-04: a felhasznalo BACK gombbal home-ra kerul, kattint
        // "Jatek"-ra es a chooser nyilik, de aktiv meccse van. A guard:
        // open()-kor egy chess:rejoin emit megy, a chessInviteGlobal handler-e
        // navigal chess.html-re ha aktiv. Igy a chooser csak akkor latszik
        // ervenyesen, ha NINCS aktiv meccs.
        const openIdx = src.indexOf('async function open(');
        expect(openIdx).toBeGreaterThan(-1);
        const openBrace = src.indexOf('{', openIdx);
        let depth = 1;
        let i = openBrace + 1;
        while (i < src.length && depth > 0) {
            const ch = src[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        const torzs = src.substring(openBrace + 1, i - 1);
        expect(torzs).toMatch(/socket\.emit\(['"]chess:rejoin['"]/);
    });

    test('az emit guard-olt: csak akkor megy, ha a felhasznalo NEM a chess.html-en van', () => {
        // chess.html-en a main.js init() sajat overlay+rejoin flow-ja megy —
        // duplikatum nem kell.
        expect(src).toMatch(/aSakkOldalon\s*\(/);
    });
});

describe('main.js (chess.html) — chooser nyitas csak a rejoin valasz utan', () => {
    const src = readFile(MAIN_JS);

    test('az init NEM hivja unconditional `ujMeccsChooserNyitas()`-t a hasPendingMatch-after agon', () => {
        // Bug-fix: korabban azonnal kinyitotta a chooser-t es a rejoin valasz
        // (chess:game:start) a chooser mogott rendelodott. Most a pvpSocketInit
        // listenerei nyitjak (chess:rejoin:none) vagy a pvpJatekKezdet zarja
        // (chess:game:start). A direkt hivasok feltetelhez kotottek:
        //   1. safety setTimeout fallback (ha 5s alatt nincs valasz)
        //   2. ?type=botRejoin URL eseten ha a gameId hibas (nincs mire rejoin-olni)
        // — mindketto explicit error/timeout, NEM unconditional.
        const initIdx = src.indexOf('async function init(');
        expect(initIdx).toBeGreaterThan(-1);
        const openBrace = src.indexOf('{', initIdx);
        let depth = 1;
        let i = openBrace + 1;
        while (i < src.length && depth > 0) {
            const ch = src[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        const initBody = src.substring(openBrace + 1, i - 1);
        const hivasok = (initBody.match(/ujMeccsChooserNyitas\s*\(/g) || []).length;
        // Max 2 explicit error-fallback hivas (safety timeout + botRejoin invalid gameId).
        expect(hivasok).toBeLessThanOrEqual(2);
    });

    test('safety timeout: ha nem jon rejoin valasz, a chooser kinyilik (5000ms)', () => {
        // 5s kapacitas — overlay alatt vart valaszt nem ragadhat be vegtelen ideig.
        expect(src).toMatch(/setTimeout\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?ujMeccsChooserNyitas\s*\([\s\S]*?\}\s*,\s*5000\s*\)/);
    });

    test('init() AZONNAL probal rejoin emit-et kuldeni (nem var 500ms)', () => {
        // Bug 2026-05-04 III: a korabbi `setTimeout(emitRejoinWhenReady, 500)`
        // halasztotta a rejoin emit-et. Most azonnal probalkozunk + 250ms retry.
        expect(src).toMatch(/probaljRejoint|probaInterval/);
        // Azonnali probalkozas: nincs felesleges 500ms wrapper a rejoin emit korul.
        expect(src).not.toMatch(/setTimeout\s*\(\s*\(\s*\)\s*=>\s*emitRejoinWhenReady\s*\([^)]*\)\s*,\s*500/);
    });

    test('pvpSocketInit listeneli a chess:rejoin:none-t es chess:game:start-ot', () => {
        // A rejoin route-olas a pvpSocketInit-ben elhelyezett tartos listener-ek
        // dolga, NEM az init body-jaban .once-olunk.
        expect(src).toMatch(/socket\.on\(['"]chess:rejoin:none['"]/);
        expect(src).toMatch(/socket\.on\(['"]chess:game:start['"]/);
    });

    test('`pvpJatekKezdet` defenziv-zarja a mode chooser-t (F5 race-fix)', () => {
        const startIdx = src.indexOf('function pvpJatekKezdet(');
        expect(startIdx).toBeGreaterThan(-1);
        const openBrace = src.indexOf('{', startIdx);
        let depth = 1;
        let i = openBrace + 1;
        while (i < src.length && depth > 0) {
            const ch = src[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        const torzs = src.substring(openBrace + 1, i - 1);
        expect(torzs).toMatch(/MattMesterChessModeChooser[\s\S]*?\.close\s*\(/);
    });

    test('hasPendingMatch ellenorzes elfogadja a `gameId === 0` sentinel-t (ts-alapu)', () => {
        // A "Mar van aktiv" hiba auto-navigacioja gameId=0-val ir
        // sessionStorage-ot — a rejoin handler taljala meg az igazi gameId-t.
        // Korabban a `parsed.gameId &&` truthy-check eltavolitotta volna,
        // most csak az `ts` alapjan dontunk.
        const idx = src.indexOf('mattmester.chessPendingMatch');
        expect(idx).toBeGreaterThan(-1);
        // A javitas utan NINCS `parsed.gameId &&` ellenorzes a parsed-ts kornyezeteben:
        const window500 = src.substring(idx, Math.min(idx + 800, src.length));
        // Ne fogadjuk el a `parsed.gameId &&` formulat itt — csak `ts`-alapu check.
        expect(window500).not.toMatch(/parsed\.gameId\s*&&\s*\(Date\.now/);
    });
});

describe('chessModeChooser.js — "Mar van aktiv" hiba auto-redirect a chess.html-re', () => {
    const src = readFile(CHESS_MODE_CHOOSER);

    test('a chess:error handler kulon agon kezeli az aktiv-meccs hibat', () => {
        // A regex-pattern ellenorzese a hibauzenet-detektorra.
        expect(src).toMatch(/m[aá]r van akt[ií]v/i);
    });

    test('aktiv-meccs hibanal sessionStorage flag + redirect chess.html-re', () => {
        // Az auto-redirect resze: pendingMatch flag + window.location.href.
        // Az ag-on belul mindketto megtalalhato kell hogy legyen.
        expect(src).toMatch(/mattmester\.chessPendingMatch/);
        expect(src).toMatch(/window\.location\.href\s*=\s*['"]\/chess_barold\/html\/chess\.html/);
    });
});

describe('chess.html + main.js + chess.css — rejoin overlay (visible feedback)', () => {
    const html = readFile(path.resolve(__dirname, '..', 'chess_barold', 'html', 'chess.html'));
    const css = readFile(path.resolve(__dirname, '..', 'chess_barold', 'css', 'chess.css'));
    const js = readFile(path.resolve(__dirname, '..', 'chess_barold', 'javascript', 'main.js'));

    test('chess.html tartalmazza a #rejoin-overlay elemet', () => {
        expect(html).toMatch(/id=["']rejoin-overlay["']/);
        expect(html).toMatch(/Visszacsatlakoz[aá]s/i);
    });

    test('chess.css definialja a .rejoin-overlay osztalyt magas z-index-szel (chooser felett)', () => {
        // Chooser z-index: 1080. Overlay-nek nagyobbnak kell lennie.
        expect(css).toMatch(/\.rejoin-overlay\s*\{/);
        const match = css.match(/\.rejoin-overlay\s*\{[\s\S]*?z-index\s*:\s*(\d+)/);
        expect(match).not.toBeNull();
        const zIndex = Number(match[1]);
        expect(zIndex).toBeGreaterThan(1080);
    });

    test('main.js definialja `rejoinOverlayMutat` es `rejoinOverlayElrejt` fuggvenyt', () => {
        expect(js).toMatch(/function\s+rejoinOverlayMutat\s*\(/);
        expect(js).toMatch(/function\s+rejoinOverlayElrejt\s*\(/);
    });

    test('init() AZONNAL hivja rejoinOverlayMutat-t (mielott barmi rendelodne)', () => {
        const initIdx = js.indexOf('async function init(');
        expect(initIdx).toBeGreaterThan(-1);
        // A rejoinOverlayMutat hivasanak az init body-ban a console.log utan, de
        // a tobbi fontos lepes elott kell lennie. Egyszeruen check-eljuk hogy
        // megjelenik az init torzseben.
        const openBrace = js.indexOf('{', initIdx);
        let depth = 1;
        let i = openBrace + 1;
        while (i < js.length && depth > 0) {
            const ch = js[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        const initBody = js.substring(openBrace + 1, i - 1);
        expect(initBody).toMatch(/rejoinOverlayMutat\s*\(/);
    });

    test('pvpJatekKezdet hivja rejoinOverlayElrejt-et (sikeres rejoin)', () => {
        const startIdx = js.indexOf('function pvpJatekKezdet(');
        expect(startIdx).toBeGreaterThan(-1);
        const openBrace = js.indexOf('{', startIdx);
        let depth = 1;
        let i = openBrace + 1;
        while (i < js.length && depth > 0) {
            const ch = js[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        const torzs = js.substring(openBrace + 1, i - 1);
        expect(torzs).toMatch(/rejoinOverlayElrejt\s*\(/);
    });

    test('chess:rejoin:none handler hivja rejoinOverlayElrejt-et (no-match)', () => {
        // A pvpSocketInit-ben levo handler-ben.
        const idx = js.indexOf("socket.on('chess:rejoin:none'");
        expect(idx).toBeGreaterThan(-1);
        // Olvassuk a handler torzset
        const arrowStart = js.indexOf('=>', idx);
        const openBrace = js.indexOf('{', arrowStart);
        let depth = 1;
        let i = openBrace + 1;
        while (i < js.length && depth > 0) {
            const ch = js[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        const torzs = js.substring(openBrace + 1, i - 1);
        expect(torzs).toMatch(/rejoinOverlayElrejt\s*\(/);
    });
});

describe('backend pvp.js — disconnect grace, ido tovabb fut (regresszio-vedelem)', () => {
    const PVP_PATH = path.resolve(__dirname, '..', '..', 'backend', 'chess', 'pvp.js');
    const src = readFile(PVP_PATH);

    test('handlePvpDisconnect 60s grace-period idozitot indit', () => {
        expect(src).toMatch(/DISCONNECT_GRACE_MS\s*=\s*60_000|60_?000/);
        expect(src).toMatch(/jatek\.disconnectTimer\s*=\s*setTimeout/);
    });

    test('handlePvpDisconnect NEM hivja idoLeall-t (ido tovabb fut)', () => {
        // Felhasznalo elvarja: "DE NE ALLJON MEG AZ IDEJE". Az `idoLeall`
        // hivasa megszakitana az ora-tickeket — kifejezetten kerulendo.
        const startIdx = src.indexOf('async function handlePvpDisconnect');
        expect(startIdx).toBeGreaterThan(-1);
        const openBrace = src.indexOf('{', startIdx);
        let depth = 1;
        let i = openBrace + 1;
        while (i < src.length && depth > 0) {
            const ch = src[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        const torzs = src.substring(openBrace + 1, i - 1);
        // A torzs NEM tartalmazhat `idoLeall(jatek)` hivast.
        expect(torzs).not.toMatch(/idoLeall\s*\(\s*jatek\s*\)/);
    });

    test('chess:rejoin handler tisztitja a disconnectTimert es ujra-szobaba teszi', () => {
        const startIdx = src.indexOf("socket.on('chess:rejoin'");
        expect(startIdx).toBeGreaterThan(-1);
        const openBrace = src.indexOf('{', startIdx);
        let depth = 1;
        let i = openBrace + 1;
        while (i < src.length && depth > 0) {
            const ch = src[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        const torzs = src.substring(openBrace + 1, i - 1);
        // A rejoin a disconnect-timer-t torli es a felhasznalot vissza-szobazza.
        expect(torzs).toMatch(/clearTimeout\s*\(\s*jatek\.disconnectTimer/);
        expect(torzs).toMatch(/socket\.join\(`chess-game:\$\{gameId\}`\)/);
        // A chess:game:start emit visszajuttatja a teljes allapotot.
        expect(torzs).toMatch(/socket\.emit\(['"]chess:game:start['"]/);
    });
});
