/* =============================================================
   20) Init
   ============================================================= */
function initResponsiveSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    const apply = () => {
        if (window.innerWidth < 992) {
            sidebar?.classList.add('collapsed');
            mainContent?.classList.add('expanded');
        }
    };
    apply();
    window.addEventListener('resize', apply);
}

