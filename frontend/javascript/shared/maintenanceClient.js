/**
 * MattMesterMaintenance — karbantartas mod kliens-oldali handler.
 *
 * Architektura: a socketClient.js a default '/'' namespace-en erkezo
 * 'maintenance:countdown' / 'maintenance:enforce' / 'maintenance:cancelled'
 * socket eventeket window-szintu CustomEvent-ke konvertalja. Ez a modul
 * azokra a window-eventekre hallgat — igy fuggetlen a socketClient.js betoltesi
 * sorrendjetol es nem kell direkt socket-referenciat kotni.
 *
 * Felelosseg:
 *   - countdown: jobb-also-sarok narancs toast 5 mp-ig
 *   - enforce: redirect a /html/maintenance.html-re
 *   - cancelled: zold "vissza-vonva" toast
 *
 * Maintenance.html-bol szandekosan NEM aktivaljuk magunkat (mar ott vagyunk),
 * elkerulendo a vegtelen redirect loop-ot.
 */
(function initMaintenanceClient(globalScope) {
    'use strict';

    if (globalScope.__mattmesterMaintenanceInit) return;
    globalScope.__mattmesterMaintenanceInit = true;

    const TOAST_AUTO_DISMISS_MS = 5000;
    const CONTAINER_ID = 'mmMaintenanceToastContainer';
    const STYLE_ID = 'mmMaintenanceToastStyles';

    const isOnMaintenancePage = () => {
        try {
            return /\/html\/maintenance\.html(\?|$)/.test(globalScope.location?.pathname || '');
        } catch (_) {
            return false;
        }
    };

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${CONTAINER_ID} {
                position: fixed;
                right: 1.25rem;
                bottom: 1.25rem;
                z-index: 2147483000;
                display: flex;
                flex-direction: column;
                gap: 0.5rem;
                pointer-events: none;
                max-width: 360px;
            }
            .mm-maintenance-toast {
                pointer-events: auto;
                display: flex;
                align-items: flex-start;
                gap: 0.75rem;
                padding: 0.85rem 1rem;
                background: #1a1106;
                border: 1px solid rgba(255, 140, 26, 0.55);
                border-left: 4px solid #ff8c1a;
                border-radius: 10px;
                color: #ffd9b3;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5);
                font-family: 'Inter', system-ui, sans-serif;
                font-size: 0.92rem;
                line-height: 1.4;
                min-width: 240px;
                opacity: 0;
                transform: translateY(8px);
                transition: opacity 0.18s ease-out, transform 0.18s ease-out;
            }
            .mm-maintenance-toast.show {
                opacity: 1;
                transform: translateY(0);
            }
            .mm-maintenance-toast.kind-cancelled {
                background: #06120e;
                border-color: rgba(34, 197, 94, 0.55);
                border-left-color: #22c55e;
                color: #bbf7d0;
            }
            .mm-maintenance-toast .mm-icon {
                font-size: 1.25rem;
                line-height: 1;
                margin-top: 2px;
            }
            .mm-maintenance-toast.kind-countdown .mm-icon { color: #ff8c1a; }
            .mm-maintenance-toast.kind-cancelled .mm-icon { color: #22c55e; }
            .mm-maintenance-toast .mm-body { flex: 1; }
            .mm-maintenance-toast .mm-title {
                font-weight: 700;
                margin-bottom: 0.15rem;
            }
            .mm-maintenance-toast .mm-msg {
                opacity: 0.95;
            }
        `;
        document.head.appendChild(style);
    }

    function ensureContainer() {
        let el = document.getElementById(CONTAINER_ID);
        if (!el) {
            el = document.createElement('div');
            el.id = CONTAINER_ID;
            document.body.appendChild(el);
        }
        return el;
    }

    function showToast({ kind, title, message }) {
        injectStyles();
        const container = ensureContainer();
        const toast = document.createElement('div');
        toast.className = `mm-maintenance-toast kind-${kind || 'countdown'}`;

        const iconChar = kind === 'cancelled' ? '✓' : '⚠';
        toast.innerHTML = `
            <div class="mm-icon">${iconChar}</div>
            <div class="mm-body">
                ${title ? `<div class="mm-title">${escapeHtml(title)}</div>` : ''}
                <div class="mm-msg">${escapeHtml(message || '')}</div>
            </div>
        `;
        container.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));

        const dismiss = () => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentElement) toast.parentElement.removeChild(toast);
            }, 220);
        };
        setTimeout(dismiss, TOAST_AUTO_DISMISS_MS);
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = String(value === null || value === undefined ? '' : value);
        return div.innerHTML;
    }

    function handleEnforce(detail) {
        console.log('[maintenanceClient] handleEnforce hivva, isOnMaintenancePage=', isOnMaintenancePage());
        if (isOnMaintenancePage()) return;
        try {
            console.log('[maintenanceClient] redirect /html/maintenance.html-re');
            globalScope.location.replace('/html/maintenance.html');
        } catch (err) {
            console.warn('[maintenanceClient] redirect hiba:', err.message);
        }
    }

    function handleCountdown(detail) {
        console.log('[maintenanceClient] handleCountdown hivva, payload=', detail);
        if (isOnMaintenancePage()) return;
        const message = String(detail?.message || `Karbantartás: ${detail?.remainingMinutes || '?'} perc múlva`);
        showToast({
            kind: 'countdown',
            title: 'Karbantartás közeledik',
            message
        });
    }

    function handleCancelled(detail) {
        console.log('[maintenanceClient] handleCancelled hivva');
        if (isOnMaintenancePage()) return;
        showToast({
            kind: 'cancelled',
            title: 'Karbantartás visszavonva',
            message: detail?.message || 'A tervezett karbantartás vissza lett vonva.'
        });
    }

    function start() {
        if (isOnMaintenancePage()) {
            console.log('[maintenanceClient] maintenance.html-en vagyunk, skip');
            return;
        }
        console.log('[maintenanceClient] init — window CustomEvent listenerek bekotese');

        // Window CustomEvent-ek (a socketClient.js dispatchelje oket).
        globalScope.addEventListener('mattmester:maintenance:countdown', (e) => handleCountdown(e?.detail));
        globalScope.addEventListener('mattmester:maintenance:enforce', (e) => handleEnforce(e?.detail));
        globalScope.addEventListener('mattmester:maintenance:cancelled', (e) => handleCancelled(e?.detail));

        // Backup direct socket bind: ha a socketClient.js nem dispatch-elne (regi kod cache miatt),
        // probaljuk meg a szokasos modon is bekotni a maintenance:* eventeket.
        let backupAttempts = 0;
        const backupInterval = setInterval(() => {
            backupAttempts += 1;
            const sock = globalScope.MattMesterSocketClient?.socket
                || globalScope.appSocket
                || null;
            if (sock && !sock.__mmMaintenanceBackupBound) {
                try {
                    sock.on('maintenance:countdown', (p) => handleCountdown(p));
                    sock.on('maintenance:enforce', (p) => handleEnforce(p));
                    sock.on('maintenance:cancelled', (p) => handleCancelled(p));
                    sock.__mmMaintenanceBackupBound = true;
                    console.log('[maintenanceClient] backup direct socket bind sikeres');
                } catch (err) {
                    console.warn('[maintenanceClient] backup bind hiba:', err.message);
                }
                clearInterval(backupInterval);
            } else if (backupAttempts > 60) {
                console.warn('[maintenanceClient] backup bind nem sikerult 30s alatt — csak window eventeket figyelunk');
                clearInterval(backupInterval);
            }
        }, 500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }

    globalScope.MattMesterMaintenance = {
        showToast,
        handleEnforce,
        handleCountdown,
        handleCancelled
    };
})(typeof window !== 'undefined' ? window : this);
