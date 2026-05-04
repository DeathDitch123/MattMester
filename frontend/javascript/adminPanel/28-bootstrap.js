
// Patch the existing admin socket setup if available (idempotent).
(function autoAttachOnSocketReady() {
    let attached = false;
    const tryAttach = () => {
        if (attached) return;
        if (state.adminSocket) {
            attachAdminSocketListeners(state.adminSocket);
            attached = true;
        }
    };
    // Periodic poll — egyszer hooktol fuggetlenul biztos befut.
    const intervalId = setInterval(() => {
        tryAttach();
        if (attached) clearInterval(intervalId);
    }, 1000);
})();

document.addEventListener('DOMContentLoaded', () => {
    runSafely('adminDOMContentLoaded', () => {
        renderSidebar();
        showSection(DEFAULT_SECTION);
        initResponsiveSidebar();
        updateTokenPill();          // initial: 00:00 expired pill
        window.MattMesterChatModal?.init();
        // Auth bootstrap: session check + elevate modal
        bootstrapAdminAuth();
    });

    // Nyelvvaltaskor a teljes admin section ujrarendereles, hogy a dinamikus
    // strgek (status pill, ranglista, chart, modalok feliratai) is frissuljenek.
    if (window.MattMesterI18n?.onLangChange) {
        window.MattMesterI18n.onLangChange(() => {
            try {
                if (state?.currentSectionId) {
                    showSection(state.currentSectionId, null, { silent: true });
                }
                if (typeof renderSidebar === 'function') renderSidebar();
                if (typeof updateTokenPill === 'function') updateTokenPill();
                window.MattMesterAdminProfileImages?.refresh?.();
                window.MattMesterAdminChatModeration?.refresh?.();
                window.MattMesterAdminReports?.refresh?.();
            } catch (_) { /* ignore */ }
        });
    }
});
