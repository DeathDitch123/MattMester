// Objektum literál: Bábu képek tárolása
// Létrehoz egy objektumot ami tárolja az összes bábu kép elérési útját (12 kép: 6 fehér + 6 fekete)


let babuKepek = {
    white:
    {
        king: "images/white_king.png",      // Fehér király képfájljának elérési útja
        queen: "images/white_queen.png",    // Fehér vezér képfájljának elérési útja
        rook: "images/white_rook.png",      // Fehér bástya képfájljának elérési útja
        bishop: "images/white_bishop.png",  // Fehér futó képfájljának elérési útja
        knight: "images/white_knight.png",  // Fehér huszár képfájljának elérési útja
        pawn: "images/white_pawn.png"       // Fehér gyalog képfájljának elérési útja
    },

    black:
    {
        king: "images/black_king.png",      // Fekete király képfájljának elérési útja
        queen: "images/black_queen.png",    // Fekete vezér képfájljának elérési útja
        rook: "images/black_rook.png",      // Fekete bástya képfájljának elérési útja
        bishop: "images/black_bishop.png",  // Fekete futó képfájljának elérési útja
        knight: "images/black_knight.png",  // Fekete huszár képfájljának elérési útja
        pawn: "images/black_pawn.png"       // Fekete gyalog képfájljának elérési útja
    }
};

// Objektum literál: Játék állapot tárolása
// Létrehoz egy objektumot ami a teljes játék állapotát tárolja (tábla, játékosok, idő, stb)

let jatek =
{
    tabla: [],          // Üres tömb ami a 64 sakkmezőt fogja tárolni (8x8=64 mező)
    koronLevo: "white", // Tárolja melyik játékos jön most ("white" vagy "black") - fehér kezd
    utolsoLepes: null,  // Tárolja az utolsó lépés adatait (honnan-hová) - kezdetben nincs lépés ezért null
    enPassant: null,    // Tárolja az en passant lehetőség adatait (x, y koordináta és szín) - kezdetben nincs ezért null
    jatekosok: {        // Objektum ami mindkét játékos adatait tárolja
        white: { ido: 600, timer: null, oraElem: null, nev: "Orlan" }, // Fehér játékos: 600mp idő (10 perc), nincs időzítő, nincs HTML óra elem, név: Orlan
        black: { ido: 600, timer: null, oraElem: null, nev: "Magnus" } // Fekete játékos: 600mp idő (10 perc), nincs időzítő, nincs HTML óra elem, név: Magnus
    },
    vege: false,        // Jelzi hogy vége van-e a játéknak (false = még megy, true = vége)
    atvaltozasVar: null // Tárolja a várakozó gyalog átváltozás adatait (melyik gyalog, melyik lépés) - kezdetben nincs ezért null
};

// Eseménykezelő függvény: Oldal betöltődése utáni inicializálás
// Amikor az oldal teljesen betöltődött, elindítja a játékot (elemek összekötése, tábla építés, óra indítás)

document.addEventListener("DOMContentLoaded", function ()  // Figyeli a dokumentumot és amikor teljesen betöltődött (DOMContentLoaded esemény), akkor lefuttatja a function() {...} blokkot
{
    jatek.jatekosok.white.oraElem = document.getElementById("clock-white");  // Megkeresi a HTML-ben az id="clock-white" elemet és elmenti a fehér játékos oraElem mezőjébe (később itt frissítjük az időt)
    jatek.jatekosok.black.oraElem = document.getElementById("clock-black");  // Megkeresi a HTML-ben az id="clock-black" elemet és elmenti a fekete játékos oraElem mezőjébe (később itt frissítjük az időt)
    document.getElementById("resetBtn").addEventListener("click", jatekUjraIndit);  // Megkeresi a HTML-ben az id="resetBtn" elemet és hozzáad egy eseményfigyelőt ami figyeli a kattintást (click) és ha rákattintanak meghívja a jatekUjraIndit() függvényt
    tablaEpit();  // Meghívja a tablaEpit() függvényt ami létrehozza a 64 sakkmezőt a jatek.tabla tömbben
    kezdoAllasRak();  // Meghívja a kezdoAllasRak() függvényt ami elhelyezi a bábukat a kezdőpozícióba a táblán
    tablaRajzol();  // Meghívja a tablaRajzol() függvényt ami kirajzolja a sakktáblát és a bábukat a HTML-be
    idoIndit();  // Meghívja az idoIndit() függvényt ami elindítja az időmérést (10 perc/játékos)
    koronLevoFrissit();  // Meghívja a koronLevoFrissit() függvényt ami kiírja a képernyőre hogy melyik játékos jön (kezdetben: fehér)
});
