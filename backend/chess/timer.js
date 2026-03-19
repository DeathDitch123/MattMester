// ============================================================
// CHESS TIMER — Szerver-oldali óra kezelés
// ============================================================
// A frontend timer.js 1:1 logikája, VÁLTOZÁSOK:
//   - Nincs UI hívás (uiFrissitIdo, uiJatekVegeMegjelenit)
//   - Explicit `jatek` paraméter (több játék párhuzamosan)
//   - Időlejárat → jatek.vege = true (az API kérés válaszában látja a kliens)
//   - CommonJS module
// ============================================================

const { jatekAllapotKliens } = require('./state.js');

function idoLeall(jatek) {
    const jatekosok = jatek.jatekosok;
    if (jatekosok.white.timer) { clearInterval(jatekosok.white.timer); jatekosok.white.timer = null; }
    if (jatekosok.black.timer) { clearInterval(jatekosok.black.timer); jatekosok.black.timer = null; }
}

function idoTikk(jatek, szin) {
    if (jatek.vege) return idoLeall(jatek);

    jatek.jatekosok[szin].ido--;

    if (jatek.jatekosok[szin].ido <= 0) {
        jatek.jatekosok[szin].ido = 0;
        jatek.vege = true;
        const nyertes = (szin === "white") ? "black" : "white";
        jatek.idoVegeUzenet = szin + " időtúllépés — " + nyertes + " nyert";
        idoLeall(jatek);
    }
}

function idoFut(jatek, szin) {
    idoLeall(jatek);
    jatek.jatekosok[szin].timer = setInterval(() => idoTikk(jatek, szin), 1000);
}

module.exports = {
    idoLeall,
    idoFut
};
