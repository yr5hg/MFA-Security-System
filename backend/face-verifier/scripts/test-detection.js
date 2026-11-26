
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

const jpeg = require('jpeg-js');

const {
    initializeModel,
    getRuntimeInfo
} = require('../src/human-runtime');

const {
    decodeImage,
    IMAGE_LIMITS
} = require('../src/image-validator');

const {
    detectFace
} = require('../src/face-detector');

let passed = 0;
let failed = 0;

async function test(name, callback) {
    try {
        await callback();
        console.log(`[PASS] ${name}`);
        passed++;
    } catch (error) {
        console.error(
            `[FAIL] ${name}:`,
            error.code || error.message
        );
        failed++;
    }
}

function createBlankJpeg(width, height) {
    const pixels = Buffer.alloc(
        width * height * 4,
        255
    );

    return jpeg.encode({
        data: pixels,
        width,
        height
    }, 80).data;
}

function readTestImage(filePath) {
    const stats = fs.statSync(filePath);

    if (!stats.isFile()) {
        throw new Error('Test input is not a file');
    }

    if (stats.size > IMAGE_LIMITS.maxBytes) {
        throw new Error('Test image exceeds 1 MiB');
    }

    return fs.readFileSync(filePath);
}

async function main() {
    const singleFacePath = process.argv[2];
    const multipleFacesPath = process.argv[3];

    console.log('=== Human Face Detection Tests ===');

    // Part 2: Model initialization.
    const loadStart = performance.now();

    await initializeModel();

    console.log('\n=== Runtime Information ===');

    console.log(
        JSON.stringify(getRuntimeInfo(), null, 2)
    );

    console.log(
        'Model initialization:',
        Math.round(performance.now() - loadStart),
        'ms'
    );

    // Part 3: Image validation tests.
    console.log('\n=== Image Validation ===');

    const blank = createBlankJpeg(640, 480);

    await test('Valid JPEG decoding', () => {
        const result = decodeImage(blank);

        assert.equal(result.width, 640);
        assert.equal(result.height, 480);
        assert.equal(result.data.length, 640 * 480 * 3);
    });

    await test('Reject non-buffer input', () => {
        assert.throws(
            () => decodeImage('invalid input'),
            { code: 'INVALID_INPUT' }
        );
    });

    await test('Reject empty image', () => {
        assert.throws(
            () => decodeImage(Buffer.alloc(0)),
            { code: 'EMPTY_IMAGE' }
        );
    });

    await test('Reject oversized image', () => {
        assert.throws(
            () => decodeImage(
                Buffer.alloc(IMAGE_LIMITS.maxBytes + 1)
            ),
            { code: 'IMAGE_TOO_LARGE' }
        );
    });

    await test('Reject non-JPEG data', () => {
        assert.throws(
            () => decodeImage(
                Buffer.from('not a JPEG image')
            ),
            { code: 'INVALID_IMAGE_FORMAT' }
        );
    });

    await test('Reject malformed JPEG', () => {
        const malformed = Buffer.from([
            0xff, 0xd8,
            0x00, 0x00,
            0xff, 0xd9
        ]);

        assert.throws(
            () => decodeImage(malformed),
            { code: 'INVALID_JPEG' }
        );
    });

    await test('Reject small image dimensions', () => {
        const small = createBlankJpeg(32, 32);

        assert.throws(
            () => decodeImage(small),
            { code: 'INVALID_DIMENSIONS' }
        );
    });

    await test('Reject excessive image width', () => {
        const wide = createBlankJpeg(1400, 480);

        assert.throws(
            () => decodeImage(wide),
            { code: 'INVALID_DIMENSIONS' }
        );
    });

    console.log('\n=== Facial Inference ===');

    await test('Reject image containing no face', async () => {
        await assert.rejects(
            () => detectFace(blank),
            { code: 'NO_FACE' }
        );
    });

    if (singleFacePath) {
        await test('Accept one clear face', async () => {
            const buffer = readTestImage(singleFacePath);
            const result = await detectFace(buffer);

            assert.equal(result.accepted, true);
            assert.equal(result.faceCount, 1);

            console.log(JSON.stringify(result, null, 2));
        });
    } else {
        console.log('[SKIP] Single-face image not provided');
    }

    if (multipleFacesPath) {
        await test('Reject multiple faces', async () => {
            const buffer = readTestImage(multipleFacesPath);

            await assert.rejects(
                () => detectFace(buffer),
                { code: 'MULTIPLE_FACES' }
            );
        });
    } else {
        console.log('[SKIP] Multiple-face image not provided');
    }

    if (singleFacePath) {
        await test('Reject blank image after valid face', async () => {
            await assert.rejects(
                () => detectFace(blank),
                { code: 'NO_FACE' }
            );
        });
    }

    console.log('\n=== Test Summary ===');
    console.log('Passed:', passed);
    console.log('Failed:', failed);

    if (!singleFacePath || !multipleFacesPath) {
        console.log(
            'Manual facial sample tests remain pending.'
        );
    }

    if (failed > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(
        'Test execution failed:',
        error.message
    );

    process.exitCode = 1;
});
