# Phase 03 Verification - Program Planning and Daily Workout Surface

Date: 2026-03-04
Verifier: Codex
Phase goal: Generate actionable weekly programming and present today's planned workout.
Phase requirement IDs: PROG-01, PROG-02, PROG-03, DASH-01.
Final status: passed

## Scope and Method
- Reviewed all execute plans in this phase: `03-01-PLAN.md`, `03-02-PLAN.md`, `03-03-PLAN.md`, `03-04-PLAN.md`.
- Checked `must_haves` (truths/artifacts/key links) against implemented code artifacts.
- Cross-referenced frontmatter `requirements` IDs against `.planning/REQUIREMENTS.md`.
- Ran focused verification tests:
  - `corepack pnpm test tests/program/contracts.test.ts tests/program/program-dal.test.ts tests/program/planner.test.ts tests/program/program-generate-route.test.ts tests/program/dashboard-today-surface.test.ts tests/program/substitution.test.ts`
  - Result: 32 passed, 0 failed.

## Required Check 1: Must-Haves vs Implemented Artifacts

### Plan 03-01 (Foundation: schema/contracts/catalog/DAL)
Status: satisfied

Truth checks:
- Authenticated user can receive 7-day plan with per-exercise prescriptions:
  - Implemented in planner + generation route/service + persistence (`src/lib/program/planner.ts`, `src/server/services/program-generation.ts`, `src/app/api/program/generate/route.ts`, `src/server/dal/program.ts`).
  - Test evidence: `tests/program/planner.test.ts`, `tests/program/program-generate-route.test.ts`.
- Invalid payloads rejected deterministically before use:
  - Implemented parse helpers and route validation (`src/lib/program/contracts.ts`, `src/app/api/program/generate/route.ts`).
  - Test evidence: invalid payload returns 400 in `tests/program/program-generate-route.test.ts`.
- Account isolation for program data:
  - Implemented account-scoped DAL and ownership assertions (`src/server/dal/program.ts`, account-scope use + ownership checks).
  - Test evidence: account boundary rejection in `tests/program/program-dal.test.ts`.

Artifact checks:
- `prisma/schema.prisma`: contains `ProgramPlan`, `PlannedSession`, `PlannedExercise` models linked to `User` and prescription fields.
- `src/lib/program/contracts.ts`: exports `parseProgramGenerateInput` and `parseProgramTodayResponse` with strict Zod contracts.
- `src/server/dal/program.ts`: exports `createProgramDal` with create/read/substitution ownership logic.

Key links:
- DAL uses Prisma program models (`programPlan`, `plannedSession`, `plannedExercise`) in `src/server/dal/program.ts`.
- Contracts parse helpers are consumed in API routes (`parseProgramGenerateInput` in generate route, today/session parsing in selectors/routes).

### Plan 03-02 (Deterministic weekly generation + endpoint)
Status: satisfied

Truth checks:
- Deterministic 7-day sliding split from profile constraints:
  - `buildWeeklyProgramPlan` with deterministic day offsets, equipment/limitation filtering, and anchor-date window (`src/lib/program/planner.ts`).
  - Test evidence: exact target sessions/window and deterministic regeneration in `tests/program/planner.test.ts`.
- Planned exercises include sets/reps/load/rest range:
  - Planner output includes `sets`, `targetReps`, `targetLoad`, `restMinSec`, `restMaxSec`.
  - Test evidence: prescription assertions in `tests/program/planner.test.ts` and contract schema in `tests/program/contracts.test.ts`.
- Regeneration preserves continuity:
  - Previous-plan continuity map used in planner (`previousByDayPattern` in `src/lib/program/planner.ts`).
  - Test evidence: continuity test in `tests/program/planner.test.ts`.

Artifact checks:
- `src/lib/program/planner.ts`: exports `buildWeeklyProgramPlan`.
- `src/app/api/program/generate/route.ts`: authenticated `POST` with validated payload and scoped user context.
- `tests/program/planner.test.ts`: covers constraints, prescriptions, continuity.

Key links:
- Generate route calls planner/service path (`buildWeeklyProgramPlan` via program-generation service).
- Generate path persists through program DAL (`replaceActivePlan` via `createProgramDal`).

### Plan 03-03 (Today/next APIs + dashboard top block)
Status: satisfied

Truth checks:
- Dashboard has compact Today Workout card as top block:
  - Dashboard renders `TodayWorkoutCard` before secondary content (`src/app/(private)/dashboard/page.tsx`).
- Fallback to next planned session when no today session:
  - Selection logic in `selectTodayWorkoutProjection`, `pickDashboardSession`, `resolveDisplayedSession`.
  - Test evidence: fallback tests in `tests/program/dashboard-today-surface.test.ts`.
- Exercise-level details with prescription fields:
  - Card fetches `/api/program/sessions/:sessionId` and displays sets/reps/load/rest (`src/app/(private)/dashboard/_components/today-workout-card.tsx`).
  - Test evidence: session detail prescription assertions in `tests/program/dashboard-today-surface.test.ts`.
- Primary action is `Commencer seance`:
  - `getPrimaryActionLabel('start_workout') => 'Commencer seance'` in card component.
  - Test evidence in `tests/program/dashboard-today-surface.test.ts`.

Artifact checks:
- `src/app/api/program/today/route.ts`: `GET` implemented.
- `src/app/(private)/dashboard/_components/today-workout-card.tsx`: compact UI + detail expansion + CTA label.
- `src/app/(private)/dashboard/page.tsx`: top-priority placement and today API loading.

Key links:
- Dashboard fetches `/api/program/today`.
- Card fetches `/api/program/sessions/${session.id}` for details.

### Plan 03-04 (Safe substitution workflow)
Status: satisfied

Truth checks:
- Strict-safe Top 3 substitutions:
  - `getSubstitutionCandidates` enforces max 3 and deterministic ordered filtering (`src/lib/program/substitution.ts`).
  - Test evidence in `tests/program/substitution.test.ts`.
- Candidates respect limitations/equipment/movement compatibility:
  - Explicit filters for movement pattern, blocked limitations, and equipment in substitution module.
  - Test evidence in `tests/program/substitution.test.ts`.
- Apply allowed only for today and mutates only targeted row:
  - Today-only date gate in `applyPlannedExerciseSubstitution`.
  - Row-local DAL update via `applyPlannedExerciseSubstitution` in program DAL.
  - Test evidence: non-today rejected and sibling row unchanged in `tests/program/substitution.test.ts`.

Artifact checks:
- `src/lib/program/substitution.ts`: exports `getSubstitutionCandidates` and `applyPlannedExerciseSubstitution`.
- Candidate route implemented: `src/app/api/program/exercises/[plannedExerciseId]/substitutions/route.ts` (`GET`).
- Apply route implemented: `src/app/api/program/exercises/[plannedExerciseId]/substitute/route.ts` (`POST`).

Key links:
- Candidate route invokes `getSubstitutionCandidates`.
- Apply route persists through DAL substitution update method.

## Required Check 2: Requirement ID Cross-Reference

Plan frontmatter requirement IDs found:
- `03-01`: PROG-01, PROG-02
- `03-02`: PROG-01, PROG-02
- `03-03`: DASH-01, PROG-02
- `03-04`: PROG-03

Cross-reference against `.planning/REQUIREMENTS.md`:
- PROG-01: present and marked complete (Program Planning section)
- PROG-02: present and marked complete (Program Planning section)
- PROG-03: present and marked complete (Program Planning section)
- DASH-01: present and marked complete (Dashboard section)

Accounting result:
- Every phase 03 plan requirement ID is present in requirements source and accounted for.
- No orphaned or missing requirement IDs detected.

## Required Check 3: Status Decision
- Decision: passed
- Rationale: all must-have checks map to concrete code + tests; required IDs are fully accounted for; focused phase test suite is fully green.

## Required Check 4: Structured Findings Summary
- No blocking gaps found for the declared phase goal and requirement IDs.
- Evidence indicates goal achievement for actionable weekly program generation and today workout dashboard surface.

## Required Check 5: Gaps and Gap-Closure Prompts
- No missing items detected in this verification scope.
- Gap-closure prompts: not required.
