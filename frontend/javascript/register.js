document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.getElementById('registerForm');
    const messageDiv = document.getElementById('message');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        messageDiv.style.display = 'none';
        messageDiv.className = 'mt-3 text-center alert';

        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, email, password })
            });

            const result = await response.json();

            messageDiv.style.display = 'block';
            
            if (response.ok) {
                messageDiv.classList.add('alert-success');
                messageDiv.innerText = result.message + " Átirányítás...";
                setTimeout(() => {
                    window.location.href = '/html/index.html'; 
                }, 2000);
            } else {
                messageDiv.classList.add('alert-danger');
                messageDiv.innerText = result.message;
            }
        } catch (error) {
            console.error('Hiba:', error);
            messageDiv.style.display = 'block';
            messageDiv.classList.add('alert-danger');
            messageDiv.innerText = 'Nem sikerült csatlakozni a szerverhez.';
        }
    });
});