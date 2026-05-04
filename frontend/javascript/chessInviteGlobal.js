// Globális PvP sakk meghívás kezelő — minden oldalon fut, ahol a socketClient.js betöltődik.
// A chess.html saját inline popupja kezeli a meghívásokat amikor a felhasználó már a sakk oldalon van;
// minden más oldalon ez a handler felel a meghívás megjelenítéséért és átirányításért.

(function attachChessInviteGlobal(globalScope) {
    const tx = (hu, en) => (globalScope.MattMesterI18n?.tx ? globalScope.MattMesterI18n.tx(hu, en) : hu);
    const PENDING_ACCEPT_KEY = 'mattmester.pendingChessInviteAccept';
    const CHESS_PAGE_PATH = '/chess_barold/html/chess.html';

    function aSakkOldalon() {
        try {
            return globalScope.location.pathname.includes('/chess_barold/');
        } catch (e) {
            return false;
        }
    }

    // Bug 2026-05-04 — F5 / kapcsolat-vesztés után a felhasználó vissza akar
    // csatlakozni a meccsébe. A chess:rejoin handler (backend pvp.js) erre van —
    // ha van aktív PvP meccse, chess:game:start választ küld. A chess.html
    // ebből rendereli a táblát. Minden más oldalon (home / profile / stb.)
    // a felhasználó nem látja a meccset, ezért itt automatikusan átirányítjuk
    // a chess oldalra a sessionStorage-flag-gel, hogy a main.js init() ne nyissa
    // ki a chooser-t, hanem várja meg a rejoin flow-t.
    //
    // FONTOS: az idő a backend-ben TOVÁBB FUT a disconnect grace period alatt
    // (60s) — a refresh nem állítja meg az órát, a felhasználó ugyanannyi
    // gondolkodási idővel érkezik vissza, mint amennyije volt a kapcsolat-
    // vesztéskor. Ha 60s alatt nem jön vissza, auto-forfeit (lasd handlePvpDisconnect).
    function elindulRejoinDetekcio(socket) {
        if (aSakkOldalon()) return;          // chess.html sajat rejoin-t kuld
        if (socket._chessRejoinDetectorOn) return;
        socket._chessRejoinDetectorOn = true;

        const PENDING_MATCH_KEY = 'mattmester.chessPendingMatch';

        function navigaljChessOldalra(gameId) {
            try {
                globalScope.sessionStorage.setItem(PENDING_MATCH_KEY, JSON.stringify({
                    gameId,
                    ts: Date.now()
                }));
            } catch (_) {}
            try { globalScope.location.href = CHESS_PAGE_PATH; } catch (_) {}
        }

        // Ha a rejoin válaszként aktív meccs jön (chess:game:start),
        // azonnal átirányítjuk a felhasználót. Ugyanez az event erősíti meg
        // a queue-match-et is — a chooser sajat kezelője elobb fut le, és a
        // STATE.queueActive/inviteTargetUserId beallítása miatt a chooser
        // már átiranyított. Ha mire ide érünk, már navigation folyamatban,
        // a második href-set no-op.
        socket.on('chess:game:start', (data) => {
            if (aSakkOldalon()) return;
            if (!data || !data.gameId) return;
            navigaljChessOldalra(data.gameId);
        });

        // chess:rejoin:none — nincs aktív meccs, semmit sem teszunk.

        function probalRejoint() {
            if (aSakkOldalon()) return;
            if (socket && socket.connected) {
                try { socket.emit('chess:rejoin'); } catch (_) {}
            }
        }

        if (socket.connected) probalRejoint();
        // Reconnect (transport switch / network blip) után is megpróbáljuk —
        // a backend chess:rejoin idempotens (ugyanaz a válasz, ha még él a meccs).
        socket.on('connect', probalRejoint);

        // Bfcache restore (back/forward gomb): a Chrome/Firefox a DOM-ot a
        // memoriabol allitja vissza, a script-ek NEM futnak ujra. A `pageshow`
        // `persisted=true` flag-gel jelzi a bfcache-eset; ilyenkor manualisan
        // ujra-emit-eljuk a chess:rejoin-t. Kulonben a felhasznalo a regi
        // (chooser-rel teli) DOM-ot latna, mig a backend mar tudja, hogy aktiv
        // meccse van.
        try {
            globalScope.addEventListener('pageshow', (e) => {
                if (e && e.persisted) probalRejoint();
            });
        } catch (_) { /* defensive — old browsers */ }

        // Tab-visszateres (a felhasznalo egy masik tab-rol jott vissza). A
        // visibilityState 'visible' eseten ujra-probaljuk — ha kozben a meccse
        // miatt at kell mennie a chess.html-re, megtegyuk.
        try {
            globalScope.document.addEventListener('visibilitychange', () => {
                if (globalScope.document.visibilityState === 'visible') probalRejoint();
            });
        } catch (_) { /* defensive */ }

        // Window focus (alternativ jelzes ugyanarra a flow-ra, fallback a
        // visibilitychange-re ami nem minden browser-ben mukodik megbizhatoan
        // bfcache utan).
        try {
            globalScope.addEventListener('focus', probalRejoint);
        } catch (_) { /* defensive */ }
    }

    function regisztracio(socket) {
        if (!socket || socket._chessInviteGlobalRegistered) return;
        socket._chessInviteGlobalRegistered = true;

        // Aktív-meccs detektor: F5 / disconnect után auto-redirect a chess.html-re,
        // ahol a teljes rejoin flow lefut (tábla render + óra szinkron + chat).
        elindulRejoinDetekcio(socket);

        socket.on('chess:invite:received', async (data) => {
            // A sakk oldalon a chess main.js saját popupja kezeli — ne nyissunk dupla popupot.
            if (aSakkOldalon()) return;

            const inviter = (data && data.inviterName) || tx('Egy játékos', 'A player');
            const gameId = data && data.gameId;
            if (!gameId) return;

            // Custom HTML modal (mmConfirm) a natív confirm() helyett.
            // Fallback (ha a confirmModal.js nem toltodott be): native confirm.
            let elfogadta;
            const inviteMsg = tx(`${inviter} sakkpartira hív! Elfogadod?`, `${inviter} is challenging you to a chess match! Do you accept?`);
            if (typeof globalScope.mmConfirm === 'function') {
                elfogadta = await globalScope.mmConfirm({
                    title: tx('Sakk meghívás', 'Chess invite'),
                    message: inviteMsg,
                    confirmLabel: tx('Elfogadom', 'Accept'),
                    cancelLabel: tx('Elutasítom', 'Decline')
                });
            } else {
                elfogadta = globalScope.confirm(inviteMsg);
            }

            if (elfogadta) {
                try {
                    globalScope.sessionStorage.setItem(PENDING_ACCEPT_KEY, JSON.stringify({
                        gameId,
                        inviterName: inviter,
                        ts: Date.now()
                    }));
                } catch (e) {}
                // Átirányítás a sakk oldalra — ott a main.js majd elküldi a chess:invite:accept-et.
                try {
                    globalScope.location.href = CHESS_PAGE_PATH;
                } catch (e) {}
            } else {
                socket.emit('chess:invite:decline', { gameId });
            }
        });

        socket.on('chess:invite:expired', () => {
            if (aSakkOldalon()) return;
            try { globalScope.sessionStorage.removeItem(PENDING_ACCEPT_KEY); } catch (e) {}
        });

        socket.on('chess:invite:cancelled', () => {
            if (aSakkOldalon()) return;
            try { globalScope.sessionStorage.removeItem(PENDING_ACCEPT_KEY); } catch (e) {}
        });
    }

    function ind() {
        const api = globalScope.MattMesterSocket;
        if (api && api.socket) {
            regisztracio(api.socket);
            return true;
        }
        return false;
    }

    if (!ind()) {
        // socketClient.js esetleg később áll készen — próbáljuk újra rövid intervallumokban.
        let probaSzamlalo = 0;
        const id = globalScope.setInterval(() => {
            probaSzamlalo++;
            if (ind() || probaSzamlalo > 40) {
                globalScope.clearInterval(id);
            }
        }, 250);
    }
})(typeof window !== 'undefined' ? window : globalThis);
