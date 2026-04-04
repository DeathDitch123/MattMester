// ============================================================
// CHESS LOGIKA — Szerver-oldali sakkszabály-motor
// ============================================================
// A frontend logika.js 1:1 másolata, VÁLTOZÁSOK:
//   - import/export → require/module.exports (CommonJS)
//   - Globális `jatek` → explicit `jatek` paraméter minden függvényben
//   - mezoKeres(x,y) → mezoKeres(jatek, x, y)  (state.js-ből)
//   - Nincs DOM referencia
// ============================================================

const { mezoKeres } = require('./state.js');

// ============================================================
// POZÍCIÓ HASH (háromszori ismétlés ellenőrzéshez)
// ============================================================

/**
 * Egyedi string hash a tábla aktuális pozíciójáról.
 * Tartalmazza: bábuk helyzete + körön lévő + en passant + sáncolási jogok.
 */
function pozicioHash(jatek) {
    let hash = '';
    for (let i = 0; i < 64; i++) {
        const m = jatek.tabla[i];
        if (m.piece) {
            hash += m.piece.color[0] + m.piece.type[0] + i + ',';
        }
    }
    hash += jatek.koronLevo[0];
    if (jatek.enPassant) hash += 'e' + jatek.enPassant.x + jatek.enPassant.y;
    // Sáncolási jogok
    for (const szin of ['white', 'black']) {
        const sor = szin === 'white' ? 7 : 0;
        const king = jatek.tabla[sor * 8 + 4];
        if (king.piece?.type === 'king' && !king.piece.hasMoved) {
            const rookK = jatek.tabla[sor * 8 + 7];
            if (rookK.piece?.type === 'rook' && !rookK.piece.hasMoved) hash += szin[0] + 'K';
            const rookQ = jatek.tabla[sor * 8 + 0];
            if (rookQ.piece?.type === 'rook' && !rookQ.piece.hasMoved) hash += szin[0] + 'Q';
        }
    }
    return hash;
}

// ============================================================
// SEGÉDFÜGGVÉNYEK
// ============================================================

/**
 * Megpróbál egy mezőre lépni. Ha érvényes és nem saját bábu áll ott,
 * hozzáadja a lépéslistához.
 * Visszatér: true ha tovább lehet haladni, false ha megállás.
 */
function lepesProba(jatek, tx, ty, lepesek, babu) {
    const cel = mezoKeres(jatek, tx, ty);
    if (!cel) return false;

    if (cel.piece) {
        if (cel.piece.color !== babu.color) {
            lepesek.push({ from: babu.square, to: cel, capture: true });
        }
        return false;
    }

    lepesek.push({ from: babu.square, to: cel, capture: false });
    return true;
}

/**
 * Megvizsgálja, hogy egy adott mező támadott-e az ellenfél által.
 */
function mezoTamadva(jatek, x, y, tamadoSzin) {
    for (const mezo of jatek.tabla) {
        const b = mezo.piece;
        if (!b || b.color !== tamadoSzin) continue;

        // Gyalog: csak átlósan támad
        if (b.type === "pawn") {
            const irany = (b.color === "white") ? -1 : 1;
            if (mezo.x - 1 === x && mezo.y + irany === y) return true;
            if (mezo.x + 1 === x && mezo.y + irany === y) return true;
            continue;
        }

        // Huszár
        if (b.type === "knight") {
            const ugrasok = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
            if (ugrasok.some(([dx, dy]) => mezo.x + dx === x && mezo.y + dy === y)) return true;
            continue;
        }

        // Futó és vezér átlós irányai
        if (b.type === "bishop" || b.type === "queen") {
            const iranyok = [[1,1],[1,-1],[-1,1],[-1,-1]];
            for (const [dx, dy] of iranyok) {
                for (let j = 1; j < 8; j++) {
                    const nx = mezo.x + dx * j;
                    const ny = mezo.y + dy * j;
                    if (nx === x && ny === y) return true;
                    const kozbulso = mezoKeres(jatek, nx, ny);
                    if (!kozbulso) break;
                    if (kozbulso.piece) break;
                }
            }
        }

        // Bástya és vezér egyenes irányai
        if (b.type === "rook" || b.type === "queen") {
            const iranyok = [[1,0],[-1,0],[0,1],[0,-1]];
            for (const [dx, dy] of iranyok) {
                for (let j = 1; j < 8; j++) {
                    const nx = mezo.x + dx * j;
                    const ny = mezo.y + dy * j;
                    if (nx === x && ny === y) return true;
                    const kozbulso = mezoKeres(jatek, nx, ny);
                    if (!kozbulso) break;
                    if (kozbulso.piece) break;
                }
            }
        }

        // Király (1 mező minden irányba)
        if (b.type === "king") {
            if (Math.abs(mezo.x - x) <= 1 && Math.abs(mezo.y - y) <= 1) return true;
        }
    }
    return false;
}

// ============================================================
// PSEUDO-LEGAL LÉPÉSGENERÁLÁS (sakk-ellenőrzés nélkül)
// ============================================================

function lehetsLepSzamit(jatek, babu, sakkEllen) {
    let lepesek = [];
    const x = babu.square.x;
    const y = babu.square.y;

    // --- GYALOG ---
    if (babu.type === "pawn") {
        const irany = (babu.color === "white") ? -1 : 1;
        const kezdosor = (babu.color === "white") ? 6 : 1;

        const elore1 = mezoKeres(jatek, x, y + irany);
        if (elore1 && !elore1.piece) {
            lepesek.push({ from: babu.square, to: elore1, capture: false });
            const elore2 = mezoKeres(jatek, x, y + irany * 2);
            if (y === kezdosor && elore2 && !elore2.piece) {
                lepesek.push({ from: babu.square, to: elore2, capture: false, special: "double" });
            }
        }

        for (const dx of [-1, 1]) {
            const cel = mezoKeres(jatek, x + dx, y + irany);
            if (!cel) continue;

            if (cel.piece && cel.piece.color !== babu.color) {
                lepesek.push({ from: babu.square, to: cel, capture: true });
            }

            if (jatek.enPassant && cel.x === jatek.enPassant.x && cel.y === jatek.enPassant.y) {
                const utottMezo = mezoKeres(jatek, cel.x, y);
                lepesek.push({ from: babu.square, to: cel, capture: true, special: "enpassant", captured: utottMezo });
            }
        }
    }

    // --- HUSZÁR ---
    else if (babu.type === "knight") {
        for (const [dx, dy] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]) {
            lepesProba(jatek, x + dx, y + dy, lepesek, babu);
        }
    }

    // --- FUTÓ ---
    else if (babu.type === "bishop") {
        for (const [dx, dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
            for (let j = 1; j < 8; j++) {
                if (!lepesProba(jatek, x + dx * j, y + dy * j, lepesek, babu)) break;
            }
        }
    }

    // --- BÁSTYA ---
    else if (babu.type === "rook") {
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            for (let j = 1; j < 8; j++) {
                if (!lepesProba(jatek, x + dx * j, y + dy * j, lepesek, babu)) break;
            }
        }
    }

    // --- VEZÉR ---
    else if (babu.type === "queen") {
        for (const [dx, dy] of [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]) {
            for (let j = 1; j < 8; j++) {
                if (!lepesProba(jatek, x + dx * j, y + dy * j, lepesek, babu)) break;
            }
        }
    }

    // --- KIRÁLY ---
    else if (babu.type === "king") {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                lepesProba(jatek, x + dx, y + dy, lepesek, babu);
            }
        }

        // Sáncolás
        if (!sakkEllen && !babu.hasMoved) {
            const hazSor = (babu.color === "white") ? 7 : 0;
            const ellenfel = (babu.color === "white") ? "black" : "white";

            // Királyoldali (rövid)
            const bastyaJ = mezoKeres(jatek, 7, hazSor);
            if (bastyaJ?.piece?.type === "rook" && !bastyaJ.piece.hasMoved) {
                const f = mezoKeres(jatek, 5, hazSor), g = mezoKeres(jatek, 6, hazSor);
                if (f && g && !f.piece && !g.piece &&
                    !mezoTamadva(jatek, 5, hazSor, ellenfel) &&
                    !mezoTamadva(jatek, 6, hazSor, ellenfel)) {
                    lepesek.push({
                        from: babu.square, to: g, special: "castle-ks",
                        rookFrom: bastyaJ, rookTo: f
                    });
                }
            }

            // Vezéroldali (hosszú)
            const bastyaB = mezoKeres(jatek, 0, hazSor);
            if (bastyaB?.piece?.type === "rook" && !bastyaB.piece.hasMoved) {
                const b = mezoKeres(jatek, 1, hazSor), c = mezoKeres(jatek, 2, hazSor), d = mezoKeres(jatek, 3, hazSor);
                if (b && c && d && !b.piece && !c.piece && !d.piece &&
                    !mezoTamadva(jatek, 3, hazSor, ellenfel) &&
                    !mezoTamadva(jatek, 2, hazSor, ellenfel)) {
                    lepesek.push({
                        from: babu.square, to: c, special: "castle-qs",
                        rookFrom: bastyaB, rookTo: d
                    });
                }
            }
        }
    }

    return lepesek;
}

// ============================================================
// LEGÁLIS LÉPÉSSZŰRÉS (sakk-ellenőrzéssel)
// ============================================================

/**
 * Ideiglenesen végrehajt egy lépést, meghívja a callback-et, majd visszavonja.
 */
function ideigLepes(lepes, callback) {
    const { from, to, special } = lepes;
    const mozgoBabu = from.piece;
    const eredetiTo = to.piece;

    from.piece = null;
    to.piece = mozgoBabu;
    mozgoBabu.square = to;

    let utottMezo = null;
    let utottBabu = null;

    if (special === "enpassant" && lepes.captured) {
        utottMezo = lepes.captured;
        utottBabu = utottMezo.piece;
        utottMezo.piece = null;
    }

    const eredmeny = callback();

    from.piece = mozgoBabu;
    mozgoBabu.square = from;
    to.piece = eredetiTo;

    if (utottMezo) utottMezo.piece = utottBabu;

    return eredmeny;
}

/**
 * Megkeresi a király pozícióját a táblán.
 */
function kiralyKeres(jatek, szin) {
    return jatek.tabla.find(m => m.piece?.type === "king" && m.piece.color === szin);
}

/**
 * Visszaadja az összes LEGÁLIS lépést egy bábuhoz.
 */
function szabLepKeres(jatek, babu) {
    const ellenfel = (babu.color === "white") ? "black" : "white";
    const kiralyMezo = kiralyKeres(jatek, babu.color);
    const sakkban = kiralyMezo ? mezoTamadva(jatek, kiralyMezo.x, kiralyMezo.y, ellenfel) : false;

    const pseudoLepesek = lehetsLepSzamit(jatek, babu, sakkban);

    return pseudoLepesek.filter(lepes => {
        return ideigLepes(lepes, () => {
            const ujKiralyMezo = kiralyKeres(jatek, babu.color);
            if (!ujKiralyMezo) return false;
            return !mezoTamadva(jatek, ujKiralyMezo.x, ujKiralyMezo.y, ellenfel);
        });
    });
}

// ============================================================
// JÁTÉKÁLLAPOT ELLENŐRZÉS
// ============================================================

/**
 * Nincs-e egyetlen legális lépése sem az adott színnek?
 */
function nincsMozgas(jatek, szin) {
    return jatek.tabla
        .filter(m => m.piece?.color === szin)
        .every(m => szabLepKeres(jatek, m.piece).length === 0);
}

/**
 * Elégtelen anyag ellenőrzés — egyik fél sem tud mattot adni.
 * Döntetlen esetek: K vs K, K+B vs K, K+N vs K, K+B vs K+B (azonos színű futók).
 */
function elegtelenAnyag(jatek) {
    const feher = [];
    const fekete = [];

    for (let i = 0; i < jatek.tabla.length; i++) {
        const b = jatek.tabla[i].piece;
        if (!b) continue;
        if (b.color === "white") feher.push(b);
        else fekete.push(b);
    }

    // Király mindig van, szóval min 1-1
    if (feher.length > 3 || fekete.length > 3) return false;

    const nemKiraly = (lista) => lista.filter(b => b.type !== "king");
    const fExtra = nemKiraly(feher);
    const kExtra = nemKiraly(fekete);

    // K vs K
    if (fExtra.length === 0 && kExtra.length === 0) return true;

    // K+B vs K vagy K+N vs K
    if (fExtra.length === 0 && kExtra.length === 1 && (kExtra[0].type === "bishop" || kExtra[0].type === "knight")) return true;
    if (kExtra.length === 0 && fExtra.length === 1 && (fExtra[0].type === "bishop" || fExtra[0].type === "knight")) return true;

    // K+B vs K+B — azonos színű futók
    if (fExtra.length === 1 && kExtra.length === 1 && fExtra[0].type === "bishop" && kExtra[0].type === "bishop") {
        const fMezo = fExtra[0].square;
        const kMezo = kExtra[0].square;
        if ((fMezo.x + fMezo.y) % 2 === (kMezo.x + kMezo.y) % 2) return true;
    }

    return false;
}

/**
 * Ellenőrzi a játék végét: matt, patt, 50 lépés szabály, elégtelen anyag, háromszori ismétlés.
 */
function jatekAllapotEllenor(jatek, szin) {
    const ellenfel = (szin === "white") ? "black" : "white";
    const kiralyMezo = kiralyKeres(jatek, szin);
    const sakkban = kiralyMezo ? mezoTamadva(jatek, kiralyMezo.x, kiralyMezo.y, ellenfel) : false;

    if (nincsMozgas(jatek, szin)) {
        if (sakkban) return { vege: true, ok: "matt", nyertes: ellenfel };
        else         return { vege: true, ok: "patt" };
    }

    if (jatek.felLepes >= 100) return { vege: true, ok: "50lepes" };
    if (elegtelenAnyag(jatek)) return { vege: true, ok: "anyaghiany" };

    // Háromszori ismétlés
    if (jatek.pozicioTortenet && jatek.pozicioTortenet.length > 0) {
        const aktualisHash = pozicioHash(jatek);
        let szamlalo = 0;
        for (let i = 0; i < jatek.pozicioTortenet.length; i++) {
            if (jatek.pozicioTortenet[i] === aktualisHash) szamlalo++;
            if (szamlalo >= 3) return { vege: true, ok: "haromszor" };
        }
    }

    return { vege: false, sakkban };
}

module.exports = {
    mezoTamadva,
    lehetsLepSzamit,
    szabLepKeres,
    jatekAllapotEllenor,
    pozicioHash
};
