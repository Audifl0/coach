---
phase: 12-worker-corpus-continu
plan: 12-02
tags: [discovery, ingestion, dedup, incremental-state]
requirements-completed: [PROG-01, PROG-02]
completed: 2026-03-11
---

# Phase 12 Plan 02: Discovery and Ingestion Summary

La collecte du corpus est devenue plus riche et moins statique, avec un plan de discovery borne, une dedup inter-topics et une telemetry incrementale minimale.

## Accomplishments
- Added `scripts/adaptive-knowledge/discovery.ts` with a bounded deterministic discovery plan.
- Extended `scripts/adaptive-knowledge/config.ts` with `maxQueriesPerRun`.
- Added cursor-state parsing and record dedup helpers in `scripts/adaptive-knowledge/connectors/shared.ts`.
- Hardened PubMed/Crossref/OpenAlex connectors to parse representative native payload shapes and emit cursors.
- Updated `scripts/adaptive-knowledge/pipeline-run.ts` to use the discovery plan, incremental cursor state, and richer ingest telemetry.
- Expanded connector and pipeline tests.

## Verification
- `corepack pnpm test tests/program/adaptive-knowledge-worker.test.ts --runInBand`
- `corepack pnpm test tests/program/adaptive-knowledge-connectors.test.ts --runInBand`
- `corepack pnpm test tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand`

## Notes
- Incremental state is persisted and surfaced in telemetry; connector-level and pipeline-level filters now both guard duplicate reuse.
- No git commit was created because the worktree was already dirty before execution.

## Self-Check: PASSED
