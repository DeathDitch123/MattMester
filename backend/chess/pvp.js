// ============================================================
// CHESS PVP — Valós idejű játékos-kontra-játékos sakk
// ============================================================
// Socket.io event handler-ek a PvP sakkhoz:
//   - Barát meghívás + random matchmaking queue
//   - Lépés szinkronizálás WebSocket-en
//   - Döntetlen ajánlat
//   - Disconnect grace period + reconnect
//   - ELO frissítés mindkét játékosra
// ============================================================

const { jatekLetrehoz, jatekKeres, jatekTorol, jatekAllapotKliens } = require('./state.js');
const { jatekUjraIndit, lepesKoordinataval, legalLepesekKliens } = require('./engine.js');
const { idoLeall } = require('./timer.js');
const { eloMeccsEredmeny } = require('./elo.js');
const chessSql = require('./chess_sql_functions.js');
const sql = require('../sql/sql_funtions.js');

// ── Adatstruktúrák ──

// Függőben lévő meghívások: targetUserId → { gameId, inviterUserId, inviterName, timer }
const pendingInvites = new Map();

// Random matchmaking queue: [{ userId, username, elo, socketId }]
const matchmakingQueue = [];

// Aktív PvP játékok userId → gameId (reconnect-hez)
const activeGamesByUser = new Map();

// ── Konstansok ──
const INVITE_TIMEOUT_MS = 60_000;        // 60mp meghívás lejárat
const DISCONNECT_GRACE_MS = 60_000;      // 60mp disconnect grace period
const CLEANUP_DELAY_MS = 30_000;         // 30mp játék cleanup vége után

// ── Segédfüggvények ──

function getUserColorInGame(jatek, userId) {
    if (jatek.jatekosok.white.userId === userId) return 'white';
    if (jatek.jatekosok.black.userId === userId) return 'black';
    return null;
}

function getOpponentColor(szin) {
    return szin === 'white' ? 'black' : 'white';
}

/**
 * PvP ELO frissítés mindkét játékosra.
 * @param {object} jatek
 * @param {'white'|'black'|'draw'} eredmeny
 * @returns {{ feher: { ujElo, valtozas }, fekete: { ujElo, valtozas } }}
 */
async function pvpEloFrissit(jatek, eredmeny) {
    const whiteId = jatek.jatekosok.white.userId;
    const blackId = jatek.jatekosok.black.userId;

    const [whiteElo, blackElo, whiteMeccsek, blackMeccsek] = await Promise.all([
        chessSql.eloLekerdezDb(whiteId),
        chessSql.eloLekerdezDb(blackId),
        chessSql.meccsekSzamDb(whiteId),
        chessSql.meccsekSzamDb(blackId)
    ]);

    const { feher, fekete } = eloMeccsEredmeny(
        whiteElo || 800, blackElo || 800,
        eredmeny,
        whiteMeccsek, blackMeccsek
    );

    await Promise.all([
        chessSql.eloFrissitDb(whiteId, feher.ujElo),
        chessSql.eloFrissitDb(blackId, fekete.ujElo)
    ]);

    return { feher, fekete };
}

/**
 * Játék végének teljes kezelése: ELO + stats + DB + emit + cleanup.
 */
async function jatekVegeKezeles(jatek, eredmeny, uzenet, io) {
    jatek.vege = true;
    jatek.pvpStatusz = 'finished';
    idoLeall(jatek);

    const whiteId = jatek.jatekosok.white.userId;
    const blackId = jatek.jatekosok.black.userId;
    const gameId = jatek.gameId;
    const dbGameId = jatek.dbGameId;

    // ELO frissítés
    let eloEredmeny = null;
    try {
        eloEredmeny = await pvpEloFrissit(jatek, eredmeny);
        jatek.eloValtozas = {
            white: { eloBefore: eloEredmeny.feher.ujElo - eloEredmeny.feher.valtozas, eloAfter: eloEredmeny.feher.ujElo, eloChange: eloEredmeny.feher.valtozas },
            black: { eloBefore: eloEredmeny.fekete.ujElo - eloEredmeny.fekete.valtozas, eloAfter: eloEredmeny.fekete.ujElo, eloChange: eloEredmeny.fekete.valtozas }
        };
    } catch (err) {
        console.error('PvP ELO frissítési hiba:', err);
    }

    // DB mentés + statisztikák
    if (dbGameId) {
        try {
            if (eredmeny === 'draw') {
                await chessSql.jatekVegeMentDb(dbGameId, null, 'draw');
                await Promise.all([
                    chessSql.dontetlenMentDb(whiteId),
                    chessSql.dontetlenMentDb(blackId)
                ]);
            } else {
                const winnerId = eredmeny === 'white' ? whiteId : blackId;
                const loserId = eredmeny === 'white' ? blackId : whiteId;
                await chessSql.jatekVegeMentDb(dbGameId, winnerId, 'finished');
                await Promise.all([
                    chessSql.gyozelemMentDb(winnerId),
                    chessSql.veresegMentDb(loserId)
                ]);
            }
        } catch (err) {
            console.error('PvP DB mentési hiba:', err);
        }
    }

    // Emit játék vége mindkét kliensnek
    io.to(`chess-game:${gameId}`).emit('chess:game:end', {
        allapot: jatekAllapotKliens(jatek),
        uzenet,
        eredmeny,
        eloValtozas: jatek.eloValtozas
    });

    // Cleanup 30mp után
    setTimeout(() => {
        activeGamesByUser.delete(whiteId);
        activeGamesByUser.delete(blackId);
        jatekTorol(gameId);
    }, CLEANUP_DELAY_MS);
}

/**
 * Játék indítása két játékos között (közös logika invite + queue-hoz).
 */
async function jatekIndit(io, socket1, socket2, user1Id, user1Name, user2Id, user2Name) {
    const { gameId, jatek } = jatekLetrehoz();

    // Véletlenszerű szín
    const user1White = Math.random() < 0.5;
    const whiteId = user1White ? user1Id : user2Id;
    const blackId = user1White ? user2Id : user1Id;
    const whiteName = user1White ? user1Name : user2Name;
    const blackName = user1White ? user2Name : user1Name;

    jatek.pvpAktiv = true;
    jatek.pvpStatusz = 'active';
    jatek.pvpJatekosNevek = { white: whiteName, black: blackName };
    jatek.jatekosok.white.userId = whiteId;
    jatek.jatekosok.black.userId = blackId;

    // Board init
    jatekUjraIndit(jatek);

    // DB mentés
    try {
        jatek.dbGameId = await chessSql.jatekMentDb(whiteId, blackId);
    } catch (err) {
        console.error('PvP jatekMentDb hiba:', err);
    }

    // Timer lejárat callback beállítás
    jatek.onIdoLejar = (vesztesSzin) => {
        const nyertesSzin = getOpponentColor(vesztesSzin);
        jatekVegeKezeles(jatek, nyertesSzin, jatek.idoVegeUzenet, io);
    };

    // Active games tracking
    activeGamesByUser.set(whiteId, gameId);
    activeGamesByUser.set(blackId, gameId);

    // Socket room join
    socket1.join(`chess-game:${gameId}`);
    socket2.join(`chess-game:${gameId}`);

    const allapot = jatekAllapotKliens(jatek);

    // Emit game start mindkét játékosnak egyénileg (különböző sajatSzin)
    const socket1Szin = socket1.data.socketContext.userId === whiteId ? 'white' : 'black';
    const socket2Szin = socket2.data.socketContext.userId === whiteId ? 'white' : 'black';

    socket1.emit('chess:game:start', {
        gameId,
        allapot,
        sajatSzin: socket1Szin,
        ellenfelNev: socket1Szin === 'white' ? blackName : whiteName,
        sajatNev: socket1Szin === 'white' ? whiteName : blackName
    });

    socket2.emit('chess:game:start', {
        gameId,
        allapot,
        sajatSzin: socket2Szin,
        ellenfelNev: socket2Szin === 'white' ? blackName : whiteName,
        sajatNev: socket2Szin === 'white' ? whiteName : blackName
    });
}

// ── Fő handler regisztráció ──

function registerPvpHandlers(socket, io) {
    const ctx = socket.data?.socketContext;
    console.log('[PvP] handler regisztráció', { socketId: socket.id, userId: ctx?.userId, username: ctx?.username });

    // ─────────────────────────────────────
    // BARÁT MEGHÍVÁS
    // ─────────────────────────────────────

    socket.on('chess:invite', async ({ targetUserId }) => {
        const context = socket.data.socketContext;
        if (!context.userId) {
            return socket.emit('chess:error', { uzenet: 'Be kell jelentkezned.' });
        }

        const userId = context.userId;
        const username = context.username;

        // Validálások
        if (userId === targetUserId) {
            return socket.emit('chess:error', { uzenet: 'Nem hívhatod meg magadat.' });
        }

        if (activeGamesByUser.has(userId)) {
            return socket.emit('chess:error', { uzenet: 'Már van aktív PvP játékod.' });
        }

        if (activeGamesByUser.has(targetUserId)) {
            return socket.emit('chess:error', { uzenet: 'Az ellenfél már játékban van.' });
        }

        // Van-e már pending invite ettől a user-től VAGY a target-nek
        for (const [, invite] of pendingInvites) {
            if (invite.inviterUserId === userId) {
                return socket.emit('chess:error', { uzenet: 'Már van függőben lévő meghívásod.' });
            }
        }
        if (pendingInvites.has(targetUserId)) {
            return socket.emit('chess:error', { uzenet: 'Ennek a játékosnak már van függő meghívása.' });
        }

        // Barát ellenőrzés
        try {
            const friendStatus = await sql.getFriendStatus(userId, targetUserId);
            if (friendStatus !== 'accepted') {
                return socket.emit('chess:error', { uzenet: 'Csak barátot hívhatsz meg.' });
            }
        } catch (err) {
            return socket.emit('chess:error', { uzenet: 'Hiba a barát ellenőrzés során.' });
        }

        // Online ellenőrzés
        const targetSockets = await io.in(`user-room:${targetUserId}`).fetchSockets();
        if (targetSockets.length === 0) {
            return socket.emit('chess:error', { uzenet: 'Az ellenfél nincs online.' });
        }

        // Játék létrehozás (waiting állapotban)
        const { gameId, jatek } = jatekLetrehoz();
        jatek.pvpAktiv = true;
        jatek.pvpStatusz = 'waiting';

        // Véletlenszerű szín
        const inviterWhite = Math.random() < 0.5;
        if (inviterWhite) {
            jatek.jatekosok.white.userId = userId;
            jatek.jatekosok.black.userId = targetUserId;
        } else {
            jatek.jatekosok.white.userId = targetUserId;
            jatek.jatekosok.black.userId = userId;
        }

        // Timeout: 60mp után auto-decline
        const timer = setTimeout(() => {
            if (pendingInvites.has(targetUserId)) {
                pendingInvites.delete(targetUserId);
                jatekTorol(gameId);
                socket.emit('chess:invite:expired', { targetUserId });
                io.to(`user-room:${targetUserId}`).emit('chess:invite:expired', { inviterName: username });
            }
        }, INVITE_TIMEOUT_MS);

        pendingInvites.set(targetUserId, {
            gameId,
            inviterUserId: userId,
            inviterName: username,
            inviterSocketId: socket.id,
            timer
        });

        // Értesítés küldése
        socket.emit('chess:invite:sent', { targetUserId, gameId });
        io.to(`user-room:${targetUserId}`).emit('chess:invite:received', {
            gameId,
            inviterUserId: userId,
            inviterName: username
        });
    });

    socket.on('chess:invite:accept', async ({ gameId }) => {
        const context = socket.data.socketContext;
        if (!context.userId) return;

        const userId = context.userId;
        const invite = pendingInvites.get(userId);

        if (!invite || invite.gameId !== gameId) {
            return socket.emit('chess:error', { uzenet: 'Érvénytelen vagy lejárt meghívás.' });
        }

        const jatek = jatekKeres(gameId);
        if (!jatek || jatek.pvpStatusz !== 'waiting') {
            pendingInvites.delete(userId);
            return socket.emit('chess:error', { uzenet: 'A játék már nem elérhető.' });
        }

        // Invite cleanup
        clearTimeout(invite.timer);
        pendingInvites.delete(userId);

        // Meghívó socket megkeresése
        const inviterSockets = await io.in(`user-room:${invite.inviterUserId}`).fetchSockets();
        const inviterSocket = inviterSockets.find(s => s.id === invite.inviterSocketId) || inviterSockets[0];

        if (!inviterSocket) {
            jatekTorol(gameId);
            return socket.emit('chess:error', { uzenet: 'A meghívó nincs online.' });
        }

        // Játékos nevek lekérdezése
        const accepterName = context.username;

        // Játék indítás
        const whiteId = jatek.jatekosok.white.userId;
        const blackId = jatek.jatekosok.black.userId;
        const whiteName = whiteId === invite.inviterUserId ? invite.inviterName : accepterName;
        const blackName = blackId === invite.inviterUserId ? invite.inviterName : accepterName;

        jatek.pvpStatusz = 'active';
        jatek.pvpJatekosNevek = { white: whiteName, black: blackName };

        // Board init
        jatekUjraIndit(jatek);

        // DB mentés
        try {
            jatek.dbGameId = await chessSql.jatekMentDb(whiteId, blackId);
        } catch (err) {
            console.error('PvP jatekMentDb hiba:', err);
        }

        // Timer lejárat callback
        jatek.onIdoLejar = (vesztesSzin) => {
            const nyertesSzin = getOpponentColor(vesztesSzin);
            jatekVegeKezeles(jatek, nyertesSzin, jatek.idoVegeUzenet, io);
        };

        // Active tracking
        activeGamesByUser.set(whiteId, gameId);
        activeGamesByUser.set(blackId, gameId);

        // Room join
        socket.join(`chess-game:${gameId}`);
        inviterSocket.join(`chess-game:${gameId}`);

        const allapot = jatekAllapotKliens(jatek);

        // Egyéni emit (különböző sajatSzin)
        const inviterSzin = getUserColorInGame(jatek, invite.inviterUserId);
        const accepterSzin = getUserColorInGame(jatek, userId);

        inviterSocket.emit('chess:game:start', {
            gameId,
            allapot,
            sajatSzin: inviterSzin,
            ellenfelNev: inviterSzin === 'white' ? blackName : whiteName,
            sajatNev: inviterSzin === 'white' ? whiteName : blackName
        });

        socket.emit('chess:game:start', {
            gameId,
            allapot,
            sajatSzin: accepterSzin,
            ellenfelNev: accepterSzin === 'white' ? blackName : whiteName,
            sajatNev: accepterSzin === 'white' ? whiteName : blackName
        });
    });

    socket.on('chess:invite:decline', ({ gameId }) => {
        const context = socket.data.socketContext;
        if (!context.userId) return;

        const invite = pendingInvites.get(context.userId);
        if (!invite || invite.gameId !== gameId) return;

        clearTimeout(invite.timer);
        pendingInvites.delete(context.userId);
        jatekTorol(gameId);

        io.to(`user-room:${invite.inviterUserId}`).emit('chess:invite:declined', {
            targetUserId: context.userId
        });
    });

    socket.on('chess:invite:cancel', () => {
        const context = socket.data.socketContext;
        if (!context.userId) return;

        // Keressük a user által küldött meghívást
        for (const [targetId, invite] of pendingInvites) {
            if (invite.inviterUserId === context.userId) {
                clearTimeout(invite.timer);
                pendingInvites.delete(targetId);
                jatekTorol(invite.gameId);

                io.to(`user-room:${targetId}`).emit('chess:invite:cancelled');
                socket.emit('chess:invite:cancelled');
                break;
            }
        }
    });

    // ─────────────────────────────────────
    // RANDOM MATCHMAKING QUEUE
    // ─────────────────────────────────────

    socket.on('chess:queue:join', async () => {
        const context = socket.data.socketContext;
        if (!context.userId) {
            return socket.emit('chess:error', { uzenet: 'Be kell jelentkezned.' });
        }

        const userId = context.userId;
        const username = context.username;

        if (activeGamesByUser.has(userId)) {
            return socket.emit('chess:error', { uzenet: 'Már van aktív PvP játékod.' });
        }

        // Már a queue-ban van?
        if (matchmakingQueue.some(q => q.userId === userId)) {
            return socket.emit('chess:error', { uzenet: 'Már a sorban vagy.' });
        }

        // Van-e pending invite?
        for (const [, invite] of pendingInvites) {
            if (invite.inviterUserId === userId) {
                return socket.emit('chess:error', { uzenet: 'Előbb vond vissza a meghívásod.' });
            }
        }
        if (pendingInvites.has(userId)) {
            return socket.emit('chess:error', { uzenet: 'Előbb válaszolj a meghívásra.' });
        }

        // ELO lekérdezés
        let elo = 800;
        try {
            const dbElo = await chessSql.eloLekerdezDb(userId);
            if (dbElo) elo = dbElo;
        } catch (err) { /* default 800 */ }

        // Van-e már valaki a queue-ban?
        if (matchmakingQueue.length > 0) {
            const opponent = matchmakingQueue.shift();

            // Self-match védelem (race condition esetén)
            if (opponent.userId === userId) {
                matchmakingQueue.push({ userId, username, elo, socketId: socket.id });
                socket.emit('chess:queue:joined');
                return;
            }

            // Ellenfél socket megkeresése
            const opponentSockets = await io.in(`user-room:${opponent.userId}`).fetchSockets();
            const opponentSocket = opponentSockets.find(s => s.id === opponent.socketId) || opponentSockets[0];

            if (!opponentSocket) {
                // Ellenfél offline — mi maradunk a queue-ban
                matchmakingQueue.push({ userId, username, elo, socketId: socket.id });
                socket.emit('chess:queue:joined');
                return;
            }

            // Match! Játék indítása
            await jatekIndit(io, socket, opponentSocket, userId, username, opponent.userId, opponent.username);
        } else {
            // Queue üres — hozzáadjuk magunkat
            matchmakingQueue.push({ userId, username, elo, socketId: socket.id });
            socket.emit('chess:queue:joined');
        }
    });

    socket.on('chess:queue:leave', () => {
        const context = socket.data.socketContext;
        if (!context.userId) return;

        const idx = matchmakingQueue.findIndex(q => q.userId === context.userId);
        if (idx !== -1) {
            matchmakingQueue.splice(idx, 1);
            socket.emit('chess:queue:left');
        }
    });

    // ─────────────────────────────────────
    // LÉPÉS VÉGREHAJTÁS
    // ─────────────────────────────────────

    socket.on('chess:move', async ({ gameId, fromX, fromY, toX, toY, promotion }) => {
        const context = socket.data.socketContext;
        console.log('[PvP] chess:move fogadva', { socketId: socket.id, userId: context?.userId, gameId, fromX, fromY, toX, toY });
        if (!context.userId) return;

        const jatek = jatekKeres(gameId);
        if (!jatek || !jatek.pvpAktiv || jatek.pvpStatusz !== 'active' || jatek.vege) {
            return socket.emit('chess:error', { uzenet: 'Érvénytelen játék.' });
        }

        const szin = getUserColorInGame(jatek, context.userId);
        console.log('[PvP] chess:move szín check', { userId: context.userId, szin, koronLevo: jatek.koronLevo, whiteId: jatek.jatekosok.white.userId, blackId: jatek.jatekosok.black.userId });
        if (!szin) {
            return socket.emit('chess:error', { uzenet: 'Nem vagy résztvevője ennek a játéknak.' });
        }

        if (jatek.koronLevo !== szin) {
            return socket.emit('chess:error', { uzenet: 'Nem te jössz.' });
        }

        const eredmeny = await lepesKoordinataval(jatek, fromX, fromY, toX, toY, promotion || 'queen');

        if (!eredmeny.success) {
            return socket.emit('chess:error', { uzenet: eredmeny.error });
        }

        // Lépés után döntetlen ajánlat törlése
        jatek.drawAjanlat = null;

        // Ha a játék véget ért a lépés miatt
        if (eredmeny.uzenet) {
            // Meghatározás: ki nyert
            let vegeredmeny;
            const allapot = require('./logika.js').jatekAllapotEllenor(jatek, jatek.koronLevo);
            if (eredmeny.uzenet.includes('matt')) {
                // Mattot adó szín nyert (az előbb lépett)
                vegeredmeny = szin;
            } else {
                vegeredmeny = 'draw';
            }

            await jatekVegeKezeles(jatek, vegeredmeny, eredmeny.uzenet, io);
            return;
        }

        // Normál lépés — állapot broadcast
        io.to(`chess-game:${gameId}`).emit('chess:state:update', {
            allapot: jatekAllapotKliens(jatek)
        });
    });

    // ─────────────────────────────────────
    // LEGÁLIS LÉPÉSEK LEKÉRDEZÉS
    // ─────────────────────────────────────

    socket.on('chess:moves:request', ({ gameId, x, y }) => {
        const context = socket.data.socketContext;
        if (!context.userId) return;

        const jatek = jatekKeres(gameId);
        if (!jatek || !jatek.pvpAktiv || jatek.vege) return;

        const szin = getUserColorInGame(jatek, context.userId);
        if (!szin || jatek.koronLevo !== szin) {
            return socket.emit('chess:moves:response', { lepesek: [] });
        }

        const lepesek = legalLepesekKliens(jatek, x, y);
        socket.emit('chess:moves:response', { lepesek, x, y });
    });

    // ─────────────────────────────────────
    // FELADÁS
    // ─────────────────────────────────────

    socket.on('chess:surrender', async ({ gameId }) => {
        const context = socket.data.socketContext;
        if (!context.userId) return;

        const jatek = jatekKeres(gameId);
        if (!jatek || !jatek.pvpAktiv || jatek.pvpStatusz !== 'active' || jatek.vege) return;

        const szin = getUserColorInGame(jatek, context.userId);
        if (!szin) return;

        const nyertesSzin = getOpponentColor(szin);
        const uzenet = `${jatek.pvpJatekosNevek[szin]} feladta — ${jatek.pvpJatekosNevek[nyertesSzin]} nyert`;

        await jatekVegeKezeles(jatek, nyertesSzin, uzenet, io);
    });

    // ─────────────────────────────────────
    // DÖNTETLEN AJÁNLAT
    // ─────────────────────────────────────

    socket.on('chess:draw:offer', ({ gameId }) => {
        const context = socket.data.socketContext;
        if (!context.userId) return;

        const jatek = jatekKeres(gameId);
        if (!jatek || !jatek.pvpAktiv || jatek.pvpStatusz !== 'active' || jatek.vege) return;

        const szin = getUserColorInGame(jatek, context.userId);
        if (!szin) return;

        // Nem ajánlhat döntetlent ha már ajánlott
        if (jatek.drawAjanlat === szin) return;

        jatek.drawAjanlat = szin;

        // Értesítés az ellenfélnek
        socket.to(`chess-game:${gameId}`).emit('chess:draw:offered', {
            ajanlaSzin: szin,
            ajanloNev: jatek.pvpJatekosNevek[szin]
        });
    });

    socket.on('chess:draw:accept', async ({ gameId }) => {
        const context = socket.data.socketContext;
        if (!context.userId) return;

        const jatek = jatekKeres(gameId);
        if (!jatek || !jatek.pvpAktiv || jatek.pvpStatusz !== 'active' || jatek.vege) return;

        const szin = getUserColorInGame(jatek, context.userId);
        if (!szin) return;

        // Csak az ellenfél fogadhatja el (aki nem ajánlotta)
        if (jatek.drawAjanlat === szin || !jatek.drawAjanlat) return;

        const uzenet = 'Döntetlen (közös megegyezéssel).';
        await jatekVegeKezeles(jatek, 'draw', uzenet, io);
    });

    socket.on('chess:draw:decline', ({ gameId }) => {
        const context = socket.data.socketContext;
        if (!context.userId) return;

        const jatek = jatekKeres(gameId);
        if (!jatek || !jatek.pvpAktiv || jatek.vege) return;

        const szin = getUserColorInGame(jatek, context.userId);
        if (!szin) return;

        if (jatek.drawAjanlat && jatek.drawAjanlat !== szin) {
            jatek.drawAjanlat = null;
            socket.to(`chess-game:${gameId}`).emit('chess:draw:declined', {
                elutasitoNev: jatek.pvpJatekosNevek[szin]
            });
        }
    });

    // ─────────────────────────────────────
    // RECONNECT
    // ─────────────────────────────────────

    socket.on('chess:rejoin', () => {
        const context = socket.data.socketContext;
        if (!context.userId) return;

        const gameId = activeGamesByUser.get(context.userId);
        if (!gameId) {
            return socket.emit('chess:rejoin:none');
        }

        const jatek = jatekKeres(gameId);
        if (!jatek || !jatek.pvpAktiv || jatek.vege) {
            activeGamesByUser.delete(context.userId);
            return socket.emit('chess:rejoin:none');
        }

        // Room rejoin
        socket.join(`chess-game:${gameId}`);

        // Disconnect timer törlés ha van
        if (jatek.disconnectTimer && jatek.disconnectSzin) {
            const dcSzin = jatek.disconnectSzin;
            const dcUserId = jatek.jatekosok[dcSzin].userId;
            if (dcUserId === context.userId) {
                clearTimeout(jatek.disconnectTimer);
                jatek.disconnectTimer = null;
                jatek.disconnectSzin = null;

                // Értesítés az ellenfélnek
                socket.to(`chess-game:${gameId}`).emit('chess:opponent:reconnected');
            }
        }

        const szin = getUserColorInGame(jatek, context.userId);
        socket.emit('chess:game:start', {
            gameId,
            allapot: jatekAllapotKliens(jatek),
            sajatSzin: szin,
            ellenfelNev: jatek.pvpJatekosNevek[getOpponentColor(szin)],
            sajatNev: jatek.pvpJatekosNevek[szin]
        });
    });
}

// ── Disconnect kezelés (sockets.js hívja) ──

async function handlePvpDisconnect(userId, io) {
    if (!userId) return;

    // Queue-ból eltávolítás
    const queueIdx = matchmakingQueue.findIndex(q => q.userId === userId);
    if (queueIdx !== -1) {
        matchmakingQueue.splice(queueIdx, 1);
    }

    // Pending invite cleanup
    // Ha ő volt a meghívó
    for (const [targetId, invite] of pendingInvites) {
        if (invite.inviterUserId === userId) {
            clearTimeout(invite.timer);
            pendingInvites.delete(targetId);
            jatekTorol(invite.gameId);
            io.to(`user-room:${targetId}`).emit('chess:invite:cancelled');
            break;
        }
    }
    // Ha ő volt a meghívott
    if (pendingInvites.has(userId)) {
        const invite = pendingInvites.get(userId);
        clearTimeout(invite.timer);
        pendingInvites.delete(userId);
        jatekTorol(invite.gameId);
        io.to(`user-room:${invite.inviterUserId}`).emit('chess:invite:expired', {});
    }

    // Aktív PvP játék disconnect kezelése
    const gameId = activeGamesByUser.get(userId);
    if (!gameId) return;

    const jatek = jatekKeres(gameId);
    if (!jatek || !jatek.pvpAktiv || jatek.pvpStatusz !== 'active' || jatek.vege) return;

    const szin = getUserColorInGame(jatek, userId);
    if (!szin) return;

    // Ellenőrzés: van-e még másik socket-je a usernek (multi-tab)
    const userSockets = await io.in(`user-room:${userId}`).fetchSockets();
    if (userSockets.length > 0) return; // Más tab-on még online

    // Grace period indítás
    jatek.disconnectSzin = szin;

    io.to(`chess-game:${gameId}`).emit('chess:opponent:disconnected', {
        szin,
        gracePeriodMs: DISCONNECT_GRACE_MS
    });

    jatek.disconnectTimer = setTimeout(async () => {
        // Ha még mindig disconnectelt → auto-forfeit
        if (!jatek.vege && jatek.disconnectSzin === szin) {
            const nyertesSzin = getOpponentColor(szin);
            const uzenet = `${jatek.pvpJatekosNevek[szin]} kilépett — ${jatek.pvpJatekosNevek[nyertesSzin]} nyert`;
            await jatekVegeKezeles(jatek, nyertesSzin, uzenet, io);
        }
    }, DISCONNECT_GRACE_MS);
}

module.exports = {
    registerPvpHandlers,
    handlePvpDisconnect
};
