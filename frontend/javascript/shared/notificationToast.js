/* =============================================================
   MattMester — Globalis notification toast widget
   =============================================================
   Felelosseg: a `mattmester:notification:push` esemenyhez tartozo
   payloadot (a backend `notificationService.send()` altal kuldott
   szerver-oldali notification entry) megjeleniteni egy nem-blokkolo
   bubble-toast formajaban, fuggetlenul attol melyik oldal van nyitva.

   Hasznalat: a pubikus API `MattMesterNotificationToast.show(notif)`,
   amit pl. a profile/04-notificationEvents.js hiv minden uj push-on.
   Az index.html, profile.html, adminPanel.html, chess.html mind betolthet
   ezt a modult a navbar utan.

   A toast-stack a viewport jobb-also sarkaba van pinelve, max 3 elem
   lathato egyszerre. Auto-dismiss 6s utan; klikkelheto: nyitja a chat
   modalt (chat_message_from_admin) vagy a notification centert.
   ============================================================= */
(function () {
    'use strict';

    const STACK_ID = 'mm-notif-toast-stack';
    const MAX_TOASTS = 3;
    const AUTO_DISMISS_MS = 6000;

    const tx = (hu, en) => (window.MattMesterI18n?.tx ? window.MattMesterI18n.tx(hu, en) : hu);

    function ensureStack() {
        let stack = document.getElementById(STACK_ID);
        if (stack) return stack;
        stack = document.createElement('div');
        stack.id = STACK_ID;
        stack.setAttribute('aria-live', 'polite');
        stack.setAttribute('aria-atomic', 'false');
        Object.assign(stack.style, {
            position: 'fixed',
            right: '16px',
            bottom: '16px',
            zIndex: '2000',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            maxWidth: 'min(380px, calc(100vw - 32px))',
            pointerEvents: 'none'
        });
        document.body.appendChild(stack);
        return stack;
    }

    function trimStack(stack) {
        while (stack.children.length > MAX_TOASTS) {
            stack.removeChild(stack.firstChild);
        }
    }

    function severityColor(severity) {
        switch (String(severity || 'info').toLowerCase()) {
            case 'success': return { bg: 'rgba(34, 197, 94, 0.95)',  border: '#22c55e' };
            case 'warning': return { bg: 'rgba(234, 179, 8, 0.95)',  border: '#eab308' };
            case 'error':   return { bg: 'rgba(239, 68, 68, 0.95)',  border: '#ef4444' };
            default:        return { bg: 'rgba(15, 23, 42, 0.95)',   border: '#334155' };
        }
    }

    function iconForType(type) {
        const t = String(type || '').toLowerCase();
        if (t === 'chat_message_from_admin') return '👮';
        if (t.startsWith('chat_'))            return '💬';
        if (t.startsWith('friend_'))          return '👥';
        if (t.startsWith('ban'))              return '⛔';
        if (t.startsWith('match'))            return '♟️';
        return '🔔';
    }

    function dismiss(toastEl) {
        if (!toastEl || toastEl._dismissed) return;
        toastEl._dismissed = true;
        toastEl.style.transition = 'opacity 240ms ease, transform 240ms ease';
        toastEl.style.opacity = '0';
        toastEl.style.transform = 'translateY(8px)';
        setTimeout(() => { try { toastEl.remove(); } catch (_) {} }, 280);
    }

    function handleClick(notification) {
        const type = String(notification?.type || '').toLowerCase();
        const conversationId = Number(notification?.payload?.conversationId) || 0;
        if (type === 'chat_message_from_admin' && conversationId) {
            try {
                window.dispatchEvent(new CustomEvent('mattmester:chat:open-conversation', {
                    detail: { conversationId, source: 'notification-toast' }
                }));
                return;
            } catch (_) { /* ignore */ }
        }
        // Egyebkent nyitjuk a notification centert (ha van).
        const bell = document.querySelector('[data-open-notifications], .notification-center-trigger, #notificationsBell');
        if (bell && typeof bell.click === 'function') {
            try { bell.click(); } catch (_) {}
        }
    }

    function show(notification) {
        if (!notification || typeof notification !== 'object') return;
        if (typeof document === 'undefined' || !document.body) return;

        const stack = ensureStack();
        const { bg, border } = severityColor(notification.severity);
        const icon = iconForType(notification.type);
        const title = String(notification.title || tx('Új értesítés', 'New notification'));
        const message = String(notification.message || '').slice(0, 200);

        const toast = document.createElement('div');
        toast.setAttribute('role', 'status');
        toast.setAttribute('data-notif-type', String(notification.type || ''));
        Object.assign(toast.style, {
            pointerEvents: 'auto',
            background: bg,
            color: '#f8fafc',
            border: `1px solid ${border}`,
            borderRadius: '12px',
            padding: '12px 14px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.35)',
            cursor: 'pointer',
            opacity: '0',
            transform: 'translateY(8px)',
            transition: 'opacity 240ms ease, transform 240ms ease',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
            fontSize: '0.9rem',
            lineHeight: '1.35'
        });

        const iconSpan = document.createElement('span');
        iconSpan.textContent = icon;
        iconSpan.style.fontSize = '1.4rem';
        iconSpan.style.lineHeight = '1';
        iconSpan.style.flexShrink = '0';
        toast.appendChild(iconSpan);

        const body = document.createElement('div');
        body.style.flex = '1 1 auto';
        body.style.minWidth = '0';

        const titleEl = document.createElement('div');
        titleEl.textContent = title;
        titleEl.style.fontWeight = '700';
        titleEl.style.marginBottom = '2px';
        titleEl.style.wordBreak = 'break-word';
        body.appendChild(titleEl);

        if (message) {
            const msgEl = document.createElement('div');
            msgEl.textContent = message;
            msgEl.style.opacity = '0.92';
            msgEl.style.wordBreak = 'break-word';
            body.appendChild(msgEl);
        }

        toast.appendChild(body);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', tx('Bezárás', 'Close'));
        closeBtn.textContent = '×';
        Object.assign(closeBtn.style, {
            background: 'transparent',
            color: '#f8fafc',
            border: 'none',
            fontSize: '1.2rem',
            lineHeight: '1',
            padding: '0 4px',
            cursor: 'pointer',
            opacity: '0.75',
            flexShrink: '0'
        });
        closeBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            dismiss(toast);
        });
        toast.appendChild(closeBtn);

        toast.addEventListener('click', () => {
            handleClick(notification);
            dismiss(toast);
        });

        stack.appendChild(toast);
        trimStack(stack);

        // Animation in
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        // Auto-dismiss
        setTimeout(() => dismiss(toast), AUTO_DISMISS_MS);
    }

    // Public API
    window.MattMesterNotificationToast = { show };

    // Onhalo: ha a profil-rendszer (04-notificationEvents.js) nincs betoltve
    // (pl. index.html, chess.html), a globalis `mattmester:notification:push`
    // eseményt itt elkapjuk es megjelenitjuk a toast-ot.
    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('mattmester:notification:push', (event) => {
            // 04-notificationEvents.js maga is hivja a show()-t — duplikalas elkerulesere
            // egy egyszeru `_handledByCenter` flag-et nezunk, amit a notification center
            // setSetelhet. Hianyaban nem szurunk: ket toast keletkezne, ami nem ideal,
            // de a user erezze hogy tortent valami. Inkabb a 04 hivasanal hagyjuk csak.
            if (window.__mmNotifCenterBound) return;
            try { show(event?.detail || {}); } catch (_) { /* ignore */ }
        });
    }
})();
