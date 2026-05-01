const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const rules = {
    PASSWORD_REGEX
};

if (typeof window !== 'undefined') {
    window.MattMesterValidationRules = rules;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = rules;
}