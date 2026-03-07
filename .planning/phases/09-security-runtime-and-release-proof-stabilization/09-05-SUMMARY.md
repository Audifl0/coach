---
phase: 09-security-runtime-and-release-proof-stabilization
plan: 09-05
subsystem: infra
tags: [ops, node22, dashboard, logging, pino, restore-drill]
requires:
  - phase: 09-01
    provides: explicit degraded dashboard states worth logging during release validation
  - phase: 09-04
    provides: stable today/session detail contracts for authenticated smoke verification
provides:
  - Centralized phase-09 operator env contract for deploy, restore, and authenticated smoke flows
  - Authenticated dashboard smoke that proves login plus account-scoped today data
  - Minimal allowlisted logging for critical program-route failures and dashboard degraded paths
affects: [dashboard, api, ops, release-proof, restore-drill]
tech-stack:
  added: []
  patterns:
    - source env files before ops smoke execution so deploy and restore flows use the documented contract
    - log only failure and degraded-path envelopes at server boundaries, never success-path request payloads
key-files:
  created:
    - src/server/env/ops-config.ts
    - infra/scripts/smoke-authenticated-dashboard.mjs
    - src/server/observability/app-logger.ts
  modified:
    - .env.example
    - docs/operations/vps-deploy.md
    - docs/operations/restore-drill-runbook.md
    - infra/scripts/deploy.sh
    - infra/scripts/run-restore-drill.sh
    - src/server/dashboard/program-dashboard.ts
    - src/app/api/program/today/route-handlers.ts
    - src/app/api/program/trends/route-handlers.ts
    - src/app/api/program/history/route-handlers.ts
    - src/app/api/program/sessions/[sessionId]/route-handlers.ts
    - tests/ops/authenticated-dashboard-smoke.test.ts
    - tests/ops/restore-drill.test.ts
key-decisions:
  - "Kept the phase-09 ops contract narrow around APP_DOMAIN, restore guardrails, and OPS_SMOKE_* variables instead of absorbing unrelated provider or pipeline env."
  - "Authenticated release smoke proves business data by logging in and validating /api/program/today focus labels, not by treating dashboard status codes as sufficient evidence."
  - "Structured logging stays allowlisted and server-boundary-only: route, method, status, source, errorName, and degraded dashboard boundary/reason."
patterns-established:
  - "Release-proof scripts source the env file before reading smoke inputs so documented operator config matches runtime behavior."
  - "Dashboard degraded states can emit explicit warn-level evidence without turning normal ready-path requests into telemetry noise."
requirements-completed: [DASH-01, PLAT-02]
duration: 12 min
completed: 2026-03-07
---

# Phase 09 Plan 05: Env contract, authenticated smoke, and structured critical-failure logging Summary

**Centralized release-proof env inputs, cookie-based authenticated dashboard smoke, and allowlisted server failure logging for critical dashboard/program paths**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-07T18:38:42Z
- **Completed:** 2026-03-07T18:50:27Z
- **Tasks:** 3
- **Files modified:** 19

## Accomplishments
- Added one narrow ops config contract and aligned `.env.example` plus the deploy/restore runbooks around the same variable names.
- Deepened deploy and restore proof from anonymous reachability into authenticated dashboard sanity by logging in and checking account-scoped today data.
- Added minimal structured logging for critical route failures and 09-01 degraded dashboard states without logging success-path payloads.

## Task Commits

Each task was committed atomically:

1. **Task 1: Centralize the release-facing env contract and authenticated smoke configuration**: `8eb2966` (test), `26fdf81` (feat)
2. **Task 2: Add authenticated dashboard smoke for deploy and restore evidence**: `8d6836e` (test), `20b9d13` (feat)
3. **Task 3: Add minimal structured logging for critical route and degraded-path failures**: `4a6c0a3` (test), `b3a165a` (feat)

## Files Created/Modified
- `src/server/env/ops-config.ts` - Parses and validates the release-facing env contract for deploy, restore, and smoke flows.
- `.env.example` - Documents the narrow phase-09 operator contract, including the smoke-account variables.
- `docs/operations/vps-deploy.md` - Aligns deploy instructions with the centralized ops contract and authenticated smoke expectations.
- `docs/operations/restore-drill-runbook.md` - Documents restore-drill inputs and authenticated verification markers.
- `infra/scripts/smoke-authenticated-dashboard.mjs` - Logs in with Node 22 `fetch`, preserves the session cookie, and validates today-route business data.
- `infra/scripts/deploy.sh` - Sources the env file and runs authenticated smoke after HTTPS reachability succeeds.
- `infra/scripts/run-restore-drill.sh` - Sources the env file and appends authenticated smoke evidence to restore-drill logs.
- `src/server/observability/app-logger.ts` - Defines the allowlisted structured logger for route failures and degraded dashboard states.
- `src/server/dashboard/program-dashboard.ts` - Emits explicit degraded-path logs only when today/trends loaders fail.
- `src/app/api/program/today/route-handlers.ts` - Logs critical unexpected failures before returning a bounded 500 response.
- `src/app/api/program/trends/route-handlers.ts` - Logs trend-summary boundary failures without exposing request details.
- `src/app/api/program/history/route-handlers.ts` - Logs unexpected history-load failures with the same allowlisted envelope.
- `src/app/api/program/sessions/[sessionId]/route-handlers.ts` - Logs unexpected session-detail failures at the route boundary.
- `tests/ops/authenticated-dashboard-smoke.test.ts` - Covers ops contract parsing, authenticated smoke behavior, and structured logging expectations.
- `tests/ops/restore-drill.test.ts` - Locks the restore-drill authenticated verification marker and helper wiring.

## Decisions Made
- Reused one `OPS_SMOKE_*` credential-and-evidence contract across docs, env examples, and scripts so operators have a single source of truth for phase-09 release proof.
- Required authenticated smoke to validate a known focus label from `/api/program/today`, which proves account-scoped business data instead of anonymous page reachability.
- Used allowlisted log envelopes and explicit degraded-path events rather than broad request logging, so failure evidence is useful without leaking payloads or turning this into a larger observability rewrite.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The workflow instructions referenced `~/.claude/get-shit-done/bin/gsd-tools.cjs`, but this workspace exposes the same tooling under `~/.codex/get-shit-done/bin/gsd-tools.cjs`. Execution continued with the equivalent `.codex` path.

## User Setup Required

- Populate `APP_DOMAIN`, `POSTGRES_DB`, `RESTORE_TARGET_DB`, `RESTORE_DRILL_BASE_URL`, and the `OPS_SMOKE_*` variables in the external env file used by deploy/restore scripts.
- Provision the dedicated non-production smoke account referenced by `OPS_SMOKE_USERNAME` / `OPS_SMOKE_PASSWORD`.
- Ensure that smoke account has dashboard data whose focus label matches `OPS_SMOKE_EXPECTED_FOCUS_LABEL` before relying on deploy or restore evidence.

## Next Phase Readiness
- Deploy and restore flows now have the authenticated proof and logging hooks needed for the remaining release-proof wrapper work in `09-03`.
- No blockers identified; the remaining phase-09 gap is composing the final release-proof workflow around the stabilized scripts and route evidence.

## Self-Check: PASSED

- Found `.planning/phases/09-security-runtime-and-release-proof-stabilization/09-05-SUMMARY.md`
- Found commits `8eb2966`, `26fdf81`, `8d6836e`, `20b9d13`, `4a6c0a3`, and `b3a165a`
