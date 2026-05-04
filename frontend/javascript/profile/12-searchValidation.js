function getTopBarPlayerSearchElements() {
    return {
        input: document.getElementById('playerSearchInput'),
        button: document.getElementById('playerSearchButton'),
        feedback: document.getElementById('playerSearchFeedback')
    };
}

function validatePlayerSearchElements(elements) {
    const { input, button, feedback } = elements || {};
    if (!input || !button || !feedback) {
        return false;
    }

    const value = (input.value || '').trim();
    const hasValue = value.length > 0;
    let errorMessage = '';

    if (hasValue && (value.length < 3 || value.length > 50)) {
        errorMessage = tx('A keresett felhasználónévnek 3 és 50 karakter között kell lennie.', 'The searched username must be between 3 and 50 characters.');
    } else if (hasValue && !USERNAME_REGEX.test(value)) {
        errorMessage = tx('A keresett felhasználónév formátuma érvénytelen.', 'The searched username format is invalid.');
    }

    const isValid = hasValue && !errorMessage;
    button.disabled = !isValid;

    input.classList.remove('is-valid', 'is-invalid');
    feedback.classList.remove('text-danger', 'text-success');
    if (!hasValue) {
        input.removeAttribute('aria-invalid');
        feedback.textContent = '';
        input.title = tx('Adj meg legalább 3 karakteres felhasználónevet a kereséshez.', 'Enter a username of at least 3 characters to search.');
        button.title = tx('Adj meg felhasználónevet a kereséshez.', 'Enter a username to search.');
    } else if (errorMessage) {
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
        feedback.classList.add('text-danger');
        feedback.textContent = errorMessage;
        input.title = errorMessage;
        button.title = errorMessage;
    } else {
        input.classList.add('is-valid');
        input.removeAttribute('aria-invalid');
        feedback.classList.add('text-success');
        feedback.textContent = tx('A felhasználónév formátuma megfelelő.', 'The username format is valid.');
        input.title = tx('A formátum megfelelő, indítható a keresés.', 'The format is valid, search can be started.');
        button.title = tx('Keresés', 'Search');
    }

    return isValid;
}

function bindPlayerSearchValidation(source, getElements) {
    const elements = getElements();
    const { input, button } = elements;
    if (!input || !button) {
        throw new Error(`Hianyzik a kereso input vagy gomb (${source}).`);
    }

    const validate = () => {
        return validatePlayerSearchElements(elements);
    };

    input.addEventListener('input', () => {
        runSafely('playerSearchInput', () => {
            validate();
        });
    });
    input.addEventListener('blur', () => {
        runSafely('playerSearchBlur', () => {
            validate();
        });
    });

    button.addEventListener('click', () => {
        runSafely('playerSearchClick', () => {
            if (!button.disabled) {
                schedulePlayerSearch(source, 0);
            }
        });
    });

    input.addEventListener('keydown', (event) => {
        runSafely('playerSearchKeydown', () => {
            if (event.key === 'Enter') {
                event.preventDefault();
            }
        });
    });

    runSafely('playerSearchInitialValidate', () => {
        validate();
    });
}

function bindTopBarPlayerSearchValidation() {
    bindPlayerSearchValidation('topbar', getTopBarPlayerSearchElements);
}

function bindModalPlayerSearchValidation() {
    bindPlayerSearchValidation('modal', getModalPlayerSearchElements);
}

