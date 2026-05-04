/* =============================================================
   Admin user detail — change tracking + format validation.
   A profil oldal validateProfileSettingsForm() mintáját követi:
   - snapshot az eredeti értékekről render-kor
   - minden inputon diff-et számolunk vs. baseline
   - per-mező visszajelzés: VÁLTOZOTT+érvényes → zöld, formátumhiba → piros,
     változatlan → semleges
   - mentés gomb csak akkor enabled, ha legalább 1 valós változás van,
     nincs formátumhiba, és az indok ≥ 10 karakter
   ============================================================= */
const ADMIN_USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,20}$/;
const ADMIN_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const adminUserDetailFormState = {
    initial: null
};

function setAdminEditFieldFeedback(inputId, feedbackId, state, message) {
    const input = document.getElementById(inputId);
    const feedback = document.getElementById(feedbackId);
    if (!input) return;

    input.classList.remove('is-valid', 'is-invalid');
    if (feedback) feedback.classList.remove('text-valid', 'text-invalid', 'text-secondary');

    if (state === 'valid') {
        input.classList.add('is-valid');
        if (feedback) {
            feedback.classList.add('text-valid');
            feedback.textContent = message || '';
        }
    } else if (state === 'invalid') {
        input.classList.add('is-invalid');
        if (feedback) {
            feedback.classList.add('text-invalid');
            feedback.textContent = message || '';
        }
    } else if (feedback) {
        feedback.classList.add('text-secondary');
        feedback.textContent = message || '';
    }
}

function snapshotAdminUserDetailInitial(u) {
    return {
        username: String(u.username || ''),
        email: String(u.email || ''),
        role: u.role === 'admin' ? 'admin' : 'player',
        emailVerified: Boolean(u.emailVerified),
        eloClassic: Number(u.elo || 0),
        eloMM: Number(u.eloMM || 0),
        eloBullet: Number(u.eloBullet || 0),
        wins: Number(u.wins || 0),
        losses: Number(u.losses || 0),
        draws: Number(u.draws || 0),
        abilitiesUsed: Number(u.totalAbilities || 0)
    };
}

function readAdminUserDetailValues() {
    const v = (id) => (document.getElementById(id)?.value ?? '').trim();
    const n = (id) => {
        const raw = v(id);
        if (raw === '') return NaN;
        const num = Number(raw);
        return Number.isFinite(num) ? num : NaN;
    };
    return {
        username: v('editUsername'),
        email: v('editEmail'),
        role: v('editRole'),
        emailVerified: Boolean(document.getElementById('editEmailVerified')?.checked),
        eloClassic: n('editEloClassic'),
        eloMM: n('editEloMM'),
        eloBullet: n('editEloBullet'),
        wins: n('editWins'),
        losses: n('editLosses'),
        draws: n('editDraws'),
        abilitiesUsed: n('editAbilitiesUsed'),
        reason: v('editReason')
    };
}

function validateAdminUserDetailForm() {
    const initial = adminUserDetailFormState.initial;
    if (!initial) return { canSave: false, anyChange: false, hasErrors: true };

    const v = readAdminUserDetailValues();
    const errors = {};

    if (!v.username) errors.username = 'Kötelező mező.';
    else if (!ADMIN_USERNAME_REGEX.test(v.username)) errors.username = '3–20 karakter, betű/szám/_.-';

    if (!v.email) errors.email = 'Kötelező mező.';
    else if (!ADMIN_EMAIL_REGEX.test(v.email)) errors.email = 'Érvénytelen e-mail formátum.';

    const eloFields = ['eloClassic', 'eloMM', 'eloBullet'];
    for (const k of eloFields) {
        if (!Number.isFinite(v[k])) errors[k] = 'Számot kell megadni.';
        else if (v[k] < 0 || v[k] > 9999) errors[k] = '0 – 9999 között.';
        else if (!Number.isInteger(v[k])) errors[k] = 'Egész szám.';
    }
    const statFields = ['wins', 'losses', 'draws', 'abilitiesUsed'];
    for (const k of statFields) {
        if (!Number.isFinite(v[k])) errors[k] = 'Számot kell megadni.';
        else if (v[k] < 0 || !Number.isInteger(v[k])) errors[k] = 'Nem-negatív egész szám.';
    }

    const changed = {};
    for (const k of Object.keys(initial)) {
        changed[k] = v[k] !== initial[k];
    }
    const anyChange = Object.values(changed).some(Boolean);
    const hasErrors = Object.keys(errors).length > 0;
    const reasonValid = v.reason.length >= 10 && v.reason.length <= 1000;
    const canSave = anyChange && !hasErrors && reasonValid;

    // Per-mező visszajelzés
    const fb = (input, fbId, key, formatOk) => {
        if (errors[key]) {
            setAdminEditFieldFeedback(input, fbId, 'invalid', errors[key]);
        } else if (changed[key]) {
            const fromTo = `${initial[key]} → ${v[key]}`;
            setAdminEditFieldFeedback(input, fbId, 'valid', `Módosul (${fromTo}).`);
        } else {
            setAdminEditFieldFeedback(input, fbId, 'neutral', formatOk || 'Nincs változás.');
        }
    };

    fb('editUsername', 'editUsernameFeedback', 'username', 'Nincs változás.');
    fb('editEmail', 'editEmailFeedback', 'email', 'Nincs változás.');
    setAdminEditFieldFeedback('editRole', 'editRoleFeedback',
        changed.role ? 'valid' : 'neutral',
        changed.role ? `Új szerepkör: ${v.role}` : 'Nincs változás.');
    fb('editEloClassic', 'editEloClassicFeedback', 'eloClassic');
    fb('editEloMM', 'editEloMMFeedback', 'eloMM');
    fb('editEloBullet', 'editEloBulletFeedback', 'eloBullet');
    fb('editWins', 'editWinsFeedback', 'wins');
    fb('editLosses', 'editLossesFeedback', 'losses');
    fb('editDraws', 'editDrawsFeedback', 'draws');
    fb('editAbilitiesUsed', 'editAbilitiesUsedFeedback', 'abilitiesUsed');

    // Email verified switch — szöveges jelzés a kapcsoló mellett
    const verifiedFb = document.getElementById('editEmailVerifiedFeedback');
    if (verifiedFb) {
        if (changed.emailVerified) {
            verifiedFb.className = 'small text-valid';
            verifiedFb.textContent = `Módosul: ${v.emailVerified ? 'megerősített' : 'nem megerősített'}`;
        } else {
            verifiedFb.className = 'text-secondary';
            verifiedFb.textContent = 'Közvetlenül átállítható.';
        }
    }

    // Reason
    if (!anyChange) {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'neutral', 'Először módosíts legalább egy mezőt.');
    } else if (v.reason.length === 0) {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'invalid', 'Az indok kötelező, ha van változás.');
    } else if (v.reason.length < 10) {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'invalid', `Még ${10 - v.reason.length} karakter szükséges.`);
    } else if (v.reason.length > 1000) {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'invalid', 'Maximum 1000 karakter.');
    } else {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'valid', 'Megfelelő indok.');
    }

    // Változások listája + összegző alert
    const labelsMap = {
        username: 'Felhasználónév',
        email: 'E-mail',
        role: 'Szerepkör',
        emailVerified: 'Email megerősítve',
        eloClassic: 'ELO klasszikus',
        eloMM: 'ELO MattMester',
        eloBullet: 'ELO bullet',
        wins: 'Győzelmek',
        losses: 'Vereségek',
        draws: 'Döntetlenek',
        abilitiesUsed: 'Képességek'
    };
    const fmt = (key, val) => {
        if (key === 'emailVerified') return val ? 'igen' : 'nem';
        return String(val);
    };
    const changesList = document.getElementById('adminUserDetailChangesList');
    if (changesList) {
        const items = Object.keys(labelsMap)
            .filter((k) => changed[k])
            .map((k) => `<li><strong>${labelsMap[k]}</strong>: <span class="text-secondary">${escapeHtml(fmt(k, initial[k]))}</span> → <span class="text-gold">${escapeHtml(fmt(k, v[k]))}</span></li>`);
        changesList.innerHTML = items.length
            ? items.join('')
            : '<li class="text-secondary small">Még nincs változás.</li>';
    }

    const summary = document.getElementById('adminSavePackMessage');
    if (summary) {
        summary.classList.remove('alert-dark', 'alert-warning', 'alert-danger', 'alert-success');
        if (hasErrors) {
            summary.classList.add('alert-danger');
            summary.textContent = 'Egy vagy több mezőben formátumhiba van. Javítsd ki őket a mentéshez.';
        } else if (!anyChange) {
            summary.classList.add('alert-dark');
            summary.textContent = 'Nincs változás. Módosíts legalább egy mezőt a mentéshez.';
        } else if (!reasonValid) {
            summary.classList.add('alert-warning');
            summary.textContent = 'Add meg az indokot (10–1000 karakter) a mentéshez.';
        } else {
            const count = Object.values(changed).filter(Boolean).length;
            summary.classList.add('alert-success');
            summary.textContent = `${count} mező módosul — mentésre kész.`;
        }
    }

    const saveBtn = document.getElementById('adminUserDetailSaveBtn');
    if (saveBtn) saveBtn.disabled = !canSave;

    return { canSave, anyChange, hasErrors };
}

function bindAdminUserDetailValidation() {
    try {
        const u = state.selectedUser;
        if (u) adminUserDetailFormState.initial = snapshotAdminUserDetailInitial(u);

        const ids = [
            'editUsername', 'editEmail', 'editRole', 'editEmailVerified',
            'editEloClassic', 'editEloMM', 'editEloBullet',
            'editWins', 'editLosses', 'editDraws', 'editAbilitiesUsed',
            'editReason'
        ];
        for (const id of ids) {
            const el = document.getElementById(id);
            if (!el || el.dataset.adminValidationBound === '1') continue;
            el.dataset.adminValidationBound = '1';
            const handler = () => validateAdminUserDetailForm();
            el.addEventListener('input', handler);
            el.addEventListener('change', handler);
        }
        // Inicializáló futtatás — felépíti a "nincs változás" állapotot
        validateAdminUserDetailForm();
    } catch (err) {
        console.warn('bindAdminUserDetailValidation hiba:', err);
    }
}

