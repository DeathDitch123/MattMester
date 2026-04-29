// Publikus konstans-endpointok. Auth nem szukseges, csak nem-szenzitiv,
// frontend-altal hasznalt konfiguraciot ad vissza (TTL-ek, hibakodok).
//
// Az ADMIN_PANEL.md javaslata szerint a frontend egy forrasbol olvassa
// az admin token TTL-eket, UI timing konstansokat es a hibakodokat,
// hogy ne legyen kettos forras (backend/frontend coherence).

const express = require('express');
const router = express.Router();

const {
    ADMIN_TOKEN_TTL_MS,
    REASON_MIN_LENGTH_NORMAL,
    REASON_MIN_LENGTH_CRITICAL,
    REASON_MAX_LENGTH,
    ADMIN_ELEVATE_LIMIT_WINDOW_MS,
    ADMIN_ELEVATE_LIMIT_MAX,
    ADMIN_UI_TOKEN_TICK_INTERVAL_MS,
    ADMIN_UI_TOKEN_REFRESH_THRESHOLD_SEC,
    ADMIN_UI_FOCUS_RESTORE_DELAY_MS,
    ADMIN_UI_ERROR_TOAST_DURATION_MS,
    ADMIN_ERROR_CODES
} = require('../admin/constants.js');

router.get('/public/admin-constants', (request, response) => {
    let payload = null;
    let statusCode = 200;
    try {
        payload = {
            success: true,
            data: {
                token: {
                    ttlMs: ADMIN_TOKEN_TTL_MS,
                    elevateLimit: {
                        windowMs: ADMIN_ELEVATE_LIMIT_WINDOW_MS,
                        max: ADMIN_ELEVATE_LIMIT_MAX
                    }
                },
                reason: {
                    minLengthNormal: REASON_MIN_LENGTH_NORMAL,
                    minLengthCritical: REASON_MIN_LENGTH_CRITICAL,
                    maxLength: REASON_MAX_LENGTH
                },
                ui: {
                    tokenTickIntervalMs: ADMIN_UI_TOKEN_TICK_INTERVAL_MS,
                    tokenRefreshThresholdSec: ADMIN_UI_TOKEN_REFRESH_THRESHOLD_SEC,
                    focusRestoreDelayMs: ADMIN_UI_FOCUS_RESTORE_DELAY_MS,
                    errorToastDurationMs: ADMIN_UI_ERROR_TOAST_DURATION_MS
                },
                errorCodes: ADMIN_ERROR_CODES
            }
        };
    } catch (error) {
        console.error('admin-constants endpoint hiba:', error.message);
        statusCode = 500;
        payload = { success: false, code: 'ADMIN_CONSTANTS_INTERNAL', message: 'Konstansok lekerese sikertelen.' };
    }
    return response.status(statusCode).json(payload);
});

module.exports = router;
