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


// Függvény: Húzás kiemelés törlése
// Törli az összes húzás közbeni kiemelést a mezőkről (zöld, narancs, lila jelölések eltávolítása)

function huzasKiemelTorol() {
    let mezok = document.querySelectorAll(".square");    // Megkeresi az összes .square osztályú HTML elemet (mind a 64 mező) és elmenti a mezok változóba (tömb-szerű lista)

    for (let i = 0; i < mezok.length; i = i + 1) {
        mezok[i].classList.remove("move", "capture", "enpassant", "castle", "promotion-target");    // Törli a mezők HTML eleméről a húzás közbeni CSS osztályokat (move, capture, enpassant, castle, promotion-target), így a kiemelések eltűnnek
    }

    return true;    // Visszaad true értéket jelezve hogy a kiemelések sikeresen törölve
}

// Függvény: Kiemelések frissítése
// Frissíti a folyamatos kiemeléseket (utolsó lépés sárga jelzése, király prios jelzése ha sakkban van)

function kiemelFrissit()
{
    let mezok = document.querySelectorAll(".square"); //Megkeresi az összes .square osztályú HTML elemet (mind a 64 mező) és elmenti a mezők változóba (tömb szerű lista)

    for (let i = 0; i < mezok.length; i++) 
    {    
        mezok[i].classList.remove("from", "to", "check"); // Törli a mezők HTML eleméről a foylamatos kiemelés CSS osztályokat (from, to, check), így a régi kiemelések eltűnnek
    }

    if(jatek.utolsoLepes !== null)
    {
        let honnan = mezoPozKeres(jatek.utolsoLepes.fromPos);  // Megkeresi azt a mezőt ahonnan az utolsó lépés indult (jatek.utolsoLepes.fromPos pozíció név alapján)
        let hova = mezoPozKeres(jatek.utolsoLepes.toPos);  // Megkeresi azt a mezőt ahová az utolsó lépés ment (jatek.utolsoLepes.toPos pozíció név alapján)

        if (honnan && honnan.el) {
            honnan.el.classList.add("from");  // Ha a honnan mező létezik és van HTML eleme, akkor hozzáadja a "from" CSS osztályt (sárga kiemelés a kiindulási mezőn)
        }

        if (hova && hova.el) {
            hova.el.classList.add("to");  // Ha a hova mező létezik és van HTML eleme, akkor hozzáadja a "to" CSS osztályt (sárga kiemelés a célmezőn)
        }
    }

    for (let i = 0; i < jatek.tabla.length; i = i + 1) {
        let m = jatek.tabla[i];    // Elmenti az aktuális mező objektumot a jatek.tabla tömb i-edik eleméből

        if (m.piece && m.piece.type === "king") {
            if (mezoTamadva(m, m.piece.color) === true) {
                m.el.classList.add("check");    // Ha a király mezőt támadják, akkor hozzáadja a "check" CSS osztályt a mező HTML eleméhez (piros kiemelés)
            }
        }
    }

    return true;    // Visszaad true értéket jelezve hogy a kiemelések sikeresen frissítve
}

// Függvény: Lehetséges lépések számítása (pseudo moves)
// Kiszámolja egy bábu összes lehetséges lépését (még nem ellenőrzi hogy a király sakkban marad-e)

function lehetsLepSzamit(babu, sakkEllen) {
    let lepesek = [];  // Létrehoz egy üres tömböt ami tárolni fogja az összes lehetséges lépést
    let x = babu.square.x;  // Elmenti a bábu jelenlegi X koordinátáját (0-7 között)
    let y = babu.square.y;  // Elmenti a bábu jelenlegi Y koordinátáját (0-7 között)

    if (babu.type === "pawn")  // Ellenőrzi hogy a bábu gyalog-e
    {
        let ir = (babu.color === "white") ? -1 : 1;  // Kiszámolja a gyalog mozgási irányát (fehér: -1 = felfelé, fekete: 1 = lefelé)
        let kezdoSor = (babu.color === "white") ? 6 : 1;  // Kiszámolja a kezdő sort (fehér: 6. sor = 2. sor, fekete: 1. sor = 7. sor)
        let elore = mezoKeres(x, y + ir);  // Megkeresi az egy mezővel előre lévő mezőt (gyalog irányában)

        if (elore && !elore.piece)  // Ellenőrzi hogy az előre mező létezik-e ÉS üres-e (nincs rajta bábu)
        {
            lepesek.push({ from: babu.square, to: elore, capture: false });  // Hozzáad egy normál előre lépést a lepesek tömbhöz

            if (y === kezdoSor)  // Ellenőrzi hogy a gyalog a kezdősorán van-e
            {
                let ket = mezoKeres(x, y + ir * 2);  // Megkeresi a két mezővel előre lévő mezőt (dupla lépéshez)

                if (ket && !ket.piece)  // Ellenőrzi hogy a két mezővel előre mező létezik-e ÉS üres-e
                {
                    lepesek.push({ from: babu.square, to: ket, capture: false, special: "double" });  // Hozzáad egy dupla lépést a lepesek tömbhöz (special: "double" jelzi hogy dupla lépés)
                }
            }
        }

        for (let dx = -1; dx <= 1; dx = dx + 2)  // Végigmegy a két átlós irányon (dx = -1 majd +1, azaz bal és jobb átló)
        {
            let csq = mezoKeres(x + dx, y + ir);  // Megkeresi az átlósan előre lévő mezőt (gyalog ütési mezője)

            if (csq && csq.piece && csq.piece.color !== babu.color)  // Ellenőrzi hogy a mező létezik-e ÉS van rajta bábu ÉS az ellenfél bábuja
            {
                lepesek.push({ from: babu.square, to: csq, capture: true });  // Hozzáad egy ütés lépést a lepesek tömbhöz
            }
        }

        if (jatek.enPassant)  // Ellenőrzi hogy van-e en passant lehetőség a játékban
        {
            let ep = jatek.enPassant;  // Elmenti az en passant adatokat (x, y koordináta, szín)

            if (ep.color !== babu.color && ep.y === y && Math.abs(ep.x - x) === 1)  // Ellenőrzi hogy az en passant gyalog ellenfél színű-e ÉS ugyanabban a sorban van-e ÉS szomszédos oszlopban van-e (Math.abs = abszolút érték, távolság 1)
            {
                let cel = mezoKeres(ep.x, y + ir);  // Megkeresi a célmezőt (ahová a gyalog lépne en passant esetén)
                let ut = mezoKeres(ep.x, ep.y);  // Megkeresi az ütendő gyalog mezőjét

                if (cel)  // Ellenőrzi hogy a célmező létezik-e
                {
                    lepesek.push({ from: babu.square, to: cel, capture: true, special: "enpassant", captured: ut });  // Hozzáad egy en passant lépést (special: "enpassant", captured: melyik mezőről törlődik a bábu)
                }
            }
        }
        return lepesek;  // Visszaadja a gyalog összes lehetséges lépését
    }

    if (babu.type === "knight")  // Ellenőrzi hogy a bábu huszár-e
    {
        let elt = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];  // Tömb ami tartalmazza a huszár 8 lehetséges eltolását (L alakú lépések)

        for (let i = 0; i < elt.length; i = i + 1)  // Végigmegy mind a 8 lehetséges huszár lépésen
        {
            lepesProba(x + elt[i][0], y + elt[i][1], lepesek, babu);  // Meghívja a lepesProba() függvényt az aktuális eltolással (x + eltolás[0], y + eltolás[1])
        }
        return lepesek;  // Visszaadja a huszár összes lehetséges lépését
    }

    if (babu.type === "bishop")  // Ellenőrzi hogy a bábu futó-e
    {
        let ir = [[1, 1], [1, -1], [-1, 1], [-1, -1]];  // Tömb ami tartalmazza a futó 4 átlós irányát (jobb-fel, jobb-le, bal-fel, bal-le)

        for (let i = 0; i < ir.length; i = i + 1)  // Végigmegy mind a 4 átlós irányon
        {
            for (let j = 1; j < 8; j = j + 1)  // Végigmegy maximum 7 mezőn az adott irányban (j = 1-től 7-ig, azaz 1, 2, 3... 7 mező távolság)
            {
                if (!lepesProba(x + ir[i][0] * j, y + ir[i][1] * j, lepesek, babu))  // Meghívja a lepesProba() függvényt az aktuális irányban j távolságra, ha false-t ad vissza (nem mehet tovább) akkor
                {
                    break;  // Kilép a belső ciklusból (nem megy tovább ebben az irányban, mert akadály van)
                }
            }
        }
        return lepesek;  // Visszaadja a futó összes lehetséges lépését
    }

    if (babu.type === "rook")  // Ellenőrzi hogy a bábu bástya-e
    {
        let ir = [[1, 0], [-1, 0], [0, 1], [0, -1]];  // Tömb ami tartalmazza a bástya 4 egyenes irányát (jobbra, balra, le, fel)

        for (let i = 0; i < ir.length; i = i + 1)  // Végigmegy mind a 4 egyenes irányon
        {
            for (let j = 1; j < 8; j = j + 1)  // Végigmegy maximum 7 mezőn az adott irányban
            {
                if (!lepesProba(x + ir[i][0] * j, y + ir[i][1] * j, lepesek, babu))  // Meghívja a lepesProba() függvényt, ha false-t ad vissza akkor
                {
                    break;  // Kilép a belső ciklusból (nem megy tovább ebben az irányban)
                }
            }
        }

        if (!sakkEllen && !babu.hasMoved)  // Ellenőrzi hogy a sakk ellenőrzés ki van-e hagyva (sáncoláshoz) ÉS a bástya még nem mozdult-e
        {
            let hazSor = (babu.color === "white") ? 7 : 0;  // Kiszámolja a ház sort (fehér: 7. sor = 1. sor, fekete: 0. sor = 8. sor)
            let kirMezo = mezoKeres(4, hazSor);  // Megkeresi a király mezőjét (4. oszlop = e oszlop)

            if (kirMezo && kirMezo.piece && kirMezo.piece.type === "king" && !kirMezo.piece.hasMoved)  // Ellenőrzi hogy a király mező létezik-e ÉS van rajta bábu ÉS az király ÉS a király nem mozdult még
            {
                if (x === 7)  // Ellenőrzi hogy ez a jobb oldali bástya-e (7. oszlop = h oszlop)
                {
                    let s1 = mezoKeres(5, hazSor);  // Megkeresi az 5. oszlop mezőjét (f oszlop, köztes mező)
                    let s2 = mezoKeres(6, hazSor);  // Megkeresi a 6. oszlop mezőjét (g oszlop, köztes mező)

                    if (s1 && s2 && !s1.piece && !s2.piece)  // Ellenőrzi hogy mindkét köztes mező létezik-e ÉS mindkettő üres-e
                    {
                        lepesek.push({ from: babu.square, to: kirMezo, capture: false, special: "castle-ks", rookFrom: babu.square, rookTo: s1, kingTo: s2 });  // Hozzáad egy király oldali sáncolás lépést (bástya a királyra "lép", de valójában mindkettő mozog)
                    }
                }

                if (x === 0)  // Ellenőrzi hogy ez a bal oldali bástya-e (0. oszlop = a oszlop)
                {
                    let s1 = mezoKeres(1, hazSor);  // Megkeresi az 1. oszlop mezőjét (b oszlop, köztes mező)
                    let s2 = mezoKeres(2, hazSor);  // Megkeresi a 2. oszlop mezőjét (c oszlop, köztes mező)
                    let s3 = mezoKeres(3, hazSor);  // Megkeresi a 3. oszlop mezőjét (d oszlop, köztes mező)

                    if (s1 && s2 && s3 && !s1.piece && !s2.piece && !s3.piece)  // Ellenőrzi hogy mind a 3 köztes mező létezik-e ÉS mindhárom üres-e
                    {
                        lepesek.push({ from: babu.square, to: kirMezo, capture: false, special: "castle-qs", rookFrom: babu.square, rookTo: s3, kingTo: s2 });  // Hozzáad egy vezér oldali sáncolás lépést
                    }
                }
            }
        }
        return lepesek;  // Visszaadja a bástya összes lehetséges lépését
    }

    if (babu.type === "queen")  // Ellenőrzi hogy a bábu vezér-e
    {
        let ir = [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];  // Tömb ami tartalmazza a vezér mind a 8 irányát (4 átló + 4 egyenes)

        for (let i = 0; i < ir.length; i = i + 1)  // Végigmegy mind a 8 irányon
        {
            for (let j = 1; j < 8; j = j + 1)  // Végigmegy maximum 7 mezőn az adott irányban
            {
                if (!lepesProba(x + ir[i][0] * j, y + ir[i][1] * j, lepesek, babu))  // Meghívja a lepesProba() függvényt, ha false-t ad vissza akkor
                {
                    break;  // Kilép a belső ciklusból
                }
            }
        }
        return lepesek;  // Visszaadja a vezér összes lehetséges lépését
    }

    if (babu.type === "king")  // Ellenőrzi hogy a bábu király-e
    {
        for (let dx = -1; dx <= 1; dx = dx + 1)  // Végigmegy a vízszintes irányokon (dx = -1, 0, 1 azaz bal, középen, jobb)
        {
            for (let dy = -1; dy <= 1; dy = dy + 1)  // Végigmegy a függőleges irányokon (dy = -1, 0, 1 azaz fel, középen, le)
            {
                if (dx === 0 && dy === 0)  // Ellenőrzi hogy ez a király saját mezője-e (dx=0 és dy=0)
                {
                    continue;  // Átugrik erre az iterációra (nem próbálkozik a király saját mezőjével)
                }
                lepesProba(x + dx, y + dy, lepesek, babu);  // Meghívja a lepesProba() függvényt az aktuális szomszédos mezőre
            }
        }

        if (!sakkEllen && !babu.hasMoved)  // Ellenőrzi hogy a sakk ellenőrzés ki van-e hagyva ÉS a király még nem mozdult-e
        {
            let hazSor = (babu.color === "white") ? 7 : 0;  // Kiszámolja a ház sort
            let bastyaJ = mezoKeres(7, hazSor);  // Megkeresi a jobb oldali bástya mezőjét (7. oszlop = h oszlop)

            if (bastyaJ && bastyaJ.piece && bastyaJ.piece.type === "rook" && !bastyaJ.piece.hasMoved)  // Ellenőrzi hogy a jobb bástya mező létezik-e ÉS van rajta bábu ÉS az bástya ÉS nem mozdult még
            {
                let s1 = mezoKeres(5, hazSor);  // Megkeresi az 5. oszlop mezőjét (köztes mező)
                let s2 = mezoKeres(6, hazSor);  // Megkeresi a 6. oszlop mezőjét (köztes mező)

                if (s1 && s2 && !s1.piece && !s2.piece)  // Ellenőrzi hogy mindkét köztes mező létezik-e ÉS mindkettő üres-e
                {
                    lepesek.push({ from: babu.square, to: bastyaJ, capture: false, special: "castle-ks", rookFrom: bastyaJ, rookTo: s1, kingTo: s2 });  // Hozzáad egy király oldali sáncolás lépést (király a bástyára "lép")
                }
            }

            let bastyaB = mezoKeres(0, hazSor);  // Megkeresi a bal oldali bástya mezőjét (0. oszlop = a oszlop)

            if (bastyaB && bastyaB.piece && bastyaB.piece.type === "rook" && !bastyaB.piece.hasMoved)  // Ellenőrzi hogy a bal bástya mező létezik-e ÉS van rajta bábu ÉS az bástya ÉS nem mozdult még
            {
                let s1 = mezoKeres(1, hazSor);  // Megkeresi az 1. oszlop mezőjét (köztes mező)
                let s2 = mezoKeres(2, hazSor);  // Megkeresi a 2. oszlop mezőjét (köztes mező)
                let s3 = mezoKeres(3, hazSor);  // Megkeresi a 3. oszlop mezőjét (köztes mező)

                if (s1 && s2 && s3 && !s1.piece && !s2.piece && !s3.piece)  // Ellenőrzi hogy mind a 3 köztes mező létezik-e ÉS mindhárom üres-e
                {
                    lepesek.push({ from: babu.square, to: bastyaB, capture: false, special: "castle-qs", rookFrom: bastyaB, rookTo: s3, kingTo: s2 });  // Hozzáad egy vezér oldali sáncolás lépést
                }
            }
        }
        return lepesek;  // Visszaadja a király összes lehetséges lépését
    }

    return lepesek;  // Visszaadja a lépések tömbjét (ha egyik bábu típus sem volt, üres tömb)
}

// Függvény: Lépés próba
// Megpróbál hozzáadni egy lépést az adott célmezőre (ellenőrzi hogy szabályos-e)

function lepesProba(cx, cy, lepesek, babu) {
    if (cx < 0 || cx > 7 || cy < 0 || cy > 7)  // Ellenőrzi hogy a célmező a táblán kívül van-e (cx vagy cy kisebb mint 0 VAGY nagyobb mint 7)
    {
        return false;  // Visszaad false értéket (nem lehet a táblán kívülre lépni)
    }

    let cm = mezoKeres(cx, cy);  // Megkeresi a célmezőt a koordináták alapján

    if (cm.piece !== null)  // Ellenőrzi hogy van-e bábu a célmezőn
    {
        if (cm.piece.color === babu.color)  // Ellenőrzi hogy a célmezőn lévő bábu ugyanolyan színű-e mint a mozgatott bábu
        {
            return false;  // Visszaad false értéket (nem lehet saját bábura lépni)
        }
        lepesek.push({ from: babu.square, to: cm, capture: true });  // Hozzáad egy ütés lépést a lepesek tömbhöz (ellenfél bábu van a célmezőn)
        return false;  // Visszaad false értéket (nem lehet tovább menni ezen a mezőn túl, mert bábu van)
    }

    lepesek.push({ from: babu.square, to: cm, capture: false });  // Hozzáad egy normál lépést a lepesek tömbhöz (üres a célmező)
    return true;  // Visszaad true értéket (lehet tovább menni ebben az irányban, mert üres volt a mező)
}

// Függvény: Szabályos lépések keresése
// Kiszámolja egy bábu összes szabályos lépését (figyelembe véve hogy a király nem maradhat sakkban)

function szabLepKeres(babu) {
    let pseudo = lehetsLepSzamit(babu, false);  // Meghívja a lehetsLepSzamit() függvényt ami visszaadja az összes lehetséges lépést (false = sakk ellenőrzés nélkül)
    let szabalyos = [];  // Létrehoz egy üres tömböt ami tárolni fogja a szabályos lépéseket

    for (let i = 0; i < pseudo.length; i = i + 1)  // Végigmegy az összes lehetséges lépésen (pseudo tömb elemein)
    {
        let l = pseudo[i];  // Elmenti az aktuális lépés objektumot a pseudo tömb i-edik eleméből

        if (l.special === "castle-ks" || l.special === "castle-qs")  // Ellenőrzi hogy ez sáncolás lépés-e (király oldali VAGY vezér oldali)
        {
            let kirPoz = (babu.type === "king") ? babu.square : mezoKeres(4, babu.square.y);  // Meghatározza a király jelenlegi pozícióját (ha király mozog akkor a bábu pozíciója, ha bástya mozog akkor a 4. oszlopban keresi a királyt)
            let celKirPoz = l.kingTo;  // Elmenti a király célpozícióját a lépés objektumból
            let kezdX = kirPoz.x;  // Elmenti a király kezdő X koordinátáját
            let vegX = celKirPoz.x;  // Elmenti a király cél X koordinátáját
            let lep = (vegX > kezdX) ? 1 : -1;  // Kiszámolja a lépés irányát (ha cél nagyobb mint kezdő akkor 1 = jobbra, különben -1 = balra)
            let rossz = false;  // Létrehoz egy flag változót ami jelzi hogy a sáncolás érvénytelen-e (kezdetben false = érvényes)

            for (let cx = kezdX; cx !== vegX + lep; cx = cx + lep)  // Végigmegy a király útvonaláán (kezdő X-től a cél X + 1 lépés-ig, azaz beleértve a célmezőt is)
            {
                let teszt = mezoKeres(cx, kirPoz.y);  // Megkeresi az aktuális mező objektumot az útvonalon

                if (mezoTamadva(teszt, babu.color) === true)  // Ellenőrzi hogy ezt a mezőt támadják-e az ellenfél bábui
                {
                    rossz = true;  // Beállítja a flag-et true-ra (érvénytelen sáncolás mert támadott mezőn menne át a király)
                    break;  // Kilép a ciklusból (nem kell tovább ellenőrizni)
                }
            }

            if (rossz === false)  // Ellenőrzi hogy a sáncolás érvényes-e (rossz flag false maradt)
            {
                szabalyos.push(l);  // Hozzáadja a sáncolás lépést a szabályos lépések tömbhöz
            }
            continue;  // Folytatja a külső ciklust a következő lépéssel (átugorja a normál lépés ellenőrzést)
        }

        let honnan = l.from;  // Elmenti a lépés kiindulási mezőjét
        let hova = l.to;  // Elmenti a lépés célmezőjét
        let mentHonnan = honnan.piece;  // Elmenti a kiindulási mezőn lévő bábut (később vissza kell állítani)
        let mentHova = hova.piece;  // Elmenti a célmezőn lévő bábut (lehet null ha üres, vagy ellenfél bábu ha ütés)
        let mentEP = jatek.enPassant;  // Elmenti a jelenlegi en passant állapotot (később vissza kell állítani)
        let utottBabu = null;  // Létrehoz egy változót az en passant ütött bábu tárolására

        if (l.special === "enpassant" && l.captured)  // Ellenőrzi hogy ez en passant lépés-e ÉS van captured mező (ütött gyalog mezője)
        {
            utottBabu = l.captured.piece;  // Elmenti az ütött gyalog bábu objektumot
            l.captured.piece = null;  // Törli az ütött gyalogot a mezőjéről (szimulálja az ütést)
        }

        honnan.piece = null;  // Üresíti a kiindulási mezőt (szimulálja hogy a bábu elmozdult)
        hova.piece = mentHonnan;  // Áthelyezi a bábut a célmezőre
        hova.piece.square = hova;  // Frissíti a bábu square tulajdonságát az új mezőre
        let kirMezo = null;  // Létrehoz egy változót a király mező tárolására

        for (let j = 0; j < jatek.tabla.length; j = j + 1)  // Végigmegy az összes mezőn a táblán
        {
            if (jatek.tabla[j].piece && jatek.tabla[j].piece.type === "king" && jatek.tabla[j].piece.color === babu.color)  // Ellenőrzi hogy a mezőn van-e bábu ÉS az király ÉS a saját színünk királya
            {
                kirMezo = jatek.tabla[j];  // Elmenti a király mezőjét
                break;  // Kilép a ciklusból (megtalálta a királyt)
            }
        }

        let sakkban = mezoTamadva(kirMezo, babu.color);  // Ellenőrzi hogy a király mezőjét támadják-e (mezoTamadva visszaad true ha támadott, false ha nem)
        honnan.piece = mentHonnan;  // Visszaállítja a kiindulási mezőre a bábut (visszavonja a szimulációt)
        honnan.piece.square = honnan;  // Visszaállítja a bábu square tulajdonságát az eredeti mezőre
        hova.piece = mentHova;  // Visszaállítja a célmező bábuját (null ha üres volt, vagy ellenfél bábu ha ütés volt)

        if (mentHova)  // Ellenőrzi hogy volt-e bábu a célmezőn
        {
            mentHova.square = hova;  // Visszaállítja az ütött bábu square tulajdonságát (ha volt)
        }

        if (l.special === "enpassant" && l.captured)  // Ellenőrzi hogy ez en passant lépés volt-e
        {
            l.captured.piece = utottBabu;  // Visszarakja az ütött gyalogot a mezőjére (visszavonja az ütést)
        }

        jatek.enPassant = mentEP;  // Visszaállítja az en passant állapotot az eredeti értékre

        if (sakkban === false)  // Ellenőrzi hogy a király NINCS sakkban a lépés után (sakkban változó false)
        {
            szabalyos.push(l);  // Hozzáadja ezt a lépést a szabályos lépések tömbhöz (mert nem marad sakkban a király)
        }
    }

    return szabalyos;  // Visszaadja a szabályos lépések tömbjét
}

// Függvény: Mező támadott-e
// Ellenőrzi hogy egy adott mezőt támad-e valamelyik ellenfél bábu

function mezoTamadva(mezo, vedoSzin) {
    let ellenSzin = (vedoSzin === "white") ? "black" : "white";  // Kiszámolja az ellenfél színét (ha védő fehér akkor ellenfél fekete, különben fehér)

    for (let i = 0; i < jatek.tabla.length; i = i + 1)  // Végigmegy a sakktábla összes mezőjén (mind a 64 mezőn)
    {
        let m = jatek.tabla[i];  // Elmenti az aktuális mező objektumot a jatek.tabla tömb i-edik eleméből

        if (m.piece && m.piece.color === ellenSzin)  // Ellenőrzi hogy a mezőn van-e bábu ÉS az ellenfél színű-e
        {
            let pseudos = lehetsLepSzamit(m.piece, true);  // Meghívja a lehetsLepSzamit() függvényt az ellenfél bábuval (true = sakk ellenőrzés kihagyva, mert végtelen ciklust okozna)

            for (let j = 0; j < pseudos.length; j = j + 1)  // Végigmegy az ellenfél bábu összes lehetséges lépésén
            {
                if (pseudos[j].to.pos === mezo.pos)  // Ellenőrzi hogy a lépés célmezője egyezik-e a vizsgált mezővel
                {
                    return true;  // Visszaad true értéket (a mezőt támadja ez az ellenfél bábu)
                }
            }
        }
    }

    return false;  // Visszaad false értéket (egyetlen ellenfél bábu sem támadja ezt a mezőt)
}

// Függvény: Lépés végrehajtása
// Végrehajtja egy lépést a sakktáblán (bábu mozgatás, ütés, sáncolás, átváltozás kezelése és játék állapot frissítése)

function lepesHajt(babu, lepes, atvalTipus) {
    if (atvalTipus === undefined)  // Ellenőrzi hogy az atvalTipus paraméter meg van-e adva (undefined = nincs megadva)
    {
        atvalTipus = "queen";  // Beállítja az alapértelmezett átváltozás típust vezérre (ha gyalog átváltozik és nincs megadva típus)
    }

    let honnan = lepes.from;  // Elmenti a lépés kiindulási mezőjét
    let hova = lepes.to;  // Elmenti a lépés célmezőjét

    if (lepes.capture === true && !lepes.special)  // Ellenőrzi hogy ez normál ütés lépés-e (capture = true ÉS nincs special típus)
    {
        hova.piece = null;  // Törli az ütött bábut a célmezőről (null-ra állítja)
    }

    if (lepes.special === "enpassant" && lepes.captured)  // Ellenőrzi hogy ez en passant ütés-e ÉS van captured mező
    {
        lepes.captured.piece = null;  // Törli az en passant ütött gyalogot a mezőjéről (ez nem a célmező, hanem oldalt van)
    }

    if (lepes.special === "castle-ks" || lepes.special === "castle-qs")  // Ellenőrzi hogy ez sáncolás lépés-e (király oldali VAGY vezér oldali)
    {
        let rf = lepes.rookFrom;  // Elmenti a bástya kiindulási mezőjét
        let rt = lepes.rookTo;  // Elmenti a bástya célmezőjét
        let kt = lepes.kingTo;  // Elmenti a király célmezőjét
        rt.piece = rf.piece;  // Áthelyezi a bástyát a célmezőre
        rt.piece.hasMoved = true;  // Beállítja hogy a bástya mozdult (hasMoved = true, többé nem sáncolhat)
        rt.piece.square = rt;  // Frissíti a bástya square tulajdonságát az új mezőre
        rf.piece = null;  // Üresíti a bástya régi mezőjét (null-ra állítja)
        let kir = (babu.type === "king") ? babu : mezoKeres(4, babu.square.y).piece;  // Meghatározza a király bábu objektumot (ha király mozog akkor a babu, ha bástya mozog akkor megkeresi a 4. oszlopban)
        let regiKirMezo = kir.square;  // Elmenti a király régi mezőjét
        kt.piece = kir;  // Áthelyezi a királyt a célmezőre
        kt.piece.hasMoved = true;  // Beállítja hogy a király mozdult (hasMoved = true, többé nem sáncolhat)
        kt.piece.square = kt;  // Frissíti a király square tulajdonságát az új mezőre
        regiKirMezo.piece = null;  // Üresíti a király régi mezőjét (null-ra állítja)
        jatek.utolsoLepes = { fromPos: regiKirMezo.pos, toPos: kt.pos };  // Elmenti az utolsó lépés adatait (király régi pozíció → király új pozíció)
    }
    else  // Ha nem sáncolás, akkor normál lépés
    {
        hova.piece = honnan.piece;  // Áthelyezi a bábut a kiindulási mezőről a célmezőre
        hova.piece.square = hova;  // Frissíti a bábu square tulajdonságát az új mezőre
        hova.piece.hasMoved = true;  // Beállítja hogy a bábu mozdult (hasMoved = true)
        honnan.piece = null;  // Üresíti a kiindulási mezőt (null-ra állítja)

        if (lepes.special === "double")  // Ellenőrzi hogy ez dupla gyalog lépés-e
        {
            jatek.enPassant = { x: hova.x, y: hova.y, color: hova.piece.color };  // Beállítja az en passant lehetőséget (gyalog pozíció és szín tárolása)
        }
        else  // Ha nem dupla lépés
        {
            jatek.enPassant = null;  // Törli az en passant lehetőséget (null-ra állítja)
        }

        if (hova.piece.type === "pawn")  // Ellenőrzi hogy a mozgatott bábu gyalog-e
        {
            let utSor = (hova.piece.color === "white") ? 0 : 7;  // Kiszámolja az utolsó sort (fehér gyalog: 0. sor = 8. sor, fekete gyalog: 7. sor = 1. sor)

            if (hova.y === utSor)  // Ellenőrzi hogy a gyalog elérte-e az utolsó sort
            {
                hova.piece.type = atvalTipus;  // Megváltoztatja a gyalog típusát az atvalTipus értékre (alapértelmezetten "queen")
            }
        }

        jatek.utolsoLepes = { fromPos: honnan.pos, toPos: hova.pos };  // Elmenti az utolsó lépés adatait (kiindulási pozíció → cél pozíció)
    }

    jatek.koronLevo = (jatek.koronLevo === "white") ? "black" : "white";  // Megváltoztatja a körön lévő játékost (fehér → fekete vagy fekete → fehér)
    idoValt();  // Meghívja az idoValt() függvényt ami átváltja az időmérést a másik játékosra
    let ellenSzin = jatek.koronLevo;  // Elmenti az ellenfél színét (aki most jön)
    let vanLepes = false;  // Létrehoz egy flag változót ami jelzi hogy van-e szabályos lépés (kezdetben false)

    for (let i = 0; i < jatek.tabla.length; i = i + 1)  // Végigmegy a sakktábla összes mezőjén
    {
        let m = jatek.tabla[i];  // Elmenti az aktuális mező objektumot

        if (m.piece && m.piece.color === ellenSzin)  // Ellenőrzi hogy a mezőn van-e bábu ÉS az ellenfél színű-e
        {
            if (szabLepKeres(m.piece).length > 0)  // Meghívja a szabLepKeres() függvényt és ellenőrzi hogy van-e szabályos lépés (tömb hossza nagyobb mint 0)
            {
                vanLepes = true;  // Beállítja true-ra (van szabályos lépés)
                break;  // Kilép a ciklusból (találtunk lépést, nem kell tovább keresni)
            }
        }
    }

    if (vanLepes === false)  // Ellenőrzi hogy nincs-e szabályos lépés
    {
        let kirMezo = null;  // Létrehoz egy változót a király mező tárolására

        for (let i = 0; i < jatek.tabla.length; i = i + 1)  // Végigmegy a sakktábla összes mezőjén
        {
            if (jatek.tabla[i].piece && jatek.tabla[i].piece.type === "king" && jatek.tabla[i].piece.color === ellenSzin)  // Ellenőrzi hogy a mezőn van-e bábu ÉS az király ÉS az ellenfél színű
            {
                kirMezo = jatek.tabla[i];  // Elmenti a király mezőjét
                break;  // Kilép a ciklusból (megtalálta a királyt)
            }
        }

        let sakkban = mezoTamadva(kirMezo, ellenSzin);  // Ellenőrzi hogy a király mezőjét támadják-e
        jatek.vege = true;  // Beállítja hogy a játék véget ért (vege = true)

        if (sakkban === true)  // Ellenőrzi hogy a király sakkban van-e
        {
            let nyertes = (ellenSzin === "white") ? "black" : "white";  // Kiszámolja a nyertes színét (ellenkező szín mint aki mattban van)
            document.getElementById("status").textContent = ellenSzin + " matt — " + nyertes + " nyert";  // Kiírja a képernyőre hogy matt van és ki nyert
        }
        else  // Ha a király nincs sakkban
        {
            document.getElementById("status").textContent = "Döntetlen (Stalemate)";  // Kiírja a képernyőre hogy döntetlen (patt = nincs szabályos lépés de nincs sakk sem)
        }

        idoLeall();  // Meghívja az idoLeall() függvényt ami leállítja az időmérést
    }
    else  // Ha van szabályos lépés
    {
        document.getElementById("status").textContent = "játékon";  // Kiírja a képernyőre hogy a játék folytatódik
    }

    tablaRajzol();  // Meghívja a tablaRajzol() függvényt ami újrarajzolja a sakktáblát
    return true;  // Visszaad true értéket jelezve hogy a lépés sikeresen végrehajtva
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