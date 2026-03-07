---
phase: 09-security-runtime-and-release-proof-stabilization
plan: 09-03
subsystem: infra
tags: [ops, release-proof, deploy, smoke, runbook]
requires:
  - phase: 09-05
    provides: authenticated smoke credentials, dashboard sanity checks, and the narrow phase-09 ops env contract
  - phase: 08-release-blockers-and-regression-restoration
    provides: green typecheck/test/build and secret-safe deploy prerequisites the wrapper assumes
provides:
  - Single-command release proof that composes compile, test, build, deploy, HTTPS smoke, and authenticated dashboard sanity
  - Operator runbook with evidence markers and stop conditions for the narrow phase-09 release gate
  - Regression tests that lock the orchestration to existing deploy and smoke primitives
affects: [release-proof, deploy, ops, smoke, documentation]
tech-stack:
  added: []
  patterns:
    - shell-first release gates compose repo-native scripts instead of introducing CI-only orchestration
    - post-deploy evidence is explicit and ordered, with authenticated business-data smoke as a required gate
key-files:
  created:
    - infra/scripts/release-proof.sh
    - docs/operations/release-proof.md
  modified:
    - package.json
    - infra/scripts/deploy.sh
    - docs/operations/vps-deploy.md
    - tests/ops/release-proof.test.ts
key-decisions:
  - "Kept release proof as one shell wrapper around existing pnpm, deploy, HTTPS smoke, and authenticated smoke primitives instead of widening scope into CI or browser automation."
  - "Made release-proof own the explicit post-deploy smoke order while keeping deploy.sh's default smoke behavior for deploy-only workflows through an opt-out flag."
  - "Documented stage banners and authenticated smoke markers as the evidence contract so operators can prove business-data sanity, not just container startup."
patterns-established:
  - "Release-proof scripts emit deterministic stage markers that double as the operator evidence checklist."
  - "Deploy-only and release-proof flows share the same scripts, with orchestration differences controlled by small env hooks rather than forked implementations."
requirements-completed: [DASH-01, DASH-02, DASH-03, PLAT-02]
duration: 4 min
completed: 2026-03-07
---

# Phase 09 Plan 03: Release-proof script and operator evidence runbook Summary

**Shell-first release proof that reuses deploy and smoke primitives to verify compile, test, build, HTTPS reachability, and authenticated dashboard business data**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-07T18:54:07Z
- **Completed:** 2026-03-07T18:57:53Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added a single `release:proof` entrypoint and `infra/scripts/release-proof.sh` wrapper that runs the narrow release gate in deterministic order.
- Reused the existing deploy, HTTPS smoke, and authenticated dashboard smoke scripts instead of adding new CI or browser automation layers.
- Published a dedicated operator runbook that defines prerequisites, evidence markers, and stop conditions, then linked the VPS deploy runbook to it.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add a repo-native release-proof script that composes compile, test, build, deploy, and smoke gates**: `9a50755` (test), `2821524` (feat)
2. **Task 2: Publish the operator release-proof runbook and evidence contract**: `f65b5be` (fix)

## Files Created/Modified
- `infra/scripts/release-proof.sh` - Runs typecheck, tests, build, deploy, HTTPS smoke, and authenticated smoke in one fail-fast shell wrapper.
- `package.json` - Adds the `release:proof` package script for the repo-native entrypoint.
- `infra/scripts/deploy.sh` - Keeps deploy-only smoke by default while allowing release-proof to own explicit post-deploy smoke ordering.
- `docs/operations/release-proof.md` - Documents prerequisites, stage order, evidence expectations, and stop conditions for the release gate.
- `docs/operations/vps-deploy.md` - Links deploy operators to the release-proof runbook and the full release candidate command.
- `tests/ops/release-proof.test.ts` - Locks the wrapper ordering, primitive reuse, authenticated smoke requirement, and runbook cross-links.

## Decisions Made
- Reused the 09-05 authenticated smoke helper directly so release proof validates account-scoped business data instead of anonymous health only.
- Left deploy-only behavior intact and added a narrow `DEPLOY_SKIP_POST_DEPLOY_SMOKE` hook so only the release-proof wrapper changes orchestration ownership.
- Treated the wrapper's `==> ...` stage banners plus smoke markers as the auditable evidence contract operators should capture.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The workflow instructions referenced `~/.claude/get-shit-done/bin/gsd-tools.cjs`, but this workspace exposes the equivalent tooling under `~/.codex/get-shit-done/bin/gsd-tools.cjs`. Execution continued with the `.codex` path.

## User Setup Required

- Keep `APP_DOMAIN`, `OPS_SMOKE_USERNAME`, `OPS_SMOKE_PASSWORD`, and `OPS_SMOKE_EXPECTED_FOCUS_LABEL` populated in the external env file passed to release proof.
- Ensure the smoke account still owns dashboard data whose `/api/program/today` response includes the expected focus label before using the proof as release evidence.
- Run the wrapper only after the target branch/environment already satisfies the phase-08 prerequisite gates for typecheck, tests, build, deploy secrets, and auth throttling.

## Next Phase Readiness
- Phase 09 now has the missing final release-proof gate and operator evidence path; the phase can close once planning state is updated.
- No code blockers identified.

## Self-Check: PASSED

- Found `.planning/phases/09-security-runtime-and-release-proof-stabilization/09-03-SUMMARY.md`
- Found commits `9a50755`, `2821524`, and `f65b5be`
