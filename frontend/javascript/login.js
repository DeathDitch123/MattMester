document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const messageDiv = document.getElementById('loginMessage');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageDiv.style.display = 'none';
        messageDiv.className = 'mt-3 text-center alert';

        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        const remember = document.getElementById('rememberMe').checked;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password, remember })
            });
            const result = await response.json();
            messageDiv.style.display = 'block';
            if (response.ok) {
                messageDiv.classList.add('alert-success');
                messageDiv.innerText = "Sikeres bejelentkezés! Átirányítás...";
                setTimeout(() => {
                    window.location.href = '/html/index.html';
                }, 1000);
            } else {
                messageDiv.classList.add('alert-danger');
                messageDiv.innerText = result.message;
            }
        } catch (error) {
            console.error('Login hiba:', error);
            messageDiv.style.display = 'block';
            messageDiv.classList.add('alert-danger');
            messageDiv.innerText = 'Nem sikerült csatlakozni a szerverhez.';
        }
    });
});