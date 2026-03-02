import { jatek, mezoKeres } from './state.js';

// ... (lepesProba, mezoTamadva és szabLepKeres marad az eredeti) ...

export function lehetsLepSzamit(babu, sakkEllen) {
    let lepesek = [];
    let x = babu.square.x;
    let y = babu.square.y;

    // --- GYALOG ---
    if (babu.type === "pawn") {
        let irany = (babu.color === "white") ? -1 : 1; // Fehér felfelé (-y), fekete lefelé (+y)
        let kezdosor = (babu.color === "white") ? 6 : 1;

        // 1. Előre lépés
        let elore1 = mezoKeres(x, y + irany);
        if (elore1 && !elore1.piece) {
            lepesek.push({ from: babu.square, to: elore1, capture: false });
            
            // Dupla lépés kezdőhelyzetből
            let elore2 = mezoKeres(x, y + (irany * 2));
            if (y === kezdosor && elore2 && !elore2.piece) {
                lepesek.push({ from: babu.square, to: elore2, capture: false, special: "double" });
            }
        }

        // 2. Átlós ütés
        let utesek = [[-1, irany], [1, irany]];
        for (let u of utesek) {
            let cel = mezoKeres(x + u[0], y + u[1]);
            if (cel && cel.piece && cel.piece.color !== babu.color) {
                lepesek.push({ from: babu.square, to: cel, capture: true });
            }
            
            // 3. EN PASSANT
            if (cel && jatek.enPassant && cel.x === jatek.enPassant.x && cel.y === jatek.enPassant.y && jatek.enPassant.color !== babu.color) {
                let utottGyalogMezo = mezoKeres(cel.x, y); // A gyalog az aktuális sorban van
                lepesek.push({ from: babu.square, to: cel, capture: true, special: "enpassant", captured: utottGyalogMezo });
            }
        }
    }

    // --- HUSZÁR ---
    else if (babu.type === "knight") {
        let ugrasok = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
        for (let u of ugrasok) {
            lepesProba(x + u[0], y + u[1], lepesek, babu);
        }
    }

    // --- FUTÓ ---
    else if (babu.type === "bishop") {
        let ir = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
        for (let i = 0; i < ir.length; i++) {
            for (let j = 1; j < 8; j++) {
                if (!lepesProba(x + ir[i][0] * j, y + ir[i][1] * j, lepesek, babu)) break;
            }
        }
    }

    // --- BÁSTYA ---
    else if (babu.type === "rook") {
        let ir = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let i = 0; i < ir.length; i++) {
            for (let j = 1; j < 8; j++) {
                if (!lepesProba(x + ir[i][0] * j, y + ir[i][1] * j, lepesek, babu)) break;
            }
        }
    }

    // --- VEZÉR ---
    else if (babu.type === "queen") {
        let ir = [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
        for (let i = 0; i < ir.length; i++) {
            for (let j = 1; j < 8; j++) {
                if (!lepesProba(x + ir[i][0] * j, y + ir[i][1] * j, lepesek, babu)) break;
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

        // SÁNColás (csak ha nincs sakkban és még nem lépett)
        if (!sakkEllen && !babu.hasMoved) {
            let hazSor = (babu.color === "white") ? 7 : 0;
            
            // Királyoldal (h-oszlop)
            let bastyaJ = mezoKeres(7, hazSor);
            if (bastyaJ?.piece?.type === "rook" && !bastyaJ.piece.hasMoved) {
                let s1 = mezoKeres(5, hazSor), s2 = mezoKeres(6, hazSor);
                if (s1 && s2 && !s1.piece && !s2.piece) {
                    lepesek.push({ 
                        from: babu.square, to: bastyaJ, special: "castle-ks", 
                        rookFrom: bastyaJ, rookTo: s1, kingTo: s2 
                    });
                }
            }

            // Vezéroldal (a-oszlop)
            let bastyaB = mezoKeres(0, hazSor);
            if (bastyaB?.piece?.type === "rook" && !bastyaB.piece.hasMoved) {
                let s1 = mezoKeres(1, hazSor), s2 = mezoKeres(2, hazSor), s3 = mezoKeres(3, hazSor);
                if (s1 && s2 && s3 && !s1.piece && !s2.piece && !s3.piece) {
                    lepesek.push({ 
                        from: babu.square, to: bastyaB, special: "castle-qs", 
                        rookFrom: bastyaB, rookTo: s3, kingTo: s2 
                    });
                }
            }
        }
    }

    return lepesek;
}