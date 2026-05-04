// ============================================================
// SAKK UI — LEUTOTT BABUK PANELE
// ============================================================
// Ket nezetet rendelez:
//   1. Kis badge-ek a player-soron (`#captured-by-white` / `#captured-by-black`)
//      — 2026-05-04 ota OPCIONALIS, csak akkor renderel ha az element letezik.
//   2. Nagy panel a tabla mellett (`#captured-pieces-mine` / `#captured-pieces-opp`)
//      — "sajat alul" szabaly: a sajat szin altal leutott babuk a sajat sor alatt,
//      az ellenfel altal leutott babuk a felso sorban.
//
// Plusz a material advantage cimke (`+N`) — anyagi elony, standard babu-pontok
// alapjan. A vezeto oldalon mutatja a `+N`-et, a masik oldalon `hidden`.
//
// Hasznalat:
//   import { utottpiecekFrissit } from './ui/capturedPanel.js';
//   utottpiecekFrissit(allapot);   // a fő `allapotFrissit` minden szerver-allapot utan hivja
// ============================================================

import { state } from '../state.js';

const KEZDO = { pawn: 8, rook: 2, knight: 2, bishop: 2, queen: 1, king: 1 };
const SORREND = ['queen', 'rook', 'bishop', 'knight', 'pawn'];
const PIECE_VALUES = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9 };

// Fo entry: a tabla alapjan szamol kik vannak meg, ki mit utott el,
// rendereli a 2 panelt + a material-advantage cimket.
export function utottpiecekFrissit(allapot) {
    if (!allapot?.tabla) return;

    const meglevo = { white: {}, black: {} };
    for (const m of allapot.tabla) {
        if (!m.piece) continue;
        const c = m.piece.color, t = m.piece.type;
        meglevo[c][t] = (meglevo[c][t] || 0) + 1;
    }

    function utottLista(utottSzin) {
        const lista = [];
        for (const tipus of SORREND) {
            const meglevoDb = meglevo[utottSzin][tipus] || 0;
            const hianyzik = KEZDO[tipus] - meglevoDb;
            for (let i = 0; i < hianyzik; i++) lista.push(tipus);
        }
        return lista;
    }

    // A regi badge-en levo `captured-by-white/black` icon-sorok 2026-05-04
    // ELTAVOLITASRA kerultek (felhasznalo kerese: csak a jobb-oldali nagy
    // panelen latszanak a babuk). Ha valaki visszaallitja a HTML-be, a
    // render-elhelyezes az `if (el)` guard-on athaladva fut.
    const byWhite = document.getElementById('captured-by-white');
    const byBlack = document.getElementById('captured-by-black');
    if (byWhite && byBlack) {
        function renderSmall(el, utottSzin) {
            const lista = utottLista(utottSzin);
            el.innerHTML = '';
            for (const tipus of lista) {
                const img = document.createElement('div');
                img.className = 'captured-piece';
                img.style.backgroundImage = `url('../images/${utottSzin}_${tipus}.png')`;
                el.appendChild(img);
            }
        }
        renderSmall(byWhite, 'black');
        renderSmall(byBlack, 'white');
    }

    // Right-side captured panel — nagyobb meretu icon-ok, ket szegmens.
    capturedPanelFrissit(allapot, utottLista);

    // Material advantage (anyagi elony) — standard babu-pontok alapjan
    // szamoljuk, ki nyer az utesekben (kiraly nem szamit, mert mate-tel
    // veget er a meccs). A `+N` cimke csak a vezeto oldalan jelenik meg,
    // a masik oldalon `hidden`. Ha egyenlo (vagy nincs ütott bábu), mindketto
    // rejtett — igy nem zavar 0:0-rol felesleges UI-elem.
    const sumValues = (utottList) => utottList.reduce((acc, t) => acc + (PIECE_VALUES[t] || 0), 0);
    const blackUtottek = utottLista('black'); // amit a fehér ütött
    const whiteUtottek = utottLista('white'); // amit a fekete ütött
    const whiteScore = sumValues(blackUtottek);
    const blackScore = sumValues(whiteUtottek);
    const matWhiteEl = document.getElementById('material-white');
    const matBlackEl = document.getElementById('material-black');
    if (matWhiteEl && matBlackEl) {
        const diff = whiteScore - blackScore;
        matWhiteEl.classList.toggle('hidden', diff <= 0);
        matBlackEl.classList.toggle('hidden', diff >= 0);
        if (diff > 0) matWhiteEl.textContent = `+${diff}`;
        if (diff < 0) matBlackEl.textContent = `+${-diff}`;
    }
}

// Right-side captured panel renderer — a leütött bábukat nagyobb meretben
// mutatja ket szekcioban. "Sajat alul" szabaly:
//   - bottom = `mySzin` szin altal leutott bábuk (= ellen szin szinet)
//   - top    = ellenfel altal leutott bábuk (= my szin szinét)
// Bot-meccsen `name-mine` = state.sajatUsername (ha bejelentkezett), `name-opp` =
// `🤖 ${state.botInfo.nev}`. PvP-n a `pvpJatekosNevek`-bol jonnek a nevek.
function capturedPanelFrissit(allapot, utottListaFn) {
    const opp = document.getElementById('captured-pieces-opp');
    const mine = document.getElementById('captured-pieces-mine');
    const oppName = document.getElementById('captured-name-opp');
    const mineName = document.getElementById('captured-name-mine');
    if (!opp || !mine) return;

    // mySzin: PvP-n `state.sajatSzin`, bot-on a jatekos = white (botSzin = black)
    const mySzin = state.sajatSzin || (allapot && allapot.botSzin ? (allapot.botSzin === 'white' ? 'black' : 'white') : 'white');
    const oppSzin = mySzin === 'white' ? 'black' : 'white';

    // Captured listak: amit a `mySzin` jatekos leutott (= `oppSzin` szinu babuk)
    // mine alul jelenik meg, az ellenfel altal leutottek (= `mySzin` szinu babuk) felul.
    const mineUtottList = utottListaFn(oppSzin); // amit mi utottunk (ellen szinu)
    const oppUtottList  = utottListaFn(mySzin);  // amit ellenfel utott (mi szinunk)

    function renderBig(el, lista, lostPieceColor) {
        el.innerHTML = '';
        for (const tipus of lista) {
            const div = document.createElement('div');
            div.className = 'captured-big-piece';
            div.style.backgroundImage = `url('../images/${lostPieceColor}_${tipus}.png')`;
            div.title = tipus;
            el.appendChild(div);
        }
    }

    // mineUtottList = ellen szinu babuk amit mi vittunk -> `oppSzin` szinu kepek
    renderBig(mine, mineUtottList, oppSzin);
    // oppUtottList = my szinu babuk amit az ellen vitt -> `mySzin` szinu kepek
    renderBig(opp, oppUtottList, mySzin);

    // Nev cimke beirasa — state.sajatUsername / state.botInfo / pvpJatekosNevek alapjan.
    if (mineName) {
        mineName.textContent = state.sajatUsername || (state.pvpAktiv ? state.sajatNev : 'Te') || 'Te';
    }
    if (oppName) {
        if (state.pvpAktiv) {
            oppName.textContent = state.ellenfelNev || 'Ellenfél';
        } else if (state.botInfo) {
            oppName.textContent = `🤖 ${state.botInfo.nev}`;
        } else {
            oppName.textContent = 'Ellenfél';
        }
    }
}
