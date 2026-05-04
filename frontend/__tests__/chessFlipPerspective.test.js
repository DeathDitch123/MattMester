/**
 * Bug 2026-05-04 — fekete jatekos sajat "Te" cimkeje felul jelent meg, az
 * ellenfel alul. Felhasznaloi panasz: "Alul kellene lennie 'Te' (sajat)
 * nevednek, felül az ellensegnek."
 *
 * Fix: a board flip allapota mostantol szinkronban van a player-badge-ek
 * pozicioval — a `.app.flipped` CSS class ujrarendzi a topbar / bottombar
 * vertikalis sorrendet (lasd chessResponsivePanels.test.js).
 *
 * Itt a `kellFlippelni()` logikajat ujraepitjuk pure formaban es ellenoorizzuk:
 *   - bot meccsen NEM flip (sajat = white, autoflip indifferent)
 *   - PvP white NEM flip (sajat = white)
 *   - PvP black + autoflip on -> flip
 *   - PvP black + autoflip off -> NEM flip
 *   - manualis felulir mind az auto-t mind a settings-t
 */

// Ujraepitjuk a `main.js`-beli `kellFlippelni` allapot-fuggveny logikajat.
function kellFlippelni({ manualisFlipFelulirva, autoflip, pvpAktiv, sajatSzin }) {
    if (manualisFlipFelulirva !== null && manualisFlipFelulirva !== undefined) {
        return manualisFlipFelulirva;
    }
    return !!(autoflip && pvpAktiv && sajatSzin === 'black');
}

describe('kellFlippelni — board flip (es player-badge swap) szabalya', () => {
    test('bot meccs (sajat = white, nincs PvP): nincs flip', () => {
        const result = kellFlippelni({
            manualisFlipFelulirva: null,
            autoflip: true,
            pvpAktiv: false,
            sajatSzin: null
        });
        expect(result).toBe(false);
    });

    test('PvP white + autoflip on: nincs flip (white-nak nem kell flip)', () => {
        const result = kellFlippelni({
            manualisFlipFelulirva: null,
            autoflip: true,
            pvpAktiv: true,
            sajatSzin: 'white'
        });
        expect(result).toBe(false);
    });

    test('PvP black + autoflip on: flip aktiv (badge-eket csereljuk)', () => {
        const result = kellFlippelni({
            manualisFlipFelulirva: null,
            autoflip: true,
            pvpAktiv: true,
            sajatSzin: 'black'
        });
        expect(result).toBe(true);
    });

    test('PvP black + autoflip OFF: nincs flip (felhasznalo kikapcsolta)', () => {
        const result = kellFlippelni({
            manualisFlipFelulirva: null,
            autoflip: false,
            pvpAktiv: true,
            sajatSzin: 'black'
        });
        expect(result).toBe(false);
    });

    test('manualis felulir = true mindenkeppen flip (settings/szin ignoralva)', () => {
        const result = kellFlippelni({
            manualisFlipFelulirva: true,
            autoflip: false,        // settings indifferent
            pvpAktiv: false,        // bot meccs is flip-et kap kezzel
            sajatSzin: 'white'      // szin indifferent
        });
        expect(result).toBe(true);
    });

    test('manualis felulir = false mindenkeppen NEM flip', () => {
        const result = kellFlippelni({
            manualisFlipFelulirva: false,
            autoflip: true,
            pvpAktiv: true,
            sajatSzin: 'black'      // egyebkent flip lenne, de a manualis felulirja
        });
        expect(result).toBe(false);
    });
});

describe('player-badge "Te" pozicio — flip allapot szerinti elvart elrendezes', () => {
    // A CSS `.app.flipped { topbar: order:2, bottombar: order:0 }` szabaly
    // miatt a `flipped` allapotban a bottombar (white player) felul, a topbar
    // (black player) alul jelenik meg. Igy a sajat "Te" mindig alul lesz.
    function elvartElrendezes(sajatSzin, flipped) {
        // Vizualisan top -> bottom sorrendben. A DOM topbar=black, bottombar=white,
        // de flipped esetben CSS-csere miatt forditva.
        const bottomElem = flipped ? 'topbar' : 'bottombar';
        const topElem    = flipped ? 'bottombar' : 'topbar';
        return {
            topName:    topElem === 'topbar' ? 'black' : 'white',
            bottomName: bottomElem === 'topbar' ? 'black' : 'white',
            sajatPozicio: ((sajatSzin === 'black' && bottomElem === 'topbar')
                          || (sajatSzin === 'white' && bottomElem === 'bottombar'))
                          ? 'bottom' : 'top'
        };
    }

    test('white sajat, NEM flip: white alul (sajat), black felul (ellenfel)', () => {
        const r = elvartElrendezes('white', false);
        expect(r.bottomName).toBe('white');
        expect(r.topName).toBe('black');
        expect(r.sajatPozicio).toBe('bottom');
    });

    test('black sajat + flip: black alul (sajat), white felul (ellenfel) — fix utan', () => {
        const r = elvartElrendezes('black', true);
        expect(r.bottomName).toBe('black');
        expect(r.topName).toBe('white');
        expect(r.sajatPozicio).toBe('bottom');
    });

    test('black sajat + NINCS flip (autoflip off): black FELUL marad — pre-fix viselkedes szerint', () => {
        // Ez nem hibas viselkedes onmagaban — a felhasznalo szandekosan
        // kapcsolta ki az autoflip-et, igy elfogadja hogy a sajat tag felul.
        // De az autoflip alapertelmezesben ON (ezert is jott a panasz).
        const r = elvartElrendezes('black', false);
        expect(r.bottomName).toBe('white');
        expect(r.topName).toBe('black');
        expect(r.sajatPozicio).toBe('top');
    });
});
