const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

// `tx` mar globalis a `_utils.js`-bol (window.tx). NE deklaraljuk itt ujra
// const-tal, mert tobb top-level <script> tag kozos scope-jaban a `const tx`
// duplikacio SyntaxError-t okoz.
function _txValidation(hu, en) {
    if (typeof window !== 'undefined' && window.MattMesterI18n?.tx) return window.MattMesterI18n.tx(hu, en);
    return hu;
}

// Lokalizalt validacios uzenetek — kozos forras a frontend-en.
const messages = {
    passwordRequired: () => _txValidation('A jelszó megadása kötelező.', 'Password is required.'),
    passwordTooShort: (min = 8) => _txValidation(`A jelszónak legalább ${min} karakter hosszúnak kell lennie.`, `Password must be at least ${min} characters long.`),
    passwordComplexity: () => _txValidation('A jelszónak tartalmaznia kell kis- és nagybetűt, valamint számot.', 'Password must include lowercase, uppercase, and a number.'),
    passwordMismatch: () => _txValidation('A két jelszó nem egyezik.', 'The two passwords do not match.'),
    usernameRequired: () => _txValidation('A felhasználónév megadása kötelező.', 'Username is required.'),
    usernameTooShort: (min = 3) => _txValidation(`A felhasználónévnek legalább ${min} karakter hosszúnak kell lennie.`, `Username must be at least ${min} characters long.`),
    emailRequired: () => _txValidation('Az email cím megadása kötelező.', 'Email is required.'),
    emailInvalid: () => _txValidation('Érvénytelen email cím.', 'Invalid email address.'),
    fieldRequired: () => _txValidation('Ez a mező kötelező.', 'This field is required.')
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