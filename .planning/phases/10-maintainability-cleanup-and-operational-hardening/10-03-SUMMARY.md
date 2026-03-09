---
phase: 10-maintainability-cleanup-and-operational-hardening
plan: 10-03
subsystem: infra
tags: [security-hardening, caddy, backup, restore, cli, operations]
requires:
  - phase: 10-02
    provides: refactored stable app/runtime baseline used for hardening verification
provides:
  - non-echo admin password reset CLI flow with unchanged generic response semantics
  - encrypted streaming backup and restore scripts without plaintext SQL temp artifacts
  - low-risk Caddy browser-header hardening with operator reload and verification steps
affects: [auth-cli, ops-backup-restore, caddy-proxy, release-proof-docs, ops-tests]
tech-stack:
  added: []
  patterns:
    - CLI flow extracted into testable prompt/execute units with secret-input abstraction
    - shell streaming pipeline for encrypted-at-rest backup/restore operations
    - proxy-level pragmatic browser hardening headers with non-blocking CSP posture
key-files:
  created:
    - scripts/lib/secret-prompt.ts
    - tests/auth/admin-reset-cli.test.ts
    - tests/ops/caddy-header-policy.test.ts
  modified:
    - scripts/admin-reset-password.ts
    - infra/scripts/backup.sh
    - infra/scripts/restore.sh
    - infra/caddy/Caddyfile
    - tests/ops/restore-drill.test.ts
    - docs/operations/vps-deploy.md
    - docs/operations/data-protection.md
    - docs/operations/restore-drill-runbook.md
key-decisions:
  - "Kept src/lib/auth/admin-reset service unchanged and hardened only CLI input handling."
  - "Replaced file-based SQL dump/decrypt stages with streaming pg_dump|openssl and openssl -d|psql pipelines."
  - "Applied only low-risk proxy headers and report-only frame-ancestors guard instead of strict blocking CSP rollout."
patterns-established:
  - "Security-sensitive CLI prompts should use reusable non-echo wrappers and injectable seams for tests."
  - "Operational backup/restore paths should avoid normal-path plaintext intermediates."
requirements-completed: [AUTH-03, PLAT-01, PLAT-02, PLAT-03]
duration: 5 min
completed: 2026-03-09
---

# Phase 10 Plan 10-03: Maintainability Cleanup Summary

**Admin reset, encrypted backup/restore operations, and HTTPS proxy headers were hardened with focused tests while preserving established release-proof behavior.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T21:35:04Z
- **Completed:** 2026-03-09T21:40:23Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Hardened admin reset CLI password entry with hidden terminal echo while preserving existing username/confirmation and generic completion semantics.
- Converted backup and restore scripts to encrypted streaming flows that keep existing restore-target and fail-fast safety constraints.
- Added low-risk Caddy response headers plus deployment runbook steps for Caddy reload and explicit header verification on the existing release-proof path.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add non-echo secret prompting to the admin reset CLI without changing reset semantics** - `7aaafab` (feat)
2. **Task 2: Convert backup and restore to encrypted streaming flows with the existing guardrails intact** - `7652e01` (feat)
3. **Task 3: Add low-risk browser hardening headers to the Caddy entrypoint and document deployment verification** - `c613098` (feat)

## Files Created/Modified
- `scripts/admin-reset-password.ts` - extracted prompt/flow seams, lazy Prisma load, and preserved generic reset completion behavior.
- `scripts/lib/secret-prompt.ts` - reusable helper that requests hidden terminal echo for secret entry.
- `tests/auth/admin-reset-cli.test.ts` - CLI-level tests for prompt ordering, non-echo secret input contract, and generic completion behavior.
- `infra/scripts/backup.sh` - changed backup path to stream `pg_dump` output directly into OpenSSL encryption.
- `infra/scripts/restore.sh` - changed restore path to stream OpenSSL decrypt output directly into guarded `psql` replay.
- `tests/ops/restore-drill.test.ts` - added assertions for no plaintext SQL temp files and streaming backup/restore contract.
- `infra/caddy/Caddyfile` - added low-risk response hardening headers and report-only frame-ancestors policy.
- `tests/ops/caddy-header-policy.test.ts` - verifies required header policy and deploy-document verification instructions.
- `docs/operations/vps-deploy.md` - documented Caddy reload command and HTTPS header verification steps linked to release-proof flow.
- `docs/operations/data-protection.md` - documented streaming no-plaintext backup/restore behavior.
- `docs/operations/restore-drill-runbook.md` - documented streaming drill contract and plaintext avoidance.

## Decisions Made
- Kept `src/lib/auth/admin-reset.ts` untouched and limited hardening to CLI input handling and CLI-level tests.
- Preserved restore safety guardrails (`RESTORE_TARGET_DB`, `ON_ERROR_STOP`, `--single-transaction`, `set -euo pipefail`) while switching to streaming.
- Avoided strict CSP rollout and used low-risk headers plus report-only `frame-ancestors` to reduce breakage risk.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected GSD tools base path for this environment**
- **Found during:** Plan initialization
- **Issue:** `~/.claude/get-shit-done/bin/gsd-tools.cjs` was unavailable in this workspace.
- **Fix:** Switched to the available `~/.codex/get-shit-done/bin/gsd-tools.cjs` tooling path.
- **Files modified:** None (execution-environment adjustment only)
- **Verification:** `init execute-phase` and later state/roadmap commands ran successfully.
- **Committed in:** N/A (no repository file changes)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope expansion; tooling-path correction was required to execute the plan workflow.

## Issues Encountered
- `corepack pnpm release:proof /opt/coach/.env.production` cannot run in this workspace because `/opt/coach/.env.production` is not present.

## User Setup Required

External deployment verification still requires VPS execution:
- Reload Caddy on the target VPS after deploying the header policy updates.
- Run `corepack pnpm release:proof /opt/coach/.env.production` against the deployed HTTPS environment and capture header-check evidence alongside existing smoke proof.

## Next Phase Readiness
- Codebase is ready from local verification perspective: targeted tests, typecheck, full test suite, and build all pass.
- Remaining prerequisite is external deployed-environment verification/evidence capture for release-proof.

---
*Phase: 10-maintainability-cleanup-and-operational-hardening*
*Completed: 2026-03-09*

## Self-Check: PASSED
