/**
 * MattMesterProfileImage frontend modul unit tesztjei.
 *
 * Cel: a profilkep megjelenitesi viewmodel + DOM presentation viselkedeset
 * izolaltan vizsgalni jsdom nelkul. A pending blur class teljesen kikerult,
 * mert a backend gondoskodik arrol, hogy non-owner ne kapja meg a pending
 * kepet — igy nincs vizualis maszkolas, a UI csak a status szoveget mutatja.
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

describe('MattMesterProfileImage – viewmodel + presentation', () => {
    test('buildProfileImageViewModel pending statuszra isPending=true', () => {
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

    test('applyProfileImagePresentation NEM ad blur osztalyt pending statuszra', () => {
        const api = loadProfileImageApi();
        const img = createFakeImgElement();
        api.applyProfileImagePresentation(img, {
            source: {
                username: 'tester',
                profile_image: '/profile_pictures/abc.png',
                profile_image_status: 'pending'
            }
        });
        // A blur osztaly teljesen kikerult — a backend gondoskodik a privacyrol.
        expect(img._classes.has('profile-image-pending-blur')).toBe(false);
        expect(img.dataset.profileImageStatus).toBe('pending');
        expect(img.dataset.profileImageDefault).toBe('0');
        expect(img.src).toBe('/profile_pictures/abc.png');
    });

    test('applyProfileImagePresentation approved statusznal sem rak fel blur osztalyt', () => {
        const api = loadProfileImageApi();
        const img = createFakeImgElement();
        api.applyProfileImagePresentation(img, {
            source: { profile_image: '/profile_pictures/abc.png', profile_image_status: 'approved' }
        });
        expect(img._classes.has('profile-image-pending-blur')).toBe(false);
        expect(img.dataset.profileImageStatus).toBe('approved');
    });

    test('error fallback default-ra all akkor is, ha a kep betoltese elakad', () => {
        const api = loadProfileImageApi();
        const img = createFakeImgElement();
        api.applyProfileImagePresentation(img, {
            source: { profile_image: '/profile_pictures/abc.png', profile_image_status: 'approved' }
        });
        img._fireEvent('error');
        expect(img.src.endsWith('/profile_pictures/default.png')).toBe(true);
    });

    test('applyProfileImagePresentation nem allitja ujra a src-et, ha mar az aktualis erteket tartalmazza', () => {
        const api = loadProfileImageApi();
        const img = createFakeImgElement();
        img.src = '/profile_pictures/abc.png';
        const initialSrc = img.src;
        api.applyProfileImagePresentation(img, {
            source: { profile_image: '/profile_pictures/abc.png', profile_image_status: 'pending' }
        });
        expect(img.src).toBe(initialSrc);
    });

    test('a publikus API-rol a PENDING_BLUR_CLASS export eltunt', () => {
        const api = loadProfileImageApi();
        expect(api.PENDING_BLUR_CLASS).toBeUndefined();
    });
});
