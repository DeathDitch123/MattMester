// Profile dashboard header + statisztikak dinamikus betoltes /api/sessionInfo-bol.
// A korabbi hardcoded "GrandMaster_99 / 247 wins / 1500 ELO" placeholder helyett
// most a tenyleges bejelentkezett user adatait jeleniti meg.
//
// IDs:
//   #profileDashboardName, #profileDashboardRole, #profileDashboardEmail, #profileAvatarDashboard
//   #profileEloClassic, #profileEloMM, #profileEloBullet (+ Rank suffix-ok)
//   #profileStatWins, #profileStatLosses, #profileStatDraws, #profileStatWinRate

(function () {
    'use strict';

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value == null ? '—' : String(value);
    }

    // ELO -> rang szoveg + CSS osztaly. A skala 800 alaperteke koruli.
    function eloRank(elo) {
        const n = Number(elo) || 0;
        if (n >= 2000) return { label: 'Mester',     cls: 'rank-master' };
        if (n >= 1700) return { label: 'Szakértő',   cls: 'rank-expert' };
        if (n >= 1400) return { label: 'Haladó',     cls: 'rank-advanced' };
        if (n >= 1100) return { label: 'Középhaladó', cls: 'rank-intermediate' };
        return { label: 'Kezdő', cls: 'rank-beginner' };
    }

    function applyEloCard(numId, rankId, eloValue) {
        setText(numId, Number(eloValue || 0).toLocaleString('hu-HU'));
        const rankEl = document.getElementById(rankId);
        if (rankEl) {
            const r = eloRank(eloValue);
            rankEl.className = `elo-rank ${r.cls}`;
            rankEl.textContent = r.label;
        }
    }

    function applyRoleBadge(role) {
        const badge = document.getElementById('profileDashboardRole');
        if (!badge) return;
        const isAdmin = role === 'admin';
        badge.classList.remove('d-none', 'admin');
        badge.textContent = isAdmin ? 'Admin' : (role === 'player' ? 'Játékos' : (role || 'Felhasználó'));
        if (isAdmin) badge.classList.add('admin');
    }

    function applyAvatar(user) {
        const avatarEl = document.getElementById('profileAvatarDashboard');
        if (!avatarEl) return;
        if (window.MattMesterProfileImage?.applyProfileImagePresentation) {
            window.MattMesterProfileImage.applyProfileImagePresentation(avatarEl, {
                source: user,
                size: 96
            });
        } else if (user?.profile_image) {
            avatarEl.src = user.profile_image;
        }
    }

    function applyImageStatusLabel(status) {
        const el = document.getElementById('profileImageHeaderStatus');
        if (!el) return;
        const labels = {
            approved: 'Profilkép státusz: Jóváhagyott',
            pending:  'Profilkép státusz: Felülvizsgálatra vár',
            rejected: 'Profilkép státusz: Elutasítva',
            default:  'Profilkép státusz: Alapértelmezett'
        };
        el.textContent = labels[status] || `Profilkép státusz: ${status || 'ismeretlen'}`;
    }

    function applyStats(stats) {
        const wins = Number(stats?.wins || 0);
        const losses = Number(stats?.losses || 0);
        const draws = Number(stats?.draws || 0);
        const total = wins + losses + draws;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        setText('profileStatWins', wins.toLocaleString('hu-HU'));
        setText('profileStatLosses', losses.toLocaleString('hu-HU'));
        setText('profileStatDraws', draws.toLocaleString('hu-HU'));
        setText('profileStatWinRate', `${winRate}%`);
    }

    async function loadDashboardStats() {
        try {
            const res = await fetch('/api/sessionInfo', { credentials: 'same-origin' });
            if (!res.ok) return;
            const json = await res.json();
            if (!json?.loggedIn || !json.user) return;
            const u = json.user;

            setText('profileDashboardName', u.username || '—');
            setText('profileDashboardEmail', u.email || '—');
            applyRoleBadge(u.role);
            applyAvatar(u);
            applyImageStatusLabel(u.profile_image_status);

            applyEloCard('profileEloClassic', 'profileEloClassicRank', u.elo);
            applyEloCard('profileEloMM',      'profileEloMMRank',      u.elo_MM);
            applyEloCard('profileEloBullet',  'profileEloBulletRank',  u.elo_bullet);

            applyStats(u.stats || {});
        } catch (err) {
            console.warn('Profile dashboard stats load hiba:', err);
        }
    }

    // Globalis re-export hogy egyeb modulok is hivhassak (pl. profil-mentes utan refresh)
    window.MattMesterProfileDashboard = { reload: loadDashboardStats };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadDashboardStats);
    } else {
        loadDashboardStats();
    }
})();
