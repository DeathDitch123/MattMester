const usernameRegex = /^[a-zA-ZáéíóöőúüűÁÉÍÓÖŐÚÜŰ0-9._-]+$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const { PASSWORD_REGEX: passwordRegex } = require('../../frontend/javascript/shared/validationRules.js');

module.exports = { usernameRegex, emailRegex, passwordRegex };
