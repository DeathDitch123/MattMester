// ============================================================
// CHESS SETTINGS — kliens-oldali jatekos preferenciak
// ============================================================
// Persisztencia: localStorage('mm_chess_settings'). DOM-attributumokat
// allit a body-ra, a CSS azokra figyel (theme/coord/anim).
// Hang toggle: a chessSoundEnabled() helper-en keresztul az audio.js.
// Custom HTML modal — natív alert/confirm/prompt SOHA.
// ============================================================

const STORAGE_KEY = 'mm_chess_settings';
const DEFAULTS = {
    theme: 'gold',
    sound: true,
    coords: true,
    anim: true,
    autoflip: true
};

let aktualis = { ...DEFAULTS };

// localStorage incognito vagy sandbox modban dobhat — try-catch koteleso.
function loadChessSettings() {
    let result = { ...DEFAULTS };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                for (const k of Object.keys(DEFAULTS)) {
                    if (k in parsed) result[k] = parsed[k];
                }
            }
        }
    } catch (e) {
        result = { ...DEFAULTS };
    }
    aktualis = result;
    return result;
}

function saveChessSettings(s) {
    aktualis = { ...aktualis, ...s };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(aktualis));
    } catch (e) {
        // Ha nem mentodik: a session erteke akkor is el — incognito sem akadalyoz.
    }
}

function applyChessSettings(s) {
    const body = document.body;
    if (!body) return;
    body.dataset.boardTheme = s.theme || 'gold';
    body.dataset.showCoords = s.coords ? 'on' : 'off';
    body.dataset.anim = s.anim ? 'on' : 'off';
    body.dataset.sound = s.sound ? 'on' : 'off';
}

function chessSoundEnabled() {
    return aktualis.sound !== false;
}

function chessAutoflipEnabled() {
    return aktualis.autoflip !== false;
}

function getChessSettings() {
    return { ...aktualis };
}

function bindModalControls() {
    const modal = document.getElementById('chess-settings-modal');
    const openBtn = document.getElementById('chessSettingsBtn');
    const closeBtn = document.getElementById('chessSettingsClose');
    if (!modal || !openBtn || !closeBtn) return;

    const themeSel = document.getElementById('setting-theme');
    const soundCb = document.getElementById('setting-sound');
    const coordsCb = document.getElementById('setting-coords');
    const animCb = document.getElementById('setting-anim');
    const autoflipCb = document.getElementById('setting-autoflip');

    // Modal megnyitas: betolti az aktualis ertekeket az inputokba.
    const openModal = () => {
        const s = aktualis;
        if (themeSel) themeSel.value = s.theme || 'gold';
        if (soundCb) soundCb.checked = !!s.sound;
        if (coordsCb) coordsCb.checked = !!s.coords;
        if (animCb) animCb.checked = !!s.anim;
        if (autoflipCb) autoflipCb.checked = !!s.autoflip;
        modal.classList.remove('hidden');
    };
    const closeModal = () => modal.classList.add('hidden');

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);

    // ESC zarja a modalt — escape custom modal pattern, nem natív.
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });

    // Overlay-klikk zarja — a content nem, csak a hatter.
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Live-update: minden valtozas azonnal alkalmazva, nem kell "Save" gomb.
    const onChange = () => {
        const next = {
            theme: themeSel ? themeSel.value : aktualis.theme,
            sound: soundCb ? soundCb.checked : aktualis.sound,
            coords: coordsCb ? coordsCb.checked : aktualis.coords,
            anim: animCb ? animCb.checked : aktualis.anim,
            autoflip: autoflipCb ? autoflipCb.checked : aktualis.autoflip
        };
        saveChessSettings(next);
        applyChessSettings(next);
    };

    [themeSel, soundCb, coordsCb, animCb, autoflipCb].forEach(el => {
        if (el) el.addEventListener('change', onChange);
    });
}

// Init: betoltes + alkalmazas + modal-bind. Hivni a main.js DOMContentLoaded-ben.
function initChessSettings() {
    const s = loadChessSettings();
    applyChessSettings(s);
    bindModalControls();
}

export {
    initChessSettings,
    loadChessSettings,
    saveChessSettings,
    applyChessSettings,
    chessSoundEnabled,
    chessAutoflipEnabled,
    getChessSettings
};
