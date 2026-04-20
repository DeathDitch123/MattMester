const crypto = require('crypto');

let cachedTransporter = null;
let cachedTransporterKind = null;

const TOKEN_BYTE_LENGTH = 32;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(plainToken) {
    return crypto.createHash('sha256').update(String(plainToken || '')).digest('hex');
}

function generateVerificationToken() {
    const rawToken = crypto.randomBytes(TOKEN_BYTE_LENGTH).toString('hex');
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    return { rawToken, tokenHash, expiresAt };
}

function buildPublicBaseUrl() {
    let baseUrl = process.env.PUBLIC_BASE_URL;
    if (!baseUrl || typeof baseUrl !== 'string') {
        baseUrl = 'http://127.0.0.1:3000';
    }
    return baseUrl.replace(/\/+$/, '');
}

function buildVerificationLink(rawToken) {
    const base = buildPublicBaseUrl();
    const encoded = encodeURIComponent(String(rawToken || ''));
    return `${base}/api/auth/verify-email?token=${encoded}`;
}

async function resolveTransporter() {
    let transporter = cachedTransporter;
    try {
        if (transporter) {
            return transporter;
        }

        const nodemailer = require('nodemailer');
        const host = process.env.SMTP_HOST;
        const port = Number(process.env.SMTP_PORT) || 587;
        const user = process.env.SMTP_USER;
        const pass = process.env.SMTP_PASS;
        const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

        if (host && user && pass) {
            transporter = nodemailer.createTransport({
                host,
                port,
                secure,
                auth: { user, pass }
            });
            cachedTransporterKind = 'smtp';
        } else {
            transporter = nodemailer.createTransport({
                jsonTransport: true
            });
            cachedTransporterKind = 'json-dev';
            console.warn('[EmailVerification] SMTP_HOST/USER/PASS nincs beállítva — dev JSON transport aktív (a levél csak logba kerül).');
        }

        cachedTransporter = transporter;
    } catch (error) {
        console.error('[EmailVerification] Transporter inicializálási hiba:', error.message);
        throw new Error('Email küldő szolgáltatás nem elérhető.');
    }
    return transporter;
}

function buildEmailPayload(toAddress, username, verificationLink) {
    const fromAddress = process.env.SMTP_FROM || 'MattMester <no-reply@mattmester.local>';
    const safeUsername = String(username || 'játékos');
    const textBody = [
        `Szia ${safeUsername}!`,
        '',
        'Köszönjük a MattMester regisztrációt.',
        'Kérjük, erősítsd meg az email címed az alábbi linkre kattintva:',
        '',
        verificationLink,
        '',
        'A link 24 óráig érvényes. Ha nem te kezdeményezted, hagyd figyelmen kívül ezt a levelet.',
        '',
        'MattMester csapata'
    ].join('\n');

    const htmlBody = `
        <p>Szia <strong>${safeUsername}</strong>!</p>
        <p>Köszönjük a MattMester regisztrációt.</p>
        <p>Kérjük, erősítsd meg az email címed az alábbi linkre kattintva:</p>
        <p><a href="${verificationLink}">${verificationLink}</a></p>
        <p>A link 24 óráig érvényes. Ha nem te kezdeményezted, hagyd figyelmen kívül ezt a levelet.</p>
        <p>MattMester csapata</p>
    `;

    return {
        from: fromAddress,
        to: toAddress,
        subject: 'MattMester — erősítsd meg az email címed',
        text: textBody,
        html: htmlBody
    };
}

async function sendVerificationEmail(toAddress, username, rawToken) {
    let sendResult = { delivered: false, transport: cachedTransporterKind, verificationLink: null };
    try {
        const verificationLink = buildVerificationLink(rawToken);
        const transporter = await resolveTransporter();
        const mail = buildEmailPayload(toAddress, username, verificationLink);
        const info = await transporter.sendMail(mail);

        if (cachedTransporterKind === 'json-dev') {
            console.log('[EmailVerification][DEV] Kimenő verifikációs email (nincs valódi SMTP):');
            console.log(info.message || JSON.stringify(info, null, 2));
        }

        sendResult = {
            delivered: true,
            transport: cachedTransporterKind,
            verificationLink
        };
    } catch (error) {
        console.error('[EmailVerification] Email küldési hiba:', error.message);
        throw new Error('Nem sikerült elküldeni a verifikációs emailt.');
    }
    return sendResult;
}

function isExpired(expiresAt) {
    let expired = true;
    try {
        if (expiresAt) {
            const expiryTime = new Date(expiresAt).getTime();
            expired = !Number.isFinite(expiryTime) || expiryTime <= Date.now();
        }
    } catch (error) {
        expired = true;
    }
    return expired;
}

module.exports = {
    generateVerificationToken,
    hashToken,
    sendVerificationEmail,
    buildVerificationLink,
    isExpired,
    TOKEN_TTL_MS
};
