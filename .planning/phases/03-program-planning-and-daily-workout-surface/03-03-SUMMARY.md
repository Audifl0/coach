---
phase: 03-program-planning-and-daily-workout-surface
plan: 03-03
subsystem: ui
tags: [dashboard, nextjs, route-handlers, program]
requires:
  - phase: 03-02
    provides: Active planned sessions/exercises with account-scoped DAL access
provides:
  - Today-or-next workout projection endpoint for dashboard rendering
  - Session detail endpoint for exercise prescription expansion
  - Compact dashboard workout card with start action and detail toggle
affects: [dashboard, program-api, daily-workout]
tech-stack:
  added: []
  patterns: [contract-validated route responses, account-scoped detail filtering, server-to-route dashboard fetch]
key-files:
  created:
    - src/lib/program/select-today-session.ts
    - src/app/api/program/today/route.ts
    - src/app/api/program/sessions/[sessionId]/route.ts
    - src/app/(private)/dashboard/_components/today-workout-card.tsx
  modified:
    - src/server/dal/program.ts
    - src/app/(private)/dashboard/page.tsx
    - tests/program/dashboard-today-surface.test.ts
key-decisions:
  - "Dashboard loads /api/program/today from server side and always exposes primaryAction=start_workout."
  - "Session detail route applies an additional exercise-level ownership filter before returning prescriptions."
patterns-established:
  - "Daily workout surfaces use a deterministic today-first fallback model (today -> next -> none)."
  - "Dashboard interaction details are fetched on demand via compact card expansion."
requirements-completed: [DASH-01, PROG-02]
duration: 4 min
completed: 2026-03-04
---

# Phase 03 Plan 03: Daily Workout Dashboard Surface Summary

**Today-or-next workout APIs and a compact dashboard card now drive a single action-first daily workout surface with expandable prescriptions.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-04T17:56:37Z
- **Completed:** 2026-03-04T18:00:49Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Added `/api/program/today` to return a contract-validated today-or-next projection with `primaryAction: "start_workout"`.
- Added `/api/program/sessions/:sessionId` detail API for exercise-level prescription fields with account-scoped filtering.
- Reworked dashboard top content to render a compact daily workout card first, with fallback to next session and detail expansion.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement today/next selection API and session-detail API** - `3cf88c2` (test), `41c8246` (feat)
2. **Task 2: Integrate compact daily workout block into dashboard with expandable details** - `9d43bac` (feat)

## Files Created/Modified
- `src/lib/program/select-today-session.ts` - Shared mapping + projection helpers for today and session detail payloads.
- `src/app/api/program/today/route.ts` - Authenticated today-or-next dashboard projection endpoint.
- `src/app/api/program/sessions/[sessionId]/route.ts` - Authenticated session detail endpoint for exercise prescriptions.
- `src/server/dal/program.ts` - Added account-scoped `getSessionById` lookup.
- `src/app/(private)/dashboard/page.tsx` - Dashboard now fetches today surface and renders workout card as top block.
- `src/app/(private)/dashboard/_components/today-workout-card.tsx` - Compact UI card with `Commencer seance` CTA and on-demand detail expansion.
- `tests/program/dashboard-today-surface.test.ts` - Route + surface behavior tests for today-first/fallback logic and detail data shape.

## Decisions Made
- Kept contracts authoritative by parsing both today and detail payloads through program contract helpers before response/use.
- Preserved one-page UX by keeping details lazy-loaded in the card instead of expanding dashboard-level data fetching.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Phase 03 now has all four plan summaries and is ready for phase-level verification.

---
*Phase: 03-program-planning-and-daily-workout-surface*
*Completed: 2026-03-04*

## Self-Check: PASSED
