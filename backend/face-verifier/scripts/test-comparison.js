const fs = require('node:fs');
const assert = require('node:assert/strict');
const { initializeModel, getRuntimeInfo } = require('../src/human-runtime');
const { DESCRIPTOR_LENGTH, extractDescriptor, validateDescriptor } = require('../src/face-detector');
const { compareDescriptors, compareImages } = require('../src/face-comparison');
const { IMAGE_LIMITS } = require('../src/image-validator');

let passed = 0;
let failed = 0;
async function test(name, callback) {
    try {
        await callback();
        console.log(`[PASS] ${name}`);
        passed++;
    } catch (error) {
        console.error(`[FAIL] ${name}:`, error.code || error.message);
        if (error.cause) console.error('Cause:', error.cause.message);
        failed++;
    }
}
function readImage(filePath) {
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size > IMAGE_LIMITS.maxBytes) {
        throw new Error('Invalid test image file');
    }
    return fs.readFileSync(filePath);
}
async function main() {
    const [referencePath, genuinePath, impostorPath] = process.argv.slice(2);
    if (!referencePath || !genuinePath || !impostorPath) {
        console.error('Usage: npm run test:comparison -- <reference.jpg> <genuine.jpg> <impostor.jpg>');
        process.exitCode = 1;
        return;
    }
    const referenceImage = readImage(referencePath);
    const genuineImage = readImage(genuinePath);
    const impostorImage = readImage(impostorPath);
    console.log('=== Face Comparison Tests ===');
    await initializeModel();
    console.log('\n=== Runtime Information ===');
    console.log(JSON.stringify(getRuntimeInfo(), null, 2));

    let reference = null, genuine = null, impostor = null;
    let sameImageScore = null, genuineScore = null, impostorScore = null;
    try {
        console.log('\n=== Descriptor Extraction ===');
        await test('Extract reference descriptor', async () => {
            reference = await extractDescriptor(referenceImage);
            assert.equal(reference.descriptorLength, DESCRIPTOR_LENGTH);
            validateDescriptor(reference.descriptor);
            console.log('Descriptor length:', reference.descriptorLength);
            console.log('Inference:', reference.inferenceMs, 'ms');
        });
        await test('Extract genuine descriptor', async () => {
            genuine = await extractDescriptor(genuineImage);
            validateDescriptor(genuine.descriptor);
        });
        await test('Extract impostor descriptor', async () => {
            impostor = await extractDescriptor(impostorImage);
            validateDescriptor(impostor.descriptor);
        });
        console.log('\n=== Descriptor Validation ===');
        await test('Reject empty descriptor', () => {
            assert.throws(() => validateDescriptor([]), { code: 'INVALID_DESCRIPTOR' });
        });
        await test('Reject incorrect descriptor length', () => {
            assert.throws(() => validateDescriptor([1, 2, 3]), { code: 'INVALID_DESCRIPTOR' });
        });
        await test('Reject non-finite descriptor values', () => {
            const descriptor = Array(DESCRIPTOR_LENGTH).fill(1);
            descriptor[0] = NaN;
            assert.throws(() => validateDescriptor(descriptor), { code: 'INVALID_DESCRIPTOR' });
        });
        await test('Reject zero-valued descriptor', () => {
            const descriptor = Array(DESCRIPTOR_LENGTH).fill(0);
            assert.throws(() => validateDescriptor(descriptor), { code: 'INVALID_DESCRIPTOR' });
        });
        console.log('\n=== Similarity Comparison ===');
        await test('Identical descriptor similarity equals 1', async () => {
            assert.ok(reference);
            const result = await compareDescriptors(reference.descriptor, reference.descriptor);
            sameImageScore = result.similarity;
            assert.equal(sameImageScore, 1);
        });
        await test('Calculate genuine similarity', async () => {
            assert.ok(reference && genuine);
            const result = await compareDescriptors(reference.descriptor, genuine.descriptor);
            genuineScore = result.similarity;
            assert.ok(genuineScore >= 0 && genuineScore <= 1);
        });
        await test('Calculate impostor similarity', async () => {
            assert.ok(reference && impostor);
            const result = await compareDescriptors(reference.descriptor, impostor.descriptor);
            impostorScore = result.similarity;
            assert.ok(impostorScore >= 0 && impostorScore <= 1);
        });
        await test('Similarity is symmetric', async () => {
            assert.ok(reference && genuine);
            assert.notEqual(genuineScore, null);
            const reversed = await compareDescriptors(genuine.descriptor, reference.descriptor);
            assert.ok(Math.abs(reversed.similarity - genuineScore) < 0.000001);
        });
        await test('Reject invalid comparison input', async () => {
            assert.ok(reference);
            await assert.rejects(() => compareDescriptors(reference.descriptor, []), { code: 'INVALID_DESCRIPTOR' });
        });
        await test('Complete image comparison pipeline', async () => {
            const result = await compareImages(referenceImage, genuineImage);
            assert.ok(result.similarity >= 0 && result.similarity <= 1);
            assert.equal(result.matched, null);
            assert.equal(result.authenticationReady, false);
            console.log(JSON.stringify(result, null, 2));
        });
        console.log('\n=== Experimental Scores ===');
        console.log('Identical descriptor:', sameImageScore);
        console.log('Genuine pair:', genuineScore);
        console.log('Impostor pair:', impostorScore);
        if (genuineScore !== null && impostorScore !== null) {
            if (genuineScore > impostorScore) console.log('[OBSERVATION] Genuine score is higher');
            else console.warn('[WARNING] Genuine score is not higher');
        }
        console.log('\nNo authentication threshold has been applied.');
        console.log('\n=== Test Summary ===');
        console.log('Passed:', passed);
        console.log('Failed:', failed);
        if (failed > 0) process.exitCode = 1;
    } finally {
        reference?.descriptor?.fill(0);
        genuine?.descriptor?.fill(0);
        impostor?.descriptor?.fill(0);
    }
}
main().catch(error => {
    console.error('Test execution failed:', error.message);
    process.exitCode = 1;
});
