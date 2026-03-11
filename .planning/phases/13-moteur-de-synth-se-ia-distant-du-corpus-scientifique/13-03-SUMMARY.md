---
phase: 13-moteur-de-synth-se-ia-distant-du-corpus-scientifique
plan: 13-03
tags: [quality-gates, publish-blocking, provenance, observability]
requirements-completed: [SAFE-03, PROG-01, PROG-02]
completed: 2026-03-11
---

# Phase 13 Plan 03: Quality Gates and Blocking Summary

La publication du corpus est maintenant conditionnee par des quality gates post-synthese plus stricts, axes sur provenance, couverture, contradictions et lisibilite operateur.

## Accomplishments
- Extended `scripts/adaptive-knowledge/quality-gates.ts` beyond simple score/critical-contradiction checks to account for insufficient provenance, insufficient coverage, and unresolved contradictions.
- Updated `scripts/adaptive-knowledge/publish.ts` to require `validated-synthesis.json` before any promotion.
- Updated `scripts/adaptive-knowledge/pipeline-run.ts` to surface richer synthesize-stage telemetry and preserve strict blocking semantics when the remote path degrades.
- Preserved the invariant that blocked runs keep the active snapshot unchanged and never publish partial artifacts.
- Reworked worker/publish tests so reruns remain deterministic while still exercising the incremental cursor behavior correctly.

## Verification
- `corepack pnpm test tests/program/adaptive-knowledge-worker.test.ts tests/program/adaptive-knowledge-pipeline-run.test.ts tests/program/adaptive-knowledge-publish.test.ts --runInBand`

## Notes
- The run-report now carries enough structured signal to support the future operator dashboard phase.
- No git commit was created because the worktree already contained unrelated local changes.

## Self-Check: PASSED
