import { readFileSync } from 'node:fs';
import * as oidc from 'openid-client';

function selectClient(config, method) {
    if (method === 'totp') {
        return {
            clientId: config.totpClientId,
            secretFile: config.totpClientSecretFile,
            callback: `${config.gateOrigin}/oidc/totp/callback`
        };
    }

    if (method === 'face') {
        return {
            clientId: config.faceClientId,
            secretFile: config.faceClientSecretFile,
            callback: `${config.gateOrigin}/oidc/face/callback`
        };
    }

    throw new Error('Unsupported authentication method');
}

export function getRedirectUri(config, method) {
    return selectClient(config, method).callback;
}

export async function discoverOidcClient(
    config,
    method,
    secret
) {
    const selected = selectClient(config, method);

    if (typeof secret !== 'string' || !secret.trim()) {
        throw new Error('Missing client secret');
    }

    const client = await oidc.discovery(
        new URL(config.keycloakIssuer),
        selected.clientId,
        {
            client_secret: secret,
            require_auth_time: true
        },
        oidc.ClientSecretPost(secret),
        {
            timeout: 10,
            execute: [
                oidc.enableNonRepudiationChecks
            ]
        }
    );

    const metadata = client.serverMetadata();

    if (metadata.issuer !== config.keycloakIssuer) {
        throw new Error('Unexpected Keycloak issuer');
    }

    if (
        !metadata.code_challenge_methods_supported
            ?.includes('S256')
    ) {
        throw new Error('Keycloak does not support PKCE S256');
    }

    const base =
        `${config.keycloakIssuer}/protocol/openid-connect`;

    const expectedEndpoints = {
        authorization_endpoint: `${base}/auth`,
        token_endpoint: `${base}/token`,
        introspection_endpoint: `${base}/token/introspect`,
        jwks_uri: `${base}/certs`
    };

    for (const [name, expected] of Object.entries(
        expectedEndpoints
    )) {
        if (metadata[name] !== expected) {
            throw new Error(`Unexpected OIDC endpoint: ${name}`);
        }
    }

    return client;
}

export async function loadOidcClients(config) {
    const clients = {};

    for (const method of ['totp', 'face']) {
        const selected = selectClient(config, method);

        const secret = readFileSync(
            selected.secretFile,
            'utf8'
        ).trim();

        clients[method] = await discoverOidcClient(
            config,
            method,
            secret
        );
    }

    return Object.freeze(clients);
}

export function buildLoginUrl(config, client, attempt) {
    const selected = selectClient(config, attempt.method);

    if (client.clientMetadata().client_id !== selected.clientId) {
        throw new Error('Incorrect OIDC client for attempt');
    }

    if (
        attempt.status !== 'pending_oidc' ||
        attempt.expiresAt <= Date.now()
    ) {
        throw new Error('Invalid or expired authentication attempt');
    }

    return oidc.buildAuthorizationUrl(client, {
        response_type: 'code',
        response_mode: 'query',
        scope: 'openid',

        redirect_uri: selected.callback,

        state: attempt.state,
        nonce: attempt.nonce,

        code_challenge: attempt.codeChallenge,
        code_challenge_method: 'S256',

        prompt: 'login',
        max_age: '0'
    });
}

