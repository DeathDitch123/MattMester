function isAdmin(request, response, next) {
    if(request.session && request.session.role === 'admin') {
        return next();
    }
    return response.status(403).json({ message: 'Nincs jogosultságod ehhez a művelethez.' });
}

module.exports = {
    isAdmin
};