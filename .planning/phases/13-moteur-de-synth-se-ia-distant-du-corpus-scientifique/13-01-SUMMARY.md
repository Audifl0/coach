---
phase: 13-moteur-de-synth-se-ia-distant-du-corpus-scientifique
plan: 13-01
tags: [openai, remote-synthesis, contracts, pipeline]
requirements-completed: [PROG-01, PROG-02, SAFE-03]
completed: 2026-03-11
---

# Phase 13 Plan 01: Remote Synthesis Foundation Summary

Le worker corpus dispose maintenant d'un socle de synthese distante OpenAI-only avec contrats stricts, erreurs deterministes et branchement initial dans `pipeline-run`.

## Accomplishments
- Added `scripts/adaptive-knowledge/remote-synthesis.ts` with a dedicated OpenAI corpus client, strict JSON-schema requests, deterministic error normalization, and configurable env-based runtime wiring.
- Extended `scripts/adaptive-knowledge/contracts.ts` with source-synthesis, validated-synthesis, contradiction, rejected-claim, and model-run schemas.
- Updated `scripts/adaptive-knowledge/pipeline-run.ts` so the default synthesis path uses the remote-model orchestration instead of the old in-file blueprint flow.
- Kept deterministic testability through injected synthesis implementations; nominal verification still runs without live network calls or API keys.
- Added `tests/program/adaptive-knowledge-remote-synthesis.test.ts`.

## Verification
- `corepack pnpm test tests/program/adaptive-knowledge-remote-synthesis.test.ts --runInBand`
- `corepack pnpm test tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand`

## Notes
- No secondary-provider fallback was introduced for corpus synthesis; remote failures remain explicit and blocking.
- No git commit was created because the worktree already contained unrelated local changes.

## Self-Check: PASSED
