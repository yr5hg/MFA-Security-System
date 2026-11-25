# Proposed architecture — Kali lab, password + choice of TOTP or voice

Status: design, not tested. Python restricted to SpeechBrain library and local voice comparison adapter. Keycloak and SpeechBrain are external tools; confirm instructor approval.

```mermaid
sequenceDiagram
    actor User
    participant Gate as Trusted Kali gate
    participant KC as Keycloak
    participant Phone as Google Authenticator
    participant Rec as ALSA and FFmpeg
    participant Voice as SpeechBrain adapter
    participant Resource as Protected resource
    User->>Gate: Select operation and TOTP or voice
    Gate->>Gate: Freeze method and expected client
    Gate->>KC: Start device grant for selected client
    KC-->>Gate: URI and user code
    Gate-->>User: Display URI and code
    User->>KC: Fresh username and password
    alt TOTP client
        Phone-->>User: Fresh TOTP
        User->>KC: Submit TOTP
    else Voice client
        Note over KC: Password only; voice still pending
    end
    Gate->>KC: Poll and validate returned token by introspection
    alt Valid voice-client token
        Gate->>Rec: Capture and normalize fresh audio
        Gate->>Voice: Compare trusted reference and attempt
        Voice-->>Gate: Match verdict and score
    else Valid TOTP-client token
        Note over Gate: Second factor satisfied by enforced OTP flow
    end
    Gate->>KC: Revalidate selected client, token and role
    alt Selected path complete and role permitted
        Gate->>Resource: Perform allowlisted action
        Resource-->>User: Result through gate
    else Invalid, incomplete, mismatched or expired
        Gate-->>User: Deny
    end
    Gate->>Gate: Clear attempt state
```

Gate chooses client before login, never accepts pasted tokens or caller flags. The two clients share the same realm and account subject with consistent roles. Proof of client-specific flow behavior on device grant is a feasibility gate. TOTP client requires password+OTP; voice client requires password and gate then verifies voice. A valid token from one cannot substitute for the other. Changing method cancels the attempt, invalidates local state, starts fresh login; no automatic fallback. Revalidate token and role immediately before operation; voice result bound to subject, token context, attempt and enrollment version. Both ordinary user and admin access use flexible 2FA; sensitive enrollment/recovery specifically requires TOTP path and supervised evidence.

Deployment: isolated Kali host/VM, verified TLS, local recorder/model, private gate-owned files. Ordinary OS user cannot read resource or edit gate. No public API. Threats include phishing, weaker-route selection, cross-client substitution, SSO bypass, stale factor reuse, file permission bypass, replay/synthesis, and enrollment tampering. Voice matching is not liveness. Evaluate actual attacks in authorized lab only; report limitations.
