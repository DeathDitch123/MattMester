function getAccountStatusElements() {
    return {
        emailBadge: document.getElementById('accountStatusEmailBadge'),
        roleBadge: document.getElementById('accountStatusRoleBadge'),
        activeBadge: document.getElementById('accountStatusActiveBadge'),
        emailIconWrap: document.getElementById('accountStatusEmailIconWrap'),
        emailIcon: document.getElementById('accountStatusEmailIcon'),
        emailTitle: document.getElementById('accountStatusEmailTitle'),
        emailHint: document.getElementById('accountStatusEmailHint'),
        memberSince: document.getElementById('accountStatusMemberSince'),
        resendButton: document.getElementById('resendVerificationButton'),
        resendHint: document.getElementById('resendVerificationHint'),
        feedback: document.getElementById('accountStatusFeedback'),
        section: document.getElementById('accountStatus')
    };
}

function setAccountStatusFeedback(type, message) {
    const { feedback } = getAccountStatusElements();
    if (feedback) {
        feedback.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-warning', 'alert-info');
        if (message) {
            feedback.textContent = message;
            feedback.classList.add(`alert-${type || 'info'}`);
        } else {
            feedback.textContent = '';
            feedback.classList.add('d-none');
        }
    }
}

function scrollToAccountStatusAndHighlightResend() {
    const { section, resendButton } = getAccountStatusElements();
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    if (resendButton) {
        resendButton.classList.add('account-status-resend-highlight');
        if (accountStatusState.highlightTimer) {
            clearTimeout(accountStatusState.highlightTimer);
        }

        accountStatusState.highlightTimer = setTimeout(() => {
            resendButton.classList.remove('account-status-resend-highlight');
            accountStatusState.highlightTimer = null;
        }, 2400);
    }
}

function handleEmailNotVerifiedCta(payload) {
    const code = String(payload?.code || '').trim();
    let handled = false;
    if (code === EMAIL_VERIFICATION_REQUIRED_CODE) {
        handled = true;
        setAccountStatusFeedback('warning', 'A funkció használatához előbb erősítsd meg az email címed. Nyisd meg az Account Status szekciót és küldd újra a verifikációs emailt.');
        scrollToAccountStatusAndHighlightResend();
    }
    return handled;
}

function renderAccountStatus(sessionInfo) {
    try {
        const elements = getAccountStatusElements();
        const user = sessionInfo?.user || sessionInfo?.data?.user || null;
        if (!user) {
            throw new Error('Nincs felhasználó az account status megjelenítéséhez.');
        }

        const isVerified = Boolean(user.is_email_verified);
        const role = String(user.role || 'player').toLowerCase();
        const roleLabel = role === 'admin' ? 'Administrator' : 'Player';
        const memberDate = user.created_at ? new Date(user.created_at) : null;
        const memberSinceText = memberDate && !Number.isNaN(memberDate.getTime())
            ? memberDate.toLocaleDateString('hu-HU')
            : 'Ismeretlen';

        if (elements.emailBadge) {
            elements.emailBadge.className = `badge ${isVerified ? 'bg-success' : 'bg-warning text-dark'}`;
            elements.emailBadge.textContent = isVerified ? 'Verified' : 'Not Verified';
        }

        if (elements.roleBadge) {
            elements.roleBadge.className = `badge ${role === 'admin' ? 'badge-admin' : 'badge-player'}`;
            elements.roleBadge.textContent = roleLabel;
        }

        if (elements.activeBadge) {
            elements.activeBadge.className = `badge ${user.is_banned ? 'bg-danger' : 'bg-success'}`;
            elements.activeBadge.textContent = user.is_banned ? 'Banned' : 'Active';
        }

        if (elements.emailIconWrap) {
            elements.emailIconWrap.style.color = isVerified ? 'var(--accent-green)' : 'var(--accent-red)';
            elements.emailIconWrap.style.backgroundColor = isVerified ? 'rgba(16, 185, 129, 0.1)' : 'rgba(233, 69, 96, 0.12)';
        }

        if (elements.emailIcon) {
            elements.emailIcon.setAttribute('data-lucide', isVerified ? 'mail-check' : 'mail-warning');
            if (window.lucide?.createIcons) {
                window.lucide.createIcons();
            }
        }

        if (elements.emailTitle) {
            elements.emailTitle.textContent = isVerified ? 'Email megerősítve' : 'Email megerősítés szükséges';
        }

        if (elements.emailHint) {
            elements.emailHint.textContent = isVerified
                ? 'A fiókod email szempontból védett.'
                : 'A fiókod még nincs megerősítve. Kérj új verifikációs emailt, ha nem kaptad meg a levelet.';
        }

        if (elements.resendHint) {
            elements.resendHint.textContent = isVerified
                ? 'Az email címed már megerősítve, nincs további teendő.'
                : 'Ha nem érkezik email, ellenőrizd a spam/promóciók mappát is.';
        }

        if (elements.resendButton) {
            elements.resendButton.disabled = isVerified || accountStatusState.sending;
            elements.resendButton.classList.toggle('opacity-75', isVerified);
            elements.resendButton.title = isVerified
                ? 'Az email címed már megerősítve.'
                : 'Kattints új verifikációs email küldéséhez.';

            if (!accountStatusState.sending) {
                elements.resendButton.innerHTML = '<i data-lucide="send" style="width: 16px; height: 16px;"></i> Verifikációs email újraküldése';
            }
        }

        if (elements.memberSince) {
            elements.memberSince.textContent = memberSinceText;
        }
    } catch (error) {
        console.error('renderAccountStatus hiba:', error);
    }
}

function mapResendVerificationErrorMessage(payload, statusCode) {
    const responseCode = String(payload?.code || '').trim();
    let message = 'Email küldés sikertelen, ellenőrizd az SMTP beállításokat vagy próbáld újra később.';

    if (responseCode === EMAIL_RESEND_RATE_LIMIT_CODE || Number(statusCode) === 429) {
        message = payload?.message || 'Túl sok újraküldési kérés érkezett. Próbáld újra 15 perc múlva.';
    } else if (responseCode === EMAIL_SEND_FAILED_CODE) {
        message = payload?.message || 'Email küldés sikertelen, ellenőrizd az SMTP beállításokat vagy próbáld újra később.';
    } else if (responseCode === EMAIL_VERIFICATION_REQUIRED_CODE) {
        message = payload?.message || 'A fiókod még nincs megerősítve. Küldj új verifikációs emailt az Account Status részből.';
    } else if (payload?.message) {
        message = payload.message;
    }

    return message;
}

async function resendVerificationEmailFromAccountStatus() {
    try {
        const elements = getAccountStatusElements();
        if (!elements.resendButton) {
            throw new Error('Hiányzik a verifikációs újraküldés gomb.');
        }

        accountStatusState.sending = true;
        elements.resendButton.disabled = true;
        elements.resendButton.innerHTML = '<i data-lucide="loader-circle" style="width: 16px; height: 16px;"></i> Küldés folyamatban...';
        if (window.lucide?.createIcons) {
            window.lucide.createIcons();
        }

        const response = await fetch('/api/auth/resend-verification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await parseJson(response);

        if (!response.ok || !result.success) {
            handleEmailNotVerifiedCta(result);
            throw new Error(mapResendVerificationErrorMessage(result, response.status));
        }

        setAccountStatusFeedback('success', result.message || 'Új verifikációs email elküldve. Ellenőrizd a postaládád és a spam mappát is.');
        await refreshAuthUi('profile-account-status-resend-success');
    } catch (error) {
        setAccountStatusFeedback('danger', error.message || 'Email küldés sikertelen, ellenőrizd az SMTP beállításokat vagy próbáld újra később.');
    } finally {
        accountStatusState.sending = false;
        try {
            const sessionInfo = await fetchSessionInfo();
            renderAccountStatus(sessionInfo);
        } catch (refreshError) {
            console.error('Account Status frissítési hiba újraküldés után:', refreshError);
        }
    }
}

function bindAccountStatusEvents() {
    try {
        if (!accountStatusState.bound) {
            const { resendButton } = getAccountStatusElements();
            if (!resendButton) {
                throw new Error('Az Account Status újraküldés gomb nem található.');
            }

            resendButton.addEventListener('click', async () => {
                await runSafelyAsync('accountStatusResendVerificationClick', async () => {
                    await resendVerificationEmailFromAccountStatus();
                });
            });

            accountStatusState.bound = true;
        }
    } catch (error) {
        console.error('bindAccountStatusEvents hiba:', error);
    }
}

async function syncSocketContextOrReconnect(reason = 'session-mutation') {
    try {
        if (!window.MattMesterSocket?.syncSocketContextOrReconnect) {
            throw new Error('A közös socket sync API nem érhető el.');
        }

        await window.MattMesterSocket.syncSocketContextOrReconnect(reason);
    } catch (error) {
        throw new Error(`Socket context szinkronizálási hiba: ${error.message}`);
    }
}

