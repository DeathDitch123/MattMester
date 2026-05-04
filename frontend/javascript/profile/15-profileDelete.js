function getProfileDeleteElements() {
    return {
        modal: document.getElementById('deleteProfileModal'),
        passwordInput: document.getElementById('deleteProfileConfirmInput'),
        passwordFeedback: document.getElementById('deleteProfileConfirmFeedback'),
        acknowledgeCheckbox: document.getElementById('deleteProfileAcknowledge'),
        confirmButton: document.getElementById('confirmDeleteProfileBtn'),
        timer: document.getElementById('deleteTimer'),
        message: document.getElementById('deleteProfileMessage')
    };
}

function setDeleteProfileMessage(type, message) {
    const { message: messageElement } = getProfileDeleteElements();
    if (messageElement) {
        if (!message) {
            messageElement.className = 'alert d-none mt-3 mb-0';
            messageElement.textContent = '';
        } else {
            messageElement.className = `alert alert-${type} mt-3 mb-0`;
            messageElement.textContent = message;
        }
    }
}

function setDeleteProfilePasswordFeedback(state, message) {
    const { passwordInput, passwordFeedback } = getProfileDeleteElements();
    if (passwordInput && passwordFeedback) {
        passwordInput.classList.remove('is-valid', 'is-invalid');
        passwordFeedback.classList.remove('text-secondary', 'text-success', 'text-danger');
        passwordFeedback.textContent = message;

        if (state === 'error') {
            passwordInput.classList.add('is-invalid');
            passwordFeedback.classList.add('text-danger');
        } else if (state === 'success') {
            passwordInput.classList.add('is-valid');
            passwordFeedback.classList.add('text-success');
        } else {
            passwordFeedback.classList.add('text-secondary');
        }
    }
}

function validateDeleteProfilePassword(password) {
    const passwordValidation = validatePasswordByPolicy(password, {
        required: true,
        minLength: 8,
        enforceComplexity: true,
        allowBackslash: false
    });

    return passwordValidation.error;
}

function updateDeleteProfileConfirmButtonState() {
    const elements = getProfileDeleteElements();
    if (elements.confirmButton && elements.passwordInput && elements.acknowledgeCheckbox) {
        const password = elements.passwordInput.value || '';
        const passwordError = validateDeleteProfilePassword(password);
        const acknowledged = elements.acknowledgeCheckbox.checked;

        if (!password) {
            setDeleteProfilePasswordFeedback('neutral', 'A törléshez add meg a jelenlegi jelszavad.');
        } else if (passwordError) {
            setDeleteProfilePasswordFeedback('error', passwordError);
        } else {
            setDeleteProfilePasswordFeedback('success', 'A jelszó formátuma megfelelő.');
        }

        const canSubmit = profileDeleteState.countdownFinished
            && !profileDeleteState.submitting
            && acknowledged
            && password.length > 0
            && !passwordError;

        elements.confirmButton.disabled = !canSubmit;
    }
}

function resetDeleteProfileModalState() {
    const elements = getProfileDeleteElements();

    if (profileDeleteState.countdownTimer) {
        clearInterval(profileDeleteState.countdownTimer);
        profileDeleteState.countdownTimer = null;
    }

    profileDeleteState.countdownLeft = PROFILE_DELETE_CONFIRM_SECONDS;
    profileDeleteState.countdownFinished = false;
    profileDeleteState.submitting = false;

    if (elements.passwordInput) {
        elements.passwordInput.value = '';
    }

    if (elements.acknowledgeCheckbox) {
        elements.acknowledgeCheckbox.checked = false;
    }

    if (elements.confirmButton) {
        elements.confirmButton.innerHTML = `Törlés (<span id="deleteTimer">${PROFILE_DELETE_CONFIRM_SECONDS}</span>s)`;
        elements.confirmButton.disabled = true;
    }

    setDeleteProfileMessage('danger', '');
    setDeleteProfilePasswordFeedback('neutral', 'A törléshez add meg a jelenlegi jelszavad.');
}

function startDeleteProfileCountdown() {
    const elements = getProfileDeleteElements();
    if (elements.confirmButton) {
        if (profileDeleteState.countdownTimer) {
            clearInterval(profileDeleteState.countdownTimer);
        }

        profileDeleteState.countdownTimer = setInterval(() => {
            profileDeleteState.countdownLeft -= 1;

            const { timer } = getProfileDeleteElements();
            if (timer) {
                timer.textContent = String(Math.max(profileDeleteState.countdownLeft, 0));
            }

            if (profileDeleteState.countdownLeft <= 0) {
                profileDeleteState.countdownFinished = true;
                clearInterval(profileDeleteState.countdownTimer);
                profileDeleteState.countdownTimer = null;
                elements.confirmButton.textContent = 'Törlés';
            }

            updateDeleteProfileConfirmButtonState();
        }, 1000);
    }
}

async function submitDeleteProfile() {
    const elements = getProfileDeleteElements();
    if (elements.passwordInput && elements.acknowledgeCheckbox && elements.confirmButton) {
        const currentPassword = elements.passwordInput.value || '';
        const passwordError = validateDeleteProfilePassword(currentPassword);
        const missingAcknowledge = !elements.acknowledgeCheckbox.checked;

        if (passwordError) {
            setDeleteProfilePasswordFeedback('error', passwordError);
            updateDeleteProfileConfirmButtonState();
        } else if (missingAcknowledge) {
            setDeleteProfileMessage('danger', 'Fogadd el, hogy a törlés nem visszavonható.');
            updateDeleteProfileConfirmButtonState();
        } else {
            profileDeleteState.submitting = true;
            elements.confirmButton.disabled = true;
            elements.confirmButton.textContent = 'Törlés folyamatban...';
            setDeleteProfileMessage('danger', '');

            try {
                const response = await fetch('/api/profile/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ currentPassword })
                });

                const result = await parseJson(response);
                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'A profil törlése nem sikerült.');
                }

                if (elements.modal) {
                    const modal = bootstrap.Modal.getOrCreateInstance(elements.modal);
                    modal.hide();
                }

                if (socket) {
                    socket.disconnect();
                }

                await refreshAuthUi('profile-delete-success');
                window.location.href = '/';
            } catch (error) {
                profileDeleteState.submitting = false;
                setDeleteProfileMessage('danger', error.message || 'Hiba történt a profil törlése közben.');
                updateDeleteProfileConfirmButtonState();
                throw new Error(error.message || 'Profil törlési hiba.');
            }
        }
    }
}

function bindProfileDeleteModalEvents() {
    try {
        const elements = getProfileDeleteElements();
        if (!elements.modal) {
            throw new Error('Hianyzik a delete profile modal.');
        }

        if (profileDeleteState.bound) {
            throw new Error('A delete profile esemenyek mar be vannak kotve.');
        }

        profileDeleteState.bound = true;

        if (elements.passwordInput) {
            elements.passwordInput.addEventListener('input', () => {
                runSafely('deleteProfilePasswordInput', () => {
                    setDeleteProfileMessage('danger', '');
                    updateDeleteProfileConfirmButtonState();
                });
            });

            elements.passwordInput.addEventListener('blur', () => {
                runSafely('deleteProfilePasswordBlur', () => {
                    updateDeleteProfileConfirmButtonState();
                });
            });
        }

        if (elements.acknowledgeCheckbox) {
            elements.acknowledgeCheckbox.addEventListener('change', () => {
                runSafely('deleteProfileAcknowledgeChange', () => {
                    setDeleteProfileMessage('danger', '');
                    updateDeleteProfileConfirmButtonState();
                });
            });
        }

        if (elements.confirmButton) {
            elements.confirmButton.addEventListener('click', async () => {
                await runSafelyAsync('deleteProfileConfirmClick', async () => {
                    await submitDeleteProfile();
                });
            });
        }

        elements.modal.addEventListener('show.bs.modal', () => {
            runSafely('deleteProfileModalShow', () => {
                resetDeleteProfileModalState();
                startDeleteProfileCountdown();
            });
        });

        elements.modal.addEventListener('hidden.bs.modal', () => {
            runSafely('deleteProfileModalHidden', () => {
                resetDeleteProfileModalState();
            });
        });
    } catch (error) {
        console.error('bindProfileDeleteModalEvents hiba:', error);
    }
}

