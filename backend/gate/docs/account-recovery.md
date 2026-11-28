# Supervised Account Recovery

## 1. Security policy

The MFA gate does not reset passwords, generate TOTP
credentials or provide password-only recovery.

Password and TOTP recovery are performed through
Keycloak administration by an authorized lab supervisor.

The participant's identity must be verified in person.

## 2. Password or TOTP recovery procedure

1. Verify the participant's identity in person.
2. Identify the exact Keycloak account.
3. Stop the MFA gate to prevent protected operations.
4. Disable the affected Keycloak account temporarily.
5. Revoke its existing Keycloak sessions and any
   applicable offline sessions.
6. Reset compromised or unavailable credentials.
7. Require the participant to establish new credentials
   under supervision.
8. Revoke remaining old Keycloak sessions and verify
   that old tokens cannot authorize operations.
9. Keep face authentication disabled until the recovered
   account's previous biometric reference is withdrawn.
10. Re-enable the participant's account and restart the
    gate with face authentication disabled.
11. Require fresh password and TOTP authentication.
12. Withdraw the previous biometric reference using
    the dedicated face_withdraw operation.
13. Verify that withdrawal succeeded.
14. Require a new administrator approval before any
    subsequent biometric enrollment.
15. Restore face authentication only after the
    supervisor confirms successful recovery.

Stopping and restarting the gate clears all in-memory
sessions, proofs, approvals and pending attempts.

This maintenance procedure temporarily affects other
gate users because the lab uses a single process.

## 3. Biometric withdrawal

The owner authenticates using password and TOTP with
the dedicated face_withdraw purpose.

POST /face/withdraw accepts:

    {"confirmWithdrawal": true}

A successful response contains:

    {"status": "face_withdrawn", "removed": true}

If no active reference exists, removed is false.

The operation invalidates local sessions, authentication
proofs and associated enrollment approvals.

The descriptor is removed from the active reference
record. Version metadata is retained to prevent reuse
of previous reference versions.

An unavailable reference store must be treated as a
failure, not reported as successful withdrawal.

## 4. Recovery audit

The lab supervisor records:

- Recovery date and time
- Affected account identifier
- Responsible administrator
- Identity verification completion
- Recovery reason
- Keycloak session revocation outcome
- Local session invalidation outcome
- Biometric withdrawal outcome
- Final verification outcome

Passwords, OTP codes, tokens, photographs and biometric
descriptors must not appear in recovery records.

## 5. Responsibilities

Omar:
- Keycloak credential administration
- Keycloak session revocation
- Supervised TOTP configuration

Anas:
- Gate shutdown and restart
- Local authentication invalidation
- Biometric withdrawal
- Recovery integration verification

Hamzeh:
- Independent security and recovery testing

## 6. Limitations

External credential changes are not automatically
synchronized with the gate.

The supervised maintenance procedure is required.

Local reference removal is not guaranteed forensic
erasure of historical disk blocks or backups.

A participant who cannot complete password and TOTP
authentication requires supervised recovery or a
separate administrator-managed data removal procedure.

This procedure requires live verification before
being reported as fully tested.
