// Admin token kiadasa, ellenorzese, rotacioja. ADMIN_PANEL.md §2.

const crypto = require('crypto');
const adminRepo = require('../../sql/adminRepo.js');
const {
    ADMIN_TOKEN_TTL_MS,
    ADMIN_TOKEN_RAW_BYTES
} = require('./constants.js');

function hashToken(plainToken) {
    return crypto.createHash('sha256').update(plainToken).digest('hex');
}

function generatePlainToken() {
    return crypto.randomBytes(ADMIN_TOKEN_RAW_BYTES).toString('base64url');
}

async function issueAdminToken(userId, ipAddress, userAgent) {
    let result = null;
    try {
        const plainToken = generatePlainToken();
        const tokenHash = hashToken(plainToken);
        const expiresAt = new Date(Date.now() + ADMIN_TOKEN_TTL_MS);
        await adminRepo.createAdminToken(userId, tokenHash, expiresAt, ipAddress, userAgent);
        result = { plainToken, expiresAt };
    } catch (error) {
        console.error('issueAdminToken hiba:', error.message);
        throw new Error('Admin token kiadasa sikertelen.');
    }
    return result;
}

async function verifyAndTouchToken(plainToken, sessionUserId) {
    let result = null;
    try {
        const tokenHash = hashToken(plainToken);
        const row = await adminRepo.findActiveAdminToken(tokenHash, sessionUserId);
        if (row) {
            await adminRepo.touchAdminToken(row.id, ADMIN_TOKEN_TTL_MS);
            result = {
                tokenId: row.id,
                userId: row.user_id,
                expiresAt: new Date(Date.now() + ADMIN_TOKEN_TTL_MS)
            };
        }
    } catch (error) {
        console.error('verifyAndTouchToken hiba:', error.message);
        throw new Error('Admin token ellenorzesi hiba.');
    }
    return result;
}

async function revokeTokenById(tokenId) {
    try {
        await adminRepo.revokeAdminToken(tokenId);
    } catch (error) {
        console.error('revokeTokenById hiba:', error.message);
        throw new Error('Admin token visszavonasi hiba.');
    }
}

async function revokeAllForUser(userId) {
    let affected = 0;
    try {
        affected = await adminRepo.revokeAllAdminTokensForUser(userId);
    } catch (error) {
        console.error('revokeAllForUser hiba:', error.message);
        throw new Error('Admin tokenek visszavonasi hiba.');
    }
    return affected;
}

async function rotateToken(tokenId, userId, ipAddress, userAgent) {
    let result = null;
    try {
        await adminRepo.revokeAdminToken(tokenId);
        result = await issueAdminToken(userId, ipAddress, userAgent);
    } catch (error) {
        console.error('rotateToken hiba:', error.message);
        throw new Error('Admin token rotacio hiba.');
    }
    return result;
}

module.exports = {
    hashToken,
    generatePlainToken,
    issueAdminToken,
    verifyAndTouchToken,
    revokeTokenById,
    revokeAllForUser,
    rotateToken
};
