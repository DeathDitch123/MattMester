/* =============================================================
   17) Háttér műveletek (logout, modal)
   ============================================================= */

function logout() {
    let redirected = false;
    try {
        if (confirm('Biztosan ki szeretnél lépni?')) {
            requestController.cancelAll?.();
            clearAdminToken();
            window.location.href = '/';
            redirected = true;
        }
    } catch (error) {
        console.error('Logout hiba:', error);
    }

    return redirected;
}

