// --HearthBeat--
// Ez a fájl a Socket.io kapcsolat szívverésének kezelésére szolgál, hogy a szerver tudja, mely kliensek aktívak és elérhetőek stb...
const { getpool } = require('./sql/database');
const sql = require('../sql/sql_funtions.js');

let currentStats = {
    public: { onlineUsers: 0, totalUsers: 0, totalGames: 0, onlineGames: 0 },
    admin: { onlineUsers: 0, totalUsers: 0, totalGames: 0, onlineGames: 0, allUsers: [], allRooms: [], dbStatus: 'unknown', cpuUsage: '0%', memoryUsage: '0 MB' }
};

let heartbeatTimers = null;

const services = {
    async refreshStats(io) {
        try {
            const pool = getpool();

            if (pool) {
                const [publicStats, adminStats] = await Promise.all([
                    publicStats = { onlineUsers: io.engine.sockets.clients().size, totalUsers: await sql.getTotalUsers(), totalGames: await sql.getTotalGames(), onlineGames: await sql.getOnlineGamesCount() },
                    adminStats = { onlineUsers: io.engine.sockets.clients().size, totalUsers: await sql.getTotalUsers(), totalGames: await sql.getTotalGames(), onlineGames: await sql.getOnlineGamesCount(), allUsers: await sql.getAllUsers(), allRooms: await sql.getAllRooms(), dbStatus: pool._closed ? 'closed' : 'open', cpuUsage: process.cpuUsage().user + process.cpuUsage().system + ' μs', memoryUsage: (process.memoryUsage().rss / (1024 * 1024)).toFixed(2) + ' MB' }
                ]);
                currentStats.public = publicStats;
                currentStats.admin = adminStats;
            }
        } catch (error) {
            console.error('Error occurred while refreshing stats:', error);
        }
    }
};

module.exports = services;