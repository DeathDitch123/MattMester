// User-vs-user bejelentesek (player-actions). NEM osszekeverendo a
// chat_message_reports-tel: az csak chat-uzenetekre vonatkozik. Itt egy
// felhasznalo bejelenthet egy masik felhasznalot pl. csalas / toxikussag /
// spam / zaklatas / fairplay-megsertes / egyeb miatt.
//
// FONTOS: false report eseten NEM bunteti a bejelentot (chat-tel ellentetben),
// mert egy player-magaviselet utolagosan nehezen ellenorizheto, es a hibas
// bejelentok visszafogasa elrettentene a valid bejelenteseket is.

const { getPool } = require('../database.js');
const { normalizePositiveInt, normalizeListLimit } = require('./_shared.js');

const ALLOWED_CATEGORIES = new Set(['cheating', 'toxicity', 'spam', 'harassment', 'unfair_play', 'other']);
const ALLOWED_STATUSES = new Set(['open', 'under_review', 'closed']);
const ALLOWED_RESOLUTIONS = new Set(['none', 'dismissed', 'warned', 'banned']);
const REPORT_RATE_LIMIT_HOURS = 1;       // 1 ora alatt ugyanaz a bejelento + reported par csak egyszer
const REPORT_PER_HOUR_LIMIT = 10;        // egy user max 10 bejelentest tehet 1 ora alatt

function normalizeCategory(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ALLOWED_CATEGORIES.has(normalized) ? normalized : 'other';
}

function normalizeStatus(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ALLOWED_STATUSES.has(normalized) ? normalized : null;
}

function normalizeResolution(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return ALLOWED_RESOLUTIONS.has(normalized) ? normalized : 'none';
}

function normalizeMessage(value, maxLen = 1000) {
    if (value == null) return null;
    const str = String(value).trim();
    if (!str) return null;
    return str.slice(0, maxLen);
}

// Letrehoz egy bejelentest. Hibakat ad vissza az api-rough-edges miatt
// (rate limit, on bejelentes, mar bejelentett). A hivot a HTTP layer status
// kodot ezekbol allithat.
//
// gameId opcionalis: ha megvan, ellenorizzuk hogy a bejelento ES a bejelentett
// IS reszt vett a meccsben (kulonben barki barkinek a meccsehez "bizonyitekot"
// csatolhatna). Ha a meccs nem letezik vagy nem volt mindketto resztvevo, a
// gameId-t csendben null-re allitjuk - a bejelentes meg lement, csak meccs
// nelkul. Ez igy jobb mint kemenyen elutasitani.
async function createUserReport({ reporterUserId, reportedUserId, category, message, gameId }) {
    // Input validacio ELOSZOR — igy a hibas hivasok DB pool nelkul is olvashato
    // hibat dobnak (getPool() most dob ha nincs init, ezert a validation-t a
    // pool-szerzes ele toltuk).
    const reporter = normalizePositiveInt(reporterUserId, 0);
    const reported = normalizePositiveInt(reportedUserId, 0);
    if (!reporter) throw new Error('Hianyzo bejelento.');
    if (!reported) throw new Error('Hianyzo bejelentett felhasznalo.');
    if (reporter === reported) throw new Error('Onmagadat nem jelentheted be.');

    const pool = getPool();

    // Letezik-e a bejelentett user es nincs-e mar torolve.
    const [userRows] = await pool.execute(
        `SELECT id FROM users WHERE id = ? LIMIT 1`,
        [reported]
    );
    if (!userRows.length) throw new Error('A bejelentett felhasznalo nem talalhato.');

    const normalizedCategory = normalizeCategory(category);
    const normalizedMessage = normalizeMessage(message);

    // gameId validalas: csak akkor mentjuk, ha a bejelento es bejelentett ket
    // jatekosa volt a meccsnek. Egyebkent NULL-re allitjuk (a bejelentes maga
    // megy meccs-bizonyitek nelkul - ez jobb mint a teljes elutasitas).
    let validatedGameId = null;
    const candidateGameId = normalizePositiveInt(gameId, 0);
    if (candidateGameId) {
        try {
            const [gameRows] = await pool.execute(
                `SELECT id, white_player_id, black_player_id
                 FROM games WHERE id = ? LIMIT 1`,
                [candidateGameId]
            );
            if (gameRows.length) {
                const w = Number(gameRows[0].white_player_id);
                const b = Number(gameRows[0].black_player_id);
                const players = new Set([w, b]);
                if (players.has(reporter) && players.has(reported)) {
                    validatedGameId = candidateGameId;
                }
            }
        } catch (err) {
            console.warn('createUserReport game validation hiba:', err.message);
        }
    }

    // Rate-limit ellenorzes #1: ugyanaz a (reporter, reported) par 1 oran belul
    // csak egyszer (anti-spam). Ha mar van open status-u, eldobjuk.
    const [recentPair] = await pool.execute(
        `SELECT id FROM user_reports
         WHERE reporter_user_id = ? AND reported_user_id = ?
         AND status = 'open'
         AND created_at > NOW() - INTERVAL ? HOUR
         LIMIT 1`,
        [reporter, reported, REPORT_RATE_LIMIT_HOURS]
    );
    if (recentPair.length) {
        throw new Error('Mar van nyitott bejelentesed errol a felhasznalorol. Varj amig az admin atnezi.');
    }

    // Rate-limit ellenorzes #2: a bejelento osszesen max N bejelentest tehet / ora.
    const [recentTotal] = await pool.execute(
        `SELECT COUNT(*) AS total FROM user_reports
         WHERE reporter_user_id = ?
         AND created_at > NOW() - INTERVAL 1 HOUR`,
        [reporter]
    );
    if (Number(recentTotal[0]?.total || 0) >= REPORT_PER_HOUR_LIMIT) {
        throw new Error('Tul sok bejelentest tettel az elmult oraban. Probald kesobb.');
    }

    const [result] = await pool.execute(
        `INSERT INTO user_reports (reporter_user_id, reported_user_id, game_id, category, message, status, resolution)
         VALUES (?, ?, ?, ?, ?, 'open', 'none')`,
        [reporter, reported, validatedGameId, normalizedCategory, normalizedMessage]
    );
    return { id: result.insertId, category: normalizedCategory, gameId: validatedGameId };
}

// Admin lista lekerese. Status szuro ('open' | 'under_review' | 'closed' | null=osszes).
async function listUserReports({ status = null, limit = 100 } = {}) {
    const pool = getPool();
    const safeLimit = normalizeListLimit(limit, 100, 500);
    const conditions = [];
    const params = [];

    if (status) {
        const normalized = normalizeStatus(status);
        if (normalized) {
            conditions.push('r.status = ?');
            params.push(normalized);
        }
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(safeLimit);

    const [rows] = await pool.execute(
        `SELECT r.id, r.reporter_user_id, r.reported_user_id, r.game_id, r.category, r.message,
                r.status, r.resolution, r.admin_note, r.reviewed_by_user_id, r.reviewed_at,
                r.created_at,
                ru.username AS reporter_username, ru.profile_image AS reporter_profile_image,
                tu.username AS reported_username, tu.profile_image AS reported_profile_image,
                au.username AS reviewer_username,
                g.status AS game_status, g.time_control AS game_time_control,
                g.start_time AS game_start_time, g.end_time AS game_end_time,
                g.winner_id AS game_winner_id,
                gw.username AS game_white_username, gb.username AS game_black_username,
                g.white_player_id AS game_white_id, g.black_player_id AS game_black_id
         FROM user_reports r
         LEFT JOIN users ru ON ru.id = r.reporter_user_id
         LEFT JOIN users tu ON tu.id = r.reported_user_id
         LEFT JOIN users au ON au.id = r.reviewed_by_user_id
         LEFT JOIN games g  ON g.id  = r.game_id
         LEFT JOIN users gw ON gw.id = g.white_player_id
         LEFT JOIN users gb ON gb.id = g.black_player_id
         ${whereClause}
         ORDER BY r.created_at DESC, r.id DESC
         LIMIT ?`,
        params
    );

    return (rows || []).map((row) => ({
        id: row.id,
        reporterUserId: row.reporter_user_id,
        reporterUsername: row.reporter_username,
        reporterProfileImage: row.reporter_profile_image,
        reportedUserId: row.reported_user_id,
        reportedUsername: row.reported_username,
        reportedProfileImage: row.reported_profile_image,
        gameId: row.game_id,
        game: row.game_id ? {
            id: row.game_id,
            status: row.game_status,
            timeControl: row.game_time_control,
            startTime: row.game_start_time,
            endTime: row.game_end_time,
            winnerId: row.game_winner_id,
            whiteUserId: row.game_white_id,
            blackUserId: row.game_black_id,
            whiteUsername: row.game_white_username,
            blackUsername: row.game_black_username
        } : null,
        category: row.category,
        message: row.message,
        status: row.status,
        resolution: row.resolution,
        adminNote: row.admin_note,
        reviewedByUserId: row.reviewed_by_user_id,
        reviewerUsername: row.reviewer_username,
        reviewedAt: row.reviewed_at,
        createdAt: row.created_at
    }));
}

// Egy konkret meccs reszletes lekerdese admin review-hoz: PGN, lepes-lista
// timestamp-pekkel (timing pattern elemzes), jatekosok, eredmeny.
// Csak admin endpoint hivja, igy itt nincs auth-check - a hivot kell ellenoriznie.
async function getGameReviewById(gameId) {
    const pool = getPool();
    const id = normalizePositiveInt(gameId, 0);
    if (!id) return null;

    const [gameRows] = await pool.execute(
        `SELECT g.id, g.white_player_id, g.black_player_id, g.winner_id,
                g.time_control, g.initial_fen, g.current_fen, g.pgn,
                g.start_time, g.end_time, g.status,
                wu.username AS white_username, wu.profile_image AS white_profile_image,
                bu.username AS black_username, bu.profile_image AS black_profile_image
         FROM games g
         LEFT JOIN users wu ON wu.id = g.white_player_id
         LEFT JOIN users bu ON bu.id = g.black_player_id
         WHERE g.id = ? LIMIT 1`,
        [id]
    );
    if (!gameRows.length) return null;
    const g = gameRows[0];

    const [moveRows] = await pool.execute(
        `SELECT id, player_id, ply_number, san, piece, from_pos, to_pos,
                fen_after, is_capture, is_check, is_checkmate, promotion_piece, timestamp
         FROM moves WHERE game_id = ? ORDER BY ply_number ASC, id ASC`,
        [id]
    );

    // Timing breakdown: a lepesek kozotti idokulonbsegek (gyors gyanus moves).
    let prevTs = g.start_time ? new Date(g.start_time).getTime() : null;
    const moves = (moveRows || []).map((m) => {
        const ts = m.timestamp ? new Date(m.timestamp).getTime() : null;
        const thinkMs = (prevTs && ts) ? Math.max(0, ts - prevTs) : null;
        prevTs = ts;
        return {
            id: m.id,
            playerId: m.player_id,
            plyNumber: m.ply_number,
            san: m.san,
            piece: m.piece,
            fromPos: m.from_pos,
            toPos: m.to_pos,
            fenAfter: m.fen_after,
            isCapture: !!m.is_capture,
            isCheck: !!m.is_check,
            isCheckmate: !!m.is_checkmate,
            promotionPiece: m.promotion_piece,
            timestamp: m.timestamp,
            thinkMs
        };
    });

    return {
        id: g.id,
        whitePlayerId: g.white_player_id,
        blackPlayerId: g.black_player_id,
        winnerId: g.winner_id,
        timeControl: g.time_control,
        initialFen: g.initial_fen,
        currentFen: g.current_fen,
        pgn: g.pgn,
        startTime: g.start_time,
        endTime: g.end_time,
        status: g.status,
        whiteUsername: g.white_username,
        whiteProfileImage: g.white_profile_image,
        blackUsername: g.black_username,
        blackProfileImage: g.black_profile_image,
        moves
    };
}

// Admin allapot-frissites. Minden mezo opcionalis, csak ami megvan, az iru.
// A reviewedByUserId akkor alkalmazodik, ha a status valtozik valamire ami nem 'open'.
async function updateUserReportStatus(reportId, { status, resolution, adminNote, reviewerUserId }) {
    const pool = getPool();
    const id = normalizePositiveInt(reportId, 0);
    if (!id) throw new Error('Ervenytelen bejelentes azonosito.');

    const [existing] = await pool.execute(`SELECT id FROM user_reports WHERE id = ? LIMIT 1`, [id]);
    if (!existing.length) throw new Error('A bejelentes nem talalhato.');

    const sets = [];
    const params = [];

    if (status !== undefined) {
        const normalizedStatus = normalizeStatus(status);
        if (!normalizedStatus) throw new Error('Ervenytelen status.');
        sets.push('status = ?');
        params.push(normalizedStatus);

        // Reviewer + reviewed_at automatikus lokon, ha a status nem 'open'.
        if (normalizedStatus !== 'open') {
            const reviewer = normalizePositiveInt(reviewerUserId, 0) || null;
            sets.push('reviewed_by_user_id = ?');
            params.push(reviewer);
            sets.push('reviewed_at = NOW()');
        } else {
            sets.push('reviewed_by_user_id = NULL');
            sets.push('reviewed_at = NULL');
        }
    }

    if (resolution !== undefined) {
        sets.push('resolution = ?');
        params.push(normalizeResolution(resolution));
    }

    if (adminNote !== undefined) {
        sets.push('admin_note = ?');
        params.push(normalizeMessage(adminNote));
    }

    if (!sets.length) return { updated: false };

    params.push(id);
    await pool.execute(`UPDATE user_reports SET ${sets.join(', ')} WHERE id = ?`, params);
    return { updated: true };
}

// Aggregalt szamlalo (admin dashboard chips).
async function countUserReportsByStatus() {
    const pool = getPool();
    const [rows] = await pool.execute(
        `SELECT status, COUNT(*) AS total FROM user_reports GROUP BY status`
    );
    const result = { open: 0, under_review: 0, closed: 0, total: 0 };
    for (const row of rows) {
        const key = String(row.status);
        if (Object.prototype.hasOwnProperty.call(result, key)) {
            result[key] = Number(row.total || 0);
        }
        result.total += Number(row.total || 0);
    }
    return result;
}

module.exports = {
    ALLOWED_CATEGORIES: [...ALLOWED_CATEGORIES],
    ALLOWED_STATUSES: [...ALLOWED_STATUSES],
    ALLOWED_RESOLUTIONS: [...ALLOWED_RESOLUTIONS],
    createUserReport,
    listUserReports,
    updateUserReportStatus,
    countUserReportsByStatus,
    getGameReviewById
};
