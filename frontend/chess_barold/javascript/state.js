export const jatek = {
    tabla: [], // 64 mező objektummal feltöltve
    koronLevo: "white",
    vege: false,
    enPassant: null,
    utolsoLepes: null,
    atvaltozasVar: null,
    jatekosok: {
        white: { ido: 600, timer: null, oraElem: document.getElementById("white-clock") },
        black: { ido: 600, timer: null, oraElem: document.getElementById("black-clock") }
    }
};

export function mezoKeres(x, y) {
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return jatek.tabla.find(m => m.x === x && m.y === y);
}