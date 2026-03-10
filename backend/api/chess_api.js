// ============================================================
// CHESS API ROUTES — Sakk végpontok
// ============================================================
// Saját route fájl a chess rendszerhez.
// Bekötés server.js-ben: app.use('/api/chess', require('./api/chess_api.js'));
// ============================================================

const express = require('express');
const router = express.Router();

const { jatekLetrehoz, jatekKeres, jatekTorol, jatekAllapotKliens } = require('../chess/state.js');
const { jatekUjraIndit, legalLepesekKliens, lepesKoordinataval } = require('../chess/engine.js');
const { idoLeall } = require('../chess/timer.js');
const chessSql = require('../chess/chess_sql_functions.js');

// ────────────────────────────────────────────
// POST /api/chess/new — Új játék indítása
// ────────────────────────────────────────────
router.post('/new', async (req, res) => {
    try {
        const { gameId, jatek } = jatekLetrehoz();

        // Session-ből user ID (ha be van jelentkezve)
        const userId = req.session?.userId || null;

        // Játékos hozzárendelés (egyelőre mindkét oldalt ugyanaz a user játssza — később: matchmaking)
        jatek.jatekosok.white.userId = userId;
        jatek.jatekosok.black.userId = userId;

        // Tábla inicializálás
        const allapot = jatekUjraIndit(jatek);

        // DB mentés (ha van bejelentkezett user)
        if (userId) {
            try {
                const dbGameId = await chessSql.jatekMentDb(userId, userId);
                jatek.dbGameId = dbGameId;
            } catch (dbErr) {
                console.error('Chess DB játék mentési hiba:', dbErr);
                // Játék megy tovább DB nélkül is
            }
        }

        return res.status(200).json({
            gameId,
            allapot
        });
    } catch (err) {
        console.error('Chess new game hiba:', err);
        return res.status(500).json({ error: 'Nem sikerült új játékot indítani.' });
    }
});

// ────────────────────────────────────────────
// GET /api/chess/:id/state — Játékállapot lekérdezése
// ────────────────────────────────────────────
router.get('/:id/state', (req, res) => {
    const gameId = parseInt(req.params.id, 10);
    const jatek = jatekKeres(gameId);
    if (!jatek) return res.status(404).json({ error: 'Játék nem található.' });

    const allapot = jatekAllapotKliens(jatek);

    // Ha időlejárat történt a háttérben
    if (jatek.idoVegeUzenet) {
        allapot.uzenet = jatek.idoVegeUzenet;
        jatek.idoVegeUzenet = null;
    }

    return res.status(200).json(allapot);
});

// ────────────────────────────────────────────
// GET /api/chess/:id/moves/:x/:y — Legális lépések egy bábuhoz
// ────────────────────────────────────────────
router.get('/:id/moves/:x/:y', (req, res) => {
    const gameId = parseInt(req.params.id, 10);
    const x = parseInt(req.params.x, 10);
    const y = parseInt(req.params.y, 10);

    const jatek = jatekKeres(gameId);
    if (!jatek) return res.status(404).json({ error: 'Játék nem található.' });

    if (isNaN(x) || isNaN(y) || x < 0 || x > 7 || y < 0 || y > 7) {
        return res.status(400).json({ error: 'Érvénytelen koordináták.' });
    }

    const lepesek = legalLepesekKliens(jatek, x, y);
    return res.status(200).json({ lepesek });
});

// ────────────────────────────────────────────
// POST /api/chess/:id/move — Lépés végrehajtás
// ────────────────────────────────────────────
router.post('/:id/move', async (req, res) => {
    try {
        const gameId = parseInt(req.params.id, 10);
        const jatek = jatekKeres(gameId);
        if (!jatek) return res.status(404).json({ error: 'Játék nem található.' });

        const { fromX, fromY, toX, toY, promotion } = req.body;

        if ([fromX, fromY, toX, toY].some(v => v === undefined || v === null || isNaN(v))) {
            return res.status(400).json({ error: 'Hiányzó vagy érvénytelen koordináták.' });
        }

        const eredmeny = await lepesKoordinataval(
            jatek,
            parseInt(fromX, 10),
            parseInt(fromY, 10),
            parseInt(toX, 10),
            parseInt(toY, 10),
            promotion || "queen"
        );

        if (!eredmeny.success) {
            return res.status(400).json({ error: eredmeny.error });
        }

        return res.status(200).json({
            allapot: eredmeny.allapot,
            uzenet: eredmeny.uzenet
        });
    } catch (err) {
        console.error('Chess move hiba:', err);
        return res.status(500).json({ error: 'Szerverhiba lépés közben.' });
    }
});

// ────────────────────────────────────────────
// POST /api/chess/:id/reset — Játék újraindítás
// ────────────────────────────────────────────
router.post('/:id/reset', (req, res) => {
    const gameId = parseInt(req.params.id, 10);
    const jatek = jatekKeres(gameId);
    if (!jatek) return res.status(404).json({ error: 'Játék nem található.' });

    const allapot = jatekUjraIndit(jatek);
    return res.status(200).json({ allapot });
});

// ────────────────────────────────────────────
// DELETE /api/chess/:id — Játék törlése (feladás / disconnect)
// ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    const gameId = parseInt(req.params.id, 10);
    const jatek = jatekKeres(gameId);
    if (!jatek) return res.status(404).json({ error: 'Játék nem található.' });

    // DB: játék abandoned-ként zárása
    if (jatek.dbGameId) {
        try {
            await chessSql.jatekVegeMentDb(jatek.dbGameId, null, 'abandoned');
        } catch (dbErr) {
            console.error('Chess DB abandon hiba:', dbErr);
        }
    }

    jatekTorol(gameId);
    return res.status(200).json({ message: 'Játék törölve.' });
});

module.exports = router;
