
# Requirements traceability

**Phase 2 · Password + TOTP or Human Face Verification · Kali Linux**

This matrix links each requirement in [PROJECT_REQUIREMENTS.md](PROJECT_REQUIREMENTS.md) to its accountable owner, component and planned checks in [test_cases.md](test_cases.md). The test matrix contains **T-01 through T-40**; all results remain **Pending** until executed on Kali. An ID in this table means that a test is relevant, not that the requirement has passed.

The full requirement wording and verification criteria are maintained in `PROJECT_REQUIREMENTS.md`. Hamzeh independently records observed outcomes. **Partial** means the listed case supports the requirement but its current description does not prove every acceptance condition.

## Functional requirements

| Requirement ID | Description | Owner | Component | Acceptance test IDs |
|---|---|---|---|---|
| FR-01 | Create distinct demonstration accounts and assign application roles in Keycloak. | Omar Aljaouni | Keycloak and TOTP | T-17, T-40 |
| FR-02 | Enforce password policy and brute-force protection. | Omar Aljaouni | Keycloak and TOTP | T-28 (partial: password policy) |
| FR-03 | Require a fresh username/password login on both methods. | Omar Aljaouni | Keycloak and TOTP | T-01, T-02, T-08, T-09, T-31 |
| FR-04 | Validate and consistently map issuer, subject and application roles on both clients. | Omar Aljaouni | Keycloak and TOTP | T-11, T-16, T-17, T-40 |
| FR-05 | End an attempt on completion, cancellation, logout, expiry or invalidation. | Anas Musa | Gate and access control | T-12, T-22, T-27, T-34 (partial: explicit logout) |
| FR-06 | Capture a new webcam frame in the Kali browser for the selected face operation. | Sara Alqadi | Capture and enrollment UI | T-24, T-31 |
| FR-07 | Require supervised identity checking and single-use administrator approval for face enrollment. | Anas Musa | Gate and access control | T-18, T-19, T-38 (partial: approval expiry) |
| FR-08 | Bind the face reference to the verified issuer and subject on the server. | Anas Musa | Gate and access control | T-15, T-18, T-19, T-40 |
| FR-09 | Capture bounded JPEG input and require one adequately positioned face. | Sara Alqadi | Capture and enrollment UI | T-24, T-31 |
| FR-10 | Use trusted Node.js Human detection, descriptor extraction and 1:1 comparison. | Yousef Taha | Human verifier | T-10, T-23, T-24, T-31 |
| FR-11 | Calibrate and freeze face model, quality policy and similarity threshold before evaluation. | Yousef Taha | Human verifier | T-10, T-31 (partial: calibration and boundary values) |
| FR-12 | Bind face evidence to the active session, attempt, method, subject, action and reference version. | Anas Musa | Gate and access control | T-15, T-20, T-22, T-27, T-32, T-33, T-34 |
| FR-13 | Reject mismatches, unusable captures, model errors and timeouts with bounded errors. | Yousef Taha | Human verifier | T-10, T-23, T-24, T-35 |
| FR-14 | Allow protected operations only after password and the one selected second factor. | Anas Musa | Gate and access control | T-01, T-03, T-09, T-16, T-17, T-31, T-35, T-39 |
| FR-15 | Limit administrator-only operations to the administrator role after complete login. | Anas Musa | Gate and access control | T-16, T-17 |
| FR-16 | Enforce allowlisted operations and block direct access to the protected resource. | Anas Musa | Gate and access control | T-13, T-14, T-15, T-27, T-36 |
| FR-17 | Perform supervised password recovery without losing roles or face enrollment; revoke sessions. | Omar Aljaouni | Keycloak and TOTP | T-21 |
| FR-18 | Require account-bound approval and owner password + TOTP for face replacement. | Anas Musa | Gate and access control | T-18, T-20, T-38 (partial: owner TOTP step) |
| FR-19 | Atomically replace the face reference and invalidate previous-version evidence. | Anas Musa | Gate and access control | T-20, T-27 (partial: atomicity under failure) |
| FR-20 | Record sanitized authentication, access, factor-change and recovery events. | Anas Musa | Gate and access control | T-21, T-29 (partial: explicit audit review) |
| FR-21 | Evaluate genuine and different consenting people against the claimed account. | Hamzeh Abu Jumaa | Independent evaluation | T-10, T-31 |
| FR-22 | Evaluate printed, screen and optional video face presentations. | Hamzeh Abu Jumaa | Independent evaluation | T-25, T-26 |
| FR-23 | Execute the functional, recovery and denial matrix with sanitized evidence. | Hamzeh Abu Jumaa | Independent evaluation | T-01–T-40 |
| FR-24 | Report biometric error rates, calibration method, sample size and limitations. | Hamzeh Abu Jumaa | Independent evaluation | T-10, T-31 (partial: aggregate rate reporting) |
| FR-25 | Inspect local service exposure, transport and file permissions. | Hamzeh Abu Jumaa | Independent evaluation | T-13, T-29 |
| FR-26 | Compare a password-only baseline with both complete authentication routes. | Hamzeh Abu Jumaa | Independent evaluation | T-30 |
| FR-27 | Enroll eligible accounts in Keycloak TOTP on a separate authenticator device. | Omar Aljaouni | Keycloak and TOTP | T-01, T-07 |
| FR-28 | Deny missing, wrong, expired and reused TOTP; prevent skipped factors. | Omar Aljaouni | Keycloak and TOTP | T-03, T-04, T-05, T-06, T-07, T-08 |
| FR-29 | Recover lost TOTP through supervised verification and revoke affected sessions. | Omar Aljaouni | Keycloak and TOTP | T-21 |
| FR-30 | Offer both methods before login and bind the selected client and action to the attempt. | Anas Musa | Gate and access control | T-34, T-35, T-36 |
| FR-31 | Configure distinct trusted clients and verify method-specific authentication evidence. | Omar Aljaouni | Keycloak and TOTP | T-08, T-11, T-32, T-33, T-40 |
| FR-32 | Require active approved enrollment for the selected factor during ordinary access. | Anas Musa | Gate and access control | T-07, T-19, T-37, T-39 |

## Nonfunctional requirements

| Requirement ID | Description | Owner | Component | Acceptance test IDs |
|---|---|---|---|---|
| NFR-01 | Deny by default and apply least privilege to protected operations. | Anas Musa | Gate and access control | T-13, T-14, T-15, T-16, T-35, T-36 |
| NFR-02 | Obtain consent, minimize biometric storage and honor deletion. | Sara Alqadi | Capture and enrollment UI | T-19, T-20, T-29 (partial: consent withdrawal and deletion) |
| NFR-03 | Keep passwords, secrets, tokens and face data out of Git and shared evidence. | Hamzeh Abu Jumaa | Independent evaluation | T-29 (partial: repository and evidence review) |
| NFR-04 | Apply consistent preprocessing and finite descriptor/score rules. | Yousef Taha | Human verifier | T-10, T-23, T-24, T-31 |
| NFR-05 | Fail closed when identity or selected-factor dependencies fail. | Anas Musa | Gate and access control | T-11, T-23, T-24, T-35, T-39 |
| NFR-06 | Reproduce local operation on a pinned Kali environment. | Yousef Taha | Human verifier | T-23, T-29, T-39 (partial: clean/offline reproduction) |
| NFR-07 | Provide clear prompts for selection, capture, cancellation and failure. | Sara Alqadi | Capture and enrollment UI | T-24, T-34, T-35, T-36 (partial: UI walkthrough) |
| NFR-08 | Measure full authentication time and face inference time separately. | Hamzeh Abu Jumaa | Independent evaluation | T-30 (partial: separate inference timing) |
| NFR-09 | Restrict deployment, templates and resources to the local lab. | Anas Musa | Gate and access control | T-13, T-29 |
| NFR-10 | Protect TLS, verified identity, private tokens, secrets and session cookies. | Anas Musa | Gate and access control | T-11, T-12, T-29, T-40 |

## Coverage notes

The existing 40-case matrix covers the core login, face, role, recovery and denial paths. It does **not** explicitly demonstrate every detail of the broader requirements above. Before marking those requirements complete, add the relevant observations within the existing case records or update the test descriptions without changing their IDs:

- **Keycloak controls:** Check the configured weak-password policy in T-28, explicit logout in T-12/T-22, and actual single-use approval expiry and owner TOTP during T-18–T-20.
- **Face policy and lifecycle:** Record the threshold calibration and equality decision during T-10/T-31, reference replacement atomicity during T-20/T-27, and consent withdrawal plus data deletion during T-19/T-20.
- **Evidence and reproducibility:** Review sanitized event logs and Git content under T-21/T-29, publish genuine/impostor counts and error rates from T-10/T-31, repeat offline setup with T-29, and separately time inference in T-30.

These are **documentation/testing gaps, not completed tests**. Keep each test's `Observed` value as `Pending` until Hamzeh records an actual result. Use only test IDs that exist in the current `test_cases.md` matrix.
