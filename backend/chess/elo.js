// ELO — Standard Elo pontszámítás
// Chess.com-szerű Elo rendszer.
// K-faktor: első 10 meccs K=40, utána K=20, 2400+ felett K=10.
// Kezdő ELO: 800

const KEZDO_ELO = 800;

/**
   Kiszámítja az új Elo értéket egy meccs után.
   @param {number} jatekosElo - a játékos jelenlegi ELO-ja
   @param {number} ellenfelElo - az ellenfél (vagy bot) ELO-ja
   @param {number} eredmeny - 1 = győzelem, 0.5 = döntetlen, 0 = vereség
   @param {number} osszMeccs - a játékos eddigi összesített meccsszáma (K-faktorhoz)
   @returns {{ ujElo: number, valtozas: number }}
*/

function eloSzamit(jatekosElo, ellenfelElo, eredmeny, osszMeccs = 99) {
    // K-faktor meghatározás
    let K;
    if (osszMeccs < 10) {
        K = 40; // Kezdő: gyors beállás
    } else if (jatekosElo >= 2400) {
        K = 10; // Nagymester szint: lassú változás
    } else {
        K = 20; // Standard
    }

    // Várható eredmény (expected score)
    const varhato = 1 / (1 + Math.pow(10, (ellenfelElo - jatekosElo) / 400));

    // Új ELO
    const valtozas = Math.round(K * (eredmeny - varhato));
    let ujElo = jatekosElo + valtozas;

    // Minimum ELO: 100 (ne menjen 0-ba)
    if (ujElo < 100) ujElo = 100;

    return { ujElo, valtozas };
}


/**
 * Meccs végén mindkét játékos ELO-ját kiszámítja.
   @param {number} feherElo
   @param {number} feketeElo
   @param {string} eredmeny - 'white' | 'black' | 'draw'
   @param {number} feherMeccsek - fehér eddigi meccsszáma
   @param {number} feketeMeccsek - fekete eddigi meccsszáma
   @returns {{ feher: { ujElo, valtozas }, fekete: { ujElo, valtozas } }}
*/

function eloMeccsEredmeny(feherElo, feketeElo, eredmeny, feherMeccsek = 99, feketeMeccsek = 99) {
    let feherPont, feketePont;

    if (eredmeny === 'white') {
        feherPont = 1;
        feketePont = 0;
    } else if (eredmeny === 'black') {
        feherPont = 0;
        feketePont = 1;
    } else {
        feherPont = 0.5;
        feketePont = 0.5;
    }

    const feher = eloSzamit(feherElo, feketeElo, feherPont, feherMeccsek);
    const fekete = eloSzamit(feketeElo, feherElo, feketePont, feketeMeccsek);

    return { feher, fekete };
}

module.exports = {
    KEZDO_ELO,
    eloSzamit,
    eloMeccsEredmeny
};
