# Detailed Team Responsibilities — Phase 2 Voice Verification Project

**Document version:** Draft v0.1  
**Date:** 23 November 2026  
**Project:** User Accounts and Voice-Based Verification Security  
**Phase 2 deadline:** **30 November 2026**  
**Companion files:** `PROJECT_REQUIREMENTS.md` and `contracts/api.md`  
**Status:** Proposed work allocation, not confirmation that tasks have been completed.

## 1. Team roster and ownership

| Member | Student name | Student ID | Owns |
|---|---|---|
| **1** | **Omar Aljaouni** | **20230186** | Keycloak, accounts, passwords, roles, OIDC configuration |
| **2** | **Sara Alqadi** | **20230493** | Browser frontend, enrollment/verification audio recording |
| **3** | **Yousef Taha** | **20230981** | SpeechBrain ECAPA-TDNN, voice comparison and threshold |
| **4** | **Anas Musa** | **20201119** | Main backend, session and role enforcement, recovery |
| **5** | **Hamzeh Abu Jumaa** | **20230911** | Security tests, voice evaluations, simulation results |

*Every member must participate in **implementation, testing, and documentation**; the owner is accountable for coordinating the component, not doing all work alone.*

## 2. Decisions everyone should follow

- **Version control:** one **private GitHub repository**; each member works on their own feature branch and opens a pull request (PR). Avoid direct pushes to `main`.
- **Editor/OS:** VS Code on **Windows or Linux**; do not require the whole team to install Linux.
- **Runtime:** run **Keycloak in Docker**; run Python/FastAPI and SpeechBrain locally first. Dockerizing everything is optional after the prototype works.
- **Frontend:** simple HTML/CSS/JavaScript, ideally served by the main backend; avoid adding a complicated frontend framework.
- **Backend:** Python + **FastAPI** for the main API and internal voice API.
- **Voice model:** pretrained `speechbrain/spkrec-ecapa-voxceleb`; **no model training from scratch**.
- **Security boundary:** password success alone does not unlock protected endpoints; **voice result is stored and validated server-side for the current login session**; administrator role is checked independently.
- **Documentation:** record actual versions, settings, test environment and results; never claim a test passed before observing it.
- **Safety:** use only dedicated test accounts and voices recorded with participants' consent. Never commit passwords, client secrets, tokens, recordings or embeddings.
- **Scientific limitation:** voice verification here is an **experimental speaker-matching method**, not a NIST-compliant authenticator or guaranteed anti-replay/liveness system.

## 3. GitHub folder ownership and branches

```text
Voice-Verification-System/
├── frontend/                  # Sara
├── keycloak/                  # Omar (config, instructions, safe exports)
├── voice-service/             # Yousef
├── backend/                   # Anas
├── tests/                     # Hamzeh (other owners add component tests too)
├── contracts/
│   └── api.md                 # Team-owned, agreed before implementation
├── docs/
│   ├── architecture.md        # Anas leads; all review
│   └── phase2/                # Each member supplies their section/evidence
├── PROJECT_REQUIREMENTS.md
├── TEAM_RESPONSIBILITIES.md
├── README.md
├── .gitignore
└── .env.example              # Variable names only; NO secret values
```

**Suggested branches:**

| Student | Branch | Main folder |
|---|---|---|
| Omar | `feature/keycloak-setup` | `keycloak/` |
| Sara | `feature/voice-frontend` | `frontend/` |
| Yousef | `feature/speaker-verification` | `voice-service/` |
| Anas | `feature/protected-backend` | `backend/` |
| Hamzeh | `feature/security-tests` | `tests/` |

For cross-folder changes, coordinate first. Commit meaningful working checkpoints with descriptive messages; use PR reviews for integration. The API contract is shared and must be reviewed by **Sara, Yousef and Anas** before changes are merged.

---

## 4. Member 1 — Omar Aljaouni (20230186)

### Role: Keycloak and account management

**Goal:** Provide the trusted username/password login and role information that Anas's backend can consume, without implementing custom password storage.

### Implementation tasks, in order

1. **Run Keycloak** locally with Docker, using a documented pinned image version and development-only admin password from local environment variables.
2. Create the proposed realm **`voice-demo`** and OIDC client **`voice-web`**; configure the redirect URI(s) agreed with Anas, especially `http://localhost:8000/auth/callback` for local integration.
3. Configure **Authorization Code Flow** and give Anas the realm URL, client ID, OIDC discovery URL and any required non-secret configuration. Keep client credentials secret if used.
4. Define **application client roles** `regular_user` and `administrator`; **do not** confuse `administrator` with Keycloak console-admin permission.
5. Create demonstration accounts `test_user` and `test_admin`, assign their respective roles, and set dummy passwords outside Git.
6. Define and document a defensible **password policy** (length and any selected settings); confirm Keycloak enforces it through positive and negative checks.
7. Make the application roles accessible through a properly validated token/role mapping or trusted server lookup. Agree on exact claim placement with Anas.
8. Support an initial **supervised bootstrap procedure** for enrollment of the first demonstration administrator, without creating an open bypass.
9. Record Keycloak version, realm export/rebuild steps (without secrets), screenshots, and test outcomes.

### Work Omar can do immediately

- Start a local Keycloak container, create realm/users/roles and test password login in Keycloak independently of the frontend, voice model or backend.
- Write a short Keycloak setup guide and prepare safe non-secret example configuration for Anas.

### Files owned / handed over

- `keycloak/README.md`: installation, startup, realm, users, roles, password policy, logout and export/rebuild.
- `keycloak/realm-config/` (if safe, secret-free realm export is used).
- `docs/phase2/keycloak.md`: objective, configuration, and contribution to Preliminary Knowledge/Proposed Model.
- `.env.example` OIDC variable names in consultation with Anas.

### Minimum tests and definition of done

- [ ] Good credentials accepted; bad credentials rejected.
- [ ] Two demo users have the intended distinct application client roles.
- [ ] OIDC redirect URI and role mapping work in the integrated backend, not only Keycloak's admin UI.
- [ ] Another member can reproduce the Keycloak setup using the documented procedure.
- [ ] No real passwords or client secrets are committed.

**Hand-off to Anas:** discovery URL, realm, client ID, redirect URIs, exact role mapping, test-account details **without passwords in Git**, and Keycloak startup instructions.  
**Help to others:** help Anas debug OIDC and token-role claims; provide Hamzeh with password-policy evidence.  
**Main risk:** OIDC redirect/configuration errors rather than complexity in user creation.

---

## 5. Member 2 — Sara Alqadi (20230493)

### Role: Frontend, microphone recording, voice enrollment interface

**Goal:** Give test users a working and understandable interface to complete login, record enrollment samples and record a new voice sample during a login attempt.

### Implementation tasks, in order

1. Build minimal **Login / Home**, **Voice Enrollment**, **Voice Verification**, and **Protected Status** pages using HTML/CSS/JavaScript; a single simple page with separate states is also acceptable.
2. Trigger Keycloak login through backend `GET /auth/login`; do **not** build a browser form that asks for and directly sends user passwords to a custom application endpoint.
3. After login, call `GET /api/me` to display the trusted username, roles, `voice_enrolled` and **current session** `voice_verified` status.
4. Use browser `getUserMedia()` and `MediaRecorder` to ask for microphone permission, start recording, stop recording, and prepare a `Blob` or `File`.
5. Upload enrollment audio via `POST /api/voice/enroll` and new login audio via `POST /api/voice/verify` as `multipart/form-data` under the exact field name **`audio`**.
6. Provide clear UI feedback for microphone access denied, empty recording, enrollment not approved, no enrolled reference, verification success/failure and service unavailable.
7. Display appropriate pages/buttons based on `GET /api/me`, but treat this as **presentation only**. Backend authorizes every operation regardless of what the UI shows.
8. Coordinate with Anas to create a minimal administrator interface for enrollment approval and voice replacement, if time permits. Do not put identity-proofing decisions in the browser.
9. Confirm the chosen browser produces an accepted format (typically WebM/Opus or WAV). **Do not implement 16-kHz resampling in JavaScript**: Anas's backend converts audio for Yousef's service.
10. Provide UI screenshots, user-flow description and walkthrough evidence for the report.

### Work Sara can do immediately

- Implement pages with a **mock `/api/me` response** and stub success/failure results for the two upload endpoints.
- Test browser recording with her own consenting test audio, even if the backend and model are not ready.

### Files owned / handed over

- `frontend/` HTML, CSS, JavaScript and UI assets.
- `docs/phase2/frontend-and-enrollment.md`: illustrated recording/enrollment/login flows and supported browser/audio format.

### Minimum tests and definition of done

- [ ] Microphone permission requested and denial handled cleanly.
- [ ] A recording can be started/stopped and uploaded using field `audio`.
- [ ] `/api/me` displays accurate states; verify button starts real upload when backend is available.
- [ ] Success/failure/error feedback is clear and no client-controlled `voice_verified` flag can grant access.
- [ ] Screenshots and recording/browser setup are documented.

**Hand-off to Anas:** endpoint calls, expected browser audio MIME, same-origin frontend files and UI error cases.  
**Hand-off to Yousef:** a few representative consented audio recordings **outside GitHub** and capture-format observations.  
**Help to others:** make a small admin recovery UI with Anas; help Hamzeh capture screenshots.  
**Main risk:** microphone permissions, browser-specific audio formats and recording uploads.

---

## 6. Member 3 — Yousef Taha (20230981)

### Role: Pretrained speaker-verification model and internal Voice API

**Goal:** Deliver a self-contained Python service capable of comparing two normalized WAV recordings and returning a repeatable similarity decision, without depending on Keycloak or a finished frontend.

### Implementation tasks, in order

1. Set up a reproducible Python virtual environment; install **SpeechBrain**, **PyTorch**, audio dependencies and a small FastAPI server.
2. Load the pretrained model **`speechbrain/spkrec-ecapa-voxceleb`**; record the model identifier and library versions.
3. Run an initial **standalone script** comparing two local WAV files: one pair from the same speaker and another from different speakers.
4. Validate the internal audio input format: **16-kHz, mono, 16-bit PCM WAV**. Reject empty/corrupted input and report service errors clearly.
5. Implement `POST /internal/voice/compare` accepting exactly the multipart file fields `reference_audio` and `attempt_audio`.
6. Extract or use embeddings and a similarity decision provided by SpeechBrain; return `matched`, numeric `score`, applied `threshold` and `model`. Example values are **illustrative**, not chosen defaults.
7. Select a preliminary **threshold based on sample results**; keep threshold configuration outside code when practical. Never claim a universal threshold or model accuracy from a couple of samples.
8. Help Hamzeh design separate data for threshold selection versus evaluation. Document number of speakers, test samples and any preprocessing decisions.
9. Test multiple different-speaker and same-speaker examples; record error cases and processing time. Evaluate replayed audio **without suggesting that basic speaker matching guarantees liveness**.
10. Restrict the API to local/backend-accessible networking; avoid logging full biometric recordings or sensitive file locations in normal responses.

### Work Yousef can do immediately

- Use two consented WAV samples and a simple Python script to confirm model download/inference and get a numeric comparison result.
- Build and test the internal FastAPI endpoint with curl or its generated `/docs`, entirely separately from Keycloak and the frontend.

### Files owned / handed over

- `voice-service/main.py`: internal HTTP route.
- `voice-service/speaker_verification.py`: model loading, comparison and threshold logic.
- `voice-service/requirements.txt` or an equivalent pinned environment file.
- `voice-service/README.md`: run/test commands, memory/CPU requirements, audio assumptions.
- `docs/phase2/voice-model.md`: ECAPA-TDNN, embeddings, threshold, observed performance and limits.

### Internal API hand-off (contract locked first)

`POST /internal/voice/compare` (`multipart/form-data`) receives:

- `reference_audio` — standardized WAV.
- `attempt_audio` — standardized WAV.

Returns `200` for a successful comparison:

```json
{"matched":true,"score":0.82,"threshold":0.70,"model":"speechbrain/spkrec-ecapa-voxceleb"}
```

**The sample numbers are not real results.** The Voice API doesn't receive usernames, roles, session IDs or passwords. **Anas** chooses the right reference and associates the result with the correct session.

### Minimum tests and definition of done

- [ ] Model loads and produces a comparison score using local audio.
- [ ] HTTP endpoint accepts both correct file fields and returns documented JSON.
- [ ] Input format errors do not return a fabricated successful match.
- [ ] Threshold and actual example results are documented.
- [ ] Voice service remains private/internal, and Yousef demonstrates it from a second local client or Anas's backend.

**Hand-off to Anas:** service base URL, exact multipart fields, JSON schema, timeout/error behavior, model identifier, normalization expectations.  
**Hand-off to Hamzeh:** model evaluation script/endpoint, threshold and measured results.  
**Help to others:** advise Sara/Anas on audio constraints and sample quality.  
**Main risk:** SpeechBrain/PyTorch installation, audio libraries, and interpreting similarity scores.

---

## 7. Member 4 — Anas Musa (20201119)

### Role: Main backend, identity/voice-session binding, RBAC, recovery

**Goal:** Build the component that ties together Keycloak and the Voice Service and **enforces every protected access decision on the server**.

### Implementation tasks, in order

1. Create the FastAPI main application and serve Sara's frontend under the same origin for the first demo.
2. Implement `GET /auth/login`, `GET /auth/callback` and `POST /auth/logout` using the proposed Keycloak **OIDC Authorization Code Flow** with appropriate callback `state` checking, token validation and safe session handling.
3. Implement a backend-managed session. Use a protected **HttpOnly** browser cookie and keep required auth/voice state on the server; avoid storing raw tokens in browser localStorage.
4. Parse the trusted Keycloak account ID (`sub`) and application role claims; coordinate role mapper configuration with Omar.
5. Implement `GET /api/me`, exposing only non-sensitive identity, role, enrollment and session voice-status fields.
6. Implement `POST /api/voice/enroll` for the **current authenticated account only** and only after valid, recorded, short-lived administrator approval.
7. Define storage for reference recordings or protected embeddings, keyed to Keycloak `sub`; restrict filesystem or database access. Agree on initial storage with the team (SQLite is optional, not mandatory).
8. Implement audio upload validation and conversion from browser-supported formats to **16-kHz mono PCM WAV** (FFmpeg or equivalent). A file extension alone is not sufficient validation.
9. Implement `POST /api/voice/verify`: retrieve the correct reference, normalize current attempt and call Yousef's `/internal/voice/compare` as a trusted internal request.
10. Store `voice_verified=true` **only after a genuine successful internal comparison**, associated with the correct authenticated user, current session and active enrollment version. Clear it after logout, new session, expiration or enrollment replacement.
11. Implement `/api/protected` (valid password session + voice pass) and `/api/admin` (those conditions + `administrator` role). Enforce access on **every HTTP request**, including direct curl calls.
12. Implement proposed admin approval and voice reset endpoints **only after** the team specifies identity-evidence steps; preserve roles/password policy and invalidate old voice references/session passes on reset.
13. Handle voice-service timeouts/outages with **fail-closed** logic. Add appropriate upload limits, attempt throttling and CSRF protection for state-changing browser routes.
14. Document the end-to-end flow and create the architecture diagram for Proposed Model.

### Work Anas can do immediately

- Create main routes with **mock OIDC user identity** and **mock voice comparison results** in development-only tests; build RBAC checks independently of the real model.
- Introduce a small service adapter so replacing the mock with Yousef's real HTTP endpoint doesn't require rewriting authorization logic.
- Build session/role tests with Hamzeh; later integrate Omar's real Keycloak settings.

### Files owned / handed over

- `backend/main.py`: main app/router.
- `backend/auth.py`: OIDC + session handling.
- `backend/authorization.py`: guard checks/RBAC.
- `backend/voice_client.py`: internal voice API adapter.
- `backend/recovery.py`: enrollment approval/reset logic.
- `backend/audio.py`: upload checks and conversion.
- `backend/README.md`: setup, environment variables, run commands.
- `docs/architecture.md` and `docs/phase2/backend-and-recovery.md`.

### Minimum tests and definition of done

- [ ] Protected access fails before voice step even after successful password login.
- [ ] Verified regular user is **denied** on `/api/admin`; verified administrator is allowed.
- [ ] Frontend-provided `matched=true`, forged role or target user ID cannot bypass checks.
- [ ] Voice pass belongs to the current login session and active enrollment only.
- [ ] Voice-service outage denies access and doesn't grant a pass.
- [ ] Recovery/replace is restricted to authorized, documented approval and invalidates old enrollment.
- [ ] OIDC and voice integrations work end-to-end with Omar's and Yousef's actual services.

**Hand-offs received:** Omar's Keycloak role/issuer/client settings; Sara's audio upload UI; Yousef's internal voice API.  
**Hand-off to Hamzeh:** real protected endpoints, test account setup instructions and expected error codes.  
**Help from team:** Sara builds minimal recovery UI; Omar helps OIDC; Hamzeh supplies direct-call and failure tests.  
**Main risk:** integration and session-binding logic; don't postpone an early end-to-end test.

---

## 8. Member 5 — Hamzeh Abu Jumaa (20230911)

### Role: Security testing, voice evaluation and simulation results

**Goal:** Produce credible, reproducible evidence of **what the working prototype actually does**, including its limitations and failures.

### Implementation tasks, in order

1. Write the test plan **before** integration. Map tests to the functional requirements in `PROJECT_REQUIREMENTS.md`.
2. Build Python **pytest** test files and curl scripts for endpoints and expected HTTP responses. Use local mocks first, then run the same tests against the integrated system.
3. Collect a small, **consented** local voice dataset; organize enrollment, threshold-selection and evaluation recordings separately. **Never commit raw recordings to GitHub**.
4. Coordinate with Yousef on same-speaker and different-speaker comparison experiments. Record similarity scores, threshold, sample count and timing.
5. Compute confusion-matrix counts and **FAR** (False Acceptance Rate), **FRR** (False Rejection Rate) if the test design supports them. Clearly explain denominators and limits; don't overgeneralize from a tiny dataset.
6. Test wrong password, missing voice step, nonmatching voice, malformed audio, invalid/expired session and service unavailability.
7. Test direct API bypass attempts: password-only `/api/protected`, verified `regular_user` `/api/admin`, forged client `voice_verified`, tampered user ID, and previous session's voice pass.
8. Test voice **replay** with an earlier recording from a consenting enrolled participant. If feasible, test imitation or synthetic speech separately. Record accept/reject outcomes honestly; speaker matching is not a liveness detector.
9. Test password reset and voice-replacement access policies with Anas and Omar. Verify denied attempts and invalidation of old enrollment.
10. Run **Nmap only on authorized local/demo systems** to document exposed lab services; use curl for HTTP checks.
11. Prepare numbered tables/figures/screenshots, compare results to a clearly defined baseline, analyze findings and limitations. Do not insert invented numbers or screenshots.
12. Assemble the **Simulation Results** section and obtain verification/sign-off from every component owner on the evidence attributed to their component.

### Work Hamzeh can do immediately

- Create a test-case matrix with Expected columns, leaving Observed blank.
- Prepare pytest scripts for **mock** voice and role outcomes, and a consented sample recording protocol.
- Draft the Simulation Setup structure with placeholders explicitly labeled as pending measurements.

### Files owned / handed over

- `tests/test_auth.py`, `tests/test_voice.py`, `tests/test_authorization.py`, `tests/test_recovery.py`.
- `tests/test_cases.md`, `tests/README.md`, safe test-data manifest (metadata only).
- `docs/phase2/simulation-results.md`: actual setup, numbered results, baseline, analysis, limits.

### Minimum tests and definition of done

- [ ] Test plan covers matching, nonmatching, replay, access roles, unauthorized recovery and failure cases.
- [ ] At least one observed end-to-end result per critical workflow is documented with environment and test data.
- [ ] Test output distinguishes **mock/development tests** from **real voice-model/integrated tests**.
- [ ] FAR/FRR, if reported, include counts and methodology; no assumed figures.
- [ ] Screenshots and tables are numbered and referenced in the written Phase 2 report.
- [ ] All participants consented; raw audio and secrets remain outside Git.

**Hand-offs received:** actual endpoints from Anas; model and threshold from Yousef; setup details from Omar; UI screenshots from Sara.  
**Hand-offs to all:** clear bug reports and reproducible failing test cases.  
**Main risk:** waiting too long to test, or confusing predicted/mocked outcomes with experimental evidence.

---

## 9. Shared contracts and dependency boundaries

**Do not make one developer wait for another's finished code.** Freeze the contract, use test fixtures/mocks, and integrate early.

| Interface | Producer | Consumer | Exact agreement |
|---|---|---|---|
| OIDC settings and role claims | Omar | Anas; Hamzeh for tests | Realm `voice-demo`; Client `voice-web`; roles `regular_user`, `administrator`; validated `sub` |
| Browser uploads and account status | Anas (API) | Sara (frontend); Hamzeh | `/api/me`, `/api/voice/enroll`, `/api/voice/verify`; form field `audio`; same-origin session cookie |
| Internal voice compare | Yousef | Anas; Hamzeh | `POST /internal/voice/compare`; fields `reference_audio`/`attempt_audio`; matched/score/threshold/model |
| Audio normalization | Anas | Yousef; Sara only for format confirmation | Browser WebM/WAV -> backend -> **16 kHz mono PCM WAV** |
| Enrollment and recovery approval | Anas | Omar, Sara, Hamzeh | Admin approval bound to trusted account; identity evidence required; no self-service bypass |
| Results and artifacts | All component owners | Hamzeh; report integration | Observed test result, environment/version, screenshots/logs, issues and limitations |

### Development mocks

- **Sara:** stub `/api/me` and `/api/voice/verify` results while building UI.
- **Yousef:** local WAV samples independent of frontend and Keycloak.
- **Anas:** mock identity/voice adapter in **development-only** mode; no way for live client to pass a `matched` flag.
- **Hamzeh:** test expected status codes on stubs, then rerun on real integrated system.
- **Omar:** test Keycloak independently; integration relies on shared OIDC settings, not a shared always-online developer laptop.

**Mocks must never remain active in the final security evaluation.** End-to-end results are not valid evidence if authentication or voice checks are simulated.

## 10. Phase 2 writing allocation

The instructor requires **Preliminary Knowledge (~400 words, >=4 references)**, **Proposed Model (1,500–2,000 words)** and **Simulation Results** with real setup/data, labeled evidence, analysis, comparison and limitations. Every student must contribute to each phase.

| Phase 2 section | Lead editor | Required contributions from others |
|---|---|---|
| Preliminary Knowledge (~400 words) | **Omar** | Sara: user interaction; Yousef: ECAPA-TDNN; Anas: OIDC/RBAC; Hamzeh: evaluation terms. Ensure >=4 cited references. |
| Proposed Model — goals and end-to-end architecture | **Anas** | Omar: Keycloak; Sara: enrollment UX; Yousef: voice model; Hamzeh: evaluation architecture. |
| Proposed Model — authentication/accounts | **Omar** | Anas confirms actual OIDC integration and roles. |
| Proposed Model — recording/enrollment | **Sara** | Anas confirms server-side approval and data mapping. |
| Proposed Model — speaker verification and parameters | **Yousef** | Hamzeh confirms threshold/test evidence. |
| Proposed Model — protected backend, RBAC and recovery | **Anas** | Omar and Sara provide configured/admin UI details. |
| Simulation Setup/Results/Analysis | **Hamzeh** | All members submit actual tests, environment settings, screenshots, observed outcomes and limitations. |
| Final consistency/style/reference review | **All five** | One editor merges sections, each member validates their technical claims and participation. |

**Report rule:** document which technologies/settings were **planned** and which were **actually implemented**. Never invent simulation results or claim replay/deepfake protection unsupported by experiments.

## 11. Day-by-day coordination plan (23–30 Nov 2026)

| Date | Everyone's goal | Checkpoint |
|---|---|---|
| **23 Nov** | Create private repo; add `PROJECT_REQUIREMENTS.md`, `TEAM_RESPONSIBILITIES.md`, `contracts/api.md`; confirm roles/recording/API formats. | Everyone has own branch and knows their interface. |
| **24–25 Nov** | Omar: Keycloak; Sara: UI/recorder; Yousef: standalone model and API; Anas: backend mocks; Hamzeh: test scripts/data plan. | Each member demonstrates one working local component. |
| **26 Nov** | First integration: real Keycloak OIDC -> backend; browser -> backend recording; backend -> voice API. | First end-to-end **password + voice** path attempted. |
| **27 Nov** | Fix integration, session binding, role checks; build minimal recovery approval. | Password-only bypass blocked; role checks tested. |
| **28 Nov** | Real voice/mismatch/replay/access/recovery tests; capture evidence. | Actual result tables and screenshots available. |
| **29 Nov** | Integrate Proposed Model and Simulation Results; verify numbers and cited references. | Full draft reviewed by all five. |
| **30 Nov** | Final technical check and instructor submission. | Submitted package matches actual prototype. |

This is an **aggressive target schedule** for a minimum educational prototype. If blocked, reduce UI polish or optional experiments before compromising core session/authorization safety or fabricating results.

## 12. Shared definition of done

A component is ready for merge when its owner has:

1. Implemented the agreed interface or configuration and pushed a feature branch.
2. Supplied steps for another member to run it locally and recorded dependencies/versions.
3. Demonstrated both a successful case and an error/denial case (when applicable).
4. Added or contributed tests and noted known limitations.
5. Included no secrets, user voice data or personal identifiers inside committed test fixtures.
6. Updated any shared contract change **before** opening the integrating PR.
7. Requested at least one teammate's PR review and resolved blocking feedback.

**System acceptance:** At a minimum, the team must demonstrate that valid password alone does not open a protected route; a current-session voice comparison is performed; Regular User is denied administrator access; and evaluation reports both successes and failures honestly.

## 13. Team risks and mitigation owners

| Risk | Lead response | Mitigation |
|---|---|---|
| SpeechBrain install / inference delay | Yousef, Hamzeh | Test pretrained model with two WAV files immediately; pin environment; preserve logs. |
| OIDC role / redirect mismatch | Omar, Anas | Agree client details on day 1; validate claim/issuer/audience handling. |
| WebM audio incompatible with model | Sara, Anas, Yousef | Backend conversion to 16-kHz mono WAV; use known WAV for early model tests. |
| Login session can bypass voice check | Anas, Hamzeh | Centralized authorization dependency; negative API tests; session-bound voice state. |
| Voice replay accepted | Yousef, Hamzeh | Run replay experiment; report as limitation; don't promise liveness. |
| Uncontrolled voice enrollment/recovery | Anas, Omar | Define/admin-approve identity evidence; deny unapproved changes; audit decision. |
| Phase 2 missing actual results | Hamzeh, all | Run integration tests by 28 Nov and collect evidence throughout development. |
| Git conflicts and last-minute merging | All | Keep folders separate, early PRs, frozen API fields, one integration owner (Anas). |

## 14. Immediate actions for each student (today)

- **Omar (20230186):** Launch Keycloak in Docker, create `voice-demo` and two role-bearing test accounts; share OIDC settings.
- **Sara (20230493):** Record audio in the browser, confirm its actual MIME type, and implement mocked `/api/me` and voice upload UI.
- **Yousef (20230981):** Load `speechbrain/spkrec-ecapa-voxceleb` and compare two local WAV files; return a score from a script.
- **Anas (20201119):** Scaffold FastAPI routes, session/role guards and a mock voice-client adapter; publish exact accepted JSON shapes.
- **Hamzeh (20230911):** Write Expected vs Observed test matrix, prepare pytest skeleton and consenting sample-collection instructions.

**Sources and authority:** `Phase1_Group1_Voice_Verification.pdf` defines the updated password + experimental voice + RBAC + recovery project; `Phase 2 - Updated (1).docx` defines report deliverables and deadline. The stack, API names, member assignment, schedule and implementation decisions in this document are the team's **proposed plan**, based on the previous shared integration contract and the roster supplied on 23 November 2026.
