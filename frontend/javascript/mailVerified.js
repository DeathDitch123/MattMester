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
        statusLabel: 'Sikertelen',
        statusIcon: 'bi-x-circle-fill',
        title: 'Az email megerősítése nem sikerült',
        subtitle: 'Ellenőrizd a hivatkozást, vagy kérj új verifikációs emailt az Account Status szekcióban.',
        details: payload.message || 'Ismeretlen hiba történt az email megerősítése során.'
    };

    if (payload.success && payload.alreadyVerified) {
        presentation = {
            state: 'info',
            statusLabel: 'Már megerősítve',
            statusIcon: 'bi-info-circle-fill',
            title: 'Az email cím már megerősített állapotban van',
            subtitle: 'Nincs további teendő, a fiókod használatra kész.',
            details: payload.message || 'A megerősítés korábban már megtörtént.'
        };
    } else if (payload.success) {
        presentation = {
            state: 'success',
            statusLabel: 'Sikeres',
            statusIcon: 'bi-check-circle-fill',
            title: 'Sikeres email megerősítés',
            subtitle: 'Most már minden olyan funkciót használhatsz, ami verifikált emailt igényel.',
            details: payload.message || 'A megerősítés sikeresen megtörtént.'
        };
    } else if (payload.code === 'TOKEN_EXPIRED') {
        presentation = {
            state: 'warning',
            statusLabel: 'Lejárt link',
            statusIcon: 'bi-exclamation-triangle-fill',
            title: 'A verifikációs link lejárt',
            subtitle: 'Kérj új megerősítő emailt az Account Status szekcióban.',
            details: payload.message || 'A korábbi link már nem használható.'
        };
    } else if (payload.code === 'INVALID_TOKEN') {
        presentation = {
            state: 'error',
            statusLabel: 'Érvénytelen link',
            statusIcon: 'bi-shield-x',
            title: 'A verifikációs link érvénytelen',
            subtitle: 'Valószínűleg hibás vagy már felhasznált hivatkozásra kattintottál.',
            details: payload.message || 'Kérj új megerősítő emailt a profilodban.'
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
