(function initMattMesterProfileImageUtils(globalScope) {
    const DEFAULT_PROFILE_IMAGE_SRC = '/profile_pictures/default.png';
    const PENDING_BLUR_CLASS = 'profile-image-pending-blur';
    const PENDING_STATUS = 'pending';
    const DEFAULT_ALT_TEXT = 'Profilkép';
    const DEFAULT_USERNAME = 'Felhasználó';

    const SOURCE_KEYS = ['profile_image', 'profileImage', 'image'];
    const STATUS_KEYS = ['profile_image_status', 'profileImageStatus', 'imageStatus'];
    const USERNAME_KEYS = ['username', 'userName', 'name', 'displayName'];

    const SIZE_PRESETS = {
        sm: 28,
        md: 40,
        lg: 80,
        xl: 160
    };

    function firstNonEmptyStringFromKeys(candidateObject, keys) {
        let result = '';
        try {
            if (candidateObject && typeof candidateObject === 'object') {
                for (let index = 0; index < keys.length; index += 1) {
                    const value = candidateObject[keys[index]];
                    if (typeof value === 'string' && value.trim()) {
                        result = value.trim();
                        break;
                    }
                }
            }
        } catch (error) {
            result = '';
        }

        return result;
    }

    function normalizeProfileImageSource(input) {
        let source = DEFAULT_PROFILE_IMAGE_SRC;
        try {
            let candidate = '';
            if (typeof input === 'string') {
                candidate = input.trim();
            } else if (input && typeof input === 'object') {
                candidate = firstNonEmptyStringFromKeys(input, SOURCE_KEYS);
            }
            if (candidate) {
                source = candidate;
            }
        } catch (error) {
            source = DEFAULT_PROFILE_IMAGE_SRC;
        }

        return source;
    }

    function normalizeProfileImageStatus(input) {
        let status = 'approved';
        try {
            let candidate = '';
            if (typeof input === 'string') {
                candidate = input.trim().toLowerCase();
            } else if (input && typeof input === 'object') {
                candidate = firstNonEmptyStringFromKeys(input, STATUS_KEYS).toLowerCase();
            }
            if (candidate) {
                status = candidate;
            }
        } catch (error) {
            status = 'approved';
        }

        return status;
    }

    function isPendingProfileImageStatus(status) {
        let pending = false;
        try {
            pending = normalizeProfileImageStatus(status) === PENDING_STATUS;
        } catch (error) {
            pending = false;
        }

        return pending;
    }

    function isDefaultProfileImageSource(source) {
        let isDefault = true;
        try {
            const normalized = typeof source === 'string' ? source.trim().toLowerCase() : '';
            isDefault = normalized === '' || normalized === DEFAULT_PROFILE_IMAGE_SRC.toLowerCase()
                || normalized.endsWith(DEFAULT_PROFILE_IMAGE_SRC.toLowerCase());
        } catch (error) {
            isDefault = true;
        }

        return isDefault;
    }

    function buildProfileImageViewModel(rawUserLikeObject) {
        const fallback = {
            src: DEFAULT_PROFILE_IMAGE_SRC,
            status: 'approved',
            isPending: false,
            isDefault: true,
            username: DEFAULT_USERNAME,
            alt: DEFAULT_ALT_TEXT
        };
        let viewModel = fallback;
        try {
            const src = normalizeProfileImageSource(rawUserLikeObject);
            const status = normalizeProfileImageStatus(rawUserLikeObject);
            const username = firstNonEmptyStringFromKeys(rawUserLikeObject, USERNAME_KEYS) || DEFAULT_USERNAME;
            const isDefault = isDefaultProfileImageSource(src);
            const isPending = status === PENDING_STATUS && !isDefault;
            viewModel = {
                src,
                status,
                isPending,
                isDefault,
                username,
                alt: `${username} profilképe`
            };
        } catch (error) {
            viewModel = fallback;
        }

        return viewModel;
    }

    function resolveSizePx(sizeOption) {
        let px = 0;
        try {
            if (typeof sizeOption === 'number' && Number.isFinite(sizeOption) && sizeOption > 0) {
                px = Math.round(sizeOption);
            } else if (typeof sizeOption === 'string' && SIZE_PRESETS[sizeOption]) {
                px = SIZE_PRESETS[sizeOption];
            }
        } catch (error) {
            px = 0;
        }

        return px;
    }

    function bindDefaultImageFallback(imgElement) {
        // Az error listener csak EGYSZER kerul felkotesre kepelemenkent. A handler
        // a szerver-oldali igazsagforrasra (data-profile-image-status) tamaszkodik:
        // - ha a status 'pending', meghagyjuk a blur osztalyt akkor is, ha a kep
        //   betoltese megakad (nehogy a "felfuggesztett" jelzes elveszzen).
        // - ha a status 'approved' / 'default' / 'rejected', a blur osztalyt
        //   levesszuk, mivel nincs ertelme (a default kep nem var elbiralasra).
        try {
            if (imgElement && !imgElement.dataset.profileImageFallbackBound) {
                imgElement.dataset.profileImageFallbackBound = '1';
                imgElement.addEventListener('error', () => {
                    try {
                        const currentSrc = String(imgElement.src || '');
                        const intendedStatus = String(imgElement.dataset.profileImageStatus || '').toLowerCase();
                        if (!currentSrc.endsWith(DEFAULT_PROFILE_IMAGE_SRC)) {
                            imgElement.src = DEFAULT_PROFILE_IMAGE_SRC;
                            if (intendedStatus !== PENDING_STATUS) {
                                imgElement.classList.remove(PENDING_BLUR_CLASS);
                            }
                        }
                    } catch (handlerError) {
                        imgElement.src = DEFAULT_PROFILE_IMAGE_SRC;
                    }
                });
            }
        } catch (error) {
            // Nem kritikus: a fallback listener nem kotelezo a megjelenitesehez.
        }
    }

    function applyProfileImagePresentation(imgElement, options) {
        let appliedViewModel = null;
        try {
            const opts = options && typeof options === 'object' ? options : {};
            if (imgElement && imgElement.tagName) {
                const sourceObject = opts.source !== undefined
                    ? opts.source
                    : (opts.user !== undefined ? opts.user : opts);
                const viewModel = buildProfileImageViewModel(sourceObject);
                const altOverride = typeof opts.alt === 'string' && opts.alt.trim()
                    ? opts.alt.trim()
                    : viewModel.alt;
                const extraPendingClasses = Array.isArray(opts.extraPendingClasses)
                    ? opts.extraPendingClasses
                    : [];
                const sizePx = resolveSizePx(opts.size);

                // 1) Hibakezelo listener felkotese a forras beallitasa ELOTT, hogy
                //    a kep async load eseten se hianyozzon az error fallback.
                bindDefaultImageFallback(imgElement);

                // 2) Szerver-igazsag rogzitese DOM-on (debuggolhato DevToolsbol),
                //    a fallback handler is innen olvas, hogy ne strip-elje a
                //    pending blur osztalyt akkor sem, ha a kep nem toltodik be.
                imgElement.dataset.profileImageStatus = String(viewModel.status || 'approved');
                imgElement.dataset.profileImagePending = viewModel.isPending ? '1' : '0';
                imgElement.dataset.profileImageDefault = viewModel.isDefault ? '1' : '0';

                // 3) Megjelenitesi attribumok beallitasa - a blur class TOGGLE-jet
                //    a src-frissites elott vegezzuk, hogy ha a betoltodes elott
                //    valami eltavolitana (pl. fenti error handler), akkor is
                //    a friss isPending erteket lassuk a kovetkezo render utan.
                imgElement.alt = altOverride;
                imgElement.classList.toggle(PENDING_BLUR_CLASS, viewModel.isPending);

                extraPendingClasses.forEach((cls) => {
                    if (typeof cls === 'string' && cls.trim()) {
                        imgElement.classList.toggle(cls.trim(), viewModel.isPending);
                    }
                });

                // 4) A new src csak akkor toltodjon ujra, ha tenyleg valtozott.
                //    Igy elkeruljuk a felesleges fetch + esetleges error event
                //    sorozatot, ami a blur osztalyt is megzavarhatna.
                const nextSrc = String(viewModel.src || DEFAULT_PROFILE_IMAGE_SRC);
                const currentSrc = String(imgElement.getAttribute('src') || '');
                if (currentSrc !== nextSrc) {
                    imgElement.src = nextSrc;
                }

                if (sizePx > 0) {
                    imgElement.style.width = `${sizePx}px`;
                    imgElement.style.height = `${sizePx}px`;
                    imgElement.style.objectFit = 'cover';
                }

                if (typeof opts.variant === 'string' && opts.variant.trim()) {
                    imgElement.dataset.profileImageVariant = opts.variant.trim();
                }

                if (viewModel.isPending && globalScope.console && typeof globalScope.console.debug === 'function') {
                    globalScope.console.debug('[ProfileImage] pending kep detektálva:', {
                        username: viewModel.username,
                        src: viewModel.src,
                        status: viewModel.status
                    });
                }

                appliedViewModel = viewModel;
            }
        } catch (error) {
            appliedViewModel = null;
        }

        return appliedViewModel;
    }

    function injectGlobalPendingBlurStyle(doc) {
        // Ket fuggetlen szelektor takarja le a pending allapotot:
        //  - class alapu (.profile-image-pending-blur): a meglevo viselkedes,
        //  - data-attribute alapu ([data-profile-image-pending="1"]): biztos
        //    halo, ha valami DOM cleanup eltavolitana a class-t, az attributum
        //    es a hozza tartozo CSS megorzi a vizualis jelzest.
        try {
            if (doc && doc.head && !doc.getElementById('mattmester-profile-image-utils-style')) {
                const styleEl = doc.createElement('style');
                styleEl.id = 'mattmester-profile-image-utils-style';
                styleEl.textContent = `
                    .${PENDING_BLUR_CLASS},
                    img[data-profile-image-pending="1"] {
                        filter: blur(3px) saturate(0.75) !important;
                    }
                `;
                doc.head.appendChild(styleEl);
            }
        } catch (error) {
            // Style injekcio hiba eseten a CSS fajlokban definialt fallback veszi at.
        }
    }

    const api = {
        DEFAULT_PROFILE_IMAGE_SRC,
        PENDING_BLUR_CLASS,
        PENDING_STATUS,
        normalizeProfileImageSource,
        normalizeProfileImageStatus,
        isPendingProfileImageStatus,
        isDefaultProfileImageSource,
        buildProfileImageViewModel,
        applyProfileImagePresentation
    };

    globalScope.MattMesterProfileImage = api;

    try {
        if (globalScope.document) {
            injectGlobalPendingBlurStyle(globalScope.document);
        }
    } catch (error) {
        // Ha nincs document (pl. teszt környezet), némán elbukik.
    }
})(typeof window !== 'undefined' ? window : globalThis);
