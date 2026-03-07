---
phase: 09-security-runtime-and-release-proof-stabilization
plan: 09-01
subsystem: ui
tags: [nextjs, dashboard, ssr, testing]
requires:
  - phase: 08-release-blockers-and-regression-restoration
    provides: Dashboard SSR already reads DAL-backed today/trends data directly after the phase 08 self-fetch removal groundwork.
provides:
  - Server-only dashboard loaders for today and trends with explicit ready, empty, and error section states
  - Dashboard today and trends surfaces that preserve business ordering while showing degraded runtime states explicitly
affects: [dashboard, DASH-01, DASH-02, release-proof]
tech-stack:
  added: []
  patterns:
    - Server-only dashboard section composition
    - Explicit ready-empty-error UI state wiring
key-files:
  created:
    - src/server/dashboard/program-dashboard.ts
    - tests/program/dashboard-page-data.test.ts
  modified:
    - src/app/(private)/dashboard/page.tsx
    - src/app/(private)/dashboard/_components/today-workout-card.tsx
    - src/app/(private)/dashboard/_components/trends-summary-card.tsx
    - src/lib/program/select-today-session.ts
    - tests/program/dashboard-today-surface.test.ts
    - tests/program/dashboard-trends-surface.test.ts
key-decisions:
  - Dashboard SSR now consumes explicit server-side today/trends section loaders instead of nullable page-local loader results.
  - Client dashboard cards receive lightweight load-state props so degraded runtime states are visible without importing server-only modules into client code.
patterns-established:
  - Dashboard section loaders should classify business-empty and runtime-error states separately before UI rendering.
  - Dashboard section ordering should treat degraded trends as visible content while keeping history last.
requirements-completed: [DASH-01, DASH-02]
duration: 6min
completed: 2026-03-07
---

# Phase 09 Plan 01: Dashboard trust stabilization summary

**Server-only dashboard today/trends loaders with explicit ready-empty-error states and preserved today-over-next rendering order**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-07T17:58:07Z
- **Completed:** 2026-03-07T18:03:42Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Replaced nullable dashboard today/trends composition with server-only section loaders that return explicit `ready`, `empty`, or `error`.
- Kept today-first then next-session fallback behavior intact while allowing the today card to distinguish true empty state from runtime failure.
- Kept trends in the same dashboard slot while rendering a degraded state instead of silently dropping the section.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add server-only dashboard loaders for today and trends section state** - `876f073` (`test`), `74daf32` (`feat`)
2. **Task 2: Rewire dashboard rendering to preserve business-empty behavior and expose real errors** - `39f0383` (`feat`)

## Files Created/Modified

- `src/server/dashboard/program-dashboard.ts` - direct today/trends section loaders with explicit state unions
- `src/lib/program/select-today-session.ts` - shared helper for distinguishing true empty today payloads
- `src/app/(private)/dashboard/page.tsx` - server-side dashboard wiring that consumes explicit section states
- `src/app/(private)/dashboard/_components/today-workout-card.tsx` - distinct degraded surface for failed today loading
- `src/app/(private)/dashboard/_components/trends-summary-card.tsx` - explicit degraded trends surface while preserving ready-state behavior
- `tests/program/dashboard-page-data.test.ts` - focused loader-state regression coverage
- `tests/program/dashboard-today-surface.test.ts` - empty-vs-error dashboard today surface assertions
- `tests/program/dashboard-trends-surface.test.ts` - degraded trends surface assertions

## Decisions Made

- Moved dashboard SSR composition to `src/server/dashboard/program-dashboard.ts` so the page consumes one server-only today/trends boundary instead of nullable helper outputs.
- Preserved existing business selection rules by leaving `pickDashboardSession(...)` responsible only for today-vs-next selection, while the page passes load-state separately to the cards.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The local GSD helper binary is installed under `/home/flo/.codex/get-shit-done/bin/gsd-tools.cjs`, while the executor template referenced `/home/flo/.claude/...`; execution used the installed `.codex` path and proceeded normally.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Dashboard SSR no longer depends on same-service request-derived origin trust for today/trends rendering.
- Focused regression tests prove explicit degraded states for today and trends without changing dashboard order or today-vs-next selection behavior.

## Self-Check: PASSED

- Verified summary file exists on disk.
- Verified task commits `876f073`, `74daf32`, and `39f0383` exist in git history.

---
*Phase: 09-security-runtime-and-release-proof-stabilization*
*Completed: 2026-03-07*
