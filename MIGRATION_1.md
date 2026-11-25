# Apply the Kali flexible 2FA redesign

This update was prepared against `main` commit `923d3fe5203586a7e322bf42b82b277cd4b8f8d1` of `yr5hg/Voice-Verification-Security-System` (25 November 2026). GitHub read succeeded, but the write integration returned HTTP 403 when creating a branch. Nothing was changed remotely. The old feature branches `feature/protected-backend` and `feature/speaker-verification` were not modified. Review before merging.

## Apply in Windows PowerShell (Git installed)

From your local repository root, first check `git status`. Commit/stash existing work safely; do not overwrite uncommitted changes. Fetch and switch to main; verify the baseline hash. If main advanced, review changes and resolve manually instead of blindly overwriting.

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git rev-parse HEAD
git switch -c redesign/kali-flexible-2fa
```

Extract the zip contents directly into repository root, replacing the six existing content files. For example, replace the zip path with the actual download location:

```powershell
Expand-Archive -LiteralPath "$HOME\Downloads\kali-flexible-2fa-repository-update.zip" -DestinationPath . -Force
```

If applying to original main, remove only the empty old placeholders (all were verified on main), replaced by real documentation and the revised folders:

```powershell
git rm -- backend/.gitkeep frontend/.gitkeep frontend/js/.gitkeep keycloak/.gitkeep voice-service/.gitkeep tests/.gitkeep docs/phase2/.gitkeep
git status --short
git add -- README.md PROJECT_REQUIREMENTS.md TEAM_RESPONSIBILITIES.md .env.example .gitignore contracts/api.md keycloak/ voice-recording/ voice-service/ access-control/ tests/ docs/ MIGRATION.md
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only
git commit -m "Support password plus chosen TOTP or SpeechBrain voice verification on Kali"
git push -u origin redesign/kali-flexible-2fa
```

If you already applied the earlier 3FA package, start from your clean updated branch instead, create `redesign/kali-flexible-2fa`, extract over the existing documentation, skip the `git rm` command if placeholders were already removed, and review changes before committing. Do not overwrite teammates’ implementation work.

Open the resulting PR to main, review with team, and merge when approved. Do not merge obsolete backend or HTTP-service branches wholesale; create new feature branches after the new baseline is accepted. Yousef may review and selectively reuse the existing local Python voice comparison code only. If the zip is extracted with a parent folder by another archive tool, copy the contents, not the parent folder.

## Scope and limits

All six nonempty main files were rewritten. Seven `.gitkeep` placeholders are retired; new component READMEs, setup, architecture, test matrix and migration guide replace them. No new executable project code or dependency lockfile is provided; this is the revised specification and implementation plan, not a completed MFA application. SpeechBrain installation on Kali, the local comparison adapter, two client-specific device flows, tool approval and restricted gate remain feasibility checks. The assignment keeps Omar on Keycloak/TOTP, Yousef on voice, Sara on capture, Hamzeh on testing, and assumes Anas is the requester taking integration. Confirm if that assumption is incorrect. Do not delete old history or branches.
