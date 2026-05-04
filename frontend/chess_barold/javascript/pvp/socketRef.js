// ============================================================
// SAKK PVP — SOCKET REFERENCIA + PENDING INVITE ACCEPT
// ============================================================
// Apro infrastruktura modul:
//   - `pvpSocketKeres()`: a `window.MattMesterSocket.socket`-et adja vissza,
//     plusz a `state.pvpSocket` cache-t frissiti reconnect-kor.
//   - `pendingChessInviteAcceptKuld(socket)`: a chessInviteGlobal.js-bol jott,
//     sessionStorage-ban tarolt invite-accept-et elkuldi a sajat tab-bol
//     (60s TTL-lel egyezteve a backend `pendingInvites` mappel).
//
// Onallo modul: igy mas modulok (chatPanel, pvp/*) korkoros import nelkul
// elerik a socket-et anelkul, hogy a main.js-bol kelljen importalniuk.
// ============================================================

import { state } from '../state.js';

const PENDING_CHESS_INVITE_ACCEPT_KEY = 'mattmester.pendingChessInviteAccept';

export function pvpSocketKeres() {
    // Mindig friss socket lekérdezés (reconnect után új socket lehet)
    const elerheto = window.MattMesterSocket && window.MattMesterSocket.socket;
    if (elerheto) {
        state.pvpSocket = window.MattMesterSocket.socket;
    }
    return state.pvpSocket;
}

// Masik oldalrol elfogadott meghivas — chessInviteGlobal.js mentett egy gameId-t
// a sessionStorage-ba. Ezt a sakk oldal betoltese utan kuldjuk el a szervernek.
export function pendingChessInviteAcceptKuld(socket) {
    if (!socket) return;
    let payload = null;
    try {
        const raw = window.sessionStorage.getItem(PENDING_CHESS_INVITE_ACCEPT_KEY);
        if (raw) payload = JSON.parse(raw);
    } catch (_) {}
    if (!payload || !payload.gameId) return;
    try { window.sessionStorage.removeItem(PENDING_CHESS_INVITE_ACCEPT_KEY); } catch (_) {}
    // 60s lejarat (a backend invite TTL-jehez igazodva)
    if (payload.ts && Date.now() - payload.ts > 60000) return;
    socket.emit('chess:invite:accept', { gameId: payload.gameId });
}
