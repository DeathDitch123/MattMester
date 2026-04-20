const crypto = require('crypto');

let cachedTransporter = null;
let cachedTransporterKind = null;
let cachedTransportVerified = false;

const TOKEN_BYTE_LENGTH = 32;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function maskEmailAddress(emailInput) {
    const email = String(emailInput || '').trim();
    const parts = email.split('@');
    let masked = 'ismeretlen';
    if (parts.length === 2 && parts[0] && parts[1]) {
        const localPart = parts[0];
        const domainPart = parts[1];
        const first = localPart.charAt(0) || '*';
        const last = localPart.length > 1 ? localPart.charAt(localPart.length - 1) : '*';
        masked = `${first}***${last}@${domainPart}`;
    }
    return masked;
}

function classifyEmailSendError(errorInput) {
    const error = errorInput || {};
    const text = String(error.message || '').toLowerCase();
    const code = String(error.code || '').toUpperCase();
    let reason = 'UNKNOWN';

    if (code === 'EAUTH' || text.includes('auth')) {
        reason = 'AUTH';
    } else if (code === 'ESOCKET' && text.includes('tls')) {
        reason = 'TLS';
    } else if (code === 'ETIMEDOUT' || code === 'ESOCKET' || text.includes('timeout')) {
        reason = 'TIMEOUT';
    } else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || text.includes('dns') || text.includes('getaddrinfo')) {
        reason = 'DNS';
    } else if (String(error.responseCode || '').startsWith('5') || text.includes('rejected') || text.includes('invalid recipients')) {
        reason = 'REJECT';
    }

    return reason;
}

function buildSmtpDiagnosticsSummary() {
    const host = String(process.env.SMTP_HOST || '').trim();
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '').trim();
    const from = String(process.env.SMTP_FROM || '').trim();
    const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

    return {
        host,
        port,
        user,
        pass,
        from,
        secure,
        smtpConfigured: Boolean(host && user && pass)
    };
}

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
        const diagnostics = buildSmtpDiagnosticsSummary();
        if (transporter) {
            if (!cachedTransportVerified && cachedTransporterKind === 'smtp') {
                try {
                    await transporter.verify();
                    cachedTransportVerified = true;
                    console.log(`[EmailVerification] SMTP transporter verify sikeres: host=${diagnostics.host || 'n/a'} port=${diagnostics.port} secure=${diagnostics.secure}`);
                } catch (verifyError) {
                    const reason = classifyEmailSendError(verifyError);
                    console.error(`[EmailVerification] SMTP transporter verify hiba: reason=${reason} code=${verifyError.code || 'n/a'} message=${verifyError.message || 'ismeretlen'}`);
                    throw verifyError;
                }
            }
            return transporter;
        }

        const nodemailer = require('nodemailer');
        if (diagnostics.smtpConfigured) {
            transporter = nodemailer.createTransport({
                host: diagnostics.host,
                port: diagnostics.port,
                secure: diagnostics.secure,
                auth: { user: diagnostics.user, pass: diagnostics.pass },
                connectionTimeout: 10000,
                greetingTimeout: 10000,
                socketTimeout: 20000
            });
            cachedTransporterKind = 'smtp';
            console.log(`[EmailVerification] Transporter init sikeres: kind=smtp host=${diagnostics.host} port=${diagnostics.port} secure=${diagnostics.secure} userSet=${Boolean(diagnostics.user)} fromSet=${Boolean(diagnostics.from)}`);

            try {
                await transporter.verify();
                cachedTransportVerified = true;
                console.log('[EmailVerification] SMTP kapcsolat ellenőrzés rendben (verify).');
            } catch (verifyError) {
                const reason = classifyEmailSendError(verifyError);
                console.error(`[EmailVerification] SMTP verify sikertelen: reason=${reason} code=${verifyError.code || 'n/a'} message=${verifyError.message || 'ismeretlen'}`);
                throw verifyError;
            }
        } else {
            transporter = nodemailer.createTransport({
                jsonTransport: true
            });
            cachedTransporterKind = 'json-dev';
            cachedTransportVerified = true;
            console.warn(`[EmailVerification] SMTP fallback aktiv: kind=json-dev hostSet=${Boolean(diagnostics.host)} userSet=${Boolean(diagnostics.user)} passSet=${Boolean(diagnostics.pass)} fromSet=${Boolean(diagnostics.from)}`);
            console.warn('[EmailVerification] SMTP_HOST/USER/PASS nincs beállítva — dev JSON transport aktív (a levél csak logba kerül).');
        }

        cachedTransporter = transporter;
    } catch (error) {
        const reason = classifyEmailSendError(error);
        console.error(`[EmailVerification] Transporter inicializálási hiba: reason=${reason} code=${error.code || 'n/a'} message=${error.message || 'ismeretlen'}`);
        const typedError = new Error('Email küldés sikertelen, ellenőrizd az SMTP beállításokat vagy próbáld újra később.');
        typedError.code = 'EMAIL_SEND_FAILED';
        typedError.smtpReason = reason;
        throw typedError;
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

async function sendVerificationEmail(toAddress, username, rawToken, options = {}) {
    let sendResult = {
        delivered: false,
        transport: cachedTransporterKind,
        verificationLink: null,
        messageId: null,
        providerResponse: null
    };
    try {
        const flow = String(options.flow || 'unknown').trim() || 'unknown';
        const maskedToAddress = maskEmailAddress(toAddress);
        const verificationLink = buildVerificationLink(rawToken);
        const transporter = await resolveTransporter();
        const mail = buildEmailPayload(toAddress, username, verificationLink);
        console.log(`[EmailVerification] Küldés indult: flow=${flow} to=${maskedToAddress} transport=${cachedTransporterKind || 'n/a'}`);
        const info = await transporter.sendMail(mail);
        const messageId = String(info?.messageId || '').trim() || null;
        const providerResponse = String(info?.response || '').trim() || null;

        console.log(`[EmailVerification] Küldés sikeres: flow=${flow} to=${maskedToAddress} messageId=${messageId || 'n/a'} response=${providerResponse || 'n/a'}`);

        if (cachedTransporterKind === 'json-dev') {
            console.log('[EmailVerification][DEV] Kimenő verifikációs email (nincs valódi SMTP):');
            console.log(info.message || JSON.stringify(info, null, 2));
        }

        sendResult = {
            delivered: true,
            transport: cachedTransporterKind,
            verificationLink,
            messageId,
            providerResponse
        };
    } catch (error) {
        const reason = classifyEmailSendError(error);
        console.error(`[EmailVerification] Email küldési hiba: reason=${reason} code=${error.code || 'n/a'} message=${error.message || 'ismeretlen'}`);
        const typedError = new Error('Email küldés sikertelen, ellenőrizd az SMTP beállításokat vagy próbáld újra később.');
        typedError.code = 'EMAIL_SEND_FAILED';
        typedError.smtpReason = reason;
        throw typedError;
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
