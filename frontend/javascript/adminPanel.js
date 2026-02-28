document.addEventListener('DOMContentLoaded', function() {

});
function showSection(sectionId) {
    //ez elrejti a minden szekciót, majd megjeleníti a kiválasztott szekciót, és frissíti a navigációs linkeket
    document.querySelectorAll('.section-content').forEach(section => {
        section.classList.add('d-none');
    });
    document.getElementById(sectionId).classList.remove('d-none');

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`.nav-link[data-section="${sectionId}"]`).classList.add('active');
}
function toggleSidebar() {
    //ez a függvény a sidebar megjelenítését és elrejtését kezeli, amikor a toggle gombra kattintanak
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');
    mainContent.classList.toggle('expanded');
    sidebar.classList.toggle('collapsed');
}