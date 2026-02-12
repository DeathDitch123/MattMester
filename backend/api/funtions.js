function isAdmin(request, response, next) {
    if(!request.session || request.session.role !== 'admin') {
        return response.status(403).json({ message: 'Hozzáférés megtagadva: Admin jogosultság szükséges.' });
    }
    if (request.session.role !== 'admin') {
        return response.status(403).json({ message: 'Hozzáférés megtagadva: Admin jogosultság szükséges.' });
    }
    next();
}

module.exports = {
    isAdmin
};