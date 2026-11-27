'use strict';
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { POLICY, validReference, validScore, meetsThreshold } = require('./src/verification-policy');
const { createRunner } = require('./src/worker-runner');
const allowedErrors = new Set(['INVALID_INPUT','EMPTY_IMAGE','IMAGE_TOO_LARGE','INVALID_IMAGE_FORMAT','INVALID_JPEG','INVALID_DIMENSIONS','INVALID_PIXEL_DATA','NO_FACE','MULTIPLE_FACES','LOW_CONFIDENCE','INVALID_FACE_SCORE','INVALID_FACE_BOX','FACE_TOO_SMALL','FACE_OUT_OF_FRAME','LOW_MESH_CONFIDENCE','INVALID_DESCRIPTOR','INVALID_SIMILARITY','INFERENCE_ERROR','VERIFIER_BUSY','MODEL_UNAVAILABLE','MODEL_POLICY_MISMATCH','INVALID_REFERENCE','INFERENCE_TIMEOUT','WORKER_ERROR']);
function createFaceVerifier({ threshold = null, timeoutMs = 10000, modelDir = process.env.HUMAN_MODEL_DIR } = {}) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > POLICY.maxTimeoutMs) throw new Error('Invalid inference timeout');
    if (modelDir !== undefined && (typeof modelDir !== 'string' || !path.isAbsolute(modelDir))) throw new Error('Invalid model directory');
    // Missing threshold disables verification; a different value requires a new calibrated policy.
    if (threshold !== null && threshold !== POLICY.threshold) throw new Error('Threshold does not match the frozen lab policy');
    const env = { ...process.env };
    if (modelDir !== undefined) env.HUMAN_MODEL_DIR = modelDir;
    else delete env.HUMAN_MODEL_DIR;
    const run = createRunner(path.join(__dirname,'src','verification-worker.js'), env);
    function inputError(image) {
        if (!Buffer.isBuffer(image)) return 'INVALID_INPUT';
        if (!image.length) return 'EMPTY_IMAGE';
        if (image.length > POLICY.maxBytes) return 'IMAGE_TOO_LARGE';
        return null;
    }
    function failure(code) { return { ok: false, matched: false, code, policyVersion: POLICY.version }; }
    function responseError(result) {
        if (!result || typeof result !== 'object') return 'INVALID_WORKER_RESULT';
        if (result.ok === false) return allowedErrors.has(result.code) ? result.code : 'INVALID_WORKER_RESULT';
        if (result.ok !== true || !Number.isFinite(result.inferenceMs) || result.inferenceMs < 0) return 'INVALID_WORKER_RESULT';
        return null;
    }
    async function enroll(image) {
        const bad = inputError(image);
        if (bad) return failure(bad);
        const result = await run({ operation: 'enroll', image }, timeoutMs);
        const err = responseError(result);
        if (err) return failure(err);
        if (!validReference(result.reference)) return failure('INVALID_WORKER_RESULT');
        return { ok: true, reference: result.reference, inferenceMs: result.inferenceMs, policyVersion: POLICY.version };
    }
    async function verify(image, reference) {
        if (threshold === null) return failure('THRESHOLD_NOT_CONFIGURED');
        const bad = inputError(image);
        if (bad) return failure(bad);
        if (reference == null) return failure('MISSING_REFERENCE');
        if (!validReference(reference)) return failure('INVALID_REFERENCE');
        const started = performance.now();
        const result = await run({ operation: 'verify', image, reference }, timeoutMs);
        const err = responseError(result);
        if (err) return failure(err);
        if (!validScore(result.similarity)) return failure('INVALID_WORKER_RESULT');
        const matched = meetsThreshold(result.similarity, threshold);
        return { ok: matched, matched, code: matched ? 'MATCH' : 'FACE_MISMATCH', similarity: result.similarity, threshold, policyVersion: POLICY.version, inferenceMs: result.inferenceMs, totalMs: Math.round(performance.now()-started) };
    }
    return Object.freeze({ enroll, verify });
}
module.exports = { createFaceVerifier, POLICY };
