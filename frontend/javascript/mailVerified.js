const tx = (hu, en) => (window.MattMesterI18n?.tx ? window.MattMesterI18n.tx(hu, en) : hu);

function getQueryParams() {
    const params = new URLSearchParams(window.location.search || '');
    return {
        success: String(params.get('success') || '').trim().toLowerCase() === 'true',
        alreadyVerified: String(params.get('alreadyVerified') || '').trim().toLowerCase() === 'true',
        code: String(params.get('code') || '').trim(),
        message: String(params.get('message') || '').trim()
    };
}

function getPageElements() {
    return {
        statusPill: document.getElementById('verificationStatusPill'),
        title: document.getElementById('verificationTitle'),
        subtitle: document.getElementById('verificationSubtitle'),
        messageBox: document.getElementById('verificationMessageBox'),
        profileButton: document.getElementById('openProfileButton')
    };
}

function resolvePresentation(payload) {
    let presentation = {
        state: 'error',
        statusLabel: tx('Sikertelen', 'Failed'),
        statusIcon: 'bi-x-circle-fill',
        title: tx('Az email megerősítése nem sikerült', 'Email verification failed'),
        subtitle: tx('Ellenőrizd a hivatkozást, vagy kérj új verifikációs emailt az Account Status szekcióban.', 'Check the link, or request a new verification email in the Account Status section.'),
        details: payload.message || tx('Ismeretlen hiba történt az email megerősítése során.', 'An unknown error occurred during email verification.')
    };

    if (payload.success && payload.alreadyVerified) {
        presentation = {
            state: 'info',
            statusLabel: tx('Már megerősítve', 'Already verified'),
            statusIcon: 'bi-info-circle-fill',
            title: tx('Az email cím már megerősített állapotban van', 'The email address is already verified'),
            subtitle: tx('Nincs további teendő, a fiókod használatra kész.', 'Nothing else to do — your account is ready to use.'),
            details: payload.message || tx('A megerősítés korábban már megtörtént.', 'Verification already completed earlier.')
        };
    } else if (payload.success) {
        presentation = {
            state: 'success',
            statusLabel: tx('Sikeres', 'Success'),
            statusIcon: 'bi-check-circle-fill',
            title: tx('Sikeres email megerősítés', 'Email verification successful'),
            subtitle: tx('Most már minden olyan funkciót használhatsz, ami verifikált emailt igényel.', 'You can now use every feature that requires a verified email.'),
            details: payload.message || tx('A megerősítés sikeresen megtörtént.', 'Verification completed successfully.')
        };
    } else if (payload.code === 'TOKEN_EXPIRED') {
        presentation = {
            state: 'warning',
            statusLabel: tx('Lejárt link', 'Expired link'),
            statusIcon: 'bi-exclamation-triangle-fill',
            title: tx('A verifikációs link lejárt', 'The verification link has expired'),
            subtitle: tx('Kérj új megerősítő emailt az Account Status szekcióban.', 'Request a new verification email in the Account Status section.'),
            details: payload.message || tx('A korábbi link már nem használható.', 'The previous link can no longer be used.')
        };
    } else if (payload.code === 'INVALID_TOKEN') {
        presentation = {
            state: 'error',
            statusLabel: tx('Érvénytelen link', 'Invalid link'),
            statusIcon: 'bi-shield-x',
            title: tx('A verifikációs link érvénytelen', 'The verification link is invalid'),
            subtitle: tx('Valószínűleg hibás vagy már felhasznált hivatkozásra kattintottál.', 'You probably clicked an incorrect or already used link.'),
            details: payload.message || tx('Kérj új megerősítő emailt a profilodban.', 'Request a new verification email from your profile.')
        };
    }

    return presentation;
}

function applyPresentation(presentation) {
    const elements = getPageElements();

    if (elements.statusPill) {
        elements.statusPill.className = `status-pill ${presentation.state}`;
        elements.statusPill.innerHTML = `<i class="bi ${presentation.statusIcon}" aria-hidden="true"></i><span>${presentation.statusLabel}</span>`;
    }

    if (elements.title) {
        elements.title.textContent = presentation.title;
    }

    if (elements.subtitle) {
        elements.subtitle.textContent = presentation.subtitle;
    }

    if (elements.messageBox) {
        elements.messageBox.className = `alert-box ${presentation.state === 'success' ? 'success' : (presentation.state === 'error' ? 'error' : '')}`.trim();
        elements.messageBox.textContent = presentation.details;
    }
}

async function toggleProfileButtonVisibility() {
    const { profileButton } = getPageElements();
    try {
        if (profileButton) {
            profileButton.classList.add('d-none');
            const response = await fetch('/api/sessionInfo');
            const payload = await response.json().catch(() => ({}));
            const loggedIn = Boolean(response.ok && payload && payload.loggedIn);
            if (loggedIn) {
                profileButton.classList.remove('d-none');
            }
        }
    } catch (error) {
        console.warn('mailVerified sessionInfo ellenőrzési hiba:', error.message || error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const payload = getQueryParams();
    const presentation = resolvePresentation(payload);
    applyPresentation(presentation);
    await toggleProfileButtonVisibility();
});
