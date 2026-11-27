import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';

function sendJson(res, status, body) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });

    res.end(JSON.stringify(body));
}

export function createApp({ tls = null } = {}) {
    function handler(req, res) {
        if (req.method === 'GET' && req.url === '/health') {
            return sendJson(res, 200, {
                status: 'ok',
                service: 'mfa-gate',
                authenticationReady: false
            });
        }

        if (
            req.method === 'POST' &&
            req.url === '/operations/execute'
        ) {
            return sendJson(res, 503, {
                error: 'authentication_not_available'
            });
        }

        return sendJson(res, 404, {
            error: 'not_found'
        });
    }

    return tls
        ? createHttpsServer(tls, handler)
        : createHttpServer(handler);
}
