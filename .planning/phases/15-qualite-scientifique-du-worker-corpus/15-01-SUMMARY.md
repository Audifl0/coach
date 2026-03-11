# 15-01 Summary

## Delivered

- Discovery taxonomique remplace les quelques seeds fixes du worker.
- Chaque query de discovery porte maintenant `topicKey`, `subtopicKey`, `queryFamily`, `priority` et population cible eventuelle.
- Les artefacts de run exposent les topics cibles et leurs coverage gaps.

## Key Files

- `scripts/adaptive-knowledge/discovery.ts`
- `scripts/adaptive-knowledge/contracts.ts`
- `scripts/adaptive-knowledge/pipeline-run.ts`
- `tests/program/adaptive-knowledge-pipeline-run.test.ts`

## Verification

- `corepack pnpm test tests/program/adaptive-knowledge-pipeline-run.test.ts --runInBand`

## Notes

- La discovery reste deterministic-friendly et bornee par `maxQueries`.
- Les gaps de couverture sont maintenant visibles dans `sources.json` et `run-report.json`.
