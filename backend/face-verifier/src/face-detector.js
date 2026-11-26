
const { performance } = require('node:perf_hooks');

const {
    initializeModel,
    tf
} = require('./human-runtime');

const {
    decodeImage,
    FaceVerifierError
} = require('./image-validator');

const FACE_POLICY = Object.freeze({
    minConfidence: 0.5,
    minFaceWidth: 80,
    minFaceHeight: 80
});

// Prevent overlapping inference on the shared Human instance.
let inferenceRunning = false;

async function detectFace(imageBuffer) {
    const startTime = performance.now();

    const image = decodeImage(imageBuffer);

    if (inferenceRunning) {
        throw new FaceVerifierError(
            'VERIFIER_BUSY',
            'Another inference is already running'
        );
    }

    inferenceRunning = true;

    let tensor = null;

    try {
        const human = await initializeModel();

        tensor = tf.tensor3d(
            image.data,
            [image.height, image.width, 3],
            'int32'
        );

        const inferenceStart = performance.now();

        const result = await human.detect(tensor);

        const inferenceMs = Math.round(
            performance.now() - inferenceStart
        );

        if (
            !result ||
            result.error ||
            !Array.isArray(result.face)
        ) {
            throw new FaceVerifierError(
                'INFERENCE_ERROR',
                'Human returned an invalid detection result'
            );
        }

        const faceCount = result.face.length;

        if (faceCount === 0) {
            throw new FaceVerifierError(
                'NO_FACE',
                'No face was detected'
            );
        }

        if (faceCount !== 1) {
            throw new FaceVerifierError(
                'MULTIPLE_FACES',
                'Exactly one face is required'
            );
        }

        const face = result.face[0];
        const confidence = face.boxScore;

        if (
            !Number.isFinite(confidence) ||
            confidence < 0 ||
            confidence > 1
        ) {
            throw new FaceVerifierError(
                'INVALID_FACE_SCORE',
                'Face detection confidence is invalid'
            );
        }

        if (confidence < FACE_POLICY.minConfidence) {
            throw new FaceVerifierError(
                'LOW_CONFIDENCE',
                'Face detection confidence is too low'
            );
        }

        const box = face.box;

        if (
            !Array.isArray(box) ||
            box.length !== 4 ||
            !box.every(Number.isFinite)
        ) {
            throw new FaceVerifierError(
                'INVALID_FACE_BOX',
                'Detected face location is invalid'
            );
        }

        const [x, y, width, height] = box;

        if (
            width < FACE_POLICY.minFaceWidth ||
            height < FACE_POLICY.minFaceHeight
        ) {
            throw new FaceVerifierError(
                'FACE_TOO_SMALL',
                'Move closer to the camera'
            );
        }

        if (
            x < 0 ||
            y < 0 ||
            x + width > image.width ||
            y + height > image.height
        ) {
            throw new FaceVerifierError(
                'FACE_OUT_OF_FRAME',
                'Face must be fully inside the image'
            );
        }

        return {
            accepted: true,
            faceCount,
            confidence,

            box: {
                x,
                y,
                width,
                height
            },

            image: {
                width: image.width,
                height: image.height
            },

            inferenceMs,

            totalMs: Math.round(
                performance.now() - startTime
            )
        };

    } catch (error) {
        if (error instanceof FaceVerifierError) {
            throw error;
        }

        throw new FaceVerifierError(
            'INFERENCE_ERROR',
            'Face detection could not be completed'
        );

    } finally {
        if (tensor && !tensor.isDisposed) {
            tensor.dispose();
        }

        inferenceRunning = false;
    }
}

module.exports = {
    FACE_POLICY,
    detectFace
};
