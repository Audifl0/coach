---
phase: 14-dashboard-web-de-suivi-temps-r-el-du-worker-corpus
plan: 14-04
tags: [dashboard, worker-corpus, polling, docs]
requirements-completed: [DASH-02, PLAT-02, SAFE-03]
completed: 2026-03-11
---

# Phase 14 Plan 04: Live Refresh and Ops Summary

Le dashboard worker a maintenant un refresh borne sur les zones live et une documentation operateur reliee a la surface web.

## Accomplishments
- Added `WorkerCorpusLiveClient` to poll `status` and `runs` with `cache: 'no-store'`.
- Added a tested refresh cadence helper for active vs stable worker states.
- Updated `GUIDE_WORKER_CORPUS_CONTINU_FR.md` with dashboard access, state interpretation, and polling limits.
- Folded the live client into the worker-corpus page while preserving SSR fallback behavior.

## Verification
- `corepack pnpm test tests/program/worker-corpus-dashboard-page.test.tsx tests/program/worker-corpus-dashboard-routes.test.ts --runInBand`

## Notes
- Real-time behavior is intentionally pragmatic polling, not websocket or SSE.

## Self-Check: PASSED
