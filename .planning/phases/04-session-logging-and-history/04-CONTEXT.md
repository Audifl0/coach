# Phase 4: Session Logging and History - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Capture reliable workout execution logs for completed sets, skipped exercises, post-session readiness/fatigue feedback, and recent session history review. This phase defines daily logging behavior and history browsing, without adding advanced trend analytics or coaching adaptation logic.

</domain>

<decisions>
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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/(private)/dashboard/page.tsx`: authenticated private surface and existing workout entry point to connect logging start/resume affordances.
- `src/app/(private)/dashboard/_components/today-workout-card.tsx`: existing today-session component pattern for compact action-first rendering.
- `src/server/dal/program.ts`: account-scoped session/exercise ownership boundaries that logging endpoints should reuse.
- `src/lib/auth/session-gate.ts`: existing session resolution pattern for authenticated route handlers.
- `src/lib/program/contracts.ts` and `src/lib/program/select-today-session.ts`: response contract + projection helpers to extend for logging/history payloads.

### Established Patterns
- Deterministic, account-scoped behavior with strict ownership checks.
- Zod-validated API contracts with explicit 4xx responses on invalid input.
- Route handler dependency-injection style in tests and production route factories.
- Dashboard UX is action-first and compact, with detail expansion where needed.

### Integration Points
- Add logging endpoints under `src/app/api/program/...` aligned with existing authenticated program routes.
- Extend DAL and contracts for set logs, skip reasons, feedback, duration, and history projections.
- Integrate logging controls and completion flow from existing dashboard today-workout surface.
- Add focused tests under `tests/program/` following existing red-green route/domain coverage style.

</code_context>

<specifics>
## Specific Ideas

- Effective workout duration should reflect actual training flow (first logged set to explicit finish), not passive app-open time.
- Logging must stay low-friction during workout; no nagging prompts for optional comments.
- History should remain simple and clean while still giving enough detail to inspect execution quality.

</specifics>

<deferred>
## Deferred Ideas

- Detailed weight/set trend charts for history analytics are deferred to Phase 6 (`DASH-02` trends).
- AI interpretation of free notes is deferred to adaptation/coaching phases.

</deferred>

---

*Phase: 04-session-logging-and-history*
*Context gathered: 2026-03-04*
