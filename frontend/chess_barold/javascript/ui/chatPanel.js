// ============================================================
// SAKK UI — INGAME CHAT PANEL (PvP + bot quick-chat)
// ============================================================
// PvP meccsen ket-jatekos chat (`#ingame-chat-panel`), bot meccsen quick-chat
// sav elore-megirt uzenetekkel + kanned bot valaszokkal.
//
// Backend protokoll (`chess/pvp.js`):
//   chess:chat:send  ({gameId, text})  -> csak az aktiv meccs ket jatekosatol
//   chess:chat:message ({gameId, from:{userId,color,username}, text, ts})
//   -> minden szobatag (sajat is) megkapja
//
// Lifecycle:
//   - PvP `chess:game:start` -> `chatPanelMutat()` + enable input
//   - Game-end (`jatekVegeUI`) -> `chatPanelEnged(false)` (input letiltva,
//     uzenetek megmaradnak)
//   - Uj jatek / oldal-elhagyas -> `chatPanelLezar()` (input torolve, panel rejtve)
//
// `state.chatSocketBekotve` flag-gel idempotens a socket-listener kotes.
// `state.quickChatCooldownTill` (ms) az anti-spam window — globalis, 1500ms.
// ============================================================

import { state } from '../state.js';
import { pvpSocketKeres } from '../pvp/socketRef.js';

// ──────────────────────────────────────────────────────────────
// Quick-chat frazisok + bot canned valaszai (bot-meccshez)
// ──────────────────────────────────────────────────────────────

const QUICK_CHAT_FRAZISOK = {
    gl:       'Sok szerencsét!',
    hello:    'Hello!',
    nice:     'Szép lépés!',
    wow:      'Hűha!',
    oops:     'Hopp!',
    thinking: 'Gondolkodok…',
    thanks:   'Köszi a meccset!',
    wp:       'Jól játszottál!',
    gg:       'GG'
};

// Bot canned valaszai kulcs-szerint. Tobb opcios valasz koztul random egyet
// valasztunk, hogy ne legyen monoton. A kulcsoknak megfeleloleg "kontextualt"
// valaszok — a "Sok szerencset!"-re a bot is sok szerencset kivan, stb.
const BOT_CANNED_VALASZOK = {
    gl:       ['Köszi, neked is sok szerencsét!', 'Köszi! 🤖 Lássuk!'],
    hello:    ['Helló, készen állok!', 'Üdv! 🤖'],
    nice:     ['Köszi! 🤖', 'Na, próbálkozok!', 'Tanulok belőled.'],
    wow:      ['Igen, ez érdekes pozíció.', '🤖 Hmmm.'],
    oops:     ['Mindenkivel előfordul!', 'Néha a botok is bakiznak.'],
    thinking: ['Én is.', '🤖 számol…', 'Nehéz pozíció.'],
    thanks:   ['Én köszönöm a meccset!', 'Bármikor! 🤖'],
    wp:       ['Köszi! Te is jól játszottál.', '🤖 köszi!'],
    gg:       ['GG! Jó volt játszani.', 'GG! Bármikor revans.']
};

// ──────────────────────────────────────────────────────────────
// Internal helper — chat-handler hibakezelo (try/catch warn)
// ──────────────────────────────────────────────────────────────

function runSafelyHelper(fn) {
    try { fn(); } catch (err) { console.warn('[chat] handler hiba:', err); }
}

// ──────────────────────────────────────────────────────────────
// Panel lifecycle (mutat / elrejt / engedelyez / lezar)
// ──────────────────────────────────────────────────────────────

export function chatPanelMutat() {
    const panel = document.getElementById('ingame-chat-panel');
    if (panel) panel.classList.remove('hidden');
    // Probaljuk meg ujra bekotni a socket listener-t — init-kor lehet,
    // hogy a `pvpSocketKeres()` meg null volt (a socketClient.js aszinkron
    // tolti be a kapcsolatot). PvP game:start-kor mar megvan, igy itt
    // sikeresen latoljuk.
    if (!state.chatSocketBekotve) {
        const socket = pvpSocketKeres();
        if (socket && typeof socket.on === 'function') {
            socket.on('chess:chat:message', (payload) => {
                runSafelyHelper(() => chatUzenetRender(payload));
            });
            state.chatSocketBekotve = true;
        }
    }
}

export function chatPanelElrejt() {
    const panel = document.getElementById('ingame-chat-panel');
    if (panel) panel.classList.add('hidden');
}

export function chatPanelEnged(engedett) {
    const input = document.getElementById('ingame-chat-input');
    const sendBtn = document.getElementById('ingame-chat-send');
    const quickBtns = document.querySelectorAll('.quick-chat-btn');
    if (input) input.disabled = !engedett;
    if (sendBtn) sendBtn.disabled = !engedett;
    // Quick-chat gombok is letiltodnak game-end-en (bot meccs vege => ne lehessen
    // tovabb gombot nyomni a botnak).
    quickBtns.forEach((b) => { b.disabled = !engedett; });
    if (input && !engedett) {
        // Game-end-en a meccs UTAN megmarad ami ki van irva, de uj uzenet
        // nem mehet — a placeholder ezt jelzi.
        input.placeholder = 'Chat lezárva (meccs vége).';
    } else if (input) {
        input.placeholder = 'Üzenet…';
    }
}

export function chatMessagesUrites() {
    const cont = document.getElementById('ingame-chat-messages');
    if (cont) cont.innerHTML = '<div class="ingame-chat-empty">Még nincs üzenet — szólj az ellenfélnek!</div>';
}

// Bot meccsen a chat panel megjelenik, de a sima text-input helyett
// quick-chat sav latszik — elore-megirt uzeneteket lehet kuldeni a botnak,
// es a bot canned valasszal reagal (1-2 mp delay-jel, hogy ele-szeruen
// hasson).
export function chatPanelBotPlaceholder() {
    const cont = document.getElementById('ingame-chat-messages');
    if (cont) cont.innerHTML = '<div class="ingame-chat-empty">Klikkelj egy uzenetre lent a botnak!</div>';
    chatPanelBotMode(true);
}

// Bot mode toggle — a quick-chat sav lathato, az input forma rejtett.
// PvP-n forditva (pvpJatekKezdet -> chatPanelBotMode(false)).
export function chatPanelBotMode(botMode) {
    const quick = document.getElementById('ingame-chat-quick');
    const form  = document.getElementById('ingame-chat-form');
    if (quick) quick.classList.toggle('hidden', !botMode);
    if (form)  form.classList.toggle('hidden', !!botMode);
}

export function chatPanelLezar() {
    chatPanelEnged(false);
    chatPanelElrejt();
    chatMessagesUrites();
}

// ──────────────────────────────────────────────────────────────
// Uzenet renderer (sajat / ellenfel buborek)
// ──────────────────────────────────────────────────────────────

// Egy uj uzenet renderelese (sajat / ellenfel). A `from.color` alapjan
// dontjuk el, sajat oldalra (gold) vagy ellenfel oldalra (default) rajzolja.
export function chatUzenetRender(payload) {
    const cont = document.getElementById('ingame-chat-messages');
    if (!cont) return;
    // Az "ures" placeholder-t kivesszuk az elso uzenet erkezesekor.
    const empty = cont.querySelector('.ingame-chat-empty');
    if (empty) empty.remove();

    const isMine = payload?.from?.color === state.sajatSzin;
    const div = document.createElement('div');
    div.className = `ingame-chat-msg ${isMine ? 'is-mine' : 'is-opp'}`;
    const nameSpan = document.createElement('span');
    nameSpan.className = 'ingame-chat-msg-name';
    nameSpan.textContent = payload?.from?.username || (isMine ? 'Te' : 'Ellenfél');
    const textNode = document.createElement('span');
    // textContent — XSS-mentes, az input mar szerver-szanitalt
    textNode.textContent = payload?.text || '';
    div.appendChild(nameSpan);
    div.appendChild(textNode);
    cont.appendChild(div);
    // Auto-scroll a legujabb uzenetre (sima behavior csillapitja a jumpot).
    cont.scrollTop = cont.scrollHeight;
}

// ──────────────────────────────────────────────────────────────
// Bind-ek (init-kor egyszer futnak le)
// ──────────────────────────────────────────────────────────────

// Quick-chat kotese (bot meccshez): klikk a gombokra -> sajat uzenet render +
// bot canned valasz delay-jel. Anti-spam cooldown 1500ms / globalis.
export function bindQuickChatPanel() {
    const cont = document.getElementById('ingame-chat-quick');
    if (!cont) return;
    cont.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.quick-chat-btn');
        if (!btn || btn.disabled) return;
        const key = btn.dataset.key;
        if (!key || !QUICK_CHAT_FRAZISOK[key]) return;
        // Csak bot-meccsen aktivalhato — PvP-n a quick-chat sav rejtett,
        // de defenziv ellenorzes hatha valami CSS bekapcsolja
        if (state.pvpAktiv) return;

        // Anti-spam: globalis cooldown 1500ms.
        const now = Date.now();
        if (now < state.quickChatCooldownTill) return;
        state.quickChatCooldownTill = now + 1500;
        cont.querySelectorAll('.quick-chat-btn').forEach((b) => { b.disabled = true; });
        setTimeout(() => {
            cont.querySelectorAll('.quick-chat-btn').forEach((b) => { b.disabled = false; });
        }, 1500);

        // Sajat uzenet renderelese
        chatUzenetRender({
            from: { color: state.sajatSzin || 'white', username: state.sajatUsername || 'Te' },
            text: QUICK_CHAT_FRAZISOK[key],
            ts: now
        });

        // Bot valasz: 800-1800ms delay, random canned valasz a `key` listabol
        const valaszok = BOT_CANNED_VALASZOK[key] || ['🤖 Hmm.'];
        const valasz = valaszok[Math.floor(Math.random() * valaszok.length)];
        const botSzin = state.sajatSzin === 'white' ? 'black' : 'white';
        const botName = state.botInfo ? `🤖 ${state.botInfo.nev}` : '🤖 Bot';
        const delay = 800 + Math.floor(Math.random() * 1000);
        setTimeout(() => {
            // Ha mar veget ert a meccs vagy a felhasznalo elnavigalt, ne valaszoljunk.
            if (!state.botInfo || !state.gameId) return;
            chatUzenetRender({
                from: { color: botSzin, username: botName },
                text: valasz,
                ts: Date.now()
            });
        }, delay);
    });
}

// PvP chat input + form bind: text uzenet kuldese socket-en a backend-nek.
// A socket-listener-t (chess:chat:message) egyszer kotjuk be, idempotensen a
// `state.chatSocketBekotve` flag-gel (a `chatPanelMutat` is megprobalja, ha
// init-kor a socket meg nem volt elerheto).
export function bindChatPanel() {
    const form = document.getElementById('ingame-chat-form');
    const input = document.getElementById('ingame-chat-input');
    if (!form || !input) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = (input.value || '').trim();
        if (!text || !state.pvpAktiv || !state.pvpGameId) return;
        const socket = pvpSocketKeres();
        if (!socket) return;
        socket.emit('chess:chat:send', { gameId: state.pvpGameId, text });
        input.value = '';
    });

    // Socket listener — egyszer kotjuk; ha az `pvpSocketKeres()` (ami a
    // window.MattMesterSocket.socket-et adja) elerheto, csatolunk hozza
    // egy uzenet listener-t. Ha meg nem, `state.chatSocketBekotve` false marad
    // es a kovetkezo `bindChatPanel` hivasnal megprobalja megint.
    if (!state.chatSocketBekotve) {
        const socket = pvpSocketKeres();
        if (socket && typeof socket.on === 'function') {
            socket.on('chess:chat:message', (payload) => {
                runSafelyHelper(() => chatUzenetRender(payload));
            });
            state.chatSocketBekotve = true;
        }
    }
}
