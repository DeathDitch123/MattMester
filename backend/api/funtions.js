function isAdmin(request, response, next) {
    if(request.session && request.session.role === 'admin') {
        return next();
    }
    return response.status(403).json({ message: 'Nincs jogosultságod ehhez a művelethez.' });
}

function isAuthenticated(request, response, next) {
    if (request.session && request.session.userId) {
        return next();
    }
    return response.status(401).json({ success: false, message: 'Bejelentkezés szükséges a kereséshez.' });
}

module.exports = {
    isAdmin,
    isAuthenticated
};