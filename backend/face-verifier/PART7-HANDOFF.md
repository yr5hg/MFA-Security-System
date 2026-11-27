# Private face verifier — lab interface v1

Use Node 22, pinned dependencies already in package-lock.json, and existing Part 1–6 files. No HTTP server or new npm dependencies. The gate must create exactly one verifier instance per gate process and use it only server-side. One inference per instance; other calls fail busy. One-shot child processes start cold for each enrollment or verification; timer covers startup, inference, comparison and worker cleanup (up to 10,000 ms). On timeout the parent denies and sends SIGKILL; it remains busy until the child closes. A stalled parent/event loop or OS scheduling can delay timeout delivery; do not claim real-time guarantees. Children are not an OS privilege boundary.

```js
// ESM gate (backend/gate/src/*.js)
import faceVerifier from '../../face-verifier/index.js';
const verifier = faceVerifier.createFaceVerifier({
  threshold: config.faceSimilarityThreshold,
  timeoutMs: config.inferenceTimeoutMs,
  modelDir: config.humanModelDir
});
// After gate validates owner, consent, fresh password+TOTP and approval:
const enrollment = await verifier.enroll(jpegBuffer);
// enrollment.ok === true: privately store enrollment.reference under trusted iss/sub
// with gate-managed active reference version; do not expose the descriptor to browser.
// After gate validates pending face attempt and selects active reference:
const outcome = await verifier.verify(jpegBuffer, storedReference);
const match = outcome.ok === true && outcome.matched === true &&
  outcome.code === 'MATCH' && outcome.policyVersion === faceVerifier.POLICY.version;
// Gate must independently recheck attempt/session/identity/action/role/reference version
// and other required authentication evidence before accepting a match.
```

`storedReference` is the `{policyVersion, descriptor}` object returned by enrollment. Account identity, version counter, consent, storage, encryption/permissions, challenge, retries, and authorization belong to the gate, not this verifier. Never accept a client-supplied reference or threshold. Gate must deny missing/malformed responses, throws, worker failures, mismatches and stale attempts; expose only safe UI error messages, not scores or descriptors. Model files must be trusted, local, protected against modification; the wrapper checks their reported checksums and library/config versions before extracting any face. Set `HUMAN_MODEL_DIR=/opt/mfa-lab/models` for final Kali deployment after copying the six pinned model files there; default uses local npm models for development. Do not use paths supplied by a browser.

Threshold is disabled by default (`null`); only the explicitly configured numeric `0.66` is accepted in this frozen policy. For controlled academic demonstration only, configure `FACE_SIMILARITY_THRESHOLD=0.66` after team approval. Score >= 0.66 matches, lower fails; invalid scores never match. Calibration: 6 genuine, 12 impostor, zero observed errors. Held-out: 3 genuine, 6 impostor, one false rejection, no observed false acceptance. Small correlated dataset; not production validation, no liveness protection, no probability interpretation. Any threshold/model/quality/preprocessing change requires a new policy and calibration; reference policy version must match. The enrollment function is a local extraction interface, not enrollment authorization.

Run `node scripts/test-verification.js` for unit tests; pass four private JPEG paths (single, genuine, impostor, multiple) to additionally test actual inference. No raw photos or descriptors in Git, console output or browser response. Array clearing is best effort, not guaranteed erasure.
