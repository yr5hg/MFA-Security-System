Yousef Taha
yr5hg
Idle
﻿
Anas — 6:28 PM
Apply the Kali flexible 2FA redesign
This update was prepared against main commit 923d3fe5203586a7e322bf42b82b277cd4b8f8d1 of yr5hg/Voice-Verification-Security-System (25 November 2026). GitHub read succeeded, but the write integration returned HTTP 403 when creating a branch. Nothing was changed remotely. The old feature branches feature/protected-backend and feature/speaker-verification were not modified. Review before merging.

Apply in Windows PowerShell (Git installed)

MIGRATION (1).md
4 KB
Expected vs observed test matrix (not yet executed)
ID	Case	Expected	Observed
T-01	TOTP path: correct password, fresh TOTP, allowed role, no voice	Allow	Pending
T-02	Incorrect password	No accepted Keycloak login	Pending

test_cases.md
5 KB
Kali Linux setup and first milestone
Proposed steps; not tested on your team's hardware. Confirm instructor permission for external tools, the voice-only Python exception, shell scripts and model download before installing. The standard Kali security tool catalogue does not supply the entire proposed MFA system.

1. Lab setup (all members)

KALI_SETUP.md
3 KB
Proposed architecture — Kali lab, password + choice of TOTP or voice
Status: design, not tested. Python restricted to SpeechBrain library and local voice comparison adapter. Keycloak and SpeechBrain are external tools; confirm instructor approval.

sequenceDiagram

architecture.md
3 KB
# Detailed Team Responsibilities — Kali Flexible Two-Factor Authentication

**Draft v0.4 | 25 November 2026 | Phase 2 deadline: 30 November 2026**

## 1. Team distribution

TEAM_RESPONSIBILITIES (2).md
20 KB
# Shared Integration Contract — Kali Flexible Two-Factor Authentication (Draft v0.4)

25 November 2026. The old FastAPI and HTTP voice-service contract is retired. This filename is retained to preserve existing links. These are proposed interfaces, not tested functionality. All computer-side project components run on Kali; Python is permitted exclusively for SpeechBrain voice inference and its minimal local comparison adapter.

## 1. Trust boundary

api.md
10 KB
# Project Requirements — Password with TOTP or Voice Verification on Kali Linux

**Version:** Draft v0.4 (revised 25 November 2026)  
**Phase:** Information Systems Security — Phase 2, due **30 November 2026** (original repository deadline)  
**Status:** Proposed requirements, not evidence of implementation.  
**Companions:** `TEAM_RESPONSIBILITIES.md`, `contracts/api.md`, `docs/KALI_SETUP.md`.

PROJECT_REQUIREMENTS (1).md
21 KB
# Voice Verification Security System — Flexible Two-Factor Authentication on Kali Linux

Information Systems Security, Phase 2 — revised plan v0.4, 25 November 2026. Original deadline: 30 November 2026.

Every login requires a password and **one second factor chosen by the user: TOTP (Google Authenticator) OR experimental voice speaker verification**. Both methods are supported, but only two factors are required per login. This is flexible 2FA, not mandatory 3FA. Keycloak handles passwords and TOTP; SpeechBrain handles voice. A trusted local gate enforces the chosen path and RBAC before releasing a protected lab resource.

README.md
5 KB
﻿
# Shared Integration Contract — Kali Flexible Two-Factor Authentication (Draft v0.4)

25 November 2026. The old FastAPI and HTTP voice-service contract is retired. This filename is retained to preserve existing links. These are proposed interfaces, not tested functionality. All computer-side project components run on Kali; Python is permitted exclusively for SpeechBrain voice inference and its minimal local comparison adapter.

## 1. Trust boundary

Unprivileged demo terminal -> restricted trusted gate -> selected Keycloak device login -> TOTP path (password + OTP) OR voice path (password then gate-owned recording and local SpeechBrain) -> gate-owned protected operation. The separate service identity owns configuration, credentials, state, model, reference and resource. Ordinary demo users cannot modify them, run arbitrary privileged commands or directly access the resource. No public voice API, token injection or caller-supplied match flag.

## 2. Identity handoff (Omar -> Anas)

| Field | Agreement |
|---|---|
| Issuer | Fixed TLS realm `voice-demo`, verified lab certificate |
| TOTP client | `voice-terminal-totp`; dedicated required password + OTP browser flow |
| Voice client | `voice-terminal-voice`; dedicated required password browser flow, external voice still pending |
| Flow | Separate confidential OAuth 2.0 Device Authorization Grant clients; test per-client browser overrides on pinned release |
| Roles | Consistent application roles `regular_user`, `administrator`; proposed realm roles explicitly mapped and scoped for both clients |
| Identity | Validated issuer + `sub`, identical account across clients; no caller ID |
| Token | Active, unexpired, correct issuer, expected client (e.g. `client_id` or verified `azp`), audience, subject and trusted roles; exact observed schema agreed before coding |
| Secrets | Separate restricted client-secret files; no Git or command-line leakage |

Gate freezes choice (`totp` or `voice`) before requesting a device code from the matching confidential client. It polls according to server interval and expiry, handles pending/slow-down/denied/expired/error. Accept only the token returned from that attempt; never pasted tokens. Disable other grants, SSO cookie shortcuts and alternate authenticators. Keycloak browser owns credentials; gate never collects passwords/OTP. A password-only voice token cannot satisfy TOTP. Active token alone is not proof of OTP: required browser flow, client separation, and observed negative tests are prerequisites. Verify client-specific overrides really apply to device authorization; if not, block integration until a supported non-Python design is agreed.

## 3. Recording contract (Sara -> Anas/Yousef)

| Property | Proposed requirement |
|---|---|
| Source | Gate-controlled ALSA microphone; no arbitrary user file in real verification |
| Container/codec | WAV, PCM signed 16-bit little endian |
| Rate / channels | 16,000 Hz / mono |
| Length | 3–10 seconds (default 5) |
| Max size | 10 MiB; bound recording time before processing |
| Ownership | Gate-owned temporary directory; unique filenames, no symlinks, permissions 0700/0600 |
| Errors | Device unavailable, empty/silent/invalid/oversize file or conversion failure => deny/no match |

Use arecord/FFmpeg and ffprobe; do not assume conversion exit code validates duration or content. Gate selects enrolled reference from protected subject mapping and passes both exact validated files. Delete temporary attempts when no longer needed; enrollment data retained only per policy.

## 4. Model contract (Yousef -> Anas)

Use SpeechBrain's pretrained `speechbrain/spkrec-ecapa-voxceleb` via `SpeakerRecognition`. Reuse or adapt Yousef's existing local comparison script, not the old HTTP voice service. The following is the **proposed project CLI** (not an upstream SpeechBrain command); Yousef must implement or align it with the existing script and test it on Kali:

```bash
VOICE_MODEL="$VOICE_MODEL" VOICE_MODEL_DIR="$VOICE_MODEL_DIR" \
  "$VOICE_PYTHON" "$VOICE_CLI" compare "$reference" "$attempt" --threshold "$VOICE_SIMILARITY_THRESHOLD"
```

The pinned implementation must return a cosine similarity score (higher means more similar). Confirm score direction against source and observed genuine/impostor samples. Use a single explicit rule, proposed `score > threshold`, with a finite calibrated threshold; do not silently use a library default. No approved threshold until calibration.

The voice-only adapter receives trusted normalized files and gate-owned model settings, emits exactly one JSON object to stdout, and sends diagnostics to stderr. No HTTP server, authentication logic, sessions or role handling in Python.

```json
{"matched":false,"score":0.12,"threshold":0.30,"model":"speechbrain/spkrec-ecapa-voxceleb","status":"ok"}
```

Illustrative values only. Zero exit status means comparison completed, not that the speaker matched. The Bash gate checks process status, strict JSON shape, finite numeric score and threshold in [-1,1], expected model, equality to configured threshold and consistency of the verdict with the agreed rule. Timeout, malformed output, failure, missing threshold or inconsistent fields deny access. Model revision and local cache are pinned in gate-owned configuration. Log restricted similarity metadata only for consented evaluation. No caller-supplied results or arbitrary paths.

## 5. Gate actions and outcomes (Anas -> Sara/Hamzeh)

Allowlisted operations: `verify-and-view`, `verify-and-admin`, `enroll-own`, and admin enrollment/recovery actions. Logical names only. The gate prompts for `totp` or `voice` before login; admin approval and enrollment operations require the TOTP path. No arbitrary commands or user-chosen reference paths.

| State | Outcome |
|---|---|
| Invalid/missing token or wrong expected client | Deny |
| TOTP path, token from proven required password+OTP flow, authorized role | Allow defined resource action; no voice required |
| Voice path, password token but no current trusted voice pass | Deny protected operation |
| Voice path, valid token, current subject's fresh match and active enrollment, allowed role | Allow defined resource action |
| Either completed path, regular user requests admin operation | Deny |
| Either completed path, administrator role | Allow defined ordinary admin resource operation |
| TOTP path + appropriate approval/identity evidence | Allow defined enrollment/recovery action only |
| Any selected factor fails, invalid role, expiry or malformed result | Deny; never silently switch |

Attempt state: unique gate-generated ID, immutable selected method, expected client, issuer+subject, active token context, action, created/expiry timestamp, retry count, and voice-only enrollment version and trusted verdict. Gate derives TOTP success only from its proven dedicated flow, not user input. Revalidate token/role/client and method-specific state immediately before dispatch; lock/recheck voice enrollment version. Clear all state on completion, cancellation, logout, timeout, interruption or revocation. Changing methods cancels the old attempt and starts fresh password authentication. Account-level throttling across both paths; proposed max three voice attempts and five-minute overall expiry. Local outcomes: `AUTH_DENIED`, `METHOD_INVALID`, `VOICE_REQUIRED`, `VOICE_MISMATCH`, `ROLE_DENIED`, `ENROLLMENT_REQUIRED`, `ERROR`, `ALLOWED`. Not HTTP statuses; a printed message is not an access grant.

## 6. Recovery and storage

Approvals are account-specific, action-specific, expiring, single-use and created by administrator authenticated through password+TOTP after supervised identity evidence. Enrollment/replacement never directly creates a voice-pass. First administrator bootstrap is documented, supervised and offline; no public bypass. Replacement increments version, invalidates old reference/attempts and forces new enrollment; password/TOTP reset uses Keycloak and revokes sessions. Use protected files/atomic operations/locking or approved local storage; retention and audit details agreed before use. Audit includes pseudonymous actor/target, time, action and outcome only.

## 7. Freeze and acceptance checklist

- Omar: actual device-flow behavior, both dedicated clients, enforced password on both and OTP on TOTP path, introspection schema and role test evidence.
- Sara: audio format and recording/error behavior demonstrated on Kali.
- Yousef: version and model checksum, verified score output and parser, frozen threshold.
- Anas: actual restricted resource, safe launch permissions and gate validation/error/cleanup.
- Hamzeh: test exact boundary, bypasses, token/role/voice failures and actual replay outcomes.

Until all are demonstrated, this contract remains proposed. If external tools/shell are not permitted, escalate scope rather than implementing an unsupported claim.

References: [Keycloak OIDC](https://www.keycloak.org/securing-apps/oidc-layers), [Keycloak admin guide](https://www.keycloak.org/docs/latest/server_admin/), [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628), [SpeechBrain speaker API](https://speechbrain.readthedocs.io/en/latest/API/speechbrain.inference.speaker.html), [ECAPA-TDNN model](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb).
api.md
10 KB
