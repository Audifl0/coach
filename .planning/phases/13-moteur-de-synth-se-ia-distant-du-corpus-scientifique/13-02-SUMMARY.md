---
phase: 13-moteur-de-synth-se-ia-distant-du-corpus-scientifique
plan: 13-02
tags: [two-step-synthesis, validated-synthesis, provenance, consolidation]
requirements-completed: [PROG-01, PROG-02]
completed: 2026-03-11
---

# Phase 13 Plan 02: Two-Step Synthesis Summary

La synthese du corpus passe maintenant par deux etages explicites: extraction par lot puis consolidation dans un artefact intermediaire valide avant la bible runtime.

## Accomplishments
- Extended `scripts/adaptive-knowledge/synthesis.ts` with lot creation, remote-model orchestration, and `buildValidatedSynthesisFromPrinciples(...)`.
- Updated `scripts/adaptive-knowledge/pipeline-run.ts` to persist `validated-synthesis.json` in each candidate snapshot.
- Preserved a compact runtime-oriented principle set while making provenance, contradictions, rejected claims, and coverage observable in the intermediate artifact.
- Kept the legacy blueprint synthesis available only as deterministic injected test scaffolding, not as the default production path.
- Expanded pipeline and publish tests to assert the presence and shape of `validated-synthesis.json`.

## Verification
- `corepack pnpm test tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand`
- `corepack pnpm test tests/program/adaptive-knowledge-publish.test.ts --runInBand`

## Notes
- The new intermediate artifact is written only in candidate/validated snapshots; it never bypasses the existing promotion boundary.
- No git commit was created because the worktree already contained unrelated local changes.

## Self-Check: PASSED
