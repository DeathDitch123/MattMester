(function initMattMesterProfileImageUtils(globalScope) {
    const DEFAULT_PROFILE_IMAGE_SRC = '/profile_pictures/default.png';
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
        // Egyszeri error listener: ha a kép betöltése elakad, az alapértelmezettre
        // állunk vissza. A pending státusz blur-ja kikerült: a backend gondoskodik
        // arról, hogy mások default képet kapjanak, így nincs vizuális maszkolás.
        try {
            if (imgElement && !imgElement.dataset.profileImageFallbackBound) {
                imgElement.dataset.profileImageFallbackBound = '1';
                imgElement.addEventListener('error', () => {
                    try {
                        const currentSrc = String(imgElement.src || '');
                        if (!currentSrc.endsWith(DEFAULT_PROFILE_IMAGE_SRC)) {
                            imgElement.src = DEFAULT_PROFILE_IMAGE_SRC;
                        }
                    } catch (handlerError) {
                        imgElement.src = DEFAULT_PROFILE_IMAGE_SRC;
                    }
                });
            }
        } catch (error) {
            // Nem kritikus: a fallback listener nem kötelező a megjelenítéshez.
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
                const sizePx = resolveSizePx(opts.size);

                bindDefaultImageFallback(imgElement);

                imgElement.dataset.profileImageStatus = String(viewModel.status || 'approved');
                imgElement.dataset.profileImageDefault = viewModel.isDefault ? '1' : '0';

                imgElement.alt = altOverride;

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

                appliedViewModel = viewModel;
            }
        } catch (error) {
            appliedViewModel = null;
        }

        return appliedViewModel;
    }

    const api = {
        DEFAULT_PROFILE_IMAGE_SRC,
        PENDING_STATUS,
        normalizeProfileImageSource,
        normalizeProfileImageStatus,
        isPendingProfileImageStatus,
        isDefaultProfileImageSource,
        buildProfileImageViewModel,
        applyProfileImagePresentation
    };

    globalScope.MattMesterProfileImage = api;
})(typeof window !== 'undefined' ? window : globalThis);
