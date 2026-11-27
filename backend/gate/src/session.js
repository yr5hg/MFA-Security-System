import {
    randomBytes,
    createHash,
    timingSafeEqual
} from 'node:crypto';

const COOKIE_NAME = '__Host-mfa_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const SESSION_TTL_SECONDS = 900;

function randomToken() {
    return randomBytes(32).toString('base64url');
}

function validToken(token) {
    return typeof token === 'string' &&
        TOKEN_PATTERN.test(token);
}

function hashToken(token) {
    return createHash('sha256')
        .update(token)
        .digest('hex');
}

export function createSessionStore({
    ttlSeconds = SESSION_TTL_SECONDS,
    maxSessions = 1000,
    now = Date.now
} = {}) {
    if (
        !Number.isSafeInteger(ttlSeconds) ||
        ttlSeconds <= 0 ||
        ttlSeconds > SESSION_TTL_SECONDS
    ) {
        throw new Error('Invalid session lifetime');
    }

    if (
        !Number.isSafeInteger(maxSessions) ||
        maxSessions <= 0
    ) {
        throw new Error('Invalid session capacity');
    }

    const sessions = new Map();

    function purgeExpired() {
        const currentTime = now();

        for (const [id, session] of sessions) {
            if (session.expiresAt <= currentTime) {
                sessions.delete(id);
            }
        }
    }

    function create() {
        purgeExpired();

        if (sessions.size >= maxSessions) {
            throw new Error('Session capacity reached');
        }

        const token = randomToken();
        const id = hashToken(token);
        const createdAt = now();

        const session = Object.freeze({
            id,
            csrfToken: randomToken(),
            createdAt,
            expiresAt: createdAt + ttlSeconds * 1000
        });

        sessions.set(id, session);

        return { token, session };
    }

    function get(token) {
        if (!validToken(token)) {
            return null;
        }

        const id = hashToken(token);
        const session = sessions.get(id);

        if (!session) {
            return null;
        }

        if (session.expiresAt <= now()) {
            sessions.delete(id);
            return null;
        }

        return session;
    }

    function revoke(token) {
        if (!validToken(token)) {
            return false;
        }

        return sessions.delete(hashToken(token));
    }

    function rotate(token) {
        if (!get(token)) {
            return null;
        }

        revoke(token);

        return create();
    }

    return Object.freeze({
        create,
        get,
        revoke,
        rotate,
        purgeExpired
    });
}

export function buildSessionCookie(
    token,
    ttlSeconds = SESSION_TTL_SECONDS
) {
    if (!validToken(token)) {
        throw new Error('Invalid session token');
    }

    if (
        !Number.isSafeInteger(ttlSeconds) ||
        ttlSeconds <= 0 ||
        ttlSeconds > SESSION_TTL_SECONDS
    ) {
        throw new Error('Invalid cookie lifetime');
    }

    return [
        `${COOKIE_NAME}=${token}`,
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        `Max-Age=${ttlSeconds}`
    ].join('; ');
}

export function clearSessionCookie() {
    return [
        `${COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
        'Max-Age=0'
    ].join('; ');
}

export function readSessionCookie(cookieHeader) {
    if (typeof cookieHeader !== 'string') {
        return null;
    }

    const matchingCookies = cookieHeader
        .split(';')
        .map(cookie => cookie.trim())
        .filter(cookie =>
            cookie.startsWith(`${COOKIE_NAME}=`)
        );

    if (matchingCookies.length !== 1) {
        return null;
    }

    const token = matchingCookies[0]
        .slice(COOKIE_NAME.length + 1);

    return validToken(token) ? token : null;
}

export function verifyCsrf(session, submittedToken) {
    if (
        !session ||
        !validToken(session.csrfToken) ||
        !validToken(submittedToken)
    ) {
        return false;
    }

    return timingSafeEqual(
        Buffer.from(session.csrfToken),
        Buffer.from(submittedToken)
    );
}

export function verifySameOrigin(origin, expectedOrigin) {
    return typeof origin === 'string' &&
        typeof expectedOrigin === 'string' &&
        origin === expectedOrigin;
}
