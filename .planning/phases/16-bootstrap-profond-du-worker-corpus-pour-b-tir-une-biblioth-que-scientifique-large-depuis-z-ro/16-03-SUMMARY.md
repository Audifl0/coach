---
phase: 16-bootstrap-profond-du-worker-corpus-pour-b-tir-une-biblioth-que-scientifique-large-depuis-z-ro
plan: 16-03
subsystem: api
tags: [bootstrap, corpus, openai, zod, staging, extraction]
requires:
  - phase: 16-01
    provides: contrats bootstrap, etat persistant, surfaces de reprise
  - phase: 16-02
    provides: backfill profond, dedup canonique, file de collecte
provides:
  - staging documentaire explicite hors projection runtime publiee
  - triage budgete avant extraction distante
  - schemas OpenAI stricts avec diagnostics de lot et deferral des lots invalides
affects: [worker-corpus, bootstrap, dashboard, publication]
tech-stack:
  added: []
  patterns: [document-staging artifact, documentary triage, deferrable remote batches]
key-files:
  created: [.planning/phases/16-bootstrap-profond-du-worker-corpus-pour-b-tir-une-biblioth-que-scientifique-large-depuis-z-ro/16-03-SUMMARY.md]
  modified:
    - scripts/adaptive-knowledge/contracts.ts
    - scripts/adaptive-knowledge/connectors/shared.ts
    - scripts/adaptive-knowledge/remote-synthesis.ts
    - scripts/adaptive-knowledge/synthesis.ts
    - scripts/adaptive-knowledge/pipeline-run.ts
    - tests/program/adaptive-knowledge-pipeline-run.test.ts
    - tests/program/adaptive-knowledge-remote-synthesis.test.ts
key-decisions:
  - "Le staging documentaire vit dans un artefact `document-staging.json` separe du snapshot runtime publie."
  - "Le worker inferre `abstract-ready` quand un resume exploitable existe deja, sinon `metadata-only`."
  - "Les lots invalides OpenAI sont differes en `rejectedClaims` au lieu de faire tomber tout le bootstrap."
patterns-established:
  - "Documentary-first pipeline: collecte -> staging documentaire -> triage -> extraction distante -> consolidation."
  - "Provider-safe schemas: les champs optionnels OpenAI sont representes en nullable strict puis sanitizes avant parse runtime."
requirements-completed: [PROG-01, PROG-02, SAFE-02, SAFE-03]
duration: 22 min
completed: 2026-03-13
---

# Phase 16 Plan 03: Documentary Staging and Remote Extraction Summary

**Bootstrap documentaire auditable avec triage budgete, artefact de staging separe et extraction OpenAI stricte differrable par lot**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-13T07:48:50Z
- **Completed:** 2026-03-13T08:10:16Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Le bootstrap persiste maintenant un `document-staging.json` qui suit chaque record du statut `metadata-only` jusqu'a `full-text-ready` ou `blocked`, avec motifs de rejet lisibles.
- Le pipeline n'envoie plus aveuglement le backlog brut au LLM: il trie les documents extractibles, borne les lots et garde les documents differes dans les artefacts.
- La couche OpenAI utilise des schemas stricts compatibles `json_schema`, ajoute un diagnostic de contexte par lot/run, et differe les lots invalides au lieu de casser tout le run.

## Task Commits

Each task was committed atomically:

1. **Task 1: Modeliser le staging documentaire et les etats d'acquisition** - `9eadd1f`, `3a04ff2`
2. **Task 2: Ajouter un triage structurel avant extraction distante** - `dd0835b`, `a3fd38a`
3. **Task 3: Durcir les schemas OpenAI pour l'extraction structuree a grande echelle** - `ae31f95`, `526433c`

## Files Created/Modified

- `scripts/adaptive-knowledge/contracts.ts` - schemas de statut documentaire, artefact de staging, pointeur de manifeste et parseurs associes
- `scripts/adaptive-knowledge/connectors/shared.ts` - inference d'etat documentaire, artefact de staging et propagation dedupe-safe
- `scripts/adaptive-knowledge/synthesis.ts` - planification des lots d'extraction, triage documentaire et deferral des lots invalides
- `scripts/adaptive-knowledge/pipeline-run.ts` - integration du triage avant synthese et persistance `document-staging.json`
- `scripts/adaptive-knowledge/remote-synthesis.ts` - schemas OpenAI stricts, sanitation nullable->runtime et diagnostics enrichis
- `tests/program/adaptive-knowledge-pipeline-run.test.ts` - couverture TDD staging documentaire et triage
- `tests/program/adaptive-knowledge-remote-synthesis.test.ts` - couverture TDD schema strict/provider diagnostics/lot deferral

## Decisions Made

- Le staging documentaire reste hors du chemin de publication runtime: `sources.json` continue de servir la projection runtime, tandis que `document-staging.json` garde la verite operateur/documentaire.
- Le triage privilegie `full-text-ready` puis `abstract-ready`, differe `metadata-only`/`blocked`, et applique un budget de lots avant tout appel distant.
- Les erreurs OpenAI portent le contexte d'operation (`synthesizeLot` ou `consolidate`) et l'identite du lot pour diagnostiquer les echecs batch par batch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Le triage documentaire cassait le chemin nominal existant**
- **Found during:** Task 2
- **Issue:** En marquant tous les records par defaut `metadata-only`, le pipeline sautait la synthese et ne publiait plus de snapshot utile.
- **Fix:** Inference `abstract-ready` des qu'un resume exploitable est deja present, tout en gardant `metadata-only` pour les cas reellement incomplets.
- **Files modified:** `scripts/adaptive-knowledge/connectors/shared.ts`
- **Verification:** `corepack pnpm test tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand`, `corepack pnpm build`
- **Committed in:** `a3fd38a`

### Auto-fixed Issues

**2. [Rule 3 - Blocking] L'orchestration GSD referencee pointait vers `~/.claude` au lieu de `~/.codex`**
- **Found during:** Plan execution bootstrap
- **Issue:** Le chemin CLI fourni par l'orchestrateur n'existait pas dans cet environnement.
- **Fix:** Execution poursuivie sur les artefacts `.planning` existants puis mise a jour via l'installation GSD reelle sous `~/.codex/get-shit-done`.
- **Files modified:** aucun fichier source
- **Verification:** lecture de `.planning/STATE.md`, verification finale des mises a jour `STATE.md`/`ROADMAP.md`
- **Committed in:** metadata close-out commit

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Les auto-fixes etaient necessaires pour conserver le chemin nominal du worker et terminer la cloture GSD proprement. Aucun scope creep produit.

## Issues Encountered

- Le dedup canonique fusionnait involontairement deux records de test documentaires; les fixtures ont ete rendues distinctes pour valider le vrai cas de deferal documentaire.
- Les scenarios de staging documentaire n'etaient pas toujours promus en `validated/`; les tests ont ete alignes sur l'artefact `candidate` qui constitue la verite du staging avant publication.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `16-04` peut maintenant s'appuyer sur un warehouse documentaire explicite, un triage budgete et des lots distants differrables.
- Le dashboard pourra exposer les differes/extractibles sans parser des messages libres, les IDs et lots etant deja persistants dans `document-staging.json`.

## Self-Check: PASSED

- Summary file exists.
- Task commits `9eadd1f`, `3a04ff2`, `dd0835b`, `a3fd38a`, `ae31f95`, `526433c` exist.
- Verification commands passed: focused tests, keyword scan, and `corepack pnpm build`.
