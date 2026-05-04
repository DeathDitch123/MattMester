/**
 * Bug 2026-05-04 (IV. iteracio) — chess.com-szeru disconnect-grace.
 *
 * Felhasznaloi kovetelmenyek:
 *   - 60 mp grace period: ha elveszti a kapcsolatot (F5/back/tab-close/net-loss),
 *     60 masodperce van visszacsatlakozni
 *   - Ha 60 mp alatt nem ter vissza, az ellenfel auto-nyer
 *   - Az ido a backend-ben TOVABB FUT a grace alatt
 *
 * Backend implementacio (pvp.js):
 *   - DISCONNECT_GRACE_MS = 60_000
 *   - handlePvpDisconnect indit egy grace-timert
 *   - chess:rejoin handler torli a grace-timert es folytatja a meccset
 *   - Ha a grace lejart, jatekVegeKezeles auto-forfeit-tel zarja
 *   - jatek.vegeUzenet + vegeEredmeny tarolasra kerul (post-grace UX miatt)
 *   - chess:rejoin POST-GRACE eseten chess:game:end-et kuld (nem rejoin:none)
 */

const fs = require('fs');
const path = require('path');

const PVP_PATH = path.resolve(__dirname, '..', 'chess', 'pvp.js');
const pvpSrc = fs.readFileSync(PVP_PATH, 'utf8');

const MAIN_JS_PATH = path.resolve(__dirname, '..', '..', 'frontend', 'chess_barold', 'javascript', 'main.js');
const mainJs = fs.readFileSync(MAIN_JS_PATH, 'utf8');

function extractFunctionBody(source, signaturePrefix) {
    const startIdx = source.indexOf(signaturePrefix);
    if (startIdx === -1) return null;
    const openBrace = source.indexOf('{', startIdx);
    if (openBrace === -1) return null;
    let depth = 1;
    let i = openBrace + 1;
    while (i < source.length && depth > 0) {
        const ch = source[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
    }
    return source.substring(openBrace + 1, i - 1);
}

describe('backend pvp.js — 60s disconnect grace period', () => {
    test('DISCONNECT_GRACE_MS = 60_000 (60 masodperc, chess.com-szeru)', () => {
        expect(pvpSrc).toMatch(/DISCONNECT_GRACE_MS\s*=\s*60_000|60000/);
    });

    test('handlePvpDisconnect setTimeout-tal indit grace-timert', () => {
        const torzs = extractFunctionBody(pvpSrc, 'async function handlePvpDisconnect(');
        expect(torzs).not.toBeNull();
        expect(torzs).toMatch(/setTimeout\s*\(\s*async\s*\(/);
        expect(torzs).toMatch(/DISCONNECT_GRACE_MS/);
    });

    test('handlePvpDisconnect multi-tab guard a chess-game szobat ellenorizi (NEM user-room)', () => {
        // Bug 2026-05-04: a regi user-room check tul laza volt — ha barhol mas
        // oldalon volt egy user-id-vel ellatott socket (home/profile), a guard
        // "online"-nak vette es nem indult a grace, holott a felhasznalo elhagyta
        // a meccs-oldalt. A chess-game szoba pontosan a meccs aktiv tag-jait
        // tartja, igy ezt kell ellenorizni.
        const torzs = extractFunctionBody(pvpSrc, 'async function handlePvpDisconnect(');
        expect(torzs).toMatch(/io\.in\(`chess-game:\$\{gameId\}`\)\.fetchSockets/);
        expect(torzs).toMatch(/stillInGame|gameSockets\.some/);
    });

    test('handlePvpDisconnect emit chess:opponent:disconnected gracePeriodMs-szel', () => {
        const torzs = extractFunctionBody(pvpSrc, 'async function handlePvpDisconnect(');
        expect(torzs).toMatch(/emit\(['"]chess:opponent:disconnected['"]/);
        expect(torzs).toMatch(/gracePeriodMs/);
    });

    test('grace lejart -> jatekVegeKezeles hivva nyertes-szinnel (auto-forfeit)', () => {
        const torzs = extractFunctionBody(pvpSrc, 'async function handlePvpDisconnect(');
        // A setTimeout callback-jeben a getOpponentColor + jatekVegeKezeles hivasok.
        expect(torzs).toMatch(/getOpponentColor\s*\(\s*szin\s*\)/);
        expect(torzs).toMatch(/jatekVegeKezeles\s*\(/);
    });

    test('handlePvpDisconnect NEM hivja idoLeall (ido tovabb fut grace alatt)', () => {
        const torzs = extractFunctionBody(pvpSrc, 'async function handlePvpDisconnect(');
        expect(torzs).not.toMatch(/idoLeall\s*\(\s*jatek\s*\)/);
    });
});

describe('backend pvp.js — chess:rejoin tisztitja a grace-timert (chess.com-szeru reconnect)', () => {
    const startIdx = pvpSrc.indexOf("socket.on('chess:rejoin'");
    expect(startIdx).toBeGreaterThan(-1);
    const arrowOpen = pvpSrc.indexOf('=>', startIdx);
    const openBrace = pvpSrc.indexOf('{', arrowOpen);
    let depth = 1;
    let i = openBrace + 1;
    while (i < pvpSrc.length && depth > 0) {
        const ch = pvpSrc[i];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        i++;
    }
    const handlerTorzs = pvpSrc.substring(openBrace + 1, i - 1);

    test('rejoin within grace: clearTimeout(jatek.disconnectTimer)', () => {
        expect(handlerTorzs).toMatch(/clearTimeout\s*\(\s*jatek\.disconnectTimer/);
    });

    test('rejoin within grace: emit chess:opponent:reconnected az ellenfelnek', () => {
        expect(handlerTorzs).toMatch(/emit\(['"]chess:opponent:reconnected['"]/);
    });

    test('rejoin within grace: socket.join(`chess-game:${gameId}`) ujra-szobazas', () => {
        expect(handlerTorzs).toMatch(/socket\.join\(`chess-game:\$\{gameId\}`\)/);
    });

    test('rejoin within grace: emit chess:game:start a teljes allapot-tal', () => {
        expect(handlerTorzs).toMatch(/emit\(['"]chess:game:start['"]/);
        expect(handlerTorzs).toMatch(/jatekAllapotKliens\s*\(\s*jatek\s*\)/);
    });
});

describe('backend pvp.js — POST-GRACE rejoin (60s lejart) chess:game:end-et kuld', () => {
    test('jatekVegeKezeles tarolja a vegeUzenet + vegeEredmeny mezoket', () => {
        const torzs = extractFunctionBody(pvpSrc, 'async function jatekVegeKezeles(');
        expect(torzs).toMatch(/jatek\.vegeUzenet\s*=/);
        expect(torzs).toMatch(/jatek\.vegeEredmeny\s*=/);
    });

    test('chess:rejoin handler vege-allapotban game:end-et emit-el (NEM rejoin:none)', () => {
        const startIdx = pvpSrc.indexOf("socket.on('chess:rejoin'");
        const arrowOpen = pvpSrc.indexOf('=>', startIdx);
        const openBrace = pvpSrc.indexOf('{', arrowOpen);
        let depth = 1;
        let i = openBrace + 1;
        while (i < pvpSrc.length && depth > 0) {
            const ch = pvpSrc[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        const torzs = pvpSrc.substring(openBrace + 1, i - 1);
        // A vege-aganak game:end emit-et kell tartalmaznia a tarolt vege-uzenettel.
        expect(torzs).toMatch(/jatek\.vege\s*\|\|\s*!jatek\.pvpAktiv/);
        expect(torzs).toMatch(/emit\(['"]chess:game:end['"]/);
        expect(torzs).toMatch(/jatek\.vegeUzenet/);
        expect(torzs).toMatch(/jatek\.vegeEredmeny/);
    });

    test('post-grace emit `postGraceRejoin: true` + `sajatSzin` mezoket tartalmaz', () => {
        // A frontend chess:game:end handler-e ezekkel jelzi, hogy a felhasznalo
        // pvpAktiv === false allapotban van, de meg kell mutatnia a vereseget.
        expect(pvpSrc).toMatch(/postGraceRejoin\s*:\s*true/);
        // sajatSzin a getUserColorInGame eredmenye, beallitott szin az emit-en
        const startIdx = pvpSrc.indexOf("socket.on('chess:rejoin'");
        const arrowOpen = pvpSrc.indexOf('=>', startIdx);
        const openBrace = pvpSrc.indexOf('{', arrowOpen);
        let depth = 1;
        let i = openBrace + 1;
        while (i < pvpSrc.length && depth > 0) {
            const ch = pvpSrc[i];
            if (ch === '{') depth++;
            else if (ch === '}') depth--;
            i++;
        }
        const torzs = pvpSrc.substring(openBrace + 1, i - 1);
        expect(torzs).toMatch(/sajatSzin\s*:\s*szin/);
    });
});

describe('frontend main.js — post-grace rejoin -> game-end modal megnyitas', () => {
    test('chess:game:end handler kezeli a postGraceRejoin esetet (pvpAktiv=false)', () => {
        // A handler regex-keresese: a `postGraceRejoin` flag-et olvasni kell.
        expect(mainJs).toMatch(/postGraceRejoin/);
    });

    test('post-grace rejoin: pvpAktiv = true beallitas, sajatSzin = data.sajatSzin', () => {
        // A bug-fix kulcsa: ha a felhasznalo nem fogadta meg game:start-ot
        // (post-grace), de game:end jott, akkor minimal state-et kell beallitani
        // hogy a pvpJatekVege megfelelo ELO-t mutasson.
        const idx = mainJs.indexOf('postGraceRejoin');
        expect(idx).toBeGreaterThan(-1);
        const tartomany = mainJs.substring(idx, Math.min(idx + 800, mainJs.length));
        expect(tartomany).toMatch(/pvpAktiv\s*=\s*true/);
        expect(tartomany).toMatch(/sajatSzin\s*=\s*data\.sajatSzin/);
    });

    test('post-grace rejoin: rejoinOverlayElrejt() es chooser zarasa', () => {
        const idx = mainJs.indexOf('postGraceRejoin');
        const tartomany = mainJs.substring(idx, Math.min(idx + 800, mainJs.length));
        expect(tartomany).toMatch(/rejoinOverlayElrejt\s*\(/);
        // Chooser close defensive
        expect(tartomany).toMatch(/MattMesterChessModeChooser[\s\S]*?\.close/);
    });
});

describe('integracios szimulacio: 60s grace lifecycle', () => {
    // Unit-szintu szimulacio: aktivaljuk a state.js-t, letrehozunk egy meccset,
    // majd a handlePvpDisconnect-szeru flow-t kovetjuk. Mivel a tenyleges io es
    // socket-ek nem trivialisak, a kritikus mezoket allitjuk be manualisan es
    // ellenoorizzuk a fenti modul-szintu mezo-jelenleteket.

    const { jatekLetrehoz, jatekTorol } = require('../chess/state.js');
    const { jatekUjraIndit } = require('../chess/engine.js');

    test('uj jatek nem rendelkezik vegeUzenet / vegeEredmeny mezoval (alapertek)', () => {
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        expect(jatek.vege).toBe(false);
        // Ezek a mezok majd a jatekVegeKezeles-ben kapnak ertekeket.
        expect(jatek.vegeUzenet).toBeUndefined();
        expect(jatek.vegeEredmeny).toBeUndefined();
        jatekTorol(gameId);
    });

    test('disconnect timer-mezo letezik a state-ben (handlePvpDisconnect ezt allitja be)', () => {
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        // disconnectTimer + disconnectSzin az alap state-ben null
        expect(jatek.disconnectTimer).toBeNull();
        expect(jatek.disconnectSzin).toBeNull();
        jatekTorol(gameId);
    });

    test('jatekTorol cleartimeoutolja a disconnectTimer-t (no leak)', () => {
        const { gameId, jatek } = jatekLetrehoz({ mode: 'klasszikus' });
        jatekUjraIndit(jatek);
        // Allitsunk be egy mock timer-t
        let cleared = false;
        const fakeTimer = setTimeout(() => {}, 99999);
        jatek.disconnectTimer = fakeTimer;
        jatekTorol(gameId);
        // jatekTorol clearTimeout-ot kell hivjon — verifikalas a state.js olvasasaval
        const stateSrc = fs.readFileSync(path.resolve(__dirname, '..', 'chess', 'state.js'), 'utf8');
        expect(stateSrc).toMatch(/clearTimeout\s*\(\s*jatek\.disconnectTimer\s*\)/);
        clearTimeout(fakeTimer);
    });
});
