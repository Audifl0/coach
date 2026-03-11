---
phase: 12-worker-corpus-continu
plan: 12-01
tags: [worker, lease, heartbeat, cron, check-mode]
requirements-completed: [PROG-01, SAFE-03]
completed: 2026-03-11
---

# Phase 12 Plan 01: Worker Runtime Summary

Le pipeline corpus est maintenant execute derriere un worker lease-safe avec heartbeat, blocage concurrent explicite et mode `--check` non publiant.

## Accomplishments
- Added `scripts/adaptive-knowledge/worker-state.ts` for lease, stale recovery, heartbeat, and release status persistence.
- Refactored `scripts/adaptive-knowledge/refresh-corpus.ts` into a worker-safe command path with explicit `completed`, `failed`, and `blocked-by-lease` outcomes.
- Updated `scripts/adaptive-knowledge/pipeline-run.ts` so `check` mode never promotes a new active snapshot.
- Updated `infra/scripts/install-adaptive-corpus-cron.sh` to point at the worker-safe entrypoint.
- Added `tests/program/adaptive-knowledge-worker.test.ts`.

## Verification
- `corepack pnpm test tests/program/adaptive-knowledge-worker.test.ts --runInBand`
- `corepack pnpm test tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand`
- `corepack pnpm test tests/program/adaptive-evidence-corpus-loader.test.ts --runInBand`

## Notes
- No git commit was created because the repository already had unrelated and user-owned uncommitted changes.
- The active snapshot remains untouched on blocked or failed worker runs.

## Self-Check: PASSED
