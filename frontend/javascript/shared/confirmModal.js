// MattMester kozos confirm/alert modal — Bootstrap-fuggetlen vanilla helper.
// Cel: a felhasznalo memoriaja szerint NINCS native alert/confirm/prompt; mindent
// custom HTML modallal kell helyettesiteni. Ez a helper minden oldalon mukodik
// (chess.html-en is, ahol Bootstrap nincs betoltve).
//
// API:
//   await window.mmConfirm({ title, message, confirmLabel, cancelLabel, danger? })
//     -> Promise<boolean> (true = OK / Enter, false = Mégse / Esc / overlay-click)
//
//   await window.mmAlert({ title, message, okLabel })
//     -> Promise<void>

(function () {
    'use strict';

    const tx = (hu, en) => (window.MattMesterI18n?.tx ? window.MattMesterI18n.tx(hu, en) : hu);

    function escapeHtml(s) {
        if (s == null) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }

    function buildOverlay(htmlInner) {
        const overlay = document.createElement('div');
        overlay.className = 'mm-confirm-overlay';
        overlay.setAttribute('role', 'presentation');
        overlay.innerHTML = htmlInner;
        document.body.appendChild(overlay);
        return overlay;
    }

    function attachAutoFocus(overlay, selector) {
        // Default fokusz a primer/danger gombra, hogy Enter azonnal trigger-eljen
        setTimeout(() => {
            const btn = overlay.querySelector(selector);
            if (btn) btn.focus();
        }, 0);
    }

    function makeCleanup(overlay, resolve, value) {
        return function cleanup() {
            try { overlay.remove(); } catch (_) { /* ignore */ }
            resolve(value);
        };
    }

    /**
     * Confirm modal — yes/no decision.
     * @param {object} options
     * @param {string} [options.title='Megerősítés']
     * @param {string} [options.message]
     * @param {string} [options.confirmLabel='Igen']
     * @param {string} [options.cancelLabel='Mégse']
     * @param {boolean} [options.danger=false] - red primary button (destructive action)
     * @returns {Promise<boolean>}
     */
    window.mmConfirm = function mmConfirm(options) {
        const opts = options || {};
        const title = opts.title || tx('Megerősítés', 'Confirm');
        const message = opts.message || '';
        const confirmLabel = opts.confirmLabel || tx('Igen', 'Yes');
        const cancelLabel = opts.cancelLabel || tx('Mégse', 'Cancel');
        const danger = Boolean(opts.danger);

        return new Promise((resolve) => {
            const dialogClass = danger ? 'mm-confirm-dialog is-danger' : 'mm-confirm-dialog';
            const primaryClass = danger ? 'mm-confirm-btn mm-confirm-danger' : 'mm-confirm-btn mm-confirm-primary';

            const overlay = buildOverlay(`
                <div class="${dialogClass}" role="alertdialog" aria-modal="true" aria-labelledby="mmConfirmTitle">
                    <h3 class="mm-confirm-title" id="mmConfirmTitle">${escapeHtml(title)}</h3>
                    <p class="mm-confirm-message">${escapeHtml(message)}</p>
                    <div class="mm-confirm-actions">
                        <button type="button" class="mm-confirm-btn mm-confirm-cancel" data-act="cancel">${escapeHtml(cancelLabel)}</button>
                        <button type="button" class="${primaryClass}" data-act="ok">${escapeHtml(confirmLabel)}</button>
                    </div>
                </div>
            `);

            let settled = false;
            const finalize = (val) => {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', onKey);
                makeCleanup(overlay, resolve, val)();
            };
            const onKey = (e) => {
                if (e.key === 'Escape') { e.preventDefault(); finalize(false); }
                else if (e.key === 'Enter') { e.preventDefault(); finalize(true); }
            };
            document.addEventListener('keydown', onKey);

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) finalize(false);
                const act = e.target?.dataset?.act;
                if (act === 'ok') finalize(true);
                else if (act === 'cancel') finalize(false);
            });

            attachAutoFocus(overlay, '[data-act="ok"]');
        });
    };

    /**
     * Alert modal — info-only acknowledge.
     * @param {object} options
     * @param {string} [options.title='Üzenet']
     * @param {string} [options.message]
     * @param {string} [options.okLabel='Rendben']
     * @returns {Promise<void>}
     */
    window.mmAlert = function mmAlert(options) {
        const opts = options || {};
        const title = opts.title || tx('Üzenet', 'Message');
        const message = opts.message || '';
        const okLabel = opts.okLabel || tx('Rendben', 'OK');

        return new Promise((resolve) => {
            const overlay = buildOverlay(`
                <div class="mm-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="mmAlertTitle">
                    <h3 class="mm-confirm-title" id="mmAlertTitle">${escapeHtml(title)}</h3>
                    <p class="mm-confirm-message">${escapeHtml(message)}</p>
                    <div class="mm-confirm-actions">
                        <button type="button" class="mm-confirm-btn mm-confirm-primary" data-act="ok">${escapeHtml(okLabel)}</button>
                    </div>
                </div>
            `);

            let settled = false;
            const finalize = () => {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', onKey);
                makeCleanup(overlay, resolve, undefined)();
            };
            const onKey = (e) => {
                if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); finalize(); }
            };
            document.addEventListener('keydown', onKey);

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) finalize();
                if (e.target?.dataset?.act === 'ok') finalize();
            });

            attachAutoFocus(overlay, '[data-act="ok"]');
        });
    };
})();
