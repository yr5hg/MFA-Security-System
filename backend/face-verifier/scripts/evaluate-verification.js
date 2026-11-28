'use strict';
// Offline lab evaluation of the public verifier, not the authorization gate.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');

function stats(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a,b) => a-b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
    return { count: sorted.length, minMs: sorted[0], medianMs: median, maxMs: sorted.at(-1) };
}
function classify(result, policy) {
    if (result?.policyVersion !== policy.version) return 'invalid';
    if (result.ok === true && result.matched === true && result.code === 'MATCH' &&
        result.threshold === policy.threshold && Number.isFinite(result.similarity) &&
        result.similarity >= policy.threshold && result.similarity <= 1) return 'match';
    if (result.ok === false && result.matched === false && result.code === 'FACE_MISMATCH' &&
        result.threshold === policy.threshold && Number.isFinite(result.similarity) &&
        result.similarity >= 0 && result.similarity < policy.threshold) return 'mismatch';
    if (result.ok === false && result.matched === false && typeof result.code === 'string' &&
        !['MATCH','FACE_MISMATCH'].includes(result.code)) return 'error';
    return 'invalid';
}
function metrics(rows) {
    const genuine = rows.filter(r=>r.genuine), impostor = rows.filter(r=>!r.genuine);
    const falseRejects = genuine.filter(r=>r.decision!=='match').length;
    const falseAccepts = impostor.filter(r=>r.decision==='match').length;
    const comparisonErrors = rows.filter(r=>['error','invalid'].includes(r.decision)).length;
    return { genuineAttempts:genuine.length, impostorAttempts:impostor.length,
        falseAccepts, falseRejects, comparisonErrors,
        genuineErrors:genuine.filter(r=>['error','invalid'].includes(r.decision)).length,
        impostorErrors:impostor.filter(r=>['error','invalid'].includes(r.decision)).length,
        FAR:impostor.length?falseAccepts/impostor.length:null,
        FRR:genuine.length?falseRejects/genuine.length:null };
}
function selfTest() {
    assert.deepEqual(stats([4,2,1,3]),{count:4,minMs:1,medianMs:2.5,maxMs:4});
    assert.equal(stats([]),null);
    const policy={version:'test',threshold:0.66};
    const base={policyVersion:'test',threshold:0.66};
    assert.equal(classify({...base,ok:true,matched:true,code:'MATCH',similarity:0.66},policy),'match');
    assert.equal(classify({...base,ok:true,matched:true,code:'MATCH',similarity:0.65},policy),'invalid');
    assert.equal(classify({...base,ok:false,matched:false,code:'FACE_MISMATCH',similarity:0.64},policy),'mismatch');
    assert.equal(classify({...base,ok:false,matched:false,code:'INFERENCE_TIMEOUT'},policy),'error');
    assert.equal(classify(null,policy),'invalid');
    const m=metrics([{genuine:true,decision:'match'},{genuine:true,decision:'error'},
        {genuine:false,decision:'match'},{genuine:false,decision:'mismatch'}]);
    assert.equal(m.FAR,0.5); assert.equal(m.FRR,0.5); assert.equal(m.comparisonErrors,1);
    assert.equal(metrics([]).FAR,null);
    console.log('Evaluation logic self-test: PASS');
}
function readDataset(root, maxBytes) {
    const people=fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isDirectory() && /^P\d{2}$/.test(e.name)).map(e=>e.name).sort();
    if(people.length<3) throw new Error('At least three P01-style participant directories required');
    const hashes=new Set();
    return people.map(person=>{
        const read=name=>{
            const filename=path.join(root,person,name);
            const stat=fs.statSync(filename);
            if(!stat.isFile()||stat.size<1||stat.size>maxBytes) throw new Error('Invalid evaluation photo size/type');
            const data=fs.readFileSync(filename);
            const hash=crypto.createHash('sha256').update(data).digest('hex');
            if(hashes.has(hash)) throw new Error('Duplicate image bytes in evaluation dataset');
            hashes.add(hash); return data;
        };
        return {referenceImage:read('reference.jpg'),probe:read('test1.jpg'),reference:null};
    });
}
async function main() {
    if(process.argv[2]==='--self-test') return selfTest();
    if(process.argv.length<3||process.argv.length>4) throw new Error('Usage: node scripts/evaluate-verification.js <private-dataset-directory> [rounds=3]');
    const rounds=process.argv[3]===undefined?3:Number(process.argv[3]);
    if(!Number.isInteger(rounds)||rounds<1||rounds>10) throw new Error('Rounds must be an integer from 1 to 10');
    const {createFaceVerifier,POLICY}=require('..');
    const verifier=createFaceVerifier({threshold:POLICY.threshold,timeoutMs:POLICY.maxTimeoutMs});
    const people=readDataset(path.resolve(process.argv[2]),POLICY.maxBytes);
    const enrollmentTimes=[], enrollmentInference=[], rows=[], allTimes=[], inferenceTimes=[];
    const codes=Object.create(null);
    let repeatedDifferences=0, invalidResults=0;
    const baseline=new Map();
    try {
        console.log('=== Frozen policy verification evaluation ===');
        console.log(JSON.stringify({policyVersion:POLICY.version,threshold:POLICY.threshold,timeoutMs:POLICY.maxTimeoutMs,
            human:POLICY.humanVersion,tensorflow:POLICY.tensorflowVersion,backend:POLICY.backend,
            node:process.version,platform:process.platform,architecture:process.arch,
            cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryMiB:Math.round(os.totalmem()/1048576),
            participants:people.length,rounds,condition:'fresh child process per request; OS caches may be warm'},null,2));
        for(const person of people) {
            const start=performance.now();
            const r=await verifier.enroll(person.referenceImage);
            enrollmentTimes.push(Math.round(performance.now()-start));
            if(r?.ok!==true || !r.reference || r.policyVersion!==POLICY.version) throw new Error(`Enrollment failed: ${r?.code||'INVALID_RESULT'}`);
            person.reference=r.reference;
            if(Number.isFinite(r.inferenceMs)&&r.inferenceMs>=0) enrollmentInference.push(r.inferenceMs);
        }
        for(let round=0;round<rounds;round++) {
            for(let owner=0;owner<people.length;owner++) {
                for(let probe=0;probe<people.length;probe++) {
                    const start=performance.now();
                    let r;
                    try {r=await verifier.verify(people[probe].probe,people[owner].reference);} catch {r=null;}
                    const elapsed=Math.round(performance.now()-start);
                    const decision=classify(r,POLICY);
                    const key=`${owner}:${probe}`;
                    const observation={genuine:owner===probe,decision};
                    if(round===0){rows.push(observation);baseline.set(key,decision);}
                    else if(baseline.get(key)!==decision) repeatedDifferences++;
                    if(decision==='invalid') invalidResults++;
                    const code=decision==='invalid'?'INVALID_RESULT':r.code;
                    codes[code]=(codes[code]||0)+1;
                    allTimes.push(elapsed);
                    if(Number.isFinite(r?.inferenceMs)&&r.inferenceMs>=0) inferenceTimes.push(r.inferenceMs);
                }
            }
            console.log(`Completed round ${round+1}/${rounds}`);
        }
        console.log('\n=== Unique held-out pairs (first round only) ===');
        console.log(JSON.stringify(metrics(rows),null,2));
        console.log('\n=== Repeated request performance (not extra independent biometric trials) ===');
        console.log(JSON.stringify({enrollmentWall:stats(enrollmentTimes),enrollmentInference:stats(enrollmentInference),
            verificationWall:stats(allTimes),verificationInference:stats(inferenceTimes),outcomes:codes,
            repeatedDecisionDifferences:repeatedDifferences,invalidResults},null,2));
        // Demonstrate the lack of liveness without attempting to access protected operations.
        const replay=await verifier.verify(people[0].referenceImage,people[0].reference);
        const replayDecision=classify(replay,POLICY);
        console.log('\n=== Exact reference-image reuse (local verifier only) ===');
        console.log(JSON.stringify({decision:replayDecision,code:replayDecision==='invalid'?'INVALID_RESULT':replay.code},null,2));
        console.log('Not a physical presentation test. No browser, session or gate replay test performed.');
        console.log('Same held-out photos as calibration study if the existing dataset is used. No threshold retuning.');
        console.log('Small correlated sample; report actual errors and do not claim production accuracy.');
        if(invalidResults||repeatedDifferences||metrics(rows).comparisonErrors||Object.keys(codes).some(code=>!['MATCH','FACE_MISMATCH'].includes(code))||['invalid','error'].includes(replayDecision)) process.exitCode=1;
    } finally {
        for(const person of people) { person.reference?.descriptor?.fill(0); person.referenceImage.fill(0); person.probe.fill(0); }
    }
}
main().catch(error=>{console.error('Evaluation failed:',error.code||error.message);process.exitCode=1;});
