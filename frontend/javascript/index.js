document.addEventListener('DOMContentLoaded', async () => {
    const authSection = document.getElementById('auth-section');
    const userPanel = document.getElementById('user-status-panel');
    const displayUsername = document.getElementById('display-username');
    const displayElo = document.getElementById('display-elo');

    try {
        const response = await fetch('/api/sessionInfo');
        const data = await response.json();

        if (data.loggedIn) {
            authSection.innerHTML = `
                <button class="play-btn">PLAY NOW<br><small>Ranked Match</small></button>
            `;
            userPanel.style.setProperty('display', 'block', 'important');
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