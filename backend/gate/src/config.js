import { isAbsolute } from 'node:path';

function required(env, name) {
    const value = env[name]?.trim();

    if (!value) {
        throw new Error(`Missing configuration: ${name}`);
    }

    return value;
}

function httpsUrl(env, name) {
    const value = required(env, name);
    const url = new URL(value);

    if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
    ) {
        throw new Error(`Invalid HTTPS URL: ${name}`);
    }

    return value;
}

function absolutePath(env, name) {
    const value = required(env, name);

    if (!isAbsolute(value)) {
        throw new Error(`Expected absolute path: ${name}`);
    }

    return value;
}

function positiveInteger(env, name, max = Number.MAX_SAFE_INTEGER) {
    const value = required(env, name);

    if (!/^[1-9]\d*$/.test(value)) {
        throw new Error(`Invalid positive integer: ${name}`);
    }

    const number = Number(value);

    if (!Number.isSafeInteger(number) || number > max) {
        throw new Error(`Invalid range: ${name}`);
    }

    return number;
}

function faceThreshold(env) {
    const value = env.FACE_SIMILARITY_THRESHOLD?.trim();

    // Face authentication remains disabled until calibration.
    if (!value) {
        return null;
    }

    const threshold = Number(value);

    if (
        !Number.isFinite(threshold) ||
        threshold <= 0 ||
        threshold > 1
    ) {
        throw new Error('Invalid face similarity threshold');
    }

    return threshold;
}

export function loadConfig(env = process.env) {
    const gateOrigin = httpsUrl(env, 'GATE_ORIGIN');
    const gateListenHost = required(env, 'GATE_LISTEN_HOST');

    if (gateOrigin !== new URL(gateOrigin).origin) {
        throw new Error('GATE_ORIGIN must contain only an origin');
    }

    if (gateListenHost !== '127.0.0.1') {
        throw new Error('Gate must listen on loopback only');
    }

    const totpClientId = required(env, 'KEYCLOAK_TOTP_CLIENT_ID');
    const faceClientId = required(env, 'KEYCLOAK_FACE_CLIENT_ID');

    if (totpClientId === faceClientId) {
        throw new Error('Authentication clients must be distinct');
    }

    return Object.freeze({
        gateOrigin,
        gateListenHost,

        keycloakIssuer: httpsUrl(env, 'KEYCLOAK_ISSUER'),
        totpClientId,
        faceClientId,
        resourceAudience: required(env, 'RESOURCE_AUDIENCE'),

        totpClientSecretFile:
            absolutePath(env, 'TOTP_CLIENT_SECRET_FILE'),

        faceClientSecretFile:
            absolutePath(env, 'FACE_CLIENT_SECRET_FILE'),

        labCaFile: absolutePath(env, 'LAB_CA_FILE'),
        gateTlsCertFile: absolutePath(env, 'GATE_TLS_CERT_FILE'),
        gateTlsKeyFile: absolutePath(env, 'GATE_TLS_KEY_FILE'),

        privateStateDir: absolutePath(env, 'PRIVATE_STATE_DIR'),
        humanModelDir: absolutePath(env, 'HUMAN_MODEL_DIR'),

        protectedResourceFile:
            '/srv/mfa-lab/protected/confidential.txt',

        faceSimilarityThreshold: faceThreshold(env),

        attemptTtlSeconds:
            positiveInteger(env, 'ATTEMPT_TTL_SECONDS', 300),

        captureChallengeTtlSeconds:
            positiveInteger(env, 'CAPTURE_CHALLENGE_TTL_SECONDS', 60),

        approvalTtlSeconds:
            positiveInteger(env, 'APPROVAL_TTL_SECONDS', 600),

        inferenceTimeoutMs:
            positiveInteger(env, 'INFERENCE_TIMEOUT_MS', 10000),

        captureMaxBytes:
            positiveInteger(env, 'CAPTURE_MAX_BYTES', 1048576),

        faceFailureLimit:
            positiveInteger(env, 'FACE_FAILURE_LIMIT', 3),

        faceFailureWindowSeconds:
            positiveInteger(env, 'FACE_FAILURE_WINDOW_SECONDS'),

        faceCooldownSeconds:
            positiveInteger(env, 'FACE_COOLDOWN_SECONDS')
    });
}
