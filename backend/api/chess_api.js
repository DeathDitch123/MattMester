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
const { botLepesValaszt, nehezsegiSzintInfo, osszesNehezsegiSzint } = require('../chess/bot.js');
const { eloSzamit, KEZDO_ELO } = require('../chess/elo.js');

// ────────────────────────────────────────────
// GET /api/chess/difficulties — Nehézségi szintek lekérdezése
// ────────────────────────────────────────────
router.get('/difficulties', (req, res) => {
    return res.status(200).json({ szintek: osszesNehezsegiSzint() });
});

// ────────────────────────────────────────────
// GET /api/chess/user-elo — Játékos ELO lekérdezése
// (FONTOS: a /:id route-ok ELŐTT kell legyen!)
// ────────────────────────────────────────────
router.get('/user-elo', async (req, res) => {
    try {
        const userId = req.session?.userId || null;
        if (!userId) {
            return res.status(200).json({ elo: KEZDO_ELO, bejelentkezve: false });
        }
        const elo = await chessSql.eloLekerdezDb(userId);
        return res.status(200).json({ elo: elo || KEZDO_ELO, bejelentkezve: true });
    } catch (err) {
        console.error('ELO lekérdezés hiba:', err);
        return res.status(500).json({ error: 'Hiba az ELO lekérdezésekor.' });
    }
});

// ────────────────────────────────────────────
// POST /api/chess/new — Új játék indítása (PvP / lokális)
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
// POST /api/chess/new-bot — Új játék robot ellen
// ────────────────────────────────────────────
router.post('/new-bot', async (req, res) => {
    try {
        const { difficulty } = req.body;
        const nehezseg = parseInt(difficulty, 10);

        if (!nehezseg || nehezseg < 1 || nehezseg > 8) {
            return res.status(400).json({ error: 'Érvénytelen nehézségi szint (1-8).' });
        }

        const { gameId, jatek } = jatekLetrehoz();
        const userId = req.session?.userId || null;
        const botInfo = nehezsegiSzintInfo(nehezseg);

        // Bot beállítás: user = fehér, bot = fekete
        jatek.botAktiv = true;
        jatek.botSzin = "black";
        jatek.nehezseg = nehezseg;

        jatek.jatekosok.white.userId = userId;
        jatek.jatekosok.black.userId = null; // bot

        // Tábla inicializálás
        const allapot = jatekUjraIndit(jatek);

        // DB mentés
        if (userId) {
            try {
                const dbGameId = await chessSql.jatekMentDb(userId, userId); // bot-nak nincs userId
                jatek.dbGameId = dbGameId;
            } catch (dbErr) {
                console.error('Chess DB bot játék mentési hiba:', dbErr);
            }
        }

        return res.status(200).json({
            gameId,
            allapot,
            botInfo: {
                nev: botInfo.nev,
                elo: botInfo.elo,
                szint: nehezseg
            }
        });
    } catch (err) {
        console.error('Chess new bot game hiba:', err);
        return res.status(500).json({ error: 'Nem sikerült bot játékot indítani.' });
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

    // Bot játékban: nem kérhet lépéseket a bot bábujaihoz
    if (jatek.botAktiv && jatek.koronLevo === jatek.botSzin) {
        return res.status(400).json({ error: 'A robot gondolkodik.' });
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

        // Bot játékban: nem lehet a bot helyett lépni
        if (jatek.botAktiv && jatek.koronLevo === jatek.botSzin) {
            return res.status(400).json({ error: 'Nem a te köröd.' });
        }

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

        // ── BOT VÁLASZLÉPÉS ──
        let botLepes = null;
        if (jatek.botAktiv && !jatek.vege && jatek.koronLevo === jatek.botSzin) {
            await new Promise(r => setTimeout(r, 1000)); // 1 mp várakozás → bot órája tikkel
            const botValasz = jatek.vege ? null : botLepesValaszt(jatek, jatek.nehezseg);
            if (botValasz) {
                const botEredmeny = await lepesKoordinataval(
                    jatek,
                    botValasz.fromX, botValasz.fromY,
                    botValasz.toX, botValasz.toY,
                    botValasz.promotion || "queen"
                );
                if (botEredmeny.success) {
                    botLepes = {
                        from: { x: botValasz.fromX, y: botValasz.fromY },
                        to: { x: botValasz.toX, y: botValasz.toY }
                    };
                    // Ha a bot lépése véget ér a játék
                    if (botEredmeny.uzenet) {
                        eredmeny.uzenet = botEredmeny.uzenet;
                    }
                }
            }
        }

        // ── ELO FRISSÍTÉS JÁTÉK VÉGÉN ──
        if (jatek.vege && jatek.botAktiv) {
            await eloFrissitJatekVegen(jatek, eredmeny.uzenet);
        }

        return res.status(200).json({
            allapot: jatekAllapotKliens(jatek),
            uzenet: eredmeny.uzenet,
            botLepes
        });
    } catch (err) {
        console.error('Chess move hiba:', err);
        return res.status(500).json({ error: 'Szerverhiba lépés közben.' });
    }
});

// ────────────────────────────────────────────
// ELO FRISSÍTÉS SEGÉDFÜGGVÉNY
// ────────────────────────────────────────────
async function eloFrissitJatekVegen(jatek, uzenet) {
    try {
        const jatekosSzin = (jatek.botSzin === "white") ? "black" : "white";
        const jatekosId = jatek.jatekosok[jatekosSzin].userId;
        if (!jatekosId) return;

        const botInfo = nehezsegiSzintInfo(jatek.nehezseg);
        const jatekosElo = await chessSql.eloLekerdezDb(jatekosId);
        if (jatekosElo === null) return;

        // Meccsszám lekérdezés (K-faktor)
        const meccsek = await chessSql.meccsekSzamDb(jatekosId);

        // Eredmény meghatározás
        let eredmeny;
        if (uzenet && uzenet.includes("nyert")) {
            // Ki nyert?
            if (uzenet.includes(jatek.botSzin)) {
                // A bot színe nyert → játékos veszített
                eredmeny = 0;
            } else {
                // Játékos nyert
                eredmeny = 1;
            }
        } else if (uzenet && (uzenet.includes("Döntetlen") || uzenet.includes("patt") || uzenet.includes("50 lépés"))) {
            eredmeny = 0.5;
        } else {
            // Időlejárat vagy egyéb
            if (uzenet && uzenet.includes("időtúllépés")) {
                // Ki lépte túl az időt?
                if (uzenet.includes(jatekosSzin)) {
                    eredmeny = 0; // játékos lépte túl
                } else {
                    eredmeny = 1; // bot lépte túl
                }
            } else {
                return; // ismeretlen eredmény, nem módosítunk ELO-t
            }
        }

        const { ujElo, valtozas } = eloSzamit(jatekosElo, botInfo.elo, eredmeny, meccsek);
        await chessSql.eloFrissitDb(jatekosId, ujElo);

        console.log(`[ELO] User #${jatekosId}: ${jatekosElo} → ${ujElo} (${valtozas >= 0 ? '+' : ''}${valtozas}) vs Bot(${botInfo.nev})`);
    } catch (err) {
        console.error('ELO frissítés hiba:', err);
    }
}

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
