document.addEventListener('DOMContentLoaded', async () => {
    const authSection = document.getElementById('auth-section');
    const userPanel = document.getElementById('user-status-panel');
    const displayUsername = document.getElementById('display-username');
    const displayElo = document.getElementById('display-elo');

    try {
        const response = await fetch('/api/sessionInfo');
        const data = await response.json();

        if (data.loggedIn) {
            console.log("Bejelentkezett felhasználó mód");
            console.log(data.user);

            // Dinamikusan létrehozott gomb
            authSection.innerHTML = `
                <button class="play-btn" id="play-chess">PLAY NOW<br><small>Ranked Match</small></button>
            `;

            // EventListener hozzáadása a frissen létrehozott gombhoz
            const playBtn = document.getElementById('play-chess');
            playBtn.addEventListener('click', () => {
                window.location.href = '../chess_barold/html/chess.html';
            });

            userPanel.style.setProperty('display', 'block', 'important');
            displayUsername.innerText = data.user.username;
            displayElo.innerText = data.user.elo;

            document.getElementById('logoutBtn').addEventListener('click', async () => {
                await fetch('/api/logout', { method: 'POST' });
                window.location.reload();
            });

        } else {
            console.log("Vendég mód");

            // Vendég módban létező gombhoz esemény hozzáadása
            const guestBtn = document.querySelector('.play-btn');
            if (guestBtn) {
                guestBtn.addEventListener('click', () => {
                    window.location.href = '../chess_barold/html/chess.html';
                });
            }
        }

    } catch (error) {
        console.error('Hiba a státusz lekérésekor:', error);
    }
});
