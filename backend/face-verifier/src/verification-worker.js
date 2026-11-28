'use strict';
const { POLICY, validReference, validDescriptor, validScore } = require('./verification-policy');
const known = new Set(['INVALID_INPUT','EMPTY_IMAGE','IMAGE_TOO_LARGE','INVALID_IMAGE_FORMAT','INVALID_JPEG','INVALID_DIMENSIONS','INVALID_PIXEL_DATA','NO_FACE','MULTIPLE_FACES','LOW_CONFIDENCE','INVALID_FACE_SCORE','INVALID_FACE_BOX','FACE_TOO_SMALL','FACE_OUT_OF_FRAME','LOW_MESH_CONFIDENCE','INVALID_DESCRIPTOR','INVALID_SIMILARITY','INFERENCE_ERROR','VERIFIER_BUSY']);
process.once('message', async request => {
    let extracted;
    let result;
    try {
        const { initializeModel, getRuntimeInfo } = require('./human-runtime');
        const { extractDescriptor, FACE_POLICY } = require('./face-detector');
        const { IMAGE_LIMITS } = require('./image-validator');
        const { compareDescriptors, MATCH_OPTIONS } = require('./face-comparison');
        try { await initializeModel(); } catch { throw { code: 'MODEL_UNAVAILABLE' }; }
        const info = getRuntimeInfo();
        if (info?.humanVersion !== POLICY.humanVersion || info.tensorflowVersion !== POLICY.tensorflowVersion || info.backend !== POLICY.backend ||
            Object.entries(POLICY.modelChecksums).some(([k,v]) => info.modelChecksums?.[k] !== v) ||
            Object.entries(POLICY.matchOptions).some(([k,v]) => MATCH_OPTIONS[k] !== v) ||
            Object.entries(POLICY.facePolicy).some(([k,v]) => FACE_POLICY[k] !== v) ||
            Object.entries(POLICY.imageLimits).some(([k,v]) => IMAGE_LIMITS[k] !== v)) throw { code: 'MODEL_POLICY_MISMATCH' };
        if (request.operation === 'verify' && !validReference(request.reference)) throw { code: 'INVALID_REFERENCE' };
        extracted = await extractDescriptor(request.image);
        if (!validDescriptor(extracted.descriptor)) throw { code: 'INVALID_DESCRIPTOR' };
        if (request.operation === 'enroll') {
            result = { ok: true, reference: { policyVersion: POLICY.version, descriptor: Array.from(extracted.descriptor) }, inferenceMs: extracted.inferenceMs };
        } else if (request.operation === 'verify') {
            const { similarity } = await compareDescriptors(request.reference.descriptor, extracted.descriptor);
            if (!validScore(similarity)) throw { code: 'INVALID_SIMILARITY' };
            result = { ok: true, similarity, inferenceMs: extracted.inferenceMs };
        } else throw { code: 'INVALID_INPUT' };
    } catch (error) {
        const code = error?.code;
        result = { ok: false, code: known.has(code) || ['MODEL_UNAVAILABLE','MODEL_POLICY_MISMATCH','INVALID_REFERENCE'].includes(code) ? code : 'INFERENCE_ERROR' };
    } finally {
        extracted?.descriptor?.fill(0);
        if (Array.isArray(request?.reference?.descriptor)) request.reference.descriptor.fill(0);
        if (Buffer.isBuffer(request?.image)) request.image.fill(0);
    }
    // Parent validates this private response and kills/reaps the one-shot worker.
    process.send(result, () => { result.reference?.descriptor?.fill(0); });
});
