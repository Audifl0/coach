---
phase: 12-worker-corpus-continu
plan: 12-03
tags: [curation, knowledge-bible, manifest, diff, publish]
requirements-completed: [PROG-01, PROG-02, SAFE-03]
completed: 2026-03-11
---

# Phase 12 Plan 03: Curation and Publish Summary

Les snapshots publies contiennent maintenant une knowledge bible compacte et directement consommable, plus un manifest et un diff de snapshot pour la gouvernance.

## Accomplishments
- Added `scripts/adaptive-knowledge/curation.ts` to derive a curated runtime bible from records plus principles.
- Updated `scripts/adaptive-knowledge/pipeline-run.ts` to write `knowledge-bible.json`, `manifest.json`, and `diff.json`.
- Tightened `scripts/adaptive-knowledge/publish.ts` to require those artifacts before promotion.
- Updated `src/lib/coach/knowledge-bible.ts` to prefer published `knowledge-bible.json` when available while preserving fallback behavior.
- Added test coverage for the published knowledge bible artifact and promoted manifest/diff files.

## Verification
- `corepack pnpm test tests/program/adaptive-knowledge-worker.test.ts --runInBand`
- `corepack pnpm test tests/program/coach-knowledge-bible.test.ts --runInBand`
- `corepack pnpm test tests/program/adaptive-knowledge-publish.test.ts --runInBand`

## Notes
- Published snapshots remain backward-compatible for downstream consumers because the loader still falls back to legacy principles/sources files.
- No git commit was created because the worktree was already dirty before execution.

## Self-Check: PASSED
