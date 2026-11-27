
# Face Verification and TOTP Redesign — Migration Record

**Project:** MFA Security System  
**Phase:** Information Systems Security — Phase 2  
**Deadline:** 30 November 2026  
**Status:** Documentation migration completed; integrated implementation and security testing remain pending.

## 1. Repository and Migration History

Current project repository:

https://github.com/yr5hg/MFA-Security-System

The documentation redesign was originally prepared on 25 November 2026 against the historical repository:

`yr5hg/Voice-Verification-Security-System`

Historical baseline commits:

- Previous migration baseline: `923d3fe5203586a7e322bf42b82b277cd4b8f8d1`
- Later inspected baseline: `dfcea59dccaf6ca18577d80bba4ff284d027872f`

These commit identifiers document the earlier migration history. They are not a claim about the latest commit in the current repository.

The previous repository name is retained here for historical reference only.

No remote branch, commit or pull request was changed during the original documentation preparation.

Preserve existing implementation code, feature branches, repository history and directory placeholders.

## 2. Current Design

The project replaces experimental SpeechBrain voice verification with experimental face verification using the Human JavaScript library.

Every ordinary login requires:

1. Fresh password authentication through Keycloak.
2. One selected second factor:
   - TOTP verification, or
   - Server-side face verification.

The two authentication methods are separate. Ordinary login does not require TOTP and face verification together.

The system uses browser webcam capture, private Node.js face comparison, trusted sessions and role-based access control.

All computer-side components run inside Kali Linux without Python.

## 3. Current Keycloak Configuration

The existing Kali laboratory uses:

- Keycloak version: `26.8.2`
- Realm: `multi-factor-authentication`
- Application roles: `regular_user`, `administrator`
- TOTP client ID: `gate-totp`
- Face client ID: `gate-face`

The current Keycloak development instance runs at:

`http://127.0.0.1:8080`

The planned HTTPS integration endpoints are:

- Keycloak: `https://id.test:8443`
- Application gate: `https://gate.test:8444`

The documented redirect URIs are:

- TOTP: `https://gate.test:8444/oidc/totp/callback`
- Face: `https://gate.test:8444/oidc/face/callback`

These are integration contracts, not proof that the backend routes have been implemented or tested.

The backend developer must implement and verify the callback routes.

## 4. Documentation Files

The project documentation includes:

- `README.md`
- `PROJECT_REQUIREMENTS.md`
- `TEAM_RESPONSIBILITIES.md`
- `architecture.md`
- `contracts/api.md`
- `KALI_SETUP.md`
- `test_cases.md`
- `REQUIREMENTS_TRACEABILITY.md`
- `MIGRATION_1.md`
- `.env.example`

Additional project documentation is listed in:

- [File Mapping](FILE_MAPPING.md)
- [Implementation Status](IMPLEMENTATION_STATUS.md)
- [Review Checklist](REVIEW_CHECKLIST.md)

Changes to these files must remain consistent with the current design and actual Keycloak configuration.

Do not overwrite newer implementation work from other team members.

## 5. Git Workflow for Future Changes

From the local repository root in Windows PowerShell:

```powershell
git status
git fetch origin
git switch main
git pull --ff-only origin main
git rev-parse HEAD
```

Before making changes, ensure existing work is committed or safely stashed.

Create a new documentation branch with a unique name when necessary:

```powershell
git switch -c docs/keycloak-config-alignment
```

After editing the required files:

```powershell
git status --short
git diff --stat
git diff --check
```

Stage and review only the intended changes:

```powershell
git add .env.example contracts/api.md KALI_SETUP.md MIGRATION_1.md
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only
```

The files listed in the staging command are examples for the current configuration-alignment update. Include additional reviewed files only when they actually require changes.

Confirm that no secrets, biometric data or unrelated code are staged.

Commit and push:

```powershell
git commit -m "Align documentation with current Keycloak configuration"
git push -u origin docs/keycloak-config-alignment
```

Open a pull request to `main` and use the [Review Checklist](REVIEW_CHECKLIST.md) before merging.

Do not recreate an already existing branch or repeat the original migration unnecessarily.

## 6. Team Responsibilities

The five team members retain their assigned responsibilities.

See [Team Responsibilities](TEAM_RESPONSIBILITIES.md) for individual tasks, implementation boundaries and integration milestones.

## 7. Scope and Limits

The documentation describes the planned authentication architecture and integration requirements.

It does not demonstrate that the complete application is implemented or tested.

The reported Kali webcam and Human browser demonstration is an initial proof of concept.

Keycloak integration, application callback handling, server-side face matching, protected operations and security testing still require verification.

Record actual progress in [Implementation Status](IMPLEMENTATION_STATUS.md).

Do not commit passwords, client secrets, OTP seeds, facial images, biometric descriptors or authentication tokens.

**Phase 2 deadline:** 30 November 2026.
