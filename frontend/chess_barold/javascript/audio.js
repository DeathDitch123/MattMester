// ============================================================
// audio.js — sakk hangeffekt module
// ============================================================
// Eredetileg a main.js-ben volt; rendeltetes szerinti szet bontas
// soran kiemelve. A modul self-contained: sajat AudioContext-et
// es hang-cache-t kezel, deduplikalja az ugyanazon lepesre tobbszor
// kuldott hangokat, es fallback Web Audio pittyenest jatszik le ha
// az MP3 nem toltheto vagy nem indithato (autoplay policy).
//
// Publikus API: lepesHangLejatszas(allapot) — a sakk-allapotbol
// kiderul melyik hangot kell lejatszani (matt / sakk / sanc /
// jatekos lepes / ellenfel lepes).

const HANG_FAJLOK = {
    jatekosLep: '../sounds/Jatekos_lep.mp3',
    ellenfelLep: '../sounds/Ellenfel_lep.mp3',
    sakk: '../sounds/sakk.mp3',
    matt: '../sounds/matt.mp3',
    sanc: '../sounds/sanc.mp3'
};
const hangCache = {};

let audioCtx = null;
let utolsoHangLepesKulcs = null;

function audioContextKeres() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
}

function hangObjektumKeres(hangKulcs) {
    if (hangCache[hangKulcs]) return hangCache[hangKulcs];
    const fajl = HANG_FAJLOK[hangKulcs];
    if (!fajl) return null;
    const audio = new Audio(fajl);
    audio.preload = 'auto';
    hangCache[hangKulcs] = audio;
    return audio;
}

function hangLejatszas(hangKulcs, fallbackFreq = 620, fallbackMs = 90, fallbackGain = 0.03) {
    const hang = hangObjektumKeres(hangKulcs);
    if (!hang) {
        pittyen(fallbackFreq, fallbackMs, fallbackGain);
        return;
    }

    hang.currentTime = 0;
    const playPromise = hang.play();
    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
            pittyen(fallbackFreq, fallbackMs, fallbackGain);
        });
    }
}

function pittyen(freq, durationMs, gain = 0.03) {
    const ctx = audioContextKeres();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const start = ctx.currentTime;
    const end = start + (durationMs / 1000);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, start);

    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(end);
}

export function lepesHangLejatszas(allapot) {
    if (!allapot || !allapot.utolsoLepes) return;
    // Hang toggle a beallitas-modulbol — body[data-sound="off"] eseten csendben.
    if (typeof document !== 'undefined' && document.body && document.body.dataset.sound === 'off') return;

    const l = allapot.utolsoLepes;
    const kulcs = `${allapot.lepesszam}:${l.from.x},${l.from.y}->${l.to.x},${l.to.y}`;
    if (kulcs === utolsoHangLepesKulcs) return;
    utolsoHangLepesKulcs = kulcs;

    if (allapot.vege) {
        hangLejatszas('matt', 350, 180, 0.04);
        return;
    }

    if (allapot.sakkPoz) {
        hangLejatszas('sakk', 900, 90, 0.035);
        return;
    }

    if (l.special === 'castle-ks' || l.special === 'castle-qs') {
        hangLejatszas('sanc', 560, 120, 0.03);
        return;
    }

    const lepoSzin = allapot.koronLevo === 'white' ? 'black' : 'white';
    const botLepett = !!(allapot.botAktiv && allapot.botSzin === lepoSzin);
    hangLejatszas(botLepett ? 'ellenfelLep' : 'jatekosLep', 620, 90, 0.03);
}
