/* =============================================================
   7) Navigációs fa
   ============================================================= */
/* Issue #7 — minden NAV_TREE label-hez `i18nKey` jar; a renderSidebar a
 * label HTML-jet `data-i18n="kulcs"` attributummal latja el, igy a
 * shared/i18n.js szótárából automatikus a fordítás. A `label` mezo magyar
 * fallback marad arra az esetre, ha a szótárban hiányzik a kulcs. */
const NAV_TREE = [
    { id: 'dashboard', label: 'Vezérlőpult', i18nKey: 'admin.dashboard', icon: 'bi-grid-1x2-fill', leaf: true },

    {
        id: 'group-users', label: 'Felhasználók', i18nKey: 'admin.users', icon: 'bi-people-fill', open: true,
        items: [
            { id: 'users', label: 'Lista', i18nKey: 'admin.users_list', icon: 'bi-list-ul' },
            { id: 'userDetail', label: 'Részletek és szerkesztés', i18nKey: 'admin.user_details', icon: 'bi-person-vcard' },
            { id: 'userBan', label: 'Tiltások', i18nKey: 'admin.bans', icon: 'bi-slash-circle' },
            { id: 'userDelete', label: 'Felhasználó törlése', i18nKey: 'admin.user_delete', icon: 'bi-trash3-fill' }
        ]
    },

    {
        id: 'group-moderation', label: 'Moderáció', i18nKey: 'admin.moderation', icon: 'bi-shield-exclamation',
        items: [
            { id: 'chats', label: 'Chat moderálás', i18nKey: 'admin.chat_moderation', icon: 'bi-chat-dots-fill' },
            { id: 'profileImageReview', label: 'Profilképek', i18nKey: 'admin.profile_images', icon: 'bi-image' },
            { id: 'moderationReports', label: 'Bejelentések', i18nKey: 'admin.reports', icon: 'bi-flag-fill' }
        ]
    },

    {
        id: 'group-gameplay', label: 'Játékok', i18nKey: 'admin.gameplay', icon: 'bi-knight-fill',
        items: [
            { id: 'games', label: 'Játszmák', i18nKey: 'admin.games', icon: 'bi-list-task' },
            { id: 'abilities', label: 'Képességek', i18nKey: 'admin.abilities', icon: 'bi-magic' }
        ]
    },

    {
        id: 'group-logs', label: 'Naplók', i18nKey: 'admin.logs', icon: 'bi-journal-text',
        items: [
            { id: 'security', label: 'Bejelentkezések', i18nKey: 'admin.security_logs', icon: 'bi-shield-check' },
            { id: 'auditLog', label: 'Audit napló', i18nKey: 'admin.audit_log', icon: 'bi-journal-check' },
            { id: 'alerts', label: 'Riasztások', i18nKey: 'admin.alerts', icon: 'bi-exclamation-octagon-fill' }
        ]
    },

    { id: 'superAdmin', label: 'Super admin', i18nKey: 'admin.super_admin', icon: 'bi-stars', leaf: true },
    { id: 'friends', label: 'Közösségi kapcsolatok', i18nKey: 'admin.friends', icon: 'bi-people', leaf: true },
    /* Chat — kiszerveze egy lebego FAB ikonra. */
    { id: 'tests', label: 'Tesztek', i18nKey: 'admin.tests', icon: 'bi-clipboard2-check', leaf: true },
    { id: 'settings', label: 'Beállítások', i18nKey: 'admin.settings', icon: 'bi-gear-fill', leaf: true }
];

const DEFAULT_SECTION = 'dashboard';

/* =============================================================
   8) Sidebar render
   ============================================================= */
function renderSidebar() {
    const target = document.getElementById('sidebarMenu');
    if (!target) return;

    const renderLeaf = (item, isTopLevel = false) => {
        // Egyedi click handler (pl. modal nyitas) felulirja a default
        // showSection navigaciot. Ezzel olyan menupontok is ide kerulhetnek,
        // amelyek nem rendelnek `SECTIONS[id]` rendererrel (pl. a globalis
        // chat modal). A `data-section` attributumot ilyenkor nem allitjuk,
        // hogy a kijelolt-allapot logika ne tegye aktivva.
        const onclickAttr = item.customClick
            ? `${item.customClick}; return false;`
            : `showSection('${item.id}', event); return false;`;
        const dataSection = item.customClick ? '' : ` data-section="${item.id}"`;
        const i18nAttr = item.i18nKey ? ` data-i18n="${item.i18nKey}"` : '';
        return `
        <a href="#" class="nav-link${isTopLevel ? ' nav-link-top' : ''}"${dataSection}
            onclick="${onclickAttr}">
            <i class="bi ${item.icon}"></i>
            <span${i18nAttr}>${item.label}</span>
            ${item.badge ? `<span class="badge bg-${item.badge.variant}${item.badge.variant === 'warning' ? ' text-dark' : ''} menu-badge">${item.badge.text}</span>` : ''}
        </a>
    `;
    };

    const renderGroup = (group) => {
        const gi18n = group.i18nKey ? ` data-i18n="${group.i18nKey}"` : '';
        return `
        <div class="menu-group">
            <button class="menu-group-toggle" type="button"
                data-bs-toggle="collapse" data-bs-target="#${group.id}"
                aria-expanded="${group.open ? 'true' : 'false'}" aria-controls="${group.id}">
                <i class="bi ${group.icon}"></i>
                <span${gi18n}>${group.label}</span>
                ${group.badge ? `<span class="badge bg-${group.badge.variant}${group.badge.variant === 'warning' ? ' text-dark' : ''} menu-badge">${group.badge.text}</span>` : ''}
                <i class="bi bi-chevron-down chevron"></i>
            </button>
            <div id="${group.id}" class="collapse${group.open ? ' show' : ''}">
                <div class="submenu">${group.items.map(it => renderLeaf(it, false)).join('')}</div>
            </div>
        </div>
    `;
    };

    target.innerHTML =
        NAV_TREE.map(entry => entry.leaf ? renderLeaf(entry, true) : renderGroup(entry)).join('') +
        `<div class="menu-separator" aria-hidden="true"></div>` +
        `<a href="#" class="nav-link nav-link-top logout-link" onclick="logout(); return false;">
            <i class="bi bi-box-arrow-right"></i>
            <span data-i18n="nav.logout">Kijelentkezés</span>
        </a>`;
    // I18n re-apply: a sidebar dinamikus markup most kerult be, alkalmazzuk
    // a forditasokat (a MutationObserver is felveszi, de ez gyorsabb).
    if (window.MattMesterI18n && typeof window.MattMesterI18n.applyAll === 'function') {
        try { window.MattMesterI18n.applyAll(target); } catch (_) { /* ignore */ }
    }
}

// Globalis chat modal megnyitas admin-kent. Ugyanaz a `MattMesterChatModal`,
// amit a profil oldal is hasznal — socket bind, conversation list, message
// fetch mind ugyanigy mukodik (lasd chatModal.js init/openInbox). A chatModal.js
// auto-init-el indul a DOMContentLoaded-on, igy mire ide jutunk, a globalis
// objektum kesz. Az `openInbox` belul gondoskodik a socket binding-rol es
// az inbox listanak betoltesserol.
function openAdminChatInbox(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    const api = window.MattMesterChatModal;
    if (!api?.openInbox) {
        if (typeof showToast === 'function') {
            showToast(tx('A chat modal nem erheto el (chatModal.js nincs betoltve).', 'Chat modal unavailable (chatModal.js not loaded).'), 'danger');
        } else {
            console.error('MattMesterChatModal API hianyzik.');
        }
        return;
    }
    Promise.resolve(api.openInbox()).catch((err) => {
        console.error('Admin chat inbox nyitasi hiba:', err);
        if (typeof showToast === 'function') {
            showToast(err?.message || tx('Nem sikerult megnyitni a chat-et.', 'Failed to open chat.'), 'danger');
        }
    });
}

