const services = require('./services.js');

module.exports = (io) => {
    services.handleHeartbeat(io);
    io.on('connection', (socket) => {
        console.log('Új Socket.io kapcsolat létrejött:', socket.id);

        const session = socket.request.session;

        socket.join('general-room'); //?Mindenki csatlakozik egy "general" nevű szobához, ahol általános értesítéseket lehet küldeni
        socket.emit('connected', { message: 'Sikeresen csatlakoztál a szerverhez!' });
        socket.emit('update:stats', services.getCurrentStats().public); //?Az aktuális statisztikák küldése a kliensnek

        if (session && session.role === 'admin') {
            console.log('Admin felhasználó csatlakozott:', socket.id);
            socket.join('admin-room'); //?Adminok egy külön szobába kerülnek, ahol admin-specifikus értesítéseket lehet küldeni
            socket.emit('update:adminStats', services.getCurrentStats().admin); //?Admin statisztikák küldése
        }

        socket.on('disconnect', () => {
            console.log('Socket.io kapcsolat megszakadt:', socket.id);
            //itt tudjuk majd kezelni ha valaki kilép a játékbol vagy mittomén, hogy frissítsük a statisztikákat stb...
        });
    });
};
