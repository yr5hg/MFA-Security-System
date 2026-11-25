
# Team responsibilities and Phase 2 roadmap

**Information Systems Security · Group 1 · Phase 2 due 30 November 2026**

Each member owns one component and its acceptance evidence. The entire team contributes to all three phases. This roadmap documents the responsibilities, implementation tasks, component handoffs and integration checkpoints for the Face Verification + TOTP project.

## Team distribution

| Owner | Component | Intended implementation location |
|---|---|---|
| Omar Aljaouni | Keycloak identity, authentication configuration and TOTP | `keycloak/` |
| Sara Alqadi | Browser camera capture, face enrollment and replacement experience | `frontend/`, with JavaScript in `frontend/js/` |
| Yousef Taha | Private Human face recognition and matching | Face-verifier module under `backend/` |
| Anas Musa | Authentication integration, protected operation and recovery enforcement | Gate/session/access modules under `backend/` |
| Hamzeh Abu Jumaa | Independent security testing and evaluation | Future test assets in `tests/`; current matrix at the root |

## Shared implementation decisions

- All computer-side project components run locally on Kali Linux inside the approved laboratory environment.
- Keycloak manages user accounts, password authentication, TOTP and role information.
- The Human JavaScript library is used for experimental face detection and face verification.
- JavaScript and Node.js are used for the local application and proposed face-verification backend.
- Python, SpeechBrain and voice authentication are not part of the current implementation.
- Each login requires a valid password and one selected second factor: TOTP or Face Verification.
- Users are not required to complete both TOTP and Face Verification during the same login.
- The selected authentication method must remain fixed throughout the login attempt.
- A successful browser-side face detection or matching message alone cannot authorize access.
- The trusted backend must enforce authentication, session validity, second-factor completion and RBAC.
- Face verification is experimental and is not equivalent to certified biometric authentication or guaranteed liveness detection.
- Credentials, authentication tokens, OTP secrets, facial images and biometric templates must not be committed to GitHub.
- Existing team work and Git history must be preserved. Changes should be reviewed before merging.
- Only real executed tests may be marked as passed. Unexecuted functionality and tests remain pending.

## Omar Aljaouni · Identity and TOTP

- Configure the pinned Keycloak release, TLS realm, two appropriately configured clients, exact redirects, password policy, role mapping, brute-force protection and TOTP settings. Disable unused authentication grants and unintended SSO shortcuts.
- Configure the selected authentication flows so the TOTP route requires password and OTP, while the Face Verification route provides trusted password authentication before the separate face check.
- Arrange supervised TOTP enrollment using an authenticator application on a separate device. Confirm that both routes enforce the intended password requirements and that the TOTP route enforces fresh OTP verification.
- Verify the actual signed authentication claims, including factor evidence where supported. Do not assume that client separation alone proves the required factors were completed.
- Test incorrect passwords, missing or invalid TOTP, unenrolled accounts, existing SSO sessions, account changes and recovery behavior.
- Coordinate password reset, TOTP replacement, session revocation and account eligibility changes with Anas.
- **Handoff to Anas:** trusted issuer, allowed clients and audiences, sanitized token claims, verified factor evidence, role mapping, account eligibility and reset/revocation notifications. Share secrets privately.
- **Done when:** a second team member can reproduce the required Keycloak authentication flows and negative cases. Recovery invalidates affected credentials and sessions. Provide sanitized configuration and evidence for Preliminary Knowledge.
- **Accountable requirements:** FR-01, FR-02, FR-03, FR-04, FR-17, FR-27, FR-28, FR-29, FR-31.

## Sara Alqadi · Face capture and enrollment

- Verify VirtualBox webcam access and browser camera permissions on Kali Linux.
- Build a simple browser interface for camera preview, consent, face capture, positioning instructions and retry guidance.
- Handle denied camera permission, unavailable or busy camera, cancellation, poor lighting, missing face and multiple detected faces. Release camera resources when the interaction ends.
- Support face capture for login verification, initial enrollment and supervised reference replacement.
- Capture a fresh facial sample only for the operation requested by the trusted application.
- Submit a bounded image using the agreed request contract and server-issued transaction context. Display the trusted server response without making client-side authorization decisions.
- Avoid persistent browser storage of facial images or descriptors in the final application. Coordinate consent withdrawal and deletion with Anas.
- Coordinate the input image format, quality rules and error responses with Yousef.
- **Handoff to Yousef and Anas:** documented image format, capture interface, quality/error behavior and consenting private test samples. Anas manages account association and enrollment approval; Yousef manages facial descriptor extraction and similarity decisions.
- **Done when:** the Kali browser can capture a fresh facial sample and deliver it to the intended server component. Error and cancellation cases end safely without granting protected access. Provide a sanitized capture walkthrough and privacy evidence.
- **Accountable requirements:** FR-06, FR-09, NFR-02, NFR-07.

## Yousef Taha · Human recognition and verification

- Integrate the Human JavaScript library for facial detection, descriptor extraction and comparison.
- Verify that the selected Human, Node.js, backend dependencies and model assets operate together on the team's Kali Linux environment.
- Pin relevant library versions, model assets and configuration. Test local operation without depending on an external biometric service.
- Use consistent preprocessing at enrollment and verification. Validate image dimensions, input quality, the presence of exactly one face and the extracted descriptor.
- Compare the new facial descriptor against the trusted enrolled reference associated with the authenticated user.
- Define an explicit similarity decision rule and matching threshold. Reject malformed, missing, incompatible or invalid comparison results.
- Use separate consenting genuine/impostor samples for calibration and evaluation. Freeze the threshold before conducting the final evaluation.
- Test genuine matches, different people, missing faces, multiple faces, invalid input, model failures and comparison timeouts.
- Document false acceptance, false rejection, performance and limitations involving photographs or prerecorded videos.
- **Handoff to Anas and Hamzeh:** private verification interface, model/configuration versions, frozen comparison rule, threshold and sanitized test results. Sara supplies the capture format; Hamzeh independently evaluates the matching policy.
- **Done when:** real Human-based comparisons run successfully on Kali for consenting subjects, with documented positive and negative results. Failures return safe outcomes, and the comparison interface can be integrated with the trusted backend.
- **Accountable requirements:** FR-10, FR-11, FR-13, NFR-04, NFR-06.

## Anas Musa · Integration and access control

- Prepare a least-privileged service identity and an actual protected laboratory resource that ordinary users cannot access directly.
- Implement authentication method selection between TOTP and Face Verification before starting the corresponding authentication attempt.
- Bind each attempt to the selected method, authenticated user, expected client, protected action, session and expiration time.
- Integrate Omar's Keycloak authentication evidence and Yousef's private Human verification component.
- Validate relevant token claims, authentication state, selected method and role before allowing protected operations.
- For the Face Verification path, select the enrolled reference using the authenticated user's trusted identity rather than caller-supplied identifiers.
- Bind a successful face-verification result to the correct current attempt or server-side session. Reject forged browser success flags, stale results and cross-account evidence.
- Implement cancellation, session expiration, attempt cleanup, account-level throttling and protection against method switching or unauthorized token substitution.
- Enforce role-based access control and recheck the required authorization conditions immediately before executing a protected operation.
- Coordinate supervised factor enrollment and replacement approvals, reference invalidation, secure storage access and privacy-safe audit records.
- Work with Omar on credential recovery and session revocation, with Sara on enrollment interfaces, and with Yousef on trusted comparison results.
- **Handoff to Hamzeh:** authentication endpoints, supported actions, two test roles, protected resource, expected outcomes, recovery procedures, negative test inputs and reproducible service configuration. Integrate the Proposed Model report section.
- **Done when:** Password + TOTP and Password + Face Verification independently permit authorized operations, while password-only access, invalid sessions, insufficient roles, wrong authentication paths and stale biometric evidence are denied at the actual protected resource boundary.
- **Accountable requirements:** FR-05, FR-07, FR-08, FR-12, FR-14, FR-15, FR-16, FR-18, FR-19, FR-20, FR-30, FR-32, NFR-01, NFR-05, NFR-09, NFR-10.

## Hamzeh Abu Jumaa · Independent evaluation

- Prepare the authorized Kali Linux test environment, laboratory scope, designated test accounts and consented biometric test materials.
- Maintain the independent [test matrix](test_cases.md), recording expected results separately from actual observations.
- Test both authentication paths, password failures, missing or invalid TOTP, face matches and mismatches, missing enrollment and camera failures.
- Verify that password-only authentication, forged face results, expired sessions, cross-method token substitution and incorrect roles cannot access protected operations.
- Test enrollment and recovery controls, reference replacement, interrupted attempts, unauthorized administrative actions and direct resource access restrictions.
- Inspect authorized service exposure, network traffic and file permissions using suitable Kali Linux security tools.
- Conduct consenting genuine/impostor comparisons and limited photograph or video presentation trials. Report actual outcomes and limitations without assuming spoofing detection.
- Calculate meaningful matching metrics using recorded trial counts. Keep calibration and evaluation samples separate and document matching thresholds and observed timing.
- Compare the protected authentication paths with an isolated password-only baseline that cannot access the actual protected resource.
- Keep evidence sanitized, document unresolved findings and independently reproduce at least one critical security result.
- **Handoff to all owners:** dated test outcomes, evidence identifiers, defects linked to requirements and evaluation findings. Compile Simulation Results using actual measurements.
- **Done when:** each claimed result can be traced to an executed test and sanitized evidence. Unexecuted or blocked tests are clearly identified. Security failures are reported to the responsible component owner.
- **Accountable requirements:** FR-21, FR-22, FR-23, FR-24, FR-25, FR-26, NFR-03, NFR-08.

## Component handoffs and integration order

| Producer | Consumer | Required handoff |
|---|---|---|
| Omar | Anas, Hamzeh | Keycloak configuration, verified authentication evidence, client settings, role mappings and recovery rules |
| Sara | Yousef, Anas | Camera capture interface, bounded image format, enrollment experience and error handling |
| Yousef | Anas, Hamzeh | Human verifier interface, model versions, matching threshold, decision rules and comparison results |
| Anas | Sara, Hamzeh | Authentication routes, protected operations, session rules, enrollment approvals and recovery policy |
| All members | Hamzeh | Component versions, expected behavior and sanitized implementation evidence |
| Hamzeh | All members | Actual test outcomes, identified defects, evaluation findings and Simulation Results evidence |

### Integration order

1. Omar verifies Keycloak authentication, TOTP and account roles.
2. Sara demonstrates webcam capture and the enrollment interface on Kali Linux.
3. Yousef demonstrates local face verification using Human.
4. Anas demonstrates that the protected resource cannot be accessed directly.
5. Integrate the complete Password + TOTP authentication path.
6. Integrate supervised facial enrollment and the Password + Face Verification path.
7. Verify session binding, method isolation, authorization and recovery behavior.
8. Hamzeh independently tests both paths and the protected resource boundary.
9. All members contribute verified results and documentation to the Phase 2 report.

## Integration checkpoints

| Target date, 2026 | Parallel work and dependency | Exit evidence |
|---|---|---|
| 25 Nov | All review the integration contract. Sara confirms camera readiness. Omar selects the Keycloak release. Yousef selects a compatible Human/Node.js configuration. Anas defines resource permissions. Hamzeh prepares test scope. | Named configuration snapshot, component responsibilities and test owners |
| 26 Nov | Omar demonstrates required authentication evidence. Sara proves bounded camera capture. Yousef demonstrates local face comparison. Anas demonstrates direct resource denial. | Sanitized token claims, capture-format record, local comparison result and permission evidence |
| 27 Nov | Integrate the TOTP path first, followed by supervised face enrollment and face verification. Confirm consistent user identity across the two methods. | One authorized and one denied protected operation on each completed path |
| 28 Nov | Test recovery, expiration, method isolation and concurrent attempts. Hamzeh performs role, presentation, accuracy and timing checks. | Actual outcomes, trial counts, security observations and documented limitations |
| 29 Nov | Omar coordinates Preliminary Knowledge. Anas integrates Proposed Model. Hamzeh compiles Simulation Results. Sara and Yousef provide capture and matching evidence. | Reviewed cumulative report with labeled figures, references and verified findings |
| 30 Nov | The team reproduces the final demonstration. The project manager submits the cumulative Word report. | Reproducible demonstration record and submission confirmation |

These are planned work targets, not evidence of completed tasks. The Phase 2 deadline is 30 November 2026.

If a technical dependency blocks one authentication path, document the observed component behavior and leave the integrated functionality pending rather than claiming a successful implementation.

## Phase 2 reporting and shared definition of done

- **Omar:** Coordinates Preliminary Knowledge and supplies Keycloak, password, TOTP and role-configuration evidence.
- **Sara:** Supplies camera capture, face enrollment interface, usability and privacy-related evidence.
- **Yousef:** Supplies Human integration, facial comparison, model configuration, threshold and evaluation evidence.
- **Anas:** Integrates the Proposed Model, system architecture, authentication flows, protected resource design and recovery controls.
- **Hamzeh:** Compiles Simulation Results, including actual test outcomes, comparisons, security observations and limitations.

Every team member contributes to the cumulative report and reviews the technical claims related to their component.

A component is ready for integration when it has documented dependencies, reproducible Kali Linux setup, valid positive and negative results, a clear interface and sanitized evidence.

The final integrated demonstration must show that:

- Password + TOTP works without facial verification.
- Password + Face Verification works without requiring TOTP during that login.
- Password-only authentication cannot access protected resources.
- A browser-controlled success flag cannot bypass trusted verification.
- Cross-method evidence and stale verification results are rejected.
- Unauthorized roles cannot perform protected operations.
- Failed or incomplete authentication does not authorize access.

Actual outcomes must be recorded. No test or integration feature should be described as completed without supporting evidence.

See [Project Requirements](PROJECT_REQUIREMENTS.md) and [Requirements Traceability](REQUIREMENTS_TRACEABILITY.md) for the detailed requirements and associated acceptance cases.
