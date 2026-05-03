async function handleLogout() {
    if (!logoutState.submitting) {
        const { confirmButton } = getLogoutElements();
        logoutState.submitting = true;
        if (confirmButton) {
            confirmButton.disabled = true;
            confirmButton.textContent = 'Kijelentkezés...';
        }

        try {
            const response = await fetch('/api/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const result = await parseJson(response);

            if (!response.ok) {
                throw new Error(result.message || 'Sikertelen kijelentkezes.');
            }

            if (socket) {
                socket.disconnect();
                socket.connect();
            }

            window.location.reload();
        } catch (error) {
            console.error('Hiba a kijelentkezes soran:', error);
            logoutState.submitting = false;
            if (confirmButton) {
                confirmButton.disabled = false;
                confirmButton.textContent = 'Kijelentkezés';
            }
        }
    }
}

function getLogoutElements() {
    return {
        modal: document.getElementById('logoutModal'),
        confirmButton: document.getElementById('confirmLogoutButton')
    };
}

function bindLogoutButton() {
    const { modal, confirmButton } = getLogoutElements();
    if (!logoutState.bound && modal && confirmButton) {
        confirmButton.addEventListener('click', () => {
            runSafelyAsync('logoutConfirmClick', async () => {
                await handleLogout();
            });
        });

        modal.addEventListener('show.bs.modal', () => {
            runSafely('logoutModalShow', () => {
                logoutState.submitting = false;
                confirmButton.disabled = false;
                confirmButton.textContent = 'Kijelentkezés';
            });
        });

        modal.addEventListener('hidden.bs.modal', () => {
            runSafely('logoutModalHidden', () => {
                logoutState.submitting = false;
                confirmButton.disabled = false;
                confirmButton.textContent = 'Kijelentkezés';
            });
        });

        logoutState.bound = true;
    }
}

