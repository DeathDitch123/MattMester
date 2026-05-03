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
const sql = require('../sql/sql_functions.js');
const { abilityAktival } = require('./abilities.js');
const { getMode, isValidMode, queueKey, DEFAULT_MODE } = require('./modes.js');

// ── Adatstruktúrák ──

// Függőben lévő meghívások: targetUserId → { gameId, inviterUserId, inviterName, timer, mode, ranked }
const pendingInvites = new Map();

// Per-mode random matchmaking queue: queueKey('mode', ranked) → [{ userId, username, elo, socketId, mode, ranked }]
// A queueKey szegregálja a klasszikus / mattmester / blitz játékosokat,
// és a ranked / casual is külön queue-ban van.
const matchmakingQueueByMode = new Map();

function getQueue(modeKey, ranked) {
    const k = queueKey(modeKey, ranked);
    if (!matchmakingQueueByMode.has(k)) matchmakingQueueByMode.set(k, []);
    return matchmakingQueueByMode.get(k);
}

// Egy user csak egyetlen queue-ban lehet — ezt a userQueueIndex tartja számon,
// hogy a `chess:queue:leave` és a disconnect cleanup tudja hol keresni.
const userQueueIndex = new Map(); // userId → queueKey

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

// Stale-active-game cleanup: ha az `activeGamesByUser` egy halott meccs gameId-jét
// tartalmazza (pl. a 30mp-os post-game cleanup még nem futott le, vagy a meccs valamilyen
// edge-case miatt törlődött), törli a bejegyzést. Visszaadja: TRUE ha most is aktív
// meccs van, FALSE ha nincs (tehát a queue/invite engedélyezhető).
// `jatekKeres` null/undef-et ad vissza nem létező gameId-re.
function hasLiveActiveGame(userId) {
    if (!activeGamesByUser.has(userId)) return false;
    const gameId = activeGamesByUser.get(userId);
    const jatek = jatekKeres(gameId);
    if (!jatek || jatek.vege || !jatek.pvpAktiv || jatek.pvpStatusz === 'finished') {
        activeGamesByUser.delete(userId);
        return false;
    }
    return true;
}

function getOpponentColor(szin) {
    return szin === 'white' ? 'black' : 'white';
}

/**
 * PvP ELO frissítés mindkét játékosra. A használt ELO oszlop a játék mode-jából
 * származik. Casual módban (jatek.ranked === false) vagy ha a mode-nak nincs
 * eloColumn-ja, egyáltalán nem frissít — null-t ad vissza.
 * @param {object} jatek
 * @param {'white'|'black'|'draw'} eredmeny
 * @returns {{ feher: { ujElo, valtozas }, fekete: { ujElo, valtozas } } | null}
 */
async function pvpEloFrissit(jatek, eredmeny) {
    const mode = getMode(jatek.mode);
    if (!jatek.ranked || !mode || !mode.eloColumn) return null;
    const eloOszlop = mode.eloColumn;

    const whiteId = jatek.jatekosok.white.userId;
    const blackId = jatek.jatekosok.black.userId;

    const [whiteElo, blackElo, whiteMeccsek, blackMeccsek] = await Promise.all([
        chessSql.eloLekerdezDb(whiteId, eloOszlop),
        chessSql.eloLekerdezDb(blackId, eloOszlop),
        chessSql.meccsekSzamDb(whiteId),
        chessSql.meccsekSzamDb(blackId)
    ]);

    const { feher, fekete } = eloMeccsEredmeny(
        whiteElo || 800, blackElo || 800,
        eredmeny,
        whiteMeccsek, blackMeccsek
    );

    await Promise.all([
        chessSql.eloFrissitDb(whiteId, feher.ujElo, eloOszlop),
        chessSql.eloFrissitDb(blackId, fekete.ujElo, eloOszlop)
    ]);

    console.log(`[ELO][${jatek.mode}/${eloOszlop}] white #${whiteId}: ${whiteElo}→${feher.ujElo}, black #${blackId}: ${blackElo}→${fekete.ujElo}`);
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

    // ELO frissítés (casual módban null — kihagyjuk)
    let eloEredmeny = null;
    try {
        eloEredmeny = await pvpEloFrissit(jatek, eredmeny);
        if (eloEredmeny) {
            jatek.eloValtozas = {
                white: { eloBefore: eloEredmeny.feher.ujElo - eloEredmeny.feher.valtozas, eloAfter: eloEredmeny.feher.ujElo, eloChange: eloEredmeny.feher.valtozas },
                black: { eloBefore: eloEredmeny.fekete.ujElo - eloEredmeny.fekete.valtozas, eloAfter: eloEredmeny.fekete.ujElo, eloChange: eloEredmeny.fekete.valtozas }
            };
        }
    } catch (err) {
        console.error('PvP ELO frissítési hiba:', err);
    }

    // DB mentés + statisztikák
    if (dbGameId) {
        try {
            // PGN-szeru leiras a moves tablabol az admin review celra. A
            // games.pgn oszlopba mentodik, igy a Bejelentesek panel review
            // modal-jaban + a .pgn / .txt letoltesnel teljes lepessor latszik.
            // Result string PGN-konvencio: "1-0" / "0-1" / "1/2-1/2".
            let pgnResult = '*';
            if (eredmeny === 'draw') pgnResult = '1/2-1/2';
            else if (eredmeny === 'white') pgnResult = '1-0';
            else if (eredmeny === 'black') pgnResult = '0-1';

            let pgnString = null;
            try {
                pgnString = await chessSql.buildPgnLikeFromMoves(dbGameId, { result: pgnResult });
            } catch (pgnErr) {
                console.warn('PGN build hiba:', pgnErr.message);
            }

            if (eredmeny === 'draw') {
                await chessSql.jatekVegeMentDb(dbGameId, null, 'draw', pgnString);
                await Promise.all([
                    chessSql.dontetlenMentDb(whiteId),
                    chessSql.dontetlenMentDb(blackId)
                ]);
            } else {
                const winnerId = eredmeny === 'white' ? whiteId : blackId;
                const loserId = eredmeny === 'white' ? blackId : whiteId;
                await chessSql.jatekVegeMentDb(dbGameId, winnerId, 'finished', pgnString);
                await Promise.all([
                    chessSql.gyozelemMentDb(winnerId),
                    chessSql.veresegMentDb(loserId)
                ]);
            }
        } catch (err) {
            console.error('PvP DB mentési hiba:', err);
        }
    }

    // Recent opponents lista frissites: a ket jatekos kolcsonosen egymas
    // legutobbi ellenfele lett. UPSERT-tel megy (ha mar volt par korabban,
    // csak last_played_at + counter bump). Hibat csak warningoljuk, ne
    // tortje meg a game-end emit-flow-t.
    if (whiteId && blackId && whiteId !== blackId) {
        try {
            await sql.recordRecentOpponentPair(whiteId, blackId, dbGameId || null);
        } catch (recentErr) {
            console.warn('recordRecentOpponentPair hiba:', recentErr.message);
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
 * @param {string} mode  — game-mode kulcs
 * @param {boolean} ranked
 */
async function jatekIndit(io, socket1, socket2, user1Id, user1Name, user2Id, user2Name, mode = DEFAULT_MODE, ranked = true) {
    const { gameId, jatek } = jatekLetrehoz({ mode, ranked });

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

    // DB mentés (mode is kerül a games.time_control oszlopba)
    try {
        jatek.dbGameId = await chessSql.jatekMentDb(whiteId, blackId, jatek.mode);
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

    socket.on('chess:invite', async ({ targetUserId, mode, ranked }) => {
        const context = socket.data.socketContext;
        if (!context.userId) {
            return socket.emit('chess:error', { uzenet: 'Be kell jelentkezned.' });
        }
        if (!context.is_email_verified) {
            return socket.emit('chess:error', { uzenet: 'Megerősítetlen email — előbb verifikáld a fiókod.' });
        }

        // Mode validáció — érvénytelen mód esetén default-ra esünk vissza.
        const modeKey = mode && isValidMode(mode) ? mode : DEFAULT_MODE;
        const modeMeta = getMode(modeKey);
        const isRanked = !!(modeMeta.rankedAllowed && ranked !== false);

        const userId = context.userId;
        const username = context.username;

        // Validálások
        if (userId === targetUserId) {
            return socket.emit('chess:error', { uzenet: 'Nem hívhatod meg magadat.' });
        }

        if (hasLiveActiveGame(userId)) {
            return socket.emit('chess:error', { uzenet: 'Már van aktív PvP játékod.' });
        }

        if (hasLiveActiveGame(targetUserId)) {
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

        // Játék létrehozás (waiting állapotban) — mode és ranked is be van állítva
        const { gameId, jatek } = jatekLetrehoz({ mode: modeKey, ranked: isRanked });
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

        // Timeout: 60mp után auto-decline. Védelem: ha az inviter socket-je
        // időközben elszállt és a 5mp grace cleanup már lefutott, a pendingInvites
        // bejegyzés már nincs ott — `has(targetUserId)` rejecteli. A `socket.emit` egy
        // halott socketre noop, az io.to(user-room) a túlélő tab-okra megy.
        const timer = setTimeout(() => {
            if (!pendingInvites.has(targetUserId)) return;
            pendingInvites.delete(targetUserId);
            jatekTorol(gameId);
            if (socket.connected) {
                socket.emit('chess:invite:expired', { targetUserId });
            }
            io.to(`user-room:${targetUserId}`).emit('chess:invite:expired', { inviterName: username });
        }, INVITE_TIMEOUT_MS);

        pendingInvites.set(targetUserId, {
            gameId,
            inviterUserId: userId,
            inviterName: username,
            inviterSocketId: socket.id,
            mode: modeKey,
            ranked: isRanked,
            timer
        });

        // Értesítés küldése — a meghívott lássa a mode-ot és ranked flag-et
        socket.emit('chess:invite:sent', { targetUserId, gameId, mode: modeKey, ranked: isRanked });
        io.to(`user-room:${targetUserId}`).emit('chess:invite:received', {
            gameId,
            inviterUserId: userId,
            inviterName: username,
            mode: modeKey,
            ranked: isRanked
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

        // DB mentés (mode kerül a games.time_control oszlopba)
        try {
            jatek.dbGameId = await chessSql.jatekMentDb(whiteId, blackId, jatek.mode);
        } catch (err) {
            console.error('PvP jatekMentDb hiba:', err);
        }

        // Timer lejárat callback (csak véges idős módnál releváns)
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

    socket.on('chess:queue:join', async ({ mode, ranked } = {}) => {
        const context = socket.data.socketContext;
        if (!context.userId) {
            return socket.emit('chess:error', { uzenet: 'Be kell jelentkezned.' });
        }
        if (!context.is_email_verified) {
            return socket.emit('chess:error', { uzenet: 'Megerősítetlen email — előbb verifikáld a fiókod.' });
        }

        const userId = context.userId;
        const username = context.username;

        // Mode + ranked validáció
        const modeKey = mode && isValidMode(mode) ? mode : DEFAULT_MODE;
        const modeMeta = getMode(modeKey);
        const isRanked = !!(modeMeta.rankedAllowed && ranked !== false);
        const qKey = queueKey(modeKey, isRanked);

        if (hasLiveActiveGame(userId)) {
            return socket.emit('chess:error', { uzenet: 'Már van aktív PvP játékod.' });
        }

        // Már bármelyik queue-ban van?
        if (userQueueIndex.has(userId)) {
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

        // ELO lekérdezés a megfelelő mode-oszlopból (display célra)
        let elo = 800;
        try {
            const oszlop = modeMeta.eloColumn || 'elo';
            const dbElo = await chessSql.eloLekerdezDb(userId, oszlop);
            if (dbElo) elo = dbElo;
        } catch (err) { /* default 800 */ }

        const queue = getQueue(modeKey, isRanked);

        if (queue.length > 0) {
            const opponent = queue.shift();
            userQueueIndex.delete(opponent.userId);

            // Self-match védelem (race condition esetén — ugyanazt a queue-t)
            if (opponent.userId === userId) {
                queue.push({ userId, username, elo, socketId: socket.id, mode: modeKey, ranked: isRanked });
                userQueueIndex.set(userId, qKey);
                socket.emit('chess:queue:joined', { mode: modeKey, ranked: isRanked });
                return;
            }

            // Ellenfél socket megkeresése
            const opponentSockets = await io.in(`user-room:${opponent.userId}`).fetchSockets();
            const opponentSocket = opponentSockets.find(s => s.id === opponent.socketId) || opponentSockets[0];

            if (!opponentSocket) {
                // Ellenfél offline — mi maradunk a queue-ban
                queue.push({ userId, username, elo, socketId: socket.id, mode: modeKey, ranked: isRanked });
                userQueueIndex.set(userId, qKey);
                socket.emit('chess:queue:joined', { mode: modeKey, ranked: isRanked });
                return;
            }

            // Match! Játék indítása az adott mode + ranked beállítással
            await jatekIndit(io, socket, opponentSocket, userId, username, opponent.userId, opponent.username, modeKey, isRanked);
        } else {
            // Queue üres — hozzáadjuk magunkat
            queue.push({ userId, username, elo, socketId: socket.id, mode: modeKey, ranked: isRanked });
            userQueueIndex.set(userId, qKey);
            socket.emit('chess:queue:joined', { mode: modeKey, ranked: isRanked });
        }
    });

    socket.on('chess:queue:leave', () => {
        const context = socket.data.socketContext;
        if (!context.userId) return;

        const qKey = userQueueIndex.get(context.userId);
        if (!qKey) return;

        const queue = matchmakingQueueByMode.get(qKey);
        if (queue) {
            const idx = queue.findIndex(q => q.userId === context.userId);
            if (idx !== -1) queue.splice(idx, 1);
        }
        userQueueIndex.delete(context.userId);
        socket.emit('chess:queue:left');
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

        // Admin spectator broadcast — minden lepest tovabbitunk a /admin namespace
        // game:${dbGameId}:spectator szobajaba is. Csak akkor, ha van DB-id.
        try {
            if (jatek.dbGameId) {
                io.of('/admin').to(`game:${jatek.dbGameId}:spectator`).emit('admin:games:move', {
                    gameId: jatek.dbGameId,
                    move: { fromX, fromY, toX, toY, promotion: promotion || 'queen' },
                    player: { color: szin, userId: context.userId },
                    allapot: jatekAllapotKliens(jatek)
                });
            }
        } catch (err) {
            console.warn('[PvP] admin spectator move broadcast hiba:', err.message);
        }
    });

    // ─────────────────────────────────────
    // KÉPESSÉG AKTIVÁLÁS
    // ─────────────────────────────────────

    socket.on('chess:ability', async ({ gameId, key, params }) => {
        const context = socket.data.socketContext;
        if (!context.userId) return;

        const jatek = jatekKeres(gameId);
        if (!jatek || !jatek.pvpAktiv || jatek.pvpStatusz !== 'active' || jatek.vege) {
            return socket.emit('chess:error', { uzenet: 'Érvénytelen játék.' });
        }

        const szin = getUserColorInGame(jatek, context.userId);
        if (!szin) {
            return socket.emit('chess:error', { uzenet: 'Nem vagy résztvevője ennek a játéknak.' });
        }

        const eredmeny = abilityAktival(jatek, szin, key, params);
        if (!eredmeny.success) {
            return socket.emit('chess:error', { uzenet: eredmeny.error });
        }

        // Async ability log a DB-be
        if (jatek.dbGameId) {
            (async () => {
                try {
                    await chessSql.abilityLogMentDb({
                        gameId: jatek.dbGameId,
                        playerId: context.userId,
                        abilityKey: key
                    });
                } catch (err) {
                    console.error('[PvP] ability log hiba:', err);
                }
            })();
        }

        // Új állapot broadcast mindkét félnek
        io.to(`chess-game:${gameId}`).emit('chess:state:update', {
            allapot: jatekAllapotKliens(jatek)
        });

        // Admin spectator broadcast — kepesseg-aktivalas szinten
        try {
            if (jatek.dbGameId) {
                io.of('/admin').to(`game:${jatek.dbGameId}:spectator`).emit('admin:games:ability', {
                    gameId: jatek.dbGameId,
                    ability: { key, params },
                    player: { color: szin, userId: context.userId },
                    allapot: jatekAllapotKliens(jatek)
                });
            }
        } catch (err) {
            console.warn('[PvP] admin spectator ability broadcast hiba:', err.message);
        }
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

    // Queue-ból eltávolítás (per-mode index alapján)
    const qKey = userQueueIndex.get(userId);
    if (qKey) {
        const queue = matchmakingQueueByMode.get(qKey);
        if (queue) {
            const idx = queue.findIndex(q => q.userId === userId);
            if (idx !== -1) queue.splice(idx, 1);
        }
        userQueueIndex.delete(userId);
    }

    // Pending invite cleanup — grace period, hogy oldalnavigáció (transport close → reconnect)
    // ne törölje a meghívást. 5mp után újra ellenőrizzük, és csak akkor takarítunk, ha a user
    // tényleg offline maradt (egy másik tab/socket sincs).
    const INVITE_DISCONNECT_GRACE_MS = 5_000;
    setTimeout(async () => {
        const stillOnline = (await io.in(`user-room:${userId}`).fetchSockets()).length > 0;
        if (stillOnline) return;

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
    }, INVITE_DISCONNECT_GRACE_MS);

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
        // Ha még mindig disconnectelt → auto-forfeit. Védelem: surrender / draw / abort
        // beállíthatja a `vege`-t vagy törölheti a játékot időközben — ne fire-eljünk
        // double end-eseményt. A jatekKeres() ellenőrzi, hogy a játék létezik-e még.
        const stillExists = jatekKeres(gameId);
        const meccsAktivMegMindig = stillExists
            && !stillExists.vege
            && stillExists.pvpAktiv
            && stillExists.disconnectSzin === szin;
        if (meccsAktivMegMindig) {
            const nyertesSzin = getOpponentColor(szin);
            const uzenet = `${stillExists.pvpJatekosNevek[szin]} kilépett — ${stillExists.pvpJatekosNevek[nyertesSzin]} nyert`;
            await jatekVegeKezeles(stillExists, nyertesSzin, uzenet, io);
        }
    }, DISCONNECT_GRACE_MS);
}

module.exports = {
    registerPvpHandlers,
    handlePvpDisconnect
};
