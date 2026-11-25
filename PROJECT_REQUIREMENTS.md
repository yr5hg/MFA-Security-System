# Project Requirements — Password, TOTP and Voice-Based Verification on Kali Linux

**Version:** Draft v0.2 (revised 25 November 2026)  
**Phase:** Information Systems Security — Phase 2, due **30 November 2026** (original repository deadline)  
**Status:** Proposed requirements, not evidence of implementation.  
**Companions:** `TEAM_RESPONSIBILITIES.md`, `contracts/api.md`, `docs/KALI_SETUP.md`.

## 1. Project overview

Implement a small laboratory account service that combines three categories of authentication: knowledge (password), possession (a separately enrolled TOTP authenticator), and experimental inherence (speaker matching). Keycloak handles username/password and mandatory TOTP; Google Authenticator generates the code on the user's phone. An existing native voice inference engine compares a fresh recording to the account's approved reference. A trusted access gate on Kali enforces all three checks and the required role before opening a protected lab resource. The minimum demonstration is terminal-based, with a browser only for Keycloak login. No custom web application or machine learning training is required.

This supersedes the previous Phase 1 password + voice implementation plan. Preserve Keycloak, RBAC, least privilege, controlled enrollment/recovery, ECAPA-TDNN model family and security evaluation. Replace the custom web/API stack and Python runtime with existing native Linux tools and minimal Bash integration. Keycloak and the native voice engine are external software installed on Kali; the instructor must approve them and any shell scripting. The model must be preconverted so no conversion script or Python runtime is required in project execution.

**Standards boundary:** the voice factor is experimental. Speaker comparison is not proof of liveness, not phishing resistant, and must not be claimed compliant with NIST SP 800-63B-4. Password + TOTP is conventional 2FA; the project evaluates adding an experimental third check rather than claiming production-grade three-factor assurance. TOTP is also susceptible to phishing and code theft.

## 2. Scope

| In scope | Out of scope |
|---|---|
| Kali Linux lab, Keycloak, Google Authenticator, native CLI, shell integration | Windows runtime, custom Python code/runtime, FastAPI or Python voice service |
| Mandatory password and TOTP, third voice check, RBAC | Facial recognition, speech-to-text, new model training |
| Admin-approved enrollment, reset and recovery | Public registration, unsupervised recovery, cloud/public deployment |
| Controlled resource and repeatable security evaluation | Production-grade liveness or anti-spoof guarantees, standards certification |

## 3. Components and ownership

| Component | Owner | Proposed technology |
|---|---|---|
| Identity and first two factors | Omar Aljaouni | Keycloak, Google Authenticator, Java runtime or approved container, curl/jq |
| Recording and enrollment interaction | Sara Alqadi | ALSA `arecord`, FFmpeg/ffprobe, Bash |
| Voice comparison | Yousef Taha | voice-detect.cpp native C++ binary, preconverted ECAPA-TDNN GGUF, CMake |
| Integration, protected resource and recovery | Anas Musa | restricted Bash gate, curl/jq, OS accounts/permissions, Keycloak device flow and introspection |
| Evaluation | Hamzeh Abu Jumaa | Kali, Nmap, Wireshark, curl, shell tools, consented recordings |

All server-side project components run on Kali. Google Authenticator runs on a separate phone. Use a dedicated lab realm/client, distinct service and unprivileged operator/demo accounts, and a protected resource that is not directly readable by the user. All owners must contribute implementation, tests and report evidence.

## 4. Actors and permissions

Retain realm `voice-demo`; proposed client `voice-terminal` (supersedes `voice-web`). Application client roles remain `regular_user` and `administrator` (case-sensitive). These are not Keycloak console-admin permissions. Account identity is the validated issuer + `sub`, not a caller-entered username.

| Operation | Visitor | Regular user | Administrator |
|---|---|---|---|
| Start Keycloak login | Yes | Yes | Yes |
| Record own voice attempt | No | After password + TOTP | After password + TOTP |
| Enroll own reference | No | After password + TOTP and active admin approval | Same |
| Read protected lab resource | No | After all three checks | After all three checks |
| Execute defined admin-only operation | No | No | After all three checks |
| Approve enrollment or voice replacement | No | No | After all three checks and documented identity evidence |

First administrator setup is a one-time supervised offline bootstrap under lab operator control. Never create a normal authentication bypass for bootstrap or recovery. Separate administrator-assisted TOTP recovery is handled through authorized Keycloak admin procedures with identity checks, audit records and session revocation.

## 5. Functional requirements

Preserve original FR IDs where possible; new TOTP requirements are FR-27–FR-29. Every requirement needs actual acceptance evidence.

### 5.1 Account identity and login

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-01 | Create designated demonstration accounts in Keycloak. | Two distinct account subjects and assigned roles. |
| FR-02 | Enforce configured password policy and brute-force protection. | Weak password rejected; rate/lockout settings demonstrated safely. |
| FR-03 | Authenticate correct password through the supported Keycloak browser flow used by the dedicated client. | Wrong password cannot produce an accepted login. |
| FR-04 | Obtain trusted identity and client roles from validated Keycloak data. | Caller-supplied IDs/roles cannot influence authorization. |
| FR-05 | End gate attempt on logout, expiry or completion; no reusable voice-pass flag. | New operation requires fresh authentication; expired/revoked tokens denied. |
| FR-27 | Configure mandatory TOTP for all demo roles and use Google Authenticator on a separate device. | Enrollment documented without exposing seed or QR; correct fresh code works. |
| FR-28 | Block missing, incorrect, expired and reused TOTP as configured; disable password-only/alternative authentication paths for the dedicated client. | Negative tests including existing browser SSO, unconfigured OTP, and direct grant. Record actual replay/window behavior; resolve bypass before acceptance. |
| FR-29 | TOTP reset requires supervised identity verification, invalidates affected sessions, and preserves role and voice requirements. | Recovery audit; new enrollment and all three factors required before access. |

### 5.2 Voice enrollment and speaker verification

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-06 | Record a fresh microphone clip on the trusted Kali host, normally 3–10 seconds. | Microphone success and device/error handling. |
| FR-07 | Require short-lived administrator approval for initial voice enrollment after identity check. | Unapproved enrollment denied; approval single-use. |
| FR-08 | Associate the reference with the validated account subject. | Another user's reference cannot be selected by the caller. |
| FR-09 | Validate and normalize audio to signed 16-bit PCM WAV, 16 kHz mono; impose duration and size limits. | Format inspection and malformed/oversized input rejected. |
| FR-10 | Use existing native inference with preconverted ECAPA-TDNN weights for 1:1 comparison. | Known genuine and impostor clips produce documented native scores and decisions without Python. |
| FR-11 | Select and document a threshold after calibration; freeze it before evaluation. | Disjoint calibration/evaluation attempts, chosen threshold, engine version and score direction recorded. |
| FR-12 | Bind voice pass to current attempt, validated subject, token/session and enrollment version. | Another account/session/old enrollment cannot reuse a pass. |
| FR-13 | Deny missing/mismatched/error/timeout results. | No protected access on failed recording, corrupt model, unexpected output or voice mismatch. |

### 5.3 Protected access and recovery

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-14 | Require password + TOTP + voice for protected access. | All-three success; first-two-only denied; voice alone denied. |
| FR-15 | Require the `administrator` role in addition to all three factors for admin operation. | Regular user denied; authorized admin allowed. |
| FR-16 | Enforce checks in a trusted gate; directly accessing protected data, modifying client inputs or invoking arbitrary commands cannot bypass it. | OS permission tests; direct access and role-tampering tests. |
| FR-17 | Password reset preserves roles and reference; revokes relevant sessions and requires all factors for new access. | Old attempt denied; new 3FA required. |
| FR-18 | Voice replacement needs verified administrator identity check and explicit approval. | Unauthorized replacement denied. |
| FR-19 | Replacement invalidates prior reference version and outstanding voice states. | Old reference/version cannot unlock access. |
| FR-20 | Log non-sensitive audit events for login outcomes, enrollment and recovery. | Action, pseudonymous account, actor, time and outcome; no secrets/audio. |

### 5.4 Evaluation and reporting

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-21 | Test consenting genuine and impostor speakers. | Actual counts and observations. |
| FR-22 | Test replay of a consenting enrolled speaker; optional consented synthetic/imitation clip. | Record acceptance or rejection, not guaranteed detection. |
| FR-23 | Test password, TOTP, voice, role, recovery and bypass failure cases. | Expected versus observed matrix. |
| FR-24 | Report FAR/FRR and threshold methodology with denominators and sample-size limits. | Actual confusion counts, threshold and timing. |
| FR-25 | Inspect authorized lab-exposed services and protected access using Kali tools. | Scoped Nmap, Wireshark, curl and local permission evidence as appropriate. |
| FR-26 | Compare SFA, 2FA and proposed 3FA using measured lab outcomes and response times. | Labeled baseline results, analysis and limitations; no fabricated results. |

## 6. Nonfunctional requirements

| ID | Requirement | Verification |
|---|---|---|
| NFR-01 | Default-deny, trusted gate and least privilege for each protected action. | Negative tests; direct resource and tampering tests. |
| NFR-02 | Informed consent; limited biometric retention; restricted storage. | Privacy checklist; deletion procedure. |
| NFR-03 | No real credentials, tokens, OTP seeds, QR codes, voice samples or embeddings committed. | Repository inspection, sanitized screenshots/exports. |
| NFR-04 | Consistent audio preparation and validated score format. | Reproducible recordings and tests. |
| NFR-05 | Fail closed on Keycloak, token validation, model, timeout or parsing failure. | Failure cases documented. |
| NFR-06 | Document Kali release, tool versions, build commit, model hash, configuration and threshold. | Reproduction by teammate; no Python project runtime. |
| NFR-07 | Minimal clear terminal prompts, browser login and error feedback. | Walkthrough. |
| NFR-08 | Measure authentication time and native inference time separately. | Actual timed results on declared hardware. |
| NFR-09 | Isolate the lab; protected data and biometric store not accessible to demo users. | Permissions, listener and network review. |
| NFR-10 | TLS for token exchanges; trusted endpoint, restricted secret handling, no raw token in command line/logs; revoke session on recovery. | Configuration and negative tests. |

## 7. Technical interfaces

See `contracts/api.md` for the agreed local command/data interfaces; the legacy filename is retained for continuity, but the old web endpoints are retired. Proposed architecture: dedicated Keycloak device authorization client -> fresh browser password and TOTP -> trusted gate -> ALSA/FFmpeg -> native CLI -> protected local operation. Use a supported confidential client and server-side introspection/role mapping; explicitly validate token context and dedicated MFA flow. No browser-supplied success flags, no direct resource owner password grant, no custom HTTP service required.

Audio: 16 kHz mono PCM signed 16-bit WAV, normally 3–10 s, at most 10 MiB; actual threshold, limits and score output must be agreed/tested. Device flow expiry, polling intervals, and server token lifetime must be honored. Proposed max three voice attempts per login and five-minute overall gate attempt window (shorter if token/device code expires). Start a new login after terminal failure; apply persistent account-level throttling to prevent repeated new-login bypass of rate limits.

## 8. State and storage

- Keycloak owns password credentials, TOTP credentials, identities and roles. The phone holds the TOTP secret; do not copy it to the gate.
- Gate-owned restricted directory stores enrolled reference/template, validated subject association, version and approval state; use opaque safe identifiers, not user input paths. Lock concurrent updates, use atomic writes and never follow untrusted symlinks.
- The gate retains access token and attempt state only in its trusted process/protected temporary storage; verify active token, expected issuer/client/audience, trusted subject and client role again before dispatch. Reject inconsistent/missing claims. Never expose token or trust locally decoded unverified JWT claims.
- Store pass only for the active one-operation attempt, bound to enrollment version; discard on completion, failure, timeout, logout, or revocation. No public voice state endpoint.
- Record sanitized audit events and test outcomes; raw evidence stored privately and deleted after the agreed retention period.

## 9. Workflows

### 9.1 Login and verification

1. Gate creates an isolated attempt, initiates supported device authorization with Keycloak and shows the verification URI and user code.
2. User opens Keycloak, verifies displayed device code and enters username/password and fresh Google Authenticator TOTP. Dedicated authentication flow must require both, even when browser has SSO state.
3. Gate polls the official token endpoint as specified. It validates the newly issued token through trusted introspection and checks the expected client, issuer, audience, subject, roles and expiry; no valid identity = deny.
4. Gate captures fresh audio using its own recorder, obtains that subject's active reference, validates format and invokes the pinned native binary/model with configured threshold.
5. Only explicit successful same-speaker result counts. Gate checks token and enrollment version remain valid and role permits the requested allowlisted operation. It performs the operation itself and closes the attempt. Failure anywhere denies access.

### 9.2 Enrollment

After supervised identity check and approval by a fully verified administrator, an authenticated user (password + TOTP) records their own reference. Gate validates and stores it against trusted subject, consumes approval and records audit metadata. Initial admin enrollment uses documented supervised offline bootstrap. Enrollment is not protected-resource access and must not set a voice-pass flag.

### 9.3 Recovery

Password/TOTP recovery follows authorized Keycloak administrator procedures; revoke sessions and require a new login with both factors, plus existing voice check. For lost/unusable voice, fully verified admin approves replacement only after documented identity evidence; old enrollment and outstanding attempt states are invalidated, then fresh enrollment is required. No routine self-service factor removal or fallback that silently reduces the number of factors.

## 10. Evaluation and minimum acceptance

Use `tests/test_cases.md` for the complete matrix. Test missing and wrong factors separately, direct OS bypass, authorization, token expiry, enrollment tampering, replay and system errors. The voice threshold is an experiment, not a guarantee. Record a replay outcome even if the attack succeeds. Baselines are separate isolated evaluation modes/fixtures, never a bypass in the final gate.

- [ ] All project execution is on Kali, using no custom Python or Python runtime for project components.
- [ ] Instructor accepts native external tools and shell/config integration; model runs natively with preconverted weights.
- [ ] Password and TOTP are mandatory; no SSO/alternative grant bypass.
- [ ] Current subject's fresh voice result is enforced before protected operations; direct access denied.
- [ ] RBAC, approval, recovery, expiry and failure behavior tested.
- [ ] Actual genuine/impostor/replay observations, timing, limitations and baseline comparison documented.
- [ ] No biometric or credential material committed; report and figures match actual work.

## 11. Phase 2 submission requirements (preserved from original repository)

| Section | Required content | Lead |
|---|---|---|
| Preliminary Knowledge | ~400 words, at least 4 references, concepts and supporting studies | Omar coordinates; all contribute |
| Proposed Model | 1,500–2,000 words; goals, stepwise flows, architecture diagram, justification, differences, components and parameters | Anas integrates; all owners contribute |
| Simulation Results | Real setup, inputs, numbered figures/tables/screenshots, baseline, actual outcomes, analysis and limitations | Hamzeh compiles; all contribute |

Original requirements record deadline **30 November 2026**, participation by every member in all three phases, and a four-mark deduction for any phase whose reported AI-generated content percentage exceeds 20% (per phase). Verify the original handout; this redesign is a planning aid, not text to submit without team review and original work.

## 12. Open decisions and feasibility gates

1. Instructor approval for external native tools, CMake and Bash; strict official-tool-only interpretation would block this proposal.
2. Tested native tool build, exact release/commit/model checksum, output format, score direction, threshold and engine error behavior.
3. Tested Keycloak device flow, mandatory fresh password/TOTP, introspection claims, confidential client setup and lab TLS.
4. Safe local gate execution, service identity, microphone device access and no direct protected-file access. If this cannot be established, demonstrate components separately and report incomplete integration.
5. Admin evidence and initial bootstrap procedure; retention; concurrency and throttling settings.

Source basis: original repository requirements and team documents (23 November 2026), prior Phase 1 report/Phase 2 handout cited there (not independently retrieved), and revised user direction. External technical references: [Keycloak admin guide](https://www.keycloak.org/docs/latest/server_admin/), [OIDC endpoints and grants](https://www.keycloak.org/securing-apps/oidc-layers), [voice-detect.cpp](https://github.com/localai-org/voice-detect.cpp), [preconverted weights](https://huggingface.co/mudler/voice-detect-gguf), [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html).
