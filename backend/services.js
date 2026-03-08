// --HearthBeat--
// Ez a fájl a Socket.io kapcsolat szívverésének kezelésére szolgál, hogy a szerver tudja, mely kliensek aktívak és elérhetőek stb...
const { getpool } = require('./sql/database');

let currentStats = {
    public : { onlineusers: 0 , totalusers: 0 , totalrooms: 0 , totalusersregistered: 0 },
    admin : { onlineusers: 0 , totalusers: 0 , totalrooms: 0 , totalusersregistered: 0 , activeusers: [] , activerooms: [] , dbStatus: 'unknown' , cpuUsage: 0 , memoryUsage: 0 }
};

const services = {
    async handleHeartbeat(io) {
        try {
    }