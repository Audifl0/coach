# 15-02 Summary

## Delivered

- Ajout d'un ranking scientifique explicable par record avant synthese distante.
- Les records portes par le pipeline incluent maintenant un score compose, des raisons de boost/penalite/rejet et un flag `selected`.
- Les run reports et `sources.json` exposent la telemetry de ranking: evalues, retenus, rejetes, top IDs et codes de rejet.

## Key Files

- `scripts/adaptive-knowledge/contracts.ts`
- `scripts/adaptive-knowledge/synthesis.ts`
- `scripts/adaptive-knowledge/pipeline-run.ts`
- `tests/program/adaptive-knowledge-pipeline-run.test.ts`

## Verification

- `corepack pnpm test tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand`

## Notes

- Le runtime de `knowledge-bible.json` reste compatible.
- Le pipeline transmet des records priorises a la synthese, sans perdre les records rejetes pour audit.
