# Kali Linux setup and first milestone

Proposed steps; not tested on your team's hardware. Confirm instructor permission for external tools, the voice-only Python exception, shell scripts and model download before installing. The standard Kali security tool catalogue does not supply the entire proposed MFA system.

## 1. Lab setup (all members)

Use a current Kali VM or dedicated lab installation. Enable microphone passthrough if virtualized; use an isolated host-only/NAT network as appropriate and avoid public exposure. Create an ordinary development user; use administrator privileges only for package installation and reviewed permission setup. Make a snapshot before changes. Record environment:

```bash
cat /etc/os-release
uname -m
sudo apt update
sudo apt install git curl jq alsa-utils ffmpeg ca-certificates nmap wireshark
arecord -l
arecord -L
```

Package availability and network/audio permissions may differ. Use actual versions; do not run the entire project as root. Only Yousef sets up a dedicated Python virtual environment for SpeechBrain voice comparison; see the voice-service instructions. No other component uses Python. Browser is used for Keycloak; phone is used for Google Authenticator. Do not expose private Keycloak admin endpoints to other networks. See `keycloak/README.md` for chosen release setup; Keycloak Java/container installation is Omar's responsibility.

## 2. Parallel checkpoints

- Omar: two dedicated Keycloak flows: password+OTP for TOTP client, password only for voice client; no SSO shortcut, no cross-client bypass; test device-grant flow overrides; produce sanitized proof.
- Sara: capture and validate a real 16-kHz WAV locally; no raw audio in Git.
- Yousef: set up the voice-only Python environment and download pretrained SpeechBrain weights, compare clips. See `voice-service/README.md`.
- Anas: isolated gate service identity and real protected file/operation; demonstrate ordinary OS user cannot access it directly. Validate device flow and token claims in lab.
- Hamzeh: create scope and test case matrix before integration.

## 3. Integrate only after checkpoints

Use `contracts/api.md`. Start with both Keycloak clients plus gate; test TOTP-only second factor and password-only denial on voice path; connect recorder and model; add permission checks and recovery. Keep the gate-owned directory outside the clone. The `.env.example` contains placeholder configuration; never execute a user-editable env file as trusted code. Replace sample issuer with real TLS URL, use separate gate-owned client secret files and model paths, and set threshold only after calibration. No raw secrets, OTP QR, tokens, voice samples, model weights or embeddings belong in Git. Sanitize screenshots and exports. The repository is public.

If device flow, SpeechBrain model or gate fails, report which components work and the blocker rather than claiming complete MFA. Reproduce setup on a second machine or clean snapshot before the final demo.
