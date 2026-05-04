function isDesktopViewportForSidebar() {
    return Boolean(window.matchMedia && window.matchMedia(`(min-width: ${SIDEBAR_DESKTOP_BREAKPOINT_PX}px)`).matches);
}

function getSidebarToggleButton() {
    return document.querySelector('.sidebar-toggle-btn');
}

function applySidebarCollapsedState(collapsed) {
    try {
        const sidebar = document.getElementById('sidebar');
        const mainContent = document.querySelector('.main-content');
        const toggleBtn = getSidebarToggleButton();
        if (sidebar) {
            sidebar.classList.toggle('collapsed', Boolean(collapsed));
        }
        if (mainContent) {
            mainContent.classList.toggle('expanded', Boolean(collapsed));
        }
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }
    } catch (error) {
        console.warn('applySidebarCollapsedState hiba:', error.message || error);
    }
}

function persistSidebarCollapsedState(collapsed) {
    try {
        window.localStorage?.setItem(SIDEBAR_LOCAL_STORAGE_KEY, collapsed ? '1' : '0');
    } catch (error) {
        // Privat mod / quota hiba: nem fatalis, csak nem perzisztal a preference.
    }
}

function readPersistedSidebarCollapsedState() {
    let collapsed = false;
    try {
        collapsed = window.localStorage?.getItem(SIDEBAR_LOCAL_STORAGE_KEY) === '1';
    } catch (error) {
        collapsed = false;
    }
    return collapsed;
}

function toggleSidebar() {
    try {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('mobileOverlay');
        if (!sidebar) {
            return;
        }

        if (isDesktopViewportForSidebar()) {
            const willBeCollapsed = !sidebar.classList.contains('collapsed');
            applySidebarCollapsedState(willBeCollapsed);
            persistSidebarCollapsedState(willBeCollapsed);
        } else {
            sidebar.classList.toggle('show');
            if (overlay) {
                overlay.classList.toggle('show');
            }
            const isShown = sidebar.classList.contains('show');
            const toggleBtn = getSidebarToggleButton();
            if (toggleBtn) {
                toggleBtn.setAttribute('aria-expanded', isShown ? 'true' : 'false');
            }
        }
    } catch (error) {
        console.error('toggleSidebar hiba:', error);
    }
}

function initSidebarCollapseFromPreference() {
    try {
        if (isDesktopViewportForSidebar()) {
            applySidebarCollapsedState(readPersistedSidebarCollapsedState());
        } else {
            // Mobile / tablet: alapallapot zarva, a 'show' osztaly hianya jelenti ezt.
            applySidebarCollapsedState(false);
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('mobileOverlay');
            if (sidebar) sidebar.classList.remove('show');
            if (overlay) overlay.classList.remove('show');
        }
    } catch (error) {
        console.warn('initSidebarCollapseFromPreference hiba:', error.message || error);
    }
}

// Reszponzivitas: ha a felhasznalo atmeretezi az ablakot, valtsuk a megfelelo
// megjelenitest, hogy ne maradjon ott egy desktop-stilusu collapsed state mobil
// nezetben (overlay vs margin-trigger eltero modon mukodik).
function bindSidebarResponsiveSync() {
    try {
        if (typeof window.matchMedia !== 'function') {
            return;
        }
        const mql = window.matchMedia(`(min-width: ${SIDEBAR_DESKTOP_BREAKPOINT_PX}px)`);
        const handler = () => {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('mobileOverlay');
            if (!sidebar) {
                return;
            }
            if (mql.matches) {
                // Desktopra valtas: zarjuk az overlay-t, allitsuk be a perzisztalt collapse-et.
                sidebar.classList.remove('show');
                if (overlay) overlay.classList.remove('show');
                applySidebarCollapsedState(readPersistedSidebarCollapsedState());
            } else {
                // Mobilra valtas: collapsed osztalyt nem hasznaljuk, alapertelmezett zart sidebar.
                applySidebarCollapsedState(false);
                sidebar.classList.remove('show');
                if (overlay) overlay.classList.remove('show');
            }
        };
        if (typeof mql.addEventListener === 'function') {
            mql.addEventListener('change', handler);
        } else if (typeof mql.addListener === 'function') {
            mql.addListener(handler);
        }
    } catch (error) {
        console.warn('bindSidebarResponsiveSync hiba:', error.message || error);
    }
}
