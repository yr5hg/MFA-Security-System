# Voice Verification Project — Shared Integration Contract (Draft v0.1)

**Date:** 23 November 2026  
**Status:** Proposed team agreement; not evidence of implemented features.  
**Put this file in:** `contracts/api.md` in the team's private GitHub repository.  
**Scope:** Three decisions to freeze before parallel development: (1) API endpoints and response shapes, (2) audio format and preprocessing, (3) exact Keycloak role names and access rules.

> **Project basis:** Phase 1 describes Keycloak username/password login, a separate Python SpeechBrain ECAPA-TDNN speaker verification service, server-side binding of the voice result to the authenticated user/session, RBAC, controlled voice enrollment/recovery, and tests involving replayed recordings. The URLs, names, formats, endpoints, and limits below are **proposed implementation choices** to agree on; they are not already fixed by Phase 1.

## 1. Architecture and team ownership

| Component | Owner | Responsibility | Development URL (example) |
|---|---|---|---|
| Keycloak | Member 1 | Password login, users, client roles, OIDC settings | `http://localhost:8080` |
| Frontend | Member 2 | Browser pages, microphone recording, upload to main backend | Served by main backend |
| Voice service | Member 3 | SpeechBrain comparison and similarity threshold | `http://127.0.0.1:8001` |
| Main backend | Member 4 | OIDC integration, sessions, server-side voice state, RBAC, recovery | `http://localhost:8000` |
| Testing | Member 5 | API contract tests, test recordings, security evaluation | Local test runner |

**Integration rule:** Browser -> Main Backend -> Internal Voice Service. The browser can be redirected to Keycloak for password login, but must **not** call the internal Voice Service or Keycloak administration APIs directly. Use a same-origin frontend and backend for the first prototype.

### Recommended authentication choice

- Backend uses **OIDC Authorization Code Flow** with Keycloak (`realm=voice-demo`, `client_id=voice-web` as proposed names).
- Backend maintains an **HttpOnly session cookie** and stores necessary authentication/voice state on the server. Keycloak's token(s) stay on the backend; do not place them in localStorage.
- The authenticated user's identity comes from the validated OIDC subject (`sub`), **never** a user ID or role supplied by the frontend.
- Successful **password login does not grant access to `/api/protected`**. The server must also have a passing voice verification result for the **same active session**.
- Protect state-changing requests against CSRF. Use HTTPS outside the local demonstration environment.

## 2. Main backend API contract (Member 4, consumed by Member 2 and Member 5)

**Base URL:** `http://localhost:8000` (local development only)  
**Authenticated browser requests:** use the session cookie; `fetch` should use same-origin requests.

| Method | Path | Input | Success | Access |
|---|---|---|---|---|
| `GET` | `/auth/login` | None | `302` redirect to Keycloak | Public |
| `GET` | `/auth/callback` | OIDC `code`, `state` | `302` redirect to app after validation | OIDC callback |
| `POST` | `/auth/logout` | CSRF-protected request | `204` | Logged in |
| `GET` | `/api/me` | None | `200` user/role/voice status JSON | Password-authenticated |
| `POST` | `/api/voice/enroll` | `multipart/form-data`: `audio` | `201` enrollment JSON | Logged in + active admin enrollment approval |
| `POST` | `/api/voice/verify` | `multipart/form-data`: `audio` | `200` verification JSON | Password-authenticated + already enrolled |
| `GET` | `/api/protected` | None | `200` protected JSON | Password + session-bound voice pass; regular or admin |
| `GET` | `/api/admin` | None | `200` admin JSON | Password + session-bound voice pass + administrator role |
| `POST` | `/api/admin/users/{user_id}/approve-enrollment` | JSON `{"reason":"initial"}` | `200` approval JSON | Verified administrator, identity check required |
| `POST` | `/api/admin/users/{user_id}/reset-voice` | JSON `{"reason":"recovery"}` | `200` reset JSON | Verified administrator, recovery evidence required |
| `GET` | `/health` | None | `200` minimal health response | Local tests; no secrets |

**Note:** The two administrator enrollment/recovery routes are proposed for this draft. The exact identity-evidence policy is *not yet specified in Phase 1* and must be agreed before implementing either route. For the first demo, approval can be restricted to a supervised test process and recorded in an audit log. A one-time manual bootstrap for the first demo administrator may be necessary; document it instead of creating a public bypass endpoint.

### A. Example: `GET /api/me`

Response `200` after password authentication (voice still pending):

```json
{
  "user_id": "keycloak-sub-123",
  "username": "test_user",
  "roles": ["regular_user"],
  "voice_enrolled": true,
  "voice_verified": false
}
```

- `roles` come from **validated server-side Keycloak role data**, not browser input.
- `voice_verified` means successful verification **for the current session**, not that this account passed at some point in the past.
- For someone without a valid session: `401` with the standard error envelope.

### B. Example: `POST /api/voice/verify`

Request:

```http
POST /api/voice/verify
Content-Type: multipart/form-data

(audio file field named 'audio')
```

Response `200` for a processed matching attempt:

```json
{
  "voice_verified": true,
  "message": "Voice verification succeeded"
}
```

Response `200` for a processed nonmatching attempt:

```json
{
  "voice_verified": false,
  "message": "Voice verification failed"
}
```

A failed comparison is **not** a network/server error: the API processed the attempt successfully but did not verify the speaker. Do not return the detailed numeric score to the browser; retain it in **restricted evaluation logs** for Member 5. Repeated attempts must be rate-limited in the real prototype. A prior passing result must be cleared when starting a new login session, after logout, or after voice reset.

### C. Example: `POST /api/voice/enroll`

Request is a single multipart field named `audio`, under a valid logged-in user session **and** server-side administrator approval for that user. The frontend does not send a target `user_id`.

Response `201`:

```json
{
  "voice_enrolled": true,
  "message": "Voice enrollment completed"
}
```

Backend stores the reference audio (or derived speaker representation) with **restricted access**, associated with the Keycloak `sub` and a versioned enrollment record. Any replacement invalidates old enrollment and any previous passing session voice status. **Never commit biometric recordings or embeddings to GitHub.**

### D. Example: protected resources

`GET /api/protected` returns `200` only after password authentication **and** matching voice for the current session. Both `regular_user` and `administrator` can access it.

`GET /api/admin` returns `200` only if the above are true **and** the account has `administrator` role.

### E. Standard error format

Use the same envelope for error responses:

```json
{
  "error": {
    "code": "VOICE_NOT_ENROLLED",
    "message": "Voice enrollment is required before verification."
  }
}
```

| HTTP status | Situation |
|---|---|
| `400` | Invalid request / corrupt recording |
| `401` | No valid authenticated session |
| `403` | User authenticated but lacks voice verification or sufficient role, or lacks enrollment approval |
| `409` | Wrong workflow state (e.g. no enrolled reference voice) |
| `413` | Recording exceeds size limit |
| `415` | Unsupported uploaded audio type |
| `429` | Too many verification attempts |
| `503` | Internal Voice Service unavailable (deny access; do not bypass voice) |

## 3. Internal Voice API contract (Member 3, called **only** by Member 4)

**Base URL:** `http://127.0.0.1:8001` on the integration machine.  
**Only endpoint required for first prototype:** `POST /internal/voice/compare`.

Input: `multipart/form-data` with **exactly these two audio file fields**:

- `reference_audio`: enrolled voice recording in standardized WAV format.
- `attempt_audio`: latest recording in standardized WAV format.

Successful response (`200`):

```json
{
  "matched": true,
  "score": 0.82,
  "threshold": 0.70,
  "model": "speechbrain/spkrec-ecapa-voxceleb"
}
```

**Important:** Example `score` and `threshold` are illustrative only. Member 3 must establish the actual threshold experimentally. `score` is a model similarity value, not an identity guarantee or a percentage of certainty.

The Voice Service does **not** need Keycloak credentials, account IDs, role names, or browser session IDs. Member 4 chooses the reference file for the authenticated user and binds the result to that session **on the backend**.

If processing fails, return a non-`200` error with the standard error envelope; Member 4 should fail closed and never set `voice_verified = true`.

**Network restriction:** listen on loopback for the local demo, or isolate this service on a private Docker network. Never expose it publicly as an unauthenticated endpoint.

## 4. Audio format contract (Members 2, 3, 4, and 5)

### Browser -> Main backend

The browser records microphone audio using the browser's supported `MediaRecorder` format. To avoid browser incompatibilities, the main backend **accepts**:

- `audio/webm` (often Opus): primary expected Chrome/Edge format when available; **or**
- `audio/wav` / `audio/x-wav` (WAV): allowed for test files or supported recorders.

Use multipart field name **`audio`** at both `/api/voice/enroll` and `/api/voice/verify`. **Do not make Member 2 implement custom WAV/16-kHz encoding** unless browser support makes it necessary.

### Main backend -> Voice service (strict internal standard)

| Parameter | Agreed provisional value |
|---|---|
| Container / extension | `.wav` |
| Audio codec | PCM signed 16-bit (PCM S16LE) |
| Sample rate | **16,000 Hz (16 kHz)** |
| Channels | **1 (mono)** |
| Duration | **3–10 seconds** per recording (team-chosen demo rule) |
| Max uploaded file size | **10 MB** (team-chosen safety limit) |
| Multipart field names | `reference_audio`, `attempt_audio` |
| Model | `speechbrain/spkrec-ecapa-voxceleb` |

Member 4 normalizes uploads to 16-kHz mono PCM WAV (for example using FFmpeg) before passing them to Member 3. Member 3 validates the internal audio contract and rejects bad files. Member 5 uses the same standardized input when preparing reproducible tests.

Suggested local conversion command for testing:

```bash
ffmpeg -i input.webm -ac 1 -ar 16000 -c:a pcm_s16le output.wav
```

**Why 16 kHz?** It matches the sample-rate expectation of the selected SpeechBrain model. **Why 3–10 seconds?** This is a pragmatic *starting rule for the classroom prototype*, not a published accuracy guarantee. Record in a quiet room; use consenting test speakers. Preprocessing and silence handling should be consistent across enrollment and verification.

**Replay limitation:** A newly uploaded file or microphone capture is not proof of live speech. Member 5 must include a replayed recording test, and the report must state observed vulnerabilities instead of claiming that speaker matching provides liveness detection.

## 5. Exact Keycloak roles and permissions (Members 1 and 4)

**Proposed Realm:** `voice-demo`  
**Proposed OIDC Client ID:** `voice-web`  
**Define these as application-specific Keycloak *client roles* on `voice-web`:**

- `regular_user` (exact lowercase string)
- `administrator` (exact lowercase string)

These roles are **not** Keycloak console administration rights (`realm-admin`). Keep the names and case exactly the same in Keycloak, backend code, tests, and documentation. Assign demo users one of these roles; `administrator` implicitly has access to the normal protected area under the application policy.

| Operation | Unauthenticated | `regular_user` | `administrator` |
|---|---|---|---|
| Open login page | Allow | Allow | Allow |
| `/api/me` after password login | Deny | Allow | Allow |
| Submit voice verification after password login | Deny | Allow if enrolled | Allow if enrolled |
| `/api/protected` | Deny | Allow after voice pass | Allow after voice pass |
| `/api/admin` | Deny | Deny | Allow after voice pass |
| Approve enrollment / reset voice | Deny | Deny | Allow after voice pass + documented identity check |

**Role transfer agreement:** Member 1 ensures client roles are available to the backend through a properly validated Keycloak OIDC token/role mapper or equivalent trusted server-side lookup. Member 4 checks the roles server-side on **every protected request**. Do not trust a browser `role` field or a hidden button as authorization.

### Proposed developer-only account names

| Username | Client role |
|---|---|
| `test_user` | `regular_user` |
| `test_admin` | `administrator` |

Use dummy passwords; never place them in git. Keycloak itself owns user credentials.

## 6. Parallel handoff checklist

| Member | Can start immediately with | Must hand off |
|---|---|---|
| 1 — Keycloak | Docker, realm, client and test users | Realm/client names, roles, redirect URI and exportable non-secret config |
| 2 — Frontend | Static pages and mocked `/api/me`, `/api/voice/verify` | Multipart `audio` upload, page states and recording behavior |
| 3 — Voice AI | Two local standardized WAV files | Working `POST /internal/voice/compare`, threshold config and sample outputs |
| 4 — Backend | Mock role data and mocked Voice API response | Real routes, server-side session binding, integration, recovery flow |
| 5 — Testing | Contract and volunteer voice samples | Positive/negative tests, replay findings, real screenshots and result tables |

### Minimum integration acceptance tests

1. Wrong Keycloak password -> no usable authenticated session.
2. Correct password but voice not verified -> `/api/protected` and `/api/admin` denied.
3. `regular_user` with matching voice -> `/api/protected` allowed; `/api/admin` denied.
4. `administrator` with matching voice -> both resources allowed.
5. Nonmatching voice -> protected endpoints denied.
6. Voice Service unavailable -> access denied, never automatically granted.
7. New login session, logout, or voice replacement -> no reuse of old voice-pass state.
8. Enrollment without administrator approval -> denied.
9. Replay recording -> run experiment and **record observed outcome**; do not assume it will fail.
10. Password reset -> role and voice enrollment remain intact; unauthorized voice replacement is denied.

### Decisions still open (resolve before final implementation)

- Final threshold and validation procedure (Member 3 + Member 5).
- Exact identity evidence and approval procedure for initial enrollment / voice replacement (Member 4 + team).
- Actual Keycloak and SpeechBrain versions, model revision, and audio/test environment for the Phase 2 report.
- Where to store sensitive reference audio and session state (recommended: access-restricted local storage + a small server-side database for the demo).
- Whether the administrator bootstrap requires a supervised local initialization process.

**Security and scope note:** This is an *academic voice verification experiment*. A similarity score does not prove live presence; replay/deepfake resistance is not implied. The Phase 1 report explicitly does not claim NIST-compliant voice biometric authentication or production readiness.

## Official technical references

- Keycloak OIDC: https://www.keycloak.org/securing-apps/oidc-layers
- Keycloak administration: https://www.keycloak.org/docs/latest/server_admin/
- FastAPI uploads: https://fastapi.tiangolo.com/tutorial/request-files/
- SpeechBrain pretrained ECAPA-TDNN: https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb
