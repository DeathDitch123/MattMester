function handleProfileSettings(sessionInfo) {
    try {
        const user = sessionInfo?.user || sessionInfo?.data?.user || null;
        if (!user) {
            throw new Error(tx('Nincs bejelentkezett felhasznalo a statok megjelenitesehez.', 'No logged-in user to display stats for.'));
        }
        const settingsUsername = document.getElementById('settingsUsername');
        const settingsEmail = document.getElementById('settingsEmail');
        const settingsNewPassword = document.getElementById('settingsNewPassword');
        const settingsConfirmPassword = document.getElementById('settingsConfirmPassword');
        applyProfileImagePresentation(user);

        if (settingsUsername) {
            settingsUsername.value = user.username;
        }
        if (settingsEmail) {
            settingsEmail.value = user.email;
        }
        if (settingsNewPassword) {
            settingsNewPassword.value = '';
        }
        if (settingsConfirmPassword) {
            settingsConfirmPassword.value = '';
        }

        profileSettingsState.initial = {
            username: (user.username || '').trim(),
            email: (user.email || '').trim()
        };

        if (!profileSettingsState.bound) {
            bindProfileSettingsEvents();
            profileSettingsState.bound = true;
        }

        validateProfileSettingsForm();
    } catch (error) {
        console.error('Hiba a profil beállítások kezelésekor:', error);
    }
}

function bindProfileSettingsEvents() {
    try {
        const elements = getProfileSettingsElements();
        if (!elements.form) {
            throw new Error(tx('Hianyzik a profile settings form.', 'Missing profile settings form.'));
        }

        const onInputChange = () => {
            runSafely('profileSettingsOnInputChange', () => {
                validateProfileSettingsForm();
            });
        };

        [elements.usernameInput, elements.emailInput, elements.newPasswordInput, elements.confirmPasswordInput]
            .filter(Boolean)
            .forEach((element) => {
                element.addEventListener('input', onInputChange);
                element.addEventListener('blur', onInputChange);
            });

        elements.form.addEventListener('submit', (event) => {
            runSafely('profileSettingsSubmit', () => {
                event.preventDefault();

                const validation = validateProfileSettingsForm();
                if (!validation.isValid) {
                    throw new Error(tx('Ervenytelen profile settings form.', 'Invalid profile settings form.'));
                }

                profileSettingsState.pendingPayload = validation.payload;
                openProfileSettingsConfirmModal(validation.changedFieldLabels);
            });
        });

        if (elements.confirmSaveButton) {
            elements.confirmSaveButton.addEventListener('click', async () => {
                await runSafelyAsync('profileSettingsConfirmSave', async () => {
                    await submitProfileSettingsChanges();
                });
            });
        }

        if (elements.modalCurrentPasswordInput) {
            elements.modalCurrentPasswordInput.addEventListener('input', () => {
                runSafely('profileSettingsModalPasswordInput', () => {
                    verifyModalCurrentPassword();
                });
            });

            elements.modalCurrentPasswordInput.addEventListener('blur', () => {
                runSafely('profileSettingsModalPasswordBlur', () => {
                    verifyModalCurrentPassword();
                });
            });
        }

        if (elements.confirmModal) {
            elements.confirmModal.addEventListener('hidden.bs.modal', () => {
                runSafely('profileSettingsModalHidden', () => {
                    profileSettingsState.pendingPayload = null;
                    profileSettingsState.passwordVerified = false;
                    profileSettingsState.requiresPasswordCheck = false;
                    resetProfileSettingsConfirmState();
                });
            });
        }
    } catch (error) {
        console.error('bindProfileSettingsEvents hiba:', error);
    }
}

function getProfileSettingsElements() {
    return {
        form: document.getElementById('profileSettingsForm'),
        usernameInput: document.getElementById('settingsUsername'),
        emailInput: document.getElementById('settingsEmail'),
        newPasswordInput: document.getElementById('settingsNewPassword'),
        confirmPasswordInput: document.getElementById('settingsConfirmPassword'),
        usernameFeedback: document.getElementById('settingsUsernameFeedback'),
        emailFeedback: document.getElementById('settingsEmailFeedback'),
        newPasswordFeedback: document.getElementById('settingsNewPasswordFeedback'),
        confirmPasswordFeedback: document.getElementById('settingsConfirmPasswordFeedback'),
        formMessage: document.getElementById('profileSettingsMessage'),
        saveButton: document.getElementById('profileSettingsSaveButton'),
        confirmModal: document.getElementById('confirmProfileSettingsModal'),
        confirmSaveButton: document.getElementById('profileSettingsConfirmSaveButton'),
        confirmHint: document.getElementById('profileSettingsConfirmHint'),
        changesList: document.getElementById('profileSettingsChangesList'),
        modalMessage: document.getElementById('profileSettingsModalMessage'),
        modalPasswordBlock: document.getElementById('profileSettingsModalPasswordBlock'),
        modalCurrentPasswordInput: document.getElementById('modalCurrentPassword'),
        modalCurrentPasswordFeedback: document.getElementById('modalCurrentPasswordFeedback')
    };
}

function applyInputFeedback(inputElement, feedbackElement, state, message) {
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

function validatePasswordByPolicy(passwordInput, {
    required = true,
    minLength = 8,
    enforceComplexity = true,
    allowBackslash = false
} = {}) {
    const password = String(passwordInput || '');
    let error = '';

    if (!password) {
        if (required) {
            error = tx('A jelenlegi jelszó kötelező.', 'The current password is required.');
        }
    } else if (!allowBackslash && password.includes('\\')) {
        error = tx('A jelszó nem megengedett karaktert tartalmaz.', 'The password contains a disallowed character.');
    } else if (password.length < minLength) {
        error = tx(`A jelszónak legalább ${minLength} karakter hosszú kell legyen.`, `The password must be at least ${minLength} characters long.`);
    } else if (enforceComplexity && !PASSWORD_REGEX.test(password)) {
        error = tx('A jelszónak tartalmaznia kell nagybetűt, kisbetűt és számot.', 'The password must contain an uppercase letter, lowercase letter, and a number.');
    }

    return {
        isValid: !error,
        error
    };
}

function setProfileSettingsMessage(type, message) {
    const { formMessage, modalMessage } = getProfileSettingsElements();
    const messageTargets = [formMessage, modalMessage].filter(Boolean);
    if (!messageTargets.length) {
        return;
    }

    if (!message) {
        messageTargets.forEach((target) => {
            target.className = 'alert d-none mb-0';
            target.textContent = '';
        });
        return;
    }

    messageTargets.forEach((target) => {
        target.className = `alert alert-${type} mb-0`;
        target.textContent = message;
    });
}

function validateProfileSettingsForm() {
    const elements = getProfileSettingsElements();
    if (!elements.form || !profileSettingsState.initial) {
        return { isValid: false, payload: null, changedFieldLabels: [] };
    }

    const values = {
        username: (elements.usernameInput?.value || '').trim(),
        email: (elements.emailInput?.value || '').trim(),
        newPassword: elements.newPasswordInput?.value || '',
        confirmPassword: elements.confirmPasswordInput?.value || ''
    };

    const fieldErrors = {
        username: '',
        email: '',
        newPassword: '',
        confirmPassword: ''
    };

    const hasUsernameChanged = values.username !== profileSettingsState.initial.username;
    const hasEmailChanged = values.email !== profileSettingsState.initial.email;
    if (!values.username) {
        fieldErrors.username = tx('A felhasználónév kötelező.', 'The username is required.');
    } else if (values.username.length < 3 || values.username.length > 50) {
        fieldErrors.username = tx('A felhasználónévnek 3 és 50 karakter között kell lennie.', 'The username must be between 3 and 50 characters.');
    } else if (!USERNAME_REGEX.test(values.username)) {
        fieldErrors.username = tx('A felhasználónév formátuma érvénytelen.', 'The username format is invalid.');
    }

    if (!values.email) {
        fieldErrors.email = tx('Az e-mail cím kötelező.', 'The email address is required.');
    } else if (!EMAIL_REGEX.test(values.email)) {
        fieldErrors.email = tx('Érvénytelen e-mail formátum.', 'Invalid email format.');
    }

    if (values.confirmPassword && !values.newPassword) {
        fieldErrors.newPassword = tx('Adj meg új jelszót is.', 'Please also provide a new password.');
    }

    if (values.newPassword) {
        const passwordValidation = validatePasswordByPolicy(values.newPassword, {
            required: false,
            minLength: 8,
            enforceComplexity: true,
            allowBackslash: false
        });
        fieldErrors.newPassword = passwordValidation.error;
    }

    if (values.newPassword || values.confirmPassword) {
        if (!values.confirmPassword) {
            fieldErrors.confirmPassword = tx('Erősítsd meg az új jelszót.', 'Please confirm the new password.');
        } else if (values.newPassword !== values.confirmPassword) {
            fieldErrors.confirmPassword = tx('A két jelszó nem egyezik.', 'The two passwords do not match.');
        }
    }

    const hasFieldError = Object.values(fieldErrors).some(Boolean);
    const hasAnyChange = hasUsernameChanged || hasEmailChanged || values.newPassword.length > 0;
    const isValid = !hasFieldError && hasAnyChange;

    applyInputFeedback(
        elements.usernameInput,
        elements.usernameFeedback,
        fieldErrors.username ? 'error' : (hasUsernameChanged ? 'success' : 'neutral'),
        fieldErrors.username || (hasUsernameChanged ? tx('A felhasználónév módosításra kerül.', 'The username will be updated.') : tx('Nincs változás.', 'No change.'))
    );

    applyInputFeedback(
        elements.emailInput,
        elements.emailFeedback,
        fieldErrors.email ? 'error' : (hasEmailChanged ? 'success' : 'neutral'),
        fieldErrors.email || (hasEmailChanged ? tx('Az e-mail cím módosításra kerül.', 'The email address will be updated.') : tx('Nincs változás.', 'No change.'))
    );

    applyInputFeedback(
        elements.newPasswordInput,
        elements.newPasswordFeedback,
        fieldErrors.newPassword ? 'error' : (values.newPassword ? 'success' : 'neutral'),
        fieldErrors.newPassword || (values.newPassword ? tx('Az új jelszó formátuma megfelelő.', 'The new password format is valid.') : tx('A jelszó nem változik.', 'The password will not change.'))
    );

    applyInputFeedback(
        elements.confirmPasswordInput,
        elements.confirmPasswordFeedback,
        fieldErrors.confirmPassword ? 'error' : (values.confirmPassword ? 'success' : 'neutral'),
        fieldErrors.confirmPassword || (values.confirmPassword ? tx('A jelszó megerősítése rendben.', 'Password confirmation is OK.') : tx('Megerősítés nem szükséges.', 'No confirmation needed.'))
    );

    if (elements.saveButton) {
        elements.saveButton.disabled = !isValid;
    }

    if (hasFieldError) {
        const firstError = Object.values(fieldErrors).find(Boolean);
        setProfileSettingsMessage('danger', firstError || tx('Ellenőrizd a mezőket.', 'Please check the fields.'));
    } else if (!hasAnyChange) {
        setProfileSettingsMessage('warning', tx('Nincs változás. Módosíts legalább egy mezőt a mentéshez.', 'No change. Modify at least one field to save.'));
    } else {
        setProfileSettingsMessage('success', tx('Minden rendben, mentésre kész.', 'All good, ready to save.'));
    }

    const changedFieldLabels = [];
    if (hasUsernameChanged) {
        changedFieldLabels.push(`${tx('Felhasználónév:', 'Username:')} ${profileSettingsState.initial.username} -> ${values.username}`);
    }
    if (hasEmailChanged) {
        changedFieldLabels.push(`${tx('Email:', 'Email:')} ${profileSettingsState.initial.email} -> ${values.email}`);
    }
    if (values.newPassword) {
        changedFieldLabels.push(tx('Jelszó frissítésre kerül.', 'The password will be updated.'));
    }

    const payload = isValid ? {
        username: values.username,
        email: values.email,
        newPassword: values.newPassword
    } : null;

    return { isValid, payload, changedFieldLabels };
}

function resetProfileSettingsConfirmState() {
    const elements = getProfileSettingsElements();
    if (profileSettingsState.countdownTimer) {
        clearInterval(profileSettingsState.countdownTimer);
        profileSettingsState.countdownTimer = null;
    }

    profileSettingsState.countdownLeft = PROFILE_SETTINGS_CONFIRM_SECONDS;
    profileSettingsState.countdownFinished = false;

    if (elements.confirmSaveButton) {
        elements.confirmSaveButton.disabled = true;
        elements.confirmSaveButton.textContent = `${tx('Mentés', 'Save')} (${PROFILE_SETTINGS_CONFIRM_SECONDS}s)`;
    }

    if (elements.confirmHint) {
        elements.confirmHint.textContent = `${tx('A mentés gomb', 'The save button')} ${PROFILE_SETTINGS_CONFIRM_SECONDS} ${tx('másodperc múlva lesz aktív.', 'seconds will activate.')}`;
    }

    if (elements.modalCurrentPasswordInput) {
        elements.modalCurrentPasswordInput.value = '';
    }

    setModalCurrentPasswordFeedback('neutral', '');

}

function openProfileSettingsConfirmModal(changedFieldLabels) {
    const elements = getProfileSettingsElements();
    if (elements.confirmModal && elements.changesList) {
        profileSettingsState.requiresPasswordCheck = true;
        profileSettingsState.passwordVerified = !profileSettingsState.requiresPasswordCheck;

        elements.changesList.innerHTML = '';
        changedFieldLabels.forEach((label) => {
            const item = document.createElement('li');
            item.className = 'text-light mb-1';
            item.textContent = label;
            elements.changesList.appendChild(item);
        });

        resetProfileSettingsConfirmState();

        if (elements.modalPasswordBlock) {
            elements.modalPasswordBlock.classList.remove('d-none');
        }

        if (profileSettingsState.requiresPasswordCheck) {
            setModalCurrentPasswordFeedback('neutral', tx('A mentéshez add meg a jelenlegi jelszavad.', 'Enter your current password to save.'));
        }

        const modal = bootstrap.Modal.getOrCreateInstance(elements.confirmModal);
        modal.show();

        profileSettingsState.countdownTimer = setInterval(() => {
            profileSettingsState.countdownLeft -= 1;

            if (elements.confirmSaveButton) {
                if (profileSettingsState.countdownLeft > 0) {
                    elements.confirmSaveButton.textContent = `${tx('Mentés', 'Save')} (${profileSettingsState.countdownLeft}s)`;
                } else {
                    profileSettingsState.countdownFinished = true;
                    elements.confirmSaveButton.textContent = tx('Mentés', 'Save');
                    updateModalSaveButtonState();
                }
            }

            if (elements.confirmHint) {
                elements.confirmHint.textContent = profileSettingsState.countdownLeft > 0
                    ? `${tx('A mentés gomb', 'The save button')} ${profileSettingsState.countdownLeft} ${tx('másodperc múlva lesz aktív.', 'seconds will activate.')}`
                    : tx('A mentés gomb most már aktív.', 'The save button is now active.');
            }

            if (profileSettingsState.countdownLeft <= 0) {
                clearInterval(profileSettingsState.countdownTimer);
                profileSettingsState.countdownTimer = null;
            }
        }, 1000);
    }
}

function setModalCurrentPasswordFeedback(state, message) {
    const { modalCurrentPasswordInput, modalCurrentPasswordFeedback } = getProfileSettingsElements();
    if (modalCurrentPasswordInput && modalCurrentPasswordFeedback) {
        modalCurrentPasswordInput.classList.remove('is-valid', 'is-invalid');
        modalCurrentPasswordFeedback.classList.remove('text-secondary', 'text-success', 'text-danger');
        modalCurrentPasswordFeedback.textContent = message;

        if (state === 'success') {
            modalCurrentPasswordInput.classList.add('is-valid');
            modalCurrentPasswordFeedback.classList.add('text-success');
        } else if (state === 'error') {
            modalCurrentPasswordInput.classList.add('is-invalid');
            modalCurrentPasswordFeedback.classList.add('text-danger');
        } else {
            modalCurrentPasswordFeedback.classList.add('text-secondary');
        }
    }
}

function updateModalSaveButtonState() {
    const { confirmSaveButton } = getProfileSettingsElements();
    if (confirmSaveButton) {
        const readyByPassword = profileSettingsState.requiresPasswordCheck ? profileSettingsState.passwordVerified : true;
        confirmSaveButton.disabled = !(profileSettingsState.countdownFinished && readyByPassword);
    }
}

function verifyModalCurrentPassword() {
    const elements = getProfileSettingsElements();
    if (profileSettingsState.requiresPasswordCheck && elements.modalCurrentPasswordInput) {
        const currentPassword = elements.modalCurrentPasswordInput.value;
        const passwordValidation = validatePasswordByPolicy(currentPassword, {
            required: true,
            minLength: 8,
            enforceComplexity: true,
            allowBackslash: false
        });

        if (!passwordValidation.isValid) {
            profileSettingsState.passwordVerified = false;
            setModalCurrentPasswordFeedback('error', passwordValidation.error);
        } else {
            profileSettingsState.passwordVerified = true;
            setModalCurrentPasswordFeedback('success', tx('A jelszó formátuma megfelelő.', 'The password format is valid.'));
        }

        updateModalSaveButtonState();
    }
}

async function submitProfileSettingsChanges() {
    const elements = getProfileSettingsElements();
    if (profileSettingsState.pendingPayload && elements.confirmSaveButton) {
        elements.confirmSaveButton.disabled = true;
        elements.confirmSaveButton.textContent = tx('Mentés folyamatban...', 'Saving...');

        try {
            const response = await fetch('/api/profile/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...profileSettingsState.pendingPayload,
                    currentPassword: elements.modalCurrentPasswordInput?.value || ''
                })
            });

            const result = await parseJson(response);
            if (!response.ok || !result.success) {
                handleEmailNotVerifiedCta(result);
                if (result?.code === 'PASSWORD_SAME_AS_OLD') {
                    const sameAsOldMessage = tx('Az új jelszó nem lehet ugyanaz, mint a jelenlegi jelszó!', 'The new password cannot be the same as the current password!');
                    applyInputFeedback(
                        elements.newPasswordInput,
                        elements.newPasswordFeedback,
                        'error',
                        sameAsOldMessage
                    );
                    applyInputFeedback(
                        elements.confirmPasswordInput,
                        elements.confirmPasswordFeedback,
                        'error',
                        tx('Adj meg egy másik jelszót.', 'Please enter a different password.')
                    );
                    if (elements.confirmModal) {
                        const modal = bootstrap.Modal.getOrCreateInstance(elements.confirmModal);
                        modal.hide();
                    }
                    if (elements.newPasswordInput) {
                        elements.newPasswordInput.focus();
                    }
                }
                throw new Error(result.message || tx('Nem sikerült menteni a profil beállításokat.', 'Failed to save the profile settings.'));
            }

            setProfileSettingsMessage('success', result.message || tx('A profil beállítások sikeresen frissültek.', 'Profile settings updated successfully.'));
            if (result?.emailVerification?.required) {
                if (result?.emailVerification?.sent) {
                    setAccountStatusFeedback('warning', tx('Az email címed megváltozott és most újra nem verifikált állapotban van. A megerősítő emailt elküldtük, kérjük erősítsd meg a címet.', 'Your email address has changed and is again unverified. The confirmation email has been sent, please verify the address.'));
                } else {
                    setAccountStatusFeedback('danger', tx('Az email címed megváltozott, de a verifikációs email küldése sikertelen volt. Kattints az újraküldés gombra az Account Status szekcióban.', 'Your email has changed, but sending the verification email failed. Click the resend button in the Account Status section.'));
                    scrollToAccountStatusAndHighlightResend();
                }
            }
            profileSettingsState.pendingPayload = null;

            if (elements.newPasswordInput) {
                elements.newPasswordInput.value = '';
            }
            if (elements.confirmPasswordInput) {
                elements.confirmPasswordInput.value = '';
            }
            if (elements.confirmModal) {
                const modal = bootstrap.Modal.getOrCreateInstance(elements.confirmModal);
                modal.hide();
            }

            await syncSocketContextOrReconnect('profile-settings-save');
            await refreshAuthUi('profile-settings-save-success');
        } catch (error) {
            setProfileSettingsMessage('danger', error.message || tx('Hiba történt a mentés során.', 'An error occurred during save.'));
            elements.confirmSaveButton.textContent = tx('Mentés', 'Save');
            updateModalSaveButtonState();
            throw new Error(error.message || tx('Profil beállítás mentési hiba.', 'Profile settings save error.'));
        }
    }
}

