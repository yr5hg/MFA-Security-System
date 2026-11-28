import {
    randomBytes,
    createHash,
    timingSafeEqual
} from 'node:crypto';

import {
    validAttemptPurpose
} from './purpose.js';

export const ATTEMPT_TTL_SECONDS = 300;

const METHODS = new Set(['totp', 'face']);

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_ID_PATTERN = /^[a-f0-9]{64}$/;

function randomToken() {
    return randomBytes(32).toString('base64url');
}

function createCodeChallenge(verifier) {
    return createHash('sha256')
        .update(verifier)
        .digest('base64url');
}

function equalTokens(first, second) {
    if (
        typeof first !== 'string' ||
        typeof second !== 'string' ||
        !TOKEN_PATTERN.test(first) ||
        !TOKEN_PATTERN.test(second)
    ) {
        return false;
    }

    return timingSafeEqual(
        Buffer.from(first),
        Buffer.from(second)
    );
}

export function createAttemptStore({
    ttlSeconds = ATTEMPT_TTL_SECONDS,
    maxAttempts = 1000,
    now = Date.now
} = {}) {
    if (
        !Number.isSafeInteger(ttlSeconds) ||
        ttlSeconds <= 0 ||
        ttlSeconds > ATTEMPT_TTL_SECONDS
    ) {
        throw new Error('Invalid attempt lifetime');
    }

    if (
        !Number.isSafeInteger(maxAttempts) ||
        maxAttempts <= 0
    ) {
        throw new Error('Invalid attempt capacity');
    }

    const attempts = new Map();

    function purgeExpired() {
        const currentTime = now();

        for (const [sessionId, attempt] of attempts) {
            if (attempt.expiresAt <= currentTime) {
                attempts.delete(sessionId);
            }
        }
    }

    function get(sessionId) {
        const attempt = attempts.get(sessionId);

        if (!attempt) {
            return null;
        }

        if (attempt.expiresAt <= now()) {
            attempts.delete(sessionId);
            return null;
        }

        return attempt;
    }

    function create(session, method, action, targetSubject) {
        if (
            !session ||
            typeof session.id !== 'string' ||
            !SESSION_ID_PATTERN.test(session.id) ||
            !Number.isSafeInteger(session.expiresAt) ||
            session.expiresAt <= now()
        ) {
            throw new Error('Invalid or expired session');
        }

        if (!METHODS.has(method)) {
            throw new Error('Invalid authentication method');
        }

        if (!validAttemptPurpose(
            method,
            action,
            targetSubject
        )) {
            throw new Error('Invalid protected action');
        }

        purgeExpired();

        if (
            !attempts.has(session.id) &&
            attempts.size >= maxAttempts
        ) {
            throw new Error('Attempt capacity reached');
        }

        const createdAt = now();
        const codeVerifier = randomToken();

        const attempt = Object.freeze({
            id: randomToken(),
            sessionId: session.id,

            method,
            action,

            ...(targetSubject !== undefined
                ? { targetSubject }
                : {}),

            status: 'pending_oidc',

            state: randomToken(),
            nonce: randomToken(),

            codeVerifier,
            codeChallenge:
                createCodeChallenge(codeVerifier),

            createdAt,
            expiresAt: Math.min(
                createdAt + ttlSeconds * 1000,
                session.expiresAt
            )
        });

        // Replace any previous attempt for this session.
        attempts.set(session.id, attempt);

        return attempt;
    }

    function claimCallback(sessionId, method, state) {
        const attempt = get(sessionId);

        if (
            !attempt ||
            attempt.status !== 'pending_oidc' ||
            attempt.method !== method ||
            !equalTokens(attempt.state, state)
        ) {
            return null;
        }

        // Claim the callback before any asynchronous exchange.
        // Repeated callbacks must not be processed.
        attempts.set(
            sessionId,
            Object.freeze({
                id: attempt.id,
                sessionId: attempt.sessionId,
                method: attempt.method,
                action: attempt.action,

                ...(attempt.targetSubject !== undefined
                    ? { targetSubject: attempt.targetSubject }
                    : {}),

                status: 'callback_claimed',
                createdAt: attempt.createdAt,
                expiresAt: attempt.expiresAt
            })
        );

        // Internal use only: contains OIDC security parameters.
        return attempt;
    }

    function isClaimCurrent(sessionId, attemptId) {
        const attempt = get(sessionId);

        return Boolean(
            attempt &&
            attempt.id === attemptId &&
            attempt.status === 'callback_claimed'
        );
    }

    function cancel(sessionId) {
        return attempts.delete(sessionId);
    }

    function cancelAll() {
        const count = attempts.size;

        attempts.clear();

        return count;
    }

    function getStatus(sessionId) {
        const attempt = get(sessionId);

        if (!attempt) {
            return null;
        }

        // Only non-sensitive progress information.
        return {
            method: attempt.method,
            action: attempt.action,
            status: attempt.status,
            expiresAt: attempt.expiresAt
        };
    }

    return Object.freeze({
        create,
        claimCallback,
        isClaimCurrent,
        cancel,
        cancelAll,
        getStatus,
        purgeExpired
    });
}
