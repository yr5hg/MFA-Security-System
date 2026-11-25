
# Apply the Face Verification and TOTP Redesign

This documentation update was prepared against `main` commit `dfcea59dccaf6ca18577d80bba4ff284d027872f` of [yr5hg/Voice-Verification-Security-System](https://github.com/yr5hg/Voice-Verification-Security-System) on 25 November 2026.

The previous migration used commit `923d3fe5203586a7e322bf42b82b277cd4b8f8d1`. The inspected repository baseline is newer.

No remote branch, commit or pull request was changed during preparation. Preserve existing code, feature branches, repository history and directory placeholders.

## Apply in Windows PowerShell (Git installed)

From the local repository root, ensure existing work is committed or safely stashed before starting.

```powershell
git status
git fetch origin
git switch main
git pull --ff-only origin main
git rev-parse HEAD
```

Compare the current commit with the inspected baseline. If `main` has advanced, review newer changes before replacing files.

Create a documentation branch:

```powershell
git switch -c redesign/face-totp-docs
```

## Apply the Documentation Update

Extract the update package outside the repository.

Use the [Copy to GitHub Guide](COPY_TO_GITHUB_GUIDE.md) and [File Mapping](FILE_MAPPING.md) to replace the ten existing populated files and add the six new documentation files.

- Keep setup, architecture, migration and test documents at the repository root.
- Keep the integration contract under `contracts/`.
- Preserve existing empty directories, placeholders and implementation code.
- Copy only the mapped files, not the archive's parent folder.
- Do not overwrite newer work from another team member.

## Review and Commit

After applying the files, inspect the changes:

```powershell
git status --short
git diff --stat
git diff --check
```

Once the working tree contains only the intended changes, stage and review them:

```powershell
git add -A
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only
```

Confirm that no secrets, biometric data or unrelated code are staged.

```powershell
git commit -m "Update documentation for TOTP and Human face verification"
git push -u origin redesign/face-totp-docs
```

Open a pull request to `main` and use the [Review Checklist](REVIEW_CHECKLIST.md) before merging.

## Scope and Limits

This migration replaces experimental SpeechBrain voice verification with face verification using the Human JavaScript library.

Every ordinary login requires a fresh Keycloak password authentication followed by one selected second factor: **TOTP or experimental Face Verification**.

The updated design uses browser camera capture, private Node.js face comparison, trusted session handling and role-based access control. All computer-side components run on Kali Linux without Python.

The five team members retain their assigned responsibilities. See [Team Responsibilities](TEAM_RESPONSIBILITIES.md) for individual tasks and integration milestones.

This package updates documentation and implementation plans. It does not provide a completed or tested authentication application.

The reported Kali webcam and Human browser demonstration is an initial proof of concept. Keycloak integration, server-side face matching, protected operations and security testing still require implementation and verification.

Record actual progress in [Implementation Status](IMPLEMENTATION_STATUS.md). Do not commit credentials, OTP secrets, facial images or biometric templates.

**Phase 2 deadline:** 30 November 2026.
