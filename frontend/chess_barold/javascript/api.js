// ============================================================
// SAKK — REST API HIVASOK
// ============================================================
// Vekony wrapper a `/api/chess/*` endpoint-okra. Egyseges hibakezelessel:
// nem-ok valasz -> Error throw a `data.error` szoveggel.
//
// Hot-seat (lokalis 2-jatekos) endpoint TOROLVE — a backend `/api/chess/new`
// endpoint nincs tobbe. Csak bot meccs (`/new-bot`) es PvP socket-en
// keresztul lehet jatszani.
//
// `apiModes` / `apiNehezsegek` / `apiUserElo` torolve — csak a regi (mar torolt)
// modValasztoMegjelenit hasznalta. A frontpage `chessModeChooser` sajat
// fetch-ekkel hivja.
// ============================================================

import { state } from './state.js';

// ──────────────────────────────────────────────────────────────
// Belso helper: timeout-os fetch + JSON parse egyben
// ──────────────────────────────────────────────────────────────

export async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 9000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        const data = await res.json();
        return { res, data };
    } finally {
        clearTimeout(timeoutId);
    }
}

// ──────────────────────────────────────────────────────────────
// Bot meccs lifecycle
// ──────────────────────────────────────────────────────────────

// POST /api/chess/new-bot — uj bot meccs inditas. Mellekhatas: a vissza-
// erkezett `gameId` + `botInfo` a state-be kerul, igy a tobbi api-call
// (`apiAllapot`, `apiLepes`, ...) automatikusan az uj meccsen dolgozik.
export async function apiUjBotJatek(difficulty, mode, ranked) {
    const body = { difficulty };
    if (mode) body.mode = mode;
    if (typeof ranked === 'boolean') body.ranked = ranked;
    const res = await fetch('/api/chess/new-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hiba');
    state.gameId = data.gameId;
    state.botInfo = data.botInfo;
    return data.allapot;
}

// ──────────────────────────────────────────────────────────────
// State + lepes lekerdezesek (a `state.gameId` az aktiv meccshez koti)
// ──────────────────────────────────────────────────────────────

export async function apiAllapot() {
    const { res, data } = await fetchJsonWithTimeout(`/api/chess/${state.gameId}/state`, {}, 6000);
    if (!res.ok) throw new Error(data.error || 'Hiba');
    return data;
}

export async function apiLepesek(x, y) {
    const { res, data } = await fetchJsonWithTimeout(`/api/chess/${state.gameId}/moves/${x}/${y}`, {}, 7000);
    if (!res.ok) throw new Error(data.error || 'Hiba');
    return data.lepesek;
}

export async function apiLepes(fromX, fromY, toX, toY, promotion) {
    const body = { fromX, fromY, toX, toY };
    if (promotion) body.promotion = promotion;
    const { res, data } = await fetchJsonWithTimeout(`/api/chess/${state.gameId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }, 12000);
    if (!res.ok) throw new Error(data.error || 'Illegális lépés');
    return data;
}

// ──────────────────────────────────────────────────────────────
// Feladas (csak bot meccs eseten — PvP-n a socket csinalja)
// ──────────────────────────────────────────────────────────────

export async function apiFeladMagat() {
    const res = await fetch(`/api/chess/${state.gameId}/surrender`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Hiba');
    return data;
}
