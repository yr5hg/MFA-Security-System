# Detailed Team Responsibilities — Kali Three-Factor Authentication

**Draft v0.3 | 25 November 2026 | Phase 2 deadline: 30 November 2026**

## 1. Team distribution

| Member | Ownership | Difficulty (relative) | Folder / branch |
|---|---|---|---|
| Omar Aljaouni | Keycloak, passwords, TOTP, Google Authenticator, accounts/roles | Medium | `keycloak/` / `feature/kali-keycloak-totp` |
| Sara Alqadi | Microphone, audio preprocessing, terminal prompts, voice enrollment interaction | Medium | `voice-recording/` / `feature/kali-voice-recording` |
| Yousef Taha | SpeechBrain voice model, speaker verification, threshold calibration | Medium–high | `voice-service/` / `feature/kali-speechbrain-voice` |
| Anas Musa | Integration lead, access gate, session binding, protected resource, recovery and RBAC | Highest | `access-control/` / `feature/kali-mfa-gate` |
| Hamzeh Abu Jumaa | Kali security testing, experiments, simulation results | Medium–high | `tests/` / `feature/kali-security-evaluation` |

Assignment assumption: the person requesting the harder integration task is Anas (the remaining integration owner in the original roster). Confirm with the team. Yousef remains responsible for the voice engine as explicitly requested. Every member contributes implementation/configuration, testing, and reporting. Python is permitted only for the SpeechBrain library and minimal local voice-comparison adapter owned by Yousef. All computer-side components run on Kali; Google Authenticator is on a phone. All other members use existing tools, configuration and Bash; no Python backend, HTTP voice API or Python tests. External tools, this exception and shell integration require instructor approval.

## 2. Shared decisions

- Use the revised requirements and `contracts/api.md` as the source of truth, not the previous Python web stack.
- Develop on separate branches from the approved migration; keep old branches and history recoverable, do not merge their obsolete code into the redesign.
- Use a Kali VM or installed Kali with a working microphone and isolated lab network. Do not expose Keycloak or privileged interfaces publicly. Repository is currently public: use only sanitized documentation, never credentials or participant biometrics.
- Use a supervised terminal demo with browser only for Keycloak. No custom web interface or HTTP service is needed. A trusted gate, not a user-controlled shell script, owns authorization.
- Maintain `voice-demo`, `voice-terminal`, `regular_user`, `administrator`; agree on changes before coding.
- A model match is experimental, not liveness, and cannot be accepted from an untrusted caller. No mocked factors in final evaluation.

## 3. Omar — Keycloak and Google Authenticator

**Goal:** make a reliable dedicated Keycloak authentication flow with two mandatory factors and trusted claims for the gate.

### Tasks in order

1. On Kali, install/run a pinned Keycloak release with an approved Java runtime or container. Document exact version, setup and lab TLS/trust configuration.
2. Create `voice-demo` realm, dedicated `voice-terminal` confidential client and client roles `regular_user` and `administrator`. Create consenting demo accounts with roles; keep console-admin permissions separate.
3. Enable the OAuth device authorization grant for the dedicated client and confirm supported endpoints via discovery. Disable unneeded grants, service accounts, direct access grants, and other authentication alternatives.
4. Configure a dedicated browser authentication flow with required username/password and OTP form. Avoid optional/conditional OTP and SSO cookie shortcuts. Check device authorization actually uses the enforced flow; use an isolated realm if necessary. Verify that users with no OTP cannot obtain a usable token until enrolled and verified.
5. Configure password policy and brute-force protection. Configure TOTP policy (proposed 6 digits, 30-second period; document actual algorithm/window and replay settings). Ensure server/phone clocks are synchronized.
6. Enroll Google Authenticator via Keycloak QR flow on a separate phone. Demonstrate login with correct and wrong codes, expired code, repeated code and missing OTP; sanitize all evidence.
7. Configure expected audience and trusted role/subject claims in token introspection, ensuring the gate can validate issuer, intended client, audience, subject, expiry and role. Share claim schema and discovery endpoint with Anas, never secrets in Git.
8. Confirm password reset and supervised TOTP reset revoke affected sessions and preserve roles and voice requirement; document the operator procedure.

**Start now:** run Keycloak, make two demo accounts, and verify password + TOTP in browser. No need to wait for voice model.

**Files/deliverables:** `keycloak/README.md`, safe config/realm export only after secret and identity review, sanitized flow and OTP screenshots, claim mapping and negative-test results, contribution to Preliminary Knowledge and Proposed Model.

**Done when:** both factors are enforced for the exact client flow (including existing SSO state), invalid tokens/roles are rejected in integration, and another member can reproduce setup without receiving credentials in Git.

## 4. Sara — Voice recording and enrollment

**Goal:** produce consistent microphone samples using existing Kali commands and a simple user-facing terminal workflow.

### Tasks in order

1. Verify microphone passthrough in Kali and inspect input devices using `arecord -l` and `arecord -L`; resolve device/permission problems with Anas.
2. Record a 5-second consented sample with `arecord`; use FFmpeg if native device format differs; check with ffprobe. Standard is 16-kHz, mono, signed 16-bit PCM WAV.
3. Document or implement Bash-based capture/normalization with bounded time, size, temporary files and error handling. Do not accept user-chosen paths or arbitrary uploads in the final login flow.
4. Make clear terminal prompts for starting login, recording, errors, enrollment and denial. Use the gate's trusted status; prompts cannot change identity or security state.
5. Design enrollment interaction: after password+TOTP and one-time administrator approval, capture reference and hand it to gate for validation and protected storage. Coordinate supervised consent and deletion. Gate owns the account association and permissions.
6. Prepare non-secret format metadata and repeatable genuine/impostor/noise/replay test recording procedure with Yousef and Hamzeh.
7. Test unavailable microphone, empty/silent recording, malformed audio, too-short/large clip, successful capture and unapproved enrollment.

**Start now:** get three consented clips and confirm format, locally only. Never commit them.

**Files/deliverables:** `voice-recording/README.md`, capture/normalization shell functions or script (if approved), prompt flow, format evidence, enrollment UX walkthrough and report section.

**Done when:** reliable normalized audio is handed to gate/SpeechBrain engine without unsafe input paths; failure never sets a voice-pass state. Anas owns privileged storage and approval enforcement, not Sara.

## 5. Yousef — SpeechBrain voice model and speaker verification

**Goal:** reuse the previously tested SpeechBrain ECAPA-TDNN implementation. Python is allowed only for model inference and its minimal local command-line wrapper.

### Tasks in order

1. Confirm the voice-only Python exception. Set up a dedicated virtual environment on Kali; install compatible SpeechBrain, PyTorch, audio dependencies and pin the versions after testing. See `voice-service/README.md`.
2. Reuse `speechbrain/spkrec-ecapa-voxceleb` and review the existing local `compare_local.py` from the old voice branch. Keep only the code needed for model loading, comparing normalized WAVs and emitting the result. Do not restore FastAPI or an HTTP endpoint.
3. Pin the model revision and record weight checksums, Python/package versions, CPU device and model license. Keep weights and consented clips out of Git.
4. Align the local CLI with `contracts/api.md`: trusted reference and attempt paths, explicit threshold, JSON stdout, diagnostics stderr. Return a finite cosine similarity score and a consistent boolean verdict; handle errors with nonzero exit status. No login, session or role logic in Python.
5. Run genuine and impostor comparisons using separate labeled calibration and held-out samples. Include Arabic, English and mixed-language samples where possible.
6. Calibrate and freeze a similarity threshold before held-out evaluation. The earlier 0.25 value was experimental, not approved; re-evaluate on Kali and report FAR/FRR tradeoffs with Hamzeh.
7. Test wrong speaker, same speaker, invalid audio, unavailable model, timeout and replay. Measure latency; record limitations without promising liveness.
8. Hand off the dedicated interpreter, adapter invocation, pinned model settings, threshold, JSON format and sanitized observed examples to Anas and Hamzeh. Gate invokes the adapter as a restricted subprocess.

**Start now:** inspect the old local comparison script, install the voice environment on Kali and compare two consented WAV files without Keycloak.

**Files/deliverables:** `voice-service/README.md`, `voice-service/compare_local.py` (voice inference only), voice-specific dependency lock, calibration protocol and sanitized score tables. No weights, recordings, embeddings or unrelated Python code in Git.

**Done when:** genuine and impostor comparisons and failure handling work on Kali; threshold is justified, frozen and shared; output is compatible with the Bash gate. No unsupported security or accuracy claim.

## 6. Anas — Three-factor integration and protected component (hardest)

**Goal:** prove that passing Keycloak password and TOTP alone cannot unlock the protected lab resource. Bind a genuine SpeechBrain voice result to the same current subject and attempt; enforce roles and recovery safely.

### Tasks in order

1. Confirm the simplest trust boundary: a separate gate service account owns the protected resource, private state, model and configuration; unprivileged demo account cannot read or modify these or run commands as the service. Agree on a restricted launcher (fixed-command sudo policy reviewed with Hamzeh, or equivalent). Keep OS access distinct from app factors; no arbitrary shell, editor or arbitrary arguments. Avoid root execution of project code.
2. Create the local gate workflow and isolated attempt state. Use fixed, trusted configuration, restrictive file permissions/umask, private temporary directories, cleanup, locks, timeouts, and allowlisted actions. Do not place the actual protected data in the repository or expose it via another server.
3. Implement supported device authorization flow using curl/jq or another approved existing Linux client. Retrieve endpoints from trusted issuer discovery; use client auth/TLS; display the device URI/code, poll at server interval, handle pending/slow-down/denied/expired outcomes. No password capture or direct password grant; no user-supplied token injection.
4. Validate issued token using trusted Keycloak introspection and configured claims (active, expiry, issuer, client/audience, stable subject, authorized client role). Fail closed if needed claims missing or wrong. Verify Omar's dedicated flow really enforces fresh password + TOTP; an active token alone does not prove three factors.
5. After validation, select reference by trusted issuer+subject, check enrollment version, and start trusted recorder. Ensure path cannot be controlled by user; capture and normalize in gate-owned directory. Invoke pinned verifier and trusted threshold; require explicit successful result and validated output. Bound attempt count and time; handle errors without fallback.
6. Immediately before action, revalidate token, role, attempt identity, pass result and current enrollment version. Execute only an allowlisted user or admin operation, not a generic shell. End attempt after operation; clear sensitive temporary data and tokens on completion, failure, expiry or interruption. Avoid reusable pass flags and broad elevated commands.
7. Implement supervised account-specific, short-lived single-use enrollment approval, initial-admin offline bootstrap, and audited reference replacement with invalidation. Coordinate password/TOTP reset and session revocation with Omar. Record decisions and use locks/atomic writes to avoid race issues.
8. Configure gate-wide account retry throttling and non-sensitive audit logs. Ensure no exposure through process args, logs, debug traces, environment or terminal. Reject unknown input and never source config writable by the demo user.
9. Integrate Sara/Yousef's components, run all-three path and demonstrate direct access denied, first-two-only denied, invalid role denied and stale result denied. Document actual limitations and stop claiming full integration if the trust boundary cannot be demonstrated.

**Start now:** build OS permission proof and investigate supported device flow using Omar's test realm. Use mock adapters only for isolated development and remove them from final evaluation.

**Files/deliverables:** `access-control/README.md`, approved Bash gate/config, restricted launcher instructions, enrollment/recovery policy, architecture, integration and bypass evidence. Lead integration and Proposed Model writing. Own the hardest work; other members must deliver functioning independent components rather than asking Anas to implement them.

**Done when:** all three factors and trusted role are enforced at the actual resource boundary, no direct path to protected data, no reusable voice flag, and failure/recovery cases are tested. Do not label a script printing “Access granted” as complete authorization.

## 7. Hamzeh — Kali security tests and evaluation

**Goal:** evaluate actual security decisions, not hypothetical outcomes. Use only authorized isolated lab accounts/services.

### Tasks in order

1. Prepare Kali test environment, list scope and authorization, and build the expected/observed matrix in `tests/test_cases.md`.
2. Test password policy, brute-force protection within safe agreed limits, mandatory TOTP enrollment, incorrect/expired/reused/missing OTP and cookie/alternate-grant bypass. Coordinate timing and recovery with Omar.
3. Test access with first two factors only; direct file/launcher bypass; wrong role; forged inputs; cross-account/reference tampering; stale/expired/revoked token; old enrollment; interrupted and concurrent gate attempts. Work with Anas to fix failures.
4. Collect consented genuine/impostor samples and replay recordings with Sara/Yousef. Document actual outcomes, including accepted replays. Keep raw data private. Do not claim liveness or phishing resistance.
5. Use Nmap to inspect lab services, Wireshark for authorized transport inspection, curl/jq for supported client flows and Shell/OS tools for file permissions. Burp Suite may be used for scoped Keycloak browser testing if useful; do not force tools that do not fit the terminal design. No Python test framework.
6. Calculate FAR = false accepts / impostor trials; FRR = false rejects / genuine trials. Separate spoof trials, calibration and held-out trials; include counts, limitations and measured latency. Compare isolated password-only, password+TOTP and all-three baselines with consistent cases.
7. Compile Phase 2 simulation setup, labeled figures/tables, observations and limitations; distinguish mocks from integrated real tests. Collect each member's evidence and reproduce at least one critical component independently.

**Start now:** prepare test matrix and audio consent protocol, then test component setups in parallel.

**Files/deliverables:** `tests/README.md`, `tests/test_cases.md`, Bash/curl test commands as permitted, sanitized results, private evidence kept outside Git, Simulation Results report.

**Done when:** actual outcomes and denominators are recorded, direct bypass checks executed, all critical failures raised with owners, and no unsupported claims or unconsented data.

## 8. Handoffs and integration order

| Producer | Consumer | Agreement |
|---|---|---|
| Omar | Anas, Hamzeh | Trusted issuer/client, enforced factor flow, introspection schema and role names; secrets out-of-band |
| Sara | Yousef, Anas | 16-kHz mono PCM WAV, bounded recording, format/error behavior |
| Yousef | Anas, Hamzeh | Pinned Python interpreter/adapter/model revision and hash, calibrated similarity threshold and exact validated verdict format |
| Anas | Sara, Hamzeh | Gate actions/status, account binding, permissions, enrollment/recovery semantics |
| All | Hamzeh, report | Actual version, observed outcomes, sanitized evidence, limitations |

Start all five independently after shared Kali setup. Omar and Yousef prove the two primary technical dependencies first, Sara proves recording, Anas proves protected resource boundary, Hamzeh prepares tests. Integrate recording + SpeechBrain model, then Keycloak + gate, then full workflow. Do not wait for a complete UI or polished report before testing. No production mock or bypass path.

## 9. Schedule (revised target; not completed work)

| Date | Target |
|---|---|
| 25 Nov | Approve redesign/instructor scope, set up Kali, parallel feasibility checks and branch ownership. |
| 26 Nov | Omar proves password+TOTP; Sara records; Yousef compares; Anas validates device flow and resource boundary; Hamzeh starts tests. |
| 27 Nov | Integrate real factors, confirm account/attempt binding, permission and role checks; supervised enrollment. |
| 28 Nov | Recovery and negative cases, replay and accuracy/timing evaluation. |
| 29 Nov | Integrate written report, actual results, figures and reference review. |
| 30 Nov | Final reproducibility check and submission according to handout. |

If blocked, reduce interface polish and optional tests before compromising authorization, or report component-only results honestly. Do not claim completion of untested integration.

## 10. Phase 2 writing and shared definition of done

Omar coordinates Preliminary Knowledge (~400 words and >=4 references); Anas integrates Proposed Model (1,500–2,000 words plus architecture diagram, justification and stepwise flows); Hamzeh compiles Simulation Results (actual data, figures, comparison and limitations). All five contribute to all phases and review their claims. Sara supplies recording/enrollment evidence; Yousef supplies SpeechBrain model and threshold evidence; Omar supplies factor configuration and claims; Anas supplies access boundary/recovery; Hamzeh supplies independent tests.

A merge-ready component has reproducible Kali setup, documented versions, real success and failure examples, safe fixtures and clear interface. Use reviewed feature PRs, no secrets or biometric data in commits, no Python outside the voice model/adapter, and no fabricated results. The final demonstration must show that password and TOTP without voice do not authorize the protected action, wrong roles are denied, and current-session voice pass is required.

Original roster/deadline and report requirements were taken from the repository; member tasks, new branch names, schedule and technical integration are revised proposals for team review.
