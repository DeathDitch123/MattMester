/* =============================================================
   17) Háttér műveletek (logout, modal)
   =============================================================
   Megjegyzes: a felso navbar Kijelentkezes gombja az `mmAdminLogoutConfirmModal`
   custom modalt nyitja (topNavbar.js), ami a teljes session-logout-ot vegrehajtja.
   Ez a `logout()` legacy belepesi pont — kompatibilitas miatt megmarad, de a
   confirm() helyett a kozos mmConfirm-et hasznalja, hogy ne villanjon native dialog.
   ============================================================= */

async function logout() {
    try {
        const ok = typeof window.mmConfirm === 'function'
            ? await window.mmConfirm({
                title: 'Kijelentkezés',
                message: 'Biztosan ki szeretnél lépni az admin felületről?',
                confirmLabel: 'Kijelentkezés',
                danger: true
            })
            : window.confirm('Biztosan ki szeretnél lépni?');
        if (!ok) return false;
        requestController.cancelAll?.();
        clearAdminToken();
        window.location.href = '/';
        return true;
    } catch (error) {
        console.error('Logout hiba:', error);
        return false;
    }
}

