# Project Requirements — Password with TOTP or Voice Verification on Kali Linux

**Version:** Draft v0.4 (revised 25 November 2026)  
**Phase:** Information Systems Security — Phase 2, due **30 November 2026** (original repository deadline)  
**Status:** Proposed requirements, not evidence of implementation.  
**Companions:** `TEAM_RESPONSIBILITIES.md`, `contracts/api.md`, `docs/KALI_SETUP.md`.

## 1. Project overview

Implement a small Kali Linux lab account system with mandatory password and user-selected TOTP or experimental speaker verification. Knowledge is always required; possession or experimental inherence is the second factor. The user selects the method in the terminal before starting a fresh Keycloak login. Keycloak verifies passwords and, on the TOTP path, verifies the Google Authenticator code. On the voice path, the trusted gate requires a fresh SpeechBrain comparison against the authenticated account's approved reference. Both paths enforce RBAC and least privilege. The minimum demonstration is terminal-based, with browser only for Keycloak login.

This supersedes the mandatory three-factor design. Python is allowed only for SpeechBrain, its inference dependencies and minimal local comparison adapter. All other components use existing Kali/Linux tools, configuration and Bash. Keycloak and SpeechBrain are external software; instructor permission is required. No custom web stack, model training or C++ alternative.

**Security boundary:** speaker matching is experimental, not proof of liveness or NIST SP 800-63B-4-compliant authentication. Password+TOTP is conventional 2FA; password+voice is an experimental alternative. A selectable system is only as resistant as its weakest enabled route; do not claim it is stronger than requiring both. TOTP is susceptible to phishing and code theft.

## 2. Scope

| In scope | Out of scope |
|---|---|
| Kali, Keycloak, Google Authenticator, SpeechBrain voice-only Python adapter, Bash gate | Python outside model inference, FastAPI, custom HTTP services |
| Password AND (TOTP OR voice); separate trusted paths, RBAC | Mandatory 3FA, facial recognition, speech-to-text, training |
| Admin-approved enrollment, supervised factor reset and recovery | Public registration, unsupervised recovery or public deployment |
| Protected resource and repeatable comparison of both paths | Guaranteed anti-spoof/liveness, standards certification |

## 3. Components and ownership

| Component | Owner | Proposed technology |
|---|---|---|
| Identity and both login paths | Omar Aljaouni | Keycloak, Google Authenticator, Java runtime or approved container, curl/jq |
| Recording and enrollment interaction | Sara Alqadi | ALSA `arecord`, FFmpeg/ffprobe, Bash |
| Voice comparison | Yousef Taha | SpeechBrain, pretrained ECAPA-TDNN, PyTorch, minimal local Python adapter |
| Integration, protected resource and recovery | Anas Musa | restricted Bash gate, curl/jq, OS accounts/permissions, Keycloak device flow and introspection |
| Evaluation | Hamzeh Abu Jumaa | Kali, Nmap, Wireshark, curl, shell tools, consented recordings |

All server-side project components run on Kali. Google Authenticator runs on a separate phone. Use a dedicated lab realm/client, distinct service and unprivileged operator/demo accounts, and a protected resource that is not directly readable by the user. All owners must contribute implementation, tests and report evidence.

## 4. Actors and permissions

Realm `voice-demo`; proposed confidential clients `voice-terminal-totp` and `voice-terminal-voice`. Application roles `regular_user` and `administrator` are consistent across both clients (realm roles or explicitly mapped client roles; proposed realm roles, restricted to the application). These do not grant Keycloak console administration. Identity is validated issuer + `sub`, never caller input.

| Operation | Visitor | Regular user | Administrator |
|---|---|---|---|
| Select method and start login | Yes | Yes | Yes |
| Record own verification attempt | No | Voice path, after password | Same |
| Enroll own reference | No | Password + TOTP and active admin approval | Same |
| Read protected lab resource | No | Password + chosen second factor | Same |
| Execute defined admin-only operation | No | No | Password + chosen second factor + role |
| Approve enrollment/replacement | No | No | Password + TOTP, administrator role, supervised identity evidence |

Both roles may choose either factor for normal access. Sensitive enrollment approval and recovery are separately restricted to the TOTP path and supervised identity checks, to prevent a weak or replaced voice from authorizing factor changes. This is a proposed enrollment safeguard, not mandatory 3FA for normal access. First-admin bootstrap is supervised offline. TOTP reset uses authorized Keycloak procedures with identity checks and session revocation.

## 5. Functional requirements

Preserve original FR IDs where possible; TOTP and method-selection requirements are FR-27–FR-32. Every requirement needs actual acceptance evidence.

### 5.1 Account identity and login

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-01 | Create designated demonstration accounts in Keycloak. | Two distinct account subjects and assigned roles. |
| FR-02 | Enforce configured password policy and brute-force protection. | Weak password rejected; rate/lockout settings demonstrated safely. |
| FR-03 | Authenticate correct password through the supported Keycloak browser flow used by the dedicated client. | Wrong password cannot produce an accepted login. |
| FR-04 | Obtain trusted identity and client roles from validated Keycloak data. | Caller-supplied IDs/roles cannot influence authorization. |
| FR-05 | End gate attempt on logout, expiry or completion; no reusable voice-pass flag. | New operation requires fresh authentication; expired/revoked tokens denied. |
| FR-27 | Configure required TOTP on the TOTP client; enroll eligible demo users using Google Authenticator on a separate device. | Enrollment documented without exposing seed or QR; correct fresh code works. |
| FR-28 | Block missing, incorrect, expired and reused TOTP on the TOTP path; prove password-only tokens cannot satisfy that path. | Negative tests including existing browser SSO, unconfigured OTP, and direct grant. Record actual replay/window behavior; resolve bypass before acceptance. |
| FR-29 | TOTP reset requires supervised identity verification, invalidates affected sessions, and preserves role and voice requirements. | Recovery audit; new OTP enrollment required for TOTP access; no silent downgrade or reused state. |

| FR-30 | Let user select TOTP or voice before starting a login; bind method to attempt and expected client. | Both methods available; unknown choice denied; switching cancels old attempt and requires fresh password. |
| FR-31 | Separate trusted client flows; verify token client, audience and issuer, with consistent roles. | Voice-client token cannot satisfy TOTP path; unrelated token or caller-supplied method/flag denied. |
| FR-32 | Require approved prior voice enrollment and existing verified OTP for normal use of respective methods; factor setup is not a resource authorization. | Unenrolled method denied, no automatic fallback; supervised enrollment via TOTP path and admin approval. |

### 5.2 Voice enrollment and speaker verification

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-06 | Record a fresh microphone clip on the trusted Kali host, normally 3–10 seconds. | Microphone success and device/error handling. |
| FR-07 | Require short-lived administrator approval for initial voice enrollment after identity check. | Unapproved enrollment denied; approval single-use. |
| FR-08 | Associate the reference with the validated account subject. | Another user's reference cannot be selected by the caller. |
| FR-09 | Validate and normalize audio to signed 16-bit PCM WAV, 16 kHz mono; impose duration and size limits. | Format inspection and malformed/oversized input rejected. |
| FR-10 | Use SpeechBrain with pretrained ECAPA-TDNN weights for 1:1 comparison. | Known genuine and impostor clips produce documented similarity scores and decisions using only the voice-specific Python adapter. |
| FR-11 | Select and document a threshold after calibration; freeze it before evaluation. | Disjoint calibration/evaluation attempts, chosen threshold, engine version and score direction recorded. |
| FR-12 | Bind voice pass to current attempt, validated subject, token/session and enrollment version. | Another account/session/old enrollment cannot reuse a pass. |
| FR-13 | Deny missing/mismatched/error/timeout results on the selected voice path; no automatic fallback. | No protected access on failed recording, corrupt model, unexpected output or voice mismatch. |

### 5.3 Protected access and recovery

| ID | Requirement | Acceptance evidence |
|---|---|---|
| FR-14 | Require password AND (successfully verified TOTP OR successfully verified voice) for protected access, according to the selected path. | Both complete paths succeed; password alone, TOTP alone and voice alone denied. |
| FR-15 | Require the `administrator` role in addition to a complete selected 2FA path for admin operation. | Regular user denied; authorized admin allowed. |
| FR-16 | Enforce checks in a trusted gate; directly accessing protected data, modifying client inputs or invoking arbitrary commands cannot bypass it. | OS permission tests; direct access and role-tampering tests. |
| FR-17 | Password reset preserves roles and reference; revokes relevant sessions and requires a fresh complete selected path for new access. | Old attempt denied; new 2FA required. |
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
| FR-26 | Compare isolated password-only baseline, password+TOTP and password+voice using measured lab outcomes and response times. | Labeled baseline results, analysis and limitations; no fabricated results. |

## 6. Nonfunctional requirements

| ID | Requirement | Verification |
|---|---|---|
| NFR-01 | Default-deny, trusted gate and least privilege for each protected action. | Negative tests; direct resource and tampering tests. |
| NFR-02 | Informed consent; limited biometric retention; restricted storage. | Privacy checklist; deletion procedure. |
| NFR-03 | No real credentials, tokens, OTP seeds, QR codes, voice samples or embeddings committed. | Repository inspection, sanitized screenshots/exports. |
| NFR-04 | Consistent audio preparation and validated score format. | Reproducible recordings and tests. |
| NFR-05 | Fail closed on Keycloak/token failure or any failure on the selected path; model failure does not authorize voice access or silently switch methods. | Failure cases documented. |
| NFR-06 | Document Kali release, tool versions, voice-only Python dependency versions, model revision/hash, configuration and threshold. | Reproduction by teammate; Python confined to voice inference. |
| NFR-07 | Minimal clear terminal prompts, browser login and error feedback. | Walkthrough. |
| NFR-08 | Measure authentication time and voice inference time separately. | Actual timed results on declared hardware. |
| NFR-09 | Isolate the lab; protected data and biometric store not accessible to demo users. | Permissions, listener and network review. |
| NFR-10 | TLS for token exchanges; trusted endpoint, restricted secret handling, no raw token in command line/logs; revoke session on recovery. | Configuration and negative tests. |

## 7. Technical interfaces

See `contracts/api.md`. No custom HTTP service. Proposed two confidential Keycloak device-flow clients within one realm, each with dedicated browser flow: required password+OTP for TOTP, required password for voice. Gate chooses client from fixed trusted configuration and validates newly issued token via introspection, including issuer, expected client, audience, subject, expiry and role. Client-specific browser-flow override in actual device authorization must be proven; if not supported or bypassable, stop and revise approved architecture. No user-pasted tokens, direct password grants, unverified JWTs or caller success flags.

Voice path only: ALSA/FFmpeg -> local SpeechBrain adapter -> gate. Audio is 16-kHz mono signed PCM WAV, 3–10 s, at most 10 MiB. Three voice attempts and five-minute gate attempt window are provisional limits; respect shorter token/device expiry. Enforce account-level throttling across restarts and both paths; no automatic fallback. Switching explicitly cancels and clears state, starts a new attempt and fresh password.

## 8. State and storage

- Keycloak owns password credentials, TOTP credentials, identities and roles. The phone holds the TOTP secret; do not copy it to the gate.
- Gate-owned restricted directory stores enrolled reference/template, validated subject association, version and approval state; use opaque safe identifiers, not user input paths. Lock concurrent updates, use atomic writes and never follow untrusted symlinks.
- The gate retains access token and attempt state only in its trusted process/protected temporary storage; verify active token, expected issuer/client/audience, trusted subject and application role and selected client again before dispatch. Reject inconsistent/missing claims. Never expose token or trust locally decoded unverified JWT claims.
- Store selected path and its trusted result only for the active one-operation attempt; bind voice pass to enrollment version; discard on completion, failure, timeout, logout, or revocation. No public voice state endpoint.
- Record sanitized audit events and test outcomes; raw evidence stored privately and deleted after the agreed retention period.

## 9. Workflows

### 9.1 Login and verification

1. User selects TOTP or voice in trusted terminal. Gate creates a unique attempt with fixed method, expected client, action and expiry.
2. Gate initiates supported Keycloak device authorization with selected client. User opens trusted browser, enters password; TOTP path additionally requires a fresh code. No SSO shortcut.
3. Gate validates the token returned by that exact attempt using trusted introspection. Check issuer, expected client/audience, subject, expiry and role. Missing or inconsistent claims deny access.
4. TOTP path: validated token from the proven required password+OTP flow satisfies the second factor. No microphone or voice check is required. Voice path: token proves password only; gate selects the subject's approved active reference, captures fresh audio, and invokes SpeechBrain. Only an explicit valid match satisfies the second factor.
5. Gate revalidates token, role and method-specific state (including enrollment version for voice) before dispatching an allowlisted protected action. Clear attempt on completion or error. If user changes method, cancel and restart; do not transfer tokens or factor status.

### 9.2 Enrollment

Existing TOTP enrollment is supervised; record no seed or QR. Voice enrollment needs successful password+TOTP, prior short-lived administrator approval created after password+TOTP and supervised identity check, and consent. Gate stores reference only against trusted subject, consumes approval and audits. Enrollment itself does not open a protected resource. Initial administrator bootstrap is offline and documented.

### 9.3 Recovery

Password/TOTP reset follows authorized Keycloak procedures, with identity checks, audit, and affected session revocation. Voice replacement requires supervised identity check and approved admin TOTP-path action; old reference and outstanding attempts invalidated. New reference enrolled through the approved TOTP path. Lost factor does not grant access to factor management; no silent downgrade or automatic fallback. A user can explicitly start a new login with another already enrolled factor. Report the weaker-path risk.

## 10. Evaluation and minimum acceptance

Use `tests/test_cases.md` for the complete matrix. Test both complete paths, password-only, wrong selected factors, cross-path token substitution, switching/cancellation, direct OS bypass, authorization, token expiry, enrollment tampering, replay and system errors. The voice threshold is an experiment, not a guarantee. Record a replay outcome even if the attack succeeds. Baselines are separate isolated evaluation modes/fixtures, never a bypass in the final gate.

- [ ] All computer-side execution is on Kali; Python is confined to the SpeechBrain library and minimal voice adapter.
- [ ] Instructor accepts the voice-only Python exception, external tools and shell/config integration; pretrained model runs on Kali.
- [ ] Password is mandatory for both paths; TOTP is mandatory only on TOTP path; no SSO/alternate grant or cross-client bypass.
- [ ] Voice path requires current subject’s fresh voice result; TOTP path works without voice; direct access denied.
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

1. Instructor approval for external tools, voice-only Python and Bash; strict official-tool-only interpretation would block this proposal.
2. Tested SpeechBrain environment, exact package versions/model revision and checksum, output format, score direction, threshold and engine error behavior.
3. Tested two Keycloak device-flow clients, per-client browser override behavior, required fresh password on both and OTP on TOTP path, introspection claims and TLS.
4. Safe local gate execution, service identity, microphone device access and no direct protected-file access. If this cannot be established, demonstrate components separately and report incomplete integration.
5. Admin evidence and initial bootstrap procedure; retention; concurrency and throttling settings.

Source basis: original repository requirements and team documents (23 November 2026), prior Phase 1 report/Phase 2 handout cited there (not independently retrieved), and revised user direction. External technical references: [Keycloak admin guide](https://www.keycloak.org/docs/latest/server_admin/), [OIDC endpoints and grants](https://www.keycloak.org/securing-apps/oidc-layers), [SpeechBrain speaker API](https://speechbrain.readthedocs.io/en/latest/API/speechbrain.inference.speaker.html), [ECAPA-TDNN model](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb), [NIST SP 800-63B-4](https://pages.nist.gov/800-63-4/sp800-63b.html).
