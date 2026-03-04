---
phase: 03-program-planning-and-daily-workout-surface
plan: 03-04
subsystem: api
tags: [nextjs, program, substitution, safety, zod]
requires:
  - phase: 03-program-planning-and-daily-workout-surface
    provides: account-scoped planned exercise ownership and deterministic exercise catalog metadata
provides:
  - strict-safe substitution candidate selection capped at Top 3
  - authenticated substitution candidate and apply API endpoints
  - today-only row-local substitution enforcement
affects: [dashboard, program, api, testing]
tech-stack:
  added: []
  patterns: [dependency-injected route handlers, deterministic catalog-based substitution filters]
key-files:
  created:
    - src/lib/program/substitution.ts
    - src/app/api/program/exercises/[plannedExerciseId]/substitutions/route.ts
    - src/app/api/program/exercises/[plannedExerciseId]/substitute/route.ts
  modified:
    - tests/program/substitution.test.ts
    - src/lib/program/contracts.ts
key-decisions:
  - "Substitution eligibility remains deterministic and metadata-driven only (no fuzzy matching)."
  - "Equipment compatibility is strict-all-tags and limitation filtering is hard-fail."
  - "Apply route enforces today-only semantics before any mutation and updates only one planned exercise row."
patterns-established:
  - "Program substitution routes expose testable factory handlers with explicit dependency injection."
  - "Today-only mutation rules live in lib/program/substitution.ts and are reused by API handlers."
requirements-completed: [PROG-03]
duration: 4min
completed: 2026-03-04
---

# Phase 03 Plan 04: Strict-Safe Substitution Workflow Summary

**Strict-safe Top 3 substitution selection and today-only row-local apply endpoints were shipped with authenticated, account-scoped route handling.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-04T17:49:28Z
- **Completed:** 2026-03-04T17:53:59Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Implemented deterministic substitution filtering/ranking with hard limitations, equipment, and movement-pattern gates.
- Added authenticated candidate-list and substitution-apply API routes with account ownership checks.
- Enforced today-only substitution application and row-local mutation semantics validated by behavior tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add substitution behavior tests then implement strict filtering/ranking logic** - `552743c`, `b33041e` (test, feat)
2. **Task 2: Implement authenticated candidate/apply substitution routes** - `8a23ac9`, `5555087` (test, feat)

_Note: TDD tasks produced multiple commits (test -> feat)._

## Files Created/Modified
- `src/lib/program/substitution.ts` - Deterministic candidate selection and today-only substitution apply logic.
- `src/app/api/program/exercises/[plannedExerciseId]/substitutions/route.ts` - Authenticated candidate endpoint (Top 3, ownership-scoped).
- `src/app/api/program/exercises/[plannedExerciseId]/substitute/route.ts` - Authenticated apply endpoint with today-only enforcement.
- `src/lib/program/contracts.ts` - Added parseable substitution apply request contract.
- `tests/program/substitution.test.ts` - Safety filters, auth, ownership, today-only, and row-local mutation coverage.

## Decisions Made
- Use catalog compatibility metadata as the sole source of substitution truth.
- Reject any candidate requiring unavailable equipment tags instead of fallback matching.
- Return `400` for non-today and invalid replacement operations; return `404` for missing/non-owned planned exercises.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- A temporary `.git/index.lock` conflict occurred when two commit commands were mistakenly executed in parallel; resolved by removing the stale lock and committing sequentially.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Substitution workflow is ready for dashboard/UI integration and end-to-end user verification.
- No blockers identified.

---
*Phase: 03-program-planning-and-daily-workout-surface*
*Completed: 2026-03-04*

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/03-program-planning-and-daily-workout-surface/03-04-SUMMARY.md`.
- Verified task commits exist: `552743c`, `b33041e`, `8a23ac9`, `5555087`.
