import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionStore } from '../src/session.js';
import { createAttemptStore } from '../src/attempt.js';

import {
    handleOidcCallback
} from '../src/callback.js';

const config = {
    gateOrigin: 'https://gate.test:8444',
    keycloakIssuer:
        'https://id.test:8443/realms/multi-factor-authentication',
    totpClientId: 'gate-totp',
    faceClientId: 'gate-face'
};

function setup(method = 'totp', overrides = {}) {
    const sessions = createSessionStore();
    const attempts = createAttemptStore();

    const { token, session } = sessions.create();

    const attempt = attempts.create(
        session,
        method,
        'view'
    );

    const clients = {
        totp: {
            clientMetadata: () => ({
                client_id: 'gate-totp'
            })
        },
        face: {
            clientMetadata: () => ({
                client_id: 'gate-face'
            })
        }
    };

    const callbackUrl = new URL(
        `${config.gateOrigin}/oidc/${method}/callback`
    );

    callbackUrl.searchParams.set('code', 'test-code');
    callbackUrl.searchParams.set('state', attempt.state);
    callbackUrl.searchParams.set('iss', config.keycloakIssuer);

    const now = Math.floor(Date.now() / 1000);

    const claims = {
        iss: config.keycloakIssuer,
        sub: 'test-account-id',
        aud: `gate-${method}`,
        nonce: attempt.nonce,
        auth_time: now,
        exp: now + 300,
        ...overrides
    };

    const fakeExchange = async (client, url, checks) => {
        assert.equal(
            client.clientMetadata().client_id,
            `gate-${method}`
        );

        assert.equal(checks.expectedState, attempt.state);
        assert.equal(checks.expectedNonce, attempt.nonce);

        assert.equal(
            checks.pkceCodeVerifier,
            attempt.codeVerifier
        );

        assert.equal(checks.maxAge, 0);

        return {
            claims: () => claims,
            access_token: 'test-access-token',
            id_token: 'test-id-token'
        };
    };

    return {
        config,
        clients,
        sessions,
        attempts,

        sessionToken: token,
        method,
        callbackUrl,
        exchangeCode: fakeExchange,

        originalSession: session
    };
}

for (const method of ['totp', 'face']) {
    test(`${method} callback validates identity`, async () => {
        const data = setup(method);
        const result = await handleOidcCallback(data);

        assert.equal(
            result.identity.subject,
            'test-account-id'
        );

        assert.equal(
            result.status,
            'identity_validated'
        );

        assert.equal(result.authorized, false);
        assert.equal(result.attempt.method, method);
        assert.equal(result.attempt.action, 'view');
    });
}

test('missing session is rejected', async () => {
    const data = setup();

    data.sessionToken = 'invalid';

    await assert.rejects(
        () => handleOidcCallback(data),
        /Invalid or expired session/
    );
});

test('incorrect callback state is rejected', async () => {
    const data = setup();

    data.callbackUrl.searchParams.set(
        'state',
        'incorrect'
    );

    await assert.rejects(
        () => handleOidcCallback(data),
        /Invalid authentication callback/
    );
});

test('duplicate callback parameters are rejected', async () => {
    const data = setup();

    data.callbackUrl.searchParams.append(
        'code',
        'another-code'
    );

    await assert.rejects(
        () => handleOidcCallback(data),
        /Duplicate callback parameter/
    );
});

test('incorrect callback issuer is rejected', async () => {
    const data = setup();

    data.callbackUrl.searchParams.set(
        'iss',
        'https://other.test'
    );

    await assert.rejects(
        () => handleOidcCallback(data),
        /Invalid callback issuer/
    );
});

test('incorrect token audience is rejected', async () => {
    const data = setup('totp', {
        aud: 'gate-face'
    });

    await assert.rejects(
        () => handleOidcCallback(data),
        /OIDC callback validation failed/
    );
});

test('incorrect token issuer is rejected', async () => {
    const data = setup('face', {
        iss: 'https://other.test'
    });

    await assert.rejects(
        () => handleOidcCallback(data),
        /OIDC callback validation failed/
    );
});

test('expired identity token is rejected', async () => {
    const data = setup('totp', {
        exp: Math.floor(Date.now() / 1000) - 60
    });

    await assert.rejects(
        () => handleOidcCallback(data),
        /OIDC callback validation failed/
    );
});

test('stale authentication is rejected', async () => {
    const data = setup('totp', {
        auth_time: Math.floor(Date.now() / 1000) - 600
    });

    await assert.rejects(
        () => handleOidcCallback(data),
        /OIDC callback validation failed/
    );
});

test('incorrect nonce is rejected', async () => {
    const data = setup('face', {
        nonce: 'incorrect'
    });

    await assert.rejects(
        () => handleOidcCallback(data),
        /OIDC callback validation failed/
    );
});

test('successful callback rotates the session', async () => {
    const data = setup();

    const result = await handleOidcCallback(data);

    assert.notEqual(
        result.sessionToken,
        data.sessionToken
    );

    assert.equal(
        data.sessions.get(data.sessionToken),
        null
    );

    assert.notEqual(
        data.sessions.get(result.sessionToken),
        null
    );
});

test('successful callback cannot be replayed', async () => {
    const data = setup();

    await handleOidcCallback(data);

    await assert.rejects(
        () => handleOidcCallback(data)
    );
});

test('cancellation during token exchange is rejected', async () => {
    const data = setup();
    const exchange = data.exchangeCode;

    data.exchangeCode = async (...args) => {
        data.attempts.cancel(data.originalSession.id);

        return exchange(...args);
    };

    await assert.rejects(
        () => handleOidcCallback(data),
        /OIDC callback validation failed/
    );
});

test('token exchange failure invalidates attempt', async () => {
    const data = setup();

    data.exchangeCode = async () => {
        throw new Error('Token exchange failed');
    };

    await assert.rejects(
        () => handleOidcCallback(data),
        /OIDC callback validation failed/
    );

    assert.equal(
        data.attempts.getStatus(data.originalSession.id),
        null
    );
});

test('successful OIDC callback binds verified identity to the rotated session', async () => {
    const data = setup();

    const result = await handleOidcCallback(data);

    const stored = data.sessions.get(
        result.sessionToken
    );

    assert.deepEqual(stored.account, {
        issuer: result.identity.issuer,
        subject: result.identity.subject
    });

    assert.ok(Object.isFrozen(stored.account));

    assert.equal(
        stored.account.subject,
        'test-account-id'
    );

    assert.equal(
        data.sessions.revokeAccount(
            result.identity
        ).length,
        1
    );

    assert.equal(
        data.sessions.get(result.sessionToken),
        null
    );
});

test('global attempt invalidation prevents an in-flight OIDC callback from completing', async () => {
    const data = setup();

    const originalExchange = data.exchangeCode;

    data.exchangeCode = async (...args) => {
        data.attempts.cancelAll();

        return originalExchange(...args);
    };

    await assert.rejects(
        () => handleOidcCallback(data),
        /OIDC callback validation failed/
    );

    const original = data.sessions.get(
        data.sessionToken
    );

    assert.ok(original);

    assert.equal(
        original.account,
        null
    );

    assert.equal(
        data.attempts.getStatus(
            data.originalSession.id
        ),
        null
    );
});
