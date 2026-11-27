import { readFileSync } from 'node:fs';

import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { loadOidcClients } from './oidc.js';

try {
    const config = loadConfig();
    const origin = new URL(config.gateOrigin);

    const tls = {
        cert: readFileSync(config.gateTlsCertFile),
        key: readFileSync(config.gateTlsKeyFile),
        minVersion: 'TLSv1.2'
    };

    console.log('Initializing Keycloak OIDC clients...');

    const clients = await loadOidcClients(config);

    console.log('TOTP OIDC client initialized');
    console.log('Face OIDC client initialized');

    const server = createApp({
        tls,
        config,
        clients
    });

    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    server.keepAliveTimeout = 5000;
    server.maxHeadersCount = 100;

    server.on('error', error => {
        console.error('Gate server error:', error.code);
        process.exitCode = 1;
    });

    server.listen(
        Number(origin.port || 443),
        config.gateListenHost,
        () => {
            console.log('MFA gate started successfully');
            console.log(`Origin: ${config.gateOrigin}`);
            console.log(`Process UID: ${process.getuid()}`);
            console.log('OIDC authentication initialized');
            console.log('Protected operations remain disabled');
        }
    );

} catch (error) {
    console.error(
        'Gate startup failed:',
        error.cause?.code ?? error.code ?? error.name
    );

    process.exitCode = 1;
}
