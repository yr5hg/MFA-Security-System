import { createServer } from 'node:http';

function sendJson(res, status, body) {
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
    });

    res.end(JSON.stringify(body));
}

export function createApp() {
    return createServer((req, res) => {
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
    });
}
