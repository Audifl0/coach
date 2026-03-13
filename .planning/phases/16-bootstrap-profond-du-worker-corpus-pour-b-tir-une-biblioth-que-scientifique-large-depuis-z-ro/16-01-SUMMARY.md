---
phase: 16-bootstrap-profond-du-worker-corpus-pour-b-tir-une-biblioth-que-scientifique-large-depuis-z-ro
plan: 16-01
subsystem: infra
tags: [worker, bootstrap, contracts, zod, dashboard, pipeline]
requires:
  - phase: 15-qualite-scientifique-du-worker-corpus
    provides: worker corpus pipeline, dashboard ops surface, scientific telemetry
provides:
  - bootstrap campaign contracts and config budgets
  - durable bootstrap campaign state persisted across reruns
  - shared dashboard/runtime contract support for bootstrap mode
affects: [worker-corpus, dashboard, pipeline, ops]
tech-stack:
  added: []
  patterns: [durable bootstrap campaign state, nested bootstrap config budgets, shared contract-first worker mode expansion]
key-files:
  created:
    - .planning/phases/16-bootstrap-profond-du-worker-corpus-pour-b-tir-une-biblioth-que-scientifique-large-depuis-z-ro/16-01-SUMMARY.md
  modified:
    - scripts/adaptive-knowledge/contracts.ts
    - scripts/adaptive-knowledge/config.ts
    - scripts/adaptive-knowledge/worker-state.ts
    - scripts/adaptive-knowledge/pipeline-run.ts
    - scripts/adaptive-knowledge/refresh-corpus.ts
    - src/lib/program/contracts.ts
    - src/server/dashboard/worker-control.ts
    - src/app/api/worker-corpus/control/route.ts
    - src/app/api/worker-corpus/control/route-handlers.ts
    - src/app/(private)/dashboard/worker-corpus/page.tsx
    - tests/program/adaptive-knowledge-pipeline-run.test.ts
key-decisions:
  - "Persist bootstrap campaign progress in a dedicated `bootstrap-state.json` file, separate from worker lease state and runtime snapshots."
  - "Expose bootstrap collection budgets as a nested `bootstrap` config object so refresh/check defaults remain stable."
  - "Widen shared worker control/dashboard contracts to carry bootstrap mode and campaign telemetry before the dedicated dashboard wave."
patterns-established:
  - "Bootstrap state is cumulative and resumable, while snapshots remain runtime-facing projections."
  - "Worker mode expansion starts at contracts/config first, then propagates through pipeline and control surfaces."
requirements-completed: [PROG-01, PROG-02, SAFE-03, PLAT-02]
duration: 6m
completed: 2026-03-13
---

# Phase 16 Plan 01: Bootstrap Foundations Summary

**Bootstrap campaign contracts, dedicated budgets, and resumable worker state propagated from pipeline internals to shared dashboard/control surfaces**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-13T08:21:51+01:00
- **Completed:** 2026-03-13T08:27:59+01:00
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Added durable bootstrap campaign contracts and a `bootstrap` pipeline mode alongside dedicated config budgets.
- Persisted bootstrap campaign progress across reruns via `bootstrap-state.json`, including cumulative canonical counts and campaign metadata.
- Extended shared worker/dashboard contracts and control routes so bootstrap mode can flow cleanly through API and UI boundaries.

## Task Commits

Each task was committed atomically:

1. **Task 1: Definir les contrats persistants du bootstrap et du refresh**
   - `187d739` test(16-01): add failing bootstrap contract coverage
   - `948a98e` feat(16-01): add bootstrap campaign contracts and budgets
2. **Task 2: Rendre l'orchestrateur mode-aware et reprisable**
   - `e0bf432` test(16-01): add failing bootstrap persistence coverage
   - `cb21979` feat(16-01): persist bootstrap campaign progress
3. **Task 3: Stabiliser les contrats dashboard/runtime autour des nouveaux etats**
   - `eef586d` test(16-01): add failing bootstrap dashboard contract coverage
   - `fc95b4a` feat(16-01): expose bootstrap mode in shared worker contracts
   - `5ce8ece` fix(16-01): align bootstrap contracts with worker control surfaces
   - `b2d3adf` fix(16-01): widen worker control route handler mode typing

## Files Created/Modified

- [scripts/adaptive-knowledge/contracts.ts](/home/flo/projects/coach/scripts/adaptive-knowledge/contracts.ts) - new bootstrap campaign schema and bootstrap-capable run report mode.
- [scripts/adaptive-knowledge/config.ts](/home/flo/projects/coach/scripts/adaptive-knowledge/config.ts) - nested bootstrap budget configuration with validated defaults and overrides.
- [scripts/adaptive-knowledge/worker-state.ts](/home/flo/projects/coach/scripts/adaptive-knowledge/worker-state.ts) - durable bootstrap campaign persistence separate from worker lease state.
- [scripts/adaptive-knowledge/pipeline-run.ts](/home/flo/projects/coach/scripts/adaptive-knowledge/pipeline-run.ts) - bootstrap mode persists cumulative campaign progress after each run.
- [scripts/adaptive-knowledge/refresh-corpus.ts](/home/flo/projects/coach/scripts/adaptive-knowledge/refresh-corpus.ts) - CLI mode resolution now accepts `--bootstrap`.
- [src/lib/program/contracts.ts](/home/flo/projects/coach/src/lib/program/contracts.ts) - shared worker overview contracts now transport bootstrap mode and campaign telemetry.
- [src/server/dashboard/worker-control.ts](/home/flo/projects/coach/src/server/dashboard/worker-control.ts) - dashboard launch path now supports bootstrap mode.
- [src/app/api/worker-corpus/control/route.ts](/home/flo/projects/coach/src/app/api/worker-corpus/control/route.ts) - typed route deps widened to bootstrap mode.
- [src/app/api/worker-corpus/control/route-handlers.ts](/home/flo/projects/coach/src/app/api/worker-corpus/control/route-handlers.ts) - route handler contract aligned with shared bootstrap mode support.
- [src/app/(private)/dashboard/worker-corpus/page.tsx](/home/flo/projects/coach/src/app/(private)/dashboard/worker-corpus/page.tsx) - fallback control payload now satisfies required campaign field.
- [tests/program/adaptive-knowledge-pipeline-run.test.ts](/home/flo/projects/coach/tests/program/adaptive-knowledge-pipeline-run.test.ts) - coverage for bootstrap budgets, campaign persistence, and shared dashboard contract parsing.

## Decisions Made

- Dedicated bootstrap campaign persistence belongs in `bootstrap-state.json`, not in `worker-state.json`, so lease health and campaign progress do not get conflated.
- Bootstrap budget knobs were added under `config.bootstrap` instead of flattening more top-level config keys into the refresh path.
- Shared dashboard contracts were widened now, ahead of the full dashboard implementation wave, to avoid reintroducing mode mismatches later.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bootstrap contract widening broke existing worker control surfaces**
- **Found during:** Task 3 (Stabiliser les contrats dashboard/runtime autour des nouveaux etats)
- **Issue:** `typecheck` failed because dashboard fallback payloads and worker control route types still assumed `refresh|check` only.
- **Fix:** Extended `refresh-corpus.ts`, `worker-control.ts`, API route types, route handler deps, and dashboard fallback status to propagate bootstrap mode end-to-end.
- **Files modified:** `scripts/adaptive-knowledge/refresh-corpus.ts`, `src/server/dashboard/worker-control.ts`, `src/app/api/worker-corpus/control/route.ts`, `src/app/api/worker-corpus/control/route-handlers.ts`, `src/app/(private)/dashboard/worker-corpus/page.tsx`
- **Verification:** `corepack pnpm typecheck` and `corepack pnpm test tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand`
- **Committed in:** `5ce8ece`, `b2d3adf`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary coherence work only. No scope creep beyond making the newly introduced bootstrap contracts actually type-safe and launchable.

## Issues Encountered

- The worker dashboard route stack had several implicit `refresh/check` assumptions that only surfaced once the shared schemas were widened. These were corrected immediately as blocking fallout from task 3.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 16-02 can now build on stable bootstrap mode/config/state primitives instead of inventing them ad hoc.
- Dashboard/API consumers can already transport bootstrap mode and campaign telemetry, which reduces integration risk for later waves.
- Remaining concern: queue/job depth, canonical identity, and raw warehouse persistence are intentionally deferred to 16-02 rather than partially invented here.

## Self-Check: PASSED

- Verified summary file exists at [.planning/phases/16-bootstrap-profond-du-worker-corpus-pour-b-tir-une-biblioth-que-scientifique-large-depuis-z-ro/16-01-SUMMARY.md](/home/flo/projects/coach/.planning/phases/16-bootstrap-profond-du-worker-corpus-pour-b-tir-une-biblioth-que-scientifique-large-depuis-z-ro/16-01-SUMMARY.md).
- Verified task commits exist: `187d739`, `948a98e`, `e0bf432`, `cb21979`, `eef586d`, `fc95b4a`, `5ce8ece`, `b2d3adf`.
- Re-ran verification successfully:
  - `corepack pnpm test tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand`
  - `corepack pnpm typecheck`
  - `rg -n "bootstrap|refresh|campaign|cursor|job|progress" scripts/adaptive-knowledge/contracts.ts scripts/adaptive-knowledge/config.ts scripts/adaptive-knowledge/worker-state.ts scripts/adaptive-knowledge/pipeline-run.ts src/lib/program/contracts.ts`
