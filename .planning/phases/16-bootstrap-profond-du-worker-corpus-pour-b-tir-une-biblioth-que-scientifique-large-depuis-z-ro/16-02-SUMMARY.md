---
phase: 16-bootstrap-profond-du-worker-corpus-pour-b-tir-une-biblioth-que-scientifique-large-depuis-z-ro
plan: 16-02
subsystem: ingestion
tags: [worker, bootstrap, collection, connectors, canonical-id, dedup]
requires:
  - phase: 16-01
    provides: bootstrap mode, campaign state, shared worker contracts
provides:
  - persistent bootstrap collection jobs
  - connector cursor replay and job-scoped collection
  - canonical identity and cross-source dedup support
  - bootstrap progress telemetry for queue depth and exhaustion
affects: [worker-corpus, connectors, pipeline, ops]
tech-stack:
  added: []
  patterns: [persistent collection queue, cursor replay, canonical identity, bootstrap telemetry]
key-files:
  created:
    - .planning/phases/16-bootstrap-profond-du-worker-corpus-pour-b-tir-une-biblioth-que-scientifique-large-depuis-z-ro/16-02-SUMMARY.md
  modified:
    - scripts/adaptive-knowledge/discovery.ts
    - scripts/adaptive-knowledge/contracts.ts
    - scripts/adaptive-knowledge/connectors/shared.ts
    - scripts/adaptive-knowledge/pipeline-run.ts
    - tests/program/adaptive-knowledge-pipeline-run.test.ts
key-decisions:
  - "Bootstrap collection work is persisted as explicit jobs in `bootstrap-jobs.json`, not recomputed from scratch on each run."
  - "Canonical record identity is derived before downstream ranking/extraction so the same paper is not processed as multiple evidences across sources."
  - "Bootstrap telemetry must expose queue depth, exhaustion, dedup and progress so long-running backfills remain operable."
patterns-established:
  - "Collection queue state is durable and replayable across reruns."
  - "Cross-source dedup happens around canonical identity before later scientific staging."
requirements-completed: [PROG-01, PROG-02, SAFE-02, PLAT-02]
duration: 7m
completed: 2026-03-13
---

# Phase 16 Plan 02: Deep Collection Summary

**Bootstrap collection now runs through persistent jobs, cursor-aware connector replay, and canonical record identity instead of ephemeral per-run query batches**

## Performance

- **Duration:** 7 min
- **Completed:** 2026-03-13
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Reworked discovery/pipeline orchestration to persist bootstrap collection jobs and resume pending work instead of rebuilding a tiny fixed plan each run.
- Added connector-level canonical identity support so PubMed/Crossref/OpenAlex records that refer to the same paper collapse before later stages.
- Surfaced bootstrap queue telemetry in run reports, including queue depth, pages consumed, exhaustion state and canonical dedup progress.

## Task Commits

Each task was committed atomically:

1. **Task 1: Convertir la discovery en generatrice de jobs de collecte bootstrap**
   - `7d0fb2a` test(16-02): add failing bootstrap collection job coverage
   - `0d08bc4` feat(16-02): persist bootstrap collection jobs
2. **Task 2: Generaliser pagination, curseurs, budgets et identite canonique par source**
   - `43280e5` test(16-02): add failing cursor and canonical dedup coverage
   - `2e4cd55` feat(16-02): add connector cursor and canonical dedup support
3. **Task 3: Rendre la collecte incrementalement productive, explicable et persistante**
   - `c4f8ea4` test(16-02): add failing bootstrap progress telemetry coverage

## Files Created/Modified

- [discovery.ts](/home/flo/projects/coach/scripts/adaptive-knowledge/discovery.ts) - persistent bootstrap job generation and completed-job reuse.
- [contracts.ts](/home/flo/projects/coach/scripts/adaptive-knowledge/contracts.ts) - collection job schemas, canonical identity metadata, queue telemetry.
- [shared.ts](/home/flo/projects/coach/scripts/adaptive-knowledge/connectors/shared.ts) - canonical record ID derivation and cross-source dedup behavior.
- [pipeline-run.ts](/home/flo/projects/coach/scripts/adaptive-knowledge/pipeline-run.ts) - bootstrap job persistence, cursor replay, queue summaries and canonical progress reporting.
- [adaptive-knowledge-pipeline-run.test.ts](/home/flo/projects/coach/tests/program/adaptive-knowledge-pipeline-run.test.ts) - coverage for persistent jobs, cursor replay, canonical dedup and queue telemetry.

## Decisions Made

- Bootstrap collection state belongs in dedicated job persistence rather than being inferred from `seenRecordIds` alone.
- Canonical identity is introduced now, before staging/extraction, to prevent later waves from paying LLM cost multiple times for the same paper.
- Queue telemetry is part of the contract, not a debug-only detail, because long-running bootstrap needs operable progress signals.

## Deviations from Plan

None beyond normal TDD progression. The plan stayed inside its intended scope.

## Issues Encountered

- No blocking issue remained after the final telemetry coverage pass; targeted tests are green.

## User Setup Required

None.

## Next Phase Readiness

- Phase 16-03 can now build documentary staging on top of durable collection jobs and canonicalized records.
- The pipeline already knows which work remains pending versus exhausted, which reduces ambiguity for later extraction scheduling.
- Remaining gap intentionally deferred to 16-03: documents/abstract/full-text staging still does not exist.

## Self-Check: PASSED

- Verified task commits exist: `7d0fb2a`, `0d08bc4`, `43280e5`, `2e4cd55`, `c4f8ea4`.
- Re-ran verification successfully:
  - `corepack pnpm test tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand`
  - `rg -n "cursor|page|budget|queue|job|exhausted|canonical|doi|pmid|dedup" scripts/adaptive-knowledge/discovery.ts scripts/adaptive-knowledge/contracts.ts scripts/adaptive-knowledge/connectors/shared.ts scripts/adaptive-knowledge/connectors/pubmed.ts scripts/adaptive-knowledge/connectors/crossref.ts scripts/adaptive-knowledge/connectors/openalex.ts scripts/adaptive-knowledge/pipeline-run.ts`
