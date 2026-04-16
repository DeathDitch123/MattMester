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

function varakozas(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function findGameOrThrow(paramId) {
    const gameId = parseInt(paramId, 10);
    const jatek = jatekKeres(gameId);
    if (!jatek) {
        const e = new Error('Játék nem található.');
        e.statusCode = 404;
        throw e;
    }
    return jatek;
}

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
    let statusCode = 200;
    let responseBody = { elo: KEZDO_ELO, bejelentkezve: false };
    try {
        const userId = req.session?.userId || null;
        if (userId) {
            const elo = await chessSql.eloLekerdezDb(userId);
            responseBody = { elo: elo || KEZDO_ELO, bejelentkezve: true };
        }
        return res.status(statusCode).json(responseBody);
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
    let statusCode = 200;
    let responseBody = null;
    try {
        const { difficulty } = req.body;
        const nehezseg = parseInt(difficulty, 10);

        if (!nehezseg || nehezseg < 1 || nehezseg > 8) {
            statusCode = 400;
            responseBody = { error: 'Érvénytelen nehézségi szint (1-8).' };
        } else {
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

            responseBody = {
                gameId,
                allapot,
                botInfo: {
                    nev: botInfo.nev,
                    elo: botInfo.elo,
                    szint: nehezseg
                }
            };
        }

        return res.status(statusCode).json(responseBody);
    } catch (err) {
        console.error('Chess new bot game hiba:', err);
        return res.status(500).json({ error: 'Nem sikerült bot játékot indítani.' });
    }
});

// ────────────────────────────────────────────
// GET /api/chess/:id/state — Játékállapot lekérdezése
// ────────────────────────────────────────────
router.get('/:id/state', (req, res) => {
    let statusCode = 200;
    let payload;
    try {
        const jatek = findGameOrThrow(req.params.id);
        payload = jatekAllapotKliens(jatek);
        if (jatek.idoVegeUzenet) {
            payload.uzenet = jatek.idoVegeUzenet;
            jatek.idoVegeUzenet = null;
        }
    } catch (err) {
        statusCode = err.statusCode || 500;
        payload = { error: err.message };
    }
    res.status(statusCode).json(payload);
});

// ────────────────────────────────────────────
// GET /api/chess/:id/moves/:x/:y — Legális lépések egy bábuhoz
// ────────────────────────────────────────────
router.get('/:id/moves/:x/:y', (req, res) => {
    let statusCode = 200;
    let payload;
    try {
        const jatek = findGameOrThrow(req.params.id);
        const x = parseInt(req.params.x, 10);
        const y = parseInt(req.params.y, 10);

        if (isNaN(x) || isNaN(y) || x < 0 || x > 7 || y < 0 || y > 7) {
            statusCode = 400;
            throw new Error('Érvénytelen koordináták.');
        }

        if (jatek.botAktiv && jatek.koronLevo === jatek.botSzin) {
            statusCode = 400;
            throw new Error('A robot gondolkodik.');
        }

        payload = { lepesek: legalLepesekKliens(jatek, x, y) };
    } catch (err) {
        if (statusCode === 200) statusCode = err.statusCode || 500;
        payload = { error: err.message };
    }
    res.status(statusCode).json(payload);
});

// ────────────────────────────────────────────
// POST /api/chess/:id/move — Lépés végrehajtás
// ────────────────────────────────────────────
router.post('/:id/move', async (req, res) => {
    try {
        const jatek = findGameOrThrow(req.params.id);

        if (jatek.botAktiv && jatek.koronLevo === jatek.botSzin) {
            // Bot játékban: nem lehet a bot helyett lépni
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

        // A bot aszinkron lép a háttérben — a játékos azonnal látja a saját lépését.
        const botKell = jatek.botAktiv && !jatek.vege && jatek.koronLevo === jatek.botSzin;
        if (botKell) {
            jatek.botGondolkodik = true;
        }

        // Azonnali válasz a játékos lépésére
        res.status(200).json({
            allapot: jatekAllapotKliens(jatek),
            uzenet: eredmeny.uzenet
        });

        // ELO frissítés, ha a játékos lépése véget ért a játéknak
        if (!botKell && jatek.vege && jatek.botAktiv) {
            const eloValtozas = await eloFrissitJatekVegen(jatek, eredmeny.uzenet);
            if (eloValtozas) {
                jatek.eloValtozas = eloValtozas;
            }
        }

        // Bot aszinkron válaszlépés
        if (botKell) {
            const botConfig = nehezsegiSzintInfo(jatek.nehezseg);
            (async () => {
                try {
                    // Késleltetés az UI stabil megjelenítéséhez, majd bot számítás.
                    await varakozas(botConfig.varakozasMs);

                    const botValasz = jatek.vege ? null : botLepesValaszt(jatek, jatek.nehezseg);
                    if (botValasz && !jatek.vege) {
                        const botEredmeny = await lepesKoordinataval(
                            jatek,
                            botValasz.fromX, botValasz.fromY,
                            botValasz.toX, botValasz.toY,
                            botValasz.promotion || "queen"
                        );

                        if (botEredmeny.success && jatek.vege) {
                            const eloValtozas = await eloFrissitJatekVegen(jatek, botEredmeny.uzenet);
                            if (eloValtozas) {
                                jatek.eloValtozas = eloValtozas;
                            }
                        }
                    }
                } catch (err) {
                    console.error('Bot aszinkron lépés hiba:', err);
                } finally {
                    jatek.botGondolkodik = false;
                }
            })();
        }
    } catch (err) {
        console.error('Chess move hiba:', err);
        if (!res.headersSent) {
            res.status(err.statusCode || 500).json({ error: err.message || 'Szerverhiba lépés közben.' });
        }
    }
});

// ────────────────────────────────────────────
// ELO FRISSÍTÉS SEGÉDFÜGGVÉNY
// ────────────────────────────────────────────
async function eloFrissitJatekVegen(jatek, uzenet) {
    try {
        const jatekosSzin = (jatek.botSzin === "white") ? "black" : "white";
        const jatekosId = jatek.jatekosok[jatekosSzin].userId;
        if (!jatekosId) return null;

        const botInfo = nehezsegiSzintInfo(jatek.nehezseg);
        const jatekosElo = await chessSql.eloLekerdezDb(jatekosId);
        if (jatekosElo === null) return null;

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
                return null; // ismeretlen eredmény, nem módosítunk ELO-t
            }
        }

        const { ujElo, valtozas } = eloSzamit(jatekosElo, botInfo.elo, eredmeny, meccsek);
        await chessSql.eloFrissitDb(jatekosId, ujElo);

        console.log(`[ELO] User #${jatekosId}: ${jatekosElo} → ${ujElo} (${valtozas >= 0 ? '+' : ''}${valtozas}) vs Bot(${botInfo.nev})`);
        return {
            eloBefore: jatekosElo,
            eloAfter: ujElo,
            eloChange: valtozas,
            botElo: botInfo.elo,
            botName: botInfo.nev
        };
    } catch (err) {
        console.error('ELO frissítés hiba:', err);
        return null;
    }
}

// ────────────────────────────────────────────
// POST /api/chess/:id/reset — Játék újraindítás
// ────────────────────────────────────────────
router.post('/:id/reset', (req, res) => {
    let statusCode = 200;
    let payload;
    try {
        const jatek = findGameOrThrow(req.params.id);
        payload = { allapot: jatekUjraIndit(jatek) };
    } catch (err) {
        statusCode = err.statusCode || 500;
        payload = { error: err.message };
    }
    res.status(statusCode).json(payload);
});

// ────────────────────────────────────────────
// POST /api/chess/:id/surrender — Feladás ELO-változással
// ────────────────────────────────────────────
router.post('/:id/surrender', async (req, res) => {
    let statusCode = 200;
    let payload;
    try {
        const jatek = findGameOrThrow(req.params.id);

        if (jatek.vege) {
            payload = { message: 'Játék már véget ért.', uzenet: 'Feladtad a játékot.' };
        } else {
            jatek.vege = true;
            let uzenet = 'Feladtad a játékot.';
            let eloValtozas = null;

            if (jatek.botAktiv) {
                uzenet = `Feladás — ${jatek.botSzin} nyert`;
                eloValtozas = await eloFrissitJatekVegen(jatek, uzenet);

                const jatekosSzin = jatek.botSzin === 'white' ? 'black' : 'white';
                const jatekosId = jatek.jatekosok[jatekosSzin].userId;
                if (jatekosId) {
                    try {
                        await chessSql.veresegMentDb(jatekosId);
                    } catch (dbErr) {
                        console.error('Vereség mentési hiba feladásnál:', dbErr);
                    }
                }

                if (jatek.dbGameId) {
                    try {
                        await chessSql.jatekVegeMentDb(jatek.dbGameId, null, 'abandoned');
                    } catch (dbErr) {
                        console.error('Chess DB surrender mentési hiba:', dbErr);
                    }
                }
            }

            const gameId = parseInt(req.params.id, 10);
            jatekTorol(gameId);
            payload = { message: 'Játék feladva.', uzenet, eloValtozas };
        }
    } catch (err) {
        console.error('Surrender hiba:', err);
        statusCode = err.statusCode || 500;
        payload = { error: err.message || 'Szerverhiba feladásnál.' };
    }
    res.status(statusCode).json(payload);
});

// ────────────────────────────────────────────
// DELETE /api/chess/:id — Játék törlése (feladás / disconnect)
// ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    let statusCode = 200;
    let payload;
    try {
        const jatek = findGameOrThrow(req.params.id);
        const gameId = parseInt(req.params.id, 10);

        if (jatek.dbGameId) {
            try {
                await chessSql.jatekVegeMentDb(jatek.dbGameId, null, 'abandoned');
            } catch (dbErr) {
                console.error('Chess DB abandon hiba:', dbErr);
            }
        }

        jatekTorol(gameId);
        payload = { message: 'Játék törölve.' };
    } catch (err) {
        statusCode = err.statusCode || 500;
        payload = { error: err.message };
    }
    res.status(statusCode).json(payload);
});

module.exports = router;
