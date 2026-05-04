// MattMester kozos felso navbar inicializator. AdminPanel.html es profile.html
// is hasznalja. A navbar HTML-t a hivo oldal bepasztazza, ez a script:
//   1. Behuzza az aktualis user nevet (/api/sessionInfo) -> "Szia, {nev}!"
//   2. Bekoti a #mmTopNavbarLogoutBtn gombot a megfelelo logout-flow-ra:
//      - data-page="admin" -> custom HTML modal megerositessel; megerositesre
//        TELJES session logout fut (POST /api/logout) + admin token clear,
//        majd redirect "/"-re. Igy ez tenylegesen MAS, mint a MATTMESTER
//        brand-link (ami csak navigal a fooldalra, session marad).
//      - data-page="profile" -> a meglevo #logoutModal Bootstrap modalt nyitja,
//        amit a confirmLogoutButton (handleLogout / /api/logout) zar le —
//        full session logout, redirect "/".

(function () {
    'use strict';

    function getUsernameFallback() {
        // AdminPanel betolti a #headerUsername mezot a sajat 09-auth.js-bol;
        // amig az meg nincs ott, fallback "—".
        const el = document.getElementById('headerUsername');
        if (el && el.textContent && el.textContent.trim() && el.textContent.trim() !== 'Betöltés...') {
            return el.textContent.trim();
        }
        return null;
    }

    async function fetchSessionInfo() {
        try {
            const res = await fetch('/api/sessionInfo', { credentials: 'same-origin' });
            if (!res.ok) return null;
            return await res.json();
        } catch (_) {
            return null;
        }
    }

    function setGreeting(name) {
        const el = document.getElementById('mmTopNavbarUsername');
        if (el) el.textContent = name || 'felhasználó';
    }

    function revealAdminButtonIfAdmin(session) {
        if (!session?.user || session.user.role !== 'admin') return;
        const adminBtn = document.getElementById('mmTopNavbarAdminBtn');
        if (adminBtn) adminBtn.hidden = false;
    }

    function ensureAdminLogoutModal() {
        if (document.getElementById('mmAdminLogoutConfirmModal')) return;
        const wrap = document.createElement('div');
        wrap.innerHTML = `
<div class="modal fade" id="mmAdminLogoutConfirmModal" tabindex="-1" aria-hidden="true" aria-labelledby="mmAdminLogoutConfirmLabel">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content bg-dark text-light border" style="border-color:#334155 !important;">
      <div class="modal-header" style="border-bottom-color:#334155;">
        <h5 class="modal-title" id="mmAdminLogoutConfirmLabel"><i class="bi bi-box-arrow-right me-2"></i>Teljes kijelentkezés</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Bezárás"></button>
      </div>
      <div class="modal-body">
        <p class="mb-2">Ez kijelentkeztet az admin felületről <strong>és</strong> a főoldalról is.</p>
        <p class="text-secondary small mb-0">Ha csak vissza szeretnél térni a főoldalra (bejelentkezve maradva), kattints helyette a fent baloldali <strong>MATTMESTER</strong> logóra.</p>
      </div>
      <div class="modal-footer" style="border-top-color:#334155;">
        <button type="button" class="btn btn-outline-light" data-bs-dismiss="modal">Mégse</button>
        <button type="button" class="btn btn-danger" id="mmAdminLogoutConfirmBtn">Kijelentkezés</button>
      </div>
    </div>
  </div>
</div>`.trim();
        document.body.appendChild(wrap.firstElementChild);
    }

    async function performFullLogout() {
        // Admin token clear (in-memory) + cancel ongoing requests, hogy a teljes
        // kijelentkezes alatt ne fusson semmi az admin oldalrol.
        try {
            if (typeof window.clearAdminToken === 'function') {
                window.clearAdminToken();
            }
            if (window.requestController?.cancelAll) {
                window.requestController.cancelAll();
            }
        } catch (_) { /* ignore */ }

        // Teljes session logout (cookie-t torli)
        try {
            await fetch('/api/logout', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' }
            });
        } catch (_) { /* ignore — akkor is menjunk tovabb */ }

        window.location.href = '/';
    }

    function bindAdminLogout(btn) {
        ensureAdminLogoutModal();
        const modalEl = document.getElementById('mmAdminLogoutConfirmModal');
        if (!modalEl || !window.bootstrap?.Modal) {
            // Fallback: ha nincs Bootstrap, kozvetlen full-logout
            btn.addEventListener('click', () => { performFullLogout(); });
            return;
        }
        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
        btn.addEventListener('click', () => modal.show());
        const confirmBtn = document.getElementById('mmAdminLogoutConfirmBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Kijelentkezés…';
                await performFullLogout();
            });
        }
    }

    function bindProfileLogout(btn) {
        // Profile.html-ben mar van #logoutModal + #confirmLogoutButton (handleLogout
        // /api/logout-ra megy = full session logout). Csak nyissuk meg azt.
        const modalEl = document.getElementById('logoutModal');
        if (!modalEl || !window.bootstrap?.Modal) {
            btn.addEventListener('click', () => {
                fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
                    .finally(() => { window.location.href = '/'; });
            });
            return;
        }
        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
        btn.addEventListener('click', () => modal.show());
    }

    async function init() {
        const navbar = document.querySelector('.mm-top-navbar');
        if (!navbar) return;

        // 1) Gyors greeting a fallback nevvel (ha van) — ne villogjon a "…"
        const fallback = getUsernameFallback();
        if (fallback) setGreeting(fallback);

        // 2) Session info lekerese — a tenyleges nev + role-hoz
        //    (a profile oldalon a role === 'admin' eseten fedi fel a Admin felulet gombot)
        const session = await fetchSessionInfo();
        if (session?.user?.username) setGreeting(session.user.username);
        revealAdminButtonIfAdmin(session);

        // 3) Logout gomb bekotese a data-page szerint
        const btn = document.getElementById('mmTopNavbarLogoutBtn');
        if (!btn) return;
        const page = navbar.getAttribute('data-page');
        if (page === 'admin') {
            bindAdminLogout(btn);
        } else if (page === 'profile') {
            bindProfileLogout(btn);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
