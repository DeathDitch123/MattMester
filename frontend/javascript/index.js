document.addEventListener('DOMContentLoaded', () => {
    bindLoginForm();
    bindRegisterForm();
    refreshAuthUi();
    loadGame();
});
async function test(nehezseg) {
    try {
        const roundInfo = await safeFetch(`/api/roundInfo/${nehezseg}`);
        console.log(roundInfo);
    } catch (error) {
        console.error('Hiba a roundInfo lekérésekor:', error);
        showToast('Hiba történt a teszt során.', 'danger');
    }
}
async function loadGame() {
    const roundDisplay = document.getElementById('roundDisplay');

    try {
        const userdata = await safeFetch('/api/session-info');

        // Játék kezdetén reseteljük a segítségeket
        await safeFetch('/api/questHelpDesk/reset');

        // Játék kezdetén beállítjuk a segítségek állapotát
        await manageHelpDesk(userdata.success);

        if (userdata.success) {
            await playLoggedInGame(userdata.userdata, roundDisplay);
        } else {
            showToast('Nincs bejelentkezve. Guestként folytatod a játékot.', 'warning');
            await playGuestGame(roundDisplay);
        }
    } catch (error) {
        console.error('Hiba a játék betöltésekor:', error);
        showToast('Hiba történt a játék betöltésekor.', 'danger');
    } finally {
        roundDisplay.textContent = 'Játék vége.';
    }
}

async function playLoggedInGame(userData, roundDisplay) {
    let i = userData.round || 1;
    let currentQuestionId = userData.question;
    let gameOver = false;

    roundDisplay.textContent = `${i}. KÖR`;
    console.log(`Bejelentkezve: ${userData.username}, KÖR: ${i}`);
    updatePyramid(i);

    while (i <= 15 && !gameOver) {
        try {
            let roundInfo;

            if (currentQuestionId) {
                roundInfo = await safeFetch(`/api/question/${currentQuestionId}`);
                currentQuestionId = null;
            } else {
                roundInfo = await safeFetch(`/api/roundInfo/${i}`);
                await safeFetch('/api/updateProgress', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ round: i, question: roundInfo.data.id })
                });
            }

            console.log(roundInfo);
            displayQuestion(roundInfo.data);
            roundDisplay.textContent = `${i}. KÖR`;

            answerInit(roundInfo.data.valaszok);
            const answerId = await waitForAnswer();
            console.log(`Válasz ID: ${answerId}`);

            const checkResponse = await safeFetch('/api/checkAnswer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answerId })
            });
            console.log(checkResponse);

            if (checkResponse.correct) {
                i++;
                if (i <= 15) {
                    updatePyramid(i);
                    await safeFetch('/api/updateProgress', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ round: i, question: null })
                    });
                } else {
                    showToast('Nyertél! Gratulálunk!', 'success');
                    await safeFetch('/api/updateProgress', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ round: 1, question: null })
                    });
                }
            } else {
                gameOver = true;
                showToast('Helytelen válasz! Játék vége.', 'danger');
                await safeFetch('/api/updateProgress', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ round: 1, question: null })
                });
            }
        } catch (error) {
            console.error('Hiba a játék körében:', error);
            showToast('Hiba történt a játék során.', 'danger');
            gameOver = true;
        }
    }
}

async function playGuestGame(roundDisplay) {
    let i = 1;
    let gameOver = false;

    roundDisplay.textContent = `GUEST KÖR: ${i}`;
    updatePyramid(i);

    while (i <= 15 && !gameOver) {
        try {
            const roundInfo = await safeFetch(`/api/roundInfo/${i}`);
            console.log(roundInfo);

            displayQuestion(roundInfo.data);
            roundDisplay.textContent = `GUEST KÖR: ${i}`;

            answerInit(roundInfo.data.valaszok);
            const answerId = await waitForAnswer();
            console.log(`Válasz ID: ${answerId}`);

            const checkResponse = await safeFetch('/api/checkAnswer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ answerId })
            });
            console.log(checkResponse);

            if (checkResponse.correct) {
                i++;
                if (i <= 15) updatePyramid(i);
            } else {
                gameOver = true;
                showToast('Helytelen válasz! Játék vége.', 'danger');
            }
        } catch (error) {
            console.error('Hiba a vendég játékban:', error);
            showToast('Hiba történt a játék során.', 'danger');
            gameOver = true;
        }
    }
}

function displayQuestion(questionData) {
    const questionDisplay = document.getElementById('currentQuestion');
    if (questionDisplay) {
        questionDisplay.textContent = questionData.kerdes;
    }
}

async function requestHelp(helpType, loggedIn, userId, buttonElement) {
    try {
        const response = await safeFetch(`/api/questHelpDesk/${helpType}`);

        if (response.success) {
            const helpMessages = {
                telefon: 'Telefon segítség',
                felez: 'Fél-kérdés segítség',
                kozonseg: 'Közönség segítség'
            };

            showToast(`${helpMessages[helpType]}: ${response.data}`, 'info');

            if (loggedIn && userId) {
                await safeFetch('/api/update-lifeline', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: userId,
                        type: helpType === 'kozonseg' ? 'nezok' : helpType,
                        status: false
                    })
                });
            }

            // Frissítjük a gombok állapotát a backend válasz alapján
            updateHelpButtonsFromBackend(response.data);
        } else {
            const errorMessages = {
                telefon: 'Telefon segítség sikertelen',
                felez: 'Fél-kérdés segítség sikertelen',
                kozonseg: 'Közönség segítség sikertelen'
            };

            showToast(`${errorMessages[helpType]}: ${response.message}`, 'danger');
        }
    } catch (error) {
        console.error(`Hiba a ${helpType} segítség kérésénél:`, error);
        showToast('Hiba történt a segítség kérésénél.', 'danger');
    }
}

function telefonHelp(loggedIn, userId) {
    // Segítségkérés helye: telefon gomb event listener
    const telefonBtn = document.getElementById('telefon');
    telefonBtn.addEventListener('click', () => requestHelp('telefon', loggedIn, userId, telefonBtn));
}

function felezHelp(loggedIn, userId) {
    // Segítségkérés helye: felez gomb event listener
    const felezBtn = document.getElementById('felez');
    felezBtn.addEventListener('click', () => requestHelp('felez', loggedIn, userId, felezBtn));
}

function kozonsegHelp(loggedIn, userId) {
    // Segítségkérés helye: kozonseg gomb event listener
    const kozonsegBtn = document.getElementById('kozonseg');
    kozonsegBtn.addEventListener('click', () => requestHelp('kozonseg', loggedIn, userId, kozonsegBtn));
}

async function manageHelpDesk(loggedIn) {
    const telefonBtn = document.getElementById('telefon');
    const felezBtn = document.getElementById('felez');
    const kozonsegBtn = document.getElementById('kozonseg');

    try {
        if (!loggedIn) {
            // Guest mód: lekérdezzük a jelenlegi állapotot a backend-től
            const helpDeskInfo = await safeFetch('/api/questHelpDesk/status');

            if (helpDeskInfo.success) {
                updateHelpButtonsFromBackend(helpDeskInfo.data);

                telefonHelp(loggedIn);
                felezHelp(loggedIn);
                kozonsegHelp(loggedIn);
            } else {
                console.error('Hiba a helpdesk státusz lekérésekor:', helpDeskInfo.message);
            }
        } else {
            // Bejelentkezett mód: alapértelmezetten minden segítség elérhető
            const initialStatus = { telefon: true, felez: true, kozonseg: true };
            updateHelpButtonsFromBackend(initialStatus);

            telefonHelp(loggedIn, loggedIn ? await getCurrentUserId() : null);
            felezHelp(loggedIn, loggedIn ? await getCurrentUserId() : null);
            kozonsegHelp(loggedIn, loggedIn ? await getCurrentUserId() : null);
        }
    } catch (error) {
        console.error('Hiba a helpdesk kezelésekor:', error);
        showToast('Hiba történt a helpdesk kezelésekor.', 'danger');
    }
}

async function getCurrentUserId() {
    try {
        const sessionInfo = await safeFetch('/api/session-info');
        return sessionInfo.success ? sessionInfo.userdata.id : null;
    } catch (error) {
        console.error('Hiba a felhasználói ID lekérésekor:', error);
        return null;
    }
}

function disableAllHelpButtons() {
    const telefonBtn = document.getElementById('telefon');
    const felezBtn = document.getElementById('felez');
    const kozonsegBtn = document.getElementById('kozonseg');

    if (telefonBtn) telefonBtn.disabled = true;
    if (felezBtn) felezBtn.disabled = true;
    if (kozonsegBtn) kozonsegBtn.disabled = true;
}

function updateHelpButtonsFromBackend(helpStatus) {
    const telefonBtn = document.getElementById('telefon');
    const felezBtn = document.getElementById('felez');
    const kozonsegBtn = document.getElementById('kozonseg');

    // Telefon segítség frissítése
    if (telefonBtn) {
        telefonBtn.disabled = !helpStatus.telefon;
        if (!helpStatus.telefon) {
            telefonBtn.classList.add('btn-danger');
            telefonBtn.classList.remove('btn-warning');
        } else {
            telefonBtn.classList.add('btn-warning');
            telefonBtn.classList.remove('btn-danger');
        }
    }

    // Fél-kérdés segítség frissítése
    if (felezBtn) {
        felezBtn.disabled = !helpStatus.felez;
        if (!helpStatus.felez) {
            felezBtn.classList.add('btn-danger');
            felezBtn.classList.remove('btn-warning');
        } else {
            felezBtn.classList.add('btn-warning');
            felezBtn.classList.remove('btn-danger');
        }
    }

    // Közönség segítség frissítése
    if (kozonsegBtn) {
        kozonsegBtn.disabled = !helpStatus.kozonseg;
        if (!helpStatus.kozonseg) {
            kozonsegBtn.classList.add('btn-danger');
            kozonsegBtn.classList.remove('btn-warning');
        } else {
            kozonsegBtn.classList.add('btn-warning');
            kozonsegBtn.classList.remove('btn-danger');
        }
    }
}
function bindLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;

            try {
                const result = await safeFetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, user_password: password })
                });

                if (result.success) {
                    loginForm.reset();
                    hideModalById('loginModal');
                    showToast('Sikeres bejelentkezés.');
                } else {
                    showToast('Sikertelen bejelentkezés.', 'danger');
                }

                await refreshAuthUi();

            } catch (error) {
                console.error('Hiba a bejelentkezés során:', error);
                showToast('Hiba történt a bejelentkezés során.', 'danger');
            }
        });
    }
}

async function safeFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`API call failed for ${url}:`, error);
        throw error;
    }
}

async function parseJson(response) {
    try {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('JSON parsing error:', error);
        throw error;
    }
}

async function handleLogout() {
    try {
        const result = await safeFetch('/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        showToast(result.message || 'Sikeres kijelentkezés.');
        await refreshAuthUi();

    } catch (error) {
        console.error('Hiba a kijelentkezés során:', error);
        showToast('Hiba történt a kijelentkezés során.', 'danger');
    }
}

function bindRegisterForm() {
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const username = document.getElementById('registerUsername').value.trim();
            const password = document.getElementById('registerPassword').value;

            try {
                const result = await safeFetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, user_password: password })
                });

                if (!result.success) {
                    showToast('Sikertelen regisztráció.', 'danger');
                } else {
                    registerForm.reset();
                    hideModalById('registerModal');
                    await refreshAuthUi();
                    showToast('Sikeres regisztráció. Most már bejelentkezhetsz.');
                }
            } catch (error) {
                console.error('Hiba a regisztráció során:', error);
                showToast('Nem sikerült csatlakozni a szerverhez.', 'danger');
            }
        });
    }
}
function hideModalById(modalId) {
    const modalElement = document.getElementById(modalId);
    if (modalElement && window.bootstrap) {
        const modalInstance = window.bootstrap.Modal.getInstance(modalElement);
        if (modalInstance) {
            modalInstance.hide();
        }
    }
}

function answerInit(answers) {
    const buttons = document.querySelectorAll('.quiz-answer:not(.help-btn)');
    const letters = ['A:', 'B:', 'C:', 'D:'];

    buttons.forEach((button, index) => {
        if (answers && answers[index]) {
            button.innerHTML = `<span class="text-warning fw-bold me-2">${letters[index]}</span> <span class="answer-text">${answers[index].valasz}</span>`;
            button.setAttribute('data-id', answers[index].id);
            button.style.display = '';
        } else {
            button.style.display = 'none';
        }
    });
}

function waitForAnswer() {
    return new Promise((resolve) => {
        const buttons = document.querySelectorAll('.answer');

        const clickHandler = (event) => {
            const answerId = event.currentTarget.getAttribute('data-id');
            console.log(`Answer ${answerId} pressed`);
            buttons.forEach(btn => btn.removeEventListener('click', clickHandler));

            resolve(answerId);
        };

        buttons.forEach(button => {
            button.addEventListener('click', clickHandler);
        });
    });
}

async function refreshAuthUi() {
    const guestActions = document.getElementById('guestActions');
    const userActions = document.getElementById('userActions');

    try {
        console.clear();
        const data = await safeFetch('/api/session-info');

        const loggedIn = data.success;
        console.log(loggedIn);

        if (loggedIn) {
            guestActions.classList.add('d-none');
            userActions.classList.remove('d-none');
            console.log(`Bejelentkezve: ${data.userdata.username}`);

            const usernameDisplay = document.getElementById('usernameDisplay');
            if (usernameDisplay) {
                usernameDisplay.textContent = data.userdata.username;
            }
        } else {
            guestActions.classList.remove('d-none');
            userActions.classList.add('d-none');
            console.log('Nincs bejelentkezve.');
        }
    } catch (error) {
        console.error('Hiba az auth állapot frissítésekor:', error);
        guestActions.classList.remove('d-none');
        userActions.classList.add('d-none');
    }
}

function showToast(message, type = 'primary') {
    const toastBody = document.getElementById('appToastBody');
    const toastElement = document.getElementById('appToast');

    if (toastBody) {
        toastBody.textContent = message;
    }

    if (!toastElement || !window.bootstrap || !window.bootstrap.Toast) {
        return;
    }

    // Remove any previously applied text-bg-* color classes
    toastElement.className = toastElement.className
        .split(' ')
        .filter(cls => !cls.startsWith('text-bg-'))
        .join(' ');

    // Apply the Bootstrap color utility class for the given type
    toastElement.classList.add(`text-bg-${type}`);

    const toast = window.bootstrap.Toast.getOrCreateInstance(toastElement);
    toast.show();
}

function updatePyramid(currentRound) {
    const steps = document.querySelectorAll('.pyramid-step');
    steps.forEach(step => {
        if (parseInt(step.getAttribute('data-round')) === currentRound) {
            step.classList.add('active-step');
            const moneyText = step.querySelector('.step-money');
            if (moneyText) moneyText.classList.add('fw-bold');
        } else {
            step.classList.remove('active-step');
            const moneyText = step.querySelector('.step-money');
            if (moneyText) moneyText.classList.remove('fw-bold');
        }
    });
}
