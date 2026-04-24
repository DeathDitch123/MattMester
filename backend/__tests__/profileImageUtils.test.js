/**
 * MattMesterProfileImage frontend modul unit tesztjei.
 *
 * Cel: a pending profilkep megjelenitesi logikat (blur osztaly + data
 * attribute + viewmodel) izoláltan vizsgálni, jsdom nelkül. Egy kis fake DOM
 * elemet hasznalunk, ami csak a relevans API-t (classList, dataset, addEventListener)
 * implementalja.
 */

function createFakeImgElement() {
    const classes = new Set();
    const dataset = {};
    const listeners = new Map();
    const element = {
        tagName: 'IMG',
        _attrs: {},
        get src() { return this._attrs.src || ''; },
        set src(value) { this._attrs.src = String(value || ''); },
        alt: '',
        style: {},
        dataset,
        classList: {
            add: (cls) => classes.add(cls),
            remove: (cls) => classes.delete(cls),
            toggle: (cls, force) => {
                const shouldAdd = typeof force === 'boolean' ? force : !classes.has(cls);
                if (shouldAdd) classes.add(cls); else classes.delete(cls);
                return shouldAdd;
            },
            contains: (cls) => classes.has(cls)
        },
        getAttribute: (name) => element._attrs[name] || null,
        setAttribute: (name, value) => { element._attrs[name] = String(value); },
        addEventListener: (event, handler) => {
            if (!listeners.has(event)) listeners.set(event, []);
            listeners.get(event).push(handler);
        },
        _fireEvent: (event) => {
            (listeners.get(event) || []).forEach((handler) => handler({ type: event }));
        },
        _classes: classes,
        _listeners: listeners
    };
    return element;
}

function loadProfileImageApi() {
    // A modul IIFE-je window-ra teszi az API-t. Jest sajat module resolver-t hasznal,
    // ezert jest.isolateModules-szel kenyszeritjuk az ujratoltest minden hivasnal.
    const fakeWindow = {
        crypto: { randomUUID: () => 'test-uuid' },
        console
    };
    const original = global.window;
    global.window = fakeWindow;
    try {
        jest.isolateModules(() => {
            require('../../frontend/javascript/profileImageUtils.js');
        });
    } finally {
        global.window = original;
    }
    return fakeWindow.MattMesterProfileImage;
}

describe('MattMesterProfileImage – pending blur logika', () => {
    test('buildProfileImageViewModel pending statuszra isPending=true es szervert kover', () => {
        const api = loadProfileImageApi();
        const vm = api.buildProfileImageViewModel({
            username: 'tester',
            profile_image: '/profile_pictures/123-test.png',
            profile_image_status: 'pending'
        });
        expect(vm.status).toBe('pending');
        expect(vm.isPending).toBe(true);
        expect(vm.isDefault).toBe(false);
        expect(vm.src).toBe('/profile_pictures/123-test.png');
    });

    test('buildProfileImageViewModel default kepre nem pending, akkor sem ha a status pending', () => {
        const api = loadProfileImageApi();
        const vm = api.buildProfileImageViewModel({
            profile_image: '/profile_pictures/default.png',
            profile_image_status: 'pending'
        });
        // Default kep eseten nincs ertelme blur-elni: a felhasznalo nem latja a sajat
        // pending kepet, hanem az alapertelmezettet.
        expect(vm.isPending).toBe(false);
        expect(vm.isDefault).toBe(true);
    });

    test('buildProfileImageViewModel camelCase kulcsokra is mukodik', () => {
        const api = loadProfileImageApi();
        const vm = api.buildProfileImageViewModel({
            username: 'tester',
            profileImage: '/profile_pictures/123-test.png',
            profileImageStatus: 'PENDING'
        });
        expect(vm.isPending).toBe(true);
    });

    test('applyProfileImagePresentation hozzaadja a pending blur osztalyt es a data attribuumokat', () => {
        const api = loadProfileImageApi();
        const img = createFakeImgElement();
        api.applyProfileImagePresentation(img, {
            source: {
                username: 'tester',
                profile_image: '/profile_pictures/abc.png',
                profile_image_status: 'pending'
            }
        });
        expect(img._classes.has('profile-image-pending-blur')).toBe(true);
        expect(img.dataset.profileImageStatus).toBe('pending');
        expect(img.dataset.profileImagePending).toBe('1');
        expect(img.dataset.profileImageDefault).toBe('0');
        expect(img.src).toBe('/profile_pictures/abc.png');
    });

    test('applyProfileImagePresentation eltavolitja a blur osztalyt approved statuszra', () => {
        const api = loadProfileImageApi();
        const img = createFakeImgElement();
        // Elso korben pending
        api.applyProfileImagePresentation(img, {
            source: { profile_image: '/profile_pictures/abc.png', profile_image_status: 'pending' }
        });
        expect(img._classes.has('profile-image-pending-blur')).toBe(true);
        // Masodik korben approved -> blur off
        api.applyProfileImagePresentation(img, {
            source: { profile_image: '/profile_pictures/abc.png', profile_image_status: 'approved' }
        });
        expect(img._classes.has('profile-image-pending-blur')).toBe(false);
        expect(img.dataset.profileImageStatus).toBe('approved');
        expect(img.dataset.profileImagePending).toBe('0');
    });

    test('error fallback megorzi a pending blur-t pending statuszu kepnel akkor is, ha a kep betoltes elakad', () => {
        const api = loadProfileImageApi();
        const img = createFakeImgElement();
        api.applyProfileImagePresentation(img, {
            source: { profile_image: '/profile_pictures/abc.png', profile_image_status: 'pending' }
        });
        // Szimulaljunk image-error eventet (pl. statikus fajl race / 404):
        img._fireEvent('error');
        // Az src reset default-ra (fallback), de a blur osztalyt MEGTARTJUK,
        // mert a szerver-igazsag szerint a kep meg pending.
        expect(img.src.endsWith('/profile_pictures/default.png')).toBe(true);
        expect(img._classes.has('profile-image-pending-blur')).toBe(true);
    });

    test('error fallback eltavolitja a blur-t approved statuszu kepnel ha a betoltes elakad', () => {
        const api = loadProfileImageApi();
        const img = createFakeImgElement();
        // Elso renderelesnel approved volt: nincs blur class.
        api.applyProfileImagePresentation(img, {
            source: { profile_image: '/profile_pictures/abc.png', profile_image_status: 'approved' }
        });
        // Manualisan adjunk hozza blur-t (regressziovedelem: ha valamiert ott maradt egy
        // korabbi pending allapot blur-je), es kuldjunk error-t. Approved statusznal a
        // fallback-nek kell tisztitania.
        img._classes.add('profile-image-pending-blur');
        img._fireEvent('error');
        expect(img._classes.has('profile-image-pending-blur')).toBe(false);
    });

    test('applyProfileImagePresentation nem allitja ujra a src-et, ha mar az aktualis erteket tartalmazza', () => {
        const api = loadProfileImageApi();
        const img = createFakeImgElement();
        img.src = '/profile_pictures/abc.png';
        const initialSrc = img.src;
        api.applyProfileImagePresentation(img, {
            source: { profile_image: '/profile_pictures/abc.png', profile_image_status: 'pending' }
        });
        // Ne valtozzon a src referenciaja, az ujra-fetch elkeruleseert.
        expect(img.src).toBe(initialSrc);
    });
});
