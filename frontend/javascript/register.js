document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.querySelector('form');
    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = document.getElementById('username').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            try {
                const response = await fetch('http://127.0.0.1:3000/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, email, password })
                });
                const data = await response.json();
                if (response.ok) {
                    // Handle successful registration
                    console.log('Registration successful:', data);
                } else {
                    // Handle registration error
                    console.error('Registration failed:', data);
                }
            } catch (error) {
                console.error('Error during registration:', error);
            }
        });
    }
});