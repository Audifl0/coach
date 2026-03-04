# Phase 4: Session Logging and History - Research

**Researched:** 2026-03-04
**Domain:** Workout execution logging, completion feedback, and recent history retrieval
**Confidence:** HIGH

## User Constraints

## Implementation Decisions

### Set logging flow and workout duration
- Main logging mode is set-by-set entry.
- Effort metric is RPE, optional on each set.
- Set entries are saved immediately (auto-save).
- User can edit logged sets freely during the workout.
- Workout timer starts on first logged set.
- Workout timer stops on explicit workout completion action.
- Timer continues in background if user leaves and returns before ending workout.
- Timer is visible continuously during workout.
- User can manually correct workout duration after completion:
  - correction window: within 24 hours
  - no correction amplitude limit

### Skipped exercises and notes
- Skip applies at whole-exercise level (not per set).
- Skip reason is required immediately when user taps skip.
- Skip reason format is structured list plus optional free text.
- Skip can be reverted during the same workout session.
- Minimal notes capability is included in phase 4:
  - note is optional
  - note can be entered anytime during workout
  - no friction prompt if user leaves note empty
  - max length: 280 characters

### Post-session feedback
- Feedback is prompted right after explicit workout completion.
- Collect both dimensions: fatigue and readiness.
- Scale format is 1-5 for both dimensions.
- Optional free-text post-session comment is allowed.

### Recent history behavior
- Phase 4 ships history list plus period filters (no advanced graphs yet).
- Period filters: 7d, 30d, 90d, and custom range.
- Session row summary shows: date, duration, exercise count, total load.
- Session detail drilldown shows all logged sets grouped by exercise.

### Claude's Discretion
- Exact microcopy and label wording in logging/history screens.
- Exact visual density and spacing for list/detail layouts.
- Exact empty/error states as long as decisions above remain intact.

## Deferred Ideas

- Detailed weight/set trend charts for history analytics are deferred to Phase 6 (`DASH-02` trends).
- AI interpretation of free notes is deferred to adaptation/coaching phases.

## Summary

This phase should extend the existing Phase 3 `program` domain rather than creating a parallel "workout" domain. Keep `PlannedSession`/`PlannedExercise` as the execution anchor, add execution tables/fields for logged sets, skip metadata, completion feedback, and duration metadata, and preserve strict account scoping through DAL helpers already used in current routes.

The repository already has the right patterns: dependency-injected route handlers, Zod boundary validation, account-scoped DAL operations, and `node:test` suites validating security/behavior separately for contracts, routes, and DAL logic. Planning should follow that same decomposition and add a thin service layer for cross-entity rules (first-set timer start, completion lock, duration correction window).

**Primary recommendation:** Plan Phase 4 around a single execution log model attached to `PlannedSession`, with autosave set upserts, explicit completion endpoint, and a history query endpoint backed by account-scoped DAL projections.

## Requirement Mapping (Phase 4)

- `LOG-01`: Persist per-set logs (`weight`, `reps`, optional `rpe`) with immediate autosave and edit support during active session.
- `LOG-02`: Persist whole-exercise skip state with required reason code and optional reason text, plus same-session revert behavior.
- `LOG-03`: Persist completion-time feedback (`fatigue`, `readiness`, optional comment) and completion timestamp/duration logic.
- `LOG-04`: Expose history list filters (7d/30d/90d/custom) and session detail with sets grouped by exercise.

## Standard Stack

### Core
- Next.js App Router handlers under `src/app/api/program/*`.
- Prisma schema + migration flow under `prisma/schema.prisma` and `prisma/migrations/*`.
- Zod contract parsing in `src/lib/program/contracts.ts`.
- Account scope enforcement through `requireAccountScope`, `buildAccountScopedWhere`, and ownership assertions in DAL.
- `node:test` + `assert/strict` suites under `tests/program/*`.

### For this phase
- Extend `src/server/dal/program.ts` with logging/history methods (same ownership model as current substitution/session methods).
- Add execution service module under `src/server/services/` for multi-step invariants (timer start/stop, completion workflow, correction window checks).
- Extend dashboard private surface components for in-session logging state and history list/detail.

## Existing Code Patterns to Reuse

- Route factories with dependency injection and testable handlers (`createProgramGeneratePostHandler`, `createProgramTodayGetHandler`, substitution handlers).
- Consistent API boundary handling: JSON parse guard -> Zod parse -> deterministic status codes.
- DAL methods always derive scope from authenticated session and never trust caller `userId`.
- Projection helpers (`selectTodayWorkoutProjection`, `buildSessionDetailProjection`) to keep route logic thin.
- Tests separate concerns cleanly:
  - contracts (`tests/program/contracts.test.ts`)
  - DAL behavior/security (`tests/program/program-dal.test.ts`)
  - route status and payload behavior (`tests/program/*route*.test.ts`)
  - dashboard behavior helpers (`tests/program/dashboard-today-surface.test.ts`)

## Proposed Data Model Changes (Prisma)

Add execution fields to `PlannedSession`:
- `startedAt DateTime?` (set on first logged set)
- `completedAt DateTime?` (set on explicit completion)
- `effectiveDurationSec Int?` (computed at completion, optionally corrected)
- `durationCorrectedAt DateTime?` (tracks post-completion edit)
- `note String?` (max 280 via contract validation)
- `postSessionFatigue Int?` (1..5)
- `postSessionReadiness Int?` (1..5)
- `postSessionComment String?`

Add skip fields to `PlannedExercise`:
- `isSkipped Boolean @default(false)`
- `skipReasonCode String?`
- `skipReasonText String?`
- `skippedAt DateTime?`

Add new table `LoggedSet`:
- `id`, `plannedSessionId`, `plannedExerciseId`, `userId`
- `setIndex Int` (unique per planned exercise)
- `weight Decimal` (or `Int` if product constraint prefers integer units)
- `reps Int`
- `rpe Decimal?` (optional)
- `createdAt`, `updatedAt`
- indexes: `(userId, plannedSessionId)`, unique `(plannedExerciseId, setIndex)`

Rationale:
- Keeps execution history attached to existing account-scoped plan entities.
- Supports autosave upsert by deterministic key (`plannedExerciseId` + `setIndex`).
- Enables history projections without introducing another top-level session domain.

## API Surface Recommendation

- `POST /api/program/sessions/:sessionId/exercises/:plannedExerciseId/sets`
  - Create/update logged set (autosave semantics).
  - If first set of session, set `startedAt` if null.

- `PATCH /api/program/sessions/:sessionId/exercises/:plannedExerciseId/sets/:setIndex`
  - Edit existing set values during session.

- `POST /api/program/sessions/:sessionId/exercises/:plannedExerciseId/skip`
  - Body includes required reason code and optional text.

- `DELETE /api/program/sessions/:sessionId/exercises/:plannedExerciseId/skip`
  - Revert skip during same non-completed session.

- `PATCH /api/program/sessions/:sessionId/note`
  - Optional note, max 280 chars.

- `POST /api/program/sessions/:sessionId/complete`
  - Stops timer, sets completion, stores fatigue/readiness/comment.

- `PATCH /api/program/sessions/:sessionId/duration`
  - Allowed only if now <= completedAt + 24h.

- `GET /api/program/history?period=7d|30d|90d|custom&from=YYYY-MM-DD&to=YYYY-MM-DD`
  - Returns list rows: date, duration, exerciseCount, totalLoad.

- Extend existing `GET /api/program/sessions/:sessionId`
  - Include logged sets grouped by exercise for history/detail drilldown.

## Contracts and Validation Rules

Extend `src/lib/program/contracts.ts` with:
- `loggedSetInputSchema`:
  - `setIndex` int >= 1
  - `weight` positive
  - `reps` int >= 1
  - `rpe` optional constrained value
- `exerciseSkipInputSchema`:
  - `reasonCode` enum
  - `reasonText` optional trimmed string
- `sessionNoteInputSchema`:
  - optional trimmed string max 280
- `sessionCompleteInputSchema`:
  - `fatigue` and `readiness` int 1..5
  - optional `comment`
- `durationCorrectionInputSchema`:
  - positive integer seconds
- history query schema:
  - period enum + cross-field validation for custom ranges

Preserve current pattern: route handlers call parse helpers and return `400` for invalid payload/query.

## Architecture Patterns

### Pattern 1: DAL + Service split for execution rules
- DAL handles scoped reads/writes only.
- Service enforces rules that span entities/time:
  - first set starts timer
  - completion locks workflow
  - 24h correction window
  - skip revert blocked after completion

### Pattern 2: Immutable completion event with bounded correction
- `complete` endpoint is authoritative for ending session.
- Duration correction updates only `effectiveDurationSec` and `durationCorrectedAt` within window.

### Pattern 3: Projection-first history responses
- Build explicit DTO projection methods for history rows and detail shape (same approach as `select-today-session.ts`).
- Keep API response stable and independent from raw Prisma shapes.

## Don't Hand-Roll

- Do not infer ownership from route params alone; always enforce via session-scoped DAL queries.
- Do not trust client-reported timer start/stop timestamps as source of truth.
- Do not compute history total load on the client; return server-calculated values.
- Do not bypass Zod parsing for route body/query contracts.
- Do not allow edits to sets/skip/feedback after session completion unless explicitly allowed (`duration` correction only).

## Common Pitfalls

- Timer boundary bugs: session crossing midnight can break naive date comparisons.
- Timezone drift between `Date` math and `YYYY-MM-DD` history filters.
- Autosave race conditions causing duplicate set rows without unique `(plannedExerciseId, setIndex)` constraint.
- Completing a session without checking required feedback fields (fatigue/readiness).
- Allowing skip reason to be optional despite locked requirement that it is required.
- Forgetting to keep history query account-scoped when joining `LoggedSet`/`PlannedExercise`.
- Requirement interpretation drift: `REQUIREMENTS.md` says RPE/RIR, but phase decisions lock RPE optional now; keep contract extensible for future RIR without widening scope.

## Testing Strategy (Plan-ready)

Add/extend tests under `tests/program/`:

- `contracts.test.ts`
  - set logging schema validation (good/bad values)
  - skip reason required behavior
  - feedback scale 1..5 validation
  - history filter query validation

- `program-dal.test.ts`
  - set upsert behavior scoped by account
  - first-set timer start only once
  - skip apply/revert behavior
  - completion and duration-correction persistence
  - correction-window enforcement with injected `now`

- `program-session-logging-route.test.ts` (new)
  - unauthorized -> 401 across new endpoints
  - malformed payload -> 400
  - account mismatch -> 404
  - successful autosave/complete/history responses

- `dashboard-today-surface.test.ts`
  - logging surface selection/state transitions
  - history list filter mode logic (7d/30d/90d/custom)
  - detail response contains grouped sets per exercise

Implementation note: keep handlers dependency-injected and pass `now` function where time logic exists to keep tests deterministic.

## Suggested Plan Decomposition

1. Schema + contract foundation
- Prisma migration for `LoggedSet` and execution fields.
- Contract schemas and DTO parse helpers.

2. DAL + execution service
- Scoped DAL methods for set upsert, skip/revert, note, completion, duration correction, history list/detail projection.
- Service invariants for timer/completion windows.

3. API routes
- Add logging and completion endpoints.
- Add history list endpoint.
- Extend session detail endpoint with grouped logged sets.

4. Dashboard integration
- Add set-by-set logging UI and timer display/resume behavior.
- Add skip reason UI and note input.
- Add post-completion feedback prompt.
- Add recent history list with filters + detail drilldown.

5. Test hardening
- Expand contracts, DAL, and route tests.
- Validate ownership and temporal edge cases.

## Confidence by Area

- Repository pattern alignment: HIGH
- Data model recommendation: HIGH
- API decomposition: HIGH
- UI detail choices within discretion: MEDIUM

## RESEARCH COMPLETE
