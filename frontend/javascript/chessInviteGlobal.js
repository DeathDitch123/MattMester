// Globális PvP sakk meghívás kezelő — minden oldalon fut, ahol a socketClient.js betöltődik.
// A chess.html saját inline popupja kezeli a meghívásokat amikor a felhasználó már a sakk oldalon van;
// minden más oldalon ez a handler felel a meghívás megjelenítéséért és átirányításért.

(function attachChessInviteGlobal(globalScope) {
    const PENDING_ACCEPT_KEY = 'mattmester.pendingChessInviteAccept';
    const CHESS_PAGE_PATH = '/chess_barold/html/chess.html';

    function aSakkOldalon() {
        try {
            return globalScope.location.pathname.includes('/chess_barold/');
        } catch (e) {
            return false;
        }
    }

    function regisztracio(socket) {
        if (!socket || socket._chessInviteGlobalRegistered) return;
        socket._chessInviteGlobalRegistered = true;

        socket.on('chess:invite:received', (data) => {
            // A sakk oldalon a chess main.js saját popupja kezeli — ne nyissunk dupla popupot.
            if (aSakkOldalon()) return;

            const inviter = (data && data.inviterName) || 'Egy játékos';
            const gameId = data && data.gameId;
            if (!gameId) return;

            const elfogadta = globalScope.confirm(`${inviter} sakkpartira hív! Elfogadod?`);
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
