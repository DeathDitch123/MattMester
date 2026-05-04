function getProfileImageStatusMeta(statusInput) {
    const normalizedStatus = String(statusInput || '').trim().toLowerCase() || 'approved';
    let meta = {
        normalizedStatus: 'approved',
        textClass: 'text-success',
        label: tx('Jóváhagyott', 'Approved'),
        helpText: ''
    };

    if (normalizedStatus === 'pending') {
        meta = {
            normalizedStatus,
            textClass: 'text-warning',
            label: tx('Függő (elbírálásra vár)', 'Pending (awaiting review)'),
            helpText: tx('Csak te látod ezt a képet. Mások az alapértelmezett képet látják jóváhagyásig.', 'Only you can see this image. Others see the default image until approval.')
        };
    } else if (normalizedStatus === 'rejected') {
        meta = {
            normalizedStatus,
            textClass: 'text-danger',
            label: tx('Elutasított', 'Rejected'),
            helpText: tx('A kép elutasításra került, a publikus profilkép visszaállt az alapértelmezettre.', 'The image was rejected, the public profile picture has reverted to the default.')
        };
    } else if (normalizedStatus === 'default') {
        meta = {
            normalizedStatus,
            textClass: 'text-info',
            label: tx('Alapértelmezett', 'Default'),
            helpText: ''
        };
    }

    return meta;
}

function applyProfileImagePresentation(user) {
    const username = user?.username || tx('Felhasznalo', 'User');
    const statusMeta = getProfileImageStatusMeta(user?.profile_image_status);

    const avatars = [
        document.getElementById('profileAvatarDashboard'),
        document.getElementById('profileAvatarSettings')
    ].filter(Boolean);

    let viewModel = null;
    avatars.forEach((avatarElement) => {
        const applied = window.MattMesterProfileImage.applyProfileImagePresentation(avatarElement, {
            source: user,
            alt: `${username} ${tx('profilkepe', 'profile picture')}`
        });
        if (applied) {
            viewModel = applied;
        }
    });

    if (!viewModel) {
        viewModel = window.MattMesterProfileImage.buildProfileImageViewModel(user);
    }

    const statusElements = [
        document.getElementById('profileImageHeaderStatus'),
        document.getElementById('profileImageSettingsStatus')
    ].filter(Boolean);

    statusElements.forEach((statusElement) => {
        statusElement.classList.remove('text-secondary', 'text-success', 'text-warning', 'text-danger', 'text-info');
        statusElement.classList.add(statusMeta.textClass);
        const baseText = `${tx('Profilkép státusz:', 'Profile picture status:')} ${statusMeta.label}`;
        statusElement.textContent = statusMeta.helpText
            ? `${baseText} — ${statusMeta.helpText}`
            : baseText;
    });

    const removeButton = document.getElementById('removeAvatarButton');
    if (removeButton) {
        removeButton.disabled = viewModel.isDefault;
        removeButton.title = viewModel.isDefault ? tx('Nem lehet eltávolítani az alapértelmezett képet', 'Cannot remove the default image') : tx('Profilkép eltávolítása', 'Remove profile picture');
    }
}

function showStats(sessionInfo) {
    try {
        const user = sessionInfo?.user || sessionInfo?.data?.user || null;
        if (!user) {
            throw new Error(tx('Nincs bejelentkezett felhasznalo a statok megjelenitesehez.', 'No logged-in user to display stats for.'));
        }

        const stats = user.stats || sessionInfo?.stats || {
            wins: user.wins,
            losses: user.losses,
            draws: user.draws
        };
        const username = user.username || tx('Ismeretlen jatekos', 'Unknown player');
        const email = user.email || '';
        const role = user.role || 'player';
        const roleText = role.charAt(0).toUpperCase() + role.slice(1);

        const toNumber = (value) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        };

        const wins = toNumber(stats.wins);
        const losses = toNumber(stats.losses);
        const draws = toNumber(stats.draws);
        const gamesPlayed = wins + losses + draws;
        const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;

        const formatNumber = (value) => toNumber(value).toLocaleString('hu-HU');
        const rankClasses = ['rank-beginner', 'rank-intermediate', 'rank-advanced', 'rank-expert', 'rank-master', 'rank-grandmaster'];
        const roleBadgeClasses = ['admin', 'badge-custom', 'badge-admin', 'badge-player'];
        const statBadgeClasses = ['badge-custom', 'badge-win', 'badge-loss', 'badge-draw', 'badge-ongoing'];

        const profileName = document.querySelector('.profile-header h1.h3');
        if (profileName) {
            profileName.textContent = username;
        }

        const profileEmail = document.querySelector('.profile-header p.text-secondary');
        if (profileEmail) {
            profileEmail.textContent = email;
        }

        const roleBadge = document.querySelector('.profile-header .role-badge');
        if (roleBadge) {
            roleBadge.textContent = roleText;
            roleBadge.classList.remove(...roleBadgeClasses);
            if (role === 'admin') {
                roleBadge.classList.add('admin', 'badge-custom', 'badge-admin');
            } else {
                roleBadge.classList.add('badge-custom', 'badge-player');
            }
        }

        applyProfileImagePresentation(user);

        const eloNumbers = document.querySelectorAll('.elo-display .elo-number');
        const eloRanks = document.querySelectorAll('.elo-display .elo-rank');
        const eloValues = [user.elo, user.elo_MM, user.elo_bullet];

        if (eloNumbers[0]) {
            eloNumbers[0].textContent = formatNumber(user.elo);
        }
        if (eloNumbers[1]) {
            eloNumbers[1].textContent = formatNumber(user.elo_MM);
        }
        if (eloNumbers[2]) {
            eloNumbers[2].textContent = formatNumber(user.elo_bullet);
        }

        eloValues.forEach((eloValue, index) => {
            const rankElement = eloRanks[index];
            if (rankElement) {
                const rank = getRankForEloValue(toNumber(eloValue));
                rankElement.classList.remove(...rankClasses);
                rankElement.classList.add(rank.className);
                rankElement.textContent = rank.label;
            }
        });

        const statValues = document.querySelectorAll('.stat-card .stat-value');
        const statLabels = document.querySelectorAll('.stat-card .stat-label');
        if (statValues[0]) {
            statValues[0].textContent = formatNumber(wins);
        }
        if (statValues[1]) {
            statValues[1].textContent = formatNumber(losses);
        }
        if (statValues[2]) {
            statValues[2].textContent = formatNumber(draws);
        }
        if (statValues[3]) {
            statValues[3].textContent = `${winRate}%`;
        }

        if (statLabels[0]) {
            statLabels[0].classList.remove(...statBadgeClasses);
            statLabels[0].classList.add('badge-custom', 'badge-win');
        }
        if (statLabels[1]) {
            statLabels[1].classList.remove(...statBadgeClasses);
            statLabels[1].classList.add('badge-custom', 'badge-loss');
        }
        if (statLabels[2]) {
            statLabels[2].classList.remove(...statBadgeClasses);
            statLabels[2].classList.add('badge-custom', 'badge-draw');
        }
        if (statLabels[3]) {
            statLabels[3].classList.remove(...statBadgeClasses);
            statLabels[3].classList.add('badge-custom', 'badge-ongoing');
        }
    } catch (error) {
        throw new Error(`showStats hiba: ${error.message}`);
    }
}

