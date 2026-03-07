---
phase: 08-release-blockers-and-regression-restoration
plan: 08-03
subsystem: infra
tags: [docker, secrets, deploy, vps, operations]
requires:
  - phase: 08-02
    provides: "Release-blocker remediation baseline and clean continuation point for the remaining production-env hardening work."
provides:
  - "Git ignore coverage for repo-root production env files."
  - "Docker build-context exclusion for `.env*` and local secret-bearing artifacts."
  - "Deploy, backup, restore, and restore-drill guidance aligned on `/opt/coach/.env.production` outside the repository checkout."
affects: [09-security-runtime-and-release-proof-stabilization, deploy, backups, restore-drills]
tech-stack:
  added: []
  patterns:
    - "Production env files live outside the repository checkout and are passed into scripts explicitly."
    - "Secret-bearing local artifacts are blocked by both gitignore and dockerignore safety nets."
key-files:
  created: []
  modified:
    - .gitignore
    - .dockerignore
    - docs/operations/vps-deploy.md
    - docs/operations/data-protection.md
    - docs/operations/restore-drill-runbook.md
    - infra/scripts/deploy.sh
    - infra/scripts/backup.sh
    - infra/scripts/restore.sh
    - infra/scripts/run-restore-drill.sh
    - infra/systemd/coach-restore-drill.service
key-decisions:
  - "The documented production env path is `/opt/coach/.env.production`, kept outside the repo and passed into existing scripts via explicit `ENV_FILE` arguments."
  - "`.dockerignore` excludes `.env*` and related local artifacts so Docker builds cannot rely on operator discipline to keep secrets out of build context."
patterns-established:
  - "Operational scripts default to an external env file path but remain overrideable by explicit arguments."
  - "Release-safety guardrails are documented in both operator runbooks and repository ignore rules."
requirements-completed: [PLAT-01, PLAT-03]
duration: 26 min
completed: 2026-03-07
---

# Phase 08 Plan 03: Production Env Guardrails Summary

**Git and Docker build-context guardrails now exclude production env files while VPS deploy, backup, restore, and restore-drill flows consume `/opt/coach/.env.production` outside the repository checkout.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-03-07T10:05:51Z
- **Completed:** 2026-03-07T10:32:18Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Added repository and Docker safety-net exclusions so repo-root production env variants are ignored by git and omitted from Docker build context.
- Updated operator documentation and shell/systemd defaults to use `/opt/coach/.env.production` while preserving explicit `ENV_FILE`-style script contracts.
- Closed the release blocker with checkpointed Docker proof handling: the repo-root sentinel stayed uncommitted, local daemon access remained blocked for this agent, and the user-confirmed manual Docker proof was accepted as the final gate evidence.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add repository and Docker build-context guardrails for production env files** - `f32bc46` (fix)
2. **Task 2: Align scripts and operator docs on an external production env path** - `316f26d` (fix)
3. **Task 3: Prove the Docker build path cannot ingest a repo-root production env sentinel** - `46664d9` (chore)

Plan metadata was committed separately after summary/state updates.

## Files Created/Modified
- `.gitignore` - Ignores `.env.production` and related repo-root production env variants.
- `.dockerignore` - Excludes `.env*` and other local secret-bearing artifacts from Docker build context.
- `docs/operations/vps-deploy.md` - Directs operators to `/opt/coach/.env.production` and explicit deploy invocations.
- `docs/operations/data-protection.md` - Aligns backup/restore guidance with the external env-file location.
- `docs/operations/restore-drill-runbook.md` - Uses the same external env path for restore-drill execution steps.
- `infra/scripts/deploy.sh` - Defaults `ENV_FILE` to `/opt/coach/.env.production`.
- `infra/scripts/backup.sh` - Defaults `ENV_FILE` to `/opt/coach/.env.production`.
- `infra/scripts/restore.sh` - Defaults `ENV_FILE` to `/opt/coach/.env.production`.
- `infra/scripts/run-restore-drill.sh` - Defaults `ENV_FILE` to `/opt/coach/.env.production`.
- `infra/systemd/coach-restore-drill.service` - References the same external production env path in service configuration.

## Decisions Made
- Kept the current deploy/backup/restore script contract instead of redesigning the env-loading model in this wave; scripts accept explicit env-file paths and now default to the external production location.
- Treated `.dockerignore` as a mandatory release-safety control, not an operator convenience, so repo-root `.env*` files are excluded from Docker build context by default.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Switched execution tooling from `~/.claude` to `~/.codex` GSD paths**
- **Found during:** Continuation startup
- **Issue:** The executor instructions referenced `~/.claude/get-shit-done/...`, but this workspace exposes the active GSD install under `~/.codex/get-shit-done/...`.
- **Fix:** Resolved all GSD workflow/template/state commands against the `~/.codex` install path.
- **Files modified:** None
- **Verification:** `sed` and `node` calls succeeded once they targeted `~/.codex/get-shit-done/...`.
- **Committed in:** Not code-affecting; execution-only adjustment

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope change. The deviation was limited to executor tooling path resolution.

## Issues Encountered
- Docker daemon access from this agent remained permission-blocked even after retrying the planned `docker build` proof outside the sandbox. Task 3 therefore closed using the checkpoint's user-confirmed manual Docker proof, while this continuation still verified `.gitignore` coverage and the external env-path alignment across docs/scripts.
- The temporary repo-root `.env.production` sentinel used for verification was removed before any staging, and no secret-bearing file was committed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 08 can proceed to the remaining release-blocker plans with production env handling documented outside the repo and protected by git/docker guardrails.
- No new blocker was introduced by this plan; the only unresolved limitation was local Docker daemon access for this agent session.

## Self-Check: PASSED
- Summary file exists at `.planning/phases/08-release-blockers-and-regression-restoration/08-03-SUMMARY.md`.
- Task commits `f32bc46`, `316f26d`, and `46664d9` are present in git history.

---
*Phase: 08-release-blockers-and-regression-restoration*
*Completed: 2026-03-07*
