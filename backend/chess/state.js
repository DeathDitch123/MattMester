// ============================================================
// CHESS STATE — Szerver-oldali játékállapot kezelés
// ============================================================
// A frontend state.js 1:1 megfelelője, de:
//   - Több játékot kezel egyszerre (Map: gameId -> jatek)
//   - Nincs DOM referencia (nincs .el property)
//   - CommonJS module (require/module.exports)
//   - Bot játék mezők: botSzin, nehezseg, botAktiv
// ============================================================

const jatekok = new Map(); // gameId -> jatek objektum

let kovetkezoId = 1;

/**
 * Új játék objektum létrehozása.
 * Visszaadja a gameId-t és a jatek referenciát.
 */
function jatekLetrehoz() {
    const gameId = kovetkezoId++;
    const jatek = {
        gameId,
        tabla: [],          // 64 mező objektummal feltöltve (engine.js tölti fel)
        koronLevo: "white",
        vege: false,
        enPassant: null,    // { x, y } — az en passant célmező
        utolsoLepes: null,
        atvaltozasVar: null,
        lepesszam: 0,       // teljes lépésszám
        felLepes: 0,        // 50 lépés szabályhoz
        lepesTortenet: [],   // visszajátszáshoz
        jatekosok: {
            white: { ido: 600, timer: null },
            black: { ido: 600, timer: null }
        },
        // ── BOT MEZŐK ──
        botAktiv: false,        // ez bot játék?
        botSzin: null,          // 'white' | 'black' — melyik oldalon játszik a bot
        nehezseg: null,         // 1-8 nehézségi szint
        dbGameId: null,         // DB games.id
        idoVegeUzenet: null     // időlejárat üzenet
    };
    jatekok.set(gameId, jatek);
    return { gameId, jatek };
}

/**
 * Játék lekérdezése ID alapján.
 * Visszatér a jatek objektummal, vagy null ha nem létezik.
 */
function jatekKeres(gameId) {
    return jatekok.get(gameId) || null;
}

/**
 * Játék törlése (befejezés vagy disconnect után).
 */
function jatekTorol(gameId) {
    const jatek = jatekok.get(gameId);
    if (jatek) {
        // Timer leállítás ha fut
        if (jatek.jatekosok.white.timer) clearInterval(jatek.jatekosok.white.timer);
        if (jatek.jatekosok.black.timer) clearInterval(jatek.jatekosok.black.timer);
        jatekok.delete(gameId);
    }
}

/**
 * Mező keresése a tábla tömbben.
 * 1:1 a frontend mezoKeres-sel, de egy adott játékra vonatkozik.
 */
function mezoKeres(jatek, x, y) {
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return jatek.tabla.find(m => m.x === x && m.y === y);
}

/**
 * Az aktuális játékállapotot kliens-biztonságos JSON-ná alakítja.
 * Ezt kapja a frontend — CSAK ennyi információt, semmivel sem többet.
 */
function jatekAllapotKliens(jatek) {
    const tabla = jatek.tabla.map(m => ({
        x: m.x,
        y: m.y,
        pos: m.pos,
        piece: m.piece ? {
            type: m.piece.type,
            color: m.piece.color
        } : null
    }));

    // Sakk-jelzés: melyik király van sakkban (pozíció)
    let sakkPoz = null;
    for (let i = 0; i < jatek.tabla.length; i++) {
        const m = jatek.tabla[i];
        if (m.piece && m.piece.type === "king") {
            const ellenSzin = (m.piece.color === "white") ? "black" : "white";
            // Lazy require — elkerüli a cirkuláris importot
            const { mezoTamadva } = require('./logika.js');
            if (mezoTamadva(jatek, m.x, m.y, ellenSzin)) {
                sakkPoz = { x: m.x, y: m.y, color: m.piece.color };
            }
        }
    }

    // Utolsó lépés (from/to koordináták a sárga kiemeléshez)
    let utolsoLepes = null;
    if (jatek.utolsoLepes) {
        utolsoLepes = {
            from: { x: jatek.utolsoLepes.from.x, y: jatek.utolsoLepes.from.y },
            to: { x: jatek.utolsoLepes.to.x, y: jatek.utolsoLepes.to.y }
        };
    }

    return {
        gameId: jatek.gameId,
        tabla,
        koronLevo: jatek.koronLevo,
        vege: jatek.vege,
        lepesszam: jatek.lepesszam,
        utolsoLepes,
        sakkPoz,
        ido: {
            white: jatek.jatekosok.white.ido,
            black: jatek.jatekosok.black.ido
        },
        // ── BOT INFÓ A KLIENSNEK ──
        botAktiv: jatek.botAktiv,
        botSzin: jatek.botSzin,
        nehezseg: jatek.nehezseg
    };
}

module.exports = {
    jatekLetrehoz,
    jatekKeres,
    jatekTorol,
    mezoKeres,
    jatekAllapotKliens
};
