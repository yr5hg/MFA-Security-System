# Project Requirements — User Accounts and Voice-Based Verification Security

**Document version:** Draft v0.1  
**Date:** 23 November 2026  
**Phase:** Information Systems Security — Phase 2 (due **30 November 2026**)  
**Status:** Proposed implementation requirements for team review; **not** a record of completed implementation or successful testing.  
**Related documents:** `contracts/api.md`, `TEAM_RESPONSIBILITIES.md`

## 1. Project overview

Build a **small educational account service** that combines Keycloak username/password authentication, **experimental** voice-based speaker verification, role-based access control (RBAC), and controlled account/voice recovery. The implementation must demonstrate that **password authentication alone cannot unlock protected resources** and that only requests with an appropriate role can perform administrator operations. The system will be evaluated with repeatable positive and negative test cases, including voice mismatches and replayed recordings.

The Phase 1 report specifies Keycloak, a separate Python voice-verification service using **SpeechBrain's pretrained ECAPA-TDNN**, and server-side verification of the **same account and login session**. It does **not** claim a novel ML model, production security, or successful results before testing. The proposed endpoints, role strings, sample-rate requirements, and limits below are **team design decisions** adopted from the preliminary API contract; the team should confirm them before implementation.

> **Security and standards boundary:** Voice biometric comparison is an **academic experiment**, not a NIST SP 800-63B-4-compliant authenticator and not a phishing-resistant or replay-resistant solution. A speaker similarity match is not proof that the actual person is physically present. Test and report this limitation rather than claiming otherwise.

## 2. Scope

### 2.1 In scope (minimum prototype)

- Demonstration accounts managed in Keycloak; password authentication and application roles.
- Browser interface for login, enrollment and new voice recordings.
- Administrator-approved initial voice enrollment and controlled replacement.
- Pretrained ECAPA-TDNN speaker verification (no training from scratch).
- Protected area requiring **valid password-authenticated session + successful session-bound voice check**.
- Administrator-only operation requiring the same checks **plus** the `administrator` role.
- Password reset that **preserves** existing voice-enrollment requirement and role.
- Documented tests for incorrect password, wrong voice, missing voice, replay, authorization, and recovery.
- Phase 2 technical report with architecture, reproducible setup, actual experimental results, and limitations.

### 2.2 Out of scope for Phase 2

- Production deployment, large user base, cloud hosting, or a polished UI.
- Training a neural network from scratch or claiming to invent a new authentication algorithm.
- Guaranteed liveness detection, deepfake detection, replay protection, or NIST assurance compliance.
- Adding Google Authenticator/TOTP as the second factor (this **new voice-based Phase 1** supersedes the older TOTP plan).
- Public registration or self-service modification of another account's enrolled voice.

## 3. Components and ownership

| Component | Lead | Technology / role |
|---|---|---|
| Identity and login | **Omar Aljaouni (20230186)** | Keycloak (locally via Docker), OIDC, demo users and client roles |
| Browser UI and audio capture | **Sara Alqadi (20230493)** | HTML/CSS/JavaScript, microphone, uploads and UI feedback |
| Speaker verification | **Yousef Taha (20230981)** | Python, SpeechBrain, pretrained ECAPA-TDNN, similarity/threshold |
| Main backend and access enforcement | **Anas Musa (20201119)** | FastAPI, OIDC/session, RBAC, voice-state binding, recovery |
| Testing and evaluation | **Hamzeh Abu Jumaa (20230911)** | pytest, curl, Nmap in authorized lab, audio test cases, results |

**Overall communication:** Browser -> Main Backend -> Internal Voice API. The browser may be redirected to Keycloak for password login, but must not call the internal voice service or Keycloak administrative interfaces directly.

## 4. Actors and permissions

**Actors:** unauthenticated visitor; `regular_user`; `administrator`; administrator performing supervised enrollment/recovery; internal voice service.

**Proposed Keycloak settings:** realm `voice-demo`, OIDC client `voice-web`, **client roles** exactly `regular_user` and `administrator` (lowercase, case-sensitive). These are application permissions; they are **not** Keycloak console-admin privileges.

| Operation | Visitor | `regular_user` | `administrator` |
|---|---|---|---|
| Open login page | Allow | Allow | Allow |
| Read `/api/me` after password login | Deny | Allow | Allow |
| Submit own voice verification (if enrolled) | Deny | Allow | Allow |
| View `/api/protected` | Deny | Allow **after voice pass** | Allow **after voice pass** |
| Invoke `/api/admin` | Deny | Deny | Allow **after voice pass** |
| Approve / reset voice enrollment | Deny | Deny | Allow **after voice pass + identity check** |

**First-administrator bootstrap:** A new deployment may need a **one-time supervised administrative bootstrap** to enroll its first administrator. Document that local setup explicitly; do not create a publicly accessible bypass route.

## 5. Functional requirements (FR)

Each requirement is considered complete only after its **acceptance evidence** is collected. Record test IDs and screenshots/logs where applicable.

### 5.1 Account identity and login

| ID | Requirement | Acceptance criteria / evidence |
|---|---|---|
| **FR-01** | Administrator can create designated demonstration accounts in Keycloak. | Two test accounts exist and can be distinguished by trusted Keycloak IDs. |
| **FR-02** | Keycloak applies the configured password policy to the demonstration accounts. | Weak/noncompliant password is rejected as configured; compliant password is accepted. |
| **FR-03** | Keycloak authenticates username/password through the proposed OIDC application flow. | Correct credentials create a password-authenticated application session; incorrect credentials do not. |
| **FR-04** | Application roles are configured in Keycloak and available to the backend as trusted claims or server lookup. | `/api/me` accurately reports each test user's role; browser-supplied role changes are ignored. |
| **FR-05** | Logout ends the application login state and clears the associated voice verification state. | After logout, protected API returns unauthorized until a new login + voice check. |

### 5.2 Voice enrollment and speaker verification

| ID | Requirement | Acceptance criteria / evidence |
|---|---|---|
| **FR-06** | Browser captures a voice recording after microphone permission is granted. | A 3–10 second test clip can be recorded and uploaded; permission denial displays a clear error. |
| **FR-07** | Initial voice enrollment requires server-recorded administrator approval after identity verification. | Unapproved enrollment is denied; an approved test account can enroll its own voice. |
| **FR-08** | Enrollment associates a reference voice (or derived protected template) with the verified Keycloak account ID, not a client-chosen ID. | Attempts to enroll for another user through modified request data fail. |
| **FR-09** | Main backend validates and normalizes incoming audio before calling the voice service. | Supported inputs are converted to internal 16-kHz mono PCM WAV; malformed inputs are rejected. |
| **FR-10** | Voice service compares an enrolled reference recording and a fresh recording using pretrained SpeechBrain ECAPA-TDNN. | Service returns a machine-readable match decision, similarity score, threshold, and model name. |
| **FR-11** | Acceptance threshold is documented and evaluated on representative test recordings. | Threshold and observed matching/nonmatching results are included in experimental evidence; no fabricated accuracy claims. |
| **FR-12** | A passing voice result applies **only** to the currently authenticated user and login session. | A previous session's pass or another account's result cannot unlock protected access. |
| **FR-13** | If voice verification fails, is missing, or the service is unavailable, protected access is denied. | Failed, missing, and unavailable voice checks all prevent access to protected endpoints. |

### 5.3 Protected access and recovery

| ID | Requirement | Acceptance criteria / evidence |
|---|---|---|
| **FR-14** | `/api/protected` requires both valid application authentication and a passing voice check for that session. | Tests pass for password+matching voice; fail for password-only, voice-only, and wrong voice. |
| **FR-15** | `/api/admin` additionally requires Keycloak application role `administrator`. | Verified regular user receives 403; verified administrator succeeds. |
| **FR-16** | Authorization is enforced **server-side for every protected request**, including direct HTTP calls. | Direct curl/pytest requests cannot bypass role or voice checks by hiding/showing UI controls. |
| **FR-17** | Password reset preserves application role and voice-enrollment requirement. | After reset, previous role remains and a new session still needs voice verification. |
| **FR-18** | Replacing a lost/invalid reference voice requires documented administrator-assisted identity verification and an approved recovery action. | Unauthorized replacement is denied; supervised approved replacement is recorded. |
| **FR-19** | Approved voice replacement invalidates the old enrollment and all affected voice-pass states. | Old reference no longer authorizes future logins; a new reference must be enrolled. |
| **FR-20** | The system records non-sensitive audit information for enrollment and recovery decisions. | Test evidence includes action, account reference, administrator, timing, evidence type checked, and outcome; not raw secrets. |

### 5.4 Evaluation and reporting

| ID | Requirement | Acceptance criteria / evidence |
|---|---|---|
| **FR-21** | Test matching speakers and different speakers with consented demonstration recordings. | Test plan and actual observations are recorded. |
| **FR-22** | Test at least one **replayed recording** and, if feasible and consented, an imitation/synthetic-voice case. | Actual acceptance or rejection is documented; **no claim of guaranteed replay prevention**. |
| **FR-23** | Test incorrect password, missing voice, nonmatching voice, access with wrong role, and recovery denial. | Expected vs. observed results exist for each completed test. |
| **FR-24** | Evaluate similarity thresholds with appropriate metrics where data supports them. | Report counts and FAR/FRR, explicitly identifying denominators and small-sample limits. |
| **FR-25** | Identify lab-exposed services and API behaviors using authorized tools. | curl/pytest endpoint checks and optional Nmap local scan logged without exposing a public target. |
| **FR-26** | Present an actual Phase 2 evaluation and an appropriate baseline/comparison. | Charts/tables/screenshots include labels, settings, dataset size, baseline, observed results, and limitations. |

## 6. Nonfunctional requirements (NFR)

| ID | Requirement | Verification |
|---|---|---|
| **NFR-01 Security** | Default deny; valid authentication, voice state and correct role checked on the server. | Negative tests and direct API requests. |
| **NFR-02 Privacy** | Collect voice recordings only with informed consent; use demo accounts; restrict access to files/templates. | Storage/consent checklist and repo inspection. |
| **NFR-03 Secret management** | No passwords, OIDC client secrets, tokens, voice samples or embeddings committed to Git. | `.gitignore` review and repository check. |
| **NFR-04 Audio consistency** | Use the same documented preprocessing for enrollment and login. | Reproducible audio conversion/test scripts. |
| **NFR-05 Reliability** | If Keycloak/session validation or voice service fails, access is denied without silently bypassing a check. | Failure injection tests. |
| **NFR-06 Reproducibility** | Setup instructions specify OS, Python/package versions, model identifier, thresholds and commands. | A second member can follow README and reproduce test setup. |
| **NFR-07 Minimal UI** | Clear prompts and messages for microphone errors, missing enrollment and voice mismatch. | Manual frontend walkthrough. |
| **NFR-08 Performance reporting** | Record voice-verification timing under declared test hardware; don't assume an untested speed target. | Timed results and environment description. |
| **NFR-09 Local isolation** | Voice API accessible only from trusted local backend/network; no open public demo by default. | Address/network configuration review. |
| **NFR-10 Web security** | Use protected session cookies, safe OIDC callback handling and CSRF protection for browser state-changing operations. | Code review and targeted tests; HTTPS required if deployed beyond loopback. |

## 7. Agreed technical interface (Draft v0.1)

### 7.1 Execution environment

| Component | Proposed address | Platform |
|---|---|---|
| Keycloak | `http://localhost:8080` | Keycloak in Docker, local development |
| Main backend + frontend | `http://localhost:8000` | Python FastAPI; same-origin simple frontend |
| Internal voice API | `http://127.0.0.1:8001` | Python FastAPI + SpeechBrain |
| Source repository | GitHub **private** repo | Feature branches / pull requests |

URLs are **local examples**, not deployment commitments. Using Docker containers may require different internal hostnames even though the browser uses `localhost`.

### 7.2 Main backend endpoints

| Method | Path | Purpose / access |
|---|---|---|
| `GET` | `/auth/login` | Start OIDC login; redirect to Keycloak |
| `GET` | `/auth/callback` | Validate OIDC response and create app session |
| `POST` | `/auth/logout` | Clear session and voice status |
| `GET` | `/api/me` | Current logged-in account and voice status |
| `POST` | `/api/voice/enroll` | Upload own reference sample with approval |
| `POST` | `/api/voice/verify` | Upload fresh voice sample for current account |
| `GET` | `/api/protected` | Requires password login + voice pass |
| `GET` | `/api/admin` | Also requires `administrator` role |
| `POST` | `/api/admin/users/{user_id}/approve-enrollment` | Approved administrator + checked identity evidence |
| `POST` | `/api/admin/users/{user_id}/reset-voice` | Approved recovery, invalidate old enrollment |
| `GET` | `/health` | Non-sensitive local health check |

Client audio upload: `multipart/form-data` containing **one field named `audio`**, accepting browser-supported WebM/Opus when available or WAV. The backend owns user identity from its authenticated session.

Example `GET /api/me` after password login, before voice pass:

```json
{
  "user_id": "keycloak-sub-123",
  "username": "test_user",
  "roles": ["regular_user"],
  "voice_enrolled": true,
  "voice_verified": false
}
```

Example `POST /api/voice/verify` processed mismatch (200 does **not** mean verified):

```json
{"voice_verified": false, "message": "Voice verification failed"}
```

The backend keeps numeric similarity scores in **restricted evaluation logs**, not in the browser response by default.

### 7.3 Internal voice API

`POST /internal/voice/compare` — **only called by the trusted backend**. Send two `multipart/form-data` files:

- `reference_audio`: enrolled reference recording, standardized WAV.
- `attempt_audio`: fresh attempted recording, standardized WAV.

Example successful response (values **illustrative only**):

```json
{
  "matched": true,
  "score": 0.82,
  "threshold": 0.70,
  "model": "speechbrain/spkrec-ecapa-voxceleb"
}
```

The service doesn't need Keycloak roles, account IDs or session IDs. The main backend chooses the correct reference file and binds the result to the active session.

### 7.4 Audio preparation

| Parameter | Proposed agreement |
|---|---|
| Browser formats | WebM/Opus or WAV, as supported |
| Internal format | WAV, signed 16-bit PCM |
| Sample rate | **16,000 Hz** |
| Channels | **Mono (1)** |
| Recording duration | **3–10 seconds**, provisional demo rule |
| Upload limit | **10 MB**, provisional safety limit |
| Model | `speechbrain/spkrec-ecapa-voxceleb` |
| Audio conversion owner | Main backend (Anas) |
| Model comparison owner | Voice API (Yousef) |

Member 2 should **not** need to write custom resampling code in the browser. Member 4 normalizes accepted recordings before calling the internal service. Member 3 validates normalized inputs.

### 7.5 Error handling

| Status | Meaning |
|---|---|
| `200` | Request processed (a voice mismatch can still be `200` with `voice_verified=false`) |
| `201` | New voice enrollment completed |
| `302` | Browser redirect in OIDC flow |
| `400` / `415` | Bad or unsupported recording |
| `401` | No valid authenticated session |
| `403` | Voice check missing or insufficient role/approval |
| `409` | Invalid workflow state; e.g. voice not enrolled |
| `413` | Upload exceeds limit |
| `429` | Too many attempts |
| `503` | Internal voice service unavailable; **fail closed** |

Error JSON envelope:

```json
{"error": {"code": "VOICE_NOT_ENROLLED", "message": "Voice enrollment is required before verification."}}
```

## 8. Data and state design (proposed)

- **Identity:** Keycloak stores accounts, passwords, roles. Backend uses the validated OIDC `sub` as its stable account key.
- **Enrollment record:** `keycloak_sub`, `enrollment_version`, restricted `reference_path_or_template`, `approved_by`, `approved_at`, `active`.
- **Application session:** unguessable server-side `session_id`, `keycloak_sub`, authentication state, `voice_verified` and optional timestamp/enrollment version; cookie is HttpOnly with appropriate Secure/SameSite configuration.
- **Audit event:** action, actor, target account, time, identity-evidence category, outcome. Do not log passwords, live tokens, unredacted sensitive evidence or biometric raw data in routine audit logs.
- **Test record:** test ID, input category, expected decision, observed outcome, selected threshold/version, timing and notes.

**Storage choice is open:** a small local SQLite database is a reasonable prototype option, but is **not** specified in Phase 1. Agree on it explicitly rather than creating overlapping databases in different components.

## 9. Main workflows

### 9.1 Login and voice verification

1. Browser starts `/auth/login`; Keycloak authenticates username/password.
2. Main backend validates OIDC callback and establishes a password-authenticated session with `voice_verified=false`.
3. Browser calls `/api/me` and shows the voice step if enrolled.
4. Browser records and uploads fresh audio to `/api/voice/verify`.
5. Backend retrieves the **currently authenticated account's** active reference recording and converts files to the agreed format.
6. Backend calls the internal voice comparison endpoint and receives `matched` + score.
7. Backend stores the trusted pass/fail result **for this session only**; numeric scores remain in restricted testing records.
8. Backend allows `/api/protected` only for current voice-pass sessions; `/api/admin` additionally checks `administrator` role.
9. Logout, a new login, expired session, or approved voice reset clears applicable voice-pass state.

### 9.2 Initial enrollment

1. Identity is verified through a supervised administrator procedure.
2. Backend records a short-lived, account-specific enrollment approval.
3. Authenticated user uploads **their own** reference audio via `/api/voice/enroll`.
4. Backend validates and stores the reference against trusted Keycloak `sub`; pending approval is consumed.

### 9.3 Password reset and voice replacement

- **Password reset:** Keycloak or approved identity process handles reset; no automatic change to role or reference voice; next protected access still requires voice verification.
- **Lost/failed voice:** an authorized administrator verifies claimant evidence; backend records approval, invalidates old enrollment and affected voice sessions, then requires fresh enrollment.
- **Unknown evidence policy:** exact acceptable evidence and the initial admin bootstrap **must be decided and documented** before implementation; no unsupervised self-reset bypass.

## 10. Required evaluation scenarios

| Test ID | Scenario | Expected security decision |
|---|---|---|
| T-01 | Correct password + current enrolled speaker | Protected access allowed if score passes threshold |
| T-02 | Wrong password | Login denied |
| T-03 | Correct password, no voice attempt | Protected access denied |
| T-04 | Correct password, nonmatching speaker | Protected access denied if similarity falls below threshold |
| T-05 | Direct request to protected route without session | Deny |
| T-06 | Matching voice but role `regular_user` requests admin route | Deny |
| T-07 | Matching voice and `administrator` role requests admin route | Allow |
| T-08 | Another account's reference audio / tampered client user ID | Deny; cannot change trusted account association |
| T-09 | Voice service down/timeout | Deny; no bypass |
| T-10 | Previous session's valid voice pass used in new session | Deny pending new voice pass |
| T-11 | Password reset | Role and voice-enrollment requirement preserved |
| T-12 | Voice replacement without admin identity verification | Deny |
| T-13 | Approved voice replacement | Old enrollment invalidated; new enrollment required |
| T-14 | Replayed recording of enrolled speaker | **Observe and report** whether speaker verifier accepts/rejects; no promised anti-replay result |
| T-15 | Voice imitation or synthetic sample, if safely available | **Observe and report**; not a guaranteed detection feature |
| T-16 | Corrupt, unsupported or oversized audio | Clear error; no voice pass |

Member 5 should label tables **Expected** vs **Observed** and fill Observed only from actual testing. Recommended evaluation: number of matching/nonmatching attempts, confusion matrix, False Acceptance Rate (FAR), False Rejection Rate (FRR), processing time, replay-test outcomes, and limitations. If a baseline is used (for example password-only access vs proposed two-step workflow), compare **observable access decisions**, not unsupported claims of practical security superiority.

## 11. Phase 2 submission requirements (from instructor handout)

| Section | Required content | Documentation lead |
|---|---|---|
| **Preliminary Knowledge** | **~400 words**, at least **4 references**; concise technologies, concepts, supporting studies | Omar coordinates; everyone contributes |
| **Proposed Model** | **1,500–2,000 words**; overview, goals, detailed step-by-step flows, important **architecture diagram**, justification, differences from existing approaches, components and parameters | Anas integrates; all component owners write their sections |
| **Simulation Results** | Real setup and inputs; numbered, labeled charts/tables/screenshots; observed results; comparison to baseline or prior model; analysis and limitations | Hamzeh compiles; all owners contribute evidence |

**Deadline:** 30 November 2026. The instructor requires **every student to participate and contribute to all three phases**, and specifies a 4-mark deduction for any phase whose reported AI-generated content percentage exceeds 20% (assessed separately per phase). Documentation must accurately describe actual work, with source attribution and no invented experiments.

## 12. Minimum project acceptance checklist

- [ ] Reproducible Keycloak setup with two test roles and documented app client.
- [ ] Password login works, but password-only session **cannot** open protected routes.
- [ ] Browser can capture/upload audio and clearly handle errors.
- [ ] Pretrained SpeechBrain model can compare two test recordings.
- [ ] Trusted backend records the current session's voice result; client cannot forge it.
- [ ] RBAC prevents verified regular user from calling administrator operation.
- [ ] Enrollment requires verified approval; voice reset invalidates old enrollment.
- [ ] At least matching, nonmatching, replay and role-bypass test results are recorded truthfully.
- [ ] Required Phase 2 figures, references, analysis and limitations are completed.
- [ ] Repository contains **no raw voice recordings, biometric embeddings, passwords or secrets**.

## 13. Open decisions to resolve before implementation

1. Final Keycloak and Python/package versions; integration/OS environment.
2. Session-store mechanism and whether backend uses SQLite or a small file-backed store.
3. Exact identity-evidence procedure for initial enrollment and voice replacement (including first-admin bootstrap).
4. Calibrated decision threshold and evaluation recording split.
5. Final validation limits for audio length, file size, and allowed formats.
6. Whether a separate explicit anti-spoofing detector is excluded (recommended for Phase 2: **exclude**, test replay exposure only).

**Source basis:** `Phase1_Group1_Voice_Verification.pdf` (latest Phase 1), `Phase 2 - Updated (1).docx` (instructor's Phase 2 requirements), and preliminary `voice_project_shared_contract_v0.1.md` (team-proposed API implementation agreement). Source requirements and proposed implementation decisions have been identified separately above.
