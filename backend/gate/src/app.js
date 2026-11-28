import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';

import {
    createSessionStore,
    buildSessionCookie,
    clearSessionCookie,
    readSessionCookie,
    verifyCsrf,
    verifySameOrigin
} from './session.js';

import { createAttemptStore } from './attempt.js';
import { buildLoginUrl } from './oidc.js';
import { handleOidcCallback } from './callback.js';

import {
    validateAuthenticationEvidence
} from './evidence.js';

const SECURITY_HEADERS = {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY'
};

function sendJson(res, status, body, headers = {}) {
    res.writeHead(status, {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json',
        ...headers
    });

    res.end(JSON.stringify(body));
}

function redirect(res, location, headers = {}) {
    res.writeHead(303, {
        ...SECURITY_HEADERS,
        Location: location,
        ...headers
    });

    res.end();
}

async function readRequestBody(req) {
    const chunks = [];
    let size = 0;

    for await (const chunk of req) {
        size += chunk.length;

        if (size > 4096) {
            throw new Error('Request body too large');
        }

        chunks.push(chunk);
    }

    const body = Buffer.concat(chunks).toString('utf8');

    const type = (req.headers['content-type'] ?? '')
        .split(';')[0]
        .trim();

    if (type === 'application/json') {
        const parsed = JSON.parse(body);

        if (
            !parsed ||
            typeof parsed !== 'object' ||
            Array.isArray(parsed)
        ) {
            throw new Error('Invalid JSON body');
        }

        return parsed;
    }

    if (type === 'application/x-www-form-urlencoded') {
        const params = new URLSearchParams(body);
        const result = Object.create(null);

        for (const [key, value] of params) {
            if (Object.hasOwn(result, key)) {
                throw new Error('Duplicate form parameter');
            }

            result[key] = value;
        }

        return result;
    }

    throw new Error('Unsupported content type');
}

export function createApp({
    tls = null,
    config = null,
    clients = null,
    exchangeCode,
    introspect
} = {}) {
    const sessions = createSessionStore();

    const attempts = createAttemptStore({
        ttlSeconds: config?.attemptTtlSeconds ?? 300
    });

    // Sensitive authentication results remain server-side.
    const authentication = new Map();

    const authenticationReady = Boolean(
        config && clients?.totp && clients?.face
    );

    function purgeAuthentication() {
        const now = Date.now();

        for (const [id, record] of authentication) {
            if (record.evidence.expiresAt <= now) {
                authentication.delete(id);
            }
        }
    }

    function clearAuthentication(session) {
        attempts.cancel(session.id);
        authentication.delete(session.id);
    }

    function currentStatus(session) {
        const record = authentication.get(session.id);

        if (record) {
            return {
                status: record.evidence.status,
                method: record.evidence.method,
                action: record.evidence.action,
                expiresAt: record.evidence.expiresAt
            };
        }

        return attempts.getStatus(session.id) ?? {
            status: 'idle'
        };
    }

    async function handler(req, res) {
        if (req.method === 'GET' && req.url === '/health') {
            return sendJson(res, 200, {
                status: 'ok',
                service: 'mfa-gate',
                authenticationReady
            });
        }

        // Protected resource execution remains disabled.
        if (
            req.method === 'POST' &&
            req.url === '/operations/execute'
        ) {
            return sendJson(res, 503, {
                error: 'authentication_not_available'
            });
        }

        if (!authenticationReady) {
            return sendJson(res, 404, {
                error: 'not_found'
            });
        }

        const origin = new URL(config.gateOrigin);

        if (
            req.headers.host !== origin.host ||
            !req.url.startsWith('/') ||
            req.url.startsWith('//')
        ) {
            return sendJson(res, 400, {
                error: 'invalid_request'
            });
        }

        const url = new URL(req.url, origin);

        if (url.origin !== origin.origin) {
            return sendJson(res, 400, {
                error: 'invalid_request'
            });
        }

        purgeAuthentication();

        let sessionToken = readSessionCookie(
            req.headers.cookie
        );

        let session = sessions.get(sessionToken);


        // Temporary lab authentication testing interface.
        if (
            req.method === 'GET' &&
            url.pathname === '/lab/login'
        ) {
            const headers = {};

            if (!session) {
                const created = sessions.create();

                session = created.session;

                headers['Set-Cookie'] =
                    buildSessionCookie(created.token);
            }

            res.writeHead(200, {
                ...SECURITY_HEADERS,
                'Content-Type': 'text/html; charset=utf-8',
                'Referrer-Policy': 'same-origin',
                'Content-Security-Policy':
                    "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self' https://id.test:8443",
                ...headers
            });

            return res.end(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <title>MFA Lab Test</title>
                </head>
                <body>
                    <h1>MFA Authentication Test</h1>
                    <p>Temporary integration testing interface.</p>

                    <form method="POST" action="/attempts">
                        <input
                            type="hidden"
                            name="csrfToken"
                            value="${session.csrfToken}"
                        >

                        <label for="action">Requested action:</label>

                        <select id="action" name="action">
                            <option value="view">View</option>
                            <option value="admin">Admin</option>
                        </select>

                        <br><br>

                        <button name="method" value="totp">
                            Password + TOTP
                        </button>

                        <button name="method" value="face">
                            Password + Face
                        </button>
                    </form>

                    <p>
                        <a href="/attempts/current">
                            Current authentication status
                        </a>
                    </p>
                </body>
                </html>
            `);
        }

        // Initialize an anonymous browser session if needed.
        if (
            req.method === 'GET' &&
            url.pathname === '/attempts/current'
        ) {
            const headers = {};

            if (!session) {
                const created = sessions.create();

                session = created.session;
                sessionToken = created.token;

                headers['Set-Cookie'] =
                    buildSessionCookie(sessionToken);
            }

            return sendJson(res, 200, {
                ...currentStatus(session),
                csrfToken: session.csrfToken
            }, headers);
        }

        // Keycloak callbacks use OIDC state validation.
        if (
            req.method === 'GET' &&
            [
                '/oidc/totp/callback',
                '/oidc/face/callback'
            ].includes(url.pathname)
        ) {
            if (!session) {
                return sendJson(res, 401, {
                    error: 'invalid_session'
                });
            }

            const method =
                url.pathname === '/oidc/totp/callback'
                    ? 'totp'
                    : 'face';

            try {
                const result = await handleOidcCallback({
                    config,
                    clients,
                    sessions,
                    attempts,
                    sessionToken,
                    method,
                    callbackUrl: url,
                    exchangeCode,

                    verifyEvidence: callbackResult =>
                        validateAuthenticationEvidence({
                            config,
                            clients,
                            callbackResult,
                            introspect
                        })
                });

                authentication.delete(session.id);

                authentication.set(result.session.id, {
                    identity: result.identity,
                    attemptId: result.attempt.id,
                    evidence: result.evidence,
                    accessToken: result.accessToken,
                    idToken: result.idToken
                });

                return redirect(
                    res,
                    '/attempts/current',
                    {
                        'Set-Cookie': buildSessionCookie(
                            result.sessionToken
                        )
                    }
                );

            } catch (error) {
                const safeReasons = [
                    'Invalid or expired session',
                    'Invalid callback URL',
                    'Duplicate callback parameter',
                    'Invalid callback issuer',
                    'Invalid authentication callback'
                ];

                if (safeReasons.includes(error?.message)) {
                    console.warn(
                        '[OIDC diagnostic]',
                        error.message
                    );
                }

                return sendJson(res, 401, {
                    error: 'authentication_failed'
                });
            }
        }

        const protectedPostRoutes = [
            '/attempts',
            '/attempts/cancel',
            '/logout'
        ];

        if (
            req.method === 'POST' &&
            protectedPostRoutes.includes(url.pathname)
        ) {
            if (!session) {
                return sendJson(res, 401, {
                    error: 'invalid_session'
                });
            }

            if (!verifySameOrigin(
                req.headers.origin,
                config.gateOrigin
            )) {
                return sendJson(res, 403, {
                    error: 'invalid_origin'
                });
            }

            let body;

            try {
                body = await readRequestBody(req);
            } catch {
                return sendJson(res, 400, {
                    error: 'invalid_request_body'
                });
            }

            // Recheck session validity after reading the body.
            session = sessions.get(sessionToken);

            if (!session) {
                return sendJson(res, 401, {
                    error: 'invalid_session'
                });
            }

            const csrfToken =
                req.headers['x-csrf-token'] ??
                body.csrfToken;

            if (!verifyCsrf(session, csrfToken)) {
                return sendJson(res, 403, {
                    error: 'invalid_csrf_token'
                });
            }

            if (url.pathname === '/attempts') {
                try {
                    clearAuthentication(session);

                    const attempt = attempts.create(
                        session,
                        body.method,
                        body.action
                    );

                    const loginUrl = buildLoginUrl(
                        config,
                        clients[attempt.method],
                        attempt
                    );

                    return redirect(
                        res,
                        loginUrl.href
                    );

                } catch {
                    attempts.cancel(session.id);

                    return sendJson(res, 400, {
                        error: 'invalid_authentication_attempt'
                    });
                }
            }

            if (url.pathname === '/attempts/cancel') {
                clearAuthentication(session);

                return sendJson(res, 200, {
                    status: 'cancelled'
                });
            }

            if (url.pathname === '/logout') {
                clearAuthentication(session);
                sessions.revoke(sessionToken);

                return sendJson(res, 200, {
                    status: 'logged_out'
                }, {
                    'Set-Cookie': clearSessionCookie()
                });
            }
        }

        return sendJson(res, 404, {
            error: 'not_found'
        });
    }

    function safeHandler(req, res) {
        handler(req, res).catch(() => {
            if (!res.headersSent) {
                sendJson(res, 503, {
                    error: 'service_unavailable'
                });
            } else {
                res.destroy();
            }
        });
    }

    return tls
        ? createHttpsServer(tls, safeHandler)
        : createHttpServer(safeHandler);
}
