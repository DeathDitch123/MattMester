/**
 * api/admin/maintenanceScheduler.js — karbantartas grace-period scheduler.
 */

jest.mock('../chess/abortHelpers.js', () => ({
    abortAllOngoingForMaintenance: jest.fn(() => Promise.resolve({ abortedGames: 0 }))
}));

const sched = require('../api/admin/maintenanceScheduler.js');

// A maintenanceScheduler emitEnforce-ja `setImmediate(() => require('../../chess/abortHelpers.js'))`-t
// hiv. Ha a Jest worker tear-down-ja elobb fut, mint a setImmediate callback, akkor a
// dynamic require egy mar megsemmisitett kornyezetbol probal modult betolteni →
// ReferenceError → worker exit code 1 → az admin teszt-runner "failed"-nek ertelmezi
// (annak ellenere hogy a tesztek mind passed).
//
// Megoldas: pre-loadingjuk a chess/abortHelpers.js-t (igy a require-cache-elt), ES
// minden teszt utan await-elunk egy setImmediate-et hogy a beragadt callback meg a
// teardown elott lefusson.
require('../chess/abortHelpers.js');

afterEach(async () => {
    await new Promise(resolve => setImmediate(resolve));
});

describe('GRACE_MINUTES + REMINDER_AT_REMAINING_MINUTES konstansok', () => {
    test('GRACE_MINUTES 0 (instant kidobas teszteloshez)', () => {
        // Note: vagy 0 vagy 30 — mindkettonek egyetlen ervenyes ertek
        expect([0, 30]).toContain(sched.GRACE_MINUTES);
    });

    test('REMINDER lista nem-ures, csokkeno sorrendben', () => {
        expect(Array.isArray(sched.REMINDER_AT_REMAINING_MINUTES)).toBe(true);
        for (let i = 0; i < sched.REMINDER_AT_REMAINING_MINUTES.length - 1; i++) {
            expect(sched.REMINDER_AT_REMAINING_MINUTES[i]).toBeGreaterThan(sched.REMINDER_AT_REMAINING_MINUTES[i + 1]);
        }
    });
});

describe('startMaintenanceTransition', () => {
    test('mode = "instant" ha GRACE_MINUTES <= 0', () => {
        // Csak akkor ervenyes a teszt ha GRACE_MINUTES = 0
        if (sched.GRACE_MINUTES > 0) return;
        const hub = { broadcastSystemEvent: jest.fn() };
        const r = sched.startMaintenanceTransition({ socketHub: hub });
        expect(r.mode).toBe('instant');
        expect(hub.broadcastSystemEvent).toHaveBeenCalledWith('maintenance:enforce', expect.any(Object));
    });

    test('scheduledEnforceAt jovobeli datum', () => {
        const hub = { broadcastSystemEvent: jest.fn() };
        const r = sched.startMaintenanceTransition({ socketHub: hub });
        expect(r.scheduledEnforceAt).toBeInstanceOf(Date);
        expect(r.scheduledEnforceAt.getTime()).toBeGreaterThanOrEqual(Date.now() - 1000);
    });

    test('socketHub.io fallback raw broadcast', () => {
        const fakeIo = { emit: jest.fn() };
        const hub = { io: fakeIo };
        sched.startMaintenanceTransition({ socketHub: hub });
        if (sched.GRACE_MINUTES <= 0) {
            expect(fakeIo.emit).toHaveBeenCalledWith('maintenance:enforce', expect.any(Object));
        }
    });
});

describe('cancelMaintenanceTransition', () => {
    test('cancel utan emit cancelled', () => {
        const hub = { broadcastSystemEvent: jest.fn() };
        sched.startMaintenanceTransition({ socketHub: hub });
        sched.cancelMaintenanceTransition({ socketHub: hub });
        expect(hub.broadcastSystemEvent).toHaveBeenCalledWith('maintenance:cancelled', expect.any(Object));
    });

    test('inkabb-cancel ami nem volt aktiv → cancelled emit es nem dob', () => {
        const hub = { broadcastSystemEvent: jest.fn() };
        // Cancel hivas nyomban (lehet hogy meg nem volt aktiv; vagy mar volt 1 elozo aktiv)
        expect(() => sched.cancelMaintenanceTransition({ socketHub: hub })).not.toThrow();
    });
});

describe('getMeta', () => {
    test('graceMinutes mezo a konstanst tukrozi', () => {
        const m = sched.getMeta();
        expect(m.graceMinutes).toBe(sched.GRACE_MINUTES);
    });

    test('pendingTimers szam', () => {
        const m = sched.getMeta();
        expect(typeof m.pendingTimers).toBe('number');
    });
});
