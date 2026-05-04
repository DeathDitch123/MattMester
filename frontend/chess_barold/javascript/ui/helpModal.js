// ============================================================
// SAKK UI — SEGITSEG MODAL
// ============================================================
// `#helpFloatingBtn` -> `#help-modal` toggle. Custom HTML modal (NEM nativ
// alert/confirm), ESC + overlay-klikk + `×` zar.
//
// A modult a main.js init() koti be egyszer, az oldal-betoltes legvegen.
// ============================================================

export function bindHelpModal() {
    const modal = document.getElementById('help-modal');
    const openBtn = document.getElementById('helpFloatingBtn');
    const closeBtn = document.getElementById('helpModalClose');
    const overlay = modal ? modal.querySelector('.help-modal-overlay') : null;
    if (!modal || !openBtn || !closeBtn) return;

    const open = () => modal.classList.remove('hidden');
    const close = () => modal.classList.add('hidden');

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    if (overlay) overlay.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) close();
    });
}
