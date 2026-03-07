---
phase: 08-release-blockers-and-regression-restoration
plan: 08-02
subsystem: api
tags: [typescript, nextjs, dashboard, llm, adaptive-coaching]
requires:
  - phase: 08-01
    provides: build-unblocking auth and contract fixes that exposed the remaining bounded typecheck clusters
provides:
  - shared dashboard and program route contracts aligned at the source boundary
  - profile completeness typing that validates the shape it reads without call-site suppressions
  - LLM provider adapters and adaptive services narrowed to current SDK metadata and nullable payload shapes
  - a green repo-wide typecheck gate for RB-01
affects: [08-03, dashboard, adaptive-coaching, release-verification]
tech-stack:
  added: []
  patterns: [shared contract exports for route/ui boundaries, provider wrapper narrowing for SDK union surfaces]
key-files:
  created: [.planning/phases/08-release-blockers-and-regression-restoration/08-02-SUMMARY.md]
  modified:
    - src/lib/program/contracts.ts
    - src/lib/profile/completeness.ts
    - src/server/llm/client.ts
    - src/server/llm/config.ts
    - src/server/llm/providers/openai-client.ts
    - src/server/llm/providers/anthropic-client.ts
    - src/server/services/adaptive-coaching.ts
    - tests/program/dashboard-today-surface.test.ts
    - tests/program/adaptive-coaching-provider-config.test.ts
key-decisions:
  - Shared dashboard and today-route session types remain centralized in src/lib/program/contracts.ts instead of duplicating local unions.
  - isProfileComplete now accepts unknown input and performs explicit object checks so callers do not need cast-based suppressions.
  - Provider adapters absorb SDK request-id, payload-shape, and mutable-schema quirks before adaptive services consume the results.
patterns-established:
  - Export shared route/view contracts from library boundaries and reuse them in both server and UI projections.
  - Normalize nullable provider metadata in the adapter layer before downstream services or tests inspect fallback details.
requirements-completed: [ADAP-01, ADAP-02, ADAP-03, SAFE-03, PLAT-01]
duration: 19 min
completed: 2026-03-07
---

# Phase 08 Plan 02: Release Blocker Typecheck Restoration Summary

**Shared dashboard/program contracts, profile completeness guards, and adaptive provider wrappers now compile cleanly under a repo-wide TypeScript gate**

## Performance

- **Duration:** 19 min
- **Started:** 2026-03-07T09:09:28Z
- **Completed:** 2026-03-07T09:28:08Z
- **Tasks:** 4
- **Files modified:** 26

## Accomplishments

- Restored the dashboard/today-route shared session contract boundary and removed local state drift.
- Generalized profile completeness typing so dashboard and profile routes compile without `as never` workarounds.
- Reconciled provider/adaptive typing drift across runtime config, SDK wrappers, evidence loading, and the affected regression fixtures.
- Closed RB-01 with a green full-repo `corepack pnpm typecheck` gate.

## Task Commits

Each task was committed atomically:

1. **Task 1: Repair dashboard and today-route contract drift at the shared type boundary** - `6d6ebb5`, `69264d1`
2. **Task 2: Generalize profile completeness typing without changing profile behavior** - `9d9ebd4`
3. **Task 3: Reconcile provider and adaptive typing drift, then fix only the fallout fixtures** - `811591a`, `7bce739`
4. **Task 4: Close RB-01 with the repo-wide typecheck gate** - `e49573b`

_Note: Tasks 1 and 3 followed TDD and therefore produced separate RED and GREEN commits._

## Files Created/Modified

- `src/lib/program/contracts.ts` - Centralized the shared dashboard/today-session contract exports.
- `src/app/api/program/today/route.ts` - Consumes the shared today-session candidate contract directly.
- `src/app/(private)/dashboard/page.tsx` - Reused shared dashboard contracts and removed profile completeness suppressions.
- `src/lib/profile/completeness.ts` - Validates the minimal object shape it reads from unknown input.
- `src/server/llm/client.ts` - Narrows fallback metadata access safely across provider result variants.
- `src/server/llm/providers/openai-client.ts` - Handles current SDK request-id and payload response shapes safely.
- `src/server/llm/providers/anthropic-client.ts` - Builds mutable JSON schema arrays for the Anthropic SDK contract.
- `src/server/services/adaptive-coaching.ts` - Aligns policy recommendation conversion with writable service types.
- `tests/program/adaptive-coaching-provider-config.test.ts` - Covers realistic partial env fixtures at the config boundary.
- `tests/program/program-session-logging-route.test.ts` - Repairs logging route fixtures that drifted after shared contract tightening.

## Decisions Made

- Kept the RB-01 scope bounded to the clusters documented in `08-RESEARCH.md` and repaired drift at shared boundaries rather than adding new suppressions.
- Used adapter-layer normalization for provider SDK quirks instead of widening downstream service types.
- Recorded the repo-wide typecheck gate as an explicit task commit so the execution history remains task-complete even though the task produced no source diff.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended substitution route profile projections to match the stricter limitation input**
- **Found during:** Task 3 (Reconcile provider and adaptive typing drift, then fix only the fallout fixtures)
- **Issue:** Tightening substitution limitation typing exposed that both substitution routes omitted `temporality`, which blocked the targeted typecheck cluster from closing.
- **Fix:** Widened the route-local profile shapes to project the full limitation fields expected by the substitution helper.
- **Files modified:** `src/lib/program/substitution.ts`, `src/app/api/program/exercises/[plannedExerciseId]/substitute/route.ts`, `src/app/api/program/exercises/[plannedExerciseId]/substitutions/route.ts`
- **Verification:** `corepack pnpm test -- tests/program/adaptive-coaching-provider-config.test.ts tests/program/program-session-logging-route.test.ts tests/program/program-dal.test.ts tests/program/substitution.test.ts`, `corepack pnpm typecheck`
- **Committed in:** `7bce739`

**2. [Rule 3 - Blocking] Normalized nullable adaptive recommendation fixtures in downstream service tests**
- **Found during:** Task 3 (Reconcile provider and adaptive typing drift, then fix only the fallout fixtures)
- **Issue:** Stricter provider/adaptive record typing surfaced stale service and integration fixtures that assumed non-null persisted recommendation metadata.
- **Fix:** Added test helpers that materialize persisted recommendation records with the nullable fields the runtime now enforces.
- **Files modified:** `tests/program/adaptive-coaching-provider-integration.test.ts`, `tests/program/adaptive-coaching-service.test.ts`
- **Verification:** `corepack pnpm typecheck`
- **Committed in:** `7bce739`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were direct blockers caused by the targeted type-boundary repairs. No scope creep beyond RB-01.

## Issues Encountered

- `git add` intermittently hit `.git/index.lock`; staging proceeded safely with sequential adds after removing the stale lock file.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RB-01 is restored and the repo is back to a trustworthy typecheck baseline for the remaining release-blocker work.
- The next wave can treat dashboard/program/provider typing as stable inputs instead of carrying forward local suppressions.

## Self-Check: PASSED
