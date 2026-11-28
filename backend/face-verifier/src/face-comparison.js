const { performance } = require('node:perf_hooks');
const { initializeModel } = require('./human-runtime');
const { extractDescriptor, validateDescriptor } = require('./face-detector');
const { FaceVerifierError } = require('./image-validator');

// Fixed algorithm settings, not authentication acceptance thresholds.
const MATCH_OPTIONS = Object.freeze({ order: 2, multiplier: 25, min: 0.2, max: 0.8 });

async function compareDescriptors(referenceDescriptor, probeDescriptor) {
    validateDescriptor(referenceDescriptor);
    validateDescriptor(probeDescriptor);
    const human = await initializeModel();
    const startTime = performance.now();
    const similarity = human.match.similarity(referenceDescriptor, probeDescriptor, MATCH_OPTIONS);
    if (!Number.isFinite(similarity) || similarity < 0 || similarity > 1) {
        throw new FaceVerifierError('INVALID_SIMILARITY', 'Similarity calculation returned an invalid score');
    }
    return { similarity, comparisonMs: Number((performance.now() - startTime).toFixed(3)) };
}

// Local evaluation only. Production references must be selected by the trusted backend.
async function compareImages(referenceImage, probeImage) {
    const startTime = performance.now();
    let reference = null;
    let probe = null;
    try {
        reference = await extractDescriptor(referenceImage);
        probe = await extractDescriptor(probeImage);
        const comparison = await compareDescriptors(reference.descriptor, probe.descriptor);
        return {
            similarity: comparison.similarity,
            reference: {
                faceConfidence: reference.confidence,
                meshConfidence: reference.meshConfidence,
                descriptorLength: reference.descriptorLength,
                inferenceMs: reference.inferenceMs
            },
            probe: {
                faceConfidence: probe.confidence,
                meshConfidence: probe.meshConfidence,
                descriptorLength: probe.descriptorLength,
                inferenceMs: probe.inferenceMs
            },
            comparisonMs: comparison.comparisonMs,
            totalMs: Math.round(performance.now() - startTime),
            threshold: null,
            matched: null,
            authenticationReady: false
        };
    } finally {
        // Best-effort clearing of local arrays, not guaranteed secure erasure.
        reference?.descriptor?.fill(0);
        probe?.descriptor?.fill(0);
    }
}
module.exports = { MATCH_OPTIONS, compareDescriptors, compareImages };
