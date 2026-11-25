
# Expected vs observed test matrix (not yet executed)

**Execution status: pending.** Hamzeh owns the independent testing record. A successful UI message alone does not prove that a protected operation was authorized.

All tests must be performed in the authorized Kali Linux lab. Record actual results and sanitized evidence after execution. Do not publish credentials, OTP secrets, face images, or biometric templates.

| ID | Case | Expected | Observed |
|---|---|---|---|
| T-01 | TOTP path: correct password, fresh TOTP, allowed role, no face check | Allow | Pending |
| T-02 | Incorrect password on either path | Keycloak rejects login; no protected access | Pending |
| T-03 | TOTP path: correct password, missing TOTP | Deny | Pending |
| T-04 | TOTP path: incorrect TOTP | Deny | Pending |
| T-05 | TOTP code outside configured valid window | Deny | Pending |
| T-06 | Reuse previously accepted TOTP code | Deny if reuse prevention is configured; record actual policy | Pending |
| T-07 | TOTP not enrolled | No protected access before required enrollment and verification | Pending |
| T-08 | Existing browser SSO session or alternate login grant | Required factors cannot be bypassed | Pending |
| T-09 | Face path: correct password, face verification skipped | Protected operation denied | Pending |
| T-10 | Face path: face belongs to a different person | Expected deny; record any false acceptance | Pending |
| T-11 | Missing token or incorrect issuer/audience | Deny | Pending |
| T-12 | Expired or revoked session/token before protected action | Deny | Pending |
| T-13 | Direct protected resource access by unauthorized OS account | Deny | Pending |
| T-14 | Unauthorized command, action, or resource request | Deny; resource unchanged | Pending |
| T-15 | Forged face-match flag or client-chosen identity, role, reference, or threshold | Deny; browser input cannot override trusted verification | Pending |
| T-16 | Regular User requests an Administrator-only operation after either path | Deny | Pending |
| T-17 | Administrator requests an allowed operation after either completed path | Allow | Pending |
| T-18 | Face enrollment without approval or for another account | Deny | Pending |
| T-19 | Approved face enrollment with one valid face | Store reference for verified user only; enrollment does not grant resource access | Pending |
| T-20 | Approved face reference replacement | Old reference and pending proofs invalidated | Pending |
| T-21 | Password reset or TOTP recovery | Revoke affected sessions; require fresh complete authentication | Pending |
| T-22 | Reuse previous face-verification proof in a new attempt | Deny until fresh verification | Pending |
| T-23 | Missing Human model, timeout, or malformed verification result | Deny | Pending |
| T-24 | Camera unavailable, no face, multiple faces, or invalid image | Deny face path; display appropriate error | Pending |
| T-25 | Consented printed-photo or screen-image presentation | Record actual result and spoofing limitation; do not assume detection | Pending |
| T-26 | Consented prerecorded-video presentation (optional) | Record actual result; no guaranteed spoofing detection | Pending |
| T-27 | Concurrent requests, interrupted verification, or session reset | No stale authorization or duplicate protected operation | Pending |
| T-28 | Repeated incorrect login or face attempts | Enforce configured rate limiting; document actual behavior | Pending |
| T-29 | Scoped Nmap, traffic, and file-permission checks in Kali lab | Only intended exposure; no credentials or biometric templates leaked | Pending |
| T-30 | Isolated password-only baseline vs password+TOTP vs password+face | Record actual authorization results and timing; baseline cannot access protected resource | Pending |
| T-31 | Face path: correct password, matching enrolled face, no TOTP | Allow when trusted verification passes and role permits | Pending |
| T-32 | Face-path token or proof submitted to TOTP path | Deny | Pending |
| T-33 | TOTP-path token or proof substituted into face path | Deny | Pending |
| T-34 | Switch authentication method mid-attempt and reuse old proof | Cancel old attempt; require fresh authentication | Pending |
| T-35 | Failed TOTP or face verification triggers automatic fallback | No automatic fallback; selected attempt denied | Pending |
| T-36 | Invalid or manipulated authentication method selection | Deny; no protected operation | Pending |
| T-37 | Face path with no approved active enrollment | Deny; supervised enrollment required | Pending |
| T-38 | Face-verified Administrator attempts sensitive factor-change approval without required stronger verification | Deny sensitive approval under configured recovery policy | Pending |
| T-39 | TOTP login while camera or Human face-verification service is unavailable | Allow if TOTP and role checks succeed independently | Pending |
| T-40 | Both paths: identity and roles consistent; incorrect client/audience | Correct identity and role accepted only in authorized path; mismatched evidence denied | Pending |

For each completed case, record the date, operator, software versions, actual outcome, Pass/Fail status, and sanitized evidence reference.

For face-verification evaluation, record genuine and impostor trial counts, the Human model version, and the matching threshold used. Do not present expected results as actual test results.

All tests remain Pending until executed and verified.
