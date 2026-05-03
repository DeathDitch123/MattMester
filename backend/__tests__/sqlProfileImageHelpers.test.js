/**
 * sql/modules/profileImage.js — pure helpers (path-validacio + visibility) tesztjei.
 */

jest.mock('../sql/database.js', () => ({
    getPool: jest.fn()
}));

const {
    DEFAULT_PROFILE_IMAGE_PATH,
    ALLOWED_PROFILE_IMAGE_EXTENSIONS,
    isAllowedProfileImagePath,
    applyProfileImageVisibility
} = require('../sql/modules/profileImage.js');

describe('DEFAULT_PROFILE_IMAGE_PATH konstans', () => {
    test('konstans erteke', () => {
        expect(DEFAULT_PROFILE_IMAGE_PATH).toBe('/profile_pictures/default.png');
    });
});

describe('ALLOWED_PROFILE_IMAGE_EXTENSIONS', () => {
    test('Set 4 elem-mel', () => {
        expect(ALLOWED_PROFILE_IMAGE_EXTENSIONS instanceof Set).toBe(true);
        expect(ALLOWED_PROFILE_IMAGE_EXTENSIONS.has('.jpg')).toBe(true);
        expect(ALLOWED_PROFILE_IMAGE_EXTENSIONS.has('.jpeg')).toBe(true);
        expect(ALLOWED_PROFILE_IMAGE_EXTENSIONS.has('.png')).toBe(true);
        expect(ALLOWED_PROFILE_IMAGE_EXTENSIONS.has('.webp')).toBe(true);
    });

    test('NEM tartalmaz veszelyes extension-t', () => {
        expect(ALLOWED_PROFILE_IMAGE_EXTENSIONS.has('.svg')).toBe(false);
        expect(ALLOWED_PROFILE_IMAGE_EXTENSIONS.has('.exe')).toBe(false);
        expect(ALLOWED_PROFILE_IMAGE_EXTENSIONS.has('.html')).toBe(false);
        expect(ALLOWED_PROFILE_IMAGE_EXTENSIONS.has('.js')).toBe(false);
    });
});

describe('isAllowedProfileImagePath — path traversal vedelem', () => {
    test('ervenyes path-ok', () => {
        expect(isAllowedProfileImagePath('/profile_pictures/abc.png')).toBe(true);
        expect(isAllowedProfileImagePath('/profile_pictures/foo.jpg')).toBe(true);
        expect(isAllowedProfileImagePath('/profile_pictures/x.jpeg')).toBe(true);
        expect(isAllowedProfileImagePath('/profile_pictures/x.webp')).toBe(true);
    });

    test('rossz prefix → false', () => {
        expect(isAllowedProfileImagePath('/uploads/abc.png')).toBe(false);
        expect(isAllowedProfileImagePath('/abc.png')).toBe(false);
        expect(isAllowedProfileImagePath('profile_pictures/abc.png')).toBe(false);
    });

    test('path traversal "../" → false', () => {
        expect(isAllowedProfileImagePath('/profile_pictures/../etc/passwd.png')).toBe(false);
        expect(isAllowedProfileImagePath('/profile_pictures/..something.png')).toBe(false);
    });

    test('rossz extension → false', () => {
        expect(isAllowedProfileImagePath('/profile_pictures/abc.svg')).toBe(false);
        expect(isAllowedProfileImagePath('/profile_pictures/abc.exe')).toBe(false);
        expect(isAllowedProfileImagePath('/profile_pictures/abc.php')).toBe(false);
    });

    test('extension nelkul → false', () => {
        expect(isAllowedProfileImagePath('/profile_pictures/abc')).toBe(false);
    });

    test('null / undefined / nem-string → false', () => {
        expect(isAllowedProfileImagePath(null)).toBe(false);
        expect(isAllowedProfileImagePath(undefined)).toBe(false);
        expect(isAllowedProfileImagePath(123)).toBe(false);
        expect(isAllowedProfileImagePath({})).toBe(false);
    });

    test('case-insensitive (uppercase ext is OK)', () => {
        expect(isAllowedProfileImagePath('/profile_pictures/ABC.PNG')).toBe(true);
        expect(isAllowedProfileImagePath('/PROFILE_PICTURES/abc.png')).toBe(true);
    });
});

describe('applyProfileImageVisibility', () => {
    test('approved + tulajdonos → eredeti kep', () => {
        const r = applyProfileImageVisibility('/foo.png', 'approved', 7, 7);
        expect(r.profileImage).toBe('/foo.png');
        expect(r.profileImageStatus).toBe('approved');
    });

    test('approved + nem-tulajdonos → eredeti kep (publikusan lathato)', () => {
        const r = applyProfileImageVisibility('/foo.png', 'approved', 7, 99);
        expect(r.profileImage).toBe('/foo.png');
    });

    test('pending + tulajdonos → eredeti kep (sajat preview)', () => {
        const r = applyProfileImageVisibility('/foo.png', 'pending', 7, 7);
        expect(r.profileImage).toBe('/foo.png');
        expect(r.profileImageStatus).toBe('pending');
    });

    test('pending + idegen → DEFAULT (mert nem ellenoryzott!)', () => {
        const r = applyProfileImageVisibility('/foo.png', 'pending', 7, 99);
        expect(r.profileImage).toBe('/profile_pictures/default.png');
        expect(r.profileImageStatus).toBe('default');
    });

    test('rejected → mindig DEFAULT', () => {
        const own = applyProfileImageVisibility('/foo.png', 'rejected', 7, 7);
        const others = applyProfileImageVisibility('/foo.png', 'rejected', 7, 99);
        expect(own.profileImage).toBe('/profile_pictures/default.png');
        expect(others.profileImage).toBe('/profile_pictures/default.png');
    });

    test('viewerUserId 0 (publikus context) + pending → DEFAULT', () => {
        const r = applyProfileImageVisibility('/foo.png', 'pending', 7, 0);
        expect(r.profileImage).toBe('/profile_pictures/default.png');
    });

    test('hianyzo profileImage → DEFAULT', () => {
        const r = applyProfileImageVisibility(null, 'approved', 7, 7);
        expect(r.profileImage).toBe('/profile_pictures/default.png');
    });

    test('hianyzo status → "approved" default', () => {
        const r = applyProfileImageVisibility('/foo.png', null, 7, 7);
        expect(r.profileImageStatus).toBe('approved');
    });

    test('case insensitive status', () => {
        const r = applyProfileImageVisibility('/foo.png', 'PENDING', 7, 99);
        expect(r.profileImage).toBe('/profile_pictures/default.png'); // mert pending + idegen
    });
});
