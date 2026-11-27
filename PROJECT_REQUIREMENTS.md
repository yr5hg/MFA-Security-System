
# Project Requirements — Password with TOTP or Face Verification on Kali Linux

**Version:** Draft v0.5 (revised 25 November 2026)  
**Phase:** Information Systems Security — Phase 2, due **30 November 2026**  
**Status:** Proposed requirements, not evidence of complete implementation.  
**Companions:** [TEAM_RESPONSIBILITIES.md](TEAM_RESPONSIBILITIES.md), [api.md](contracts/api.md), [architecture.md](architecture.md), [test_cases.md](test_cases.md).

## 1. Project overview

Implement a small Kali Linux laboratory account system with mandatory password authentication and one user-selected second factor: TOTP or experimental face verification. Knowledge is always required; possession or experimental inherence is the second factor. The user selects the method before a fresh Keycloak password login. Keycloak verifies the password on both paths and the authenticator code on the TOTP path. On the face path, a trusted Kali Node.js component running Human compares a fresh webcam capture against the authenticated account's approved reference. Only the protected application can release a resource after checking the completed selected path and application role.

All computer-side components, model assets and application state reside within the Kali VirtualBox guest. An authenticator application runs on a separate device. The application uses JavaScript/Node.js and Keycloak configuration, without Python. The expected result is an experimental demonstration with access-control evidence, biometric test observations and a security review.

**Security boundary:** Face comparison is not certified liveness or guaranteed presentation-attack resistance. A browser-reported match never authorizes an operation; the server owns the reference, matching policy and final decision. A flexible authentication system can be attacked through its weaker enabled path, and TOTP is also susceptible to phishing and stolen codes.

## 2. Scope

| In scope | Out of scope |
|---|---|
| Kali Linux, VirtualBox, Keycloak, an authenticator app, Human and a local Node.js service | Python-based biometric adapters, third-party cloud services and unrelated modalities |
| Password AND (TOTP OR face); trusted session binding, role-based access control | Mandatory 3FA, face identification across users and unrelated account services |
| Browser camera capture, supervised enrollment, replacement, factor recovery | Public registration, unsupervised factor changes and internet-facing deployment |
| Protected operations, genuine/impostor comparisons and authorized Kali security tests | Guaranteed anti-spoofing or certified biometric authentication |

## 3. Components and ownership

| Component | Owner | Proposed technology |
|---|---|---|
| Identity and both authentication paths | Omar Aljaouni | Keycloak, authenticator application, configured OIDC clients and roles |
| Camera capture and enrollment interaction | Sara Alqadi | Browser webcam, HTML/CSS and JavaScript in `frontend/` |
| Face recognition and comparison | Yousef Taha | Human models and a private local Node.js verifier under `backend/` |
| Integration, protected operations and recovery enforcement | Anas Musa | Trusted Node.js gate, server-side sessions, protected storage and RBAC |
| Independent evaluation and reporting | Hamzeh Abu Jumaa | Kali testing utilities, consented facial trials and `test_cases.md` |

All server-side project components run inside Kali; TOTP codes are generated on a separate device. The ordinary demo account cannot directly access the private biometric store or protected resource. Every member contributes implementation evidence, testing and reporting. Detailed tasks and FR/NFR ownership are listed in [TEAM_RESPONSIBILITIES.md](TEAM_RESPONSIBILITIES.md).

## 4. Actors and permissions

Application roles are `regular_user` and `administrator`. Neither role grants Keycloak administration privileges. The trusted identity is the validated issuer and subject, never a username or role supplied by the browser. Both application roles may select either method for ordinary access.

| Operation | Visitor | Regular user | Administrator |
|---|---|---|---|
| Choose method and start login | Yes | Yes | Yes |
| Provide own verification frame | No | Face path after fresh password | Same |
| Read the protected resource | No | Completed selected authentication path | Same |
| Execute the defined administrator operation | No | Deny | Completed selected path and administrator role |
| Approve a named account's enrollment/replacement | No | Deny | Fresh password + TOTP and supervised identity check |
| Enroll or replace own face | No | Own password + TOTP, consent and matching approval | Same |

An independent supervisor handles initial administrator setup and prevents self-approval where it would bypass enrollment controls. Loss of both factors requires supervised identity-provider recovery. Enrollment, replacement and recovery do not themselves authorize a protected operation.

## 5. Functional requirements

Preserve the established requirement identifiers: FR-01 through FR-32. Each requirement needs observed acceptance evidence before it may be considered implemented. Acceptance evidence must be collected from executed laboratory tests.

### 5.1 Account identity and login

| ID | Requirement | Verification |
|---|---|---|
| FR-01 | Create separate demonstration accounts and assign application roles in Keycloak. | The two accounts have distinct subjects and the role map gives only the intended privileges. |
| FR-02 | Enforce the realm password policy and brute-force protection. | A weak password fails policy and the configured retry limit takes effect on a disposable account. |
| FR-03 | Require a fresh username/password login for either selected route. | A correct password identifies the enabled account. Wrong, missing or disabled-account credentials produce no accepted identity. |
| FR-04 | Map the verified issuer, subject and application roles consistently on both clients. | The same account resolves to the same issuer/subject pair. Only mapped application roles can affect access. |
| FR-05 | End a local attempt on completion, cancellation, logout, expiry or invalidation. | A second dispatch or a return after logout requires a new login. |
| FR-27 | Enroll eligible accounts in Keycloak TOTP using a separate authenticator device. | Supervised setup, with private QR/seed handling, is followed by a distinct fresh login with a valid code. |
| FR-28 | Reject absent, wrong, expired and reused TOTP on the TOTP route. | The chosen policy disables code reuse. No accepted OTP proof on a skipped, stale or first-time setup-only flow. |
| FR-29 | Recover a lost TOTP credential through supervised identity verification and revoke affected sessions. | Old credential and local attempts fail. Roles and face enrollment persist. The replacement must pass fresh verification. |
| FR-30 | Offer both methods before login and freeze the choice with its client and action. | Invalid choices fail. An explicit switch cancels the attempt and starts a new password login. |
| FR-31 | Configure distinct confidential clients and verifiable authentication evidence for each route. | The signed identity proof identifies the expected client and executed factors. A face-client password proof cannot satisfy TOTP. |
| FR-32 | Require an already active, approved enrollment for the factor used in ordinary access. | An ineligible or unenrolled account cannot use setup as a resource grant. TOTP remains usable without a camera. |

### 5.2 Face enrollment, capture and verification

| ID | Requirement | Verification |
|---|---|---|
| FR-06 | Capture a new webcam frame in the Kali browser for the requested face operation. | The user sees a preview and can cancel. Denied permission or a missing device produces a recoverable message and no successful capture. |
| FR-07 | Require supervised identity checking and short-lived single-use administrator approval for initial face enrollment. | Only the approved subject can enroll with a fresh password and TOTP before the approval expires. |
| FR-08 | Bind the reference to the authenticated issuer and subject on the server. | Selecting a different user name or account identifier in browser input cannot change ownership. |
| FR-09 | Produce bounded JPEG capture input and guide the user to present exactly one well-positioned face. | The capture view guides a retry for poor input. The server independently rejects out-of-policy bytes, dimensions, face count and quality before storage or matching. |
| FR-10 | Run Human on Kali in a trusted Node component for detection, descriptor extraction and 1:1 comparison. | The server detects one acceptable face, extracts a finite descriptor and compares with exactly the authenticated subject's active reference. |
| FR-11 | Calibrate and freeze the model, quality policy and similarity threshold before evaluation. | A versioned policy gives the score direction, scale and equality rule. A missing threshold blocks face verification. |
| FR-12 | Bind face evidence to the active browser session, attempt, method, subject, identity context, action and reference version. | A result for an earlier attempt, another subject or a replaced template cannot authorize dispatch. |
| FR-13 | Return a typed failure on a mismatch, unusable face, model error or timeout. | A failed or malformed verifier result never satisfies the face route. Anas enforces access denial with no automatic method change. |

### 5.3 Protected access and recovery

| ID | Requirement | Verification |
|---|---|---|
| FR-14 | Perform the requested protected operation only after password and its one selected second factor. | Each complete route independently succeeds for an allowed role. An isolated factor or partial login cannot release a resource. |
| FR-15 | Restrict the ordinary administrator operation to the administrator application role after either complete route. | A regular user receives denial on both routes. An administrator may perform the defined operation on either. |
| FR-16 | Enforce allowlisted operations at the local server and isolate the underlying resource from the demo OS user. | Only the service identity can dispatch the operation. Browser claims, arbitrary operations and direct file access cannot grant it. |
| FR-17 | Use supervised Keycloak password recovery, preserve roles and the enrolled face reference, and invalidate affected sessions. | Pre-reset attempts fail and the account completes a fresh selected login after reset. |
| FR-18 | Require supervised, target-bound administrator approval and owner password plus TOTP to replace a face reference. | Only an unexpired approval for this subject, purpose and version can authorize replacement. |
| FR-19 | Atomically replace the reference and invalidate evidence for the old version. | Redemption succeeds at most once. Concurrent verification cannot dispatch after replacement on stale evidence. |
| FR-20 | Record sanitized events for authentication, authorization, factor changes and recovery. | A reviewer can reconstruct actor, target, time, action and outcome with opaque identifiers and no recoverable credentials or biometric content. |

### 5.4 Evaluation and reporting

| ID | Requirement | Verification |
|---|---|---|
| FR-21 | Evaluate genuine users and different consenting people against the claimed account. | Record separate held-out trial counts and observed decisions under the frozen policy. |
| FR-22 | Evaluate presentations of consented prints, on-screen images and, where feasible, recorded video. | Record the medium and actual acceptance or rejection separately from ordinary impostor trials. Mark an unavailable medium with a reason. |
| FR-23 | Execute the two-path functional, recovery and denial matrix and retain sanitized evidence. | Every reported result identifies its setup, actual outcome, operator and evidence. Unrun cases are visibly pending. |
| FR-24 | Report error rates, threshold methodology, scope and uncertainty of the lab sample. | Report false accepts/impostor trials and false rejects/genuine trials with counts. Empty denominators are reported as unavailable. |
| FR-25 | Inspect service exposure, transport configuration and permissions in the assigned VM. | Compare observed listeners and protected-resource permissions to the intended deployment and explain discrepancies. |
| FR-26 | Compare an isolated password-only baseline to the two integrated routes. | Use the same operation, lab hardware and timing boundaries. No baseline endpoint or switch exists in the integrated gate. |

## 6. Nonfunctional requirements

| ID | Requirement | Verification |
|---|---|---|
| NFR-01 | Default to denial and apply least privilege at every protected operation. | Only a recognized role, allowed operation and complete current method dispatch once. |
| NFR-02 | Obtain consent before capture, minimize stored biometric data and honor deletion. | A participant can decline or withdraw. No routine raw-frame retention. Deletion disables the template and clears dependent evidence. |
| NFR-03 | Keep secrets, tokens, OTP setup material, templates and raw captures out of the repository and exported evidence. | A review of tracked files, proposed changes and sanitized evidence finds none of these items. |
| NFR-04 | Use the same validated preprocessing, descriptor shape and finite score policy at enrollment and verification. | The pinned stack handles agreed inputs reproducibly. Corrupt images, unexpected dimensions and invalid scores fail closed. |
| NFR-05 | Fail closed when required identity or selected-factor dependencies fail. | Face failure blocks face access. TOTP can complete independently when only the face component is unavailable. |
| NFR-06 | Make local operation reproducible on the pinned Kali VM after dependency setup. | A teammate can load the same packages and model checksums and run inference with external network access disabled. |
| NFR-07 | Give clear, actionable browser prompts for method choice, capture, cancellation and failure. | A walkthrough identifies the selected method and gives a next action without revealing account details or a similarity score. |
| NFR-08 | Measure end-to-end authentication time and face inference time separately on declared hardware. | Report timer boundaries, cold/warm conditions, counts and observed median/range per route. Enforce a bounded inference timeout. |
| NFR-09 | Restrict the app, private biometric state and protected resource to the local lab boundary. | The service binds only to approved local interfaces. The demo user cannot read or modify private state. |
| NFR-10 | Protect identity and application traffic, server-side tokens, secrets and session cookies. | TLS and client identity checks succeed with the trusted CA. Invalid TLS or expired/revoked identity is denied and logs contain no raw secrets. |

## 7. Technical interfaces

See [the integration contract](contracts/api.md). The browser initiates a server-controlled authentication attempt with a fixed method, action and expiration. Keycloak provides authenticated user identity, password verification, the TOTP decision on the selected TOTP path and appropriately verified factor evidence. The trusted gate must validate issuer, subject, expected client and audience, token activity, role and the real factors executed; it must not treat an active token or an arbitrary client name as proof of TOTP.

The face path uses browser camera capture -> trusted Node.js/Human verifier -> server-side gate. The browser supplies bounded JPEG input and an active transaction context, not a trusted result. The verifier applies fixed preprocessing, detects exactly one acceptable face, extracts a valid descriptor and compares it only to the server-selected active reference. A malformed or timed-out result is denied. Threshold, model version, quality settings and score equality rule belong to the server and are frozen before evaluation.

Configure two suitably isolated Keycloak clients or supported authentication flows for the selected routes. The actual Keycloak release must demonstrate fresh password enforcement, the required TOTP factor and protection against SSO or alternate-grant bypass. Sensitive credentials and client secrets stay server-side. Face model failure does not authorize face access or silently switch the user to TOTP.

## 8. State and storage

- Keycloak manages accounts, passwords, TOTP credentials and roles; the separate authenticator device generates TOTP codes. The gate must not store OTP seeds.
- The private server stores only approved face references, verified issuer/subject association, active reference version and supervised approval state. Raw frames are not routinely retained.
- The server keeps selected method, action, session, attempt identifier and verified-factor state together. It clears invalid or expired attempts and prevents a verified result from being reused across sessions, users or methods.
- Enrollment and replacement use restricted access, target-bound single-use approvals, atomic updates and invalidation of earlier reference versions and outstanding proofs.
- The protected resource is accessible only to the authorized service identity. Server-side tokens and secrets are restricted, and audit records omit recoverable credentials or biometric content.
- Biometric deletion, recovery and logout invalidate dependent authorization evidence. Private test samples and sanitized report evidence follow the agreed retention rules.

## 9. Workflows

### 9.1 Login and verification

1. The user selects TOTP or face. The gate creates a new attempt with fixed method, expected client, requested operation and expiry.
2. Keycloak performs a fresh username/password login for the selected method. On the TOTP route, it also verifies the enrolled one-time code. Existing browser SSO and alternate grants cannot skip required factors.
3. The gate validates current trusted identity and relevant authentication evidence. Unknown, expired or inconsistent client, issuer, subject, audience or role information causes denial.
4. **TOTP route:** Valid evidence of the completed password-and-OTP flow satisfies the selected second factor without any webcam check. **Face route:** The server locates the current approved reference for the authenticated subject, receives a new bounded webcam frame and requests a private Human comparison. A match is bound to this attempt and reference version.
5. The gate rechecks active session, selected method, second-factor proof, current reference version when applicable, role and allowed action immediately before dispatch. The attempt ends after one operation, cancellation, logout, expiration or failure. Changing method requires a new login.

### 9.2 Enrollment

TOTP enrollment occurs through supervised Keycloak setup without exposing QR codes or seeds. Initial face enrollment requires the owner's fresh password and TOTP, consent, and a short-lived, target-bound administrator approval following supervised identity checking. The server validates the face sample, binds the reference to the verified subject, consumes the approval once and audits the change. Enrollment does not unlock a protected resource.

### 9.3 Recovery

Password and TOTP reset follow supervised identity verification through authorized Keycloak procedures. Affected sessions are revoked, while applicable roles and the approved face reference remain associated with the account. Face replacement requires the owner's fresh password + TOTP and supervised administrator approval; the old reference and outstanding proofs are invalidated atomically. No automatic fallback or silent relaxation of enrollment rules is allowed. An already enrolled alternative method may be selected in a new ordinary login attempt.

## 10. Evaluation and minimum acceptance

Use the root [test matrix](test_cases.md) to record **Expected** and **Observed** outcomes. Its current numbered cases are not evidence of completed tests. Evaluate complete selected paths, password-only denial, wrong factors, session expiration, role restrictions, method switching, forged browser success, cross-account reference tampering, supervised recovery, model failure, direct resource access and concurrent replacement.

Record genuine and impostor trial counts separately using a fixed threshold, and conduct consented print/screen/video presentation trials where feasible. Calculate false accepts per impostor attempts and false rejects per genuine attempts with explicit denominators. Compare both paths with an isolated password-only baseline on the same declared hardware; do not expose the baseline as a gate bypass.

- [ ] All computer-side components run on Kali Linux using the approved JavaScript and Keycloak configuration, without Python.
- [ ] Keycloak enforces fresh password authentication on both paths and fresh OTP on the TOTP path without an SSO or cross-client shortcut.
- [ ] Human runs in a trusted local Node.js component using pinned model and matching settings; browser-only results cannot authorize access.
- [ ] TOTP works without the webcam; face verification requires the current subject's approved reference and a fresh match.
- [ ] Both complete paths can perform only authorized operations; password-only, direct access and wrong-role requests are denied.
- [ ] Consent, administrator-approved enrollment/replacement, recovery, session expiry and failures are tested.
- [ ] Actual genuine/impostor/presentation outcomes, timing, limitations and isolated baseline observations are documented.
- [ ] No real credentials, OTP secrets, facial images or templates are committed; unfinished tests remain pending.

## 11. Phase 2 submission requirements

| Section | Required content | Lead |
|---|---|---|
| Preliminary Knowledge | About 400 words and at least four references on the concepts and supporting studies | Omar coordinates; all contribute |
| Proposed Model | 1,500–2,000 words describing goals, architecture, authentication flows, rationale, components and parameters | Anas integrates; each owner contributes |
| Simulation Results | Real lab setup, inputs, numbered figures/tables, observed decisions, baseline comparison and limitations | Hamzeh compiles; all contribute |

The course handout lists Phase 2 on **30 November 2026** (8 marks), and Phase 3 with presentation on **20 December 2026** (12 marks). All five students contribute across the three phases. The project manager submits the cumulative Word report in the required course format. The original handout's stated AI-content deduction should be checked against the instructor's current instructions. This file is a build specification, not a claim of completed experiments.

## 12. Open decisions and feasibility gates

1. Verify instructor approval for Keycloak, Human, Node.js, browser capture and supporting tools within the Kali-only, no-Python restriction.
2. Confirm a reproducible Human Node.js CPU configuration, model version/checksums, image limits, descriptor shape, score direction, calibrated threshold and error handling.
3. Demonstrate both Keycloak authentication paths on the pinned release, including actual factor evidence, fresh password/OTP behavior, callback binding, token validation, session expiration and SSO bypass tests.
4. Prove that the trusted gate owns the protected resource, private face references, authentication sessions and final authorization decision; an ordinary OS user must not reach them directly.
5. Finalize supervised initial enrollment, administrator bootstrap, reference deletion, factor recovery, retention, concurrency and throttling rules. Report any unverified integration as pending.

Source basis: the original repository requirements structure and the revised Group 1 face/TOTP requirements. Background documentation: [Keycloak administration](https://www.keycloak.org/docs/latest/server_admin/), [Keycloak OIDC](https://www.keycloak.org/securing-apps/oidc-layers), [Human repository](https://github.com/vladmandic/human) and [NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b.html).
