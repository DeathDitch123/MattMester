// ============================================================
// SAKK — UJ MECCS CHOOSER (frontpage modal) MEGNYITAS
// ============================================================
// A frontpage `chessModeChooser` (window.MattMesterChessModeChooser) globalis
// objektumot szolittja meg. Ha valamiert nem elerheto (script load hiba vagy
// timing race), fallback: visszairanyitas az index oldalra (ott a chooser
// auto-betoltodik).
//
// Onallo modul, mert tobb hivasi-hely is hasznalja (init safety-timeout, bot
// rejoin error-fallback, gameEndModal "Uj jatek" callback).
// ============================================================

export function ujMeccsChooserNyitas() {
    const chooser = window.MattMesterChessModeChooser;
    if (chooser && typeof chooser.open === 'function') {
        chooser.open();
        return;
    }
    window.location.href = '/';
}
