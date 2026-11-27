# MFA Security System - Frontend

## Component Owner
Sara Alqadi

## Environment
- Kali Linux on Oracle VirtualBox
- Node.js v24.22.2
- npm 12.2.0
- Firefox
- Webcam

## Implemented Features
- Authentication method selection
- Camera consent and live preview
- JPEG image capture
- Maximum image size of 1 MiB
- Camera cancellation and cleanup
- Camera permission error handling
- Camera reconnection and retry
- Face enrollment demo interface
- Face replacement demo interface
- Mock input validation

## Run the Frontend

From the repository root, execute:

npx --yes http-server@14.1.1 frontend -a 127.0.0.1 -p 8081 -c-1

Open http://localhost:8081 in Firefox.

## Observed Component Tests
- Camera preview: PASS
- Consent check: PASS
- JPEG capture: PASS
- Cancellation: PASS
- Method switching: PASS
- Permission denied: PASS
- Camera unavailable: PASS
- Camera recovery: PASS
- Mock operation selection: PASS
- Invalid operation rejection: PASS
- Wrong image format rejection: PASS
- Empty image rejection: PASS
- Oversized image rejection: PASS

## Privacy
Camera frames are processed temporarily in browser memory.
No persistent biometric storage or external image upload
is implemented.

## Integration Status
The frontend currently operates in demo mode.
Real authentication, server-side face matching,
enrollment approval, and protected access are pending.

Mock validation does not establish identity or authorization.

## Requirements
FR-06, FR-09, NFR-02, NFR-07

Component tests provide partial acceptance evidence.
Full integrated security tests remain pending.


## Additional Frontend Improvements

- Camera disconnection handling.
- Automatic 60-second camera timeout.
- Late camera permission handling.
- Improved face positioning instructions.
- Consent withdrawal and camera cleanup.
- Secure browser context validation.
- Biometric privacy interface.
- API error feedback preparation.
- Face API client preparation.

## Automated Tests

Run from the repository root:

    node --test frontend/tests/*.test.cjs

Observed results (27 November 2026):

- Mock API tests: 8/8 passed.
- API feedback tests: 10/10 passed.
- API client tests: 11/11 passed.
- Total: 29 passed, 0 failed.

## Additional Manual Tests

- Camera disconnection: PASS.
- Camera timeout: PASS.
- Permission timeout: PASS.
- Consent withdrawal: PASS.
- Page refresh and closure cleanup: PASS.
- Secure localhost camera access: PASS.
- Insecure context rejection: PASS (simulated via Firefox Web Console). Camera blocked, security message displayed, and Capture button remained disabled.

## Integration Handoff

Prepared endpoints:

- GET /attempts/current
- POST /face/verify
- POST /face/enroll

The API client is not connected to the live UI yet.
Request encoding, CSRF fields, challenge format,
and response schemas require backend coordination.

Real authentication, face matching, enrollment approval,
biometric deletion and protected access remain pending.

All automated tests are component-level tests.
They do not establish complete system security.
