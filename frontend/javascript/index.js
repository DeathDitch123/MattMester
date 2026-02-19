document.addEventListener('DOMContentLoaded', async () => {
    const authSection = document.getElementById('auth-section');
    const userPanel = document.getElementById('user-status-panel');
    const displayUsername = document.getElementById('display-username');
    const displayElo = document.getElementById('display-elo');
    const adminPageBtn = document.getElementById('adminPage');
    const settingsBtn = document.getElementById('settingsBtn');

    try {
        const response = await fetch('/api/sessionInfo');
        const data = await response.json();

        if (data.loggedIn) {
            console.log("Bejelentkezett felhasználó mód:", data.user.role);
            let authHTML = `<button class="play-btn">PLAY NOW<br><small>Ranked Match</small></button>`;

            settingsBtn.classList.remove('hidden');
            settingsBtn.addEventListener('click', () => {
                window.location.href = '/html/profile.html';
            });

            if (data.user.role === 'admin') {
                if (data.user.role === 'admin') {
                    adminPageBtn.classList.remove('hidden');
                }
                adminPageBtn.addEventListener('click', () => {
                    window.location.href = '/html/adminPanel.html';
                });
            }

            authSection.innerHTML = authHTML;

            // Panel megjelenítése és adatok betöltése
            userPanel.classList.remove('hidden');
            displayUsername.innerText = data.user.username;
            displayElo.innerText = data.user.elo;

            document.getElementById('logoutBtn').addEventListener('click', async () => {
                await fetch('/api/logout', { method: 'POST' });
                window.location.reload();
            });

        } else {
            console.log("Vendég mód");
        }

    } catch (error) {
        console.error('Hiba a státusz lekérésekor:', error);
    }
});