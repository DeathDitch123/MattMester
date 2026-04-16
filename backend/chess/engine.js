// ============================================================
// CHESS ENGINE — Szerver-oldali játékmotor
// ============================================================
// A frontend engine.js 1:1 logikája, VÁLTOZÁSOK:
//   - Nincs UI hívás (tablaRajzol, uiFrissitIdo, stb.)
//   - Minden függvény explicit `jatek` paramétert kap
//   - DB mentés: lépéstörténet → moves tábla, játékvége → games tábla
//   - idoFut/idoLeall → timer.js (backend)
//   - CommonJS module
// ============================================================

const { mezoKeres, jatekAllapotKliens } = require('./state.js');
const { jatekAllapotEllenor, szabLepKeres, pozicioHash } = require('./logika.js');
const { idoFut, idoLeall } = require('./timer.js');
const chessSql = require('./chess_sql_functions.js');

/**
 * Játék újraindítása (vagy inicializálás).
 * Visszaadja a kliens-biztonságos állapotot.
 */
function jatekUjraIndit(jatek) {
    idoLeall(jatek);
    jatek.tabla = [];
    jatek.koronLevo = "white";
    jatek.vege = false;
    jatek.enPassant = null;
    jatek.utolsoLepes = null;
    jatek.atvaltozasVar = null;
    jatek.lepesszam = 0;
    jatek.felLepes = 0;
    jatek.lepesTortenet = [];
    jatek.pozicioTortenet = [];
    jatek.eloValtozas = null;
    jatek.jatekosok.white.ido = 600;
    jatek.jatekosok.black.ido = 600;

    // Tábla generálása 8x8
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            jatek.tabla.push({
                x, y,
                pos: `${String.fromCharCode(97 + x)}${8 - y}`,
                piece: null
            });
        }
    }

    alapfelallasHelyez(jatek);
    jatek.pozicioTortenet.push(pozicioHash(jatek)); // kezdőállás hash
    idoFut(jatek, jatek.koronLevo);

    return jatekAllapotKliens(jatek);
}

/**
 * Bábuk alapfelállása.
 */
function alapfelallasHelyez(jatek) {
    const sorrend = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

    for (let x = 0; x < 8; x++) {
        mezoKeres(jatek, x, 1).piece = { type: "pawn", color: "black", hasMoved: false };
        mezoKeres(jatek, x, 6).piece = { type: "pawn", color: "white", hasMoved: false };
        mezoKeres(jatek, x, 0).piece = { type: sorrend[x], color: "black", hasMoved: false };
        mezoKeres(jatek, x, 7).piece = { type: sorrend[x], color: "white", hasMoved: false };
    }

    jatek.tabla.forEach(m => { if (m.piece) m.piece.square = m; });
}

/**
 * Lépés végrehajtása a szerveren.
 * @param {object} jatek - a játék objektum
 * @param {object} babu - a lépő bábu (referencia a tábláról)
 * @param {object} lepes - a lépés objektum (from, to, special, stb.)
 * @param {string} atvalTipus - átváltozás típusa ('queen'|'rook'|'bishop'|'knight')
 * @returns {object} { allapot, uzenet? } - kliens-biztonságos állapot + opcionális üzenet
 */
async function lepesHajt(jatek, babu, lepes, atvalTipus = "queen") {
    const { from, to, special } = lepes;

    // --- Lépéstörténetbe mentés ---
    jatek.lepesTortenet.push({
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        piece: babu.type,
        color: babu.color,
        captured: to.piece ? to.piece.type : null,
        special: special || null,
        enPassantElotte: jatek.enPassant ? { ...jatek.enPassant } : null
    });

    // --- Féllépes számláló (50 lépés szabály) ---
    if (babu.type === "pawn" || to.piece) {
        jatek.felLepes = 0;
    } else {
        jatek.felLepes++;
    }

    // Ütés volt-e (DB-hez kell)
    const voltUtes = !!(to.piece || special === "enpassant");

    // --- En passant mező frissítése ---
    if (special === "double") {
        const irany = (babu.color === "white") ? -1 : 1;
        jatek.enPassant = { x: from.x, y: from.y + irany };
    } else {
        jatek.enPassant = null;
    }

    // --- SPECIÁLIS LÉPÉSEK VÉGREHAJTÁSA ---

    // Sáncolás
    if (special === "castle-ks" || special === "castle-qs") {
        const rook = lepes.rookFrom.piece;
        lepes.rookTo.piece = rook;
        rook.square = lepes.rookTo;
        rook.hasMoved = true;
        lepes.rookFrom.piece = null;
    }

    // En passant
    if (special === "enpassant" && lepes.captured) {
        lepes.captured.piece = null;
    }

    // --- MOZGATÁS ---
    const eredetiTipus = babu.type; // átváltozás előtti típus (DB-hez)
    from.piece = null;
    to.piece = babu;
    babu.square = to;
    babu.hasMoved = true;

    // --- Gyalogátváltozás ---
    let promotionPiece = null;
    if (babu.type === "pawn" && (to.y === 0 || to.y === 7)) {
        babu.type = atvalTipus;
        promotionPiece = atvalTipus;
    }

    // --- Lépésszám növelés ---
    jatek.lepesszam++;
    jatek.utolsoLepes = lepes;

    // --- Játékosváltás és óra ---
    const lepettSzin = babu.color;
    jatek.koronLevo = (jatek.koronLevo === "white") ? "black" : "white";
    idoFut(jatek, jatek.koronLevo);

    // --- Pozíció hash mentés (háromszori ismétlés) ---
    jatek.pozicioTortenet.push(pozicioHash(jatek));

    // --- Játékállapot ellenőrzés ---
    const allapot = jatekAllapotEllenor(jatek, jatek.koronLevo);
    let uzenet = null;

    if (allapot.vege) {
        jatek.vege = true;
        idoLeall(jatek);
        if (allapot.ok === "matt")           uzenet = `${jatek.koronLevo} matt — ${allapot.nyertes} nyert`;
        else if (allapot.ok === "patt")      uzenet = "Döntetlen (Stalemate)";
        else if (allapot.ok === "50lepes")   uzenet = "50 lépés szabály — Döntetlen.";
        else if (allapot.ok === "anyaghiany") uzenet = "Döntetlen (elégtelen anyag).";
        else if (allapot.ok === "haromszor")  uzenet = "Döntetlen (háromszori ismétlés).";
    }

    // --- DB MENTÉS (nem blokkolja a kliensválaszt) ---
    if (jatek.dbGameId) {
        const dbGameId = jatek.dbGameId;
        const playerId = jatek.jatekosok[lepettSzin].userId || null;
        const moveNumber = jatek.lepesszam;
        const fromPos = from.pos;
        const toPos = to.pos;
        const isCheck = !!(allapot.sakkban);
        const isCheckmate = allapot.ok === "matt";
        const vege = allapot.vege;
        const allapotOk = allapot.ok;
        const nyertesSzin = allapot.nyertes;

        (async () => {
            try {
                await chessSql.lepesMentDb({
                    gameId: dbGameId,
                    playerId,
                    moveNumber,
                    piece: eredetiTipus,
                    fromPos,
                    toPos,
                    isCapture: voltUtes,
                    isCheck,
                    isCheckmate,
                    promotionPiece
                });

                if (vege) {
                    if (allapotOk === "matt") {
                        const winnerId = jatek.jatekosok[nyertesSzin]?.userId || null;
                        await chessSql.jatekVegeMentDb(dbGameId, winnerId, 'finished');

                        if (winnerId) {
                            const vesztesSzin = (nyertesSzin === "white") ? "black" : "white";
                            const vesztesId = jatek.jatekosok[vesztesSzin]?.userId;
                            await chessSql.gyozelemMentDb(winnerId);
                            if (vesztesId) await chessSql.veresegMentDb(vesztesId);
                        }
                    } else {
                        // Döntetlen: patt, 50 lépés, elégtelen anyag, háromszori ismétlés
                        await chessSql.jatekVegeMentDb(dbGameId, null, 'draw');
                        const whiteId = jatek.jatekosok.white?.userId;
                        const blackId = jatek.jatekosok.black?.userId;
                        if (whiteId) await chessSql.dontetlenMentDb(whiteId);
                        if (blackId) await chessSql.dontetlenMentDb(blackId);
                    }
                }
            } catch (dbErr) {
                console.error('Chess DB mentési hiba:', dbErr);
            }
        })();
    }

    return {
        allapot: jatekAllapotKliens(jatek),
        uzenet
    };
}

/**
 * Legális lépések lekérdezése egy adott mezőn álló bábuhoz.
 * Ezt hívja az API amikor a kliens megragad egy bábut.
 * Visszaadja a célmezők koordinátáit + típusát (move/capture/castle/enpassant/promotion).
 */
function legalLepesekKliens(jatek, x, y) {
    const mezo = mezoKeres(jatek, x, y);
    if (!mezo || !mezo.piece) return [];
    if (mezo.piece.color !== jatek.koronLevo) return [];

    const lepesek = szabLepKeres(jatek, mezo.piece);

    return lepesek.map(l => {
        let tipus = "move";
        if (l.special === "enpassant") tipus = "enpassant";
        else if (l.special === "castle-ks" || l.special === "castle-qs") tipus = "castle";
        else if (l.capture) tipus = "capture";

        // Átváltozás jelzés
        let promotion = false;
        if (mezo.piece.type === "pawn") {
            const utSor = (mezo.piece.color === "white") ? 0 : 7;
            if (l.to.y === utSor) promotion = true;
        }

        return {
            toX: l.to.x,
            toY: l.to.y,
            tipus,
            promotion
        };
    });
}

/**
 * Lépés végrehajtás koordináták alapján (API hívja).
 * A kliens elküldi: honnan (fromX, fromY), hova (toX, toY), átváltozás típusa.
 * A szerver megkeresi a megfelelő legális lépést és végrehajtja.
 * @returns {object} { success, allapot?, uzenet?, error? }
 */
async function lepesKoordinataval(jatek, fromX, fromY, toX, toY, atvalTipus = "queen") {
    if (jatek.vege) return { success: false, error: "A játék véget ért." };

    const mezo = mezoKeres(jatek, fromX, fromY);
    if (!mezo || !mezo.piece) return { success: false, error: "Nincs bábu ezen a mezőn." };

    const babu = mezo.piece;
    if (babu.color !== jatek.koronLevo) return { success: false, error: "Nem te jössz." };

    const lepesek = szabLepKeres(jatek, babu);
    const celMezo = mezoKeres(jatek, toX, toY);
    if (!celMezo) return { success: false, error: "Érvénytelen célmező." };

    const talaltLepes = lepesek.find(l => l.to === celMezo);
    if (!talaltLepes) return { success: false, error: "Illegális lépés." };

    // Átváltozás: gyalog az utolsó sorba lép
    if (babu.type === "pawn") {
        const utSor = (babu.color === "white") ? 0 : 7;
        if (celMezo.y === utSor) {
            const engedelyezett = ["queen", "rook", "bishop", "knight"];
            if (!engedelyezett.includes(atvalTipus)) {
                atvalTipus = "queen";
            }
        }
    }

    const eredmeny = await lepesHajt(jatek, babu, talaltLepes, atvalTipus);
    return { success: true, ...eredmeny };
}

module.exports = {
    jatekUjraIndit,
    lepesHajt,
    legalLepesekKliens,
    lepesKoordinataval
};
