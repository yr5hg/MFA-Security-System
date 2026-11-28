import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as oidc from 'openid-client';

import { createApp } from '../src/app.js';

async function withApp(
    callback,
    { enableOperations = false, faceDependencies = null } = {}
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

    if (faceDependencies) {
        Object.assign(config, {
            faceSimilarityThreshold: 0.66,
            captureChallengeTtlSeconds: 60,
            captureMaxBytes: 1048576,
            faceFailureLimit: 3,
            faceFailureWindowSeconds: 300,
            faceCooldownSeconds: 300
        });
    }

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

    let mockSubject = 'test-account';
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
                sub: mockSubject,
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
            sub: mockSubject,
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
        introspect,
        faceDependencies
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

    async function postFace(
        challenge,
        image = Buffer.from([255, 216, 255, 217]),
        headers = {}
    ) {
        return request('/face/verify', {
            method: 'POST',

            headers: {
                'Content-Type': 'image/jpeg',
                Origin: config.gateOrigin,
                'X-CSRF-Token': csrfToken,
                'X-Capture-Challenge': challenge,
                ...headers
            },

            body: image
        });
    }

    async function postEnrollment(
        challenge,
        image = Buffer.from([255, 216, 255, 217]),
        headers = {}
    ) {
        return request('/face/enroll', {
            method: 'POST',

            headers: {
                'Content-Type': 'image/jpeg',
                Origin: config.gateOrigin,
                'X-CSRF-Token': csrfToken,
                'X-Capture-Challenge': challenge,
                'X-Enrollment-Consent': 'true',
                ...headers
            },

            body: image
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
            postFace,
            postEnrollment,
            begin,

            setSubject: subject => {
                mockSubject = subject;
            },

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
const FACE_POLICY_VERSION =
    'human-3.3.6-wasm-lab-v1';

function createFaceFixture() {
    const state = {
        version: 1,
        enrolled: true,
        calls: 0,
        offset: 0,
        hook: null,

        outcome: {
            ok: true,
            matched: true,
            code: 'MATCH',
            threshold: 0.66,
            similarity: 0.80,
            policyVersion: FACE_POLICY_VERSION
        }
    };

    function checkIdentity(identity) {
        assert.equal(
            identity.issuer,
            'https://id.test:8443/realms/multi-factor-authentication'
        );

        assert.equal(
            identity.subject,
            'test-account'
        );
    }

    const dependencies = {
        policyVersion: FACE_POLICY_VERSION,

        now: () => Date.now() + state.offset,

        references: {
            get(identity) {
                checkIdentity(identity);

                return {
                    issuer: identity.issuer,
                    subject: identity.subject,
                    version: state.version,

                    reference: state.enrolled
                        ? {
                            policyVersion: FACE_POLICY_VERSION,
                            descriptor: Array(1024).fill(1)
                        }
                        : null
                };
            },

            isCurrent(identity, version) {
                checkIdentity(identity);

                return (
                    state.enrolled &&
                    version === state.version
                );
            }
        },

        verifier: {
            async verify(image, reference) {
                assert.ok(Buffer.isBuffer(image));
                assert.equal(
                    reference.descriptor.length,
                    1024
                );

                state.calls++;

                if (state.hook) {
                    await state.hook();
                }

                return state.outcome;
            }
        }
    };

    return {
        state,
        dependencies
    };
}

async function withFace(callback) {
    const fixture = createFaceFixture();

    await withApp(
        app => callback(app, fixture.state),
        {
            enableOperations: true,
            faceDependencies: fixture.dependencies
        }
    );
}

async function beginFace(app) {
    await authenticate(app, 'view', 'face');

    return app.initialize();
}

test('disabled face verifier fails closed', async () => {
    await withOperations(async app => {
        await beginFace(app);

        const response = await app.postFace(
            'x'.repeat(43)
        );

        assert.equal(response.status, 503);
    });
});

test('face verification requires an authenticated session', async () => {
    await withFace(async app => {
        const response = await app.postFace(
            'x'.repeat(43)
        );

        assert.equal(response.status, 401);
    });
});

test('verified face user executes view operation only once', async () => {
    await withFace(async (app, state) => {
        const status = await beginFace(app);

        assert.equal(status.captureChallenge.length, 43);

        const response = await app.postFace(
            status.captureChallenge
        );

        assert.equal(response.status, 200);

        assert.deepEqual(
            await response.json(),
            { status: 'face_verified' }
        );

        assert.equal(state.calls, 1);

        const current = await app.initialize();

        assert.equal(current.status, 'face_verified');
        assert.equal(current.captureChallenge, undefined);
        assert.equal(current.descriptor, undefined);
        assert.equal(current.similarity, undefined);
        assert.equal(current.accessToken, undefined);

        const replay = await app.postFace(
            status.captureChallenge
        );

        assert.equal(replay.status, 409);

        const execute = await app.post(
            '/operations/execute'
        );

        assert.equal(execute.status, 200);

        const result = await execute.json();

        assert.equal(result.status, 'executed');
        assert.equal(result.action, 'view');
        assert.equal(
            result.content,
            'CONFIDENTIAL TEST RESOURCE'
        );

        const repeated = await app.post(
            '/operations/execute'
        );

        assert.equal(repeated.status, 409);

        const finalStatus = await app.initialize();

        assert.equal(finalStatus.status, 'idle');
    });
});

test('refreshing status does not replace or extend challenge', async () => {
    await withFace(async app => {
        const first = await beginFace(app);
        const second = await app.initialize();

        assert.equal(
            second.captureChallenge,
            first.captureChallenge
        );

        assert.equal(
            second.captureChallengeExpiresAt,
            first.captureChallengeExpiresAt
        );
    });
});

test('face endpoint rejects cross-origin and invalid CSRF requests', async () => {
    await withFace(async (app, state) => {
        const status = await beginFace(app);

        const crossOrigin = await app.postFace(
            status.captureChallenge,
            undefined,
            { Origin: 'https://untrusted.test' }
        );

        assert.equal(crossOrigin.status, 403);

        const csrf = await app.postFace(
            status.captureChallenge,
            undefined,
            { 'X-CSRF-Token': 'invalid' }
        );

        assert.equal(csrf.status, 403);
        assert.equal(state.calls, 0);
    });
});

test('incorrect capture challenge is denied', async () => {
    await withFace(async (app, state) => {
        await beginFace(app);

        const response = await app.postFace(
            'x'.repeat(43)
        );

        assert.equal(response.status, 409);
        assert.equal(state.calls, 0);
    });
});

test('unsupported image content type is denied', async () => {
    await withFace(async (app, state) => {
        const status = await beginFace(app);

        const response = await app.postFace(
            status.captureChallenge,
            Buffer.from('not an image'),
            { 'Content-Type': 'text/plain' }
        );

        assert.equal(response.status, 415);
        assert.equal(state.calls, 0);
    });
});

test('oversized image is denied before inference', async () => {
    await withFace(async (app, state) => {
        const status = await beginFace(app);

        const response = await app.postFace(
            status.captureChallenge,
            Buffer.alloc(1048577)
        );

        assert.equal(response.status, 413);
        assert.equal(state.calls, 0);
    });
});

test('missing enrollment prevents challenge issuance', async () => {
    await withFace(async (app, state) => {
        state.enrolled = false;

        const status = await beginFace(app);

        assert.equal(
            status.faceError,
            'face_not_enrolled'
        );

        assert.equal(status.captureChallenge, undefined);

        const response = await app.postFace(
            'x'.repeat(43)
        );

        assert.equal(response.status, 409);
        assert.equal(state.calls, 0);
    });
});

test('expired capture challenge cannot be used', async () => {
    await withFace(async (app, state) => {
        const status = await beginFace(app);

        state.offset = 61000;

        const response = await app.postFace(
            status.captureChallenge
        );

        assert.equal(response.status, 409);
        assert.equal(state.calls, 0);

        const current = await app.initialize();

        assert.equal(current.status, 'idle');
    });
});

test('method switching invalidates the previous challenge', async () => {
    await withFace(async (app, state) => {
        const status = await beginFace(app);

        await authenticate(app, 'view', 'totp');

        const response = await app.postFace(
            status.captureChallenge
        );

        assert.equal(response.status, 409);
        assert.equal(state.calls, 0);
    });
});

test('reference replacement during inference prevents completion', async () => {
    await withFace(async (app, state) => {
        const status = await beginFace(app);

        state.hook = async () => {
            state.version++;
        };

        const response = await app.postFace(
            status.captureChallenge
        );

        assert.equal(response.status, 409);

        const body = await response.json();

        assert.equal(body.error, 'reference_changed');
    });
});

test('cancellation during face inference prevents completion', async () => {
    await withFace(async (app, state) => {
        const status = await beginFace(app);

        state.hook = async () => {
            const cancelled = await app.post(
                '/attempts/cancel'
            );

            assert.equal(cancelled.status, 200);
        };

        const response = await app.postFace(
            status.captureChallenge
        );

        assert.equal(response.status, 409);

        const current = await app.initialize();

        assert.equal(current.status, 'idle');
    });
});

test('revoked access token prevents face completion', async () => {
    await withFace(async app => {
        const status = await beginFace(app);

        app.setIntrospection({
            active: false
        });

        const response = await app.postFace(
            status.captureChallenge
        );

        assert.equal(response.status, 403);
    });
});

test('invalid worker similarity cannot complete authentication', async () => {
    await withFace(async (app, state) => {
        const status = await beginFace(app);

        state.outcome.similarity = NaN;

        const response = await app.postFace(
            status.captureChallenge
        );

        assert.equal(response.status, 503);

        const current = await app.initialize();

        assert.equal(current.status, 'idle');
    });
});

test('three mismatches trigger account cooldown while TOTP remains independent', async t => {
    t.mock.timers.enable({
        apis: ['Date']
    });

    await withFace(async (app, state) => {
        state.outcome = {
            ok: false,
            matched: false,
            code: 'FACE_MISMATCH',
            policyVersion: FACE_POLICY_VERSION
        };

        for (let attempt = 1; attempt <= 3; attempt++) {
            const status = await beginFace(app);

            const response = await app.postFace(
                status.captureChallenge
            );

            assert.equal(
                response.status,
                attempt === 3 ? 429 : 403
            );
        }

        const blocked = await beginFace(app);

        assert.equal(
            blocked.faceError,
            'face_cooldown'
        );

        assert.ok(blocked.retryAfterSeconds > 0);
        assert.equal(blocked.captureChallenge, undefined);
        assert.equal(state.calls, 3);

        const denied = await app.postFace(
            'x'.repeat(43)
        );

        assert.equal(denied.status, 429);

        await authenticate(app, 'view', 'totp');

        const execute = await app.post(
            '/operations/execute'
        );

        assert.equal(execute.status, 200);

        t.mock.timers.tick(301000);

const recovered = await beginFace(app);

assert.equal(recovered.status, 'pending_face');
assert.equal(recovered.faceError, undefined);
assert.ok(recovered.captureChallenge);
    });
});

test('worker exception invalidates the face attempt', async () => {
    await withFace(async (app, state) => {
        const status = await beginFace(app);

        state.hook = async () => {
            throw new Error('Simulated worker failure');
        };

        const response = await app.postFace(
            status.captureChallenge
        );

        assert.equal(response.status, 503);

        const current = await app.initialize();

        assert.equal(current.status, 'idle');
    });
});

test('concurrent capture requests cannot reuse one challenge', async () => {
    await withFace(async (app, state) => {
        const status = await beginFace(app);

        let entered;
        let release;

        const started = new Promise(resolve => {
            entered = resolve;
        });

        const wait = new Promise(resolve => {
            release = resolve;
        });

        state.hook = async () => {
            entered();
            await wait;
        };

        const first = app.postFace(
            status.captureChallenge
        );

        await started;

        try {
            const duplicate = await app.postFace(
                status.captureChallenge
            );

            assert.equal(duplicate.status, 409);

        } finally {
            release();
        }


        const response = await first;

        assert.equal(response.status, 200);
        assert.equal(state.calls, 1);
    });
});
async function completeFaceAuthentication(
    app,
    action = 'view'
) {
    await authenticate(app, action, 'face');

    const status = await app.initialize();

    assert.equal(status.status, 'pending_face');
    assert.ok(status.captureChallenge);

    const verification = await app.postFace(
        status.captureChallenge
    );

    assert.equal(verification.status, 200);

    assert.deepEqual(
        await verification.json(),
        { status: 'face_verified' }
    );
}

test('face authenticated administrator executes integrity inspection', async () => {
    await withFace(async app => {
        app.setIntrospection({
            realm_access: {
                roles: ['administrator']
            }
        });

        await completeFaceAuthentication(
            app,
            'admin'
        );

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 200);

        const result = await response.json();

        assert.equal(result.status, 'executed');
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

test('removed administrator role denies face execution', async () => {
    await withFace(async app => {
        app.setIntrospection({
            realm_access: {
                roles: ['administrator']
            }
        });

        await completeFaceAuthentication(
            app,
            'admin'
        );

        app.setIntrospection({
            realm_access: {
                roles: ['regular_user']
            }
        });

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 403);

        const repeated = await app.post(
            '/operations/execute'
        );

        assert.equal(repeated.status, 409);
    });
});

test('replaced reference prevents face execution', async () => {
    await withFace(async (app, state) => {
        await completeFaceAuthentication(app);

        state.version++;

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 409);

        assert.deepEqual(
            await response.json(),
            { error: 'reference_changed' }
        );

        const current = await app.initialize();

        assert.equal(current.status, 'idle');
    });
});

test('withdrawn reference during introspection denies face execution', async () => {
    await withFace(async (app, state) => {
        await completeFaceAuthentication(app);

        app.setIntrospectionHook(async () => {
            state.enrolled = false;
        });

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 409);

        assert.deepEqual(
            await response.json(),
            { error: 'reference_changed' }
        );
    });
});

test('reference replacement during execution introspection is rejected', async () => {
    await withFace(async (app, state) => {
        await completeFaceAuthentication(app);

        app.setIntrospectionHook(async () => {
            state.version++;
        });

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 409);

        const result = await response.json();

        assert.equal(
            result.error,
            'reference_changed'
        );

        assert.equal(result.content, undefined);

        const current = await app.initialize();

        assert.equal(current.status, 'idle');
    });
});

test('revoked Keycloak token denies completed face proof', async () => {
    await withFace(async app => {
        await completeFaceAuthentication(app);

        app.setIntrospection({
            active: false
        });

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 403);

        const repeated = await app.post(
            '/operations/execute'
        );

        assert.equal(repeated.status, 409);
    });
});

test('TOTP client evidence cannot authorize a face proof', async () => {
    await withFace(async app => {
        await completeFaceAuthentication(app);

        app.setIntrospection({
            client_id: 'gate-totp',
            azp: 'gate-totp',
            aud: ['gate-totp', 'lab-resource']
        });

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 403);
    });
});

test('Keycloak outage denies completed face authentication', async () => {
    await withFace(async app => {
        await completeFaceAuthentication(app);

        app.setIntrospectionHook(async () => {
            throw new Error(
                'Simulated Keycloak outage'
            );
        });

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 503);

        app.setIntrospectionHook(null);

        const repeated = await app.post(
            '/operations/execute'
        );

        assert.equal(repeated.status, 409);
    });
});

test('concurrent face execution consumes proof only once', async () => {
    await withFace(async app => {
        await completeFaceAuthentication(app);

        const responses = await Promise.all([
            app.post('/operations/execute'),
            app.post('/operations/execute')
        ]);

        const statuses = responses
            .map(response => response.status)
            .sort((a, b) => a - b);

        assert.deepEqual(
            statuses,
            [200, 409]
        );
    });
});

test('cancellation during face execution prevents resource access', async () => {
    await withFace(async app => {
        await completeFaceAuthentication(app);

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

        const current = await app.initialize();

        assert.equal(current.status, 'idle');
    });
});

test('expired completed face proof cannot execute', async t => {
    t.mock.timers.enable({
        apis: ['Date']
    });

    await withFace(async app => {
        await completeFaceAuthentication(app);

        t.mock.timers.tick(301000);

        const response = await app.post(
            '/operations/execute'
        );

        assert.equal(response.status, 409);

        const result = await response.json();

        assert.equal(result.content, undefined);
    });
});
for (const action of [
    'approve_enroll',
    'approve_replace'
]) {
    test(`${action} proof cannot execute ordinary resources`, async () => {
        await withOperations(async app => {
            await app.initialize();

            app.setIntrospection({
                realm_access: {
                    roles: ['administrator']
                }
            });

            const start = await app.post('/attempts', {
                method: 'totp',
                action,
                targetSubject: 'target-account'
            });

            assert.equal(start.status, 303);

            const login = new URL(
                start.headers.get('location')
            );

            const query = new URLSearchParams({
                code: 'test-code',
                state: login.searchParams.get('state'),
                iss: 'https://id.test:8443/realms/multi-factor-authentication'
            });

            const callback = await app.request(
                `/oidc/totp/callback?${query}`
            );

            assert.equal(callback.status, 303);

            const current = await app.initialize();

            assert.equal(current.status, 'totp_verified');
            assert.equal(current.action, action);

            const execute = await app.post(
                '/operations/execute'
            );

            assert.equal(execute.status, 403);

            assert.deepEqual(
                await execute.json(),
                {
                    error: 'incorrect_authentication_purpose'
                }
            );

            const remaining = await app.initialize();

            assert.equal(remaining.action, action);
        });
    });
}

for (const action of [
    'face_enroll',
    'face_replace'
]) {
    test(`${action} owner proof cannot execute ordinary resources`, async () => {
        await withOperations(async app => {
            await authenticate(app, action, 'totp');

            const current = await app.initialize();

            assert.equal(current.status, 'totp_verified');
            assert.equal(current.action, action);

            const execute = await app.post(
                '/operations/execute'
            );

            assert.equal(execute.status, 403);

            assert.deepEqual(
                await execute.json(),
                {
                    error: 'incorrect_authentication_purpose'
                }
            );
        });
    });
}

test('regular user cannot obtain administrator approval proof', async () => {
    await withOperations(async app => {
        await app.initialize();

        const start = await app.post('/attempts', {
            method: 'totp',
            action: 'approve_enroll',
            targetSubject: 'target-account'
        });

        assert.equal(start.status, 303);

        const login = new URL(
            start.headers.get('location')
        );

        const query = new URLSearchParams({
            code: 'test-code',
            state: login.searchParams.get('state'),
            iss: 'https://id.test:8443/realms/multi-factor-authentication'
        });

        const callback = await app.request(
            `/oidc/totp/callback?${query}`
        );

        assert.equal(callback.status, 401);

        const current = await app.initialize();

        assert.equal(current.status, 'idle');
    });
});

test('administrator cannot approve their own enrollment', async () => {
    await withOperations(async app => {
        await app.initialize();

        app.setIntrospection({
            realm_access: {
                roles: ['administrator']
            }
        });

        const start = await app.post('/attempts', {
            method: 'totp',
            action: 'approve_enroll',
            targetSubject: 'test-account'
        });

        assert.equal(start.status, 303);

        const login = new URL(
            start.headers.get('location')
        );

        const query = new URLSearchParams({
            code: 'test-code',
            state: login.searchParams.get('state'),
            iss: 'https://id.test:8443/realms/multi-factor-authentication'
        });

        const callback = await app.request(
            `/oidc/totp/callback?${query}`
        );

        assert.equal(callback.status, 401);
    });
});

test('face method cannot begin sensitive biometric operations', async () => {
    await withOperations(async app => {
        await app.initialize();

        for (const action of [
            'approve_enroll',
            'approve_replace',
            'face_enroll',
            'face_replace'
        ]) {
            const response = await app.post('/attempts', {
                method: 'face',
                action,

                ...(action.startsWith('approve_')
                    ? { targetSubject: 'target-account' }
                    : {})
            });

            assert.equal(response.status, 400);
        }
    });
});

test('approval without target account is rejected', async () => {
    await withOperations(async app => {
        await app.initialize();

        const response = await app.post('/attempts', {
            method: 'totp',
            action: 'approve_enroll'
        });

        assert.equal(response.status, 400);
    });
});

test('password-only authentication cannot create enrollment proof', async () => {
    await withOperations(async app => {
        await app.initialize();

        app.setAmr(['pwd']);

        const { callbackPath } = await app.begin(
            'totp',
            'face_enroll'
        );

        const callback = await app.request(callbackPath);

        assert.equal(callback.status, 401);

        const current = await app.initialize();

        assert.equal(current.status, 'idle');
    });
});

const APPROVAL_TARGET = 'target-account';

function approvalBody(operation = 'enroll') {
    return {
        targetSubject: APPROVAL_TARGET,
        operation,
        identityChecked: true
    };
}

async function withApproval(
    callback,
    enrolled = false
) {
    const fixture = createFaceFixture();

    fixture.state.enrolled = enrolled;
    fixture.state.version = enrolled ? 1 : 0;

    const originalGet =
        fixture.dependencies.references.get;

    fixture.dependencies.references.get = identity => {
        if (identity.subject !== APPROVAL_TARGET) {
            return originalGet(identity);
        }

        assert.equal(
            identity.issuer,
            'https://id.test:8443/realms/multi-factor-authentication'
        );

        return {
            issuer: identity.issuer,
            subject: identity.subject,
            version: fixture.state.version,

            reference: fixture.state.enrolled
                ? {
                    policyVersion: FACE_POLICY_VERSION,
                    descriptor: Array(1024).fill(1)
                }
                : null
        };
    };

    await withApp(
        app => callback(app, fixture.state),
        {
            enableOperations: true,
            faceDependencies: fixture.dependencies
        }
    );
}

async function authenticateApprover(
    app,
    operation = 'enroll'
) {
    await app.initialize();

    app.setIntrospection({
        realm_access: {
            roles: ['administrator']
        }
    });

    const start = await app.post('/attempts', {
        method: 'totp',
        action: `approve_${operation}`,
        targetSubject: APPROVAL_TARGET
    });

    assert.equal(start.status, 303);

    const login = new URL(
        start.headers.get('location')
    );

    const query = new URLSearchParams({
        code: 'test-code',
        state: login.searchParams.get('state'),
        iss: 'https://id.test:8443/realms/multi-factor-authentication'
    });

    const callback = await app.request(
        `/oidc/totp/callback?${query}`
    );

    assert.equal(callback.status, 303);

    const current = await app.initialize();

    assert.equal(current.status, 'totp_verified');

    assert.equal(
        current.action,
        `approve_${operation}`
    );
}

for (const operation of ['enroll', 'replace']) {
    test(`administrator creates one-use ${operation} approval`, async () => {
        await withApproval(async app => {
            await authenticateApprover(app, operation);

            const before = Date.now();

            const response = await app.post(
                '/factor/approvals',
                approvalBody(operation)
            );

            assert.equal(response.status, 201);

            const result = await response.json();

            assert.equal(
                result.status,
                'approval_created'
            );

            assert.equal(
                result.targetSubject,
                APPROVAL_TARGET
            );

            assert.equal(result.operation, operation);

            assert.ok(
                result.expiresAt >= before + 600000
            );

            assert.ok(
                result.expiresAt <= Date.now() + 600000
            );

            assert.equal(result.accessToken, undefined);
            assert.equal(result.descriptor, undefined);
            assert.equal(result.referenceVersion, undefined);

            // Administrator authentication proof is consumed.
            const replay = await app.post(
                '/factor/approvals',
                approvalBody(operation)
            );

            assert.equal(replay.status, 409);

            const current = await app.initialize();

            assert.equal(current.status, 'idle');

            const execute = await app.post(
                '/operations/execute'
            );

            assert.equal(execute.status, 409);

        }, operation === 'replace');
    });
}

test('approval endpoint enforces session origin and CSRF protection', async () => {
    await withApproval(async app => {
        const unauthenticated = await app.post(
            '/factor/approvals',
            approvalBody()
        );

        assert.equal(unauthenticated.status, 401);

        await authenticateApprover(app);

        const crossOrigin = await app.post(
            '/factor/approvals',
            approvalBody(),
            { Origin: 'https://untrusted.test' }
        );

        assert.equal(crossOrigin.status, 403);

        const csrf = await app.post(
            '/factor/approvals',
            approvalBody(),
            { 'X-CSRF-Token': 'invalid' }
        );

        assert.equal(csrf.status, 403);
    });
});

test('ordinary administrator resource proof cannot create approval', async () => {
    await withApproval(async app => {
        app.setIntrospection({
            realm_access: {
                roles: ['administrator']
            }
        });

        await authenticate(app, 'admin', 'totp');

        const response = await app.post(
            '/factor/approvals',
            approvalBody()
        );

        assert.equal(response.status, 403);
    });
});

test('approval request cannot change target operation or identity attestation', async () => {
    await withApproval(async app => {
        await authenticateApprover(app);

        const wrongTarget = await app.post(
            '/factor/approvals',
            {
                ...approvalBody(),
                targetSubject: 'another-account'
            }
        );

        assert.equal(wrongTarget.status, 403);

        const wrongOperation = await app.post(
            '/factor/approvals',
            approvalBody('replace')
        );

        assert.equal(wrongOperation.status, 403);

        for (const invalid of [
            {
                ...approvalBody(),
                identityChecked: false
            },

            {
                ...approvalBody(),
                approvedBy: 'fake-admin'
            },

            {
                ...approvalBody(),
                expiresAt: Date.now() + 999999
            }
        ]) {
            const response = await app.post(
                '/factor/approvals',
                invalid
            );

            assert.equal(response.status, 400);
        }

        const valid = await app.post(
            '/factor/approvals',
            approvalBody()
        );

        assert.equal(valid.status, 201);
    });
});

test('removed administrator role prevents approval issuance', async () => {
    await withApproval(async app => {
        await authenticateApprover(app);

        app.setIntrospection({
            realm_access: {
                roles: ['regular_user']
            }
        });

        const response = await app.post(
            '/factor/approvals',
            approvalBody()
        );

        assert.equal(response.status, 403);

        const current = await app.initialize();

        assert.equal(current.status, 'idle');
    });
});

test('inactive administrator token prevents approval issuance', async () => {
    await withApproval(async app => {
        await authenticateApprover(app);

        app.setIntrospection({
            active: false
        });

        const response = await app.post(
            '/factor/approvals',
            approvalBody()
        );

        assert.equal(response.status, 403);
    });
});

test('approval operation must match current reference state', async () => {
    await withApproval(async app => {
        await authenticateApprover(app, 'enroll');

        const response = await app.post(
            '/factor/approvals',
            approvalBody('enroll')
        );

        assert.equal(response.status, 409);

        assert.deepEqual(
            await response.json(),
            { error: 'reference_already_exists' }
        );
    }, true);

    await withApproval(async app => {
        await authenticateApprover(app, 'replace');

        const response = await app.post(
            '/factor/approvals',
            approvalBody('replace')
        );

        assert.equal(response.status, 409);

        assert.deepEqual(
            await response.json(),
            { error: 'reference_not_found' }
        );
    });
});

test('concurrent requests cannot issue two approvals using one proof', async () => {
    await withApproval(async app => {
        await authenticateApprover(app);

        const responses = await Promise.all([
            app.post('/factor/approvals', approvalBody()),
            app.post('/factor/approvals', approvalBody())
        ]);

        const statuses = responses
            .map(response => response.status)
            .sort((a, b) => a - b);

        assert.deepEqual(statuses, [201, 409]);
    });
});

test('approval issuance fails closed when face subsystem is disabled', async () => {
    await withOperations(async app => {
        await authenticateApprover(app);

        const response = await app.post(
            '/factor/approvals',
            approvalBody()
        );

        assert.equal(response.status, 503);
    });
});

test('cancellation during administrator introspection prevents approval', async () => {
    await withApproval(async app => {
        await authenticateApprover(app);

        app.setIntrospectionHook(async () => {
            const cancelled = await app.post(
                '/attempts/cancel'
            );

            assert.equal(cancelled.status, 200);
        });

        const response = await app.post(
            '/factor/approvals',
            approvalBody()
        );

        assert.equal(response.status, 409);
    });
});

test('new administrator proof cannot overwrite an outstanding approval', async () => {
    await withApproval(async app => {
        await authenticateApprover(app);

        const first = await app.post(
            '/factor/approvals',
            approvalBody()
        );

        assert.equal(first.status, 201);

        await authenticateApprover(app);

        const second = await app.post(
            '/factor/approvals',
            approvalBody()
        );

        assert.equal(second.status, 409);

        assert.deepEqual(
            await second.json(),
            { error: 'approval_already_exists' }
        );

        const current = await app.initialize();

        assert.equal(current.status, 'idle');
    });
});

const ENROLLMENT_ISSUER =
    'https://id.test:8443/realms/multi-factor-authentication';

const ENROLLMENT_OWNER = {
    issuer: ENROLLMENT_ISSUER,
    subject: APPROVAL_TARGET
};

function syntheticReference() {
    return {
        policyVersion: FACE_POLICY_VERSION,
        descriptor: Array(1024).fill(1)
    };
}

async function withEnrollment(callback) {
    const { createReferenceStore } = await import(
        '../src/reference-store.js'
    );

    const directory = mkdtempSync(
        join(tmpdir(), 'mfa-enrollment-test-')
    );

    const references = createReferenceStore({
        privateStateDir: directory,
        issuer: ENROLLMENT_ISSUER,
        policyVersion: FACE_POLICY_VERSION,

        validateReference: reference =>
            reference.policyVersion === FACE_POLICY_VERSION &&
            Array.isArray(reference.descriptor) &&
            reference.descriptor.length === 1024 &&
            reference.descriptor.every(Number.isFinite)
    });

    const fixture = createFaceFixture();

    fixture.dependencies.references = references;

    const state = {
        calls: 0,
        hook: null,

        outcome: {
            ok: true,
            policyVersion: FACE_POLICY_VERSION,
            inferenceMs: 10,
            reference: syntheticReference()
        }
    };

    fixture.dependencies.verifier.enroll = async image => {
        assert.ok(Buffer.isBuffer(image));

        state.calls++;

        if (state.hook) {
            await state.hook();
        }

        return state.outcome;
    };

    try {
        await withApp(
            app => callback(app, state, references),
            {
                enableOperations: true,
                faceDependencies: fixture.dependencies
            }
        );

    } finally {
        rmSync(directory, {
            recursive: true,
            force: true
        });
    }
}

async function approveOwner(app) {
    await authenticateApprover(app);

    const approval = await app.post(
        '/factor/approvals',
        approvalBody()
    );

    assert.equal(approval.status, 201);
}

async function loginEnrollmentOwner(
    app,
    subject = APPROVAL_TARGET,
    action = 'face_enroll'
) {
    const logout = await app.post('/logout');

    assert.equal(logout.status, 200);

    app.setSubject(subject);
    app.setIntrospection({});

    await authenticate(app, action, 'totp');

    return app.initialize();
}

async function prepareEnrollment(app) {
    await approveOwner(app);

    const current = await loginEnrollmentOwner(app);

    assert.equal(current.status, 'totp_verified');
    assert.equal(current.action, 'face_enroll');
    assert.ok(current.captureChallenge);

    return current;
}

test('approved owner enrolls a private reference only once', async () => {
    await withEnrollment(async (app, state, references) => {
        const current = await prepareEnrollment(app);

        const refreshed = await app.initialize();

        assert.equal(
            refreshed.captureChallenge,
            current.captureChallenge
        );

        assert.equal(
            refreshed.captureChallengeExpiresAt,
            current.captureChallengeExpiresAt
        );

        const response = await app.postEnrollment(
            current.captureChallenge
        );

        assert.equal(response.status, 201);

        assert.deepEqual(
            await response.json(),
            { status: 'face_enrolled' }
        );

        const stored = references.get(ENROLLMENT_OWNER);

        assert.equal(stored.version, 1);
        assert.equal(stored.subject, APPROVAL_TARGET);

        assert.deepEqual(
            stored.reference.descriptor,
            syntheticReference().descriptor
        );

        assert.equal(state.calls, 1);

        assert.equal(
            references.get({
                issuer: ENROLLMENT_ISSUER,
                subject: 'test-account'
            }).reference,
            null
        );

        const replay = await app.postEnrollment(
            current.captureChallenge
        );

        assert.equal(replay.status, 409);

        const execute = await app.post(
            '/operations/execute'
        );

        assert.equal(execute.status, 409);

        await authenticate(app, 'face_enroll', 'totp');

        const noApproval = await app.initialize();

        assert.equal(
            noApproval.enrollmentError,
            'approval_required'
        );

        assert.equal(
            noApproval.captureChallenge,
            undefined
        );
    });
});

test('owner without administrator approval cannot enroll', async () => {
    await withEnrollment(async (app, state, references) => {
        app.setSubject(APPROVAL_TARGET);

        await authenticate(app, 'face_enroll', 'totp');

        const current = await app.initialize();

        assert.equal(
            current.enrollmentError,
            'approval_required'
        );

        assert.equal(current.captureChallenge, undefined);

        const response = await app.postEnrollment(
            'x'.repeat(43)
        );

        assert.equal(response.status, 409);
        assert.equal(state.calls, 0);

        assert.equal(
            references.get(ENROLLMENT_OWNER).reference,
            null
        );
    });
});

test('approval cannot be used by a different account', async () => {
    await withEnrollment(async (app, state) => {
        await approveOwner(app);

        const current = await loginEnrollmentOwner(
            app,
            'different-account'
        );

        assert.equal(
            current.enrollmentError,
            'approval_required'
        );

        assert.equal(current.captureChallenge, undefined);
        assert.equal(state.calls, 0);
    });
});

test('ordinary resource authentication cannot enroll a face', async () => {
    await withEnrollment(async (app, state) => {
        app.setSubject(APPROVAL_TARGET);

        await authenticate(app, 'view', 'totp');

        const response = await app.postEnrollment(
            'x'.repeat(43)
        );

        assert.equal(response.status, 403);
        assert.equal(state.calls, 0);
    });
});

test('enrollment enforces consent session origin CSRF and JPEG validation', async () => {
    await withEnrollment(async (app, state) => {
        const anonymous = await app.postEnrollment(
            'x'.repeat(43)
        );

        assert.equal(anonymous.status, 401);

        const current = await prepareEnrollment(app);

        for (const [headers, expected] of [
            [{ 'X-Enrollment-Consent': 'false' }, 400],
            [{ Origin: 'https://untrusted.test' }, 403],
            [{ 'X-CSRF-Token': 'invalid' }, 403],
            [{ 'Content-Type': 'text/plain' }, 415]
        ]) {
            const response = await app.postEnrollment(
                current.captureChallenge,
                undefined,
                headers
            );

            assert.equal(response.status, expected);
        }

        const oversized = await app.postEnrollment(
            current.captureChallenge,
            Buffer.alloc(1048577)
        );

        assert.equal(oversized.status, 413);

        const wrongChallenge = await app.postEnrollment(
            'x'.repeat(43)
        );

        assert.equal(wrongChallenge.status, 409);
        assert.equal(state.calls, 0);

        const valid = await app.postEnrollment(
            current.captureChallenge
        );

        assert.equal(valid.status, 201);
    });
});

test('expired enrollment challenge cannot be submitted', async t => {
    t.mock.timers.enable({
        apis: ['Date']
    });

    await withEnrollment(async (app, state) => {
        const current = await prepareEnrollment(app);

        t.mock.timers.tick(61000);

        const response = await app.postEnrollment(
            current.captureChallenge
        );

        assert.equal(response.status, 409);

        assert.deepEqual(
            await response.json(),
            { error: 'capture_expired' }
        );

        assert.equal(state.calls, 0);
    });
});

test('expired administrator approval cannot enable enrollment', async t => {
    t.mock.timers.enable({
        apis: ['Date']
    });

    await withEnrollment(async (app, state) => {
        await approveOwner(app);

        t.mock.timers.tick(601000);

        const current = await loginEnrollmentOwner(app);

        assert.equal(
            current.enrollmentError,
            'approval_required'
        );

        assert.equal(current.captureChallenge, undefined);
        assert.equal(state.calls, 0);
    });
});

test('owner token revocation during inference prevents enrollment', async () => {
    await withEnrollment(async (app, state, references) => {
        const current = await prepareEnrollment(app);

        state.hook = async () => {
            app.setIntrospection({
                active: false
            });
        };

        const response = await app.postEnrollment(
            current.captureChallenge
        );

        assert.equal(response.status, 403);

        assert.equal(
            references.get(ENROLLMENT_OWNER).reference,
            null
        );
    });
});

test('cancellation during enrollment inference prevents storage', async () => {
    await withEnrollment(async (app, state, references) => {
        const current = await prepareEnrollment(app);

        state.hook = async () => {
            const cancelled = await app.post(
                '/attempts/cancel'
            );

            assert.equal(cancelled.status, 200);
        };

        const response = await app.postEnrollment(
            current.captureChallenge
        );

        assert.equal(response.status, 409);

        assert.equal(
            references.get(ENROLLMENT_OWNER).reference,
            null
        );
    });
});

test('reference change during enrollment prevents overwrite', async () => {
    await withEnrollment(async (app, state, references) => {
        const current = await prepareEnrollment(app);

        const otherReference = {
            policyVersion: FACE_POLICY_VERSION,
            descriptor: Array(1024).fill(0.5)
        };

        state.hook = async () => {
            references.save(
                ENROLLMENT_OWNER,
                otherReference,
                0
            );
        };

        const response = await app.postEnrollment(
            current.captureChallenge
        );

        assert.equal(response.status, 409);

        const stored = references.get(ENROLLMENT_OWNER);

        assert.equal(stored.version, 1);

        assert.deepEqual(
            stored.reference.descriptor,
            otherReference.descriptor
        );
    });
});

test('invalid face capture consumes the accepted enrollment approval', async () => {
    await withEnrollment(async (app, state, references) => {
        const current = await prepareEnrollment(app);

        state.outcome = {
            ok: false,
            code: 'MULTIPLE_FACES',
            policyVersion: FACE_POLICY_VERSION
        };

        const response = await app.postEnrollment(
            current.captureChallenge
        );

        assert.equal(response.status, 400);

        assert.deepEqual(
            await response.json(),
            { error: 'invalid_face_capture' }
        );

        assert.equal(
            references.get(ENROLLMENT_OWNER).reference,
            null
        );

        await authenticate(app, 'face_enroll', 'totp');

        const next = await app.initialize();

        assert.equal(
            next.enrollmentError,
            'approval_required'
        );
    });
});

test('concurrent enrollment requests cannot reuse one approval', async () => {
    await withEnrollment(async (app, state, references) => {
        const current = await prepareEnrollment(app);

        const responses = await Promise.all([
            app.postEnrollment(current.captureChallenge),
            app.postEnrollment(current.captureChallenge)
        ]);

        const statuses = responses
            .map(response => response.status)
            .sort((a, b) => a - b);

        assert.deepEqual(statuses, [201, 409]);
        assert.equal(state.calls, 1);

        assert.equal(
            references.get(ENROLLMENT_OWNER).version,
            1
        );
    });
});


test('approved replacement changes reference and revokes all owner sessions', async () => {
    await withEnrollment(async (app, state, references) => {
        references.save(
            ENROLLMENT_OWNER,
            syntheticReference(),
            0
        );

        await authenticateApprover(app, 'replace');

        const approval = await app.post(
            '/factor/approvals',
            approvalBody('replace')
        );

        assert.equal(approval.status, 201);

        // First authenticated owner session.
        const first = await loginEnrollmentOwner(
            app,
            APPROVAL_TARGET,
            'view'
        );

        const firstCookie = app.getCookie();

        assert.equal(first.status, 'totp_verified');

        // Independent unrelated browser session.
        await app.request('/attempts/current', {
            headers: { Cookie: '' }
        });

        app.setSubject('different-account');

        await authenticate(app, 'view', 'totp');

        const unrelated = await app.initialize();
        const unrelatedCookie = app.getCookie();

        // Second authenticated owner session.
        await app.request('/attempts/current', {
            headers: { Cookie: '' }
        });

        app.setSubject(APPROVAL_TARGET);

        await authenticate(app, 'face_replace', 'totp');

        const current = await app.initialize();

        assert.equal(current.action, 'face_replace');
        assert.ok(current.captureChallenge);

        state.outcome.reference = {
            policyVersion: FACE_POLICY_VERSION,
            descriptor: Array(1024).fill(0.5)
        };

        const response = await app.postEnrollment(
            current.captureChallenge
        );

        assert.equal(response.status, 201);

        assert.deepEqual(
            await response.json(),
            { status: 'face_replaced' }
        );

        const stored = references.get(ENROLLMENT_OWNER);

        assert.equal(stored.version, 2);

        assert.deepEqual(
            stored.reference.descriptor,
            Array(1024).fill(0.5)
        );

        assert.equal(
            references.isCurrent(ENROLLMENT_OWNER, 1),
            false
        );

        assert.equal(
            references.isCurrent(ENROLLMENT_OWNER, 2),
            true
        );

        assert.equal(state.calls, 1);

        // Replacement session itself is revoked.
        const replay = await app.postEnrollment(
            current.captureChallenge
        );

        assert.equal(replay.status, 401);

        // Earlier owner session is also revoked.
        const oldSession = await app.post(
            '/operations/execute',
            {},
            {
                Cookie: firstCookie,
                'X-CSRF-Token': first.csrfToken
            }
        );

        assert.equal(oldSession.status, 401);

        // Unrelated authenticated session remains usable.
        app.setSubject('different-account');

        const unaffected = await app.post(
            '/operations/execute',
            {},
            {
                Cookie: unrelatedCookie,
                'X-CSRF-Token': unrelated.csrfToken
            }
        );

        assert.equal(unaffected.status, 200);
    });
});

test('enrollment worker exception fails closed without storing a reference', async () => {
    await withEnrollment(async (app, state, references) => {
        const current = await prepareEnrollment(app);

        state.hook = async () => {
            throw new Error('Simulated worker failure');
        };

        const response = await app.postEnrollment(
            current.captureChallenge
        );

        assert.equal(response.status, 503);

        assert.equal(
            references.get(ENROLLMENT_OWNER).reference,
            null
        );

        await authenticate(app, 'face_enroll', 'totp');

        const next = await app.initialize();

        assert.equal(
            next.enrollmentError,
            'approval_required'
        );
    });
});

async function prepareReplacement(app, references) {
    references.save(
        ENROLLMENT_OWNER,
        syntheticReference(),
        0
    );

    await authenticateApprover(app, 'replace');

    const approval = await app.post(
        '/factor/approvals',
        approvalBody('replace')
    );

    assert.equal(approval.status, 201);

    const current = await loginEnrollmentOwner(
        app,
        APPROVAL_TARGET,
        'face_replace'
    );

    assert.equal(current.action, 'face_replace');
    assert.ok(current.captureChallenge);

    return current;
}

test('replacement requires a dedicated administrator approval', async () => {
    await withEnrollment(async (app, state, references) => {
        references.save(
            ENROLLMENT_OWNER,
            syntheticReference(),
            0
        );

        app.setSubject(APPROVAL_TARGET);

        await authenticate(app, 'face_replace', 'totp');

        const current = await app.initialize();

        assert.equal(
            current.enrollmentError,
            'approval_required'
        );

        assert.equal(current.captureChallenge, undefined);

        const response = await app.postEnrollment(
            'x'.repeat(43)
        );

        assert.equal(response.status, 409);
        assert.equal(state.calls, 0);

        assert.equal(
            references.get(ENROLLMENT_OWNER).version,
            1
        );
    });
});

test('replacement approval cannot be used for initial enrollment', async () => {
    await withEnrollment(async (app, state, references) => {
        references.save(
            ENROLLMENT_OWNER,
            syntheticReference(),
            0
        );

        await authenticateApprover(app, 'replace');

        const approval = await app.post(
            '/factor/approvals',
            approvalBody('replace')
        );

        assert.equal(approval.status, 201);

        const current = await loginEnrollmentOwner(
            app,
            APPROVAL_TARGET,
            'face_enroll'
        );

        assert.equal(
            current.enrollmentError,
            'approval_required'
        );

        assert.equal(current.captureChallenge, undefined);
        assert.equal(state.calls, 0);
    });
});

test('reference change during replacement prevents stale overwrite', async () => {
    await withEnrollment(async (app, state, references) => {
        const current = await prepareReplacement(
            app,
            references
        );

        const newerReference = {
            policyVersion: FACE_POLICY_VERSION,
            descriptor: Array(1024).fill(0.75)
        };

        state.hook = async () => {
            references.save(
                ENROLLMENT_OWNER,
                newerReference,
                1
            );
        };

        const response = await app.postEnrollment(
            current.captureChallenge
        );

        assert.equal(response.status, 409);

        assert.deepEqual(
            await response.json(),
            { error: 'reference_changed' }
        );

        const stored = references.get(ENROLLMENT_OWNER);

        assert.equal(stored.version, 2);

        assert.deepEqual(
            stored.reference.descriptor,
            newerReference.descriptor
        );
    });
});

test('failed replacement capture preserves the original reference', async () => {
    await withEnrollment(async (app, state, references) => {
        const current = await prepareReplacement(
            app,
            references
        );

        state.outcome = {
            ok: false,
            code: 'NO_FACE',
            policyVersion: FACE_POLICY_VERSION
        };

        const response = await app.postEnrollment(
            current.captureChallenge
        );

        assert.equal(response.status, 400);

        const stored = references.get(ENROLLMENT_OWNER);

        assert.equal(stored.version, 1);

        assert.deepEqual(
            stored.reference.descriptor,
            syntheticReference().descriptor
        );

        assert.equal(
            references.isCurrent(ENROLLMENT_OWNER, 1),
            true
        );

        await authenticate(app, 'face_replace', 'totp');

        const next = await app.initialize();

        assert.equal(
            next.enrollmentError,
            'approval_required'
        );
    });
});

test('concurrent replacement requests cannot update the reference twice', async () => {
    await withEnrollment(async (app, state, references) => {
        const current = await prepareReplacement(
            app,
            references
        );

        const responses = await Promise.all([
            app.postEnrollment(current.captureChallenge),
            app.postEnrollment(current.captureChallenge)
        ]);

        const statuses = responses.map(
            response => response.status
        );

        assert.equal(
            statuses.filter(status => status === 201).length,
            1
        );

        assert.equal(
            statuses.filter(status =>
                status === 401 || status === 409
            ).length,
            1
        );

        assert.equal(state.calls, 1);

        assert.equal(
            references.get(ENROLLMENT_OWNER).version,
            2
        );
    });
});
