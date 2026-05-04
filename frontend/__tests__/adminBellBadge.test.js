/**
 * Admin felso harang ikon (bi-bell-fill) badge szam logika tesztek.
 *
 * A `refreshAdminBellBadge()` (12-liveUpdates.js) az aktiv (NEM elrejtett)
 * riasztasok szamat irja a `#adminBellBadge` span szovegere, es <=0 eseten
 * a Bootstrap `d-none` osztallyal eltunteti a piros pillulat. Ezzel a
 * felso navbar harang ikonjanak van ertelme: latod, ha van uj riasztas,
 * es kattintassal a Riasztasok oldalra ugrik.
 *
 * A tesztek a fuggveny valodi forraskodjat futtatjak (eval), es minimal
 * stub document.getElementById + state.liveAlerts kornyezetet adnak hozza —
 * ha holnap valaki atirja a logikat (pl. limit, max '99+'), az elrontott
 * ag rogton piros lesz.
 */

const path = require('path');
const fs = require('fs');

function loadRefreshAdminBellBadge() {
    // 12-liveUpdates.js sok mas sectionra is hat (dashboard, audit, alerts).
    // Minimal feltetelt allitunk be: state, document fake getElementById, es a
    // tobbi ot fuggvenyt no-op-ra mockoljuk, hogy a teljes fajl evalja.
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'javascript', 'adminPanel', '12-liveUpdates.js'),
        'utf8'
    );
    return code;
}

function setupSandbox(initialAlerts, badgeEl) {
    const sandbox = {
        state: { liveAlerts: initialAlerts || [], currentSectionId: null },
        document: {
            getElementById: (id) => (id === 'adminBellBadge' ? badgeEl : null)
        },
        // a tobbi 12-liveUpdates.js fuggveny no-op stub-ja
        liveStatsOrFallback: () => ({ online: {}, last24h: {}, pending: {}, rateLimit: {} }),
        setTextWithFlash: () => {},
        prependLiveFeedRow: () => {},
        liveFeedRow: () => '',
        showSection: () => {},
        applyDashboardLiveStats: () => {},
        maybeRefreshAdminUsersOnTick: () => {},
        formatRelative: () => '—'
    };
    return sandbox;
}

function makeBadgeEl() {
    const classes = new Set(['d-none']);
    return {
        textContent: '0',
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
            _classes: classes
        }
    };
}

function buildScopedRunner(code, sandbox) {
    // Az `eval` hozzaferest ad a sandbox-hoz, de a fajl belul `function`-okat
    // definial a globalis scope-ban — ezert egy IIFE-be csomagoljuk, ami a
    // sandbox-bol veszi a deps-eket es vissza is adja a `refreshAdminBellBadge`
    // referenciat. Igy nem szennyezzuk a teszt globalis allapotat.
    const wrappedCode = `
        (function (state, document, liveStatsOrFallback, setTextWithFlash,
                   prependLiveFeedRow, liveFeedRow, showSection,
                   applyDashboardLiveStats, maybeRefreshAdminUsersOnTick,
                   formatRelative) {
            ${code}
            return { refreshAdminBellBadge };
        })
    `;
    // eslint-disable-next-line no-eval
    const factory = eval(wrappedCode);
    return factory(
        sandbox.state,
        sandbox.document,
        sandbox.liveStatsOrFallback,
        sandbox.setTextWithFlash,
        sandbox.prependLiveFeedRow,
        sandbox.liveFeedRow,
        sandbox.showSection,
        sandbox.applyDashboardLiveStats,
        sandbox.maybeRefreshAdminUsersOnTick,
        sandbox.formatRelative
    );
}

describe('refreshAdminBellBadge', () => {
    const code = loadRefreshAdminBellBadge();

    test('nincs riasztas (ures lista) → badge `d-none`, szoveg "0"', () => {
        const badge = makeBadgeEl();
        const sandbox = setupSandbox([], badge);
        const { refreshAdminBellBadge } = buildScopedRunner(code, sandbox);

        refreshAdminBellBadge();

        expect(badge.classList.contains('d-none')).toBe(true);
        expect(badge.textContent).toBe('0');
    });

    test('csak elrejtett riasztasok → szinten d-none', () => {
        const badge = makeBadgeEl();
        const sandbox = setupSandbox([
            { id: 1, dismissedAt: '2026-05-01T10:00:00Z' },
            { id: 2, dismissedAt: '2026-05-02T11:00:00Z' }
        ], badge);
        const { refreshAdminBellBadge } = buildScopedRunner(code, sandbox);

        refreshAdminBellBadge();

        expect(badge.classList.contains('d-none')).toBe(true);
        expect(badge.textContent).toBe('0');
    });

    test('3 aktiv riasztas → badge lathato es "3"', () => {
        const badge = makeBadgeEl();
        const sandbox = setupSandbox([
            { id: 1, dismissedAt: null },
            { id: 2, dismissedAt: null },
            { id: 3, dismissedAt: null }
        ], badge);
        const { refreshAdminBellBadge } = buildScopedRunner(code, sandbox);

        refreshAdminBellBadge();

        expect(badge.classList.contains('d-none')).toBe(false);
        expect(badge.textContent).toBe('3');
    });

    test('vegyes lista — csak az aktivakat szamoljuk', () => {
        const badge = makeBadgeEl();
        const sandbox = setupSandbox([
            { id: 1, dismissedAt: null },
            { id: 2, dismissedAt: '2026-05-01T10:00:00Z' },
            { id: 3, dismissedAt: null },
            { id: 4, dismissedAt: '2026-05-02T11:00:00Z' }
        ], badge);
        const { refreshAdminBellBadge } = buildScopedRunner(code, sandbox);

        refreshAdminBellBadge();

        expect(badge.classList.contains('d-none')).toBe(false);
        expect(badge.textContent).toBe('2');
    });

    test('100+ aktiv riasztas → "99+" tunik fel (overflow guard)', () => {
        const badge = makeBadgeEl();
        const alerts = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, dismissedAt: null }));
        const sandbox = setupSandbox(alerts, badge);
        const { refreshAdminBellBadge } = buildScopedRunner(code, sandbox);

        refreshAdminBellBadge();

        expect(badge.classList.contains('d-none')).toBe(false);
        expect(badge.textContent).toBe('99+');
    });

    test('hianyzo DOM elem (badge nincs) → no-op, nincs hiba', () => {
        const sandbox = setupSandbox([{ id: 1, dismissedAt: null }], null);
        const { refreshAdminBellBadge } = buildScopedRunner(code, sandbox);

        // Nem dobhat ha a badge element nincs (pl. a oldal meg nem renderelt)
        expect(() => refreshAdminBellBadge()).not.toThrow();
    });

    test('null/undefined elem mezok a riasztasokban — nem dob ki', () => {
        const badge = makeBadgeEl();
        const sandbox = setupSandbox([
            { id: 1 }, // nincs dismissedAt
            { id: 2, dismissedAt: undefined },
            { id: 3, dismissedAt: null }
        ], badge);
        const { refreshAdminBellBadge } = buildScopedRunner(code, sandbox);

        refreshAdminBellBadge();
        expect(badge.textContent).toBe('3');
    });
});
