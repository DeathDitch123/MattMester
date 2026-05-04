// ============================================================
// CHESS CLIENT — KOZPONTI MUTABLE STATE CONTAINER
// ============================================================
// A main.js es az osszes kiszervezett modul ugyanezt az `state` objektumot
// importalja es modositja. ES modules read-only export-tal nem tudunk
// mutable `let`-et megosztani modulok kozott (a re-exportalt let kivulrol
// nem irhato), ezert egy kozos state container az egyszeru megoldas.
// Viselkedes 1:1 a regi main.js modul-szintu globalis let-jeivel.
//
// Hasznalat:
//   import { state } from './state.js';
//   state.gameId = 42;
//   if (state.pvpAktiv) { ... }
// ============================================================

export const state = {
    // ── BOARD / FLIP / MOVE STATE ──
    manualisFlipFelulirva: null,    // null = auto-flip; true/false = manualis override
    gameId: null,                   // aktiv meccs id-ja (bot vagy PvP)
    utolsoAllapot: null,            // utolso szerver-allapot snapshot (diff-hez)
    idoPollTimer: null,             // ora-frissito setInterval ref
    huzasFolyamatban: false,        // drag&drop aktiv-e
    lepesKuldesFolyamatban: false,  // POST /move folyamatban-e
    lepesKuldesFailSafeTimer: null, // fail-safe timer ref (15s)
    kivalasztott: null,             // { x, y, piece, lepesek }
    appObserver: null,              // MutationObserver a #app div-hez
    integritasTimer: null,          // integritas-ellenorzo setInterval ref
    helyreallitasFut: false,        // helyreallitas folyamatban-e

    // ── BOT MECCS ──
    botInfo: null,                   // { nev, elo, szint }
    botPollTimer: null,              // bot-valasz polling setInterval ref
    utolsoAnimaltLepesKulcs: null,   // dedup: ne animaljuk ugyanazt a lepest 2x
    slidingFolyamatban: false,       // animacio kozben

    // ── PVP MECCS ──
    pvpAktiv: false,
    sajatSzin: null,                 // 'white' | 'black'
    ellenfelNev: null,
    sajatNev: null,
    sajatUsername: null,             // a session userName-je
    pvpSocket: null,                 // window.io() socket ref
    kliensIdoTimer: null,            // kliens-oldali ora countdown
    varakozoLepesPromisek: [],       // chess:moves:response Promise-ek
    pvpGameId: null,                 // legutobbi PvP gameId (rematch UI-hoz)

    // ── MODE SELECTION (chooser) ──
    selectedMode: null,
    selectedRanked: true,

    // ── REJOIN OVERLAY ──
    rejoinOverlayHidden: false,      // egyszer mar elrejtettuk-e (idempotent)

    // ── SURRENDER MODAL ──
    surrenderHoldTimer: null,        // long-press timer ref

    // ── CHAT PANEL ──
    chatSocketBekotve: false,        // chat:* listenerek bekotve-e
    quickChatCooldownTill: 0         // ms timestamp ameddig a quick-chat letiltva van
};
