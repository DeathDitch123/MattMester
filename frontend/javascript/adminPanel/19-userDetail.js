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

    if (!v.username) errors.username = tx('Kötelező mező.', 'Required field.');
    else if (!ADMIN_USERNAME_REGEX.test(v.username)) errors.username = tx('3–20 karakter, betű/szám/_.-', '3–20 chars, letters/digits/_.-');

    if (!v.email) errors.email = tx('Kötelező mező.', 'Required field.');
    else if (!ADMIN_EMAIL_REGEX.test(v.email)) errors.email = tx('Érvénytelen e-mail formátum.', 'Invalid e-mail format.');

    const eloFields = ['eloClassic', 'eloMM', 'eloBullet'];
    for (const k of eloFields) {
        if (!Number.isFinite(v[k])) errors[k] = tx('Számot kell megadni.', 'A number is required.');
        else if (v[k] < 0 || v[k] > 9999) errors[k] = tx('0 – 9999 között.', 'Between 0 – 9999.');
        else if (!Number.isInteger(v[k])) errors[k] = tx('Egész szám.', 'Integer.');
    }
    const statFields = ['wins', 'losses', 'draws', 'abilitiesUsed'];
    for (const k of statFields) {
        if (!Number.isFinite(v[k])) errors[k] = tx('Számot kell megadni.', 'A number is required.');
        else if (v[k] < 0 || !Number.isInteger(v[k])) errors[k] = tx('Nem-negatív egész szám.', 'Non-negative integer.');
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
            setAdminEditFieldFeedback(input, fbId, 'valid', tx(`Módosul (${fromTo}).`, `Changes (${fromTo}).`));
        } else {
            setAdminEditFieldFeedback(input, fbId, 'neutral', formatOk || tx('Nincs változás.', 'No change.'));
        }
    };

    fb('editUsername', 'editUsernameFeedback', 'username', tx('Nincs változás.', 'No change.'));
    fb('editEmail', 'editEmailFeedback', 'email', tx('Nincs változás.', 'No change.'));
    setAdminEditFieldFeedback('editRole', 'editRoleFeedback',
        changed.role ? 'valid' : 'neutral',
        changed.role ? tx(`Új szerepkör: ${v.role}`, `New role: ${v.role}`) : tx('Nincs változás.', 'No change.'));
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
            verifiedFb.textContent = tx(`Módosul: ${v.emailVerified ? 'megerősített' : 'nem megerősített'}`, `Changes: ${v.emailVerified ? 'verified' : 'not verified'}`);
        } else {
            verifiedFb.className = 'text-secondary';
            verifiedFb.textContent = tx('Közvetlenül átállítható.', 'Can be toggled directly.');
        }
    }

    // Reason
    if (!anyChange) {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'neutral', tx('Először módosíts legalább egy mezőt.', 'Modify at least one field first.'));
    } else if (v.reason.length === 0) {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'invalid', tx('Az indok kötelező, ha van változás.', 'Reason is required when there are changes.'));
    } else if (v.reason.length < 10) {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'invalid', tx(`Még ${10 - v.reason.length} karakter szükséges.`, `${10 - v.reason.length} more character(s) needed.`));
    } else if (v.reason.length > 1000) {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'invalid', tx('Maximum 1000 karakter.', 'Maximum 1000 characters.'));
    } else {
        setAdminEditFieldFeedback('editReason', 'editReasonFeedback', 'valid', tx('Megfelelő indok.', 'Valid reason.'));
    }

    // Változások listája + összegző alert
    const labelsMap = {
        username: tx('Felhasználónév', 'Username'),
        email: tx('E-mail', 'E-mail'),
        role: tx('Szerepkör', 'Role'),
        emailVerified: tx('Email megerősítve', 'Email verified'),
        eloClassic: tx('ELO klasszikus', 'ELO classic'),
        eloMM: tx('ELO MattMester', 'ELO MattMester'),
        eloBullet: tx('ELO bullet', 'ELO bullet'),
        wins: tx('Győzelmek', 'Wins'),
        losses: tx('Vereségek', 'Losses'),
        draws: tx('Döntetlenek', 'Draws'),
        abilitiesUsed: tx('Képességek', 'Abilities')
    };
    const fmt = (key, val) => {
        if (key === 'emailVerified') return val ? tx('igen', 'yes') : tx('nem', 'no');
        return String(val);
    };
    const changesList = document.getElementById('adminUserDetailChangesList');
    if (changesList) {
        const items = Object.keys(labelsMap)
            .filter((k) => changed[k])
            .map((k) => `<li><strong>${labelsMap[k]}</strong>: <span class="text-secondary">${escapeHtml(fmt(k, initial[k]))}</span> → <span class="text-gold">${escapeHtml(fmt(k, v[k]))}</span></li>`);
        changesList.innerHTML = items.length
            ? items.join('')
            : `<li class="text-secondary small">${tx('Még nincs változás.', 'No changes yet.')}</li>`;
    }

    const summary = document.getElementById('adminSavePackMessage');
    if (summary) {
        summary.classList.remove('alert-dark', 'alert-warning', 'alert-danger', 'alert-success');
        if (hasErrors) {
            summary.classList.add('alert-danger');
            summary.textContent = tx('Egy vagy több mezőben formátumhiba van. Javítsd ki őket a mentéshez.', 'One or more fields contain format errors. Fix them to save.');
        } else if (!anyChange) {
            summary.classList.add('alert-dark');
            summary.textContent = tx('Nincs változás. Módosíts legalább egy mezőt a mentéshez.', 'No changes. Modify at least one field to save.');
        } else if (!reasonValid) {
            summary.classList.add('alert-warning');
            summary.textContent = tx('Add meg az indokot (10–1000 karakter) a mentéshez.', 'Provide the reason (10–1000 characters) to save.');
        } else {
            const count = Object.values(changed).filter(Boolean).length;
            summary.classList.add('alert-success');
            summary.textContent = tx(`${count} mező módosul — mentésre kész.`, `${count} field(s) will change — ready to save.`);
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

