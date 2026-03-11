---
phase: 14-dashboard-web-de-suivi-temps-r-el-du-worker-corpus
plan: 14-03
tags: [dashboard, worker-corpus, api, drilldown]
requirements-completed: [DASH-02, PLAT-02, SAFE-03]
completed: 2026-03-11
---

# Phase 14 Plan 03: Drilldown API Summary

Les drilldowns run et snapshot sont exposes via routes authifiees et rendus en panneaux de detail depuis la page worker-corpus.

## Accomplishments
- Added authenticated routes for `/api/worker-corpus/status`, `/api/worker-corpus/runs`, `/api/worker-corpus/runs/[runId]`, and `/api/worker-corpus/snapshots/[snapshotId]`.
- Added route handlers to keep auth and payload parsing testable.
- Added `RunDetailPanel` and `SnapshotDetailPanel` to surface stages, quality-gate reasons, diff, publication, and synthesis metadata.
- Added `tests/program/worker-corpus-dashboard-routes.test.ts`.

## Verification
- `corepack pnpm test tests/program/worker-corpus-dashboard-routes.test.ts --runInBand`

## Notes
- Missing run or snapshot artifacts return deterministic `404` responses.

## Self-Check: PASSED
