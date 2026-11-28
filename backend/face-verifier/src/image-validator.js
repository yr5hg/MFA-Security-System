
const jpeg = require('jpeg-js');

const IMAGE_LIMITS = Object.freeze({
    maxBytes: 1024 * 1024,
    minWidth: 160,
    minHeight: 160,
    maxWidth: 1280,
    maxHeight: 1280,
    maxResolutionInMP: 2,
    maxMemoryUsageInMB: 64
});

class FaceVerifierError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'FaceVerifierError';
        this.code = code;
    }
}

function decodeImage(imageBuffer) {
    if (!Buffer.isBuffer(imageBuffer)) {
        throw new FaceVerifierError(
            'INVALID_INPUT',
            'Image must be provided as a Buffer'
        );
    }

    if (imageBuffer.length === 0) {
        throw new FaceVerifierError(
            'EMPTY_IMAGE',
            'Image is empty'
        );
    }

    if (imageBuffer.length > IMAGE_LIMITS.maxBytes) {
        throw new FaceVerifierError(
            'IMAGE_TOO_LARGE',
            'Image exceeds the 1 MiB limit'
        );
    }

    // Verify JPEG start-of-image marker.
    if (
        imageBuffer.length < 4 ||
        imageBuffer[0] !== 0xff ||
        imageBuffer[1] !== 0xd8
    ) {
        throw new FaceVerifierError(
            'INVALID_IMAGE_FORMAT',
            'Only JPEG images are accepted'
        );
    }

    // Reject incomplete JPEG files.
    if (
        imageBuffer[imageBuffer.length - 2] !== 0xff ||
        imageBuffer[imageBuffer.length - 1] !== 0xd9
    ) {
        throw new FaceVerifierError(
            'INVALID_JPEG',
            'JPEG image is incomplete'
        );
    }

    let decoded;

    try {
        decoded = jpeg.decode(imageBuffer, {
            useTArray: true,
            formatAsRGBA: false,
            tolerantDecoding: false,
            maxResolutionInMP:
                IMAGE_LIMITS.maxResolutionInMP,
            maxMemoryUsageInMB:
                IMAGE_LIMITS.maxMemoryUsageInMB
        });
    } catch {
        throw new FaceVerifierError(
            'INVALID_JPEG',
            'JPEG image could not be decoded safely'
        );
    }

    const { width, height, data } = decoded;

    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < IMAGE_LIMITS.minWidth ||
        height < IMAGE_LIMITS.minHeight ||
        width > IMAGE_LIMITS.maxWidth ||
        height > IMAGE_LIMITS.maxHeight
    ) {
        throw new FaceVerifierError(
            'INVALID_DIMENSIONS',
            'Image dimensions are outside the allowed range'
        );
    }

    if (
        !data ||
        data.length !== width * height * 3
    ) {
        throw new FaceVerifierError(
            'INVALID_PIXEL_DATA',
            'Decoded RGB pixel data is invalid'
        );
    }

    return {
        width,
        height,
        data
    };
}

module.exports = {
    IMAGE_LIMITS,
    FaceVerifierError,
    decodeImage
};
