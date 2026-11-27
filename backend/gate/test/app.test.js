import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

async function withServer(callback) {
    const server = createApp();

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });

    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
        await callback(baseUrl);
    } finally {
        await new Promise((resolve, reject) => {
            server.close(error => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
}

test('health endpoint responds successfully', async () => {
    await withServer(async baseUrl => {
        const response = await fetch(`${baseUrl}/health`);
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.status, 'ok');
        assert.equal(body.service, 'mfa-gate');
        assert.equal(body.authenticationReady, false);
    });
});

test('protected operations are denied by default', async () => {
    await withServer(async baseUrl => {
        const response = await fetch(
            `${baseUrl}/operations/execute`,
            { method: 'POST' }
        );

        const body = await response.json();

        assert.equal(response.status, 503);
        assert.equal(
            body.error,
            'authentication_not_available'
        );
    });
});

test('unknown endpoints return 404', async () => {
    await withServer(async baseUrl => {
        const response = await fetch(`${baseUrl}/unknown`);

        assert.equal(response.status, 404);
    });
});
