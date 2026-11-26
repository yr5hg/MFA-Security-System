const { performance } = require('node:perf_hooks');
const { initializeModel, tf } = require('./human-runtime');
const { decodeImage, FaceVerifierError } = require('./image-validator');

const DESCRIPTOR_LENGTH = 1024;
const FACE_POLICY = Object.freeze({
    minConfidence: 0.5,
    minMeshConfidence: 0.5,
    minFaceWidth: 80,
    minFaceHeight: 80
});
const DETECTION_CONFIG = {
    face: {
        detector: { rotation: false },
        mesh: { enabled: false },
        description: { enabled: false }
    }
};
const DESCRIPTOR_CONFIG = {
    face: {
        detector: { rotation: true },
        mesh: { enabled: true, keepInvalid: true },
        description: { enabled: true }
    }
};
let inferenceRunning = false;

function requireSingleFace(result) {
    if (!result || result.error || !Array.isArray(result.face)) {
        throw new FaceVerifierError('INFERENCE_ERROR', 'Invalid Human detection result');
    }
    if (result.face.length === 0) {
        throw new FaceVerifierError('NO_FACE', 'No face was detected');
    }
    if (result.face.length !== 1) {
        throw new FaceVerifierError('MULTIPLE_FACES', 'Exactly one face is required');
    }
    return result.face[0];
}

function validateFace(face, image) {
    const confidence = face.boxScore;
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
        throw new FaceVerifierError('INVALID_FACE_SCORE', 'Invalid face detection confidence');
    }
    if (confidence < FACE_POLICY.minConfidence) {
        throw new FaceVerifierError('LOW_CONFIDENCE', 'Face detection confidence is too low');
    }
    const box = face.box;
    if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) {
        throw new FaceVerifierError('INVALID_FACE_BOX', 'Invalid detected face location');
    }
    const [x, y, width, height] = box;
    if (width < FACE_POLICY.minFaceWidth || height < FACE_POLICY.minFaceHeight) {
        throw new FaceVerifierError('FACE_TOO_SMALL', 'Move closer to the camera');
    }
    if (x < 0 || y < 0 || x + width > image.width || y + height > image.height) {
        throw new FaceVerifierError('FACE_OUT_OF_FRAME', 'Face must be fully inside the image');
    }
    return { confidence, box: { x, y, width, height } };
}

function validateDescriptor(descriptor) {
    if (!Array.isArray(descriptor) || descriptor.length !== DESCRIPTOR_LENGTH) {
        throw new FaceVerifierError('INVALID_DESCRIPTOR', 'Unexpected facial descriptor length');
    }
    let magnitude = 0;
    for (const value of descriptor) {
        if (!Number.isFinite(value)) {
            throw new FaceVerifierError('INVALID_DESCRIPTOR', 'Descriptor contains invalid values');
        }
        magnitude += value * value;
    }
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
        throw new FaceVerifierError('INVALID_DESCRIPTOR', 'Descriptor magnitude is invalid');
    }
    return true;
}

async function processFace(imageBuffer, includeDescriptor = false) {
    const startTime = performance.now();
    if (inferenceRunning) {
        throw new FaceVerifierError('VERIFIER_BUSY', 'Another inference is already running');
    }
    inferenceRunning = true;
    let tensor = null;
    try {
        const image = decodeImage(imageBuffer);
        const human = await initializeModel();
        tensor = tf.tensor3d(image.data, [image.height, image.width, 3], 'int32');
        const inferenceStart = performance.now();

        // First pass: detect all visible face candidates.
        const detectionResult = await human.detect(tensor, DETECTION_CONFIG);
        const detectedFace = requireSingleFace(detectionResult);
        const metadata = validateFace(detectedFace, image);
        let descriptor = null;
        let meshConfidence = null;

        if (includeDescriptor) {
            // Second pass: facial landmarks and embedding.
            const descriptionResult = await human.detect(tensor, DESCRIPTOR_CONFIG);
            const describedFace = requireSingleFace(descriptionResult);
            validateFace(describedFace, image);
            meshConfidence = describedFace.faceScore;
            if (!Number.isFinite(meshConfidence) || meshConfidence > 1 ||
                meshConfidence < FACE_POLICY.minMeshConfidence) {
                throw new FaceVerifierError('LOW_MESH_CONFIDENCE',
                    'Facial landmarks could not be extracted reliably');
            }
            validateDescriptor(describedFace.embedding);
            descriptor = Array.from(describedFace.embedding);
        }

        const result = {
            accepted: true,
            faceCount: 1,
            confidence: metadata.confidence,
            box: metadata.box,
            image: { width: image.width, height: image.height },
            inferenceMs: Math.round(performance.now() - inferenceStart),
            totalMs: Math.round(performance.now() - startTime)
        };
        if (includeDescriptor) {
            result.meshConfidence = meshConfidence;
            result.descriptorLength = descriptor.length;
            result.descriptor = descriptor;
        }
        return result;
    } catch (error) {
        if (error instanceof FaceVerifierError) throw error;
        const wrapped = new FaceVerifierError('INFERENCE_ERROR', 'Facial inference could not be completed');
        wrapped.cause = error;
        throw wrapped;
    } finally {
        if (tensor && !tensor.isDisposed) tensor.dispose();
        inferenceRunning = false;
    }
}
async function detectFace(imageBuffer) { return processFace(imageBuffer, false); }
async function extractDescriptor(imageBuffer) { return processFace(imageBuffer, true); }
module.exports = { FACE_POLICY, DESCRIPTOR_LENGTH, validateDescriptor, detectFace, extractDescriptor };
