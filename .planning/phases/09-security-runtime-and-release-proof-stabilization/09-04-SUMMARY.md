---
phase: 09-security-runtime-and-release-proof-stabilization
plan: 09-04
subsystem: ui
tags: [react, nextjs, prisma, postgres, dashboard, history, session-logging]
requires:
  - phase: 09-01
    provides: explicit dashboard today/trends loading without self-fetch trust
  - phase: 09-02
    provides: deterministic session logging writes and active-plan consistency guards
provides:
  - UTC-safe today and next-session selection at midnight boundaries
  - Archived completed session detail parity with history rows
  - Deterministic workout logger hydration from existing session detail payloads
affects: [dashboard, history, session-logging, program-dal]
tech-stack:
  added: []
  patterns:
    - reuse DAL UTC helpers for day-boundary lookups
    - hydrate client workout state from server detail payloads instead of client-only state
key-files:
  created: []
  modified:
    - src/server/dal/program.ts
    - src/app/(private)/dashboard/_components/session-logger.tsx
    - src/app/(private)/dashboard/_components/today-workout-card.tsx
    - tests/program/program-dal.test.ts
    - tests/program/dashboard-today-surface.test.ts
    - tests/program/session-history-surface.test.ts
    - tests/program/program-session-logging-route.test.ts
key-decisions:
  - "Reused startOfUtcDay-based DAL boundaries and an inclusive next-day fallback instead of changing today-route projection contracts."
  - "Extended getSessionById to admit archived completed sessions rather than adding a separate history-detail endpoint."
  - "Hydrated SessionLogger from existing session detail responses and shared the today-card detail fetch for workout resume."
patterns-established:
  - "Session detail is the single source of truth for workout resume state across refresh and reopen."
  - "History list/detail parity is maintained by broadening the scoped DAL read, not by duplicating route surfaces."
requirements-completed: [PROG-02, LOG-01, LOG-04, DASH-01]
duration: 8 min
completed: 2026-03-07
---

# Phase 09 Plan 04: UTC session selection, archived history drilldown, and workout-resume parity Summary

**UTC-safe today selection, archived completed session drilldown parity, and server-hydrated workout resume state across refresh or reopen**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-07T18:26:05Z
- **Completed:** 2026-03-07T18:33:58Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Corrected today and next-session selection to use UTC day boundaries and include the first instant of the next UTC day.
- Aligned history drilldown detail with archived completed sessions already present in history rows while preserving ownership masking.
- Restored deterministic workout resume hydration by reusing session-detail data for timer, logged sets, note, skip, and completion state.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix UTC-boundary today and next-session selection**: `e436161` (test), `b0077f9` (feat)
2. **Task 2: Align history drilldown detail with archived completed sessions**: `5c07525` (test), `a65593e` (feat)
3. **Task 3: Restore deterministic workout-resume hydration after refresh or reopen**: `9a8814e` (test), `a6987fb` (feat)

**Metadata sync:** `f2a0f82` (tooling-generated docs commit for summary/state/roadmap sync)

## Files Created/Modified
- `src/server/dal/program.ts` - UTC-safe today lookup plus archived-completed fallback for session detail reads.
- `src/app/(private)/dashboard/_components/session-logger.tsx` - Logger hydration helper and session-state rehydration from detail payloads.
- `src/app/(private)/dashboard/_components/today-workout-card.tsx` - Shared detail fetch for exercise drilldown and in-progress workout resume.
- `tests/program/program-dal.test.ts` - UTC-boundary regressions for today and next-session lookup semantics.
- `tests/program/dashboard-today-surface.test.ts` - Resume hydration regressions for started and completed session detail payloads.
- `tests/program/session-history-surface.test.ts` - Archived history drilldown parity regression against DAL session lookup.
- `tests/program/program-session-logging-route.test.ts` - Session detail route regressions for archived and in-progress workout payloads.

## Decisions Made
- Reused existing UTC helper semantics in the DAL to keep caller contracts unchanged while fixing midnight drift.
- Kept the existing session detail endpoint and widened the DAL read only enough to serve archived completed sessions.
- Used the existing session detail response as the hydration source so refresh/reopen behavior stays server-driven and deterministic.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The workflow instructions referenced `~/.claude/get-shit-done/bin/gsd-tools.cjs`, but this workspace exposes the tooling under `~/.codex/get-shit-done/bin/gsd-tools.cjs`. Execution continued with the equivalent `.codex` path.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Dashboard today/history/session-detail flows now share the corrected UTC and session-detail invariants expected by later release-proof validation.
- No blockers identified for the remaining phase-09 plans.

## Self-Check: PASSED

- Found `.planning/phases/09-security-runtime-and-release-proof-stabilization/09-04-SUMMARY.md`
- Found commits `e436161`, `b0077f9`, `5c07525`, `a65593e`, `9a8814e`, and `a6987fb`
