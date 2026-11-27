import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { loadConfig } from '../src/config.js';

const exampleEnv = parseEnv(
    readFileSync(
        new URL('../../../.env.example', import.meta.url),
        'utf8'
    )
);

test('valid project configuration is accepted', () => {
    const config = loadConfig(exampleEnv);

    assert.equal(config.gateListenHost, '127.0.0.1');
    assert.equal(config.totpClientId, 'gate-totp');
    assert.equal(config.faceClientId, 'gate-face');
    assert.equal(config.attemptTtlSeconds, 300);
    assert.equal(config.captureMaxBytes, 1048576);
});

test('missing required configuration is rejected', () => {
    assert.throws(() => {
        loadConfig({
            ...exampleEnv,
            KEYCLOAK_ISSUER: ''
        });
    }, /Missing configuration/);
});

test('insecure Keycloak issuer is rejected', () => {
    assert.throws(() => {
        loadConfig({
            ...exampleEnv,
            KEYCLOAK_ISSUER: 'http://localhost:8080/realms/test'
        });
    }, /Invalid HTTPS URL/);
});

test('external network binding is rejected', () => {
    assert.throws(() => {
        loadConfig({
            ...exampleEnv,
            GATE_LISTEN_HOST: '0.0.0.0'
        });
    }, /loopback only/);
});

test('identical authentication clients are rejected', () => {
    assert.throws(() => {
        loadConfig({
            ...exampleEnv,
            KEYCLOAK_FACE_CLIENT_ID:
                exampleEnv.KEYCLOAK_TOTP_CLIENT_ID
        });
    }, /must be distinct/);
});

test('relative secret file paths are rejected', () => {
    assert.throws(() => {
        loadConfig({
            ...exampleEnv,
            TOTP_CLIENT_SECRET_FILE: './secret.txt'
        });
    }, /Expected absolute path/);
});

test('invalid attempt lifetime is rejected', () => {
    assert.throws(() => {
        loadConfig({
            ...exampleEnv,
            ATTEMPT_TTL_SECONDS: '-1'
        });
    }, /Invalid positive integer/);
});

test('excessive attempt lifetime is rejected', () => {
    assert.throws(() => {
        loadConfig({
            ...exampleEnv,
            ATTEMPT_TTL_SECONDS: '3600'
        });
    }, /Invalid range/);
});

test('face verification is disabled without a threshold', () => {
    const config = loadConfig({
        ...exampleEnv,
        FACE_SIMILARITY_THRESHOLD: ''
    });

    assert.equal(config.faceSimilarityThreshold, null);
});

test('invalid face threshold is rejected', () => {
    assert.throws(() => {
        loadConfig({
            ...exampleEnv,
            FACE_SIMILARITY_THRESHOLD: '1.5'
        });
    }, /Invalid face similarity threshold/);
});

test('loaded configuration is immutable', () => {
    const config = loadConfig(exampleEnv);

    assert.equal(Object.isFrozen(config), true);
});
