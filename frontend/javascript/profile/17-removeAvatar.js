function getRemoveAvatarElements() {
    return {
        modal: document.getElementById('removeAvatarModal'),
        confirmButton: document.getElementById('confirmRemoveAvatarButton'),
        message: document.getElementById('removeAvatarMessage')
    };
}

function setRemoveAvatarMessage(type, message) {
    const { message: messageElement } = getRemoveAvatarElements();
    if (!messageElement) {
        return;
    }

    if (!message) {
        messageElement.className = 'alert d-none mb-0';
        messageElement.textContent = '';
        return;
    }

    messageElement.className = `alert alert-${type} mb-0`;
    messageElement.textContent = message;
}

async function submitRemoveAvatar() {
    const elements = getRemoveAvatarElements();
    if (!elements.confirmButton) {
        return;
    }

    elements.confirmButton.disabled = true;
    elements.confirmButton.textContent = 'Eltávolítás...';
    setRemoveAvatarMessage('danger', '');

    try {
        const response = await fetch('/api/profile/remove-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await parseJson(response);
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'A profilkép eltávolítása nem sikerült.');
        }

        setProfileSettingsMessage('success', result.message || 'A profilkép visszaállítva az alapértelmezett képre.');

        if (elements.modal) {
            const modal = bootstrap.Modal.getOrCreateInstance(elements.modal);
            modal.hide();
        }

        await syncSocketContextOrReconnect('profile-image-remove');
        await refreshAuthUi('profile-image-remove-success');
    } catch (error) {
        setRemoveAvatarMessage('danger', error.message || 'Hiba történt a profilkép eltávolítása közben.');
        throw new Error(error.message || 'Profilkép eltávolítási hiba.');
    } finally {
        elements.confirmButton.disabled = false;
        elements.confirmButton.textContent = 'Eltávolítás';
    }
}

function bindRemoveAvatarEvents() {
    try {
        const elements = getRemoveAvatarElements();
        if (!elements.modal || !elements.confirmButton) {
            throw new Error('Hianyzik a remove avatar modal vagy confirm gomb.');
        }

        elements.confirmButton.addEventListener('click', async () => {
            await runSafelyAsync('removeAvatarConfirmClick', async () => {
                await submitRemoveAvatar();
            });
        });

        elements.modal.addEventListener('show.bs.modal', () => {
            runSafely('removeAvatarModalShow', () => {
                setRemoveAvatarMessage('danger', '');
            });
        });

        elements.modal.addEventListener('hidden.bs.modal', () => {
            runSafely('removeAvatarModalHidden', () => {
                setRemoveAvatarMessage('danger', '');
            });
        });
    } catch (error) {
        console.error('bindRemoveAvatarEvents hiba:', error);
    }
}

// Sidebar toggle: admin-stilus, minden meretben mukodik.
// - Desktop (>=992px): a 'collapsed' kapcsolja a sidebart, a main-content 'expanded'
//   modon kiveszi a margin-left-et, igy a sidebar a teljes vegehez csuszik be/ki.
// - Mobile (<992px): a 'show' kapcsolja az overlay-vel egyutt a sidebart, ahogy eddig.
const SIDEBAR_DESKTOP_BREAKPOINT_PX = 992;
const SIDEBAR_LOCAL_STORAGE_KEY = 'mattmester.profile.sidebarCollapsed';

