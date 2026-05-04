const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const tx = (hu, en) => {
    if (typeof window !== 'undefined' && window.MattMesterI18n?.tx) return window.MattMesterI18n.tx(hu, en);
    return hu;
};

// Lokalizalt validacios uzenetek — kozos forras a frontend-en.
const messages = {
    passwordRequired: () => tx('A jelszó megadása kötelező.', 'Password is required.'),
    passwordTooShort: (min = 8) => tx(`A jelszónak legalább ${min} karakter hosszúnak kell lennie.`, `Password must be at least ${min} characters long.`),
    passwordComplexity: () => tx('A jelszónak tartalmaznia kell kis- és nagybetűt, valamint számot.', 'Password must include lowercase, uppercase, and a number.'),
    passwordMismatch: () => tx('A két jelszó nem egyezik.', 'The two passwords do not match.'),
    usernameRequired: () => tx('A felhasználónév megadása kötelező.', 'Username is required.'),
    usernameTooShort: (min = 3) => tx(`A felhasználónévnek legalább ${min} karakter hosszúnak kell lennie.`, `Username must be at least ${min} characters long.`),
    emailRequired: () => tx('Az email cím megadása kötelező.', 'Email is required.'),
    emailInvalid: () => tx('Érvénytelen email cím.', 'Invalid email address.'),
    fieldRequired: () => tx('Ez a mező kötelező.', 'This field is required.')
};

const rules = {
    PASSWORD_REGEX,
    messages
};

if (typeof window !== 'undefined') {
    window.MattMesterValidationRules = rules;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = rules;
}