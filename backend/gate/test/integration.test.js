import test from 'node:test';
import assert from 'node:assert/strict';
import * as oidc from 'openid-client';

import { createApp } from '../src/app.js';

async function withApp(callback) {
    const config = {
        gateOrigin: '',
        keycloakIssuer:
            'https://id.test:8443/realms/multi-factor-authentication',

        totpClientId: 'gate-totp',
        faceClientId: 'gate-face',
        resourceAudience: 'lab-resource',
        attemptTtlSeconds: 300
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

    const clients = {
        totp: mockClient('totp'),
        face: mockClient('face')
    };

    let amrOverride;

    const exchangeCode = async (client, url, checks) => {
        const clientId =
            client.clientMetadata().client_id;

        const now = Math.floor(Date.now() / 1000);

        return {
            access_token: 'test-access-token',
            id_token: 'test-id-token',

            claims: () => ({
                iss: config.keycloakIssuer,
                sub: 'test-account',
                aud: clientId,
                nonce: checks.expectedNonce,
                auth_time: now,
                exp: now + 300,

                amr: amrOverride ??
                    (clientId === 'gate-totp'
                        ? ['pwd', 'otp']
                        : ['pwd'])
            })
        };
    };

    const introspect = async client => {
        const clientId =
            client.clientMetadata().client_id;

        return {
            active: true,
            iss: config.keycloakIssuer,
            sub: 'test-account',
            client_id: clientId,
            azp: clientId,
            aud: [clientId, 'lab-resource'],
            exp: Math.floor(Date.now() / 1000) + 300,
            realm_access: {
                roles: ['regular_user']
            }
        };
    };

    const server = createApp({
        config,
        clients,
        exchangeCode,
        introspect
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    config.gateOrigin =
        `http://127.0.0.1:${server.address().port}`;

    let cookie = '';
    let csrfToken = '';

    async function request(path, options = {}) {
        const response = await fetch(
            `${config.gateOrigin}${path}`,
            {
                ...options,
                redirect: 'manual',

                headers: {
                    ...(cookie ? { Cookie: cookie } : {}),
                    ...options.headers
                }
            }
        );

        const newCookie = response.headers.get(
            'set-cookie'
        );

        if (newCookie) {
            cookie = newCookie.split(';')[0];
        }

        return response;
    }

    async function initialize() {
        const response = await request(
            '/attempts/current'
        );

        const status = await response.json();

        csrfToken = status.csrfToken;

        return status;
    }

    async function post(
        path,
        body = {},
        headers = {}
    ) {
        return request(path, {
            method: 'POST',

            headers: {
                'Content-Type': 'application/json',
                Origin: config.gateOrigin,
                'X-CSRF-Token': csrfToken,
                ...headers
            },

            body: JSON.stringify(body)
        });
    }

    async function begin(method = 'totp', action = 'view') {
        const response = await post('/attempts', {
            method,
            action
        });

        assert.equal(response.status, 303);

        const loginUrl = new URL(
            response.headers.get('location')
        );

        const query = new URLSearchParams({
            code: 'test-code',
            state: loginUrl.searchParams.get('state'),
            iss: config.keycloakIssuer
        });

        return {
            loginUrl,
            callbackPath:
                `/oidc/${method}/callback?${query}`
        };
    }

    try {
        await callback({
            request,
            initialize,
            post,
            begin,

            getCookie: () => cookie,

            setAmr: value => {
                amrOverride = value;
            }
        });

    } finally {
        await new Promise(resolve => {
            server.close(resolve);
        });
    }
}

test('browser session initializes safely', async () => {
    await withApp(async app => {
        const status = await app.initialize();

        assert.equal(status.status, 'idle');
        assert.equal(status.csrfToken.length, 43);

        assert.ok(
            app.getCookie().startsWith(
                '__Host-mfa_session='
            )
        );

        assert.equal(status.accessToken, undefined);
    });
});

test('authentication requires a valid session', async () => {
    await withApp(async app => {
        const response = await app.post('/attempts', {
            method: 'totp',
            action: 'view'
        });

        assert.equal(response.status, 401);
    });
});

test('cross-origin authentication requests are denied', async () => {
    await withApp(async app => {
        await app.initialize();

        const response = await app.post(
            '/attempts',
            {
                method: 'totp',
                action: 'view'
            },
            {
                Origin: 'https://other.test'
            }
        );

        assert.equal(response.status, 403);
    });
});

test('invalid CSRF tokens are denied', async () => {
    await withApp(async app => {
        await app.initialize();

        const response = await app.post(
            '/attempts',
            {
                method: 'totp',
                action: 'view'
            },
            {
                'X-CSRF-Token': 'invalid'
            }
        );

        assert.equal(response.status, 403);
    });
});

test('TOTP login redirects to the correct client', async () => {
    await withApp(async app => {
        await app.initialize();

        const { loginUrl } = await app.begin();

        assert.equal(
            loginUrl.searchParams.get('client_id'),
            'gate-totp'
        );

        assert.equal(
            loginUrl.searchParams.get(
                'code_challenge_method'
            ),
            'S256'
        );
    });
});

test('TOTP callback rotates session and stores safe evidence', async () => {
    await withApp(async app => {
        await app.initialize();

        const oldCookie = app.getCookie();

        const { callbackPath } = await app.begin();

        const response = await app.request(
            callbackPath
        );

        assert.equal(response.status, 303);
        assert.notEqual(app.getCookie(), oldCookie);

        const status = await app.initialize();

        assert.equal(status.status, 'totp_verified');
        assert.equal(status.method, 'totp');
        assert.equal(status.accessToken, undefined);
        assert.equal(status.idToken, undefined);

        const replay = await app.request(
            callbackPath
        );

        assert.equal(replay.status, 401);
    });
});

test('face login remains pending after password verification', async () => {
    await withApp(async app => {
        await app.initialize();

        const { callbackPath } = await app.begin(
            'face'
        );

        const response = await app.request(
            callbackPath
        );

        assert.equal(response.status, 303);

        const status = await app.initialize();

        assert.equal(status.status, 'pending_face');
        assert.equal(status.method, 'face');
    });
});

test('password-only TOTP callback is denied', async () => {
    await withApp(async app => {
        await app.initialize();

        app.setAmr(['pwd']);

        const { callbackPath } = await app.begin();

        const response = await app.request(
            callbackPath
        );

        assert.equal(response.status, 401);

        const status = await app.initialize();

        assert.equal(status.status, 'idle');
    });
});

test('cancelled attempts cannot complete callbacks', async () => {
    await withApp(async app => {
        await app.initialize();

        const { callbackPath } = await app.begin();

        const cancelled = await app.post(
            '/attempts/cancel'
        );

        assert.equal(cancelled.status, 200);

        const response = await app.request(
            callbackPath
        );

        assert.equal(response.status, 401);
    });
});

test('logout invalidates the local session', async () => {
    await withApp(async app => {
        await app.initialize();

        const response = await app.post('/logout');

        assert.equal(response.status, 200);

        assert.ok(
            response.headers
                .get('set-cookie')
                .includes('Max-Age=0')
        );

        const denied = await app.post('/attempts', {
            method: 'totp',
            action: 'view'
        });

        assert.equal(denied.status, 401);
    });
});

test('protected operations remain denied after TOTP verification', async () => {
    await withApp(async app => {
        await app.initialize();

        const { callbackPath } = await app.begin();

        const callback = await app.request(
            callbackPath
        );

        assert.equal(callback.status, 303);

        await app.initialize();

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 503);
    });
});
