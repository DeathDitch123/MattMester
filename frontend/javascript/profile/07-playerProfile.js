function getSearchResultsModalElements() {
    return {
        modal: document.getElementById('searchResultsModal'),
        titleText: document.getElementById('searchResultsModalTitleText'),
        list: document.getElementById('searchResultsList'),
        summary: document.getElementById('searchResultsSummary'),
        empty: document.getElementById('searchResultsEmpty')
    };
}

function getPlayerProfileModalElements() {
    return {
        modal: document.getElementById('playerProfileModal'),
        titleText: document.getElementById('playerProfileModalTitleText'),
        feedback: document.getElementById('playerProfileModalFeedback'),
        avatar: document.getElementById('playerProfileAvatar'),
        username: document.getElementById('playerProfileUsername'),
        role: document.getElementById('playerProfileRole'),
        joinedAt: document.getElementById('playerProfileJoinedAt'),
        lastActiveAt: document.getElementById('playerProfileLastActiveAt'),
        eloClassic: document.getElementById('playerProfileEloClassic'),
        eloClassicRank: document.getElementById('playerProfileEloClassicRank'),
        eloMM: document.getElementById('playerProfileEloMM'),
        eloMMRank: document.getElementById('playerProfileEloMMRank'),
        eloBullet: document.getElementById('playerProfileEloBullet'),
        eloBulletRank: document.getElementById('playerProfileEloBulletRank'),
        wins: document.getElementById('playerProfileWins'),
        losses: document.getElementById('playerProfileLosses'),
        draws: document.getElementById('playerProfileDraws'),
        winRate: document.getElementById('playerProfileWinRate')
    };
}

function toNumberSafe(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumberHu(value) {
    return toNumberSafe(value).toLocaleString('hu-HU');
}

function getRankForEloValue(eloValue) {
    const elo = toNumberSafe(eloValue);
    if (elo < 1100) {
        return { label: 'Kezdő', className: 'rank-beginner' };
    }
    if (elo < 1400) {
        return { label: 'Középhaladó', className: 'rank-intermediate' };
    }
    if (elo < 1700) {
        return { label: 'Haladó', className: 'rank-advanced' };
    }
    if (elo < 2000) {
        return { label: 'Szakértő', className: 'rank-expert' };
    }
    if (elo < 2300) {
        return { label: 'Mester', className: 'rank-master' };
    }

    return { label: 'Nagymester', className: 'rank-grandmaster' };
}

function applyRankBadge(rankElement, eloValue) {
    if (!rankElement) {
        return;
    }

    const rank = getRankForEloValue(eloValue);
    rankElement.classList.remove('rank-beginner', 'rank-intermediate', 'rank-advanced', 'rank-expert', 'rank-master', 'rank-grandmaster');
    rankElement.classList.add(rank.className);
    rankElement.textContent = rank.label;
}

function formatDateTimeHuman(value) {
    if (!value) {
        return 'Nincs adat';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'Nincs adat';
    }

    return date.toLocaleString('hu-HU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function setPlayerProfileModalFeedback(message = '', type = 'neutral') {
    const { feedback } = getPlayerProfileModalElements();
    if (!feedback) {
        return;
    }

    feedback.classList.remove('d-none', 'is-success', 'is-error');
    feedback.textContent = message || '';

    if (!message) {
        feedback.classList.add('d-none');
        return;
    }

    if (type === 'success') {
        feedback.classList.add('is-success');
    } else if (type === 'error') {
        feedback.classList.add('is-error');
    }
}

function fillPlayerProfileModal(player) {
    const elements = getPlayerProfileModalElements();
    if (!elements.modal) {
        throw new Error('A játékos profil modal elemei nem találhatók a DOM-ban.');
    }

    if (elements.titleText) {
        elements.titleText.textContent = `${player.username || 'Játékos'} profilja`;
    }

    if (elements.avatar) {
        window.MattMesterProfileImage.applyProfileImagePresentation(elements.avatar, {
            source: player,
            alt: `${player.username || 'Játékos'} profilképe`
        });
    }

    if (elements.username) {
        elements.username.textContent = player.username || 'Ismeretlen játékos';
    }

    if (elements.role) {
        const roleValue = String(player.role || 'player').toLowerCase();
        elements.role.textContent = roleValue === 'admin' ? 'Adminisztrátor' : 'Játékos';
        elements.role.classList.remove('admin');
        if (roleValue === 'admin') {
            elements.role.classList.add('admin');
        }
    }

    if (elements.joinedAt) {
        elements.joinedAt.textContent = formatDateTimeHuman(player.joinedAt);
    }

    if (elements.lastActiveAt) {
        elements.lastActiveAt.textContent = formatDateTimeHuman(player.lastActiveAt);
    }

    const eloClassic = toNumberSafe(player.elo);
    const eloMM = toNumberSafe(player.eloMM);
    const eloBullet = toNumberSafe(player.eloBullet);

    if (elements.eloClassic) {
        elements.eloClassic.textContent = formatNumberHu(eloClassic);
    }
    if (elements.eloMM) {
        elements.eloMM.textContent = formatNumberHu(eloMM);
    }
    if (elements.eloBullet) {
        elements.eloBullet.textContent = formatNumberHu(eloBullet);
    }

    applyRankBadge(elements.eloClassicRank, eloClassic);
    applyRankBadge(elements.eloMMRank, eloMM);
    applyRankBadge(elements.eloBulletRank, eloBullet);

    if (elements.wins) {
        elements.wins.textContent = formatNumberHu(player.wins);
    }
    if (elements.losses) {
        elements.losses.textContent = formatNumberHu(player.losses);
    }
    if (elements.draws) {
        elements.draws.textContent = formatNumberHu(player.draws);
    }
    if (elements.winRate) {
        elements.winRate.textContent = `${toNumberSafe(player.winRate).toFixed(2)}%`;
    }
}

async function fetchPlayerPublicProfile(userId) {
    const response = await fetch(`/api/players/${encodeURIComponent(userId)}/profile`);
    const result = await parseJson(response);

    if (!response.ok || !result.success) {
        throw new Error(result.message || 'Nem sikerült a játékos profil betöltése.');
    }

    return result.data || null;
}

async function openPlayerProfileModalByUserId(userId) {
    const elements = getPlayerProfileModalElements();
    if (!elements.modal) {
        throw new Error('A játékos profil modal nem található.');
    }

    const modalInstance = bootstrap.Modal.getOrCreateInstance(elements.modal);
    setPlayerProfileModalFeedback('Játékos adatok betöltése...', 'success');
    modalInstance.show();

    try {
        const playerData = await fetchPlayerPublicProfile(userId);
        fillPlayerProfileModal(playerData || {});
        setPlayerProfileModalFeedback('Profil adatok betöltve.', 'success');
        lucide.createIcons();
    } catch (error) {
        setPlayerProfileModalFeedback(error.message || 'Nem sikerült a játékos profil betöltése.', 'error');
        throw error;
    }
}

