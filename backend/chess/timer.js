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
    jatekosok.white.utolsoTickMs = null;
    jatekosok.black.utolsoTickMs = null;
}

function idoTikk(jatek, szin) {
    if (jatek.vege) return idoLeall(jatek);

    const jatekos = jatek.jatekosok[szin];
    if (!jatekos) return;

    const most = Date.now();
    if (!jatekos.utolsoTickMs) {
        jatekos.utolsoTickMs = most;
        return;
    }

    // Valós eltelt idő alapján fogy az óra, így blokkos CPU terhelésnél sem "áll meg".
    const elteltMasodperc = Math.floor((most - jatekos.utolsoTickMs) / 1000);
    if (elteltMasodperc <= 0) return;

    jatekos.utolsoTickMs += elteltMasodperc * 1000;

    jatekos.ido -= elteltMasodperc;

    if (jatekos.ido <= 0) {
        jatekos.ido = 0;
        jatek.vege = true;
        const nyertes = (szin === "white") ? "black" : "white";
        jatek.idoVegeUzenet = szin + " időtúllépés — " + nyertes + " nyert";
        idoLeall(jatek);
        if (jatek.onIdoLejar) jatek.onIdoLejar(szin);
    }
}

function idoFut(jatek, szin) {
    idoLeall(jatek);
    jatek.jatekosok[szin].utolsoTickMs = Date.now();
    jatek.jatekosok[szin].timer = setInterval(() => idoTikk(jatek, szin), 250);
}

module.exports = {
    idoLeall,
    idoFut
};
