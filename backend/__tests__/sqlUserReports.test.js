/**
 * sql/modules/userReports.js — pure helper-ek tesztjei (normalizalo fuggvenyek).
 */

const ur = require('../sql/modules/userReports.js');

describe('ALLOWED_CATEGORIES + STATUSES + RESOLUTIONS', () => {
    test('CATEGORIES tartalmazza a 6 standard kategoriat', () => {
        expect(Array.isArray(ur.ALLOWED_CATEGORIES)).toBe(true);
        for (const cat of ['cheating', 'toxicity', 'spam', 'harassment', 'unfair_play', 'other']) {
            expect(ur.ALLOWED_CATEGORIES).toContain(cat);
        }
    });

    test('STATUSES open / under_review / closed', () => {
        expect(Array.isArray(ur.ALLOWED_STATUSES)).toBe(true);
        for (const s of ['open', 'under_review', 'closed']) {
            expect(ur.ALLOWED_STATUSES).toContain(s);
        }
    });

    test('RESOLUTIONS none / dismissed / warned / banned', () => {
        expect(Array.isArray(ur.ALLOWED_RESOLUTIONS)).toBe(true);
        for (const r of ['none', 'dismissed', 'warned', 'banned']) {
            expect(ur.ALLOWED_RESOLUTIONS).toContain(r);
        }
    });

    test('CATEGORIES nem tartalmaz tipikus invalid ertekeket', () => {
        expect(ur.ALLOWED_CATEGORIES).not.toContain('hacking');
        expect(ur.ALLOWED_CATEGORIES).not.toContain('');
    });

    test('STATUSES nem tartalmaz invalid ertekeket', () => {
        expect(ur.ALLOWED_STATUSES).not.toContain('pending');
        expect(ur.ALLOWED_STATUSES).not.toContain('resolved');
    });
});

describe('createUserReport — input validacio (mocked pool)', () => {
    test('hianyzo reporter → throw', async () => {
        await expect(ur.createUserReport({ reporterUserId: 0, reportedUserId: 5, category: 'spam' }))
            .rejects.toThrow(/bejelento/);
    });

    test('hianyzo reported → throw', async () => {
        await expect(ur.createUserReport({ reporterUserId: 7, reportedUserId: 0, category: 'spam' }))
            .rejects.toThrow(/bejelentett/);
    });
});
