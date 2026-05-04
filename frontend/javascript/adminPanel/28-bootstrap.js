
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
});
