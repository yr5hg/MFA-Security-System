import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as oidc from 'openid-client';

import { createApp } from '../src/app.js';

async function withApp(
    callback,
    { enableOperations = false } = {}
) {
    const config = {
        gateOrigin: '',
        keycloakIssuer:
            'https://id.test:8443/realms/multi-factor-authentication',

        totpClientId: 'gate-totp',
        faceClientId: 'gate-face',
        resourceAudience: 'lab-resource',
        attemptTtlSeconds: 300
    };

    let resourceDirectory;

    if (enableOperations) {
        resourceDirectory = mkdtempSync(
            join(tmpdir(), 'mfa-execution-test-')
        );

        config.protectedResourceFile = join(
            resourceDirectory,
            'confidential.txt'
        );

        writeFileSync(
            config.protectedResourceFile,
            'CONFIDENTIAL TEST RESOURCE',
            { mode: 0o600 }
        );
    }

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
    let introspectionOverrides = {};
    let introspectionHook = null;

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
        if (introspectionHook) {
            await introspectionHook();
        }
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
            },

            ...introspectionOverrides
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
            },

            setIntrospection: value => {
                introspectionOverrides = value;
            },

            setIntrospectionHook: callback => {
                introspectionHook = callback;
            },

            removeResource: () => {
                rmSync(config.protectedResourceFile);
            }
        });

    } finally {
        await new Promise(resolve => {
            server.close(resolve);
        });

        if (resourceDirectory) {
            rmSync(resourceDirectory, {
                recursive: true,
                force: true
            });
        }
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
async function withOperations(callback) {
    return withApp(callback, {
        enableOperations: true
    });
}

async function authenticate(
    app,
    action = 'view',
    method = 'totp'
) {
    await app.initialize();

    const { callbackPath } = await app.begin(
        method,
        action
    );

    const response = await app.request(callbackPath);

    assert.equal(response.status, 303);

    await app.initialize();
}

test('verified TOTP user executes view operation only once', async () => {
    await withOperations(async app => {
        await authenticate(app);

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 200);

        const result = await response.json();

        assert.equal(result.status, 'executed');
        assert.equal(result.action, 'view');

        assert.equal(
            result.content,
            'CONFIDENTIAL TEST RESOURCE'
        );

        assert.equal(result.accessToken, undefined);

        const replay = await app.post(
            '/operations/execute'
        );

        assert.equal(replay.status, 409);

        const status = await app.initialize();

        assert.equal(status.status, 'idle');
    });
});

test('administrator executes admin integrity inspection', async () => {
    await withOperations(async app => {
        app.setIntrospection({
            realm_access: {
                roles: ['administrator']
            }
        });

        await authenticate(app, 'admin');

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 200);

        const result = await response.json();

        assert.equal(result.action, 'admin');

        assert.equal(
            result.resourceIntegrity.algorithm,
            'SHA-256'
        );

        assert.equal(
            result.resourceIntegrity.digest.length,
            64
        );

        assert.equal(result.content, undefined);
    });
});

test('pending face authentication cannot release resource', async () => {
    await withOperations(async app => {
        await authenticate(app, 'view', 'face');

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 403);
    });
});

test('unauthenticated execution request is denied', async () => {
    await withOperations(async app => {
        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 401);
    });
});

test('execution enforces same origin and CSRF protection', async () => {
    await withOperations(async app => {
        await authenticate(app);

        const crossOrigin = await app.post(
            '/operations/execute',
            {},
            { Origin: 'https://other.test' }
        );

        assert.equal(crossOrigin.status, 403);

        const invalidCsrf = await app.post(
            '/operations/execute',
            {},
            { 'X-CSRF-Token': 'invalid' }
        );

        assert.equal(invalidCsrf.status, 403);
    });
});

test('browser cannot override protected action or role', async () => {
    await withOperations(async app => {
        await authenticate(app);

        const response = await app.post(
            '/operations/execute',
            {
                action: 'admin',
                role: 'administrator'
            }
        );

        assert.equal(response.status, 400);

        // The legitimate original action remains available.
        const valid = await app.post(
            '/operations/execute'
        );

        assert.equal(valid.status, 200);

        const result = await valid.json();

        assert.equal(result.action, 'view');
    });
});

test('revoked access token prevents protected execution', async () => {
    await withOperations(async app => {
        await authenticate(app);

        app.setIntrospection({
            active: false
        });

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 403);

        // Failed revalidation invalidates the proof.
        app.setIntrospection({
            active: true
        });

        const retry = await app.post(
            '/operations/execute'
        );

        assert.equal(retry.status, 409);
    });
});

test('insufficient revalidated role prevents admin operation', async () => {
    await withOperations(async app => {
        app.setIntrospection({
            realm_access: {
                roles: ['administrator']
            }
        });

        await authenticate(app, 'admin');

        app.setIntrospection({
            realm_access: {
                roles: ['regular_user']
            }
        });

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 403);
    });
});

test('Keycloak outage prevents protected execution', async () => {
    await withOperations(async app => {
        await authenticate(app);

        app.setIntrospectionHook(async () => {
            throw new Error('Keycloak unavailable');
        });

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 503);

        app.setIntrospectionHook(null);

        const retry = await app.post(
            '/operations/execute'
        );

        assert.equal(retry.status, 409);
    });
});

test('concurrent requests cannot execute the same proof twice', async () => {
    await withOperations(async app => {
        await authenticate(app);

        const responses = await Promise.all([
            app.post('/operations/execute'),
            app.post('/operations/execute')
        ]);

        const statuses = responses
            .map(response => response.status)
            .sort((a, b) => a - b);

        assert.deepEqual(statuses, [200, 409]);
    });
});

test('cancellation during execution introspection denies access', async () => {
    await withOperations(async app => {
        await authenticate(app);

        app.setIntrospectionHook(async () => {
            const cancelled = await app.post(
                '/attempts/cancel'
            );

            assert.equal(cancelled.status, 200);
        });

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 409);
    });
});

test('logout during execution introspection denies access', async () => {
    await withOperations(async app => {
        await authenticate(app);

        app.setIntrospectionHook(async () => {
            const logout = await app.post('/logout');

            assert.equal(logout.status, 200);
        });

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 409);
    });
});

test('resource failure consumes proof and prevents retry', async () => {
    await withOperations(async app => {
        await authenticate(app);

        app.removeResource();

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 503);

        const retry = await app.post(
            '/operations/execute'
        );

        assert.equal(retry.status, 409);
    });
});
