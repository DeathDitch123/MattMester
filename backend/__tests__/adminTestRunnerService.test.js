/**
 * api/admin/testRunnerService.js — admin panel teszt-futtato.
 */

jest.mock('../sql/modules/testRuns.js', () => ({
    insertTestRun: jest.fn(() => Promise.resolve({ insertId: 1 })),
    completeTestRun: jest.fn(() => Promise.resolve())
}));

jest.mock('child_process', () => ({
    spawn: jest.fn(() => ({
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn(),
        kill: jest.fn()
    }))
}));

const { isRunning, getCurrentRunMeta, isProductionDisabled } = require('../api/admin/testRunnerService.js');

describe('isRunning', () => {
    test('alapallapot: false', () => {
        expect(isRunning()).toBe(false);
    });
});

describe('getCurrentRunMeta', () => {
    test('nincs aktiv run → null', () => {
        expect(getCurrentRunMeta()).toBeNull();
    });
});

describe('isProductionDisabled', () => {
    const ORIG_NODE_ENV = process.env.NODE_ENV;
    const ORIG_ALLOW = process.env.ALLOW_ADMIN_TESTS;

    afterEach(() => {
        if (ORIG_NODE_ENV === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = ORIG_NODE_ENV;
        if (ORIG_ALLOW === undefined) delete process.env.ALLOW_ADMIN_TESTS;
        else process.env.ALLOW_ADMIN_TESTS = ORIG_ALLOW;
    });

    test('NODE_ENV != production → enabled (false)', () => {
        process.env.NODE_ENV = 'test';
        expect(isProductionDisabled()).toBe(false);
    });

    test('NODE_ENV = development → enabled', () => {
        process.env.NODE_ENV = 'development';
        expect(isProductionDisabled()).toBe(false);
    });

    test('NODE_ENV = production + ALLOW_ADMIN_TESTS=true → enabled', () => {
        process.env.NODE_ENV = 'production';
        process.env.ALLOW_ADMIN_TESTS = 'true';
        expect(isProductionDisabled()).toBe(false);
    });

    test('NODE_ENV = production + ALLOW_ADMIN_TESTS=false → DISABLED', () => {
        process.env.NODE_ENV = 'production';
        process.env.ALLOW_ADMIN_TESTS = 'false';
        expect(isProductionDisabled()).toBe(true);
    });

    test('NODE_ENV = production, ALLOW_ADMIN_TESTS hianyzik → DISABLED', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.ALLOW_ADMIN_TESTS;
        expect(isProductionDisabled()).toBe(true);
    });

    test('NODE_ENV uppercase tolerencia (PRODUCTION → production)', () => {
        process.env.NODE_ENV = 'PRODUCTION';
        process.env.ALLOW_ADMIN_TESTS = 'TRUE';
        // Az impl lowercase-eli mind az NODE_ENV-t, mind az ALLOW_-t
        expect(isProductionDisabled()).toBe(false);
    });
});
