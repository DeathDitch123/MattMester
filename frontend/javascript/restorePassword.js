const RESTORE_PASSWORD_REGEX = window.MattMesterValidationRules?.PASSWORD_REGEX || /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
const RESET_TOKEN = new URLSearchParams(window.location.search).get('token') || '';
let resetTokenState = RESET_TOKEN ? 'pending' : 'invalid';

document.addEventListener('DOMContentLoaded', () => {
    bindRestorePasswordPage();
});

function getRestorePasswordElements() {
    const result = {
        form: document.getElementById('restorePasswordForm'),
        newPasswordInput: document.getElementById('restorePasswordNewPassword'),
        confirmPasswordInput: document.getElementById('restorePasswordConfirmPassword'),
        newPasswordFeedback: document.getElementById('restorePasswordNewPasswordFeedback'),
        confirmPasswordFeedback: document.getElementById('restorePasswordConfirmPasswordFeedback'),
        message: document.getElementById('restorePasswordMessage'),
        status: document.getElementById('restorePasswordStatus'),
        submitButton: document.getElementById('restorePasswordSubmitButton')
    };
    return result;
}

function setRestorePasswordStatus(type, message) {
    const { status } = getRestorePasswordElements();
    if (!status) {
        return;
    }

    status.className = 'restore-status mt-3';
    status.textContent = message || '';

    if (!message) {
        return;
    }

    if (type === 'success') {
        status.classList.add('text-success');
    } else if (type === 'danger') {
        status.classList.add('text-danger');
    } else if (type === 'warning') {
        status.classList.add('text-warning');
    }
}

function setRestorePasswordAlert(type, message) {
    const { message: messageElement } = getRestorePasswordElements();
    if (!messageElement) {
        return;
    }

    if (!message) {
        messageElement.className = 'mt-3 text-center alert d-none';
        messageElement.textContent = '';
        return;
    }

    messageElement.className = `mt-3 text-center alert alert-${type}`;
    messageElement.textContent = message;
}

function applyPasswordFeedback(inputElement, feedbackElement, state, message) {
    if (!inputElement || !feedbackElement) {
        return;
    }

    inputElement.classList.remove('is-valid', 'is-invalid');
    feedbackElement.classList.remove('text-secondary', 'text-success', 'text-danger');
    feedbackElement.textContent = message;

    if (state === 'error') {
        inputElement.classList.add('is-invalid');
        feedbackElement.classList.add('text-danger');
    } else if (state === 'success') {
        inputElement.classList.add('is-valid');
        feedbackElement.classList.add('text-success');
    } else {
        feedbackElement.classList.add('text-secondary');
    }
}

function validatePasswordByPolicy(passwordInput, options = {}) {
    const settings = {
        required: true,
        minLength: 8,
        enforceComplexity: true,
        allowBackslash: false,
        ...options
    };
    const password = String(passwordInput || '');
    let error = '';

    if (!password) {
        if (settings.required) {
            error = 'A jelszó megadása kötelező.';
        }
    } else if (!settings.allowBackslash && password.includes('\\')) {
        error = 'A jelszó nem megengedett karaktert tartalmaz.';
    } else if (password.length < settings.minLength) {
        error = `A jelszónak legalább ${settings.minLength} karakter hosszúnak kell lennie.`;
    } else if (settings.enforceComplexity && !RESTORE_PASSWORD_REGEX.test(password)) {
        error = 'A jelszónak tartalmaznia kell nagybetűt, kisbetűt és számot.';
    }

    const result = {
        isValid: !error,
        error
    };
    return result;
}

function validateRestorePasswordForm() {
    const elements = getRestorePasswordElements();
    const newPassword = elements.newPasswordInput ? elements.newPasswordInput.value : '';
    const confirmPassword = elements.confirmPasswordInput ? elements.confirmPasswordInput.value : '';
    let isValid = false;
    let overallMessage = '';

    if (resetTokenState === 'ready') {
        const passwordValidation = validatePasswordByPolicy(newPassword, {
            required: true,
            minLength: 8,
            enforceComplexity: true,
            allowBackslash: false
        });
        const passwordsMatch = Boolean(newPassword && confirmPassword && newPassword === confirmPassword);

        applyPasswordFeedback(
            elements.newPasswordInput,
            elements.newPasswordFeedback,
            passwordValidation.isValid ? 'success' : 'error',
            passwordValidation.isValid ? 'A jelszó formátuma megfelelő.' : passwordValidation.error
        );

        if (!confirmPassword) {
            applyPasswordFeedback(
                elements.confirmPasswordInput,
                elements.confirmPasswordFeedback,
                'neutral',
                'Erősítsd meg az új jelszót.'
            );
            overallMessage = 'Erősítsd meg az új jelszót.';
        } else if (!passwordValidation.isValid) {
            applyPasswordFeedback(
                elements.confirmPasswordInput,
                elements.confirmPasswordFeedback,
                'neutral',
                'Előbb javítsd az új jelszót.'
            );
            overallMessage = passwordValidation.error;
        } else if (!passwordsMatch) {
            applyPasswordFeedback(
                elements.confirmPasswordInput,
                elements.confirmPasswordFeedback,
                'error',
                'A két jelszó nem egyezik.'
            );
            overallMessage = 'A két jelszó nem egyezik.';
        } else {
            applyPasswordFeedback(
                elements.confirmPasswordInput,
                elements.confirmPasswordFeedback,
                'success',
                'A jelszó megerősítése rendben.'
            );
            overallMessage = 'Minden rendben, jelszó frissítésre kész.';
            isValid = true;
        }

        if (elements.submitButton) {
            elements.submitButton.disabled = !isValid;
        }

        setRestorePasswordStatus(isValid ? 'success' : 'warning', overallMessage);
        setRestorePasswordAlert('', '');
    } else {
        if (elements.newPasswordInput) {
            elements.newPasswordInput.classList.remove('is-valid', 'is-invalid');
        }
        if (elements.confirmPasswordInput) {
            elements.confirmPasswordInput.classList.remove('is-valid', 'is-invalid');
        }
        overallMessage = resetTokenState === 'invalid'
            ? 'A visszaállító link érvénytelen vagy lejárt.'
            : 'A visszaállító link ellenőrzése folyamatban van.';
        setRestorePasswordStatus(resetTokenState === 'invalid' ? 'danger' : 'warning', overallMessage);
        setRestorePasswordAlert('', '');
    }

    const result = {
        isValid,
        password: newPassword,
        confirmPassword
    };
    return result;
}

function setTokenState(state, message) {
    const elements = getRestorePasswordElements();
    resetTokenState = state;
    if (elements.submitButton) {
        elements.submitButton.disabled = state !== 'ready';
    }

    if (elements.newPasswordInput) {
        elements.newPasswordInput.disabled = state !== 'ready';
    }

    if (elements.confirmPasswordInput) {
        elements.confirmPasswordInput.disabled = state !== 'ready';
    }

    if (elements.form) {
        elements.form.classList.toggle('is-token-ready', state === 'ready');
        elements.form.classList.toggle('is-token-invalid', state === 'invalid');
    }

    if (elements.status) {
        elements.status.className = 'restore-status mt-3';
    }

    if (message) {
        if (state === 'ready') {
            setRestorePasswordStatus('success', message);
        } else if (state === 'invalid') {
            setRestorePasswordStatus('danger', message);
        } else {
            setRestorePasswordStatus('warning', message);
        }
    } else {
        setRestorePasswordStatus('warning', '');
    }
    setRestorePasswordAlert('', '');
}

async function verifyResetToken() {
    let tokenValid = false;
    try {
        if (!RESET_TOKEN) {
            setTokenState('invalid', 'Hiányzó vagy érvénytelen visszaállító token. Kérj új emailt a bejelentkezési oldalon.');
        } else {
            const response = await fetch(`/api/auth/reset-password/verify?token=${encodeURIComponent(RESET_TOKEN)}`);
            const result = await response.json().catch(() => ({}));

            if (!response.ok || !result.success) {
                setTokenState('invalid', result.message || 'A visszaállító link érvénytelen vagy lejárt.');
            } else {
                tokenValid = true;
                setTokenState('ready', result.message || 'A visszaállító link érvényes. Add meg az új jelszavad.');
                validateRestorePasswordForm();
            }
        }
    } catch (error) {
        console.error('Token ellenőrzési hiba:', error);
        setTokenState('invalid', 'Nem sikerült ellenőrizni a visszaállító linket.');
    }
    return tokenValid;
}

async function submitRestorePassword() {
    const elements = getRestorePasswordElements();
    let success = false;
    try {
        const validation = validateRestorePasswordForm();
        if (!validation.isValid || resetTokenState !== 'ready') {
            if (resetTokenState !== 'ready') {
                setRestorePasswordAlert('danger', 'Hiányzó token. Nyisd meg újra a levélben kapott linket.');
            }
        } else {
            if (elements.submitButton) {
                elements.submitButton.disabled = true;
                elements.submitButton.textContent = 'Frissítés folyamatban...';
            }

            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: RESET_TOKEN,
                    password: validation.password,
                    confirmPassword: validation.confirmPassword
                })
            });
            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                if (result.code === 'PASSWORD_SAME_AS_OLD') {
                    const sameAsOldMessage = 'Az új jelszó nem lehet ugyanaz, mint a régi jelszó!';
                    applyPasswordFeedback(
                        elements.newPasswordInput,
                        elements.newPasswordFeedback,
                        'error',
                        sameAsOldMessage
                    );
                    applyPasswordFeedback(
                        elements.confirmPasswordInput,
                        elements.confirmPasswordFeedback,
                        'error',
                        'Adj meg egy másik jelszót.'
                    );
                    setRestorePasswordStatus('danger', sameAsOldMessage);
                }
                throw new Error(result.message || 'Sikertelen jelszó-visszaállítás.');
            }

            success = true;
            setRestorePasswordAlert('success', result.message || 'A jelszavad sikeresen frissítve lett.');
            setRestorePasswordStatus('success', 'A jelszófrissítés sikeres.');
            if (elements.form) {
                elements.form.reset();
            }
            if (elements.newPasswordInput) {
                elements.newPasswordInput.classList.remove('is-valid', 'is-invalid');
            }
            if (elements.confirmPasswordInput) {
                elements.confirmPasswordInput.classList.remove('is-valid', 'is-invalid');
            }
        }
    } catch (error) {
        console.error('Jelszó visszaállítási hiba:', error);
        setRestorePasswordAlert('danger', error.message || 'Nem sikerült frissíteni a jelszót.');
    } finally {
        if (elements.submitButton) {
            elements.submitButton.textContent = 'Jelszó frissítése';
            if (success) {
                elements.submitButton.disabled = true;
            } else {
                elements.submitButton.disabled = resetTokenState !== 'ready' || !validateRestorePasswordForm().isValid;
            }
        }
    }
}

function bindRestorePasswordPage() {
    const elements = getRestorePasswordElements();
    const canProceed = Boolean(RESET_TOKEN);

    if (elements.newPasswordInput) {
        elements.newPasswordInput.addEventListener('input', () => {
            validateRestorePasswordForm();
        });
        elements.newPasswordInput.addEventListener('blur', () => {
            validateRestorePasswordForm();
        });
    }

    if (elements.confirmPasswordInput) {
        elements.confirmPasswordInput.addEventListener('input', () => {
            validateRestorePasswordForm();
        });
        elements.confirmPasswordInput.addEventListener('blur', () => {
            validateRestorePasswordForm();
        });
    }

    if (elements.form) {
        elements.form.addEventListener('submit', async (event) => {
            event.preventDefault();
            await submitRestorePassword();
        });
    }

    if (canProceed) {
        verifyResetToken();
    } else {
        setTokenState('invalid', 'Hiányzó visszaállító token. Kérj új emailt a bejelentkezési oldalon.');
    }

    validateRestorePasswordForm();
}