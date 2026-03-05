export const jatek = {
    tabla: [],          // 64 mező objektummal feltöltve
    koronLevo: "white",
    vege: false,
    enPassant: null,    // { x, y } — az en passant célmező (ahol az ütés landol)
    utolsoLepes: null,
    atvaltozasVar: null,
    lepesszam: 0,       // teljes lépésszám
    felLepes: 0,        // 50 lépés szabályhoz (ütés vagy gyaloglépés óta eltelt féllepések)
    lepesTortenet: [],  // visszajátszáshoz és ismétlésdetektáláshoz
    jatekosok: {
        white: { ido: 600, timer: null },
        black: { ido: 600, timer: null }
    }
};

export function mezoKeres(x, y) {
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return jatek.tabla.find(m => m.x === x && m.y === y);
}