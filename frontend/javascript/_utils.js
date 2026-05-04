// ============================================================
// FRONTEND COMMON UTILS — single source of truth
// ============================================================
// `window.MattMesterUtils` névtér: minden user-facing oldalon ugyanaz
// a 4 helper. Korábban index.js, profile/01-helpers.js, adminPanel/01-helpers.js
// és chessModeChooser.js mind külön definiált egy verziót.
//
// Ezt a script-et a többi user-script ELŐTT kell betölteni minden HTML page-en.
// ============================================================

(function () {
    'use strict';

    const tx = (hu, en) => (window.MattMesterI18n?.tx ? window.MattMesterI18n.tx(hu, en) : hu);

    // Try-catch wrapper sync handler-hez. Hiba esetén logol, undefined-et ad vissza.
    function runSafely(label, handler) {
        let value;
        try {
            value = handler();
        } catch (error) {
            console.error(`${label} hiba:`, error);
        }
        return value;
    }

    // Try-catch wrapper async handler-hez. Hiba esetén logol, undefined-et ad vissza.
    async function runSafelyAsync(label, handler) {
        let value;
        try {
            value = await handler();
        } catch (error) {
            console.error(`${label} hiba:`, error);
        }
        return value;
    }

    // HTML-escape a 5 fő speciális karakterre. Egyetlen kanonikus implementáció a
    // teljes frontend-en — a korábbi 4 lokális duplikátum mind erre hivatkozik.
    function escapeHtml(value) {
        const text = String(value == null ? '' : value);
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Session info lekérése. AbortController-rel támogatott (ha a hívó a
    // window.requestController-t használja, a withAbortSignal hookolja). Hiba
    // esetén { success: false, loggedIn: false } default-ot ad — a hívók nem
    // crashelnek a network-loss-on.
    async function fetchSessionInfo() {
        let data = { success: false, loggedIn: false };
        try {
            const init = {};
            if (window.requestController?.withAbortSignal) {
                init.signal = window.requestController.withAbortSignal('sessionInfo');
            }
            const response = await fetch('/api/sessionInfo', init);
            if (response.ok) {
                try {
                    data = await response.json();
                } catch (_) {
                    data = { success: false, loggedIn: false };
                }
            }
        } catch (error) {
            if (error && error.name === 'AbortError') throw error;
            console.error('fetchSessionInfo hiba:', error);
        } finally {
            if (window.requestController?.clearSignal) {
                window.requestController.clearSignal('sessionInfo');
            }
        }
        return data;
    }

    window.MattMesterUtils = {
        runSafely,
        runSafelyAsync,
        escapeHtml,
        fetchSessionInfo,
        tx
    };

    // Globalis `tx` — minden script-tag elerheti `tx('hu','en')` formaban,
    // anelkul hogy minden fajl `const tx = ...`-t deklaralna (concatenated
    // <script> tagek kozos top-level scope-ja miatt a redeklaracio SyntaxError).
    if (typeof window.tx === 'undefined') {
        window.tx = tx;
    }
})();
