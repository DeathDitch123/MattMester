document.addEventListener('DOMContentLoaded', async () => {
    await pageInit();
    login();
});

async function pageInit() {
    try {
        const data = await fetchSessionInfo();
        if (data.loggedIn) {
            console.log("Bejelentkezett felhasználó mód:", data.user.role);
            document.getElementById('welcomeMessage').innerText = `Szia, ${data.user.username}!`;
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
async function register() {
    const registerForm = document.getElementById('registerForm');
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('registerUsername').value;
        const email = document.getElementById('registerEmail').value;
        const password = document.getElementById('registerPassword').value;
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, email, password })
            });
            const data = await response.json();
            if (data.success) {
                window.location.reload();
            } else {
                console.error('Regisztráció sikertelen:', data.message);
            }
        } catch (error) {
            console.error('Hiba a regisztráció során:', error);
        }
    });
}
async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        if (data.success) {
            window.location.reload();
        } else {
            console.error('Kijelentkezés sikertelen:', data.message);
        }
    } catch (error) {
        console.error('Hiba a kijelentkezés során:', error);
    }
}
