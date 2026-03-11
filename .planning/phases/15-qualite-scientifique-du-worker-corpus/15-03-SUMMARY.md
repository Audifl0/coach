# 15-03 Summary

## Delivered

- La synthese distante produit maintenant une extraction structuree par etude avant consolidation.
- `validated-synthesis.json` et les batches de synthese transportent `studyExtractions`.
- Le snapshot publie persiste un artefact intermediaire `study-extractions.json`.

## Key Files

- `scripts/adaptive-knowledge/contracts.ts`
- `scripts/adaptive-knowledge/remote-synthesis.ts`
- `scripts/adaptive-knowledge/synthesis.ts`
- `scripts/adaptive-knowledge/pipeline-run.ts`
- `tests/program/adaptive-knowledge-remote-synthesis.test.ts`

## Verification

- `corepack pnpm test tests/program/adaptive-knowledge-remote-synthesis.test.ts tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand`

## Notes

- Les extractions capturent population, intervention, contexte, outcomes, signaux de preuve, limites et signaux de securite.
- Les motifs d'exclusion restent auditables via les claims rejetes et `rejectionReason`.
