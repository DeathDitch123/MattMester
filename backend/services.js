// --HearthBeat--
// Ez a fájl a Socket.io kapcsolat szívverésének kezelésére szolgál, hogy a szerver tudja, mely kliensek aktívak és elérhetőek stb...
const { getPool } = require('./sql/database');
const sql = require('../sql/sql_funtions.js');

let currentStats = {
    public: {
        onlineUsers: 0,
        totalUsers: 0,
        totalGames: 0,
        onlineGames: 0
    },
    admin: {
        onlineUsers: 0,
        totalUsers: 0,
        totalGames: 0,
        onlineGames: 0,
        allUsers: [],
        allRooms: [],
        dbStatus: 'unknown',
        cpuUsage: '0%',
        memoryUsage: '0 MB'
    }
};

const services = {
    async refreshStats(io) {
        try {
            const pool = getPool();
            if (pool) {

                const onlineUsers = io.sockets.sockets.size;

                const [totalUsers, totalGames, onlineGames, allUsers, allRooms] = await Promise.all([
                    sql.getTotalUsers(),
                    sql.getTotalGames(),
                    sql.getOnlineGamesCount(),
                    sql.getAllUsers(),
                    sql.getAllRooms()
                ]);
                currentStats.public = {
                    onlineUsers,
                    totalUsers,
                    totalGames,
                    onlineGames
                };
                currentStats.admin = {
                    ...currentStats.public,
                    allUsers,
                    allRooms,
                    dbStatus: pool._closed ? 'closed' : 'open',
                    cpuUsage: (process.cpuUsage().user / 1000000).toFixed(1) + '%',
                    memoryUsage: (process.memoryUsage().rss / (1024 * 1024)).toFixed(2) + ' MB'
                };
                //?Statisztikák frissítése minden kliensnek
                io.to('general-room').emit('update:stats', currentStats.public);
                io.to('admin-room').emit('update:adminStats', currentStats.admin);
            }
            else {
                console.error('Nincs elérhető adatbázis kapcsolat a statisztikák frissítéséhez.');
            }
        } catch (error) {
            console.error('Error occurred while refreshing stats:', error);
        }
    },

    handleConnetion(socket, io) {
        console.log('Új Socket.io kapcsolat létrejött:', socket.id);

        socket.join('general-room'); //?Mindenki csatlakozik egy "general" nevű szobához, ahol általános értesítéseket lehet küldeni

        if (socket.request.session && socket.request.session.role === 'admin') {
            console.log('Admin felhasználó csatlakozott:', socket.id);
            socket.join('admin-room'); //?Adminok egy külön szobába kerülnek, ahol admin-specifikus értesítéseket lehet küldeni
        }

        socket.emit('stats:public', currentStats.public);
        if (socket.request.session && socket.request.session.role === 'admin') {
            socket.emit('stats:admin', currentStats.admin);
        }

        socket.on('disconnect', () => {
            console.log('Socket.io kapcsolat megszakadt:', socket.id);
            this.refreshStats(io); //?Frissítsük a statisztikákat, ha valaki kilép
            //itt tudjuk majd kezelni ha valaki kilép a játékbol vagy mittomén, hogy frissítsük a statisztikákat stb...

        });
    },
    handleHeartbeat(io) {
        setInterval(() => {
            this.refreshStats(io);
        }, 10000); //?30 másodpercenként frissítjük a statisztikákat
    }
};

module.exports = services;