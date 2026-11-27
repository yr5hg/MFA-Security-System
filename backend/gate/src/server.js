import { readFileSync } from 'node:fs';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

try {
    const config = loadConfig();
    const origin = new URL(config.gateOrigin);

    const tls = {
        cert: readFileSync(config.gateTlsCertFile),
        key: readFileSync(config.gateTlsKeyFile),
        minVersion: 'TLSv1.2'
    };

    const server = createApp({ tls });

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
            console.log('Authentication integration pending');
        }
    );

} catch (error) {
    console.error('Gate startup failed:', error.message);
    process.exitCode = 1;
}
