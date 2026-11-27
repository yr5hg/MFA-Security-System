# Integration contract

**Proposed revision 0.6 · 25 November 2026 · Phase 2**

This document defines the minimum integration agreement for the team's Kali Linux demonstration. It is a plan, not evidence that the endpoints are implemented or tested. The browser, Keycloak, Node.js gate and private Human verifier are intended to run in the Kali lab. No Python or external face-verification API is required.

**Current Kali lab status (Omar):** The realm already created in Keycloak is `multi-factor-authentication`; its current development URL is `http://127.0.0.1:8080/realms/multi-factor-authentication`. The HTTPS issuer below is the **planned integration endpoint** and is not confirmed live. Anas must implement and test the callback routes before the team can claim they work.

## 1. Components and access rules

| **Item** | **Agreement** |
|---|---|
| Application | `https://gate.test:8444` — browser UI, backend gate and protected routes on one origin. |
| Keycloak | `https://id.test:8443/realms/multi-factor-authentication` — local lab identity provider with trusted HTTPS. |
| Clients | `gate-totp` and `gate-face`, confidential clients with separate callback URLs and protected secrets. |
| Resource audience | Keep `lab-resource` as the protected-operation audience label; this does not create another running service. |
| Identity | Verified Keycloak issuer (`iss`) and account ID (`sub`); never trust a username sent by the browser. |
| Roles | `regular_user` and `administrator`; the gate checks the authorized role for every operation. |
| Login methods | Fresh password + TOTP, **or** fresh password + server-verified face. Exactly one second factor per login. |
| Protected actions | `view` for permitted users, `admin` for administrators; enrollment and approval are separate sensitive actions. |

The protected lab resource is owned by the gate; `lab-resource` is an audience label, **not a separate server**. The ID token must have the selected Keycloak client as its audience. For access-token introspection, configure the access token to include both `lab-resource` and the selected client as audiences, and use that same client to perform introspection. No third client is needed.

## 2. Browser-to-gate interfaces

| **Interface** | **Input** | **Required behavior** |
|---|---|---|
| `POST /attempts` | `method` (`totp` or `face`) and `action` | Create a new short-lived attempt, cancel any previous attempt, and redirect to the matching Keycloak login. |
| `GET /oidc/totp/callback` | Keycloak authorization response | Check session and `state`, exchange code, validate signed identity and required password + OTP evidence. |
| `GET /oidc/face/callback` | Keycloak authorization response | Check session and `state`, exchange code, validate signed password evidence; face verification remains pending. |
| `GET /attempts/current` | Session cookie | Return only safe progress and next-step information; issue a one-use camera challenge when needed. |
| `POST /face/verify` | JPEG, challenge, session and CSRF token | Verify exactly one face through the private worker and mark this attempt as face-verified only on a valid match. |
| `POST /factor/approvals` | Target account and `enroll` or `replace` | Administrator using fresh password + TOTP records a short-lived approval for that account. |
| `POST /face/enroll` | JPEG, owner session, consent and challenge | Owner using fresh password + TOTP and an unused matching administrator approval saves or replaces their reference. |
| `POST /operations/execute` | Session and CSRF token | Check the completed selected factor and required role, execute only the action saved in the attempt, then consume it. |
| `POST /attempts/cancel` / `POST /logout` | Session and CSRF token | Cancel the attempt; logout also clears the local session and initiates Keycloak logout. |

Only the gate selects the user, action, reference and authorization result. The browser may request an action, but cannot supply an accepted face-match flag, a role or a reference path.

## 3. Keycloak agreement · Omar and Anas

1. Use the **Authorization Code** login flow with PKCE S256, a random `state` and `nonce`, fixed redirect URIs, `prompt=login` and `max_age=0`. Use an established OpenID Connect library; do not write token-signature verification manually.
2. Configure a separate browser flow for each client. Both flows must execute the password form; only `gate-totp` additionally executes the OTP form. Prevent existing SSO sessions and alternative authenticators from skipping these checks.
3. Configure the Keycloak **AMR** mapper so the signed ID token reports the actual executed methods: `pwd` and `otp` for TOTP, and `pwd` for face. Never add these values as fixed claims regardless of what ran.
4. At the callback verify signature, issuer, selected client audience, nonce, subject, expiry and fresh authentication time. Reject absent or incorrect factor evidence. Also map and verify the user's application role.
5. Before a protected effect, use the selected confidential client to check the access token's active state through Keycloak introspection. Confirm the same subject and expected client. Require the selected client and `lab-resource` in the access-token audience; do not disable audience checking to make an error disappear.
6. Enroll TOTP under supervised lab setup. Check valid, missing and wrong codes, existing-session bypass, disabled users and role restrictions. No password-only path may release the protected resource.

Keycloak handles passwords and TOTP; the gate does not receive either one. Store client credentials outside Git. If the required AMR evidence or introspection configuration cannot be demonstrated on the pinned Keycloak version, **keep the affected route disabled**, record the blocker and do not claim complete integration.

## 4. Camera and private face verifier · Sara and Yousef

| **Step** | **Agreement** |
|---|---|
| Camera | Browser asks permission, previews the face, captures one JPEG, and stops the webcam on completion, cancellation or error. |
| Input | Maximum **1 MiB** per JPEG. Validate type, byte size and decoded image dimensions on the server. |
| Detection | Human must detect **exactly one** usable face. Configure the detector to allow identifying at least two faces so multiple-face input can be rejected. |
| Reference | Keep one active, versioned facial descriptor per verified Keycloak account, stored privately on Kali. |
| Comparison | Private Node.js Human code extracts the probe descriptor and compares it **1:1** against that account's reference with `human.match.similarity`. |
| Decision | A finite calibrated similarity score must meet the gate's configured threshold. Missing models, invalid score, missing reference or timeout means **deny**. |

The browser never decides whether the face matched. The backend chooses the reference from the verified account and handles the score internally. The same model and preprocessing are required for enrollment and verification. Store only the necessary protected descriptor, not permanent raw webcam pictures.

**Limitation:** A single captured image is not strong proof of liveness. Photo/video presentation attacks must be tested and reported honestly; do not claim production-grade spoof resistance.

## 5. Attempts, sessions and authorization · Anas

- Store login attempts and tokens on the server. The browser receives only a random session cookie marked `Secure`, `HttpOnly` and `SameSite=Lax`.
- Protect state-changing requests with same-origin checks and a session-bound CSRF token. Check OIDC `state` separately at callbacks.
- One attempt belongs to one user session, one method and one requested action. Changing the method starts a fresh attempt and password authentication.
- Set a short lifetime (initial lab target: **five minutes**); use one-use face challenges and limit retries. Failure, cancellation and timeout invalidate the attempt.
- Before execution, recheck current session, token activity, factor completion, account role and reference version where relevant. **Consume the attempt once** to prevent replay or repeated operations.
- Store credentials, descriptors, internal state and the protected resource in private directories that ordinary users cannot access directly. The gate exposes only allowlisted operations, never arbitrary file paths or shell commands.
- Revoke local sessions during supervised account recovery, password/TOTP changes and face-reference replacement. Keycloak account changes made outside the gate require coordinated session invalidation; verify that behavior in the lab.
- TOTP remains an independent option when the face worker fails. No failure automatically switches a user's selected method.

## 6. Enrollment and recovery

1. A lab administrator completes password + TOTP and approves face enrollment or replacement for a named participant after an in-person identity check.
2. The participant completes a separate fresh password + TOTP attempt, consents to capture and submits a valid image. The gate checks the unused approval and stores the descriptor for the verified account.
3. Replacing a face reference invalidates the old reference and pending face attempts. Neither enrollment nor administrator approval grants ordinary protected-resource access.
4. For a lost TOTP device or password reset, a supervisor uses Keycloak administration, revokes affected sessions and records the account recovery outcome. Do not offer a password-only fallback.
5. Remove face data on withdrawal or lab closure. Never commit images, embeddings, secrets, tokens or OTP recovery material to Git.

## 7. Outcomes and acceptance

| **HTTP** | **Outcome** |
|---|---|
| `200` / `201` / `204` | Successful authorized result for the requested endpoint only. |
| `303` | Redirect to Keycloak or an application status page; no resource access by itself. |
| `400` / `413` / `415` | Invalid request, oversized image or unsupported content. |
| `401` / `403` | Missing authentication, failed selected factor or insufficient role. |
| `409` | Attempt, approval or reference is expired, consumed or inconsistent. |
| `429` | Too many attempts; apply retry limits. |
| `503` | Required service unavailable; protected operation is denied. |

**Minimum integrated demonstration:** password + TOTP succeeds, password + face succeeds, password-only fails, a wrong role is denied, and a failed face match never releases the resource. Test account disablement, replay, cancellation and camera failures. Mark tests `Pending` until executed on Kali and record sanitized evidence in [test_cases.md](https://github.com/yr5hg/MFA-Security-System/blob/main/test_cases.md).

## References

- [Keycloak OpenID Connect and introspection](https://www.keycloak.org/securing-apps/oidc-layers)
- [Keycloak authentication flows and AMR mapper](https://www.keycloak.org/docs/latest/server_admin/)
- [Keycloak audience checks](https://www.keycloak.org/docs/latest/upgrading/)
- [Human face embeddings and matching](https://github.com/vladmandic/human/wiki/Embedding)
