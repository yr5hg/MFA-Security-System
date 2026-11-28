import * as oidc from 'openid-client';

import { getRedirectUri } from './oidc.js';

function validateCallbackUrl(config, method, callbackUrl) {
    const url = new URL(callbackUrl);
    const expected = new URL(
        getRedirectUri(config, method)
    );

    if (
        url.origin !== expected.origin ||
        url.pathname !== expected.pathname ||
        url.username ||
        url.password ||
        url.hash
    ) {
        throw new Error('Invalid callback URL');
    }

    for (const name of ['state', 'code', 'iss', 'error']) {
        if (url.searchParams.getAll(name).length > 1) {
            throw new Error('Duplicate callback parameter');
        }
    }

    if (
        url.searchParams.get('iss') !== config.keycloakIssuer
    ) {
        throw new Error('Invalid callback issuer');
    }

    return url;
}

export function validateIdentityClaims(
    config,
    attempt,
    claims
) {
    if (!claims || typeof claims !== 'object') {
        throw new Error('Missing identity claims');
    }

    const clientId = attempt.method === 'totp'
        ? config.totpClientId
        : config.faceClientId;

    const audiences = Array.isArray(claims.aud)
        ? claims.aud
        : [claims.aud];

    if (claims.iss !== config.keycloakIssuer) {
        throw new Error('Invalid token issuer');
    }

    if (!audiences.includes(clientId)) {
        throw new Error('Invalid token audience');
    }

    if (
        (claims.azp !== undefined &&
            claims.azp !== clientId) ||
        (audiences.length > 1 &&
            claims.azp !== clientId)
    ) {
        throw new Error('Invalid authorized party');
    }

    if (
        typeof claims.sub !== 'string' ||
        !claims.sub.trim()
    ) {
        throw new Error('Missing account identifier');
    }

    if (claims.nonce !== attempt.nonce) {
        throw new Error('Invalid token nonce');
    }

    const now = Math.floor(Date.now() / 1000);
    const started = Math.floor(attempt.createdAt / 1000);

    if (
        !Number.isSafeInteger(claims.exp) ||
        claims.exp <= now
    ) {
        throw new Error('Expired identity token');
    }

    if (
        !Number.isSafeInteger(claims.auth_time) ||
        claims.auth_time < started - 5 ||
        claims.auth_time > now + 5
    ) {
        throw new Error('Authentication is not fresh');
    }

    return Object.freeze({
        issuer: claims.iss,
        subject: claims.sub,
        authTime: claims.auth_time
    });
}

export async function handleOidcCallback({
    config,
    clients,
    sessions,
    attempts,
    sessionToken,
    method,
    callbackUrl,
    exchangeCode = oidc.authorizationCodeGrant,
    verifyEvidence = null
}) {
    if (!['totp', 'face'].includes(method)) {
        throw new Error('Unsupported callback method');
    }

    const session = sessions.get(sessionToken);

    if (!session) {
        throw new Error('Invalid or expired session');
    }

    const url = validateCallbackUrl(
        config,
        method,
        callbackUrl
    );

    const attempt = attempts.claimCallback(
        session.id,
        method,
        url.searchParams.get('state')
    );

    if (!attempt) {
        throw new Error('Invalid authentication callback');
    }

    let stage = 'callback_validation';

    try {
        if (
            url.searchParams.has('error') ||
            !url.searchParams.get('code')
        ) {
            throw new Error('Authorization failed');
        }

        const client = clients[method];

        const expectedClientId = method === 'totp'
            ? config.totpClientId
            : config.faceClientId;

        if (
            !client ||
            client.clientMetadata().client_id !== expectedClientId
        ) {
            throw new Error('Incorrect callback client');
        }

        stage = 'token_exchange';

        const tokens = await exchangeCode(
            client,
            url,
            {
                pkceCodeVerifier: attempt.codeVerifier,
                expectedState: attempt.state,
                expectedNonce: attempt.nonce,
                maxAge: 0,
                idTokenExpected: true
            }
        );

        const claims = tokens.claims();

        stage = 'identity_validation';

        const identity = validateIdentityClaims(
            config,
            attempt,
            claims
        );

        if (
            typeof tokens.access_token !== 'string' ||
            !tokens.access_token ||
            typeof tokens.id_token !== 'string' ||
            !tokens.id_token
        ) {
            throw new Error('Required tokens missing');
        }

        stage = 'authentication_evidence';

        const evidence = verifyEvidence
            ? await verifyEvidence({
                status: 'identity_validated',
                attempt,
                identity,
                claims,
                accessToken: tokens.access_token
            })
            : null;

        stage = 'session_validation';

        // Recheck after all asynchronous validation.
        if (
            sessions.get(sessionToken)?.id !== session.id ||
            !attempts.isClaimCurrent(
                session.id,
                attempt.id
            )
        ) {
            throw new Error('Authentication attempt no longer valid');
        }

        // Prevent session fixation.
        const rotated = sessions.rotate(
            sessionToken,
            identity
        );

        if (!rotated) {
            throw new Error('Session rotation failed');
        }

        attempts.cancel(session.id);

        // Internal server-side result only.
        // Never serialize this object to the browser.
        return {
            sessionToken: rotated.token,
            session: rotated.session,

            identity,

            attempt: {
                id: attempt.id,
                method: attempt.method,
                action: attempt.action,

                ...(attempt.targetSubject !== undefined
                    ? { targetSubject: attempt.targetSubject }
                    : {}),

                expiresAt: attempt.expiresAt
            },

            claims,
            accessToken: tokens.access_token,
            idToken: tokens.id_token,

            evidence,
            status: 'identity_validated',
            authorized: false
        };

    } catch (error) {
        const safeReasons = [
            'Authorization failed',
            'Incorrect callback client',
            'Invalid token issuer',
            'Invalid token audience',
            'Invalid authorized party',
            'Invalid token nonce',
            'Missing identity claims',
            'Missing account identifier',
            'Expired identity token',
            'Authentication is not fresh',
            'Required tokens missing',
            'Missing authentication method evidence',
            'Incorrect authentication method evidence',
            'Access token is inactive',
            'Incorrect access token issuer',
            'Access token subject mismatch',
            'Access token client mismatch',
            'Incorrect access token audience',
            'Access token expired',
            'Access token is not yet valid',
            'Missing or invalid realm roles',
            'No permitted application role',
            'Insufficient application role',
            'Authentication attempt expired',
            'Authentication attempt no longer valid',
            'Session rotation failed'
        ];

        const code = error?.code ?? error?.cause?.code;

        const safeCode =
            typeof code === 'string' &&
            /^OAUTH_[A-Z0-9_]{1,80}$/.test(code)
                ? code
                : 'unclassified';

        console.warn('[OIDC diagnostic]', JSON.stringify({
            method,
            stage,
            reason: safeReasons.includes(error?.message)
                ? error.message
                : 'Library or protocol validation failure',
            code: safeCode
        }));

        if (
            attempts.isClaimCurrent(
                session.id,
                attempt.id
            )
        ) {
            attempts.cancel(session.id);
        }

        throw new Error('OIDC callback validation failed');
    }
}
