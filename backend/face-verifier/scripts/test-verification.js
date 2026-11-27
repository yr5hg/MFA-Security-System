'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFaceVerifier, POLICY } = require('..');
const { createRunner } = require('../src/worker-runner');
const { validDescriptor, validScore, meetsThreshold } = require('../src/verification-policy');
let passed = 0;
async function test(name, fn) { await fn(); passed++; console.log('[PASS] ' + name); }
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
async function main() {
    const verifier = createFaceVerifier({threshold: 0.66});
    const ref = {policyVersion: POLICY.version, descriptor: Array(1024).fill(1)};
    const dummy = Buffer.from([0xff,0xd8,0xff,0xd9]);
    await test('Missing threshold denies verification', async () => assert.equal((await createFaceVerifier().verify(dummy,ref)).code,'THRESHOLD_NOT_CONFIGURED'));
    await test('Uncalibrated threshold and excessive timeout rejected', () => {assert.throws(()=>createFaceVerifier({threshold:0.65})); assert.throws(()=>createFaceVerifier({timeoutMs:10001}));});
    await test('Missing reference denied', async () => assert.equal((await verifier.verify(dummy,null)).code,'MISSING_REFERENCE'));
    await test('Incompatible reference denied', async () => assert.equal((await verifier.verify(dummy,{...ref,policyVersion:'old'})).code,'INVALID_REFERENCE'));
    await test('Malformed descriptor denied', async () => assert.equal((await verifier.verify(dummy,{...ref,descriptor:[1]})).code,'INVALID_REFERENCE'));
    await test('Descriptor and score validation', () => { assert.equal(validDescriptor(Array(1024).fill(0)),false); assert.equal(validDescriptor(Array(1024).fill(NaN)),false); assert.equal(validScore(NaN),false); assert.equal(validScore(1.1),false); assert.equal(validScore(0.66),true); });
    await test('Threshold equality accepted; lower and invalid scores denied', () => {assert.equal(meetsThreshold(0.66,0.66),true);assert.equal(meetsThreshold(0.65,0.66),false);assert.equal(meetsThreshold(NaN,0.66),false);assert.equal(meetsThreshold(1,null),false);});
    await test('Non-buffer image denied', async () => assert.equal((await verifier.enroll('bad')).code,'INVALID_INPUT'));
    await test('Empty image denied', async () => assert.equal((await verifier.enroll(Buffer.alloc(0))).code,'EMPTY_IMAGE'));
    await test('Oversized image denied', async () => assert.equal((await verifier.enroll(Buffer.alloc(POLICY.maxBytes+1))).code,'IMAGE_TOO_LARGE'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'mfa-worker-test-'));
    try {
        const fixture = path.join(tmp,'worker.cjs');
        fs.writeFileSync(fixture,`process.once('message',msg=>{if(msg==='hang'){while(true){}}else if(msg==='crash'){process.exit(2)}else{process.send({ok:true})}})`);
        const run = createRunner(fixture);
        await test('Worker success returned',async()=>assert.equal((await run('ok',3000)).ok,true));
        await test('Worker crash denied',async()=>assert.equal((await run('crash',3000)).code,'WORKER_ERROR'));
        await test('Overlapping request denied and stalled worker terminated',async()=>{const pending=run('hang',500); assert.equal((await run('ok',3000)).code,'VERIFIER_BUSY'); assert.equal((await pending).code,'INFERENCE_TIMEOUT');});
        await test('Worker usable after timeout cleanup',async()=>{let result; for(let i=0;i<40;i++){result=await run('ok',3000); if(result.code!=='VERIFIER_BUSY') break; await pause(50);} assert.equal(result.ok,true);});
        if (process.argv.length > 2) {
            const [referencePath,genuinePath,impostorPath,multiplePath] = process.argv.slice(2);
            if(!referencePath||!genuinePath||!impostorPath||!multiplePath) throw new Error('Supply reference, genuine, impostor, multiple JPEG paths');
            const read = f => {if(fs.statSync(f).size>POLICY.maxBytes)throw new Error('Test photo too large');return fs.readFileSync(f);};
            const image = read(referencePath), genuine=read(genuinePath), impostor=read(impostorPath), multiple=read(multiplePath);
            let enrolled;
            await test('Enroll trusted reference',async()=>{enrolled=await verifier.enroll(image);assert.equal(enrolled.ok,true, enrolled.code); assert.equal(enrolled.reference.descriptor.length,1024);});
            try {
                await test('Genuine face matches',async()=>{const r=await verifier.verify(genuine,enrolled.reference);assert.equal(r.matched,true,r.code); console.log('Genuine:',JSON.stringify(r));});
                await test('Impostor denied',async()=>{const r=await verifier.verify(impostor,enrolled.reference);assert.equal(r.matched,false);assert.equal(r.code,'FACE_MISMATCH'); console.log('Impostor:',JSON.stringify(r));});
                await test('Multiple faces denied',async()=>assert.equal((await verifier.verify(multiple,enrolled.reference)).code,'MULTIPLE_FACES'));
                await test('Malformed JPEG denied',async()=>assert.equal((await verifier.verify(dummy,enrolled.reference)).code,'INVALID_JPEG'));
                await test('Missing model fails closed',async()=>{const bad=createFaceVerifier({threshold:0.66,modelDir:path.join(tmp,'missing-models')});assert.equal((await bad.verify(genuine,enrolled.reference)).code,'MODEL_UNAVAILABLE');});
                await test('Actual inference deadline denies',async()=>{const short=createFaceVerifier({threshold:0.66,timeoutMs:1});assert.equal((await short.verify(genuine,enrolled.reference)).code,'INFERENCE_TIMEOUT');});
            } finally {enrolled?.reference?.descriptor?.fill(0);}
        } else console.log('Real Human inference tests skipped: supply four JPEG paths.');
    } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
    console.log('Passed:',passed,'Failed: 0');
}
main().catch(error=>{console.error('Test failed:',error.message);process.exitCode=1;});
