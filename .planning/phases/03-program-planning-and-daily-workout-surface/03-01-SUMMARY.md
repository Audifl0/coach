---
phase: 03-program-planning-and-daily-workout-surface
plan: 03-01
subsystem: database
tags: [prisma, zod, dal, program-planning]
requires:
  - phase: 02-profile-and-dashboard-onboarding
    provides: "AthleteProfile persistence and account-scoped auth/session boundaries"
provides:
  - "ProgramPlan, PlannedSession, and PlannedExercise persistence foundation"
  - "Program domain contracts and parse helpers for generation/today responses"
  - "Account-scoped DAL entry points for plan replacement, reads, and substitutions"
affects: [program-generation, daily-dashboard-surface, substitution-workflow]
tech-stack:
  added: []
  patterns: ["Rules-first deterministic catalog metadata", "Session-derived account scope for DAL access"]
key-files:
  created: [prisma/migrations/0003_program_planning_init/migration.sql, src/lib/program/contracts.ts, src/lib/program/types.ts, src/lib/program/catalog.ts, src/server/dal/program.ts, tests/program/contracts.test.ts, tests/program/program-dal.test.ts]
  modified: [prisma/schema.prisma]
key-decisions:
  - "Program persistence uses explicit status (`active`/`archived`) with DAL-driven active-plan replacement."
  - "All program DAL mutations/read filters are derived from authenticated session scope, never caller-provided userId."
  - "Substitution compatibility is strict and deterministic via explicit catalog metadata (no fuzzy matching)."
patterns-established:
  - "Program contracts expose parse helpers consumed by routes, mirroring existing profile/auth patterns."
  - "Program DAL returns today-first read model with next-session fallback for dashboard usage."
requirements-completed: [PROG-01, PROG-02]
duration: 15min
completed: 2026-03-04
---

# Phase 03 Plan 01: Program Foundation Summary

**Program-domain foundation ships Prisma plan/session/exercise entities with strict prescription contracts, deterministic catalog metadata, and account-scoped DAL entry points**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-04T17:42:19Z
- **Completed:** 2026-03-04T17:57:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments
- Added `ProgramPlan`, `PlannedSession`, and `PlannedExercise` schema/migration with ownership and scheduling indexes.
- Implemented reusable program contracts/types/catalog for fixed reps, target load, and rest range response shapes.
- Implemented account-scoped Program DAL methods for active-plan replacement, today/next session reads, planned-exercise ownership checks, and row-local substitutions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add program planning persistence models and migration** - `e5c6b3e` (feat)
2. **Task 2: Define program contracts, internal types, and deterministic catalog primitives** - `4276c86` (feat)
3. **Task 3: Implement account-scoped Program DAL entry points** - `a6425a5` (feat)

**Plan metadata:** Pending final docs commit

## Files Created/Modified
- `prisma/schema.prisma` - Added program planning models/relations/indexes.
- `prisma/migrations/0003_program_planning_init/migration.sql` - Added SQL DDL for program planning tables and constraints.
- `src/lib/program/types.ts` - Added enums/types for movement pattern, equipment, and session state.
- `src/lib/program/catalog.ts` - Added deterministic in-code exercise catalog with substitution compatibility metadata.
- `src/lib/program/contracts.ts` - Added Zod schemas and parse helpers for generate/today/session program payloads.
- `src/server/dal/program.ts` - Added account-scoped DAL API for replace/read/ownership/substitute flows.
- `tests/program/contracts.test.ts` - Added focused contract validation tests.
- `tests/program/program-dal.test.ts` - Added focused DAL behavior and ownership tests.

## Decisions Made
- Store prescriptions on planned exercise rows as explicit scalar fields (`sets`, `targetReps`, `targetLoad`, `restMinSec`, `restMaxSec`) instead of nested JSON for deterministic query/serialization behavior.
- Keep substitution safety metadata as code constants in `catalog.ts` for this phase to avoid adding catalog DB tables prematurely.
- Use `getTodayOrNextSessionCandidates` DAL projection as the stable boundary for dashboard and API read flows.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] GSD helper path mismatch in executor environment**
- **Found during:** Execution bootstrap
- **Issue:** `~/.claude/get-shit-done/bin/gsd-tools.cjs` does not exist in this workspace.
- **Fix:** Switched all workflow automation calls to available `~/.codex/get-shit-done/bin/gsd-tools.cjs`.
- **Files modified:** None
- **Verification:** `gsd-tools init execute-phase` succeeded from the `.codex` path.
- **Committed in:** N/A (execution environment handling)

**2. [Rule 3 - Blocking] Missing focused program tests required by plan verification commands**
- **Found during:** Task 2 and Task 3 verification setup
- **Issue:** `tests/program/contracts.test.ts` and `tests/program/program-dal.test.ts` did not exist, preventing required command execution.
- **Fix:** Added focused tests aligned to each task's verify command.
- **Files modified:** `tests/program/contracts.test.ts`, `tests/program/program-dal.test.ts`
- **Verification:** Both verify commands passed.
- **Committed in:** `4276c86`, `a6425a5`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** No scope creep; both changes were necessary to execute the plan deterministically.

## Issues Encountered
- `corepack pnpm prisma migrate dev --name program_planning_init --create-only` could not complete because no reachable PostgreSQL instance was configured in this environment (`DATABASE_URL` missing initially, then `localhost:5432` unreachable).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Program-domain schema/contracts/DAL boundaries are now in place for generation route implementation in `03-02`.
- Remaining prerequisite for full migration verification is a reachable PostgreSQL instance via `DATABASE_URL`.

---
*Phase: 03-program-planning-and-daily-workout-surface*
*Completed: 2026-03-04*

## Self-Check: PASSED

- Verified required summary and implementation files exist on disk.
- Verified task commit hashes exist in git history (`e5c6b3e`, `4276c86`, `a6425a5`).
