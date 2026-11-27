'use strict';

// Local offline experiment. Never enables production authentication.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const FILES = ['reference.jpg', 'cal1.jpg', 'cal2.jpg', 'test1.jpg'];

function evaluate(genuine, impostor, threshold) {
    if (!genuine.length || !impostor.length) throw new Error('Missing comparison class');
    const falseAccepts = impostor.filter(score => score >= threshold).length;
    const falseRejects = genuine.filter(score => score < threshold).length;
    return {
        genuineAttempts: genuine.length,
        impostorAttempts: impostor.length,
        falseAccepts,
        falseRejects,
        FAR: falseAccepts / impostor.length,
        FRR: falseRejects / genuine.length
    };
}

function selectThreshold(genuine, impostor) {
    // Human similarity scores are rounded to two decimal places.
    const candidates = Array.from({ length: 101 }, (_, i) => i / 100)
        .map(threshold => ({ threshold, ...evaluate(genuine, impostor, threshold) }))
        .filter(row => row.falseAccepts === 0 && row.falseRejects < row.genuineAttempts);
    if (!candidates.length) return null;
    const minimumRejects = Math.min(...candidates.map(row => row.falseRejects));
    const best = candidates.filter(row => row.falseRejects === minimumRejects);
    // Choose the midpoint of the equally optimal interval on the 0.01 grid.
    // This avoids placing the candidate unnecessarily close to either boundary.
    const selected = best[Math.floor((best.length - 1) / 2)];
    return { ...selected, equallyOptimalRange: [best[0].threshold, best.at(-1).threshold] };
}

function selfTest() {
    const chosen = selectThreshold([0.84, 0.90], [0.44, 0.50]);
    assert.ok(chosen.threshold > 0.50 && chosen.threshold <= 0.84);
    assert.equal(chosen.falseAccepts, 0);
    assert.equal(chosen.falseRejects, 0);
    assert.equal(evaluate([0.70], [0.70], 0.70).falseAccepts, 1);
    assert.equal(evaluate([0.70], [0.70], 0.70).falseRejects, 0);
    assert.equal(selectThreshold([0.90], [1]), null);
    assert.equal(selectThreshold([0.40], [0.50]), null);
    assert.throws(() => evaluate([], [0.5], 0.7));
    const overlap = selectThreshold([0.40, 0.90], [0.50]);
    assert.equal(overlap.falseRejects, 1);
    assert.equal(overlap.falseAccepts, 0);
    console.log('Calibration logic self-test: PASS');
}

function inspectDataset(root, maxBytes) {
    const people = fs.readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && /^P\d{2}$/.test(entry.name))
        .map(entry => entry.name).sort();
    if (people.length < 3) throw new Error('At least three participant folders (P01, P02, P03) are required');
    const seen = new Set();
    const samples = [];
    for (const person of people) {
        for (const name of FILES) {
            const filename = path.join(root, person, name);
            const stat = fs.statSync(filename);
            if (!stat.isFile() || stat.size === 0 || stat.size > maxBytes) {
                throw new Error(`Invalid file size/type: ${person}/${name}`);
            }
            const bytes = fs.readFileSync(filename);
            const hash = crypto.createHash('sha256').update(bytes).digest('hex');
            if (seen.has(hash)) throw new Error(`Duplicate file bytes: ${person}/${name}; capture a distinct photo`);
            seen.add(hash);
            samples.push({ person, name, filename });
        }
    }
    return { people, samples };
}

async function main() {
    if (process.argv[2] === '--self-test') return selfTest();
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/calibrate-threshold.js <private-dataset-directory>');
    const root = path.resolve(process.argv[2]);
    const { IMAGE_LIMITS } = require('../src/image-validator');
    const { initializeModel, getRuntimeInfo } = require('../src/human-runtime');
    const { extractDescriptor } = require('../src/face-detector');
    const { compareDescriptors, MATCH_OPTIONS } = require('../src/face-comparison');
    const { people, samples } = inspectDataset(root, IMAGE_LIMITS.maxBytes);
    const descriptors = new Map();
    const key = (person, name) => `${person}/${name}`;
    const failures = [];
    try {
        await initializeModel();
        console.log('=== Local Threshold Calibration ===');
        console.log('Participants:', people.length);
        console.log('Runtime:', JSON.stringify(getRuntimeInfo(), null, 2));
        console.log('Similarity settings:', JSON.stringify(MATCH_OPTIONS));

        for (const sample of samples) {
            const label = key(sample.person, sample.name);
            try {
                const result = await extractDescriptor(fs.readFileSync(sample.filename));
                descriptors.set(label, result.descriptor);
                console.log(`[PASS] ${label}`);
            } catch (error) {
                failures.push({ sample: label, error: error.code || 'EXTRACTION_ERROR' });
                console.log(`[FAIL] ${label}: ${error.code || 'EXTRACTION_ERROR'}`);
            }
        }
        if (failures.length) {
            console.log('Extraction failures:', JSON.stringify(failures));
            throw new Error('Dataset has extraction failures. Report these; no threshold selected from an incomplete dataset.');
        }

        async function compareSplit(probeNames) {
            const genuine = [], impostor = [];
            for (const owner of people) {
                const reference = descriptors.get(key(owner, 'reference.jpg'));
                for (const probeOwner of people) {
                    for (const name of probeNames) {
                        const probe = descriptors.get(key(probeOwner, name));
                        const { similarity } = await compareDescriptors(reference, probe);
                        (owner === probeOwner ? genuine : impostor).push(similarity);
                    }
                }
            }
            return { genuine: genuine.sort((a,b) => a-b), impostor: impostor.sort((a,b) => a-b) };
        }
        const calibration = await compareSplit(['cal1.jpg', 'cal2.jpg']);
        const candidate = selectThreshold(calibration.genuine, calibration.impostor);
        console.log('\n=== Calibration scores ===');
        console.log(JSON.stringify(calibration, null, 2));
        console.log('\n=== Candidate threshold (not approved) ===');
        console.log(JSON.stringify(candidate, null, 2));
        if (candidate === null) {
            console.log('No usable zero-observed-FAR candidate. Do not enable authentication.');
            process.exitCode = 2;
            return;
        }
        // Lock the candidate before calculating held-out comparisons.
        const heldOut = await compareSplit(['test1.jpg']);
        console.log('\n=== Held-out scores ===');
        console.log(JSON.stringify(heldOut, null, 2));
        console.log('\n=== Held-out results at fixed candidate ===');
        console.log(JSON.stringify(evaluate(heldOut.genuine, heldOut.impostor, candidate.threshold), null, 2));
        console.log('Small, correlated sample; not a production accuracy or security claim.');
        console.log('Authentication remains disabled by this script.');
    } finally {
        for (const descriptor of descriptors.values()) descriptor.fill(0);
        descriptors.clear();
    }
}
main().catch(error => {
    console.error('Calibration failed:', error.message);
    process.exitCode = 1;
});
