---
phase: 09-security-runtime-and-release-proof-stabilization
plan: 09-02
subsystem: database
tags: [postgres, prisma, concurrency, adaptive-coaching, session-logging, program-generation]
requires:
  - phase: 08-release-blockers-and-regression-restoration
    provides: dashboard/auth/runtime fixes used by the stabilized mutation paths
provides:
  - partial unique active-plan enforcement with deterministic generation conflicts
  - DAL-guarded session logging and completion writes under multi-tab races
  - typed adaptive stale-state conflicts and atomic reject-plus-fallback persistence
affects: [phase-09-release-proof, program-generation, session-logging, adaptive-coaching]
tech-stack:
  added: []
  patterns: [partial unique postgres index, DAL row-lock/conditional write guards, typed stale-state conflicts]
key-files:
  created: [prisma/migrations/0006_runtime_consistency_guards/migration.sql]
  modified:
    [
      prisma/schema.prisma,
      src/server/dal/program.ts,
      src/server/services/program-generation.ts,
      src/server/dal/adaptive-coaching.ts,
      src/server/services/adaptive-coaching.ts,
      tests/program/program-dal.test.ts,
      tests/program/program-generate-route.test.ts,
      tests/program/adaptive-coaching-service.test.ts,
      tests/program/adaptive-coaching-confirm-route.test.ts,
    ]
key-decisions:
  - "Enforce one active plan per user with a manual PostgreSQL partial unique index and translate duplicate-submit conflicts to HTTP 409 at generation boundaries."
  - "Move completion-sensitive session protection into the DAL with row locks and conditional updates so service prechecks are no longer the source of truth."
  - "Represent adaptive stale-state mismatches as typed DAL errors and persist reject-plus-fallback transitions inside one transaction."
patterns-established:
  - "Race-sensitive writes first validate ownership, then re-check mutable state inside the transaction boundary."
  - "Route-deterministic stale-state handling flows through typed service errors instead of generic persistence exceptions."
requirements-completed: [PROG-01, LOG-01, LOG-02, LOG-03, ADAP-01, ADAP-03, SAFE-03]
duration: 12min
completed: 2026-03-07
---

# Phase 09 Plan 09-02: Persistence Hardening Summary

**PostgreSQL-backed active-plan uniqueness, DAL-guarded session writes, and atomic adaptive reject fallback for deterministic critical mutations**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-07T18:09:27Z
- **Completed:** 2026-03-07T18:21:19Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Added a manual partial unique index so only one active program can exist per user and surfaced duplicate-submit races as deterministic `409` responses.
- Moved session-completion-sensitive protection into the program DAL so autosave, skip, note, and completion writes reject stale multi-tab races at write time.
- Added typed adaptive stale-state conflicts and an atomic reject-plus-fallback transaction so confirm/reject routes return deterministic `409` instead of leaking generic `500`s.

## Task Commits

Each task was committed atomically:

1. **Task 1: Enforce one active plan per user at the persistence boundary** - `0a7095d` (test), `0279601` (feat)
2. **Task 2: Move session-completion-sensitive write protection into the DAL transaction boundary** - `c940703` (test), `d0776c8` (feat)
3. **Task 3: Make adaptive confirm/reject transitions typed, atomic, and route-deterministic** - `a46a743` (test), `51806ac` (feat)

## Files Created/Modified
- `prisma/migrations/0006_runtime_consistency_guards/migration.sql` - Adds the partial unique index guarding active plans.
- `prisma/schema.prisma` - Documents the manual active-plan invariant at the schema boundary.
- `src/server/dal/program.ts` - Guards completion-sensitive writes with transaction-time checks and valid conditional persistence paths.
- `src/server/services/program-generation.ts` - Maps active-plan uniqueness conflicts to deterministic generation errors.
- `src/server/dal/adaptive-coaching.ts` - Adds typed stale-state conflicts and atomic reject-plus-fallback persistence.
- `src/server/services/adaptive-coaching.ts` - Translates typed stale-state conflicts to `409` and delegates rejection to the atomic DAL helper.
- `tests/program/program-dal.test.ts` - Covers stale session write races and single-writer completion behavior.
- `tests/program/program-generate-route.test.ts` - Covers service and route translation of active-plan conflicts.
- `tests/program/adaptive-coaching-service.test.ts` - Covers typed stale-state translation and atomic rejection delegation.
- `tests/program/adaptive-coaching-confirm-route.test.ts` - Covers deterministic `409` behavior for stale confirm/reject requests.

## Decisions Made
- Used a manual SQL partial unique index instead of schema-only Prisma metadata because the invariant applies only to `status = 'active'`.
- Kept session-logging service APIs stable and moved the mutable-state authority into DAL transactions and conditional writes.
- Kept adaptive coaching policy semantics unchanged while replacing generic mismatch failures with a typed stale-state path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced invalid Prisma scoped unique-write shapes while hardening DAL mutations**
- **Found during:** Task 2 and Task 3
- **Issue:** Existing DAL code used account-scoped `findUnique`/`update` shapes that do not match Prisma's real uniqueness boundary, which would undermine the runtime hardening work.
- **Fix:** Switched the guarded mutation paths to valid ownership checks plus `update`, `updateMany`, `findFirst`, and transaction-time rechecks/locks.
- **Files modified:** `src/server/dal/program.ts`, `src/server/dal/adaptive-coaching.ts`
- **Verification:** `corepack pnpm test tests/program/program-dal.test.ts tests/program/program-generate-route.test.ts tests/program/program-session-logging-route.test.ts tests/program/adaptive-coaching-service.test.ts tests/program/adaptive-coaching-confirm-route.test.ts`
- **Committed in:** `d0776c8`, `51806ac`

---

**Total deviations:** 1 auto-fixed (Rule 1: 1)
**Impact on plan:** The fix was required for the persistence-layer hardening to be correct at runtime; scope stayed inside the targeted mutation paths.

## Issues Encountered

- The generic workflow reference pointed to `~/.claude/get-shit-done`, but this repo uses the equivalent tooling under `~/.codex/get-shit-done`. Execution continued with the repo-local path.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan generation, session logging, and adaptive confirm/reject flows now have deterministic persistence-level behavior under duplicate submits and stale requests.
- Phase 09 release-proof work can assume stable `409` conflict semantics and stronger runtime invariants on the highest-risk mutation paths.

## Self-Check: PASSED
