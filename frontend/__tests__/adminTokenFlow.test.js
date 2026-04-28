// Frontend admin token flow unit tesztek (Node, jest).
// A shared/adminAuthFlow.js a forras-igazsag; itt mockolt deps mellett
// validaljuk a 3 kovetelt forgatokonyvet:
//   1) sikeres callRefresh frissiti az expiresAt-et,
//   2) 401 + ADMIN_NO_SESSION -> NO_SESSION ag (clear + redirect),
//   3) halozati / 5xx hiba -> token marad, refreshAdminToken success=false.

const { createAdminAuthFlow } = require('../javascript/shared/adminAuthFlow.js');

function buildDeps(overrides) {
    const calls = {
        clearAdminToken: 0,
        updateTokenPill: 0,
        showElevateModal: 0,
        showToasts: [],
        redirects: [],
        flashPills: 0
    };
    const state = {
        adminToken: 'test-token-1234567890',
        adminTokenExpiresAt: new Date('2026-04-29T10:00:00.000Z')
    };
    const deps = {
        state,
        fetchFn: jest.fn(),
        clearAdminToken: () => { calls.clearAdminToken += 1; state.adminToken = null; },
        updateTokenPill: () => { calls.updateTokenPill += 1; },
        showElevateModal: () => { calls.showElevateModal += 1; },
        showToast: (message, variant) => { calls.showToasts.push({ message, variant }); },
        redirect: (url) => { calls.redirects.push(url); },
        flashPill: () => { calls.flashPills += 1; }
    };
    return { deps: Object.assign(deps, overrides || {}), calls, state };
}

function jsonResponse(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body
    };
}

describe('adminAuthFlow.callRefresh', () => {
    test('sikeres refresh frissiti az expiresAt-et a state-en', async () => {
        const { deps, state } = buildDeps();
        const newExpiresAt = '2026-04-29T10:30:00.000Z';
        deps.fetchFn.mockResolvedValueOnce(jsonResponse(200, {
            success: true,
            code: 'ADMIN_TOKEN_REFRESHED',
            data: { expiresAt: newExpiresAt }
        }));

        const flow = createAdminAuthFlow(deps);
        const result = await flow.callRefresh();

        expect(result.success).toBe(true);
        expect(state.adminTokenExpiresAt.toISOString()).toBe(newExpiresAt);
        expect(deps.fetchFn).toHaveBeenCalledWith('/api/admin/auth/refresh', expect.objectContaining({
            method: 'POST',
            credentials: 'same-origin',
            headers: expect.objectContaining({
                Authorization: 'Bearer test-token-1234567890'
            })
        }));
    });

    test('hianyzo token eseten ADMIN_TOKEN_MISSING dobodik', async () => {
        const { deps } = buildDeps();
        deps.state.adminToken = null;
        const flow = createAdminAuthFlow(deps);

        await expect(flow.callRefresh()).rejects.toMatchObject({
            code: 'ADMIN_TOKEN_MISSING'
        });
        expect(deps.fetchFn).not.toHaveBeenCalled();
    });
});

describe('adminAuthFlow.refreshAdminToken — auth error agak', () => {
    test('401 + ADMIN_NO_SESSION -> clearAdminToken + redirect, success=false', async () => {
        const { deps, calls, state } = buildDeps();
        deps.fetchFn.mockResolvedValueOnce(jsonResponse(401, {
            success: false,
            code: 'ADMIN_NO_SESSION',
            message: 'Bejelentkezes szukseges.'
        }));

        const flow = createAdminAuthFlow(deps);
        const success = await flow.refreshAdminToken();

        expect(success).toBe(false);
        expect(calls.clearAdminToken).toBe(1);
        expect(state.adminToken).toBeNull();
        expect(calls.redirects).toEqual(['/']);
        expect(calls.showElevateModal).toBe(0); // NO_SESSION-nel NEM nyitunk elevate modalt
        const dangerToast = calls.showToasts.find((t) => t.variant === 'danger');
        expect(dangerToast).toBeTruthy();
    });

    test('401 + ADMIN_TOKEN_INVALID -> clearAdminToken + elevate modal, success=false', async () => {
        const { deps, calls, state } = buildDeps();
        deps.fetchFn.mockResolvedValueOnce(jsonResponse(401, {
            success: false,
            code: 'ADMIN_TOKEN_INVALID',
            message: 'Token lejart.'
        }));

        const flow = createAdminAuthFlow(deps);
        const success = await flow.refreshAdminToken();

        expect(success).toBe(false);
        expect(calls.clearAdminToken).toBe(1);
        expect(state.adminToken).toBeNull();
        expect(calls.showElevateModal).toBe(1);
        expect(calls.redirects).toEqual([]); // TOKEN_INVALID NEM redirectel
    });
});

describe('adminAuthFlow.refreshAdminToken — halozat / 5xx ag', () => {
    test('500-as valasz NEM zarja ki a tokent es success=false', async () => {
        const { deps, calls, state } = buildDeps();
        deps.fetchFn.mockResolvedValueOnce(jsonResponse(500, {
            success: false,
            message: 'Belso szerverhiba.'
        }));

        const flow = createAdminAuthFlow(deps);
        const success = await flow.refreshAdminToken();

        expect(success).toBe(false);
        expect(calls.clearAdminToken).toBe(0);
        expect(state.adminToken).toBe('test-token-1234567890');
        expect(calls.redirects).toEqual([]);
        expect(calls.showElevateModal).toBe(0);
        const warningToast = calls.showToasts.find((t) => t.variant === 'warning');
        expect(warningToast).toBeTruthy();
        expect(warningToast.message).toMatch(/Hálózati hiba/i);
    });

    test('fetch reject (network down) NEM zarja ki a tokent es success=false', async () => {
        const { deps, calls, state } = buildDeps();
        deps.fetchFn.mockRejectedValueOnce(new TypeError('Failed to fetch'));

        const flow = createAdminAuthFlow(deps);
        const success = await flow.refreshAdminToken();

        expect(success).toBe(false);
        expect(calls.clearAdminToken).toBe(0);
        expect(state.adminToken).toBe('test-token-1234567890');
        expect(calls.redirects).toEqual([]);
        expect(calls.showElevateModal).toBe(0);
        const warningToast = calls.showToasts.find((t) => t.variant === 'warning');
        expect(warningToast).toBeTruthy();
    });
});

describe('adminAuthFlow.adminAuthHeaders', () => {
    test('attacheli a Bearer tokent es osszevonja az extra headereket', () => {
        const { deps } = buildDeps();
        const flow = createAdminAuthFlow(deps);

        const headers = flow.adminAuthHeaders({ 'Content-Type': 'application/json' });

        expect(headers['Authorization']).toBe('Bearer test-token-1234567890');
        expect(headers['Content-Type']).toBe('application/json');
    });

    test('token nelkul nem ad Authorization headert', () => {
        const { deps } = buildDeps();
        deps.state.adminToken = null;
        const flow = createAdminAuthFlow(deps);

        const headers = flow.adminAuthHeaders();

        expect(headers['Authorization']).toBeUndefined();
    });
});

describe('adminAuthFlow.handleAdminAuthError', () => {
    test('ismeretlen kod -> false, nem nyul a state-hez', () => {
        const { deps, calls } = buildDeps();
        const flow = createAdminAuthFlow(deps);

        const handled = flow.handleAdminAuthError('SOMETHING_ELSE');

        expect(handled).toBe(false);
        expect(calls.clearAdminToken).toBe(0);
        expect(calls.redirects).toEqual([]);
        expect(calls.showElevateModal).toBe(0);
    });
});
