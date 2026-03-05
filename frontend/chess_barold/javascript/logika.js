import { jatek, mezoKeres } from './state.js';

// ============================================================
// SEGÉDFÜGGVÉNYEK
// ============================================================

/**
 * Megpróbál egy mezőre lépni. Ha érvényes és nem saját bábu áll ott,
 * hozzáadja a lépéslistához.
 * Visszatér: true, ha tovább lehet haladni az irányban (nem ütöttünk és nem fal)
 *            false, ha meg kell állni (ütés történt vagy fal)
 */
function lepesProba(tx, ty, lepesek, babu) {
    const cel = mezoKeres(tx, ty);
    if (!cel) return false; // tábla széle

    if (cel.piece) {
        if (cel.piece.color !== babu.color) {
            // Ellenfél bábu: ütés, de utána megállunk
            lepesek.push({ from: babu.square, to: cel, capture: true });
        }
        return false; // saját bábu vagy ütés után megállunk
    }

    lepesek.push({ from: babu.square, to: cel, capture: false });
    return true; // szabad mező, mehet tovább
}

/**
 * Megvizsgálja, hogy egy adott mező támadott-e az ellenfél által.
 * Ezt a király lépés- és sáncolás-validációhoz használjuk.
 */
export function mezoTamadva(x, y, tamadoSzin) {
    for (const mezo of jatek.tabla) {
        const b = mezo.piece;
        if (!b || b.color !== tamadoSzin) continue;

        // Gyalog: csak átlósan támad (előre az ő irányában)
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
                    if (nx === x && ny === y) { return true; }
                    const kozbulso = mezoKeres(nx, ny);
                    if (!kozbulso) break;
                    if (kozbulso.piece) break; // takarás
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
                    if (nx === x && ny === y) { return true; }
                    const kozbulso = mezoKeres(nx, ny);
                    if (!kozbulso) break;
                    if (kozbulso.piece) break; // takarás
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

export function lehetsLepSzamit(babu, sakkEllen) {
    let lepesek = [];
    const x = babu.square.x;
    const y = babu.square.y;

    // --- GYALOG ---
    if (babu.type === "pawn") {
        const irany = (babu.color === "white") ? -1 : 1;
        const kezdosor = (babu.color === "white") ? 6 : 1;

        // Előre 1
        const elore1 = mezoKeres(x, y + irany);
        if (elore1 && !elore1.piece) {
            lepesek.push({ from: babu.square, to: elore1, capture: false });
            // Dupla lépés kezdősorból
            const elore2 = mezoKeres(x, y + irany * 2);
            if (y === kezdosor && elore2 && !elore2.piece) {
                lepesek.push({ from: babu.square, to: elore2, capture: false, special: "double" });
            }
        }

        // Átlós ütés + en passant
        for (const dx of [-1, 1]) {
            const cel = mezoKeres(x + dx, y + irany);
            if (!cel) continue;

            // Normál ütés
            if (cel.piece && cel.piece.color !== babu.color) {
                lepesek.push({ from: babu.square, to: cel, capture: true });
            }

            // En passant
            if (jatek.enPassant && cel.x === jatek.enPassant.x && cel.y === jatek.enPassant.y) {
                const utottMezo = mezoKeres(cel.x, y); // az ütött gyalog az aktuális sorban van
                lepesek.push({ from: babu.square, to: cel, capture: true, special: "enpassant", captured: utottMezo });
            }
        }
    }

    // --- HUSZÁR ---
    else if (babu.type === "knight") {
        for (const [dx, dy] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]) {
            lepesProba(x + dx, y + dy, lepesek, babu);
        }
    }

    // --- FUTÓ ---
    else if (babu.type === "bishop") {
        for (const [dx, dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
            for (let j = 1; j < 8; j++) {
                if (!lepesProba(x + dx * j, y + dy * j, lepesek, babu)) break;
            }
        }
    }

    // --- BÁSTYA ---
    else if (babu.type === "rook") {
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            for (let j = 1; j < 8; j++) {
                if (!lepesProba(x + dx * j, y + dy * j, lepesek, babu)) break;
            }
        }
    }

    // --- VEZÉR ---
    else if (babu.type === "queen") {
        for (const [dx, dy] of [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]) {
            for (let j = 1; j < 8; j++) {
                if (!lepesProba(x + dx * j, y + dy * j, lepesek, babu)) break;
            }
        }
    }

    // --- KIRÁLY ---
    else if (babu.type === "king") {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                lepesProba(x + dx, y + dy, lepesek, babu);
            }
        }

        // Sáncolás: csak ha nincs sakkban és a király még nem lépett
        if (!sakkEllen && !babu.hasMoved) {
            const hazSor = (babu.color === "white") ? 7 : 0;
            const ellenfél = (babu.color === "white") ? "black" : "white";

            // Királyoldali sáncolás (rövid)
            const bastyaJ = mezoKeres(7, hazSor);
            if (bastyaJ?.piece?.type === "rook" && !bastyaJ.piece.hasMoved) {
                const f = mezoKeres(5, hazSor), g = mezoKeres(6, hazSor);
                if (f && g && !f.piece && !g.piece &&
                    !mezoTamadva(5, hazSor, ellenfél) &&
                    !mezoTamadva(6, hazSor, ellenfél)) {
                    lepesek.push({
                        from: babu.square, to: g, special: "castle-ks",
                        rookFrom: bastyaJ, rookTo: f
                    });
                }
            }

            // Vezéroldali sáncolás (hosszú)
            const bastyaB = mezoKeres(0, hazSor);
            if (bastyaB?.piece?.type === "rook" && !bastyaB.piece.hasMoved) {
                const b = mezoKeres(1, hazSor), c = mezoKeres(2, hazSor), d = mezoKeres(3, hazSor);
                if (b && c && d && !b.piece && !c.piece && !d.piece &&
                    !mezoTamadva(3, hazSor, ellenfél) &&
                    !mezoTamadva(2, hazSor, ellenfél)) {
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
 * Ideiglenesen végrehajt egy lépést a táblán,
 * meghívja a callback-et, majd visszavonja.
 */
function ideigLepes(lepes, callback) {
    const { from, to, special } = lepes;
    const mozgoBabu = from.piece;
    const eredetiTo = to.piece;

    // Lépés végrehajtása
    from.piece = null;
    to.piece = mozgoBabu;
    mozgoBabu.square = to;

    let utottMezo = null;
    let utottBabu = null;

    // En passant: az ütött gyalog eltűnik a saját mezőjéről
    if (special === "enpassant" && lepes.captured) {
        utottMezo = lepes.captured;
        utottBabu = utottMezo.piece;
        utottMezo.piece = null;
    }

    const eredmeny = callback();

    // Visszavonás
    from.piece = mozgoBabu;
    mozgoBabu.square = from;
    to.piece = eredetiTo;

    if (utottMezo) utottMezo.piece = utottBabu;

    return eredmeny;
}

/**
 * Megkeresi a király pozícióját a táblán.
 */
function kiralyKeres(szin) {
    return jatek.tabla.find(m => m.piece?.type === "king" && m.piece.color === szin);
}

/**
 * Visszaadja az összes LEGÁLIS lépést egy bábuhoz
 * (azokat a pseudo-legal lépéseket, amelyek után nem marad sakkban a király).
 */
export function szabLepKeres(babu) {
    const ellenfél = (babu.color === "white") ? "black" : "white";
    const kiralyMezo = kiralyKeres(babu.color);
    const sakkban = kiralyMezo ? mezoTamadva(kiralyMezo.x, kiralyMezo.y, ellenfél) : false;

    const pseudoLepesek = lehetsLepSzamit(babu, sakkban);

    return pseudoLepesek.filter(lepes => {
        return ideigLepes(lepes, () => {
            // A lépés után hol van a király? (ha a király lépett, ő maga mozdult)
            const ujKiralyMezo = kiralyKeres(babu.color);
            if (!ujKiralyMezo) return false;
            return !mezoTamadva(ujKiralyMezo.x, ujKiralyMezo.y, ellenfél);
        });
    });
}

// ============================================================
// JÁTÉKÁLLAPOT ELLENŐRZÉS
// ============================================================

/**
 * Nincs-e egyetlen legális lépése sem az adott színnek?
 */
function nincsMozgas(szin) {
    return jatek.tabla
        .filter(m => m.piece?.color === szin)
        .every(m => szabLepKeres(m.piece).length === 0);
}

/**
 * Ellenőrzi a játék végét: matt, patt, 50 lépés szabály.
 * Visszatér: { vege: true, ok: "matt"|"patt"|"50lepes" } vagy { vege: false }
 */
export function jatekAllapotEllenor(szin) {
    const ellenfél = (szin === "white") ? "black" : "white";
    const kiralyMezo = kiralyKeres(szin);
    const sakkban = kiralyMezo ? mezoTamadva(kiralyMezo.x, kiralyMezo.y, ellenfél) : false;

    if (nincsMozgas(szin)) {
        if (sakkban) return { vege: true, ok: "matt", nyertes: ellenfél };
        else         return { vege: true, ok: "patt" };
    }

    if (jatek.felLepes >= 100) return { vege: true, ok: "50lepes" };

    return { vege: false, sakkban };
}