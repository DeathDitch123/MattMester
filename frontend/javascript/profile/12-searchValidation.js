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
        errorMessage = 'A keresett felhasználónévnek 3 és 50 karakter között kell lennie.';
    } else if (hasValue && !USERNAME_REGEX.test(value)) {
        errorMessage = 'A keresett felhasználónév formátuma érvénytelen.';
    }

    const isValid = hasValue && !errorMessage;
    button.disabled = !isValid;

    input.classList.remove('is-valid', 'is-invalid');
    feedback.classList.remove('text-danger', 'text-success');
    if (!hasValue) {
        input.removeAttribute('aria-invalid');
        feedback.textContent = '';
        input.title = 'Adj meg legalább 3 karakteres felhasználónevet a kereséshez.';
        button.title = 'Adj meg felhasználónevet a kereséshez.';
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
        feedback.textContent = 'A felhasználónév formátuma megfelelő.';
        input.title = 'A formátum megfelelő, indítható a keresés.';
        button.title = 'Keresés';
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

