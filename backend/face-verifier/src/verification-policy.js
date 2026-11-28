'use strict';
const POLICY = Object.freeze({
    version: 'human-3.3.6-wasm-lab-v1',
    threshold: 0.66,
    descriptorLength: 1024,
    maxBytes: 1048576,
    maxTimeoutMs: 10000,
    humanVersion: '3.3.6', tensorflowVersion: '4.22.0',
    backend: 'wasm',
    facePolicy: Object.freeze({minConfidence: 0.5, minMeshConfidence: 0.5, minFaceWidth: 80, minFaceHeight: 80}),
    imageLimits: Object.freeze({maxBytes: 1048576, minWidth: 160, minHeight: 160, maxWidth: 1280, maxHeight: 1280, maxResolutionInMP: 2, maxMemoryUsageInMB: 64}),
    matchOptions: Object.freeze({ order: 2, multiplier: 25, min: 0.2, max: 0.8 }),
    modelChecksums: Object.freeze({
        'blazeface.json': 'cd7bbfc078270572beb39f9e5ae67aadbd50b5e67cff37e6d4f6b3ea39312e5f',
        'blazeface.bin': 'dc9a97fdc50bc43216554bdd69aa3e7b9361a519ee7bdd996a2f69a98a6f9b72',
        'facemesh.json': 'b60ca26f404724f43bd2b1575761d8265180e1f053cc0731caa68462927309e7',
        'facemesh.bin': '3826da640b0a3021161605369ee6af293f75d518040355b960ec71a3390c1c0b',
        'faceres.json': '5b83d49c0385d2e68a05122441b94226313677cae9fcc40b9587ad50079eb4df',
        'faceres.bin': '2c7d2d62b76c97528b736527aa09d310ea71743c9e3e79fb6c62d4b2d73af79b'
    })
});
function validDescriptor(values) {
    if (!Array.isArray(values) || values.length !== POLICY.descriptorLength) return false;
    let sum = 0;
    for (const v of values) { if (!Number.isFinite(v)) return false; sum += v*v; }
    return Number.isFinite(sum) && sum > 0;
}
function validReference(ref) {
    return ref !== null && typeof ref === 'object' && ref.policyVersion === POLICY.version && validDescriptor(ref.descriptor);
}
function validScore(score) { return Number.isFinite(score) && score >= 0 && score <= 1; }
function meetsThreshold(score, threshold) { return validScore(score) && threshold === POLICY.threshold && score >= threshold; }
module.exports = { POLICY, validDescriptor, validReference, validScore, meetsThreshold };
