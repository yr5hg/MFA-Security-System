# Detailed Team Responsibilities — Kali Flexible Two-Factor Authentication

**Draft v0.4 | 25 November 2026 | Phase 2 deadline: 30 November 2026**

## 1. Team distribution

| Member | Ownership | Difficulty (relative) | Folder / branch |
|---|---|---|---|
| Omar Aljaouni | Keycloak, two client flows, passwords, TOTP, Google Authenticator, accounts/roles | Medium–high (7/10) | `keycloak/` / `feature/kali-keycloak-totp` |
| Sara Alqadi | Microphone, audio preprocessing, terminal prompts, voice enrollment interaction | Medium | `voice-recording/` / `feature/kali-voice-recording` |
| Yousef Taha | SpeechBrain voice model, speaker verification, threshold calibration | Medium–high | `voice-service/` / `feature/kali-speechbrain-voice` |
| Anas Musa | Integration lead, method choice, two-path gate, session binding, protected resource, recovery and RBAC | Highest (9/10) | `access-control/` / `feature/kali-mfa-gate` |
| Hamzeh Abu Jumaa | Kali security testing, both paths, experiments, simulation results | Medium–high (7/10) | `tests/` / `feature/kali-security-evaluation` |

Assignment assumption: the person requesting the harder integration task is Anas (the remaining integration owner in the original roster). Confirm with the team. Yousef remains responsible for the voice engine as explicitly requested. Every member contributes implementation/configuration, testing, and reporting. Python is permitted only for the SpeechBrain library and minimal local voice-comparison adapter owned by Yousef. All computer-side components run on Kali; Google Authenticator is on a phone. All other members use existing tools, configuration and Bash; no Python backend, HTTP voice API or Python tests. External tools, this exception and shell integration require instructor approval.

## 2. Shared decisions

- Use the revised requirements and `contracts/api.md` as the source of truth, not the previous Python web stack.
- Develop on separate branches from the approved migration; keep old branches and history recoverable, do not merge their obsolete code into the redesign.
- Use a Kali VM or installed Kali with a working microphone and isolated lab network. Do not expose Keycloak or privileged interfaces publicly. Repository is currently public: use only sanitized documentation, never credentials or participant biometrics.
- Use a supervised terminal demo with browser only for Keycloak. Difficulty estimates are subjective, not measured effort. No custom web interface or HTTP service is needed. A trusted gate, not a user-controlled shell script, owns authorization.
- Maintain `voice-demo`, `voice-terminal-totp`, `voice-terminal-voice`, `regular_user`, `administrator`; agree on changes before coding.
- A model match is experimental, not liveness, and cannot be accepted from an untrusted caller. No mocked factors in final evaluation.

## 3. Omar — Keycloak and Google Authenticator

**Goal:** configure two independent login flows for the same accounts: password+TOTP and password-only for the external voice path. This is more work than the mandatory 3FA design.

### Tasks in order

1. Install pinned Keycloak release on Kali with approved Java/container and verified TLS. Record versions and isolated lab setup.
2. Create realm `voice-demo`; confidential clients `voice-terminal-totp` and `voice-terminal-voice`; distinct secret files. Configure consistent application roles `regular_user` and `administrator` (proposed realm roles explicitly scoped/mapped for both); ensure the same issuer and subject across flows.
3. Enable supported device authorization for both clients. Disable unrelated grants, direct access grants and service accounts. Use discovery and client-specific browser flow overrides, proving actual device login uses the selected flow on the pinned release.
4. Configure required username/password and required OTP Form on TOTP client; required username/password on voice client. Disable SSO cookie shortcuts and alternate authentication methods. Password-only voice tokens are legitimate identity proof but never sufficient for the protected gate. TOTP users must have a supervised verified OTP enrollment before normal login.
5. Configure password policy, brute-force protection, TOTP digits/period/algorithm/window and reuse policy. Synchronize phone and server clocks. Enroll Google Authenticator privately; do not expose QR or seed.
6. Test both clients, correct/incorrect password, missing/wrong/expired/reused OTP, unconfigured OTP, existing SSO and unrelated grant. Provide proof that a voice-client token cannot be mistaken for TOTP completion; coordinate with Anas.
7. Map and demonstrate actual introspection claims for both clients: issuer, client identity, audience, subject, active, expiry and role. Give sanitized schemas and discovery settings to Anas; no secrets in Git.
8. Document supervised password and OTP recovery, session revocation and factor enrollment rules. If device flow overrides fail, stop and agree on a supported design with Anas before claiming integration.

**Start now:** prove both flows independently with two role-bearing demo users.

**Deliverables:** Keycloak setup, sanitized configuration/export, both flow and OTP screenshots, claim schema, negative tests and report contribution.

**Done when:** both clients enforce exactly their intended factors, no SSO shortcut or cross-client bypass, and another member can reproduce the setup.

## 4. Sara — Voice recording and enrollment

**Goal:** produce consistent microphone samples using existing Kali commands and a simple user-facing terminal workflow.

### Tasks in order

1. Verify microphone passthrough in Kali and inspect input devices using `arecord -l` and `arecord -L`; resolve device/permission problems with Anas.
2. Record a 5-second consented sample with `arecord`; use FFmpeg if native device format differs; check with ffprobe. Standard is 16-kHz, mono, signed 16-bit PCM WAV.
3. Document or implement Bash-based capture/normalization with bounded time, size, temporary files and error handling. Do not accept user-chosen paths or arbitrary uploads in the final login flow.
4. Make clear terminal prompts for selecting TOTP or voice before login, recording on voice path only, cancellation, errors, enrollment and denial. Anas owns trusted method selection; Sara owns prompts. Use the gate's trusted status; prompts cannot change identity or security state.
5. Design enrollment interaction: after password+TOTP and one-time TOTP-path administrator approval, capture reference and hand it to gate for validation and protected storage. Coordinate supervised consent and deletion. Gate owns the account association and permissions.
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

## 6. Anas — Flexible 2FA integration and protected component (hardest)

**Goal:** password plus exactly one selected second-factor path is required for ordinary access; password alone never suffices. Own the choice, trusted state and protected resource. No Python outside the voice adapter.

### Tasks in order

1. Prove resource isolation: separate least-privileged service identity owns private state, configuration, model, references and actual protected lab resource. Ordinary demo account cannot directly read/modify them or run arbitrary commands as gate. Use a reviewed fixed-command launcher, no root code, shell escape or broad sudo; confirm microphone access under gate identity.
2. Implement trusted terminal selection `totp` or `voice` before Keycloak login. Freeze selected method, expected client, action, attempt ID and expiry. Reject unknown choices. Switching cancels and clears old state, creates a new attempt and requires fresh password. Coordinate prompts with Sara.
3. Implement approved device flow with curl/jq for two fixed confidential clients. Trusted TLS discovery, fixed client config, bounded polling at server interval; pending/denied/slow-down/expiry handled. No credentials in shell, pasted tokens or direct password grants.
4. Validate returned token through introspection: active, expiry, issuer, exact expected client and audience, subject and trusted role. Require proof of Omar's actual flow configuration. For TOTP path accept only token issued from the current dedicated required password+OTP flow; no voice check. For voice path a token proves password only, never second-factor success. Reject cross-client substitution, forged selection or client-reported success.
5. Voice path: select reference from trusted issuer+subject, check approval/version, capture trusted normalized audio, call pinned SpeechBrain Python adapter with calibrated threshold. Validate result and process status; fail closed on mismatch/error. No automatic TOTP fallback, no caller-chosen path/threshold/flag.
6. Revalidate token, role, selected method and branch-specific proof immediately before allowlisted action. Lock/recheck enrollment version for voice. Execute only allowed operation, clear state after completion/cancel/expiry/error. Enforce account-level rate limits across both routes and restarts.
7. Enroll voice only after password+TOTP and short-lived single-use approval created by an administrator using TOTP path and supervised identity evidence. Implement versioned replacement, invalidation, audit, and supervised offline first-admin bootstrap. Coordinate Keycloak credential resets and revocation with Omar.
8. Protect state and secrets: fixed environment, restrictive umask, private temporary paths, locks, atomic writes, timeouts and cleanup. Never source user-writable configuration or disclose credentials/tokens in logs. No reusable authentication flag.
9. Integrate both paths with Omar/Sara/Yousef, test with Hamzeh. Demonstrate both positive paths; password-only, wrong role, direct file access, token substitution, stale proof and switched method all denied. If actual boundary or separate flows cannot be secured, report component-only demo.

**Start now:** OS permission proof and two-client device-flow experiment with Omar. Mock adapters allowed only in development; remove before evaluation.

**Deliverables:** reviewed gate/config and launcher instructions, method-choice and session state design, role/recovery policy, integration evidence and architecture. Lead Proposed Model writing. Other owners must supply working independent components.

**Done when:** both paths work and every path-specific and role check is enforced at the real resource boundary; no bypass, stale proof or unapproved factor changes.

## 7. Hamzeh — Kali security tests and evaluation

**Goal:** evaluate actual security decisions, not hypothetical outcomes. Use only authorized isolated lab accounts/services.

### Tasks in order

1. Prepare Kali test environment, list scope and authorization, and build the expected/observed matrix in `tests/test_cases.md`.
2. Test password policy, brute-force protection within safe agreed limits, TOTP-client enrollment, incorrect/expired/reused/missing OTP and cookie/alternate-grant bypass. Coordinate timing and recovery with Omar.
3. Test both successful paths and password-only denial; cross-client tokens, method-switch cancellation, stale factor state, and no automatic fallback; direct file/launcher bypass; wrong role; forged inputs; cross-account/reference tampering; stale/expired/revoked token; old enrollment; interrupted and concurrent gate attempts. Work with Anas to fix failures.
4. Collect consented genuine/impostor samples and replay recordings with Sara/Yousef. Document actual outcomes, including accepted replays. Keep raw data private. Do not claim liveness or phishing resistance.
5. Use Nmap to inspect lab services, Wireshark for authorized transport inspection, curl/jq for supported client flows and Shell/OS tools for file permissions. Burp Suite may be used for scoped Keycloak browser testing if useful; do not force tools that do not fit the terminal design. No Python test framework.
6. Calculate FAR = false accepts / impostor trials; FRR = false rejects / genuine trials. Separate spoof trials, calibration and held-out trials; include counts, limitations and measured latency. Compare isolated password-only baseline, password+TOTP and password+voice with consistent cases.
7. Compile Phase 2 simulation setup, labeled figures/tables, observations and limitations; distinguish mocks from integrated real tests. Collect each member's evidence and reproduce at least one critical component independently.

**Start now:** prepare test matrix and audio consent protocol, then test component setups in parallel.

**Files/deliverables:** `tests/README.md`, `tests/test_cases.md`, Bash/curl test commands as permitted, sanitized results, private evidence kept outside Git, Simulation Results report.

**Done when:** actual outcomes and denominators are recorded, direct bypass checks executed, all critical failures raised with owners, and no unsupported claims or unconsented data.

## 8. Handoffs and integration order

| Producer | Consumer | Agreement |
|---|---|---|
| Omar | Anas, Hamzeh | Trusted issuer/two clients, enforced separate factor flows, introspection schema and role names; secrets out-of-band |
| Sara | Yousef, Anas | 16-kHz mono PCM WAV, bounded recording, format/error behavior |
| Yousef | Anas, Hamzeh | Pinned Python interpreter/adapter/model revision and hash, calibrated similarity threshold and exact validated verdict format |
| Anas | Sara, Hamzeh | Gate choice/actions/status, account binding, permissions, enrollment/recovery semantics |
| All | Hamzeh, report | Actual version, observed outcomes, sanitized evidence, limitations |

Start all five independently after shared Kali setup. Omar and Yousef prove the two primary technical dependencies first, Sara proves recording, Anas proves protected resource boundary, Hamzeh prepares tests. Integrate recording + SpeechBrain model, then Keycloak + gate, then full workflow. Do not wait for a complete UI or polished report before testing. No production mock or bypass path.

## 9. Schedule (revised target; not completed work)

| Date | Target |
|---|---|
| 25 Nov | Approve redesign/instructor scope, set up Kali, parallel feasibility checks and branch ownership. |
| 26 Nov | Omar proves both Keycloak client flows; Sara records; Yousef compares; Anas validates device flow and resource boundary; Hamzeh starts tests. |
| 27 Nov | Integrate both real authentication paths, confirm account/attempt binding, permission and role checks; supervised enrollment. |
| 28 Nov | Recovery and negative cases, replay and accuracy/timing evaluation. |
| 29 Nov | Integrate written report, actual results, figures and reference review. |
| 30 Nov | Final reproducibility check and submission according to handout. |

If blocked, reduce interface polish and optional tests before compromising authorization, or report component-only results honestly. Do not claim completion of untested integration.

## 10. Phase 2 writing and shared definition of done

Omar coordinates Preliminary Knowledge (~400 words and >=4 references); Anas integrates Proposed Model (1,500–2,000 words plus architecture diagram, justification and stepwise flows); Hamzeh compiles Simulation Results (actual data, figures, comparison and limitations). All five contribute to all phases and review their claims. Sara supplies recording/enrollment evidence; Yousef supplies SpeechBrain model and threshold evidence; Omar supplies factor configuration and claims; Anas supplies access boundary/recovery; Hamzeh supplies independent tests.

A merge-ready component has reproducible Kali setup, documented versions, real success and failure examples, safe fixtures and clear interface. Use reviewed feature PRs, no secrets or biometric data in commits, no Python outside the voice model/adapter, and no fabricated results. The final demonstration must show that password+TOTP works without voice, password+voice works without TOTP, password-only and cross-client bypasses fail, wrong roles are denied, and voice pass is required on the voice path.

Original roster/deadline and report requirements were taken from the repository; member tasks, new branch names, schedule and technical integration are revised proposals for team review.
