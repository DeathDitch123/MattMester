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
const { botLepesValaszt, botKepessegValaszt, nehezsegiSzintInfo, osszesNehezsegiSzint } = require('../chess/bot.js');
const { eloSzamit, KEZDO_ELO } = require('../chess/elo.js');
const { requireVerifiedEmail } = require('./funtions.js');
const { abilityAktival, getKliensConfig, ABILITY_CONFIG } = require('../chess/abilities.js');
const { isValidMode, getMode, listClient: listModesClient, DEFAULT_MODE } = require('../chess/modes.js');

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

// Authorization helper: a kérő be van jelentkezve ÉS résztvevője a játéknak.
// Visszaadja a játékos színét a játékban ('white' | 'black'). Hot-seat módban
// (mindkét szín ugyanaz az userId) a koronLevo szerinti aktív színt adja vissza.
// Throw-ol 401-gyel ha nincs session, 403-mal ha nem résztvevő.
function requireParticipant(req, jatek) {
    const userId = req.session?.userId || null;
    if (!userId) {
        const e = new Error('Bejelentkezés szükséges.');
        e.statusCode = 401;
        throw e;
    }
    const whiteId = jatek.jatekosok.white.userId;
    const blackId = jatek.jatekosok.black.userId;
    let szin = null;
    if (whiteId === blackId && whiteId === userId) {
        szin = jatek.koronLevo; // hot-seat: aktív szín
    } else if (whiteId === userId) {
        szin = 'white';
    } else if (blackId === userId) {
        szin = 'black';
    }
    if (!szin) {
        const e = new Error('Nem vagy résztvevője ennek a játéknak.');
        e.statusCode = 403;
        throw e;
    }
    return szin;
}

// PvP játékokat REST-tel NEM szabad módosítani (lépés/feladás/reset/törlés) —
// a frontend a socket-eseményeket használja, a REST egy bypass lenne ami megkerüli
// a per-játékos validációt és a broadcast/cleanup logikát.
function rejectIfPvp(jatek) {
    if (jatek.pvpAktiv) {
        const e = new Error('PvP játékot REST-tel nem lehet módosítani — használd a socket eseményeket.');
        e.statusCode = 400;
        throw e;
    }
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
// GET /api/chess/modes — Elérhető játékmódok listája
// ────────────────────────────────────────────
router.get('/modes', (req, res) => {
    return res.status(200).json({ modes: listModesClient(), defaultMode: DEFAULT_MODE });
});

// ────────────────────────────────────────────
// POST /api/chess/new-bot — Új játék robot ellen
// Body: { difficulty: 1-8, mode?: string, ranked?: boolean }
// ────────────────────────────────────────────
router.post('/new-bot', async (req, res) => {
    let statusCode = 200;
    let responseBody = null;
    try {
        const { difficulty, mode: modeKey, ranked } = req.body || {};
        const nehezseg = parseInt(difficulty, 10);

        if (!nehezseg || nehezseg < 1 || nehezseg > 8) {
            statusCode = 400;
            responseBody = { error: 'Érvénytelen nehézségi szint (1-8).' };
        } else if (modeKey && !isValidMode(modeKey)) {
            statusCode = 400;
            responseBody = { error: 'Érvénytelen játékmód.' };
        } else {
            const { gameId, jatek } = jatekLetrehoz({
                mode: modeKey || DEFAULT_MODE,
                ranked: ranked !== false
            });
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
                    const dbGameId = await chessSql.jatekMentDb(userId, userId, jatek.mode);
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
        requireParticipant(req, jatek);
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
        requireParticipant(req, jatek);
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
router.post('/:id/move', requireVerifiedEmail, async (req, res) => {
    try {
        const jatek = findGameOrThrow(req.params.id);
        rejectIfPvp(jatek);                       // PvP socket-szel megy
        const sajatSzin = requireParticipant(req, jatek);

        if (jatek.botAktiv && jatek.koronLevo === jatek.botSzin) {
            // Bot játékban: nem lehet a bot helyett lépni
            return res.status(400).json({ error: 'Nem a te köröd.' });
        }
        // Csak a saját körünkben léphetünk (a bábu-szín check is kivédené, de korai reject)
        if (jatek.koronLevo !== sajatSzin) {
            return res.status(400).json({ error: 'Nem te jössz.' });
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

                    // Bot képesség-választás (Phase 4) — ha aktivál ability-t és az
                    // turnCost-os, akkor a kör már átvált, lépésre nincs szükség.
                    if (!jatek.vege) {
                        const botAbility = botKepessegValaszt(jatek, jatek.nehezseg);
                        if (botAbility) {
                            const ar = abilityAktival(jatek, jatek.botSzin, botAbility.key, botAbility.params);
                            if (ar.success) {
                                console.log(`[BOT] képesség aktiválva: ${botAbility.key}`);
                                const c = ABILITY_CONFIG[botAbility.key];
                                if (c && c.turnCost) {
                                    // A bot köre most ellenfélé — nincs lépés
                                    return;
                                }
                            }
                        }
                    }

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

        // Ranked toggle / mode ELO oszlop check — casual módban nem frissítünk.
        const mode = getMode(jatek.mode);
        if (!jatek.ranked || !mode || !mode.eloColumn) {
            return null;
        }
        const eloOszlop = mode.eloColumn;

        const botInfo = nehezsegiSzintInfo(jatek.nehezseg);
        const jatekosElo = await chessSql.eloLekerdezDb(jatekosId, eloOszlop);
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
        await chessSql.eloFrissitDb(jatekosId, ujElo, eloOszlop);

        console.log(`[ELO][${jatek.mode}/${eloOszlop}] User #${jatekosId}: ${jatekosElo} → ${ujElo} (${valtozas >= 0 ? '+' : ''}${valtozas}) vs Bot(${botInfo.nev})`);
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
// GET /api/chess/abilities — Képesség config (ár, cooldown, max stb.)
// ────────────────────────────────────────────
router.get('/abilities', (req, res) => {
    return res.status(200).json({ config: getKliensConfig() });
});

// ────────────────────────────────────────────
// POST /api/chess/:id/ability — Képesség aktiválás (bot meccshez)
// ────────────────────────────────────────────
router.post('/:id/ability', requireVerifiedEmail, async (req, res) => {
    try {
        const jatek = findGameOrThrow(req.params.id);
        rejectIfPvp(jatek);                       // PvP socket-en (chess:ability)
        const szin = requireParticipant(req, jatek);

        const { key, params } = req.body || {};
        if (!key) return res.status(400).json({ error: 'Hiányzó képesség (key).' });

        const userId = req.session.userId;        // requireParticipant garantálja
        const eredmeny = abilityAktival(jatek, szin, key, params);
        if (!eredmeny.success) {
            return res.status(400).json({ error: eredmeny.error });
        }

        // ability_log DB-be (best-effort, async)
        if (jatek.dbGameId && userId) {
            (async () => {
                try {
                    await chessSql.abilityLogMentDb({
                        gameId: jatek.dbGameId,
                        playerId: userId,
                        abilityKey: key
                    });
                } catch (dbErr) {
                    console.error('Ability log mentési hiba:', dbErr);
                }
            })();
        }

        return res.status(200).json({ allapot: jatekAllapotKliens(jatek) });
    } catch (err) {
        console.error('Chess ability hiba:', err);
        return res.status(err.statusCode || 500).json({ error: err.message || 'Szerverhiba képesség aktiválásnál.' });
    }
});

// ────────────────────────────────────────────
// POST /api/chess/:id/reset — Játék újraindítás
// ────────────────────────────────────────────
router.post('/:id/reset', (req, res) => {
    let statusCode = 200;
    let payload;
    try {
        const jatek = findGameOrThrow(req.params.id);
        rejectIfPvp(jatek);
        requireParticipant(req, jatek);
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
        rejectIfPvp(jatek);              // PvP feladás socket-en (chess:surrender)
        requireParticipant(req, jatek);

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
        rejectIfPvp(jatek);              // PvP törlés a disconnect/surrender flow-on át
        requireParticipant(req, jatek);
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
