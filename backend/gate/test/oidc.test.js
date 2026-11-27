import test from 'node:test';
import assert from 'node:assert/strict';
import * as oidc from 'openid-client';

import {
    getRedirectUri,
    buildLoginUrl
} from '../src/oidc.js';

import { createSessionStore } from '../src/session.js';
import { createAttemptStore } from '../src/attempt.js';

const config = {
    gateOrigin: 'https://gate.test:8444',
    keycloakIssuer:
        'https://id.test:8443/realms/multi-factor-authentication',
    totpClientId: 'gate-totp',
    faceClientId: 'gate-face'
};

function mockClient(method) {
    return new oidc.Configuration(
        {
            issuer: config.keycloakIssuer,
            authorization_endpoint:
                `${config.keycloakIssuer}/protocol/openid-connect/auth`
        },
        `gate-${method}`,
        'test-only-secret'
    );
}

function newAttempt(method) {
    const session =
        createSessionStore().create().session;

    return createAttemptStore().create(
        session,
        method,
        'view'
    );
}

test('TOTP callback URI is correct', () => {
    assert.equal(
        getRedirectUri(config, 'totp'),
        'https://gate.test:8444/oidc/totp/callback'
    );
});

test('face callback URI is correct', () => {
    assert.equal(
        getRedirectUri(config, 'face'),
        'https://gate.test:8444/oidc/face/callback'
    );
});

test('unsupported authentication method is rejected', () => {
    assert.throws(
        () => getRedirectUri(config, 'password'),
        /Unsupported authentication method/
    );
});

for (const method of ['totp', 'face']) {
    test(`${method} authorization URL is secure`, () => {
        const attempt = newAttempt(method);

        const url = buildLoginUrl(
            config,
            mockClient(method),
            attempt
        );

        const params = url.searchParams;

        assert.equal(url.protocol, 'https:');

        assert.equal(
            params.get('client_id'),
            `gate-${method}`
        );

        assert.equal(
            params.get('redirect_uri'),
            getRedirectUri(config, method)
        );

        assert.equal(params.get('response_type'), 'code');
        assert.equal(params.get('scope'), 'openid');
        assert.equal(params.get('state'), attempt.state);
        assert.equal(params.get('nonce'), attempt.nonce);

        assert.equal(
            params.get('code_challenge'),
            attempt.codeChallenge
        );

        assert.equal(
            params.get('code_challenge_method'),
            'S256'
        );

        assert.equal(params.get('prompt'), 'login');
        assert.equal(params.get('max_age'), '0');

        assert.equal(params.has('client_secret'), false);
        assert.equal(params.has('code_verifier'), false);
    });
}

test('authentication clients cannot be interchanged', () => {
    assert.throws(
        () => buildLoginUrl(
            config,
            mockClient('face'),
            newAttempt('totp')
        ),
        /Incorrect OIDC client/
    );
});

test('expired attempts cannot generate login URLs', () => {
    const attempt = {
        ...newAttempt('totp'),
        expiresAt: Date.now() - 1
    };

    assert.throws(
        () => buildLoginUrl(
            config,
            mockClient('totp'),
            attempt
        ),
        /Invalid or expired authentication attempt/
    );
});

test('claimed callbacks cannot generate new login URLs', () => {
    const attempt = {
        ...newAttempt('face'),
        status: 'callback_claimed'
    };

    assert.throws(
        () => buildLoginUrl(
            config,
            mockClient('face'),
            attempt
        ),
        /Invalid or expired authentication attempt/
    );
});

