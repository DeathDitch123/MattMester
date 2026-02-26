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

// Függvény: Mező keresése koordinátákkal
// Megkeresi és visszaadja azt a mezőt a jatek.tabla tömbben ami az adott x és y koordinátán van

function mezoKeres(x, y) {
    for (let i = 0; i < jatek.tabla.length; i = i + 1) {  // Végigmegy a jatek.tabla tömb összes elemén (i = 0-tól a tömb hosszáig)
        if (jatek.tabla[i].x === x && jatek.tabla[i].y === y) {  // Ellenőrzi hogy az aktuális mező x koordinátája egyezik-e a keresett x-szel ÉS az y koordinátája egyezik-e a keresett y-nal
            return jatek.tabla[i];  // Ha megtalálta a megfelelő mezőt, visszaadja azt a mező objektumot
        }
    }
    return null;  // Ha nem talált megfelelő mezőt (végigment az egész tömbön), akkor null-t ad vissza (nincs találat)
}


// Függvény: Mező keresése pozíció névvel
// Megkeresi és visszaadja azt a mezőt a jatek.tabla tömbben ami az adott pozíció néven van (pl: "e4", "a8")

function mezoPozKeres(poz) {
    for (let i = 0; i < jatek.tabla.length; i = i + 1) {  // Végigmegy a jatek.tabla tömb összes elemén (i = 0-tól a tömb hosszáig)
        if (jatek.tabla[i].pos === poz) {  // Ellenőrzi hogy az aktuális mező pos tulajdonsága egyezik-e a keresett poz értékkel
            return jatek.tabla[i];  // Ha megtalálta a megfelelő mezőt, visszaadja azt a mező objektumot
        }
    }
    return null;  // Ha nem talált megfelelő mezőt (végigment az egész tömbön), akkor null-t ad vissza (nincs találat)
}

// Függvény: Kezdő állás beállítása
// Elhelyezi az összes bábut a kezdőpozícióba a sakktáblán (fehér bábuk 1-2. sor, fekete bábuk 7-8. sor)

function kezdoAllasRak() {
    for (let i = 0; i < jatek.tabla.length; i = i + 1) {  // Végigmegy a jatek.tabla tömb összes elemén (mind a 64 mezőn)
        jatek.tabla[i].piece = null;  // Minden mező piece tulajdonságát null-ra állítja (törli az összes bábut a tábláról)
    }

    let fekeHaz = ["a8", "b8", "c8", "d8", "e8", "f8", "g8", "h8"];  // Tömb ami tartalmazza a fekete nehéz bábuk pozícióit a 8. sorban
    let fTipus = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];  // Tömb ami tartalmazza a fekete nehéz bábuk típusait sorrendben (bástya, huszár, futó, vezér, király, futó, huszár, bástya)
    for (let i = 0; i < fekeHaz.length; i = i + 1)  // Végigmegy a fekeHaz tömb elemein (8 elem, i = 0-tól 7-ig)
    {
        babuRak("black", fTipus[i], fekeHaz[i]);  // Meghívja a babuRak() függvényt ami elhelyez egy fekete bábut az adott típussal az adott pozícióra
    }
    for (let i = 0; i < 8; i = i + 1) {  // Végigmegy 8-szor (i = 0-tól 7-ig) a fekete gyalogok elhelyezéséhez
        babuRak("black", "pawn", "abcdefgh"[i] + "7");  // Elhelyez egy fekete gyalogot a 7. sor i-edik oszlopában (a7, b7, c7... h7)
    }

    let fehHaz = ["a1", "b1", "c1", "d1", "e1", "f1", "g1", "h1"];  // Tömb ami tartalmazza a fehér nehéz bábuk pozícióit az 1. sorban
    let hTipus = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];  // Tömb ami tartalmazza a fehér nehéz bábuk típusait sorrendben (bástya, huszár, futó, vezér, király, futó, huszár, bástya)
    for (let i = 0; i < fehHaz.length; i = i + 1) {  // Végigmegy a fehHaz tömb elemein (8 elem, i = 0-tól 7-ig)
        babuRak("white", hTipus[i], fehHaz[i]);  // Meghívja a babuRak() függvényt ami elhelyez egy fehér bábut az adott típussal az adott pozícióra
    }
    for (let i = 0; i < 8; i = i + 1) {  // Végigmegy 8-szor (i = 0-tól 7-ig) a fehér gyalogok elhelyezéséhez
        babuRak("white", "pawn", "abcdefgh"[i] + "2");  // Elhelyez egy fehér gyalogot a 2. sor i-edik oszlopában (a2, b2, c2... h2)
    }
    jatek.koronLevo = "white";  // Beállítja hogy fehér játékos jön először (white kezd mindig)
    jatek.utolsoLepes = null;  // Beállítja null-ra mert még nem volt lépés
    jatek.enPassant = null;  // Beállítja null-ra mert nincs en passant lehetőség a játék elején
    jatek.vege = false;  // Beállítja false-ra mert a játék most indul, nincs vége
    jatek.atvaltozasVar = null;  // Beállítja null-ra mert nincs várakozó gyalog átváltozás
    return true;  // Visszaad true értéket jelezve hogy a függvény sikeresen lefutott
}

function babuRak(szin, tipus, poz) {
    let mezo = mezoPozKeres(poz);  // Meghívja a mezoPozKeres() függvényt ami megkeresi a mezőt a poz pozíció név alapján és elmenti a mezo változóba
    if (mezo === null) {
        return false;  // Ha a mezo null (nem találta meg a mezőt), akkor visszaad false értéket (hiba történt)
    }
    mezo.piece = { color: szin, type: tipus, hasMoved: false, square: mezo };  // Létrehoz egy bábu objektumot (szín, típus, még nem mozdult, melyik mezőn van) és hozzárendeli a mezo.piece tulajdonsághoz
    return true;  // Visszaad true értéket jelezve hogy a bábu sikeresen elhelyezve
}

// Függvény: Sakktábla kirajzolása
// Létrehozza a HTML elemeket a sakktáblához és megjeleníti a bábukat a képernyőn

function tablaRajzol() {
    let boardDiv = document.getElementById("board");  // Megkeresi a HTML-ben az id="board" elemet és elmenti a boardDiv változóba (ez a sakktábla konténere)
    boardDiv.innerHTML = "";  // Kitörli a boardDiv elem teljes tartalmát (üres string-re állítja, így minden benne lévő HTML elem törlődik)
    for (let i = 0; i < jatek.tabla.length; i = i + 1) {
        let mezo = jatek.tabla[i];  // Elmenti az aktuális mező objektumot a mezo változóba (jatek.tabla tömb i-edik eleme)
        let div = document.createElement("div");  // Létrehoz egy új div HTML elemet a mezőhöz
        div.className = "square";  // Beállítja a div CSS osztályát "square"-re (a CSS fájlban így kapja meg a stílusát)
        div.setAttribute("role", mezo.role);  // Beállítja a div "role" attribútumát a mező színére ("light" vagy "dark")
        div.dataset.pos = mezo.pos;  // Beállítja a div data-pos attribútumát a mező pozíció nevére (pl: "e4", később így találjuk meg)
        mezo.el = div;  // Elmenti a div elemet a mezo.el tulajdonságba (így később a mező objektumból elérjük a HTML elemet)
        if (mezo.piece !== null) {
            let pDiv = document.createElement("div");  // Létrehoz egy új div HTML elemet a bábuhoz
            pDiv.className = "piece";  // Beállítja a bábu div CSS osztályát "piece"-re
            let kep = babuKepek[mezo.piece.color][mezo.piece.type];  // Kikeresi a bábu kép elérési útját a babuKepek objektumból (szín és típus alapján)
            pDiv.style.backgroundImage = "url('" + kep + "')";  // Beállítja a bábu div háttérképét a kép elérési útjára (CSS background-image tulajdonság)
            div.appendChild(pDiv);  // Hozzáadja a bábu div-et a mező div-hez (a bábu div a mező div gyereke lesz)
            huzasHozzaad(pDiv, mezo.piece);  // Meghívja a huzasHozzaad() függvényt ami hozzáad drag&drop eseménykezelőt a bábuhoz
        }
        boardDiv.appendChild(div);  // Hozzáadja a mező div-et a boardDiv-hez (a mező div megjelenik a sakktáblán)
    }
    kiemelFrissit();  // Meghívja a kiemelFrissit() függvényt ami frissíti a színes kiemeléseket (utolsó lépés, sakk jelzés)
    return true;  // Visszaad true értéket jelezve hogy a függvény sikeresen lefutott
}

// Függvény: Húzás eseménykezelő hozzáadása
// Hozzáad drag&drop funkcionalitást egy bábuhoz (egér lenyomás, mozgatás, felengedés események kezelése)

function huzasHozzaad(babuElem, babu) 
{
    babuElem.addEventListener("mousedown", function (e) 
    {
        if (jatek.vege === true)  // Ellenőrzi hogy véget ért-e a játék
        {
            return false;  // Ha a játék véget ért, akkor kilép
        }
        
        if (babu.color !== jatek.koronLevo)  // Ellenőrzi hogy a bábu színe egyezik-e a körön lévő játékos színével
        {
            return false;  // Ha nem egyezik, akkor kilép
        }
        
        e.preventDefault();  // Megakadályozza a böngésző alapértelmezett viselkedését
        e.stopPropagation();  // Megállítja az esemény továbbterjedését
        let klon = babuElem.cloneNode(true);  // Létrehoz egy másolatot a bábu HTML elemről
        klon.className = "piece dragging";  // Beállítja a klón CSS osztályát
        klon.style.position = "fixed";  // Beállítja a klón pozícióját fixed-re
        klon.style.zIndex = 9999;  // Beállítja a klón z-index értékét
        klon.style.pointerEvents = "none";  // Letiltja az egér eseményeket a klónon
        klon.style.width = babuElem.offsetWidth + "px";  // Beállítja a klón szélességét
        klon.style.height = babuElem.offsetHeight + "px";  // Beállítja a klón magasságát
        let eltX = babuElem.offsetWidth / 2;  // Kiszámolja a vízszintes eltolást
        let eltY = babuElem.offsetHeight / 2;  // Kiszámolja a függőleges eltolást
        document.body.appendChild(klon);  // Hozzáadja a klónt a body elemhez
        babuElem.style.opacity = "0.3";  // Beállítja az eredeti bábu átlátszóságát
        let lepesek = szabLepKeres(babu);  // Megkeresi a bábu összes szabályos lépését
        huzasKiemel(babu, lepesek);  // Kiemeli a lehetséges célmezőket
        
        babuKlonMozgat(e.clientX, e.clientY, klon, eltX, eltY);  // Mozgatja a klónt a kezdő pozícióra
        
        // Elementés eseménykezelő függvényeket változókba
        let egerMozogKezelo = function(em) 
        {
            babuHuzasEgerMozog(em, klon, eltX, eltY);  // Mozgatja a klónt az egér mozgásakor
        };
        
        let egerFelKezelo = function(ef) 
        {
            document.removeEventListener("mousemove", egerMozogKezelo);  // Leválasztja az egér mozgás eseményt (MOST MÁR JÓ!)
            document.removeEventListener("mouseup", egerFelKezelo);  // Leválasztja az egér felengedés eseményt (MOST MÁR JÓ!)
            babuHuzasEgerFel(ef, klon, babuElem, lepesek, babu);  // Végrehajtja a felengedés kezelést
        };
        
        document.addEventListener("mousemove", egerMozogKezelo);  // Hozzáadja az egér mozgás eseményt
        document.addEventListener("mouseup", egerFelKezelo);  // Hozzáadja az egér felengedés eseményt
        
        return true;  // Visszaad true értéket
    });
    
    return true;  // Visszaad true értéket
}

// Függvény: Bábu klón mozgatása
// Mozgatja a húzott bábu klónt a kurzor pozíciójára (középre igazítva)

function babuKlonMozgat(mx, my, klon, eltX, eltY) {
    klon.style.left = (mx - eltX) + "px";  // Beállítja a klón vízszintes pozícióját (kurzor X - eltolás, így a kurzor a középen marad)
    klon.style.top = (my - eltY) + "px";  // Beállítja a klón függőleges pozícióját (kurzor Y - eltolás, így a kurzor a középen marad)
    return true;  // Visszaad true értéket jelezve hogy a mozgatás megtörtént
}

// Függvény: Egér mozgás kezelése húzás közben
// Folyamatosan frissíti a bábu klón pozícióját amikor az egér mozog

function babuHuzasEgerMozog(em, klon, eltX, eltY) {
    babuKlonMozgat(em.clientX, em.clientY, klon, eltX, eltY);  // Meghívja a babuKlonMozgat() függvényt az új kurzor pozícióval (frissíti a klón pozícióját)
    return true;  // Visszaad true értéket jelezve hogy az esemény kezelve lett
}

function babuHuzasEgerFel(ef, klon, babuElem, lepesek, babu) 
{
    let elemAlatt = document.elementFromPoint(ef.clientX, ef.clientY);  // Megkeresi melyik HTML elem van a kurzor alatt
    let celMezoElem = (elemAlatt !== null) ? elemAlatt.closest(".square") : null;  // Megkeresi a legközelebbi .square osztályú elemet
    klon.remove();  // Törli a klónt a DOM-ból
    babuElem.style.opacity = "";  // Visszaállítja az eredeti bábu átlátszóságát
    
    if (celMezoElem !== null)  // Ellenőrzi hogy van-e célmező
    {
        let celMezo = mezoPozKeres(celMezoElem.dataset.pos);  // Megkeresi a célmező objektumot
        let talaltLepes = null;  // Létrehoz egy változót a megtalált lépés tárolására
        
        for (let i = 0; i < lepesek.length; i = i + 1)  // Végigmegy a szabályos lépéseken
        {
            if (lepesek[i].to.pos === celMezo.pos)  // Ellenőrzi hogy a lépés célmezője egyezik-e
            {
                talaltLepes = lepesek[i];  // Elmenti a lépést
                break;  // Kilép a ciklusból
            }
        }
        
        if (talaltLepes !== null)  // Ellenőrzi hogy ez szabályos lépés-e
        {
            if (babu.type === "pawn")  // Ellenőrzi hogy a bábu gyalog-e
            {
                let utSor = (babu.color === "white") ? 0 : 7;  // Kiszámolja az utolsó sort
                
                if (talaltLepes.to.y === utSor)  // Ellenőrzi hogy a gyalog elérte-e az utolsó sort
                {
                    jatek.atvaltozasVar = { piece: babu, move: talaltLepes };  // Elmenti az átváltozás adatait
                    atvaltozasModal(babu.color, talaltLepes.to);  // Megjeleníti a választó popup ablakot
                    huzasKiemelTorol();  // Törli a kiemeléseket
                    return true;  // Visszaad true értéket
                }
            }
            lepesHajt(babu, talaltLepes);  // Végrehajtja a lépést
        } 
        else  // Ha nem szabályos lépés
        {
            tablaRajzol();  // Újrarajzolja a táblát
        }
    } 
    else  // Ha nincs célmező
    {
        tablaRajzol();  // Újrarajzolja a táblát
    }
    
    huzasKiemelTorol();  // Törli a kiemeléseket
    return true;  // Visszaad true értéket
}

// Függvény: Kiemelés húzás közben
// Kiemeli a lehetséges célmezőket színekkel amikor egy bábut húzunk (zöld, narancs, lila, stb)

function huzasKiemel(babu, lepesek) {
    for (let i = 0; i < lepesek.length; i = i + 1) {
        let l = lepesek[i];    // Elmenti az aktuális lépés objektumot a lepesek tömb i-edik eleméből

        if (l.special === "enpassant") {
            l.to.el.classList.add("enpassant");    // Hozzáadja az "enpassant" CSS osztályt a célmező HTML eleméhez (zöld kiemelés)
        }
        else if (l.special === "castle-ks" || l.special === "castle-qs") {
            if (babu.type === "king" && l.rookFrom) {
                l.rookFrom.el.classList.add("castle");    // Ha király mozog sáncoláskor, akkor hozzáadja a "castle" CSS osztályt a bástya mezőjéhez (zöld kiemelés)
            }
            else if (babu.type === "rook") {
                let hazSor = (babu.color === "white") ? 7 : 0;    // Kiszámolja a ház sort (fehér: 7. sor = 1. sor, fekete: 0. sor = 8. sor)
                let kirMezo = mezoKeres(4, hazSor);    // Megkeresi a király mezőjét (4. oszlop a ház sorban)

                if (kirMezo && kirMezo.el) {
                    kirMezo.el.classList.add("castle");    // Ha bástya mozog sáncoláskor, akkor hozzáadja a "castle" CSS osztályt a király mezőjéhez (zöld kiemelés)
                }
            }
        }
        else if (l.capture === true) {
            l.to.el.classList.add("capture");    // Ha ütés lépés, akkor hozzáadja a "capture" CSS osztályt a célmező HTML eleméhez (narancs kiemelés)
        }
        else {
            l.to.el.classList.add("move");    // Ha normál lépés, akkor hozzáadja a "move" CSS osztályt a célmező HTML eleméhez (kis kör jelenik meg)
        }

        if (babu.type === "pawn") {
            let utSor = (babu.color === "white") ? 0 : 7;    // Kiszámolja az utolsó sort (fehér gyalog: 0. sor = 8. sor, fekete gyalog: 7. sor = 1. sor)

            if (l.to.y === utSor) {
                l.to.el.classList.add("promotion-target");    // Ha gyalog lép az utolsó sorba, akkor hozzáadja a "promotion-target" CSS osztályt a célmező HTML eleméhez (lila kiemelés)
            }
        }
    }
    return true;    // Visszaad true értéket jelezve hogy a kiemelések sikeresen hozzáadva
}

// Függvény: Átváltozás modal elrejtés
// Elrejti az átváltozás választó popup ablakot

function atvaltozasModalElrejt() 
{
    document.getElementById("promotion-modal").classList.add("hidden");  // Megkeresi az id="promotion-modal" elemet és hozzáadja a "hidden" CSS osztályt (így eltűnik)
    return true;  // Visszaad true értéket jelezve hogy a modal sikeresen elrejtve
}

// Függvény: Időmérés indítása
// Elindítja az időmérést a játék elején (mindkét játékos idejét frissíti és a körön lévő ideje fut)

function idoIndit() 
{
    idoFrissit();  // Meghívja az idoFrissit() függvényt ami frissíti mindkét játékos óráját a képernyőn
    idoFut(jatek.koronLevo);  // Meghívja az idoFut() függvényt a körön lévő játékos színével (elindítja az időzítőt)
    return true;  // Visszaad true értéket jelezve hogy az időmérés sikeresen elindítva
}

// Függvény: Időmérés futtatása adott játékosnak
// Elindít egy 1 másodperces időzítőt ami folyamatosan csökkenti a játékos idejét

async function idoFut(szin) 
{
    idoLeall();  // Meghívja az idoLeall() függvényt ami leállítja az összes futó időzítőt (elkerüli hogy több időzítő fusson egyszerre)
    jatek.jatekosok[szin].timer = setInterval(function() { idoTikk(szin); }, 1000);  // Létrehoz egy időzítőt ami 1000 milliszekundumenként (1 másodperc) meghívja az idoTikk() függvényt és elmenti a timer változóba
    koronLevoFrissit();  // Meghívja a koronLevoFrissit() függvényt ami frissíti a képernyőn hogy ki jön most
    return true;  // Visszaad true értéket jelezve hogy az időmérés sikeresen elindítva
}

// Függvény: Idő tikk (1 másodperc eltelt)
// Ez a függvény fut le minden másodpercben az időmérés közben

function idoTikk(szin) 
{
    if (jatek.vege === true)  // Ellenőrzi hogy véget ért-e a játék
    {
        idoLeall();  // Meghívja az idoLeall() függvényt ami leállítja az időmérést
        return false;  // Visszaad false értéket és befejezi a függvényt
    }
    
    jatek.jatekosok[szin].ido = jatek.jatekosok[szin].ido - 1;  // Csökkenti a játékos hátralévő idejét 1 másodperccel (ido - 1)
    
    if (jatek.jatekosok[szin].ido <= 0)  // Ellenőrzi hogy a játékos ideje lejárt-e (kisebb vagy egyenlő 0)
    {
        jatek.jatekosok[szin].ido = 0;  // Beállítja az időt 0-ra (nem lehet negatív)
        jatek.vege = true;  // Beállítja hogy a játék véget ért (vege = true)
        let nyertes = (szin === "white") ? "black" : "white";  // Kiszámolja a nyertes színét (ellenkező szín mint akinek lejárt az ideje)
        document.getElementById("status").textContent = szin + " időtúllépés — " + nyertes + " nyert";  // Kiírja a képernyőre hogy időtúllépés van és ki nyert
        idoLeall();  // Meghívja az idoLeall() függvényt ami leállítja az időmérést
        return false;  // Visszaad false értéket és befejezi a függvényt
    }
    
    idoFrissit();  // Meghívja az idoFrissit() függvényt ami frissíti az órát a képernyőn
    return true;  // Visszaad true értéket jelezve hogy a tikk sikeresen lefutott
}

// Függvény: Időmérés váltása
// Átváltja az időmérést a másik játékosra (a lépés után hívódik meg)

function idoValt() 
{
    idoFut(jatek.koronLevo);  // Meghívja az idoFut() függvényt az új körön lévő játékos színével (elindítja az időmérést neki)
    return true;  // Visszaad true értéket jelezve hogy az időmérés sikeresen átváltva
}

// Függvény: Időmérés leállítása
// Leállítja mindkét játékos időzítőjét

function idoLeall() 
{
    for (let szin in jatek.jatekosok)  // Végigmegy a jatek.jatekosok objektum összes kulcsán (szin = "white" majd "black")
    {
        if (jatek.jatekosok[szin].timer !== null)  // Ellenőrzi hogy a játékosnak van-e futó időzítője (timer nem null)
        {
            clearInterval(jatek.jatekosok[szin].timer);  // Leállítja az időzítőt (clearInterval törli a setInterval-t)
            jatek.jatekosok[szin].timer = null;  // Beállítja a timer értékét null-ra (jelzi hogy nincs futó időzítő)
        }
    }
    return true;  // Visszaad true értéket jelezve hogy az időmérés sikeresen leállítva
}

// Függvény: Óra frissítése képernyőn
// Frissíti mindkét játékos óráját a HTML-ben

function idoFrissit() 
{
    jatek.jatekosok.white.oraElem.textContent = idoFormat(jatek.jatekosok.white.ido);  // Beállítja a fehér játékos óra HTML elemének szövegét a formázott időre (meghívja az idoFormat() függvényt)
    jatek.jatekosok.black.oraElem.textContent = idoFormat(jatek.jatekosok.black.ido);  // Beállítja a fekete játékos óra HTML elemének szövegét a formázott időre
    return true;  // Visszaad true értéket jelezve hogy az órák sikeresen frissítve
}

// Függvény: Idő formázása
// Átalakítja a másodperceket perc:másodperc formátumra (pl: 125 másodperc → "02:05")

function idoFormat(mp) 
{
    let perc = Math.floor(mp / 60);  // Kiszámolja a perceket (mp osztva 60-al, lefelé kerekítve, Math.floor = egész rész)
    let mperc = mp % 60;  // Kiszámolja a maradék másodperceket (mp osztva 60-al, maradék, % = modulo)
    let percStr = String(perc).padStart(2, "0");  // Átalakítja a percet string-re és kitölti 2 karakterre (elé rak 0-t ha kell, pl: 5 → "05")
    let mpStr = String(mperc).padStart(2, "0");  // Átalakítja a másodpercet string-re és kitölti 2 karakterre (elé rak 0-t ha kell)
    return percStr + ":" + mpStr;  // Visszaadja a formázott időt (perc:másodperc formátumban)
}

// Függvény: Körön lévő játékos kiírása
// Frissíti a képernyőn hogy melyik játékos jön most

function koronLevoFrissit() 
{
    document.getElementById("turn-name").textContent = jatek.koronLevo;  // Megkeresi az id="turn-name" elemet és beállítja a szövegét a körön lévő játékos színére ("white" vagy "black")
    return true;  // Visszaad true értéket jelezve hogy a kiírás sikeresen frissítve
}

// Függvény: Játék újraindítása
// Visszaállítja a játékot a kezdőállapotba (új játék indítása)

function jatekUjraIndit() 
{
    idoLeall();  // Meghívja az idoLeall() függvényt ami leállítja az időmérést
    atvaltozasModalElrejt();  // Meghívja az atvaltozasModalElrejt() függvényt ami elrejti az átváltozás modal-t (ha esetleg nyitva lenne)
    jatek.jatekosok.white.ido = 600;  // Visszaállítja a fehér játékos idejét 600 másodpercre (10 perc)
    jatek.jatekosok.black.ido = 600;  // Visszaállítja a fekete játékos idejét 600 másodpercre (10 perc)
    kezdoAllasRak();  // Meghívja a kezdoAllasRak() függvényt ami elhelyezi a bábukat a kezdőpozícióba
    tablaRajzol();  // Meghívja a tablaRajzol() függvényt ami újrarajzolja a sakktáblát
    idoFrissit();  // Meghívja az idoFrissit() függvényt ami frissíti az órákat a képernyőn
    idoIndit();  // Meghívja az idoIndit() függvényt ami elindítja az időmérést
    document.getElementById("status").textContent = "játékon";  // Beállítja az id="status" elem szövegét "játékon"-ra (jelzi hogy a játék folyamatban van)
    koronLevoFrissit();  // Meghívja a koronLevoFrissit() függvényt ami frissíti hogy ki jön most
    return true;  // Visszaad true értéket jelezve hogy a játék sikeresen újraindítva
}