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

// Függvény: Sakktábla felépítése
// Létrehozza a 64 mező adatstruktúráját (8x8 grid) a jatek.tabla tömbben

function tablaEpit() {
    let betuk = ["a", "b", "c", "d", "e", "f", "g", "h"];  // Tömb ami tartalmazza az oszlopok betűit (a-tól h-ig, balról jobbra)
    let szamok = [8, 7, 6, 5, 4, 3, 2, 1];  // Tömb ami tartalmazza a sorok számait (8-tól 1-ig, fentről lefelé)
    let szin = "light";  // Változó ami tárolja az aktuális mező színét (light = világos, dark = sötét), kezdetben világos
    jatek.tabla = [];  // Üríti a jatek.tabla tömböt (ha volt benne valami, most üres lesz)
    for (let y = 0; y < 8; y = y + 1) {  // Külső ciklus: végigmegy a 8 soron (y = 0-tól 7-ig, azaz 8 iteráció)
        for (let x = 0; x < 8; x = x + 1) {  // Belső ciklus: végigmegy a 8 oszlopon (x = 0-tól 7-ig, azaz 8 iteráció minden sorban)
            let poz = betuk[x] + szamok[y];  // Létrehozza a mező pozíció nevét: betűt és számot összerak (pl: "a8", "e4", "h1")
            jatek.tabla.push({ x: x, y: y, pos: poz, role: szin, piece: null, el: null });  // Hozzáad egy új mező objektumot a jatek.tabla tömbhöz (x koordináta, y koordináta, pozíció név, szín, nincs bábu, nincs HTML elem)
            szin = (szin === "light") ? "dark" : "light";  // Megváltoztatja a mező színét: ha világos volt akkor sötét lesz, ha sötét volt akkor világos lesz (sakktábla mintázat)
        }
        szin = (szin === "light") ? "dark" : "light";  // Sor végén újra váltja a színt hogy a következő sor jó színnel induljon (sakktábla mintázat folytatódik)
    }
    return true;  // Visszaad true értéket jelezve hogy a függvény sikeresen lefutott
}