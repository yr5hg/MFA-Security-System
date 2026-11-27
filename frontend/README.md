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
