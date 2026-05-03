// Karbantartas mod scheduler. A site_settings.maintenance_mode = TRUE bekapcsolasa-
// kor inditja a grace period count-down-t, kuld notifikaciokat (toast) a jobb also
// sarokba az online usereknek, majd a grace lejartakor ervenyesiti a kizarast:
// minden non-admin user redirect a /html/maintenance.html-re.
//
// DEV / production konfiguracio: a GRACE_MINUTES konstanst 0-ra allitva azonnali
// kizaras tortenik (tesztelhetoseg miatt). 30-ra allitva 30 perces ablak van,
// koztes ertesitesekkel.
//
// Grace alatt erkezo notifikaciok (jobb also sarok toast, 5s auto-dismiss):
//   - t+0s   : "Karbantartas: 30 perc mulva"
//   - t+15m  : "Karbantartas: 15 perc mulva"
//   - t+25m  : "Karbantartas: 5 perc mulva"
//   - t+29m  : "Karbantartas: 1 perc mulva"
//   - t+30m  : enforce -> minden non-admin user redirectel
//
// Toggle OFF a grace alatt: clearAllTimers + emit 'maintenance:cancelled'.

// !!! FELHASZNALOI KERES: most azonnali kidobas tesztelhetosegi okbol.
// Ha 30 perces grace-t akarsz, 30-ra allitsd a kovetkezo konstanst.
const GRACE_MINUTES = 0;

// Reminders: hany perc-vel a kizaras elott jelenik meg toast a usereknek.
// A scheduler csak azokat tervezi be, amelyek delay > 0.
const REMINDER_AT_REMAINING_MINUTES = [30, 15, 5, 1];

let timers = new Set();
let activeRunMeta = null; // { startedAt: Date, scheduledEnforceAt: Date }
let socketHubRef = null;

function clearAllTimers() {
    for (const tid of timers) {
        try { clearTimeout(tid); } catch (_) {}
    }
    timers = new Set();
}

function buildCountdownPayload(remainingMinutes, scheduledEnforceAt) {
    return {
        kind: 'maintenance:countdown',
        remainingMinutes,
        message: remainingMinutes === 1
            ? 'Karbantartás: 1 perc múlva'
            : `Karbantartás: ${remainingMinutes} perc múlva`,
        scheduledEnforceAt: scheduledEnforceAt ? scheduledEnforceAt.toISOString() : null,
        sentAt: new Date().toISOString()
    };
}

function emitCountdown(remainingMinutes) {
    if (!socketHubRef) return;
    const payload = buildCountdownPayload(remainingMinutes, activeRunMeta?.scheduledEnforceAt);
    try {
        if (typeof socketHubRef.broadcastSystemEvent === 'function') {
            socketHubRef.broadcastSystemEvent('maintenance:countdown', payload);
        } else if (socketHubRef.io) {
            // Fallback raw broadcast: minden csatlakozott klienshez
            socketHubRef.io.emit('maintenance:countdown', payload);
        }
    } catch (error) {
        console.warn('[maintenanceScheduler] emitCountdown hiba:', error.message);
    }
}

function emitEnforce() {
    if (!socketHubRef) {
        console.warn('[maintenanceScheduler] emitEnforce: nincs socketHub referencia, skip');
        return;
    }
    const payload = {
        kind: 'maintenance:enforce',
        message: 'A karbantartás megkezdődött. Az oldalt el kell hagynod.',
        sentAt: new Date().toISOString()
    };
    try {
        if (typeof socketHubRef.broadcastSystemEvent === 'function') {
            socketHubRef.broadcastSystemEvent('maintenance:enforce', payload);
            console.log('[maintenance] emitEnforce broadcastSystemEvent kuldve');
        } else if (socketHubRef.io) {
            socketHubRef.io.emit('maintenance:enforce', payload);
            console.log('[maintenance] emitEnforce direkt io.emit kuldve');
        } else {
            console.warn('[maintenance] emitEnforce: sem broadcastSystemEvent sem io a hubon, skip');
        }
    } catch (error) {
        console.warn('[maintenanceScheduler] emitEnforce hiba:', error.message);
    }
}

function emitCancelled() {
    if (!socketHubRef) return;
    const payload = {
        kind: 'maintenance:cancelled',
        message: 'A tervezett karbantartás vissza lett vonva.',
        sentAt: new Date().toISOString()
    };
    try {
        if (typeof socketHubRef.broadcastSystemEvent === 'function') {
            socketHubRef.broadcastSystemEvent('maintenance:cancelled', payload);
        } else if (socketHubRef.io) {
            socketHubRef.io.emit('maintenance:cancelled', payload);
        }
    } catch (error) {
        console.warn('[maintenanceScheduler] emitCancelled hiba:', error.message);
    }
}

// Hivasa: a settingsRoutes.js, amikor a maintenance_mode FALSE -> TRUE valt.
function startMaintenanceTransition({ socketHub }) {
    socketHubRef = socketHub || socketHubRef;
    clearAllTimers();

    const startedAt = new Date();
    const graceMs = Math.max(0, GRACE_MINUTES) * 60 * 1000;
    const scheduledEnforceAt = new Date(startedAt.getTime() + graceMs);
    activeRunMeta = { startedAt, scheduledEnforceAt };

    if (GRACE_MINUTES <= 0) {
        // Azonnali kizaras (DEV mode / tesztelhetoseg).
        emitEnforce();
        // A maintenanceGuard kezeli a request-szintu 503-okat.
        // Az aktiv socket-eket a frontend a 'maintenance:enforce' event hatasara
        // elnaviglja a /html/maintenance.html-re.
        return { mode: 'instant', scheduledEnforceAt };
    }

    // Grace mode: azonnal kuld egy "30 perc mulva" toast-ot, aztan tervezi
    // a tobbit + a vegso enforcement-et.
    emitCountdown(GRACE_MINUTES);

    for (const remaining of REMINDER_AT_REMAINING_MINUTES) {
        if (remaining >= GRACE_MINUTES) continue; // a kezdo emit-tel mar elkuldtuk
        const delayMs = (GRACE_MINUTES - remaining) * 60 * 1000;
        if (delayMs <= 0) continue;
        const tid = setTimeout(() => {
            emitCountdown(remaining);
        }, delayMs);
        timers.add(tid);
    }

    const enforceTid = setTimeout(() => {
        emitEnforce();
    }, graceMs);
    timers.add(enforceTid);

    return { mode: 'grace', graceMinutes: GRACE_MINUTES, scheduledEnforceAt };
}

// Hivasa: a settingsRoutes.js, amikor a maintenance_mode TRUE -> FALSE valt.
function cancelMaintenanceTransition({ socketHub }) {
    socketHubRef = socketHub || socketHubRef;
    if (timers.size === 0 && !activeRunMeta) {
        // Nem volt aktiv timer — csak a TRUE-rol-FALSE valtast jelezzuk a klienseknek.
        emitCancelled();
        activeRunMeta = null;
        return;
    }
    clearAllTimers();
    activeRunMeta = null;
    emitCancelled();
}

function getMeta() {
    return {
        graceMinutes: GRACE_MINUTES,
        active: activeRunMeta ? { ...activeRunMeta } : null,
        pendingTimers: timers.size
    };
}

module.exports = {
    startMaintenanceTransition,
    cancelMaintenanceTransition,
    getMeta,
    GRACE_MINUTES,
    REMINDER_AT_REMAINING_MINUTES
};
