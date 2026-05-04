// Jatszmak (games) admin-szintu olvaso/iro modul. A "Jatszmak" admin oldal hivja.
// Listazza a jatszmakat status szerint (folyamatban / befejezett / megszakitott / dontetlen),
// resztletes view-t ad egy konkret meccsre (lepesekkel + chat + abilities), PGN
// stringet generalja a frontend letolteshez, illetve admin-szintu force-end muveletet
// biztosit (status='abandoned' + end_time=NOW()).

const { getPool } = require('../database.js');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const VALID_STATUSES = new Set(['ongoing', 'finished', 'abandoned', 'draw']);

function clampLimit(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)));
}

function clampOffset(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.max(0, Math.floor(n));
}

async function listGames(options = {}) {
    const limit = clampLimit(options.limit);
    const offset = clampOffset(options.offset);
    const pool = getPool();

    const conditions = [];
    const params = [];

    // Status filter: 'all' vagy specifikus status
    if (options.status && options.status !== 'all' && VALID_STATUSES.has(options.status)) {
        conditions.push('g.status = ?');
        params.push(options.status);
    }

    // Player filter (white VAGY black)
    if (options.playerId) {
        conditions.push('(g.white_player_id = ? OR g.black_player_id = ?)');
        params.push(Number(options.playerId), Number(options.playerId));
    }

    // Search: username partial match
    if (options.search) {
        const term = `%${String(options.search).trim()}%`;
        conditions.push('(uw.username LIKE ? OR ub.username LIKE ?)');
        params.push(term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.execute(
        `SELECT g.id, g.white_player_id, g.black_player_id, g.winner_id,
                g.time_control, g.status, g.start_time, g.end_time,
                uw.username AS white_username,
                ub.username AS black_username,
                uwin.username AS winner_username,
                (SELECT COUNT(*) FROM moves WHERE game_id = g.id) AS move_count
         FROM games g
         LEFT JOIN users uw ON uw.id = g.white_player_id
         LEFT JOIN users ub ON ub.id = g.black_player_id
         LEFT JOIN users uwin ON uwin.id = g.winner_id
         ${whereClause}
         ORDER BY g.start_time DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
    );

    return rows.map((row) => ({
        id: row.id,
        white: { id: row.white_player_id, username: row.white_username },
        black: { id: row.black_player_id, username: row.black_username },
        winner: row.winner_id ? { id: row.winner_id, username: row.winner_username } : null,
        timeControl: row.time_control,
        status: row.status,
        startTime: row.start_time,
        endTime: row.end_time,
        moveCount: Number(row.move_count) || 0
    }));
}

async function getGameCounts() {
    const pool = getPool();
    const [rows] = await pool.execute(
        `SELECT
            SUM(CASE WHEN status = 'ongoing'   THEN 1 ELSE 0 END) AS ongoing,
            SUM(CASE WHEN status = 'finished'  THEN 1 ELSE 0 END) AS finished,
            SUM(CASE WHEN status = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
            SUM(CASE WHEN status = 'draw'      THEN 1 ELSE 0 END) AS draw
         FROM games`
    );
    const r = rows[0] || {};
    return {
        ongoing: Number(r.ongoing) || 0,
        finished: Number(r.finished) || 0,
        abandoned: Number(r.abandoned) || 0,
        draw: Number(r.draw) || 0
    };
}

async function getGameById(id) {
    const pool = getPool();
    const [rows] = await pool.execute(
        `SELECT g.id, g.white_player_id, g.black_player_id, g.winner_id,
                g.time_control, g.initial_fen, g.current_fen, g.pgn,
                g.start_time, g.end_time, g.status,
                uw.username AS white_username,
                ub.username AS black_username,
                uwin.username AS winner_username
         FROM games g
         LEFT JOIN users uw ON uw.id = g.white_player_id
         LEFT JOIN users ub ON ub.id = g.black_player_id
         LEFT JOIN users uwin ON uwin.id = g.winner_id
         WHERE g.id = ?
         LIMIT 1`,
        [Number(id) || 0]
    );
    if (!rows.length) return null;
    const g = rows[0];

    const [moveRows] = await pool.execute(
        `SELECT m.id, m.ply_number, m.san, m.piece, m.from_pos, m.to_pos,
                m.fen_after, m.is_capture, m.is_check, m.is_checkmate,
                m.promotion_piece, m.timestamp, m.player_id,
                u.username AS player_username
         FROM moves m
         LEFT JOIN users u ON u.id = m.player_id
         WHERE m.game_id = ?
         ORDER BY m.ply_number ASC, m.id ASC`,
        [Number(id)]
    );

    return {
        id: g.id,
        white: { id: g.white_player_id, username: g.white_username },
        black: { id: g.black_player_id, username: g.black_username },
        winner: g.winner_id ? { id: g.winner_id, username: g.winner_username } : null,
        timeControl: g.time_control,
        initialFen: g.initial_fen,
        currentFen: g.current_fen,
        pgn: g.pgn,
        startTime: g.start_time,
        endTime: g.end_time,
        status: g.status,
        moves: moveRows.map((m) => ({
            id: m.id,
            plyNumber: m.ply_number,
            san: m.san,
            piece: m.piece,
            fromPos: m.from_pos,
            toPos: m.to_pos,
            fenAfter: m.fen_after,
            isCapture: Boolean(m.is_capture),
            isCheck: Boolean(m.is_check),
            isCheckmate: Boolean(m.is_checkmate),
            promotionPiece: m.promotion_piece,
            timestamp: m.timestamp,
            player: { id: m.player_id, username: m.player_username }
        }))
    };
}

// PGN string generalas. Ha a games.pgn mar ki van toltve (befejezett meccsek),
// azt hasznaljuk. Folyamatban levo / regi meccseknel a moves-bol epitjuk fel.
// Standard PGN format: 7 fejlec-tag (Event/Site/Date/Round/White/Black/Result),
// majd a SAN lepesek paronkent szamozva.
function buildPgnFromGame(game) {
    if (game.pgn && String(game.pgn).trim().length > 0) {
        return game.pgn;
    }

    const result = (() => {
        if (game.status === 'finished' && game.winner) {
            return Number(game.winner.id) === Number(game.white?.id) ? '1-0' : '0-1';
        }
        if (game.status === 'draw') return '1/2-1/2';
        return '*';
    })();

    const dateStr = game.startTime
        ? new Date(game.startTime).toISOString().slice(0, 10).replace(/-/g, '.')
        : '????.??.??';

    const headers = [
        `[Event "MattMester ${game.timeControl || '10+0'}"]`,
        `[Site "mattmester.hu"]`,
        `[Date "${dateStr}"]`,
        `[Round "-"]`,
        `[White "${game.white?.username || 'Unknown'}"]`,
        `[Black "${game.black?.username || 'Unknown'}"]`,
        `[Result "${result}"]`
    ];

    if (game.timeControl) {
        headers.push(`[TimeControl "${game.timeControl}"]`);
    }
    if (game.initialFen && game.initialFen !== 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
        headers.push(`[FEN "${game.initialFen}"]`);
        headers.push(`[SetUp "1"]`);
    }

    const moveText = [];
    let moveNumber = 1;
    for (let i = 0; i < game.moves.length; i++) {
        const m = game.moves[i];
        const san = m.san || `${m.piece || 'P'}${m.fromPos || ''}-${m.toPos || ''}`;
        if (i % 2 === 0) {
            moveText.push(`${moveNumber}. ${san}`);
        } else {
            moveText.push(san);
            moveNumber += 1;
        }
    }
    moveText.push(result);

    return [headers.join('\n'), '', moveText.join(' ')].join('\n');
}

// Force-end: admin altal eroltetett megszakitas. status='abandoned',
// end_time=NOW(), winner_id NULL marad. Nem irjuk a games.pgn-t — a PGN
// generator on-the-fly epiti fel a moves-bol.
async function forceEndGame(gameId, adminUserId) {
    const before = await getGameById(gameId);
    if (!before) {
        const err = new Error('A megadott jatszma nem talalhato.');
        err.code = 'GAME_NOT_FOUND';
        throw err;
    }
    if (before.status !== 'ongoing') {
        const err = new Error(`A jatszma mar nem aktiv (allapot: ${before.status}).`);
        err.code = 'GAME_NOT_ONGOING';
        throw err;
    }
    const pool = getPool();
    await pool.execute(
        `UPDATE games SET status = 'abandoned', end_time = CURRENT_TIMESTAMP WHERE id = ?`,
        [Number(gameId)]
    );
    const after = await getGameById(gameId);
    return { before, after };
}

module.exports = {
    listGames,
    getGameCounts,
    getGameById,
    buildPgnFromGame,
    forceEndGame
};
