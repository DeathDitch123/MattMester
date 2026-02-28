//MINDEN API AMI ITT MEG VAN HÍVVA ISADMIN() VALIDÁLÁSSAL KELL TÖRTÉNJEN A BACKENDEN, HOGY CSAK ADMINOK FÉRHESSENEK HOZZÁJUK
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
function exportUsers() {
    //MÉG FEJLESZNI
    //ez a függvény a felhasználók exportálását kezeli, amikor az export gombra kattintanak
    //ez a függvény egy GET kérést küld a szervernek, hogy exportálja a felhasználók adatait CSV formátumban, majd letölti a fájlt
    fetch('/admin/export-users')
        .then(response => {
            if (!response.ok) {
                throw new Error('Hiba történt a felhasználók exportálása során.');
            }
            return response.blob();
        })
        .then(blob => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'users.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        })
        .catch(error => {
            console.error('Hiba:', error);
            alert('Hiba történt a felhasználók exportálása során.');
        });
}