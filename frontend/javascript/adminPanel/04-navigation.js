/* =============================================================
   7) Navigációs fa
   ============================================================= */
const NAV_TREE = [
    { id: 'dashboard', label: 'Vezérlőpult', icon: 'bi-grid-1x2-fill', leaf: true },

    {
        id: 'group-users', label: 'Felhasználók', icon: 'bi-people-fill', open: true,
        items: [
            { id: 'users', label: 'Lista', icon: 'bi-list-ul' },
            { id: 'userDetail', label: 'Részletek és szerkesztés', icon: 'bi-person-vcard' },
            { id: 'userBan', label: 'Tiltások', icon: 'bi-slash-circle' },
            { id: 'userDelete', label: 'Felhasználó törlése', icon: 'bi-trash3-fill' }
        ]
    },

    {
        id: 'group-moderation', label: 'Moderáció', icon: 'bi-shield-exclamation',
        items: [
            { id: 'chats', label: 'Chat moderálás', icon: 'bi-chat-dots-fill' },
            { id: 'profileImageReview', label: 'Profilképek', icon: 'bi-image' },
            { id: 'moderationReports', label: 'Bejelentések', icon: 'bi-flag-fill' }
        ]
    },

    {
        id: 'group-gameplay', label: 'Játékok', icon: 'bi-knight-fill',
        items: [
            { id: 'games', label: 'Játszmák', icon: 'bi-list-task' },
            { id: 'abilities', label: 'Képességek', icon: 'bi-magic' }
        ]
    },

    {
        id: 'group-logs', label: 'Naplók', icon: 'bi-journal-text',
        items: [
            { id: 'security', label: 'Bejelentkezések', icon: 'bi-shield-check' },
            { id: 'auditLog', label: 'Audit napló', icon: 'bi-journal-check' },
            { id: 'alerts', label: 'Riasztások', icon: 'bi-exclamation-octagon-fill' }
        ]
    },

    { id: 'superAdmin', label: 'Super admin', icon: 'bi-stars', leaf: true },
    { id: 'friends', label: 'Közösségi kapcsolatok', icon: 'bi-people', leaf: true },
    /* Chat menupont — NEM section, hanem a globalis MattMesterChatModal-t
     * nyitja meg. Ugyanaz a chat-rendszer mint a profil oldalon (socket-tel
     * frissul), igy admin-kent sem kell atlepni a profile.html-re. */
    { id: 'chat', label: 'Chat', icon: 'bi-chat-dots-fill', leaf: true, customClick: 'openAdminChatInbox(event)' },
    { id: 'tests', label: 'Tesztek', icon: 'bi-clipboard2-check', leaf: true },
    { id: 'settings', label: 'Beállítások', icon: 'bi-gear-fill', leaf: true }
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
        return `
        <a href="#" class="nav-link${isTopLevel ? ' nav-link-top' : ''}"${dataSection}
            onclick="${onclickAttr}">
            <i class="bi ${item.icon}"></i>
            <span>${item.label}</span>
            ${item.badge ? `<span class="badge bg-${item.badge.variant}${item.badge.variant === 'warning' ? ' text-dark' : ''} menu-badge">${item.badge.text}</span>` : ''}
        </a>
    `;
    };

    const renderGroup = (group) => `
        <div class="menu-group">
            <button class="menu-group-toggle" type="button"
                data-bs-toggle="collapse" data-bs-target="#${group.id}"
                aria-expanded="${group.open ? 'true' : 'false'}" aria-controls="${group.id}">
                <i class="bi ${group.icon}"></i>
                <span>${group.label}</span>
                ${group.badge ? `<span class="badge bg-${group.badge.variant}${group.badge.variant === 'warning' ? ' text-dark' : ''} menu-badge">${group.badge.text}</span>` : ''}
                <i class="bi bi-chevron-down chevron"></i>
            </button>
            <div id="${group.id}" class="collapse${group.open ? ' show' : ''}">
                <div class="submenu">${group.items.map(it => renderLeaf(it, false)).join('')}</div>
            </div>
        </div>
    `;

    target.innerHTML =
        NAV_TREE.map(entry => entry.leaf ? renderLeaf(entry, true) : renderGroup(entry)).join('') +
        `<div class="menu-separator" aria-hidden="true"></div>` +
        `<a href="#" class="nav-link nav-link-top logout-link" onclick="logout(); return false;">
            <i class="bi bi-box-arrow-right"></i>
            <span>Kijelentkezés</span>
        </a>`;
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
            showToast('A chat modal nem erheto el (chatModal.js nincs betoltve).', 'danger');
        } else {
            console.error('MattMesterChatModal API hianyzik.');
        }
        return;
    }
    Promise.resolve(api.openInbox()).catch((err) => {
        console.error('Admin chat inbox nyitasi hiba:', err);
        if (typeof showToast === 'function') {
            showToast(err?.message || 'Nem sikerult megnyitni a chat-et.', 'danger');
        }
    });
}

