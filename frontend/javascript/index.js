document.addEventListener('DOMContentLoaded', async () => {
    await pageInit();
    login();
});

async function pageInit() {
    try {
        const data = await fetchSessionInfo();
        if (data.loggedIn) {
            console.log("Bejelentkezett felhasználó mód:", data.user.role);
            document.getElementById('welcomeMessage').innerText = `Üdvözöllek, ${data.user.username}! ELO pontszámod: ${data.user.elo}`;
        } else {
            console.log("Vendég mód");
            document.getElementById('welcomeMessage').innerText = "Üdvözöllek, Vendég! Kérlek jelentkezz be a teljes élményért.";
        }
    } catch (error) {
        console.error('Hiba a lap inicializálásakor:', error);
    }
}

async function fetchSessionInfo() {
    try {
        const response = await fetch('/api/sessionInfo');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Hiba a státusz lekérésekor:', error);
        return null;
    }
}

async function login() {
    const loginForm = document.getElementById('loginForm');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameOrMail = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const remember = document.getElementById('rememberMe').checked;
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ usernameOrMail, password, remember })
            });
            const data = await response.json();
            if (data.success) {
                window.location.reload();
            } else {
                console.error('Bejelentkezés sikertelen:', data.message);
            }
        } catch (error) {
            console.error('Hiba a bejelentkezés során:', error);
        }
    });
}