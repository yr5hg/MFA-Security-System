import test from 'node:test';
import assert from 'node:assert/strict';

import {
    validateAmr,
    extractApplicationRoles,
    isActionAllowed,
    validateIntrospection,
    inspectAccessToken,
    validateAuthenticationEvidence
} from '../src/evidence.js';

const config = {
    keycloakIssuer:
        'https://id.test:8443/realms/multi-factor-authentication',

    totpClientId: 'gate-totp',
    faceClientId: 'gate-face',
    resourceAudience: 'lab-resource'
};

const identity = {
    issuer: config.keycloakIssuer,
    subject: 'test-account-id'
};

function activeToken(method = 'totp', overrides = {}) {
    return {
        active: true,
        iss: config.keycloakIssuer,
        sub: identity.subject,
        client_id: `gate-${method}`,
        azp: `gate-${method}`,

        aud: [
            `gate-${method}`,
            'lab-resource'
        ],

        exp: Math.floor(Date.now() / 1000) + 300,

        realm_access: {
            roles: [
                'regular_user',
                'offline_access'
            ]
        },

        ...overrides
    };
}

function setup(
    method = 'totp',
    action = 'view',
    overrides = {}
) {
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

    const callbackResult = {
        status: 'identity_validated',

        identity,

        attempt: {
            method,
            action,
            expiresAt: Date.now() + 300000
        },

        claims: {
            amr: method === 'totp'
                ? ['pwd', 'otp']
                : ['pwd'],

            exp: Math.floor(Date.now() / 1000) + 300
        },

        accessToken: 'test-access-token'
    };

    const introspect = async (
        client,
        token,
        parameters
    ) => {
        assert.equal(
            client.clientMetadata().client_id,
            `gate-${method}`
        );

        assert.equal(token, 'test-access-token');

        assert.equal(
            parameters.token_type_hint,
            'access_token'
        );

        return activeToken(method, overrides);
    };

    return {
        config,
        clients,
        callbackResult,
        introspect
    };
}

test('TOTP requires password and OTP evidence', () => {
    const factors = validateAmr(
        'totp',
        ['pwd', 'otp']
    );

    assert.equal(factors.passwordVerified, true);
    assert.equal(factors.totpVerified, true);
    assert.equal(factors.faceVerified, false);
});

test('face authentication still requires face verification', () => {
    const factors = validateAmr('face', ['pwd']);

    assert.equal(factors.passwordVerified, true);
    assert.equal(factors.totpVerified, false);
    assert.equal(factors.faceVerified, false);
});

test('password-only TOTP authentication is rejected', () => {
    assert.throws(
        () => validateAmr('totp', ['pwd']),
        /Incorrect authentication method evidence/
    );
});

test('missing AMR evidence is rejected', () => {
    assert.throws(
        () => validateAmr('totp', undefined),
        /Missing authentication method evidence/
    );
});

test('cross-method and unexpected AMR are rejected', () => {
    assert.throws(
        () => validateAmr('face', ['pwd', 'otp']),
        /Incorrect authentication method evidence/
    );

    assert.throws(
        () => validateAmr('totp', ['pwd', 'face']),
        /Incorrect authentication method evidence/
    );
});

test('only application realm roles are extracted', () => {
    const roles = extractApplicationRoles({
        realm_access: {
            roles: [
                'offline_access',
                'regular_user',
                'uma_authorization'
            ]
        }
    });

    assert.deepEqual(roles, ['regular_user']);
});

test('unknown application roles are rejected', () => {
    assert.throws(
        () => extractApplicationRoles({
            realm_access: {
                roles: ['offline_access']
            }
        }),
        /No permitted application role/
    );
});

test('regular user can view but cannot administer', () => {
    assert.equal(
        isActionAllowed(['regular_user'], 'view'),
        true
    );

    assert.equal(
        isActionAllowed(['regular_user'], 'admin'),
        false
    );
});

test('administrator can view and administer', () => {
    assert.equal(
        isActionAllowed(['administrator'], 'view'),
        true
    );

    assert.equal(
        isActionAllowed(['administrator'], 'admin'),
        true
    );

    assert.equal(
        isActionAllowed(['administrator'], 'delete'),
        false
    );
});

test('valid access token introspection is accepted', () => {
    const evidence = validateIntrospection({
        config,
        method: 'totp',
        identity,
        result: activeToken()
    });

    assert.equal(evidence.subject, identity.subject);

    assert.deepEqual(
        evidence.roles,
        ['regular_user']
    );
});

for (const [name, overrides, error] of [
    [
        'inactive token',
        { active: false },
        /Access token is inactive/
    ],
    [
        'incorrect issuer',
        { iss: 'https://other.test' },
        /Incorrect access token issuer/
    ],
    [
        'incorrect subject',
        { sub: 'other-account' },
        /Access token subject mismatch/
    ],
    [
        'incorrect client',
        {
            client_id: 'gate-face',
            azp: 'gate-face'
        },
        /Access token client mismatch/
    ],
    [
        'missing resource audience',
        { aud: ['gate-totp'] },
        /Incorrect access token audience/
    ],
    [
        'missing client audience',
        { aud: ['lab-resource'] },
        /Incorrect access token audience/
    ],
    [
        'expired token',
        { exp: Math.floor(Date.now() / 1000) - 10 },
        /Access token expired/
    ],
    [
        'token not yet valid',
        { nbf: Math.floor(Date.now() / 1000) + 60 },
        /Access token is not yet valid/
    ]
]) {
    test(`${name} is rejected`, () => {
        assert.throws(
            () => validateIntrospection({
                config,
                method: 'totp',
                identity,
                result: activeToken('totp', overrides)
            }),
            error
        );
    });
}

test('incorrect introspection client is rejected', async () => {
    const data = setup();

    data.clients.totp = data.clients.face;

    await assert.rejects(
        () => inspectAccessToken({
            config,
            clients: data.clients,
            method: 'totp',
            identity,
            accessToken: 'test-access-token',
            introspect: data.introspect
        }),
        /Incorrect introspection client/
    );
});

test('valid TOTP evidence is accepted', async () => {
    const result =
        await validateAuthenticationEvidence(setup());

    assert.equal(result.status, 'totp_verified');
    assert.equal(result.factors.totpVerified, true);
    assert.equal(result.authorized, false);
});

test('valid face identity remains pending', async () => {
    const result = await validateAuthenticationEvidence(
        setup('face')
    );

    assert.equal(result.status, 'pending_face');
    assert.equal(result.factors.faceVerified, false);
    assert.equal(result.authorized, false);
});

test('regular user cannot request admin operation', async () => {
    await assert.rejects(
        () => validateAuthenticationEvidence(
            setup('totp', 'admin')
        ),
        /Insufficient application role/
    );
});

test('administrator evidence permits admin action', async () => {
    const result = await validateAuthenticationEvidence(
        setup('totp', 'admin', {
            realm_access: {
                roles: ['administrator']
            }
        })
    );

    assert.equal(result.status, 'totp_verified');
    assert.equal(result.action, 'admin');
    assert.equal(result.authorized, false);
});

test('introspection failure does not authorize access', async () => {
    const data = setup();

    data.introspect = async () => {
        throw new Error('Keycloak unavailable');
    };

    await assert.rejects(
        () => validateAuthenticationEvidence(data),
        /Keycloak unavailable/
    );
});

test('expired authentication attempts are rejected', async () => {
    const data = setup();

    data.callbackResult.attempt.expiresAt =
        Date.now() - 1;

    await assert.rejects(
        () => validateAuthenticationEvidence(data),
        /Authentication attempt expired/
    );
});

test('unvalidated identity is rejected', async () => {
    const data = setup();

    data.callbackResult.status = 'pending_oidc';

    await assert.rejects(
        () => validateAuthenticationEvidence(data),
        /Identity has not been validated/
    );
});
