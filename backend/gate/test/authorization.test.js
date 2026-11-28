import test from 'node:test';
import assert from 'node:assert/strict';

import { createSessionStore } from '../src/session.js';
import { createAttemptStore } from '../src/attempt.js';
import { createProofStore } from '../src/proof.js';

import {
    revalidateClaim
} from '../src/authorization.js';

const config = {
    keycloakIssuer:
        'https://id.test:8443/realms/multi-factor-authentication',

    totpClientId: 'gate-totp',
    faceClientId: 'gate-face',
    resourceAudience: 'lab-resource'
};

function setup(action = 'view', overrides = {}) {
    let clock = Date.now();

    const now = () => clock;

    const sessions = createSessionStore({ now });
    const attempts = createAttemptStore({ now });
    const proofs = createProofStore({ now });

    const original = sessions.create();

    const attempt = attempts.create(
        original.session,
        'totp',
        action
    );

    const rotated = sessions.rotate(original.token);

    const roles = action === 'admin'
        ? ['administrator']
        : ['regular_user'];

    const identity = {
        issuer: config.keycloakIssuer,
        subject: 'test-account',
        authTime: Math.floor(clock / 1000)
    };

    const result = {
        status: 'identity_validated',
        authorized: false,

        session: rotated.session,
        identity,

        attempt: {
            id: attempt.id,
            method: 'totp',
            action,
            expiresAt: attempt.expiresAt
        },

        evidence: {
            issuer: identity.issuer,
            subject: identity.subject,

            method: 'totp',
            action,

            status: 'totp_verified',
            authorized: false,

            roles,

            factors: {
                passwordVerified: true,
                totpVerified: true,
                faceVerified: false
            },

            expiresAt: attempt.expiresAt
        },

        accessToken: 'test-access-token',
        idToken: 'test-id-token'
    };

    proofs.save(rotated.session, result);

    const claimed = proofs.claim(rotated.session);

    const clients = {
        totp: {
            clientMetadata: () => ({
                client_id: 'gate-totp'
            })
        }
    };

    const introspect = async (
        client,
        token,
        parameters
    ) => {
        assert.equal(
            client.clientMetadata().client_id,
            'gate-totp'
        );

        assert.equal(token, 'test-access-token');

        assert.equal(
            parameters.token_type_hint,
            'access_token'
        );

        return {
            active: true,

            iss: config.keycloakIssuer,
            sub: identity.subject,

            client_id: 'gate-totp',
            azp: 'gate-totp',

            aud: [
                'gate-totp',
                'lab-resource'
            ],

            exp: Math.floor(Date.now() / 1000) + 300,

            realm_access: {
                roles
            },

            ...overrides
        };
    };

    return {
        config,
        clients,
        sessions,
        proofs,

        sessionToken: rotated.token,
        session: rotated.session,

        claimed,
        introspect,
        result,

        advance: milliseconds => {
            clock += milliseconds;
        }
    };
}

test('valid TOTP proof is successfully revalidated', async () => {
    const data = setup();

    const result = await revalidateClaim(data);

    assert.equal(result.status, 'revalidated');
    assert.equal(result.method, 'totp');
    assert.equal(result.action, 'view');
    assert.equal(result.subject, 'test-account');
    assert.equal(result.sessionId, data.session.id);

    assert.deepEqual(
        result.roles,
        ['regular_user']
    );

    // Revalidation does not consume the proof.
    assert.equal(
        data.proofs.isClaimCurrent(
            data.session,
            data.claimed
        ),
        true
    );
});

test('administrator proof is successfully revalidated', async () => {
    const data = setup('admin');

    const result = await revalidateClaim(data);

    assert.equal(result.status, 'revalidated');
    assert.equal(result.action, 'admin');

    assert.deepEqual(
        result.roles,
        ['administrator']
    );
});

for (const [name, overrides, expectedError] of [
    [
        'inactive access token',
        { active: false },
        /Access token is inactive/
    ],
    [
        'different account identity',
        { sub: 'another-account' },
        /Access token subject mismatch/
    ],
    [
        'missing resource audience',
        { aud: ['gate-totp'] },
        /Incorrect access token audience/
    ],
    [
        'expired access token',
        { exp: 1 },
        /Access token expired/
    ]
]) {
    test(`${name} prevents execution`, async () => {
        const data = setup('view', overrides);

        await assert.rejects(
            () => revalidateClaim(data),
            expectedError
        );

        assert.equal(
            data.proofs.get(data.session),
            null
        );
    });
}

test('insufficient current administrator role is rejected', async () => {
    const data = setup('admin', {
        realm_access: {
            roles: ['regular_user']
        }
    });

    await assert.rejects(
        () => revalidateClaim(data),
        /Insufficient current application role/
    );

    assert.equal(
        data.proofs.get(data.session),
        null
    );
});

test('Keycloak outage invalidates the claimed proof', async () => {
    const data = setup();

    data.introspect = async () => {
        throw new Error('Keycloak unavailable');
    };

    await assert.rejects(
        () => revalidateClaim(data),
        /Keycloak unavailable/
    );

    assert.equal(
        data.proofs.get(data.session),
        null
    );
});

test('cancellation during introspection prevents execution', async () => {
    const data = setup();
    const original = data.introspect;

    data.introspect = async (...args) => {
        data.proofs.revoke(data.session.id);

        return original(...args);
    };

    await assert.rejects(
        () => revalidateClaim(data),
        /Authentication claim is no longer valid/
    );
});

test('session revocation during introspection prevents execution', async () => {
    const data = setup();
    const original = data.introspect;

    data.introspect = async (...args) => {
        data.sessions.revoke(data.sessionToken);

        return original(...args);
    };

    await assert.rejects(
        () => revalidateClaim(data),
        /Authentication claim is no longer valid/
    );

    assert.equal(
        data.proofs.get(data.session),
        null
    );
});

test('proof expiration during introspection prevents execution', async () => {
    const data = setup();
    const original = data.introspect;

    data.introspect = async (...args) => {
        data.advance(300001);

        return original(...args);
    };

    await assert.rejects(
        () => revalidateClaim(data),
        /Authentication claim is no longer valid/
    );
});

test('another session cannot revalidate a claimed proof', async () => {
    const data = setup();

    const other = data.sessions.create();

    await assert.rejects(
        () => revalidateClaim({
            ...data,
            sessionToken: other.token
        }),
        /Authentication claim is no longer valid/
    );

    // The original valid claim must not be revoked.
    assert.equal(
        data.proofs.isClaimCurrent(
            data.session,
            data.claimed
        ),
        true
    );
});

test('consumed proof cannot be revalidated again', async () => {
    const data = setup();

    data.proofs.consume(
        data.session,
        data.claimed
    );

    await assert.rejects(
        () => revalidateClaim(data),
        /Authentication claim is no longer valid/
    );
});

test('failed stale claim cannot revoke a replacement proof', async () => {
    const data = setup();
    const original = data.introspect;

    data.introspect = async (...args) => {
        data.proofs.revoke(data.session.id);

        data.proofs.save(
            data.session,
            data.result
        );

        return original(...args);
    };

    await assert.rejects(
        () => revalidateClaim(data),
        /Authentication claim is no longer valid/
    );

    assert.ok(
        data.proofs.get(data.session)
    );

    assert.ok(
        data.proofs.claim(data.session)
    );
});
